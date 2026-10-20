import subprocess
import json
import time
import threading
import sys

def stream_stderr(proc):
    for line in proc.stderr:
        print(f"[STDERR] {line.strip()}", flush=True)

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
    print("[TEST] Waiting for ready event...", flush=True)
    for line in proc.stdout:
        print(f"[STDOUT] {line.strip()}", flush=True)
        try:
            msg = json.loads(line)
            if msg.get('type') == 'ready':
                break
        except Exception:
            pass

    # Wait 2.5 seconds for idle noise-floor calibration to settle
    print("[TEST] Calibrating idle noise floor for 2.5s...", flush=True)
    time.sleep(2.5)

    # Trigger command recording
    print("[TEST] Sending record_and_transcribe command...", flush=True)
    proc.stdin.write(json.dumps({'command': 'record_and_transcribe'}) + '\n')
    proc.stdin.flush()

    # Read events
    t_start = time.time()
    while time.time() - t_start < 15:
        line = proc.stdout.readline()
        if line:
            print(f"[STDOUT] {line.strip()}", flush=True)
            try:
                msg = json.loads(line)
                if msg.get('type') in ('transcript', 'no_speech'):
                    print("[TEST] Received terminal STT event:", msg.get('type'), flush=True)
                    break
            except Exception:
                pass

    print("[TEST] Shutting down whisper process...", flush=True)
    try:
        proc.stdin.write(json.dumps({'command': 'cancel'}) + '\n')
        proc.stdin.flush()
    except Exception:
        pass
    proc.terminate()
    proc.wait(timeout=5)
    print("[TEST] Test completed successfully.", flush=True)

if __name__ == '__main__':
    main()
