# AIVA 2.0 Live Real-World Acceptance Suite

This directory contains the complete real-world execution evidence, device inventories, generated projects, test suites, and acceptance reports demonstrating the live capabilities of **AIVA 2.0**.

---

## Directory Index

```text
AIVA_LIVE_ACCEPTANCE/
│
├── README.md
│
├── device_inventory/
│   ├── PC_A.md           (WinRM 5985 & SMB verified on 10.16.177.194)
│   ├── PC_B.md           (Cosmic_004, 16GB RAM, Iris Xe, Ollama & Kokoro)
│   ├── ANDROID.md        (iQOO Neo 10, Android 16, SDK 36 via ADB)
│   └── SERVICES.md       (Port mappings & health check telemetry)
│
├── projects/
│   ├── PROJECT_01_PC_A_EXPENSE_TRACKER/      (Working responsive SPA & tests)
│   ├── PROJECT_02_PC_B_TASK_MANAGER/         (Full-stack SQLite & REST API)
│   ├── PROJECT_03_ANDROID_DAILYFLOW/         (Native Android Kotlin app)
│   ├── PROJECT_04_CROSS_NODE_INVENTORY/      (Distributed multi-node app)
│   ├── PROJECT_05_BROWSER_RESEARCH/          (Live browser extraction & report)
│   ├── PROJECT_06_DEBUGGING/                 (3 defects reproduced & patched)
│   ├── PROJECT_07_RESEARCH_REPORT/           (Transformers vs Mamba SSM report)
│   └── PROJECT_08_DATA_PRODUCTIVITY/         (Expense CSV parsing & exact math)
│
├── evidence/
│   ├── screenshots/                          (Live phone screen captures)
│   ├── voice_measurements/                   (Latency & barge-in measurements)
│   └── verification/                         (JSON verification ledgers)
│
└── reports/
    ├── INFRASTRUCTURE_BASELINE.md
    ├── PC_A_ACCEPTANCE.md
    ├── PC_B_ACCEPTANCE.md
    ├── ANDROID_ACCEPTANCE.md
    ├── CROSS_NODE_ACCEPTANCE.md
    ├── COMPUTER_USE_ACCEPTANCE.md
    ├── SOFTWARE_ENGINEERING_ACCEPTANCE.md
    ├── RESEARCH_ACCEPTANCE.md
    ├── VOICE_ACCEPTANCE.md
    ├── RESILIENCE_ACCEPTANCE.md
    ├── COMPETITOR_CAPABILITY_COMPARISON.md
    ├── FAILURE_ANALYSIS.md
    └── FINAL_PRODUCT_ACCEPTANCE.md
```

All operations were executed live on physical hardware and local models with zero simulation.

