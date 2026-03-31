import { Activity, AudioLines, Disc3 } from "lucide-react";

import type { AudioAnalysis, ChoreographyTimeline, SongSection } from "@/lib/types";
import { Progress } from "@/components/ui/progress";
import { average, beatDensity, currentSection, sampleSeries } from "@/lib/analysis-view";

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
  const current = currentSection(analysis.sections, currentTime);
  const low = sampleSeries(analysis.bands.low, frameIndex);
  const mid = sampleSeries(analysis.bands.mid, frameIndex);
  const high = sampleSeries(analysis.bands.high, frameIndex);
  const rms = sampleSeries(analysis.energy.rms, frameIndex);
  const onset = sampleSeries(analysis.energy.onset_strength, frameIndex);

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="grid gap-4">
        <MetricCard label="Detected BPM" value={analysis.bpm.toFixed(2)} progress={Math.min(100, (analysis.bpm / 180) * 100)} icon={Disc3} />
        <MetricCard label="Tempo Confidence" value={`${Math.round(analysis.tempo_confidence * 100)}%`} progress={analysis.tempo_confidence * 100} icon={Activity} />
        <MetricCard label="Beat Density" value={`${beatDensity(analysis).toFixed(2)} / sec`} progress={Math.min(100, beatDensity(analysis) * 25)} icon={AudioLines} />
      </div>

      <div className="rounded-[30px] border border-white/10 bg-black/25 p-6">
        <p className="hud-label">Live Envelope Readout</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <EnvelopeCard label="RMS Energy" value={rms} />
          <EnvelopeCard label="Onset Strength" value={onset} />
          <EnvelopeCard label="Low Band" value={low} />
          <EnvelopeCard label="Mid Band" value={mid} />
          <EnvelopeCard label="High Band" value={high} />
          <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
            <p className="hud-label">Current Section</p>
            <p className="mt-3 text-lg font-semibold capitalize text-white">{current?.label ?? "unknown"}</p>
            <p className="mt-2 text-sm text-slate-400">
              {current ? `${current.start_seconds.toFixed(1)}s - ${current.end_seconds.toFixed(1)}s` : "No section boundary"}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
          <p className="hud-label">Beat Timeline</p>
          <div className="mt-4 flex h-24 items-end gap-2 overflow-hidden rounded-[20px] border border-white/10 bg-slate-950/80 px-3 py-3">
            {analysis.beats.slice(0, 64).map((beat, index) => {
              const nextBeat = analysis.beats[index + 1] ?? beat + 0.5;
              const span = Math.max(0.15, nextBeat - beat);
              const height = Math.min(100, 28 + span * 80 + (index % 4 === 0 ? 18 : 0));
              return <div key={`${beat}-${index}`} className="flex-1 rounded-full bg-gradient-to-t from-sky-600 via-blue-300 to-white/90" style={{ height: `${height}%` }} />;
            })}
          </div>
          <p className="mt-3 text-sm text-slate-400">
            {choreography
              ? `${choreography.global_cues.length} global cues and ${choreography.arm_left_cues.length + choreography.arm_right_cues.length} arm cues are already attached to this rhythm grid.`
              : "Choreography cues appear after the analysis payload is loaded."}
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <SummaryTile label="Mean RMS" value={average(analysis.energy.rms).toFixed(2)} />
          <SummaryTile label="Downbeats" value={`${analysis.downbeats.length}`} />
          <SummaryTile label="Sections" value={`${analysis.sections.length}`} />
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  progress,
  icon: Icon,
}: {
  label: string;
  value: string;
  progress: number;
  icon: typeof Disc3;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/25 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="hud-label">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-4 text-3xl font-semibold text-white">{value}</p>
      <Progress className="mt-4" value={progress} />
    </div>
  );
}

function EnvelopeCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-300">{label}</span>
        <span className="text-sm font-medium text-white">{Math.round(value * 100)}%</span>
      </div>
      <Progress className="mt-4" value={value * 100} />
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
      <p className="hud-label">{label}</p>
      <p className="mt-3 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="rounded-[30px] border border-white/10 bg-black/25 p-6 text-sm text-slate-400">{text}</div>;
}
