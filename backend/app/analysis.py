from __future__ import annotations

import json
import math
import re
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse

import httpx

try:
    import librosa
    import numpy as np
except ImportError as exc:  # pragma: no cover - exercised through runtime environment
    librosa = None
    np = None
    ANALYSIS_IMPORT_ERROR = exc
else:
    ANALYSIS_IMPORT_ERROR = None

from .models import (
    AudioAnalysis,
    BandEnvelope,
    ChoreographyTimeline,
    EnergyEnvelope,
    MotionCue,
    MotionCueKind,
    PoseFamily,
    SectionLabel,
    SongSection,
    SpectralSummary,
    SymmetryRole,
    TrackReference,
    TrackSource,
    TrackSummary,
    WaveformSummary,
)
from .music import JamendoTrackProvider, LocalTrackLibrary

ROOT_DIR = Path(__file__).resolve().parents[2]
ANALYSIS_CACHE_ROOT = ROOT_DIR / ".data" / "analysis-cache"
ANALYSIS_JSON_DIR = ANALYSIS_CACHE_ROOT / "json"
ANALYSIS_AUDIO_DIR = ANALYSIS_CACHE_ROOT / "audio"


class AnalysisError(RuntimeError):
    pass


class AudioAnalysisCache:
    def __init__(self, root: Path | None = None) -> None:
        base = root or ANALYSIS_CACHE_ROOT
        self.json_dir = base / "json"
        self.audio_dir = base / "audio"
        self.json_dir.mkdir(parents=True, exist_ok=True)
        self.audio_dir.mkdir(parents=True, exist_ok=True)

    def load(self, reference: TrackReference) -> AudioAnalysis | None:
        path = self._json_path(reference)
        if not path.exists():
            return None

        try:
            return AudioAnalysis.model_validate_json(path.read_text())
        except (json.JSONDecodeError, ValueError):
            return None

    def save(self, analysis: AudioAnalysis) -> None:
        path = self._json_path(TrackReference(track_id=analysis.track_id, source=analysis.source))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(analysis.model_dump(mode="json"), indent=2))

    def audio_path(self, source: TrackSource, track_id: str, suffix: str) -> Path:
        normalized_suffix = suffix if suffix.startswith(".") else f".{suffix}"
        return self.audio_dir / source.value / f"{self._slug(track_id)}{normalized_suffix}"

    def _json_path(self, reference: TrackReference) -> Path:
        return self.json_dir / reference.source.value / f"{self._slug(reference.track_id)}.json"

    def _slug(self, value: str) -> str:
        return re.sub(r"[^a-zA-Z0-9._-]+", "_", value).strip("_") or "track"


