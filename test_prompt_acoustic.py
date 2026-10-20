import numpy as np
import wave
import sounddevice as sd
import time
from faster_whisper import WhisperModel

with wave.open('test_speech.wav', 'rb') as wf:
    orig_sr = wf.getframerate()
    raw = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0

target_sr = 48000
num_samples = int(len(raw) * target_sr / orig_sr)
audio_48k = np.interp(np.linspace(0, len(raw), num_samples), np.arange(len(raw)), raw).astype(np.float32)
boosted = np.tanh(audio_48k * 4.0).astype(np.float32)
stereo = np.column_stack((boosted, boosted))

captured = []
def callback(indata, frames, time_info, status):
    mix = (indata[:, 0] + indata[:, 1]) * 0.5 if indata.shape[1] >= 2 else indata[:, 0]
    mono = (mix[0::3] * 0.25 + mix[1::3] * 0.50 + mix[2::3] * 0.25).astype(np.float32)
    captured.append(mono)

stream = sd.InputStream(device=14, samplerate=48000, channels=2, dtype='float32', blocksize=3072, callback=callback)
stream.start()
time.sleep(0.3)
sd.play(stereo, samplerate=target_sr, device=12)
sd.wait()
time.sleep(1.0)
stream.stop()
stream.close()

arr = np.concatenate(captured)
model = WhisperModel('base.en', device='cpu', compute_type='int8')
segs, info = model.transcribe(arr, beam_size=2, initial_prompt='AIVA, what is the capital of India?')
print('Transcript:', ' '.join(s.text.strip() for s in segs))
for s in segs:
    print(f'Segment: [{s.start:.2f}s -> {s.end:.2f}s]: "{s.text}"')
