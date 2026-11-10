# Deployment & Operations Guide
## Strategic Systems Engine (SSE)

**Document Identifier:** SSE-DEPLOY-001  
**Release:** 1.0.0  

---

### 1. Standalone / Local Deployment

Install directly into a Python 3.11+ environment:
```bash
python -m pip install -e ".[all]"
```

Launch the FastAPI REST API service:
```bash
uvicorn sse.api.app:app --host 0.0.0.0 --port 8000 --workers 4
```

API documentation will be accessible at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- Health check: `http://localhost:8000/api/v1/health`

---

### 2. Docker Container Deployment

Create a `Dockerfile`:
```dockerfile
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY src/ ./src/

RUN pip install --no-cache-dir -e ".[all]"

EXPOSE 8000

CMD ["uvicorn", "sse.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build and run container:
```bash
docker build -t sse-engine:1.0.0 .
docker run -d -p 8000:8000 --name sse sse-engine:1.0.0
```

---

### 3. Production Monitoring & Health Checks

- Health check probe: `GET /api/v1/health` (returns status `200 OK` with JSON `{"status": "healthy"}`).
- Process memory limits: Standard solver instances cap memory consumption below 512MB per process for games up to $10^5$ profiles.

