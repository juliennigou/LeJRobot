import type { AudioAnalysis, SongSection } from "@/lib/types";

import { Badge } from "@/components/ui/badge";
import { downsample } from "@/lib/analysis-view";

function activeSection(sections: SongSection[], timeSeconds: number) {
  return (
    sections.find((section) => timeSeconds >= section.start_seconds && timeSeconds < section.end_seconds) ??
    sections[0] ??
    null
  );
}

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

  const columns = 84;
  const rows = [
    { label: "High", values: downsample(analysis.bands.high, columns) },
    { label: "Mid", values: downsample(analysis.bands.mid, columns) },
    { label: "Low", values: downsample(analysis.bands.low, columns) },
    { label: "Centroid", values: downsample(analysis.spectral.centroid, columns) },
    { label: "Rolloff", values: downsample(analysis.spectral.rolloff, columns) },
  ];
  const current = activeSection(analysis.sections, currentTime);
  const progress = analysis.duration_seconds > 0 ? Math.min(100, (currentTime / analysis.duration_seconds) * 100) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
      <div className="rounded-[30px] border border-white/10 bg-black/25 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="hud-label">Spectrogram</p>
            <p className="mt-2 text-lg text-slate-300">
              A compact heatmap built from backend spectral envelopes and band energy data.
            </p>
          </div>
          <Badge variant="muted">{columns} columns</Badge>
        </div>

        <div className="mt-6 space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[72px_1fr] items-center gap-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{row.label}</p>
              <div className="grid h-14 grid-cols-[repeat(84,minmax(0,1fr))] gap-1 rounded-[20px] border border-white/10 bg-slate-950/90 p-2">
                {row.values.map((value, index) => (
                  <div
                    key={`${row.label}-${index}`}
                    className="rounded-full"
                    style={{
                      background: `linear-gradient(180deg, rgba(244,248,255,${0.15 + value * 0.35}), rgba(77,160,255,${0.22 + value * 0.75}), rgba(3,12,26,0.96))`,
                      opacity: 0.35 + value * 0.8,
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-slate-300">Playhead</span>
            <span className="text-sm font-medium text-white">{progress.toFixed(1)}%</span>
          </div>
          <div className="mt-4 h-2 rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-sky-500 via-blue-300 to-white" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div className="rounded-[30px] border border-white/10 bg-black/25 p-6">
        <p className="hud-label">Live Section</p>
        <p className="mt-4 text-3xl font-semibold capitalize text-white">{current?.label ?? "unknown"}</p>
        <p className="mt-3 text-sm text-slate-400">
          The current section is inferred from energy and onset-density changes, then aligned to the analysis timeline.
        </p>

        <div className="mt-6 space-y-4">
          {analysis.sections.map((section, index) => {
            const isActive = current?.start_seconds === section.start_seconds && current?.end_seconds === section.end_seconds;
            return (
              <div
                key={`${section.label}-${index}`}
                className={isActive ? "rounded-[22px] border border-primary/40 bg-primary/[0.08] p-4" : "rounded-[22px] border border-white/10 bg-white/[0.04] p-4"}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium capitalize text-white">{section.label}</span>
                  <span className="text-xs text-slate-400">
                    {section.start_seconds.toFixed(1)}s - {section.end_seconds.toFixed(1)}s
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
                  <span>Energy {Math.round(section.energy_mean * 100)}%</span>
                  <span>Density {Math.round(section.density_mean * 100)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="rounded-[30px] border border-white/10 bg-black/25 p-6 text-sm text-slate-400">{text}</div>;
}
