import { startTransition, useEffect, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  Clock3,
  Disc3,
  Music2,
  Pause,
  Play,
  Search,
  Sparkles,
  Upload,
  Waves,
} from "lucide-react";
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
import type { AnalysisStatusResponse, AudioAnalysis, ChoreographyTimeline, RobotState, SongSection, TrackSummary } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function formatDuration(durationSeconds?: number | null) {
  if (!durationSeconds) {
    return "--:--";
  }

  const totalSeconds = Math.round(durationSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function downsample(values: number[], count: number) {
  if (!values.length || count <= 0) {
    return [];
  }

  if (values.length <= count) {
    return values;
  }

  const bucketSize = values.length / count;
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * bucketSize);
    const end = Math.min(values.length, Math.floor((index + 1) * bucketSize));
    const slice = values.slice(start, Math.max(start + 1, end));
    return average(slice);
  });
}

function sampleSeries(values: number[], index: number) {
  if (!values.length) {
    return 0;
  }

  const safeIndex = Math.max(0, Math.min(values.length - 1, index));
  return values[safeIndex] ?? 0;
}

function currentSection(sections: SongSection[], timeSeconds: number) {
  return sections.find((section) => timeSeconds >= section.start_seconds && timeSeconds < section.end_seconds) ?? sections[0] ?? null;
}

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
      uploadInputRef.current?.value && (uploadInputRef.current.value = "");
      setSelectedUploadFile(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
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

  const activeTrackLabel = currentTrack
    ? `${currentTrack.title} - ${currentTrack.artist}`
    : "No song selected";
  const bpm = analysis ? analysis.bpm : (state?.transport.bpm ?? 120);
  const energy = analysis ? average(analysis.energy.rms) : (state?.transport.energy ?? 0.5);
  const positionSeconds = state?.transport.position_seconds ?? 0;
  const analysisFrameIndex = analysis ? Math.floor(positionSeconds * analysis.energy.frame_hz) : 0;
  const waveformBars = analysis
    ? downsample(analysis.waveform.peaks, 56).map((value) => Math.round(14 + value * 86))
    : Array.from({ length: 24 }, (_, index) => 28 + ((index * 7) % 46));
  const lowBandValue = analysis ? sampleSeries(analysis.bands.low, analysisFrameIndex) : 0;
  const midBandValue = analysis ? sampleSeries(analysis.bands.mid, analysisFrameIndex) : 0;
  const highBandValue = analysis ? sampleSeries(analysis.bands.high, analysisFrameIndex) : 0;
  const activeSection = analysis ? currentSection(analysis.sections, positionSeconds) : null;
  const cueSummary = choreography ?? analysis?.choreography ?? null;

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
                <Badge variant="accent">{state?.transport.playing ? "Transport Live" : "Waiting on Selection"}</Badge>
              </div>

              <div className="mt-6 max-w-3xl space-y-4">
                <p className="hud-label">LeRobot Music Console</p>
                <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
                  Find a song, inspect its motion profile, and shape the soundtrack before the robots ever move.
                </h1>
                <p className="max-w-2xl text-base text-slate-300 sm:text-lg">
                  This version is intentionally music-first. Search the catalog, pick a track, preview it, and read
                  the BPM, energy, and spectrum interface that will drive the choreography layer later.
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
                    {state?.transport.playing ? "Playing" : "Paused"}
                  </div>
                </div>

                  <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  <StatCard label="BPM" value={analysis ? bpm.toFixed(2) : `${Math.round(bpm)}`} icon={Disc3} />
                  <StatCard label="Energy" value={energy.toFixed(2)} icon={Sparkles} />
                  <StatCard label="Position" value={`${positionSeconds.toFixed(1)}s`} icon={Clock3} />
                </div>

                <div className="mt-8 rounded-[28px] border border-white/10 bg-black/25 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="hud-label">Transport</p>
                      <p className="mt-2 text-lg font-medium text-white">
                        {currentTrack ? "Preview and inspect the song before robot integration." : "No preview loaded"}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        currentTrack
                          ? void commitAction(() =>
                              setTransport({
                                track_name: state?.transport.track_name ?? `${currentTrack.title} - ${currentTrack.artist}`,
                                bpm,
                                energy,
                                playing: !state?.transport.playing,
                              }),
                            )
                          : undefined
                      }
                      disabled={!currentTrack}
                    >
                      {state?.transport.playing ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                      {state?.transport.playing ? "Pause" : "Play"}
                    </Button>
                  </div>

                  {currentTrack?.audio_url ? (
                    <audio controls preload="none" src={currentTrack.audio_url} className="mt-5 w-full opacity-90" />
                  ) : (
                    <p className="mt-5 text-sm text-slate-400">
                      The selected track has no preview URL yet, but its motion profile is still available.
                    </p>
                  )}
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

        <Card className="border-white/10 bg-white/[0.04]">
          <CardHeader>
            <CardTitle>Track Analysis</CardTitle>
            <CardDescription>
              Music-facing tabs only. This is where the interface should stay clean before the robot layer comes in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="spectrum">
              <TabsList>
                <TabsTrigger value="spectrum">Spectrum</TabsTrigger>
                <TabsTrigger value="metrics">BPM + Energy</TabsTrigger>
                <TabsTrigger value="details">Track Details</TabsTrigger>
              </TabsList>

              <TabsContent value="spectrum" className="pt-6">
                <div className="rounded-[30px] border border-white/10 bg-black/25 p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="hud-label">Analysis Waveform</p>
                      <p className="mt-2 text-lg text-slate-300">
                        {analysis
                          ? "Backend-derived waveform and band activity for the selected track."
                          : "Select a song to load its waveform and band envelopes."}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
                      <Waves className="h-4 w-4 text-primary" />
                      {analysis ? `${analysis.waveform.bucket_count} waveform buckets` : `${waveformBars.length} bars`}
                    </div>
                  </div>

                  {analysisLoading ? (
                    <div className="mt-8 rounded-[24px] border border-white/10 bg-black/20 p-5 text-sm text-slate-300">
                      Computing audio analysis for the selected track.
                    </div>
                  ) : null}

                  {!analysisLoading && analysisError ? (
                    <div className="mt-8 rounded-[24px] border border-destructive/30 bg-destructive/10 p-5 text-sm text-red-200">
                      {analysisError}
                    </div>
                  ) : null}

                  {!analysisLoading && !analysisError ? (
                    <>
                      <div className="mt-8 flex h-72 items-end gap-2 rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,18,32,0.82),rgba(4,9,18,0.95))] px-5 py-6">
                        {waveformBars.map((value, index) => (
                          <div
                            key={`${value}-${index}`}
                            className="rounded-full bg-gradient-to-t from-primary/80 via-blue-300 to-white"
                            style={{
                              height: `${Math.max(12, value)}%`,
                              width: "100%",
                              opacity: activeSection ? 0.94 : 0.75,
                            }}
                          />
                        ))}
                      </div>

                      <div className="mt-6 grid gap-4 lg:grid-cols-4">
                        <BandCard label="Low Band" value={lowBandValue} />
                        <BandCard label="Mid Band" value={midBandValue} />
                        <BandCard label="High Band" value={highBandValue} />
                        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                          <p className="hud-label">Current Section</p>
                          <p className="mt-3 text-lg font-semibold capitalize text-white">
                            {activeSection?.label ?? "Unknown"}
                          </p>
                          <p className="mt-2 text-sm text-slate-400">
                            {activeSection ? `${formatDuration(activeSection.start_seconds)} - ${formatDuration(activeSection.end_seconds)}` : "No section markers"}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent value="metrics" className="pt-6">
                <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                  <div className="rounded-[30px] border border-white/10 bg-black/25 p-6">
                    <p className="hud-label">Analysis Readout</p>
                    <div className="mt-6 grid gap-4">
                      <MetricRow
                        label="Detected BPM"
                        value={analysis ? analysis.bpm.toFixed(2) : `${Math.round(bpm)}`}
                        progress={Math.min(100, (bpm / 180) * 100)}
                      />
                      <MetricRow label="Mean RMS Energy" value={energy.toFixed(2)} progress={energy * 100} />
                      <MetricRow
                        label="Tempo Confidence"
                        value={analysis ? `${Math.round(analysis.tempo_confidence * 100)}%` : "--"}
                        progress={analysis ? analysis.tempo_confidence * 100 : 0}
                      />
                      <MetricRow
                        label="Beat Count"
                        value={analysis ? `${analysis.beats.length}` : "--"}
                        progress={analysis ? Math.min(100, analysis.beats.length * 3) : 0}
                      />
                    </div>
                  </div>

                  <div className="rounded-[30px] border border-white/10 bg-black/25 p-6">
                    <p className="hud-label">Analysis Summary</p>
                    <div className="mt-6 grid gap-4 sm:grid-cols-3">
                      <InfoTile
                        icon={Activity}
                        title="Downbeats"
                        text={analysis ? `${analysis.downbeats.length} bar accents detected for larger choreography changes.` : "No analysis loaded yet."}
                      />
                      <InfoTile
                        icon={BarChart3}
                        title="Sections"
                        text={analysis ? `${analysis.sections.length} section blocks inferred from energy and onset changes.` : "Section detection appears after analysis runs."}
                      />
                      <InfoTile
                        icon={Music2}
                        title="Cue Timeline"
                        text={cueSummary ? `${cueSummary.global_cues.length} global cues and ${cueSummary.arm_left_cues.length}/${cueSummary.arm_right_cues.length} arm cues are ready.` : "Cue generation appears with the analysis payload."}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="details" className="pt-6">
                <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
                  <div className="rounded-[30px] border border-white/10 bg-black/25 p-6">
                    <p className="hud-label">Track Metadata</p>
                    <div className="mt-6 space-y-4 text-sm text-slate-300">
                      <MetadataRow label="Title" value={currentTrack?.title ?? "No track selected"} />
                      <MetadataRow label="Artist" value={currentTrack?.artist ?? "No track selected"} />
                      <MetadataRow label="Duration" value={formatDuration(currentTrack?.duration_seconds)} />
                      <MetadataRow label="Source" value={currentTrack?.source ?? "jamendo"} />
                      <MetadataRow label="Analysis Status" value={analysisStatus?.status ?? currentTrack?.analysis_status ?? "none"} />
                      <MetadataRow label="Sample Rate" value={analysis ? `${analysis.sample_rate} Hz` : "--"} />
                      <MetadataRow label="Generated At" value={analysis ? formatDate(analysis.generated_at) : "--"} />
                    </div>
                  </div>

                  <div className="rounded-[30px] border border-white/10 bg-black/25 p-6">
                    <p className="hud-label">Analysis Details</p>
                    <div className="mt-6 space-y-4">
                      <StatusBanner
                        title={analysisLoading ? "Analysis running" : analysis ? "Analysis ready" : loading ? "Loading backend state" : "Waiting on track"}
                        note={
                          analysisLoading
                            ? "The backend is decoding audio and computing BPM, beats, sections, and cue envelopes."
                            : analysis
                              ? `Detected ${analysis.beats.length} beats and ${analysis.sections.length} sections for this track.`
                              : loading
                                ? "Fetching transport and song state."
                                : "Pick a track from the search results to populate this panel."
                        }
                      />
                      <StatusBanner
                        title={cueSummary ? "Choreography seeded" : currentTrack ? "Track selected" : "No track selected"}
                        note={
                          cueSummary
                            ? `${cueSummary.arm_left_cues.length} left-arm cues and ${cueSummary.arm_right_cues.length} right-arm cues are available.`
                            : currentTrack
                              ? `${currentTrack.title} is ready to drive the next choreography pass.`
                              : "Pick a track from the search results to populate this panel."
                        }
                      />
                      {analysis?.sections.length ? (
                        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                          <p className="hud-label">Detected Sections</p>
                          <div className="mt-4 grid gap-3">
                            {analysis.sections.map((section, index) => (
                              <div key={`${section.label}-${index}`} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-medium capitalize text-white">{section.label}</p>
                                  <p className="text-xs text-slate-400">
                                    {formatDuration(section.start_seconds)} - {formatDuration(section.end_seconds)}
                                  </p>
                                </div>
                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                  <MetricRow label="Energy" value={section.energy_mean.toFixed(2)} progress={section.energy_mean * 100} />
                                  <MetricRow label="Density" value={section.density_mean.toFixed(2)} progress={section.density_mean * 100} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
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
      <p className="hud-label mb-1">{label}</p>
      <p className="truncate text-sm font-medium capitalize text-white">{value}</p>
    </div>
  );
}

function BandCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="hud-label">{label}</p>
        <p className="text-sm font-medium text-white">{Math.round(value * 100)}%</p>
      </div>
      <Progress value={value * 100} className="mt-4" />
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

function MetricRow({ label, value, progress }: { label: string; value: string; progress: number }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-300">{label}</span>
        <span className="text-sm font-medium text-white">{value}</span>
      </div>
      <Progress className="mt-4" value={progress} />
    </div>
  );
}

function InfoTile({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Activity;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-4 text-base font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm text-slate-400">{text}</p>
    </div>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-3">
      <span className="text-slate-400">{label}</span>
      <span className="text-right text-white">{value}</span>
    </div>
  );
}

function StatusBanner({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
      <p className="text-base font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm text-slate-400">{note}</p>
    </div>
  );
}

export default App;
