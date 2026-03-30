from __future__ import annotations

import os

import httpx

from .models import MotionProfile, TrackSource, TrackSummary


class TrackProviderError(RuntimeError):
    pass


def estimate_motion_profile(track_id: str, title: str, artist: str, duration_seconds: float | None) -> MotionProfile:
    seed = sum(ord(char) for char in f"{track_id}:{title}:{artist}")
    bpm = 92 + seed % 52

    duration_bonus = 0.0
    if duration_seconds:
        duration_bonus = min(duration_seconds / 1200.0, 0.12)

    energy = min(0.92, 0.44 + ((seed // 5) % 32) / 100.0 + duration_bonus)
    pattern_bias = ["groove", "sweep", "punch", "float"][seed % 4]
    return MotionProfile(bpm=bpm, energy=round(energy, 2), pattern_bias=pattern_bias)


class JamendoTrackProvider:
    endpoint = "https://api.jamendo.com/v3.0/tracks/"

    def __init__(self, client_id: str | None = None) -> None:
        self.client_id = client_id or os.getenv("JAMENDO_CLIENT_ID", "709fa152")

    def search(self, query: str, limit: int = 8) -> list[TrackSummary]:
        normalized_query = query.strip()
        if not normalized_query:
            return []

        params = {
            "client_id": self.client_id,
            "format": "json",
            "limit": max(1, min(limit, 12)),
            "search": normalized_query,
            "order": "relevance",
            "audioformat": "mp31",
            "include": "musicinfo",
        }

        try:
            response = httpx.get(self.endpoint, params=params, timeout=12.0)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise TrackProviderError(f"Jamendo search failed: {exc}") from exc

        payload = response.json()
        headers = payload.get("headers", {})
        if headers.get("status") != "success":
            message = headers.get("error_message") or "Unknown Jamendo error"
            raise TrackProviderError(message)

        results = payload.get("results", [])
        return [self._parse_track(item) for item in results]

    def _parse_track(self, item: dict) -> TrackSummary:
        track_id = str(item.get("id", ""))
        title = item.get("name") or "Untitled track"
        artist = item.get("artist_name") or "Unknown artist"
        duration_raw = item.get("duration")

        try:
            duration_seconds = float(duration_raw) if duration_raw is not None else None
        except (TypeError, ValueError):
            duration_seconds = None

        audio_url = item.get("audio") or item.get("audiodownload") or None
        artwork_url = item.get("image") or item.get("album_image") or None
        external_url = item.get("shareurl") or item.get("shorturl") or item.get("audiodownload") or None

        return TrackSummary(
            track_id=track_id,
            source=TrackSource.JAMENDO,
            title=title,
            artist=artist,
            duration_seconds=duration_seconds,
            artwork_url=artwork_url,
            audio_url=audio_url,
            external_url=external_url,
            motion_profile=estimate_motion_profile(track_id, title, artist, duration_seconds),
        )
