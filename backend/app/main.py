from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    ModeUpdate,
    PulseUpdate,
    RobotConfig,
    RobotState,
    SceneUpdate,
    ServoUpdate,
    TransportUpdate,
)
from .state import RobotStateStore

app = FastAPI(title="LeRobot Motion Console API", version="0.1.0")
store = RobotStateStore()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/config", response_model=RobotConfig)
def get_config() -> RobotConfig:
    return store.config


@app.get("/api/state", response_model=RobotState)
def get_state() -> RobotState:
    return store.snapshot()


@app.post("/api/mode", response_model=RobotState)
def update_mode(payload: ModeUpdate) -> RobotState:
    return store.set_mode(payload.mode)


@app.post("/api/transport", response_model=RobotState)
def update_transport(payload: TransportUpdate) -> RobotState:
    return store.set_transport(payload)


@app.post("/api/scene", response_model=RobotState)
def update_scene(payload: SceneUpdate) -> RobotState:
    return store.apply_scene(payload.scene)


@app.post("/api/dance/pulse", response_model=RobotState)
def trigger_pulse(payload: PulseUpdate) -> RobotState:
    return store.pulse(payload)


@app.post("/api/servo/{servo_id}", response_model=RobotState)
def update_servo(servo_id: int, payload: ServoUpdate) -> RobotState:
    try:
        return store.update_servo(servo_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
