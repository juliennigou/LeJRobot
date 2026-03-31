from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.movement_recording import load_recording, replay_recording  # noqa: E402
from backend.app.state import RobotStateStore  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Replay a recorded SO-101 demonstration.")
    parser.add_argument("recording", type=Path, help="Path to a saved recording JSON file.")
    parser.add_argument("--arm-id", default=None, help="Arm id to replay on. Defaults to the recording arm id.")
    parser.add_argument("--speed", type=float, default=1.0, help="Playback speed scale.")
    parser.add_argument(
        "--live",
        action="store_true",
        help="Actually send commands to the arm. Without this flag the script only prints a summary.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    recording = load_recording(args.recording)
    arm_id = args.arm_id or recording.arm_id

    print(f"Loaded recording '{recording.label}' from {args.recording}")
    print(f"Arm: {recording.arm_id}  Duration: {recording.duration_seconds:.2f}s  Samples: {len(recording.samples)}")

    if not args.live:
        print("Dry summary only. Re-run with --live to replay on hardware.")
        return

    store = RobotStateStore()
    replay_recording(store.arm_adapter, recording, arm_id=arm_id, speed_scale=args.speed)
    store.arm_adapter.set_connection(arm_id, False)
    print(f"Replay completed on arm '{arm_id}'.")


if __name__ == "__main__":
    main()
