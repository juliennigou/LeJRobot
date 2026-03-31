import type {
  AutonomousPerformanceState,
  AnalysisStatusResponse,
  AudioAnalysis,
  ChoreographySchedule,
  ChoreographyTimeline,
  ScheduleConfig,
  TrackSummary,
} from "@/lib/types";

import { formatDate, formatDuration } from "@/lib/analysis-view";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/8 py-3 last:border-0">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-right text-sm font-medium text-white">{value}</span>
    </div>
  );
}

function StatBox({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
      <p className="hud-label">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{note}</p>
    </div>
  );
}

function StyleSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-white">{label}</p>
        <span className="text-sm text-slate-400">{value.toFixed(2)}</span>
      </div>
      <Slider className="mt-4" value={[value]} min={min} max={max} step={step} onValueChange={([next]) => onChange(next ?? value)} />
    </div>
  );
}

export function TrackInfoPanel({
  track,
  analysis,
  choreography,
  schedule,
  autonomy,
  analysisStatus,
  analysisLoading,
  analysisError,
  scheduleDraft,
  scheduleBusy,
  onScheduleStyleChange,
  onScheduleDensityChange,
  onScheduleIntensityChange,
  onApplyScheduleStyle,
  onResetScheduleStyle,
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
  scheduleDraft: ScheduleConfig | { style_id: string; density_scale: number; intensity_scale: number } | null;
  scheduleBusy: boolean;
  onScheduleStyleChange: (styleId: string) => void;
  onScheduleDensityChange: (value: number) => void;
  onScheduleIntensityChange: (value: number) => void;
  onApplyScheduleStyle: () => void;
  onResetScheduleStyle: () => void;
  autonomyBusy: boolean;
  onStartAutonomy: () => void;
  onStopAutonomy: () => void;
}) {
  const styles = schedule?.available_styles ?? [];
  const styleChanged =
    !!scheduleDraft &&
    !!schedule &&
    (scheduleDraft.style_id !== schedule.config.style_id ||
      Math.abs(scheduleDraft.density_scale - schedule.config.density_scale) > 0.001 ||
      Math.abs(scheduleDraft.intensity_scale - schedule.config.intensity_scale) > 0.001);

  return (
    <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
      <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
        <p className="hud-label">Track Metadata</p>
        <div className="mt-4">
          <MetaRow label="Title" value={track?.title ?? "No track selected"} />
          <MetaRow label="Artist" value={track?.artist ?? "--"} />
          <MetaRow label="Source" value={track?.source ?? "--"} />
          <MetaRow label="Duration" value={formatDuration(track?.duration_seconds)} />
          <MetaRow label="Analysis" value={analysisStatus?.status ?? track?.analysis_status ?? "none"} />
          <MetaRow label="Generated" value={analysis ? formatDate(analysis.generated_at) : "--"} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <StatBox label="Sample Rate" value={analysis ? `${analysis.sample_rate}` : "--"} note="Hz" />
          <StatBox label="Waveform" value={analysis ? `${analysis.waveform.bucket_count}` : "--"} note="display buckets" />
          <StatBox label="Choreo Cues" value={choreography ? `${choreography.global_cues.length}` : "--"} note="global motion events" />
        </div>
      </section>

      <section className="space-y-6">
        <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="hud-label">Scheduler Style</p>
              <p className="mt-1 text-sm text-slate-400">
                Choose the song-wide motion character, then shape how dense and intense the phrase map should feel.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={!styleChanged || scheduleBusy} onClick={onResetScheduleStyle}>
                Reset
              </Button>
              <Button disabled={!styleChanged || scheduleBusy} onClick={onApplyScheduleStyle}>
                {scheduleBusy ? "Applying..." : "Apply"}
              </Button>
            </div>
          </div>

          {schedule ? (
            <>
              <div className="mt-5 flex flex-wrap gap-2">
                {styles.map((style) => {
                  const active = scheduleDraft?.style_id === style.style_id;
                  return (
                    <button
                      key={style.style_id}
                      type="button"
                      onClick={() => onScheduleStyleChange(style.style_id)}
                      className={`rounded-full border px-4 py-2 text-sm transition ${
                        active
                          ? "border-primary/40 bg-primary/15 text-white"
                          : "border-white/10 bg-black/20 text-slate-300 hover:border-primary/30 hover:text-white"
                      }`}
                    >
                      {style.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <StyleSlider
                  label="Phrase Density"
                  value={scheduleDraft?.density_scale ?? schedule.config.density_scale}
                  min={0.5}
                  max={2}
                  step={0.05}
                  onChange={onScheduleDensityChange}
                />
                <StyleSlider
                  label="Phrase Intensity"
                  value={scheduleDraft?.intensity_scale ?? schedule.config.intensity_scale}
                  min={0.5}
                  max={1.5}
                  step={0.05}
                  onChange={onScheduleIntensityChange}
                />
              </div>
            </>
          ) : (
            <p className="mt-5 text-sm text-slate-400">Generate a schedule to unlock style controls.</p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
            <p className="hud-label">Pipeline State</p>
            <div className="mt-4 space-y-4">
              <MetaRow
                label="Analysis"
                value={
                  analysisLoading
                    ? "processing"
                    : analysisError
                      ? "error"
                      : analysis
                        ? "ready"
                        : "idle"
                }
              />
              <MetaRow label="Schedule" value={schedule ? "ready" : "pending"} />
              <MetaRow label="Autonomy" value={autonomy.status} />
            </div>
            {analysisError ? <p className="mt-4 text-sm text-red-300">{analysisError}</p> : null}
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="hud-label">Autonomous Playback</p>
                <p className="mt-1 text-sm text-slate-400">{autonomy.note ?? "No autonomous phrase currently active."}</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <StatBox label="Status" value={autonomy.status} note={schedule ? `${schedule.phrase_count} scheduled phrases` : "No schedule yet"} />
              <StatBox label="Next Layer" value={schedule ? schedule.config.style_id : "--"} note="current schedule style" />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button disabled={!schedule || autonomyBusy} onClick={onStartAutonomy}>
                {autonomyBusy ? "Starting..." : "Start Autonomous"}
              </Button>
              <Button variant="ghost" disabled={autonomyBusy || autonomy.status === "idle"} onClick={onStopAutonomy}>
                Stop Autonomous
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
