# AIVA Sovereign Tri-Node Architecture Specification

**Document Date:** 2026-11-15T19:10:30+05:30  
**Topology:** Peer-Capable Distributed Fabric with Preferred Orchestrator  

---

## 1. Node Topology & Logical Identifiers

```mermaid
graph TD
    subgraph Sovereign Tri-Node Fabric
        PCB["aiva-pc-b<br/>Primary Orchestrator<br/>(10.16.177.59:5050)"]
        PCA["aiva-pc-a<br/>Compute Node<br/>(10.16.177.194:5985)"]
        Mobile["aiva-mobile<br/>Voice & Touch Node<br/>(iQOO Neo 10)"]
        Cloud["aiva-cloud<br/>Recovery Anchor<br/>(Render Cloud)"]
    end

    Mobile <-->|Dynamic Discovery / Direct HTTP| PCB
    Mobile <-->|Direct Compute Delegation| PCA
    PCB <-->|WinRM / SMB / Kokoro Peer| PCA
    PCB <-->|Keep-Warm Daemon (12-min)| Cloud
    Mobile -.->|Recovery Fallback| Cloud
```

---

## 2. Node Roles & Hardware Matrix

### PC-B (`aiva-pc-b`) — Preferred Orchestrator
- **Processor:** Intel Core i7-13700HX / i5 Workstation (16 cores, 24 threads).
- **Responsibilities:**
  - Fast chat, general reasoning, Kokoro TTS daemon (`af_bella` @ $1.05\times$).
  - SSE planning engine and tool execution lifecycle.
  - Multi-agent checkpoint storage and Render keep-warm daemon.
  - Fabric briefing synthesis (weather, process telemetry, node reachability).

### PC-A (`aiva-pc-a`) — Compute Node
- **Processor & GPU:** Intel Core i5 13th-Gen, NVIDIA GeForce RTX 3050 GPU.
- **Responsibilities:**
  - High-throughput coding and reasoning models.
  - GPU-accelerated workloads.
  - Secondary model hosting and asynchronous task execution.
  - SMB checkpoint mirror (`\\10.16.177.194\AIVA_Workspace`).

### Mobile (`aiva-mobile`) — Physical Interface Node
- **Device:** vivo iQOO Neo 10 (Snapdragon 8 Gen 3, Android 14 / OriginOS 5).
- **Responsibilities:**
  - Floating holographic UI and voice synthesis lip-sync.
  - Dual-engine STT and bold natural TTS playback.
  - Bluetooth / AirPods high-fidelity A2DP and SCO stem-mic routing.
  - Hands-free accessibility automation and external agent checkpoint scraping.

### Cloud Anchor (`aiva-cloud`) — Render Recovery
- **Host:** `https://aiva-yitg.onrender.com`
- **Role:** Fallback intelligence engine and state anchor when workstation nodes are offline.
