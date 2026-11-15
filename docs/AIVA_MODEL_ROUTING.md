# AIVA 2.0 Capability-Based Model Routing

**Module:** `packages/swarm/adapters/model_adapter.py`  
**Endpoint:** Local Ollama (`http://127.0.0.1:11434`) + Cloud Fallback  

---

## 1. Dynamic Model Allocation Matrix

AIVA 2.0 maps task complexity and agent responsibilities to the optimal model tier:

```mermaid
flowchart LR
    Task[Incoming Subtask] --> Router{ModelRouter}
    
    Router -- Coding / Debugging --> M1["qwen3.5:latest (6.59 GB)"]
    Router -- Reasoning / Planning / SSE --> M2["qwen3:8b (5.23 GB)"]
    Router -- General Intelligence --> M3["llama3:latest (4.66 GB)"]
    Router -- Low-Latency Dialogue / Voice --> M4["qwen3:4b (2.50 GB)"]
    Router -- Heavy Bulk Batch --> RemoteNode["PC-A Compute (10.16.177.194)"]
    Router -- Cloud Fallback --> Cloud["OpenRouter / Gemini"]
```

---

## 2. Real Local Ollama Model Inventory (Verified on PC-B)

* `qwen3:4b` (2.50 GB) — Fast chat & voice dialogue (<25 ms)
* `qwen:7b` (4.51 GB) — Multilingual intent classification
* `llama3:latest` (4.66 GB) — General problem-solving
* `qwen3:8b` (5.23 GB) — Complex logic & tool argument verification
* `qwen3.5:latest` (6.59 GB) — Software engineering & multi-file coding
* `sorc/qwen3.5-claude-4.6-opus-q4:latest` (6.59 GB) — Deep autonomous synthesis
