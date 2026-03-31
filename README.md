# LeJRobot

This repo now contains a first full-stack scaffold for a LeRobot dance console:

- `frontend/`: React + Vite + Tailwind + shadcn-style UI primitives for a modern robot control dashboard.
- `backend/`: FastAPI service that reads `.data/setup.json`, exposes robot state, and simulates servo choreography safely in memory.

The UI is intentionally opinionated: it looks like a control surface, not a generic admin page. The backend is intentionally simple: it handles state transitions for transport, dance modes, scenes, and per-servo target angles so we can later swap in real LeRobot hardware commands.

## Run it

One command:

```bash
./run_app.sh
```

If the script is not executable yet:

```bash
chmod +x run_app.sh
./run_app.sh
```

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api/*` requests to `http://127.0.0.1:8000`.

If port `8000` is already used on your machine, you can run the backend on another port and point Vite at it:

```bash
cd backend
uvicorn app.main:app --reload --port 8001
```

```bash
cd frontend
VITE_API_PROXY_TARGET=http://127.0.0.1:8001 npm run dev
```

The launcher supports the same override:

```bash
APP_BACKEND_PORT=8001 ./run_app.sh
```

Vite hot-reloads frontend changes. A restart should not be needed for normal UI edits.

## Music Search

The app now supports song search through Jamendo's API.

- By default the backend uses Jamendo's public testing `client_id` (`709fa152`) for read-only search.
- For your own app quota, set `JAMENDO_CLIENT_ID` before starting the backend.

Example:

```bash
export JAMENDO_CLIENT_ID="your_client_id"
./run_app.sh
```

## Local Uploads

The app also supports local audio uploads.

- Uploaded files are stored under `.data/uploads/`
- Metadata is persisted locally so uploaded tracks remain available as the local source
- Supported formats are currently: `mp3`, `wav`, `ogg`, `flac`, `m4a`, `aac`

Backend note:

- `python-multipart` is now required by the FastAPI app to accept file uploads

## Audio Analysis

Phase 1 now includes a real backend audio-analysis pipeline.

- Analysis is computed with `librosa`
- Results are cached under `.data/analysis-cache/`
- Local uploads are analyzed directly from `.data/uploads/files/`
- Remote Jamendo tracks are downloaded into the analysis cache before decoding
- `/api/state` now reflects cached analysis data when available, instead of relying only on synthetic transport/spectrum placeholders

## Dual-Arm Adapter Prep

The backend now exposes a dry-run dual-arm execution surface for your SO-101 leader + follower setup.

- `GET /api/arms` returns concrete adapter profiles for `leader` and `follower`
- `POST /api/arms/verify` checks dependency availability, serial-port reachability, and calibration coverage for both arms
- `POST /api/arms/{arm_id}/connect` now opens a real read-only telemetry session for the selected arm
- `POST /api/arms/execution-mode` switches between `mirror`, `unison`, `call_response`, and `asymmetric`
- `POST /api/arms/{arm_id}/safety` updates per-arm dry-run/safety settings plus joint overrides for offsets, inversion, limits, and speed caps
- `POST /api/arms/emergency-stop` holds the current live pose and disables torque immediately on connected arms
- `POST /api/arms/emergency-reset` clears emergency-stop state so torque can be re-enabled explicitly
- `POST /api/arms/neutral` moves connected arms toward the neutral pose through the same live step-limited safety envelope used for future motion writes

This is still a planning and validation layer for choreography writes. It now opens real SO-101 telemetry sessions, exposes live safety controls, and can issue bounded neutral/safety commands without starting dance playback.

Install or refresh backend dependencies after pulling:

```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
```

The backend requirements now include `feetech-servo-sdk`, which LeRobot needs for Feetech/STS telemetry.

## Docker

You can run the full stack with Docker Compose:

```bash
docker compose up --build
```

Then open:

- frontend: `http://127.0.0.1:5173`
- backend: `http://127.0.0.1:8000`

Notes:

- The frontend container serves the built app through nginx and proxies `/api/*` and `/media/uploads/*` to the backend container.
- The repo `.data/` directory is mounted into the backend container so uploads and analysis cache persist across restarts.
- If you want Jamendo search inside Docker, keep `.env.local` at the repo root with `JAMENDO_CLIENT_ID=...`.

## Workflow

From now on, each ticket should move through a feature branch and pull request.

Recommended flow:

```bash
git checkout -b feat/some-ticket
# implement
git push -u origin feat/some-ticket
```

Then open a PR against `main` and link the ticket in the PR body, for example:

```text
Closes #15
```

Direct pushes to `main` should be avoided for feature work. The GitHub Actions workflow in `.github/workflows/ci.yml` now validates backend, frontend, and Docker startup on every PR.

## Next step

The next engineering step is the first real hardware execution pass that maps the dual-arm dry-run adapter to LeRobot motor commands with the existing safety envelope still enforced.
