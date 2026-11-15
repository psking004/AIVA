# Device Inventory: PC-B (Primary Orchestration Node)

**Hostname:** `Cosmic_004`  
**Operating System:** Windows 11 Home (Build 10.0.26200-SP0)  
**Primary IP:** `10.16.177.59` (Subnet: `10.16.177.0/24`)  
**Secondary IP / WSL:** `172.22.176.1`  
**CPU Architecture:** Intel Core (Intel64 Family 6 Model 186 Stepping 3, 64-bit)  
**GPU:** Intel(R) Iris(R) Xe Graphics (Driver: 32.0.101.6790, 2,147,479,552 bytes VRAM)  
**Total Physical RAM:** 16,481,336 KB (~16.5 GB)  
**Available RAM:** ~4.8 GB  
**Disk C: Total:** 1,022.96 GB | **Used:** 368.44 GB | **Free:** 654.53 GB  
**Python Runtime:** Python 3.12.10 (64-bit)  
**Node.js / npm:** Available in PATH  

---

## Running Services on PC-B
* **AIVA Kokoro Voice Daemon:** Active on `http://127.0.0.1:5050`
* **Local Ollama Inference Engine:** Active on `http://127.0.0.1:11434`
* **ADB Server:** Active, managing physical USB & Wi-Fi bridges
* **Execution Role:** Preferred Master Orchestrator, Planning Engine, Local Fast-Path LLM, UI Avatar HUD
