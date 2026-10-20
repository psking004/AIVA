import sounddevice as sd
import numpy as np
import wave
import time
import threading

with wave.open('test_speech.wav', 'rb') as wf:
    sr = wf.getframerate()
    audio_out = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0

print(f"Loaded test_speech.wav: {len(audio_out)/sr:.2f}s, SR={sr}")

captured_blocks = []

def callback(indata, frames, time_info, status):
    mix = (indata[:, 0] + indata[:, 1]) * 0.5 if indata.shape[1] >= 2 else indata[:, 0]
    mono = (mix[0::3] * 0.25 + mix[1::3] * 0.50 + mix[2::3] * 0.25).astype(np.float32)
    captured_blocks.append(mono)

stream = sd.InputStream(device=14, samplerate=48000, channels=2, dtype='float32', blocksize=3072, callback=callback)
stream.start()

print("Stream started. Playing audio in 1s...")
time.sleep(1.0)
sd.play(audio_out, samplerate=sr)
sd.wait()
print("Playback finished. Recording for 1 more second...")
time.sleep(1.0)
stream.stop()
stream.close()

data = np.concatenate(captured_blocks)
print(f"Total captured: {len(data)/16000:.2f}s, Peak: {np.max(np.abs(data)):.6f}, RMS: {np.sqrt(np.mean(data**2)):.6f}")

for i, blk in enumerate(captured_blocks):
    rms = np.sqrt(np.mean(blk**2))
    peak = np.max(np.abs(blk))
    if rms > 0.0005:
        print(f"Block {i:3d} ({i*0.064:.2f}s): rms={rms:.6f} peak={peak:.6f}")
