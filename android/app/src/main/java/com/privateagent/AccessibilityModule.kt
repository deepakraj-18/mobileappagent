package com.privateagent

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.module.annotations.ReactModule

/**
 * React Native bridge to [AgentAccessibilityService] — replaces the Flutter
 * MethodChannel `com.privateagent/accessibility`.
 */
@ReactModule(name = AccessibilityModule.NAME)
class AccessibilityModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    @ReactMethod
    fun isServiceEnabled(promise: Promise) {
        promise.resolve(AgentAccessibilityService.isConnected)
    }

    @ReactMethod
    fun openAccessibilitySettings(promise: Promise) {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactContext.startActivity(intent)
        promise.resolve(true)
    }

    @ReactMethod
    fun openAppInfoSettings(promise: Promise) {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", reactContext.packageName, null)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactContext.startActivity(intent)
        promise.resolve(true)
    }

    @ReactMethod
    fun getScreenSize(promise: Promise) {
        val metrics = reactContext.resources.displayMetrics
        val map = Arguments.createMap().apply {
            putInt("width", metrics.widthPixels)
            putInt("height", metrics.heightPixels)
        }
        promise.resolve(map)
    }

    @ReactMethod
    fun dumpScreen(promise: Promise) {
        val service = AgentAccessibilityService.instance
        if (service == null) {
            promise.reject("SERVICE_OFF", "PrivateAgent accessibility service is not enabled")
            return
        }
        try {
            val nodes = service.dumpScreen()
            val arr = Arguments.createArray()
            for (node in nodes) {
                arr.pushMap(mapToWritable(node))
            }
            promise.resolve(arr)
        } catch (e: Exception) {
            promise.reject("DUMP_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun takeScreenshot(promise: Promise) {
        val service = AgentAccessibilityService.instance
        if (service == null) {
            promise.reject("SERVICE_OFF", "PrivateAgent accessibility service is not enabled")
            return
        }
        service.takeScreenshotBase64(promiseResult(promise))
    }

    @ReactMethod
    fun clickAt(x: Double, y: Double, promise: Promise) {
        val service = AgentAccessibilityService.instance
        if (service == null) {
            promise.reject("SERVICE_OFF", "Accessibility service is not enabled")
            return
        }
        service.clickAt(x.toFloat(), y.toFloat(), promiseResult(promise))
    }

    @ReactMethod
    fun swipe(params: ReadableMap, promise: Promise) {
        val service = AgentAccessibilityService.instance
        if (service == null) {
            promise.reject("SERVICE_OFF", "Accessibility service is not enabled")
            return
        }
        val sx = params.getDouble("startX").toFloat()
        val sy = params.getDouble("startY").toFloat()
        val ex = params.getDouble("endX").toFloat()
        val ey = params.getDouble("endY").toFloat()
        val duration = if (params.hasKey("durationMs")) params.getDouble("durationMs").toLong() else 350L
        service.swipe(sx, sy, ex, ey, duration, promiseResult(promise))
    }

    @ReactMethod
    fun scroll(direction: String, promise: Promise) {
        val service = AgentAccessibilityService.instance
        if (service == null) {
            promise.reject("SERVICE_OFF", "Accessibility service is not enabled")
            return
        }
        service.scroll(direction, promiseResult(promise))
    }

    @ReactMethod
    fun typeText(text: String, promise: Promise) {
        val service = AgentAccessibilityService.instance
        if (service == null) {
            promise.reject("SERVICE_OFF", "Accessibility service is not enabled")
            return
        }
        promise.resolve(service.typeText(text))
    }

    @ReactMethod
    fun pressKey(key: String, promise: Promise) {
        val service = AgentAccessibilityService.instance
        if (service == null) {
            promise.reject("SERVICE_OFF", "Accessibility service is not enabled")
            return
        }
        promise.resolve(service.pressKey(key))
    }

    private fun promiseResult(promise: Promise): AccessibilityResult =
        object : AccessibilityResult {
            override fun success(value: Any?) {
                promise.resolve(value)
            }

            override fun error(code: String, message: String?, details: Any?) {
                promise.reject(code, message)
            }
        }

    @Suppress("UNCHECKED_CAST")
    private fun mapToWritable(raw: Map<String, Any?>): com.facebook.react.bridge.WritableMap {
        val map = Arguments.createMap()
        for ((k, v) in raw) {
            when (v) {
                null -> map.putNull(k)
                is Boolean -> map.putBoolean(k, v)
                is Int -> map.putInt(k, v)
                is Long -> map.putDouble(k, v.toDouble())
                is Float -> map.putDouble(k, v.toDouble())
                is Double -> map.putDouble(k, v)
                is String -> map.putString(k, v)
                is Map<*, *> -> map.putMap(k, mapToWritable(v as Map<String, Any?>))
                is List<*> -> {
                    val arr = Arguments.createArray()
                    for (item in v) {
                        when (item) {
                            is Map<*, *> -> arr.pushMap(mapToWritable(item as Map<String, Any?>))
                            is String -> arr.pushString(item)
                            is Boolean -> arr.pushBoolean(item)
                            is Int -> arr.pushInt(item)
                            is Double -> arr.pushDouble(item)
                            else -> arr.pushString(item?.toString())
                        }
                    }
                    map.putArray(k, arr)
                }
                else -> map.putString(k, v.toString())
            }
        }
        return map
    }

    companion object {
        const val NAME = "AccessibilityBridge"
    }
}
