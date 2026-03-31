import type { AudioAnalysis, ChoreographyTimeline } from "@/lib/types";

import { formatDuration } from "@/lib/analysis-view";

function cueCountInWindow(times: number[], start: number, end: number) {
  return times.filter((time) => time >= start && time < end).length;
}

export function StructurePanel({
  analysis,
  choreography,
}: {
  analysis: AudioAnalysis | null;
  choreography: ChoreographyTimeline | null;
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
