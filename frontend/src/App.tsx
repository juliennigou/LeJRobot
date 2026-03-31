import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Disc3, Music2, Search, Sparkles, Upload } from "lucide-react";

import {
  fetchAnalysis,
  fetchAnalysisStatus,
  fetchChoreography,
  fetchMovementLibrary,
  fetchState,
  moveArmsToNeutral,
  runMovement,
  resetEmergencyStop,
  searchTracks,
  setArmConnection,
  selectTrack,
  setTransport,
  startAnalysis,
  stopMovement,
  triggerEmergencyStop,
  updateArmSafety,
  uploadTrack,
  verifyArms,
} from "@/lib/api";
import type {
  AnalysisStatusResponse,
  AudioAnalysis,
  ChoreographyTimeline,
  RobotState,
  TrackSummary,
} from "@/lib/types";
import { RhythmPanel } from "@/components/analysis/rhythm-panel";
import { SpectrogramPanel } from "@/components/analysis/spectrogram-panel";
import { StructurePanel } from "@/components/analysis/structure-panel";
import { TrackInfoPanel } from "@/components/analysis/track-info-panel";
import { HardwareStatusDashboard } from "@/components/hardware/hardware-status-dashboard";
import { AppNavbar, type AppView } from "@/components/layout/app-navbar";
import { WaveformConsole } from "@/components/music/waveform-console";
import { MovementLibraryPage } from "@/components/movements/movement-library-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { average, formatDuration } from "@/lib/analysis-view";

