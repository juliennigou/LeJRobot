# API Contracts

## Scope
This document tracks the canonical Phase 1 API contracts for music analysis and dual-arm-ready choreography.

These contracts started ahead of the implementation. The real backend analysis payloads are now live, while choreography quality and frontend integration still land in follow-up tickets.

## Track Endpoints

### `GET /api/tracks/search`
- Query params:
  - `q: string`
  - `source: "jamendo" | "local" | "youtube"`
  - `limit: int`
- Response: `TrackSearchResponse`

### `GET /api/tracks/current`
- Response: `TrackSummary | null`

### `POST /api/tracks/upload`
- Multipart body:
  - `file: UploadFile`
- Response: `TrackSummary`
- Notes:
  - Local uploads are normalized into the same `TrackSummary` shape used by search results
  - Uploaded tracks are expected to use `source: "local"`

### `POST /api/tracks/select`
- Body:
```json
{
  "track": {
    "track_id": "123",
    "source": "jamendo",
    "title": "Song",
    "artist": "Artist",
    "duration_seconds": 180.0,
    "artwork_url": null,
    "audio_url": null,
    "external_url": null,
    "analysis_status": "none",
    "motion_profile": {
      "bpm": 120,
      "energy": 0.6,
      "pattern_bias": "groove"
    }
  },
  "autoplay": true
}
```
- Response: `RobotState`

## Analysis Endpoints

### `POST /api/analysis/start`
- Body:
```json
{
  "track_id": "123",
  "source": "jamendo"
}
```
- Response: `AnalysisStartResponse`

### `GET /api/analysis/{source}/{track_id}/status`
- Response: `AnalysisStatusResponse`

### `GET /api/analysis/{source}/{track_id}`
- `200`: returns `AudioAnalysis`
- `404`: track is unknown or analysis does not exist yet
- `409`: analysis is queued or processing

## Choreography Endpoint

### `GET /api/choreography/{source}/{track_id}`
- `200`: returns `ChoreographyTimeline`
- `404`: track is unknown or choreography does not exist yet
- `409`: choreography is blocked on analysis

## Dual-Arm Adapter Endpoints

### `GET /api/arms`
- Response: `DualArmState`

### `POST /api/arms/verify`
- Triggers live verification for both configured arms
- Response: `DualArmState`
- Each arm now includes:
  - `verification.status`
  - `verification.driver`
  - `verification.port_present`
  - `verification.calibration_found`
  - `verification.calibration_path`
  - `verification.expected_joint_count`
  - `verification.detected_joint_count`
  - `verification.last_checked_at`
  - `verification.message`

### `POST /api/arms/execution-mode`
- Body:
```json
{
  "mode": "mirror"
}
```
- Response: `DualArmState`

### `POST /api/arms/{arm_id}/connect`
- Body:
```json
{
  "connected": true
}
```
- Response: `DualArmState`
- Connecting an arm now refreshes verification and opens a live read-only telemetry session through LeRobot/Feetech
- `connected=true` now means an active bus session is open, not just that verification passed

### `POST /api/arms/{arm_id}/safety`
- Body:
```json
{
  "dry_run": true,
  "amplitude_scale": 0.82,
  "speed_scale": 0.85,
  "max_step_degrees": 10,
  "joint_overrides": [
    {
      "joint_name": "wrist_roll",
      "inverted": false,
      "offset_degrees": 7.5,
      "max_speed": 0.7
    }
  ]
}
```
- Response: `DualArmState`
- When the arm is connected, torque changes are applied to the live Feetech bus immediately
- Live target writes remain blocked while `dry_run=true`

### `POST /api/arms/emergency-stop`
- Response: `DualArmState`
- Immediately disables live torque on every connected arm and blocks further live writes

### `POST /api/arms/emergency-reset`
- Response: `DualArmState`
- Clears the emergency-stop latch so torque can be re-enabled arm by arm

### `POST /api/arms/neutral`
- Response: `DualArmState`
- When a connected arm is live-enabled, the backend steps it toward the neutral scene through the same joint limits and max-step guard used by the live write path

## Movement Library Endpoints

### `GET /api/movements`
- Response: `MovementLibraryState`
- Returns the available manual movement definitions plus the current active movement runtime state

### `POST /api/movements/run`
- Body:
```json
{
  "movement_id": "wave",
  "arm_id": "thejn_follower_arm"
}
```
- Response: `MovementLibraryState`
- Starts one bounded live movement on the selected arm
- Requires the selected arm to be connected, torque-enabled, not in dry run, and not in emergency stop

### `POST /api/movements/stop`
- Response: `MovementLibraryState`
- Stops the active manual movement if one is running

## Canonical Models

### `TrackSummary`
- `track_id`
- `source`
- `title`
- `artist`
- `duration_seconds`
- `artwork_url`
- `audio_url`
- `external_url`
- `analysis_status`

### `ArmVerificationState`
- `status`
- `driver`
- `dependency_available`
- `port_present`
- `calibration_found`
- `calibration_path`
- `expected_joint_count`
- `detected_joint_count`
- `last_checked_at`
- `message`
- `motion_profile`

### `AudioAnalysis`
- `track_id`
- `source`
- `duration_seconds`
- `sample_rate`
- `bpm`
- `tempo_confidence`
- `beats`
- `downbeats`
- `sections`
- `energy`
- `bands`
- `spectral`
- `waveform`
- `choreography`
- `generated_at`

### `ChoreographyTimeline`
- `track_id`
- `source`
- `frame_hz`
- `global_cues`
- `arm_left_cues`
- `arm_right_cues`

### `MotionCue`
- `time`
- `kind`
- `intensity`
- `pose_family`
- `amplitude`
- `speed`
- `symmetry_role`
- `notes`

### `DualArmState`
- `arms`
- `execution`

### `MovementDefinition`
- `movement_id`
- `name`
- `summary`
- `description`
- `duration_seconds`
- `focus_joints`
- `recommended_arm`

### `MovementRunState`
- `status`
- `movement_id`
- `arm_id`
- `arm_type`
- `started_at`
- `updated_at`
- `note`
- `progress`

### `ArmAdapterState`
- `arm_id`
- `arm_type`
- `channel`
- `port`
- `available`
- `connected`
- `calibrated`
- `safety`
- `joints`
- `verification`
- `telemetry_live`
- `telemetry_updated_at`
- `telemetry_error`
- `telemetry`
- `preview`
- `notes`

## Compatibility Notes
- `motion_profile` remains present for compatibility with the existing UI.
- `analysis_status` is now part of `TrackSummary`.
- Local uploads should be selectable through the same UI card flow as Jamendo tracks.
- `POST /api/analysis/start` now performs the analysis synchronously for Phase 1 while still updating the stored status lifecycle (`queued` -> `processing` -> `ready|error`).
- Analysis results are cached on disk under `.data/analysis-cache/` keyed by `source + track_id`.
- `AudioAnalysis.choreography` exposes the timeline consumed by the dual-arm adapter preview.
- `GET /api/state` now returns a `dual_arm` block in addition to the legacy single-arm servo view so the frontend can evolve without breaking existing responses.
- When a follower live session is open, the legacy `servos` list now reflects real follower telemetry instead of the synthetic fallback values.
