from __future__ import annotations

import io
import math
import tempfile
import time
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient

from backend.app import main as main_module
from backend.app.analysis import AudioAnalysisCache, AudioAnalysisService
from backend.app.arms import DEFAULT_EXPECTED_JOINT_COUNT, ArmRuntime
from backend.app.movement_library import sample_motion
from backend.app.music import JamendoTrackProvider, LocalTrackLibrary
from backend.app.models import ArmVerificationState, ArmVerificationStatus, MovementRunRequest, RobotConfig, ServoState
from backend.app.state import RobotStateStore


class FakeReadyVerifier:
    def verify(self, arm: ArmRuntime) -> ArmVerificationState:
        return ArmVerificationState(
            status=ArmVerificationStatus.READY,
            driver="test-double",
            dependency_available=True,
            port_present=True,
            calibration_found=True,
            calibration_path=f"/tmp/{arm.arm_id}.json",
            expected_joint_count=DEFAULT_EXPECTED_JOINT_COUNT,
            detected_joint_count=DEFAULT_EXPECTED_JOINT_COUNT,
            last_checked_at="2026-03-31T00:00:00+00:00",
            message=f"{arm.arm_id} verified for tests",
        )


DEFAULT_SERVO_LAYOUT = [
    (1, "shoulder_pan"),
    (2, "shoulder_lift"),
    (3, "elbow_flex"),
    (4, "wrist_flex"),
    (5, "wrist_roll"),
    (6, "gripper"),
]


class FakeTelemetryBridge:
    def __init__(self) -> None:
        self.connected: set[str] = set()
        self.torque_enabled: dict[str, bool] = {}
        self.angles: dict[str, dict[str, float]] = {}
        self.goals: dict[str, dict[str, float]] = {}

    def connect(self, arm: ArmRuntime) -> None:
        self.connected.add(arm.arm_id)
        self.torque_enabled.setdefault(arm.arm_id, True)
        base = 10.0 if arm.arm_type == "leader" else 20.0
        self.angles.setdefault(
            arm.arm_id,
            {name: base + servo_id for servo_id, name in DEFAULT_SERVO_LAYOUT},
        )
        self.goals.setdefault(
            arm.arm_id,
            {name: base + servo_id + 0.5 for servo_id, name in DEFAULT_SERVO_LAYOUT},
        )

    def disconnect(self, arm: ArmRuntime) -> None:
        self.connected.discard(arm.arm_id)

    def is_connected(self, arm: ArmRuntime) -> bool:
        return arm.arm_id in self.connected

    def read_telemetry(self, arm: ArmRuntime) -> list[ServoState]:
        torque_enabled = self.torque_enabled.get(arm.arm_id, arm.safety.torque_enabled and not arm.safety.emergency_stop)
        angles = self.angles.get(arm.arm_id, {})
        goals = self.goals.get(arm.arm_id, angles)
        return [
            ServoState(
                id=servo_id,
                name=name,
                angle=angles.get(name, 0.0),
                target_angle=goals.get(name, angles.get(name, 0.0)),
                torque_enabled=torque_enabled,
                temperature_c=32.0 + servo_id,
                load_pct=10.0 + servo_id,
                motion_phase="ramping" if servo_id % 2 else "steady",
            )
            for servo_id, name in DEFAULT_SERVO_LAYOUT
        ]

    def set_torque_enabled(self, arm: ArmRuntime, enabled: bool) -> None:
        self.torque_enabled[arm.arm_id] = enabled

    def write_joint_targets(self, arm: ArmRuntime, targets: dict[str, float]) -> None:
        self.goals.setdefault(arm.arm_id, {}).update(targets)
        angles = self.angles.setdefault(arm.arm_id, {})
        for joint_name, target in targets.items():
            current = angles.get(joint_name, target)
            angles[joint_name] = current + (target - current) * 0.8


class ApiSmokeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        temp_root = Path(self.tempdir.name)
        uploads_root = temp_root / "uploads" / "files"
        cache_root = temp_root / "analysis-cache"

        self.original_store = main_module.store
        self.original_local_library = main_module.local_library
        self.original_analysis_service = main_module.analysis_service

        main_module.store = RobotStateStore(
            config=RobotConfig(
                follower_id="test_follower",
                follower_port="/dev/mock-follower",
                leader_id="test_leader",
                leader_port="/dev/mock-leader",
                safety_step_ticks=120,
            ),
            verifier=FakeReadyVerifier(),
            bridge=FakeTelemetryBridge(),
        )
        main_module.local_library = LocalTrackLibrary(
            uploads_dir=uploads_root,
            media_base_url="/media/uploads",
            index_path=temp_root / "uploads" / "index.json",
        )
        main_module.analysis_service = AudioAnalysisService(
            jamendo_provider=JamendoTrackProvider(client_id="test"),
            local_library=main_module.local_library,
            cache=AudioAnalysisCache(cache_root),
        )
        self.client = TestClient(main_module.app)

    def tearDown(self) -> None:
        main_module.store = self.original_store
        main_module.local_library = self.original_local_library
        main_module.analysis_service = self.original_analysis_service
        self.tempdir.cleanup()

    def test_local_upload_analysis_flow(self) -> None:
        audio = self._fixture_wav()
        upload = self.client.post("/api/tracks/upload", files={"file": ("fixture.wav", audio, "audio/wav")})
        self.assertEqual(upload.status_code, 200)
        track = upload.json()

        select = self.client.post("/api/tracks/select", json={"track": track, "autoplay": False})
        self.assertEqual(select.status_code, 200)

        start = self.client.post(
            "/api/analysis/start",
            json={"track_id": track["track_id"], "source": track["source"]},
        )
        self.assertEqual(start.status_code, 200)
        self.assertEqual(start.json()["status"], "ready")

        status = self.client.get(f"/api/analysis/{track['source']}/{track['track_id']}/status")
        self.assertEqual(status.status_code, 200)
        self.assertEqual(status.json()["status"], "ready")

        analysis = self.client.get(f"/api/analysis/{track['source']}/{track['track_id']}")
        self.assertEqual(analysis.status_code, 200)
        payload = analysis.json()
        self.assertGreater(payload["bpm"], 0.0)
        self.assertGreater(len(payload["beats"]), 0)
        self.assertGreater(len(payload["waveform"]["peaks"]), 0)
        self.assertGreaterEqual(len(payload["sections"]), 3)

        state = self.client.get("/api/state")
        self.assertEqual(state.status_code, 200)
        state_payload = state.json()
        self.assertEqual(state_payload["transport"]["current_track"]["analysis_status"], "ready")
        self.assertEqual(state_payload["transport"]["bpm"], int(round(payload["bpm"])))
        self.assertAlmostEqual(state_payload["transport"]["energy"], payload["energy"]["rms"][0], places=3)
        expected_spectrum = self._expected_spectrum_prefix(payload)
        self.assertEqual(state_payload["spectrum"][:3], expected_spectrum)
        self.assertEqual(len(state_payload["dual_arm"]["arms"]), 2)
        self.assertEqual(state_payload["dual_arm"]["execution"]["mode"], "mirror")

        choreography = self.client.get(f"/api/choreography/{track['source']}/{track['track_id']}")
        self.assertEqual(choreography.status_code, 200)
        choreography_payload = choreography.json()
        self.assertGreater(len(choreography_payload["arm_left_cues"]), 0)
        self.assertGreater(len(choreography_payload["arm_right_cues"]), 0)
        self.assertTrue(any(cue["kind"] == "section_change" for cue in choreography_payload["global_cues"]))
        self.assertGreaterEqual(
            len({cue["symmetry_role"] for cue in choreography_payload["arm_left_cues"]}),
            2,
        )
        self.assertTrue(
            any(cue["kind"] == "accent" for cue in choreography_payload["global_cues"])
            or any(cue["kind"] == "hold" for cue in choreography_payload["global_cues"])
        )

        arms = self.client.get("/api/arms")
        self.assertEqual(arms.status_code, 200)
        arms_payload = arms.json()
        self.assertEqual(len(arms_payload["arms"]), 2)
        self.assertTrue(arms_payload["execution"]["dry_run_required"])
        self.assertEqual(
            {arm["arm_type"] for arm in arms_payload["arms"]},
            {"leader", "follower"},
        )
        self.assertTrue(all(arm["verification"]["status"] == "ready" for arm in arms_payload["arms"]))
        self.assertTrue(all(arm["verification"]["detected_joint_count"] == 6 for arm in arms_payload["arms"]))

        verify = self.client.post("/api/arms/verify")
        self.assertEqual(verify.status_code, 200)
        verify_payload = verify.json()
        self.assertTrue(all(not arm["connected"] for arm in verify_payload["arms"]))
        self.assertTrue(all(arm["calibrated"] for arm in verify_payload["arms"]))
        self.assertTrue(all(arm["verification"]["driver"] == "test-double" for arm in verify_payload["arms"]))

        connect_leader = self.client.post("/api/arms/test_leader/connect", json={"connected": True})
        self.assertEqual(connect_leader.status_code, 200)
        leader_live = next(arm for arm in connect_leader.json()["arms"] if arm["arm_id"] == "test_leader")
        self.assertTrue(leader_live["connected"])
        self.assertTrue(leader_live["telemetry_live"])
        self.assertEqual(len(leader_live["telemetry"]), 6)

        connect_follower = self.client.post("/api/arms/test_follower/connect", json={"connected": True})
        self.assertEqual(connect_follower.status_code, 200)
        follower_live = next(arm for arm in connect_follower.json()["arms"] if arm["arm_id"] == "test_follower")
        self.assertTrue(follower_live["connected"])
        self.assertTrue(follower_live["telemetry_live"])
        self.assertEqual(follower_live["telemetry"][0]["name"], "shoulder_pan")

        state_with_live = self.client.get("/api/state")
        self.assertEqual(state_with_live.status_code, 200)
        self.assertEqual(state_with_live.json()["servos"][0]["angle"], 21.0)

        mode_update = self.client.post("/api/arms/execution-mode", json={"mode": "call_response"})
        self.assertEqual(mode_update.status_code, 200)
        self.assertEqual(mode_update.json()["execution"]["mode"], "call_response")

        safety_update = self.client.post(
            "/api/arms/test_leader/safety",
            json={
                "dry_run": False,
                "torque_enabled": False,
                "amplitude_scale": 0.74,
                "speed_scale": 0.8,
                "joint_overrides": [
                    {
                        "joint_name": "wrist_roll",
                        "inverted": False,
                        "offset_degrees": 7.5,
                        "max_speed": 0.7,
                    }
                ],
            },
        )
        self.assertEqual(safety_update.status_code, 200)
        leader = next(arm for arm in safety_update.json()["arms"] if arm["arm_id"] == "test_leader")
        self.assertAlmostEqual(leader["safety"]["amplitude_scale"], 0.74, places=2)
        self.assertFalse(leader["safety"]["dry_run"])
        self.assertFalse(leader["safety"]["torque_enabled"])
        wrist_roll = next(joint for joint in leader["joints"] if joint["joint_name"] == "wrist_roll")
        self.assertFalse(wrist_roll["inverted"])
        self.assertAlmostEqual(wrist_roll["offset_degrees"], 7.5, places=2)
        self.assertAlmostEqual(wrist_roll["max_speed"], 0.7, places=2)

        reenable = self.client.post(
            "/api/arms/test_leader/safety",
            json={"torque_enabled": True},
        )
        self.assertEqual(reenable.status_code, 200)
        leader_live_again = next(arm for arm in reenable.json()["arms"] if arm["arm_id"] == "test_leader")
        self.assertTrue(leader_live_again["safety"]["torque_enabled"])
        self.assertTrue(all(servo["torque_enabled"] for servo in leader_live_again["telemetry"]))

        emergency_stop = self.client.post("/api/arms/emergency-stop")
        self.assertEqual(emergency_stop.status_code, 200)
        estop_payload = emergency_stop.json()
        self.assertTrue(estop_payload["execution"]["emergency_stop_active"])
        self.assertTrue(all(not arm["safety"]["torque_enabled"] for arm in estop_payload["arms"]))

        state_after_stop = self.client.get("/api/state")
        self.assertEqual(state_after_stop.status_code, 200)
        self.assertFalse(state_after_stop.json()["transport"]["playing"])
        self.assertTrue(all(not servo["torque_enabled"] for servo in state_after_stop.json()["servos"]))

        reset = self.client.post("/api/arms/emergency-reset")
        self.assertEqual(reset.status_code, 200)
        self.assertFalse(reset.json()["execution"]["emergency_stop_active"])

        follower_reenable = self.client.post(
            "/api/arms/test_follower/safety",
            json={"torque_enabled": True, "dry_run": False},
        )
        self.assertEqual(follower_reenable.status_code, 200)

        mutated = self.client.post(
            "/api/arms/test_follower/safety",
            json={
                "dry_run": False,
                "torque_enabled": False,
                "amplitude_scale": 1.45,
                "joint_overrides": [{"joint_name": "shoulder_pan", "offset_degrees": 11.0}],
            },
        )
        self.assertEqual(mutated.status_code, 200)

        reset_arm = self.client.post("/api/arms/test_follower/reset-state")
        self.assertEqual(reset_arm.status_code, 200)
        reset_follower = next(arm for arm in reset_arm.json()["arms"] if arm["arm_id"] == "test_follower")
        self.assertTrue(reset_follower["connected"])
        self.assertTrue(reset_follower["telemetry_live"])
        self.assertTrue(reset_follower["safety"]["dry_run"])
        self.assertTrue(reset_follower["safety"]["torque_enabled"])
        self.assertAlmostEqual(reset_follower["safety"]["amplitude_scale"], 1.0, places=2)
        reset_joint = next(joint for joint in reset_follower["joints"] if joint["joint_name"] == "shoulder_pan")
        self.assertAlmostEqual(reset_joint["offset_degrees"], 0.0, places=2)
        self.assertTrue(all(servo["torque_enabled"] for servo in reset_follower["telemetry"]))

        follower_live_after_reset = self.client.post(
            "/api/arms/test_follower/safety",
            json={"torque_enabled": True, "dry_run": False},
        )
        self.assertEqual(follower_live_after_reset.status_code, 200)

        neutral = self.client.post("/api/arms/neutral")
        self.assertEqual(neutral.status_code, 200)
        self.assertEqual(neutral.json()["execution"]["neutral_pose_scene"], "idle")
        follower_neutral = next(arm for arm in neutral.json()["arms"] if arm["arm_id"] == "test_follower")
        follower_goals = {servo["name"]: servo["target_angle"] for servo in follower_neutral["telemetry"]}
        self.assertAlmostEqual(follower_goals["shoulder_pan"], 0.0, places=1)
        self.assertAlmostEqual(follower_goals["shoulder_lift"], -12.0, places=1)
        self.assertAlmostEqual(follower_goals["elbow_flex"], 18.0, places=1)

        movements = self.client.get("/api/movements")
        self.assertEqual(movements.status_code, 200)
        movement_payload = movements.json()
        wave_definition = next(item for item in movement_payload["movements"] if item["movement_id"] == "wave")
        self.assertEqual(movement_payload["active"]["status"], "idle")
        self.assertEqual(wave_definition["controller"], "oscillator")
        self.assertEqual(wave_definition["default_preset_id"], "normal")
        self.assertEqual(len(wave_definition["presets"]), 3)

        run_wave = self.client.post(
            "/api/movements/run",
            json={"movement_id": "wave", "arm_id": "test_follower", "preset_id": "normal"},
        )
        self.assertEqual(run_wave.status_code, 200)
        self.assertEqual(run_wave.json()["active"]["status"], "running")
        self.assertEqual(run_wave.json()["active"]["preset_id"], "normal")

        completed = None
        for _ in range(240):
            snapshot = self.client.get("/api/movements")
            self.assertEqual(snapshot.status_code, 200)
            active = snapshot.json()["active"]
            if active["status"] == "completed":
                completed = active
                break
            time.sleep(0.05)

        self.assertIsNotNone(completed)
        self.assertEqual(completed["movement_id"], "wave")
        self.assertEqual(completed["arm_id"], "test_follower")
        self.assertEqual(completed["preset_id"], "normal")
        self.assertGreaterEqual(completed["progress"], 1.0)

        rerun_wave = self.client.post(
            "/api/movements/run",
            json={"movement_id": "wave", "arm_id": "test_follower", "preset_id": "subtle"},
        )
        self.assertEqual(rerun_wave.status_code, 200)
        stop_wave = self.client.post("/api/movements/stop")
        self.assertEqual(stop_wave.status_code, 200)
        self.assertIn(stop_wave.json()["active"]["status"], {"stopped", "completed"})

        cache_files = list((Path(self.tempdir.name) / "analysis-cache" / "json" / "local").glob("*.json"))
        self.assertTrue(cache_files)

    def _expected_spectrum_prefix(self, analysis_payload: dict[str, object]) -> list[int]:
        def window_mean(values: list[float]) -> float:
            window = values[:3] if len(values) >= 3 else values
            return sum(window) / len(window)

        low = window_mean(analysis_payload["bands"]["low"])
        mid = window_mean(analysis_payload["bands"]["mid"])
        high = window_mean(analysis_payload["bands"]["high"])
        return [self._spectrum_bar(low), self._spectrum_bar(mid), self._spectrum_bar(high)]

    def _spectrum_bar(self, value: float) -> int:
        return max(18, min(100, int(round(18 + value * 82))))

    def _fixture_wav(self) -> bytes:
        sample_rate = 22050
        duration = 16.0
        timeline = np.linspace(0.0, duration, int(sample_rate * duration), endpoint=False)
        carrier = 0.18 * np.sin(2 * math.pi * 220.0 * timeline) + 0.08 * np.sin(2 * math.pi * 440.0 * timeline)
        pulse = (np.sin(2 * math.pi * 2.0 * timeline) > 0).astype(float)
        sections = np.piecewise(
            timeline,
            [
                timeline < 4.0,
                (timeline >= 4.0) & (timeline < 8.0),
                (timeline >= 8.0) & (timeline < 12.0),
                timeline >= 12.0,
            ],
            [0.18, 0.95, 0.28, 0.82],
        )
        sparkle = 0.06 * np.sin(2 * math.pi * 9.0 * timeline) * (timeline >= 4.0)
        signal = (carrier + sparkle) * (0.12 + sections * pulse)

        buffer = io.BytesIO()
        sf.write(buffer, signal, sample_rate, format="WAV")
        return buffer.getvalue()

    def test_wave_motion_generator_travels_from_shoulder_to_wrist(self) -> None:
        samples = sample_motion(
            MovementRunRequest(movement_id="wave", arm_id="test_follower", preset_id="normal"),
            sample_hz=80.0,
        )
        self.assertGreater(len(samples), 100)

        shoulder_values = [frame["shoulder_pan"] for frame in samples]
        elbow_values = [frame["elbow_flex"] for frame in samples]
        wrist_values = [frame["wrist_roll"] for frame in samples]

        shoulder_peak_index = max(range(len(shoulder_values)), key=lambda index: shoulder_values[index])
        elbow_peak_index = max(range(len(elbow_values)), key=lambda index: elbow_values[index])
        wrist_peak_index = max(range(len(wrist_values)), key=lambda index: wrist_values[index])

        self.assertLess(shoulder_peak_index, elbow_peak_index)
        self.assertLess(elbow_peak_index, wrist_peak_index)
        self.assertGreater(max(wrist_values) - min(wrist_values), max(shoulder_values) - min(shoulder_values))


if __name__ == "__main__":
    unittest.main()
