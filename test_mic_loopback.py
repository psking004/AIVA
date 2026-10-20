import sounddevice as sd
import numpy as np
import wave
import time

# Load cmd1.wav
with wave.open('cmd1.wav', 'rb') as wf:
    orig_sr = wf.getframerate()
    raw = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0

target_sr = 48000
num_samples = int(len(raw) * target_sr / orig_sr)
audio_48k = np.interp(np.linspace(0, len(raw), num_samples), np.arange(len(raw)), raw).astype(np.float32)
stereo_48k = np.column_stack((audio_48k * 2.8, audio_48k * 2.8))

print("Recording 5 seconds from Device 14 (Microphone Array)...")
rec_frames = 5 * 48000
# Play and record simultaneously
rec = sd.playrec(stereo_48k, samplerate=48000, device=(14, 12), channels=2, dtype='float32')
sd.wait()

mono_rec = (rec[:, 0] + rec[:, 1]) * 0.5
peak = np.max(np.abs(mono_rec))
rms = np.sqrt(np.mean(mono_rec**2))
print(f"Recorded shape: {rec.shape}, Peak: {peak:.6f}, RMS: {rms:.6f}")

# Check 100ms slice RMS values
slice_len = 4800
rms_slices = [np.sqrt(np.mean(mono_rec[i:i+slice_len]**2)) for i in range(0, len(mono_rec), slice_len)]
print("Top 10 slice RMS values:", sorted(rms_slices, reverse=True)[:10])

# Save as WAV to hear what was recorded
with wave.open('mic_test_capture.wav', 'wb') as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(48000)
    wf.writeframes((np.clip(mono_rec, -1.0, 1.0) * 32767).astype(np.int16).tobytes())
print("Saved mic_test_capture.wav")
