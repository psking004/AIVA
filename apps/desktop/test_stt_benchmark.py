import urllib.request
import json
import time
import io
import soundfile as sf
import faster_whisper

# 1. Synthesize real speech from Kokoro
print("[BENCHMARK] Synthesizing speech from Kokoro on port 5050...")
payload = json.dumps({'text': 'Hello AIVA, tell me a short joke.', 'voice': 'af_heart'}).encode('utf-8')
req = urllib.request.Request('http://127.0.0.1:5050/synthesize', data=payload, headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(req) as resp:
    wav_bytes = resp.read()

audio, sr = sf.read(io.BytesIO(wav_bytes))
duration = len(audio) / sr
print(f"[BENCHMARK] Synthesized {duration:.2f}s of speech ({len(wav_bytes)} bytes)")

# 2. Benchmark faster-whisper base.en
print("[BENCHMARK] Loading faster-whisper base.en CPU int8 (cpu_threads=8)...")
model = faster_whisper.WhisperModel('base.en', device='cpu', compute_type='int8', cpu_threads=8)

# Warmup run
list(model.transcribe(audio[:int(sr * 0.5)], beam_size=1, without_timestamps=True)[0])

# Timed transcription
t0 = time.time()
segments, info = model.transcribe(audio, beam_size=1, language='en', without_timestamps=True)
transcript = " ".join([s.text for s in segments]).strip()
latency_ms = round((time.time() - t0) * 1000, 2)

print(f"[BENCHMARK] Transcription: \"{transcript}\"")
print(f"[BENCHMARK] Speech Duration: {duration:.2f}s | Latency: {latency_ms} ms | Target: < 1800 ms")

if latency_ms < 1800:
    print(f"[BENCHMARK RESULT] PASS - Faster-Whisper base.en CPU transcription is {latency_ms} ms (< 1800 ms)")
else:
    print(f"[BENCHMARK RESULT] Notice: Latency was {latency_ms} ms")
