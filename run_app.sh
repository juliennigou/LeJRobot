#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_VENV="$BACKEND_DIR/.venv"
APP_HOST="${APP_HOST:-127.0.0.1}"
APP_BACKEND_PORT="${APP_BACKEND_PORT:-8000}"
APP_FRONTEND_PORT="${APP_FRONTEND_PORT:-5173}"
VITE_API_PROXY_TARGET="${VITE_API_PROXY_TARGET:-http://${APP_HOST}:${APP_BACKEND_PORT}}"

if [[ -f "$ROOT_DIR/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env.local"
  set +a
fi

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required but was not found."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but was not found."
  exit 1
fi

if [[ ! -d "$BACKEND_VENV" ]]; then
  echo "Creating backend virtual environment..."
  python3 -m venv "$BACKEND_VENV"
fi

if [[ ! -f "$BACKEND_VENV/bin/uvicorn" ]]; then
  echo "Installing backend dependencies..."
  "$BACKEND_VENV/bin/pip" install -r "$BACKEND_DIR/requirements.txt"
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  (cd "$FRONTEND_DIR" && npm install)
fi

echo "Starting backend on http://${APP_HOST}:${APP_BACKEND_PORT} ..."
(
  cd "$BACKEND_DIR"
  exec "$BACKEND_VENV/bin/uvicorn" app.main:app --reload --host "$APP_HOST" --port "$APP_BACKEND_PORT"
) &
BACKEND_PID=$!

sleep 2

echo "Starting frontend on http://${APP_HOST}:${APP_FRONTEND_PORT} ..."
cd "$FRONTEND_DIR"
VITE_API_PROXY_TARGET="$VITE_API_PROXY_TARGET" npm run dev -- --host "$APP_HOST" --port "$APP_FRONTEND_PORT"
