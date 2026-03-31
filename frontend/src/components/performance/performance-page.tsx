import { useEffect, useRef, useState } from "react";
import { Music2, Play, Search, Square } from "lucide-react";

import type {
  AnalysisStatusResponse,
  AudioAnalysis,
  AutonomousPerformanceState,
  ChoreographySchedule,
  TrackSummary,
} from "@/lib/types";
import { formatDuration } from "@/lib/analysis-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WaveformConsole } from "@/components/music/waveform-console";

export function PerformancePage({
  searchQuery,
  onSearchQueryChange,
  onSearch,
  searching,
  searchError,
  results,
  currentTrack,
  analysis,
  analysisStatus,
  schedule,
  autonomy,
  autonomyBusy,
  currentTime,
  transportPlaying,
  onTimeChange,
  onTransportChange,
  onSelectTrack,
  onStartAutonomy,
  onStopAutonomy,
}: {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearch: () => void;
  searching: boolean;
  searchError: string | null;
  results: TrackSummary[];
  currentTrack: TrackSummary | null;
  analysis: AudioAnalysis | null;
  analysisStatus: AnalysisStatusResponse | null;
  schedule: ChoreographySchedule | null;
  autonomy: AutonomousPerformanceState;
  autonomyBusy: boolean;
  currentTime: number;
  transportPlaying: boolean;
  onTimeChange: (value: number) => void;
  onTransportChange: (playing: boolean, positionSeconds?: number) => void;
  onSelectTrack: (track: TrackSummary) => void;
  onStartAutonomy: () => void;
  onStopAutonomy: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [mediaElement, setMediaElement] = useState<HTMLAudioElement | null>(null);
  const readyToDance = !!currentTrack && !!schedule && schedule.phrase_count > 0;
  const currentStatus = analysisStatus?.status ?? currentTrack?.analysis_status ?? "none";
  const showResults = searching || !currentTrack;
  const summaryItems = [
    { label: "status", value: currentStatus },
    { label: "bpm", value: analysis ? analysis.bpm.toFixed(1) : "--" },
    { label: "phrases", value: schedule ? String(schedule.phrase_count) : "--" },
    { label: "style", value: schedule?.style_id ?? "--" },
  ];

  useEffect(() => {
    if (audioRef.current && audioRef.current !== mediaElement) {
      setMediaElement(audioRef.current);
    }
  }, [mediaElement]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (!currentTrack?.audio_url) {
      audio.pause();
      audio.currentTime = 0;
      return;
    }

    if (audio.src !== currentTrack.audio_url) {
      audio.src = currentTrack.audio_url;
      audio.load();
    }

    if (transportPlaying) {
      void audio.play().catch(() => undefined);
      return;
    }

    audio.pause();
    if (autonomy.status === "idle") {
      audio.currentTime = 0;
    }
  }, [autonomy.status, currentTrack?.audio_url, transportPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const handleTimeUpdate = () => {
      onTimeChange(audio.currentTime);
    };

    const handlePlay = () => {
      onTransportChange(true, audio.currentTime);
    };

    const handlePause = () => {
      onTransportChange(false, audio.currentTime);
    };

    const handleSeeked = () => {
      onTimeChange(audio.currentTime);
      onTransportChange(!audio.paused, audio.currentTime);
    };

    const handleEnded = () => {
      onTimeChange(0);
      onTransportChange(false, 0);
      if (autonomy.status !== "idle") {
        onStopAutonomy();
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("seeked", handleSeeked);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("seeked", handleSeeked);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [autonomy.status, onStopAutonomy, onTimeChange, onTransportChange]);

  return (
    <section className="grid gap-6">
      <audio
        ref={(node) => {
          audioRef.current = node;
        }}
        preload="auto"
      />
      <div className="grid gap-6">
        <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,29,0.96),rgba(4,9,18,0.98))] px-5 py-5 shadow-[0_30px_80px_rgba(0,0,0,0.35)] sm:px-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <form
                className="flex flex-1 flex-col gap-3 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSearch();
                }}
              >
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => onSearchQueryChange(event.target.value)}
                    placeholder="Select a song and start the performance"
                    className="h-13 rounded-full border-white/10 bg-black/20 pl-11 pr-5 text-base"
                  />
                </div>
                <Button type="submit" size="lg" className="rounded-full px-6 sm:min-w-28" disabled={searching}>
                  {searching ? "Searching..." : "Search"}
                </Button>
              </form>

              <div className="flex flex-wrap gap-2">
                <Button className="rounded-full px-5" disabled={!readyToDance || autonomyBusy} onClick={onStartAutonomy}>
                  <Play className="mr-2 h-4 w-4" />
                  {autonomyBusy ? "Starting..." : "Start Dance"}
                </Button>
                <Button variant="ghost" className="rounded-full px-5" disabled={autonomyBusy || autonomy.status === "idle"} onClick={onStopAutonomy}>
                  <Square className="mr-2 h-4 w-4" />
                  Stop
                </Button>
              </div>
            </div>

            {searchError ? <p className="text-sm text-red-200">{searchError}</p> : null}

            {showResults ? (
              <div className="grid gap-2">
                {results.slice(0, 5).map((track) => (
                  <button
                    key={`${track.source}-${track.track_id}`}
                    type="button"
                    onClick={() => onSelectTrack(track)}
                    className="flex items-center justify-between gap-4 rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-primary/30 hover:bg-white/[0.05]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                        <Music2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{track.title}</p>
                        <p className="truncate text-xs text-slate-400">{track.artist}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge variant={track.source === "local" ? "accent" : "muted"}>{track.source}</Badge>
                      <span className="text-xs text-slate-400">{formatDuration(track.duration_seconds)}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-2xl font-semibold text-white">
                    {currentTrack ? currentTrack.title : "No track selected"}
                  </p>
                  <p className="mt-1 truncate text-sm text-slate-400">
                    {currentTrack ? `${currentTrack.artist} · ${currentTrack.source}` : "Select a track to prepare the dance."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {summaryItems.map((item) => (
                    <CompactChip key={item.label} label={item.label} value={item.value} />
                  ))}
                  <CompactChip label="dance" value={autonomy.status} />
                </div>
              </div>
            )}
          </div>
        </div>

        <WaveformConsole
          track={currentTrack}
          analysis={analysis}
          schedule={schedule}
          currentTime={currentTime}
          transportPlaying={transportPlaying}
          onTimeChange={onTimeChange}
          onTransportChange={onTransportChange}
          mediaElement={mediaElement}
          compact
        />
      </div>
    </section>
  );
}

function CompactChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2">
      <span className="text-[10px] uppercase tracking-[0.22em] text-slate-400">{label}</span>
      <span className="text-sm font-medium capitalize text-white">{value}</span>
    </div>
  );
}
