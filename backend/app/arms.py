from __future__ import annotations

import importlib.util
import json
import os
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from time import monotonic, sleep
from threading import Event, RLock, Thread
from typing import Any, Protocol

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
    MovementDefinition,
    MovementLibraryState,
    MovementRunState,
    MovementStatus,
    MotionCue,
    RobotConfig,
    SceneName,
    ServoState,
)
from .movement_library import get_movement, interpolate_targets, list_movements

DEFAULT_JOINT_LAYOUT = [
    (1, "shoulder_pan"),
    (2, "shoulder_lift"),
    (3, "elbow_flex"),
    (4, "wrist_flex"),
    (5, "wrist_roll"),
    (6, "gripper"),
]

NEUTRAL_JOINT_TARGETS = {
    "shoulder_pan": 0.0,
    "shoulder_lift": -12.0,
    "elbow_flex": 18.0,
    "wrist_flex": 0.0,
    "wrist_roll": 0.0,
    "gripper": 8.0,
}

ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_EXPECTED_JOINT_COUNT = len(DEFAULT_JOINT_LAYOUT)
HEARTBEAT_TIMEOUT_SECONDS = 1.5
NEUTRAL_TOLERANCE_DEGREES = 2.0
MAX_NEUTRAL_COMMAND_STEPS = 18
MOVEMENT_LOOP_INTERVAL_SECONDS = 0.06


@dataclass
class ArmTelemetryRuntime:
    live: bool = False
    updated_at: str | None = None
    error: str | None = None
    servos: list[ServoState] = field(default_factory=list)


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
    telemetry: ArmTelemetryRuntime = field(default_factory=ArmTelemetryRuntime)
    joints: list[ArmJointConfig] = field(default_factory=list)
    last_command_at: str | None = None
    last_command_error: str | None = None


def clamp(value: float, lower: float, upper: float) -> float:
    return min(upper, max(lower, value))


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
            root / "so_follower" / f"{arm_id}.json",
            root / "so_leader" / f"{arm_id}.json",
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


class ArmHardwareBridge(Protocol):
    def connect(self, arm: ArmRuntime) -> None: ...

    def disconnect(self, arm: ArmRuntime) -> None: ...

    def is_connected(self, arm: ArmRuntime) -> bool: ...

    def read_telemetry(self, arm: ArmRuntime) -> list[ServoState]: ...

    def set_torque_enabled(self, arm: ArmRuntime, enabled: bool) -> None: ...

    def write_joint_targets(self, arm: ArmRuntime, targets: dict[str, float]) -> None: ...


@dataclass
class LeRobotBusSession:
    owner: Any
    bus: Any


