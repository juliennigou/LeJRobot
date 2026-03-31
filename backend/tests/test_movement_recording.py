from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from backend.app.models import MovementRunRequest
from backend.app.movement_library import sample_motion
from backend.app.movement_recording import (
    MovementRecording,
    RecordingSample,
    fit_wave_from_recordings,
    load_recording,
    save_recording,
)


class MovementRecordingTest(unittest.TestCase):
    def test_save_and_load_recording(self) -> None:
        recording = self._synthetic_recording()
        with tempfile.TemporaryDirectory() as tempdir:
            path = save_recording(recording, Path(tempdir) / "recording.json")
            restored = load_recording(path)

        self.assertEqual(restored.recording_id, recording.recording_id)
        self.assertEqual(len(restored.samples), len(recording.samples))
        self.assertAlmostEqual(restored.samples[5].angles["wrist_roll"], recording.samples[5].angles["wrist_roll"])

    def test_fit_wave_from_recording_recovers_phase_chain(self) -> None:
        recording = self._synthetic_recording()
        summary = fit_wave_from_recordings([recording], label="Synthetic Wave")

        self.assertGreater(summary.frequency_hz, 0.4)
        self.assertLess(summary.frequency_hz, 1.6)
        profiles = {profile.joint_name: profile for profile in summary.joint_profiles}
        self.assertLess(profiles["shoulder_pan"].phase_delay_radians, profiles["elbow_flex"].phase_delay_radians)
        self.assertLess(profiles["elbow_flex"].phase_delay_radians, profiles["wrist_roll"].phase_delay_radians)
        self.assertGreater(profiles["wrist_roll"].amplitude, profiles["shoulder_pan"].amplitude)

    def _synthetic_recording(self) -> MovementRecording:
        frames = sample_motion(
            MovementRunRequest(movement_id="wave", arm_id="synthetic_arm", preset_id="normal"),
            sample_hz=40.0,
        )
        samples = [
            RecordingSample(
                time_seconds=float(frame["time"]),
                angles={joint: float(frame[joint]) for joint in frame if joint != "time"},
                target_angles={joint: float(frame[joint]) for joint in frame if joint != "time"},
                torque_enabled={joint: True for joint in frame if joint != "time"},
            )
            for frame in frames
        ]
        return MovementRecording(
            recording_id="synthetic-wave",
            label="Synthetic Wave",
            movement_hint="wave",
            arm_id="synthetic_arm",
            arm_type="follower",
            created_at="2026-03-31T00:00:00+00:00",
            sample_hz=40.0,
            duration_seconds=samples[-1].time_seconds,
            samples=samples,
        )


if __name__ == "__main__":
    unittest.main()
