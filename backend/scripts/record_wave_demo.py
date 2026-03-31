from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.movement_recording import record_demonstration, save_recording  # noqa: E402
from backend.app.state import RobotStateStore  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Record a manual SO-101 joint demonstration to disk.")
    parser.add_argument("--arm-id", default=None, help="Arm id to record. Defaults to leader, then follower.")
    parser.add_argument("--label", default="manual-wave", help="Human-readable recording label.")
    parser.add_argument("--movement", default="wave", help="Movement hint stored with the recording.")
    parser.add_argument("--sample-hz", type=float, default=40.0, help="Telemetry sampling frequency.")
    parser.add_argument("--duration", type=float, default=None, help="Optional fixed recording duration in seconds.")
    parser.add_argument(
        "--keep-torque",
        action="store_true",
        help="Keep torque enabled while recording. By default torque is disabled to allow manual motion.",
    )
    parser.add_argument("--notes", default="", help="Optional free-form note stored with the recording.")
    return parser.parse_args()


def choose_arm_id(store: RobotStateStore, requested: str | None) -> str:
    if requested:
        return requested
    if store.config.leader_id:
        return store.config.leader_id
    return store.config.follower_id


def main() -> None:
    args = parse_args()
    store = RobotStateStore()
    arm_id = choose_arm_id(store, args.arm_id)

    print(f"Preparing recording on arm '{arm_id}'.")
    if args.duration is None:
        print("Press Enter to start recording. Stop with Ctrl+C.")
    else:
        print(f"Press Enter to start recording for {args.duration:.2f}s.")
    input()

    recording = record_demonstration(
        store.arm_adapter,
        arm_id,
        label=args.label,
        movement_hint=args.movement,
        sample_hz=args.sample_hz,
        duration_seconds=args.duration,
        disable_torque=not args.keep_torque,
        notes=args.notes,
    )
    store.arm_adapter.set_connection(arm_id, False)

    path = save_recording(recording)
    print(f"Saved recording to {path}")
    print(f"Captured {len(recording.samples)} samples over {recording.duration_seconds:.2f}s at {recording.sample_hz:.1f} Hz.")


if __name__ == "__main__":
    main()
