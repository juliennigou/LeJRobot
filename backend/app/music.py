from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import BinaryIO

import httpx

from .models import MotionProfile, TrackSource, TrackSummary

ROOT_DIR = Path(__file__).resolve().parents[2]
UPLOADS_ROOT = ROOT_DIR / ".data" / "uploads"
UPLOADS_DIR = UPLOADS_ROOT / "files"
UPLOADS_INDEX_PATH = UPLOADS_ROOT / "index.json"


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


class LocalTrackLibrary:
    allowed_suffixes = {".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac"}
    allowed_content_prefixes = ("audio/", "application/octet-stream")

    def __init__(
        self,
        uploads_dir: Path | None = None,
        media_base_url: str = "/media/uploads",
        index_path: Path | None = None,
    ) -> None:
        self.uploads_dir = uploads_dir or UPLOADS_DIR
        self.media_base_url = media_base_url.rstrip("/")
        self.index_path = index_path or (UPLOADS_INDEX_PATH if uploads_dir is None else self.uploads_dir.parent / "index.json")
        self.uploads_dir.mkdir(parents=True, exist_ok=True)
        self.index_path.parent.mkdir(parents=True, exist_ok=True)
        self.records = self._load_index()

    def search(self, query: str, limit: int = 8) -> list[TrackSummary]:
        normalized = query.strip().lower()
        records = list(self.records.values())
        if normalized:
            records = [
                record
                for record in records
                if normalized in record["track"]["title"].lower()
                or normalized in record["track"]["artist"].lower()
                or normalized in record["original_filename"].lower()
            ]

        records.sort(key=lambda record: record["uploaded_at"], reverse=True)
        return [
            TrackSummary.model_validate(record["track"])
            for record in records[: max(1, min(limit, 24))]
        ]

    def get_track(self, track_id: str) -> TrackSummary:
        record = self.records.get(track_id)
        if record is None:
            raise TrackProviderError(f"Unknown local track '{track_id}'")
        return TrackSummary.model_validate(record["track"])

    def get_audio_path(self, track_id: str) -> Path:
        record = self.records.get(track_id)
        if record is None:
            raise TrackProviderError(f"Unknown local track '{track_id}'")

        stored_name = record.get("stored_name")
        if not stored_name:
            raise TrackProviderError(f"Missing stored file information for local track '{track_id}'")

        path = self.uploads_dir / stored_name
        if not path.exists():
            raise TrackProviderError(f"Missing uploaded audio file for local track '{track_id}'")
        return path

    def ingest_upload(self, filename: str | None, content_type: str | None, fileobj: BinaryIO) -> TrackSummary:
        if not filename:
            raise TrackProviderError("Uploaded file is missing a filename")

        suffix = Path(filename).suffix.lower()
        if suffix not in self.allowed_suffixes:
            raise TrackProviderError(
                f"Unsupported audio format '{suffix or 'unknown'}'. Allowed formats: "
                + ", ".join(sorted(self.allowed_suffixes))
            )

        if content_type and not any(content_type.startswith(prefix) for prefix in self.allowed_content_prefixes):
            raise TrackProviderError(f"Unsupported content type '{content_type}'")

        file_hash = hashlib.sha256()
        temp_name = f".upload-{os.urandom(8).hex()}{suffix}"
        temp_path = self.uploads_dir / temp_name

        with temp_path.open("wb") as handle:
            while True:
                chunk = fileobj.read(1024 * 1024)
                if not chunk:
                    break
                file_hash.update(chunk)
                handle.write(chunk)

        if temp_path.stat().st_size == 0:
            temp_path.unlink(missing_ok=True)
            raise TrackProviderError("Uploaded audio file is empty")

        digest = file_hash.hexdigest()
        existing = self._find_by_hash(digest)
        if existing is not None:
            temp_path.unlink(missing_ok=True)
            return TrackSummary.model_validate(existing["track"])

        stored_name = f"{digest[:24]}{suffix}"
        stored_path = self.uploads_dir / stored_name
        temp_path.replace(stored_path)

        title = self._humanize_title(Path(filename).stem)
        track = TrackSummary(
            track_id=f"local-{digest[:24]}",
            source=TrackSource.LOCAL,
            title=title,
            artist="Local Upload",
            duration_seconds=None,
            artwork_url=None,
            audio_url=f"{self.media_base_url}/{stored_name}",
            external_url=None,
            motion_profile=estimate_motion_profile(digest[:24], title, "Local Upload", None),
        )

        record = {
            "file_hash": digest,
            "stored_name": stored_name,
            "original_filename": filename,
            "content_type": content_type or "application/octet-stream",
            "uploaded_at": datetime.now(UTC).isoformat(),
            "track": track.model_dump(mode="json"),
        }
        self.records[track.track_id] = record
        self._save_index()
        return track

    def _load_index(self) -> dict[str, dict]:
        if not self.index_path.exists():
            return {}

        try:
            payload = json.loads(self.index_path.read_text())
        except json.JSONDecodeError:
            return {}

        records: dict[str, dict] = {}
        for record in payload.get("records", []):
            track_data = record.get("track")
            if not isinstance(track_data, dict):
                continue
            track_id = track_data.get("track_id")
            if not track_id:
                continue
            records[track_id] = record
        return records

    def _save_index(self) -> None:
        payload = {
            "records": list(self.records.values()),
        }
        self.index_path.write_text(json.dumps(payload, indent=2))

    def _find_by_hash(self, digest: str) -> dict | None:
        for record in self.records.values():
            if record.get("file_hash") == digest:
                return record
        return None

    def _humanize_title(self, value: str) -> str:
        cleaned = re.sub(r"[_\-]+", " ", value).strip()
        return cleaned or "Untitled local track"


class JamendoTrackProvider:
    endpoint = "https://api.jamendo.com/v3.0/tracks/"

    def __init__(self, client_id: str | None = None) -> None:
        self.client_id = client_id or os.getenv("JAMENDO_CLIENT_ID", "709fa152")

    def search(self, query: str, limit: int = 8) -> list[TrackSummary]:
        normalized_query = query.strip()
        if not normalized_query:
            return []

        results = self._fetch_tracks(
            {
                "limit": max(1, min(limit, 12)),
                "search": normalized_query,
                "order": "relevance",
            }
        )
        return [self._parse_track(item) for item in results]

    def get_track(self, track_id: str) -> TrackSummary:
        results = self._fetch_tracks({"id": track_id, "limit": 1})
        if not results:
            raise TrackProviderError(f"Unknown Jamendo track '{track_id}'")
        return self._parse_track(results[0])

    def _fetch_tracks(self, params: dict) -> list[dict]:
        request_params = {
            "client_id": self.client_id,
            "format": "json",
            "audioformat": "mp31",
            "include": "musicinfo",
            **params,
        }

        try:
            response = httpx.get(self.endpoint, params=request_params, timeout=12.0)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise TrackProviderError(f"Jamendo search failed: {exc}") from exc

        payload = response.json()
        headers = payload.get("headers", {})
        if headers.get("status") != "success":
            message = headers.get("error_message") or "Unknown Jamendo error"
            raise TrackProviderError(message)

        return payload.get("results", [])

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
