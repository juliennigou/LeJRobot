from __future__ import annotations

import importlib.util
import json
import os
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

try:
    import serial
    from serial import SerialException
except ImportError:  # pragma: no cover - handled in verification status
    serial = None

    class SerialException(Exception):
        pass

from .models import (
    ArmAdapterState,
    ArmChannel,
    ArmJointConfig,
    ArmJointOverride,
    ArmPreviewState,
    ArmSafetyEnvelope,
    ArmSafetyUpdate,
    ArmType,
    ArmVerificationState,
    ArmVerificationStatus,
    ChoreographyTimeline,
    DualArmExecutionState,
    DualArmState,
    ExecutionMode,
    MotionCue,
    RobotConfig,
    SceneName,
)

DEFAULT_JOINT_LAYOUT = [
    (1, "shoulder_pan"),
    (2, "shoulder_lift"),
    (3, "elbow_flex"),
    (4, "wrist_flex"),
    (5, "wrist_roll"),
    (6, "gripper"),
]

ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_EXPECTED_JOINT_COUNT = len(DEFAULT_JOINT_LAYOUT)


@dataclass
class ArmRuntime:
    arm_id: str
    arm_type: ArmType
    channel: ArmChannel
    port: str | None
    connected: bool
    calibrated: bool
    notes: str
    safety: ArmSafetyEnvelope
    verification: ArmVerificationState
    joints: list[ArmJointConfig] = field(default_factory=list)


