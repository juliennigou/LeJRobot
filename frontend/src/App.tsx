import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { Activity, Clock3, Disc3, Music2, Search, Sparkles, Upload } from "lucide-react";

import {
  fetchAnalysis,
  fetchAnalysisStatus,
  fetchChoreography,
  fetchState,
  searchTracks,
  selectTrack,
  setTransport,
  startAnalysis,
  uploadTrack,
} from "@/lib/api";
import type { AnalysisStatusResponse, AudioAnalysis, ChoreographyTimeline, RobotState, TrackSummary } from "@/lib/types";
import { RhythmPanel } from "@/components/analysis/rhythm-panel";
import { SpectrogramPanel } from "@/components/analysis/spectrogram-panel";
import { StructurePanel } from "@/components/analysis/structure-panel";
import { TrackInfoPanel } from "@/components/analysis/track-info-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WaveformConsole } from "@/components/music/waveform-console";
import { average, formatDuration } from "@/lib/analysis-view";

function App() {
  const [state, setState] = useState<RobotState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("electro swing");
  const [searchResults, setSearchResults] = useState<TrackSummary[]>([]);
  const [localTracks, setLocalTracks] = useState<TrackSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
  const [choreography, setChoreography] = useState<ChoreographyTimeline | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatusResponse | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [previewPositionSeconds, setPreviewPositionSeconds] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const refreshState = async () => {
    try {
      const next = await fetchState();
      startTransition(() => {
        setState(next);
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reach backend");
    } finally {
      setLoading(false);
    }
  };

  const runSearch = async (query: string) => {
    const normalized = query.trim();
    if (!normalized) {
      setSearchResults([]);
      setSearchError("Enter a song, artist, or mood.");
      return;
    }

    setSearching(true);
    setSearchError(null);

    try {
      const response = await searchTracks(normalized);
      startTransition(() => {
        setSearchResults(response.results);
      });
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const loadLocalTracks = async () => {
    try {
      const response = await searchTracks("", "local", 8);
      startTransition(() => {
        setLocalTracks(response.results);
      });
      setUploadError(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Unable to load local tracks");
    }
  };

  const commitAction = async (action: () => Promise<RobotState>) => {
    try {
      const next = await action();
      startTransition(() => {
        setState(next);
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  };

  const handleUpload = async () => {
    if (!selectedUploadFile) {
      setUploadError("Choose an audio file to upload.");
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const track = await uploadTrack(selectedUploadFile);
      startTransition(() => {
        setLocalTracks((current) => {
          const remaining = current.filter((item) => item.track_id !== track.track_id);
          return [track, ...remaining];
        });
      });
      await commitAction(() => selectTrack(track, true));
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
      setSelectedUploadFile(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    const boot = async () => {
      await Promise.all([refreshState(), runSearch(searchQuery), loadLocalTracks()]);
    };

    void boot();
    const interval = window.setInterval(() => {
      void refreshState();
    }, 1400);

    return () => window.clearInterval(interval);
  }, []);

  const currentTrack = state?.transport.current_track ?? null;

  useEffect(() => {
    if (!currentTrack) {
      setAnalysis(null);
      setChoreography(null);
      setAnalysisStatus(null);
      setAnalysisError(null);
      setAnalysisLoading(false);
      setPreviewPositionSeconds(0);
      setPreviewPlaying(false);
      return;
    }

    let cancelled = false;

    const hydrateAnalysis = async () => {
      setAnalysisLoading(true);
      setAnalysisError(null);

      try {
        const status = await fetchAnalysisStatus(currentTrack.track_id, currentTrack.source);
        if (cancelled) {
          return;
        }
        setAnalysisStatus(status);

        const start = status.status === "ready" ? status : await startAnalysis(currentTrack.track_id, currentTrack.source);
        if (cancelled) {
          return;
        }
        setAnalysisStatus({
          track_id: start.track_id,
          source: start.source,
          status: start.status,
          progress: start.progress,
          error: null,
        });

        const nextAnalysis = await fetchAnalysis(currentTrack.track_id, currentTrack.source);
        if (cancelled) {
          return;
        }
        setAnalysis(nextAnalysis);

        try {
          const nextChoreography = await fetchChoreography(currentTrack.track_id, currentTrack.source);
          if (!cancelled) {
            setChoreography(nextChoreography);
          }
        } catch {
          if (!cancelled) {
            setChoreography(nextAnalysis.choreography);
          }
        }

        if (!cancelled) {
          setAnalysisStatus({
            track_id: nextAnalysis.track_id,
            source: nextAnalysis.source,
            status: "ready",
            progress: 100,
            error: null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setAnalysis(null);
          setChoreography(null);
          setAnalysisError(err instanceof Error ? err.message : "Unable to load audio analysis");
        }
      } finally {
        if (!cancelled) {
          setAnalysisLoading(false);
        }
      }
    };

    void hydrateAnalysis();

    return () => {
      cancelled = true;
    };
  }, [currentTrack?.track_id, currentTrack?.source]);

  const activeTrackLabel = currentTrack ? `${currentTrack.title} - ${currentTrack.artist}` : "No song selected";
  const bpm = analysis ? analysis.bpm : (state?.transport.bpm ?? 120);
  const energy = analysis ? average(analysis.energy.rms) : (state?.transport.energy ?? 0.5);
  const positionSeconds = currentTrack ? previewPositionSeconds : (state?.transport.position_seconds ?? 0);
  const cueSummary = choreography ?? analysis?.choreography ?? null;
  const transportPlaying = currentTrack ? previewPlaying : (state?.transport.playing ?? false);

  const syncTransportPlayback = useCallback(
    async (playing: boolean) => {
      if (!currentTrack) {
        setPreviewPlaying(false);
        return;
      }

      setPreviewPlaying(playing);

      try {
        const next = await setTransport({
          track_name: `${currentTrack.title} - ${currentTrack.artist}`,
          bpm,
          energy,
          playing,
        });
        startTransition(() => {
          setState(next);
        });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to update transport");
      }
    },
    [bpm, currentTrack, energy],
  );

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(82,170,255,0.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(188,229,255,0.14),transparent_28%),linear-gradient(180deg,rgba(4,10,20,0.45),rgba(4,10,20,0.8))]" />
      <div className="relative mx-auto flex max-w-7xl flex-col gap-6">
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="overflow-hidden border-white/10 bg-white/[0.04]">
            <CardContent className="p-8">
              <div className="flex flex-wrap items-center gap-3">
                <Badge>Music Search</Badge>
                <Badge variant="muted">Song-First Interface</Badge>
                <Badge variant="accent">{transportPlaying ? "Transport Live" : "Waiting on Selection"}</Badge>
              </div>

              <div className="mt-6 max-w-3xl space-y-4">
                <p className="hud-label">LeRobot Music Console</p>
                <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
                  Find a song, inspect its motion profile, and shape the soundtrack before the robots ever move.
                </h1>
                <p className="max-w-2xl text-base text-slate-300 sm:text-lg">
                  This version is intentionally music-first. Search the catalog, pick a track, preview it, and read
                  the BPM, energy, and structure interface that will drive the choreography layer later.
                </p>
              </div>

              <form
                className="mt-8 flex flex-col gap-3 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runSearch(searchQuery);
                }}
              >
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search by song, artist, or mood"
                    className="h-13 w-full rounded-full border border-white/10 bg-black/30 pl-11 pr-5 text-sm text-white outline-none ring-0 placeholder:text-slate-500 focus:border-primary/60"
                  />
                </div>
                <Button type="submit" size="lg" disabled={searching}>
                  {searching ? "Searching..." : "Search Songs"}
                </Button>
              </form>

              <div className="mt-4 rounded-[24px] border border-white/10 bg-black/20 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="hud-label">Local Upload</p>
                    <p className="mt-2 text-sm text-slate-400">
                      Upload an audio file you control so it can be selected and analyzed later.
                    </p>
                  </div>
                  <div className="flex flex-1 flex-col gap-3 sm:flex-row lg:max-w-xl">
                    <input
                      ref={uploadInputRef}
                      type="file"
                      accept=".mp3,.wav,.ogg,.flac,.m4a,.aac,audio/*"
                      onChange={(event) => setSelectedUploadFile(event.target.files?.[0] ?? null)}
                      className="block w-full rounded-full border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-200 file:mr-4 file:rounded-full file:border-0 file:bg-primary/20 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary"
                    />
                    <Button type="button" size="lg" variant="secondary" disabled={uploading} onClick={() => void handleUpload()}>
                      <Upload className="mr-2 h-4 w-4" />
                      {uploading ? "Uploading..." : "Upload Track"}
                    </Button>
                  </div>
                </div>
              </div>

              {searchError ? (
                <div className="mt-4 rounded-[20px] border border-destructive/30 bg-destructive/10 p-3 text-sm text-red-200">
                  {searchError}
                </div>
              ) : null}

              {uploadError ? (
                <div className="mt-4 rounded-[20px] border border-destructive/30 bg-destructive/10 p-3 text-sm text-red-200">
                  {uploadError}
                </div>
              ) : null}

              <div className="mt-6 grid gap-3">
                {localTracks.length ? (
                  <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="hud-label">Local Library</p>
                        <p className="mt-1 text-sm text-slate-400">Uploaded tracks stay available through the local source.</p>
                      </div>
                      <Badge variant="muted">{localTracks.length} local</Badge>
                    </div>
                    <div className="grid gap-3">
                      {localTracks.map((track) => (
                        <TrackResultCard key={`${track.source}-${track.track_id}`} track={track} onSelect={() => void commitAction(() => selectTrack(track, true))} />
                      ))}
                    </div>
                  </div>
                ) : null}

                {searchResults.map((track) => (
                  <TrackResultCard key={`${track.source}-${track.track_id}`} track={track} onSelect={() => void commitAction(() => selectTrack(track, true))} />
                ))}

                {!searchResults.length && !searching ? (
                  <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-5 text-sm text-slate-400">
                    Search Jamendo and select a track to populate the music console.
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-white/10 bg-white/[0.04]">
            <CardContent className="flex h-full flex-col justify-between p-8">
              <div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="hud-label">Selected Song</p>
                    <h2 className="mt-3 text-3xl font-semibold text-white">{activeTrackLabel}</h2>
                    <p className="mt-2 text-sm text-slate-400">
                      {currentTrack
                        ? `Source ${currentTrack.source} • ${formatDuration(currentTrack.duration_seconds)}`
                        : "Choose a song from the search results to load the music dashboard."}
                    </p>
                  </div>
                  <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-slate-300">
                    {transportPlaying ? "Playing" : "Paused"}
                  </div>
                </div>

                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  <StatCard label="BPM" value={analysis ? bpm.toFixed(2) : `${Math.round(bpm)}`} icon={Disc3} />
                  <StatCard label="Energy" value={energy.toFixed(2)} icon={Sparkles} />
                  <StatCard label="Position" value={`${positionSeconds.toFixed(1)}s`} icon={Clock3} />
                </div>

                <div className="mt-8 rounded-[28px] border border-white/10 bg-black/25 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="hud-label">Waveform Workflow</p>
                      <p className="mt-2 text-lg font-medium text-white">
                        {currentTrack ? "Preview is now centered in the waveform console below." : "No preview loaded"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <TrackChip label="Preview" value={currentTrack?.audio_url ? "wavesurfer" : "unavailable"} />
                      <TrackChip label="Markers" value={analysis ? `${analysis.beats.length} beats` : "pending"} />
                      <TrackChip label="Sections" value={analysis ? `${analysis.sections.length}` : "pending"} />
                    </div>
                  </div>
                  <p className="mt-5 text-sm text-slate-400">
                    Use the waveform console to play, pause, scrub, and inspect beat markers before the robot layer is
                    attached.
                  </p>
                </div>
              </div>

              {error ? (
                <div className="mt-6 rounded-[20px] border border-destructive/30 bg-destructive/10 p-4 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              {analysisError ? (
                <div className="mt-4 rounded-[20px] border border-destructive/30 bg-destructive/10 p-4 text-sm text-red-200">
                  {analysisError}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>

        <WaveformConsole
          track={currentTrack}
          analysis={analysis}
          currentTime={positionSeconds}
          transportPlaying={transportPlaying}
          onTimeChange={setPreviewPositionSeconds}
          onTransportChange={syncTransportPlayback}
        />

        <Card className="border-white/10 bg-white/[0.04]">
          <CardHeader>
            <CardTitle>Track Analysis</CardTitle>
            <CardDescription>
              Music-facing tabs only. This is where the interface should stay clean before the robot layer comes in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="spectrogram">
              <TabsList>
                <TabsTrigger value="spectrogram">Spectrogram</TabsTrigger>
                <TabsTrigger value="rhythm">Rhythm</TabsTrigger>
                <TabsTrigger value="structure">Structure</TabsTrigger>
                <TabsTrigger value="track-info">Track Info</TabsTrigger>
              </TabsList>

              <TabsContent value="spectrogram" className="pt-6">
                <SpectrogramPanel analysis={analysis} currentTime={positionSeconds} />
              </TabsContent>

              <TabsContent value="rhythm" className="pt-6">
                <RhythmPanel analysis={analysis} choreography={cueSummary} currentTime={positionSeconds} />
              </TabsContent>

              <TabsContent value="structure" className="pt-6">
                <StructurePanel analysis={analysis} choreography={cueSummary} />
              </TabsContent>

              <TabsContent value="track-info" className="pt-6">
                <TrackInfoPanel
                  track={currentTrack}
                  analysis={analysis}
                  choreography={cueSummary}
                  analysisStatus={analysisStatus}
                  analysisLoading={analysisLoading}
                  analysisError={analysisError}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Activity;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/25 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="hud-label">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-4 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function TrackChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
      <p className="mb-1 hud-label">{label}</p>
      <p className="truncate text-sm font-medium capitalize text-white">{value}</p>
    </div>
  );
}

function TrackResultCard({ track, onSelect }: { track: TrackSummary; onSelect: () => void }) {
  return (
    <button
      className="group rounded-[26px] border border-white/10 bg-black/25 p-5 text-left transition hover:border-primary/40 hover:bg-white/[0.06]"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Music2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-lg font-semibold text-white">{track.title}</p>
                <Badge variant={track.source === "local" ? "accent" : "muted"}>{track.source}</Badge>
              </div>
              <p className="truncate text-sm text-slate-400">{track.artist}</p>
            </div>
          </div>
        </div>
        <span className="whitespace-nowrap text-sm text-slate-400">{formatDuration(track.duration_seconds)}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <TrackChip label="BPM" value={`${track.motion_profile.bpm}`} />
        <TrackChip label="Energy" value={track.motion_profile.energy.toFixed(2)} />
        <TrackChip label="Pattern" value={track.motion_profile.pattern_bias} />
      </div>
    </button>
  );
}

export default App;
