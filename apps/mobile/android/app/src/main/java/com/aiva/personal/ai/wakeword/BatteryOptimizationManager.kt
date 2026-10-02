package com.aiva.personal.ai.wakeword

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.util.Log

enum class BatteryMode {
    PERFORMANCE,
    BALANCED,
    BATTERY_SAVER,
    ULTRA_LOW_POWER
}

/**
 * BatteryOptimizationManager
 *
 * Dynamically adjusts wake-word processing frequency, buffer sizes, and duty cycles
 * according to user preference and system battery levels.
 */
class BatteryOptimizationManager(
    private val context: Context,
    private val onModeChanged: (mode: BatteryMode, isListeningAllowed: Boolean) -> Unit
) {
    companion object {
        private const val TAG = "AivaBatteryManager"
        const val ULTRA_LOW_THRESHOLD = 15 // Pause wake word below 15% battery
        const val BATTERY_SAVER_THRESHOLD = 30 // Switch to battery saver below 30%
    }

    private var currentMode: BatteryMode = BatteryMode.BALANCED
    private var isAutoModeEnabled: Boolean = true
    private var batteryReceiver: BroadcastReceiver? = null

    init {
        registerBatteryReceiver()
    }

    fun setMode(mode: BatteryMode, isManualOverride: Boolean = true) {
        if (isManualOverride) {
            isAutoModeEnabled = false
        }
        currentMode = mode
        val isListeningAllowed = mode != BatteryMode.ULTRA_LOW_POWER
        Log.i(TAG, "Battery mode set to: $mode (Listening allowed: $isListeningAllowed)")
        onModeChanged(mode, isListeningAllowed)
    }

    fun getMode(): BatteryMode = currentMode

    fun setAutoModeEnabled(enabled: Boolean) {
        isAutoModeEnabled = enabled
        if (enabled) {
            evaluateBatteryLevel()
        }
    }

    private fun registerBatteryReceiver() {
        batteryReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == Intent.ACTION_BATTERY_CHANGED && isAutoModeEnabled) {
                    val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
                    val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
                    val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
                    val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                                     status == BatteryManager.BATTERY_STATUS_FULL

                    if (level != -1 && scale != -1) {
                        val batteryPct = (level * 100) / scale
                        applyAutoPolicy(batteryPct, isCharging)
                    }
                }
            }
        }

        val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        context.registerReceiver(batteryReceiver, filter)
    }

    private fun applyAutoPolicy(batteryPct: Int, isCharging: Boolean) {
        val calculatedMode = when {
            isCharging -> BatteryMode.PERFORMANCE
            batteryPct <= ULTRA_LOW_THRESHOLD -> BatteryMode.ULTRA_LOW_POWER
            batteryPct <= BATTERY_SAVER_THRESHOLD -> BatteryMode.BATTERY_SAVER
            else -> BatteryMode.BALANCED
        }

        if (calculatedMode != currentMode) {
            Log.i(TAG, "Auto battery policy adjusted mode to $calculatedMode (Battery: $batteryPct%, Charging: $isCharging)")
            setMode(calculatedMode, isManualOverride = false)
        }
    }

    private fun evaluateBatteryLevel() {
        val batteryIntent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        if (level != -1 && scale != -1) {
            val batteryPct = (level * 100) / scale
            applyAutoPolicy(batteryPct, false)
        }
    }

    fun unregister() {
        try {
            batteryReceiver?.let { context.unregisterReceiver(it) }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to unregister battery receiver: ${e.message}")
        }
    }
}
