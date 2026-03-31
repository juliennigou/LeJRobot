import {
  AlertTriangle,
  Cable,
  CheckCircle2,
  Cpu,
  Gauge,
  RefreshCw,
  Shield,
  Target,
  Thermometer,
  Unplug,
} from "lucide-react";

import type { ArmAdapterState, RobotState, ServoState } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

function titleize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function verificationTone(status: ArmAdapterState["verification"]["status"]) {
  switch (status) {
    case "ready":
      return {
        badgeClass: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
        panelClass: "border-emerald-400/15 bg-emerald-400/[0.04]",
        icon: CheckCircle2,
      };
    case "missing_dependency":
    case "missing_port":
    case "unreachable":
    case "missing_calibration":
    case "error":
      return {
        badgeClass: "border-red-300/25 bg-red-400/10 text-red-100",
        panelClass: "border-red-300/15 bg-red-400/[0.04]",
        icon: AlertTriangle,
      };
    default:
      return {
        badgeClass: "border-white/10 bg-white/[0.05] text-slate-200",
        panelClass: "border-white/10 bg-white/[0.03]",
        icon: Shield,
      };
  }
}

function servoRuntimeMap(servos: ServoState[]) {
  return new Map(servos.map((servo) => [servo.id, servo]));
}

export function HardwareStatusDashboard({
  state,
  loading,
  verifying,
  busyArmId,
  onVerify,
  onToggleConnection,
}: {
  state: RobotState | null;
  loading: boolean;
  verifying: boolean;
  busyArmId: string | null;
  onVerify: () => void;
  onToggleConnection: (armId: string, connected: boolean) => void;
}) {
  const arms = state?.dual_arm.arms ?? [];
  const execution = state?.dual_arm.execution;
  const servos = state?.servos ?? [];
  const liveServoState = servoRuntimeMap(servos);
  const connectedCount = arms.filter((arm) => arm.connected).length;
  const readyCount = arms.filter((arm) => arm.verification.status === "ready").length;
  const averageLoad =
    servos.length > 0 ? servos.reduce((sum, servo) => sum + servo.load_pct, 0) / servos.length : 0;

  return (
    <section className="grid gap-6">
      <Card className="overflow-hidden border-white/10 bg-white/[0.04]">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge>Hardware Readiness</Badge>
              <Badge variant="muted">{loading ? "Refreshing" : "Live State"}</Badge>
              <Badge variant="accent">{execution?.dry_run_required ? "Dry Run Required" : "Live Ready"}</Badge>
            </div>
            <CardTitle className="mt-4 text-3xl text-white">Arm and Motor Dashboard</CardTitle>
            <CardDescription className="max-w-3xl text-sm text-slate-300">
              Verify each SO-101 arm, inspect the current motor bus state, and confirm calibration and connection
              health before enabling live choreography.
            </CardDescription>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={onVerify} disabled={verifying}>
              <RefreshCw className={`mr-2 h-4 w-4 ${verifying ? "animate-spin" : ""}`} />
              {verifying ? "Checking Hardware..." : "Run Verification"}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryTile label="Connected Arms" value={`${connectedCount}/${arms.length || 2}`} icon={Cable} />
          <SummaryTile label="Verified Arms" value={`${readyCount}/${arms.length || 2}`} icon={Shield} />
          <SummaryTile label="Execution Mode" value={execution?.mode ?? "mirror"} icon={Cpu} />
          <SummaryTile label="Avg Motor Load" value={`${averageLoad.toFixed(1)}%`} icon={Gauge} />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="border-white/10 bg-white/[0.04]">
          <CardHeader>
            <CardTitle className="text-white">Live Motor Bus</CardTitle>
            <CardDescription className="text-slate-300">
              The current runtime state for the 6-motor execution bus: name, target, angle, load, heat, and torque.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {servos.map((servo) => (
              <div
                key={servo.id}
                className="rounded-[22px] border border-white/10 bg-black/25 p-4 shadow-[0_12px_34px_rgba(2,8,23,0.24)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <Badge variant="muted">Servo {servo.id}</Badge>
                      <p className="text-base font-semibold text-white">{titleize(servo.name)}</p>
                    </div>
                    <p className="mt-2 text-xs uppercase tracking-[0.24em] text-slate-500">{servo.motion_phase}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <MetricPill label="Angle" value={`${servo.angle.toFixed(1)}°`} icon={Gauge} />
                    <MetricPill label="Target" value={`${servo.target_angle.toFixed(1)}°`} icon={Target} />
                    <MetricPill label="Temp" value={`${servo.temperature_c.toFixed(1)}°C`} icon={Thermometer} />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-center">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.24em] text-slate-500">
                      <span>Load</span>
                      <span>{servo.load_pct.toFixed(1)}%</span>
                    </div>
                    <Progress value={servo.load_pct} className="h-2.5 bg-white/5" />
                  </div>
                  <div className="flex justify-start sm:justify-end">
                    <Badge
                      className={
                        servo.torque_enabled
                          ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                          : "border-slate-300/15 bg-slate-400/10 text-slate-200"
                      }
                    >
                      {servo.torque_enabled ? "Torque On" : "Torque Off"}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          {arms.map((arm) => {
            const tone = verificationTone(arm.verification.status);
            const ToneIcon = tone.icon;

            return (
              <Card key={arm.arm_id} className="border-white/10 bg-white/[0.04]">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <Badge>{titleize(arm.arm_type)}</Badge>
                        <Badge variant="muted">{titleize(arm.channel)} Channel</Badge>
                        <Badge className={tone.badgeClass}>{titleize(arm.verification.status)}</Badge>
                      </div>
                      <CardTitle className="mt-4 text-2xl text-white">{arm.arm_id}</CardTitle>
                      <CardDescription className="text-slate-300">
                        {arm.verification.message ?? arm.notes ?? "No verification message yet."}
                      </CardDescription>
                    </div>

                    <Button
                      variant={arm.connected ? "ghost" : "secondary"}
                      disabled={busyArmId === arm.arm_id}
                      onClick={() => onToggleConnection(arm.arm_id, !arm.connected)}
                    >
                      {arm.connected ? <Unplug className="mr-2 h-4 w-4" /> : <Cable className="mr-2 h-4 w-4" />}
                      {busyArmId === arm.arm_id ? "Updating..." : arm.connected ? "Disconnect" : "Connect"}
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="grid gap-4">
                  <div className={`rounded-[24px] border p-4 ${tone.panelClass}`}>
                    <div className="flex items-start gap-3">
                      <ToneIcon className="mt-0.5 h-5 w-5 text-white" />
                      <div className="min-w-0 flex-1">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <DashboardField label="Serial Port" value={arm.port ?? "Not configured"} />
                          <DashboardField label="Driver" value={arm.verification.driver} />
                          <DashboardField
                            label="Calibration"
                            value={arm.verification.calibration_path ?? "Not found"}
                            wrap
                          />
                          <DashboardField
                            label="Joint Coverage"
                            value={`${arm.verification.detected_joint_count}/${arm.verification.expected_joint_count}`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <StatusBlock label="Amplitude" value={arm.safety.amplitude_scale.toFixed(2)} />
                    <StatusBlock label="Speed" value={arm.safety.speed_scale.toFixed(2)} />
                    <StatusBlock label="Step Limit" value={`${arm.safety.max_step_degrees.toFixed(1)}°`} />
                  </div>

                  <div className="overflow-hidden rounded-[22px] border border-white/10">
                    <div className="grid grid-cols-[1.2fr_60px_88px_1fr] gap-3 border-b border-white/10 bg-black/30 px-4 py-3 text-[11px] uppercase tracking-[0.24em] text-slate-400">
                      <span>Joint</span>
                      <span>Id</span>
                      <span>Offset</span>
                      <span>Live / Limits</span>
                    </div>
                    <div className="divide-y divide-white/10 bg-black/20">
                      {arm.joints.map((joint) => {
                        const runtime = liveServoState.get(joint.servo_id);
                        return (
                          <div
                            key={`${arm.arm_id}-${joint.joint_name}`}
                            className="grid grid-cols-[1.2fr_60px_88px_1fr] gap-3 px-4 py-3 text-sm text-slate-200"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium text-white">{titleize(joint.joint_name)}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {joint.inverted ? "Inverted" : "Standard"} • max speed {joint.max_speed.toFixed(2)}
                              </p>
                            </div>
                            <span>{joint.servo_id}</span>
                            <span>{joint.offset_degrees.toFixed(1)}°</span>
                            <div className="min-w-0">
                              <p className="truncate text-white">
                                {runtime ? `${runtime.angle.toFixed(1)}° → ${runtime.target_angle.toFixed(1)}°` : "No live state"}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                limit {joint.min_angle.toFixed(0)}° / {joint.max_angle.toFixed(0)}°
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SummaryTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Cpu;
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

function MetricPill({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Gauge;
}) {
  return (
    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-200">
      <span className="inline-flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span className="text-slate-400">{label}</span>
        <span className="font-medium text-white">{value}</span>
      </span>
    </div>
  );
}

function DashboardField({
  label,
  value,
  wrap = false,
}: {
  label: string;
  value: string;
  wrap?: boolean;
}) {
  return (
    <div>
      <p className="hud-label">{label}</p>
      <p className={`mt-2 text-sm text-white ${wrap ? "break-all" : "truncate"}`}>{value}</p>
    </div>
  );
}

function StatusBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3">
      <p className="hud-label">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
