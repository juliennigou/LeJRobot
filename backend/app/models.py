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


class RobotState(BaseModel):
    connected: bool
    status: str
    mode: DanceMode
    follower_id: str
    follower_port: str
    safety_step_ticks: int
    latency_ms: int
    sync_quality: int = Field(ge=0, le=100)
    last_sync: str
    transport: TransportState
    spectrum: list[int]
    servos: list[ServoState]


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
