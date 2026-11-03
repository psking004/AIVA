# AIVA Security Architecture

## 1. Single-Owner Model (No Public SaaS)

AIVA is designed strictly as a personal, single-owner intelligence assistant.

- **No Public Signup:** Once the owner account is created, all subsequent registration requests are immediately rejected with `403 Forbidden`.
- **No Multi-Tenancy:** Data is never co-mingled with other users.
- **No Anonymous Access:** All endpoints require strong authentication and authorized device verification.

---

## 2. Device Authorization & Revocation

Every request requires both:
1. **Valid Bearer JWT Access Token**
2. **Authorized Device Identifier (`x-device-id` header)**

```
Incoming Request -> JwtAuthGuard -> DeviceAuthGuard -> Endpoint Handler
                         │                   │
                     Valid JWT?        Authorized Device?
                         │                   │
                   No -> 401           No/Revoked -> 403
```

### Device Lifecycle:
- **Registration:** Upon first login from a trusted device (Windows Desktop, Android Phone), the device record is registered with unique ID, name, platform, and timestamps.
- **Verification:** Every API interaction updates `lastSeenAt` and checks that `revokedAt` is `null`.
- **Revocation:** If a device is lost or compromised, calling `DELETE /auth/devices/:deviceId` instantly revokes authorization and terminates all active sessions for that device.

---

## 3. Token Security & Rotation

- **Access Tokens:** Short-lived (1 hour) signed with `JWT_SECRET`.
- **Refresh Tokens:** Long-lived (30 days) signed with `JWT_REFRESH_SECRET` with automatic rotation.
- **Secret Isolation:** API keys (such as `OPENROUTER_API_KEY` and `GEMINI_API_KEY`) reside exclusively in server-side environment variables and are NEVER transmitted to clients, browsers, or logs.

---

## 4. Security Checklist & Tests

- [x] Unauthenticated requests return `401 Unauthorized`.
- [x] Requests without `x-device-id` return `403 Forbidden`.
- [x] Revoked devices return `403 Forbidden`.
- [x] Secondary registration attempts return `403 Forbidden`.
- [x] Client bundles scanned: zero vendor API keys exposed.