class LeRobotHardwareBridge:
    def __init__(self) -> None:
        self.sessions: dict[str, LeRobotBusSession] = {}

    def connect(self, arm: ArmRuntime) -> None:
        if arm.arm_id in self.sessions:
            return
        session = self._build_session(arm)
        self.sessions[arm.arm_id] = session

    def disconnect(self, arm: ArmRuntime) -> None:
        session = self.sessions.pop(arm.arm_id, None)
        if session is None:
            return
        if session.bus.is_connected:
            session.bus.disconnect(disable_torque=False)

    def is_connected(self, arm: ArmRuntime) -> bool:
        session = self.sessions.get(arm.arm_id)
        return bool(session and session.bus.is_connected)

    def read_telemetry(self, arm: ArmRuntime) -> list[ServoState]:
        session = self.sessions.get(arm.arm_id)
        if session is None:
            raise RuntimeError(f"Arm '{arm.arm_id}' is not connected for telemetry")

        bus = session.bus
        positions = bus.sync_read("Present_Position")
        goals = bus.sync_read("Goal_Position")
        loads = bus.sync_read("Present_Load")
        temperatures = bus.sync_read("Present_Temperature")
        moving = bus.sync_read("Moving")
        torque = bus.sync_read("Torque_Enable")

        return [
            ServoState(
                id=servo_id,
                name=joint_name,
                angle=round(float(positions.get(joint_name, 0.0)), 2),
                target_angle=round(float(goals.get(joint_name, positions.get(joint_name, 0.0))), 2),
                torque_enabled=bool(torque.get(joint_name, 0)),
                temperature_c=round(float(temperatures.get(joint_name, 0.0)), 1),
                load_pct=round(self._normalize_load(loads.get(joint_name, 0.0)), 1),
                motion_phase="ramping" if bool(moving.get(joint_name, 0)) else "steady",
            )
            for servo_id, joint_name in DEFAULT_JOINT_LAYOUT
        ]

    def set_torque_enabled(self, arm: ArmRuntime, enabled: bool) -> None:
        session = self.sessions.get(arm.arm_id)
        if session is None:
            raise RuntimeError(f"Arm '{arm.arm_id}' is not connected for safety control")

        session.bus.sync_write(
            "Torque_Enable",
            {joint_name: 1 if enabled else 0 for _, joint_name in DEFAULT_JOINT_LAYOUT},
            normalize=False,
        )

    def write_joint_targets(self, arm: ArmRuntime, targets: dict[str, float]) -> None:
        session = self.sessions.get(arm.arm_id)
        if session is None:
            raise RuntimeError(f"Arm '{arm.arm_id}' is not connected for command writes")

        session.bus.sync_write("Goal_Position", targets, normalize=True)

    def _build_session(self, arm: ArmRuntime) -> LeRobotBusSession:
        if not arm.port:
            raise RuntimeError(f"Arm '{arm.arm_id}' has no configured serial port")

        if arm.arm_type == ArmType.FOLLOWER:
            from lerobot.robots.so_follower.config_so_follower import SOFollowerRobotConfig
            from lerobot.robots.so_follower.so_follower import SOFollower

            robot = SOFollower(
                SOFollowerRobotConfig(
                    id=arm.arm_id,
                    port=arm.port,
                    cameras={},
                    use_degrees=True,
                )
            )
            robot.bus.connect(handshake=True)
            return LeRobotBusSession(owner=robot, bus=robot.bus)

        from lerobot.teleoperators.so_leader.config_so_leader import SOLeaderTeleopConfig
        from lerobot.teleoperators.so_leader.so_leader import SOLeader

        teleoperator = SOLeader(
            SOLeaderTeleopConfig(
                id=arm.arm_id,
                port=arm.port,
                use_degrees=True,
            )
        )
        teleoperator.bus.connect(handshake=True)
        return LeRobotBusSession(owner=teleoperator, bus=teleoperator.bus)

    def _normalize_load(self, value: float) -> float:
        return max(0.0, min(100.0, abs(float(value)) / 10.0))