function App() {
  const [activeView, setActiveView] = useState<AppView>("home");
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
  const [verifyingHardware, setVerifyingHardware] = useState(false);
  const [hardwareBusyArmId, setHardwareBusyArmId] = useState<string | null>(null);
  const [hardwareActionBusy, setHardwareActionBusy] = useState<string | null>(null);
  const [selectedMovementArmId, setSelectedMovementArmId] = useState<string | null>(null);
  const [movementBusyAction, setMovementBusyAction] = useState<string | null>(null);
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
      setActiveView("home");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    const boot = async () => {
      await Promise.all([refreshState(), runSearch(searchQuery), loadLocalTracks(), fetchMovementLibrary()]);
    };

    void boot();
    const interval = window.setInterval(() => {
      void refreshState();
    }, 1400);

    return () => window.clearInterval(interval);
  }, []);

  const currentTrack = state?.transport.current_track ?? null;
  const movementLibrary = state?.movement_library ?? null;

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
          bpm: Math.max(40, Math.min(220, Math.round(bpm))),
          energy: Math.max(0, Math.min(1, energy)),
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

  const handleVerifyHardware = useCallback(async () => {
    setVerifyingHardware(true);
    try {
      await verifyArms();
      await refreshState();
      setError(null);
      setActiveView("robot");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify hardware");
    } finally {
      setVerifyingHardware(false);
    }
  }, []);

  const handleToggleArmConnection = useCallback(async (armId: string, connected: boolean) => {
    setHardwareBusyArmId(armId);
    try {
      await setArmConnection(armId, connected);
      await refreshState();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update arm connection");
    } finally {
      setHardwareBusyArmId(null);
    }
  }, []);

  const handleUpdateArmSafety = useCallback(
    async (
      armId: string,
      payload: {
        dry_run?: boolean;
        emergency_stop?: boolean;
        torque_enabled?: boolean;
      },
      busyKey: string,
    ) => {
      setHardwareActionBusy(busyKey);
      try {
        await updateArmSafety(armId, payload);
        await refreshState();
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to update arm safety");
      } finally {
        setHardwareActionBusy(null);
      }
    },
    [],
  );

  const handleGlobalArmAction = useCallback(
    async (action: "neutral" | "emergency-stop" | "emergency-reset") => {
      setHardwareActionBusy(action);
      try {
        if (action === "neutral") {
          await moveArmsToNeutral();
        } else if (action === "emergency-stop") {
          await triggerEmergencyStop();
        } else {
          await resetEmergencyStop();
        }
        await refreshState();
        setError(null);
        setActiveView("robot");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to update arm safety");
      } finally {
        setHardwareActionBusy(null);
      }
    },
    [],
  );

  useEffect(() => {
    if (selectedMovementArmId) {
      return;
    }

    const follower = state?.dual_arm.arms.find((arm) => arm.arm_type === "follower");
    const firstArm = state?.dual_arm.arms[0];
    const defaultArm = follower ?? firstArm;
    if (defaultArm) {
      setSelectedMovementArmId(defaultArm.arm_id);
    }
  }, [selectedMovementArmId, state?.dual_arm.arms]);

  const handleRunMovement = useCallback(
    async (movementId: string) => {
      if (!selectedMovementArmId) {
        setError("Select an arm before running a movement.");
        return;
      }

      setMovementBusyAction(`run:${movementId}`);
      try {
        await runMovement(selectedMovementArmId, movementId);
        await refreshState();
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to run movement");
      } finally {
        setMovementBusyAction(null);
      }
    },
    [selectedMovementArmId],
  );

  const handleStopMovement = useCallback(async () => {
    setMovementBusyAction("stop-movement");
    try {
      await stopMovement();
      await refreshState();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to stop movement");
    } finally {
      setMovementBusyAction(null);
    }
  }, []);

  const searchDropdownResults = useMemo(() => {
    const deduped = new Map<string, TrackSummary>();
    [...localTracks, ...searchResults].forEach((track) => {
      deduped.set(`${track.source}:${track.track_id}`, track);
    });
    return Array.from(deduped.values()).slice(0, 10);
  }, [localTracks, searchResults]);

  const showDropdown = searchQuery.trim().length > 0 && (searching || searchDropdownResults.length > 0 || !!searchError);

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(82,170,255,0.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(188,229,255,0.14),transparent_28%),linear-gradient(180deg,rgba(4,10,20,0.45),rgba(4,10,20,0.8))]" />
      <div className="relative mx-auto flex max-w-7xl flex-col gap-6">
        <AppNavbar activeView={activeView} onChange={setActiveView} />

        {activeView === "home" ? (
          <section className="grid gap-6">
            <Card className="border-white/10 bg-white/[0.04]">
              <CardContent className="p-6 sm:p-8">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge>Home</Badge>
                  <Badge variant="accent">{currentTrack ? "Track Selected" : "Select a Song"}</Badge>
                </div>

                <div className="mt-6 max-w-4xl">
                  <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
                    Search a song, upload one locally, and preview it before touching the robots.
                  </h1>
                  <p className="mt-3 text-sm text-slate-300 sm:text-base">
                    Keep the first screen simple: one search field, one dropdown, one upload action, then the waveform.
                  </p>
                </div>

                <div className="mt-8">
                  <div>
                    <form
                      className="flex flex-col gap-3 sm:flex-row sm:items-center"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void runSearch(searchQuery);
                      }}
                    >
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                          value={searchQuery}
                          onChange={(event) => setSearchQuery(event.target.value)}
                          placeholder="Search song, artist, or mood"
                          className="h-14 pl-11 pr-5 text-base"
                        />
                      </div>
                      <Button type="submit" size="lg" className="sm:min-w-32" disabled={searching}>
                        {searching ? "Searching..." : "Search"}
                      </Button>
                    </form>

                    {showDropdown ? (
                      <div className="mt-3 overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,18,31,0.98),rgba(5,10,19,0.98))] shadow-[0_28px_80px_rgba(0,0,0,0.45)]">
                        {searchError ? (
                          <div className="border-b border-white/10 px-5 py-4 text-sm text-red-200">{searchError}</div>
                        ) : null}
                        {searching ? (
                          <div className="px-5 py-4 text-sm text-slate-300">Searching tracks...</div>
                        ) : null}
                        {searchDropdownResults.length ? (
                          <div className="max-h-[420px] overflow-y-auto">
                            {searchDropdownResults.map((track) => (
                              <DropdownTrackRow
                                key={`${track.source}-${track.track_id}`}
                                track={track}
                                onSelect={() => void commitAction(() => selectTrack(track, true))}
                              />
                            ))}
                          </div>
                        ) : !searching && !searchError ? (
                          <div className="px-5 py-4 text-sm text-slate-400">No tracks found for this query.</div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-5 rounded-[24px] border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="hud-label">Local Upload</p>
                        <p className="mt-1 text-sm text-slate-400">
                          Add your own file and it will appear in the same search dropdown.
                        </p>
                      </div>
                      <div className="flex flex-col gap-3 md:w-[420px] md:flex-row">
                      <input
                        ref={uploadInputRef}
                        type="file"
                        accept=".mp3,.wav,.ogg,.flac,.m4a,.aac,audio/*"
                        onChange={(event) => setSelectedUploadFile(event.target.files?.[0] ?? null)}
                        className="block w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-200 file:mr-4 file:rounded-full file:border-0 file:bg-primary/20 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary md:flex-1"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        className="md:min-w-40"
                        disabled={uploading}
                        onClick={() => void handleUpload()}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        {uploading ? "Uploading..." : "Upload Track"}
                      </Button>
                    </div>
                    </div>
                    {uploadError ? <p className="mt-3 text-sm text-red-200">{uploadError}</p> : null}
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <TrackChip label="Selected" value={currentTrack ? currentTrack.title : "none"} />
                  <TrackChip label="Artist" value={currentTrack ? currentTrack.artist : "none"} />
                  <TrackChip label="Duration" value={formatDuration(currentTrack?.duration_seconds)} />
                  <TrackChip label="Preview" value={currentTrack?.audio_url ? "ready" : "missing"} />
                </div>
              </CardContent>
            </Card>

            <WaveformConsole
              track={currentTrack}
              analysis={analysis}
              currentTime={positionSeconds}
              transportPlaying={transportPlaying}
              onTimeChange={setPreviewPositionSeconds}
              onTransportChange={syncTransportPlayback}
            />
          </section>
        ) : null}

        {activeView === "analysis" ? (
          <Card className="border-white/10 bg-white/[0.04]">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <Badge>Audio Stats</Badge>
                <Badge variant="muted">{currentTrack ? `${currentTrack.title} - ${currentTrack.artist}` : "No track selected"}</Badge>
              </div>
              <CardTitle className="text-3xl text-white">Audio Statistics</CardTitle>
              <CardDescription>
                Full analysis view for rhythm, spectrum, structure, and backend-derived track metadata.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <StatCard label="BPM" value={analysis ? bpm.toFixed(2) : `${Math.round(bpm)}`} icon={Disc3} />
                <StatCard label="Energy" value={energy.toFixed(2)} icon={Sparkles} />
                <StatCard label="Position" value={`${positionSeconds.toFixed(1)}s`} icon={Clock3} />
              </div>

              <Tabs defaultValue="spectrogram">
                <TabsList className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
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
        ) : null}

        {activeView === "movements" ? (
          <MovementLibraryPage
            library={movementLibrary}
            arms={state?.dual_arm.arms ?? []}
            selectedArmId={selectedMovementArmId}
            busyAction={movementBusyAction}
            onSelectArm={setSelectedMovementArmId}
            onRunMovement={(movementId) => void handleRunMovement(movementId)}
            onStopMovement={() => void handleStopMovement()}
          />
        ) : null}

        {activeView === "robot" ? (
          <HardwareStatusDashboard
            state={state}
            loading={loading}
            verifying={verifyingHardware}
            busyArmId={hardwareBusyArmId}
            busyAction={hardwareActionBusy}
            onVerify={() => void handleVerifyHardware()}
            onToggleConnection={(armId, connected) => void handleToggleArmConnection(armId, connected)}
            onToggleDryRun={(armId, dryRun) =>
              void handleUpdateArmSafety(armId, { dry_run: dryRun }, `${armId}:dry-run`)
            }
            onToggleTorque={(armId, enabled) =>
              void handleUpdateArmSafety(armId, { torque_enabled: enabled }, `${armId}:torque`)
            }
            onResetArmEmergencyStop={(armId) =>
              void handleUpdateArmSafety(armId, { emergency_stop: false }, `${armId}:reset-estop`)
            }
            onNeutralAll={() => void handleGlobalArmAction("neutral")}
            onEmergencyStop={() => void handleGlobalArmAction("emergency-stop")}
            onEmergencyReset={() => void handleGlobalArmAction("emergency-reset")}
          />
        ) : null}

        {error || analysisError ? (
          <Card className="border-destructive/20 bg-destructive/10">
            <CardContent className="p-4 text-sm text-red-100">{error ?? analysisError}</CardContent>
          </Card>
        ) : null}
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
  icon: typeof Disc3;
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

function DropdownTrackRow({
  track,
  onSelect,
}: {
  track: TrackSummary;
  onSelect: () => void;
}) {
  return (
    <button
      className="flex w-full items-center justify-between gap-4 border-b border-white/10 px-5 py-4 text-left transition last:border-b-0 hover:bg-white/[0.05]"
      onClick={onSelect}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Music2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-white">{track.title}</p>
            <p className="truncate text-sm text-slate-400">{track.artist}</p>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <Badge variant={track.source === "local" ? "accent" : "muted"}>{track.source}</Badge>
        <span className="text-sm text-slate-400">{formatDuration(track.duration_seconds)}</span>
      </div>
    </button>
  );
}

export default App;
