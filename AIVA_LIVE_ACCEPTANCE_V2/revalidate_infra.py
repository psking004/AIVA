"""AIVA 2.0 Live Acceptance V2 - Step 2: Infrastructure and Model Revalidation.

Runs actual inference against available Ollama models, checks PC-A WinRM,
checks ADB Android phone, and Render cloud health.
"""

from __future__ import annotations

import json
import logging
import os
import platform
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("InfraRevalidationV2")

OUT_DIR = REPO_ROOT / "AIVA_LIVE_ACCEPTANCE_V2" / "evidence" / "model_inference"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def test_ollama_model(model_name: str, prompt: str, timeout: int = 30) -> dict:
    """Tests live inference on Ollama and measures latency."""
    url = "http://127.0.0.1:11434/api/generate"
    payload = {
        "model": model_name,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.1, "num_predict": 128}
    }
    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=req_data, headers={"Content-Type": "application/json"})
    
    t_start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            total_duration = time.perf_counter() - t_start
            return {
                "model": model_name,
                "success": True,
                "latency_sec": round(total_duration, 3),
                "eval_count": data.get("eval_count", 0),
                "eval_duration_ns": data.get("eval_duration", 0),
                "tokens_per_sec": round(data.get("eval_count", 0) / (data.get("eval_duration", 1) / 1e9), 2) if data.get("eval_duration") else 0,
                "response_sample": data.get("response", "").strip()[:100],
            }
    except Exception as e:
        total_duration = time.perf_counter() - t_start
        return {
            "model": model_name,
            "success": False,
            "latency_sec": round(total_duration, 3),
            "error": str(e),
        }


def main():
    logger.info("Starting Deep Infrastructure Revalidation...")
    infra_data = {}

    # 1. Local PC-B Hardware Specs
    total, used, free = shutil.disk_usage("C:\\")
    infra_data["pc_b"] = {
        "hostname": socket.gethostname(),
        "platform": platform.platform(),
        "processor": platform.processor(),
        "python": platform.python_version(),
        "disk_c_gb": {"total": round(total/1e9, 2), "used": round(used/1e9, 2), "free": round(free/1e9, 2)},
        "ip_list": socket.gethostbyname_ex(socket.gethostname())[2],
    }

    # 2. Ollama Model Inference Trials
    models_to_test = ["qwen3:4b", "llama3:latest", "qwen3:8b", "qwen3.5:latest"]
    prompt = "State one primary difference between an operating system process and a thread."
    model_results = []
    for m in models_to_test:
        logger.info(f"Testing real inference on model {m}...")
        res = test_ollama_model(m, prompt, timeout=35)
        logger.info(f"Model {m}: success={res['success']}, latency={res['latency_sec']}s")
        model_results.append(res)
    infra_data["model_inference"] = model_results

    # 3. PC-A WinRM Port & WS-Man Check
    pca_ip = "10.16.177.194"
    wsman_proc = subprocess.run(["powershell", "-Command", f"Test-WSMan -ComputerName '{pca_ip}' -ErrorAction SilentlyContinue"], capture_output=True, text=True)
    pca_wsman_ok = wsman_proc.returncode == 0
    infra_data["pc_a"] = {
        "ip": pca_ip,
        "wsman_ok": pca_wsman_ok,
        "wsman_output": wsman_proc.stdout.strip()[:200],
    }

    # 4. Android Device ADB Inspection
    adb_proc = subprocess.run(["adb", "-s", "10BF6B1T1C001BS", "shell", "getprop", "ro.product.model"], capture_output=True, text=True)
    adb_model = adb_proc.stdout.strip()
    adb_bat = subprocess.run(["adb", "-s", "10BF6B1T1C001BS", "shell", "dumpsys", "battery"], capture_output=True, text=True).stdout.strip()
    infra_data["android"] = {
        "device_id": "10BF6B1T1C001BS",
        "model": adb_model,
        "battery_sample": adb_bat.splitlines()[:5] if adb_bat else [],
    }

    # 5. Render Health
    try:
        with urllib.request.urlopen("https://aiva-yitg.onrender.com/health", timeout=5) as r:
            render_res = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        render_res = {"error": str(e)}
    infra_data["render"] = render_res

    # Save evidence
    raw_file = OUT_DIR / "infrastructure_revalidation_raw.json"
    raw_file.write_text(json.dumps(infra_data, indent=2), encoding="utf-8")
    logger.info(f"Infrastructure raw data written to {raw_file}")


if __name__ == "__main__":
    main()
