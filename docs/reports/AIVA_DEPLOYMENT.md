# AIVA Private Cloud Deployment Guide (Free Tier)

This guide walks you through deploying the AIVA Private Backend on **100% Free Cloud Infrastructure**:
- **Backend:** Render (Free Web Service)
- **Database:** Supabase (Free PostgreSQL)
- **Cache & Rate Limiting:** Upstash (Free Serverless Redis with TLS)
- **Backend:** Render (Free Web Service)
- **Database:** Supabase (Free PostgreSQL)
- **Cache & Rate Limiting:** Upstash (Free Serverless Redis with TLS)
- **AI Inference:** Cloud OpenRouter (Qwen) + Google Gemini API (Gemini)

---

## Architecture Flow

```
Mobile App / Desktop App
         │
         ▼ (HTTPS)
Render Web Service (AIVA Backend)
   ├──> Supabase PostgreSQL (Port 6543 Pooler)
   ├──> Upstash Redis (Port 6379 TLS rediss://)
   ├──> OpenRouter Qwen API
   └──> Google Gemini API
```

---

## Step 1: Provision Supabase PostgreSQL Database

1. Sign up at [supabase.com](https://supabase.com/).
2. Create a new project: `aiva-db`.
3. In **Project Settings** -> **Database** -> **Connection string**, copy the **Transaction Pooler URL**:
   ```
   DATABASE_URL=postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true
   ```
4. Push your database migrations from your computer:
   ```bash
   export DATABASE_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
   pnpm db:migrate
   ```

---

## Step 2: Provision Upstash Serverless Redis

1. Sign up at [upstash.com](https://upstash.com/).
2. Click **Create Database** -> Name: `aiva-cache`.
3. Enable **TLS**.
4. In the database details, copy the `rediss://` URL:
   ```
   REDIS_URL=rediss://default:[TOKEN]@[ENDPOINT].upstash.io:6379
   ```

---

## Step 3: Deploy AIVA Backend on Render

1. Sign up at [render.com](https://render.com/).
2. Click **New** -> **Web Service** -> Connect your GitHub repository `https://github.com/psking004/AIVA`.
3. Configure the service:
   - **Name:** `aiva-private-backend`
   - **Environment:** `Node` (or choose Docker using `/deployment/render/Dockerfile`)
   - **Root Directory:** leave blank (repository root)
   - **Build Command:** `pnpm install --frozen-lockfile && pnpm db:generate && pnpm --filter @aiva/backend build`
   - **Start Command:** `pnpm --filter @aiva/backend start`
   - **Health Check Path:** `/health`
4. Add the following **Environment Variables**:

| Variable | Value | Description |
|---|---|---|
| `NODE_ENV` | `production` | Production mode |
| `PORT` | `10000` | Render port |
| `DATABASE_URL` | `postgresql://...` | Supabase pooler URL |
| `REDIS_URL` | `rediss://...` | Upstash TLS URL |
| `JWT_SECRET` | *(Click Generate)* | Secret for access tokens |
| `JWT_REFRESH_SECRET` | *(Click Generate)* | Secret for refresh tokens |
| `OPENROUTER_API_KEY` | `sk-or-v1-...` | OpenRouter API Key |
| `OPENROUTER_MODEL` | `qwen/qwen-2.5-72b-instruct` | OpenRouter model |
| `GEMINI_API_KEY` | `AIza...` | Google Gemini API Key |
| `GEMINI_MODEL` | `gemini-1.5-flash` | Google Gemini model |
| `AIVA_ROUTING_STRATEGY` | `cloud-first` | Cloud backend routes via cloud providers |
| `AIVA_CLOUD_PROVIDER` | `openrouter` | Preferred cloud provider (openrouter / gemini) |
| `CORS_ORIGIN` | `*` | Allowed client origins |

5. Click **Create Web Service**.

---

## Step 4: Configure Android Mobile & Windows Desktop

Set your private cloud domain in your mobile and desktop environment:

### Mobile (`apps/mobile/.env` or build variable):
```env
EXPO_PUBLIC_AIVA_API_URL=https://aiva-private-backend.onrender.com
```

### Desktop (`apps/desktop/.env`):
```env
AIVA_API_URL=https://aiva-private-backend.onrender.com
```

---

## Verification
Test that the deployment is alive:
```bash
curl https://aiva-private-backend.onrender.com/health
```
Expected output:
```json
{"status":"healthy","services":{"database":{"status":"up"},"cache":{"status":"up"},"ai":{"status":"up"}}}
```
