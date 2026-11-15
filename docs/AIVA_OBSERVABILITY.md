# AIVA 2.0 Observability & Telemetry Framework

**Telemetry Modules:** `packages/swarm/telemetry/metrics.py`, `backend/data/tasks/task_ledger.jsonl`  
**Dashboard Routes:** `http://127.0.0.1:5050/observability`, `http://127.0.0.1:5050/swarm`  

---

## 1. Metrics Tracked

1. **Task Execution Lifecycle:** Step-by-step trace from `RECEIVED` to `COMPLETED` with millisecond timestamps.
2. **Specialist Agent Events:** `STARTED`, `ASSIGNED`, `COMPLETED`, `FAILED` telemetry events.
3. **Solver Performance:** SSE game-theoretic utility scores, risk bounds, and solve times.
4. **Hardware & Model Telemetry:** Model query latencies, provider health, memory consumption.
5. **Disk Event Logs:** Real-time persistence to `docs/visual/swarm-telemetry.json` and `backend/data/tasks/task_ledger.jsonl`.
