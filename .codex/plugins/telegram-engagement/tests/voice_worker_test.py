"""Dependency-free worker boundary checks; actual inference is separate acceptance."""
import json
from pathlib import Path
import runpy
import shutil
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[4]
Speech = runpy.run_path(str(Path(__file__).resolve().parents[1] / "voice/worker.py"))["Speech"]


class VoiceBoundaryTests(unittest.TestCase):
    def setUp(self):
        parent = ROOT / ".origin/test-fixtures"
        parent.mkdir(parents=True, exist_ok=True)
        self.root = Path(tempfile.mkdtemp(prefix="speech-", dir=parent))
        (self.root / "config.json").write_text(json.dumps({"device": "cuda"}))

    def tearDown(self):
        shutil.rmtree(self.root)

    def test_busy_gpu_is_rejected_before_loading_a_model(self):
        torch = types.SimpleNamespace(cuda=types.SimpleNamespace(mem_get_info=lambda device: (1024, 4096)))
        with patch.dict(sys.modules, {"numpy": types.ModuleType("numpy"), "soundfile": types.ModuleType("soundfile"), "torch": torch}):
            with self.assertRaisesRegex(RuntimeError, "GPU_BUSY"):
                Speech(self.root).render("A bounded message.", str(self.root / "output.ogg"))

    def test_speech_paths_cannot_escape_the_channel(self):
        with self.assertRaisesRegex(ValueError, "private channel"):
            Speech(self.root).local(self.root.parent / "outside.wav")


if __name__ == "__main__":
    unittest.main()
