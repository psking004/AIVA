import subprocess
import json
import time
import threading
import sys
import wave
import numpy as np
import sounddevice as sd
import urllib.request
import urllib.error

# Function to play audio acoustically via WASAPI Device 12
def play_acoustic_audio(filepath, gain=4.0):
    with wave.open(filepath, 'rb') as wf:
        orig_sr = wf.getframerate()
        raw = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    target_sr = 48000
    num_samples = int(len(raw) * target_sr / orig_sr)
    audio_48k = np.interp(np.linspace(0, len(raw), num_samples), np.arange(len(raw)), raw).astype(np.float32)
    boosted = np.tanh(audio_48k * gain).astype(np.float32)
    stereo_48k = np.column_stack((boosted, boosted))
    sd.play(stereo_48k, samplerate=target_sr, device=12)
    sd.wait()

def test_command(cmd_file, cmd_name):
    print(f"\n=======================================================", flush=True)
    print(f"TESTING COMMAND: {cmd_name} ({cmd_file})", flush=True)
    print(f"=======================================================", flush=True)

    proc = subprocess.Popen(
        ['C:\\Python312\\python.exe', '-u', 'apps/desktop/whisper-service.py'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding='utf-8',
        errors='replace'
    )

    stderr_lines = []
    def stream_stderr():
        for line in proc.stderr:
            clean = line.strip()
            stderr_lines.append(clean)
            print(f"[STDERR] {clean}", flush=True)

    t_err = threading.Thread(target=stream_stderr, daemon=True)
    t_err.start()

    # Wait for ready
    for line in proc.stdout:
        print(f"[STDOUT] {line.strip()}", flush=True)
        try:
            m = json.loads(line)
            if m.get('type') == 'ready':
                break
        except:
            pass

    # Wait 2.5s for noise floor calibration
    time.sleep(2.5)

    # Wake word simulated latency (speech-listener confirmed latency ~280ms)
    wake_latency_ms = 285

    # Send record_and_transcribe
    proc.stdin.write(json.dumps({'command': 'record_and_transcribe'}) + '\n')
    proc.stdin.flush()

    # Wait for stt_recording_started event before playing
    for line in proc.stdout:
        print(f"[STDOUT] {line.strip()}", flush=True)
        try:
            m = json.loads(line)
            if m.get('type') == 'stt_recording_started':
                break
        except:
            pass

    time.sleep(0.15)
    print(f"[ACOUSTIC] Playing '{cmd_file}' through speakers...", flush=True)
    play_acoustic_audio(cmd_file, gain=4.2)
    print(f"[ACOUSTIC] Playback finished.", flush=True)

    # Wait for transcript
    transcript_event = None
    t_start = time.time()
    while time.time() - t_start < 15:
        line = proc.stdout.readline()
        if line:
            print(f"[STDOUT] {line.strip()}", flush=True)
            try:
                m = json.loads(line)
                if m.get('type') in ('transcript', 'no_speech'):
                    transcript_event = m
                    break
            except:
                pass

    proc.terminate()
    proc.wait(timeout=3)
    return transcript_event, stderr_lines

if __name__ == '__main__':
    res, logs = test_command('cmd1.wav', 'What is the capital of India?')
    print("Result:", res)
