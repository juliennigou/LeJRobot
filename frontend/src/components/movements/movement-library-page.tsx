import { useMemo, useState } from "react";
import { Activity, ChevronDown, Info, Loader2, Play, Square } from "lucide-react";

import type {
  ArmAdapterState,
  ExecutionMode,
  MovementDefinition,
  MovementLibraryState,
  MovementTargetScope,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  const [expandedMovementId, setExpandedMovementId] = useState<string | null>(null);

  const selectedArm = arms.find((arm) => arm.arm_id === selectedArmId) ?? null;
  const readyArms = useMemo(() => arms.filter((arm) => armReady(arm)), [arms]);
  const canRunCurrentScope = targetScope === "single" ? !!selectedArm && armReady(selectedArm) : readyArms.length >= 2;

  return (
    <section className="space-y-6">
      <header className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Movement Library</Badge>
              <Badge variant="muted">{library?.movements.length ?? 0} movements</Badge>
              <Badge variant={active.status === "running" ? "accent" : "muted"}>{active.status}</Badge>
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white">Manual movement library</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                Pick a primitive, open it, tune it, and run it. The page stays focused on the movement list instead of exposing every control at once.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <JointGuideInfo />
            <Button
              variant="ghost"
              disabled={active.status !== "running" || busyAction !== null}
              onClick={onStopMovement}
            >
              {busyAction === "stop-movement" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-4 w-4" />}
              Stop
            </Button>
          </div>
        </div>

        <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <ScopePill active={targetScope === "single"} onClick={() => onSelectTargetScope("single")}>
                Single
              </ScopePill>
              <ScopePill active={targetScope === "both"} onClick={() => onSelectTargetScope("both")}>
                Both
              </ScopePill>
              {targetScope === "both" ? (
                <>
                  <div className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
                  <ScopePill active={executionMode === "mirror"} onClick={() => onSelectExecutionMode("mirror")}>
                    Mirror
                  </ScopePill>
                  <ScopePill active={executionMode === "unison"} onClick={() => onSelectExecutionMode("unison")}>
                    Unison
                  </ScopePill>
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {arms.map((arm) => {
                const selected = arm.arm_id === selectedArmId;
                const ready = armReady(arm);
                return (
                  <button
                    key={arm.arm_id}
                    type="button"
                    onClick={() => onSelectArm(arm.arm_id)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
                      selected
                        ? "border-primary/40 bg-primary/12 text-white"
                        : "border-white/10 bg-black/20 text-slate-300 hover:border-white/20 hover:text-white"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        ready ? "bg-emerald-400" : arm.connected ? "bg-amber-400" : "bg-red-400"
                      }`}
                    />
                    <span>{titleize(arm.arm_type)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-white">
                {active.movement_id ? `${titleize(active.movement_id)} is ${active.status}` : "No active movement"}
              </p>
              <p className="mt-1 text-sm text-slate-400">{active.note ?? "Choose a movement and run it on the selected execution target."}</p>
            </div>
            <div className="sm:min-w-52">
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-500">
                <span>Progress</span>
                <span>{Math.round((active.progress ?? 0) * 100)}%</span>
              </div>
              <Progress value={(active.progress ?? 0) * 100} className="h-2 bg-white/5" />
            </div>
          </div>
        </div>
      </header>

      <div className="overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.03]">
        {(library?.movements ?? []).map((movement, index) => {
          const tuning = movementTunings[movement.movement_id] ?? defaultMovementTuning(movement);
          const selectedPreset =
            movement.presets.find((preset) => preset.preset_id === tuning.presetId) ?? movement.presets[0] ?? null;
          const isExpanded = expandedMovementId === movement.movement_id;
          const isRunning = active.status === "running" && active.movement_id === movement.movement_id;
          const runDisabled = busyAction !== null || active.status === "running" || !canRunCurrentScope;

          return (
            <article
              key={movement.movement_id}
              className={index === 0 ? "" : "border-t border-white/8"}
            >
              <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <button
                    type="button"
                    onClick={() => setExpandedMovementId((current) => (current === movement.movement_id ? null : movement.movement_id))}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300">
                        <ChevronDown className={`h-4 w-4 transition ${isExpanded ? "rotate-180" : ""}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-semibold text-white">{movement.name}</p>
                          <Badge variant="muted">{movement.duration_seconds.toFixed(1)}s</Badge>
                          <Badge variant="muted">{movement.controller}</Badge>
                        </div>
                        <p className="mt-2 max-w-3xl text-sm text-slate-400">{movement.summary}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {movement.focus_joints.map((joint) => (
                            <Badge key={joint} variant="muted">
                              {titleize(joint)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant={isRunning ? "secondary" : "default"}
                      disabled={runDisabled}
                      onClick={() => onRunMovement(movement.movement_id)}
                    >
                      {busyAction === `run:${movement.movement_id}` ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="mr-2 h-4 w-4" />
                      )}
                      {targetScope === "both" ? "Run Both" : "Run"}
                    </Button>
                  </div>
                </div>

                {isExpanded ? (
                  <div className="rounded-[24px] border border-white/10 bg-black/20 p-4 sm:p-5">
                    <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
                      <div className="space-y-5">
                        <div>
                          <p className="hud-label">Preset</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {movement.presets.map((preset) => (
                              <button
                                key={preset.preset_id}
                                type="button"
                                onClick={() => onSelectPreset(movement.movement_id, preset.preset_id)}
                                className={`rounded-full border px-4 py-2 text-sm transition ${
                                  tuning.presetId === preset.preset_id
                                    ? "border-primary/40 bg-primary/12 text-white"
                                    : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:text-white"
                                }`}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                          {selectedPreset ? <p className="mt-3 text-sm text-slate-400">{selectedPreset.summary}</p> : null}
                        </div>

                        <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                          <p className="text-sm font-semibold text-white">Base pose</p>
                          <p className="mt-1 text-sm text-slate-400">Prepared starting angles before the motion layer begins.</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {Object.entries(movement.neutral_pose).map(([joint, value]) => (
                              <Badge key={joint} variant="muted">
                                {titleize(joint)} {value.toFixed(0)}°
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                          <p className="text-sm font-semibold text-white">About this movement</p>
                          <p className="mt-2 text-sm text-slate-400">{movement.description}</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-2">
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

                        <details className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                          <summary className="cursor-pointer list-none">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-white">Advanced follow-through</p>
                                <p className="mt-1 text-sm text-slate-400">Delay, gain, damping, and settle tuning for the reactive layer.</p>
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
                          </summary>

                          {tuning.followThroughEnabled ? (
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
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
                        </details>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Live movement path</p>
            <p className="mt-1 text-sm text-slate-400">
              Manual runs still go through torque checks, dry-run gating, emergency stop, and step-limited writes before the arm moves.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function JointGuideInfo() {
  return (
    <div className="group relative">
      <button
        type="button"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-300 transition hover:border-white/20 hover:text-white"
        aria-label="Joint roles"
      >
        <Info className="h-4 w-4" />
      </button>
      <div className="pointer-events-none absolute right-0 top-[calc(100%+0.5rem)] z-20 w-72 rounded-[22px] border border-white/10 bg-slate-950/95 p-4 opacity-0 shadow-2xl transition group-hover:opacity-100 group-focus-within:opacity-100">
        <p className="text-sm font-semibold text-white">6 joint roles</p>
        <div className="mt-3 space-y-3">
          {JOINT_GUIDE.map((joint) => (
            <div key={joint.name}>
              <p className="text-sm font-medium text-white">{joint.name}</p>
              <p className="mt-1 text-sm text-slate-400">{joint.role}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScopePill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm transition ${
        active
          ? "border-primary/40 bg-primary/12 text-white"
          : "border-white/10 bg-black/20 text-slate-300 hover:border-white/20 hover:text-white"
      }`}
    >
      {children}
    </button>
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
