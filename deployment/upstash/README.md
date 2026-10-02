# Upstash Serverless Redis Configuration for AIVA

AIVA uses **Upstash Redis** as its free, serverless, TLS-encrypted caching and rate-limiting store.

---

## 1. Create a Free Upstash Database
1. Go to [upstash.com](https://upstash.com/) and sign in.
2. Under the **Redis** tab, click **Create Database**.
3. Name: `aiva-cache`.
4. Region: Choose the same region as your Render/Supabase instance.
5. TLS: **Enabled** (Default).
6. Eviction: **volatile-lru** or **allkeys-lru** (recommended for cache layers).

---

## 2. Obtain Connection URL
In the Upstash console under **Details**:
1. Find the **Node.js (ioredis)** connection tab.
2. Copy the `rediss://...` connection string:
   ```
   rediss://default:[YOUR-PASSWORD]@[YOUR-ENDPOINT].upstash.io:6379
   ```

---

## 3. Set Environment Variable in Render
Add this to your Render Environment Variables:
- **`REDIS_URL`**: `rediss://default:[YOUR-PASSWORD]@[YOUR-ENDPOINT].upstash.io:6379`

AIVA's `RedisService` automatically detects `rediss://` and enables TLS encrypted communication.
