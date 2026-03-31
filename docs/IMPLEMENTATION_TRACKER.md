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
- `#10` Define audio analysis models and API contracts for dual-arm choreography
- `#11` Add local audio upload and analyzable track source pipeline
- `#12` Implement backend audio analysis pipeline with librosa and caching
- `#13` Generate dual-arm choreography timelines from analysis data
- `#14` Build waveform-first music console on the frontend
- `#15` Add spectrogram, rhythm, structure, and track-info analysis tabs
- `#16` Replace synthetic backend motion data with real audio analysis state
- `#17` Prepare dual-arm LeRobot adapter and safety envelope

## Current Status
- Current PR target: `#10`
- Current backend state:
  - Search and track selection exist
  - Track motion profile is still synthetic
  - Spectrum and dance state are still synthetic
- Current frontend state:
  - Home page is music-first
  - Search/select flow exists
  - Analysis tabs are still placeholder-driven

## Working Decisions
- Use Python backend as the source of truth for BPM, beats, sections, and choreography timeline.
- Keep leader and follower as separate hardware profiles even if they share motor family overlap.
- Keep current search/select compatibility while expanding schema.
- Do not fake real analysis results in contract tickets. Contract endpoints may exist before the implementation behind them.

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
