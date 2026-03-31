# API Contracts

## Scope
This document tracks the canonical Phase 1 API contracts for music analysis and dual-arm-ready choreography.

These contracts are intentionally ahead of the implementation. The schema is stable first; the real analysis and choreography payloads land in follow-up tickets.

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

## Compatibility Notes
- `motion_profile` remains present for compatibility with the existing UI.
- `analysis_status` is now part of `TrackSummary`.
- Local uploads should be selectable through the same UI card flow as Jamendo tracks.
- Real analysis output is intentionally not faked by these endpoints. Follow-up tickets will populate `AudioAnalysis` and `ChoreographyTimeline`.
