package com.aiva.personal.ai.wakeword

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * AivaWakeWordForegroundService
 *
 * Android Native Foreground Service for low-power continuous "AIVA" keyword spotting.
 * Transparent to the user with persistent foreground notification.
 * Respects Android 14+ foregroundServiceType="microphone" requirements.
 */
class AivaWakeWordForegroundService : Service() {

    companion object {
        private const val TAG = "AivaWakeWordService"
        const val CHANNEL_ID = "aiva_wakeword_channel"
        const val NOTIFICATION_ID = 4201

        const val ACTION_START = "com.aiva.action.START_WAKEWORD"
        const val ACTION_STOP = "com.aiva.action.STOP_WAKEWORD"
        const val ACTION_PAUSE = "com.aiva.action.PAUSE_WAKEWORD"
        const val ACTION_RESUME = "com.aiva.action.RESUME_WAKEWORD"
        const val ACTION_SET_MODE = "com.aiva.action.SET_BATTERY_MODE"
        const val BROADCAST_WAKE_WORD_DETECTED = "com.aiva.broadcast.WAKE_WORD_DETECTED"
        const val EXTRA_BATTERY_MODE = "extra_battery_mode"
        const val EXTRA_CONFIDENCE = "extra_confidence"

        @Volatile
        private var instance: AivaWakeWordForegroundService? = null

        fun pauseListening() {
            instance?.stopListening()
        }

        fun resumeListening() {
            val s = instance
            if (s != null && s.batteryManager.getMode() != BatteryMode.ULTRA_LOW_POWER) {
                s.serviceHandler.post {
                    s.retryCount = 0
                    s.startListening()
                }
            }
        }

        fun resetDetectionDebounce() {
            instance?.detector?.resetDebounce()
        }
    }

    private val serviceHandler = Handler(Looper.getMainLooper())
    private var retryCount = 0
    private val MAX_RETRIES = 6
    private val RETRY_DELAY_MS = 250L

    private var wakeLock: PowerManager.WakeLock? = null
    private var isRunning = false
    private var audioRecord: AudioRecord? = null
    private var recordingThread: Thread? = null
    private lateinit var detector: TwoStageWakeWordDetector
    private lateinit var batteryManager: BatteryOptimizationManager

    override fun onCreate() {
        super.onCreate()
        instance = this
        createNotificationChannel()

        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (wakeLock == null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AIVA:WakeWordBackgroundLock")
            wakeLock?.acquire(24 * 60 * 60 * 1000L) // 24hr safeguard
        }

        detector = TwoStageWakeWordDetector { confidence ->
            onWakeWordDetected(confidence)
        }

        batteryManager = BatteryOptimizationManager(this) { mode, isListeningAllowed ->
            detector.setMuted(!isListeningAllowed)
            updateNotification(mode, isListeningAllowed)
        }

        // Immediately promote to foreground to guarantee Android Foreground Service contract
        startForegroundServiceWithNotification(batteryManager.getMode())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)

        // Acquire low-power partial wake lock to prevent CPU sleep during background monitoring
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (wakeLock == null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AIVA:WakeWordBackgroundLock")
            wakeLock?.acquire(24 * 60 * 60 * 1000L) // 24hr safeguard
        }

        // Guarantee startForeground is called for every startForegroundService invocation
        startForegroundServiceWithNotification(batteryManager.getMode())

        when (intent?.action) {
            ACTION_START -> {
                val modeStr = intent.getStringExtra(EXTRA_BATTERY_MODE)
                val mode = modeStr?.let {
                    try { BatteryMode.valueOf(it) } catch (e: Exception) { BatteryMode.BALANCED }
                } ?: BatteryMode.BALANCED

                batteryManager.setMode(mode)
                startListening()
            }
            ACTION_STOP -> {
                stopListening()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
            ACTION_PAUSE -> {
                stopListening()
            }
            ACTION_RESUME -> {
                if (batteryManager.getMode() != BatteryMode.ULTRA_LOW_POWER) {
                    startListening()
                }
            }
            ACTION_SET_MODE -> {
                val modeStr = intent.getStringExtra(EXTRA_BATTERY_MODE)
                modeStr?.let {
                    try {
                        val mode = BatteryMode.valueOf(it)
                        batteryManager.setMode(mode)
                    } catch (e: Exception) {
                        Log.w(TAG, "Invalid battery mode: $it")
                    }
                }
            }
            else -> {
                if (batteryManager.getMode() != BatteryMode.ULTRA_LOW_POWER) {
                    startListening()
                }
            }
        }
        return START_STICKY
    }

