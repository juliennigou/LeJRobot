# Implementation Tracker

## Goal
Build a music-first dual-arm dance system for the SO-101 leader + follower setup.

The delivery sequence is:
- Phase 1: music analysis console and choreography-ready timeline
- Phase 2: dual-arm execution through LeRobot adapters
- Phase 3: optional leader-arm capture, phrase authoring, and smarter choreography tools

## Active Epic
- `#28` Phase 2: real dual-arm SO-101 execution for leader + follower

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
- `#34` Execute choreography on one live SO-101 arm
- `#33` Run synchronized dual-arm choreography playback on leader + follower

## Current Status
- Current PR target: `#34`
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
  - `#34` now adds a movement library abstraction and a first executable oscillator-driven `wave` movement for one live arm
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
  - `#34` adds a dedicated Movement Library page with arm selection, wave preset selection, and runtime tuning controls for the first live gesture
  - Music-driven choreography execution is not implemented yet, but the app can now execute a bounded library gesture on one live arm

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
1. `#29` Live connection and calibration verification
2. `#31` Real hardware bridge and telemetry
3. `#30` Live safety supervisor
4. `#32` Manual hardware validation controls
5. `#34` Single-arm live choreography execution
6. `#33` Dual-arm synchronized live choreography playback

## Update Rule
After each merged PR:
- update this file
- mark completed tickets
- record any scope change or constraint discovered during implementation
