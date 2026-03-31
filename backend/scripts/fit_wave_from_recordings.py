from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.movement_recording import fit_wave_from_recordings, load_recording, save_fit  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fit a cleaner oscillator-based wave model from recorded demonstrations.")
    parser.add_argument("recordings", nargs="+", type=Path, help="One or more recording JSON files.")
    parser.add_argument("--label", default="Recorded Wave", help="Label to store with the fitted preset.")
    parser.add_argument(
        "--print-preset",
        action="store_true",
        help="Also print a MovementPreset-compatible JSON payload for easy copy/paste into the wave library.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    recordings = [load_recording(path) for path in args.recordings]
    summary = fit_wave_from_recordings(recordings, label=args.label)
    path = save_fit(summary)

    print(f"Saved fit summary to {path}")
    print(f"Frequency: {summary.frequency_hz:.3f} Hz  Cycles: {summary.cycles}  Duration: {summary.duration_seconds:.2f}s")
    print("Neutral pose:")
    for joint_name, value in summary.neutral_pose.items():
        print(f"  - {joint_name}: {value:.2f}")
    print("Joint profiles:")
    for profile in summary.joint_profiles:
        print(
            f"  - {profile.joint_name}: base={profile.base_angle:.2f} amp={profile.amplitude:.2f} "
            f"phase={profile.phase_delay_radians:.3f}"
        )

    if args.print_preset:
        preset = summary.to_preset()
        print("\nPreset JSON:")
        print(json.dumps(preset.model_dump(mode="json"), indent=2))


if __name__ == "__main__":
    main()
