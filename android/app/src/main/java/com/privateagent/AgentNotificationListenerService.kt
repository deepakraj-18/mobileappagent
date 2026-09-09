package com.privateagent

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Forwards posted notifications to JS when the user has opted in (BD052).
 * Default is off — JS ignores events until CompanionSettings.notificationForwarding.enabled.
 */
class AgentNotificationListenerService : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null || sbn.isOngoing) {
      return
    }
    val extras = sbn.notification?.extras
    val title = extras?.getCharSequence("android.title")?.toString().orEmpty()
    val text = extras?.getCharSequence("android.text")?.toString().orEmpty()
    val map = Arguments.createMap().apply {
      putString("packageName", sbn.packageName)
      putString("title", title)
      putString("text", text)
      putDouble("postedAt", sbn.postTime.toDouble())
      putString("key", sbn.key)
    }
    emit("NotificationPosted", map)
  }

  private fun emit(event: String, payload: WritableMap) {
    val ctx = NotificationForwarderModule.reactContext ?: return
    if (!ctx.hasActiveReactInstance()) {
      return
    }
    ctx
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(event, payload)
  }
}
