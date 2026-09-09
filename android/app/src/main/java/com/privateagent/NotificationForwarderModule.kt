package com.privateagent

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class NotificationForwarderModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  init {
    Companion.reactContext = reactContext
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun isNotificationAccessEnabled(promise: Promise) {
    try {
      val flat =
        Settings.Secure.getString(
          reactContext.contentResolver,
          "enabled_notification_listeners",
        ) ?: ""
      val cn = ComponentName(reactContext, AgentNotificationListenerService::class.java)
      promise.resolve(flat.contains(cn.flattenToString()) || flat.contains(cn.packageName + "/" + cn.className))
    } catch (e: Exception) {
      promise.reject("NLS_CHECK", e.message, e)
    }
  }

  @ReactMethod
  fun openNotificationAccessSettings(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("NLS_SETTINGS", e.message, e)
    }
  }

  companion object {
    const val NAME = "NotificationForwarder"
    @JvmStatic var reactContext: ReactApplicationContext? = null
  }
}
