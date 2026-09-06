package com.privateagent

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

/**
 * Copies bundled KWS model assets from APK `assets/kws/` into app filesDir
 * so sherpa-onnx can open them as regular filesystem paths.
 */
class KwsAssetsModule(private val ctx: ReactApplicationContext) :
  ReactContextBaseJavaModule(ctx) {

  override fun getName(): String = "KwsAssets"

  @ReactMethod
  fun ensureModelDir(promise: Promise) {
    try {
      val target = File(ctx.filesDir, "kws")
      if (!target.exists() && !target.mkdirs()) {
        promise.reject("KWS_ASSETS", "Failed to create ${target.absolutePath}")
        return
      }
      val assetNames = ctx.assets.list("kws") ?: emptyArray()
      if (assetNames.isEmpty()) {
        promise.reject("KWS_ASSETS", "No assets under assets/kws/")
        return
      }
      for (name in assetNames) {
        val out = File(target, name)
        if (out.exists() && out.length() > 0L) {
          continue
        }
        ctx.assets.open("kws/$name").use { input ->
          FileOutputStream(out).use { output ->
            input.copyTo(output)
          }
        }
      }
      promise.resolve(target.absolutePath)
    } catch (e: IOException) {
      promise.reject("KWS_ASSETS", e.message, e)
    }
  }
}
