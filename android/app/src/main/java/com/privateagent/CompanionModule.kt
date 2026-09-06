package com.privateagent

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class CompanionModule(private val ctx: ReactApplicationContext) :
  ReactContextBaseJavaModule(ctx) {

  override fun getName(): String = "CompanionRuntime"

  @ReactMethod
  fun start(promise: Promise) {
    try {
      CompanionForegroundService.start(ctx.applicationContext)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("COMPANION_START", e.message, e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      CompanionForegroundService.stop(ctx.applicationContext)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("COMPANION_STOP", e.message, e)
    }
  }
}
