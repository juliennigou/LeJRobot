# Implementation Tracker

## Goal
Build a music-first dual-arm dance system for the SO-101 leader + follower setup.

The delivery sequence is:
- Phase 1: music analysis console and choreography-ready timeline
- Phase 2: dual-arm execution through LeRobot adapters
- Phase 3: optional leader-arm capture, phrase authoring, and smarter choreography tools

## Active Epic
- `#54` Phase 3: music-driven choreography and autonomous performance

## Ticket Stack
- `#10` Define audio analysis models and API contracts for dual-arm choreography [done]
- `#11` Add local audio upload and analyzable track source pipeline [done]
- `#12` Implement backend audio analysis pipeline with librosa and caching [done]
- `#13` Generate dual-arm choreography timelines from analysis data [done]
- `#14` Build waveform-first music console on the frontend [done]
- `#15` Add spectrogram, rhythm, structure, and track-info analysis tabs [done]
- `#16` Replace synthetic backend motion data with real audio analysis state [done]
- `#17` Prepare dual-arm LeRobot adapter and safety envelope [done]
- `#19` Add GitHub Actions CI for backend, frontend, and smoke validation
- `#20` Dockerize frontend and backend with docker compose startup
- `#29` Verify live SO-101 connection and calibration loading for both arms [done]
- `#31` Implement real dual-arm SO-101 hardware bridge and telemetry [done]
- `#30` Enforce live safety supervisor for torque, neutral, emergency stop, and step limits [done]
- `#32` Add manual hardware validation controls and status surfaces [done]
- `#38` Add live 2D dual-arm visualizer to robot dashboard [done]
- `#34` Execute choreography on one live SO-101 arm [done]
- `#33` Run synchronized dual-arm choreography playback on leader + follower [done]
- `#52` Add follow-through motion layer for live movements [done]
- `#55` Build choreography scheduler from audio analysis to movement execution [done]
- `#57` Run autonomous music-driven dual-arm playback from the scheduler [done]
- `#56` Add song-level dance style controls and phrase mapping UI

## Current Status
- Current PR target: `#56`
- Current backend state:
  - Search and track selection exist
  - Local upload and persistent local track metadata are available
  - Real audio analysis is available behind `/api/analysis/*` for local uploads and Jamendo-backed tracks
  - Analysis results are cached on disk under `.data/analysis-cache/`
  - Dual-arm choreography output is section-aware and exposes left/right arm cue channels
  - `/api/state` now derives transport BPM, energy, spectrum bars, and autonomous servo modulation from cached analysis when it exists
  - Dual-arm adapter profiles now exist for leader + follower with dry-run defaults, safety envelopes, execution modes, and emergency-stop/neutral planning endpoints
  - `#29` now verifies dependency availability, serial-port reachability, and calibration coverage per arm
  - `#31` now opens real read-only LeRobot/Feetech sessions for leader + follower and exposes live joint telemetry in `/api/state` and `/api/arms`
  - Active bus sessions are now distinct from verification-ready state; `connected=true` means a live telemetry session is open
  - The backend now requires `feetech-servo-sdk` for real SO-101 telemetry through LeRobot
  - `#30` now enforces torque on/off, neutral moves, emergency stop, emergency reset, and live joint step limiting through the real Feetech write path
  - `#34` now adds a movement library abstraction and live oscillator-driven gestures for one arm, including `wave` and `wrist_lean`
  - `#45` now adds terminal-first tooling to record manual SO-101 joint demonstrations, replay them through the existing safety path, and fit a cleaner wave preset from recordings
  - `#33` now adds synchronized movement playback for both arms with `single`, `both-unison`, and `both-mirror` targeting
  - `#52` adds a follow-through layer on top of oscillator motions so distal joints can react with tunable delay, gain, damping, and settling
  - `#55` now adds a beat-aligned scheduler that converts analysis sections and beat grids into timed movement phrases
  - `#57` now adds autonomous playback controls that arm the transport, trigger scheduled phrases on time, and stop cleanly when the schedule completes or is cancelled
  - `#56` now adds editable song-level schedule style controls plus per-phrase movement remapping on top of the generated scheduler output
- Current frontend state:
  - Home page is music-first
  - Search/select flow exists
  - Minimal local upload/select flow exists without redesigning the page
  - Waveform is now the primary playback surface through `wavesurfer.js`
  - Spectrogram, rhythm, structure, and track-info tabs are wired to the real backend analysis payload
  - Hardware dashboard now separates verification-ready state from active telemetry state
  - Robot dashboard now shows real per-arm telemetry once a live connection is opened
  - `#38` added a responsive side-by-side 2D visualizer so both arms can be seen moving from live telemetry
  - `#30` added dashboard controls for dry-run, torque, neutral, and emergency-stop management
  - `#34` adds a dedicated Movement Library page with arm selection, per-movement tuning, and live gesture execution
  - `#33` extends the Movement Library page with single-arm vs dual-arm targeting and `mirror` / `unison` playback controls
  - `#52` extends movement presets and UI tuning with follow-through controls so fluidity can be tuned before live execution
  - `#45` adds terminal scripts for record/replay/fitting so manual observations can drive later motion refinement outside the UI
  - `#55` lets the app inspect scheduled phrase output for the selected track
  - `#57` now runs scheduled phrases live on one or both arms from the Track Info page
  - `#56` is now adding song-level style controls and phrase remapping directly inside the analysis views

## Workflow Rule
- Each ticket must ship from a feature branch through a pull request.
- Direct pushes to `main` should be reserved for exceptional cases only.
- CI must pass before merge: backend compile + smoke test, frontend build, and Docker compose smoke startup.

## Working Decisions
- Use Python backend as the source of truth for BPM, beats, sections, and choreography timeline.
- For Phase 2 planning, treat leader and follower as the same calibrated 6-joint SO-101 control profile while still preserving separate ports, safety state, and runtime status.
- Keep current search/select compatibility while expanding schema.
- Do not fake real analysis results in contract tickets. Contract endpoints may exist before the implementation behind them.
- Persist local upload metadata under `.data/uploads/index.json` and keep uploaded media files under `.data/uploads/files/`.
- Persist computed audio analysis under `.data/analysis-cache/json/` and remote source audio under `.data/analysis-cache/audio/`.

## PR Order
1. `#56` Song-level style controls and phrase mapping UI

## Update Rule
After each merged PR:
- update this file
- mark completed tickets
- record any scope change or constraint discovered during implementation