class LeRobotArmVerifier:
    def verify(self, arm: ArmRuntime) -> ArmVerificationState:
        dependency_available = importlib.util.find_spec("lerobot") is not None
        port_present = bool(arm.port and Path(arm.port).exists())
        calibration_path, detected_joint_count = self._find_calibration(arm.arm_id)
        calibration_found = calibration_path is not None

        base = ArmVerificationState(
            driver="lerobot",
            dependency_available=dependency_available,
            port_present=port_present,
            calibration_found=calibration_found,
            calibration_path=str(calibration_path) if calibration_path else None,
            expected_joint_count=DEFAULT_EXPECTED_JOINT_COUNT,
            detected_joint_count=detected_joint_count,
            last_checked_at=datetime.now(UTC).isoformat(),
        )

        if not dependency_available:
            return base.model_copy(
                update={
                    "status": ArmVerificationStatus.MISSING_DEPENDENCY,
                    "message": "The 'lerobot' package is not installed in the backend environment.",
                }
            )

        if serial is None:
            return base.model_copy(
                update={
                    "status": ArmVerificationStatus.MISSING_DEPENDENCY,
                    "message": "The 'pyserial' package is not installed in the backend environment.",
                }
            )

        if not arm.port:
            return base.model_copy(
                update={
                    "status": ArmVerificationStatus.MISSING_PORT,
                    "message": f"Arm '{arm.arm_id}' has no configured serial port.",
                }
            )

        if not port_present:
            return base.model_copy(
                update={
                    "status": ArmVerificationStatus.UNREACHABLE,
                    "message": f"Configured serial port '{arm.port}' does not exist.",
                }
            )

        try:
            with serial.Serial(arm.port, timeout=0.25):
                pass
        except (OSError, SerialException) as exc:
            return base.model_copy(
                update={
                    "status": ArmVerificationStatus.UNREACHABLE,
                    "message": f"Unable to open serial port '{arm.port}': {exc}",
                }
            )

        if not calibration_found:
            return base.model_copy(
                update={
                    "status": ArmVerificationStatus.MISSING_CALIBRATION,
                    "message": f"No calibration file was found for arm '{arm.arm_id}'.",
                }
            )

        if detected_joint_count < DEFAULT_EXPECTED_JOINT_COUNT:
            return base.model_copy(
                update={
                    "status": ArmVerificationStatus.ERROR,
                    "message": (
                        f"Calibration for arm '{arm.arm_id}' only covers "
                        f"{detected_joint_count}/{DEFAULT_EXPECTED_JOINT_COUNT} joints."
                    ),
                }
            )

        return base.model_copy(
            update={
                "status": ArmVerificationStatus.READY,
                "message": (
                    f"Serial port '{arm.port}' opened successfully and calibration covers "
                    f"{detected_joint_count} joints."
                ),
            }
        )

    def _find_calibration(self, arm_id: str) -> tuple[Path | None, int]:
        candidates = self._calibration_roots()
        seen: set[Path] = set()
        for root in candidates:
            if root in seen or not root.exists():
                continue
            seen.add(root)
            direct = self._calibration_candidate_paths(root, arm_id)
            for candidate in direct:
                if candidate.exists():
                    return candidate, self._count_calibrated_joints(candidate)

            for candidate in root.rglob(f"{arm_id}.json"):
                if candidate.is_file():
                    return candidate, self._count_calibrated_joints(candidate)

        return None, 0

    def _calibration_roots(self) -> list[Path]:
        roots: list[Path] = []
        env_calibration = os.getenv("LEROBOT_CALIBRATION_DIR")
        if env_calibration:
            roots.append(Path(env_calibration).expanduser())

        lerobot_home = os.getenv("LEROBOT_HOME")
        if lerobot_home:
            roots.append(Path(lerobot_home).expanduser() / "calibration")

        hf_home = os.getenv("HF_HOME")
        if hf_home:
            roots.append(Path(hf_home).expanduser() / "lerobot" / "calibration")

        roots.append(Path.home() / ".cache" / "huggingface" / "lerobot" / "calibration")
        roots.append(ROOT_DIR / ".data" / "calibration")
        return roots

    def _calibration_candidate_paths(self, root: Path, arm_id: str) -> list[Path]:
        return [
            root / f"{arm_id}.json",
            root / "robots" / f"{arm_id}.json",
            root / "teleoperators" / f"{arm_id}.json",
            root / "so101_follower" / f"{arm_id}.json",
            root / "so101_leader" / f"{arm_id}.json",
        ]

    def _count_calibrated_joints(self, path: Path) -> int:
        try:
            payload = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            return 0

        counts: list[int] = []
        self._collect_joint_counts(payload, counts)
        return max(counts, default=0)

    def _collect_joint_counts(self, payload: object, counts: list[int]) -> None:
        if isinstance(payload, dict):
            joint_key_count = len(set(payload.keys()) & {name for _, name in DEFAULT_JOINT_LAYOUT})
            if joint_key_count:
                counts.append(joint_key_count)

            for key in ("motors", "joints", "servos", "motors_calibration"):
                value = payload.get(key)
                if isinstance(value, dict):
                    counts.append(len(value))
                elif isinstance(value, list):
                    counts.append(len(value))

            for value in payload.values():
                self._collect_joint_counts(value, counts)
            return

        if isinstance(payload, list):
            if payload and all(isinstance(item, dict) for item in payload):
                names = {str(item.get("name") or item.get("joint_name") or "") for item in payload}
                matched_names = len(names & {name for _, name in DEFAULT_JOINT_LAYOUT})
                if matched_names:
                    counts.append(matched_names)
                elif all(("id" in item or "servo_id" in item) for item in payload):
                    counts.append(len(payload))
            for item in payload:
                self._collect_joint_counts(item, counts)


