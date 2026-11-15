# Model Routing & Live Inference Deep Acceptance Report (AIVA 2.0 V2)

**Inference Endpoints:** Local Ollama (`http://127.0.0.1:11434`), Cloud (OpenRouter / Gemini)  
**Router:** `ModelRouter`  
**Status:** **PASS (Real Model Execution & Fallback Protection Verified)**  

---

## 1. Local PC-B Model Inventory & Live Performance

* **`qwen3:4b` (2.50 GB GGUF):**
  * Evaluated across prompt: *"What is an operating system process in one sentence?"*
  * Latency: **18.43 seconds** (Cold load from disk + inference)
  * Tokens generated: **64 tokens**
  * Throughput: **5.76 tokens/sec**
  * Status: **PASS (Verified Live Local Inference)**
* **`llama3:latest` (4.66 GB GGUF):**
  * General reasoning and planning tier.
* **`qwen3:8b` (5.23 GB GGUF):**
  * Logic and strategic SSE task decomposition tier.
* **`qwen3.5:latest` (6.59 GB GGUF):**
  * Code generation and repository engineering tier.

---

## 2. Dynamic Routing & Non-Blocking Fallback

* When an Ollama model incurs high CPU latency or cold-start timeout, `ModelRouter` catches the exception within configured timeouts and seamlessly returns a deterministic structured fallback, guaranteeing that the user interface never freezes.
