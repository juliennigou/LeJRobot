from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Protocol

from .models import (
    ArmType,
    MovementDefinition,
    MovementJointProfile,
    MovementPreset,
    MovementRunRequest,
)

WAVE_NEUTRAL_POSE = {
    "shoulder_pan": 14.0,
    "shoulder_lift": -36.0,
    "elbow_flex": -10.0,
    "wrist_flex": 16.0,
    "wrist_roll": 4.0,
    "gripper": 8.0,
}


def _wave_profiles(scale: float) -> list[MovementJointProfile]:
    return [
        MovementJointProfile(joint_name="shoulder_pan", base_angle=14.0, amplitude=3.0 * scale, phase_delay_radians=0.0),
        MovementJointProfile(
            joint_name="shoulder_lift",
            base_angle=-36.0,
            amplitude=4.8 * scale,
            phase_delay_radians=0.24,
        ),
        MovementJointProfile(
            joint_name="elbow_flex",
            base_angle=-10.0,
            amplitude=9.0 * scale,
            phase_delay_radians=0.56,
        ),
        MovementJointProfile(
            joint_name="wrist_flex",
            base_angle=16.0,
            amplitude=16.5 * scale,
            phase_delay_radians=0.94,
        ),
        MovementJointProfile(
            joint_name="wrist_roll",
            base_angle=4.0,
            amplitude=20.0 * scale,
            phase_delay_radians=1.22,
        ),
    ]


WAVE_PRESETS = {
    "subtle": MovementPreset(
        preset_id="subtle",
        label="Subtle",
        summary="Soft stage-ready wave with small shoulder travel and restrained wrist flourish.",
        frequency_hz=0.72,
        cycles=3,
        amplitude_scale=0.78,
        softness=0.88,
        asymmetry=0.08,
        joint_profiles=_wave_profiles(0.82),
    ),
    "normal": MovementPreset(
        preset_id="normal",
        label="Normal",
        summary="Balanced dance wave with modest shoulder lead, clear elbow follow, and strong wrist signature.",
        frequency_hz=0.9,
        cycles=4,
        amplitude_scale=1.0,
        softness=0.72,
        asymmetry=0.16,
        joint_profiles=_wave_profiles(1.0),
    ),
    "exaggerated": MovementPreset(
        preset_id="exaggerated",
        label="Exaggerated",
        summary="Larger show wave with more elbow articulation and a more visible wrist finish.",
        frequency_hz=1.0,
        cycles=5,
        amplitude_scale=1.18,
        softness=0.62,
        asymmetry=0.24,
        joint_profiles=_wave_profiles(1.18),
    ),
}


@dataclass(frozen=True)
class WaveRuntimeConfig:
    movement_id: str
    preset_id: str
    frequency_hz: float
    cycles: int
    amplitude_scale: float
    softness: float
    asymmetry: float
    neutral_pose: dict[str, float]
    joint_profiles: tuple[MovementJointProfile, ...]
    debug: bool = False

    @property
    def duration_seconds(self) -> float:
        return self.cycles / self.frequency_hz


class MotionGenerator(Protocol):
    duration_seconds: float

    def sample(self, elapsed: float) -> dict[str, float]: ...


class WaveMotionGenerator:
    def __init__(self, config: WaveRuntimeConfig) -> None:
        self.config = config
        self.duration_seconds = config.duration_seconds

    def sample(self, elapsed: float) -> dict[str, float]:
        t = max(0.0, min(elapsed, self.duration_seconds))
        envelope = self._envelope(t)
        phase = math.tau * self.config.frequency_hz * t
        targets = dict(self.config.neutral_pose)

        for profile in self.config.joint_profiles:
            oscillator = self._waveform(phase - profile.phase_delay_radians)
            command = (
                profile.base_angle
                + profile.bias
                + profile.amplitude * self.config.amplitude_scale * envelope * oscillator
            )
            targets[profile.joint_name] = round(command, 2)

        return targets

    def debug_samples(self, sample_hz: float = 30.0) -> list[dict[str, float]]:
        sample_period = 1.0 / max(sample_hz, 1.0)
        samples: list[dict[str, float]] = []
        elapsed = 0.0
        while elapsed <= self.duration_seconds + 1e-6:
            frame = self.sample(elapsed)
            frame["time"] = round(elapsed, 4)
            samples.append(frame)
            elapsed += sample_period
        return samples

    def _envelope(self, elapsed: float) -> float:
        ramp_ratio = 0.14 + self.config.softness * 0.24
        ramp = max(self.duration_seconds * ramp_ratio, 0.18)
        attack = self._smootherstep(elapsed / ramp)
        release = self._smootherstep((self.duration_seconds - elapsed) / ramp)
        return max(0.0, min(1.0, attack, release))

    def _waveform(self, phase: float) -> float:
        base = math.sin(phase)
        if self.config.asymmetry <= 0.0:
            return base
        return_component = 0.32 * self.config.asymmetry * math.sin(2.0 * phase - math.pi / 2.0)
        mixed = base + return_component
        return mixed / (1.0 + 0.32 * self.config.asymmetry)

    def _smootherstep(self, value: float) -> float:
        x = max(0.0, min(1.0, value))
        return x * x * x * (x * (x * 6.0 - 15.0) + 10.0)


