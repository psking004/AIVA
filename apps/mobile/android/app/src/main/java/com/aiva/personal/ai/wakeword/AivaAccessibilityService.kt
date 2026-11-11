package com.aiva.personal.ai.wakeword

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.app.Notification
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.util.concurrent.CopyOnWriteArrayList

/**
 * AivaAccessibilityService
 *
 * Dedicated Android Accessibility Service for hands-free automation:
 * 1. Automatically dispatches the "Send" button in WhatsApp (com.whatsapp:id/send).
 * 2. Automatically selects "Add to new note" in Vivo Notes (com.vivo.notes) to bypass SelectorActivity.
 * 3. Captures and caches messaging notifications (WhatsApp, SMS, Google Messages) for stale briefing updates.
 */
data class NotificationRecord(
    val packageName: String,
    val title: String,
    val text: String,
    val timestamp: Long
)

class AivaAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "AivaAccessibility"

        @Volatile
        var instance: AivaAccessibilityService? = null
            private set

        @Volatile
        var isWhatsAppAutoSendPending = false

        private val unreadNotifications = CopyOnWriteArrayList<NotificationRecord>()

        fun addNotification(pkg: String, title: String, text: String) {
            unreadNotifications.add(NotificationRecord(pkg, title, text, System.currentTimeMillis()))
            if (unreadNotifications.size > 20) {
                unreadNotifications.removeAt(0)
            }
        }

        fun getAndClearUnreadSummary(): Pair<Int, String> {
            val count = unreadNotifications.size
            if (count == 0) {
                return Pair(0, "no unread messages")
            }
            val appSenders = unreadNotifications.mapNotNull { rec ->
                val app = when {
                    rec.packageName.contains("whatsapp", ignoreCase = true) -> "WhatsApp"
                    rec.packageName.contains("mms", ignoreCase = true) ||
                    rec.packageName.contains("messaging", ignoreCase = true) ||
                    rec.packageName.contains("sms", ignoreCase = true) -> "SMS"
                    else -> null
                }
                if (app != null) {
                    if (rec.title.isNotBlank()) "$app message from ${rec.title}" else "$app message"
                } else null
            }.distinct()

            unreadNotifications.clear()
            val summary = when {
                appSenders.isEmpty() -> if (count == 1) "1 new notification" else "$count new notifications"
                appSenders.size == 1 -> appSenders.first()
                else -> "${appSenders.size} notifications including ${appSenders.take(2).joinToString(" and ")}"
            }
            return Pair(count, summary)
        }

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
                AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED or
                AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED
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

        // 0. Intercept incoming notifications for WhatsApp, SMS, and messaging apps
        if (event.eventType == AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED) {
            val isMessagingApp = pkgName.contains("whatsapp", ignoreCase = true) ||
                    pkgName.contains("messaging", ignoreCase = true) ||
                    pkgName.contains("mms", ignoreCase = true) ||
                    pkgName.contains("sms", ignoreCase = true)
            if (isMessagingApp) {
                var title = ""
                var text = ""
                val parcelable = event.parcelableData
                if (parcelable is Notification) {
                    val extras = parcelable.extras
                    title = extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
                    text = extras?.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
                }
                if (title.isBlank() && event.text.isNotEmpty()) {
                    text = event.text.joinToString(" ")
                }
                addNotification(pkgName, title, text)
                Log.i(TAG, "Cached messaging notification: pkg=$pkgName, title=$title, text=$text")
            }
            return
        }

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

