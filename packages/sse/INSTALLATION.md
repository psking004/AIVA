# Installation Guide
## Strategic Systems Engine (SSE)

**Document Identifier:** SSE-INSTALL-001  
**Release:** 1.0.0  

---

### 1. Prerequisites

- Python 3.11, 3.12, or 3.13 (64-bit)
- Standard packaging tooling: `pip >= 24.0`, `setuptools >= 69.0`
- Operating Systems: Windows 10/11, macOS 12+, Linux (Ubuntu 22.04+, Debian 12+, RHEL 9+)

---

### 2. Standard Virtual Environment Setup

#### Windows (PowerShell):
```powershell
# Clone or navigate to the repository
cd c:\Users\PARTHASARATHI\GAME_THEORY\strategic-systems-engine

# Create isolated virtual environment
python -m venv .venv

# Activate environment
.venv\Scripts\Activate.ps1

# Install in editable mode with development dependencies
python -m pip install -e ".[dev,science,api]"
```

#### Linux / macOS (Bash / Zsh):
```bash
cd strategic-systems-engine
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev,science,api]"
```

---

### 3. Installation Flavors

SSE supports modular installation depending on operational needs:

1. **Lightweight Core (Zero Binary Dependencies):**
   ```bash
   pip install -e .
   ```
   *Provides pure normal-form games, pure Nash enumeration, discrete action spaces, and CLI.*

2. **Scientific & Optimization Accelerator:**
   ```bash
   pip install -e ".[science]"
   ```
   *Enables NumPy linear algebra, SciPy HiGHS simplex solver, and nonlinear optimization.*

3. **REST API Microservice:**
   ```bash
   pip install -e ".[api]"
   ```
   *Enables FastAPI, Uvicorn ASGI server, and Pydantic validation.*

4. **Complete Research Platform:**
   ```bash
   pip install -e ".[all]"
   ```
   *Installs all development, scientific, testing, and API packages.*

---

### 4. Verification of Installation

Run the complete test suite to verify full system integrity:
```powershell
pytest
sse --version
sse list-solvers
sse list-domains
```

