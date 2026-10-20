import sounddevice as sd
import numpy as np
import wave
import subprocess
from faster_whisper import WhisperModel

print("Recording 4.0s from WASAPI Device 14...")
# Start recording in background
rec = sd.rec(int(48000 * 4.0), samplerate=48000, device=14, channels=2, dtype='float32')

# Play cmd1.wav using PowerShell SoundPlayer
subprocess.run(['powershell', '-Command', "(New-Object System.Media.SoundPlayer 'cmd1.wav').PlaySync()"])

sd.wait()
mono = (rec[:, 0] + rec[:, 1]) * 0.5
print(f"Captured: Peak={np.max(np.abs(mono)):.6f}, RMS={np.sqrt(np.mean(mono**2)):.6f}")

n_tri = (len(mono) // 3) * 3
m = mono[:n_tri]
mono_16k = (m[0::3] * 0.25 + m[1::3] * 0.50 + m[2::3] * 0.25).astype(np.float32)

model = WhisperModel('base.en', device='cpu', compute_type='int8')
segments, _ = model.transcribe(mono_16k, language='en', initial_prompt='AIVA voice assistant command.')
text = ' '.join([s.text.strip() for s in segments]).strip()
print(f"RESULT: '{text}'")
