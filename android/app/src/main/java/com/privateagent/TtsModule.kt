package com.privateagent

import android.speech.tts.TextToSpeech
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale
import java.util.UUID

class TtsModule(private val ctx: ReactApplicationContext) :
  ReactContextBaseJavaModule(ctx), TextToSpeech.OnInitListener {

  private var tts: TextToSpeech? = null
  private var ready = false

  override fun getName(): String = "TtsBridge"

  override fun initialize() {
    super.initialize()
    tts = TextToSpeech(ctx.applicationContext, this)
  }

  override fun onCatalystInstanceDestroy() {
    tts?.stop()
    tts?.shutdown()
    tts = null
    ready = false
    super.onCatalystInstanceDestroy()
  }

  override fun onInit(status: Int) {
    ready = status == TextToSpeech.SUCCESS
    if (ready) {
      tts?.language = Locale.getDefault()
    }
  }

  @ReactMethod
  fun speak(text: String, promise: Promise) {
    val engine = tts
    if (!ready || engine == null) {
      promise.reject("TTS_NOT_READY", "TextToSpeech not initialized")
      return
    }
    val utteranceId = UUID.randomUUID().toString()
    engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
    promise.resolve(true)
  }

  @ReactMethod
  fun stop(promise: Promise) {
    tts?.stop()
    promise.resolve(true)
  }
}
