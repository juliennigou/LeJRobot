export type DanceMode = "idle" | "manual" | "autonomous" | "pulse";
export type SceneName = "idle" | "bloom" | "punch" | "sweep";
export type TrackSource = "jamendo" | "local" | "youtube";
export type AnalysisStatus = "none" | "queued" | "processing" | "ready" | "error";
export type SectionLabel = "intro" | "verse" | "chorus" | "bridge" | "break" | "outro" | "unknown";
export type MotionCueKind = "beat" | "downbeat" | "accent" | "section_change" | "hold";
export type PoseFamily = "groove" | "sweep" | "punch" | "float";
export type SymmetryRole = "lead" | "follow" | "mirror" | "unison" | "contrast";
export type ArmType = "follower" | "leader";
export type ArmChannel = "left" | "right";
export type ExecutionMode = "mirror" | "unison" | "call_response" | "asymmetric";
export type MovementStatus = "idle" | "running" | "completed" | "stopped" | "error";
export type ArmVerificationStatus =
  | "idle"
  | "ready"
  | "missing_dependency"
  | "missing_port"
  | "unreachable"
  | "missing_calibration"
  | "error";

export interface RobotConfig {
  assembly: string;
  follower_id: string;
  follower_port: string;
  leader_id?: string;
  leader_port?: string;
  safety_step_ticks: number;
}

export interface MotionProfile {
  bpm: number;
  energy: number;
  pattern_bias: string;
}

export interface TrackSummary {
  track_id: string;
  source: TrackSource;
  title: string;
  artist: string;
  duration_seconds?: number | null;
  artwork_url?: string | null;
  audio_url?: string | null;
  external_url?: string | null;
  analysis_status: AnalysisStatus;
  motion_profile: MotionProfile;
}

export interface TrackSearchResponse {
  query: string;
  source: TrackSource;
  results: TrackSummary[];
}

export interface TrackReference {
  track_id: string;
  source: TrackSource;
}

export interface SongSection {
  label: SectionLabel;
  start_seconds: number;
  end_seconds: number;
  energy_mean: number;
  density_mean: number;
}

export interface EnergyEnvelope {
  frame_hz: number;
  rms: number[];
  onset_strength: number[];
}

export interface BandEnvelope {
  frame_hz: number;
  low: number[];
  mid: number[];
  high: number[];
}

export interface SpectralSummary {
  centroid: number[];
  bandwidth: number[];
  rolloff: number[];
}

export interface WaveformSummary {
  peaks: number[];
  bucket_count: number;
}

export interface MotionCue {
  time: number;
  kind: MotionCueKind;
  intensity: number;
  pose_family: PoseFamily;
  amplitude: number;
  speed: number;
  symmetry_role: SymmetryRole;
  notes?: string | null;
}

export interface ChoreographyTimeline {
  track_id: string;
  source: TrackSource;
  frame_hz: number;
  global_cues: MotionCue[];
  arm_left_cues: MotionCue[];
  arm_right_cues: MotionCue[];
}

export interface AudioAnalysis {
  track_id: string;
  source: TrackSource;
  duration_seconds: number;
  sample_rate: number;
  bpm: number;
  tempo_confidence: number;
  beats: number[];
  downbeats: number[];
  sections: SongSection[];
  energy: EnergyEnvelope;
  bands: BandEnvelope;
  spectral: SpectralSummary;
  waveform: WaveformSummary;
  choreography: ChoreographyTimeline;
  generated_at: string;
}

export interface AnalysisStartResponse {
  track_id: string;
  source: TrackSource;
  status: AnalysisStatus;
  progress: number;
}

export interface AnalysisStatusResponse {
  track_id: string;
  source: TrackSource;
  status: AnalysisStatus;
  progress: number;
  error?: string | null;
}

export interface TransportState {
  playing: boolean;
  track_name: string;
  bpm: number;
  energy: number;
  position_seconds: number;
  current_track?: TrackSummary | null;
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

export interface ArmJointConfig {
  joint_name: string;
  servo_id: number;
  inverted: boolean;
  offset_degrees: number;
  min_angle: number;
  max_angle: number;
  max_speed: number;
}

export interface ArmPreviewState {
  channel: ArmChannel;
  current_pose_family?: PoseFamily | null;
  current_cue_kind?: MotionCueKind | null;
  symmetry_role?: SymmetryRole | null;
  next_cue_time?: number | null;
  note?: string | null;
}

export interface ArmSafetyEnvelope {
  dry_run: boolean;
  emergency_stop: boolean;
  neutral_on_stop: boolean;
  torque_enabled: boolean;
  amplitude_scale: number;
  speed_scale: number;
  max_step_degrees: number;
}

export interface ArmVerificationState {
  status: ArmVerificationStatus;
  driver: string;
  dependency_available: boolean;
  port_present: boolean;
  calibration_found: boolean;
  calibration_path?: string | null;
  expected_joint_count: number;
  detected_joint_count: number;
  last_checked_at?: string | null;
  message?: string | null;
}

export interface ArmAdapterState {
  arm_id: string;
  arm_type: ArmType;
  channel: ArmChannel;
  port?: string | null;
  available: boolean;
  connected: boolean;
  calibrated: boolean;
  safety: ArmSafetyEnvelope;
  joints: ArmJointConfig[];
  verification: ArmVerificationState;
  telemetry_live: boolean;
  telemetry_updated_at?: string | null;
  telemetry_error?: string | null;
  telemetry: ServoState[];
  preview: ArmPreviewState;
  notes?: string | null;
}

export interface DualArmExecutionState {
  mode: ExecutionMode;
  choreography_ready: boolean;
  dry_run_required: boolean;
  emergency_stop_active: boolean;
  neutral_pose_scene: SceneName;
  supported_modes: ExecutionMode[];
}

export interface DualArmState {
  arms: ArmAdapterState[];
  execution: DualArmExecutionState;
}

export interface MovementDefinition {
  movement_id: string;
  name: string;
  summary: string;
  description: string;
  duration_seconds: number;
  focus_joints: string[];
  recommended_arm?: ArmType | null;
  controller: string;
  default_preset_id?: string | null;
  neutral_pose: Record<string, number>;
  presets: MovementPreset[];
}

export interface MovementJointProfile {
  joint_name: string;
  base_angle: number;
  amplitude: number;
  phase_delay_radians: number;
  bias: number;
}

export interface MovementPreset {
  preset_id: string;
  label: string;
  summary: string;
  frequency_hz: number;
  cycles: number;
  amplitude_scale: number;
  softness: number;
  asymmetry: number;
  joint_profiles: MovementJointProfile[];
}

export interface MovementRunState {
  status: MovementStatus;
  movement_id?: string | null;
  preset_id?: string | null;
  arm_id?: string | null;
  arm_type?: ArmType | null;
  started_at?: string | null;
  updated_at?: string | null;
  note?: string | null;
  progress: number;
}

export interface MovementLibraryState {
  movements: MovementDefinition[];
  active: MovementRunState;
}

export interface RobotState {
  connected: boolean;
  status: string;
  mode: DanceMode;
  follower_id: string;
  follower_port: string;
  leader_id?: string | null;
  leader_port?: string | null;
  safety_step_ticks: number;
  latency_ms: number;
  sync_quality: number;
  last_sync: string;
  transport: TransportState;
  spectrum: number[];
  servos: ServoState[];
  dual_arm: DualArmState;
  movement_library: MovementLibraryState;
}
