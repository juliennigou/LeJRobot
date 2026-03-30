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


class RobotConfig(BaseModel):
    assembly: str = "Follower"
    follower_id: str = "follower_arm"
    follower_port: str = "/dev/tty.usbmodem"
    leader_id: str | None = None
    leader_port: str | None = None
    safety_step_ticks: int = 120


class TransportState(BaseModel):
    playing: bool = False
    track_name: str = "No track selected"
    bpm: int = 120
    energy: float = Field(default=0.5, ge=0.0, le=1.0)
    position_seconds: float = 0.0


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
