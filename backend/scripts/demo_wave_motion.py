from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.movement_library import sample_motion  # noqa: E402
from backend.app.models import MovementRunRequest  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sample the oscillator-based SO-101 wave motion.")
    parser.add_argument("--arm-id", default="demo_follower", help="Logical arm id used in the request payload.")
    parser.add_argument("--preset", default="normal", choices=["subtle", "normal", "exaggerated"])
    parser.add_argument("--frequency", type=float, default=None, help="Override frequency in Hz.")
    parser.add_argument("--cycles", type=int, default=None, help="Override number of wave cycles.")
    parser.add_argument("--amplitude-scale", type=float, default=None, help="Override amplitude scale.")
    parser.add_argument("--softness", type=float, default=None, help="Override envelope softness from 0 to 1.")
    parser.add_argument("--asymmetry", type=float, default=None, help="Override asymmetry from 0 to 1.")
    parser.add_argument("--sample-hz", type=float, default=30.0, help="Sampling frequency for the trajectory dump.")
    parser.add_argument("--format", default="json", choices=["json", "csv"])
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    request = MovementRunRequest(
        movement_id="wave",
        arm_id=args.arm_id,
        preset_id=args.preset,
        frequency_hz=args.frequency,
        cycles=args.cycles,
        amplitude_scale=args.amplitude_scale,
        softness=args.softness,
        asymmetry=args.asymmetry,
        debug=True,
    )
    samples = sample_motion(request, sample_hz=args.sample_hz)

    if args.format == "csv":
        writer = csv.DictWriter(sys.stdout, fieldnames=list(samples[0].keys()))
        writer.writeheader()
        writer.writerows(samples)
        return

    json.dump(samples, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
