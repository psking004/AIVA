package com.aiva.personal.ai.wakeword

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * AivaAccessibilityService
 *
 * Dedicated Android Accessibility Service for hands-free automation:
 * 1. Automatically dispatches the "Send" button in WhatsApp (com.whatsapp:id/send).
 * 2. Automatically selects "Add to new note" in Vivo Notes (com.vivo.notes) to bypass SelectorActivity.
 */
class AivaAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "AivaAccessibility"

        @Volatile
        var instance: AivaAccessibilityService? = null
            private set

        @Volatile
        var isWhatsAppAutoSendPending = false

        fun triggerWhatsAppAutoSend(delayMs: Long = 800) {
            isWhatsAppAutoSendPending = true
            val handler = Handler(Looper.getMainLooper())
            val delays = listOf(delayMs, delayMs + 500, delayMs + 1000, delayMs + 1500)
            for (d in delays) {
                handler.postDelayed({
                    if (isWhatsAppAutoSendPending) {
                        val sent = instance?.clickSendButton() ?: false
                        if (sent) {
                            isWhatsAppAutoSendPending = false
                        }
                    }
                }, d)
            }
        }

        fun triggerVivoNotesAdd(delayMs: Long = 300) {
            val handler = Handler(Looper.getMainLooper())
            val delays = listOf(delayMs, delayMs + 400, delayMs + 800)
            for (d in delays) {
                handler.postDelayed({
                    instance?.dismissVivoNotesSelector()
                }, d)
            }
        }
    }

    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.i(TAG, "AivaAccessibilityService connected and initialized")

        val info = serviceInfo ?: AccessibilityServiceInfo()
        info.eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
        info.flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS or
                AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
        info.notificationTimeout = 100
        serviceInfo = info
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        val pkgName = event.packageName?.toString() ?: return

        // 1. Auto-dismiss Vivo Notes Share/Selector Activity
        if (pkgName == "com.vivo.notes") {
            val className = event.className?.toString() ?: ""
            if (className.contains("SelectorActivity") || className.contains("selector") || className.contains("Notes")) {
                dismissVivoNotesSelector()
            }
        }

        // 2. Auto-send WhatsApp message if pending
        if (pkgName == "com.whatsapp" && isWhatsAppAutoSendPending) {
            mainHandler.postDelayed({
                if (isWhatsAppAutoSendPending) {
                    val clicked = clickSendButton()
                    if (clicked) {
                        isWhatsAppAutoSendPending = false
                    }
                }
            }, 300)
        }
    }

    override fun onInterrupt() {
        Log.w(TAG, "AivaAccessibilityService interrupted")
    }

    override fun onDestroy() {
        super.onDestroy()
        if (instance == this) {
            instance = null
        }
        Log.i(TAG, "AivaAccessibilityService destroyed")
    }

    /**
     * Finds and clicks the WhatsApp send button in the currently focused window or any active window.
     */
    fun clickSendButton(): Boolean {
        try {
            val roots = mutableListOf<AccessibilityNodeInfo>()
            rootInActiveWindow?.let { roots.add(it) }
            try {
                for (win in windows) {
                    win.root?.let { if (!roots.contains(it)) roots.add(it) }
                }
            } catch (_: Exception) {}

            val sendButtonIds = listOf(
                "com.whatsapp:id/send",
                "com.whatsapp:id/send_container",
                "com.whatsapp:id/send_voice_note_or_ptt"
            )

            for (root in roots) {
                for (id in sendButtonIds) {
                    val nodes = root.findAccessibilityNodeInfosByViewId(id)
                    if (!nodes.isNullOrEmpty()) {
                        for (node in nodes) {
                            if (node.isClickable && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                                Log.i(TAG, "clickSendButton: clicked node $id")
                                isWhatsAppAutoSendPending = false
                                return true
                            }
                            var parent = node.parent
                            while (parent != null) {
                                if (parent.isClickable && parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                                    Log.i(TAG, "clickSendButton: clicked parent of $id")
                                    isWhatsAppAutoSendPending = false
                                    return true
                                }
                                parent = parent.parent
                            }
                        }
                    }
                }

                // Fallback: search by content description or text "Send"
                val textNodes = root.findAccessibilityNodeInfosByText("Send")
                if (!textNodes.isNullOrEmpty()) {
                    for (node in textNodes) {
                        if (node.isClickable && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                            Log.i(TAG, "clickSendButton: clicked node with text 'Send'")
                            isWhatsAppAutoSendPending = false
                            return true
                        }
                        var parent = node.parent
                        while (parent != null) {
                            if (parent.isClickable && parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                                Log.i(TAG, "clickSendButton: clicked parent of 'Send'")
                                isWhatsAppAutoSendPending = false
                                return true
                            }
                            parent = parent.parent
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "clickSendButton exception: ${e.message}", e)
        }
        return false
    }

    /**
     * Bypasses the Vivo Notes SelectorActivity by finding and clicking "Add to new note".
     */
    fun dismissVivoNotesSelector(): Boolean {
        try {
            val roots = mutableListOf<AccessibilityNodeInfo>()
            rootInActiveWindow?.let { roots.add(it) }
            try {
                for (win in windows) {
                    win.root?.let { if (!roots.contains(it)) roots.add(it) }
                }
            } catch (_: Exception) {}

            for (root in roots) {
                val newNoteNodes = root.findAccessibilityNodeInfosByText("Add to new note")
                if (!newNoteNodes.isNullOrEmpty()) {
                    for (node in newNoteNodes) {
                        if (node.isClickable && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                            Log.i(TAG, "dismissVivoNotesSelector: clicked 'Add to new note'")
                            return true
                        }
                        var parent = node.parent
                        while (parent != null) {
                            if (parent.isClickable && parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                                Log.i(TAG, "dismissVivoNotesSelector: clicked parent of 'Add to new note'")
                                return true
                            }
                            parent = parent.parent
                        }
                    }
                }

                // Also check for standard Vivo Notes New Note FAB
                val addIconNodes = root.findAccessibilityNodeInfosByViewId("com.vivo.notes:id/add_icon")
                if (!addIconNodes.isNullOrEmpty()) {
                    for (node in addIconNodes) {
                        if (node.isClickable && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                            Log.i(TAG, "dismissVivoNotesSelector: clicked com.vivo.notes:id/add_icon")
                            return true
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "dismissVivoNotesSelector exception: ${e.message}", e)
        }
        return false
    }
}

