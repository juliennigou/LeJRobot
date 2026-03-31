from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class DanceMode(str, Enum):
    IDLE = "idle"
    MANUAL = "manual"
    AUTONOMOUS = "autonomous"
    PULSE = "pulse"


class SceneName(str, Enum):
    IDLE = "idle"
    BLOOM = "bloom"
    PUNCH = "punch"
    SWEEP = "sweep"


class TrackSource(str, Enum):
    JAMENDO = "jamendo"
    LOCAL = "local"
    YOUTUBE = "youtube"


class AnalysisStatus(str, Enum):
    NONE = "none"
    QUEUED = "queued"
    PROCESSING = "processing"
    READY = "ready"
    ERROR = "error"


class SectionLabel(str, Enum):
    INTRO = "intro"
    VERSE = "verse"
    CHORUS = "chorus"
    BRIDGE = "bridge"
    BREAK = "break"
    OUTRO = "outro"
    UNKNOWN = "unknown"


class MotionCueKind(str, Enum):
    BEAT = "beat"
    DOWNBEAT = "downbeat"
    ACCENT = "accent"
    SECTION_CHANGE = "section_change"
    HOLD = "hold"


class PoseFamily(str, Enum):
    GROOVE = "groove"
    SWEEP = "sweep"
    PUNCH = "punch"
    FLOAT = "float"


class SymmetryRole(str, Enum):
    LEAD = "lead"
    FOLLOW = "follow"
    MIRROR = "mirror"
    UNISON = "unison"
    CONTRAST = "contrast"


class ArmType(str, Enum):
    FOLLOWER = "follower"
    LEADER = "leader"


class ArmChannel(str, Enum):
    LEFT = "left"
    RIGHT = "right"


class ExecutionMode(str, Enum):
    MIRROR = "mirror"
    UNISON = "unison"
    CALL_RESPONSE = "call_response"
    ASYMMETRIC = "asymmetric"


class RobotConfig(BaseModel):
    assembly: str = "Follower"
    follower_id: str = "follower_arm"
    follower_port: str = "/dev/tty.usbmodem"
    leader_id: str | None = None
    leader_port: str | None = None
    safety_step_ticks: int = 120


class MotionProfile(BaseModel):
    bpm: int = Field(ge=40, le=220)
    energy: float = Field(ge=0.0, le=1.0)
    pattern_bias: str = "groove"


class TrackSummary(BaseModel):
    track_id: str
    source: TrackSource
    title: str
    artist: str
    duration_seconds: float | None = None
    artwork_url: str | None = None
    audio_url: str | None = None
    external_url: str | None = None
    analysis_status: AnalysisStatus = AnalysisStatus.NONE
    motion_profile: MotionProfile


class TransportState(BaseModel):
    playing: bool = False
    track_name: str = "No track selected"
    bpm: int = 120
    energy: float = Field(default=0.5, ge=0.0, le=1.0)
    position_seconds: float = 0.0
    current_track: TrackSummary | None = None


class ServoState(BaseModel):
    id: int
    name: str
    angle: float
    target_angle: float
    torque_enabled: bool = True
    temperature_c: float
    load_pct: float = Field(ge=0.0, le=100.0)
    motion_phase: str = "steady"


class ArmJointConfig(BaseModel):
    joint_name: str
    servo_id: int
    inverted: bool = False
    offset_degrees: float = Field(default=0.0, ge=-180.0, le=180.0)
    min_angle: float = Field(default=-120.0, ge=-180.0, le=180.0)
    max_angle: float = Field(default=120.0, ge=-180.0, le=180.0)
    max_speed: float = Field(default=1.0, ge=0.1, le=2.0)


class ArmPreviewState(BaseModel):
    channel: ArmChannel
    current_pose_family: PoseFamily | None = None
    current_cue_kind: MotionCueKind | None = None
    symmetry_role: SymmetryRole | None = None
    next_cue_time: float | None = Field(default=None, ge=0.0)
    note: str | None = None


class ArmSafetyEnvelope(BaseModel):
    dry_run: bool = True
    emergency_stop: bool = False
    neutral_on_stop: bool = True
    torque_enabled: bool = True
    amplitude_scale: float = Field(default=1.0, ge=0.1, le=2.0)
    speed_scale: float = Field(default=1.0, ge=0.1, le=2.0)
    max_step_degrees: float = Field(default=12.0, ge=1.0, le=45.0)


class ArmAdapterState(BaseModel):
    arm_id: str
    arm_type: ArmType
    channel: ArmChannel
    port: str | None = None
    available: bool
    connected: bool
    calibrated: bool
    safety: ArmSafetyEnvelope
    joints: list[ArmJointConfig]
    preview: ArmPreviewState
    notes: str | None = None


class DualArmExecutionState(BaseModel):
    mode: ExecutionMode
    choreography_ready: bool = False
    dry_run_required: bool = True
    emergency_stop_active: bool = False
    neutral_pose_scene: SceneName = SceneName.IDLE
    supported_modes: list[ExecutionMode] = Field(
        default_factory=lambda: [
            ExecutionMode.MIRROR,
            ExecutionMode.UNISON,
            ExecutionMode.CALL_RESPONSE,
            ExecutionMode.ASYMMETRIC,
        ]
    )


class DualArmState(BaseModel):
    arms: list[ArmAdapterState]
    execution: DualArmExecutionState


