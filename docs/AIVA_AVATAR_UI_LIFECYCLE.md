# AIVA Avatar & UI Lifecycle Specification

## 1. Defect Analysis: Overlapping Dual Faces

The user reported: **"The interface displays two overlapping faces: one apparently listening and another speaking. This is explicitly unwanted."**

### 1.1 Root Cause
1. In `apps/desktop/main.js`, `app.requestSingleInstanceLock()` was not implemented.
2. Multiple `AIVA.exe` processes (PIDs 24660, 22864, 39224) were launched concurrently.
3. Each process initialized a borderless, full-screen transparent `BrowserWindow` with `alwaysOnTop: true`.
4. Each instance mounted an independent React DOM root containing the 3D orbital particle canvas and avatar face composite (`holo-face-stage`).
5. When one instance received a `LISTENING` IPC event while another remained in `SPEAKING` or `DORMANT`, their transparent frames rendered on top of each other, creating **two distinct, conflicting faces**.

---

## 2. Authoritative Single-Avatar State Machine

There is now **exactly one** authoritative avatar instance across the desktop.

```
       ┌──────────┐
       │ DORMANT  │◄──────────────────────────────────┐
       └────┬─────┘                                   │
            │ Wake word / manual summon               │ Idle timeout (8s)
            ▼                                         │
    ┌───────────────┐                                 │
    │ MATERIALIZING │                                 │
    └───────┬───────┘                                 │
            │ Fast hologram entry (80ms)              │
            ▼                                         │
     ┌─────────────┐                                  │
┌───►│  LISTENING  │◄─────────────────┐               │
│    └──────┬──────┘                  │               │
│           │ Spoken utterance        │               │
│           ▼                         │               │
│     ┌───────────┐                   │ User Barge-in │
│     │ THINKING  │                   │ (Spacebar/Mic)│
│     └─────┬─────┘                   │               │
│           │ Speech ready            │               │
│           ▼                         │               │
│     ┌───────────┐                   │               │
│     │ SPEAKING  ├───────────────────┘               │
│     └─────┬─────┘                                   │
│           │ Clause playback ends                    │
│           ▼                                         │
│     ┌───────────┐                                   │
│     │ COOLDOWN  ├───────────────────────────────────┘
│     └───────────┘
```

### 2.1 Enforcements
1. **Single-Instance Gate (`main.js`)**: Secondary processes cannot mount a React tree. They exit immediately upon checking `app.requestSingleInstanceLock()`.
2. **Reactivation Reuses Existing Window**: The secondary launch triggers the `second-instance` IPC event on the primary process, bringing `mainWindow` forward.
3. **Monotonic Turn State**: Turn tokens (`turnId`) ensure only the current turn's visual state can mutate the avatar.
4. **Interruption Transition**: Clicking the face or pressing Spacebar transitions the avatar immediately back to `LISTENING`, rather than spawning a new element or closing the app.

