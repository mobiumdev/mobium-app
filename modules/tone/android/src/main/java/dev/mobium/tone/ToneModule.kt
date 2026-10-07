package dev.mobium.tone

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlin.concurrent.thread
import kotlin.math.PI
import kotlin.math.min
import kotlin.math.sin

class Segment : Record {
  @Field val hz: Double = 0.0
  @Field val ms: Double = 0.0
}

// Plays known sounds for the Audio Demo: sine tones at exact frequencies and
// stretches of silence, through an AudioTrack whose usage the screen picks,
// since that is what the platform reports about a player. Generated rather
// than shipped as files, so what was played is exactly what the screen says.
//
// Silence is written as samples, not skipped: a track playing zeros is a
// player that is started and heard as nothing, which is the control the
// screen needs.
class ToneModule : Module() {
  private val rate = 48000
  // A quarter of full scale: loud enough to measure, and this plays on
  // somebody's phone.
  private val amplitude = 0.25
  @Volatile private var track: AudioTrack? = null

  override fun definition() = ModuleDefinition {
    Name("Tone")

    AsyncFunction("playAsync") { segments: List<Segment>, usage: String, promise: Promise ->
      val kind = when (usage) {
        "media" -> AudioAttributes.USAGE_MEDIA
        "alarm" -> AudioAttributes.USAGE_ALARM
        else -> null
      }
      if (kind == null) {
        promise.reject(CodedException("ERR_USAGE", "usage is media or alarm, not $usage", null))
      } else {
        play(segments, kind, promise)
      }
    }

    Function("stop") { stopTrack() }
  }

  private fun play(segments: List<Segment>, kind: Int, promise: Promise) {
    stopTrack()
    val pcm = render(segments)
    val t = AudioTrack.Builder()
      .setAudioAttributes(AudioAttributes.Builder().setUsage(kind).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
      .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
      .setTransferMode(AudioTrack.MODE_STREAM)
      .setBufferSizeInBytes(AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT))
      .build()
    track = t
    thread(name = "tone") {
      var whole = false
      try {
        t.play()
        var off = 0
        while (off < pcm.size && track === t) {
          val n = t.write(pcm, off, min(4800, pcm.size - off))
          if (n <= 0) break
          off += n
        }
        // The last write returns once it is buffered, not heard: wait for
        // the playback head to reach the end before saying it finished.
        while (track === t && t.playbackHeadPosition < pcm.size) Thread.sleep(10)
        whole = track === t
      } catch (_: IllegalStateException) {
      } finally {
        if (track === t) track = null
        try { t.stop() } catch (_: IllegalStateException) {}
        t.release()
        promise.resolve(whole)
      }
    }
  }

  private fun stopTrack() {
    val t = track ?: return
    track = null
    try { t.pause(); t.flush() } catch (_: IllegalStateException) {}
  }

  // Each tone fades in and out over 10ms, so its edges do not click.
  private fun render(segments: List<Segment>): ShortArray {
    val total = segments.sumOf { (it.ms * rate / 1000).toInt() }
    val out = ShortArray(total)
    var at = 0
    for (seg in segments) {
      val n = (seg.ms * rate / 1000).toInt()
      if (seg.hz > 0) {
        val fade = min(rate / 100, n / 2)
        for (i in 0 until n) {
          val edge = min(1.0, min(i, n - 1 - i).toDouble() / fade)
          out[at + i] = (amplitude * edge * sin(2 * PI * seg.hz * i / rate) * Short.MAX_VALUE).toInt().toShort()
        }
      }
      at += n
    }
    return out
  }
}