class RobotState(BaseModel):
    connected: bool
    status: str
    mode: DanceMode
    follower_id: str
    follower_port: str
    leader_id: str | None = None
    leader_port: str | None = None
    safety_step_ticks: int
    latency_ms: int
    sync_quality: int = Field(ge=0, le=100)
    last_sync: str
    transport: TransportState
    spectrum: list[int]
    servos: list[ServoState]
    dual_arm: DualArmState


class ModeUpdate(BaseModel):
    mode: DanceMode


class TransportUpdate(BaseModel):
    track_name: str
    bpm: int = Field(ge=40, le=220)
    energy: float = Field(ge=0.0, le=1.0)
    playing: bool = True


class SceneUpdate(BaseModel):
    scene: SceneName


class PulseUpdate(BaseModel):
    bpm: int = Field(ge=40, le=220)
    energy: float = Field(ge=0.0, le=1.0)


class ServoUpdate(BaseModel):
    target_angle: float | None = Field(default=None, ge=-140.0, le=140.0)
    torque_enabled: bool | None = None


class ArmConnectionUpdate(BaseModel):
    connected: bool = True


class ArmJointOverride(BaseModel):
    joint_name: str
    inverted: bool | None = None
    offset_degrees: float | None = Field(default=None, ge=-180.0, le=180.0)
    min_angle: float | None = Field(default=None, ge=-180.0, le=180.0)
    max_angle: float | None = Field(default=None, ge=-180.0, le=180.0)
    max_speed: float | None = Field(default=None, ge=0.1, le=2.0)


class ArmSafetyUpdate(BaseModel):
    dry_run: bool | None = None
    emergency_stop: bool | None = None
    neutral_on_stop: bool | None = None
    torque_enabled: bool | None = None
    amplitude_scale: float | None = Field(default=None, ge=0.1, le=2.0)
    speed_scale: float | None = Field(default=None, ge=0.1, le=2.0)
    max_step_degrees: float | None = Field(default=None, ge=1.0, le=45.0)
    joint_overrides: list[ArmJointOverride] = Field(default_factory=list)


class ExecutionModeUpdate(BaseModel):
    mode: ExecutionMode


class TrackSearchResponse(BaseModel):
    query: str
    source: TrackSource
    results: list[TrackSummary]


class TrackSelection(BaseModel):
    track: TrackSummary
    autoplay: bool = True


class TrackReference(BaseModel):
    track_id: str
    source: TrackSource


class SongSection(BaseModel):
    label: SectionLabel = SectionLabel.UNKNOWN
    start_seconds: float = Field(ge=0.0)
    end_seconds: float = Field(ge=0.0)
    energy_mean: float = Field(ge=0.0, le=1.0)
    density_mean: float = Field(ge=0.0, le=1.0)


class EnergyEnvelope(BaseModel):
    frame_hz: float = Field(gt=0.0)
    rms: list[float] = Field(default_factory=list)
    onset_strength: list[float] = Field(default_factory=list)


class BandEnvelope(BaseModel):
    frame_hz: float = Field(gt=0.0)
    low: list[float] = Field(default_factory=list)
    mid: list[float] = Field(default_factory=list)
    high: list[float] = Field(default_factory=list)


class SpectralSummary(BaseModel):
    centroid: list[float] = Field(default_factory=list)
    bandwidth: list[float] = Field(default_factory=list)
    rolloff: list[float] = Field(default_factory=list)


class WaveformSummary(BaseModel):
    peaks: list[float] = Field(default_factory=list)
    bucket_count: int = Field(ge=0)


class MotionCue(BaseModel):
    time: float = Field(ge=0.0)
    kind: MotionCueKind
    intensity: float = Field(ge=0.0, le=1.0)
    pose_family: PoseFamily = PoseFamily.GROOVE
    amplitude: float = Field(default=0.5, ge=0.0, le=1.0)
    speed: float = Field(default=0.5, ge=0.0, le=1.0)
    symmetry_role: SymmetryRole = SymmetryRole.UNISON
    notes: str | None = None


class ChoreographyTimeline(BaseModel):
    track_id: str
    source: TrackSource
    frame_hz: float = Field(gt=0.0)
    global_cues: list[MotionCue] = Field(default_factory=list)
    arm_left_cues: list[MotionCue] = Field(default_factory=list)
    arm_right_cues: list[MotionCue] = Field(default_factory=list)


class AudioAnalysis(BaseModel):
    track_id: str
    source: TrackSource
    duration_seconds: float = Field(ge=0.0)
    sample_rate: int = Field(gt=0)
    bpm: float = Field(ge=0.0)
    tempo_confidence: float = Field(ge=0.0, le=1.0)
    beats: list[float] = Field(default_factory=list)
    downbeats: list[float] = Field(default_factory=list)
    sections: list[SongSection] = Field(default_factory=list)
    energy: EnergyEnvelope
    bands: BandEnvelope
    spectral: SpectralSummary
    waveform: WaveformSummary
    choreography: ChoreographyTimeline
    generated_at: str


class AnalysisStartRequest(BaseModel):
    track_id: str
    source: TrackSource


class AnalysisStartResponse(BaseModel):
    track_id: str
    source: TrackSource
    status: AnalysisStatus
    progress: int = Field(ge=0, le=100)


class AnalysisStatusResponse(BaseModel):
    track_id: str
    source: TrackSource
    status: AnalysisStatus
    progress: int = Field(ge=0, le=100)
    error: str | None = None
