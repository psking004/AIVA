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
import android.os.IBinder
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
        const val ACTION_SET_MODE = "com.aiva.action.SET_BATTERY_MODE"
        const val BROADCAST_WAKE_WORD_DETECTED = "com.aiva.broadcast.WAKE_WORD_DETECTED"
        const val EXTRA_BATTERY_MODE = "extra_battery_mode"
        const val EXTRA_CONFIDENCE = "extra_confidence"
    }

    private var isRunning = false
    private var audioRecord: AudioRecord? = null
    private var recordingThread: Thread? = null
    private lateinit var detector: TwoStageWakeWordDetector
    private lateinit var batteryManager: BatteryOptimizationManager

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()

        detector = TwoStageWakeWordDetector { confidence ->
            onWakeWordDetected(confidence)
        }

        batteryManager = BatteryOptimizationManager(this) { mode, isListeningAllowed ->
            detector.setMuted(!isListeningAllowed)
            updateNotification(mode, isListeningAllowed)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val modeStr = intent.getStringExtra(EXTRA_BATTERY_MODE)
                val mode = modeStr?.let {
                    try { BatteryMode.valueOf(it) } catch (e: Exception) { BatteryMode.BALANCED }
                } ?: BatteryMode.BALANCED

                startForegroundServiceWithNotification(mode)
                batteryManager.setMode(mode)
                startListening()
            }
            ACTION_STOP -> {
                stopListening()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
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
        }
        return START_STICKY
    }

    private fun startForegroundServiceWithNotification(mode: BatteryMode) {
        val notification = buildNotification(mode, true)

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
    }

    private fun startListening() {
        if (isRunning) return
        isRunning = true

        val bufferSize = AudioRecord.getMinBufferSize(
            TwoStageWakeWordDetector.SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        ).coerceAtLeast(TwoStageWakeWordDetector.FRAME_SIZE * 2)

        try {
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                TwoStageWakeWordDetector.SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                bufferSize
            )

            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "AudioRecord initialization failed")
                isRunning = false
                return
            }

            audioRecord?.startRecording()

            recordingThread = Thread({
                val audioBuffer = ShortArray(TwoStageWakeWordDetector.FRAME_SIZE)

                while (isRunning) {
                    val readCount = audioRecord?.read(audioBuffer, 0, audioBuffer.size) ?: 0
                    if (readCount > 0) {
                        detector.processFrame(audioBuffer, readCount)
                    }
                }
            }, "AivaWakeWordAudioThread")

            recordingThread?.priority = Thread.NORM_PRIORITY
            recordingThread?.start()
            Log.i(TAG, "AIVA wake-word listening loop active")

        } catch (e: SecurityException) {
            Log.e(TAG, "Microphone permission missing for wake-word service: ${e.message}")
            isRunning = false
        } catch (e: Exception) {
            Log.e(TAG, "Error starting AudioRecord: ${e.message}")
            isRunning = false
        }
    }

    private fun stopListening() {
        isRunning = false
        try {
            audioRecord?.stop()
            audioRecord?.release()
            audioRecord = null
            recordingThread?.join(500)
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
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
