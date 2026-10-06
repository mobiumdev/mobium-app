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
//   MOBIUM-GRAYBOX hook id=7 ok <json>      a hook Mobium called answered
//   MOBIUM-GRAYBOX hook id=7 error <text>   or failed, saying why
//
// Hooks are the way in. The app registers them by name from JavaScript;
// Mobium calls one by writing {"i":id,"h":name,"a":[args]} into the
// mailbox, a field that exists only in a gray-box launch, and reads the
// answer from the log. The field brings up no keyboard, draws nothing, and
// gives keyboard focus back to whatever had it.
public class GrayBoxModule: Module {
  static weak var instance: GrayBoxModule?
  static let log = Logger(subsystem: "dev.mobium.graybox", category: "busy")
  static let enabled = UserDefaults.standard.bool(forKey: "MobiumGrayBox")
  static let lock = NSLock()
  static var count = 0
  static var watching = false
  static let beat = DispatchSource.makeTimerSource(queue: DispatchQueue(label: "dev.mobium.graybox.still"))

  public func definition() -> ModuleDefinition {
    Name("GrayBox")

    Events("onHook")

    OnCreate {
      GrayBoxModule.instance = self
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
    // answer writes a hook's outcome: ok with its result as JSON, or the
    // error's text. JavaScript calls it once per call it was handed.
    Function("answer") { (id: String, ok: Bool, payload: String) in
      guard GrayBoxModule.enabled else { return }
      let oneLine = payload.replacingOccurrences(of: "\n", with: " ")
      GrayBoxModule.write("hook id=\(id) \(ok ? "ok" : "error") \(oneLine)")
    }
  }

  // deliver hands a call read from the mailbox to JavaScript.
  static func deliver(id: String, hook: String, args: [Any]) {
    instance?.sendEvent("onHook", ["id": id, "hook": hook, "args": args])
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
  // and never delays a touch — it only says when a finger lifts, which is
  // when work a tap starts is announced — and the mailbox on top of it. The
  // module starts before React Native's window does: the first key window
  // was one that is never seen, so neither heard a touch nor took a call.
  // So both follow the key window as it changes, checked twice a second,
  // and the mailbox is kept above whatever React Native draws.
  static weak var attached: UIWindow?
  static let watcher: LiftWatcher = {
    let w = LiftWatcher(target: nil, action: nil)
    w.cancelsTouchesInView = false
    w.delaysTouchesBegan = false
    w.delaysTouchesEnded = false
    w.delegate = LiftWatcher.alongside
    return w
  }()
  static let mailbox = Mailbox()

  static func watchTouches() {
    let window = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
    guard let window else { return }
    if window !== attached {
      attached?.removeGestureRecognizer(watcher)
      mailbox.removeFromSuperview()
      window.addGestureRecognizer(watcher)
      window.addSubview(mailbox)
      attached = window
    } else if window.subviews.last !== mailbox {
      window.bringSubviewToFront(mailbox)
    }
    if !watching {
      watching = true
      Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in GrayBoxModule.watchTouches() }
    }
  }
}

// Mailbox is the field Mobium writes a hook call into: 2 by 2 points,
// transparent, no keyboard of its own. WebDriverAgent types into it a
// character at a time, so it reads the text after every change and acts
// once it holds a whole JSON object — a strict prefix of one never parses.
final class Mailbox: UITextField {
  private weak var prior: UIResponder?

  init() {
    super.init(frame: CGRect(x: 0, y: 140, width: 8, height: 8))
    accessibilityIdentifier = "mobium-mailbox"
    accessibilityLabel = "mobium-mailbox"
    inputView = UIView()
    textColor = .clear
    tintColor = .clear
    backgroundColor = .clear
    borderStyle = .none
    autocorrectionType = .no
    autocapitalizationType = .none
    spellCheckingType = .no
    smartQuotesType = .no
    smartDashesType = .no
    smartInsertDeleteType = .no
    addTarget(self, action: #selector(changed), for: .editingChanged)
  }
  required init?(coder: NSCoder) { fatalError() }

  @objc func changed() {
    guard let t = text, t.hasSuffix("}"),
          let data = t.data(using: .utf8),
          let call = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let hook = call["h"] as? String else { return }
    let id = (call["i"] as? NSNumber)?.stringValue ?? (call["i"] as? String) ?? "?"
    let args = call["a"] as? [Any] ?? []
    text = ""
    resignFirstResponder()
    if let prior { prior.becomeFirstResponder() }
    prior = nil
    GrayBoxModule.deliver(id: id, hook: hook, args: args)
  }

  // Whatever had focus when a call started arriving gets it back, so a hook
  // does not close the app's own keyboard.
  override func becomeFirstResponder() -> Bool {
    let current = Mailbox.firstResponder()
    if current !== self { prior = current }
    return super.becomeFirstResponder()
  }

  private static weak var found: UIResponder?
  static func firstResponder() -> UIResponder? {
    found = nil
    UIApplication.shared.sendAction(#selector(UIResponder.mobiumReportFirstResponder), to: nil, from: nil, for: nil)
    return found
  }
  fileprivate static func report(_ r: UIResponder) { found = r }
}

extension UIResponder {
  @objc func mobiumReportFirstResponder() { Mailbox.report(self) }
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
