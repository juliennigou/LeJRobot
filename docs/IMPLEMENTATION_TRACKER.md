# Implementation Tracker

## Goal
Build a music-first dual-arm dance system for the SO-101 leader + follower setup.

The delivery sequence is:
- Phase 1: music analysis console and choreography-ready timeline
- Phase 2: dual-arm execution through LeRobot adapters
- Phase 3: optional leader-arm capture, phrase authoring, and smarter choreography tools

## Active Epic
- `#18` Phase 1: music analysis console for dual-arm SO-101 dance system

## Ticket Stack
- `#10` Define audio analysis models and API contracts for dual-arm choreography [done]
- `#11` Add local audio upload and analyzable track source pipeline [done]
- `#12` Implement backend audio analysis pipeline with librosa and caching [done]
- `#13` Generate dual-arm choreography timelines from analysis data [done]
- `#14` Build waveform-first music console on the frontend [done]
- `#15` Add spectrogram, rhythm, structure, and track-info analysis tabs [done]
- `#16` Replace synthetic backend motion data with real audio analysis state [done]
- `#17` Prepare dual-arm LeRobot adapter and safety envelope
- `#19` Add GitHub Actions CI for backend, frontend, and smoke validation
- `#20` Dockerize frontend and backend with docker compose startup

## Current Status
- Current PR target: `#15`
- Current backend state:
  - Search and track selection exist
  - Local upload and persistent local track metadata are available
  - Real audio analysis is available behind `/api/analysis/*` for local uploads and Jamendo-backed tracks
  - Analysis results are cached on disk under `.data/analysis-cache/`
  - Dual-arm choreography output is section-aware and exposes left/right arm cue channels
  - `/api/state` now derives transport BPM, energy, spectrum bars, and autonomous servo modulation from cached analysis when it exists
- Current frontend state:
  - Home page is music-first
  - Search/select flow exists
  - Minimal local upload/select flow exists without redesigning the page
  - Waveform is now the primary playback surface through `wavesurfer.js`
  - Spectrogram, rhythm, structure, and track-info tabs are wired to the real backend analysis payload

## Workflow Rule
- Each ticket must ship from a feature branch through a pull request.
- Direct pushes to `main` should be reserved for exceptional cases only.
- CI must pass before merge: backend compile + smoke test, frontend build, and Docker compose smoke startup.

## Working Decisions
- Use Python backend as the source of truth for BPM, beats, sections, and choreography timeline.
- Keep leader and follower as separate hardware profiles even if they share motor family overlap.
- Keep current search/select compatibility while expanding schema.
- Do not fake real analysis results in contract tickets. Contract endpoints may exist before the implementation behind them.
- Persist local upload metadata under `.data/uploads/index.json` and keep uploaded media files under `.data/uploads/files/`.
- Persist computed audio analysis under `.data/analysis-cache/json/` and remote source audio under `.data/analysis-cache/audio/`.

## PR Order
1. `#10` Data models and API contracts
2. `#11` Local upload pipeline
3. `#12` Audio analysis pipeline
4. `#13` Choreography timeline generation
5. `#14` Waveform-first frontend
6. `#15` Analysis tabs
7. `#16` Remove synthetic state as source of truth
8. `#17` Dual-arm hardware adapter prep

## Update Rule
After each merged PR:
- update this file
- mark completed tickets
- record any scope change or constraint discovered during implementation
