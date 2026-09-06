package com.privateagent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Restarts the companion FGS after reboot when docked mode was left on (SC005).
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    if (
      action != Intent.ACTION_BOOT_COMPLETED &&
        action != Intent.ACTION_LOCKED_BOOT_COMPLETED &&
        action != "android.intent.action.QUICKBOOT_POWERON"
    ) {
      return
    }

    val prefs =
      context.getSharedPreferences(CompanionForegroundService.PREFS, Context.MODE_PRIVATE)
    val docked = prefs.getBoolean(CompanionForegroundService.PREF_DOCKED, false)
    if (!docked) {
      Log.i(TAG, "Boot: companion not docked — skip FGS")
      return
    }

    Log.i(TAG, "Boot: companion docked — starting FGS")
    CompanionForegroundService.start(context.applicationContext)
  }

  companion object {
    private const val TAG = "BootReceiver"
  }
}
