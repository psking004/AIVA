# AIVA External Agent Integrations Specification

**Document Date:** 2026-11-15T19:10:15+05:30  
**Target Node:** iQOO Neo 10 (Snapdragon 8 Gen 3) & PC-B Orchestrator  

---

## 1. Supported Agent Packages on Device

| Agent Application | Verified Package Name | Primary Role | Integration Mode |
| :--- | :--- | :--- | :--- |
| **Hark** | `com.hark.android` | Cloud browser automation, panels, recurring schedules | Intent Handoff & Accessibility Scraping |
| **Freebuff** | `com.freebuff.app` | Zero-cost multi-model coding (GLM 5.3, DeepSeek V4.1) | Mobile Task Dispatch & Checkpointing |
| **Genspark** | `ai.mainfunc.genspark` | Autonomous deep research & document synthesis | Intent Handoff & Checkpoint Monitoring |
| **Manus** | `tech.butterfly.app` | Cloud sandbox execution & Wide Research | Checkpoint State Harvester |

---

## 2. Checkpointing & Free-Tier Token Pre-Exhaustion Protection

External agents operating on free tiers or credit budgets can hit quota limits without warning. AIVA deploys a two-stage watchdog:

1. **45-Second Interval Scraping:**
   - [`AivaAccessibilityService.kt`](file:///C:/Users/bhara/AIVA/apps/mobile/android/app/src/main/java/com/aiva/personal/ai/wakeword/AivaAccessibilityService.kt) traverses the accessibility view hierarchy of the active agent package every 45 seconds.
2. **Emergency Quota-Warning Trigger:**
   - Scans text nodes for keywords: `credit`, `limit reached`, `remaining`, `upgrade`, `free tier`, `out of tokens`, `0 remaining`.
   - On detection, sets `quotaWarning: true` and dispatches state immediately.
3. **Dual-Node Persistence:**
   - Checkpoints are POSTed to `http://10.16.177.59:5050/api/checkpoint/save`.
   - Saved to PC-B disk: `C:\AIVA_Workspace\checkpoints\<app>_checkpoint.md`.
   - Asynchronously mirrored to PC-A: `\\10.16.177.194\AIVA_Workspace\checkpoints\<app>_checkpoint.md`.
