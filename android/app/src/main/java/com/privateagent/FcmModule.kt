package com.privateagent

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * FCM bridge (BD033).
 *
 * IF001's `google-services.json` is still a **placeholder** — real Firebase Cloud Messaging
 * token registration is not wired until a real Firebase project replaces it. This module:
 * - exposes `getToken()` → null + reason while placeholder
 * - lets native/tests inject a data-message via `emitDataMessage` for JS handling
 * - is the seam where FirebaseMessagingService will forward high-priority data payloads
 */
class FcmModule(private val ctx: ReactApplicationContext) :
  ReactContextBaseJavaModule(ctx) {

  override fun getName(): String = "FcmBridge"

  @ReactMethod
  fun getToken(promise: Promise) {
    // Placeholder google-services — no real FCM token until IF001 owner action.
    val map = Arguments.createMap()
    map.putNull("token")
    map.putString("reason", "FIREBASE_PLACEHOLDER")
    promise.resolve(map)
  }

  @ReactMethod
  fun emitDataMessage(type: String, payloadJson: String, promise: Promise) {
    val map = Arguments.createMap()
    map.putString("type", type)
    map.putString("payloadJson", payloadJson)
    sendEvent("FcmDataMessage", map)
    promise.resolve(true)
  }

  private fun sendEvent(event: String, params: WritableMap) {
    ctx
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(event, params)
  }
}
