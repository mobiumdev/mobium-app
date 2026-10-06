package dev.mobium.graybox

import android.app.Activity
import android.util.Log
import android.view.MotionEvent
import android.view.Window
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.WeakHashMap

// GrayBox is Mobium's gray-box library on Android: the app says when it
// starts and finishes work, and each change is a line in logcat, under the
// tag MobiumGrayBox, which Mobium reads as it arrives. The app declares its
// own busy state; nothing here detects it.
//
// It is silent unless the app was started with the intent extra
// MobiumGrayBox=true, which `mobium launch --gray-box` passes. A launch from
// the home screen carries no such extra, so a person running this build
// never turns it on.
//
// The lines are the iOS library's:
//
//   MOBIUM-GRAYBOX on                 the library is listening
//   MOBIUM-GRAYBOX busy=1 tag=fetch   work started; 1 thing in flight
//   MOBIUM-GRAYBOX busy=0 tag=fetch   that work finished, and is on screen
//   MOBIUM-GRAYBOX lift               a finger came up
class GrayBoxModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("GrayBox")

    OnCreate { GrayBox.attach(appContext.currentActivity) }
    OnActivityEntersForeground { GrayBox.attach(appContext.currentActivity) }

    Function("busy") { tag: String -> GrayBox.change(1, tag) }
    Function("idle") { tag: String -> GrayBox.change(-1, tag) }
  }
}

object GrayBox {
  private const val TAG = "MobiumGrayBox"
  @Volatile private var enabled = false
  private var count = 0
  private val watched = WeakHashMap<Window, Boolean>()

  fun attach(activity: Activity?) {
    activity ?: return
    if (!enabled) {
      if (!activity.intent.getBooleanExtra("MobiumGrayBox", false)) return
      enabled = true
      write("on")
    }
    activity.runOnUiThread { watch(activity.window) }
  }

  @Synchronized
  fun change(by: Int, tag: String) {
    if (!enabled) return
    count = maxOf(0, count + by)
    write("busy=$count tag=${tag.trim().replace(Regex("\\s+"), "_")}")
  }

  fun write(what: String) {
    Log.i(TAG, "MOBIUM-GRAYBOX $what t=${System.currentTimeMillis()}")
  }

  // watch wraps the window's callback to say when a finger lifts, which is
  // when work a tap starts is announced. It passes every event on unchanged.
  private fun watch(window: Window) {
    if (watched.containsKey(window)) return
    watched[window] = true
    val inner = window.callback
    window.callback = object : Window.Callback by inner {
      override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_UP) write("lift")
        return inner.dispatchTouchEvent(event)
      }
    }
  }
}
