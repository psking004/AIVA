package com.aiva.personal.ai.wakeword

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class AivaWakeWordModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "AivaWakeWordModule"

    private var wakeWordReceiver: BroadcastReceiver? = null

    init {
        registerWakeWordReceiver()
    }

    private fun registerWakeWordReceiver() {
        wakeWordReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == AivaWakeWordForegroundService.BROADCAST_WAKE_WORD_DETECTED) {
                    val confidence = intent.getFloatExtra(AivaWakeWordForegroundService.EXTRA_CONFIDENCE, 0.8f)
                    val params = Arguments.createMap().apply {
                        putString("keyword", "AIVA")
                        putDouble("confidence", confidence.toDouble())
                        putDouble("timestamp", System.currentTimeMillis().toDouble())
                    }
                    sendEvent("onWakeWordDetected", params)
                }
            }
        }

        val filter = IntentFilter(AivaWakeWordForegroundService.BROADCAST_WAKE_WORD_DETECTED)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactContext.registerReceiver(wakeWordReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            reactContext.registerReceiver(wakeWordReceiver, filter)
        }
    }

    private fun sendEvent(eventName: String, params: Any?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun startWakeWord(batteryMode: String, promise: Promise) {
        try {
            val intent = Intent(reactContext, AivaWakeWordForegroundService::class.java).apply {
                action = AivaWakeWordForegroundService.ACTION_START
                putExtra(AivaWakeWordForegroundService.EXTRA_BATTERY_MODE, batteryMode)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_ERROR", "Failed to start wake word service: ${e.message}")
        }
    }

    @ReactMethod
    fun stopWakeWord(promise: Promise) {
        try {
            val intent = Intent(reactContext, AivaWakeWordForegroundService::class.java).apply {
                action = AivaWakeWordForegroundService.ACTION_STOP
            }
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", "Failed to stop wake word service: ${e.message}")
        }
    }

    @ReactMethod
    fun setBatteryMode(mode: String, promise: Promise) {
        try {
            val intent = Intent(reactContext, AivaWakeWordForegroundService::class.java).apply {
                action = AivaWakeWordForegroundService.ACTION_SET_MODE
                putExtra(AivaWakeWordForegroundService.EXTRA_BATTERY_MODE, mode)
            }
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("MODE_ERROR", "Failed to set battery mode: ${e.message}")
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Keep for RN Event Emitter compliance
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Keep for RN Event Emitter compliance
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        try {
            wakeWordReceiver?.let { reactContext.unregisterReceiver(it) }
        } catch (_: Exception) {}
    }
}
