from __future__ import annotations

import json
import math
from dataclasses import dataclass, asdict
from datetime import UTC, datetime
from pathlib import Path
from time import monotonic, sleep
from typing import Iterable

import numpy as np

from .arms import DEFAULT_JOINT_LAYOUT, DualArmAdapter
from .models import ArmSafetyUpdate, MovementJointProfile, MovementPreset, ServoState

ROOT_DIR = Path(__file__).resolve().parents[2]
MOVEMENT_DATA_DIR = ROOT_DIR / ".data" / "movements"
RECORDINGS_DIR = MOVEMENT_DATA_DIR / "recordings"
FITS_DIR = MOVEMENT_DATA_DIR / "fits"
JOINT_NAMES = [joint_name for _, joint_name in DEFAULT_JOINT_LAYOUT]
FIT_JOINTS = ["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll"]


@dataclass
class RecordingSample:
    time_seconds: float
    angles: dict[str, float]
    target_angles: dict[str, float]
    torque_enabled: dict[str, bool]


@dataclass
class MovementRecording:
    recording_id: str
    label: str
    movement_hint: str
    arm_id: str
    arm_type: str
    created_at: str
    sample_hz: float
    duration_seconds: float
    samples: list[RecordingSample]
    notes: str = ""

    def to_payload(self) -> dict[str, object]:
        return {
            "recording_id": self.recording_id,
            "label": self.label,
            "movement_hint": self.movement_hint,
            "arm_id": self.arm_id,
            "arm_type": self.arm_type,
            "created_at": self.created_at,
            "sample_hz": self.sample_hz,
            "duration_seconds": self.duration_seconds,
            "notes": self.notes,
            "samples": [asdict(sample) for sample in self.samples],
        }

    @classmethod
    def from_payload(cls, payload: dict[str, object]) -> "MovementRecording":
        return cls(
            recording_id=str(payload["recording_id"]),
            label=str(payload["label"]),
            movement_hint=str(payload.get("movement_hint", "wave")),
            arm_id=str(payload["arm_id"]),
            arm_type=str(payload.get("arm_type", "unknown")),
            created_at=str(payload["created_at"]),
            sample_hz=float(payload["sample_hz"]),
            duration_seconds=float(payload["duration_seconds"]),
            notes=str(payload.get("notes", "")),
            samples=[
                RecordingSample(
                    time_seconds=float(item["time_seconds"]),
                    angles={str(key): float(value) for key, value in dict(item["angles"]).items()},
                    target_angles={str(key): float(value) for key, value in dict(item["target_angles"]).items()},
                    torque_enabled={str(key): bool(value) for key, value in dict(item["torque_enabled"]).items()},
                )
                for item in list(payload["samples"])
            ],
        )


@dataclass
class WaveFitSummary:
    recording_ids: list[str]
    label: str
    generated_at: str
    sample_hz: float
    frequency_hz: float
    cycles: int
    duration_seconds: float
    softness: float
    asymmetry: float
    neutral_pose: dict[str, float]
    joint_profiles: list[MovementJointProfile]

    def to_payload(self) -> dict[str, object]:
        return {
            "recording_ids": self.recording_ids,
            "label": self.label,
            "generated_at": self.generated_at,
            "sample_hz": self.sample_hz,
            "frequency_hz": self.frequency_hz,
            "cycles": self.cycles,
            "duration_seconds": self.duration_seconds,
            "softness": self.softness,
            "asymmetry": self.asymmetry,
            "neutral_pose": self.neutral_pose,
            "joint_profiles": [profile.model_dump(mode="json") for profile in self.joint_profiles],
        }

    def to_preset(self, preset_id: str = "recorded-wave", summary: str | None = None) -> MovementPreset:
        return MovementPreset(
            preset_id=preset_id,
            label=self.label,
            summary=summary or "Wave preset fitted from recorded manual demonstrations.",
            frequency_hz=self.frequency_hz,
            cycles=self.cycles,
            amplitude_scale=1.0,
            softness=self.softness,
            asymmetry=self.asymmetry,
            joint_profiles=self.joint_profiles,
        )


def ensure_movement_dirs() -> None:
    RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
    FITS_DIR.mkdir(parents=True, exist_ok=True)


def save_recording(recording: MovementRecording, path: Path | None = None) -> Path:
    ensure_movement_dirs()
    target = path or (RECORDINGS_DIR / f"{recording.recording_id}.json")
    target.write_text(json.dumps(recording.to_payload(), indent=2))
    return target


def load_recording(path: Path) -> MovementRecording:
    return MovementRecording.from_payload(json.loads(path.read_text()))


def save_fit(summary: WaveFitSummary, path: Path | None = None) -> Path:
    ensure_movement_dirs()
    safe_label = slugify(summary.label)
    target = path or (FITS_DIR / f"{safe_label}-{summary.generated_at[:19].replace(':', '-')}.json")
    target.write_text(json.dumps(summary.to_payload(), indent=2))
    return target


def slugify(value: str) -> str:
    normalized = value.strip().lower().replace(" ", "-")
    return "".join(char for char in normalized if char.isalnum() or char in {"-", "_"})


