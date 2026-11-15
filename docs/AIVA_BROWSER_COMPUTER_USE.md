# AIVA 2.0 Browser Automation & Computer Use

**Modules:** `packages/tools/browser_tool.py`, `packages/tools/desktop_tool.py`  
**Security Boundary:** Safe Workspace Sandboxing  

---

## 1. Browser Automation Capabilities (`BrowserTool`)

* **HTTP Navigation:** Navigates web endpoints with standard desktop user-agent emulation.
* **HTML/DOM Scraping:** Cleans scripts and stylesheets, parses document titles, extracts structured plain text, and indexes page hyperlinks.
* **Form Submission:** Encodes and submits data via HTTP GET/POST with status code tracking.
* **Latency & Failure Recovery:** Configurable timeouts (default 15s) with automated error reporting.

---

## 2. Desktop Computer-Use Capabilities (`DesktopTool`)

* **Workspace Execution:** Direct execution of PowerShell and command-line scripts within the project workspace (`C:\Users\bhara\AIVA`).
* **Environment Inspection:** Checks process states, disk paths, working directories, and system telemetry.
* **Strict Safety Boundaries:** Intercepts and blocks destructive commands:
  * `format`
  * `del /s /q c:\`
  * `rmdir /s /q c:\`
  * `drop database`
  * `shutdown`
  * `reg delete`
* **Real Verification Evidence:** Benchmark C verified real browser fetch (status code 200) and real PowerShell command execution while blocking forbidden commands.

