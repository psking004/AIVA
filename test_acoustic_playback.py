import subprocess
import json
import time
import threading
import sys
import wave
import numpy as np
import sounddevice as sd

def stream_stderr(proc):
    for line in proc.stderr:
        print(f"[STDERR] {line.strip()}", flush=True)

def play_audio(filepath):
    with wave.open(filepath, 'rb') as wf:
        orig_sr = wf.getframerate()
        raw = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    target_sr = 48000
    num_samples = int(len(raw) * target_sr / orig_sr)
    audio_48k = np.interp(np.linspace(0, len(raw), num_samples), np.arange(len(raw)), raw).astype(np.float32)
    stereo_48k = np.column_stack((audio_48k * 4.5, audio_48k * 4.5))
    print(f"[ACOUSTIC PLAYBACK] Playing '{filepath}' via WASAPI Device 12 (48kHz stereo, gain 4.5x)...", flush=True)
    sd.play(stereo_48k, samplerate=target_sr, device=12)
    sd.wait()
    print("[ACOUSTIC PLAYBACK] Playback finished.", flush=True)

def main():
    print("[TEST] Spawning whisper-service.py...", flush=True)
    proc = subprocess.Popen(
        ['C:\\Python312\\python.exe', '-u', 'apps/desktop/whisper-service.py'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding='utf-8',
        errors='replace'
    )

    t_err = threading.Thread(target=stream_stderr, args=(proc,), daemon=True)
    t_err.start()

    # Read stdout until ready
    for line in proc.stdout:
        print(f"[STDOUT] {line.strip()}", flush=True)
        try:
            msg = json.loads(line)
            if msg.get('type') == 'ready':
                break
        except Exception:
            pass

    # Calibrate idle noise floor for 2.5s
    print("[TEST] Waiting 2.5s for idle noise calibration...", flush=True)
    time.sleep(2.5)

    # Trigger command recording
    print("[TEST] Triggering record_and_transcribe...", flush=True)
    proc.stdin.write(json.dumps({'command': 'record_and_transcribe'}) + '\n')
    proc.stdin.flush()

    time.sleep(0.3)

    # Play audio acoustically into the physical microphone
    play_audio('cmd1.wav')

    # Read events until transcript or timeout
    t_start = time.time()
    result = None
    while time.time() - t_start < 18:
        line = proc.stdout.readline()
        if line:
            print(f"[STDOUT] {line.strip()}", flush=True)
            try:
                msg = json.loads(line)
                if msg.get('type') in ('transcript', 'no_speech'):
                    result = msg
                    break
            except Exception:
                pass

    print("[TEST] Result:", result, flush=True)
    proc.terminate()
    proc.wait(timeout=3)

if __name__ == '__main__':
    main()
