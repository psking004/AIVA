# AIVA — TARGET ARCHITECTURE SPECIFICATION
**Product:** AIVA (Artificial Intelligent Virtual Assistant)  
**Classification:** Personal AI Operating System  
**Document Version:** 2.0 Master Architecture Baseline  

---

## 1. Executive Vision & Architectural Tenets

AIVA is a **private, owner-controlled AI operating system** that understands natural speech, reasons across the user's personal context, retains long-term memory, plans multi-step tasks, reads and writes code, and operates fluidly across Windows desktop and Android.

AIVA is strictly **not a chatbot**. The foundation model is an engine inside AIVA; AIVA is the orchestrator.

### The Two Worlds Principle

```
┌────────────────────────────────────────────────────────────────────────┐
│                      WORLD 1: LOCAL / PRIVATE PC                       │
│  - PC-A (RTX 3050 + CUDA) or PC-B (i5 13th Gen CPU)                   │
│  - Local Qwen3 8B inference via Ollama                                │
│  - Local Kokoro (82M ONNX) Text-to-Speech (Zero cloud credit usage)   │
│  - Local Whisper STT daemon (WASAPI 48kHz -> 16kHz)                   │
│  - Full offline capability: PC operates without internet access       │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                      WORLD 2: CLOUD / MOBILE ANDROID                    │
│  - Android is a first-class, independent AIVA client                   │
│  - Operates when PC-A and PC-B are completely POWERED OFF              │
│  - Primary reasoning model: Google Gemini via AIVA Cloud Backend       │
│  - Independent session state, voice interaction, and cloud memory sync│
│  - Zero localhost or PC dependencies                                   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. End-to-End Orchestration Pipeline

```
                              ┌────────────────────────────────────┐
                              │            USER INPUT              │
                              │ (Microphone / Text / Mobile Voice) │
                              └─────────────────┬──────────────────┘
                                                │
                                                ▼
                              ┌────────────────────────────────────┐
                              │            PERCEPTION              │
                              │ - Local Whisper STT (140ms)        │
                              │ - Trailing silence VAD (<450ms)    │
                              └─────────────────┬──────────────────┘
                                                │
                                                ▼
                              ┌────────────────────────────────────┐
                              │       INTENT CLASSIFICATION        │
                              │ - FAST / CONTEXTUAL / AGENTIC      │
                              │ - Deterministic regex & keyword    │
                              └─────────────────┬──────────────────┘
                                                │
                                                ▼
                              ┌────────────────────────────────────┐
                              │        AIVA POLICY ENGINE          │
                              │ - Permission Gate (Levels 0 - 3)   │
                              │ - Credit & Budget Optimization     │
                              │ - Platform Routing Policy          │
                              └─────────────────┬──────────────────┘
                                                │
                         ┌──────────────────────┴──────────────────────┐
                         ▼                                             ▼
          [FAST: Deterministic Path]                    [CONTEXTUAL / AGENTIC Path]
          - Time / Date                                                │
          - System info                                                ▼
          - Overlay toggle                              ┌─────────────────────────────┐
          - Immediate answer                            │      CONTEXT ASSEMBLY       │
                         │                              │ - 3-Layer Memory (Short,    │
                         │                              │   Session, Long-Term RAG)   │
                         │                              │ - Project Context & Tasks   │
                         │                              └──────────────┬──────────────┘
                         │                                             │
                         │                                             ▼
                         │                              ┌─────────────────────────────┐
                         │                              │      CAPABILITY SELECT      │
                         │                              │ - Capability Registry       │
                         │                              │ - Task / Code / File tools  │
                         │                              └──────────────┬──────────────┘
                         │                                             │
                         │                                             ▼
                         │                              ┌─────────────────────────────┐
                         │                              │        MODEL ROUTER         │
                         │                              │ - Android -> Gemini         │
                         │                              │ - PC-A (RTX) -> Qwen Local  │
                         │                              │ - PC-B (CPU) -> Qwen/Cloud  │
                         │                              └──────────────┬──────────────┘
                         │                                             │
                         │                                             ▼
                         │                              ┌─────────────────────────────┐
                         │                              │       TOOL EXECUTION        │
                         │                              │ - Level 0: Safe automatic   │
                         │                              │ - Level 1: Low-risk         │
                         │                              │ - Level 2: User confirmation│
                         │                              │ - Level 3: Explicit auth    │
                         │                              └──────────────┬──────────────┘
                         │                                             │
                         │                                             ▼
                         │                              ┌─────────────────────────────┐
                         │                              │     ACTION VERIFICATION     │
                         │                              │ - Never claim "Done" without│
                         │                              │   verifying exit code/status│
                         │                              └──────────────┬──────────────┘
                         │                                             │
                         │                                             ▼
                         │                              ┌─────────────────────────────┐
                         │                              │        MEMORY UPDATE        │
                         │                              │ - Turn writeback            │
                         │                              │ - Preference extraction     │
                         │                              └──────────────┬──────────────┘
                         │                                             │
                         └──────────────────────┬──────────────────────┘
                                                │
                                                ▼
                              ┌────────────────────────────────────┐
                              │        RESPONSE GENERATION         │
                              │ - Spoken Response (1-2 sentences)  │
                              │ - Display Response (Rich Markdown) │
                              └─────────────────┬──────────────────┘
                                                │
                                                ▼
                              ┌────────────────────────────────────┐
                              │            TTS ROUTER              │
                              │ - Default PC: Kokoro Local (ONNX)  │
                              │ - High Quality PC: Chatterbox (RTX)│
                              │ - Cloud Fallback: ElevenLabs       │
                              │ - Android: Mobile System / Cloud   │
                              └─────────────────┬──────────────────┘
                                                │
                                                ▼
                              ┌────────────────────────────────────┐
                              │        AUDIO & PRESENTATION        │
                              │ - Single-Owner Audio Manager       │
                              │ - Instant Interruption / Barge-in  │
                              │ - Web Audio Analyser (Lip-Sync)    │
                              │ - Floating Holographic Face (60fps)│
                              └────────────────────────────────────┘
