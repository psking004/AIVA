from faster_whisper import WhisperModel
import numpy as np
import time

print("Initializing Whisper 'base.en' (CPU, int8)...")
t_load = time.time()
model = WhisperModel('base.en', device='cpu', compute_type='int8')
print(f"Model loaded in {time.time() - t_load:.2f}s")

# Warmup
warmup = np.zeros(8000, dtype=np.float32)
list(model.transcribe(warmup, language='en', beam_size=1, vad_filter=False)[0])
print("Warmup complete.")

# Synthesize test audio samples (sine + harmonics resembling speech envelope)
sr = 16000
for dur in [1.0, 2.0, 3.0]:
    t = np.linspace(0, dur, int(sr * dur), endpoint=False)
    # Formant-like harmonic mix
    audio = (0.3 * np.sin(2 * np.pi * 300 * t) + 0.2 * np.sin(2 * np.pi * 1200 * t) + 0.1 * np.sin(2 * np.pi * 2400 * t)).astype(np.float32)
    
    times = []
    for run in range(3):
        t0 = time.time()
        segments, _ = model.transcribe(
            audio,
            beam_size=2,
            best_of=2,
            language='en',
            initial_prompt="AIVA voice assistant command.",
            temperature=0.0,
            vad_filter=False,
            no_speech_threshold=0.85
        )
        list(segments)
        elapsed = time.time() - t0
        times.append(elapsed)
    
    avg_latency = np.mean(times)
    print(f"Benchmark {dur:.1f}s speech: runs={[round(x*1000) for x in times]}ms | avg={avg_latency*1000:.1f}ms | RTF={avg_latency/dur:.2f}x")
