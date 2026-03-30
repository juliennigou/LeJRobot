import { startTransition, useEffect, useState } from "react";
import {
  Activity,
  Cpu,
  Disc3,
  Gauge,
  Radio,
  Sparkles,
  Waves,
  Zap,
} from "lucide-react";
import { fetchConfig, fetchState, pulseDance, setMode, setTransport, triggerScene, updateServo } from "@/lib/api";
import type { DanceMode, RobotConfig, RobotState, SceneName } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tracks = [
  { name: "Neon Pulse", bpm: 124, energy: 0.78 },
  { name: "Atlas Groove", bpm: 98, energy: 0.58 },
  { name: "Signal Breaks", bpm: 138, energy: 0.9 },
];

const scenes: { name: SceneName; title: string; note: string }[] = [
  { name: "idle", title: "Stillness", note: "Centered pose for calibration and safety." },
  { name: "bloom", title: "Bloom", note: "Open shoulders with smooth wrist movement." },
  { name: "punch", title: "Punch", note: "Tighter accents for higher-energy tracks." },
  { name: "sweep", title: "Sweep", note: "Long arcs across the full arm chain." },
];

const modeLabels: { value: DanceMode; title: string }[] = [
  { value: "idle", title: "Idle" },
  { value: "manual", title: "Manual" },
  { value: "autonomous", title: "Auto" },
  { value: "pulse", title: "Pulse" },
];

function formatAngle(angle: number) {
  return `${angle >= 0 ? "+" : ""}${angle.toFixed(0)}°`;
}

