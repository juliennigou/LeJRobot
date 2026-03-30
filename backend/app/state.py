from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from time import monotonic

from .models import (
    DanceMode,
    PulseUpdate,
    RobotConfig,
    RobotState,
    SceneName,
    ServoState,
    ServoUpdate,
    TrackSelection,
    TransportState,
    TransportUpdate,
)

ROOT_DIR = Path(__file__).resolve().parents[2]
SETUP_PATH = ROOT_DIR / ".data" / "setup.json"

SERVO_LAYOUT = [
    (1, "shoulder_pan"),
    (2, "shoulder_lift"),
    (3, "elbow_flex"),
    (4, "wrist_flex"),
    (5, "wrist_roll"),
    (6, "gripper"),
]

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


class LeRobotBridge:
    def __init__(self, config: RobotConfig) -> None:
        self.config = config

    def connection_ok(self) -> bool:
        return bool(self.config.follower_port)


class RobotStateStore:
    def __init__(self) -> None:
        self.config = self._load_config()
        self.bridge = LeRobotBridge(self.config)
        self.mode = DanceMode.IDLE
        self.transport = TransportState()
        self.status = "ready"
        self.latency_ms = 14
        self.sync_quality = 92
        self.started_at = monotonic()
        self.last_tick = monotonic()
        self.scene = SceneName.IDLE
        self.servos = [
            ServoRuntime(id=servo_id, name=name, angle=0.0, target_angle=0.0)
            for servo_id, name in SERVO_LAYOUT
        ]
        self._set_scene_targets(SceneName.IDLE)

    def _load_config(self) -> RobotConfig:
        if not SETUP_PATH.exists():
            return RobotConfig()

        data = json.loads(SETUP_PATH.read_text())
        return RobotConfig.model_validate(data)

    def _tick(self) -> None:
        now = monotonic()
        delta = max(now - self.last_tick, 0.05)
        self.last_tick = now

        if self.transport.playing:
            self.transport.position_seconds += delta

        beat = self.transport.position_seconds * max(self.transport.bpm, 1) / 60.0
        beat_phase = beat * math.tau

        for index, servo in enumerate(self.servos):
            pulse = math.sin(beat_phase + index * 0.75)
            accent = math.sin(beat_phase * 0.5 + index)

            if self.mode == DanceMode.PULSE and servo.torque_enabled:
                scene_target = SCENES.get(self.scene, SCENES[SceneName.IDLE])[servo.name]
                servo.target_angle = scene_target + pulse * (8 + 18 * self.transport.energy)
                servo.motion_phase = "accent"
            elif self.mode == DanceMode.AUTONOMOUS and servo.torque_enabled:
                scene_target = SCENES.get(self.scene, SCENES[SceneName.IDLE])[servo.name]
                servo.target_angle = scene_target + accent * (5 + 12 * self.transport.energy)
                servo.motion_phase = "ramping"
            elif abs(servo.target_angle - servo.angle) > 3:
                servo.motion_phase = "ramping"
            else:
                servo.motion_phase = "steady"

            blend = 0.18 if servo.torque_enabled else 0.05
            servo.angle += (servo.target_angle - servo.angle) * blend
            servo.load_pct = min(100.0, abs(servo.target_angle - servo.angle) * 1.35 + self.transport.energy * 28)
            servo.temperature_c = 31.5 + servo.load_pct * 0.11

        self.latency_ms = 12 + int((math.sin(beat_phase) + 1) * 7)
        self.sync_quality = max(72, 99 - int(self.transport.energy * 8) - int(abs(math.cos(beat_phase)) * 6))

    def _set_scene_targets(self, scene: SceneName) -> None:
        self.scene = scene
        scene_targets = SCENES[scene]
        for servo in self.servos:
            servo.target_angle = scene_targets[servo.name]

    def snapshot(self) -> RobotState:
        self._tick()
        connected = self.bridge.connection_ok()
        spectrum = self._build_spectrum()
        return RobotState(
            connected=connected,
            status=self.status,
            mode=self.mode,
            follower_id=self.config.follower_id,
            follower_port=self.config.follower_port,
            safety_step_ticks=self.config.safety_step_ticks,
            latency_ms=self.latency_ms,
            sync_quality=self.sync_quality,
            last_sync=datetime.now(UTC).isoformat(),
            transport=self.transport,
            spectrum=spectrum,
            servos=[
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
            ],
        )

    def _build_spectrum(self) -> list[int]:
        base = self.transport.energy or 0.25
        beat = self.transport.position_seconds * self.transport.bpm / 60.0
        values: list[int] = []
        for index in range(18):
            wave = math.sin(beat * 0.8 + index * 0.48)
            sparkle = math.cos(beat * 1.9 + index * 0.31)
            height = 28 + base * 46 + wave * 18 + sparkle * 10
            values.append(max(18, min(100, int(height))))
        return values

    def set_mode(self, mode: DanceMode) -> RobotState:
        self.mode = mode
        if mode == DanceMode.IDLE:
            self.apply_scene(SceneName.IDLE)
            self.transport.playing = False
        return self.snapshot()

    def set_transport(self, payload: TransportUpdate) -> RobotState:
        self.transport.track_name = payload.track_name
        self.transport.bpm = payload.bpm
        self.transport.energy = payload.energy
        self.transport.playing = payload.playing
        if payload.playing and self.mode == DanceMode.IDLE:
            self.mode = DanceMode.AUTONOMOUS
        return self.snapshot()

    def apply_scene(self, scene: SceneName) -> RobotState:
        self._set_scene_targets(scene)
        return self.snapshot()

    def pulse(self, payload: PulseUpdate) -> RobotState:
        self.transport.bpm = payload.bpm
        self.transport.energy = payload.energy
        self.transport.playing = True
        self.mode = DanceMode.PULSE
        if self.scene == SceneName.IDLE:
            self.scene = SceneName.BLOOM
        return self.snapshot()

    def update_servo(self, servo_id: int, payload: ServoUpdate) -> RobotState:
        servo = next((item for item in self.servos if item.id == servo_id), None)
        if servo is None:
            raise ValueError(f"Unknown servo id: {servo_id}")

        self.mode = DanceMode.MANUAL
        if payload.target_angle is not None:
            servo.target_angle = payload.target_angle
        if payload.torque_enabled is not None:
            servo.torque_enabled = payload.torque_enabled

        return self.snapshot()

    def select_track(self, payload: TrackSelection) -> RobotState:
        track = payload.track
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

        return self.snapshot()
