from __future__ import annotations

import io
import math
import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient

from backend.app import main as main_module
from backend.app.analysis import AudioAnalysisCache, AudioAnalysisService
from backend.app.music import JamendoTrackProvider, LocalTrackLibrary
from backend.app.state import RobotStateStore


class ApiSmokeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        temp_root = Path(self.tempdir.name)
        uploads_root = temp_root / "uploads" / "files"
        cache_root = temp_root / "analysis-cache"

        self.original_store = main_module.store
        self.original_local_library = main_module.local_library
        self.original_analysis_service = main_module.analysis_service

        main_module.store = RobotStateStore()
        main_module.local_library = LocalTrackLibrary(
            uploads_dir=uploads_root,
            media_base_url="/media/uploads",
            index_path=temp_root / "uploads" / "index.json",
        )
        main_module.analysis_service = AudioAnalysisService(
            jamendo_provider=JamendoTrackProvider(client_id="test"),
            local_library=main_module.local_library,
            cache=AudioAnalysisCache(cache_root),
        )
        self.client = TestClient(main_module.app)

    def tearDown(self) -> None:
        main_module.store = self.original_store
        main_module.local_library = self.original_local_library
        main_module.analysis_service = self.original_analysis_service
        self.tempdir.cleanup()

    def test_local_upload_analysis_flow(self) -> None:
        audio = self._fixture_wav()
        upload = self.client.post("/api/tracks/upload", files={"file": ("fixture.wav", audio, "audio/wav")})
        self.assertEqual(upload.status_code, 200)
        track = upload.json()

        select = self.client.post("/api/tracks/select", json={"track": track, "autoplay": False})
        self.assertEqual(select.status_code, 200)

        start = self.client.post(
            "/api/analysis/start",
            json={"track_id": track["track_id"], "source": track["source"]},
        )
        self.assertEqual(start.status_code, 200)
        self.assertEqual(start.json()["status"], "ready")

        status = self.client.get(f"/api/analysis/{track['source']}/{track['track_id']}/status")
        self.assertEqual(status.status_code, 200)
        self.assertEqual(status.json()["status"], "ready")

        analysis = self.client.get(f"/api/analysis/{track['source']}/{track['track_id']}")
        self.assertEqual(analysis.status_code, 200)
        payload = analysis.json()
        self.assertGreater(payload["bpm"], 0.0)
        self.assertGreater(len(payload["beats"]), 0)
        self.assertGreater(len(payload["waveform"]["peaks"]), 0)

        choreography = self.client.get(f"/api/choreography/{track['source']}/{track['track_id']}")
        self.assertEqual(choreography.status_code, 200)
        self.assertGreater(len(choreography.json()["arm_left_cues"]), 0)
        self.assertGreater(len(choreography.json()["arm_right_cues"]), 0)

        cache_files = list((Path(self.tempdir.name) / "analysis-cache" / "json" / "local").glob("*.json"))
        self.assertTrue(cache_files)

    def _fixture_wav(self) -> bytes:
        sample_rate = 22050
        duration = 4.0
        timeline = np.linspace(0.0, duration, int(sample_rate * duration), endpoint=False)
        carrier = 0.3 * np.sin(2 * math.pi * 220.0 * timeline)
        envelope = 0.15 + 0.85 * ((np.sin(2 * math.pi * 2.0 * timeline) > 0).astype(float))
        signal = carrier * envelope

        buffer = io.BytesIO()
        sf.write(buffer, signal, sample_rate, format="WAV")
        return buffer.getvalue()


if __name__ == "__main__":
    unittest.main()
