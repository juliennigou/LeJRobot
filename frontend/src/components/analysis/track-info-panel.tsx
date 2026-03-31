import type {
  AutonomousPerformanceState,
  AnalysisStatusResponse,
  AudioAnalysis,
  ChoreographySchedule,
  ChoreographyTimeline,
  TrackSummary,
} from "@/lib/types";

import { formatDate, formatDuration } from "@/lib/analysis-view";
import { Button } from "@/components/ui/button";

export function TrackInfoPanel({
  track,
  analysis,
  choreography,
  schedule,
  autonomy,
  analysisStatus,
  analysisLoading,
  analysisError,
  autonomyBusy,
  onStartAutonomy,
  onStopAutonomy,
}: {
  track: TrackSummary | null;
  analysis: AudioAnalysis | null;
  choreography: ChoreographyTimeline | null;
  schedule: ChoreographySchedule | null;
  autonomy: AutonomousPerformanceState;
  analysisStatus: AnalysisStatusResponse | null;
  analysisLoading: boolean;
  analysisError: string | null;
  autonomyBusy: boolean;
  onStartAutonomy: () => void;
  onStopAutonomy: () => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="rounded-[30px] border border-white/10 bg-black/25 p-6">
        <p className="hud-label">Track Info</p>
        <div className="mt-6 space-y-4 text-sm text-slate-300">
          <InfoRow label="Title" value={track?.title ?? "No track selected"} />
          <InfoRow label="Artist" value={track?.artist ?? "No track selected"} />
          <InfoRow label="Source" value={track?.source ?? "--"} />
          <InfoRow label="Duration" value={formatDuration(track?.duration_seconds)} />
          <InfoRow label="Analysis Status" value={analysisStatus?.status ?? track?.analysis_status ?? "none"} />
          <InfoRow label="Generated At" value={analysis ? formatDate(analysis.generated_at) : "--"} />
        </div>
      </div>

      <div className="rounded-[30px] border border-white/10 bg-black/25 p-6">
        <p className="hud-label">Analysis Ops</p>
        <div className="mt-6 space-y-4">
          <Banner
            title={analysisLoading ? "Analysis running" : analysis ? "Analysis ready" : "Waiting on track"}
            note={
              analysisLoading
                ? "The backend is decoding the audio and computing the rhythm and structure envelopes."
                : analysis
                  ? `Audio analysis is ready with ${analysis.beats.length} beats and ${analysis.sections.length} sections.`
                  : "Select a track to start the analysis pipeline."
            }
          />
          <Banner
            title={analysisError ? "Analysis error" : choreography ? "Choreography ready" : "Cue timeline pending"}
            note={
              analysisError
                ? analysisError
                : choreography
                  ? `${choreography.global_cues.length} global cues are ready for the dual-arm choreography layer.`
                  : "Choreography cues appear after the analysis payload is loaded."
            }
          />
          <Banner
            title={schedule ? "Scheduler ready" : "Scheduler pending"}
            note={
              schedule
                ? `${schedule.phrase_count} phrase windows are mapped from the current analysis for future autonomous playback.`
                : "The phrase scheduler appears after analysis is available for the selected track."
            }
          />
          <Banner
            title={`Autonomy ${autonomy.status}`}
            note={autonomy.note ?? "Autonomous playback is idle."}
          />
          <div className="flex flex-wrap gap-3">
            <Button disabled={!schedule || autonomyBusy} onClick={onStartAutonomy}>
              {autonomyBusy ? "Starting..." : "Start Autonomous"}
            </Button>
            <Button variant="ghost" disabled={autonomyBusy || autonomy.status === "idle"} onClick={onStopAutonomy}>
              Stop Autonomous
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <InfoTile label="Sample Rate" value={analysis ? `${analysis.sample_rate} Hz` : "--"} />
            <InfoTile label="Waveform Buckets" value={analysis ? `${analysis.waveform.bucket_count}` : "--"} />
            <InfoTile label="Tempo Confidence" value={analysis ? `${Math.round(analysis.tempo_confidence * 100)}%` : "--"} />
            <InfoTile label="Phrases" value={schedule ? `${schedule.phrase_count}` : "--"} />
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-3">
      <span className="text-slate-400">{label}</span>
      <span className="text-right text-white">{value}</span>
    </div>
  );
}

function Banner({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
      <p className="text-base font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm text-slate-400">{note}</p>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
      <p className="hud-label">{label}</p>
      <p className="mt-3 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}
