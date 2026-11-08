"""
AIVA Kokoro Local Text-to-Speech Microservice
Provides completely offline, low-latency, free TTS for PC-A and PC-B.
Hosts Kokoro-82M ONNX model on a local HTTP endpoint (127.0.0.1:5050).
"""

import sys
import os
import io
import time
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
import soundfile as sf

# Resilient Kokoro model path resolution
def resolve_models_dir():
    candidates = [
        r"C:\Users\bhara\AIVA\models\kokoro",
        os.path.join(os.getcwd(), "models", "kokoro"),
    ]
    cur = os.path.abspath(__file__)
    for _ in range(6):
        cur = os.path.dirname(cur)
        candidates.append(os.path.join(cur, "models", "kokoro"))
    if "APPDATA" in os.environ:
        candidates.append(os.path.join(os.environ["APPDATA"], "AIVA", "models", "kokoro"))

    for c in candidates:
        if os.path.exists(os.path.join(c, "kokoro-v0_19.onnx")) and os.path.exists(os.path.join(c, "voices.bin")):
            return c
    return os.path.join(os.getcwd(), "models", "kokoro")

MODELS_DIR = resolve_models_dir()
MODEL_PATH = os.path.join(MODELS_DIR, "kokoro-v0_19.onnx")
VOICES_PATH = os.path.join(MODELS_DIR, "voices.bin")

kokoro_engine = None
aiva_voice_vector = None

def init_engine():
    global kokoro_engine, aiva_voice_vector
    if not os.path.exists(MODEL_PATH) or not os.path.exists(VOICES_PATH):
        sys.stderr.write(f"[KOKORO TTS] Model or voices not found at {MODELS_DIR}\n")
        return False
    try:
        from kokoro_onnx import Kokoro
        import numpy as np
        sys.stderr.write("[KOKORO TTS] Loading Kokoro-82M ONNX model into memory...\n")
        t0 = time.time()
        kokoro_engine = Kokoro(MODEL_PATH, VOICES_PATH)
        if "af_sarah" in kokoro_engine.voices and "bf_emma" in kokoro_engine.voices:
            sarah = kokoro_engine.voices["af_sarah"]
            emma = kokoro_engine.voices["bf_emma"]
            aiva_voice_vector = 0.6 * sarah + 0.4 * emma
            sys.stderr.write("[KOKORO TTS] Blended AIVA voice identity created (60% af_sarah + 40% bf_emma)\n")
        try:
            warm_voice = aiva_voice_vector if aiva_voice_vector is not None else "af_sarah"
            kokoro_engine.create("ready", voice=warm_voice, speed=1.0, lang="en-us")
            sys.stderr.write("[KOKORO TTS] Model and phonemizer pre-warmed.\n")
        except Exception as warm_err:
            sys.stderr.write(f"[KOKORO TTS] Pre-warm notice: {warm_err}\n")
        sys.stderr.write(f"[KOKORO TTS] Model loaded successfully in {round(time.time() - t0, 2)}s\n")
        return True
    except Exception as e:
        sys.stderr.write(f"[KOKORO TTS] Initialization error: {e}\n")
        return False

class KokoroHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        sys.stderr.write(f"[KOKORO TTS] {format % args}\n")

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            status = {
                "status": "ready" if kokoro_engine is not None else "uninitialized",
                "model": "kokoro-v0_19",
                "voices": "voices.bin",
                "provider": "kokoro",
            }
            self.wfile.write(json.dumps(status).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/synthesize":
            t_start = time.time()
            content_length = int(self.headers.get("Content-Length", 0))
            body_bytes = self.rfile.read(content_length)

            try:
                data = json.loads(body_bytes.decode("utf-8"))
            except Exception:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'{"error": "invalid_json"}')
                return

            text = data.get("text", "").strip()
            voice = data.get("voice", "af_heart")  # AIVA preferred female voice: warm, intelligent, articulate
            speed = float(data.get("speed", 1.0))

            if not text:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'{"error": "empty_text"}')
                return

            sys.stderr.write(f"[TTS PERF] request: chars={len(text)}\n")

            if kokoro_engine is None:
                # Try lazy init
                if not init_engine():
                    self.send_response(503)
                    self.end_headers()
                    self.wfile.write(b'{"error": "kokoro_model_unavailable"}')
                    return

            try:
                voice_target = voice
                if str(voice).lower() in ("af_heart", "aiva", "default"):
                    if "af_heart" in kokoro_engine.voices:
                        voice_target = kokoro_engine.voices["af_heart"]
                    elif aiva_voice_vector is not None:
                        voice_target = aiva_voice_vector
                    elif "af_sarah" in kokoro_engine.voices:
                        voice_target = "af_sarah"
                elif str(voice) not in kokoro_engine.voices and aiva_voice_vector is not None:
                    voice_target = aiva_voice_vector

                t_synth_start = time.time()
                sys.stderr.write("[TTS PERF] synthesis-start\n")
                samples, sample_rate = kokoro_engine.create(text, voice=voice_target, speed=speed, lang="en-us")
                t_synth_end = time.time()
                synth_latency_ms = round((t_synth_end - t_synth_start) * 1000)
                sys.stderr.write(f"[TTS PERF] synthesis-complete: {synth_latency_ms}ms\n")

                wav_buffer = io.BytesIO()
                sf.write(wav_buffer, samples, sample_rate, format="WAV", subtype="PCM_16")
                wav_bytes = wav_buffer.getvalue()
                total_latency_ms = round((time.time() - t_start) * 1000)

                sys.stderr.write(f"[KOKORO TTS SUCCESS] {len(text)} chars -> {len(wav_bytes)} bytes in {total_latency_ms}ms (voice={voice})\n")

                self.send_response(200)
                self.send_header("Content-Type", "audio/wav")
                self.send_header("Content-Length", str(len(wav_bytes)))
                self.send_header("X-Latency-Ms", str(total_latency_ms))
                self.send_header("X-Synth-Latency-Ms", str(synth_latency_ms))
                self.end_headers()
                self.wfile.write(wav_bytes)

            except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
                sys.stderr.write("[KOKORO TTS] Client disconnected before audio transmission completed.\n")
            except Exception as e:
                sys.stderr.write(f"[KOKORO TTS Error] {e}\n")
                try:
                    self.send_response(500)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
                except Exception:
                    pass
        else:
            self.send_response(404)
            self.end_headers()

def run_server(port=5050):
    init_engine()
    server = HTTPServer(("127.0.0.1", port), KokoroHandler)
    sys.stderr.write(f"[KOKORO TTS] Daemon listening on http://127.0.0.1:{port}\n")
    print(f"[KOKORO TTS] Kokoro TTS Daemon running on http://127.0.0.1:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.stderr.write("[KOKORO TTS] Server stopped.\n")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Kokoro TTS Microservice")
    parser.add_argument("--port", type=int, default=5050, help="Port to listen on")
    parser.add_argument("--voice", type=str, default="af_heart", help="Default voice")
    parser.add_argument("positional_port", nargs="?", type=int, default=None, help="Optional positional port")
    args = parser.parse_args()
    port = args.positional_port if args.positional_port is not None else args.port
    run_server(port)
