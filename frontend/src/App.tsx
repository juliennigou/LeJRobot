import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Disc3, Music2, Sparkles } from "lucide-react";

import {
  fetchAnalysis,
  fetchAnalysisStatus,
  fetchChoreography,
  fetchMovementLibrary,
  fetchState,
  moveArmsToNeutral,
  resetArmState,
  runMovement,
  updateScheduleConfig,
  updateSchedulePhrase,
  resetEmergencyStop,
  searchTracks,
  setArmConnection,
  selectTrack,
  setTransport,
  startAutonomy,
  startAnalysis,
  stopMovement,
  stopAutonomy,
  triggerEmergencyStop,
  updateArmSafety,
  uploadTrack,
  verifyArms,
} from "@/lib/api";
import type {
  AnalysisStatusResponse,
  AudioAnalysis,
  ChoreographyTimeline,
  ExecutionMode,
  MovementDefinition,
  MovementTargetScope,
  RobotState,
  ScheduleConfig,
  TrackSummary,
} from "@/lib/types";
import { RhythmPanel } from "@/components/analysis/rhythm-panel";
import { SpectrogramPanel } from "@/components/analysis/spectrogram-panel";
import { StructurePanel } from "@/components/analysis/structure-panel";
import { TrackInfoPanel } from "@/components/analysis/track-info-panel";
import { HardwareStatusDashboard } from "@/components/hardware/hardware-status-dashboard";
import { AppNavbar, type AppView } from "@/components/layout/app-navbar";
import { MovementLibraryPage } from "@/components/movements/movement-library-page";
import { PerformancePage } from "@/components/performance/performance-page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { average, formatDuration } from "@/lib/analysis-view";

type MovementTuning = {
  presetId: string;
  frequencyHz: number;
  cycles: number;
  amplitudeScale: number;
  softness: number;
  asymmetry: number;
  followThroughEnabled: boolean;
  followThroughDelaySeconds: number;
  followThroughGain: number;
  followThroughDamping: number;
  followThroughSettle: number;
};

type ScheduleDraft = {
  style_id: string;
  density_scale: number;
  intensity_scale: number;
};

function defaultMovementTuning(movement: MovementDefinition): MovementTuning {
  const defaultPreset =
    movement.presets.find((preset) => preset.preset_id === movement.default_preset_id) ?? movement.presets[0];
  return {
    presetId: defaultPreset?.preset_id ?? "normal",
    frequencyHz: defaultPreset?.frequency_hz ?? 0.8,
    cycles: defaultPreset?.cycles ?? 2,
    amplitudeScale: defaultPreset?.amplitude_scale ?? 1.0,
    softness: defaultPreset?.softness ?? 0.72,
    asymmetry: defaultPreset?.asymmetry ?? 0.0,
    followThroughEnabled: defaultPreset?.follow_through?.enabled ?? true,
    followThroughDelaySeconds: defaultPreset?.follow_through?.delay_seconds ?? 0.12,
    followThroughGain: defaultPreset?.follow_through?.gain ?? 0.2,
    followThroughDamping: defaultPreset?.follow_through?.damping ?? 0.4,
    followThroughSettle: defaultPreset?.follow_through?.settle ?? 0.14,
  };
}

