from __future__ import annotations

from dataclasses import dataclass, field

from .models import (
    ArmAdapterState,
    ArmChannel,
    ArmJointConfig,
    ArmJointOverride,
    ArmPreviewState,
    ArmSafetyEnvelope,
    ArmSafetyUpdate,
    ArmType,
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
    joints: list[ArmJointConfig] = field(default_factory=list)


class DualArmAdapter:
    def __init__(self, config: RobotConfig) -> None:
        self.execution_mode = ExecutionMode.MIRROR
        self.neutral_pose_scene = SceneName.IDLE
        self.required_dry_run = True
        self.arms: dict[str, ArmRuntime] = {}

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
            connected=available,
            calibrated=available,
            notes=self._default_note(arm_type),
            safety=self._default_safety(arm_type),
            joints=self._default_joints(arm_type),
        )

    def _default_note(self, arm_type: ArmType) -> str:
        if arm_type == ArmType.LEADER:
            return "Leader profile starts in conservative dry-run mode and should be recalibrated before motor writes."
        return "Follower profile is staged for choreography playback but remains dry-run only."

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
        arm.connected = connected
        if not connected:
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