function App() {
  const [config, setConfig] = useState<RobotConfig | null>(null);
  const [state, setState] = useState<RobotState | null>(null);
  const [drafts, setDrafts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const next = await fetchState();
      startTransition(() => {
        setState(next);
        setDrafts(Object.fromEntries(next.servos.map((servo) => [servo.id, servo.target_angle])));
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reach backend");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const boot = async () => {
      try {
        const [cfg, robot] = await Promise.all([fetchConfig(), fetchState()]);
        startTransition(() => {
          setConfig(cfg);
          setState(robot);
          setDrafts(Object.fromEntries(robot.servos.map((servo) => [servo.id, servo.target_angle])));
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to initialize console");
      } finally {
        setLoading(false);
      }
    };

    void boot();
    const interval = window.setInterval(() => {
      void refresh();
    }, 1400);

    return () => window.clearInterval(interval);
  }, []);

  const totalLoad = state
    ? state.servos.reduce((sum, servo) => sum + servo.load_pct, 0) / state.servos.length
    : 0;

  const activeTrack = state?.transport.track_name || tracks[0].name;

  const commitAction = async (action: () => Promise<RobotState>) => {
    try {
      const next = await action();
      startTransition(() => {
        setState(next);
        setDrafts(Object.fromEntries(next.servos.map((servo) => [servo.id, servo.target_angle])));
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  };

  return (
    <main className="relative overflow-hidden px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <Card className="overflow-hidden">
          <CardContent className="relative grid gap-8 p-8 lg:grid-cols-[1.4fr_0.8fr]">
            <div className="absolute inset-y-0 right-0 hidden w-2/5 bg-[radial-gradient(circle_at_top,rgba(72,187,255,0.22),transparent_55%)] lg:block" />
            <div className="relative flex flex-col gap-6">
              <div className="flex flex-wrap items-center gap-3">
                <Badge>Music-Led Motion</Badge>
                <Badge variant="muted">{config?.assembly ?? "Follower"} Assembly</Badge>
                <Badge variant="accent">{state?.connected ? "Hardware Ready" : "Waiting for Bus"}</Badge>
              </div>
              <div className="max-w-3xl space-y-4">
                <p className="hud-label">LeRobot Motion Console</p>
                <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
                  A control surface for making your SO-101 follower arm move like it can hear the room.
                </h1>
                <p className="max-w-2xl text-base text-slate-300 sm:text-lg">
                  This first version focuses on a strong UI layer and a simple Python state engine. It already
                  knows your follower port, servo chain, and dance scenes, and it is shaped so we can attach real
                  LeRobot commands next.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => void commitAction(() => pulseDance({ bpm: state?.transport.bpm ?? 124, energy: 0.82 }))}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Fire Pulse Routine
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void commitAction(() =>
                      setTransport({ track_name: tracks[0].name, bpm: tracks[0].bpm, energy: tracks[0].energy, playing: true }),
                    )
                  }
                >
                  <Disc3 className="mr-2 h-4 w-4" />
                  Start Demo Track
                </Button>
              </div>
            </div>

            <div className="relative grid gap-4">
              <div className="glass-panel rounded-[28px] p-5">
                <p className="hud-label mb-3">Live Spectrum</p>
                <div className="flex h-36 items-end gap-2">
                  {(state?.spectrum ?? Array.from({ length: 18 }, () => 28)).map((value, index) => (
                    <div
                      key={`${value}-${index}`}
                      className="animate-pulse-grid rounded-full bg-gradient-to-t from-secondary via-accent to-primary"
                      style={{
                        height: `${Math.max(18, value)}%`,
                        width: "100%",
                        animationDelay: `${index * 80}ms`,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <MetricCard label="Sync Quality" value={`${state?.sync_quality ?? 0}%`} icon={Radio} />
                <MetricCard label="Latency" value={`${state?.latency_ms ?? 0} ms`} icon={Activity} />
                <MetricCard label="Group Load" value={`${totalLoad.toFixed(0)}%`} icon={Gauge} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_1.2fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle>Playback + Modes</CardTitle>
              <CardDescription>Use track energy and mode switches to drive the state machine.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="hud-label mb-2">Now Selected</p>
                    <p className="text-2xl font-semibold text-white">{activeTrack}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {state?.transport.bpm ?? tracks[0].bpm} BPM • energy {(state?.transport.energy ?? tracks[0].energy).toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
                    {state?.transport.playing ? "Playing" : "Paused"}
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <Button
                    size="sm"
                    onClick={() =>
                      void commitAction(() =>
                        setTransport({
                          track_name: state?.transport.track_name ?? tracks[0].name,
                          bpm: state?.transport.bpm ?? tracks[0].bpm,
                          energy: state?.transport.energy ?? tracks[0].energy,
                          playing: !state?.transport.playing,
                        }),
                      )
                    }
                  >
                    {state?.transport.playing ? "Pause Motion" : "Resume Motion"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void commitAction(() => setMode("idle"))}
                  >
                    Safe Idle
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <p className="hud-label">Track Presets</p>
                <div className="grid gap-3">
                  {tracks.map((track) => (
                    <button
                      key={track.name}
                      className="rounded-[22px] border border-white/10 bg-white/5 p-4 text-left transition hover:border-primary/40 hover:bg-white/10"
                      onClick={() =>
                        void commitAction(() =>
                          setTransport({
                            track_name: track.name,
                            bpm: track.bpm,
                            energy: track.energy,
                            playing: true,
                          }),
                        )
                      }
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-medium">{track.name}</span>
                        <span className="text-sm text-muted-foreground">{track.bpm} BPM</span>
                      </div>
                      <div className="mt-3">
                        <Progress value={track.energy * 100} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <p className="hud-label">Motion Modes</p>
                <div className="grid grid-cols-2 gap-3">
                  {modeLabels.map((mode) => (
                    <Button
                      key={mode.value}
                      variant={state?.mode === mode.value ? "default" : "secondary"}
                      onClick={() => void commitAction(() => setMode(mode.value))}
                    >
                      {mode.title}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Servo Choreography</CardTitle>
              <CardDescription>
                Tune target angles per joint. The backend keeps these values in a safe mock state store for now.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="servos">
                <TabsList>
                  <TabsTrigger value="servos">Servos</TabsTrigger>
                  <TabsTrigger value="scenes">Scenes</TabsTrigger>
                </TabsList>
                <TabsContent value="servos" className="space-y-4">
                  {(state?.servos ?? []).map((servo) => (
                    <div key={servo.id} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-lg font-medium capitalize text-white">
                            {servo.name.replaceAll("_", " ")}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Current {formatAngle(servo.angle)} • target {formatAngle(drafts[servo.id] ?? servo.target_angle)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Torque</span>
                          <Switch
                            checked={servo.torque_enabled}
                            onCheckedChange={(checked) =>
                              void commitAction(() => updateServo(servo.id, { torque_enabled: checked }))
                            }
                          />
                        </div>
                      </div>
                      <div className="mt-5 space-y-4">
                        <Slider
                          value={[drafts[servo.id] ?? servo.target_angle]}
                          min={-140}
                          max={140}
                          step={1}
                          onValueChange={([value]) =>
                            setDrafts((current) => ({
                              ...current,
                              [servo.id]: value,
                            }))
                          }
                          onValueCommit={([value]) =>
                            void commitAction(() => updateServo(servo.id, { target_angle: value }))
                          }
                        />
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          <StatusPill label="Load" value={`${servo.load_pct.toFixed(0)}%`} />
                          <StatusPill label="Temp" value={`${servo.temperature_c.toFixed(1)}°C`} />
                          <StatusPill label="Phase" value={servo.motion_phase} />
                        </div>
                      </div>
                    </div>
                  ))}
                </TabsContent>
                <TabsContent value="scenes" className="space-y-4">
                  {scenes.map((scene) => (
                    <button
                      key={scene.name}
                      className="w-full rounded-[24px] border border-white/10 bg-white/5 p-5 text-left transition hover:border-accent/40 hover:bg-white/10"
                      onClick={() => void commitAction(() => triggerScene(scene.name))}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xl font-semibold">{scene.title}</span>
                        <Waves className="h-5 w-5 text-accent" />
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{scene.note}</p>
                    </button>
                  ))}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Robot Context</CardTitle>
              <CardDescription>Live config read from your local LeRobot setup file.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-[24px] bg-gradient-to-br from-white/10 to-white/5 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20">
                    <Cpu className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="hud-label">Follower Arm</p>
                    <p className="text-lg font-semibold">{config?.follower_id ?? "Unknown"}</p>
                  </div>
                </div>
                <div className="mt-5 space-y-3 text-sm text-slate-300">
                  <div className="flex justify-between gap-4">
                    <span>Port</span>
                    <span>{config?.follower_port ?? state?.follower_port ?? "Unavailable"}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Safety Step</span>
                    <span>{config?.safety_step_ticks ?? state?.safety_step_ticks ?? 0} ticks</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Status</span>
                    <span>{state?.status ?? "booting"}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Last Sync</span>
                    <span>{state ? new Date(state.last_sync).toLocaleTimeString() : "--"}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-black/20 p-5">
                <p className="hud-label mb-3">Readiness</p>
                <Progress value={state?.sync_quality ?? 0} />
                <p className="mt-3 text-sm text-muted-foreground">
                  This backend currently simulates safe motion state while keeping your actual device metadata in
                  view. The next step is replacing the mock motion engine with direct Feetech / LeRobot commands.
                </p>
              </div>

              <div className="rounded-[24px] border border-primary/20 bg-primary/10 p-5 text-sm text-primary-foreground">
                <div className="flex items-center gap-3 text-white">
                  <Zap className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Backend note</span>
                </div>
                <p className="mt-2 text-slate-200">
                  The API already exposes transport, scene, mode, and per-servo update routes. That makes the UI
                  stable while we build the real robot adapter.
                </p>
              </div>

              {error ? (
                <div className="rounded-[20px] border border-destructive/30 bg-destructive/10 p-4 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              {loading ? <p className="text-sm text-muted-foreground">Loading robot state…</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Activity;
}) {
  return (
    <div className="glass-panel rounded-[24px] p-4">
      <div className="flex items-center justify-between">
        <p className="hud-label">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-4 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
      <p className="hud-label mb-1">{label}</p>
      <p className="text-sm font-medium text-white">{value}</p>
    </div>
  );
}

export default App;
