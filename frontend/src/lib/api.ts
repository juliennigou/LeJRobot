import type {
  AnalysisStartResponse,
  AnalysisStatusResponse,
  AudioAnalysis,
  ChoreographyTimeline,
  DanceMode,
  DualArmState,
  MovementLibraryState,
  RobotConfig,
  RobotState,
  SceneName,
  TrackSearchResponse,
  TrackSource,
  TrackSummary,
} from "@/lib/types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
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

export function verifyArms() {
  return request<DualArmState>("/api/arms/verify", {
    method: "POST",
  });
}

export function setArmConnection(armId: string, connected: boolean) {
  return request<DualArmState>(`/api/arms/${armId}/connect`, {
    method: "POST",
    body: JSON.stringify({ connected }),
  });
}

export function updateArmSafety(
  armId: string,
  payload: {
    dry_run?: boolean;
    emergency_stop?: boolean;
    neutral_on_stop?: boolean;
    torque_enabled?: boolean;
    amplitude_scale?: number;
    speed_scale?: number;
    max_step_degrees?: number;
  },
) {
  return request<DualArmState>(`/api/arms/${armId}/safety`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function resetArmState(armId: string) {
  return request<DualArmState>(`/api/arms/${armId}/reset-state`, {
    method: "POST",
  });
}

export function triggerEmergencyStop() {
  return request<DualArmState>("/api/arms/emergency-stop", {
    method: "POST",
  });
}

export function resetEmergencyStop() {
  return request<DualArmState>("/api/arms/emergency-reset", {
    method: "POST",
  });
}

export function moveArmsToNeutral() {
  return request<DualArmState>("/api/arms/neutral", {
    method: "POST",
  });
}

export function fetchMovementLibrary() {
  return request<MovementLibraryState>("/api/movements");
}

export function runMovement(
  armId: string,
  movementId: string,
  options?: {
    preset_id?: string;
    frequency_hz?: number;
    cycles?: number;
    amplitude_scale?: number;
    softness?: number;
    asymmetry?: number;
  },
) {
  return request<MovementLibraryState>("/api/movements/run", {
    method: "POST",
    body: JSON.stringify({ arm_id: armId, movement_id: movementId, ...options }),
  });
}

export function stopMovement() {
  return request<MovementLibraryState>("/api/movements/stop", {
    method: "POST",
  });
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

export function uploadTrack(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  return request<TrackSummary>("/api/tracks/upload", {
    method: "POST",
    body: formData,
  });
}

export function selectTrack(track: TrackSummary, autoplay = true) {
  return request<RobotState>("/api/tracks/select", {
    method: "POST",
    body: JSON.stringify({ track, autoplay }),
  });
}

export function fetchCurrentTrack() {
  return request<TrackSummary | null>("/api/tracks/current");
}

export function startAnalysis(trackId: string, source: TrackSource) {
  return request<AnalysisStartResponse>("/api/analysis/start", {
    method: "POST",
    body: JSON.stringify({ track_id: trackId, source }),
  });
}

export function fetchAnalysisStatus(trackId: string, source: TrackSource) {
  return request<AnalysisStatusResponse>(`/api/analysis/${source}/${trackId}/status`);
}

export function fetchAnalysis(trackId: string, source: TrackSource) {
  return request<AudioAnalysis>(`/api/analysis/${source}/${trackId}`);
}

export function fetchChoreography(trackId: string, source: TrackSource) {
  return request<ChoreographyTimeline>(`/api/choreography/${source}/${trackId}`);
}
