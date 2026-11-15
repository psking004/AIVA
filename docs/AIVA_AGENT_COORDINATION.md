# AIVA 2.0 Multi-Agent Coordination & Swarm Architecture

**Module:** `packages/swarm/orchestrator/swarm_engine.py`  
**Communication Bus:** `packages/swarm/communication/message_bus.py`  
**Specialist Catalog:** 14 Registered Agents  

---

## 1. Specialist Agent Catalog

AIVA 2.0 employs 14 specialist agents with least-privilege tool contracts:

| Agent ID | Specialist Role | Tool Access Boundary | Default Model |
| :--- | :--- | :--- | :--- |
| `agent_strategic_planner` | Decision modeling, DAG formulation | SSE Solvers, Model Router | `qwen3:8b` |
| `agent_researcher` | Multi-source knowledge gathering | `ResearchEngine`, Web APIs | `qwen3:8b` |
| `agent_architect` | Architecture & interface compliance | System contracts, AST | `qwen3.5:latest` |
| `agent_coder` | Software development & editing | `CodeEngine`, AST, Git | `qwen3.5:latest` |
| `agent_tester` | Verification & test execution | Test runner, Assertions | `qwen3.5:latest` |
| `agent_security` | Sandboxing & permission checks | Safety rules, Privilege audit | `llama3:latest` |
| `agent_desktop` | Host OS & workspace control | `DesktopTool`, PowerShell | `qwen3:4b` |
| `agent_voice` | Speech synthesis & streaming | Kokoro ONNX, Barge-in | `qwen3:4b` |
| `agent_android` | Mobile node communication | ADB, Android Broadcasts | `qwen3:4b` |
| `agent_infra` | Node health & telemetry | WinRM, Ping, System metrics | `qwen3:4b` |
| `agent_deployment` | Build & deployment verification | Git, Docker, Release tools | `qwen3.5:latest` |
| `agent_reviewer` | Independent audit & verification | Output inspection, Hashes | `qwen3:8b` |
| `agent_memory` | Contextual memory indexing | `MemoryManager` 5 tiers | `llama3:latest` |
| `agent_data` | Structured data & spreadsheet math | `DocumentEngine`, CSV/JSON | `qwen3:8b` |

---

## 2. Inter-Agent Communication Bus

Agents communicate via typed asynchronous messages (`SwarmMessage`):
* `TASK_ASSIGNMENT`: Orchestrator dispatches subtask DAG.
* `RESULT_SUBMISSION`: Agent publishes verified output.
* `FAILURE_NOTIFICATION`: Agent signals error with stack trace.
* `INTERRUPT`: Priority cancellation token propagated to active workers.
