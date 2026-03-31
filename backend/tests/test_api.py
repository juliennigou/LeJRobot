from __future__ import annotations

import io
import math
import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient

from backend.app import main as main_module
from backend.app.analysis import AudioAnalysisCache, AudioAnalysisService
from backend.app.music import JamendoTrackProvider, LocalTrackLibrary
from backend.app.models import RobotConfig
from backend.app.state import RobotStateStore


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
            )
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

        mode_update = self.client.post("/api/arms/execution-mode", json={"mode": "call_response"})
        self.assertEqual(mode_update.status_code, 200)
        self.assertEqual(mode_update.json()["execution"]["mode"], "call_response")

        safety_update = self.client.post(
            "/api/arms/test_leader/safety",
            json={
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
        wrist_roll = next(joint for joint in leader["joints"] if joint["joint_name"] == "wrist_roll")
        self.assertFalse(wrist_roll["inverted"])
        self.assertAlmostEqual(wrist_roll["offset_degrees"], 7.5, places=2)
        self.assertAlmostEqual(wrist_roll["max_speed"], 0.7, places=2)

        emergency_stop = self.client.post("/api/arms/emergency-stop")
        self.assertEqual(emergency_stop.status_code, 200)
        estop_payload = emergency_stop.json()
        self.assertTrue(estop_payload["execution"]["emergency_stop_active"])
        self.assertTrue(all(not arm["safety"]["torque_enabled"] for arm in estop_payload["arms"]))

        state_after_stop = self.client.get("/api/state")
        self.assertEqual(state_after_stop.status_code, 200)
        self.assertFalse(state_after_stop.json()["transport"]["playing"])
        self.assertTrue(all(not servo["torque_enabled"] for servo in state_after_stop.json()["servos"]))

        neutral = self.client.post("/api/arms/neutral")
        self.assertEqual(neutral.status_code, 200)
        self.assertEqual(neutral.json()["execution"]["neutral_pose_scene"], "idle")

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


if __name__ == "__main__":
    unittest.main()
