"""Private, persistent local speech worker. JSON-lines in/out; no cloud inference."""
import argparse
import contextlib
import json
import os
from pathlib import Path
import subprocess
import sys


class Speech:
    def __init__(self, root):
        self.root = root.resolve()
        self.config = json.loads((root / "config.json").read_text())
        self.tts = self.stt = self.prompt = None
        self.pronunciation = self.config.get("pronunciation", {})

    def local(self, value):
        p = Path(value).resolve()
        if not p.is_relative_to(self.root):
            raise ValueError("Speech assets must stay in the private channel directory")
        return p

    def transcribe(self, file):
        if self.stt is None:
            from faster_whisper import WhisperModel
            self.stt = WhisperModel(str(self.root / "models/stt"), device="cpu", compute_type="int8", local_files_only=True)
        segments, info = self.stt.transcribe(str(self.local(file)), vad_filter=True, word_timestamps=True, condition_on_previous_text=False)
        segments = list(segments)
        return {"text": " ".join(s.text.strip() for s in segments).strip(), "language": info.language,
                "words": [{"word": w.word.strip(), "start": w.start, "end": w.end} for s in segments for w in (s.words or [])]}

    def render(self, text, output):
        import numpy as np
        import soundfile as sf
        import torch
        if self.tts is None:
            from qwen_tts import Qwen3TTSModel
            device = self.config.get("device", "cpu")
            self.tts = Qwen3TTSModel.from_pretrained(str(self.root / "models/qwen"), device_map=device,
                        dtype=torch.float32 if device == "cpu" else torch.bfloat16, local_files_only=True)
        sample = self.root / "voice/reference.wav"
        reference_text = (self.root / "voice/reference.txt").read_text().strip()
        if self.prompt is None:
            self.prompt = self.tts.create_voice_clone_prompt(str(sample), ref_text=reference_text)
        if not text.strip():
            raise ValueError("Cannot render empty speech")
        target = self.local(output)
        target.parent.mkdir(parents=True, exist_ok=True)
        raw = target.with_suffix(".wav")
        language = self.config.get("language", "Auto")
        # The caption remains canonical; pronunciation is an explicit local override.
        spoken = text
        for written, pronunciation in sorted(self.pronunciation.items(), key=lambda item: -len(item[0])):
            spoken = spoken.replace(written, pronunciation)
        waves, rate = self.tts.generate_voice_clone(text=spoken, language=language, voice_clone_prompt=self.prompt, max_new_tokens=2048)
        audio = np.asarray(waves[0], dtype=np.float32)
        if not len(audio) or not np.isfinite(audio).all() or float(np.max(np.abs(audio))) < 0.0001:
            raise ValueError("Speech was empty, silent or invalid")
        sf.write(raw, audio, rate)
        os.chmod(raw, 0o600)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "libopus", str(target)], check=True, timeout=120, capture_output=True)
        os.chmod(target, 0o600)
        # Keep original caption authoritative. ASR is evidence, not a rewrite.
        heard = self.transcribe(str(target))
        import difflib
        import re
        normalize = lambda s: re.findall(r"\w+", s.casefold())
        expected, actual = normalize(spoken), normalize(heard["text"])
        score = difflib.SequenceMatcher(None, expected, actual).ratio()
        if score < 0.65 or (len(expected) >= 3 and not any(w in actual[-5:] for w in expected[-2:])):
            raise ValueError("Speech verification failed; preserve the reply and retry or inspect pronunciation")
        return {"file": str(target), "alignment": score, "transcript": heard["text"], "seconds": len(audio) / rate}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=["serve", "download"])
    parser.add_argument("--root", required=True)
    args = parser.parse_args()
    root = Path(args.root)
    if args.operation == "download":
        from huggingface_hub import snapshot_download, model_info
        config = json.loads((root / "config.json").read_text())
        receipts = []
        for model, folder in [(config.get("qwenModel", "Qwen/Qwen3-TTS-12Hz-0.6B-Base"), "qwen"), ("Systran/faster-whisper-" + config.get("sttModel", "base"), "stt")]:
            requested = config.get(folder + "Revision", "main")
            revision = model_info(model, revision=requested).sha
            snapshot_download(model, revision=revision, local_dir=root / "models" / folder)
            receipts.append({"model": model, "revision": revision, "folder": folder})
        (root / "model-receipts.json").write_text(json.dumps(receipts, indent=2) + "\n")
        os.chmod(root / "model-receipts.json", 0o600)
        return
    speech = Speech(root)
    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            with contextlib.redirect_stdout(sys.stderr):
                if request["operation"] == "transcribe": result = speech.transcribe(request["file"])
                elif request["operation"] == "render": result = speech.render(request["text"], request["output"])
                else: raise ValueError("Unknown speech operation")
            response = {"id": request["id"], "ok": True, "result": result}
        except Exception as error:
            # Do not expose user speech or internal provider request objects.
            response = {"id": request.get("id"), "ok": False, "error": type(error).__name__ + ": check local models, sample, FFmpeg and speech configuration"}
        print(json.dumps(response), flush=True)


if __name__ == "__main__":
    main()
