export type DanceMode = "idle" | "manual" | "autonomous" | "pulse";
export type SceneName = "idle" | "bloom" | "punch" | "sweep";
export type TrackSource = "jamendo" | "local" | "youtube";
export type AnalysisStatus = "none" | "queued" | "processing" | "ready" | "error";
export type SectionLabel = "intro" | "verse" | "chorus" | "bridge" | "break" | "outro" | "unknown";
export type MotionCueKind = "beat" | "downbeat" | "accent" | "section_change" | "hold";
export type PoseFamily = "groove" | "sweep" | "punch" | "float";
export type SymmetryRole = "lead" | "follow" | "mirror" | "unison" | "contrast";

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
