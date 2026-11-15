# AIVA 2.0 Deep Real-World Acceptance Suite (V2)

This directory contains the second-stage deep revalidation and empirical product acceptance evidence for **AIVA 2.0**.

---

## Directory Index

```text
AIVA_LIVE_ACCEPTANCE_V2/
│
├── README.md
│
├── projects/
│   ├── PROJECT_03_BROWSER_AUTOMATION/         (Live multi-site extraction & downloaded PEP 8)
│   ├── PROJECT_04_UNSEEN_KNOWLEDGE_BASE/      (Unseen Markdown KB with SQLite & REST API)
│   ├── PROJECT_07_DEEP_RESEARCH/              (Post-Quantum Cryptography research report)
│   └── PROJECT_08_REAL_DATA_ANALYSIS/         (Infra cost CSV parsing & deterministic math)
│
├── evidence/
│   ├── screenshots/                           (Live physical phone screenshots via ADB)
│   │   ├── physical_phone_aiva_running.png    (5.8 MB live screenshot on iQOO Neo 10)
│   │   └── physical_phone_after_restart.png   (2.8 MB post-force-stop screenshot)
│   ├── voice_measurements/                    (p50/p95 latency distributions & barge-in)
│   ├── model_inference/                       (Live Ollama inference logs & token metrics)
│   └── verification/                          (JSON verification records for all projects)
│
└── reports/
    ├── INFRASTRUCTURE_REVALIDATION.md
    ├── ANDROID_ACCEPTANCE.md
    ├── VOICE_ACCEPTANCE.md
    ├── BROWSER_COMPUTER_USE_ACCEPTANCE.md
    ├── AUTONOMOUS_ENGINEERING_ACCEPTANCE.md
    ├── CROSS_NODE_ACCEPTANCE.md
    ├── CRASH_RECOVERY_ACCEPTANCE.md
    ├── RESEARCH_ACCEPTANCE.md
    ├── DOCUMENT_PRODUCTIVITY_ACCEPTANCE.md
    ├── MODEL_ROUTING_ACCEPTANCE.md
    ├── SECURITY_ACCEPTANCE.md
    ├── MULTI_AGENT_ACCEPTANCE.md
    ├── PERFORMANCE_STABILITY.md
    ├── COMPETITOR_CAPABILITY_COMPARISON.md
    ├── FAILURE_ANALYSIS.md
    └── FINAL_PRODUCT_ACCEPTANCE.md
```

All operations executed live on physical devices and local models with zero simulation.
