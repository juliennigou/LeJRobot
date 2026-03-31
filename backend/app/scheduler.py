from __future__ import annotations

from datetime import UTC, datetime

from .models import (
    AudioAnalysis,
    ChoreographySchedule,
    ExecutionMode,
    MovementDefinition,
    ScheduledMovementPhrase,
    SectionLabel,
)


class ChoreographyScheduler:
    def __init__(self, movements: list[MovementDefinition]) -> None:
        self.movements = {movement.movement_id: movement for movement in movements}

    def build_schedule(self, analysis: AudioAnalysis, *, style_id: str = "baseline") -> ChoreographySchedule:
        phrases: list[ScheduledMovementPhrase] = []
        downbeats = analysis.downbeats or analysis.beats
        beats = analysis.beats
        phrase_index = 0

        for section in analysis.sections:
            movement_id, preset_id, execution_mode, beat_stride = self._section_plan(section)
            movement = self.movements.get(movement_id)
            if movement is None:
                continue

            phrase_starts = self._phrase_starts_for_section(section.start_seconds, section.end_seconds, downbeats, beats, beat_stride)
            for start in phrase_starts:
                duration = max(movement.duration_seconds, 0.6)
                end = min(section.end_seconds, start + duration)
                if end - start < 0.45:
                    continue
                phrases.append(
                    ScheduledMovementPhrase(
                        phrase_id=f"{movement_id}-{phrase_index}",
                        movement_id=movement_id,
                        preset_id=preset_id,
                        start_seconds=round(start, 3),
                        end_seconds=round(end, 3),
                        section_label=section.label,
                        execution_mode=execution_mode,
                        intensity=round(section.energy_mean, 3),
                        density=round(section.density_mean, 3),
                        notes=f"{section.label.value} phrase aligned to beat grid",
                    )
                )
                phrase_index += 1

        return ChoreographySchedule(
            track_id=analysis.track_id,
            source=analysis.source,
            style_id=style_id,
            generated_at=datetime.now(UTC).isoformat(),
            phrase_count=len(phrases),
            phrases=phrases,
        )

    def _section_plan(self, section) -> tuple[str, str, ExecutionMode, int]:
        if section.label in {SectionLabel.INTRO, SectionLabel.OUTRO, SectionLabel.BREAK}:
            return "wrist_lean", "normal", ExecutionMode.UNISON, 2
        if section.label == SectionLabel.CHORUS:
            return "wave", "exaggerated", ExecutionMode.MIRROR, 1
        if section.label == SectionLabel.BRIDGE:
            return "wave", "subtle", ExecutionMode.UNISON, 2
        if section.energy_mean >= 0.6:
            return "wave", "normal", ExecutionMode.MIRROR, 1
        return "wrist_lean", "normal", ExecutionMode.UNISON, 2

    def _phrase_starts_for_section(
        self,
        start_seconds: float,
        end_seconds: float,
        downbeats: list[float],
        beats: list[float],
        beat_stride: int,
    ) -> list[float]:
        grid = [time for time in downbeats if start_seconds <= time < end_seconds]
        if not grid:
            grid = [time for time in beats if start_seconds <= time < end_seconds]
        if not grid:
            return [start_seconds]
        return [time for index, time in enumerate(grid) if index % max(1, beat_stride) == 0]
