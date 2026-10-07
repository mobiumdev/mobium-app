import AVFoundation
import ExpoModulesCore

struct Segment: Record {
  @Field var hz: Double = 0
  @Field var ms: Double = 0
}

// Plays known sounds for the Audio Demo: sine tones at exact frequencies and
// stretches of silence, generated rather than shipped as files, so what was
// played is exactly what the screen says. iOS has no usage for a player to
// report, so usage is accepted and only "media" means anything here; the
// screen says the alarm is Android's.
//
// Silence is scheduled as samples, not skipped: a player playing zeros is
// started and heard as nothing, which is the control the screen needs.
public class ToneModule: Module {
  private let rate = 48000.0
  // A quarter of full scale: loud enough to measure, and this plays on
  // somebody's phone.
  private let amplitude: Float = 0.25
  private let engine = AVAudioEngine()
  private let player = AVAudioPlayerNode()
  private var generation = 0

  public func definition() -> ModuleDefinition {
    Name("Tone")

    OnCreate {
      self.engine.attach(self.player)
      self.engine.connect(self.player, to: self.engine.mainMixerNode, format: self.format())
    }

    AsyncFunction("playAsync") { (segments: [Segment], usage: String, promise: Promise) in
      guard usage == "media" || usage == "alarm" else {
        promise.reject("ERR_USAGE", "usage is media or alarm, not \(usage)")
        return
      }
      do {
        try AVAudioSession.sharedInstance().setCategory(.playback)
        try AVAudioSession.sharedInstance().setActive(true)
        if !self.engine.isRunning { try self.engine.start() }
      } catch {
        promise.reject("ERR_AUDIO", "could not start audio: \(error.localizedDescription)")
        return
      }
      self.player.stop()
      self.generation += 1
      let mine = self.generation
      let buffer = self.render(segments)
      // .dataPlayedBack fires once the last sample has been heard, not
      // merely consumed; a stop() fires it early, which generation tells.
      self.player.scheduleBuffer(buffer, at: nil, options: [], completionCallbackType: .dataPlayedBack) { _ in
        DispatchQueue.main.async {
          let whole = mine == self.generation
          if whole { self.player.stop() }
          promise.resolve(whole)
        }
      }
      self.player.play()
    }
    .runOnQueue(.main)

    Function("stop") {
      DispatchQueue.main.async {
        self.generation += 1
        self.player.stop()
      }
    }
  }

  private func format() -> AVAudioFormat {
    return AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1)!
  }

  // Each tone fades in and out over 10ms, so its edges do not click.
  private func render(_ segments: [Segment]) -> AVAudioPCMBuffer {
    let total = segments.reduce(0) { $0 + Int($1.ms * rate / 1000) }
    let buffer = AVAudioPCMBuffer(pcmFormat: format(), frameCapacity: AVAudioFrameCount(max(total, 1)))!
    buffer.frameLength = AVAudioFrameCount(total)
    let out = buffer.floatChannelData![0]
    var at = 0
    for seg in segments {
      let n = Int(seg.ms * rate / 1000)
      let fade = min(Int(rate / 100), n / 2)
      for i in 0..<n {
        if seg.hz > 0 {
          let edge = Float(min(1.0, Double(min(i, n - 1 - i)) / Double(max(fade, 1))))
          out[at + i] = amplitude * edge * Float(sin(2 * Double.pi * seg.hz * Double(i) / rate))
        } else {
          out[at + i] = 0
        }
      }
      at += n
    }
    return buffer
  }
}
