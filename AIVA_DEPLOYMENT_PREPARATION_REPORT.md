# AIVA — Deployment Preparation Report

## 1. Current Deployment Architecture

AIVA operates across a hybrid multi-client, local-first / cloud-fallback topology:

```
┌────────────────────────────────────────────────────────┐
│                   CLIENT SURFACES                      │
├────────────────────┬──────────────────┬────────────────┤
│   Desktop Client   │   Mobile App     │   Web App      │
│ (Electron / Python)│  (React Native)  │   (Next.js)    │
│  [Local / Hybrid]  │  [Cloud Direct]  │ [Cloud Direct] │
└─────────┬──────────┴────────┬─────────┴────────┬───────┘
          │                   │                  │
          ▼                   ▼                  ▼
┌────────────────────────────────────────────────────────┐
│                  AIVA CLOUD BACKEND                    │
│            (NestJS / Express / Node.js)                │
├────────────────────┬──────────────────┬────────────────┤
│  AI Model Router   │ 3-Tier Memory    │ Feature APIs   │
│ (Qwen/Gemini/Ollama)│ (Redis / Disk)  │ (Projects,etc.)│
└─────────┬──────────┴────────┬─────────┴────────┬───────┘
          │                   │                  │
          ▼                   ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────┐
│ Managed Postgres │ │  Upstash Redis   │ │ AI Cloud APIs│
│    (Supabase)    │ │   (Cloud TLS)    │ │ (OpenRouter/ │
│                  │ │                  │ │   Gemini)    │
└──────────────────┘ └──────────────────┘ └──────────────┘
```

- **Desktop (`apps/desktop` + `aiva_desktop`)**: Local-first operation utilizing local Ollama Qwen3 8B if available, with transparent fallback to cloud providers via the private backend or direct API calls.
- **Mobile (`apps/mobile`)**: Connects strictly to the private cloud backend via `EXPO_PUBLIC_AIVA_API_URL`. Zero local Ollama dependencies and zero client-side vendor API keys.
- **Web (`apps/web`)**: Connects to the private cloud backend via `NEXT_PUBLIC_AIVA_API_URL`.
- **Backend (`@aiva/backend`)**: Hosted on cloud infrastructure (e.g. Render) communicating with PostgreSQL (Supabase) and Redis (Upstash).

---

## 2. Required Production Services

| Service | Provider Recommendation | Purpose | Connection Protocol |
| :--- | :--- | :--- | :--- |
| **Backend API** | Render / Fly.io / Railway | Core application and AI routing engine | HTTP / HTTPS (Port 10000 / 4000) |
| **PostgreSQL Database** | Supabase / AWS RDS / Neon | Primary relational store & Prisma migrations | `postgresql://...` (Port 5432 / 6543) |
| **Redis Cache** | Upstash Redis / Managed Cloud | Distributed rate limiting & conversation caching | `rediss://...` (TLS Port 6379) |
| **Primary Cloud LLM** | OpenRouter (`qwen/qwen-2.5-72b-instruct`) | Heavy reasoning and cloud AI generation | HTTPS REST API |
| **Secondary Cloud LLM** | Google Gemini (`gemini-1.5-flash` / `gemini-3.8-flash`) | Fast fallback and multimodal inference | HTTPS REST API |

---

## 3. Required Environment Variables