def record_demonstration(
    adapter: DualArmAdapter,
    arm_id: str,
    *,
    label: str,
    movement_hint: str = "wave",
    sample_hz: float = 40.0,
    duration_seconds: float | None = None,
    disable_torque: bool = True,
    notes: str = "",
) -> MovementRecording:
    arm = adapter.arms[arm_id]
    adapter.set_connection(arm_id, True)

    original_torque = arm.safety.torque_enabled
    if disable_torque:
        adapter.update_safety(arm_id, ArmSafetyUpdate(torque_enabled=False))

    sample_period = 1.0 / max(sample_hz, 1.0)
    started_at = datetime.now(UTC)
    started = monotonic()
    next_sample = started
    samples: list[RecordingSample] = []

    try:
        while True:
            elapsed = monotonic() - started
            if duration_seconds is not None and elapsed > duration_seconds:
                break

            servos = adapter.refresh_telemetry(arm_id)
            samples.append(_sample_from_servos(elapsed, servos))

            next_sample += sample_period
            sleep(max(0.0, next_sample - monotonic()))
    except KeyboardInterrupt:
        pass
    finally:
        if disable_torque:
            adapter.update_safety(arm_id, ArmSafetyUpdate(torque_enabled=original_torque))

    ended = monotonic()
    recording_id = f"{started_at.strftime('%Y%m%d-%H%M%S')}-{slugify(label)}"
    return MovementRecording(
        recording_id=recording_id,
        label=label,
        movement_hint=movement_hint,
        arm_id=arm.arm_id,
        arm_type=arm.arm_type.value,
        created_at=started_at.isoformat(),
        sample_hz=sample_hz,
        duration_seconds=round(max(0.0, ended - started), 4),
        samples=samples,
        notes=notes,
    )


def replay_recording(
    adapter: DualArmAdapter,
    recording: MovementRecording,
    *,
    arm_id: str,
    speed_scale: float = 1.0,
) -> None:
    if speed_scale <= 0.0:
        raise ValueError("speed_scale must be > 0")

    adapter.set_connection(arm_id, True)
    adapter.update_safety(
        arm_id,
        ArmSafetyUpdate(
            dry_run=False,
            emergency_stop=False,
            torque_enabled=True,
        ),
    )
    arm = adapter.arms[arm_id]
    adapter._assert_arm_ready_for_motion(arm)

    if not recording.samples:
        return

    started = monotonic()
    base_time = recording.samples[0].time_seconds
    for sample in recording.samples:
        target_elapsed = (sample.time_seconds - base_time) / speed_scale
        sleep(max(0.0, started + target_elapsed - monotonic()))
        targets = {joint_name: sample.angles[joint_name] for joint_name in JOINT_NAMES if joint_name in sample.angles}
        adapter.execute_live_targets(arm_id, targets, reason=f"Replay {recording.label}")


def trim_recording(recording: MovementRecording, velocity_threshold_deg_s: float = 6.0) -> MovementRecording:
    if len(recording.samples) < 3:
        return recording

    times = np.asarray([sample.time_seconds for sample in recording.samples], dtype=float)
    motion_signal = np.zeros(len(recording.samples), dtype=float)
    for joint_name in FIT_JOINTS:
        values = np.asarray([sample.angles.get(joint_name, 0.0) for sample in recording.samples], dtype=float)
        velocities = np.gradient(values, times, edge_order=1)
        motion_signal += np.abs(velocities)

    active = np.where(motion_signal >= velocity_threshold_deg_s)[0]
    if active.size == 0:
        return recording

    margin = max(1, int(round(recording.sample_hz * 0.15)))
    start_index = max(0, int(active[0]) - margin)
    end_index = min(len(recording.samples), int(active[-1]) + margin + 1)
    subset = recording.samples[start_index:end_index]
    origin = subset[0].time_seconds
    trimmed_samples = [
        RecordingSample(
            time_seconds=round(sample.time_seconds - origin, 4),
            angles=dict(sample.angles),
            target_angles=dict(sample.target_angles),
            torque_enabled=dict(sample.torque_enabled),
        )
        for sample in subset
    ]
    return MovementRecording(
        recording_id=recording.recording_id,
        label=recording.label,
        movement_hint=recording.movement_hint,
        arm_id=recording.arm_id,
        arm_type=recording.arm_type,
        created_at=recording.created_at,
        sample_hz=recording.sample_hz,
        duration_seconds=round(trimmed_samples[-1].time_seconds, 4),
        samples=trimmed_samples,
        notes=recording.notes,
    )