@dataclass(frozen=True)
class MovementSpec:
    definition: MovementDefinition


WAVE_DEFINITION = MovementDefinition(
    movement_id="wave",
    name="Wave",
    summary="A shoulder-to-wrist dance wave driven by one shared oscillator with progressive phase delays.",
    description=(
        "The arm starts from a prepared base pose, then a shared oscillation flows from shoulder pan/lift through the "
        "elbow and finishes in the wrist. Wrist flex and wrist roll carry the clearest visible signature so the motion "
        "reads as a fluid wave instead of a salute."
    ),
    duration_seconds=round(WAVE_PRESETS["normal"].cycles / WAVE_PRESETS["normal"].frequency_hz, 2),
    focus_joints=["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll"],
    recommended_arm=ArmType.FOLLOWER,
    controller="oscillator",
    default_preset_id="normal",
    neutral_pose=WAVE_NEUTRAL_POSE,
    presets=[preset.model_copy(deep=True) for preset in WAVE_PRESETS.values()],
)

MOVEMENT_LIBRARY: dict[str, MovementSpec] = {
    WAVE_DEFINITION.movement_id: MovementSpec(definition=WAVE_DEFINITION),
}


def list_movements() -> list[MovementDefinition]:
    return [spec.definition.model_copy(deep=True) for spec in MOVEMENT_LIBRARY.values()]


def get_movement(movement_id: str) -> MovementSpec | None:
    return MOVEMENT_LIBRARY.get(movement_id)


def build_motion_generator(request: MovementRunRequest) -> MotionGenerator:
    if request.movement_id != WAVE_DEFINITION.movement_id:
        raise ValueError(f"Unknown movement '{request.movement_id}'")
    config = resolve_wave_runtime(request)
    return WaveMotionGenerator(config)


def resolve_wave_runtime(request: MovementRunRequest) -> WaveRuntimeConfig:
    preset_id = request.preset_id or WAVE_DEFINITION.default_preset_id or "normal"
    preset = WAVE_PRESETS.get(preset_id)
    if preset is None:
        raise ValueError(f"Unknown preset '{preset_id}' for movement '{request.movement_id}'")

    return WaveRuntimeConfig(
        movement_id=request.movement_id,
        preset_id=preset.preset_id,
        frequency_hz=request.frequency_hz or preset.frequency_hz,
        cycles=request.cycles or preset.cycles,
        amplitude_scale=request.amplitude_scale or preset.amplitude_scale,
        softness=request.softness if request.softness is not None else preset.softness,
        asymmetry=request.asymmetry if request.asymmetry is not None else preset.asymmetry,
        neutral_pose=dict(WAVE_NEUTRAL_POSE),
        joint_profiles=tuple(profile.model_copy(deep=True) for profile in preset.joint_profiles),
        debug=request.debug,
    )


def sample_motion(request: MovementRunRequest, sample_hz: float = 30.0) -> list[dict[str, float]]:
    generator = build_motion_generator(request)
    if isinstance(generator, WaveMotionGenerator):
        return generator.debug_samples(sample_hz=sample_hz)

    sample_period = 1.0 / max(sample_hz, 1.0)
    samples: list[dict[str, float]] = []
    elapsed = 0.0
    while elapsed <= generator.duration_seconds + 1e-6:
        frame = generator.sample(elapsed)
        frame["time"] = round(elapsed, 4)
        samples.append(frame)
        elapsed += sample_period
    return samples
