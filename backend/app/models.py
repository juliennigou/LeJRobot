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


class ArmVerificationStatus(str, Enum):
    IDLE = "idle"
    READY = "ready"
    MISSING_DEPENDENCY = "missing_dependency"
    MISSING_PORT = "missing_port"
    UNREACHABLE = "unreachable"
    MISSING_CALIBRATION = "missing_calibration"
    ERROR = "error"


class MovementStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    COMPLETED = "completed"
    STOPPED = "stopped"
    ERROR = "error"


class MovementTargetScope(str, Enum):
    SINGLE = "single"
    BOTH = "both"


class AutonomyStatus(str, Enum):
    IDLE = "idle"
    ARMED = "armed"
    RUNNING = "running"
    ERROR = "error"


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


class ArmVerificationState(BaseModel):
    status: ArmVerificationStatus = ArmVerificationStatus.IDLE
    driver: str = "dry_run"
    dependency_available: bool = False
    port_present: bool = False
    calibration_found: bool = False
    calibration_path: str | None = None
    expected_joint_count: int = Field(default=6, ge=0)
    detected_joint_count: int = Field(default=0, ge=0)
    last_checked_at: str | None = None
    message: str | None = None


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
    verification: ArmVerificationState
    telemetry_live: bool = False
    telemetry_updated_at: str | None = None
    telemetry_error: str | None = None
    telemetry: list[ServoState] = Field(default_factory=list)
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


class MovementDefinition(BaseModel):
    movement_id: str
    name: str
    summary: str
    description: str
    duration_seconds: float = Field(gt=0.0)
    focus_joints: list[str] = Field(default_factory=list)
    recommended_arm: ArmType | None = None
    controller: str = "oscillator"
    default_preset_id: str | None = None
    neutral_pose: dict[str, float] = Field(default_factory=dict)
    presets: list["MovementPreset"] = Field(default_factory=list)


class MovementJointProfile(BaseModel):
    joint_name: str
    base_angle: float = Field(ge=-180.0, le=180.0)
    amplitude: float = Field(ge=0.0, le=90.0)
    phase_delay_radians: float = Field(ge=0.0, le=6.5)
    bias: float = Field(default=0.0, ge=-90.0, le=90.0)


class MovementFollowThroughProfile(BaseModel):
    joint_name: str
    source_joint: str
    gain_ratio: float = Field(default=1.0, ge=0.0, le=2.0)
    delay_ratio: float = Field(default=1.0, ge=0.0, le=2.0)
    damping_ratio: float = Field(default=1.0, ge=0.0, le=2.0)
    settle_ratio: float = Field(default=1.0, ge=0.0, le=2.0)


class MovementFollowThroughConfig(BaseModel):
    enabled: bool = True
    delay_seconds: float = Field(default=0.12, ge=0.0, le=0.6)
    gain: float = Field(default=0.2, ge=0.0, le=1.2)
    damping: float = Field(default=0.4, ge=0.0, le=1.0)
    settle: float = Field(default=0.14, ge=0.0, le=0.8)
    profiles: list[MovementFollowThroughProfile] = Field(default_factory=list)


class MovementPreset(BaseModel):
    preset_id: str
    label: str
    summary: str
    frequency_hz: float = Field(gt=0.1, le=4.0)
    cycles: int = Field(ge=1, le=32)
    amplitude_scale: float = Field(default=1.0, ge=0.2, le=2.5)
    softness: float = Field(default=0.7, ge=0.0, le=1.0)
    asymmetry: float = Field(default=0.0, ge=0.0, le=1.0)
    joint_profiles: list[MovementJointProfile] = Field(default_factory=list)
    follow_through: MovementFollowThroughConfig = Field(default_factory=MovementFollowThroughConfig)


class MovementRunState(BaseModel):
    status: MovementStatus = MovementStatus.IDLE
    movement_id: str | None = None
    preset_id: str | None = None
    target_scope: MovementTargetScope = MovementTargetScope.SINGLE
    execution_mode: ExecutionMode = ExecutionMode.UNISON
    arm_id: str | None = None
    arm_ids: list[str] = Field(default_factory=list)
    arm_type: ArmType | None = None
    started_at: str | None = None
    updated_at: str | None = None
    note: str | None = None
    progress: float = Field(default=0.0, ge=0.0, le=1.0)


