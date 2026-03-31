from __future__ import annotations

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .analysis import AnalysisError, AudioAnalysisService
from .music import JamendoTrackProvider, LocalTrackLibrary, TrackProviderError, UPLOADS_DIR
from .models import (
    AnalysisStartRequest,
    AnalysisStartResponse,
    AnalysisStatus,
    AnalysisStatusResponse,
    ArmConnectionUpdate,
    ArmSafetyUpdate,
    AudioAnalysis,
    ChoreographyTimeline,
    DualArmState,
    ExecutionModeUpdate,
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
local_library = LocalTrackLibrary()
analysis_service = AudioAnalysisService(jamendo_provider=jamendo_provider, local_library=local_library)

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
app.mount("/media/uploads", StaticFiles(directory=UPLOADS_DIR), name="local-uploads")


@app.get("/api/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/config", response_model=RobotConfig)
def get_config() -> RobotConfig:
    return store.config


@app.get("/api/state", response_model=RobotState)
def get_state() -> RobotState:
    current_track = store.current_track()
    if current_track is not None:
        reference = TrackReference(track_id=current_track.track_id, source=current_track.source)
        cached = analysis_service.get_cached_analysis(reference)
        if cached is not None:
            store.store_analysis(cached)
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


@app.get("/api/arms", response_model=DualArmState)
def get_arms() -> DualArmState:
    return store.arms_snapshot()


@app.post("/api/arms/execution-mode", response_model=DualArmState)
def update_execution_mode(payload: ExecutionModeUpdate) -> DualArmState:
    return store.set_execution_mode(payload)


@app.post("/api/arms/{arm_id}/connect", response_model=DualArmState)
def update_arm_connection(arm_id: str, payload: ArmConnectionUpdate) -> DualArmState:
    try:
        return store.set_arm_connection(arm_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/arms/{arm_id}/safety", response_model=DualArmState)
def update_arm_safety(arm_id: str, payload: ArmSafetyUpdate) -> DualArmState:
    try:
        return store.update_arm_safety(arm_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/arms/emergency-stop", response_model=DualArmState)
def emergency_stop() -> DualArmState:
    return store.emergency_stop()


@app.post("/api/arms/neutral", response_model=DualArmState)
def move_arms_to_neutral() -> DualArmState:
    return store.move_to_neutral()


@app.get("/api/tracks/search", response_model=TrackSearchResponse)
def search_tracks(
    q: str,
    source: TrackSource = TrackSource.JAMENDO,
    limit: int = 8,
) -> TrackSearchResponse:
    try:
        if source == TrackSource.JAMENDO:
            results = jamendo_provider.search(q, limit=limit)
        elif source == TrackSource.LOCAL:
            results = local_library.search(q, limit=limit)
        else:
            raise HTTPException(status_code=400, detail=f"Track source '{source}' is not implemented yet")
    except TrackProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    store.remember_tracks(results)
    return TrackSearchResponse(query=q, source=source, results=results)


@app.get("/api/tracks/current", response_model=TrackSummary | None)
def get_current_track() -> TrackSummary | None:
    return store.current_track()


@app.post("/api/tracks/upload", response_model=TrackSummary)
async def upload_track(file: UploadFile = File(...)) -> TrackSummary:
    try:
        file.file.seek(0)
        track = local_library.ingest_upload(file.filename, file.content_type, file.file)
        store.remember_track(track)
        return track
    except TrackProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        await file.close()


@app.post("/api/tracks/select", response_model=RobotState)
def select_track(payload: TrackSelection) -> RobotState:
    store.remember_track(payload.track)
    return store.select_track(payload)


@app.post("/api/analysis/start", response_model=AnalysisStartResponse)
def start_analysis(payload: AnalysisStartRequest) -> AnalysisStartResponse:
    reference = TrackReference(track_id=payload.track_id, source=payload.source)
    try:
        known_track = store.known_track(reference)
        if known_track is None:
            preferred_track = store.current_track()
            resolved_track = analysis_service.resolve_track(reference, preferred_track=preferred_track)
            store.remember_track(resolved_track)

        cached = analysis_service.get_cached_analysis(reference)
        if cached is not None:
            status = store.store_analysis(cached)
            return AnalysisStartResponse(
                track_id=payload.track_id,
                source=payload.source,
                status=status.status,
                progress=status.progress,
            )

        store.queue_analysis(reference)
        store.mark_analysis_processing(reference)
        analysis = analysis_service.analyze_reference(reference, preferred_track=store.current_track())
        status = store.store_analysis(analysis)
        return AnalysisStartResponse(
            track_id=payload.track_id,
            source=payload.source,
            status=status.status,
            progress=status.progress,
        )
    except (TrackProviderError, AnalysisError, ValueError) as exc:
        status = store.mark_analysis_error(reference, str(exc))
        raise HTTPException(status_code=400, detail=status.error) from exc


@app.get("/api/analysis/{source}/{track_id}/status", response_model=AnalysisStatusResponse)
def get_analysis_status(source: TrackSource, track_id: str) -> AnalysisStatusResponse:
    try:
        reference = TrackReference(track_id=track_id, source=source)
        cached = analysis_service.get_cached_analysis(reference)
        if cached is not None:
            return store.store_analysis(cached)
        return store.get_analysis_status(TrackReference(track_id=track_id, source=source))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/analysis/{source}/{track_id}", response_model=AudioAnalysis)
def get_analysis(source: TrackSource, track_id: str) -> AudioAnalysis:
    reference = TrackReference(track_id=track_id, source=source)
    try:
        cached = analysis_service.get_cached_analysis(reference)
        if cached is not None:
            store.store_analysis(cached)
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
        cached = analysis_service.get_cached_analysis(reference)
        if cached is not None:
            store.store_analysis(cached)
        choreography = store.get_choreography(reference)
        status = store.get_analysis_status(reference)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if choreography is not None:
        return choreography

    if status.status in {AnalysisStatus.QUEUED, AnalysisStatus.PROCESSING}:
        raise HTTPException(status_code=409, detail=f"Choreography is waiting on analysis: {status.status}")

    raise HTTPException(status_code=404, detail="Choreography is not available yet")
