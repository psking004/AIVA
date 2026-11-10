# Data Model & Serialization Specification
## Strategic Systems Engine (SSE)

**Document Identifier:** SSE-DATA-001  
**Version:** 1.0.0  
**Schema Format:** JSON Schema Draft 2020-12 compatible  

---

### 1. Canonical Finite Normal-Form Game Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FiniteNormalFormGame",
  "type": "object",
  "required": ["id", "name", "players", "actions", "payoffs"],
  "properties": {
    "id": {
      "type": "string",
      "minLength": 1,
      "description": "Unique model identifier"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "description": "Human-readable game title"
    },
    "players": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 },
      "minItems": 2,
      "uniqueItems": true,
      "description": "List of player IDs in canonical index order"
    },
    "actions": {
      "type": "object",
      "description": "Map from player ID to ordered list of distinct action names",
      "additionalProperties": {
        "type": "array",
        "items": { "type": "string", "minLength": 1 },
        "minItems": 1,
        "uniqueItems": true
      }
    },
    "payoffs": {
      "type": "array",
      "description": "Payoff profiles in lexicographical product order of player actions",
      "items": {
        "type": "array",
        "items": { "type": "number" }
      }
    }
  }
}
```

---

### 2. Extensive-Form Tree Representation Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ExtensiveFormGame",
  "type": "object",
  "required": ["id", "name", "players", "root_id", "nodes"],
  "properties": {
    "id": { "type": "string" },
    "name": { "type": "string" },
    "players": {
      "type": "array",
      "items": { "type": "string" }
    },
    "root_id": { "type": "string" },
    "nodes": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["node_id", "node_type"],
        "properties": {
          "node_id": { "type": "string" },
          "node_type": { "enum": ["DECISION", "CHANCE", "TERMINAL"] },
          "player_id": { "type": ["string", "null"] },
          "info_set_id": { "type": ["string", "null"] },
          "actions": {
            "type": "array",
            "items": {
              "type": "array",
              "items": [{ "type": "string" }, { "type": "string" }]
            }
          },
          "payoffs": {
            "type": ["array", "null"],
            "items": { "type": "number" }
          },
          "chance_probs": {
            "type": ["array", "null"],
            "items": { "type": "number" }
          }
        }
      }
    }
  }
}
```

---

### 3. Cooperative Characteristic Function Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CooperativeGame",
  "type": "object",
  "required": ["id", "name", "players", "characteristic_values"],
  "properties": {
    "id": { "type": "string" },
    "name": { "type": "string" },
    "players": {
      "type": "array",
      "items": { "type": "string" }
    },
    "characteristic_values": {
      "type": "object",
      "description": "Mapping from comma-separated sorted player IDs to coalition value v(S)",
      "additionalProperties": { "type": "number" }
    }
  }
}
```

---

### 4. Solver Output Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "SolverResultEnvelope",
  "type": "object",
  "required": ["status", "solution_count", "solver", "diagnostics", "solutions"],
  "properties": {
    "status": { "type": "string", "enum": ["solved", "no_solution", "timeout", "approximate", "error"] },
    "solution_count": { "type": "integer", "minimum": 0 },
    "solver": {
      "type": "object",
      "properties": {
        "solver": { "type": "string" },
        "method": { "type": "string" },
        "exact": { "type": "boolean" },
        "tolerance": { "type": ["number", "null"] },
        "notes": { "type": "array", "items": { "type": "string" } }
      }
    },
    "diagnostics": { "type": "object" },
    "solutions": { "type": "array" }
  }
}
```