class MovementLibraryState(BaseModel):
    movements: list[MovementDefinition] = Field(default_factory=list)
    active: MovementRunState = Field(default_factory=MovementRunState)


class ScheduledMovementPhrase(BaseModel):
    phrase_id: str
    movement_id: str
    preset_id: str
    start_seconds: float = Field(ge=0.0)
    end_seconds: float = Field(ge=0.0)
    section_label: SectionLabel = SectionLabel.UNKNOWN
    execution_mode: ExecutionMode = ExecutionMode.MIRROR
    target_scope: MovementTargetScope = MovementTargetScope.BOTH
    intensity: float = Field(default=0.5, ge=0.0, le=1.0)
    density: float = Field(default=0.5, ge=0.0, le=1.0)
    notes: str | None = None


class ScheduleStylePreset(BaseModel):
    style_id: str
    label: str
    summary: str
    density_scale: float = Field(default=1.0, ge=0.5, le=2.0)
    intensity_scale: float = Field(default=1.0, ge=0.5, le=1.5)


class SchedulePhraseOverride(BaseModel):
    phrase_id: str
    movement_id: str | None = None
    preset_id: str | None = None
    execution_mode: ExecutionMode | None = None
    target_scope: MovementTargetScope | None = None


class ScheduleConfig(BaseModel):
    style_id: str = "baseline"
    density_scale: float = Field(default=1.0, ge=0.5, le=2.0)
    intensity_scale: float = Field(default=1.0, ge=0.5, le=1.5)
    phrase_overrides: list[SchedulePhraseOverride] = Field(default_factory=list)


class ChoreographySchedule(BaseModel):
    track_id: str
    source: TrackSource
    style_id: str = "baseline"
    config: ScheduleConfig = Field(default_factory=ScheduleConfig)
    available_styles: list[ScheduleStylePreset] = Field(default_factory=list)
    generated_at: str
    phrase_count: int = Field(ge=0)
    phrases: list[ScheduledMovementPhrase] = Field(default_factory=list)


class AutonomousPerformanceState(BaseModel):
    status: AutonomyStatus = AutonomyStatus.IDLE
    active_phrase_id: str | None = None
    current_phrase: ScheduledMovementPhrase | None = None
    next_phrase_id: str | None = None
    note: str | None = None
    last_transition_at: str | None = None


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
    movement_library: MovementLibraryState
    schedule: ChoreographySchedule | None = None
    autonomy: AutonomousPerformanceState = Field(default_factory=AutonomousPerformanceState)


class ModeUpdate(BaseModel):
    mode: DanceMode


class TransportUpdate(BaseModel):
    track_name: str
    bpm: float = Field(ge=40, le=220)
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


class MovementRunRequest(BaseModel):
    movement_id: str
    target_scope: MovementTargetScope = MovementTargetScope.SINGLE
    execution_mode: ExecutionMode = ExecutionMode.UNISON
    arm_id: str | None = None
    preset_id: str | None = None
    frequency_hz: float | None = Field(default=None, gt=0.1, le=4.0)
    cycles: int | None = Field(default=None, ge=1, le=32)
    amplitude_scale: float | None = Field(default=None, ge=0.2, le=2.5)
    softness: float | None = Field(default=None, ge=0.0, le=1.0)
    asymmetry: float | None = Field(default=None, ge=0.0, le=1.0)
    follow_through_enabled: bool | None = None
    follow_through_delay_seconds: float | None = Field(default=None, ge=0.0, le=0.6)
    follow_through_gain: float | None = Field(default=None, ge=0.0, le=1.2)
    follow_through_damping: float | None = Field(default=None, ge=0.0, le=1.0)
    follow_through_settle: float | None = Field(default=None, ge=0.0, le=0.8)
    debug: bool = False


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


class ScheduleConfigUpdate(BaseModel):
    style_id: str | None = None
    density_scale: float | None = Field(default=None, ge=0.5, le=2.0)
    intensity_scale: float | None = Field(default=None, ge=0.5, le=1.5)


class SchedulePhraseUpdate(BaseModel):
    movement_id: str | None = None
    preset_id: str | None = None
    execution_mode: ExecutionMode | None = None
    target_scope: MovementTargetScope | None = None
    clear_override: bool = False


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
