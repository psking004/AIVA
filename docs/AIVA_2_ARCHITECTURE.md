# AIVA 2.0 System Architecture & Unified Intelligence Blueprint

**Version:** 2.0.0-PROD  
**Architect:** AIVA Autonomous Engineering Agent  
**Target Systems:** PC-B (Master Orchestrator), PC-A (Compute Node), iQOO Neo 10 (Mobile Voice Node), Cloud Fallback  

---

## 1. Architectural Philosophy: The Unified Intelligence Loop

AIVA 2.0 transitions from a fragmented set of reactive scripts to a **closed-loop autonomous intelligence fabric**. The system adheres strictly to the **Inspect → Reason → Plan → Act → Inspect → Recover → Verify** operational loop.

```mermaid
flowchart TD
    User([User Voice / Text Request]) --> Wake[Wake Gate & Speech Recognition]
    Wake --> ConvLayer[Conversational Intelligence Layer]
    
    subgraph Core Intelligence
        ConvLayer --> Intent{Complexity Gate}
        Intent -- Direct Conversational Turn --> FastPath[Conversation Engine / Kokoro Streaming TTS]
        Intent -- Complex Multi-Step Task --> TaskLifecycle[Persistent Task Lifecycle Engine]
        
        TaskLifecycle --> SSE[Strategic Systems Engine (SSE) Game-Theoretic Solver]
        SSE --> Swarm[14 Specialist Multi-Agent Swarm]
        Swarm --> ModelRouter[Capability-Based Model Router]
        ModelRouter --> LocalOllama[Local Ollama (PC-B: Qwen3.5, Llama3, Qwen3:8b)]
        ModelRouter --> CloudLLM[Cloud Fallback (OpenRouter / Gemini)]
    end
    
    subgraph Real Autonomous Tool Execution Fabric
        Swarm --> ToolBus{Tool Execution Engine}
        ToolBus --> BrowserTool[Browser Automation Tool]
        ToolBus --> DesktopTool[Desktop Computer-Use Tool]
        ToolBus --> CodeEngine[Software Engineering Engine]
        ToolBus --> ResearchEngine[Research & Citations Engine]
        ToolBus --> DocEngine[File & Productivity Engine]
        ToolBus --> Integrations[Personal Integrations: Hark, Freebuff, Genspark, Manus]
    end
    
    subgraph Durability & Memory
        TaskLifecycle <--> Ledger[(Persistent JSONL Task Ledger & Checkpoints)]
        ConvLayer <--> Memory[(Multi-Tier Memory: Short-Term, Working, Project, Long-Term)]
    end
    
    subgraph Verification & Presentation
        ToolBus --> Verifier[Independent Verification Engine]
        Verifier -- Verification Failed --> TaskLifecycle
        Verifier -- Verification Succeeded --> Presentation[Clause-Streamed Presentation Layer]
        Presentation --> KokoroAudio[Kokoro TTS: af_bella @ 1.05 speed]
        Presentation --> HUD[Single-Instance HUD Avatar & Reactive Transcript]
    end
```

---

## 2. Core Architectural Subsystems

### 2.1 Conversational Intelligence Layer
* **Speech Input:** Full-duplex speech recognition with background wake-word gating (30 ms candidate match).
* **Personality & Dialogue Context:** Warm, natural, friendly female persona with adaptive empathy, multi-turn working memory, and native English, Tamil, and Tanglish comprehension.
* **Barge-In Protection:** Instant interruption (<50 ms) pausing audio synthesis on user speech activity or UI tap.

### 2.2 Reasoning & Planning Engine (SSE + Swarm)
* **Strategic Systems Engine (SSE):** Evaluates multi-criteria tradeoffs, utility curves, game-theoretic Nash equilibrium solutions, and hierarchical task DAGs.
* **14 Specialist Agents:** Distinct operational responsibilities (Planner, Researcher, Architect, Coder, Tester, Security, Desktop, Voice, Android, Infra, Memory, Data, Integration, Verifier).
* **Dynamic Model Router:** Maps each agent subtask to optimal models:
  * Reasoning & Planning: `qwen3:8b` / `llama3:latest` (Local PC-B) or DeepSeek R1 (Cloud).
  * Coding & Debugging: `qwen3.5:latest` (Local PC-B).
  * Fast Dialogue: `qwen3:4b` (Local PC-B).
  * Heavy Compute / Bulk Jobs: Remote PC-A (port 5985/11434).

### 2.3 Persistent Task Lifecycle Engine
Tasks traverse a strict 10-state finite state machine with automatic checkpointing and crash recovery:
$$\text{RECEIVED} \rightarrow \text{UNDERSTANDING} \rightarrow \text{PLANNING} \rightarrow \text{AWAITING\_APPROVAL} \rightarrow \text{EXECUTING} \rightarrow \text{VERIFYING} \rightarrow \text{COMPLETED}$$
*(With auxiliary states: $\text{BLOCKED}$, $\text{FAILED}$, $\text{RECOVERING}$)*
* **Durable Storage:** Every state change, tool call, output artifact, and verification record is atomically committed to `backend/data/tasks/task_ledger.jsonl`.
* **Crash Resumption:** Upon service restart, any task in `EXECUTING` or `PLANNING` is automatically reloaded and recovered from its latest checkpoint.

### 2.4 Autonomous Tool Execution Engine
Zero simulated tools. Every tool interfaces with actual system APIs:
1. **Browser Tool (`packages/tools/browser_tool.py`):** Real HTTP/DOM scraping, element extraction, form automation, and headless browser workflows.
2. **Desktop Tool (`packages/tools/desktop_tool.py`):** Real workspace command execution, exit code verification, window focus checks, and directory sandboxing.
3. **Software Engineering Engine (`packages/tools/code_engine.py`):** File reading, syntax tree parsing, multi-file atomic edits, build execution, test runner, and error correction loop.
4. **Research Engine (`packages/tools/research_engine.py`):** Real-world information retrieval across multiple web sources, source citation tracking, and factual consistency verification.
5. **File & Productivity Engine (`packages/tools/document_engine.py`):** Structured document creation (Markdown, PDF, CSV, XLSX, JSON) with verified mathematical calculations.

### 2.5 Independent Verification Engine
Execution is never considered complete until independently verified:
* Did the tool produce the required file?
* Does the file contain valid syntax and expected schemas?
* Do the unit tests pass with exit code 0?
* Does the output directly satisfy the user's initial objective?

### 2.6 Tri-Node Execution Fabric
* **PC-B:** Primary orchestration, local desktop HUD, Kokoro streaming TTS, local Ollama models (`qwen3.5`, `qwen3:8b`, `llama3`).
* **PC-A:** Remote heavy compute, Voice Vector mirror, secondary Ollama inference over WinRM / HTTP.
* **iQOO Neo 10 Mobile:** Edge microphone capture, local wake-word listener, dynamic subnet auto-discovery (`10.16.177.x`), daily audio briefing harvester.
* **Cloud Nodes:** Render keep-warm server (`https://aiva-yitg.onrender.com`), OpenRouter/Gemini API fallbacks.

