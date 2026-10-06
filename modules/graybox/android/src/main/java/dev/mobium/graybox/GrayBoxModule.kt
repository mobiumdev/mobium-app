package dev.mobium.graybox

import android.app.Activity
import android.graphics.Color
import android.text.Editable
import android.text.TextWatcher
import android.util.Log
import android.view.ViewGroup
import android.widget.EditText
import android.widget.FrameLayout
import org.json.JSONObject
import android.view.MotionEvent
import android.view.Window
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.WeakHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

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
//   MOBIUM-GRAYBOX still busy=1       every half second while work is in
//                                     flight, from a native timer: busy is a
//                                     lease, and an app that stops renewing
//                                     it (crashed, killed) is not waited on
//   MOBIUM-GRAYBOX away / back        the app left the foreground / returned
//   MOBIUM-GRAYBOX hook id=7 ok <json>      a hook Mobium called answered
//   MOBIUM-GRAYBOX hook id=7 error <text>   or failed, saying why
//
// Hooks are the way in. The app registers them by name from JavaScript;
// Mobium calls one by setting the mailbox's text to {"i":id,"h":name,"a":[]},
// a field that exists only in a gray-box launch, and reads the answer from
// logcat. The field brings up no keyboard and draws nothing.
class GrayBoxModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("GrayBox")

    Events("onHook")

    OnCreate {
      GrayBox.module = this@GrayBoxModule
      GrayBox.attach(appContext.currentActivity)
    }
    OnActivityEntersForeground {
      GrayBox.attach(appContext.currentActivity)
      GrayBox.lifecycle("back")
    }
    OnActivityEntersBackground { GrayBox.lifecycle("away") }

    Function("busy") { tag: String -> GrayBox.change(1, tag) }
    Function("idle") { tag: String -> GrayBox.change(-1, tag) }
    // answer writes a hook's outcome: ok with its result as JSON, or the
    // error's text. JavaScript calls it once per call it was handed.
    Function("answer") { id: String, ok: Boolean, payload: String ->
      GrayBox.answer(id, ok, payload)
    }
  }

  fun deliver(id: String, hook: String, args: List<Any?>) {
    sendEvent("onHook", mapOf("id" to id, "hook" to hook, "args" to args))
  }
}

object GrayBox {
  private const val TAG = "MobiumGrayBox"
  @Volatile private var enabled = false
  private var count = 0
  private var started = false
  private val watched = WeakHashMap<Window, Boolean>()

  fun attach(activity: Activity?) {
    activity ?: return
    if (!enabled) {
      if (!activity.intent.getBooleanExtra("MobiumGrayBox", false)) return
      enabled = true
      write("on")
      startBeat()
    }
    activity.runOnUiThread {
      watch(activity.window)
      mailbox(activity)
    }
  }

  @Volatile var module: GrayBoxModule? = null
  private val mailboxes = WeakHashMap<Activity, EditText>()

  fun answer(id: String, ok: Boolean, payload: String) {
    if (!enabled) return
    write("hook id=$id ${if (ok) "ok" else "error"} ${payload.replace('\n', ' ')}")
  }

  // mailbox adds the field Mobium writes a hook call into: 2 by 2 pixels,
  // transparent, with no keyboard of its own. UiAutomator2 sets its whole
  // text at once; it acts on a whole JSON object and clears itself.
  private fun mailbox(activity: Activity) {
    if (mailboxes.containsKey(activity)) return
    val field = EditText(activity).apply {
      contentDescription = "mobium-mailbox"
      setBackgroundColor(Color.TRANSPARENT)
      setTextColor(Color.TRANSPARENT)
      isCursorVisible = false
      showSoftInputOnFocus = false
      setPadding(0, 0, 0, 0)
      textSize = 1f
    }
    field.addTextChangedListener(object : TextWatcher {
      override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
      override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
      override fun afterTextChanged(s: Editable?) {
        val text = s?.toString() ?: return
        if (!text.endsWith("}")) return
        val call = try { JSONObject(text) } catch (e: Exception) { return }
        val hook = call.optString("h", "")
        if (hook.isEmpty()) return
        val id = call.opt("i")?.toString() ?: "?"
        val array = call.optJSONArray("a")
        val args = (0 until (array?.length() ?: 0)).map { array!!.opt(it)?.let { v -> if (v == JSONObject.NULL) null else v.toString() } }
        field.post { field.setText("") }
        module?.deliver(id, hook, args)
      }
    })
    val params = FrameLayout.LayoutParams(2, 2).apply { leftMargin = 0; topMargin = 200 }
    activity.addContentView(field, params as ViewGroup.LayoutParams)
    mailboxes[activity] = field
  }

  @Synchronized
  fun change(by: Int, tag: String) {
    if (!enabled) return
    count = maxOf(0, count + by)
    write("busy=$count tag=${tag.trim().replace(Regex("\\s+"), "_")}")
  }

  fun lifecycle(what: String) {
    if (enabled) write(what)
  }

  // startBeat restates the count every half second while work is in
  // flight, from a thread of its own, so a blocked JavaScript thread still
  // renews the lease and a dead process stops renewing it.
  @Synchronized
  private fun startBeat() {
    if (started) return
    started = true
    Executors.newSingleThreadScheduledExecutor().scheduleAtFixedRate({
      val n = synchronized(this) { count }
      if (n > 0) write("still busy=$n")
    }, 500, 500, TimeUnit.MILLISECONDS)
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
