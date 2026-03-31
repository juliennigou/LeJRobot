from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Protocol

from .models import (
    ArmType,
    MovementDefinition,
    MovementFollowThroughConfig,
    MovementFollowThroughProfile,
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


def clamp(value: float, lower: float, upper: float) -> float:
    return min(upper, max(lower, value))


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


def _wave_follow_through_profiles() -> list[MovementFollowThroughProfile]:
    return [
        MovementFollowThroughProfile(
            joint_name="elbow_flex",
            source_joint="shoulder_lift",
            gain_ratio=0.55,
            delay_ratio=0.8,
            damping_ratio=1.05,
            settle_ratio=0.7,
        ),
        MovementFollowThroughProfile(
            joint_name="wrist_flex",
            source_joint="elbow_flex",
            gain_ratio=1.0,
            delay_ratio=1.0,
            damping_ratio=0.88,
            settle_ratio=1.0,
        ),
        MovementFollowThroughProfile(
            joint_name="wrist_roll",
            source_joint="wrist_flex",
            gain_ratio=1.12,
            delay_ratio=1.22,
            damping_ratio=0.82,
            settle_ratio=1.18,
        ),
    ]


def _wrist_lean_follow_through_profiles() -> list[MovementFollowThroughProfile]:
    return [
        MovementFollowThroughProfile(
            joint_name="elbow_flex",
            source_joint="shoulder_pan",
            gain_ratio=0.26,
            delay_ratio=0.68,
            damping_ratio=1.0,
            settle_ratio=0.4,
        ),
        MovementFollowThroughProfile(
            joint_name="wrist_roll",
            source_joint="wrist_flex",
            gain_ratio=1.0,
            delay_ratio=0.95,
            damping_ratio=0.84,
            settle_ratio=1.0,
        ),
        MovementFollowThroughProfile(
            joint_name="gripper",
            source_joint="wrist_roll",
            gain_ratio=0.38,
            delay_ratio=1.15,
            damping_ratio=0.72,
            settle_ratio=0.62,
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
        follow_through=MovementFollowThroughConfig(
            enabled=True,
            delay_seconds=0.11,
            gain=0.16,
            damping=0.46,
            settle=0.1,
            profiles=_wave_follow_through_profiles(),
        ),
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
        follow_through=MovementFollowThroughConfig(
            enabled=True,
            delay_seconds=0.12,
            gain=0.22,
            damping=0.4,
            settle=0.14,
            profiles=_wave_follow_through_profiles(),
        ),
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
        follow_through=MovementFollowThroughConfig(
            enabled=True,
            delay_seconds=0.14,
            gain=0.28,
            damping=0.32,
            settle=0.18,
            profiles=_wave_follow_through_profiles(),
        ),
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
        follow_through=MovementFollowThroughConfig(
            enabled=True,
            delay_seconds=0.08,
            gain=0.18,
            damping=0.44,
            settle=0.1,
            profiles=_wrist_lean_follow_through_profiles(),
        ),
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
    follow_through: "FollowThroughRuntimeConfig"
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
class FollowThroughRuntimeProfile:
    joint_name: str
    source_joint: str
    gain_ratio: float
    delay_ratio: float
    damping_ratio: float
    settle_ratio: float


@dataclass(frozen=True)
class FollowThroughRuntimeConfig:
    enabled: bool
    delay_seconds: float
    gain: float
    damping: float
    settle: float
    profiles: tuple[FollowThroughRuntimeProfile, ...]


class FollowThroughMotionGenerator:
    def __init__(
        self,
        base: MotionGenerator,
        *,
        neutral_pose: dict[str, float],
        config: FollowThroughRuntimeConfig,
    ) -> None:
        self.base = base
        self.duration_seconds = base.duration_seconds
        self.neutral_pose = neutral_pose
        self.config = config
        self._history: list[tuple[float, dict[str, float]]] = []
        self._last_output: dict[str, float] = {}

    def sample(self, elapsed: float) -> dict[str, float]:
        clamped_elapsed = max(0.0, min(elapsed, self.duration_seconds))
        base_targets = dict(self.base.sample(clamped_elapsed))
        self._remember_history(clamped_elapsed, base_targets)
        if not self.config.enabled or not self.config.profiles:
            self._last_output = dict(base_targets)
            return base_targets

        output = dict(base_targets)
        for profile in self.config.profiles:
            source_delay = self.config.delay_seconds * profile.delay_ratio
            delayed_source = self._interpolate_joint(profile.source_joint, clamped_elapsed - source_delay)
            previous_source = self._interpolate_joint(profile.source_joint, clamped_elapsed - source_delay - 0.04)
            source_neutral = self.neutral_pose.get(profile.source_joint, delayed_source)
            desired = base_targets.get(profile.joint_name, self.neutral_pose.get(profile.joint_name, 0.0))

            damping = clamp(self.config.damping * profile.damping_ratio, 0.0, 1.0)
            gain = self.config.gain * profile.gain_ratio * (1.0 - 0.45 * damping)
            settle = self.config.settle * profile.settle_ratio * (1.0 - 0.22 * damping)
            source_delta = delayed_source - source_neutral
            source_velocity = (delayed_source - previous_source) / 0.04
            desired += gain * source_delta
            desired += settle * source_velocity

            previous_output = self._last_output.get(profile.joint_name, base_targets.get(profile.joint_name, desired))
            response_alpha = clamp(0.18 + (1.0 - damping) * 0.5, 0.18, 0.7)
            output[profile.joint_name] = round(previous_output + response_alpha * (desired - previous_output), 2)

        self._last_output = dict(output)
        return output

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

    def _remember_history(self, elapsed: float, frame: dict[str, float]) -> None:
        if self._history and elapsed < self._history[-1][0]:
            self._history = []
            self._last_output = {}
        if self._history and abs(self._history[-1][0] - elapsed) < 1e-6:
            self._history[-1] = (elapsed, dict(frame))
        else:
            self._history.append((elapsed, dict(frame)))
        if len(self._history) > 240:
            self._history = self._history[-240:]

    def _interpolate_joint(self, joint_name: str, elapsed: float) -> float:
        if not self._history:
            return self.neutral_pose.get(joint_name, 0.0)
        clamped_time = max(0.0, elapsed)
        earlier = self._history[0]
        later = self._history[-1]
        for index, (frame_time, frame) in enumerate(self._history):
            if frame_time >= clamped_time:
                later = (frame_time, frame)
                if index > 0:
                    earlier = self._history[index - 1]
                else:
                    earlier = later
                break
        earlier_time, earlier_frame = earlier
        later_time, later_frame = later
        earlier_value = earlier_frame.get(joint_name, self.neutral_pose.get(joint_name, 0.0))
        later_value = later_frame.get(joint_name, earlier_value)
        if abs(later_time - earlier_time) < 1e-6:
            return later_value
        ratio = (clamped_time - earlier_time) / (later_time - earlier_time)
        return earlier_value + (later_value - earlier_value) * ratio


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
    base_generator = OscillatorMotionGenerator(config)
    if config.follow_through.enabled and config.follow_through.profiles:
        return FollowThroughMotionGenerator(
            base_generator,
            neutral_pose=dict(config.neutral_pose),
            config=config.follow_through,
        )
    return base_generator


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
        follow_through=FollowThroughRuntimeConfig(
            enabled=(
                request.follow_through_enabled
                if request.follow_through_enabled is not None
                else preset.follow_through.enabled
            ),
            delay_seconds=(
                request.follow_through_delay_seconds
                if request.follow_through_delay_seconds is not None
                else preset.follow_through.delay_seconds
            ),
            gain=request.follow_through_gain if request.follow_through_gain is not None else preset.follow_through.gain,
            damping=(
                request.follow_through_damping
                if request.follow_through_damping is not None
                else preset.follow_through.damping
            ),
            settle=(
                request.follow_through_settle
                if request.follow_through_settle is not None
                else preset.follow_through.settle
            ),
            profiles=tuple(
                FollowThroughRuntimeProfile(
                    joint_name=profile.joint_name,
                    source_joint=profile.source_joint,
                    gain_ratio=profile.gain_ratio,
                    delay_ratio=profile.delay_ratio,
                    damping_ratio=profile.damping_ratio,
                    settle_ratio=profile.settle_ratio,
                )
                for profile in preset.follow_through.profiles
            ),
        ),
        debug=request.debug,
    )


def sample_motion(request: MovementRunRequest, sample_hz: float = 30.0) -> list[dict[str, float]]:
    generator = build_motion_generator(request)
    if isinstance(generator, (OscillatorMotionGenerator, FollowThroughMotionGenerator)):
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
