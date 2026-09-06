package com.privateagent

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.view.WindowManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Voice-driven screen power (BD004).
 * sleep → accessibility GLOBAL_ACTION_LOCK_SCREEN, else DevicePolicyManager.lockNow if admin.
 * wake → FULL_WAKE_LOCK (+ ACQUIRE_CAUSES_WAKEUP) and FLAG_KEEP_SCREEN_ON on the activity.
 */
class ScreenPowerModule(private val ctx: ReactApplicationContext) :
  ReactContextBaseJavaModule(ctx) {

  private var screenWakeLock: PowerManager.WakeLock? = null

  override fun getName(): String = "ScreenPower"

  @ReactMethod
  fun sleep(promise: Promise) {
    try {
      clearKeepScreenOn()
      releaseScreenWakeLock()

      val a11y = AgentAccessibilityService.instance
      if (a11y != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        val ok = a11y.pressKey("lock")
        if (ok) {
          promise.resolve("accessibility")
          return
        }
      }

      val dpm =
        ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
      if (dpm != null) {
        try {
          dpm.lockNow()
          promise.resolve("device_admin")
          return
        } catch (_: SecurityException) {
          // No active device-admin — fall through
        }
      }

      promise.reject(
        "SCREEN_SLEEP_UNAVAILABLE",
        "Enable accessibility (lock) or device-admin to sleep the screen",
      )
    } catch (e: Exception) {
      promise.reject("SCREEN_SLEEP", e.message, e)
    }
  }

  @ReactMethod
  fun wake(promise: Promise) {
    try {
      val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
      @Suppress("DEPRECATION")
      val flags =
        PowerManager.FULL_WAKE_LOCK or
          PowerManager.ACQUIRE_CAUSES_WAKEUP or
          PowerManager.ON_AFTER_RELEASE
      if (screenWakeLock?.isHeld != true) {
        screenWakeLock =
          pm.newWakeLock(flags, "PrivateAgent:ScreenWake").apply {
            setReferenceCounted(false)
            acquire(60_000L)
          }
      }
      val activity = currentActivity
      if (activity != null) {
        activity.runOnUiThread {
          activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        promise.resolve(true)
      } else {
        // Wake lock alone may still raise the panel on some OEMs
        promise.resolve(true)
      }
    } catch (e: Exception) {
      promise.reject("SCREEN_WAKE", e.message, e)
    }
  }

  @ReactMethod
  fun clearKeepAwake(promise: Promise) {
    try {
      clearKeepScreenOn()
      releaseScreenWakeLock()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SCREEN_CLEAR", e.message, e)
    }
  }

  override fun onCatalystInstanceDestroy() {
    clearKeepScreenOn()
    releaseScreenWakeLock()
    super.onCatalystInstanceDestroy()
  }

  private fun clearKeepScreenOn() {
    val activity = currentActivity ?: return
    activity.runOnUiThread {
      activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
  }

  private fun releaseScreenWakeLock() {
    screenWakeLock?.let {
      if (it.isHeld) {
        it.release()
      }
    }
    screenWakeLock = null
  }
}
