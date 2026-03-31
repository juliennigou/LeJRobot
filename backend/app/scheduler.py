from __future__ import annotations

from datetime import UTC, datetime

from .models import (
    AudioAnalysis,
    ChoreographySchedule,
    ExecutionMode,
    MovementDefinition,
    MovementTargetScope,
    ScheduleConfig,
    SchedulePhraseOverride,
    ScheduleStylePreset,
    ScheduledMovementPhrase,
    SectionLabel,
)


STYLE_PRESETS = {
    "baseline": ScheduleStylePreset(
        style_id="baseline",
        label="Baseline",
        summary="Balanced phrase density with the default section-to-movement mapping.",
        density_scale=1.0,
        intensity_scale=1.0,
    ),
    "smooth": ScheduleStylePreset(
        style_id="smooth",
        label="Smooth",
        summary="Lower density, softer phrasing, and more unison motion.",
        density_scale=0.8,
        intensity_scale=0.9,
    ),
    "groovy": ScheduleStylePreset(
        style_id="groovy",
        label="Groovy",
        summary="Balanced pulse with frequent wrist-led phrases and light mirrored accents.",
        density_scale=1.0,
        intensity_scale=1.0,
    ),
    "punchy": ScheduleStylePreset(
        style_id="punchy",
        label="Punchy",
        summary="Denser phrase starts with stronger mirrored accents on high-energy sections.",
        density_scale=1.25,
        intensity_scale=1.2,
    ),
    "expressive": ScheduleStylePreset(
        style_id="expressive",
        label="Expressive",
        summary="Higher intensity with larger wave phrases and more visible section contrast.",
        density_scale=1.1,
        intensity_scale=1.15,
    ),
}


