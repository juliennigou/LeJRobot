export type DanceMode = "idle" | "manual" | "autonomous" | "pulse";
export type SceneName = "idle" | "bloom" | "punch" | "sweep";

export interface RobotConfig {
  assembly: string;
  follower_id: string;
  follower_port: string;
  leader_id?: string;
  leader_port?: string;
  safety_step_ticks: number;
}

export interface TransportState {
  playing: boolean;
  track_name: string;
  bpm: number;
  energy: number;
  position_seconds: number;
}

export interface ServoState {
  id: number;
  name: string;
  angle: number;
  target_angle: number;
  torque_enabled: boolean;
  temperature_c: number;
  load_pct: number;
  motion_phase: "steady" | "ramping" | "accent";
}

export interface RobotState {
  connected: boolean;
  status: string;
  mode: DanceMode;
  follower_id: string;
  follower_port: string;
  safety_step_ticks: number;
  latency_ms: number;
  sync_quality: number;
  last_sync: string;
  transport: TransportState;
  spectrum: number[];
  servos: ServoState[];
}
