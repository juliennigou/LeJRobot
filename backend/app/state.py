from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from time import monotonic

from .arms import ArmHardwareBridge, DEFAULT_JOINT_LAYOUT, DualArmAdapter, LeRobotArmVerifier
from .models import (
    AnalysisStartResponse,
    AnalysisStatus,
    AnalysisStatusResponse,
    ArmConnectionUpdate,
    ArmSafetyUpdate,
    AudioAnalysis,
    ChoreographyTimeline,
    DanceMode,
    DualArmState,
    ExecutionMode,
    ExecutionModeUpdate,
    MotionCue,
    PulseUpdate,
    RobotConfig,
    RobotState,
    SceneName,
    ServoState,
    SymmetryRole,
    ServoUpdate,
    TrackReference,
    TrackSummary,
    TrackSelection,
    TrackSource,
    TransportState,
    TransportUpdate,
)

ROOT_DIR = Path(__file__).resolve().parents[2]
SETUP_PATH = ROOT_DIR / ".data" / "setup.json"

SERVO_LAYOUT = DEFAULT_JOINT_LAYOUT

SCENES: dict[SceneName, dict[str, float]] = {
    SceneName.IDLE: {
        "shoulder_pan": 0,
        "shoulder_lift": -12,
        "elbow_flex": 18,
        "wrist_flex": 0,
        "wrist_roll": 0,
        "gripper": 8,
    },
    SceneName.BLOOM: {
        "shoulder_pan": 28,
        "shoulder_lift": -32,
        "elbow_flex": 44,
        "wrist_flex": 18,
        "wrist_roll": 22,
        "gripper": 14,
    },
    SceneName.PUNCH: {
        "shoulder_pan": -16,
        "shoulder_lift": 12,
        "elbow_flex": -36,
        "wrist_flex": -24,
        "wrist_roll": 40,
        "gripper": 10,
    },
    SceneName.SWEEP: {
        "shoulder_pan": 62,
        "shoulder_lift": -18,
        "elbow_flex": 26,
        "wrist_flex": -30,
        "wrist_roll": -42,
        "gripper": 12,
    },
}


@dataclass
class ServoRuntime:
    id: int
    name: str
    angle: float
    target_angle: float
    torque_enabled: bool = True
    temperature_c: float = 32.0
    load_pct: float = 0.0
    motion_phase: str = "steady"


