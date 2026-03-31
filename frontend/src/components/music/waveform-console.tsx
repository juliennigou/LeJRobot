import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { Pause, Play, TimerReset, Waves } from "lucide-react";

import type { AudioAnalysis, SongSection, TrackSummary } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function formatClock(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function activeSection(sections: SongSection[], currentTime: number) {
  return (
    sections.find((section) => currentTime >= section.start_seconds && currentTime < section.end_seconds) ??
    sections[0] ??
    null
  );
}

function isAbortError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === "AbortError" || error.message.toLowerCase().includes("aborted");
}

export function WaveformConsole({
  track,
  analysis,
  currentTime,
  transportPlaying,
  onTimeChange,
  onTransportChange,
}: {
  track: TrackSummary | null;
  analysis: AudioAnalysis | null;
  currentTime: number;
  transportPlaying: boolean;
  onTimeChange: (value: number) => void;
  onTransportChange: (playing: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const onTimeChangeRef = useRef(onTimeChange);
  const onTransportChangeRef = useRef(onTransportChange);
  const [ready, setReady] = useState(false);
  const [waveformError, setWaveformError] = useState<string | null>(null);

  useEffect(() => {
    onTimeChangeRef.current = onTimeChange;
  }, [onTimeChange]);

  useEffect(() => {
    onTransportChangeRef.current = onTransportChange;
  }, [onTransportChange]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const waveSurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "rgba(87, 169, 255, 0.3)",
      progressColor: "rgba(162, 219, 255, 0.95)",
      cursorColor: "#f8fafc",
      cursorWidth: 2,
      barWidth: 3,
      barGap: 2,
      barRadius: 999,
      height: 220,
      normalize: true,
      dragToSeek: true,
    });

    waveSurferRef.current = waveSurfer;

    waveSurfer.on("ready", () => {
      setReady(true);
      setWaveformError(null);
      onTimeChangeRef.current(0);
    });

    waveSurfer.on("timeupdate", (time) => {
      onTimeChangeRef.current(time);
    });

    waveSurfer.on("play", () => {
      onTransportChangeRef.current(true);
    });

    waveSurfer.on("pause", () => {
      onTransportChangeRef.current(false);
    });

    waveSurfer.on("finish", () => {
      onTimeChangeRef.current(0);
      onTransportChangeRef.current(false);
    });

    waveSurfer.on("error", (error) => {
      if (isAbortError(error)) {
        return;
      }
      setReady(false);
      setWaveformError(error instanceof Error ? error.message : String(error));
      onTransportChangeRef.current(false);
    });

    return () => {
      waveSurfer.unAll();
      try {
        waveSurfer.destroy();
      } catch (error) {
        if (!isAbortError(error)) {
          throw error;
        }
      }
      waveSurferRef.current = null;
    };
  }, []);

  useEffect(() => {
    const waveSurfer = waveSurferRef.current;
    if (!waveSurfer) {
      return;
    }

    setReady(false);
    setWaveformError(null);
    onTimeChangeRef.current(0);

    if (!track?.audio_url) {
      waveSurfer.empty();
      return;
    }

    void waveSurfer.load(track.audio_url).catch((error) => {
      if (isAbortError(error)) {
        return;
      }
      setReady(false);
      setWaveformError(error instanceof Error ? error.message : String(error));
      onTransportChangeRef.current(false);
    });
  }, [track?.audio_url, track?.track_id]);

  const duration = analysis?.duration_seconds ?? track?.duration_seconds ?? 0;
  const markerDuration = duration > 0 ? duration : 1;
  const section = analysis ? activeSection(analysis.sections, currentTime) : null;

  return (
    <section className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(7,13,24,0.94),rgba(4,8,16,0.98))] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge>Waveform Console</Badge>
            <Badge variant="muted">{track?.source ?? "no source"}</Badge>
            <Badge variant="accent">{ready ? "Preview Ready" : track ? "Loading Preview" : "Waiting on Track"}</Badge>
          </div>
          <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
            {track ? `${track.title} - ${track.artist}` : "Select a track to inspect the waveform"}
          </h2>
          <p className="mt-3 max-w-3xl text-sm text-slate-300 sm:text-base">
            The waveform is now the main playback surface. Beat markers, downbeats, and section boundaries are derived
            from the backend analysis payload so this view stays aligned with the choreography timeline.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <ConsoleStat label="Time" value={formatClock(currentTime)} />
          <ConsoleStat label="Duration" value={formatClock(duration)} />
          <ConsoleStat label="Section" value={section?.label ?? "unknown"} />
        </div>
      </div>

      <div className="mt-6 rounded-[28px] border border-white/10 bg-black/25 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
              <Waves className="h-4 w-4 text-primary" />
              {analysis ? `${analysis.waveform.bucket_count} waveform samples` : "Live audio preview"}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
              {analysis ? `${analysis.beats.length} beats` : "No beat markers yet"}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
              {analysis ? `${analysis.sections.length} sections` : "No sections yet"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              disabled={!track?.audio_url || !ready}
              onClick={() => {
                waveSurferRef.current?.playPause();
              }}
            >
              {transportPlaying ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
              {transportPlaying ? "Pause Preview" : "Play Preview"}
            </Button>
            <Button
              variant="ghost"
              disabled={!track?.audio_url}
              onClick={() => {
                waveSurferRef.current?.setTime(0);
                onTimeChange(0);
              }}
            >
              <TimerReset className="mr-2 h-4 w-4" />
              Restart
            </Button>
          </div>
        </div>

        <div className="relative mt-6 overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,18,31,0.92),rgba(6,11,21,0.98))] px-4 py-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,rgba(126,190,255,0.14),transparent)]" />
          <div className="pointer-events-none absolute inset-y-6 left-4 right-4 z-20">
            {analysis?.sections.map((item, index) => {
              const left = `${(item.start_seconds / markerDuration) * 100}%`;
              const width = `${Math.max(1.5, ((item.end_seconds - item.start_seconds) / markerDuration) * 100)}%`;
              return (
                <div
                  key={`${item.label}-${index}`}
                  className="absolute inset-y-0 rounded-2xl border border-primary/15 bg-primary/[0.06]"
                  style={{ left, width }}
                >
                  <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-slate-200">
                    {item.label}
                  </span>
                </div>
              );
            })}

            {analysis?.beats.map((beat, index) => {
              const isDownbeat = analysis.downbeats.some((downbeat) => Math.abs(downbeat - beat) < 0.03);
              return (
                <div
                  key={`beat-${index}`}
                  className={isDownbeat ? "absolute inset-y-0 w-px bg-white/60" : "absolute inset-y-4 w-px bg-primary/30"}
                  style={{ left: `${(beat / markerDuration) * 100}%` }}
                />
              );
            })}

            <div
              className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_20px_rgba(255,255,255,0.55)]"
              style={{ left: `${Math.min(100, (currentTime / markerDuration) * 100)}%` }}
            />
          </div>

          <div ref={containerRef} className="relative z-10 min-h-[220px]" />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
          <div className="flex flex-wrap items-center gap-4">
            <span>0:00</span>
            <div className="h-px w-24 bg-white/10 sm:w-40" />
            <span>{formatClock(duration)}</span>
          </div>
          {waveformError ? <span className="text-red-200">{waveformError}</span> : null}
          {!track?.audio_url ? <span>Preview URL not available for this track.</span> : null}
        </div>
      </div>
    </section>
  );
}

function ConsoleStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-3">
      <p className="hud-label">{label}</p>
      <p className="mt-2 text-lg font-semibold capitalize text-white">{value}</p>
    </div>
  );
}
