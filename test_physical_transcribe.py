import sounddevice as sd
import numpy as np
import wave
from faster_whisper import WhisperModel

with wave.open('cmd1.wav', 'rb') as wf:
    raw = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
num_samples = int(len(raw) * 44100 / wf.getframerate())
audio_44k = np.interp(np.linspace(0, len(raw), num_samples), np.arange(len(raw)), raw).astype(np.float32)
stereo = np.column_stack((audio_44k * 5.0, audio_44k * 5.0))

print('Playing cmd1 via MME Speaker and capturing on WASAPI Microphone Array...')
sd.play(stereo, samplerate=44100, device=4)
rec = sd.rec(int(48000 * 3.5), samplerate=48000, device=14, channels=2, dtype='float32')
sd.wait()

mix = (rec[:, 0] + rec[:, 1]) * 0.5
# 3:1 decimation to 16kHz
n_tri = (len(mix) // 3) * 3
m = mix[:n_tri]
mono_16k = (m[0::3] * 0.25 + m[1::3] * 0.50 + m[2::3] * 0.25).astype(np.float32)

print(f"Captured samples: {len(mono_16k)}, duration: {len(mono_16k)/16000:.2f}s, Peak: {np.max(np.abs(mono_16k)):.6f}, RMS: {np.sqrt(np.mean(mono_16k**2)):.6f}")

with wave.open('physical_test_output.wav', 'wb') as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(16000)
    wf.writeframes((np.clip(mono_16k, -1.0, 1.0) * 32767).astype(np.int16).tobytes())

print('Transcribing captured physical audio with Whisper base.en...')
model = WhisperModel('base.en', device='cpu', compute_type='int8')
segments, info = model.transcribe(mono_16k, beam_size=2, best_of=2, language='en', initial_prompt='AIVA voice assistant command.', no_speech_threshold=0.85)
seg_list = list(segments)
print(f"Segments count: {len(seg_list)}")
for s in seg_list:
    print(f"  Segment [{s.start:.2f}s -> {s.end:.2f}s]: '{s.text}' (no_speech_prob: {s.no_speech_prob:.4f})")
text = ' '.join([s.text.strip() for s in seg_list]).strip()
print(f'PHYSICAL CAPTURE TRANSCRIPT: "{text}"')
