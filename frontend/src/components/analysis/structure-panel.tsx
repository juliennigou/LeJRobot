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
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="hud-label">Song Structure</p>
            <p className="mt-1 text-sm text-slate-400">Read the song shape first, then refine how the scheduler maps each phrase.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-400">
            <span>{analysis.sections.length} sections</span>
            <span>·</span>
            <span>{schedule?.phrase_count ?? 0} phrases</span>
            <span>·</span>
            <span>{choreography?.global_cues.length ?? 0} cues</span>
          </div>
        </div>

        <div className="mt-5 flex overflow-x-auto pb-2">
          <div className="flex min-w-full gap-2">
            {analysis.sections.map((section, index) => {
              const width = analysis.duration_seconds > 0 ? ((section.end_seconds - section.start_seconds) / analysis.duration_seconds) * 100 : 0;
              const beats = cueCountInWindow(analysis.beats, section.start_seconds, section.end_seconds);
              return (
                <div
                  key={`${section.label}-${index}`}
                  className="min-h-[132px] rounded-[22px] border border-white/10 bg-gradient-to-b from-sky-500/[0.18] via-blue-400/[0.06] to-transparent p-4"
                  style={{ width: `${Math.max(14, width)}%` }}
                >
                  <p className="text-sm font-medium capitalize text-white">{section.label}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatDuration(section.start_seconds)} - {formatDuration(section.end_seconds)}
                  </p>
                  <div className="mt-6 grid gap-3 text-sm text-slate-300">
                    <div className="flex items-center justify-between gap-3">
                      <span>Energy</span>
                      <span>{Math.round(section.energy_mean * 100)}%</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Density</span>
                      <span>{Math.round(section.density_mean * 100)}%</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Beats</span>
                      <span>{beats}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
          <p className="hud-label">Scheduler Summary</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <SummaryTile label="Pose Families" value={choreography ? `${new Set(choreography.global_cues.map((cue) => cue.pose_family)).size}` : "--"} note="distinct movement families" />
            <SummaryTile label="Arm Cues" value={choreography ? `${choreography.arm_left_cues.length + choreography.arm_right_cues.length}` : "--"} note="left + right arm cue count" />
            <SummaryTile label="Phrase Map" value={schedule ? `${schedule.phrase_count}` : "--"} note={schedule ? `${schedule.config.style_id} style` : "not generated yet"} />
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="hud-label">Phrase Mapping</p>
              <p className="mt-1 text-sm text-slate-400">Adjust only the phrases you care about. The rest can stay scheduler-driven.</p>
            </div>
            {schedule ? <p className="text-xs text-slate-500">Showing first 8 phrases</p> : null}
          </div>

          {schedule ? (
            <div className="mt-5 space-y-3">
              {schedule.phrases.slice(0, 8).map((phrase) => {
                const movement = movementLibrary?.movements.find((entry) => entry.movement_id === phrase.movement_id) ?? null;
                const phraseBusy = busyAction === `phrase:${phrase.phrase_id}`;
                return (
                  <div key={phrase.phrase_id} className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">{phrase.movement_id} / {phrase.preset_id}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {phrase.section_label} · {formatDuration(phrase.start_seconds)} - {formatDuration(phrase.end_seconds)}
                        </p>
                      </div>
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{phrase.execution_mode}</div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {movementLibrary?.movements.map((entry) => (
                        <button
                          key={`${phrase.phrase_id}-${entry.movement_id}`}
                          type="button"
                          onClick={() => onPhraseMappingChange(phrase.phrase_id, { movement_id: entry.movement_id })}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            phrase.movement_id === entry.movement_id
                              ? "border-primary/40 bg-primary/15 text-white"
                              : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-primary/30 hover:text-white"
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
                            onClick={() =>
                              onPhraseMappingChange(phrase.phrase_id, {
                                movement_id: movement.movement_id,
                                preset_id: preset.preset_id,
                              })
                            }
                            className={`rounded-full border px-3 py-1 text-xs transition ${
                              phrase.preset_id === preset.preset_id
                                ? "border-sky-300/40 bg-sky-400/15 text-white"
                                : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-sky-300/30 hover:text-white"
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {(["unison", "mirror"] as ExecutionMode[]).map((mode) => (
                        <button
                          key={`${phrase.phrase_id}-${mode}`}
                          type="button"
                          onClick={() => onPhraseMappingChange(phrase.phrase_id, { execution_mode: mode })}
                          className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] transition ${
                            phrase.execution_mode === mode
                              ? "border-white/30 bg-white/10 text-white"
                              : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:text-white"
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                      <Button type="button" variant="ghost" size="sm" disabled className="ml-auto">
                        {phraseBusy ? "Saving..." : `Intensity ${Math.round(phrase.intensity * 100)}%`}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-5 text-sm text-slate-400">Phrase scheduling appears after analysis is stored for the selected track.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryTile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
      <p className="hud-label">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{note}</p>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">{text}</div>;
}