function clampAsymmetry(value: number): number {
  return Math.min(1, Math.max(0, value));
}

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
  const [movementTargetScope, setMovementTargetScope] = useState<MovementTargetScope>("single");
  const [movementExecutionMode, setMovementExecutionMode] = useState<ExecutionMode>("mirror");
  const [movementBusyAction, setMovementBusyAction] = useState<string | null>(null);
  const [autonomyBusy, setAutonomyBusy] = useState(false);
  const [movementTunings, setMovementTunings] = useState<Record<string, MovementTuning>>({});
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft | null>(null);
  const [scheduleBusyAction, setScheduleBusyAction] = useState<string | null>(null);
  const previewPositionRef = useRef(0);
  const previewPlayingRef = useRef(false);
  const transportSyncInFlightRef = useRef(false);
  const transportSyncQueuedRef = useRef<{
    track_name: string;
    bpm: number;
    energy: number;
    playing: boolean;
    position_seconds: number;
  } | null>(null);

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

  useEffect(() => {
    const boot = async () => {
      await Promise.all([refreshState(), runSearch(searchQuery), loadLocalTracks(), fetchMovementLibrary()]);
    };

    void boot();
  }, []);

  useEffect(() => {
    const intervalMs = state?.transport.playing || state?.autonomy.status === "running" ? 250 : 1400;
    const interval = window.setInterval(() => {
      void refreshState();
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [state?.autonomy.status, state?.transport.playing]);

  const currentTrack = state?.transport.current_track ?? null;
  const currentSchedule = state?.schedule ?? null;
  const movementLibrary = state?.movement_library ?? null;

  useEffect(() => {
    previewPositionRef.current = previewPositionSeconds;
  }, [previewPositionSeconds]);

  useEffect(() => {
    previewPlayingRef.current = previewPlaying;
  }, [previewPlaying]);

  useEffect(() => {
    const config: ScheduleConfig | undefined | null = currentSchedule?.config;
    if (!config) {
      setScheduleDraft(null);
      return;
    }
    setScheduleDraft({
      style_id: config.style_id,
      density_scale: config.density_scale,
      intensity_scale: config.intensity_scale,
    });
  }, [currentSchedule?.track_id, currentSchedule?.source, currentSchedule?.style_id, currentSchedule?.generated_at]);

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

  useEffect(() => {
    if (!currentTrack || activeView !== "home") {
      return;
    }

    const backendPosition = state?.transport.position_seconds ?? 0;

    if (!previewPlayingRef.current && Math.abs(previewPositionRef.current - backendPosition) > 0.2) {
      setPreviewPositionSeconds(backendPosition);
    }

    if (!(state?.transport.playing ?? false) && state?.autonomy.status === "idle" && backendPosition === 0 && previewPositionRef.current !== 0) {
      setPreviewPositionSeconds(0);
    }
  }, [
    activeView,
    currentTrack,
    state?.autonomy.status,
    state?.transport.playing,
    state?.transport.position_seconds,
  ]);

  const bpm = analysis ? analysis.bpm : (state?.transport.bpm ?? 120);
  const energy = analysis ? average(analysis.energy.rms) : (state?.transport.energy ?? 0.5);
  const positionSeconds = activeView === "home" ? previewPositionSeconds : (state?.transport.position_seconds ?? previewPositionSeconds);
  const cueSummary = choreography ?? analysis?.choreography ?? null;
  const transportPlaying = activeView === "home" ? previewPlaying : (state?.transport.playing ?? previewPlaying);

  const syncTransportPlayback = useCallback(
    async (playing: boolean, nextPositionSeconds = previewPositionRef.current) => {
      if (!currentTrack) {
        setPreviewPlaying(false);
        return;
      }

      const position = Math.max(0, nextPositionSeconds);
      setPreviewPlaying(playing);
      setPreviewPositionSeconds(position);

      transportSyncQueuedRef.current = {
        track_name: `${currentTrack.title} - ${currentTrack.artist}`,
        bpm: Math.max(40, Math.min(220, Math.round(bpm))),
        energy: Math.max(0, Math.min(1, energy)),
        playing,
        position_seconds: position,
      };

      if (transportSyncInFlightRef.current) {
        return;
      }

      transportSyncInFlightRef.current = true;

      try {
        while (transportSyncQueuedRef.current) {
          const pending = transportSyncQueuedRef.current;
          transportSyncQueuedRef.current = null;
          const next = await setTransport(pending);
          startTransition(() => {
            setState(next);
          });
          setError(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to update transport");
      } finally {
        transportSyncInFlightRef.current = false;
      }
    },
    [bpm, currentTrack, energy],
  );

  useEffect(() => {
    if (!currentTrack || !previewPlaying) {
      return;
    }

    const interval = window.setInterval(() => {
      void syncTransportPlayback(true, previewPositionRef.current);
    }, 160);

    return () => window.clearInterval(interval);
  }, [currentTrack, previewPlaying, syncTransportPlayback]);

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

  const handleResetArmState = useCallback(async (armId: string) => {
    setHardwareActionBusy(`${armId}:reset-state`);
    try {
      await resetArmState(armId);
      await refreshState();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset arm state");
    } finally {
      setHardwareActionBusy(null);
    }
  }, []);

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

  useEffect(() => {
    const movements = movementLibrary?.movements ?? [];
    if (!movements.length) {
      return;
    }
    setMovementTunings((current) => {
      const next: Record<string, MovementTuning> = {};
      for (const movement of movements) {
        const existing = current[movement.movement_id];
        const presetIds = new Set(movement.presets.map((preset) => preset.preset_id));
        if (existing && presetIds.has(existing.presetId)) {
          next[movement.movement_id] = existing;
          continue;
        }
        next[movement.movement_id] = defaultMovementTuning(movement);
      }
      return next;
    });
  }, [movementLibrary]);

  const updateMovementTuning = useCallback(
    (movementId: string, updater: (current: MovementTuning) => MovementTuning) => {
      const movement = movementLibrary?.movements.find((entry) => entry.movement_id === movementId);
      if (!movement) {
        return;
      }
      setMovementTunings((current) => {
        const base = current[movementId] ?? defaultMovementTuning(movement);
        return {
          ...current,
          [movementId]: updater(base),
        };
      });
    },
    [movementLibrary],
  );

  const handleRunMovement = useCallback(
    async (movementId: string) => {
      if (movementTargetScope === "single" && !selectedMovementArmId) {
        setError("Select an arm before running a movement.");
        return;
      }

      setMovementBusyAction(`run:${movementId}`);
      try {
        const movement = movementLibrary?.movements.find((entry) => entry.movement_id === movementId);
        const tuning = movement ? movementTunings[movementId] ?? defaultMovementTuning(movement) : null;
        await runMovement(
          movementId,
          {
            target_scope: movementTargetScope,
            execution_mode: movementExecutionMode,
            arm_id: movementTargetScope === "single" ? selectedMovementArmId ?? undefined : undefined,
          },
          {
          preset_id: tuning?.presetId,
          frequency_hz: tuning?.frequencyHz,
          cycles: tuning?.cycles,
          amplitude_scale: tuning?.amplitudeScale,
          softness: tuning?.softness,
          asymmetry: tuning ? clampAsymmetry(tuning.asymmetry) : undefined,
          follow_through_enabled: tuning?.followThroughEnabled,
          follow_through_delay_seconds: tuning?.followThroughDelaySeconds,
          follow_through_gain: tuning?.followThroughGain,
          follow_through_damping: tuning?.followThroughDamping,
          follow_through_settle: tuning?.followThroughSettle,
          },
        );
        await refreshState();
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to run movement");
      } finally {
        setMovementBusyAction(null);
      }
    },
    [movementExecutionMode, movementLibrary, movementTargetScope, movementTunings, selectedMovementArmId],
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

  const handleStartAutonomy = useCallback(async () => {
    setAutonomyBusy(true);
    try {
      setPreviewPositionSeconds(0);
      setPreviewPlaying(true);
      await commitAction(() => startAutonomy());
      setError(null);
    } catch (err) {
      setPreviewPlaying(false);
      setError(err instanceof Error ? err.message : "Unable to start autonomous playback");
    } finally {
      setAutonomyBusy(false);
    }
  }, []);

  const handleStopAutonomy = useCallback(async () => {
    setAutonomyBusy(true);
    try {
      setPreviewPlaying(false);
      setPreviewPositionSeconds(0);
      await commitAction(() => stopAutonomy());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to stop autonomous playback");
    } finally {
      setAutonomyBusy(false);
    }
  }, []);

  const handleApplyScheduleStyle = useCallback(async () => {
    if (!currentTrack || !scheduleDraft) {
      return;
    }
    setScheduleBusyAction("apply-style");
    try {
      await commitAction(() =>
        updateScheduleConfig(currentTrack.track_id, currentTrack.source, {
          style_id: scheduleDraft.style_id,
          density_scale: scheduleDraft.density_scale,
          intensity_scale: scheduleDraft.intensity_scale,
        }),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update schedule style");
    } finally {
      setScheduleBusyAction(null);
    }
  }, [currentTrack, scheduleDraft]);

  const handleResetScheduleStyle = useCallback(() => {
    if (!currentSchedule) {
      return;
    }
    setScheduleDraft({
      style_id: currentSchedule.config.style_id,
      density_scale: currentSchedule.config.density_scale,
      intensity_scale: currentSchedule.config.intensity_scale,
    });
  }, [currentSchedule]);

  const handlePhraseMappingChange = useCallback(
    async (
      phraseId: string,
      payload: {
        movement_id?: string;
        preset_id?: string;
        execution_mode?: ExecutionMode;
      },
    ) => {
      if (!currentTrack) {
        return;
      }
      setScheduleBusyAction(`phrase:${phraseId}`);
      try {
        await commitAction(() => updateSchedulePhrase(currentTrack.track_id, currentTrack.source, phraseId, payload));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to update phrase mapping");
      } finally {
        setScheduleBusyAction(null);
      }
    },
    [currentTrack],
  );

  const searchDropdownResults = useMemo(() => {
    const deduped = new Map<string, TrackSummary>();
    [...localTracks, ...searchResults].forEach((track) => {
      deduped.set(`${track.source}:${track.track_id}`, track);
    });
    return Array.from(deduped.values()).slice(0, 10);
  }, [localTracks, searchResults]);

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(82,170,255,0.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(188,229,255,0.14),transparent_28%),linear-gradient(180deg,rgba(4,10,20,0.45),rgba(4,10,20,0.8))]" />
      <div className="relative mx-auto flex max-w-7xl flex-col gap-6">
        <AppNavbar activeView={activeView} onChange={setActiveView} />

        {activeView === "home" ? (
          <PerformancePage
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onSearch={() => void runSearch(searchQuery)}
            searching={searching}
            searchError={searchError}
            results={searchDropdownResults}
            currentTrack={currentTrack}
            analysis={analysis}
            analysisStatus={analysisStatus}
            schedule={currentSchedule}
            autonomy={state?.autonomy ?? { status: "idle", note: "Autonomous scheduler idle." }}
            autonomyBusy={autonomyBusy}
            currentTime={positionSeconds}
            transportPlaying={transportPlaying}
            onTimeChange={setPreviewPositionSeconds}
            onTransportChange={syncTransportPlayback}
            onSelectTrack={(track) => {
              setSearchQuery(track.title);
              setSearchResults([]);
              void commitAction(() => selectTrack(track, true));
            }}
            onStartAutonomy={() => void handleStartAutonomy()}
            onStopAutonomy={() => void handleStopAutonomy()}
          />
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
                  <StructurePanel
                    analysis={analysis}
                    choreography={cueSummary}
                    schedule={currentSchedule}
                    movementLibrary={movementLibrary}
                    busyAction={scheduleBusyAction}
                    onPhraseMappingChange={(phraseId, payload) => void handlePhraseMappingChange(phraseId, payload)}
                  />
                </TabsContent>

                <TabsContent value="track-info" className="pt-6">
                  <TrackInfoPanel
                    track={currentTrack}
                    analysis={analysis}
                    choreography={cueSummary}
                    schedule={currentSchedule}
                    autonomy={state?.autonomy ?? { status: "idle", note: "Autonomous scheduler idle." }}
                    analysisStatus={analysisStatus}
                    analysisLoading={analysisLoading}
                    analysisError={analysisError}
                    scheduleDraft={scheduleDraft}
                    scheduleBusy={scheduleBusyAction === "apply-style"}
                    onScheduleStyleChange={(styleId) =>
                      setScheduleDraft((current) =>
                        current
                          ? { ...current, style_id: styleId }
                          : { style_id: styleId, density_scale: currentSchedule?.config.density_scale ?? 1, intensity_scale: currentSchedule?.config.intensity_scale ?? 1 },
                      )
                    }
                    onScheduleDensityChange={(value) =>
                      setScheduleDraft((current) =>
                        current
                          ? { ...current, density_scale: value }
                          : { style_id: currentSchedule?.config.style_id ?? "baseline", density_scale: value, intensity_scale: currentSchedule?.config.intensity_scale ?? 1 },
                      )
                    }
                    onScheduleIntensityChange={(value) =>
                      setScheduleDraft((current) =>
                        current
                          ? { ...current, intensity_scale: value }
                          : { style_id: currentSchedule?.config.style_id ?? "baseline", density_scale: currentSchedule?.config.density_scale ?? 1, intensity_scale: value },
                      )
                    }
                    onApplyScheduleStyle={() => void handleApplyScheduleStyle()}
                    onResetScheduleStyle={handleResetScheduleStyle}
                    autonomyBusy={autonomyBusy}
                    onStartAutonomy={() => void handleStartAutonomy()}
                    onStopAutonomy={() => void handleStopAutonomy()}
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
            targetScope={movementTargetScope}
            executionMode={movementExecutionMode}
            movementTunings={movementTunings}
            busyAction={movementBusyAction}
            onSelectArm={setSelectedMovementArmId}
            onSelectTargetScope={setMovementTargetScope}
            onSelectExecutionMode={setMovementExecutionMode}
            onSelectPreset={(movementId, presetId) =>
              updateMovementTuning(movementId, (current) => {
                const movement = movementLibrary?.movements.find((entry) => entry.movement_id === movementId);
                const preset =
                  movement?.presets.find((entry) => entry.preset_id === presetId) ?? movement?.presets[0] ?? null;
                if (!preset) {
                  return current;
                }
                return {
                  ...current,
                  presetId: preset.preset_id,
                  frequencyHz: preset.frequency_hz,
                  cycles: preset.cycles,
                  amplitudeScale: preset.amplitude_scale,
                  softness: preset.softness,
                  asymmetry: clampAsymmetry(preset.asymmetry),
                  followThroughEnabled: preset.follow_through.enabled,
                  followThroughDelaySeconds: preset.follow_through.delay_seconds,
                  followThroughGain: preset.follow_through.gain,
                  followThroughDamping: preset.follow_through.damping,
                  followThroughSettle: preset.follow_through.settle,
                };
              })
            }
            onFrequencyChange={(movementId, value) =>
              updateMovementTuning(movementId, (current) => ({ ...current, frequencyHz: value }))
            }
            onCyclesChange={(movementId, value) =>
              updateMovementTuning(movementId, (current) => ({ ...current, cycles: value }))
            }
            onAmplitudeScaleChange={(movementId, value) =>
              updateMovementTuning(movementId, (current) => ({ ...current, amplitudeScale: value }))
            }
            onSoftnessChange={(movementId, value) =>
              updateMovementTuning(movementId, (current) => ({ ...current, softness: value }))
            }
            onAsymmetryChange={(movementId, value) =>
              updateMovementTuning(movementId, (current) => ({ ...current, asymmetry: clampAsymmetry(value) }))
            }
            onFollowThroughEnabledChange={(movementId, value) =>
              updateMovementTuning(movementId, (current) => ({ ...current, followThroughEnabled: value }))
            }
            onFollowThroughDelayChange={(movementId, value) =>
              updateMovementTuning(movementId, (current) => ({ ...current, followThroughDelaySeconds: value }))
            }
            onFollowThroughGainChange={(movementId, value) =>
              updateMovementTuning(movementId, (current) => ({ ...current, followThroughGain: value }))
            }
            onFollowThroughDampingChange={(movementId, value) =>
              updateMovementTuning(movementId, (current) => ({ ...current, followThroughDamping: value }))
            }
            onFollowThroughSettleChange={(movementId, value) =>
              updateMovementTuning(movementId, (current) => ({ ...current, followThroughSettle: value }))
            }
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
            onResetArmState={(armId) => void handleResetArmState(armId)}
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