class ChoreographyScheduler:
    def __init__(self, movements: list[MovementDefinition]) -> None:
        self.movements = {movement.movement_id: movement for movement in movements}

    def build_schedule(self, analysis: AudioAnalysis, *, config: ScheduleConfig | None = None) -> ChoreographySchedule:
        resolved_config = self._resolve_config(config)
        style = self._style_preset(resolved_config.style_id)
        phrases: list[ScheduledMovementPhrase] = []
        downbeats = analysis.downbeats or analysis.beats
        beats = analysis.beats
        phrase_index = 0

        for section in analysis.sections:
            movement_id, preset_id, execution_mode, beat_stride = self._section_plan(section, resolved_config, style)
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
                        phrase_id=f"phrase-{phrase_index}",
                        movement_id=movement_id,
                        preset_id=preset_id,
                        start_seconds=round(start, 3),
                        end_seconds=round(end, 3),
                        section_label=section.label,
                        execution_mode=execution_mode,
                        target_scope=MovementTargetScope.BOTH,
                        intensity=round(min(1.0, section.energy_mean * resolved_config.intensity_scale), 3),
                        density=round(min(1.0, section.density_mean * resolved_config.density_scale), 3),
                        notes=f"{style.label} mapping for {section.label.value}",
                    )
                )
                phrase_index += 1

        override_map = {override.phrase_id: override for override in resolved_config.phrase_overrides}
        phrases = [self._apply_override(phrase, override_map.get(phrase.phrase_id)) for phrase in phrases]

        return ChoreographySchedule(
            track_id=analysis.track_id,
            source=analysis.source,
            style_id=resolved_config.style_id,
            config=resolved_config,
            available_styles=list(STYLE_PRESETS.values()),
            generated_at=datetime.now(UTC).isoformat(),
            phrase_count=len(phrases),
            phrases=phrases,
        )

    def _resolve_config(self, config: ScheduleConfig | None) -> ScheduleConfig:
        if config is None:
            return ScheduleConfig()
        style = self._style_preset(config.style_id)
        return ScheduleConfig(
            style_id=style.style_id,
            density_scale=config.density_scale,
            intensity_scale=config.intensity_scale,
            phrase_overrides=config.phrase_overrides,
        )

    def _style_preset(self, style_id: str) -> ScheduleStylePreset:
        return STYLE_PRESETS.get(style_id, STYLE_PRESETS["baseline"])

    def _section_plan(self, section, config: ScheduleConfig, style: ScheduleStylePreset) -> tuple[str, str, ExecutionMode, int]:
        density = max(0.5, min(2.0, style.density_scale * config.density_scale))
        intensity = max(0.5, min(1.5, style.intensity_scale * config.intensity_scale))

        if style.style_id == "smooth":
            if section.label in {SectionLabel.INTRO, SectionLabel.OUTRO, SectionLabel.BREAK, SectionLabel.BRIDGE}:
                return "wrist_lean", "normal", ExecutionMode.UNISON, self._stride(3, density)
            if section.label == SectionLabel.CHORUS:
                return "wave", "subtle", ExecutionMode.UNISON, self._stride(2, density)
            return "wrist_lean", "normal", ExecutionMode.UNISON, self._stride(2, density)

        if style.style_id == "punchy":
            if section.label in {SectionLabel.INTRO, SectionLabel.OUTRO}:
                return "wrist_lean", "normal", ExecutionMode.UNISON, self._stride(2, density)
            if section.label == SectionLabel.CHORUS or section.energy_mean * intensity >= 0.62:
                return "wave", "exaggerated", ExecutionMode.MIRROR, self._stride(1, density)
            return "wrist_lean", "normal", ExecutionMode.MIRROR, self._stride(1, density)

        if style.style_id == "expressive":
            if section.label in {SectionLabel.INTRO, SectionLabel.BREAK, SectionLabel.OUTRO}:
                return "wrist_lean", "normal", ExecutionMode.UNISON, self._stride(2, density)
            if section.label in {SectionLabel.CHORUS, SectionLabel.BRIDGE}:
                return "wave", "exaggerated", ExecutionMode.MIRROR, self._stride(1, density)
            return "wave", "normal", ExecutionMode.UNISON, self._stride(1, density)

        if style.style_id == "groovy":
            if section.label in {SectionLabel.INTRO, SectionLabel.OUTRO, SectionLabel.BREAK}:
                return "wrist_lean", "normal", ExecutionMode.UNISON, self._stride(2, density)
            if section.label == SectionLabel.CHORUS:
                return "wave", "normal", ExecutionMode.MIRROR, self._stride(1, density)
            return "wrist_lean", "normal", ExecutionMode.MIRROR if section.energy_mean * intensity > 0.58 else ExecutionMode.UNISON, self._stride(1, density)

        if section.label in {SectionLabel.INTRO, SectionLabel.OUTRO, SectionLabel.BREAK}:
            return "wrist_lean", "normal", ExecutionMode.UNISON, self._stride(2, density)
        if section.label == SectionLabel.CHORUS:
            return "wave", "exaggerated", ExecutionMode.MIRROR, self._stride(1, density)
        if section.label == SectionLabel.BRIDGE:
            return "wave", "subtle", ExecutionMode.UNISON, self._stride(2, density)
        if section.energy_mean * intensity >= 0.6:
            return "wave", "normal", ExecutionMode.MIRROR, self._stride(1, density)
        return "wrist_lean", "normal", ExecutionMode.UNISON, self._stride(2, density)

    def _stride(self, base_stride: int, density: float) -> int:
        adjusted = round(base_stride / max(density, 0.5))
        return max(1, adjusted)

    def _apply_override(
        self,
        phrase: ScheduledMovementPhrase,
        override: SchedulePhraseOverride | None,
    ) -> ScheduledMovementPhrase:
        if override is None:
            return phrase
        movement_id = override.movement_id or phrase.movement_id
        movement = self.movements.get(movement_id)
        preset_id = override.preset_id or phrase.preset_id
        if movement is not None:
            available_presets = {preset.preset_id for preset in movement.presets}
            if preset_id not in available_presets:
                preset_id = movement.default_preset_id or movement.presets[0].preset_id
        return phrase.model_copy(
            update={
                "movement_id": movement_id,
                "preset_id": preset_id,
                "execution_mode": override.execution_mode or phrase.execution_mode,
                "target_scope": override.target_scope or phrase.target_scope,
                "notes": f"{phrase.notes}; override applied" if phrase.notes else "Override applied",
            }
        )

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
