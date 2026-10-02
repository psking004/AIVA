# Supabase PostgreSQL Setup for AIVA

AIVA uses **Supabase PostgreSQL** as its primary cloud database.

---

## 1. Create a Supabase Project

1. Navigate to [supabase.com](https://supabase.com/) and create or sign in to your account.
2. Click **New Project** and configure:
   - **Name**: `aiva-db` (or your choice)
   - **Database Password**: Set a strong password and save it securely.
   - **Region**: Choose the region closest to your backend hosting (e.g., AWS us-west / us-east).

---

## 2. Obtain Connection Strings (Dual URL Setup)

Prisma uses two URLs when connecting to Supabase:
- **`DATABASE_URL`**: Transaction Pooler (Port 6543) for runtime queries with connection pooling.
- **`DIRECT_URL`**: Direct Connection (Port 5432) for running Prisma migrations without pooler restrictions.

In your Supabase Dashboard:
1. Go to **Project Settings** (gear icon) -> **Database**.
2. Scroll to the **Connection string** section and select the **URI** tab.

### A. Runtime Connection String (`DATABASE_URL`)
- Select **Mode: Transaction** (Port 6543)
- URI format:
  ```env
  DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true"
  ```

### B. Direct Connection String (`DIRECT_URL`)
- Select **Mode: Session** (Port 5432)
- URI format:
  ```env
  DIRECT_URL="postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
  ```

---

## 3. Apply Prisma Migrations to Supabase

To apply the database schema and all existing migrations to your Supabase instance:

### Option A: Via Environment Variables (PowerShell)
```powershell
$env:DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true"
$env:DIRECT_URL="postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
pnpm db:migrate
```

### Option B: Via `.env` in Backend
Set `DATABASE_URL` and `DIRECT_URL` in `backend/.env` (or root `.env`), then run:
```bash
pnpm db:migrate
```

---

## 4. Setting Up Supabase for Production Deployments (Render / Cloud)

In your Render service environment settings:
- `DATABASE_URL`: Your Supabase Transaction Pooler URL (`...:6543/postgres?pgbouncer=true`)
- `DIRECT_URL`: Your Supabase Direct Connection URL (`...:5432/postgres`)
