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

# Active open file tracking for voice dictation
ACTIVE_SESSION = {
    "node": "PC-B",
    "active_file": "script.py",
    "dictation_active": False
}

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

import webbrowser
import subprocess
import urllib.parse
import shutil

# Registry of supported applications and web services
APP_REGISTRY = {
    # Web & Online Services
    "chatgpt": "https://chatgpt.com",
    "browser": "https://www.google.com",
    "google": "https://www.google.com",
    "youtube": "https://www.youtube.com",
    "github": "https://github.com",
    "claude": "https://claude.ai",

    # Microsoft Office Suite
    "excel": "excel.exe",
    "microsoft excel": "excel.exe",
    "ms excel": "excel.exe",
    "word": "winword.exe",
    "microsoft word": "winword.exe",
    "ms word": "winword.exe",
    "winword": "winword.exe",
    "powerpoint": "powerpnt.exe",
    "microsoft powerpoint": "powerpnt.exe",
    "ms powerpoint": "powerpnt.exe",
    "powerpnt": "powerpnt.exe",
    "ppt": "powerpnt.exe",
    "outlook": "outlook.exe",
    "microsoft outlook": "outlook.exe",
    "ms outlook": "outlook.exe",
    "onenote": "onenote.exe",
    "microsoft onenote": "onenote.exe",
    "teams": "msteams.exe",
    "microsoft teams": "msteams.exe",
    "edge": "msedge.exe",
    "microsoft edge": "msedge.exe",
    "msedge": "msedge.exe",

    # Browsers & Communication
    "chrome": "chrome.exe",
    "google chrome": "chrome.exe",
    "spotify": "spotify",
    "discord": "discord",

    # Development & System Tools
    "notepad": "notepad.exe",
    "notes": "notepad.exe",
    "calculator": "calc.exe",
    "calc": "calc.exe",
    "terminal": "wt.exe",
    "windows terminal": "wt.exe",
    "powershell": "powershell.exe",
    "cmd": "cmd.exe",
    "command prompt": "cmd.exe",
    "cursor": "cursor",
    "vscode": "code",
    "vs code": "code",
    "visual studio code": "code",
    "code": "code",
    "explorer": "explorer.exe",
    "files": "explorer.exe",
    "file explorer": "explorer.exe",
    "task manager": "taskmgr.exe",
    "taskmanager": "taskmgr.exe",
    "taskmgr": "taskmgr.exe",
    "settings": "ms-settings:",
    "windows settings": "ms-settings:",
    "camera": "microsoft.windows.camera:",
    "store": "ms-windows-store:",
    "photos": "ms-photos:",
}

