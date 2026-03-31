from __future__ import annotations

from dataclasses import dataclass

from .models import ArmType, MovementDefinition


@dataclass(frozen=True)
class MovementKeyframe:
    time_offset: float
    joints: dict[str, float]


@dataclass(frozen=True)
class MovementSpec:
    definition: MovementDefinition
    keyframes: tuple[MovementKeyframe, ...]


WAVE_SPEC = MovementSpec(
    definition=MovementDefinition(
        movement_id="wave",
        name="Wave",
        summary="Raise the arm, bend the elbow, and wave with the wrist.",
        description=(
            "A simple greeting motion. Shoulder lift raises the arm, elbow flex bends it, "
            "and wrist roll oscillates to create the visible wave."
        ),
        duration_seconds=4.2,
        focus_joints=["shoulder_lift", "elbow_flex", "wrist_roll", "wrist_flex"],
        recommended_arm=ArmType.FOLLOWER,
    ),
    keyframes=(
        MovementKeyframe(
            time_offset=0.0,
            joints={
                "shoulder_pan": 6.0,
                "shoulder_lift": -16.0,
                "elbow_flex": 22.0,
                "wrist_flex": 4.0,
                "wrist_roll": 0.0,
                "gripper": 8.0,
            },
        ),
        MovementKeyframe(
            time_offset=0.7,
            joints={
                "shoulder_pan": 12.0,
                "shoulder_lift": -44.0,
                "elbow_flex": 82.0,
                "wrist_flex": 18.0,
                "wrist_roll": 0.0,
                "gripper": 8.0,
            },
        ),
        MovementKeyframe(
            time_offset=1.1,
            joints={
                "shoulder_pan": 12.0,
                "shoulder_lift": -44.0,
                "elbow_flex": 82.0,
                "wrist_flex": 16.0,
                "wrist_roll": -34.0,
                "gripper": 8.0,
            },
        ),
        MovementKeyframe(
            time_offset=1.5,
            joints={
                "shoulder_pan": 16.0,
                "shoulder_lift": -42.0,
                "elbow_flex": 82.0,
                "wrist_flex": 16.0,
                "wrist_roll": 34.0,
                "gripper": 8.0,
            },
        ),
        MovementKeyframe(
            time_offset=1.9,
            joints={
                "shoulder_pan": 12.0,
                "shoulder_lift": -44.0,
                "elbow_flex": 82.0,
                "wrist_flex": 16.0,
                "wrist_roll": -34.0,
                "gripper": 8.0,
            },
        ),
        MovementKeyframe(
            time_offset=2.3,
            joints={
                "shoulder_pan": 16.0,
                "shoulder_lift": -42.0,
                "elbow_flex": 82.0,
                "wrist_flex": 16.0,
                "wrist_roll": 34.0,
                "gripper": 8.0,
            },
        ),
        MovementKeyframe(
            time_offset=2.7,
            joints={
                "shoulder_pan": 12.0,
                "shoulder_lift": -44.0,
                "elbow_flex": 82.0,
                "wrist_flex": 16.0,
                "wrist_roll": -34.0,
                "gripper": 8.0,
            },
        ),
        MovementKeyframe(
            time_offset=3.1,
            joints={
                "shoulder_pan": 16.0,
                "shoulder_lift": -42.0,
                "elbow_flex": 82.0,
                "wrist_flex": 16.0,
                "wrist_roll": 34.0,
                "gripper": 8.0,
            },
        ),
        MovementKeyframe(
            time_offset=3.6,
            joints={
                "shoulder_pan": 10.0,
                "shoulder_lift": -24.0,
                "elbow_flex": 38.0,
                "wrist_flex": 10.0,
                "wrist_roll": 0.0,
                "gripper": 8.0,
            },
        ),
        MovementKeyframe(
            time_offset=4.2,
            joints={
                "shoulder_pan": 0.0,
                "shoulder_lift": -12.0,
                "elbow_flex": 18.0,
                "wrist_flex": 0.0,
                "wrist_roll": 0.0,
                "gripper": 8.0,
            },
        ),
    ),
)

MOVEMENT_LIBRARY: dict[str, MovementSpec] = {
    WAVE_SPEC.definition.movement_id: WAVE_SPEC,
}


def list_movements() -> list[MovementDefinition]:
    return [spec.definition.model_copy(deep=True) for spec in MOVEMENT_LIBRARY.values()]


def get_movement(movement_id: str) -> MovementSpec | None:
    return MOVEMENT_LIBRARY.get(movement_id)


def interpolate_targets(spec: MovementSpec, elapsed: float) -> dict[str, float]:
    keyframes = spec.keyframes
    if elapsed <= keyframes[0].time_offset:
        return dict(keyframes[0].joints)
    if elapsed >= keyframes[-1].time_offset:
        return dict(keyframes[-1].joints)

    previous = keyframes[0]
    for current in keyframes[1:]:
        if elapsed <= current.time_offset:
            span = max(current.time_offset - previous.time_offset, 1e-6)
            alpha = (elapsed - previous.time_offset) / span
            joint_names = set(previous.joints) | set(current.joints)
            return {
                joint_name: round(
                    previous.joints.get(joint_name, current.joints.get(joint_name, 0.0))
                    + (
                        current.joints.get(joint_name, previous.joints.get(joint_name, 0.0))
                        - previous.joints.get(joint_name, current.joints.get(joint_name, 0.0))
                    )
                    * alpha,
                    2,
                )
                for joint_name in joint_names
            }
        previous = current

    return dict(keyframes[-1].joints)
