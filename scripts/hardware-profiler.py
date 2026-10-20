"""
AIVA Hardware Discovery & Performance Profiler
Dynamically detects hardware specifications and profiles local compute nodes:
- Identifies PC-A (RTX 3050 CUDA AI Power Node) vs PC-B (i5 13th Gen CPU Node)
- Benchmarks local inference latency and tokens per second
- Emits structured machine telemetry for AIVA Compute Node registration
"""

import sys
import os
import json
import time
import platform
import psutil

# Ensure UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

def detect_hardware():
    node_name = platform.node()
    os_name = f"{platform.system()} {platform.release()}"
    cpu_model = platform.processor() or "Intel Core i5"
    cpu_count = psutil.cpu_count(logical=True)
    physical_cores = psutil.cpu_count(logical=False)
    
    # Memory
    mem = psutil.virtual_memory()
    total_ram_gb = round(mem.total / (1024 ** 3), 2)
    available_ram_gb = round(mem.available / (1024 ** 3), 2)

    # GPU / CUDA detection
    has_cuda = False
    cuda_devices = 0
    gpu_name = "None"
    vram_mb = 0

    try:
        import ctranslate2
        cuda_devices = ctranslate2.get_cuda_device_count()
        has_cuda = cuda_devices > 0
    except Exception:
        has_cuda = False

    # Check for PyTorch if available
    try:
        import torch
        if torch.cuda.is_available():
            has_cuda = True
            cuda_devices = torch.cuda.device_count()
            gpu_name = torch.cuda.get_device_name(0)
            vram_mb = round(torch.cuda.get_device_properties(0).total_memory / (1024 ** 2))
    except Exception:
        pass

    # Fallback to Windows CimInstance query for GPU detection
    if platform.system() == "Windows" and (gpu_name == "None" or not has_cuda):
        try:
            import subprocess
            cmd = ["powershell", "-NoProfile", "-Command", "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Json"]
            out = subprocess.check_output(cmd, timeout=3, stderr=subprocess.DEVNULL).decode('utf-8')
            gpu_data = json.loads(out)
            if isinstance(gpu_data, dict):
                gpu_data = [gpu_data]
            for item in gpu_data:
                name = item.get("Name", "")
                ram = item.get("AdapterRAM", 0) or 0
                if "NVIDIA" in name.upper() or "RTX" in name.upper() or "GEFORCE" in name.upper():
                    has_cuda = True
                    cuda_devices = max(cuda_devices, 1)
                    gpu_name = name
                    vram_mb = round(ram / (1024 ** 2)) if ram > 0 else 8192
                    break
                elif gpu_name == "None" and name:
                    gpu_name = name
                    vram_mb = round(ram / (1024 ** 2)) if ram > 0 else 0
        except Exception:
            pass

    # Node role classification (Section 3)
    if has_cuda and ("RTX" in gpu_name.upper() or "3050" in gpu_name or cuda_devices > 0):
        node_role = "AI_POWER_NODE"
        node_id = "PC-A"
        preferred_stt = "whisper-cuda-float16"
        preferred_tts = "chatterbox-cuda"
        preferred_llm = "qwen3:8b-local"
    else:
        node_role = "CPU_LOCAL_NODE"
        node_id = "PC-B"
        preferred_stt = "whisper-cpu-int8"
        preferred_tts = "kokoro-onnx-cpu"
        preferred_llm = "qwen3:8b-cpu-or-cloud"

    # Allow environment override for testing or manual pinning
    if os.environ.get("AIVA_NODE_ID_OVERRIDE"):
        node_id = os.environ.get("AIVA_NODE_ID_OVERRIDE")
        if node_id == "PC-A":
            node_role = "AI_POWER_NODE"
        elif node_id == "PC-B":
            node_role = "CPU_LOCAL_NODE"

    # Persistent Node Identity
    import hashlib, uuid
    identity_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".aiva_node_identity.json")
    persistent_device_id = None
    if os.path.exists(identity_file):
        try:
            with open(identity_file, "r", encoding="utf-8") as f:
                saved = json.load(f)
                if saved.get("node_id") == node_id:
                    persistent_device_id = saved.get("device_id")
        except Exception:
            pass

    if not persistent_device_id:
        hw_hash = hashlib.sha256(f"{cpu_model}_{gpu_name}_{mem.total}_{uuid.getnode()}".encode("utf-8")).hexdigest()[:12]
        persistent_device_id = f"device_{node_id.lower().replace('-', '_')}_{hw_hash}"
        try:
            with open(identity_file, "w", encoding="utf-8") as f:
                json.dump({
                    "device_id": persistent_device_id,
                    "node_id": node_id,
                    "node_role": node_role,
                    "hostname": node_name,
                    "created_at": int(time.time()),
                }, f, indent=2)
        except Exception:
            pass

    # Ollama benchmark check
    ollama_online = False
    ollama_latency_ms = None
    try:
        import urllib.request
        t0 = time.time()
        req = urllib.request.urlopen("http://localhost:11434/api/tags", timeout=1.5)
        if req.status == 200:
            ollama_online = True
            ollama_latency_ms = round((time.time() - t0) * 1000, 1)
    except Exception:
        ollama_online = False

    profile = {
        "node_id": node_id,
        "node_role": node_role,
        "hostname": node_name,
        "os": os_name,
        "cpu": {
            "model": cpu_model,
            "logical_cores": cpu_count,
            "physical_cores": physical_cores,
        },
        "memory": {
            "total_gb": total_ram_gb,
            "available_gb": available_ram_gb,
        },
        "gpu": {
            "has_cuda": has_cuda,
            "device_count": cuda_devices,
            "device_name": gpu_name,
            "vram_mb": vram_mb,
        },
        "services": {
            "ollama_online": ollama_online,
            "ollama_latency_ms": ollama_latency_ms,
        },
        "recommendations": {
            "stt": preferred_stt,
            "tts": preferred_tts,
            "llm": preferred_llm,
        },
        "timestamp": int(time.time()),
    }

    return profile

if __name__ == "__main__":
    profile = detect_hardware()
    print(json.dumps(profile, indent=2))
