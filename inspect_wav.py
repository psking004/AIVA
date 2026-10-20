import wave
import numpy as np
from faster_whisper import WhisperModel

with wave.open('backend/data/debug/aiva-last-command.wav', 'rb') as wf:
    sr = wf.getframerate()
    audio = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0

print(f'WAV Duration: {len(audio)/sr:.2f}s, SR={sr}, Peak={np.max(np.abs(audio)):.4f}, RMS={np.sqrt(np.mean(audio**2)):.4f}')

# Window RMS
win = int(sr * 0.2)
for i in range(0, len(audio), win):
    chunk = audio[i:i+win]
    t = i / sr
    rms = np.sqrt(np.mean(chunk**2))
    if rms > 0.0005:
        print(f'{t:4.2f}s - {t+0.2:4.2f}s: rms={rms:.5f} peak={np.max(np.abs(chunk)):.4f}')

model = WhisperModel('base.en', device='cpu', compute_type='int8')
segs, info = model.transcribe(audio, beam_size=1, no_speech_threshold=0.8)
for s in segs:
    print(f'Segment: [{s.start:.2f}s -> {s.end:.2f}s] "{s.text}" (no_speech_prob={s.no_speech_prob:.3f})')