```

---

## 3. Hardware & Node Architecture

### Node A: PC-A (AI Power Node)
- **Processor:** Intel Core i5 13th Gen
- **Accelerator:** NVIDIA GeForce RTX 3050 (Dedicated CUDA)
- **Primary Roles:**
  - Local Qwen3 8B inference via Ollama (`float16`)
  - Accelerated Kokoro / Chatterbox local TTS
  - Local neural embeddings & document RAG indexing
  - Coding agent heavy editing & local test runs

### Node B: PC-B (CPU Local Node)
- **Processor:** Intel Core i5 13th Gen (Integrated Graphics)
- **Primary Roles:**
  - Lightweight local inference when latency < 3.0s
  - Local Kokoro TTS (ONNX CPU execution)
  - Local Whisper STT (`int8` CPU execution)
  - Dynamic fallback to Gemini for heavy reasoning workloads

### Node C: Android Client (Autonomous Mobile Node)
- **Connectivity:** Direct HTTPS connection to AIVA Cloud Backend (Render)
- **Primary Roles:**
  - Gemini-powered reasoning with zero PC dependency
  - Mobile voice wake-word & mobile TTS
  - Real-time task, initiative, and memory synchronization

---

## 4. Model Provider Abstraction

All model engines conform to the unified `AivaModelProvider` interface:

```typescript
export interface AivaModelProvider {
  readonly id: string;
  readonly name: string;
  readonly isLocal: boolean;
  