The production template has been established at [deployment/.env.production.example](file:///c:/Users/bhara/AIVA/deployment/.env.production.example).

### Public & Non-Secret Variables
- `NODE_ENV=production`
- `PORT=10000`
- `AIVA_ROUTING_STRATEGY=cloud-first`
- `AIVA_CLOUD_PROVIDER=openrouter`
- `AIVA_CLOUD_ENABLED=true`
- `AI_TEMPERATURE=0.7`
- `AI_MAX_TOKENS=4096`
- `AIVA_MAX_CLOUD_REQUESTS_PER_DAY=1000`
- `AIVA_MAX_OUTPUT_TOKENS=4096`
- `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`
- `OPENROUTER_MODEL=qwen/qwen-2.5-72b-instruct`
- `GEMINI_MODEL=gemini-1.5-flash`
- `SESSION_EXPIRY=86400`
- `THROTTLE_TTL=60000`
- `THROTTLE_LIMIT=100`
- `CORS_ORIGIN=https://<your-frontend-domain>`
- `FRONTEND_URL=https://<your-frontend-domain>`
- `NEXT_PUBLIC_AIVA_API_URL=https://<your-backend-domain>`
- `EXPO_PUBLIC_AIVA_API_URL=https://<your-backend-domain>`

### Secret Variables (Stored in Cloud Vaults / Render Env)
- `DATABASE_URL`: PostgreSQL connection string with password and pooler params.
- `REDIS_URL`: Upstash connection string (`rediss://default:...`).
- `JWT_SECRET`: 64-character random string for owner access tokens.
- `JWT_REFRESH_SECRET`: 64-character random string for refresh token rotation.
- `OPENROUTER_API_KEY`: OpenRouter API bearer key.
- `GEMINI_API_KEY`: Google AI Studio Gemini API key.

---

## 4. Render Configuration Status

Inspected [deployment/render/render.yaml](file:///c:/Users/bhara/AIVA/deployment/render/render.yaml):
- **Service Name**: `aiva-private-backend` (Node.js web service).
- **Build Command**: `pnpm install --frozen-lockfile && pnpm db:generate && pnpm --filter @aiva/backend build`
- **Start Command**: `pnpm --filter @aiva/backend start`
- **Health Check Path**: `/health` (Verified HTTP 200).
- **CORS Configuration**: Correctly updated to `sync: false` without wildcard `*`.
- **JWT & Secrets**: `JWT_SECRET` and `JWT_REFRESH_SECRET` set to `generateValue: true` for automatic Render secret generation.
- **Status**: **VERIFIED & READY**.

---

## 5. Web Configuration Status

Inspected `apps/web`:
- Web application leverages `@aiva/api-client`.
- Defaults to relative path or `NEXT_PUBLIC_AIVA_API_URL` when provided.
- Build verified with `next build` (all static routes prerendered cleanly).
- **Status**: **VERIFIED & READY**.

---

## 6. Mobile Configuration Status

Inspected `apps/mobile`:
- API Client in [apps/mobile/src/services/api/aiva-client.ts](file:///c:/Users/bhara/AIVA/apps/mobile/src/services/api/aiva-client.ts) configures `DEFAULT_AIVA_URL` dynamically from `process.env.EXPO_PUBLIC_AIVA_API_URL`.
- Zero instances of `localhost:11434` or hardcoded local ports.
- Device identity is dynamically generated via `android-aiva-${Platform.OS}-...`.
- **Status**: **VERIFIED & READY**.

---

## 7. Desktop Configuration Status

Inspected `apps/desktop` and `aiva_desktop`:
- Electron main process securely uses `contextIsolation: true` and `nodeIntegration: false`.
- [apps/desktop/preload.js](file:///c:/Users/bhara/AIVA/apps/desktop/preload.js) exposes window control APIs without exposing vendor keys or secrets.
- Python assistant (`aiva_desktop/core/assistant.py`) handles local Ollama interaction with automatic graceful cloud fallback.
- Voice engine (`aiva_desktop/voice/engine.py`) uses energy VAD gating to eliminate idle CPU load.
- **Status**: **VERIFIED & READY**.

---

## 8. Storage Persistence Analysis

### Critical Storage Paths
1. `backend/data/long_term_memory.json` (Long-term persistent user facts/preferences).
2. `backend/data/rag_vectors.json` (RAG vector index).
3. `backend/storage/uploads/` (User document binary uploads).

### Cloud Platform Ephemeral Storage Risk
> [!WARNING]
> Standard container deployments (Render Free/Starter, Fly.io without volume mounts, Heroku) feature **ephemeral filesystems**. Any restart, auto-scaling event, or new deployment will erase files written to the local disk paths above.

### Required Production Storage Strategy
- **For Render**: Attach a **Render Persistent Disk** mounted to `/opt/render/project/src/backend/storage` and `/opt/render/project/src/backend/data`, OR
- **For Scalable Cloud**: Migrate document binaries to **Supabase Storage / S3 / Cloudflare R2** and vectors to PostgreSQL **pgvector / Pinecone / Upstash Vector**.

---

## 9. Security Analysis

- **Secret Scan**: Verified zero real credentials, API keys, or JWT secrets in repository code or configuration templates.
- **Single-Owner Mode**: Active — multi-user registration attempts are rejected with HTTP 403 Forbidden.
- **Device Authorization**: Enforced on all protected routes with `DeviceAuthGuard` and `x-device-id`.
- **CORS Whitelist**: Whitelist enforcement active; disallowed origins are rejected; wildcard `*` with credentials is eliminated.
- **Data Isolation**: 100% of user data queries scope queries by token-extracted `req.user.id`.

---

## 10. Exact Deployment Sequence

1. **Database & Cache Setup**:
   - Provision PostgreSQL database on Supabase.
   - Run `pnpm db:migrate` (`prisma migrate deploy`) against production `DATABASE_URL`.
   - Provision Upstash Redis database and copy `REDIS_URL`.

2. **Backend Deployment (Render)**:
   - Connect repository to Render Blueprint (`deployment/render/render.yaml`).
   - Populate secret environment variables in Render Dashboard (`DATABASE_URL`, `REDIS_URL`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `CORS_ORIGIN`).
   - Trigger deployment and verify `/health` returns status `healthy`.

3. **Frontend Deployment (Vercel / Cloudflare Pages)**:
   - Deploy `apps/web` with `NEXT_PUBLIC_AIVA_API_URL` set to the deployed backend domain.
   - Update `CORS_ORIGIN` on backend to match frontend deployment domain.

4. **Owner Account Initialization**:
   - Make single `POST /auth/register` call from the owner device to initialize owner credentials.
   - All subsequent registrations are automatically locked down by single-owner protection.

---

## 11. Items That MUST Be Addressed for Long-Term Production Scale

1. **Persistent Disk / Object Storage**: Ensure a persistent volume is mounted on the backend container or S3 storage is configured so user document uploads and vector stores persist across container restarts.
2. **Dedicated Ollama Cloud Instance (Optional)**: If local-first behavior is desired from mobile devices outside the local network, deploy a self-hosted GPU Ollama instance or rely on the configured cloud router strategy (`AIVA_ROUTING_STRATEGY=cloud-first`).

---

## 12. Items Already Verified & Ready

- ✅ Monorepo compilation (`pnpm typecheck`, `pnpm -r build`).
- ✅ 26/26 backend unit and integration test suite pass.
- ✅ Multi-provider AI model router with resilient fallbacks.
- ✅ Single-owner JWT authentication and device authorization.
- ✅ Global Redis-backed rate limiting.
- ✅ DTO validation and error handling.
- ✅ Full-stack Project Tracker API and UI.
- ✅ Web Chat live neural core connection.
- ✅ Mobile cloud-safe API configuration.
- ✅ Zero tracked credentials or secrets.

---

## 13. Final Validation Results

- `pnpm typecheck`: **PASS (5/5 packages successful)**
- `pnpm -r build`: **PASS (Exit code 0)**
- Backend test suites: **26 / 26 PASSING**
- System Status: **READY FOR DEPLOYMENT**
