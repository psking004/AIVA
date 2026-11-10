# REST API Specification
## Strategic Systems Engine (SSE)

**Document Identifier:** SSE-API-001  
**Version:** 1.0.0  
**Base URL:** `/api/v1`  
**Protocol:** HTTP/1.1 and HTTP/2 over TLS  
**Payload Format:** `application/json`  

---

### 1. Endpoints Overview

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Operational health and version metadata |
| `POST` | `/api/v1/models/validate` | Validate game definition against mathematical invariants |
| `POST` | `/api/v1/models/create` | Store new game model definition |
| `GET` | `/api/v1/models/{game_id}` | Retrieve stored game definition |
| `GET` | `/api/v1/solvers/list` | List registered mathematical solvers and supported game families |
| `POST` | `/api/v1/solvers/solve` | Execute designated solver against model |
| `POST` | `/api/v1/simulations/run` | Launch discrete simulation run |
| `GET` | `/api/v1/domains/list` | List available domain extensions |

---

### 2. Request & Response Specifications

#### 2.1 Health Check
- **Request:** `GET /api/v1/health`
- **Response 200 OK:**
  ```json
  {
    "status": "ok",
    "version": "0.1.0",
    "uptime_seconds": 1284.5
  }
  ```

#### 2.2 Model Validation
- **Request:** `POST /api/v1/models/validate`
  ```json
  {
    "id": "pd",
    "name": "Prisoner's Dilemma",
    "players": ["A", "B"],
    "actions": {
      "A": ["C", "D"],
      "B": ["C", "D"]
    },
    "payoffs": [
      [3.0, 3.0],
      [0.0, 5.0],
      [5.0, 0.0],
      [1.0, 1.0]
    ]
  }
  ```
- **Response 200 OK:**
  ```json
  {
    "status": "valid",
    "game_id": "pd",
    "players": 2,
    "profiles": 4
  }
  ```
- **Response 400 Bad Request:**
  ```json
  {
    "detail": "Expected 4 payoff profiles; received 3."
  }
  ```

#### 2.3 Solver Execution
- **Request:** `POST /api/v1/solvers/solve`
  ```json
  {
    "game": {
      "id": "pd",
      "name": "Prisoner's Dilemma",
      "players": ["A", "B"],
      "actions": {
        "A": ["C", "D"],
        "B": ["C", "D"]
      },
      "payoffs": [
        [3.0, 3.0], [0.0, 5.0],
        [5.0, 0.0], [1.0, 1.0]
      ]
    },
    "solver": "pure_nash",
    "tolerance": 0.0
  }
  ```
- **Response 200 OK:**
  ```json
  {
    "status": "solved",
    "solver": "pure_nash_enumeration",
    "solution_count": 1,
    "equilibria": [
      {
        "actions": ["D", "D"],
        "payoffs": [1.0, 1.0]
      }
    ],
    "diagnostics": {
      "profiles_examined": 4,
      "unilateral_deviations_checked": 4,
      "tolerance": 0.0
    }
  }
  ```

