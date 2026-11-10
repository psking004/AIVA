package com.aiva.personal.ai.wakeword

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Locale

/**
 * AivaVoiceModule
 *
 * Full Native Android Voice Pipeline:
 * - Real-time STT using native SpeechRecognizer with clean recreate/destroy per session
 * - Native TTS playback with natural voice synthesis and utterance progression
 * - Acoustic settling window (400ms) ensuring zero mic feedback loop after TTS completion
 * - Clean main-thread lifecycle releasing all audio handles and preventing multi-turn drops
 * - Instant barge-in interruption: stops TTS and captures new speech on the fly
 * - Safe microphone resource coordination with AivaWakeWordForegroundService
 */
class AivaVoiceModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), TextToSpeech.OnInitListener {

    companion object {
        private const val TAG = "AivaVoiceModule"
        const val MODULE_NAME = "AivaVoiceModule"
        private const val ACOUSTIC_SETTLING_DELAY_MS = 600L
        const val ACTION_VOICE_COMMAND = "com.aiva.action.VOICE_COMMAND"
    }

    override fun getName(): String = MODULE_NAME

    private val mainHandler = Handler(Looper.getMainLooper())
    private var speechRecognizer: SpeechRecognizer? = null
    private var tts: TextToSpeech? = null
    private var isTtsInitialized = false
    private var isListening = false
    private var isSpeaking = false
    private var lastTtsEndTime: Long = 0L
    private var voiceCommandReceiver: BroadcastReceiver? = null

    init {
        mainHandler.post {
            try {
                tts = TextToSpeech(reactContext, this)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to instantiate TextToSpeech: ${e.message}")
            }
        }
        registerVoiceCommandReceiver()
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            var result = tts?.setLanguage(Locale.US)
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                result = tts?.setLanguage(Locale.getDefault())
            }
            isTtsInitialized = true
            tts?.setPitch(1.06f)
            tts?.setSpeechRate(1.02f)

            // Select natural female voice if provided by the device engine (e.g. Google TTS)
            try {
                val voices = tts?.voices
                val femaleVoice = voices?.firstOrNull { voice ->
                    (voice.locale == Locale.US || voice.locale.language == Locale.getDefault().language) &&
                    (voice.name.contains("female", ignoreCase = true) ||
                     voice.name.contains("en-us-x-sfg", ignoreCase = true) ||
                     voice.name.contains("en-us-x-tpf", ignoreCase = true) ||
                     voice.features?.contains("female") == true)
                }
                if (femaleVoice != null) {
                    tts?.voice = femaleVoice
                    Log.i(TAG, "Selected natural female TTS voice: ${femaleVoice.name}")
                }
            } catch (e: Exception) {
                Log.w(TAG, "Could not query or set female voice: ${e.message}")
            }

