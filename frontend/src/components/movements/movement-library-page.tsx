import { Activity, Hand, Loader2, Play, Square, Waves } from "lucide-react";

import type {
  ArmAdapterState,
  ExecutionMode,
  MovementDefinition,
  MovementLibraryState,
  MovementTargetScope,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

const JOINT_GUIDE = [
  { name: "Shoulder Pan", role: "Sweeps the whole arm left and right." },
  { name: "Shoulder Lift", role: "Raises or lowers the arm to set the main silhouette." },
  { name: "Elbow Flex", role: "Creates bend, reach, and expressive folding." },
  { name: "Wrist Flex", role: "Adds hand pitch and soft finishing accents." },
  { name: "Wrist Roll", role: "Rotates the hand for wave, twist, and flourish motions." },
  { name: "Gripper", role: "Keeps the hand open or adds small accent gestures." },
];

function titleize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function armReady(arm: ArmAdapterState) {
  return arm.connected && arm.telemetry_live && !arm.safety.dry_run && arm.safety.torque_enabled && !arm.safety.emergency_stop;
}

export function MovementLibraryPage({
  library,
  arms,
  selectedArmId,
  targetScope,
  executionMode,
  movementTunings,
  busyAction,
  onSelectArm,
  onSelectTargetScope,
  onSelectExecutionMode,
  onSelectPreset,
  onFrequencyChange,
  onCyclesChange,
  onAmplitudeScaleChange,
  onSoftnessChange,
  onAsymmetryChange,
  onFollowThroughEnabledChange,
  onFollowThroughDelayChange,
  onFollowThroughGainChange,
  onFollowThroughDampingChange,
  onFollowThroughSettleChange,
  onRunMovement,
  onStopMovement,
}: {
  library: MovementLibraryState | null;
  arms: ArmAdapterState[];
  selectedArmId: string | null;
  targetScope: MovementTargetScope;
  executionMode: ExecutionMode;
  movementTunings: Record<
    string,
    {
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
    }
  >;
  busyAction: string | null;
  onSelectArm: (armId: string) => void;
  onSelectTargetScope: (scope: MovementTargetScope) => void;
  onSelectExecutionMode: (mode: ExecutionMode) => void;
  onSelectPreset: (movementId: string, presetId: string) => void;
  onFrequencyChange: (movementId: string, value: number) => void;
  onCyclesChange: (movementId: string, value: number) => void;
  onAmplitudeScaleChange: (movementId: string, value: number) => void;
  onSoftnessChange: (movementId: string, value: number) => void;
  onAsymmetryChange: (movementId: string, value: number) => void;
  onFollowThroughEnabledChange: (movementId: string, value: boolean) => void;
  onFollowThroughDelayChange: (movementId: string, value: number) => void;
  onFollowThroughGainChange: (movementId: string, value: number) => void;
  onFollowThroughDampingChange: (movementId: string, value: number) => void;
  onFollowThroughSettleChange: (movementId: string, value: number) => void;
  onRunMovement: (movementId: string) => void;
  onStopMovement: () => void;
}) {
  const active = library?.active ?? {
    status: "idle" as const,
    target_scope: "single" as const,
    execution_mode: "unison" as const,
    arm_ids: [],
    progress: 0,
  };
  const selectedArm = arms.find((arm) => arm.arm_id === selectedArmId) ?? null;

  return (
    <section className="grid gap-6">
      <Card className="border-white/10 bg-white/[0.04]">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge>Movement Library</Badge>
            <Badge variant="accent">First Live Motion Path</Badge>
            <Badge variant="muted">{active.status === "running" ? "Movement Running" : "Ready"}</Badge>
          </div>
          <CardTitle className="text-3xl text-white">Movement Studio</CardTitle>
          <CardDescription className="max-w-3xl text-slate-300">
            Start with reusable motion primitives before binding everything to music. You can now target one arm or
            both arms together, and switch between `unison` and `mirror` playback for the same movement.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-white/10 bg-white/[0.04]">
          <CardHeader>
            <CardTitle className="text-white">Execution Target</CardTitle>
            <CardDescription className="text-slate-300">
              Choose a single arm or run both arms together. Dual-arm playback reuses the same tuned movement with
              `unison` or `mirror` coordination.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                className={`rounded-[24px] border p-4 text-left transition ${
                  targetScope === "single"
                    ? "border-primary/40 bg-primary/10 shadow-[0_16px_40px_rgba(12,74,162,0.18)]"
                    : "border-white/10 bg-black/20 hover:border-white/20"
                }`}
                onClick={() => onSelectTargetScope("single")}
                type="button"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>Single Arm</Badge>
                  <Badge variant="muted">Manual selection</Badge>
                </div>
                <p className="mt-4 text-sm text-slate-300">Run a movement on one arm at a time for tuning and checks.</p>
              </button>
              <button
                className={`rounded-[24px] border p-4 text-left transition ${
                  targetScope === "both"
                    ? "border-primary/40 bg-primary/10 shadow-[0_16px_40px_rgba(12,74,162,0.18)]"
                    : "border-white/10 bg-black/20 hover:border-white/20"
                }`}
                onClick={() => onSelectTargetScope("both")}
                type="button"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>Both Arms</Badge>
                  <Badge variant="muted">{executionMode === "mirror" ? "Mirror" : "Unison"}</Badge>
                </div>
                <p className="mt-4 text-sm text-slate-300">
                  Drive leader and follower together using the same movement runtime.
                </p>
              </button>
            </div>

            {targetScope === "both" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  className={`rounded-[20px] border px-4 py-3 text-left transition ${
                    executionMode === "mirror"
                      ? "border-primary/40 bg-primary/10 text-white"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20"
                  }`}
                  onClick={() => onSelectExecutionMode("mirror")}
                  type="button"
                >
                  <p className="text-sm font-semibold">Mirror</p>
                  <p className="mt-1 text-xs text-slate-400">Oppose shoulder pan and wrist roll so the arms read symmetrically.</p>
                </button>
                <button
                  className={`rounded-[20px] border px-4 py-3 text-left transition ${
                    executionMode === "unison"
                      ? "border-primary/40 bg-primary/10 text-white"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20"
                  }`}
                  onClick={() => onSelectExecutionMode("unison")}
                  type="button"
                >
                  <p className="text-sm font-semibold">Unison</p>
                  <p className="mt-1 text-xs text-slate-400">Send the same joint trajectory to both arms together.</p>
                </button>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
            {arms.map((arm) => {
              const selected = arm.arm_id === selectedArmId;
              const ready = armReady(arm);
              return (
                <button
                  key={arm.arm_id}
                  className={`rounded-[24px] border p-4 text-left transition ${
                    selected
                      ? "border-primary/40 bg-primary/10 shadow-[0_16px_40px_rgba(12,74,162,0.18)]"
                      : "border-white/10 bg-black/20 hover:border-white/20"
                  }`}
                  onClick={() => onSelectArm(arm.arm_id)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{titleize(arm.arm_type)}</Badge>
                    <Badge variant="muted">{arm.arm_id}</Badge>
                    <Badge variant={ready ? "accent" : "muted"}>{ready ? "Live Ready" : "Not Ready"}</Badge>
                  </div>
                  <p className="mt-4 text-sm text-slate-300">
                    {ready
                      ? "Connected, torque enabled, and ready to execute a bounded movement."
                      : arm.notes ?? "Adjust safety state before running a movement."}
                  </p>
                </button>
              );
            })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.04]">
          <CardHeader>
            <CardTitle className="text-white">6 Joint Roles</CardTitle>
            <CardDescription className="text-slate-300">
              Build movements from a small number of readable joint roles instead of fighting every servo at once.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {JOINT_GUIDE.map((joint) => (
              <div key={joint.name} className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-sm font-semibold text-white">{joint.name}</p>
                <p className="mt-1 text-sm text-slate-400">{joint.role}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-white/10 bg-white/[0.04]">
          <CardHeader>
            <CardTitle className="text-white">Available Movements</CardTitle>
            <CardDescription className="text-slate-300">
              Movements are high-level primitives. Some are layered and expressive like `wave`; others stay deliberately
              simple, like the new `wrist_lean`.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {(library?.movements ?? []).map((movement) => {
              const readyArms = arms.filter((arm) => armReady(arm));
              const canRun =
                active.status !== "running" &&
                (targetScope === "single" ? (!!selectedArm && armReady(selectedArm)) : readyArms.length >= 2);
              const isRunning = active.status === "running" && active.movement_id === movement.movement_id;
              const tuning = movementTunings[movement.movement_id] ?? defaultMovementTuning(movement);
              const selectedPreset =
                movement.presets.find((preset) => preset.preset_id === tuning.presetId) ?? movement.presets[0] ?? null;
              const phaseChain = selectedPreset?.joint_profiles
                .map((profile) => `${titleize(profile.joint_name)} ${profile.phase_delay_radians.toFixed(2)}rad`)
                .join(" -> ");
              const followThroughChain = selectedPreset?.follow_through.profiles
                .map((profile) => `${titleize(profile.source_joint)} → ${titleize(profile.joint_name)}`)
                .join(" • ");

              return (
                <div
                  key={movement.movement_id}
                  className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(11,19,34,0.95),rgba(6,11,20,0.98))] p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-2xl">
                      <div className="flex flex-wrap items-center gap-3">
                        <Badge>{movement.name}</Badge>
                        <Badge variant="muted">{movement.duration_seconds.toFixed(1)}s</Badge>
                        <Badge variant="accent">{movement.recommended_arm ?? "follower"}</Badge>
                        <Badge variant="muted">{movement.controller}</Badge>
                      </div>
                      <p className="mt-4 text-base font-semibold text-white">{movement.summary}</p>
                      <p className="mt-2 text-sm text-slate-400">{movement.description}</p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="secondary"
                        disabled={!canRun || busyAction !== null}
                        onClick={() => onRunMovement(movement.movement_id)}
                      >
                        {busyAction === `run:${movement.movement_id}` ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="mr-2 h-4 w-4" />
                        )}
                        {isRunning ? "Running..." : targetScope === "both" ? "Run Both Arms" : "Run Movement"}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={active.status !== "running" || busyAction !== null}
                        onClick={onStopMovement}
                      >
                        {busyAction === "stop-movement" ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Square className="mr-2 h-4 w-4" />
                        )}
                        Stop
                      </Button>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {movement.focus_joints.map((joint) => (
                      <Badge key={joint} variant="muted">
                        {titleize(joint)}
                      </Badge>
                    ))}
                  </div>

                  {movement.controller === "oscillator" && movement.presets.length > 0 ? (
                    <div className="mt-6 grid gap-5 rounded-[22px] border border-white/10 bg-black/25 p-4">
                      <div>
                        <p className="text-sm font-semibold text-white">Style Presets</p>
                        <p className="mt-1 text-sm text-slate-400">
                          Use these to test timing and intensity directly next to the movement before running it.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-3">
                          {movement.presets.map((preset) => (
                            <button
                              key={preset.preset_id}
                              className={`rounded-2xl border px-4 py-3 text-left transition ${
                                tuning.presetId === preset.preset_id
                                  ? "border-primary/40 bg-primary/10 text-white"
                                  : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20"
                              }`}
                              onClick={() => onSelectPreset(movement.movement_id, preset.preset_id)}
                              type="button"
                            >
                              <p className="text-sm font-semibold">{preset.label}</p>
                              <p className="mt-1 max-w-xs text-xs text-slate-400">{preset.summary}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-2">
                        <TuningSlider
                          label="Tempo"
                          value={tuning.frequencyHz}
                          display={`${tuning.frequencyHz.toFixed(2)} Hz`}
                          min={0.2}
                          max={1.5}
                          step={0.01}
                          onChange={(value) => onFrequencyChange(movement.movement_id, value)}
                        />
                        <TuningSlider
                          label="Cycles"
                          value={tuning.cycles}
                          display={`${tuning.cycles.toFixed(0)} cycles`}
                          min={1}
                          max={8}
                          step={1}
                          onChange={(value) => onCyclesChange(movement.movement_id, Math.round(value))}
                        />
                        <TuningSlider
                          label="Amplitude"
                          value={tuning.amplitudeScale}
                          display={`${tuning.amplitudeScale.toFixed(2)}x`}
                          min={0.5}
                          max={1.6}
                          step={0.01}
                          onChange={(value) => onAmplitudeScaleChange(movement.movement_id, value)}
                        />
                        <TuningSlider
                          label="Softness"
                          value={tuning.softness}
                          display={tuning.softness.toFixed(2)}
                          min={0.2}
                          max={1.0}
                          step={0.01}
                          onChange={(value) => onSoftnessChange(movement.movement_id, value)}
                        />
                        <TuningSlider
                          label="Asymmetry"
                          value={tuning.asymmetry}
                          display={tuning.asymmetry.toFixed(2)}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(value) => onAsymmetryChange(movement.movement_id, value)}
                        />
                      </div>

                      <div className="grid gap-4 rounded-[18px] border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">Follow-Through Layer</p>
                            <p className="mt-1 text-sm text-slate-400">
                              Add delayed reactive motion so the gesture settles and propagates through the arm.
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant={tuning.followThroughEnabled ? "accent" : "muted"}>
                              {tuning.followThroughEnabled ? "Enabled" : "Disabled"}
                            </Badge>
                            <Switch
                              checked={tuning.followThroughEnabled}
                              onCheckedChange={(value) => onFollowThroughEnabledChange(movement.movement_id, value)}
                            />
                          </div>
                        </div>

                        {tuning.followThroughEnabled ? (
                          <div className="grid gap-4 xl:grid-cols-2">
                            <TuningSlider
                              label="Delay"
                              value={tuning.followThroughDelaySeconds}
                              display={`${tuning.followThroughDelaySeconds.toFixed(2)} s`}
                              min={0}
                              max={0.35}
                              step={0.01}
                              onChange={(value) => onFollowThroughDelayChange(movement.movement_id, value)}
                            />
                            <TuningSlider
                              label="Gain"
                              value={tuning.followThroughGain}
                              display={tuning.followThroughGain.toFixed(2)}
                              min={0}
                              max={0.8}
                              step={0.01}
                              onChange={(value) => onFollowThroughGainChange(movement.movement_id, value)}
                            />
                            <TuningSlider
                              label="Damping"
                              value={tuning.followThroughDamping}
                              display={tuning.followThroughDamping.toFixed(2)}
                              min={0}
                              max={1}
                              step={0.01}
                              onChange={(value) => onFollowThroughDampingChange(movement.movement_id, value)}
                            />
                            <TuningSlider
                              label="Settle"
                              value={tuning.followThroughSettle}
                              display={tuning.followThroughSettle.toFixed(2)}
                              min={0}
                              max={0.5}
                              step={0.01}
                              onChange={(value) => onFollowThroughSettleChange(movement.movement_id, value)}
                            />
                          </div>
                        ) : null}
                      </div>

                      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
                        <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4">
                          <p className="text-sm font-semibold text-white">Prepared Base Pose</p>
                          <p className="mt-1 text-sm text-slate-400">
                            This is the neutral pose used before the oscillator adds motion. It makes testing easier
                            because you can see exactly where the gesture starts.
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {Object.entries(movement.neutral_pose).map(([joint, value]) => (
                              <Badge key={joint} variant="muted">
                                {titleize(joint)} {value.toFixed(0)}°
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4">
                          <p className="text-sm font-semibold text-white">Phase Chain</p>
                          <p className="mt-1 text-sm text-slate-400">
                            Proximal joints start first; distal joints finish the gesture.
                          </p>
                          <p className="mt-3 text-sm text-slate-200">{phaseChain ?? "No preset selected."}</p>
                          {followThroughChain ? (
                            <p className="mt-3 text-xs text-slate-400">Follow-through: {followThroughChain}</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.04]">
          <CardHeader>
            <CardTitle className="text-white">Live Movement State</CardTitle>
            <CardDescription className="text-slate-300">
              Progress of the currently selected manual movement.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="rounded-[24px] border border-white/10 bg-black/20 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <Badge>{active.movement_id ?? "No movement"}</Badge>
                <Badge variant={active.status === "running" ? "accent" : "muted"}>{active.status}</Badge>
                {active.preset_id ? <Badge variant="muted">{active.preset_id}</Badge> : null}
                <Badge variant="muted">{active.target_scope}</Badge>
                <Badge variant="muted">{active.execution_mode}</Badge>
                {(active.arm_ids ?? []).map((armId) => (
                  <Badge key={armId} variant="muted">
                    {armId}
                  </Badge>
                ))}
              </div>
              <p className="mt-4 text-sm text-slate-300">{active.note ?? "Pick an arm and run a movement."}</p>
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.24em] text-slate-500">
                  <span>Progress</span>
                  <span>{Math.round((active.progress ?? 0) * 100)}%</span>
                </div>
                <Progress value={(active.progress ?? 0) * 100} className="h-2.5 bg-white/5" />
              </div>
            </div>

            <div className="grid gap-3">
              <MotionHint
                icon={Waves}
                title="Wave Anatomy"
                description="One oscillator drives the whole gesture. Small shoulder motion leads, elbow follows, and wrist flex plus wrist roll provide the clearest visible wave."
              />
              <MotionHint
                icon={Hand}
                title="Safety Envelope"
                description="The backend still applies dry-run checks, torque checks, emergency-stop, and per-joint step limits before each live write."
              />
              <MotionHint
                icon={Activity}
                title="Next Library Steps"
                description="After wave, we can add punch, bloom, sweep, point, and idle-loop gestures with the same oscillator and synergy structure."
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function defaultMovementTuning(movement: MovementDefinition) {
  const preset =
    movement.presets.find((entry) => entry.preset_id === movement.default_preset_id) ?? movement.presets[0] ?? null;
  return {
    presetId: preset?.preset_id ?? "normal",
    frequencyHz: preset?.frequency_hz ?? 0.8,
    cycles: preset?.cycles ?? 2,
    amplitudeScale: preset?.amplitude_scale ?? 1,
    softness: preset?.softness ?? 0.72,
    asymmetry: preset?.asymmetry ?? 0,
    followThroughEnabled: preset?.follow_through?.enabled ?? true,
    followThroughDelaySeconds: preset?.follow_through?.delay_seconds ?? 0.12,
    followThroughGain: preset?.follow_through?.gain ?? 0.2,
    followThroughDamping: preset?.follow_through?.damping ?? 0.4,
    followThroughSettle: preset?.follow_through?.settle ?? 0.14,
  };
}

function TuningSlider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{label}</p>
        <Badge variant="muted">{display}</Badge>
      </div>
      <Slider
        className="mt-4"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(values) => onChange(values[0] ?? value)}
      />
    </div>
  );
}

function MotionHint({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Waves;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-black/20 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </div>
      </div>
    </div>
  );
}
