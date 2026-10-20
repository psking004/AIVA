import subprocess
import json
import time
import threading
import sys

def stream_stderr(proc):
    for line in proc.stderr:
        print(f"[STDERR] {line.strip()}", flush=True)

def speak(text):
    print(f"[ACOUSTIC PLAYBACK] Speaking: '{text}'...", flush=True)
    ps_cmd = f"Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('{text}')"
    subprocess.run(['powershell', '-NoProfile', '-Command', ps_cmd])

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

    # Small 0.3s delay to ensure recording stream is active
    time.sleep(0.3)

    # Speak acoustic command through the speakers to the physical microphone
    speak("What is the capital of India?")

    # Read events until transcript or timeout
    t_start = time.time()
    result = None
    while time.time() - t_start < 15:
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
