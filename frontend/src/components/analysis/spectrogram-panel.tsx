import type { AudioAnalysis } from "@/lib/types";

import { Badge } from "@/components/ui/badge";
import { downsample, formatDuration } from "@/lib/analysis-view";

export function SpectrogramPanel({
  analysis,
  currentTime,
}: {
  analysis: AudioAnalysis | null;
  currentTime: number;
}) {
  if (!analysis) {
    return <EmptyPanel text="Select a track and wait for analysis to see the spectrogram view." />;
  }

  const columns = 96;
  const rows = [
    { label: "High", values: downsample(analysis.bands.high, columns) },
    { label: "Mid", values: downsample(analysis.bands.mid, columns) },
    { label: "Low", values: downsample(analysis.bands.low, columns) },
    { label: "Centroid", values: downsample(analysis.spectral.centroid, columns) },
    { label: "Rolloff", values: downsample(analysis.spectral.rolloff, columns) },
  ];
  const progress = analysis.duration_seconds > 0 ? Math.min(100, (currentTime / analysis.duration_seconds) * 100) : 0;

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="hud-label">Spectral Heatmap</p>
            <p className="mt-1 text-sm text-slate-400">Backend-derived frequency energy and spectral envelopes, flattened into one responsive view.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="muted">{columns} slices</Badge>
            <Badge variant="muted">{formatDuration(currentTime)} / {formatDuration(analysis.duration_seconds)}</Badge>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[64px_1fr] items-center gap-3 sm:grid-cols-[80px_1fr]">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{row.label}</p>
              <div className="grid h-16 grid-cols-[repeat(96,minmax(0,1fr))] gap-px overflow-hidden rounded-[20px] border border-white/10 bg-slate-950/80 p-2">
                {row.values.map((value, index) => (
                  <div
                    key={`${row.label}-${index}`}
                    className="rounded-full"
                    style={{
                      background: `linear-gradient(180deg, rgba(255,255,255,${0.08 + value * 0.18}), rgba(88,166,255,${0.12 + value * 0.7}), rgba(7,13,24,0.96))`,
                      opacity: 0.3 + value * 0.85,
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-300">Playhead</span>
            <span className="text-slate-400">{progress.toFixed(1)}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-blue-500 via-sky-300 to-white" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <SpectralMetric label="Low" values={analysis.bands.low} />
        <SpectralMetric label="Mid" values={analysis.bands.mid} />
        <SpectralMetric label="High" values={analysis.bands.high} />
      </section>
    </div>
  );
}

function SpectralMetric({ label, values }: { label: string; values: number[] }) {
  const averageValue = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
      <p className="hud-label">{label} Average</p>
      <p className="mt-3 text-2xl font-semibold text-white">{Math.round(averageValue * 100)}%</p>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">{text}</div>;
}
