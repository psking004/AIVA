from faster_whisper import WhisperModel
import wave, numpy as np

for i in range(1, 7):
    fn = f"cmd{i}.wav"
    with wave.open(fn, 'rb') as wf:
        raw = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
        sr = wf.getframerate()
    print(f"\n--- {fn} (sr={sr}, dur={len(raw)/sr:.2f}s) ---")
    model = WhisperModel('base.en', device='cpu', compute_type='int8')
    segments, info = model.transcribe(raw, language='en')
    t = " ".join([s.text.strip() for s in segments])
    print(f"Transcript: '{t}'")