class DualArmAdapter:
    def __init__(self, config: RobotConfig, verifier: LeRobotArmVerifier | None = None) -> None:
        self.execution_mode = ExecutionMode.MIRROR
        self.neutral_pose_scene = SceneName.IDLE
        self.required_dry_run = True
        self.arms: dict[str, ArmRuntime] = {}
        self.verifier = verifier or LeRobotArmVerifier()

        self._register_arm(
            arm_id=config.leader_id or "leader_arm",
            arm_type=ArmType.LEADER,
            channel=ArmChannel.LEFT,
            port=config.leader_port,
        )
        self._register_arm(
            arm_id=config.follower_id,
            arm_type=ArmType.FOLLOWER,
            channel=ArmChannel.RIGHT,
            port=config.follower_port,
        )

    def _register_arm(self, arm_id: str, arm_type: ArmType, channel: ArmChannel, port: str | None) -> None:
        available = bool(port)
        self.arms[arm_id] = ArmRuntime(
            arm_id=arm_id,
            arm_type=arm_type,
            channel=channel,
            port=port,
            connected=False,
            calibrated=False,
            notes=self._default_note(arm_type),
            safety=self._default_safety(arm_type),
            verification=ArmVerificationState(expected_joint_count=DEFAULT_EXPECTED_JOINT_COUNT),
            joints=self._default_joints(arm_type),
        )
        self.verify_arm(arm_id)

    def _default_note(self, arm_type: ArmType) -> str:
        if arm_type == ArmType.LEADER:
            return "Leader profile starts in conservative dry-run mode and requires live verification before motor writes."
        return "Follower profile is staged for choreography playback and requires live verification before motor writes."

    def _default_safety(self, arm_type: ArmType) -> ArmSafetyEnvelope:
        if arm_type == ArmType.LEADER:
            return ArmSafetyEnvelope(dry_run=True, amplitude_scale=0.82, speed_scale=0.85, max_step_degrees=10.0)
        return ArmSafetyEnvelope(dry_run=True, amplitude_scale=1.0, speed_scale=1.0, max_step_degrees=12.0)

    def _default_joints(self, arm_type: ArmType) -> list[ArmJointConfig]:
        joints: list[ArmJointConfig] = []
        for servo_id, name in DEFAULT_JOINT_LAYOUT:
            inverted = arm_type == ArmType.LEADER and name in {"wrist_roll", "gripper"}
            offset = 4.0 if arm_type == ArmType.LEADER and name == "shoulder_pan" else 0.0
            max_speed = 0.85 if arm_type == ArmType.LEADER and name in {"wrist_roll", "gripper"} else 1.0
            joints.append(
                ArmJointConfig(
                    joint_name=name,
                    servo_id=servo_id,
                    inverted=inverted,
                    offset_degrees=offset,
                    min_angle=-115.0 if arm_type == ArmType.LEADER else -120.0,
                    max_angle=115.0 if arm_type == ArmType.LEADER else 120.0,
                    max_speed=max_speed,
                )
            )
        return joints

    def any_connected(self) -> bool:
        return any(arm.connected for arm in self.arms.values())

    def emergency_stop_active(self) -> bool:
        return any(arm.safety.emergency_stop for arm in self.arms.values())

    def set_execution_mode(self, mode: ExecutionMode) -> None:
        self.execution_mode = mode

    def set_connection(self, arm_id: str, connected: bool) -> None:
        arm = self._arm(arm_id)
        if connected and not arm.port:
            raise ValueError(f"Arm '{arm_id}' has no configured port")
        if connected:
            verification = self.verify_arm(arm_id)
            arm.connected = verification.status == ArmVerificationStatus.READY
        else:
            arm.connected = False
            arm.safety.torque_enabled = False

    def update_safety(self, arm_id: str, payload: ArmSafetyUpdate) -> None:
        arm = self._arm(arm_id)

        for field_name in (
            "dry_run",
            "emergency_stop",
            "neutral_on_stop",
            "torque_enabled",
            "amplitude_scale",
            "speed_scale",
            "max_step_degrees",
        ):
            value = getattr(payload, field_name)
            if value is not None:
                setattr(arm.safety, field_name, value)

        for override in payload.joint_overrides:
            self._apply_joint_override(arm, override)

        if arm.safety.emergency_stop:
            arm.safety.torque_enabled = False

    def emergency_stop(self) -> None:
        for arm in self.arms.values():
            arm.safety.emergency_stop = True
            arm.safety.torque_enabled = False

    def neutralize(self) -> None:
        self.neutral_pose_scene = SceneName.IDLE

    def verify_all(self) -> None:
        for arm_id in self.arms:
            self.verify_arm(arm_id)

    def verify_arm(self, arm_id: str) -> ArmVerificationState:
        arm = self._arm(arm_id)
        verification = self.verifier.verify(arm)
        arm.verification = verification
        arm.calibrated = verification.calibration_found and (
            verification.detected_joint_count >= verification.expected_joint_count
        )
        arm.connected = verification.status == ArmVerificationStatus.READY
        if verification.message:
            arm.notes = verification.message
        return verification

    def snapshot(self, choreography: ChoreographyTimeline | None, position_seconds: float) -> DualArmState:
        choreography_ready = choreography is not None
        arms: list[ArmAdapterState] = []
        for arm in self.arms.values():
            channel_cues = self._channel_cues(choreography, arm.channel)
            arms.append(
                ArmAdapterState(
                    arm_id=arm.arm_id,
                    arm_type=arm.arm_type,
                    channel=arm.channel,
                    port=arm.port,
                    available=bool(arm.port),
                    connected=arm.connected,
                    calibrated=arm.calibrated,
                    safety=arm.safety.model_copy(deep=True),
                    joints=[joint.model_copy(deep=True) for joint in arm.joints],
                    verification=arm.verification.model_copy(deep=True),
                    preview=self._preview(channel_cues, arm.channel, position_seconds),
                    notes=arm.notes,
                )
            )

        return DualArmState(
            arms=arms,
            execution=DualArmExecutionState(
                mode=self.execution_mode,
                choreography_ready=choreography_ready,
                dry_run_required=self.required_dry_run,
                emergency_stop_active=self.emergency_stop_active(),
                neutral_pose_scene=self.neutral_pose_scene,
            ),
        )

    def _channel_cues(self, choreography: ChoreographyTimeline | None, channel: ArmChannel) -> list[MotionCue]:
        if choreography is None:
            return []
        if channel == ArmChannel.LEFT:
            return choreography.arm_left_cues
        return choreography.arm_right_cues

    def _preview(self, cues: list[MotionCue], channel: ArmChannel, position_seconds: float) -> ArmPreviewState:
        current = self._current_cue(cues, position_seconds)
        upcoming = next((cue for cue in cues if cue.time >= position_seconds), None)
        return ArmPreviewState(
            channel=channel,
            current_pose_family=current.pose_family if current else None,
            current_cue_kind=current.kind if current else None,
            symmetry_role=current.symmetry_role if current else None,
            next_cue_time=round(upcoming.time, 3) if upcoming else None,
            note=current.notes if current else "Waiting on choreography cues",
        )

    def _current_cue(self, cues: list[MotionCue], position_seconds: float) -> MotionCue | None:
        active: MotionCue | None = None
        for cue in cues:
            if cue.time <= position_seconds:
                active = cue
            else:
                break
        return active

    def _apply_joint_override(self, arm: ArmRuntime, override: ArmJointOverride) -> None:
        joint = next((item for item in arm.joints if item.joint_name == override.joint_name), None)
        if joint is None:
            raise ValueError(f"Unknown joint '{override.joint_name}' for arm '{arm.arm_id}'")

        if override.inverted is not None:
            joint.inverted = override.inverted
        if override.offset_degrees is not None:
            joint.offset_degrees = override.offset_degrees
        if override.min_angle is not None:
            joint.min_angle = override.min_angle
        if override.max_angle is not None:
            joint.max_angle = override.max_angle
        if override.max_speed is not None:
            joint.max_speed = override.max_speed

    def _arm(self, arm_id: str) -> ArmRuntime:
        arm = self.arms.get(arm_id)
        if arm is None:
            raise ValueError(f"Unknown arm id: {arm_id}")
        return arm
