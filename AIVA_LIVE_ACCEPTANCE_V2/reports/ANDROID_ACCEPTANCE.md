# Android Application Deep Acceptance Report (AIVA 2.0 V2)

**Target Hardware:** Physical Vivo iQOO Neo 10 (`I2405`, `I2405i`)  
**Android OS Version:** Android 16 (API Level 36)  
**ADB Device Serial:** `10BF6B1T1C001BS` (USB mode, Transport ID 59) / `10.16.177.243:5555`  
**Application Package:** `com.aiva.personal.ai`  
**Release APK Path:** `apps/mobile/android/app/build/outputs/apk/release/app-release.apk` (70,337,955 bytes)  
**Status:** **PASS (Physically Verified on Device)**  

---

## 1. Build & Installation Verification

* **Build Artifact:** The production release APK (`app-release.apk`, ~70.3 MB) was built using Gradle and the Android SDK (`C:\Users\bhara\AppData\Local\Android\Sdk`).
* **Live Installation Command:**
  ```bash
  adb -s 10BF6B1T1C001BS install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
  ```
* **Installation Output:**
  ```text
  Performing Streamed Install
  Success
  ```

---

## 2. Process Lifecycle & State Persistence

1. **Launch Verification:**
   * Launched via `adb shell monkey -p com.aiva.personal.ai -c android.intent.category.LAUNCHER 1`.
   * Live PID verified: `27262`.
   * Initial screen captured: `AIVA_LIVE_ACCEPTANCE_V2/evidence/screenshots/physical_phone_aiva_running.png` (5,811,394 bytes).
2. **Crash & Restart Resilience:**
   * Executed `adb shell am force-stop com.aiva.personal.ai`.
   * Verified process completely terminated: `pidof` returned empty (`None`).
   * Relaunched application. Verified new process initialized with PID `27760`.
   * Relaunch screen captured: `AIVA_LIVE_ACCEPTANCE_V2/evidence/screenshots/physical_phone_after_restart.png` (2,796,834 bytes).
3. **Audio Coexistence:**
   * Verified that `AivaWakeWordForegroundService` operates in unmanaged focus mode, preventing audio focus hijacking of media, YouTube, or phone calls.
