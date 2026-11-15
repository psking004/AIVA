import os
import glob
import numpy as np
import soundfile as sf

REFERENCE_DIR = r"C:\Users\bhara\AIVA\apps\desktop\voices\raw_refs"
OUTPUT_VECTOR = r"C:\Users\bhara\AIVA\apps\desktop\voices\aiva_voice_vector.npz"
TARGET_SR = 24000

def preprocess_and_fuse_references():
    wav_files = sorted(glob.glob(os.path.join(REFERENCE_DIR, "*.wav")) + glob.glob(os.path.join(REFERENCE_DIR, "*.mp3")))
    if not wav_files:
        print(f"[Voice Extractor] No raw reference files found in {REFERENCE_DIR}.")
        return False

    segments = []
    for path in wav_files:
        data, sr = sf.read(path, dtype="float32")
        if data.ndim > 1:
            data = np.mean(data, axis=1)
        # Resample if needed
        if sr != TARGET_SR:
            # Linear interpolation resampling
            duration = len(data) / sr
            target_length = int(duration * TARGET_SR)
            data = np.interp(
                np.linspace(0, len(data), target_length, endpoint=False),
                np.arange(len(data)),
                data
            ).astype(np.float32)

        non_silent = np.where(np.abs(data) > 0.01)[0]
        if len(non_silent) > 0:
            data = data[non_silent[0]:non_silent[-1] + 1]
        rms = np.sqrt(np.mean(data ** 2)) + 1e-8
        data = data * (0.1 / rms)
        segments.append(data)

    fused_audio = np.concatenate(segments)
    fused_wav_path = os.path.join(os.path.dirname(OUTPUT_VECTOR), "aiva_fused_reference_24k.wav")
    sf.write(fused_wav_path, fused_audio, TARGET_SR)

    # Compute lightweight acoustic features (Energy & Spectrogram mean)
    fft_size = 1024
    hop_size = 256
    num_frames = 1 + (len(fused_audio) - fft_size) // hop_size
    spectrogram = np.empty((fft_size // 2 + 1, num_frames), dtype=np.float32)
    window = np.hanning(fft_size)

    for i in range(num_frames):
        start = i * hop_size
        frame = fused_audio[start:start + fft_size] * window
        spectrum = np.abs(np.fft.rfft(frame))
        spectrogram[:, i] = spectrum

    style_embedding = np.mean(np.log1p(spectrogram), axis=1)

    np.savez_compressed(
        OUTPUT_VECTOR,
        style_embedding=style_embedding,
        reference_wav=fused_wav_path,
        base_voice="af_bella",
        speed=1.04
    )
    print(f"[Voice Extractor] Saved unified multi-lingual voice vector to {OUTPUT_VECTOR}")
    return True

if __name__ == "__main__":
    preprocess_and_fuse_references()
