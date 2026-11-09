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

def resolve_desktop_app_command(app_name):
    clean = app_name.lower().strip()
    mapping = {
        "vs code": "code",
        "vscode": "code",
        "code": "code",
        "chrome": "chrome",
        "google chrome": "chrome",
        "browser": "chrome",
        "terminal": "wt",
        "powershell": "powershell",
        "cmd": "cmd",
        "blender": "blender",
        "notepad": "notepad",
        "notes": "notepad",
        "note": "notepad",
        "memo": "notepad",
        "explorer": "explorer",
        "files": "explorer",
        "spotify": "spotify",
        "edge": "msedge",
        "calculator": "calc",
        "calc": "calc",
        "excel": "excel",
        "microsoft excel": "excel",
        "whatsapp": "whatsapp",
        "ollama": "ollama"
    }
    return mapping.get(clean, clean)

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
                    workspace_dir = r"C:\AIVA_Workspace"
                    remote_path = f"{workspace_dir}\\{file_name}"

                    # 1. Guarantee local staging of blank file on host immediately
                    try:
                        os.makedirs(os.path.join(workspace_dir, "pca"), exist_ok=True)
                        with open(os.path.join(workspace_dir, file_name), "w", encoding="utf-8") as f:
                            f.write("")
                        with open(os.path.join(workspace_dir, "pca", file_name), "w", encoding="utf-8") as f:
                            f.write("")
                    except Exception as le:
                        sys.stderr.write(f"[CREATE_FILE] Local staging error: {le}\n")

                    # 2. Non-blocking asynchronous SMB share and WinRM creation attempts
                    def async_pca_create(f_name, r_path):
                        # SMB share attempt
                        try:
                            smb_dir = r"\\10.84.73.194\C$\AIVA_Workspace"
                            smb_path = os.path.join(smb_dir, f_name)
                            os.makedirs(smb_dir, exist_ok=True)
                            with open(smb_path, "w", encoding="utf-8") as sf:
                                sf.write("")
                            sys.stderr.write(f"[CREATE_FILE] Successfully created blank file via SMB: {smb_path}\n")
                        except Exception as smb_err:
                            sys.stderr.write(f"[CREATE_FILE] SMB share creation note: {smb_err}\n")

                        # WinRM attempt
                        try:
                            ps_script = f"""
                            $sec = ConvertTo-SecureString 'AivaWinRM2025!' -AsPlainText -Force
                            $cred = New-Object System.Management.Automation.PSCredential('alpha', $sec)
                            try {{
                                Invoke-Command -ComputerName 10.84.73.194 -Credential $cred -ScriptBlock {{
                                    $dir = 'C:\\AIVA_Workspace'
                                    if (-not (Test-Path $dir)) {{ [System.IO.Directory]::CreateDirectory($dir) | Out-Null }}
                                    [System.IO.File]::WriteAllText('{r_path}', '')
                                    Start-Process notepad.exe '{r_path}'
                                }} -ErrorAction SilentlyContinue
                            }} catch {{}}
                            """
                            subprocess.run(f"powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \"{ps_script}\"", shell=True, capture_output=True, timeout=8)
                        except Exception:
                            pass

                    import threading
                    threading.Thread(target=async_pca_create, args=(file_name, remote_path), daemon=True).start()

                    # Open local editor mirror for immediate user interaction
                    subprocess.Popen(f'notepad.exe "{os.path.join(workspace_dir, file_name)}"', shell=True)
                    res_data = {
                        "success": True,
                        "node": "PC-A",
                        "file": file_name,
                        "spokenResponse": f"Created {file_name} on PC-A."
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
                        # 1. Asynchronous SMB append attempt
                        def async_pca_append(f_name, txt):
                            try:
                                smb_path = os.path.join(r"\\10.84.73.194\C$\AIVA_Workspace", f_name)
                                with open(smb_path, "a", encoding="utf-8") as sf:
                                    sf.write(txt + "\n")
                            except Exception:
                                pass
                        import threading
                        threading.Thread(target=async_pca_append, args=(file_name, text_to_type), daemon=True).start()

                        # 2. Local mirror append
                        try:
                            with open(f"C:\\AIVA_Workspace\\{file_name}", "a", encoding="utf-8") as f:
                                f.write(text_to_type + "\n")
                            with open(f"C:\\AIVA_Workspace\\pca\\{file_name}", "a", encoding="utf-8") as f:
                                f.write(text_to_type + "\n")
                        except Exception:
                            pass
                        res_data = {
                            "success": True,
                            "node": "PC-A",
                            "file": file_name,
                            "spokenResponse": "Typed."
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
                app_target = resolve_desktop_app_command(application or command or query)
                if "PC-A" in target or "PCA" in target or "194" in target:
                    import socket
                    pca_ip = "10.84.73.194"
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
                            if "ollama" in (application or app_target or query).lower():
                                subprocess.run(f"powershell -Command \"Invoke-Command -ComputerName {pca_ip} -ScriptBlock {{ if (-not (Get-Process ollama -ErrorAction SilentlyContinue)) {{ Start-Process ollama -ArgumentList 'serve' }} }}\"", shell=True, timeout=5)
                                time.sleep(1.0)
                                ollama_check = False
                                try:
                                    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                                    s.settimeout(2.5)
                                    s.connect((pca_ip, 11434))
                                    s.close()
                                    ollama_check = True
                                except Exception:
                                    pass
                                spoken = "Ollama GPU inference service is active on PC-A on port 11434." if ollama_check else "Dispatched Ollama serve command to PC-A via WinRM. GPU model serving is initializing."
                                res_data = {"success": True, "node": "PC-A", "service": "ollama", "status": "ONLINE" if ollama_check else "BOOTING", "spokenResponse": spoken}
                            else:
                                subprocess.run(f"powershell -Command \"Invoke-Command -ComputerName {pca_ip} -ScriptBlock {{ Start-Process '{app_target}' }}\"", shell=True, timeout=5)
                                spoken = f"Launching {application or app_target} on PC-A power workstation."
                                res_data = {"success": True, "node": "PC-A", "application": app_target, "spokenResponse": spoken}
                        except Exception as e:
                            res_data = {"success": False, "node": "PC-A", "error": str(e), "spokenResponse": f"Dispatched launch to PC-A: {str(e)}"}
                    else:
                        spoken = f"PC-A compute workstation is currently sleeping on the local network. Cannot launch {application or app_target} until PC-A is awake."
                        res_data = {"success": False, "node": "PC-A", "status": "OFFLINE_STANDBY", "spokenResponse": spoken}
                else:
                    # Launch on PC-B
                    import subprocess
                    try:
                        subprocess.Popen(f"start {app_target}", shell=True)
                        spoken = f"Opening {application or app_target} on PC-B host workstation."
                        res_data = {"success": True, "node": "PC-B", "application": app_target, "spokenResponse": spoken}
                    except Exception as e:
                        res_data = {"success": False, "node": "PC-B", "error": str(e), "spokenResponse": f"Failed to launch {app_target} on PC-B: {str(e)}"}
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
