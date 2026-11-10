# AIVA & SSE Tri-Node Production Deployment Runbook

This runbook specifies the step-by-step procedures for live deployment across the Sovereign Tri-Node Mesh.

---

## 1. Network Topology & Roles

| Node ID | Physical Host | Hardware Profile | Mesh Role | Default URL |
| :--- | :--- | :--- | :--- | :--- |
| **NODE A** (`PC_A`) | Primary Workstation | Intel Core i5 + NVIDIA RTX 3050 (8GB VRAM) | Orchestrator, Vault, Matrix Solvers | `http://192.168.1.101:8201` |
| **NODE B** (`PC_B`) | Secondary Workstation | Intel Core i5-1335U + Iris Xe (16GB RAM) | Compute Worker, Headless Browser, Swarm Arena | `http://192.168.1.102:8202` |
| **NODE M** (`MOBILE`) | Mobile Device | Android (Termux) / iOS (Pythonista / iSH) | Root-of-Trust Authorizer, Morning Briefs | `http://192.168.1.103:8203` |

---

## 2. Environment Variables & Shared Secret

On all 3 nodes, configure the cluster environment variables before starting:

```bash
# Cluster Shared Root Secret (derive node-specific HMAC keys)
export SSE_CLUSTER_SECRET="sse_sovereign_production_cluster_secret_2026_xyz"

# Network Mesh Routing URLs (replace with local LAN IPs)
export SSE_NODE_A_URL="http://192.168.1.101:8201"
export SSE_NODE_B_URL="http://192.168.1.102:8202"
export SSE_NODE_M_URL="http://192.168.1.103:8203"

# Network Timeout Ceiling (aggressive 1.5s failover to local sovereign fallback)
export SSE_NETWORK_TIMEOUT_SEC="1.5"
```

---

## 3. Node-by-Node Launch Procedures

### A. NODE A (PC-A Orchestrator)
1. Initialize the Zero-Leak Credential Vault:
   ```bash
   sse vault init
   # Prompt: Enter Master Passphrase for AES-256-GCM Vault
   ```
2. Store Connected Account Credentials:
   ```bash
   # Add GitHub Personal Access Token or OAuth client
   sse vault set --category credentials --service github --key token
   ```
3. Launch the Sovereign Mesh Daemon:
   ```bash
   sse node run --role PC_A --port 8201 --host 0.0.0.0
   ```

### B. NODE B (PC-B Compute & Browser Worker)
1. Verify Headless Automation Dependencies:
   ```bash
   playwright install chromium
   ```
2. Launch the Compute Node Daemon:
   ```bash
   sse node run --role PC_B --port 8202 --host 0.0.0.0
   ```
3. Start the Background Proactive Daemon Supervisor:
   ```bash
   python -m aiva.proactive.runner --node-id PC_B --mobile-url http://192.168.1.103:8203
   ```

### C. NODE M (Mobile Root-of-Trust Authorizer)
1. Transfer `sse_standalone.py` to the mobile device (Termux or Pythonista). Zero external pip packages required.
2. Run the Diagnostics Self-Test:
   ```bash
   python sse_standalone.py doctor
   ```
3. Launch the Mobile Daemon:
   ```bash
   python sse_standalone.py run --role MOBILE --port 8203 --host 0.0.0.0
   ```

---

## 4. Quorum Clearance Workflow for Level 3 Actions

When any node triggers a Level 3 irreversible action (e.g. `push_main`, `send_email`, `destructive_terminal`):
1. **Execution Halts:** The initiating node creates an HMAC challenge token and freezes execution.
2. **Mobile Dispatch:** A signed approval challenge is pushed to Mobile Node M:
   ```json
   {
     "action": "push_main",
     "challenge": "chal_4b2c8a71d9e2...",
     "details": "Deploy release v1.0.0 to master branch"
   }
   ```
3. **Approval:** Node M verifies the payload and returns an HMAC-SHA256 signature.
4. **2-of-3 Threshold Gate:** The orchestrator verifies signatures from both PC-A and Mobile Node M via `ThresholdQuorumPolicy`, writes the approval block to `HardenedLedger`, and unfreezes execution.

---

## 5. Failover & Partition Resiliency

- If Node B is powered off or unreachable over LAN:
  - Tasks dispatched to Node B automatically fall back to local execution on PC-A within 1.5 seconds (`fallback_local: True`).
- If Mobile Node M is unreachable:
  - Level 1 (Read-Only) and Level 2 (Drafting/Staging) continue normally.
  - Level 3 actions safely remain halted; no destructive action executes without quorum.

