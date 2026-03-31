import { Activity, Disc3, Sparkles, Waves } from "lucide-react";

import type { AudioAnalysis, ChoreographyTimeline } from "@/lib/types";
import { average, beatDensity, currentSection, downsample, sampleSeries } from "@/lib/analysis-view";
import { Progress } from "@/components/ui/progress";

function MiniBars({ values }: { values: number[] }) {
  const bars = downsample(values, 36);
  const max = Math.max(...bars, 0.0001);
  return (
    <div className="flex h-20 items-end gap-1 rounded-[22px] border border-white/10 bg-slate-950/80 px-3 py-3">
      {bars.map((value, index) => (
        <div
          key={`${index}-${value}`}
          className="flex-1 rounded-full bg-gradient-to-t from-blue-600/70 via-sky-400 to-white"
          style={{ height: `${Math.max(10, (value / max) * 100)}%`, opacity: 0.35 + value / max / 2 }}
        />
      ))}
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-300">{label}</span>
        <span className="text-sm font-medium text-white">{Math.round(value * 100)}%</span>
      </div>
      <Progress className="mt-4" value={Math.max(0, Math.min(100, value * 100))} />
    </div>
  );
}

function Metric({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Disc3;
}) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="hud-label">{label}</span>
        <Icon className="h-4 w-4 text-sky-300" />
      </div>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{note}</p>
    </div>
  );
}

export function RhythmPanel({
  analysis,
  choreography,
  currentTime,
}: {
  analysis: AudioAnalysis | null;
  choreography: ChoreographyTimeline | null;
  currentTime: number;
}) {
  if (!analysis) {
    return <EmptyPanel text="Rhythm metrics appear once a selected track has been analyzed." />;
  }

  const frameIndex = Math.floor(currentTime * analysis.energy.frame_hz);
  const low = sampleSeries(analysis.bands.low, frameIndex);
  const mid = sampleSeries(analysis.bands.mid, frameIndex);
  const high = sampleSeries(analysis.bands.high, frameIndex);
  const rms = sampleSeries(analysis.energy.rms, frameIndex);
  const onset = sampleSeries(analysis.energy.onset_strength, frameIndex);
  const section = currentSection(analysis.sections, currentTime);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Tempo"
          value={analysis.bpm.toFixed(1)}
          note={`${Math.round(analysis.tempo_confidence * 100)}% confidence`}
          icon={Disc3}
        />
        <Metric
          label="Beat Density"
          value={`${beatDensity(analysis).toFixed(2)}/s`}
          note={`${analysis.beats.length} beats across the song`}
          icon={Activity}
        />
        <Metric
          label="Downbeats"
          value={`${analysis.downbeats.length}`}
          note="Bar-level anchors from the beat grid"
          icon={Waves}
        />
        <Metric
          label="Cue Stream"
          value={choreography ? `${choreography.global_cues.length}` : "--"}
          note={choreography ? "Global motion events attached to the rhythm grid" : "No choreography loaded yet"}
          icon={Sparkles}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="hud-label">Rhythm Energy</p>
              <p className="mt-1 text-sm text-slate-400">Energy and onset curves condensed into a clean beat-facing readout.</p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
              {section ? `${section.label} section` : "no section"}
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-300">Onset activity</span>
                <span className="text-slate-400">{Math.round(average(analysis.energy.onset_strength) * 100)}% average</span>
              </div>
              <MiniBars values={analysis.energy.onset_strength} />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-300">RMS loudness</span>
                <span className="text-slate-400">{Math.round(average(analysis.energy.rms) * 100)}% average</span>
              </div>
              <MiniBars values={analysis.energy.rms} />
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
          <div>
            <p className="hud-label">Band Snapshot</p>
            <p className="mt-1 text-sm text-slate-400">Live values at the current playhead without overemphasizing them.</p>
          </div>

          <div className="mt-5 grid gap-3">
            <Meter label="Low band" value={low} />
            <Meter label="Mid band" value={mid} />
            <Meter label="High band" value={high} />
            <Meter label="RMS" value={rms} />
            <Meter label="Onset" value={onset} />
          </div>
        </section>
      </div>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">{text}</div>;
}
