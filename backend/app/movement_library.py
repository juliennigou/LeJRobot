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
    "shoulder_pan": 3.06,
    "shoulder_lift": 12.65,
    "elbow_flex": -25.38,
    "wrist_flex": 27.72,
    "wrist_roll": 7.99,
    "gripper": 8.0,
}

WRIST_LEAN_NEUTRAL_POSE = {
    "shoulder_pan": 8.0,
    "shoulder_lift": 10.0,
    "elbow_flex": -24.0,
    "wrist_flex": 36.0,
    "wrist_roll": 0.0,
    "gripper": 8.0,
}


def _wave_profiles(scale: float) -> list[MovementJointProfile]:
    return [
        MovementJointProfile(joint_name="shoulder_pan", base_angle=3.06, amplitude=0.99 * scale, phase_delay_radians=0.0),
        MovementJointProfile(
            joint_name="shoulder_lift",
            base_angle=12.65,
            amplitude=5.85 * scale,
            phase_delay_radians=0.28,
        ),
        MovementJointProfile(
            joint_name="elbow_flex",
            base_angle=-25.38,
            amplitude=4.02 * scale,
            phase_delay_radians=0.64,
        ),
        MovementJointProfile(
            joint_name="wrist_flex",
            base_angle=27.72,
            amplitude=4.67 * scale,
            phase_delay_radians=1.02,
        ),
        MovementJointProfile(
            joint_name="wrist_roll",
            base_angle=7.99,
            amplitude=1.81 * scale,
            phase_delay_radians=1.46,
        ),
    ]


def _wrist_lean_profiles(scale: float) -> list[MovementJointProfile]:
    return [
        MovementJointProfile(joint_name="shoulder_pan", base_angle=8.0, amplitude=8.0 * scale, phase_delay_radians=0.0),
        MovementJointProfile(
            joint_name="shoulder_lift",
            base_angle=10.0,
            amplitude=2.5 * scale,
            phase_delay_radians=0.18,
        ),
        MovementJointProfile(
            joint_name="elbow_flex",
            base_angle=-24.0,
            amplitude=3.0 * scale,
            phase_delay_radians=0.34,
        ),
        MovementJointProfile(
            joint_name="wrist_flex",
            base_angle=36.0,
            amplitude=14.0 * scale,
            phase_delay_radians=0.58,
        ),
        MovementJointProfile(
            joint_name="wrist_roll",
            base_angle=0.0,
            amplitude=18.0 * scale,
            phase_delay_radians=0.92,
        ),
        MovementJointProfile(
            joint_name="gripper",
            base_angle=8.0,
            amplitude=4.0 * scale,
            phase_delay_radians=1.12,
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
        summary="Wave preset fitted from the latest recorded take, regularized into a clean shoulder-to-wrist phase chain.",
        frequency_hz=0.252,
        cycles=2,
        amplitude_scale=1.0,
        softness=0.72,
        asymmetry=0.0,
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

WRIST_LEAN_PRESETS = {
    "normal": MovementPreset(
        preset_id="normal",
        label="Normal",
        summary="Simple wrist-led lean: wrist flex lifts upward, shoulder pan presents the arm, and the hand rotates for a clear finish.",
        frequency_hz=0.8,
        cycles=2,
        amplitude_scale=1.0,
        softness=0.76,
        asymmetry=0.0,
        joint_profiles=_wrist_lean_profiles(1.0),
    ),
}


@dataclass(frozen=True)
class OscillatorRuntimeConfig:
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


class OscillatorMotionGenerator:
    def __init__(self, config: OscillatorRuntimeConfig) -> None:
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

WRIST_LEAN_DEFINITION = MovementDefinition(
    movement_id="wrist_lean",
    name="Wrist Lean",
    summary="A simple wrist-led movement: lean the wrist upward, pan the shoulder, and rotate the hand.",
    description=(
        "A deliberately simple library motion. Wrist flex creates the upward lean, shoulder pan presents the arm, "
        "and wrist roll rotates the end-effector for a readable twist. The gripper adds a light accent."
    ),
    duration_seconds=round(WRIST_LEAN_PRESETS["normal"].cycles / WRIST_LEAN_PRESETS["normal"].frequency_hz, 2),
    focus_joints=["shoulder_pan", "wrist_flex", "wrist_roll", "gripper"],
    recommended_arm=ArmType.FOLLOWER,
    controller="oscillator",
    default_preset_id="normal",
    neutral_pose=WRIST_LEAN_NEUTRAL_POSE,
    presets=[preset.model_copy(deep=True) for preset in WRIST_LEAN_PRESETS.values()],
)

MOVEMENT_LIBRARY: dict[str, MovementSpec] = {
    WAVE_DEFINITION.movement_id: MovementSpec(definition=WAVE_DEFINITION),
    WRIST_LEAN_DEFINITION.movement_id: MovementSpec(definition=WRIST_LEAN_DEFINITION),
}


def list_movements() -> list[MovementDefinition]:
    return [spec.definition.model_copy(deep=True) for spec in MOVEMENT_LIBRARY.values()]


def get_movement(movement_id: str) -> MovementSpec | None:
    return MOVEMENT_LIBRARY.get(movement_id)


def build_motion_generator(request: MovementRunRequest) -> MotionGenerator:
    config = resolve_oscillator_runtime(request)
    return OscillatorMotionGenerator(config)


def resolve_oscillator_runtime(request: MovementRunRequest) -> OscillatorRuntimeConfig:
    spec = get_movement(request.movement_id)
    if spec is None:
        raise ValueError(f"Unknown movement '{request.movement_id}'")

    definition = spec.definition
    preset_lookup = {preset.preset_id: preset for preset in definition.presets}
    preset_id = request.preset_id if request.preset_id in preset_lookup else definition.default_preset_id or "normal"
    preset = preset_lookup.get(preset_id)
    if preset is None:
        raise ValueError(f"Unknown preset '{preset_id}' for movement '{request.movement_id}'")

    return OscillatorRuntimeConfig(
        movement_id=request.movement_id,
        preset_id=preset.preset_id,
        frequency_hz=request.frequency_hz or preset.frequency_hz,
        cycles=request.cycles or preset.cycles,
        amplitude_scale=request.amplitude_scale or preset.amplitude_scale,
        softness=request.softness if request.softness is not None else preset.softness,
        asymmetry=request.asymmetry if request.asymmetry is not None else preset.asymmetry,
        neutral_pose=dict(definition.neutral_pose),
        joint_profiles=tuple(profile.model_copy(deep=True) for profile in preset.joint_profiles),
        debug=request.debug,
    )


def sample_motion(request: MovementRunRequest, sample_hz: float = 30.0) -> list[dict[str, float]]:
    generator = build_motion_generator(request)
    if isinstance(generator, OscillatorMotionGenerator):
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
