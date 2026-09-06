package com.privateagent

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

/**
 * Keeps the companion runtime alive while docked (SC004).
 * specialUse FGS — desk companion body, not a Play-distributed fitness tracker.
 */
class CompanionForegroundService : Service() {

  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopForeground(STOP_FOREGROUND_REMOVE)
        releaseWakeLock()
        stopSelf()
        return START_NOT_STICKY
      }
      else -> {
        ensureChannel()
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          startForeground(
            NOTIFICATION_ID,
            notification,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
          )
        } else {
          startForeground(NOTIFICATION_ID, notification)
        }
        acquireWakeLock()
      }
    }
    return START_STICKY
  }

  override fun onDestroy() {
    releaseWakeLock()
    super.onDestroy()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val mgr = getSystemService(NotificationManager::class.java) ?: return
    val channel =
      NotificationChannel(
        CHANNEL_ID,
        "Companion runtime",
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        description = "Keeps PrivateAgent awake while docked as a desk companion"
      }
    mgr.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val launch =
      PendingIntent.getActivity(
        this,
        0,
        Intent(this, MainActivity::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("PrivateAgent companion")
      .setContentText("Docked · runtime active")
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentIntent(launch)
      .setOngoing(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .build()
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock =
      pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "PrivateAgent:Companion").apply {
        setReferenceCounted(false)
        acquire(10 * 60 * 60 * 1000L) // 10h desk session; refreshed by START_STICKY restarts
      }
  }

  private fun releaseWakeLock() {
    wakeLock?.let {
      if (it.isHeld) it.release()
    }
    wakeLock = null
  }

  companion object {
    const val CHANNEL_ID = "companion_runtime"
    const val NOTIFICATION_ID = 42001
    const val ACTION_STOP = "com.privateagent.action.STOP_COMPANION"
    const val PREFS = "pa_companion"
    const val PREF_DOCKED = "docked"

    fun start(context: Context) {
      context
        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putBoolean(PREF_DOCKED, true)
        .apply()
      val intent = Intent(context, CompanionForegroundService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      context
        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putBoolean(PREF_DOCKED, false)
        .apply()
      val intent =
        Intent(context, CompanionForegroundService::class.java).apply {
          action = ACTION_STOP
        }
      context.startService(intent)
    }
  }
}
