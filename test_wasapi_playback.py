import sounddevice as sd
import numpy as np
import wave
import time

with wave.open('test_speech.wav', 'rb') as wf:
    orig_sr = wf.getframerate()
    audio_orig = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0

# Resample to 48000 Hz
target_sr = 48000
num_samples = int(len(audio_orig) * target_sr / orig_sr)
audio_48k = np.interp(np.linspace(0, len(audio_orig), num_samples), np.arange(len(audio_orig)), audio_orig).astype(np.float32)
# Make stereo for device 12
stereo_48k = np.column_stack((audio_48k * 2.5, audio_48k * 2.5))

print(f"Resampled audio: {len(stereo_48k)/target_sr:.2f}s, SR={target_sr}")

captured_blocks = []

def callback(indata, frames, time_info, status):
    mix = (indata[:, 0] + indata[:, 1]) * 0.5 if indata.shape[1] >= 2 else indata[:, 0]
    mono = (mix[0::3] * 0.25 + mix[1::3] * 0.50 + mix[2::3] * 0.25).astype(np.float32)
    captured_blocks.append(mono)

stream = sd.InputStream(device=14, samplerate=48000, channels=2, dtype='float32', blocksize=3072, callback=callback)
stream.start()

print("Stream started. Playing audio via WASAPI Device 12 at 48kHz stereo...")
time.sleep(0.5)
try:
    sd.play(stereo_48k, samplerate=target_sr, device=12)
    sd.wait()
    print("Playback finished.")
except Exception as e:
    print(f"Playback error on device 12: {e}")

time.sleep(1.0)
stream.stop()
stream.close()

data = np.concatenate(captured_blocks)
print(f"Total captured: {len(data)/16000:.2f}s, Peak: {np.max(np.abs(data)):.6f}, RMS: {np.sqrt(np.mean(data**2)):.6f}")

for i, blk in enumerate(captured_blocks):
    rms = np.sqrt(np.mean(blk**2))
    peak = np.max(np.abs(blk))
    if rms > 0.0010:
        print(f"Block {i:3d} ({i*0.064:.2f}s): rms={rms:.6f} peak={peak:.6f}")
