# Performance, Resource Telemetry & Stability Report (AIVA 2.0 V2)

**Host Platform:** PC-B (`Cosmic_004`, Windows 11 Build 10.0.26200-SP0)  
**Processor:** Intel(R) Core(TM) (Intel64 Family 6 Model 186)  
**Total Physical RAM:** 16.5 GB  
**VRAM:** 2.0 GB (Intel Iris Xe Graphics)  
**Status:** **STABLE (Zero Process Leaks, Single-Instance Lock Enforced)**  

---

## 1. Resource Consumption Benchmarks

| System State | CPU Utilization | Available RAM | GPU Memory | AIVA Process Count | Active Port Daemons |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Idle State** | 3 - 6% | 4.8 GB | <200 MB | 1 (`AIVA.exe` lock) | Kokoro (:5050), Ollama (:11434) |
| **Kokoro Audio Stream** | 12 - 18% | 4.6 GB | <250 MB | 1 | :5050 active streaming |
| **Ollama 4B Inference** | 85 - 98% (CPU) | 3.5 GB | Shared | 1 | :11434 generating tokens |
| **Full Swarm Run** | 20 - 35% | 4.4 GB | <250 MB | 1 | Local tools, SQLite |

---

## 2. Long-Running Stability Findings

1. **Elimination of Duplicate Instances:**
   * Electron `app.requestSingleInstanceLock()` prevented leaked duplicate `AIVA.exe` background processes.
2. **Audio Focus Coexistence:**
   * Mobile background listener operates in unmanaged audio focus without silencing phone calls or media players.
3. **Ledger Concurrency:**
   * Thread-safe locking around `task_ledger.jsonl` ensured zero file corruption across simultaneous task states.
