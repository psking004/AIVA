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
import re
import shutil
import fnmatch
import threading
import urllib.request
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import soundfile as sf

# Strategic Systems Engine (SSE) Dynamic Import
try:
    _sse_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "packages", "sse"))
    if _sse_path not in sys.path:
        sys.path.insert(0, _sse_path)
    from sse_standalone import evaluate_strategic_intent, dynamic_sse_planner, DynamicUIAgent
    print("[KokoroDaemon] Strategic Systems Engine (SSE) decision core and DynamicUIAgent loaded.")
except Exception as _sse_err:
    print(f"[KokoroDaemon] SSE load note: {_sse_err}")
    evaluate_strategic_intent = None
    dynamic_sse_planner = None
    DynamicUIAgent = None

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
DEFAULT_VOICE = "af_bella"
DEFAULT_SPEED = 1.05

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
        if "af_bella" in kokoro_engine.voices:
            aiva_voice_vector = kokoro_engine.voices["af_bella"]
            sys.stderr.write("[KOKORO TTS] AIVA voice identity initialized to af_bella (bold, crisp, assertive natural female voice, speed 1.05)\n")
        elif "af_sarah" in kokoro_engine.voices:
            aiva_voice_vector = kokoro_engine.voices["af_sarah"]
            sys.stderr.write("[KOKORO TTS] AIVA voice identity initialized to af_sarah (fallback natural female voice)\n")
        elif "af_heart" in kokoro_engine.voices:
            aiva_voice_vector = kokoro_engine.voices["af_heart"]
            sys.stderr.write("[KOKORO TTS] AIVA voice identity initialized to af_heart\n")
        try:
            warm_voice = aiva_voice_vector if aiva_voice_vector is not None else ("af_bella" if "af_bella" in kokoro_engine.voices else "af_sarah")
            kokoro_engine.create("ready", voice=warm_voice, speed=DEFAULT_SPEED, lang="en-us")
            sys.stderr.write("[KOKORO TTS] Model and phonemizer pre-warmed.\n")
        except Exception as warm_err:
            sys.stderr.write(f"[KOKORO TTS] Pre-warm notice: {warm_err}\n")
        sys.stderr.write(f"[KOKORO TTS] Model loaded successfully in {round(time.time() - t0, 2)}s\n")
        return True
    except Exception as e:
        sys.stderr.write(f"[KOKORO TTS] Initialization error: {e}\n")
        return False

def fetch_fabric_briefing():
    """
    Fetches real-time briefing telemetry across the tri-node fabric:
    - Weather in Chennai via wttr.in (with resilient fallback)
    - Active processes on PC-B (aiva/python services)
    - PC-A WinRM port 5985 reachability
    """
    weather = "30°C and partly cloudy"
    try:
        req = urllib.request.Request("http://wttr.in/Chennai?format=%C+%t", headers={"User-Agent": "curl/7.68.0"})
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            w_text = resp.read().decode("utf-8").strip()
            if w_text:
                weather = w_text
    except Exception as w_err:
        sys.stderr.write(f"[Briefing] Weather query notice: {w_err}\n")

    pcb_procs = []
    try:
        import psutil
        for p in psutil.process_iter():
            try:
                name = p.name()
                if any(k in name.lower() for k in ("aiva", "python")):
                    pcb_procs.append(name)
            except Exception:
                pass
    except Exception as ps_err:
        sys.stderr.write(f"[Briefing] psutil inspection notice: {ps_err}\n")

    proc_count = len(pcb_procs)
    pcb_summary = f"{proc_count} active services" if proc_count > 0 else "core services"

    pca_ip = "10.84.73.194"
    winrm_up = False
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1.5)
        s.connect((pca_ip, 5985))
        s.close()
        winrm_up = True
    except Exception:
        pass

    pca_status = "online and ready" if winrm_up else "in low-power standby"

    return {
        "success": True,
        "weather": weather,
        "pcb_processes": pcb_summary,
        "pcb_process_count": proc_count,
        "pca_status": pca_status,
        "pca_online": winrm_up,
        "timestamp": time.time()
    }

def start_render_keep_warm_daemon():
    """
    Background keep-warm daemon pinging Render free web service every 12 minutes (720s).
    Keeps Render container awake without exceeding monthly 750 free instance hours allocation.
    """
    def _keep_warm_worker():
        url = "https://aiva-yitg.onrender.com/health"
        time.sleep(10)  # Initial grace window after boot
        while True:
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "AIVA-KeepWarm/1.0"})
                with urllib.request.urlopen(req, timeout=12.0) as resp:
                    code = resp.getcode()
                    sys.stderr.write(f"[RenderKeepWarm] Health ping to {url} returned HTTP {code}\n")
            except Exception as e:
                sys.stderr.write(f"[RenderKeepWarm] Ping notice: {e}\n")
            time.sleep(720)  # 12 minutes

    t = threading.Thread(target=_keep_warm_worker, daemon=True, name="RenderKeepWarmDaemon")
    t.start()
    sys.stderr.write("[RenderKeepWarm] Daemon initialized (12-minute keep-warm cadence).\n")

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

APP_PROCESS_MAP = {
    "excel": ["excel.exe"],
    "microsoft excel": ["excel.exe"],
    "word": ["winword.exe"],
    "microsoft word": ["winword.exe"],
    "powerpoint": ["powerpnt.exe"],
    "microsoft powerpoint": ["powerpnt.exe"],
    "notepad": ["notepad.exe"],
    "calc": ["CalculatorApp.exe", "calc.exe"],
    "calculator": ["CalculatorApp.exe", "calc.exe"],
    "chrome": ["chrome.exe"],
    "google chrome": ["chrome.exe"],
    "edge": ["msedge.exe"],
    "microsoft edge": ["msedge.exe"],
    "browser": ["msedge.exe", "chrome.exe"],
    "terminal": ["WindowsTerminal.exe", "wt.exe"],
    "cmd": ["cmd.exe"],
    "powershell": ["powershell.exe", "pwsh.exe"],
    "vscode": ["Code.exe"],
    "code": ["Code.exe"],
    "task manager": ["Taskmgr.exe"],
    "taskmgr": ["Taskmgr.exe"],
    "spotify": ["Spotify.exe"],
    "slack": ["slack.exe"],
    "discord": ["Discord.exe"],
    "asphalt": ["Asphalt8.exe"],
    "asphalt 8": ["Asphalt8.exe"],
    "chatgpt": ["msedge.exe", "chrome.exe"],
}

