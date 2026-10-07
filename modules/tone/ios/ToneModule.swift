import AVFoundation
import ExpoModulesCore

struct Segment: Record {
  @Field var hz: Double = 0
  @Field var ms: Double = 0
}

// One try at a play. A try whose play failed is abandoned, so its player's
// completion, should it fire as the old engine goes, answers nothing: the
// retry answers the promise.
private final class Attempt {
  var abandoned = false
}

// Rejections carry their message in reason, which is what JavaScript's
// error message is made from; reject(code, description) leaves it as
// "undefined reason".
final class UsageException: GenericException<String>, @unchecked Sendable {
  override var reason: String { "usage is media or alarm, not \(param)" }
}

final class PlayException: GenericException<String>, @unchecked Sendable {
  override var reason: String { "could not play: \(param)" }
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
  private var engine = AVAudioEngine()
  private var player = AVAudioPlayerNode()
  private var generation = 0

  public func definition() -> ModuleDefinition {
    Name("Tone")

    OnCreate {
      self.wire()
    }

    AsyncFunction("playAsync") { (segments: [Segment], usage: String, promise: Promise) in
      guard usage == "media" || usage == "alarm" else {
        promise.reject(UsageException(usage))
        return
      }
      self.player.stop()
      self.generation += 1
      let buffer = self.render(segments)
      // An engine can believe it is running while its output never starts:
      // a simulator app idle for hours had its audio device rebuilt under
      // it, and play() waited ten seconds for an IO cycle and raised, which
      // killed the app. So a failed start or play gets one new engine, and
      // a second failure rejects, saying why.
      var failure = ""
      for n in 0..<2 {
        if n > 0 { self.rebuild() }
        do {
          try AVAudioSession.sharedInstance().setCategory(.playback)
          try AVAudioSession.sharedInstance().setActive(true)
          if !self.engine.isRunning { try self.engine.start() }
        } catch {
          failure = error.localizedDescription
          continue
        }
        let attempt = Attempt()
        let mine = self.generation
        // .dataPlayedBack fires once the last sample has been heard, not
        // merely consumed; a stop() fires it early, which generation tells.
        self.player.scheduleBuffer(buffer, at: nil, options: [], completionCallbackType: .dataPlayedBack) { _ in
          DispatchQueue.main.async {
            guard !attempt.abandoned else { return }
            let whole = mine == self.generation
            if whole { self.player.stop() }
            promise.resolve(whole)
          }
        }
        let player = self.player
        guard let reason = ToneCatch({ player.play() }) else { return }
        attempt.abandoned = true
        failure = reason
      }
      promise.reject(PlayException(failure))
    }
    .runOnQueue(.main)

    Function("stop") {
      DispatchQueue.main.async {
        self.generation += 1
        self.player.stop()
      }
    }
  }

  private func wire() {
    engine.attach(player)
    engine.connect(player, to: engine.mainMixerNode, format: format())
  }

  // A new engine and player, for an output the old ones could not start.
  private func rebuild() {
    engine.stop()
    engine = AVAudioEngine()
    player = AVAudioPlayerNode()
    wire()
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
