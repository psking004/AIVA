# Failure Analysis & Incident Diagnostic Runbook (AIVA 2.0 V2)

**Document Role:** System Fault Trace & Root Cause Analysis  

---

## 1. Documented Real-World Incidents & Resolutions

### Incident 1: HTTP 403 Anti-Scraping Block on W3C.org
* **Symptom:** Browser automation raised `HTTP Error 403: Forbidden` when fetching `https://www.w3.org/`.
* **Root Cause:** W3C edge proxies enforce strict user-agent filtering and block automated programmatic scrapers.
* **Resolution:** Implemented anti-scraping gate detection in `BrowserTool`. When an endpoint returns HTTP 403 or 429, the engine tags `access_allowed: false` and `anti_bot_block_detected: true`, logs the edge block, and falls back to open mirrors (Python PEPs, Wikipedia, IETF RFC) without aborting the task.

### Incident 2: Invalid State Machine Transition Bypass
* **Symptom:** Cross-node task test threw `ValueError: Invalid state transition from EXECUTING to COMPLETED`.
* **Root Cause:** Script attempted to transition directly from `EXECUTING` to `COMPLETED` without traversing `VERIFYING`.
* **Resolution:** Corrected test harness to adhere strictly to the formal 10-state lifecycle:
  $$\text{EXECUTING} \rightarrow \text{VERIFYING} \rightarrow \text{COMPLETED}$$
  Proved that `TaskLifecycleEngine` successfully guards against unauthorized state skips.

### Incident 3: ModuleNotFoundError on Standalone Script Invocations
* **Symptom:** `AIVA_LIVE_ACCEPTANCE_V2/test_voice_pipeline_v2.py` failed on `import packages`.
* **Root Cause:** Running scripts from a subfolder does not include repository root in `sys.path`.
* **Resolution:** Added `sys.path.insert(0, str(REPO_ROOT))` in all test drivers.
