import type {
  AudioAnalysis,
  ChoreographySchedule,
  ChoreographyTimeline,
  ExecutionMode,
  MovementLibraryState,
} from "@/lib/types";

import { formatDuration } from "@/lib/analysis-view";
import { Button } from "@/components/ui/button";

function cueCountInWindow(times: number[], start: number, end: number) {
  return times.filter((time) => time >= start && time < end).length;
}

export function StructurePanel({
  analysis,
  choreography,
  schedule,
  movementLibrary,
  busyAction,
  onPhraseMappingChange,
}: {
  analysis: AudioAnalysis | null;
  choreography: ChoreographyTimeline | null;
  schedule: ChoreographySchedule | null;
  movementLibrary: MovementLibraryState | null;
  busyAction: string | null;
  onPhraseMappingChange: (
    phraseId: string,
    payload: {
      movement_id?: string;
      preset_id?: string;
      execution_mode?: ExecutionMode;
    },
  ) => void;
}) {
  if (!analysis) {
    return <EmptyPanel text="Structure markers show up after the backend returns a section timeline." />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-[30px] border border-white/10 bg-black/25 p-6">
        <p className="hud-label">Song Structure</p>
        <div className="mt-6 overflow-hidden rounded-[26px] border border-white/10 bg-slate-950/90 p-3">
          <div className="flex gap-2">
            {analysis.sections.map((section, index) => {
              const width = analysis.duration_seconds > 0 ? ((section.end_seconds - section.start_seconds) / analysis.duration_seconds) * 100 : 0;
              return (
                <div
                  key={`${section.label}-${index}`}
                  className="min-h-[128px] rounded-[22px] border border-primary/20 bg-gradient-to-b from-primary/[0.18] via-blue-400/[0.08] to-transparent p-4"
                  style={{ width: `${Math.max(12, width)}%` }}
                >
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-300">{section.label}</p>
                  <p className="mt-3 text-sm text-slate-400">
                    {formatDuration(section.start_seconds)} - {formatDuration(section.end_seconds)}
                  </p>
                  <p className="mt-6 text-2xl font-semibold text-white">{Math.round(section.energy_mean * 100)}%</p>
                  <p className="mt-2 text-xs text-slate-400">energy mean</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          {analysis.sections.map((section, index) => {
            const beats = cueCountInWindow(analysis.beats, section.start_seconds, section.end_seconds);
            const downbeats = cueCountInWindow(analysis.downbeats, section.start_seconds, section.end_seconds);
            return (
              <div key={`detail-${section.label}-${index}`} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-base font-semibold capitalize text-white">{section.label}</p>
                  <p className="text-xs text-slate-400">
                    {formatDuration(section.start_seconds)} - {formatDuration(section.end_seconds)}
                  </p>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <DetailTile label="Energy" value={`${Math.round(section.energy_mean * 100)}%`} />
                  <DetailTile label="Density" value={`${Math.round(section.density_mean * 100)}%`} />
                  <DetailTile label="Beats" value={`${beats}`} />
                  <DetailTile label="Downbeats" value={`${downbeats}`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-[30px] border border-white/10 bg-black/25 p-6">
        <p className="hud-label">Choreography Mapping</p>
        <div className="mt-6 space-y-4">
          <MappingBanner
            title="Pose Families"
            note={choreography ? `${new Set(choreography.global_cues.map((cue) => cue.pose_family)).size} pose families are already present in the cue stream.` : "No choreography stream attached yet."}
          />
          <MappingBanner
            title="Global Cues"
            note={choreography ? `${choreography.global_cues.length} timeline events are ready to drive section-level motion changes.` : "Cue generation follows the analysis payload."}
          />
          <MappingBanner
            title="Arm Channels"
            note={choreography ? `${choreography.arm_left_cues.length} left-arm cues and ${choreography.arm_right_cues.length} right-arm cues are ready for the hardware bridge.` : "Arm-specific cue channels will appear with the choreography timeline."}
          />
          <MappingBanner
            title="Scheduled Phrases"
            note={
              schedule
                ? `${schedule.phrase_count} scheduled movement phrases are ready for autonomous playback.`
                : "Phrase scheduling appears after analysis is stored for the selected track."
            }
          />
          {schedule ? (
            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-base font-semibold text-white">Phrase Mapping</p>
              <p className="mt-2 text-sm text-slate-400">
                Override movement, preset, or execution mode for each phrase window. Changes are saved back into the scheduler output.
              </p>
              <div className="mt-4 space-y-3">
                {schedule.phrases.slice(0, 8).map((phrase) => {
                  const movement = movementLibrary?.movements.find((entry) => entry.movement_id === phrase.movement_id) ?? null;
                  const phraseBusy = busyAction === `phrase:${phrase.phrase_id}`;
                  return (
                  <div key={phrase.phrase_id} className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold capitalize text-white">
                        {phrase.movement_id} · {phrase.preset_id}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatDuration(phrase.start_seconds)} - {formatDuration(phrase.end_seconds)}
                      </p>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      {phrase.section_label} · {phrase.execution_mode} · intensity {Math.round(phrase.intensity * 100)}%
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {movementLibrary?.movements.map((entry) => (
                        <button
                          key={`${phrase.phrase_id}-${entry.movement_id}`}
                          type="button"
                          onClick={() => onPhraseMappingChange(phrase.phrase_id, { movement_id: entry.movement_id })}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            phrase.movement_id === entry.movement_id
                              ? "border-primary bg-primary/20 text-white"
                              : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-primary/40 hover:text-white"
                          }`}
                        >
                          {entry.name}
                        </button>
                      ))}
                    </div>
                    {movement ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {movement.presets.map((preset) => (
                          <button
                            key={`${phrase.phrase_id}-${preset.preset_id}`}
                            type="button"
                            onClick={() => onPhraseMappingChange(phrase.phrase_id, { movement_id: movement.movement_id, preset_id: preset.preset_id })}
                            className={`rounded-full border px-3 py-1 text-xs transition ${
                              phrase.preset_id === preset.preset_id
                                ? "border-sky-300 bg-sky-400/20 text-white"
                                : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-sky-300/40 hover:text-white"
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(["unison", "mirror"] as ExecutionMode[]).map((mode) => (
                        <button
                          key={`${phrase.phrase_id}-${mode}`}
                          type="button"
                          onClick={() => onPhraseMappingChange(phrase.phrase_id, { execution_mode: mode })}
                          className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] transition ${
                            phrase.execution_mode === mode
                              ? "border-white/40 bg-white/15 text-white"
                              : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/30 hover:text-white"
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                      <Button type="button" variant="ghost" size="sm" disabled>
                        {phraseBusy ? "Saving..." : "Mapped"}
                      </Button>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3">
      <p className="hud-label">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function MappingBanner({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
      <p className="text-base font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm text-slate-400">{note}</p>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="rounded-[30px] border border-white/10 bg-black/25 p-6 text-sm text-slate-400">{text}</div>;
}