def execute_app_close(app_name):
    """
    Terminates running processes on PC-B by executable name, UWP process name, or window title.
    """
    if not app_name:
        return False, "No application specified to close."

    raw = str(app_name).strip()
    clean = raw.lower()

    for prefix in ["close ", "kill ", "exit ", "stop ", "terminate ", "shut down ", "quit "]:
        if clean.startswith(prefix):
            clean = clean[len(prefix):].strip()
            raw = raw[len(prefix):].strip()

    for suffix in [" in pcb", " on pcb", " at pcb", " in pca", " on pca", " at pca", " in pc-b", " on pc-b", " at pc-b", " in pc-a", " on pc-a", " at pc-a"]:
        if clean.endswith(suffix):
            clean = clean[:-len(suffix)].strip()
            raw = raw[:-len(suffix)].strip()

    clean = clean.strip(".,!?:;'\"")
    raw = raw.strip(".,!?:;'\"")

    if not clean:
        return False, "No application specified to close."

    # 1. Determine process candidates
    candidates = []
    if clean in APP_PROCESS_MAP:
        candidates.extend(APP_PROCESS_MAP[clean])
    else:
        for k, v in APP_PROCESS_MAP.items():
            if clean in k or k in clean:
                candidates.extend(v)
                break

    if not candidates:
        if not clean.endswith(".exe"):
            candidates.append(f"{clean}.exe")
        else:
            candidates.append(clean)

    # 2. Try taskkill /F /IM <proc>
    terminated = False
    for proc in candidates:
        try:
            res = subprocess.run(["taskkill", "/F", "/IM", proc], capture_output=True, text=True, timeout=5)
            if res.returncode == 0:
                print(f"[AppClose] Terminated {proc} via taskkill")
                terminated = True
        except Exception as ex:
            print(f"[AppClose] taskkill error on {proc}: {ex}")

    if terminated:
        return True, f"Closed {raw}."

    # 3. Fallback: PowerShell Get-Process title / name match
    try:
        escaped_clean = clean.replace("'", "''")
        ps_cmd = (
            f"$procs = Get-Process -ErrorAction SilentlyContinue | Where-Object {{ "
            f"$_.MainWindowTitle -like '*{escaped_clean}*' -or $_.ProcessName -like '*{escaped_clean}*' }}; "
            f"if ($procs) {{ $procs | Stop-Process -Force -ErrorAction SilentlyContinue; 'SUCCESS' }} else {{ 'NOT_FOUND' }}"
        )
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd],
            capture_output=True, text=True, timeout=5
        )
        if "SUCCESS" in proc.stdout:
            return True, f"Closed {raw}."
    except Exception as ex:
        print(f"[AppClose] PowerShell fallback error: {ex}")

    return False, f"Could not find running process for {raw} to close."

# ==============================================================================
# AUTONOMOUS DESKTOP TOOL SUITE (Cursor/Codex/Antigravity Primitives)
# ==============================================================================

WINGET_PACKAGE_MAP = {
    "7zip": "7zip.7zip",
    "7-zip": "7zip.7zip",
    "git": "Git.Git",
    "vscode": "Microsoft.VisualStudioCode",
    "vs code": "Microsoft.VisualStudioCode",
    "visual studio code": "Microsoft.VisualStudioCode",
    "vlc": "VideoLAN.VLC",
    "python": "Python.Python.3.11",
    "python3": "Python.Python.3.11",
    "chrome": "Google.Chrome",
    "firefox": "Mozilla.Firefox",
    "nodejs": "OpenJS.NodeJS.LTS",
    "node": "OpenJS.NodeJS.LTS",
    "ripgrep": "BurntSushi.ripgrep.MSVC",
    "rg": "BurntSushi.ripgrep.MSVC",
    "neovim": "Neovim.Neovim",
    "nvim": "Neovim.Neovim",
    "curl": "cURL.cURL",
    "cursor": "Anysphere.Cursor",
    "codex": "codex",
    "github": "GitHub.cli",
    "gh": "GitHub.cli",
    "docker": "Docker.DockerDesktop",
}

def resolve_winget_bin():
    w = shutil.which("winget")
    if w and os.path.exists(w):
        return w
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    if local_app_data:
        p = os.path.join(local_app_data, "Microsoft", "WindowsApps", "winget.exe")
        if os.path.exists(p):
            return p
    user_profile = os.environ.get("USERPROFILE", "")
    if user_profile:
        p = os.path.join(user_profile, "AppData", "Local", "Microsoft", "WindowsApps", "winget.exe")
        if os.path.exists(p):
            return p
    return "winget"