def fit_wave_from_recordings(recordings: Iterable[MovementRecording], label: str = "Recorded Wave") -> WaveFitSummary:
    prepared = [trim_recording(recording) for recording in recordings if recording.samples]
    if not prepared:
        raise ValueError("At least one non-empty recording is required")

    sample_hz = float(np.mean([recording.sample_hz for recording in prepared]))
    frequency_hz = float(np.mean([_estimate_frequency(recording) for recording in prepared]))
    duration_seconds = float(np.mean([recording.duration_seconds for recording in prepared]))
    cycles = max(1, int(round(duration_seconds * frequency_hz)))

    joint_profiles: list[MovementJointProfile] = []
    neutral_pose: dict[str, float] = {}

    reference_phase = None
    fitted_by_joint: dict[str, tuple[float, float, float]] = {}
    for joint_name in FIT_JOINTS:
        base_angles: list[float] = []
        amplitudes: list[float] = []
        phases: list[float] = []

        for recording in prepared:
            times = np.asarray([sample.time_seconds for sample in recording.samples], dtype=float)
            values = np.asarray([sample.angles.get(joint_name, 0.0) for sample in recording.samples], dtype=float)
            base, amplitude, phase = _fit_joint_sinusoid(times, values, frequency_hz)
            base_angles.append(base)
            amplitudes.append(amplitude)
            phases.append(phase)

        base_angle = float(np.mean(base_angles))
        amplitude = float(np.mean(amplitudes))
        phase = _circular_mean(phases)
        fitted_by_joint[joint_name] = (base_angle, amplitude, phase)
        neutral_pose[joint_name] = round(base_angle, 2)
        if joint_name == "shoulder_pan":
            reference_phase = phase

    if reference_phase is None:
        reference_phase = 0.0

    for joint_name in FIT_JOINTS:
        base_angle, amplitude, phase = fitted_by_joint[joint_name]
        phase_delay = (phase - reference_phase) % (math.tau)
        if phase_delay > math.pi:
            phase_delay -= math.tau
        if phase_delay < 0:
            phase_delay += math.tau
        joint_profiles.append(
            MovementJointProfile(
                joint_name=joint_name,
                base_angle=round(base_angle, 2),
                amplitude=round(amplitude, 2),
                phase_delay_radians=round(phase_delay, 3),
                bias=0.0,
            )
        )

    softness = 0.72
    asymmetry = _estimate_asymmetry(prepared)
    return WaveFitSummary(
        recording_ids=[recording.recording_id for recording in prepared],
        label=label,
        generated_at=datetime.now(UTC).isoformat(),
        sample_hz=round(sample_hz, 2),
        frequency_hz=round(frequency_hz, 3),
        cycles=cycles,
        duration_seconds=round(duration_seconds, 3),
        softness=softness,
        asymmetry=round(asymmetry, 3),
        neutral_pose=neutral_pose,
        joint_profiles=joint_profiles,
    )


def _sample_from_servos(elapsed: float, servos: list[ServoState]) -> RecordingSample:
    return RecordingSample(
        time_seconds=round(elapsed, 4),
        angles={servo.name: float(servo.angle) for servo in servos},
        target_angles={servo.name: float(servo.target_angle) for servo in servos},
        torque_enabled={servo.name: bool(servo.torque_enabled) for servo in servos},
    )


def _estimate_frequency(recording: MovementRecording) -> float:
    if len(recording.samples) < 5:
        return 0.8

    times = np.asarray([sample.time_seconds for sample in recording.samples], dtype=float)
    wrist = np.asarray([sample.angles.get("wrist_roll", 0.0) for sample in recording.samples], dtype=float)
    wrist = wrist - np.mean(wrist)
    dt = float(np.median(np.diff(times)))
    if dt <= 0.0:
        return 0.8

    freqs = np.fft.rfftfreq(len(wrist), d=dt)
    spectrum = np.abs(np.fft.rfft(wrist))
    valid = (freqs >= 0.2) & (freqs <= 3.5)
    if not np.any(valid):
        return 0.8
    peak_index = int(np.argmax(spectrum[valid]))
    return float(freqs[valid][peak_index])


def _fit_joint_sinusoid(times: np.ndarray, values: np.ndarray, frequency_hz: float) -> tuple[float, float, float]:
    omega = math.tau * max(frequency_hz, 1e-3)
    design = np.column_stack(
        [
            np.ones_like(times),
            np.sin(omega * times),
            np.cos(omega * times),
        ]
    )
    coefficients, *_ = np.linalg.lstsq(design, values, rcond=None)
    base, sin_coeff, cos_coeff = coefficients
    amplitude = float(math.hypot(sin_coeff, cos_coeff))
    phase = float(math.atan2(-cos_coeff, sin_coeff) % math.tau)
    return float(base), amplitude, phase


def _estimate_asymmetry(recordings: list[MovementRecording]) -> float:
    asymmetries: list[float] = []
    for recording in recordings:
        wrist = np.asarray([sample.angles.get("wrist_roll", 0.0) for sample in recording.samples], dtype=float)
        if wrist.size < 4:
            continue
        centered = wrist - np.mean(wrist)
        positive = np.mean(np.clip(centered, 0.0, None))
        negative = np.mean(np.clip(-centered, 0.0, None))
        total = positive + negative
        if total > 1e-6:
            asymmetries.append(abs(positive - negative) / total)
    if not asymmetries:
        return 0.0
    return float(min(1.0, np.mean(asymmetries)))


def _circular_mean(phases: list[float]) -> float:
    if not phases:
        return 0.0
    sin_mean = float(np.mean(np.sin(phases)))
    cos_mean = float(np.mean(np.cos(phases)))
    return float(math.atan2(sin_mean, cos_mean) % math.tau)
