import sounddevice as sd
import numpy as np

# Generate 0.5s 440Hz tone
sr = 48000
t = np.linspace(0, 0.5, int(sr * 0.5), endpoint=False)
tone = (0.5 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
stereo = np.column_stack((tone, tone))

for i, d in enumerate(sd.query_devices()):
    if d['max_output_channels'] > 0 and ('Speaker' in d['name'] or 'Realtek' in d['name']):
        try:
            print(f"Testing Device {i}: {d['name']} (api={d['hostapi']})...")
            # play on device i while recording on device 14
            rec = sd.playrec(stereo, samplerate=48000, device=(14, i), channels=2, dtype='float32')
            sd.wait()
            mono = (rec[:, 0] + rec[:, 1]) * 0.5
            print(f"  -> Captured Peak: {np.max(np.abs(mono)):.6f}, RMS: {np.sqrt(np.mean(mono**2)):.6f}")
        except Exception as e:
            print(f"  -> Error: {e}")
