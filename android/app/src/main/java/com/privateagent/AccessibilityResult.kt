package com.privateagent

/**
 * Framework-neutral async result surface for gesture/screenshot APIs.
 * Replaces Flutter's MethodChannel.Result so the accessibility service
 * stays independent of React Native / Flutter.
 */
interface AccessibilityResult {
    fun success(value: Any?)
    fun error(code: String, message: String?, details: Any?)
}
