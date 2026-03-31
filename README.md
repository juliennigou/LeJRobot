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

## Next step

The next engineering step is to replace the estimated motion profile with real audio analysis and then swap the mock `RobotStateStore` motion engine for a real adapter that pushes commands through LeRobot / Feetech to your follower arm while preserving the current API shape.
