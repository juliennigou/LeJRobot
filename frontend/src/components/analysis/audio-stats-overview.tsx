import { Activity, AudioWaveform, Clock3, Disc3, Sparkles } from "lucide-react";

import type { AnalysisStatusResponse, AudioAnalysis, ChoreographySchedule, TrackSummary } from "@/lib/types";
import { average, downsample, formatDuration } from "@/lib/analysis-view";
import { Badge } from "@/components/ui/badge";

function MiniSparkline({ values }: { values: number[] }) {
  const points = downsample(values, 32);
  if (!points.length) {
    return <div className="h-14 rounded-2xl border border-white/10 bg-white/[0.03]" />;
  }

  const max = Math.max(...points, 0.0001);

  return (
    <div className="flex h-14 items-end gap-1 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2">
      {points.map((value, index) => (
        <div
          key={`${index}-${value}`}
          className="flex-1 rounded-full bg-gradient-to-t from-sky-600/70 via-sky-400/85 to-white"
          style={{ height: `${Math.max(12, (value / max) * 100)}%`, opacity: 0.4 + value / max / 2 }}
        />
      ))}
    </div>
  );
}

function OverviewMetric({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof Disc3;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="hud-label">{label}</span>
        <Icon className="h-4 w-4 text-sky-300" />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{note}</p>
    </div>
  );
}

export function AudioStatsOverview({
  track,
  analysis,
  schedule,
  analysisStatus,
  currentTime,
}: {
  track: TrackSummary | null;
  analysis: AudioAnalysis | null;
  schedule: ChoreographySchedule | null;
  analysisStatus: AnalysisStatusResponse | null;
  currentTime: number;
}) {
  const energy = analysis ? average(analysis.energy.rms) : 0;
  const position = analysis ? Math.min(currentTime, analysis.duration_seconds) : currentTime;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Audio Stats</Badge>
            <Badge variant="muted">{analysisStatus?.status ?? track?.analysis_status ?? "none"}</Badge>
            {schedule ? <Badge variant="accent">{schedule.config.style_id}</Badge> : null}
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {track?.title ?? "Select a song"}
            </h1>
            <p className="mt-1 text-sm text-slate-400 sm:text-base">
              {track ? `${track.artist} · ${track.source}` : "Choose a track to inspect rhythm, structure, and choreography."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="hud-label">Duration</p>
            <p className="mt-2 text-sm font-medium text-white">{formatDuration(track?.duration_seconds)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="hud-label">Position</p>
            <p className="mt-2 text-sm font-medium text-white">{formatDuration(position)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="hud-label">Beats</p>
            <p className="mt-2 text-sm font-medium text-white">{analysis ? analysis.beats.length : "--"}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="hud-label">Phrases</p>
            <p className="mt-2 text-sm font-medium text-white">{schedule ? schedule.phrase_count : "--"}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewMetric
            icon={Disc3}
            label="Tempo"
            value={analysis ? analysis.bpm.toFixed(1) : "--"}
            note={analysis ? `${Math.round(analysis.tempo_confidence * 100)}% confidence` : "Awaiting analysis"}
          />
          <OverviewMetric
            icon={Sparkles}
            label="Energy"
            value={analysis ? `${Math.round(energy * 100)}%` : "--"}
            note={analysis ? "Mean RMS across the full track" : "Awaiting analysis"}
          />
          <OverviewMetric
            icon={Activity}
            label="Sections"
            value={analysis ? `${analysis.sections.length}` : "--"}
            note={analysis ? "Detected structural blocks" : "Awaiting analysis"}
          />
          <OverviewMetric
            icon={Clock3}
            label="Schedule"
            value={schedule ? `${schedule.phrase_count}` : "--"}
            note={schedule ? `${schedule.config.style_id} phrase map` : "No schedule generated yet"}
          />
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="hud-label">Energy Profile</p>
              <p className="mt-1 text-sm text-slate-400">Quick read of the analyzed envelope.</p>
            </div>
            <AudioWaveform className="h-4 w-4 text-sky-300" />
          </div>
          <div className="mt-4">
            <MiniSparkline values={analysis?.energy.rms ?? []} />
          </div>
        </div>
      </div>
    </section>
  );
}