def execute_install_package(package_name, manager="winget", target_node="PC-B"):
    if not package_name:
        return False, "No package specified to install."
    
    clean = str(package_name).strip().lower()
    pkg_id = WINGET_PACKAGE_MAP.get(clean, str(package_name).strip())

    already_installed_signals = [
        "already installed",
        "no available upgrade",
        "no newer package",
        "successfully installed",
        "0x8a15002b",
        "0x8a150028"
    ]

    if "PC-A" in target_node.upper() or "PCA" in target_node.upper() or "194" in target_node:
        pca_ip = "10.84.73.194"
        cmd_str = f"winget install --id {pkg_id} -e --silent --accept-source-agreements --accept-package-agreements --disable-interactivity"
        winrm_cmd = f'powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Command -ComputerName {pca_ip} -ScriptBlock {{ {cmd_str} }}"'
        try:
            res = subprocess.run(winrm_cmd, shell=True, capture_output=True, text=True, timeout=180)
            out = (res.stdout or "") + " " + (res.stderr or "")
            out_lower = out.lower()
            if res.returncode == 0 or any(s in out_lower for s in already_installed_signals):
                return True, f"Successfully verified package {pkg_id} on PC-A."
            return res.returncode == 0, f"Dispatched package {pkg_id} installation to PC-A: {out[-200:].strip()}"
        except Exception as ex:
            return False, f"Failed installing {pkg_id} on PC-A: {str(ex)}"

    winget_bin = resolve_winget_bin()
    # 1. Attempt silent non-interactive installation
    cmd = [
        winget_bin, "install", "--id", pkg_id, "-e",
        "--silent", "--accept-source-agreements", "--accept-package-agreements",
        "--disable-interactivity"
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        out = (proc.stdout or "") + " " + (proc.stderr or "")
        out_lower = out.lower()
        
        if proc.returncode == 0 or any(s in out_lower for s in already_installed_signals):
            return True, f"Successfully installed {package_name} on PC-B."

        # 2. Try with user scope fallback
        cmd_user = [
            winget_bin, "install", "--id", pkg_id, "-e",
            "--silent", "--accept-source-agreements", "--accept-package-agreements",
            "--scope", "user",
            "--disable-interactivity"
        ]
        proc_user = subprocess.run(cmd_user, capture_output=True, text=True, timeout=180)
        out_u = (proc_user.stdout or "") + " " + (proc_user.stderr or "")
        if proc_user.returncode == 0 or any(s in out_u.lower() for s in already_installed_signals):
            return True, f"Successfully installed {package_name} on PC-B."

        # 3. Elevated PowerShell execution fallback
        elevated_ps = f'Start-Process "{winget_bin}" -ArgumentList "install --id {pkg_id} -e --silent --accept-source-agreements --accept-package-agreements --disable-interactivity" -Verb RunAs -Wait -PassThru'
        elevated_run = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", elevated_ps],
            capture_output=True,
            text=True,
            timeout=180
        )
        if elevated_run.returncode == 0:
            return True, f"Successfully installed {package_name} on PC-B via elevated privileges."

        return False, f"Failed installing {package_name}: {out[-200:].strip() if out.strip() else 'Exit code ' + str(proc.returncode)}"
    except Exception as ex:
        return False, f"Installation exception for {package_name}: {str(ex)}"

def resolve_workspace_filepath(filename_or_path, target_node="PC-B"):
    p = str(filename_or_path).strip()
    is_pca = "PC-A" in target_node.upper() or "PCA" in target_node.upper() or "194" in target_node or p.startswith(r"\\10.84.73.194") or p.lower().startswith("pca\\") or p.lower().startswith("pca/")
    if is_pca:
        clean_p = re.sub(r'^(?:pca[\\/]|\\*10\.84\.73\.194[\\/]AIVA_Workspace[\\/])', '', p, flags=re.I)
        target_path = os.path.join(r"\\10.84.73.194\AIVA_Workspace", os.path.basename(clean_p) if not os.path.dirname(clean_p) else clean_p)
        mirror_path = os.path.join(r"C:\AIVA_Workspace\pca", os.path.basename(clean_p) if not os.path.dirname(clean_p) else clean_p)
        return target_path, mirror_path, True
    else:
        clean_p = p.replace("C:\\AIVA_Workspace\\", "").replace("c:\\AIVA_Workspace\\", "")
        if os.path.isabs(p) and not p.lower().startswith(r"c:\aiva_workspace"):
            target_path = p
        else:
            target_path = os.path.join(r"C:\AIVA_Workspace", clean_p)
        return target_path, None, False

def create_empty_file_with_editor(file_name, target_node="PC-B"):
    target_path, mirror_path, is_pca = resolve_workspace_filepath(file_name, target_node)
    try:
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        with open(target_path, "w", encoding="utf-8") as f:
            f.write("")
        if mirror_path:
            os.makedirs(os.path.dirname(mirror_path), exist_ok=True)
            with open(mirror_path, "w", encoding="utf-8") as f:
                f.write("")
        ACTIVE_SESSION["active_file"] = os.path.basename(target_path)
        return True, f"Created {os.path.basename(target_path)} on {target_node} workspace."
    except Exception as ex:
        return False, f"Failed creating file {file_name} on {target_node}: {ex}"

