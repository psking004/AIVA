import sounddevice as sd
import numpy as np
import wave
import subprocess
from faster_whisper import WhisperModel

print("Recording 4.0s from WASAPI Device 14...")
rec = sd.rec(int(48000 * 4.0), samplerate=48000, device=14, channels=2, dtype='float32')
subprocess.run(['powershell', '-Command', "(New-Object System.Media.SoundPlayer 'cmd1.wav').PlaySync()"])
sd.wait()

mono = (rec[:, 0] + rec[:, 1]) * 0.5
n_tri = (len(mono) // 3) * 3
m = mono[:n_tri]
mono_16k = (m[0::3] * 0.25 + m[1::3] * 0.50 + m[2::3] * 0.25).astype(np.float32)

with wave.open('captured_soundplayer.wav', 'wb') as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(16000)
    wf.writeframes((np.clip(mono_16k, -1.0, 1.0) * 32767).astype(np.int16).tobytes())

print("Saved captured_soundplayer.wav.")

# Let's inspect with Whisper with vad_filter=False and examine segments
model = WhisperModel('base.en', device='cpu', compute_type='int8')
segments, info = model.transcribe(
    mono_16k,
    beam_size=5,
    language='en',
    vad_filter=False,
    no_speech_threshold=0.6,
    log_prob_threshold=-1.0
)
for s in segments:
    print(f"Segment [{s.start:.2f}s - {s.end:.2f}s]: '{s.text}' (no_speech_prob={s.no_speech_prob:.4f}, avg_logprob={s.avg_logprob:.4f})")
