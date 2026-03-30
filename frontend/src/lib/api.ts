import type { DanceMode, RobotConfig, RobotState, SceneName, TrackSearchResponse, TrackSummary } from "@/lib/types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed for ${path}`);
  }

  return response.json() as Promise<T>;
}

export function fetchConfig() {
  return request<RobotConfig>("/api/config");
}

export function fetchState() {
  return request<RobotState>("/api/state");
}

export function setMode(mode: DanceMode) {
  return request<RobotState>("/api/mode", {
    method: "POST",
    body: JSON.stringify({ mode }),
  });
}

export function setTransport(payload: {
  track_name: string;
  bpm: number;
  energy: number;
  playing: boolean;
}) {
  return request<RobotState>("/api/transport", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function triggerScene(scene: SceneName) {
  return request<RobotState>("/api/scene", {
    method: "POST",
    body: JSON.stringify({ scene }),
  });
}

export function pulseDance(payload: { bpm: number; energy: number }) {
  return request<RobotState>("/api/dance/pulse", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateServo(
  servoId: number,
  payload: { target_angle?: number; torque_enabled?: boolean },
) {
  return request<RobotState>(`/api/servo/${servoId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function searchTracks(query: string, source = "jamendo", limit = 8) {
  const params = new URLSearchParams({
    q: query,
    source,
    limit: String(limit),
  });

  return request<TrackSearchResponse>(`/api/tracks/search?${params.toString()}`);
}

export function selectTrack(track: TrackSummary, autoplay = true) {
  return request<RobotState>("/api/tracks/select", {
    method: "POST",
    body: JSON.stringify({ track, autoplay }),
  });
}
