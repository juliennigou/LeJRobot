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

## Next step

The next engineering step is to replace the mock `RobotStateStore` motion engine with a real adapter that pushes commands through LeRobot / Feetech to your follower arm while preserving the current API shape.
