# AIVA — GAP ANALYSIS
**Date:** October 19, 2026  
**Document Status:** Master Product Baseline vs. Target Architecture  
**Comparison:** Current Implementation vs. "AIVA Personal AI Operating System" Specification

---

## 1. High-Level Architectural Delta

```
Target Architecture Component           Current State Status    Gap Severity
-------------------------------------------------------------------------------
1. Kokoro Local TTS (Offline baseline)  Missing (ElevenLabs)    CRITICAL (Quota blocker)
2. AIVA Operating Policy Engine         Missing                 HIGH (Safety & rules)
3. Formal Capability & Tool Registry    Partial (6 basic tools) HIGH (Unstructured)
4. Coding & Computer Work Agent         Missing                 HIGH (Core capability)
5. Dynamic Hardware Node Detection      Missing                 HIGH (PC-A vs PC-B)
6. Android Autonomous Gemini Route      Partial (Shared route)  MEDIUM (Routing policy)
7. Deep Project & Context Awareness     Partial                 MEDIUM (Heuristic match)
8. Action Verification ("Never fake")   Partial (Handled in UI) MEDIUM (Missing in tools)
9. Two-PC Compute Node Registry         Missing                 FUTURE PHASE
```

---

## 2. Deep-Dive Gap Breakdown

### Gap 1: Voice & TTS Independence (Section 13, 14, 15)
- **Current State:** `/api/voice/speak` calls ElevenLabs REST API directly. When the account runs out of character credits (0/10,000), speech synthesis fails with HTTP 401.
- **Target Requirement:**
  - ElevenLabs must NOT be an architectural bottleneck.
  - Baseline local engine: **Kokoro (82M open-weight model)** using fast, local inference (ONNX Runtime / PyTorch).
  - Original AIVA female voice identity: calm, intelligent, warm, subtle British influence.
  - Multi-provider abstraction (`AivaTtsProvider`) supporting `KokoroTtsProvider`, `ChatterboxTtsProvider`, and `ElevenLabsTtsProvider`.
  - Offline capability: PC must speak even with zero internet.

### Gap 2: Hardware-Aware Model Routing (Section 3 & 4)
- **Current State:** Backend `model-router.service.ts` uses static environment variable `AIVA_ROUTING_STRATEGY=local-first`. It attempts `http://localhost:11434` for all requests, regardless of whether it is running on the GPU PC, the CPU PC, or serving a mobile client.
- **Target Requirement:**
  - **Android Clients (`x-client-platform: android`):** Route directly to **Gemini** through the cloud backend. Never attempt Ollama or PC dependency.
  - **PC-A (RTX 3050):** Detect CUDA automatically. Default to local Qwen3 8B.
  - **PC-B (CPU i5):** Benchmark local inference latency. If latency exceeds threshold (>3s), route heavy reasoning to Gemini/cloud.
  - Hardware discovery module to benchmark and profile local nodes.

### Gap 3: AIVA Operating Policy Engine (Section 6 & 10)
- **Current State:** System behavior is steered primarily by a single prompt string in `aiva-personality.ts` and prompt augmentation in `memory-orchestrator.service.ts`.
- **Target Requirement:**
  - A formal `AivaPolicyEngine` that acts as the supervisor across all model engines.
  - Governs model selection, tool selection, permission gates (Levels 0–3), uncertainty handling, and credit budgets.
  - Ensures AIVA maintains its unique identity and strict operational safety regardless of whether Qwen, Gemini, or OpenRouter generates the reasoning tokens.

### Gap 4: Formal Tool & Capability Registry (Section 7 & 8)
- **Current State:** `backend/src/ai/tools/registry.ts` has an in-memory dictionary registering 6 basic tools (`summarize`, `extractEntities`, `classify`, `search`, `createTask`, `createNote`, `createEvent`). There are no parameter schemas, permission level checks, rollback handlers, or verification stages.
- **Target Requirement:**
  - Formal capability registry covering:
    - Task protocols (`TASK_CREATE`, `TASK_UPDATE`, `TASK_COMPLETE`)
    - Temporal protocols (`CALENDAR_READ`, `CALENDAR_CREATE`)
    - Communications (`EMAIL_READ`, `EMAIL_DRAFT`, `EMAIL_SEND`)
    - Project context (`PROJECT_READ`, `PROJECT_UPDATE`)
    - Filesystem (`FILE_READ`, `FILE_WRITE`, `FILE_MOVE`)
    - Code lifecycle (`CODE_READ`, `CODE_SEARCH`, `CODE_EDIT`, `TEST_RUN`, `BUILD_RUN`)
    - System & automation (`SYSTEM_INFO`, `APP_OPEN`, `APP_CLOSE`)
  - Strict 4-Tier Permission Model:
    - **Level 0 (Safe):** Read-only, no confirmation required.
    - **Level 1 (Low-Risk):** Internal task creation/note updates, automatic execution.
    - **Level 2 (Sensitive):** External messaging, project modifications, user confirmation required.
    - **Level 3 (High-Risk):** Destructive file deletion, irreversible system changes, explicit authorization required.
    - **No unrestricted shell execution.**

### Gap 5: Coding & Computer Work Agent (Section 9 & 10)
- **Current State:** AIVA has no code inspection tools, repository search, code editing, or compiler/test verification capabilities.
- **Target Requirement:**
  - Implement the canonical coding loop:
    $$\text{UNDERSTAND} \rightarrow \text{PLAN} \rightarrow \text{EDIT} \rightarrow \text{TEST} \rightarrow \text{INSPECT} \rightarrow \text{REPAIR} \rightarrow \text{RETEST} \rightarrow \text{VERIFY} \rightarrow \text{REPORT}$$
  - AIVA must never claim "Done" without executing the build/test command and confirming exit code 0.

### Gap 6: Project Context & Memory Unification (Section 11 & 12)
- **Current State:** Memory layers (short-term, session, long-term) and Project/Task database tables are queried separately.
- **Target Requirement:**
  - Unified project context resolution: When the user says *"AIVA, continue the authentication work"*, AIVA resolves the active project, recent files, git branch, and pending tasks without asking generic questions.

---

## 3. Remediation Priority Matrix

| Phase | Subsystem | Action Required | Complexity |
|---|---|---|---|
| **Phase 1** | **Local TTS (Kokoro)** | Implement Kokoro ONNX service, `AivaTtsProvider` router, audio streaming, and voice cache. | Moderate |
| **Phase 2** | **Hardware Profiler** | Implement hardware profiler detecting CUDA, CPU, RAM, and model latency on PC-A vs PC-B. | Low |
| **Phase 3** | **Android Isolation** | Ensure Android requests strictly route to Gemini with zero local PC dependencies. | Low |
| **Phase 4** | **Policy Engine** | Build `AivaPolicyEngine` with Level 0–3 capability permissions and budget tracking. | Moderate |
| **Phase 5** | **Capability Registry** | Refactor `ToolRegistry` with Zod/JSON schemas, permission checks, and audit logging. | Moderate |
| **Phase 6** | **Coding Agent** | Build code inspection, file editing, test execution, and build verification workflow. | High |
| **Phase 7** | **Two-PC Nodes** | Create node registration endpoint and dynamic task offloading protocol. | Moderate |
| **Phase 8** | **Full Verification** | End-to-end physical acceptance testing on both PCs and Android. | Moderate |