            setupTtsProgressListener()
            Log.i(TAG, "Android TextToSpeech engine initialized successfully")
        } else {
            Log.e(TAG, "TextToSpeech initialization failed with status: $status")
        }
    }

    private fun setupTtsProgressListener() {
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {
                isSpeaking = true
                pauseWakeWordService()
                try {
                    AivaWakeWordForegroundService.resetDetectionDebounce()
                } catch (_: Exception) {}
                val params = Arguments.createMap().apply {
                    putString("utteranceId", utteranceId ?: "")
                }
                sendEvent("onTtsStart", params)
            }

            override fun onDone(utteranceId: String?) {
                isSpeaking = false
                lastTtsEndTime = SystemClock.uptimeMillis()
                Log.i(TAG, "TTS onDone($utteranceId): applying 400ms acoustic settling window")

                // Mandatory 400ms acoustic settling delay before emitting onTtsDone and resuming wake word
                mainHandler.postDelayed({
                    resumeWakeWordService()
                    val params = Arguments.createMap().apply {
                        putString("utteranceId", utteranceId ?: "")
                    }
                    sendEvent("onTtsDone", params)
                }, ACOUSTIC_SETTLING_DELAY_MS)
            }

            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) {
                isSpeaking = false
                lastTtsEndTime = SystemClock.uptimeMillis()
                mainHandler.postDelayed({
                    resumeWakeWordService()
                    val params = Arguments.createMap().apply {
                        putString("utteranceId", utteranceId ?: "")
                        putString("error", "TTS synthesis playback error")
                    }
                    sendEvent("onTtsError", params)
                }, ACOUSTIC_SETTLING_DELAY_MS)
            }

            override fun onError(utteranceId: String?, errorCode: Int) {
                isSpeaking = false
                lastTtsEndTime = SystemClock.uptimeMillis()
                mainHandler.postDelayed({
                    resumeWakeWordService()
                    val params = Arguments.createMap().apply {
                        putString("utteranceId", utteranceId ?: "")
                        putInt("errorCode", errorCode)
                        putString("error", "TTS playback failed with code $errorCode")
                    }
                    sendEvent("onTtsError", params)
                }, ACOUSTIC_SETTLING_DELAY_MS)
            }
        })
    }

    private fun sendEvent(eventName: String, params: Any?) {
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    private fun pauseWakeWordService() {
        try {
            AivaWakeWordForegroundService.pauseListening()
        } catch (e: Exception) {
            Log.w(TAG, "Could not pause wake word service: ${e.message}")
        }
    }

    private fun resumeWakeWordService() {
        try {
            AivaWakeWordForegroundService.resumeListening()
        } catch (e: Exception) {
            Log.w(TAG, "Could not resume wake word service: ${e.message}")
        }
    }

    private fun releaseSpeechRecognizer(onReleased: (() -> Unit)? = null) {
        mainHandler.post {
            try {
                speechRecognizer?.cancel()
                speechRecognizer?.destroy()
            } catch (e: Exception) {
                Log.w(TAG, "Error destroying speechRecognizer: ${e.message}")
            }
            speechRecognizer = null
            isListening = false

            // Delay resuming wake-word service by 200ms to allow Android Audio HAL
            // to completely release the microphone resource before AudioRecord binds.
            mainHandler.postDelayed({
                resumeWakeWordService()
                onReleased?.invoke()
            }, 200L)
        }
    }

    @ReactMethod
    fun startListening(language: String?, promise: Promise) {
        val hasPermission = ContextCompat.checkSelfPermission(
            reactContext,
            android.Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasPermission) {
            promise.reject("PERMISSION_DENIED", "Microphone permission RECORD_AUDIO is required")
            return
        }

        mainHandler.post {
            try {
                var delayMs = 0L

                // If TTS is currently speaking, halt playback cleanly to release audio focus
                if (isSpeaking || (tts != null && tts!!.isSpeaking)) {
                    Log.i(TAG, "startListening called while TTS is speaking: stopping TTS and waiting 400ms settling delay")
                    tts?.stop()
                    isSpeaking = false
                    lastTtsEndTime = SystemClock.uptimeMillis()
                    sendEvent("onInterrupted", Arguments.createMap().apply {
                        putString("reason", "speech_detected_during_tts")
                    })
                    delayMs = ACOUSTIC_SETTLING_DELAY_MS
                } else {
                    val timeSinceTts = SystemClock.uptimeMillis() - lastTtsEndTime
                    if (timeSinceTts < ACOUSTIC_SETTLING_DELAY_MS) {
                        delayMs = ACOUSTIC_SETTLING_DELAY_MS - timeSinceTts
                        Log.i(TAG, "startListening called within settling window: delaying start by ${delayMs}ms")
                    }
                }

                mainHandler.postDelayed({
                    executeStartListening(language, promise)
                }, delayMs)

            } catch (e: Exception) {
                isListening = false
                resumeWakeWordService()
                promise.reject("START_ERROR", "Failed to prepare speech recognition: ${e.message}")
            }
        }
    }

    private fun executeStartListening(language: String?, promise: Promise) {
        try {
            pauseWakeWordService()

            // Ensure previous SpeechRecognizer is destroyed to release audio buffers cleanly
            try {
                speechRecognizer?.cancel()
                speechRecognizer?.destroy()
            } catch (e: Exception) {
                Log.w(TAG, "Error destroying prior speechRecognizer: ${e.message}")
            }
            speechRecognizer = null

            if (!SpeechRecognizer.isRecognitionAvailable(reactContext)) {
                resumeWakeWordService()
                promise.reject("UNAVAILABLE", "Android SpeechRecognizer is not available on this device")
                return
            }

            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(reactContext)

            speechRecognizer?.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    isListening = true
                    Log.i(TAG, "SpeechRecognizer: onReadyForSpeech - listening begins")
                    sendEvent("onSpeechReady", Arguments.createMap())
                }

                override fun onBeginningOfSpeech() {
                    Log.i(TAG, "SpeechRecognizer: onBeginningOfSpeech - speech detected")
                    sendEvent("onSpeechStart", Arguments.createMap())
                }

                override fun onRmsChanged(rmsdB: Float) {
                    val normalized = ((rmsdB + 2.0f) / 12.0f).coerceIn(0.0f, 1.0f)
                    val params = Arguments.createMap().apply {
                        putDouble("audioLevel", normalized.toDouble())
                    }
                    sendEvent("onSpeechRms", params)
                }

                override fun onBufferReceived(buffer: ByteArray?) {}

                override fun onEndOfSpeech() {
                    isListening = false
                    Log.i(TAG, "SpeechRecognizer: onEndOfSpeech")
                    sendEvent("onSpeechEnd", Arguments.createMap())
                }

                override fun onError(error: Int) {
                    isListening = false

                    val errorMsg = when (error) {
                        SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
                        SpeechRecognizer.ERROR_CLIENT -> "Client error"
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Insufficient permissions"
                        SpeechRecognizer.ERROR_NETWORK -> "Network error"
                        SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout"
                        SpeechRecognizer.ERROR_NO_MATCH -> "No speech recognized"
                        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Recognition service busy"
                        SpeechRecognizer.ERROR_SERVER -> "Server error"
                        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech input timeout"
                        else -> "Speech recognition error ($error)"
                    }

                    Log.w(TAG, "SpeechRecognizer onError: code=$error ($errorMsg)")
                    val params = Arguments.createMap().apply {
                        putInt("errorCode", error)
                        putString("errorMessage", errorMsg)
                    }
                    sendEvent("onSpeechError", params)
                    sendEvent("onSpeechEnd", Arguments.createMap())

                    releaseSpeechRecognizer()
                }

                override fun onResults(results: Bundle?) {
                    isListening = false

                    val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val text = matches?.firstOrNull() ?: ""
                    Log.i(TAG, "SpeechRecognizer: onResults final transcript: '$text', all matches: $matches")

                    // Never reuse WritableMap: create separate fresh instances for each emit
                    val matchesArrayPlural = Arguments.createArray()
                    matches?.forEach { matchesArrayPlural.pushString(it) }
                    val resultsMapPlural = Arguments.createMap().apply {
                        putArray("value", matchesArrayPlural)
                        putString("text", text)
                        putBoolean("isFinal", true)
                    }
                    sendEvent("onSpeechResults", resultsMapPlural)

                    val resultsMapSingular = Arguments.createMap().apply {
                        putString("text", text)
                        putBoolean("isFinal", true)
                    }
                    sendEvent("onSpeechResult", resultsMapSingular)
                    sendEvent("onSpeechEnd", Arguments.createMap())

                    releaseSpeechRecognizer()
                }

                override fun onPartialResults(partialResults: Bundle?) {
                    val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val text = matches?.firstOrNull() ?: ""
                    if (text.isNotEmpty()) {
                        Log.i(TAG, "SpeechRecognizer: onPartialResults: '$text'")

                        // Never reuse WritableMap: create separate fresh instances for each emit
                        val matchesArrayPlural = Arguments.createArray()
                        matches?.forEach { matchesArrayPlural.pushString(it) }
                        val partialMapPlural = Arguments.createMap().apply {
                            putArray("value", matchesArrayPlural)
                            putString("text", text)
                        }
                        sendEvent("onSpeechPartialResults", partialMapPlural)

                        val partialMapSingular = Arguments.createMap().apply {
                            putString("text", text)
                        }
                        sendEvent("onSpeechPartialResult", partialMapSingular)
                    }
                }

                override fun onEvent(eventType: Int, params: Bundle?) {}
            })

            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 3000L)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 1500L)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, reactContext.packageName)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, language ?: "en-US")
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language ?: "en-US")
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            }

            speechRecognizer?.startListening(intent)
            promise.resolve(true)

        } catch (e: Exception) {
            isListening = false
            resumeWakeWordService()
            promise.reject("START_ERROR", "Failed to start speech recognition: ${e.message}")
        }
    }

    @ReactMethod
    fun stopListening(promise: Promise) {
        releaseSpeechRecognizer {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun cancelListening(promise: Promise) {
        releaseSpeechRecognizer {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun speak(text: String, utteranceId: String, promise: Promise) {
        if (!isTtsInitialized || tts == null) {
            promise.reject("TTS_NOT_INITIALIZED", "TextToSpeech engine is not initialized")
            return
        }

        mainHandler.post {
            try {
                pauseWakeWordService()
                isSpeaking = true
                val params = Bundle().apply {
                    putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId)
                }

                val result = tts?.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId)
                if (result == TextToSpeech.SUCCESS) {
                    promise.resolve(true)
                } else {
                    isSpeaking = false
                    promise.reject("SPEAK_ERROR", "TTS speak failed with code $result")
                }
            } catch (e: Exception) {
                isSpeaking = false
                promise.reject("SPEAK_ERROR", "TTS speak exception: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun stopSpeaking(promise: Promise) {
        mainHandler.post {
            try {
                tts?.stop()
                isSpeaking = false
                lastTtsEndTime = SystemClock.uptimeMillis()
                sendEvent("onTtsInterrupted", Arguments.createMap())
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("STOP_ERROR", "Failed to stop TTS: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun bargeIn(promise: Promise) {
        mainHandler.post {
            try {
                if (isSpeaking || (tts != null && tts!!.isSpeaking)) {
                    tts?.stop()
                    isSpeaking = false
                    lastTtsEndTime = SystemClock.uptimeMillis()
                    sendEvent("onInterrupted", Arguments.createMap().apply {
                        putString("reason", "user_barge_in")
                    })
                }
                // Automatically transition into listening
                startListening("en-US", promise)
            } catch (e: Exception) {
                promise.reject("BARGE_IN_ERROR", "Failed to execute barge-in: ${e.message}")
            }
        }
    }

    @ReactMethod
    fun launchApp(appNameOrPackage: String, promise: Promise) {
        try {
            val pm = reactContext.packageManager
            var targetPackage = appNameOrPackage.trim()
            val cleanLower = targetPackage.lowercase()

            // 1. Sub-feature URI Deep-Link Handling (e.g. Instagram Reels, YouTube Shorts, Stories)
            val deepLinkMap = mapOf(
                "reels" to Pair("https://www.instagram.com/reels/", "com.instagram.android"),
                "instagram reels" to Pair("https://www.instagram.com/reels/", "com.instagram.android"),
                "insta reels" to Pair("https://www.instagram.com/reels/", "com.instagram.android"),
                "stories" to Pair("https://www.instagram.com/stories/", "com.instagram.android"),
                "instagram stories" to Pair("https://www.instagram.com/stories/", "com.instagram.android"),
                "explore" to Pair("https://www.instagram.com/explore/", "com.instagram.android"),
                "instagram explore" to Pair("https://www.instagram.com/explore/", "com.instagram.android"),
                "direct" to Pair("https://www.instagram.com/direct/inbox/", "com.instagram.android"),
                "instagram direct" to Pair("https://www.instagram.com/direct/inbox/", "com.instagram.android"),
                "shorts" to Pair("https://www.youtube.com/shorts", "com.google.android.youtube"),
                "youtube shorts" to Pair("https://www.youtube.com/shorts", "com.google.android.youtube"),
                "trending" to Pair("https://www.youtube.com/feed/trending", "com.google.android.youtube"),
                "youtube trending" to Pair("https://www.youtube.com/feed/trending", "com.google.android.youtube"),
                "subscriptions" to Pair("https://www.youtube.com/feed/subscriptions", "com.google.android.youtube"),
                "youtube subscriptions" to Pair("https://www.youtube.com/feed/subscriptions", "com.google.android.youtube")
            )

            val deepLink = deepLinkMap[cleanLower]
            if (deepLink != null) {
                val (uriStr, pkg) = deepLink
                val deepIntent = Intent(Intent.ACTION_VIEW, Uri.parse(uriStr)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    setPackage(pkg)
                }
                val launchCheck = pm.getLaunchIntentForPackage(pkg)
                if (launchCheck != null) {
                    reactContext.startActivity(deepIntent)
                    promise.resolve(pkg)
                    return
                }
            }

            // 2. Direct package check
            var intent = pm.getLaunchIntentForPackage(targetPackage)

            // 3. Common application name mapping
            if (intent == null) {
                val commonMap = mapOf(
                    "instagram" to "com.instagram.android",
                    "youtube" to "com.google.android.youtube",
                    "whatsapp" to "com.whatsapp",
                    "spotify" to "com.spotify.music",
                    "chrome" to "com.android.chrome",
                    "maps" to "com.google.android.apps.maps",
                    "google maps" to "com.google.android.apps.maps",
                    "twitter" to "com.twitter.android",
                    "x" to "com.twitter.android",
                    "telegram" to "org.telegram.messenger",
                    "settings" to "com.android.settings",
                    "camera" to "com.android.camera",
                    "calculator" to "com.google.android.calculator",
                    "gmail" to "com.google.android.gm",
                    "photos" to "com.google.android.apps.photos",
                    "play store" to "com.android.vending",
                    "music" to "com.spotify.music",
                    "notes" to "com.vivo.notes",
                    "note" to "com.vivo.notes",
                    "memo" to "com.vivo.notes",
                    "keep" to "com.google.android.keep"
                )
                val mapped = commonMap[targetPackage.lowercase()]
                if (mapped != null) {
                    targetPackage = mapped
                    intent = pm.getLaunchIntentForPackage(targetPackage)
                }

                // If notes app mapping didn't find com.vivo.notes, check other OEM note packages
                if (intent == null && targetPackage.lowercase() in listOf("notes", "note", "memo", "keep")) {
                    val noteCandidates = listOf(
                        "com.vivo.notes",
                        "com.google.android.keep",
                        "com.samsung.android.app.notes",
                        "com.miui.notes",
                        "com.oneplus.note",
                        "com.coloros.note"
                    )
                    for (candidate in noteCandidates) {
                        val candIntent = pm.getLaunchIntentForPackage(candidate)
                        if (candIntent != null) {
                            targetPackage = candidate
                            intent = candIntent
                            break
                        }
                    }
                }
            }

            // 3. Fallback: Search launchable apps via queryIntentActivities & label
            if (intent == null) {
                val launcherIntent = Intent(Intent.ACTION_MAIN, null).apply {
                    addCategory(Intent.CATEGORY_LAUNCHER)
                }
                val resolveInfos = pm.queryIntentActivities(launcherIntent, 0)
                for (info in resolveInfos) {
                    val label = info.loadLabel(pm).toString()
                    val pkg = info.activityInfo.packageName
                    val cleanQuery = appNameOrPackage.lowercase().replace(" ", "")
                    if (label.equals(appNameOrPackage, ignoreCase = true) ||
                        label.contains(appNameOrPackage, ignoreCase = true) ||
                        pkg.lowercase().contains(cleanQuery)) {
                        val candidate = pm.getLaunchIntentForPackage(pkg)
                        if (candidate != null) {
                            targetPackage = pkg
                            intent = candidate
                            break
                        }
                    }
                }
            }

            // 4. Fallback: Search all installed applications
            if (intent == null) {
                val installed = pm.getInstalledApplications(PackageManager.GET_META_DATA)
                for (info in installed) {
                    val label = pm.getApplicationLabel(info).toString()
                    if (label.equals(appNameOrPackage, ignoreCase = true) || label.contains(appNameOrPackage, ignoreCase = true)) {
                        val candidate = pm.getLaunchIntentForPackage(info.packageName)
                        if (candidate != null) {
                            targetPackage = info.packageName
                            intent = candidate
                            break
                        }
                    }
                }
            }

            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactContext.startActivity(intent)
                promise.resolve(targetPackage)
            } else {
                promise.reject("APP_NOT_FOUND", "Package or app '$appNameOrPackage' is not installed on this device.")
            }
        } catch (e: Exception) {
            promise.reject("LAUNCH_FAILED", e.message)
        }
    }

    @ReactMethod
    fun createNoteWithText(noteText: String, targetPackage: String?, promise: Promise) {
        try {
            val sendIntent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, noteText)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                if (!targetPackage.isNullOrEmpty()) {
                    setPackage(targetPackage)
                }
            }

            val pm = reactContext.packageManager
            if (sendIntent.resolveActivity(pm) != null) {
                reactContext.startActivity(sendIntent)
                promise.resolve(true)
            } else {
                // Fallback: Launch note app launcher activity directly
                val fallbackPkg = targetPackage ?: "com.vivo.notes"
                val launchIntent = pm.getLaunchIntentForPackage(fallbackPkg)?.apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    putExtra(Intent.EXTRA_TEXT, noteText)
                }
                if (launchIntent != null) {
                    reactContext.startActivity(launchIntent)
                    promise.resolve(true)
                } else {
                    promise.reject("APP_NOT_FOUND", "Note package $fallbackPkg not found.")
                }
            }
        } catch (e: Exception) {
            promise.reject("CREATE_NOTE_FAILED", e.message)
        }
    }

    @ReactMethod
    fun getVoiceState(promise: Promise) {
        val map = Arguments.createMap().apply {
            putBoolean("isListening", isListening)
            putBoolean("isSpeaking", isSpeaking)
            putBoolean("isTtsReady", isTtsInitialized)
            putBoolean("isRecognitionAvailable", SpeechRecognizer.isRecognitionAvailable(reactContext))
        }
        promise.resolve(map)
    }

    @ReactMethod
    fun saveTokens(accessToken: String, refreshToken: String, promise: Promise) {
        try {
            val prefs = reactContext.getSharedPreferences("aiva_auth_prefs", Context.MODE_PRIVATE)
            prefs.edit()
                .putString("access_token", accessToken)
                .putString("refresh_token", refreshToken)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STORAGE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getStoredTokens(promise: Promise) {
        try {
            val prefs = reactContext.getSharedPreferences("aiva_auth_prefs", Context.MODE_PRIVATE)
            val accessToken = prefs.getString("access_token", null)
            val refreshToken = prefs.getString("refresh_token", null)
            val map = Arguments.createMap().apply {
                putString("accessToken", accessToken)
                putString("refreshToken", refreshToken)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("STORAGE_ERROR", e.message)
        }
    }

    private fun registerVoiceCommandReceiver() {
        voiceCommandReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == ACTION_VOICE_COMMAND) {
                    val cmd = intent.getStringExtra("command")
                        ?: intent.getStringExtra("text")
                        ?: intent.getStringExtra("query")
                        ?: intent.getStringExtra("voice_command")

                    if (!cmd.isNullOrBlank()) {
                        Log.i(TAG, "[AIVA Broadcast] Received background voice command: $cmd")
                        val resultsArrayPlural = Arguments.createArray().apply {
                            pushString(cmd)
                        }
                        val resultsMapPlural = Arguments.createMap().apply {
                            putArray("value", resultsArrayPlural)
                            putString("text", cmd)
                            putBoolean("isFinal", true)
                        }
                        val resultsMapSingular = Arguments.createMap().apply {
                            putString("text", cmd)
                            putBoolean("isFinal", true)
                        }
                        sendEvent("onSpeechResults", resultsMapPlural)
                        sendEvent("onSpeechResult", resultsMapSingular)
                    } else {
                        Log.w(TAG, "[AIVA Broadcast] Received VOICE_COMMAND broadcast with empty command")
                    }
                }
            }
        }

        try {
            val filter = IntentFilter(ACTION_VOICE_COMMAND)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                reactContext.registerReceiver(voiceCommandReceiver, filter, Context.RECEIVER_EXPORTED)
            } else {
                reactContext.registerReceiver(voiceCommandReceiver, filter)
            }
            Log.i(TAG, "Registered exported broadcast receiver for $ACTION_VOICE_COMMAND")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register broadcast receiver for $ACTION_VOICE_COMMAND: ${e.message}")
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        try {
            voiceCommandReceiver?.let {
                reactContext.unregisterReceiver(it)
                voiceCommandReceiver = null
            }
        } catch (_: Exception) {}
        mainHandler.post {
            try {
                speechRecognizer?.destroy()
                speechRecognizer = null
                tts?.stop()
                tts?.shutdown()
                tts = null
            } catch (_: Exception) {}
        }
    }
}
