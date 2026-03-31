from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .music import JamendoTrackProvider, TrackProviderError
from .models import (
    AnalysisStartRequest,
    AnalysisStartResponse,
    AnalysisStatus,
    AnalysisStatusResponse,
    AudioAnalysis,
    ChoreographyTimeline,
    ModeUpdate,
    PulseUpdate,
    RobotConfig,
    RobotState,
    SceneUpdate,
    ServoUpdate,
    TrackReference,
    TrackSearchResponse,
    TrackSelection,
    TrackSummary,
    TrackSource,
    TransportUpdate,
)
from .state import RobotStateStore

app = FastAPI(title="LeRobot Motion Console API", version="0.1.0")
store = RobotStateStore()
jamendo_provider = JamendoTrackProvider()

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


@app.get("/api/tracks/search", response_model=TrackSearchResponse)
def search_tracks(
    q: str,
    source: TrackSource = TrackSource.JAMENDO,
    limit: int = 8,
) -> TrackSearchResponse:
    if source != TrackSource.JAMENDO:
        raise HTTPException(status_code=400, detail=f"Track source '{source}' is not implemented yet")

    try:
        results = jamendo_provider.search(q, limit=limit)
    except TrackProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return TrackSearchResponse(query=q, source=source, results=results)


@app.get("/api/tracks/current", response_model=TrackSummary | None)
def get_current_track() -> TrackSummary | None:
    return store.current_track()


@app.post("/api/tracks/select", response_model=RobotState)
def select_track(payload: TrackSelection) -> RobotState:
    return store.select_track(payload)


@app.post("/api/analysis/start", response_model=AnalysisStartResponse)
def start_analysis(payload: AnalysisStartRequest) -> AnalysisStartResponse:
    return store.queue_analysis(TrackReference(track_id=payload.track_id, source=payload.source))


@app.get("/api/analysis/{source}/{track_id}/status", response_model=AnalysisStatusResponse)
def get_analysis_status(source: TrackSource, track_id: str) -> AnalysisStatusResponse:
    try:
        return store.get_analysis_status(TrackReference(track_id=track_id, source=source))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/analysis/{source}/{track_id}", response_model=AudioAnalysis)
def get_analysis(source: TrackSource, track_id: str) -> AudioAnalysis:
    reference = TrackReference(track_id=track_id, source=source)
    try:
        analysis = store.get_analysis(reference)
        status = store.get_analysis_status(reference)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if analysis is not None:
        return analysis

    if status.status in {AnalysisStatus.QUEUED, AnalysisStatus.PROCESSING}:
        raise HTTPException(status_code=409, detail=f"Analysis is {status.status}")

    raise HTTPException(status_code=404, detail="Analysis is not available yet")


@app.get("/api/choreography/{source}/{track_id}", response_model=ChoreographyTimeline)
def get_choreography(source: TrackSource, track_id: str) -> ChoreographyTimeline:
    reference = TrackReference(track_id=track_id, source=source)
    try:
        choreography = store.get_choreography(reference)
        status = store.get_analysis_status(reference)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if choreography is not None:
        return choreography

    if status.status in {AnalysisStatus.QUEUED, AnalysisStatus.PROCESSING}:
        raise HTTPException(status_code=409, detail=f"Choreography is waiting on analysis: {status.status}")

    raise HTTPException(status_code=404, detail="Choreography is not available yet")