class AudioAnalysisService:
    target_sample_rate = 22050
    target_feature_hz = 20.0
    waveform_buckets = 512

    def __init__(
        self,
        jamendo_provider: JamendoTrackProvider,
        local_library: LocalTrackLibrary,
        cache: AudioAnalysisCache | None = None,
    ) -> None:
        self.jamendo_provider = jamendo_provider
        self.local_library = local_library
        self.cache = cache or AudioAnalysisCache()

    def resolve_track(self, reference: TrackReference, preferred_track: TrackSummary | None = None) -> TrackSummary:
        if preferred_track and preferred_track.track_id == reference.track_id and preferred_track.source == reference.source:
            return preferred_track

        if reference.source == TrackSource.LOCAL:
            return self.local_library.get_track(reference.track_id)
        if reference.source == TrackSource.JAMENDO:
            return self.jamendo_provider.get_track(reference.track_id)

        raise AnalysisError(f"Track source '{reference.source}' is not supported for analysis yet")

    def get_cached_analysis(self, reference: TrackReference) -> AudioAnalysis | None:
        return self.cache.load(reference)

    def analyze_reference(self, reference: TrackReference, preferred_track: TrackSummary | None = None) -> AudioAnalysis:
        if ANALYSIS_IMPORT_ERROR is not None:
            raise AnalysisError(
                "Audio analysis dependencies are missing. Install backend requirements before starting the backend."
            ) from ANALYSIS_IMPORT_ERROR

        cached = self.cache.load(reference)
        if cached is not None:
            return cached

        track = self.resolve_track(reference, preferred_track=preferred_track)
        analysis = self.analyze_track(track)
        self.cache.save(analysis)
        return analysis

    def analyze_track(self, track: TrackSummary) -> AudioAnalysis:
        audio_path = self._resolve_audio_path(track)
        try:
            signal, sample_rate = librosa.load(audio_path.as_posix(), sr=self.target_sample_rate, mono=True)
        except Exception as exc:  # pragma: no cover - library/codec behavior is environment-specific
            raise AnalysisError(f"Failed to decode audio for {track.source}:{track.track_id}: {exc}") from exc

        if signal.size == 0:
            raise AnalysisError(f"Decoded audio for {track.source}:{track.track_id} is empty")

        signal = self._normalize_signal(signal)
        analysis = self._build_analysis(track, signal, sample_rate)
        return analysis

    def _resolve_audio_path(self, track: TrackSummary) -> Path:
        if track.source == TrackSource.LOCAL:
            return self.local_library.get_audio_path(track.track_id)

        if not track.audio_url:
            raise AnalysisError(f"Track {track.source}:{track.track_id} has no analyzable audio URL")

        parsed = urlparse(track.audio_url)
        suffix = Path(parsed.path).suffix or ".mp3"
        cached_path = self.cache.audio_path(track.source, track.track_id, suffix)
        cached_path.parent.mkdir(parents=True, exist_ok=True)
        if cached_path.exists() and cached_path.stat().st_size > 0:
            return cached_path

        try:
            with httpx.stream("GET", track.audio_url, timeout=30.0, follow_redirects=True) as response:
                response.raise_for_status()
                with cached_path.open("wb") as handle:
                    for chunk in response.iter_bytes():
                        if chunk:
                            handle.write(chunk)
        except httpx.HTTPError as exc:
            cached_path.unlink(missing_ok=True)
            raise AnalysisError(f"Failed to fetch audio for {track.source}:{track.track_id}: {exc}") from exc

        if not cached_path.exists() or cached_path.stat().st_size == 0:
            cached_path.unlink(missing_ok=True)
            raise AnalysisError(f"Downloaded audio for {track.source}:{track.track_id} is empty")

        return cached_path

    def _build_analysis(self, track: TrackSummary, signal, sample_rate: int) -> AudioAnalysis:
        hop_length = 512
        frame_length = 2048
        duration_seconds = float(librosa.get_duration(y=signal, sr=sample_rate))
        base_frame_hz = sample_rate / hop_length
        feature_stride = max(1, int(round(base_frame_hz / self.target_feature_hz)))
        frame_hz = base_frame_hz / feature_stride

        rms = librosa.feature.rms(y=signal, frame_length=frame_length, hop_length=hop_length)[0]
        onset_strength = librosa.onset.onset_strength(y=signal, sr=sample_rate, hop_length=hop_length)
        tempo_raw, beat_frames = librosa.beat.beat_track(
            y=signal,
            sr=sample_rate,
            hop_length=hop_length,
            onset_envelope=onset_strength,
            trim=False,
        )
        tempo = float(np.asarray(tempo_raw).reshape(-1)[0]) if np.asarray(tempo_raw).size else 0.0
        beat_frames = np.asarray(beat_frames, dtype=int)
        beat_times = librosa.frames_to_time(beat_frames, sr=sample_rate, hop_length=hop_length).astype(float).tolist()
        downbeat_times = beat_times[::4]

        spectral_centroid = librosa.feature.spectral_centroid(y=signal, sr=sample_rate, hop_length=hop_length)[0]
        spectral_bandwidth = librosa.feature.spectral_bandwidth(y=signal, sr=sample_rate, hop_length=hop_length)[0]
        spectral_rolloff = librosa.feature.spectral_rolloff(y=signal, sr=sample_rate, hop_length=hop_length)[0]

        stft = np.abs(librosa.stft(signal, n_fft=frame_length, hop_length=hop_length))
        freqs = librosa.fft_frequencies(sr=sample_rate, n_fft=frame_length)
        low_band = self._band_energy(stft, freqs, maximum=250.0)
        mid_band = self._band_energy(stft, freqs, minimum=250.0, maximum=2000.0)
        high_band = self._band_energy(stft, freqs, minimum=2000.0)

        rms_down = self._downsample_feature(rms, feature_stride)
        onset_down = self._downsample_feature(onset_strength, feature_stride)
        low_down = self._downsample_feature(low_band, feature_stride)
        mid_down = self._downsample_feature(mid_band, feature_stride)
        high_down = self._downsample_feature(high_band, feature_stride)
        centroid_down = self._downsample_feature(spectral_centroid, feature_stride)
        bandwidth_down = self._downsample_feature(spectral_bandwidth, feature_stride)
        rolloff_down = self._downsample_feature(spectral_rolloff, feature_stride)

        energy = EnergyEnvelope(
            frame_hz=frame_hz,
            rms=self._normalize_list(rms_down),
            onset_strength=self._normalize_list(onset_down),
        )
        bands = BandEnvelope(
            frame_hz=frame_hz,
            low=self._normalize_list(low_down),
            mid=self._normalize_list(mid_down),
            high=self._normalize_list(high_down),
        )
        spectral = SpectralSummary(
            centroid=self._scale_feature(centroid_down),
            bandwidth=self._scale_feature(bandwidth_down),
            rolloff=self._scale_feature(rolloff_down),
        )
        waveform = WaveformSummary(
            peaks=self._waveform_peaks(signal, self.waveform_buckets),
            bucket_count=self.waveform_buckets,
        )
        sections = self._segment_sections(duration_seconds, energy.rms, energy.onset_strength, frame_hz)
        tempo_confidence = self._tempo_confidence(tempo, beat_times, duration_seconds, onset_down, frame_hz)
        choreography = self._build_choreography(track, beat_times, downbeat_times, energy.rms, bands, sections, frame_hz)

        return AudioAnalysis(
            track_id=track.track_id,
            source=track.source,
            duration_seconds=round(duration_seconds, 3),
            sample_rate=sample_rate,
            bpm=round(tempo, 2),
            tempo_confidence=tempo_confidence,
            beats=self._round_series(beat_times),
            downbeats=self._round_series(downbeat_times),
            sections=sections,
            energy=energy,
            bands=bands,
            spectral=spectral,
            waveform=waveform,
            choreography=choreography,
            generated_at=datetime.now(UTC).isoformat(),
        )

    def _segment_sections(
        self,
        duration_seconds: float,
        rms: list[float],
        onset: list[float],
        frame_hz: float,
    ) -> list[SongSection]:
        if duration_seconds <= 0:
            return []

        window_seconds = 8.0 if duration_seconds > 32 else max(4.0, duration_seconds / 4 or 4.0)
        frame_window = max(1, int(round(window_seconds * frame_hz)))
        sections: list[SongSection] = []

        for start_index in range(0, max(len(rms), 1), frame_window):
            end_index = min(len(rms), start_index + frame_window)
            start_seconds = start_index / frame_hz
            end_seconds = min(duration_seconds, max((end_index / frame_hz), start_seconds + 0.25))
            energy_mean = self._mean(rms[start_index:end_index])
            density_mean = self._mean(onset[start_index:end_index])
            sections.append(
                SongSection(
                    label=SectionLabel.UNKNOWN,
                    start_seconds=round(start_seconds, 3),
                    end_seconds=round(end_seconds, 3),
                    energy_mean=round(energy_mean, 4),
                    density_mean=round(density_mean, 4),
                )
            )

        if not sections:
            sections.append(
                SongSection(
                    label=SectionLabel.UNKNOWN,
                    start_seconds=0.0,
                    end_seconds=round(duration_seconds, 3),
                    energy_mean=0.0,
                    density_mean=0.0,
                )
            )

        labels = [SectionLabel.VERSE for _ in sections]
        labels[0] = SectionLabel.INTRO
        if len(labels) > 1:
            labels[-1] = SectionLabel.OUTRO

        interior = [index for index in range(1, max(len(sections) - 1, 1))]
        if interior:
            chorus_index = max(
                interior,
                key=lambda index: sections[index].energy_mean * 0.7 + sections[index].density_mean * 0.3,
            )
            labels[chorus_index] = SectionLabel.CHORUS

            remaining = [index for index in interior if index != chorus_index]
            if remaining:
                lowest_index = min(remaining, key=lambda index: sections[index].energy_mean)
                if sections[chorus_index].energy_mean - sections[lowest_index].energy_mean >= 0.15:
                    labels[lowest_index] = SectionLabel.BREAK
                    remaining = [index for index in remaining if index != lowest_index]
            if remaining and len(sections) >= 4:
                bridge_index = remaining[len(remaining) // 2]
                labels[bridge_index] = SectionLabel.BRIDGE

        normalized_sections: list[SongSection] = []
        for index, section in enumerate(sections):
            end_seconds = duration_seconds if index == len(sections) - 1 else section.end_seconds
            normalized_sections.append(
                SongSection(
                    label=labels[index],
                    start_seconds=section.start_seconds,
                    end_seconds=round(max(end_seconds, section.start_seconds + 0.25), 3),
                    energy_mean=section.energy_mean,
                    density_mean=section.density_mean,
                )
            )
        return normalized_sections

    def _build_choreography(
        self,
        track: TrackSummary,
        beat_times: list[float],
        downbeat_times: list[float],
        rms: list[float],
        bands: BandEnvelope,
        sections: list[SongSection],
        frame_hz: float,
    ) -> ChoreographyTimeline:
        global_cues: list[MotionCue] = []
        arm_left_cues: list[MotionCue] = []
        arm_right_cues: list[MotionCue] = []
        downbeat_set = {round(time, 3) for time in downbeat_times}

        for beat_index, beat_time in enumerate(beat_times):
            rounded_time = round(beat_time, 3)
            intensity = self._feature_at_time(rms, frame_hz, beat_time)
            low = self._feature_at_time(bands.low, frame_hz, beat_time)
            high = self._feature_at_time(bands.high, frame_hz, beat_time)
            is_downbeat = rounded_time in downbeat_set
            pose_family = self._pose_for_features(intensity, low, high, is_downbeat)
            kind = MotionCueKind.DOWNBEAT if is_downbeat else MotionCueKind.BEAT
            amplitude = round(min(1.0, intensity * 0.7 + low * 0.3), 4)
            speed = round(min(1.0, 0.45 + high * 0.45 + intensity * 0.1), 4)

            global_cues.append(
                MotionCue(
                    time=rounded_time,
                    kind=kind,
                    intensity=round(intensity, 4),
                    pose_family=pose_family,
                    amplitude=amplitude,
                    speed=speed,
                    symmetry_role=SymmetryRole.UNISON,
                    notes="song pulse",
                )
            )
            arm_left_cues.append(
                MotionCue(
                    time=rounded_time,
                    kind=kind,
                    intensity=round(intensity, 4),
                    pose_family=pose_family,
                    amplitude=amplitude,
                    speed=speed,
                    symmetry_role=SymmetryRole.LEAD if beat_index % 2 == 0 else SymmetryRole.MIRROR,
                    notes="left arm pulse",
                )
            )
            arm_right_cues.append(
                MotionCue(
                    time=rounded_time,
                    kind=kind,
                    intensity=round(intensity, 4),
                    pose_family=pose_family,
                    amplitude=amplitude,
                    speed=speed,
                    symmetry_role=SymmetryRole.FOLLOW if beat_index % 2 == 0 else SymmetryRole.MIRROR,
                    notes="right arm pulse",
                )
            )

        for section in sections:
            pose_family = self._pose_for_section(section.label)
            intensity = round(max(section.energy_mean, section.density_mean), 4)
            cue = MotionCue(
                time=section.start_seconds,
                kind=MotionCueKind.SECTION_CHANGE,
                intensity=intensity,
                pose_family=pose_family,
                amplitude=round(min(1.0, 0.35 + section.energy_mean * 0.65), 4),
                speed=round(min(1.0, 0.35 + section.density_mean * 0.65), 4),
                symmetry_role=SymmetryRole.CONTRAST if section.label == SectionLabel.BRIDGE else SymmetryRole.UNISON,
                notes=section.label.value,
            )
            global_cues.append(cue)

        global_cues.sort(key=lambda cue: (cue.time, cue.kind.value))
        return ChoreographyTimeline(
            track_id=track.track_id,
            source=track.source,
            frame_hz=frame_hz,
            global_cues=global_cues,
            arm_left_cues=arm_left_cues,
            arm_right_cues=arm_right_cues,
        )

    def _band_energy(self, stft, freqs, minimum: float | None = None, maximum: float | None = None):
        mask = np.ones_like(freqs, dtype=bool)
        if minimum is not None:
            mask &= freqs >= minimum
        if maximum is not None:
            mask &= freqs < maximum
        if not np.any(mask):
            return np.zeros(stft.shape[1], dtype=float)
        return np.mean(stft[mask], axis=0)

    def _downsample_feature(self, values, stride: int):
        if stride <= 1:
            return np.asarray(values, dtype=float)
        values = np.asarray(values, dtype=float)
        bucket_count = math.ceil(len(values) / stride)
        downsampled = []
        for bucket_index in range(bucket_count):
            start = bucket_index * stride
            end = min(len(values), start + stride)
            downsampled.append(float(np.mean(values[start:end])))
        return np.asarray(downsampled, dtype=float)

    def _tempo_confidence(
        self,
        tempo: float,
        beat_times: list[float],
        duration_seconds: float,
        onset_strength: list[float],
        frame_hz: float,
    ) -> float:
        if tempo <= 0.0 or duration_seconds <= 0.0 or len(beat_times) < 2:
            return 0.0
        expected_beats = max(duration_seconds * tempo / 60.0, 1.0)
        density_score = min(1.0, len(beat_times) / expected_beats)
        onset_score = min(1.0, self._mean(onset_strength) * 1.8)
        confidence = density_score * 0.65 + onset_score * 0.35
        if frame_hz <= 0:
            return round(confidence, 4)
        return round(min(1.0, confidence), 4)

    def _waveform_peaks(self, signal, bucket_count: int) -> list[float]:
        if bucket_count <= 0:
            return []
        samples = np.abs(np.asarray(signal, dtype=float))
        if samples.size == 0:
            return []
        bucket_size = max(1, math.ceil(samples.size / bucket_count))
        peaks = []
        for index in range(bucket_count):
            start = index * bucket_size
            end = min(samples.size, start + bucket_size)
            if start >= samples.size:
                peaks.append(0.0)
                continue
            peaks.append(float(np.max(samples[start:end])))
        return self._normalize_list(np.asarray(peaks, dtype=float))

    def _normalize_signal(self, signal):
        peak = float(np.max(np.abs(signal))) if signal.size else 0.0
        if peak <= 0.0:
            return np.asarray(signal, dtype=float)
        return np.asarray(signal, dtype=float) / peak

    def _normalize_list(self, values) -> list[float]:
        values = np.asarray(values, dtype=float)
        if values.size == 0:
            return []
        minimum = float(np.min(values))
        maximum = float(np.max(values))
        if math.isclose(maximum, minimum):
            return [0.0 for _ in values]
        scaled = (values - minimum) / (maximum - minimum)
        return [round(float(item), 4) for item in scaled.tolist()]

    def _scale_feature(self, values) -> list[float]:
        values = np.asarray(values, dtype=float)
        if values.size == 0:
            return []
        return [round(float(item), 2) for item in values.tolist()]

    def _mean(self, values) -> float:
        if values is None:
            return 0.0
        if len(values) == 0:
            return 0.0
        return float(sum(values) / len(values))

    def _round_series(self, values: list[float]) -> list[float]:
        return [round(float(value), 3) for value in values]

    def _feature_at_time(self, values: list[float], frame_hz: float, time_seconds: float) -> float:
        if not values or frame_hz <= 0.0:
            return 0.0
        index = min(len(values) - 1, max(0, int(time_seconds * frame_hz)))
        return float(values[index])

    def _pose_for_features(self, intensity: float, low: float, high: float, is_downbeat: bool) -> PoseFamily:
        if is_downbeat and intensity >= 0.62:
            return PoseFamily.PUNCH
        if low >= 0.62:
            return PoseFamily.SWEEP
        if high >= 0.58 and intensity < 0.45:
            return PoseFamily.FLOAT
        return PoseFamily.GROOVE

    def _pose_for_section(self, label: SectionLabel) -> PoseFamily:
        mapping = {
            SectionLabel.CHORUS: PoseFamily.PUNCH,
            SectionLabel.BREAK: PoseFamily.FLOAT,
            SectionLabel.BRIDGE: PoseFamily.SWEEP,
            SectionLabel.INTRO: PoseFamily.FLOAT,
            SectionLabel.OUTRO: PoseFamily.FLOAT,
        }
        return mapping.get(label, PoseFamily.GROOVE)