    private fun startForegroundServiceWithNotification(mode: BatteryMode) {
        val notification = buildNotification(mode, true)

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                    )
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                }
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start foreground service: ${e.message}")
            stopSelf()
        }
    }

    @Synchronized
    private fun initAudioRecord(): Boolean {
        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (_: Exception) {}
        audioRecord = null

        val bufferSize = AudioRecord.getMinBufferSize(
            TwoStageWakeWordDetector.SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        ).coerceAtLeast(TwoStageWakeWordDetector.FRAME_SIZE * 2)

        return try {
            val ar = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                TwoStageWakeWordDetector.SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                bufferSize
            )
            if (ar.state != AudioRecord.STATE_INITIALIZED) {
                Log.w(TAG, "AudioRecord state != INITIALIZED")
                try { ar.release() } catch (_: Exception) {}
                false
            } else {
                ar.startRecording()
                if (ar.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
                    Log.w(TAG, "AudioRecord recordingState != RECORDSTATE_RECORDING")
                    try { ar.release() } catch (_: Exception) {}
                    false
                } else {
                    audioRecord = ar
                    Log.i(TAG, "AudioRecord initialized and recording successfully")
                    true
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Exception initializing AudioRecord: ${e.message}")
            false
        }
    }

    @Synchronized
    private fun startListening() {
        if (isRunning && recordingThread?.isAlive == true) {
            return
        }
        stopListening()
        isRunning = true

        recordingThread = Thread({
            android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_URGENT_AUDIO)
            val audioBuffer = ShortArray(TwoStageWakeWordDetector.FRAME_SIZE)

            while (isRunning) {
                if (audioRecord == null || audioRecord?.state != AudioRecord.STATE_INITIALIZED || audioRecord?.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
                    Log.i(TAG, "Watchdog: Re-initializing unready AudioRecord...")
                    if (!initAudioRecord()) {
                        try { Thread.sleep(800) } catch (_: InterruptedException) { break }
                        continue
                    }
                }

                val ar = audioRecord
                if (ar == null) {
                    try { Thread.sleep(500) } catch (_: InterruptedException) { break }
                    continue
                }

                val readBytes = try {
                    ar.read(audioBuffer, 0, audioBuffer.size)
                } catch (e: Exception) {
                    -1
                }

                if (readBytes <= 0) {
                    Log.w(TAG, "Watchdog: AudioRecord read zero/error ($readBytes). Re-arming HAL...")
                    try {
                        ar.stop()
                        ar.release()
                    } catch (_: Exception) {}
                    audioRecord = null
                    try { Thread.sleep(800) } catch (_: InterruptedException) { break }
                    continue
                }

                detector.processFrame(audioBuffer, readBytes)
            }
            Log.i(TAG, "AivaWakeWordAudioThread loop ended (isRunning=$isRunning)")
        }, "AivaWakeWordWatchdog")

        recordingThread?.priority = Thread.MAX_PRIORITY
        recordingThread?.start()
        Log.i(TAG, "AIVA wake-word listening loop active with resilient watchdog")
    }

    private fun scheduleRetry() {
        if (batteryManager.getMode() != BatteryMode.ULTRA_LOW_POWER) {
            startListening()
        }
    }

    private fun stopListening() {
        isRunning = false
        try {
            detector.reset()
            audioRecord?.stop()
            audioRecord?.release()
            audioRecord = null
            recordingThread?.interrupt()
            recordingThread?.join(300)
            recordingThread = null
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping audio capture: ${e.message}")
        }
        Log.i(TAG, "AIVA wake-word listening stopped")
    }

    private fun onWakeWordDetected(confidence: Float) {
        // Send broadcast to React Native app
        val broadcastIntent = Intent(BROADCAST_WAKE_WORD_DETECTED).apply {
            putExtra(EXTRA_CONFIDENCE, confidence)
            setPackage(packageName)
        }
        sendBroadcast(broadcastIntent)

        // If app is in background or screen is locked, bring MainActivity to foreground
        try {
            val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            }
            if (launchIntent != null) {
                startActivity(launchIntent)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to bring MainActivity to foreground: ${e.message}")
        }
    }

    private fun buildNotification(mode: BatteryMode, isListening: Boolean): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
        )

        val statusText = if (isListening) "Listening for \"AIVA\" (${mode.name})" else "Paused (${mode.name})"

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("AIVA Voice Assistant")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun updateNotification(mode: BatteryMode, isListening: Boolean) {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, buildNotification(mode, isListening))
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "AIVA Background Wake Word",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows active status of AIVA voice assistant"
                setShowBadge(false)
            }
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        stopListening()
        batteryManager.unregister()
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
            wakeLock = null
        } catch (_: Exception) {}
        if (instance === this) {
            instance = null
        }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
