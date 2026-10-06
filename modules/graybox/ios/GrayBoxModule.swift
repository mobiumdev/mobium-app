import ExpoModulesCore
import UIKit
import os

// GrayBox is Mobium's gray-box library: the app says when it starts and
// finishes work, and each change is a line in the device log, which Mobium
// reads as it arrives. The app declares its own busy state; nothing here
// detects it.
//
// It is silent unless the app was launched with `-MobiumGrayBox YES`, which
// `mobium launch --gray-box` passes. iOS keeps a launch argument for that
// launch only, so a person running this build never turns it on.
//
// The lines, under the os_log subsystem dev.mobium.graybox:
//
//   MOBIUM-GRAYBOX on                 the library is listening
//   MOBIUM-GRAYBOX busy=1 tag=fetch   work started; 1 thing in flight
//   MOBIUM-GRAYBOX busy=0 tag=fetch   that work finished, and is on screen
//   MOBIUM-GRAYBOX lift               a finger came up
//   MOBIUM-GRAYBOX still busy=1       every half second while work is in
//                                     flight, from a native timer: busy is a
//                                     lease, and an app that stops renewing
//                                     it (crashed, suspended) is not waited on
//   MOBIUM-GRAYBOX away / back        the app left the foreground / returned
public class GrayBoxModule: Module {
  static let log = Logger(subsystem: "dev.mobium.graybox", category: "busy")
  static let enabled = UserDefaults.standard.bool(forKey: "MobiumGrayBox")
  static let lock = NSLock()
  static var count = 0
  static var watching = false
  static let beat = DispatchSource.makeTimerSource(queue: DispatchQueue(label: "dev.mobium.graybox.still"))

  public func definition() -> ModuleDefinition {
    Name("GrayBox")

    OnCreate {
      guard GrayBoxModule.enabled else { return }
      GrayBoxModule.write("on")
      DispatchQueue.main.async { GrayBoxModule.watchTouches() }
      let center = NotificationCenter.default
      center.addObserver(forName: UIWindow.didBecomeKeyNotification, object: nil, queue: .main) { _ in
        GrayBoxModule.watchTouches()
      }
      center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { _ in
        GrayBoxModule.write("away")
      }
      center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { _ in
        GrayBoxModule.write("back")
      }
      GrayBoxModule.beat.schedule(deadline: .now() + 0.5, repeating: 0.5)
      GrayBoxModule.beat.setEventHandler {
        GrayBoxModule.lock.lock()
        let n = GrayBoxModule.count
        GrayBoxModule.lock.unlock()
        if n > 0 { GrayBoxModule.write("still busy=\(n)") }
      }
      GrayBoxModule.beat.resume()
    }

    Function("busy") { (tag: String) in GrayBoxModule.change(1, tag) }
    Function("idle") { (tag: String) in GrayBoxModule.change(-1, tag) }
  }

  static func change(_ by: Int, _ tag: String) {
    guard enabled else { return }
    lock.lock()
    count = max(0, count + by)
    let n = count
    lock.unlock()
    write("busy=\(n) tag=\(tag.split(whereSeparator: \.isWhitespace).joined(separator: "_"))")
  }

  static func write(_ what: String) {
    let t = Int64(Date().timeIntervalSince1970 * 1000)
    log.notice("MOBIUM-GRAYBOX \(what, privacy: .public) t=\(t, privacy: .public)")
  }

  // watchTouches puts a recognizer on the key window that never recognizes
  // and never delays a touch; it only says when a finger lifts, which is
  // when work a tap starts is announced.
  static func watchTouches() {
    guard !watching else { return }
    let window = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
    guard let window else { return }
    let watcher = LiftWatcher(target: nil, action: nil)
    watcher.cancelsTouchesInView = false
    watcher.delaysTouchesBegan = false
    watcher.delaysTouchesEnded = false
    watcher.delegate = LiftWatcher.alongside
    window.addGestureRecognizer(watcher)
    watching = true
  }
}

final class LiftWatcher: UIGestureRecognizer {
  static let alongside = Alongside()

  override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
    GrayBoxModule.write("lift")
    state = .failed
  }

  override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
    state = .failed
  }

  final class Alongside: NSObject, UIGestureRecognizerDelegate {
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith o: UIGestureRecognizer) -> Bool {
      true
    }
  }
}