  checkHealth(): Promise<ProviderHealth>;
  chat(messages: AIMessage[], options?: CompletionOptions): Promise<ProviderResponse>;
  streamChat(messages: AIMessage[], onChunk: (chunk: string) => void, options?: CompletionOptions): Promise<ProviderResponse>;
  estimateCost(inputTokens: number, outputTokens: number): number;
}
```

Implementations:
1. `QwenLocalProvider`: Connects to Ollama on `localhost:11434` with zero external network traffic.
2. `GeminiProvider`: Connects to Google Gemini API (`gemini-3.8-flash`) with high-speed streaming.
3. `OpenRouterProvider`: Connects to OpenRouter for specialized fallback or high-capacity models.

---

## 5. Voice & TTS Provider Abstraction

```typescript
export interface AivaTtsProvider {
  readonly id: 'kokoro' | 'chatterbox' | 'elevenlabs';
  readonly isLocal: boolean;

  synthesize(text: string, voiceId?: string): Promise<{ audioBuffer: ArrayBuffer; contentType: string; latencyMs: number }>;
  isAvailable(): Promise<boolean>;
}
```

1. **Kokoro (Primary Local Engine):**
   - 82M open-weight architecture (Apache license).
   - Generates 24kHz audio via ONNX Runtime with <350ms first-chunk latency.
   - Original AIVA female voice profile (`af_bella` / `af_sarah` blend).
2. **Chatterbox (Optional High-Quality Engine):**
   - Benchmarked on RTX 3050 with CUDA acceleration.
3. **ElevenLabs (Cloud Fallback Only):**
   - Retained as an optional cloud provider when local engines are disabled or when explicit studio-quality synthesis is demanded.

---

## 6. Capability & Security Permission Model

AIVA strictly forbids unrestricted shell access. Every action is an authenticated, auditable capability invocation governed by four privilege levels:

```
┌────────────────────────────────────────────────────────────────────────┐
│ LEVEL 0: SAFE (Immediate Execution, Zero Confirmation)                │
│ - Time / Date Query                                                    │
│ - Task / Project / Calendar Read                                       │
│ - Memory & Document Search                                             │
│ - System Information & Health Check                                    │
├────────────────────────────────────────────────────────────────────────┤
│ LEVEL 1: LOW RISK (Autonomous Internal Actions)                        │
│ - Task Creation & Status Updates                                       │
│ - Note Creation & Organization                                         │
│ - Draft Email Creation (Unsent)                                        │
│ - Workspace File Read & Temporary Scratch Edits                        │
├────────────────────────────────────────────────────────────────────────┤
│ LEVEL 2: SENSITIVE (User Confirmation Required)                       │
│ - Dispatching Outgoing Emails / Communications                         │
│ - Modifying Core Project Source Code                                   │
│ - Executing Repository Builds & Test Suites                            │
│ - Moving / Archiving Important Documents                               │
├────────────────────────────────────────────────────────────────────────┤
│ LEVEL 3: HIGH RISK (Explicit Cryptographic / UI Authorization)         │
│ - Deleting Files or Database Records                                   │
│ - Overwriting Git History / Force Pushes                               │
│ - Modifying Security Rules or Environment Variables                    │
│ - Any Financial or Credential Actions (Permanently Blocked)            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Action Verification Principle

AIVA never invents completed actions or assumes positive outcomes. Every agentic operation produces a structured audit state:

$$\text{PLANNED} \longrightarrow \text{EXECUTING} \longrightarrow \begin{cases} \text{SUCCEEDED} & (\text{Exit Code } 0 \land \text{Verification Passed}) \\ \text{FAILED} & (\text{Exception / Non-zero Exit}) \\ \text{PARTIALLY\_SUCCEEDED} & (\text{Edits applied, tests failed}) \end{cases}$$

Example: When instructed *"AIVA, fix the build"*:
1. AIVA inspects compiler errors.
2. Edits the required files.
3. Re-runs `pnpm build`.
4. Only states *"The build is fixed"* if the compiler returns exit code 0. If the build still fails, it truthfully states *"I applied the changes, but the build still fails due to..."*
