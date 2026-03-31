import type { ArmAdapterState, ServoState } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Point = {
  x: number;
  y: number;
};

const VIEWBOX = { width: 280, height: 300 };
const SEGMENTS = {
  upper: 78,
  lower: 68,
  wrist: 42,
  tool: 24,
};

function servoMap(servos: ServoState[]) {
  return new Map(servos.map((servo) => [servo.name, servo]));
}

function titleize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function degToRad(value: number) {
  return (value * Math.PI) / 180;
}

function project(origin: Point, length: number, angleRad: number): Point {
  return {
    x: origin.x + Math.cos(angleRad) * length,
    y: origin.y + Math.sin(angleRad) * length,
  };
}

function mirrorPoint(point: Point, mirrored: boolean): Point {
  if (!mirrored) {
    return point;
  }

  return {
    x: VIEWBOX.width - point.x,
    y: point.y,
  };
}

function path(points: Point[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function buildArmPose(arm: ArmAdapterState) {
  const telemetry = servoMap(arm.telemetry);
  const shoulderPan = telemetry.get("shoulder_pan")?.angle ?? 0;
  const shoulderLift = telemetry.get("shoulder_lift")?.angle ?? 0;
  const elbowFlex = telemetry.get("elbow_flex")?.angle ?? 0;
  const wristFlex = telemetry.get("wrist_flex")?.angle ?? 0;
  const wristRoll = telemetry.get("wrist_roll")?.angle ?? 0;
  const gripper = telemetry.get("gripper")?.angle ?? 0;
  const mirrored = arm.channel === "right";

  const base = { x: 78, y: 252 };
  const shoulder = { x: 98 + shoulderPan * 0.42, y: 214 };
  const upperAngle = degToRad(-92 + shoulderLift * 0.85);
  const elbowAngle = upperAngle + degToRad(elbowFlex * 0.82);
  const wristAngle = elbowAngle + degToRad(wristFlex * 0.72);
  const toolAngle = wristAngle + degToRad(wristFlex * 0.18);

  const elbow = project(shoulder, SEGMENTS.upper, upperAngle);
  const wrist = project(elbow, SEGMENTS.lower, elbowAngle);
  const roll = project(wrist, SEGMENTS.wrist, wristAngle);
  const gripperBase = project(roll, SEGMENTS.tool, toolAngle);

  const gripWidth = 8 + clamp((gripper + 5) * 0.22, 4, 28);
  const jawOffsetX = Math.sin(toolAngle) * gripWidth * 0.5;
  const jawOffsetY = -Math.cos(toolAngle) * gripWidth * 0.5;
  const jawLengthX = Math.cos(toolAngle) * 14;
  const jawLengthY = Math.sin(toolAngle) * 14;

  const upperJawStart = { x: gripperBase.x + jawOffsetX, y: gripperBase.y + jawOffsetY };
  const upperJawEnd = { x: upperJawStart.x + jawLengthX, y: upperJawStart.y + jawLengthY };
  const lowerJawStart = { x: gripperBase.x - jawOffsetX, y: gripperBase.y - jawOffsetY };
  const lowerJawEnd = { x: lowerJawStart.x + jawLengthX, y: lowerJawStart.y + jawLengthY };

  const points = [base, shoulder, elbow, wrist, roll, gripperBase].map((point) => mirrorPoint(point, mirrored));
  const jaws = [
    [mirrorPoint(upperJawStart, mirrored), mirrorPoint(upperJawEnd, mirrored)],
    [mirrorPoint(lowerJawStart, mirrored), mirrorPoint(lowerJawEnd, mirrored)],
  ];

  return {
    points,
    jaws,
    shoulderPan,
    wristRoll,
    gripper,
  };
}

export function ArmTelemetryVisualizer({ arms }: { arms: ArmAdapterState[] }) {
  return (
    <Card className="overflow-hidden border-white/10 bg-white/[0.04]">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Live Arm View</Badge>
          <Badge variant="muted">2D Planar Visualizer</Badge>
        </div>
        <CardTitle className="text-white">Dual-Arm Kinematic View</CardTitle>
        <CardDescription className="max-w-3xl text-slate-300">
          A live 2D view of both SO-101 arms using the current telemetry stream. The main chain stays planar for
          clarity while shoulder pan, wrist roll, and gripper remain visible as joint overlays.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        {arms.map((arm) => (
          <ArmTelemetryPanel key={arm.arm_id} arm={arm} />
        ))}
      </CardContent>
    </Card>
  );
}

function ArmTelemetryPanel({ arm }: { arm: ArmAdapterState }) {
  const pose = buildArmPose(arm);
  const hasTelemetry = arm.telemetry_live && arm.telemetry.length > 0;
  const [base, shoulder, elbow, wrist, roll, gripperBase] = pose.points;
  const shoulderArcRadius = 24 + clamp(Math.abs(pose.shoulderPan) * 0.08, 2, 14);
  const rollRadius = 12 + clamp(Math.abs(pose.wristRoll) * 0.04, 2, 10);
  const gripperArcRadius = 10 + clamp(Math.abs(pose.gripper) * 0.08, 2, 12);

  return (
    <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{titleize(arm.arm_type)}</Badge>
            <Badge variant="muted">{arm.arm_id}</Badge>
            <Badge variant={hasTelemetry ? "accent" : "muted"}>{hasTelemetry ? "Live" : "Offline"}</Badge>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            {hasTelemetry
              ? `Updated ${arm.telemetry_updated_at ? new Date(arm.telemetry_updated_at).toLocaleTimeString() : "now"}`
              : arm.telemetry_error ?? "Open the live connection to animate this arm."}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-[22px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(73,145,255,0.16),transparent_40%),linear-gradient(180deg,rgba(6,14,24,0.92),rgba(3,8,18,0.98))]">
        <svg viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`} className="aspect-[14/15] w-full">
          <defs>
            <linearGradient id={`arm-link-${arm.arm_id}`} x1="0%" x2="100%">
              <stop offset="0%" stopColor="rgba(191,225,255,0.95)" />
              <stop offset="100%" stopColor="rgba(73,145,255,0.95)" />
            </linearGradient>
          </defs>

          <rect width={VIEWBOX.width} height={VIEWBOX.height} fill="transparent" />
          <path
            d={path([base, shoulder, elbow, wrist, roll, gripperBase])}
            fill="none"
            stroke={hasTelemetry ? `url(#arm-link-${arm.arm_id})` : "rgba(148,163,184,0.5)"}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="8"
          />

          <line
            x1={pose.jaws[0][0].x}
            y1={pose.jaws[0][0].y}
            x2={pose.jaws[0][1].x}
            y2={pose.jaws[0][1].y}
            stroke={hasTelemetry ? "rgba(191,225,255,0.95)" : "rgba(148,163,184,0.55)"}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <line
            x1={pose.jaws[1][0].x}
            y1={pose.jaws[1][0].y}
            x2={pose.jaws[1][1].x}
            y2={pose.jaws[1][1].y}
            stroke={hasTelemetry ? "rgba(191,225,255,0.95)" : "rgba(148,163,184,0.55)"}
            strokeWidth="4"
            strokeLinecap="round"
          />

          <circle
            cx={base.x}
            cy={base.y}
            r={shoulderArcRadius}
            fill="none"
            stroke="rgba(73,145,255,0.25)"
            strokeDasharray="3 5"
            strokeWidth="2"
          />
          <circle
            cx={roll.x}
            cy={roll.y}
            r={rollRadius}
            fill="none"
            stroke="rgba(191,225,255,0.22)"
            strokeDasharray="4 4"
            strokeWidth="2"
          />
          <circle
            cx={gripperBase.x}
            cy={gripperBase.y}
            r={gripperArcRadius}
            fill="none"
            stroke="rgba(73,145,255,0.18)"
            strokeDasharray="2 5"
            strokeWidth="2"
          />

          {[base, shoulder, elbow, wrist, roll, gripperBase].map((point, index) => (
            <g key={`${arm.arm_id}-joint-${index}`}>
              <circle
                cx={point.x}
                cy={point.y}
                r={index === 0 ? 10 : 8}
                fill={hasTelemetry ? "rgba(7,17,31,0.98)" : "rgba(15,23,42,0.88)"}
                stroke={hasTelemetry ? "rgba(191,225,255,0.95)" : "rgba(148,163,184,0.65)"}
                strokeWidth="3"
              />
              <circle
                cx={point.x}
                cy={point.y}
                r={index === 0 ? 3.5 : 2.5}
                fill={hasTelemetry ? "rgba(73,145,255,0.95)" : "rgba(148,163,184,0.7)"}
              />
            </g>
          ))}
        </svg>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <JointReadout label="Shoulder Pan" value={findAngle(arm.telemetry, "shoulder_pan")} />
        <JointReadout label="Wrist Roll" value={findAngle(arm.telemetry, "wrist_roll")} />
        <JointReadout label="Gripper" value={findAngle(arm.telemetry, "gripper")} />
      </div>
    </div>
  );
}

function JointReadout({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-3">
      <p className="hud-label">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value === null ? "--" : `${value.toFixed(1)}°`}</p>
    </div>
  );
}

function findAngle(servos: ServoState[], name: string) {
  return servos.find((servo) => servo.name === name)?.angle ?? null;
}