class RobotStateStore:
    def __init__(
        self,
        config: RobotConfig | None = None,
        verifier: LeRobotArmVerifier | None = None,
        bridge: ArmHardwareBridge | None = None,
    ) -> None:
        self.config = config or self._load_config()
        self.arm_adapter = DualArmAdapter(self.config, verifier=verifier, bridge=bridge)
        self.mode = DanceMode.IDLE
        self.transport = TransportState()
        self.status = "ready"
        self.latency_ms = 14
        self.sync_quality = 92
        self.started_at = monotonic()
        self.last_tick = monotonic()
        self.scene = SceneName.IDLE
        self.known_tracks: dict[tuple[TrackSource, str], TrackSummary] = {}
        self.analysis_statuses: dict[tuple[TrackSource, str], AnalysisStatusResponse] = {}
        self.analysis_results: dict[tuple[TrackSource, str], AudioAnalysis] = {}
        self.choreography_results: dict[tuple[TrackSource, str], ChoreographyTimeline] = {}
        self.servos = [
            ServoRuntime(id=servo_id, name=name, angle=0.0, target_angle=0.0)
            for servo_id, name in SERVO_LAYOUT
        ]
        self._set_scene_targets(SceneName.IDLE)
        self._sync_follower_torque_state()

    def _load_config(self) -> RobotConfig:
        if not SETUP_PATH.exists():
            return RobotConfig()

        data = json.loads(SETUP_PATH.read_text())
        return RobotConfig.model_validate(data)

    def _tick(self) -> None:
        now = monotonic()
        delta = max(now - self.last_tick, 0.05)
        self.last_tick = now

        if self.arm_adapter.emergency_stop_active():
            self.transport.playing = False
            self.mode = DanceMode.IDLE

        if self.transport.playing:
            self.transport.position_seconds += delta

        analysis = self.current_analysis()
        choreography = self.current_choreography()
        self._sync_transport_from_analysis(analysis)

        beat = self.transport.position_seconds * max(self.transport.bpm, 1) / 60.0
        beat_phase = beat * math.tau

        for index, servo in enumerate(self.servos):
            pulse = math.sin(beat_phase + index * 0.75)
            accent = math.sin(beat_phase * 0.5 + index)
            analysis_driver = self._servo_driver(index, analysis, choreography)
            modulation = analysis_driver["modulation"]
            intensity = analysis_driver["intensity"]
            motion_phase = analysis_driver["motion_phase"]

            if self.mode == DanceMode.PULSE and servo.torque_enabled:
                scene_target = SCENES.get(self.scene, SCENES[SceneName.IDLE])[servo.name]
                base_pulse = pulse if analysis is None else modulation
                servo.target_angle = scene_target + base_pulse * (8 + 18 * self.transport.energy)
                servo.motion_phase = motion_phase
            elif self.mode == DanceMode.AUTONOMOUS and servo.torque_enabled:
                scene_target = SCENES.get(self.scene, SCENES[SceneName.IDLE])[servo.name]
                base_accent = accent if analysis is None else modulation
                servo.target_angle = scene_target + base_accent * (5 + 12 * intensity)
                servo.motion_phase = motion_phase
            elif abs(servo.target_angle - servo.angle) > 3:
                servo.motion_phase = "ramping"
            else:
                servo.motion_phase = "steady"

            blend = 0.18 if servo.torque_enabled else 0.05
            servo.angle += (servo.target_angle - servo.angle) * blend
            servo.load_pct = min(100.0, abs(servo.target_angle - servo.angle) * 1.35 + intensity * 28)
            servo.temperature_c = 31.5 + servo.load_pct * 0.11

        if analysis is not None:
            confidence_penalty = int((1.0 - analysis.tempo_confidence) * 12)
            activity_penalty = int(abs(0.5 - self.transport.energy) * 10)
            self.latency_ms = max(8, 10 + confidence_penalty + activity_penalty)
            self.sync_quality = max(70, 100 - confidence_penalty - int((1.0 - self.transport.energy) * 8))
        else:
            self.latency_ms = 12 + int((math.sin(beat_phase) + 1) * 7)
            self.sync_quality = max(72, 99 - int(self.transport.energy * 8) - int(abs(math.cos(beat_phase)) * 6))

    def _set_scene_targets(self, scene: SceneName) -> None:
        self.scene = scene
        scene_targets = SCENES[scene]
        for servo in self.servos:
            servo.target_angle = scene_targets[servo.name]

    def _track_key(self, source: TrackSource, track_id: str) -> tuple[TrackSource, str]:
        return (source, track_id)

    def _status_for_reference(self, payload: TrackReference) -> AnalysisStatusResponse:
        key = self._track_key(payload.source, payload.track_id)
        status = self.analysis_statuses.get(key)
        if status is not None:
            return status

        current_track = self.transport.current_track
        if current_track and current_track.track_id == payload.track_id and current_track.source == payload.source:
            status = AnalysisStatusResponse(
                track_id=payload.track_id,
                source=payload.source,
                status=AnalysisStatus.NONE,
                progress=0,
                error=None,
            )
            self.analysis_statuses[key] = status
            return status

        if key in self.known_tracks:
            status = AnalysisStatusResponse(
                track_id=payload.track_id,
                source=payload.source,
                status=AnalysisStatus.NONE,
                progress=0,
                error=None,
            )
            self.analysis_statuses[key] = status
            return status

        raise ValueError(f"Unknown track reference: {payload.source}:{payload.track_id}")

    def snapshot(self) -> RobotState:
        self._tick()
        connected = self.arm_adapter.any_connected()
        spectrum = self._build_spectrum()
        dual_arm = self.arm_adapter.snapshot(self.current_choreography(), self.transport.position_seconds)
        public_servos = self._public_servos(dual_arm)
        return RobotState(
            connected=connected,
            status=self.status,
            mode=self.mode,
            follower_id=self.config.follower_id,
            follower_port=self.config.follower_port,
            leader_id=self.config.leader_id,
            leader_port=self.config.leader_port,
            safety_step_ticks=self.config.safety_step_ticks,
            latency_ms=self.latency_ms,
            sync_quality=self.sync_quality,
            last_sync=datetime.now(UTC).isoformat(),
            transport=self.transport,
            spectrum=spectrum,
            servos=public_servos,
            dual_arm=dual_arm,
        )

    def _build_spectrum(self) -> list[int]:
        analysis = self.current_analysis()
        if analysis is not None:
            return self._analysis_spectrum(analysis)

        base = self.transport.energy or 0.25
        beat = self.transport.position_seconds * self.transport.bpm / 60.0
        values: list[int] = []
        for index in range(18):
            wave = math.sin(beat * 0.8 + index * 0.48)
            sparkle = math.cos(beat * 1.9 + index * 0.31)
            height = 28 + base * 46 + wave * 18 + sparkle * 10
            values.append(max(18, min(100, int(height))))
        return values

    def _analysis_spectrum(self, analysis: AudioAnalysis) -> list[int]:
        frame_index = self._analysis_frame_index(analysis)
        bars: list[int] = []
        series_groups = [analysis.bands.low, analysis.bands.mid, analysis.bands.high]
        for index in range(18):
            group = series_groups[index % len(series_groups)]
            value = self._window_mean(group, frame_index, radius=2)
            bars.append(max(18, min(100, int(round(18 + value * 82)))))
        return bars

    def set_mode(self, mode: DanceMode) -> RobotState:
        if self.arm_adapter.emergency_stop_active() and mode != DanceMode.IDLE:
            mode = DanceMode.IDLE
        self.mode = mode
        if mode == DanceMode.IDLE:
            self.apply_scene(SceneName.IDLE)
            self.transport.playing = False
        return self.snapshot()

    def set_transport(self, payload: TransportUpdate) -> RobotState:
        self.transport.track_name = payload.track_name
        self.transport.bpm = max(40, min(220, int(round(payload.bpm))))
        self.transport.energy = max(0.0, min(1.0, payload.energy))
        self.transport.playing = False if self.arm_adapter.emergency_stop_active() else payload.playing
        if self.transport.playing and self.mode == DanceMode.IDLE:
            self.mode = DanceMode.AUTONOMOUS
        return self.snapshot()

    def apply_scene(self, scene: SceneName) -> RobotState:
        self._set_scene_targets(scene)
        return self.snapshot()

    def pulse(self, payload: PulseUpdate) -> RobotState:
        self.transport.bpm = payload.bpm
        self.transport.energy = payload.energy
        self.transport.playing = not self.arm_adapter.emergency_stop_active()
        self.mode = DanceMode.IDLE if self.arm_adapter.emergency_stop_active() else DanceMode.PULSE
        if self.scene == SceneName.IDLE:
            self.scene = SceneName.BLOOM
        return self.snapshot()

    def update_servo(self, servo_id: int, payload: ServoUpdate) -> RobotState:
        if self.arm_adapter.emergency_stop_active():
            raise ValueError("Emergency stop is active")
        servo = next((item for item in self.servos if item.id == servo_id), None)
        if servo is None:
            raise ValueError(f"Unknown servo id: {servo_id}")

        self.mode = DanceMode.MANUAL
        if payload.target_angle is not None:
            servo.target_angle = payload.target_angle
        if payload.torque_enabled is not None:
            servo.torque_enabled = payload.torque_enabled
            self._sync_follower_torque_state()

        return self.snapshot()

    def select_track(self, payload: TrackSelection) -> RobotState:
        track = payload.track
        self.remember_track(track)
        key = self._track_key(track.source, track.track_id)
        status = self.analysis_statuses.get(key)
        if status is None:
            status = AnalysisStatusResponse(
                track_id=track.track_id,
                source=track.source,
                status=AnalysisStatus.NONE,
                progress=0,
                error=None,
            )
            self.analysis_statuses[key] = status
        track.analysis_status = status.status
        self.transport.current_track = track
        self.transport.track_name = f"{track.title} - {track.artist}"
        self.transport.bpm = track.motion_profile.bpm
        self.transport.energy = track.motion_profile.energy
        self.transport.position_seconds = 0.0
        self.transport.playing = payload.autoplay

        scene_map = {
            "groove": SceneName.BLOOM,
            "sweep": SceneName.SWEEP,
            "punch": SceneName.PUNCH,
            "float": SceneName.IDLE,
        }
        self._set_scene_targets(scene_map.get(track.motion_profile.pattern_bias, SceneName.BLOOM))

        if payload.autoplay:
            self.mode = DanceMode.AUTONOMOUS

        analysis = self.analysis_results.get(key)
        if analysis is not None:
            self._sync_transport_from_analysis(analysis)

        return self.snapshot()

    def current_track(self):
        track = self.transport.current_track
        if track is None:
            return None

        status = self.analysis_statuses.get(self._track_key(track.source, track.track_id))
        if status is not None:
            track.analysis_status = status.status
        return track

    def current_analysis(self) -> AudioAnalysis | None:
        track = self.transport.current_track
        if track is None:
            return None
        return self.analysis_results.get(self._track_key(track.source, track.track_id))

    def current_choreography(self) -> ChoreographyTimeline | None:
        track = self.transport.current_track
        if track is None:
            return None
        return self.choreography_results.get(self._track_key(track.source, track.track_id))

    def arms_snapshot(self) -> DualArmState:
        self._tick()
        return self.arm_adapter.snapshot(self.current_choreography(), self.transport.position_seconds)

    def verify_arms(self) -> DualArmState:
        self.arm_adapter.verify_all()
        self._sync_follower_torque_state()
        return self.arms_snapshot()

    def set_execution_mode(self, payload: ExecutionModeUpdate) -> DualArmState:
        self.arm_adapter.set_execution_mode(payload.mode)
        return self.arms_snapshot()

    def set_arm_connection(self, arm_id: str, payload: ArmConnectionUpdate) -> DualArmState:
        self.arm_adapter.set_connection(arm_id, payload.connected)
        self._sync_follower_torque_state()
        return self.arms_snapshot()

    def update_arm_safety(self, arm_id: str, payload: ArmSafetyUpdate) -> DualArmState:
        self.arm_adapter.update_safety(arm_id, payload)
        if self.arm_adapter.emergency_stop_active():
            self.transport.playing = False
            self.mode = DanceMode.IDLE
            self._set_scene_targets(SceneName.IDLE)
        self._sync_follower_torque_state()
        return self.arms_snapshot()

    def emergency_stop(self) -> DualArmState:
        self.arm_adapter.emergency_stop()
        self.transport.playing = False
        self.mode = DanceMode.IDLE
        self._set_scene_targets(SceneName.IDLE)
        self._sync_follower_torque_state()
        return self.arms_snapshot()

    def reset_emergency_stop(self) -> DualArmState:
        self.arm_adapter.reset_emergency_stop()
        self._sync_follower_torque_state()
        return self.arms_snapshot()

    def move_to_neutral(self) -> DualArmState:
        self.arm_adapter.neutralize()
        self.transport.playing = False
        self.mode = DanceMode.IDLE
        self._set_scene_targets(SceneName.IDLE)
        return self.arms_snapshot()

    def queue_analysis(self, payload: TrackReference) -> AnalysisStartResponse:
        self.analysis_results.pop(self._track_key(payload.source, payload.track_id), None)
        self.choreography_results.pop(self._track_key(payload.source, payload.track_id), None)
        status = AnalysisStatusResponse(
            track_id=payload.track_id,
            source=payload.source,
            status=AnalysisStatus.QUEUED,
            progress=0,
            error=None,
        )
        self.analysis_statuses[self._track_key(payload.source, payload.track_id)] = status

        current_track = self.transport.current_track
        if current_track and current_track.track_id == payload.track_id and current_track.source == payload.source:
            current_track.analysis_status = AnalysisStatus.QUEUED

        return AnalysisStartResponse(
            track_id=payload.track_id,
            source=payload.source,
            status=AnalysisStatus.QUEUED,
            progress=0,
        )

    def get_analysis_status(self, payload: TrackReference) -> AnalysisStatusResponse:
        return self._status_for_reference(payload)

    def get_analysis(self, payload: TrackReference) -> AudioAnalysis | None:
        self._status_for_reference(payload)
        return self.analysis_results.get(self._track_key(payload.source, payload.track_id))

    def get_choreography(self, payload: TrackReference) -> ChoreographyTimeline | None:
        self._status_for_reference(payload)
        return self.choreography_results.get(self._track_key(payload.source, payload.track_id))

    def remember_track(self, track: TrackSummary) -> TrackSummary:
        self.known_tracks[self._track_key(track.source, track.track_id)] = track
        return track

    def remember_tracks(self, tracks: list[TrackSummary]) -> None:
        for track in tracks:
            self.remember_track(track)

    def known_track(self, payload: TrackReference) -> TrackSummary | None:
        return self.known_tracks.get(self._track_key(payload.source, payload.track_id))

    def mark_analysis_processing(self, payload: TrackReference) -> AnalysisStatusResponse:
        status = AnalysisStatusResponse(
            track_id=payload.track_id,
            source=payload.source,
            status=AnalysisStatus.PROCESSING,
            progress=10,
            error=None,
        )
        self.analysis_statuses[self._track_key(payload.source, payload.track_id)] = status
        self._sync_current_track_status(payload, status.status)
        return status

    def store_analysis(self, analysis: AudioAnalysis) -> AnalysisStatusResponse:
        key = self._track_key(analysis.source, analysis.track_id)
        self.analysis_results[key] = analysis
        self.choreography_results[key] = analysis.choreography

        known_track = self.known_tracks.get(key)
        if known_track is not None:
            known_track.analysis_status = AnalysisStatus.READY
            known_track.motion_profile.bpm = max(40, min(220, int(round(analysis.bpm or known_track.motion_profile.bpm))))
            known_track.motion_profile.energy = round(self._analysis_energy_mean(analysis), 2)
            known_track.motion_profile.pattern_bias = analysis.choreography.global_cues[0].pose_family.value if analysis.choreography.global_cues else known_track.motion_profile.pattern_bias

        status = AnalysisStatusResponse(
            track_id=analysis.track_id,
            source=analysis.source,
            status=AnalysisStatus.READY,
            progress=100,
            error=None,
        )
        self.analysis_statuses[key] = status
        self._sync_current_track_status(TrackReference(track_id=analysis.track_id, source=analysis.source), status.status)
        current_track = self.transport.current_track
        if current_track and current_track.track_id == analysis.track_id and current_track.source == analysis.source:
            self._sync_transport_from_analysis(analysis)
        return status

    def mark_analysis_error(self, payload: TrackReference, message: str) -> AnalysisStatusResponse:
        status = AnalysisStatusResponse(
            track_id=payload.track_id,
            source=payload.source,
            status=AnalysisStatus.ERROR,
            progress=100,
            error=message,
        )
        self.analysis_statuses[self._track_key(payload.source, payload.track_id)] = status
        self._sync_current_track_status(payload, status.status)
        return status

    def _sync_current_track_status(self, payload: TrackReference, status: AnalysisStatus) -> None:
        current_track = self.transport.current_track
        if current_track and current_track.track_id == payload.track_id and current_track.source == payload.source:
            current_track.analysis_status = status

    def _analysis_energy_mean(self, analysis: AudioAnalysis) -> float:
        if not analysis.energy.rms:
            return 0.0
        return sum(analysis.energy.rms) / len(analysis.energy.rms)

    def _sync_transport_from_analysis(self, analysis: AudioAnalysis | None) -> None:
        if analysis is None:
            return
        self.transport.bpm = max(40, min(220, int(round(analysis.bpm or self.transport.bpm))))
        frame_index = self._analysis_frame_index(analysis)
        self.transport.energy = round(self._series_value(analysis.energy.rms, frame_index), 3)

    def _analysis_frame_index(self, analysis: AudioAnalysis) -> int:
        if analysis.energy.frame_hz <= 0 or not analysis.energy.rms:
            return 0
        raw_index = int(self.transport.position_seconds * analysis.energy.frame_hz)
        return max(0, min(len(analysis.energy.rms) - 1, raw_index))

    def _series_value(self, values: list[float], index: int) -> float:
        if not values:
            return 0.0
        safe_index = max(0, min(len(values) - 1, index))
        return float(values[safe_index])

    def _window_mean(self, values: list[float], index: int, radius: int) -> float:
        if not values:
            return 0.0
        start = max(0, index - radius)
        end = min(len(values), index + radius + 1)
        window = values[start:end] or [values[max(0, min(len(values) - 1, index))]]
        return sum(window) / len(window)

    def _sync_follower_torque_state(self) -> None:
        follower = self.arm_adapter.arms.get(self.config.follower_id)
        if follower is None:
            return
        torque_enabled = follower.safety.torque_enabled and not follower.safety.emergency_stop
        for servo in self.servos:
            servo.torque_enabled = torque_enabled

    def _public_servos(self, dual_arm: DualArmState) -> list[ServoState]:
        follower = next((arm for arm in dual_arm.arms if arm.arm_type == "follower"), None)
        if follower and follower.telemetry_live and follower.telemetry:
            return [servo.model_copy(deep=True) for servo in follower.telemetry]

        return [
            ServoState(
                id=servo.id,
                name=servo.name,
                angle=round(servo.angle, 2),
                target_angle=round(servo.target_angle, 2),
                torque_enabled=servo.torque_enabled,
                temperature_c=round(servo.temperature_c, 1),
                load_pct=round(servo.load_pct, 1),
                motion_phase=servo.motion_phase,
            )
            for servo in self.servos
        ]

    def _servo_driver(
        self,
        servo_index: int,
        analysis: AudioAnalysis | None,
        choreography: ChoreographyTimeline | None,
    ) -> dict[str, float | str]:
        if analysis is None:
            return {
                "modulation": math.sin(self.transport.position_seconds + servo_index * 0.7),
                "intensity": self.transport.energy,
                "motion_phase": "ramping",
            }

        frame_index = self._analysis_frame_index(analysis)
        low = self._series_value(analysis.bands.low, frame_index)
        mid = self._series_value(analysis.bands.mid, frame_index)
        high = self._series_value(analysis.bands.high, frame_index)
        intensity = min(1.0, max(0.08, self._series_value(analysis.energy.rms, frame_index)))
        cue = self._active_cue(servo_index, choreography)
        cue_intensity = cue.intensity if cue is not None else intensity
        role_phase = 1.0
        if cue is not None and cue.symmetry_role in {SymmetryRole.MIRROR, SymmetryRole.CONTRAST}:
            role_phase = -1.0 if servo_index % 2 else 1.0
        modulation = role_phase * (
            math.sin(self.transport.position_seconds * (1.2 + mid * 1.8) + servo_index * 0.8) * (0.25 + low * 0.75)
            + math.cos(self.transport.position_seconds * (2.1 + high * 2.3) + servo_index * 0.45) * 0.18
        )

        motion_phase = "steady"
        if cue is not None and cue.kind.value in {"accent", "downbeat", "section_change"}:
            motion_phase = "accent"
        elif cue is not None or cue_intensity > 0.14:
            motion_phase = "ramping"

        return {
            "modulation": max(-1.0, min(1.0, modulation)),
            "intensity": min(1.0, max(intensity, cue_intensity)),
            "motion_phase": motion_phase,
        }

    def _active_cue(self, servo_index: int, choreography: ChoreographyTimeline | None) -> MotionCue | None:
        if choreography is None:
            return None
        cues = choreography.arm_left_cues if servo_index % 2 == 0 else choreography.arm_right_cues
        current_time = self.transport.position_seconds
        window = 0.32
        for cue in reversed(cues):
            if abs(cue.time - current_time) <= window:
                return cue
        return None
