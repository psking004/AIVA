# AIVA — MASTER IMPLEMENTATION ROADMAP
**Execution Strategy:** Incremental, Test-Driven Transformation  
**Target Completion:** Full Personal AI Operating System Architecture  

---

## 1. Roadmap Overview & Phased Execution

```
PHASE 1: Local Kokoro TTS Engine & Multi-Provider Abstraction
  └─ Implement Kokoro ONNX service, AivaTtsProvider, Next.js route, offline voice
PHASE 2: Hardware Capability Discovery & Benchmarking
  └─ Detect CUDA vs CPU, benchmark local Qwen3 8B, configure PC-A vs PC-B roles
PHASE 3: Autonomous Android Cloud World Isolation
  └─ Route Android requests strictly to Gemini via Render backend with zero PC dependency
PHASE 4: AIVA Operating Policy Engine
  └─ Create AivaPolicyEngine with 4-tier capability permissions and cost optimization
PHASE 5: Formal Capability Registry & Tool Schemas
  └─ Define formal Zod schemas, timeouts, rollback strategies, and verification handlers
PHASE 6: Coding Agent & Build Verification
  └─ Implement Understand -> Plan -> Edit -> Test -> Verify -> Report pipeline
PHASE 7: Two-PC Compute Node Protocol
  └─ Create node registration API and dynamic task offloading across PC-A and PC-B
PHASE 8: End-to-End Verification & Acceptance Gate
  └─ Validate all 10 physical test scenarios across PC-A, PC-B, and Android
```

---

## 2. Phase-by-Phase Technical Specifications

### Phase 1: Local Kokoro TTS Engine & Multi-Provider Abstraction
- **Goal:** Completely eliminate the ElevenLabs character quota bottleneck by establishing Kokoro as the primary local voice engine.
- **Components:**
  1. `apps/desktop/kokoro-service.py`: Lightweight Python ONNX daemon hosting Kokoro-82M. Remains warm, loads once, accepts text via stdin/HTTP, returns 24kHz float/int16 WAV.
  2. `apps/web/app/api/voice/speak/route.ts`: Multi-provider router checking `AIVA_TTS_PROVIDER` (`kokoro` $\rightarrow$ `elevenlabs`). If Kokoro is active, routes locally; if ElevenLabs is requested, falls back gracefully.
  3. `apps/web/lib/aiva-audio-manager.ts`: Preserves single-owner audio playback, Web Audio Analyser, and viseme calculation.
  4. Voice Caching: In-memory cache for common conversational phrases ("Closing interface", "Good morning", "On it").

### Phase 2: Hardware Discovery & Profiling
- **Goal:** Enable dynamic detection of PC-A (RTX 3050 CUDA) vs PC-B (i5 CPU) to route models intelligently without hardcoded assumptions.
- **Components:**
  1. `scripts/hardware-profiler.py`: Detects GPU vendor, CUDA availability, VRAM, CPU cores, RAM, and benchmark tokens/second on Qwen3 8B.
  2. `backend/src/ai/router/model-router.service.ts`: Integrates hardware profiles into routing logic. If CPU inference exceeds 3.0s, seamlessly offloads heavy tasks to Gemini.

### Phase 3: Android Autonomous Cloud World
- **Goal:** Guarantee that Android continues to think and respond via Gemini when both PCs are completely powered down.
- **Components:**
  1. Backend Request Header Inspection: Inspects `x-client-platform: android` in `aiva.service.ts` and `model-router.service.ts`.
  2. For Android clients, bypasses any localhost Ollama attempt and dispatches directly to `GeminiProvider`.
  3. Validates that Android mobile client handles network disconnects gracefully.

### Phase 4: AIVA Operating Policy Engine
- **Goal:** Create the proprietary supervision layer that governs autonomous decision making, safety boundaries, and credit budgets.
- **Components:**
  1. `backend/src/ai/policy/aiva-policy-engine.ts`:
     - Checks capability permissions (Level 0: Safe, Level 1: Low-Risk, Level 2: Sensitive, Level 3: High-Risk).
     - Tracks daily cloud token usage and halts runaway inference loops.
     - Enforces concise voice response formatting (1–2 sentences for speech).

### Phase 5: Capability & Tool Registry Hardening
- **Goal:** Replace ad-hoc tools with a production-grade capability registry.
- **Components:**
  1. `backend/src/ai/tools/registry.ts`:
     - Zod schemas for all tool parameters.
     - Verification handlers returning structured `{ status: 'SUCCESS' | 'FAILURE', details: ... }`.
     - Rollback hooks for file/task operations.

### Phase 6: Coding Agent & Build Verification
- **Goal:** Provide AIVA with authentic repository understanding, code editing, and compiler verification capabilities.
- **Components:**
  1. `backend/src/ai/agents/coding.agent.ts`:
     - Code Search & Inspection: Grep, AST tree, file reading.
     - Controlled File Editing: Single and multi-chunk diff applications.
     - Verification Loop: Runs `pnpm build` or `pnpm test` and inspects exit code.
     - Strict rule: Never report "Fixed" unless exit code is 0.

### Phase 7: Two-PC Compute Node Protocol
- **Goal:** Connect PC-A and PC-B as coordinated compute nodes.
- **Components:**
  1. `ComputeNodeRegistry`: Endpoints to register `deviceId`, GPU, models, latency, and online status.
  2. Dynamic Workload Offloading: Dispatches local tasks to PC-A if online; falls back to PC-B or cloud.

### Phase 8: Acceptance Testing & Delivery
- **Goal:** Physically test the 10 core verification scenarios defined in the master specification.
