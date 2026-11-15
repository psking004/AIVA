# Device Inventory: PC-A (Remote Compute Node)

**Hostname / IP:** `10.16.177.194`  
**Subnet:** `10.16.177.0/24`  
**Operating System:** Windows Server / Windows 11 (Microsoft WS-Management Stack 3.0)  
**Open Ports Verified:**
* **5985 / TCP:** Windows Remote Management (WinRM HTTP) — Verified via `Test-WSMan` (`wsmid: wbem/wsman/identity/1/wsmanidentity.xsd`).
* **445 / TCP:** Microsoft-DS (SMB File Sharing) — Port open.
**Status:** **ONLINE & RESPONSIVE**  
**Role in AIVA Fabric:** Dedicated Compute Node, Secondary LLM Inference, Voice Vector Mirror  