def patch_file(file_path, target_block, replacement_block, target_node="PC-B"):
    target_path, mirror_path, is_pca = resolve_workspace_filepath(file_path, target_node)
    path_to_read = target_path if os.path.exists(target_path) else (mirror_path if (mirror_path and os.path.exists(mirror_path)) else None)
    if not path_to_read:
        return False, f"File {file_path} does not exist."
    
    with open(path_to_read, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()
    
    if target_block and target_block not in content:
        return False, f"Target block not found in {os.path.basename(path_to_read)}."
    
    updated = content.replace(target_block, replacement_block, 1) if target_block else replacement_block
    
    try:
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        with open(target_path, "w", encoding="utf-8") as f:
            f.write(updated)
    except Exception as ex:
        if not is_pca:
            return False, f"Failed writing to {target_path}: {ex}"

    if mirror_path:
        try:
            os.makedirs(os.path.dirname(mirror_path), exist_ok=True)
            with open(mirror_path, "w", encoding="utf-8") as f:
                f.write(updated)
        except Exception:
            pass
            
    return True, f"Patched {os.path.basename(target_path)} successfully."

def read_file_lines(file_path, start_line=1, end_line=None, target_node="PC-B"):
    target_path, mirror_path, is_pca = resolve_workspace_filepath(file_path, target_node)
    path_to_read = target_path if os.path.exists(target_path) else (mirror_path if (mirror_path and os.path.exists(mirror_path)) else None)
    if not path_to_read:
        return False, f"File {file_path} not found.", ""
    
    with open(path_to_read, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()
    
    start = max(1, int(start_line)) - 1
    end = int(end_line) if end_line is not None else len(lines)
    selected = lines[start:end]
    return True, f"Read lines {start+1}-{min(end, len(lines))} of {os.path.basename(path_to_read)}.", "".join(selected)

def search_workspace(query, search_path=None, file_pattern="*", target_node="PC-B"):
    target_path, _, is_pca = resolve_workspace_filepath(search_path or "C:\\AIVA_Workspace", target_node)
    base = target_path if os.path.exists(target_path) else r"C:\AIVA_Workspace"
    matches = []
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d not in (".git", "node_modules", ".gradle", "build", "__pycache__")]
        for file in files:
            if fnmatch.fnmatch(file, file_pattern):
                fp = os.path.join(root, file)
                try:
                    with open(fp, "r", encoding="utf-8", errors="ignore") as f:
                        for l_idx, line in enumerate(f, 1):
                            if query.lower() in line.lower():
                                matches.append({"file": fp, "line": l_idx, "text": line.strip()})
                                if len(matches) >= 50:
                                    break
                except Exception:
                    continue
        if len(matches) >= 50:
            break
    return True, f"Found {len(matches)} occurrences of '{query}'.", matches

def execute_shell_command(command, cwd=None, timeout=60, target_node="PC-B"):
    if not command:
        return False, "No shell command provided.", "", -1
    
    if "PC-A" in target_node.upper() or "PCA" in target_node.upper() or "194" in target_node:
        pca_ip = "10.84.73.194"
        escaped = command.replace("'", "''")
        winrm_cmd = f'powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Command -ComputerName {pca_ip} -ScriptBlock {{ cmd.exe /c \'{escaped}\' }}"'
        try:
            res = subprocess.run(winrm_cmd, shell=True, capture_output=True, text=True, timeout=timeout)
            return res.returncode == 0, res.stdout, res.stderr, res.returncode
        except Exception as ex:
            return False, "", str(ex), -1
    else:
        target_cwd = cwd or r"C:\AIVA_Workspace"
        os.makedirs(target_cwd, exist_ok=True)
        try:
            res = subprocess.run(command, shell=True, cwd=target_cwd, capture_output=True, text=True, timeout=timeout)
            return res.returncode == 0, res.stdout, res.stderr, res.returncode
        except Exception as ex:
            return False, "", str(ex), -1

EXE_CANDIDATES_PCB = [
    r"C:\Users\bhara\AppData\Local\Programs\AIVA\AIVA.exe",
    r"C:\Users\bhara\AIVA\apps\desktop\dist\win-unpacked\AIVA.exe",
    r"C:\AIVA_Workspace\AIVA.exe",
]

EXE_CANDIDATES_PCA = [
    r"C:\Users\parthasarathi\AppData\Local\Programs\AIVA\AIVA.exe",
    r"C:\AIVA_Workspace\AIVA.exe",
    r"\\10.84.73.194\AIVA_Workspace\AIVA.exe",
    r"C:\Users\parthasarathi\AIVA\apps\desktop\dist\win-unpacked\AIVA.exe",
]

def find_native_exe(candidates):
    for path in candidates:
        if os.path.exists(path):
            return path
    return None

def launch_fabric_visual(target="BOTH"):
    """
    Pure dedicated native binary launcher for AIVA across PC-B, PC-A, and Mobile.
    Completely bans web browsers (msedge, chrome, http:// tabs):
    - PC-B: Launches native compiled AIVA.exe or Electron desktop application.
    - PC-A: Launches native compiled AIVA.exe interactively in Session 1.
    - Mobile: Launches native Android APK (com.aiva.personal.ai/.MainActivity) via ADB.
    """
    target_clean = str(target or "BOTH").upper()
    results = {}

    # 1. PC-B Native Execution
    if target_clean in ["PC-B", "BOTH", "LOCAL", "ALL"]:
        native_pcb = find_native_exe(EXE_CANDIDATES_PCB)
        clean_env = os.environ.copy()
        clean_env.pop("ELECTRON_RUN_AS_NODE", None)
        clean_env.pop("ELECTRON_NO_ASAR", None)
        if native_pcb:
            try:
                subprocess.Popen([native_pcb], cwd=os.path.dirname(native_pcb), env=clean_env)
                results["PC-B"] = f"Launched native binary: {native_pcb}"
            except Exception as e:
                results["PC-B"] = f"Failed launching native exe: {e}"
        else:
            try:
                subprocess.Popen(["pnpm", "--filter", "@aiva/desktop", "start"], cwd=r"C:\Users\bhara\AIVA", shell=True, env=clean_env)
                results["PC-B"] = "Launched native desktop application via Electron."
            except Exception as e:
                results["PC-B"] = f"Failed to start desktop app: {e}"

    # 2. PC-A Native Execution (Interactive Session 1)
    if target_clean in ["PC-A", "BOTH", "REMOTE", "ALL"]:
        try:
            remote_cmd = (
                "$candidates = @("
                "'C:\\Users\\parthasarathi\\AppData\\Local\\Programs\\AIVA\\AIVA.exe',"
                "'C:\\AIVA_Workspace\\AIVA.exe',"
                "'C:\\Users\\parthasarathi\\AIVA\\apps\\desktop\\dist\\win-unpacked\\AIVA.exe'"
                "); "
                "$exe = ($candidates | Where-Object { Test-Path $_ } | Select-Object -First 1); "
                "if ($exe) { $cmd = $exe } else { $cmd = 'cmd.exe /c cd /d C:\\Users\\parthasarathi\\AIVA\\apps\\desktop && pnpm start' }; "
                "$act = New-ScheduledTaskAction -Execute $cmd; "
                "$trig = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(1); "
                "$user = (quser | Select-String 'Active' | ForEach-Object { ($_ -split '\\s+')[1] }); "
                "if (-not $user) { $user = $env:USERNAME; if (-not $user) { $user = 'parthasarathi' } }; "
                "$princ = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive; "
                "Register-ScheduledTask -TaskName 'AIVANativeApp' -Action $act -Trigger $trig -Principal $princ -Force | Out-Null; "
                "Start-ScheduledTask -TaskName 'AIVANativeApp'"
            )
            winrm_cmd = f'powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Command -ComputerName 10.84.73.194 -ScriptBlock {{ {remote_cmd} }}"'
            p = subprocess.run(winrm_cmd, shell=True, capture_output=True, text=True, timeout=15)
            results["PC-A"] = "Launched dedicated native executable on PC-A physical screen." if p.returncode == 0 else (p.stderr.strip() or "Dispatched native app launch to PC-A.")
        except Exception as e:
            results["PC-A"] = f"Failed launching native exe on PC-A: {e}"

    # 3. Mobile Node Native Execution (APK via ADB)
    if target_clean in ["MOBILE", "ALL", "PHONE"]:
        try:
            adb_cmd = 'adb -s 10.84.73.78:5555 shell am start -n com.aiva.personal.ai/.MainActivity -a android.intent.action.MAIN -c android.intent.category.LAUNCHER'
            p_mobile = subprocess.run(adb_cmd, shell=True, capture_output=True, text=True, timeout=10)
            if p_mobile.returncode == 0:
                results["MOBILE"] = "Launched native Android APK on iQOO Neo 10."
            else:
                p_mobile_def = subprocess.run('adb shell am start -n com.aiva.personal.ai/.MainActivity -a android.intent.action.MAIN -c android.intent.category.LAUNCHER', shell=True, capture_output=True, text=True, timeout=10)
                results["MOBILE"] = "Launched native Android APK on mobile device." if p_mobile_def.returncode == 0 else f"Failed to launch mobile APK: {p_mobile.stderr}"
        except Exception as e:
            results["MOBILE"] = f"Mobile launch error: {e}"

    return results

def execute_sse_plan_steps(steps):
    execution_results = []
    for s in steps:
        s_node = (s.get("node") or "PC-B").upper()
        s_act = s.get("action", "")
        s_res = {"node": s_node, "action": s_act, "step": s, "success": True, "output": ""}

        if "PC-B" in s_node or s_node == "PC_B":
            if s_act == "INSTALL_APP":
                pkg = s.get("package") or s.get("target") or ""
                ok, msg = execute_install_package(pkg, target_node="PC-B")
                s_res["success"], s_res["output"] = ok, msg
            elif s_act == "CREATE_FILE":
                fn = s.get("file", "script.py")
                ok, msg = create_empty_file_with_editor(fn)
                if DynamicUIAgent:
                    try:
                        DynamicUIAgent.ensure_manual_save(fn, target_node="PC-B")
                    except Exception:
                        pass
                s_res["success"], s_res["output"] = ok, msg
            elif s_act == "MODIFY_FILE":
                fn = s.get("file", "script.py")
                content = s.get("content", "")
                ok, msg = patch_file(fn, "", content, target_node="PC-B")
                if DynamicUIAgent:
                    try:
                        DynamicUIAgent.ensure_manual_save(fn, target_node="PC-B")
                    except Exception:
                        pass
                s_res["success"], s_res["output"] = ok, msg
            elif s_act == "OPEN_APP":
                app = s.get("application") or s.get("target") or ""
                ok, msg = execute_universal_launch(app)
                s_res["success"], s_res["output"] = ok, msg
            elif s_act in ("EXECUTE_SHELL", "EXEC"):
                cmd = s.get("command", "")
                ok, out, err, code = execute_shell_command(cmd, target_node="PC-B")
                s_res["success"], s_res["output"] = ok, (out or err or f"Exit code {code}")
            elif s_act in ("LAUNCH_VISUAL", "LAUNCH_SCREEN", "DISPLAY_UI"):
                disp_target = s.get("target", "BOTH")
                vis_res = launch_fabric_visual(disp_target)
                s_res["success"], s_res["output"] = True, f"Visual screen launch: {vis_res}"
            elif s_act in ("UI_CLICK", "DYNAMIC_CLICK", "CLICK_ELEMENT"):
                win = s.get("window", "")
                elem = s.get("target") or s.get("element") or s.get("name") or ""
                if DynamicUIAgent:
                    clicked = DynamicUIAgent.click_element_by_name(win, elem, target_node="PC-B")
                    s_res["success"], s_res["output"] = clicked, f"Dynamic click on '{elem}' in '{win}' ({'Success' if clicked else 'Failed/NotFound'})."
                else:
                    s_res["success"], s_res["output"] = False, "DynamicUIAgent not available."
            elif s_act in ("UI_SAVE", "AUTO_SAVE", "ENSURE_SAVE"):
                win = s.get("window", "")
                if DynamicUIAgent:
                    saved = DynamicUIAgent.ensure_manual_save(win, target_node="PC-B")
                    s_res["success"], s_res["output"] = saved, f"Ensured manual save on '{win}' ({'Saved' if saved else 'Sent Ctrl+S'})."
                else:
                    s_res["success"], s_res["output"] = False, "DynamicUIAgent not available."
            elif s_act == "CREATE_CALENDAR":
                s_res["success"], s_res["output"] = True, f"Dispatched to mobile: {s.get('title')}"
            else:
                s_res["success"], s_res["output"] = True, f"Processed {s_act} on PC-B"

        elif "PC-A" in s_node or s_node == "PC_A" or "194" in s_node:
            if s_act == "INSTALL_APP":
                pkg = s.get("package") or s.get("target") or ""
                ok, msg = execute_install_package(pkg, target_node="PC-A")
                s_res["success"], s_res["output"] = ok, msg
            elif s_act == "CREATE_FILE":
                fn = s.get("file", "script.py")
                target_path, mirror_path, _ = resolve_workspace_filepath(fn, "PC-A")
                try:
                    os.makedirs(os.path.dirname(target_path), exist_ok=True)
                    with open(target_path, "w", encoding="utf-8") as f:
                        f.write("")
                    if mirror_path:
                        os.makedirs(os.path.dirname(mirror_path), exist_ok=True)
                        with open(mirror_path, "w", encoding="utf-8") as f:
                            f.write("")
                    if DynamicUIAgent:
                        try:
                            DynamicUIAgent.ensure_manual_save(fn, target_node="PC-A")
                        except Exception:
                            pass
                    s_res["success"], s_res["output"] = True, f"Created {fn} directly on PC-A workspace."
                except Exception as ex:
                    s_res["success"], s_res["output"] = False, f"Error creating file on PC-A: {ex}"
            elif s_act == "MODIFY_FILE":
                fn = s.get("file", "script.py")
                content = s.get("content", "")
                ok, msg = patch_file(fn, "", content, target_node="PC-A")
                if DynamicUIAgent:
                    try:
                        DynamicUIAgent.ensure_manual_save(fn, target_node="PC-A")
                    except Exception:
                        pass
                s_res["success"], s_res["output"] = ok, msg
            elif s_act in ("EXECUTE_SHELL", "EXEC"):
                cmd = s.get("command", "")
                ok, out, err, code = execute_shell_command(cmd, target_node="PC-A")
                s_res["success"], s_res["output"] = ok, (out or err or f"Exit code {code}")
            elif s_act in ("LAUNCH_VISUAL", "LAUNCH_SCREEN", "DISPLAY_UI"):
                disp_target = s.get("target", "PC-A")
                vis_res = launch_fabric_visual(disp_target)
                s_res["success"], s_res["output"] = True, f"Visual screen launch: {vis_res}"
            elif s_act in ("UI_CLICK", "DYNAMIC_CLICK", "CLICK_ELEMENT"):
                win = s.get("window", "")
                elem = s.get("target") or s.get("element") or s.get("name") or ""
                if DynamicUIAgent:
                    clicked = DynamicUIAgent.click_element_by_name(win, elem, target_node="PC-A")
                    s_res["success"], s_res["output"] = clicked, f"Dynamic click on '{elem}' in '{win}' on PC-A ({'Success' if clicked else 'Failed/NotFound'})."
                else:
                    s_res["success"], s_res["output"] = False, "DynamicUIAgent not available."
            elif s_act in ("UI_SAVE", "AUTO_SAVE", "ENSURE_SAVE"):
                win = s.get("window", "")
                if DynamicUIAgent:
                    saved = DynamicUIAgent.ensure_manual_save(win, target_node="PC-A")
                    s_res["success"], s_res["output"] = saved, f"Ensured manual save on '{win}' on PC-A ({'Saved' if saved else 'Sent Ctrl+S'})."
                else:
                    s_res["success"], s_res["output"] = False, "DynamicUIAgent not available."
            elif s_act == "OPEN_APP":
                app = s.get("application") or s.get("target") or ""
                escaped = app.replace("'", "''")
                winrm_cmd = f'powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Command -ComputerName 10.84.73.194 -ScriptBlock {{ Start-Process \'{escaped}\' }}"'
                try:
                    p = subprocess.run(winrm_cmd, shell=True, capture_output=True, text=True, timeout=30)
                    s_res["success"], s_res["output"] = p.returncode == 0, f"Dispatched launch of {app} to PC-A."
                except Exception as ex:
                    s_res["success"], s_res["output"] = False, f"Failed launching {app} on PC-A: {ex}"
            else:
                s_res["success"], s_res["output"] = True, f"Processed {s_act} on PC-A"

        elif "MOBILE" in s_node:
            adb_cmd = None
            if s_act in ("SEND_WHATSAPP", "WHATSAPP"):
                to = s.get("target") or s.get("recipient") or s.get("contact") or "Appa"
                msg = s.get("message") or s.get("content") or "Hello from AIVA"
                adb_cmd = f"adb -s 10.84.73.78:5555 shell am broadcast -a com.aiva.action.VOICE_COMMAND --es query 'send whatsapp message to {to} saying {msg}'"
            elif s_act in ("CALL_CONTACT", "CALL"):
                contact = s.get("target") or s.get("contact") or "Appa"
                adb_cmd = f"adb -s 10.84.73.78:5555 shell am broadcast -a com.aiva.action.VOICE_COMMAND --es query 'call {contact}'"
            elif s_act in ("CREATE_NOTE", "NOTE"):
                note = s.get("content") or s.get("title") or "Meeting note"
                adb_cmd = f"adb -s 10.84.73.78:5555 shell am broadcast -a com.aiva.action.VOICE_COMMAND --es query 'create note {note}'"
            if adb_cmd:
                try:
                    p = subprocess.run(adb_cmd, shell=True, capture_output=True, timeout=5)
                    s_res["success"], s_res["output"] = True, f"Executed {s_act} on Mobile device via AIVA voice engine."
                except Exception as ex:
                    s_res["success"], s_res["output"] = False, f"Mobile execution error: {ex}"
            else:
                s_res["success"], s_res["output"] = True, f"Mobile action staged: {s.get('title') or s_act}"

        execution_results.append(s_res)
    return execution_results

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
        if self.path in ("/health", "/api/health"):
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
        elif self.path in ("/api/fabric/briefing", "/api/briefing"):
            briefing_data = fetch_fabric_briefing()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(briefing_data).encode("utf-8"))
        elif self.path.startswith("/api/fabric/launch-visual") or self.path.startswith("/api/launch-visual"):
            parsed_url = urllib.parse.urlparse(self.path)
            query_params = urllib.parse.parse_qs(parsed_url.query)
            target = query_params.get("target", ["BOTH"])[0].upper()
            vis_res = launch_fabric_visual(target)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "results": vis_res}).encode("utf-8"))
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
        elif self.path.startswith("/api/agent/plan") or self.path.startswith("/api/plan"):
            parsed_url = urllib.parse.urlparse(self.path)
            query_params = urllib.parse.parse_qs(parsed_url.query)
            query_str = query_params.get("query", [""])[0] or query_params.get("goal", [""])[0]
            is_exec = "execute" in parsed_url.path or query_params.get("execute", ["false"])[0].lower() in ("true", "1")
            if evaluate_strategic_intent:
                plan_res = evaluate_strategic_intent(query_str)
                if is_exec and plan_res.get("steps"):
                    exec_results = execute_sse_plan_steps(plan_res.get("steps", []))
                    plan_res["executed"] = True
                    plan_res["execution_results"] = exec_results
                    plan_res["spokenResponse"] = f"Executed {len(plan_res.get('steps', []))} strategic steps across the fabric."
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps(plan_res).encode("utf-8"))
            else:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": "SSE not available"}).encode("utf-8"))
        elif self.path in ("/", "/index.html", "/hud") or self.path.startswith("/assets/"):
            renderer_dir = os.path.join(os.path.dirname(__file__), "renderer")
            if not os.path.exists(renderer_dir):
                renderer_dir = r"C:\Users\bhara\AIVA\apps\desktop\renderer"
            
            clean_subpath = self.path.lstrip("/").split("?")[0]
            if clean_subpath in ("", "index.html", "hud"):
                target_file = os.path.join(renderer_dir, "index.html")
            else:
                target_file = os.path.join(renderer_dir, clean_subpath)
            
            if os.path.exists(target_file) and os.path.isfile(target_file):
                import mimetypes
                ctype, _ = mimetypes.guess_type(target_file)
                if not ctype:
                    ctype = "application/octet-stream"
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                with open(target_file, "rb") as f:
                    self.wfile.write(f.read())
            else:
                self.send_response(404)
                self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path in ("/api/fabric/launch-visual", "/api/launch-visual"):
            content_length = int(self.headers.get("Content-Length", 0))
            body_bytes = self.rfile.read(content_length) if content_length > 0 else b"{}"
            try:
                data = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
            except Exception:
                data = {}
            target = str(data.get("target", "BOTH")).upper()
            vis_res = launch_fabric_visual(target)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "results": vis_res}).encode("utf-8"))
            return

        if self.path in ("/api/fabric/briefing", "/api/briefing"):
            briefing_data = fetch_fabric_briefing()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(briefing_data).encode("utf-8"))
            return

        if self.path in ("/api/agent/plan/execute", "/api/plan/execute"):
            content_length = int(self.headers.get("Content-Length", 0))
            body_bytes = self.rfile.read(content_length)
            try:
                data = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
            except Exception:
                data = {}
            query_str = data.get("query") or data.get("command") or data.get("text") or data.get("goal") or ""
            plan = data.get("plan")
            if not plan and dynamic_sse_planner:
                plan = dynamic_sse_planner(query_str)
            elif not plan and evaluate_strategic_intent:
                plan = evaluate_strategic_intent(query_str)

            steps = plan.get("steps", []) if plan else []
            execution_results = execute_sse_plan_steps(steps)

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            resp = {
                "success": True,
                "plan": plan,
                "results": execution_results,
                "spokenResponse": f"Executed {len(steps)} strategic steps across the fabric."
            }
            self.wfile.write(json.dumps(resp).encode("utf-8"))
            return

        if self.path in ("/api/agent/plan", "/api/plan"):
            content_length = int(self.headers.get("Content-Length", 0))
            body_bytes = self.rfile.read(content_length)
            try:
                data = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
            except Exception:
                data = {}
            query_str = data.get("query") or data.get("command") or data.get("text") or ""
            if evaluate_strategic_intent:
                plan_res = evaluate_strategic_intent(query_str)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps(plan_res).encode("utf-8"))
            else:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": "SSE not available"}).encode("utf-8"))
            return

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
            voice = data.get("voice", DEFAULT_VOICE)  # AIVA preferred female voice: bold, crisp af_bella
            speed = float(data.get("speed", DEFAULT_SPEED))

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
                if str(voice).lower() in ("af_bella", "af_heart", "aiva", "default"):
                    if "af_bella" in kokoro_engine.voices:
                        voice_target = kokoro_engine.voices["af_bella"]
                    elif "af_sarah" in kokoro_engine.voices:
                        voice_target = kokoro_engine.voices["af_sarah"]
                    elif aiva_voice_vector is not None:
                        voice_target = aiva_voice_vector
                    elif "af_heart" in kokoro_engine.voices:
                        voice_target = kokoro_engine.voices["af_heart"]
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
            filename = str(data.get("filename") or data.get("file") or "").strip()
            text = str(data.get("text", "")).strip()

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

            # 4. Route for closing / killing desktop applications (PC-A & PC-B)
            elif action in ("CLOSE_APP", "KILL_APP", "EXIT_APP", "STOP_APP", "TERMINATE_APP"):
                app_target = application or command or query or ""
                target_node = (target or "").upper()
                if "PC-A" in target_node or "PCA" in target_node or "194" in target_node:
                    pca_ip = "10.84.73.194"
                    escaped = app_target.replace("'", "''")
                    ps_cmd = f"Stop-Process -Name '{escaped}' -Force -ErrorAction SilentlyContinue"
                    winrm_cmd = f'powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Command -ComputerName {pca_ip} -ScriptBlock {{ {ps_cmd} }}"'
                    try:
                        subprocess.Popen(winrm_cmd, shell=True)
                        res_data = {
                            "success": True,
                            "node": "PC-A",
                            "application": app_target,
                            "spokenResponse": f"Closed {app_target} on PC-A."
                        }
                    except Exception as ex:
                        res_data = {
                            "success": False,
                            "node": "PC-A",
                            "spokenResponse": f"Failed closing {app_target} on PC-A: {str(ex)}"
                        }
                else:
                    success, spoken = execute_app_close(app_target)
                    res_data = {
                        "success": success,
                        "node": "PC-B",
                        "application": app_target,
                        "spokenResponse": spoken
                    }

            # 5. Route for Strategic Systems Engine Planning & Reasoning
            elif action in ("PLAN", "STRATEGIC_PLAN", "AGENT_PLAN"):
                plan_query = query or command or application or ""
                if evaluate_strategic_intent:
                    plan_result = evaluate_strategic_intent(plan_query)
                    should_execute = bool(data.get("execute", False))
                    step_exec_results = []
                    if should_execute and plan_result.get("steps"):
                        step_exec_results = execute_sse_plan_steps(plan_result["steps"])

                    res_data = {
                        "success": True,
                        "node": "PC-B",
                        "action": "PLAN",
                        "plan": plan_result,
                        "executed": should_execute,
                        "execution_results": step_exec_results if should_execute else None,
                        "target_node": plan_result.get("target_node"),
                        "spokenResponse": plan_result.get("spokenResponse") or plan_result.get("rationale")
                    }
                else:
                    res_data = {
                        "success": False,
                        "node": "PC-B",
                        "spokenResponse": "Strategic Systems Engine is not loaded."
                    }

            # 6. Route for Autonomous Multi-Step ReAct Plan Execution
            elif action in ("EXECUTE_PLAN", "RUN_PLAN", "EXECUTE_SSE_PLAN"):
                steps = data.get("steps")
                if not steps and (query or command):
                    plan_query = query or command
                    plan = dynamic_sse_planner(plan_query) if dynamic_sse_planner else None
                    steps = plan.get("steps", []) if plan else []
                step_exec_results = execute_sse_plan_steps(steps or [])
                all_succeeded = all(s.get("success", False) for s in step_exec_results) if step_exec_results else True
                res_data = {
                    "success": all_succeeded,
                    "node": "PC-B",
                    "action": "EXECUTE_PLAN",
                    "steps": step_exec_results,
                    "spokenResponse": f"Executed plan with {len(step_exec_results)} steps across the fabric." if all_succeeded else "Plan execution encountered errors."
                }

            # 7. Route for Package Installation via WinGet / Choco
            elif action in ("INSTALL_APP", "PACKAGE_INSTALL", "WINGET"):
                pkg_target = data.get("package") or data.get("package_name") or data.get("target") or application or command or text or query or ""
                for pfx in ("install ", "winget ", "setup ", "download "):
                    if pkg_target.lower().startswith(pfx):
                        pkg_target = pkg_target[len(pfx):].strip()
                target_node = (target or "").upper() or "PC-B"
                success, spoken = execute_install_package(pkg_target, target_node=target_node)
                res_data = {
                    "success": success,
                    "node": "PC-A" if "PC-A" in target_node or "PCA" in target_node else "PC-B",
                    "package": pkg_target,
                    "spokenResponse": spoken
                }

            # 8. Route for Surgical File Modification (Patch / Overwrite)
            elif action in ("MODIFY_FILE", "EDIT_FILE_DIFF", "PATCH_FILE"):
                target_file = filename or command or application or ""
                target_block = data.get("target_block", "")
                replacement_block = data.get("replacement_block", data.get("content", ""))
                target_node = (target or "").upper() or "PC-B"
                if not target_block:
                    target_path, mirror_path, is_pca = resolve_workspace_filepath(target_file, target_node)
                    try:
                        os.makedirs(os.path.dirname(target_path), exist_ok=True)
                        with open(target_path, "w", encoding="utf-8") as f:
                            f.write(replacement_block)
                        if mirror_path:
                            os.makedirs(os.path.dirname(mirror_path), exist_ok=True)
                            with open(mirror_path, "w", encoding="utf-8") as f:
                                f.write(replacement_block)
                        success = True
                        spoken = f"Updated {os.path.basename(target_path)}."
                    except Exception as ex:
                        success = False
                        spoken = f"Failed modifying {target_file}: {ex}"
                else:
                    success, spoken = patch_file(target_file, target_block, replacement_block, target_node=target_node)
                res_data = {
                    "success": success,
                    "node": "PC-A" if "PC-A" in target_node or "PCA" in target_node else "PC-B",
                    "file": target_file,
                    "spokenResponse": spoken
                }

            # 9. Route for Reading File Line Ranges
            elif action in ("READ_FILE", "VIEW_FILE_LINES"):
                target_file = filename or command or application or ""
                start_line = data.get("start_line", 1)
                end_line = data.get("end_line", None)
                target_node = (target or "").upper() or "PC-B"
                success, spoken, content = read_file_lines(target_file, start_line, end_line, target_node=target_node)
                res_data = {
                    "success": success,
                    "node": "PC-A" if "PC-A" in target_node or "PCA" in target_node else "PC-B",
                    "file": target_file,
                    "content": content,
                    "spokenResponse": spoken
                }

            # 10. Route for Workspace Search (Grep / Query)
            elif action in ("SEARCH_WORKSPACE", "GREP", "FIND_IN_FILES"):
                search_query = query or command or text or ""
                search_path = data.get("path", None)
                file_pattern = data.get("file_pattern", "*")
                target_node = (target or "").upper() or "PC-B"
                success, spoken, matches = search_workspace(search_query, search_path, file_pattern, target_node=target_node)
                res_data = {
                    "success": success,
                    "node": "PC-A" if "PC-A" in target_node or "PCA" in target_node else "PC-B",
                    "query": search_query,
                    "matches": matches,
                    "count": len(matches),
                    "spokenResponse": spoken
                }

            # 11. Route for Arbitrary Shell Command Execution
            elif action in ("EXECUTE_SHELL", "RUN_SHELL", "SHELL"):
                shell_cmd = command or query or text or ""
                cwd = data.get("cwd", data.get("working_directory", None))
                timeout = int(data.get("timeout", 60))
                target_node = (target or "").upper() or "PC-B"
                success, stdout, stderr, code = execute_shell_command(shell_cmd, cwd, timeout, target_node=target_node)
                res_data = {
                    "success": success,
                    "node": "PC-A" if "PC-A" in target_node or "PCA" in target_node else "PC-B",
                    "command": shell_cmd,
                    "exit_code": code,
                    "stdout": stdout,
                    "stderr": stderr,
                    "spokenResponse": f"Command exited with code {code}." if success else f"Command failed with code {code}."
                }

            # 12. Route for Strategic Systems Engine (SSE) Invariant Verification
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
            # 13. Route for Real-time Tri-Node Briefing Engine
            elif action in ("BRIEFING", "FABRIC_BRIEFING", "GET_BRIEFING") or "briefing" in (query or command).lower():
                briefing_data = fetch_fabric_briefing()
                spoken = f"Welcome back! Outside it's {briefing_data['weather']} in Chennai. PC-B is holding steady with {briefing_data['pcb_processes']}, and PC-A compute node is {briefing_data['pca_status']}. All systems are green — what are we building today?"
                briefing_data["spokenResponse"] = spoken
                briefing_data["node"] = "PC-B"
                res_data = briefing_data

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
    start_render_keep_warm_daemon()
    server = ThreadingHTTPServer(("0.0.0.0", port), KokoroHandler)
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
    parser.add_argument("--voice", type=str, default="af_bella", help="Default voice")
    parser.add_argument("positional_port", nargs="?", type=int, default=None, help="Optional positional port")
    args = parser.parse_args()
    port = args.positional_port if args.positional_port is not None else args.port
    run_server(port)
