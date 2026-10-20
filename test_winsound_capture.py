import winsound
import sounddevice as sd
import numpy as np
import time

print("Starting WASAPI Device 14 recording for 3 seconds...")
rec = sd.rec(int(48000 * 3), samplerate=48000, device=14, channels=2, dtype='float32')

# Play cmd1.wav using native Windows multimedia
print("Playing cmd1.wav with winsound.PlaySound...")
winsound.PlaySound("cmd1.wav", winsound.SND_FILENAME | winsound.SND_ASYNC)

sd.wait()
mono = (rec[:, 0] + rec[:, 1]) * 0.5
print(f"Captured with winsound -> Peak: {np.max(np.abs(mono)):.6f}, RMS: {np.sqrt(np.mean(mono**2)):.6f}")

slice_len = 4800
rms_slices = [np.sqrt(np.mean(mono[i:i+slice_len]**2)) for i in range(0, len(mono), slice_len)]
print("Top 5 slices:", sorted(rms_slices, reverse=True)[:5])

# 3:1 decimation to 16kHz
n_tri = (len(mono) // 3) * 3
m = mono[:n_tri]
mono_16k = (m[0::3] * 0.25 + m[1::3] * 0.50 + m[2::3] * 0.25).astype(np.float32)

from faster_whisper import WhisperModel
model = WhisperModel('base.en', device='cpu', compute_type='int8')
segments, info = model.transcribe(mono_16k, beam_size=2, best_of=2, language='en', initial_prompt='AIVA voice assistant command.')
text = ' '.join([s.text.strip() for s in segments]).strip()
print(f"WHISPER TRANSCRIPT: \"{text}\"")
