# AIVA 2.0 Tri-Node Distributed Execution Fabric

**Topology:** Sovereign Tri-Node Architecture  
**Network Subnet:** `10.16.177.x`  

---

## 1. Node Topology & Responsibilities

```mermaid
flowchart TD
    User([User Voice]) --> Mobile[iQOO Neo 10 Node: 10.16.177.243]
    Mobile -- Dynamic Subnet Auto-Discovery --> PCB[PC-B Master Node: 10.16.177.59]
    
    subgraph PC-B Master Orchestrator
        PCB --> Port5050[Kokoro TTS & Task Daemon :5050]
        PCB --> Port11434[Local Ollama Models :11434]
        PCB --> ElectronApp[Single-Instance HUD Avatar]
    end
    
    subgraph PC-A Compute Node
        PCB -- WinRM Port 5985 / SMB --> PCA[PC-A Node: 10.16.177.194]
        PCA --> BulkInference[Heavy Compute & Voice Vector Mirror]
    end
    
    subgraph Cloud Fallback
        PCB -. Render Keep-Warm .-> Render[aiva-yitg.onrender.com]
        PCB -. Cloud API .-> OpenRouter[OpenRouter / Gemini]
    end
```

### 1.1 Verified Physical Node States
* **PC-B:** Master host (`10.16.177.59`). Port 5050 active (`status: ready`). Port 11434 active with 7 local models. Single-instance Electron HUD lock active.
* **PC-A:** Remote compute (`10.16.177.194`). TCP port 5985 verified OPEN.
* **iQOO Neo 10 Mobile:** Connected over USB (`10BF6B1T1C001BS`) and Wi-Fi (`10.16.177.243:5555`). Background wake word service active without media audio focus hijacking.

