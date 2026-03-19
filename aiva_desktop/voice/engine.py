"""
AIVA Voice Module
Handles STT (Whisper), TTS (Coqui), and wake word detection.
"""
import os
import queue
import threading
import tempfile
import wave
import numpy as np

try:
    import sounddevice as sd
    import soundfile as sf
    import whisper
    from TTS.api import TTS as CoquiTTS
    AUDIO_AVAILABLE = True
except ImportError:
    AUDIO_AVAILABLE = False
    print("[WARN] Audio libraries not installed. Running in text-only mode.")


WAKE_WORD = "aiva"
SAMPLE_RATE = 16000
CHUNK_DURATION = 0.5  # seconds per chunk for wake word detection


class VoiceEngine:
    def __init__(self):
        self.tts_model = None
        self.stt_model = None
        self.audio_available = AUDIO_AVAILABLE
        self._init_models()

    def _init_models(self):
        if not self.audio_available:
            return
        try:
            print("[Voice] Loading Whisper STT (base)...")
            self.stt_model = whisper.load_model("base")
            print("[Voice] Loading Coqui TTS (female)...")
            self.tts_model = CoquiTTS(
                model_name="tts_models/en/ljspeech/glow-tts",
                progress_bar=False,
                gpu=False,
            )
            print("[Voice] Models loaded.")
        except Exception as e:
            print(f"[Voice] Model load failed: {e}")
            self.audio_available = False

    # ── STT ────────────────────────────────────────────────────────
    def listen(self, duration: int = 5) -> str:
        """Record audio and transcribe with Whisper."""
        if not self.audio_available or self.stt_model is None:
            return input("(text mode) You: ").strip()

        print("[Voice] Listening...")
        audio = sd.rec(
            int(duration * SAMPLE_RATE),
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="float32",
        )
        sd.wait()

        # Write to temp WAV
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp_path = f.name
        audio_np = audio.squeeze()
        sf.write(tmp_path, audio_np, SAMPLE_RATE)

        result = self.stt_model.transcribe(tmp_path, language="en")
        os.unlink(tmp_path)
        text = result.get("text", "").strip()
        print(f"[Voice] Heard: {text}")
        return text

    # ── Wake Word ───────────────────────────────────────────────────
    def wait_for_wake_word(self, callback):
        """
        Continuously listen in chunks and fire callback when wake word heard.
        Runs in a background thread.
        """
        if not self.audio_available or self.stt_model is None:
            print(f"[Voice] Text mode – type '{WAKE_WORD}' to activate.")
            while True:
                text = input().strip().lower()
                if WAKE_WORD in text:
                    callback()
            return

        def _detect():
            chunk_samples = int(CHUNK_DURATION * SAMPLE_RATE)
            print(f"[Voice] Listening for wake word: '{WAKE_WORD}'...")
            while True:
                audio = sd.rec(
                    chunk_samples,
                    samplerate=SAMPLE_RATE,
                    channels=1,
                    dtype="float32",
                )
                sd.wait()

                # Quick energy check to avoid transcribing silence
                rms = float(np.sqrt(np.mean(audio ** 2)))
                if rms < 0.005:
                    continue

                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                    tmp_path = f.name
                sf.write(tmp_path, audio.squeeze(), SAMPLE_RATE)
                try:
                    res = self.stt_model.transcribe(tmp_path, language="en")
                    heard = res.get("text", "").lower()
                    if WAKE_WORD in heard:
                        print("[Voice] Wake word detected!")
                        callback()
                finally:
                    os.unlink(tmp_path)

        t = threading.Thread(target=_detect, daemon=True)
        t.start()

    # ── TTS ────────────────────────────────────────────────────────
    def speak(self, text: str):
        """Synthesize and play speech with Coqui TTS."""
        print(f"[AIVA] {text}")
        if not self.audio_available or self.tts_model is None:
            return

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp_path = f.name
        try:
            self.tts_model.tts_to_file(text=text, file_path=tmp_path)
            data, fs = sf.read(tmp_path)
            sd.play(data, fs)
            sd.wait()
        finally:
            os.unlink(tmp_path)