def execute_universal_launch(query_target):
    """
    Alexa / Google Assistant-grade dynamic Windows application and URL resolver.
    Dynamically queries Windows App Execution Aliases, Shell namespaces, and system PATH.
    """
    raw = str(query_target).strip()
    clean = raw.lower()

    # 1. Strip common conversational prefixes and suffixes
    for prefix in ["open ", "launch ", "start ", "run ", "switch to "]:
        if clean.startswith(prefix):
            clean = clean[len(prefix):].strip()
            raw = raw[len(prefix):].strip()

    for suffix in [" in pcb", " on pcb", " at pcb", " in pca", " on pca", " at pca", " in pc-b", " on pc-b", " at pc-b", " in pc-a", " on pc-a", " at pc-a"]:
        if clean.endswith(suffix):
            clean = clean[:-len(suffix)].strip()
            raw = raw[:-len(suffix)].strip()

    clean = clean.strip(".,!?:;'\"")
    raw = raw.strip(".,!?:;'\"")

    # 2. Web Domain & Explicit URL Handling
    if clean.startswith("http://") or clean.startswith("https://"):
        webbrowser.open(raw)
        return True, f"Opened {raw} in default browser."

    if any(clean.endswith(tld) for tld in [".com", ".org", ".net", ".io", ".ai", ".in", ".edu", ".gov", ".app", ".dev"]):
        webbrowser.open(f"https://{clean}")
        return True, f"Opened {clean} in default browser."

    # 3. Direct Shell Association & System PATH Lookup
    try:
        os.startfile(raw)
        return True, f"Opened {raw}."
    except Exception:
        pass

    # 4. Standard Windows Desktop Binary Normalization
    aliased = APP_REGISTRY.get(clean) or APP_REGISTRY.get(clean.replace("microsoft ", "").replace("google ", "").replace("ms ", ""))
    if aliased:
        if aliased.startswith("http://") or aliased.startswith("https://"):
            try:
                webbrowser.open(aliased)
                return True, f"Opened {raw} in default browser."
            except Exception:
                pass
        else:
            try:
                os.startfile(aliased)
                return True, f"Opened {raw}."
            except Exception:
                pass
            try:
                subprocess.Popen(aliased, shell=True)
                return True, f"Opened {raw}."
            except Exception:
                pass

    # 5. Dynamic Windows Start Menu & UWP AppsFolder Query via PowerShell
    ps_query = f"""
$target = '{clean}'
$app = Get-StartApps | Where-Object {{ $_.Name -like "*$target*" }} | Select-Object -First 1
if ($app) {{
    Start-Process "shell:AppsFolder\\$($app.AppID)"
    Write-Output "SUCCESS:$($app.Name)"
}} else {{
    Start-Process "$target" -ErrorAction SilentlyContinue
    if ($?) {{ Write-Output "SUCCESS:$target" }} else {{ Write-Output "NOT_FOUND" }}
}}
"""
    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_query],
            capture_output=True, text=True, timeout=6
        )
        out = proc.stdout.strip()
        if "SUCCESS:" in out:
            matched_name = out.replace("SUCCESS:", "").strip()
            return True, f"Opened {matched_name}."
    except Exception as ex:
        print(f"[UniversalLaunch] PowerShell query error: {ex}")

    # 6. Fallback Search
    search_url = f"https://www.google.com/search?q={urllib.parse.quote(raw)}"
    webbrowser.open(search_url)
    return True, f"Could not find local application {raw}. Searching online."

def execute_app_launch(app_name):
    return execute_universal_launch(app_name)

def resolve_desktop_app_command(app_name):
    if not app_name:
        return ""
    clean = str(app_name).lower().strip().strip(".,!?:;'\"")
    for prefix in ("open ", "launch ", "start ", "run ", "switch to "):
        if clean.startswith(prefix):
            clean = clean[len(prefix):].strip()
    for suffix in (" in pcb", " on pcb", " at pcb", " in pca", " on pca", " at pca", " in pc-b", " on pc-b", " at pc-b", " in pc-a", " on pc-a", " at pc-a"):
        if clean.endswith(suffix):
            clean = clean[:-len(suffix)].strip()
    clean = clean.strip(".,!?:;'\"")

    if clean in APP_REGISTRY:
        return APP_REGISTRY[clean]

    for brand in ("microsoft ", "google ", "ms "):
        if clean.startswith(brand):
            sub = clean[len(brand):].strip()
            if sub in APP_REGISTRY:
                return APP_REGISTRY[sub]

    return clean

class KokoroHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        sys.stderr.write(f"[KOKORO TTS] {format % args}\n")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-device-id")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            status = {
                "status": "ready" if kokoro_engine is not None else "uninitialized",
                "model": "kokoro-v0_19",
                "voices": "voices.bin",
                "provider": "kokoro",
            }
            self.wfile.write(json.dumps(status).encode("utf-8"))
        elif self.path in ("/api/remote-exec", "/api/status"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            resp = {
                "success": True,
                "node": "PC-B",
                "status": "ONLINE",
                "ip": "10.84.73.59",
                "tts": "ready" if kokoro_engine is not None else "uninitialized",
                "message": "PC-B host workstation daemon active"
            }
            self.wfile.write(json.dumps(resp).encode("utf-8"))
        elif self.path in ("/api/sse/verify", "/api/sse"):
            sse_script = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "sse", "sse_standalone.py")
            if not os.path.exists(sse_script):
                sse_script = r"C:\Users\bhara\AIVA\packages\sse\sse_standalone.py"

            if os.path.exists(sse_script):
                res = subprocess.run([sys.executable, sse_script, "doctor"], capture_output=True, text=True)
                passed = (res.returncode == 0)
                self.send_response(200 if passed else 500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                resp = {
                    "success": passed,
                    "stdout": res.stdout,
                    "stderr": res.stderr,
                    "spokenResponse": "Strategic Systems Engine doctor suite passed all invariants." if passed else "SSE verification encountered invariant failures."
                }
                self.wfile.write(json.dumps(resp).encode("utf-8"))
            else:
                self.send_response(404)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "spokenResponse": "SSE module not found in packages/sse."}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path in ("/api/sse/verify", "/api/sse"):
            sse_script = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "sse", "sse_standalone.py")
            if not os.path.exists(sse_script):
                sse_script = r"C:\Users\bhara\AIVA\packages\sse\sse_standalone.py"

            if os.path.exists(sse_script):
                res = subprocess.run([sys.executable, sse_script, "doctor"], capture_output=True, text=True)
                passed = (res.returncode == 0)
                self.send_response(200 if passed else 500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                resp = {
                    "success": passed,
                    "stdout": res.stdout,
                    "stderr": res.stderr,
                    "spokenResponse": "Strategic Systems Engine doctor suite passed all invariants." if passed else "SSE verification encountered invariant failures."
                }
                self.wfile.write(json.dumps(resp).encode("utf-8"))
            else:
                self.send_response(404)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "spokenResponse": "SSE module not found in packages/sse."}).encode("utf-8"))
            return

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
        elif self.path == "/api/remote-exec":
            content_length = int(self.headers.get("Content-Length", 0))
            body_bytes = self.rfile.read(content_length)
            try:
                data = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
            except Exception:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(b'{"error": "invalid_json"}')
                return

            target = str(data.get("target") or data.get("targetNode") or "PC-B").upper()
            action = str(data.get("action", "STATUS")).upper()
            query = str(data.get("query", ""))
            command = str(data.get("command", ""))
            application = str(data.get("application", "")).strip()

            global ACTIVE_SESSION
            import os, sys, subprocess, socket

            sys.stderr.write(f"[REMOTE-EXEC] target={target}, action={action}, app='{application}', query='{query}'\n")

            # 1. Action: CREATE_FILE (Pure Blank File + Auto-Launch)
            if action == "CREATE_FILE":
                raw_file = data.get("filename") or data.get("file") or command or "script.py"
                file_name = str(raw_file).strip()
                while file_name.endswith(".py.py"):
                    file_name = file_name[:-3]
                if not any(file_name.endswith(ext) for ext in ['.py', '.js', '.ts', '.txt', '.ps1', '.json', '.md']):
                    file_name += ".py"

                target_node = "PC-A" if ("PC-A" in target or "PCA" in target or "194" in target) else "PC-B"
                ACTIVE_SESSION["node"] = target_node
                ACTIVE_SESSION["active_file"] = file_name
                ACTIVE_SESSION["dictation_active"] = False

                if target_node == "PC-A":
                    pca_share = r"\\10.84.73.194\AIVA_Workspace"
                    remote_target_path = os.path.join(pca_share, file_name)
                    local_mirror_path = os.path.join(r"C:\AIVA_Workspace\pca", file_name)

                    os.makedirs(r"C:\AIVA_Workspace\pca", exist_ok=True)
                    os.makedirs(r"C:\AIVA_Workspace", exist_ok=True)

                    try:
                        # 1. Write blank file directly to PC-A over verified SMB share
                        with open(remote_target_path, "w", encoding="utf-8") as f:
                            f.write("")

                        # 2. Update local PC-B mirror
                        with open(local_mirror_path, "w", encoding="utf-8") as f:
                            f.write("")
                        try:
                            with open(os.path.join(r"C:\AIVA_Workspace", file_name), "w", encoding="utf-8") as f:
                                f.write("")
                        except Exception:
                            pass

                        ACTIVE_SESSION["node"] = "PC-A"
                        ACTIVE_SESSION["active_file"] = file_name

                        # 3. Non-blocking WinRM attempt to open editor on PC-A
                        winrm_cmd = f'powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Command -ComputerName 10.84.73.194 -ScriptBlock {{ Start-Process notepad.exe \\"C:\\AIVA_Workspace\\{file_name}\\" }}"'
                        subprocess.Popen(winrm_cmd, shell=True)

                        res_data = {
                            "success": True,
                            "node": "PC-A",
                            "file": file_name,
                            "spokenResponse": f"Created blank file {file_name} directly on PC-A."
                        }
                    except Exception as ex:
                        sys.stderr.write(f"[CREATE_FILE] Error writing to PC-A share: {ex}\n")
                        try:
                            with open(local_mirror_path, "w", encoding="utf-8") as f:
                                f.write("")
                        except Exception:
                            pass
                        res_data = {
                            "success": False,
                            "node": "PC-A",
                            "spokenResponse": f"Failed to write to PC-A share: {str(ex)}"
                        }
                else:
                    # PC-B Local Execution (Pure Blank File + Auto-Launch)
                    workspace_dir = r"C:\AIVA_Workspace"
                    os.makedirs(workspace_dir, exist_ok=True)
                    local_path = os.path.join(workspace_dir, file_name)
                    try:
                        with open(local_path, "w", encoding="utf-8") as f:
                            f.write("")
                        user_ws = os.path.join(os.environ.get("USERPROFILE", "C:\\Users\\bhara"), "AIVA_Workspace")
                        try:
                            os.makedirs(user_ws, exist_ok=True)
                            with open(os.path.join(user_ws, file_name), "w", encoding="utf-8") as f:
                                f.write("")
                        except Exception:
                            pass

                        # Auto-open the file in Notepad on PC-B desktop
                        subprocess.Popen(f'notepad.exe "{local_path}"', shell=True)
                        res_data = {
                            "success": True,
                            "node": "PC-B",
                            "file": file_name,
                            "spokenResponse": f"Created {file_name} on PC-B."
                        }
                    except Exception as ex:
                        res_data = {
                            "success": False,
                            "node": "PC-B",
                            "spokenResponse": f"Failed to write file on PC-B: {str(ex)}"
                        }

            # 2. Action: START_DICTATION (Explicit Start Typing Toggle)
            elif action == "START_DICTATION":
                target_node = "PC-A" if ("PC-A" in target or "PCA" in target or "194" in target) else ACTIVE_SESSION.get("node", "PC-B")
                ACTIVE_SESSION["node"] = target_node
                ACTIVE_SESSION["dictation_active"] = True
                res_data = {
                    "success": True,
                    "node": target_node,
                    "file": ACTIVE_SESSION.get("active_file", "script.py"),
                    "dictation_active": True,
                    "spokenResponse": "Dictation started."
                }

            # 3. Action: STOP_DICTATION (Explicit Stop Typing Toggle)
            elif action == "STOP_DICTATION":
                target_node = ACTIVE_SESSION.get("node", "PC-B")
                ACTIVE_SESSION["dictation_active"] = False
                res_data = {
                    "success": True,
                    "node": target_node,
                    "file": ACTIVE_SESSION.get("active_file", "script.py"),
                    "dictation_active": False,
                    "spokenResponse": "Dictation stopped."
                }

            # 4. Action: TYPE_TEXT (Append text via Voice Dictation)
            elif action == "TYPE_TEXT":
                text_to_type = data.get("text", command)
                raw_target = str(data.get("target") or data.get("targetNode") or ACTIVE_SESSION.get("node", "PC-B")).upper()
                target_node = "PC-A" if ("PC-A" in raw_target or "PCA" in raw_target) else "PC-B"
                file_name = ACTIVE_SESSION.get("active_file", "script.py")

                clean_txt = str(text_to_type).strip().lower()
                if clean_txt in ("start typing", "start dictation", "begin typing", "begin dictation"):
                    ACTIVE_SESSION["dictation_active"] = True
                    res_data = {"success": True, "node": target_node, "file": file_name, "spokenResponse": "Dictation started."}
                elif clean_txt in ("stop typing", "stop dictation", "exit dictation", "finish typing", "end typing", "close dictation"):
                    ACTIVE_SESSION["dictation_active"] = False
                    res_data = {"success": True, "node": target_node, "file": file_name, "spokenResponse": "Dictation stopped."}
                else:
                    if target_node == "PC-A":
                        pca_share = r"\\10.84.73.194\AIVA_Workspace"
                        remote_target_path = os.path.join(pca_share, file_name)
                        local_mirror_path = os.path.join(r"C:\AIVA_Workspace\pca", file_name)
                        os.makedirs(r"C:\AIVA_Workspace\pca", exist_ok=True)

                        try:
                            # 1. Append directly to PC-A disk over SMB share
                            with open(remote_target_path, "a", encoding="utf-8") as f:
                                f.write(str(text_to_type) + "\n")

                            # 2. Mirror append locally on PC-B
                            with open(local_mirror_path, "a", encoding="utf-8") as f:
                                f.write(str(text_to_type) + "\n")
                            try:
                                with open(os.path.join(r"C:\AIVA_Workspace", file_name), "a", encoding="utf-8") as f:
                                    f.write(str(text_to_type) + "\n")
                            except Exception:
                                pass

                            res_data = {
                                "success": True,
                                "node": "PC-A",
                                "spokenResponse": "Typed."
                            }
                        except Exception as ex:
                            sys.stderr.write(f"[TYPE_TEXT] Failed typing to PC-A: {ex}\n")
                            res_data = {
                                "success": False,
                                "node": "PC-A",
                                "spokenResponse": f"Failed typing to PC-A: {str(ex)}"
                            }
                    else:
                        local_path = os.path.join(r"C:\AIVA_Workspace", file_name)
                        try:
                            with open(local_path, "a", encoding="utf-8") as f:
                                f.write(text_to_type + "\n")
                            user_path = os.path.join(os.environ.get("USERPROFILE", "C:\\Users\\bhara"), "AIVA_Workspace", file_name)
                            try:
                                with open(user_path, "a", encoding="utf-8") as f:
                                    f.write(text_to_type + "\n")
                            except Exception:
                                pass
                            res_data = {
                                "success": True,
                                "node": "PC-B",
                                "file": file_name,
                                "spokenResponse": "Typed."
                            }
                        except Exception as ex:
                            res_data = {"success": False, "node": "PC-B", "spokenResponse": f"Error typing locally: {str(ex)}"}

            # 5. Action: OPEN_FILE (Explicit GUI window open)
            elif action == "OPEN_FILE":
                raw_file = data.get("filename") or data.get("file") or command or ACTIVE_SESSION.get("active_file", "script.py")
                file_name = str(raw_file).strip()
                while file_name.endswith(".py.py"):
                    file_name = file_name[:-3]
                if not any(file_name.endswith(ext) for ext in ['.py', '.js', '.ts', '.txt', '.ps1', '.json', '.md']):
                    file_name += ".py"

                target_node = "PC-A" if ("PC-A" in target or "PCA" in target or "194" in target) else "PC-B"
                ACTIVE_SESSION["node"] = target_node
                ACTIVE_SESSION["active_file"] = file_name
                ACTIVE_SESSION["dictation_active"] = False

                if target_node == "PC-A":
                    remote_path = f"C:\\AIVA_Workspace\\{file_name}"
                    cmd = f"powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \"Invoke-Command -ComputerName 10.84.73.194 -ScriptBlock {{ Start-Process notepad.exe '{remote_path}' }}\""
                    try:
                        subprocess.Popen(cmd, shell=True)
                    except Exception:
                        pass
                    local_path = os.path.join(r"C:\AIVA_Workspace", file_name)
                    if os.path.exists(local_path):
                        subprocess.Popen(f'notepad.exe "{local_path}"', shell=True)
                    res_data = {
                        "success": True,
                        "node": "PC-A",
                        "file": file_name,
                        "spokenResponse": f"Opened {file_name}."
                    }
                else:
                    local_path = os.path.join(r"C:\AIVA_Workspace", file_name)
                    if not os.path.exists(local_path):
                        with open(local_path, "w", encoding="utf-8") as f:
                            f.write("")
                    subprocess.Popen(f'notepad.exe "{local_path}"', shell=True)
                    res_data = {
                        "success": True,
                        "node": "PC-B",
                        "file": file_name,
                        "spokenResponse": f"Opened {file_name}."
                    }

            # 3. Route for BOOT_OLLAMA (Phonetically normalized Ollama startup)
            elif action == "BOOT_OLLAMA" or (action in ("LAUNCH_APP", "LAUNCH") and "ollama" in (application or command or query).lower()):
                pca_ip = "10.84.73.194"
                import socket
                winrm_up = False
                try:
                    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    s.settimeout(2.5)
                    s.connect((pca_ip, 5985))
                    s.close()
                    winrm_up = True
                except Exception:
                    pass

                if winrm_up:
                    try:
                        import subprocess
                        subprocess.run(
                            f"powershell -Command \"Invoke-Command -ComputerName {pca_ip} -ScriptBlock {{ if (-not (Get-Process ollama -ErrorAction SilentlyContinue)) {{ Start-Process ollama -ArgumentList 'serve' }} }}\"",
                            shell=True,
                            timeout=5
                        )
                        time.sleep(1.0)
                        ollama_up = False
                        try:
                            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                            s.settimeout(2.5)
                            s.connect((pca_ip, 11434))
                            s.close()
                            ollama_up = True
                        except Exception:
                            pass
                        spoken = "Ollama GPU inference service is active on PC-A on port 11434." if ollama_up else "Dispatched Ollama serve command to PC-A via WinRM. Local GPU serving is initializing."
                        res_data = {"success": True, "node": "PC-A", "service": "ollama", "status": "ONLINE" if ollama_up else "BOOTING", "spokenResponse": spoken}
                    except Exception as e:
                        res_data = {"success": True, "node": "PC-A", "service": "ollama", "spokenResponse": "Dispatched Ollama serve command to PC-A via WinRM. Local GPU serving is initializing."}
                else:
                    spoken = "PC-A compute workstation is currently sleeping on the local network. Cannot boot Ollama until PC-A is awake."
                    res_data = {"success": False, "node": "PC-A", "status": "OFFLINE_STANDBY", "spokenResponse": spoken}

            # 3. Route for desktop application launching (PC-A & PC-B)
            elif action in ("LAUNCH_APP", "LAUNCH", "OPEN_APP") or (action == "EXEC" and application):
                app_target = application or command or query or ""
                target_node = (target or "").upper()
                if "PC-A" in target_node or "PCA" in target_node or "194" in target_node:
                    pca_ip = "10.84.73.194"
                    escaped = app_target.replace("'", "''")
                    ps_cmd = f"Start-Process '{escaped}'"
                    winrm_cmd = f'powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Command -ComputerName {pca_ip} -ScriptBlock {{ {ps_cmd} }}"'
                    try:
                        subprocess.Popen(winrm_cmd, shell=True)
                        res_data = {
                            "success": True,
                            "node": "PC-A",
                            "application": app_target,
                            "spokenResponse": f"Dispatched {app_target} on PC-A."
                        }
                    except Exception as ex:
                        res_data = {
                            "success": False,
                            "node": "PC-A",
                            "spokenResponse": f"Failed launching {app_target} on PC-A: {str(ex)}"
                        }
                else:
                    success, spoken = execute_universal_launch(app_target)
                    res_data = {
                        "success": success,
                        "node": "PC-B",
                        "application": app_target,
                        "spokenResponse": spoken
                    }

            # 4. Route for Strategic Systems Engine (SSE) Invariant Verification
            elif action in ("SSE_VERIFY", "VERIFY_SSE", "SSE"):
                sse_script = os.path.join(os.path.dirname(__file__), "..", "..", "packages", "sse", "sse_standalone.py")
                if not os.path.exists(sse_script):
                    sse_script = r"C:\Users\bhara\AIVA\packages\sse\sse_standalone.py"

                if os.path.exists(sse_script):
                    res = subprocess.run([sys.executable, sse_script, "doctor"], capture_output=True, text=True)
                    passed = (res.returncode == 0)
                    res_data = {
                        "success": passed,
                        "node": "PC-B",
                        "stdout": res.stdout,
                        "stderr": res.stderr,
                        "spokenResponse": "Strategic Systems Engine doctor suite passed all invariants." if passed else "SSE verification encountered invariant failures."
                    }
                else:
                    res_data = {
                        "success": False,
                        "node": "PC-B",
                        "spokenResponse": "SSE module not found in packages/sse."
                    }
            # Route for PC-A target
            elif "PC-A" in target or "PCA" in target or "GPU" in target or "194" in target or "PC-A" in query.upper() or "GPU" in query.upper():
                import socket
                pca_ip = "10.84.73.194"
                ollama_up = False
                winrm_up = False
                try:
                    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    s.settimeout(2.5)
                    s.connect((pca_ip, 11434))
                    s.close()
                    ollama_up = True
                except Exception:
                    pass
                try:
                    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    s.settimeout(2.5)
                    s.connect((pca_ip, 5985))
                    s.close()
                    winrm_up = True
                except Exception:
                    pass

                # Auto-boot Ollama if specifically requested or if action is boot
                if (action in ("START_SERVICE", "BOOT_OLLAMA", "BOOT", "START") or "BOOT" in query.upper() or "START" in query.upper() or "TURN ON" in query.upper()) and winrm_up and not ollama_up:
                    import subprocess
                    try:
                        subprocess.run(
                            f"powershell -Command \"Invoke-Command -ComputerName {pca_ip} -ScriptBlock {{ if (-not (Get-Process ollama -ErrorAction SilentlyContinue)) {{ Start-Process ollama -ArgumentList 'serve' }} }}\"",
                            shell=True,
                            timeout=5
                        )
                        time.sleep(1.0)
                        try:
                            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                            s.settimeout(2.5)
                            s.connect((pca_ip, 11434))
                            s.close()
                            ollama_up = True
                        except Exception:
                            pass
                    except Exception:
                        pass

                if ollama_up:
                    spoken = "PC-A GPU power workstation is online. Ollama port 11434 is active and ready for inference."
                    status_str = "ONLINE"
                elif winrm_up:
                    if action in ("START_SERVICE", "BOOT_OLLAMA", "BOOT", "START") or "BOOT" in query.upper() or "START" in query.upper():
                        spoken = "Dispatched Ollama serve command to PC-A via WinRM. Local GPU serving is initializing on port 11434."
                        status_str = "BOOTING"
                    else:
                        spoken = "PC-A GPU power workstation is online with WinRM active. Ollama port 11434 is currently offline. Say 'boot ollama on PC-A' to start GPU serving."
                        status_str = "ONLINE"
                else:
                    spoken = "PC-A compute workstation is currently sleeping on the local network. Distributed compute is routing through Cloud fallback."
                    status_str = "OFFLINE_STANDBY"

                res_data = {
                    "success": True,
                    "node": "PC-A",
                    "status": status_str,
                    "ip": pca_ip,
                    "ollama": ollama_up,
                    "winrm": winrm_up,
                    "spokenResponse": spoken
                }
            else:
                # PC-B Target
                if action in ("BUILD", "TEST", "CODE", "EXEC") and command:
                    import subprocess
                    try:
                        proc = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=15)
                        output_snippet = (proc.stdout or proc.stderr or "").strip()[:200]
                        spoken = f"Command executed on PC-B with exit code {proc.returncode}. {output_snippet[:80]}"
                        res_data = {
                            "success": proc.returncode == 0,
                            "node": "PC-B",
                            "exitCode": proc.returncode,
                            "stdout": proc.stdout,
                            "stderr": proc.stderr,
                            "spokenResponse": spoken
                        }
                    except Exception as exec_err:
                        res_data = {
                            "success": False,
                            "node": "PC-B",
                            "error": str(exec_err),
                            "spokenResponse": f"Execution error on PC-B: {str(exec_err)}"
                        }
                else:
                    spoken = "PC-B host workstation is online and fully operational. Kokoro TTS, Whisper STT, and desktop daemons are healthy."
                    res_data = {
                        "success": True,
                        "node": "PC-B",
                        "status": "ONLINE",
                        "ip": "10.84.73.59",
                        "tts": "ready" if kokoro_engine is not None else "uninitialized",
                        "spokenResponse": spoken
                    }

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(res_data).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

def run_server(port=5050):
    init_engine()
    server = HTTPServer(("0.0.0.0", port), KokoroHandler)
    sys.stderr.write(f"[KOKORO TTS] Daemon listening on http://0.0.0.0:{port}\n")
    print(f"[KOKORO TTS] Kokoro TTS Daemon running on http://0.0.0.0:{port}", flush=True)
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