class DualArmAdapter:
    def __init__(
        self,
        config: RobotConfig,
        verifier: LeRobotArmVerifier | None = None,
        bridge: ArmHardwareBridge | None = None,
    ) -> None:
        self.execution_mode = ExecutionMode.MIRROR
        self.neutral_pose_scene = SceneName.IDLE
        self.required_dry_run = True
        self.last_command_at: str | None = None
        self._command_lock = RLock()
        self._movement_stop = Event()
        self._movement_thread: Thread | None = None
        self._movement_definitions = {movement.movement_id: movement for movement in list_movements()}
        self._movement_state = MovementRunState(note="No movement selected yet.")
        self.arms: dict[str, ArmRuntime] = {}
        self.verifier = verifier or LeRobotArmVerifier()
        self.bridge = bridge or LeRobotHardwareBridge()

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
            return "Leader profile is read-only until live motion support is added."
        return "Follower profile is read-only until live motion support is added."

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
        return any(self.bridge.is_connected(arm) for arm in self.arms.values())

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
            if verification.status != ArmVerificationStatus.READY:
                raise ValueError(verification.message or f"Arm '{arm_id}' is not ready for live telemetry")

            try:
                with self._command_lock:
                    self.bridge.connect(arm)
                    arm.connected = self.bridge.is_connected(arm)
                    self.refresh_telemetry(arm_id)
                    self.bridge.set_torque_enabled(arm, arm.safety.torque_enabled and not arm.safety.emergency_stop)
                    self.refresh_telemetry(arm_id)
                arm.notes = f"{arm.arm_id} is streaming live telemetry."
            except Exception as exc:
                arm.connected = False
                arm.telemetry.live = False
                arm.telemetry.error = str(exc)
                arm.notes = f"Live telemetry connection failed: {exc}"
                raise ValueError(arm.notes) from exc
            return

        if self._movement_state.status == MovementStatus.RUNNING and self._movement_state.arm_id == arm_id:
            self.stop_movement()
        with self._command_lock:
            self.bridge.disconnect(arm)
        arm.connected = False
        arm.telemetry.live = False
        arm.telemetry.error = None
        arm.telemetry.updated_at = None
        arm.telemetry.servos = []
        arm.notes = self._default_note(arm.arm_type)

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
            if self.bridge.is_connected(arm):
                self._apply_emergency_stop_to_arm(arm)
            arm.notes = "Emergency stop engaged. Live writes are disabled."
            return

        if self.bridge.is_connected(arm) and (payload.torque_enabled is not None or payload.emergency_stop is not None):
            with self._command_lock:
                self.bridge.set_torque_enabled(arm, arm.safety.torque_enabled)
                self.refresh_telemetry(arm_id)

        arm.notes = (
            f"Safety updated. Torque {'enabled' if arm.safety.torque_enabled else 'disabled'}; "
            f"dry run {'on' if arm.safety.dry_run else 'off'}."
        )

    def emergency_stop(self) -> None:
        if self._movement_state.status == MovementStatus.RUNNING:
            self._movement_stop.set()
        for arm in self.arms.values():
            arm.safety.emergency_stop = True
            arm.safety.torque_enabled = False
            if self.bridge.is_connected(arm):
                self._apply_emergency_stop_to_arm(arm)
            arm.notes = "Emergency stop engaged. Live writes are disabled."

    def reset_emergency_stop(self) -> None:
        for arm in self.arms.values():
            arm.safety.emergency_stop = False
            if self.bridge.is_connected(arm):
                with self._command_lock:
                    self.bridge.set_torque_enabled(arm, arm.safety.torque_enabled)
                    self.refresh_telemetry(arm.arm_id)
            arm.notes = "Emergency stop cleared. Re-enable torque before live motion."

    def neutralize(self) -> None:
        self.neutral_pose_scene = SceneName.IDLE
        for arm in self.arms.values():
            if not self.bridge.is_connected(arm):
                continue
            applied = self._write_safe_targets(arm, NEUTRAL_JOINT_TARGETS, reason="Neutral pose")
            if applied:
                arm.notes = "Moved toward neutral pose within live safety limits."

    def movement_library_snapshot(self) -> MovementLibraryState:
        return MovementLibraryState(
            movements=[definition.model_copy(deep=True) for definition in self._movement_definitions.values()],
            active=self._movement_state.model_copy(deep=True),
        )

    def start_movement(self, arm_id: str, movement_id: str) -> None:
        arm = self._arm(arm_id)
        definition = self._movement_definitions.get(movement_id)
        spec = get_movement(movement_id)
        if definition is None or spec is None:
            raise ValueError(f"Unknown movement '{movement_id}'")
        if self._movement_state.status == MovementStatus.RUNNING:
            raise ValueError("A movement is already running")

        self._assert_arm_ready_for_motion(arm)
        self._movement_stop.clear()
        now = datetime.now(UTC).isoformat()
        self._movement_state = MovementRunState(
            status=MovementStatus.RUNNING,
            movement_id=movement_id,
            arm_id=arm.arm_id,
            arm_type=arm.arm_type,
            started_at=now,
            updated_at=now,
            note=f"Running {definition.name} on {arm.arm_id}.",
            progress=0.0,
        )
        self._movement_thread = Thread(
            target=self._run_movement_thread,
            args=(arm.arm_id, definition),
            daemon=True,
            name=f"movement-{movement_id}-{arm.arm_id}",
        )
        self._movement_thread.start()

    def stop_movement(self) -> None:
        if self._movement_state.status != MovementStatus.RUNNING:
            return
        self._movement_stop.set()
        if self._movement_thread is not None:
            self._movement_thread.join(timeout=1.0)
        self._movement_thread = None
        self._movement_state.status = MovementStatus.STOPPED
        self._movement_state.updated_at = datetime.now(UTC).isoformat()
        self._movement_state.note = "Movement stopped."

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
        if not self.bridge.is_connected(arm):
            arm.connected = False
        if verification.message:
            arm.notes = verification.message
        return verification

    def refresh_all_telemetry(self) -> None:
        for arm_id in self.arms:
            if self.arms[arm_id].connected:
                self.refresh_telemetry(arm_id)

    def refresh_telemetry(self, arm_id: str) -> list[ServoState]:
        arm = self._arm(arm_id)
        if not self.bridge.is_connected(arm):
            arm.connected = False
            arm.telemetry.live = False
            arm.telemetry.error = "Arm is not connected for live telemetry."
            arm.telemetry.servos = []
            return []

        try:
            with self._command_lock:
                servos = self.bridge.read_telemetry(arm)
        except Exception as exc:
            with self._command_lock:
                self.bridge.disconnect(arm)
            arm.connected = False
            arm.telemetry.live = False
            arm.telemetry.error = str(exc)
            arm.telemetry.updated_at = datetime.now(UTC).isoformat()
            arm.telemetry.servos = []
            arm.notes = f"Telemetry read failed: {exc}"
            return []

        arm.connected = True
        arm.telemetry.live = True
        arm.telemetry.error = None
        arm.telemetry.updated_at = datetime.now(UTC).isoformat()
        arm.telemetry.servos = servos
        return servos

    def snapshot(self, choreography: ChoreographyTimeline | None, position_seconds: float) -> DualArmState:
        choreography_ready = choreography is not None
        arms: list[ArmAdapterState] = []
        for arm in self.arms.values():
            if arm.connected:
                self.refresh_telemetry(arm.arm_id)

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
                    telemetry_live=arm.telemetry.live,
                    telemetry_updated_at=arm.telemetry.updated_at,
                    telemetry_error=arm.telemetry.error,
                    telemetry=[servo.model_copy(deep=True) for servo in arm.telemetry.servos],
                    preview=self._preview(channel_cues, arm.channel, position_seconds),
                    notes=arm.notes,
                )
            )

        return DualArmState(
            arms=arms,
            execution=DualArmExecutionState(
                mode=self.execution_mode,
                choreography_ready=choreography_ready,
                dry_run_required=self._dry_run_required(),
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

    def _dry_run_required(self) -> bool:
        connected = [arm for arm in self.arms.values() if arm.connected]
        if not connected:
            return True
        return any(arm.safety.dry_run for arm in connected)

    def _apply_emergency_stop_to_arm(self, arm: ArmRuntime) -> None:
        try:
            with self._command_lock:
                current = self.refresh_telemetry(arm.arm_id)
                if current:
                    self.bridge.write_joint_targets(arm, {servo.name: servo.angle for servo in current})
                self.bridge.set_torque_enabled(arm, False)
                self.refresh_telemetry(arm.arm_id)
            arm.last_command_at = datetime.now(UTC).isoformat()
            arm.last_command_error = None
        except Exception as exc:
            arm.last_command_error = str(exc)
            arm.notes = f"Emergency stop failed on {arm.arm_id}: {exc}"

    def _write_safe_targets(
        self,
        arm: ArmRuntime,
        targets: dict[str, float],
        *,
        reason: str,
    ) -> bool:
        if arm.safety.dry_run or arm.safety.emergency_stop or not arm.safety.torque_enabled:
            return False
        if not self.bridge.is_connected(arm):
            return False

        for _ in range(MAX_NEUTRAL_COMMAND_STEPS):
            current_servos = self.refresh_telemetry(arm.arm_id)
            if not current_servos:
                return False
            if not self._telemetry_is_fresh(arm):
                arm.last_command_error = f"{arm.arm_id} telemetry heartbeat is stale."
                arm.notes = arm.last_command_error
                return False
            current_map = {servo.name: servo for servo in current_servos}
            safe_targets = self._limit_joint_targets(arm, current_map, targets)
            if not safe_targets:
                return True

            with self._command_lock:
                self.bridge.write_joint_targets(arm, safe_targets)
            arm.last_command_at = datetime.now(UTC).isoformat()
            arm.last_command_error = None
            self.last_command_at = arm.last_command_at
            sleep(0.03)

            latest_servos = self.refresh_telemetry(arm.arm_id)
            if self._targets_reached(arm, {servo.name: servo for servo in latest_servos}, targets):
                return True

        arm.notes = f"{reason} stopped at step limit. Run again if more settling is needed."
        return True

    def _limit_joint_targets(
        self,
        arm: ArmRuntime,
        current: dict[str, ServoState],
        targets: dict[str, float],
    ) -> dict[str, float]:
        safe_targets: dict[str, float] = {}
        for joint in arm.joints:
            if joint.joint_name not in targets:
                continue

            current_servo = current.get(joint.joint_name)
            if current_servo is None:
                continue

            requested = targets[joint.joint_name]
            desired = (-requested if joint.inverted else requested) + joint.offset_degrees
            desired = clamp(desired, joint.min_angle, joint.max_angle)

            max_step = max(1.0, arm.safety.max_step_degrees * joint.max_speed * arm.safety.speed_scale)
            delta = clamp(desired - current_servo.angle, -max_step, max_step)
            stepped = round(current_servo.angle + delta, 2)

            if abs(desired - current_servo.angle) <= NEUTRAL_TOLERANCE_DEGREES:
                continue

            safe_targets[joint.joint_name] = stepped

        return safe_targets

    def _targets_reached(self, arm: ArmRuntime, current: dict[str, ServoState], targets: dict[str, float]) -> bool:
        joint_map = {joint.joint_name: joint for joint in arm.joints}
        for joint_name, requested in targets.items():
            servo = current.get(joint_name)
            if servo is None:
                continue
            joint = joint_map.get(joint_name)
            desired = requested
            if joint is not None:
                desired = (-requested if joint.inverted else requested) + joint.offset_degrees
                desired = clamp(desired, joint.min_angle, joint.max_angle)
            if abs(servo.angle - desired) > NEUTRAL_TOLERANCE_DEGREES:
                return False
        return True

    def _telemetry_is_fresh(self, arm: ArmRuntime) -> bool:
        if not arm.telemetry.updated_at:
            return False
        updated_at = datetime.fromisoformat(arm.telemetry.updated_at)
        age = (datetime.now(UTC) - updated_at).total_seconds()
        return age <= HEARTBEAT_TIMEOUT_SECONDS

    def _assert_arm_ready_for_motion(self, arm: ArmRuntime) -> None:
        if not self.bridge.is_connected(arm):
            raise ValueError(f"Arm '{arm.arm_id}' is not connected.")
        if arm.safety.dry_run:
            raise ValueError(f"Arm '{arm.arm_id}' is still in dry-run mode.")
        if arm.safety.emergency_stop:
            raise ValueError(f"Arm '{arm.arm_id}' is in emergency stop.")
        if not arm.safety.torque_enabled:
            raise ValueError(f"Arm '{arm.arm_id}' torque is disabled.")
        self.refresh_telemetry(arm.arm_id)
        if not self._telemetry_is_fresh(arm):
            raise ValueError(f"Arm '{arm.arm_id}' telemetry heartbeat is stale.")

    def _run_movement_thread(
        self,
        arm_id: str,
        definition: MovementDefinition,
    ) -> None:
        try:
            arm = self._arm(arm_id)
            spec = get_movement(definition.movement_id)
            if spec is None:
                raise ValueError(f"Unknown movement '{definition.movement_id}'")
            total_duration = max(definition.duration_seconds, MOVEMENT_LOOP_INTERVAL_SECONDS)
            started = monotonic()
            while True:
                elapsed = monotonic() - started
                if elapsed > total_duration + MOVEMENT_LOOP_INTERVAL_SECONDS:
                    break
                if self._movement_stop.is_set() or self.emergency_stop_active():
                    self._movement_state.status = MovementStatus.STOPPED
                    self._movement_state.updated_at = datetime.now(UTC).isoformat()
                    self._movement_state.note = "Movement interrupted."
                    return

                self._assert_arm_ready_for_motion(arm)
                target = interpolate_targets(spec, elapsed)
                with self._command_lock:
                    self._write_control_step(arm, target, reason=definition.name)

                self._movement_state.progress = clamp(elapsed / total_duration, 0.0, 1.0)
                self._movement_state.updated_at = datetime.now(UTC).isoformat()
                self._movement_state.note = f"{definition.name} in progress."
                sleep(MOVEMENT_LOOP_INTERVAL_SECONDS)

            self._movement_state.status = MovementStatus.COMPLETED
            self._movement_state.progress = 1.0
            self._movement_state.updated_at = datetime.now(UTC).isoformat()
            self._movement_state.note = f"{definition.name} completed."
        except Exception as exc:
            self._movement_state.status = MovementStatus.ERROR
            self._movement_state.updated_at = datetime.now(UTC).isoformat()
            self._movement_state.note = str(exc)
            arm = self.arms.get(arm_id)
            if arm is not None:
                arm.last_command_error = str(exc)
                arm.notes = f"Movement error: {exc}"
        finally:
            self._movement_thread = None

    def _write_control_step(self, arm: ArmRuntime, targets: dict[str, float], *, reason: str) -> None:
        current_servos = self.refresh_telemetry(arm.arm_id)
        current_map = {servo.name: servo for servo in current_servos}
        safe_targets = self._limit_joint_targets(arm, current_map, targets)
        if not safe_targets:
            return
        with self._command_lock:
            self.bridge.write_joint_targets(arm, safe_targets)
        arm.last_command_at = datetime.now(UTC).isoformat()
        arm.last_command_error = None
        self.last_command_at = arm.last_command_at
        arm.notes = f"{reason} step written."

    def _arm(self, arm_id: str) -> ArmRuntime:
        arm = self.arms.get(arm_id)
        if arm is None:
            raise ValueError(f"Unknown arm id: {arm_id}")
        return arm
