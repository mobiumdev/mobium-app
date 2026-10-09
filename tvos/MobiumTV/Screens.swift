import UIKit

/// The menu: one tile per screen, each a control for something a TV does
/// differently. The remote's Menu button (Back) returns here.
final class MenuViewController: UIViewController {
    private var first: Tile?

    override func viewDidLoad() {
        super.viewDidLoad()
        let root = Ui.screen(self, title: "MobiumTV",
                             about: "An app under test for Mobium on TVs: every screen is driven with a remote.")
        let menu = UIStackView()
        menu.axis = .vertical
        menu.spacing = 20
        menu.accessibilityIdentifier = "menu"
        root.addArrangedSubview(menu)
        let entries: [(String, String, () -> UIViewController)] = [
            ("openGrid", "Focus Grid", { FocusGridViewController() }),
            ("openFocusSelect", "Focus or Select", { FocusSelectViewController() }),
            ("openRow", "Row", { RowViewController() }),
            ("openDialog", "Dialog", { DialogViewController() }),
            ("openKeys", "Player Keys", { KeysViewController() }),
        ]
        for (id, label, make) in entries {
            let t = Tile(label, id: id, width: 640)
            t.onActivate = { [weak self] _ in self?.navigationController?.pushViewController(make(), animated: true) }
            menu.addArrangedSubview(t)
            if first == nil { first = t }
        }
    }

    override var preferredFocusEnvironments: [UIFocusEnvironment] { first.map { [$0] } ?? [] }
}

/// Twelve tiles in a grid. The remote moves focus between them and the
/// screen says which one has it, so a tool can be shown reading focus — and
/// a D-pad press judged by where focus went — and selecting what has it.
final class FocusGridViewController: UIViewController {
    private var first: Tile?

    override func viewDidLoad() {
        super.viewDidLoad()
        let root = Ui.screen(self, title: "Focus Grid",
                             about: "Twelve tiles; the lines below say which has focus and which was selected, and how.")
        let focus = Ui.status("focusState", "Focused: none")
        let selected = Ui.status("selectState", "Selected: none")
        let grid = UIStackView()
        grid.axis = .vertical
        grid.spacing = 24
        grid.accessibilityIdentifier = "grid"
        for r in 0..<3 {
            let line = UIStackView()
            line.spacing = 24
            for c in 1...4 {
                let name = "Tile \(r * 4 + c)"
                let t = Tile(name, width: 320)
                t.onFocus = { focus.text = "Focused: \(name)" }
                t.onActivate = { how in selected.text = "Selected: \(name), by \(how)" }
                line.addArrangedSubview(t)
                if first == nil { first = t }
            }
            grid.addArrangedSubview(line)
        }
        root.addArrangedSubview(grid)
        root.setCustomSpacing(40, after: grid)
        root.addArrangedSubview(focus)
        root.addArrangedSubview(selected)
    }

    override var preferredFocusEnvironments: [UIFocusEnvironment] { first.map { [$0] } ?? [] }
}

/// Two tiles that open the same panel differently. The first opens on focus
/// alone, as a TV launcher's tabs do; the second only when selected. On a TV
/// a tool's "pressed" or "tapped" has to be read back as which of these the
/// app received.
final class FocusSelectViewController: UIViewController {
    private var start: Tile?

    override func viewDidLoad() {
        super.viewDidLoad()
        let root = Ui.screen(self, title: "Focus or Select",
                             about: "One tile opens on focus, one on select; the panel says which opened and how.")
        let panel = Ui.status("panel", "Panel: closed")
        let s = Tile("Start here", width: 400)
        let onFocus = Tile("Opens on focus", id: "onFocusTile", width: 400)
        let onSelect = Tile("Opens on select", id: "onSelectTile", width: 400)
        onFocus.onFocus = { panel.text = "Panel: opened by focus on Opens on focus" }
        onSelect.onActivate = { how in panel.text = "Panel: opened by \(how) on Opens on select" }
        let tiles = UIStackView(arrangedSubviews: [s, onFocus, onSelect])
        tiles.spacing = 32
        root.addArrangedSubview(tiles)
        root.setCustomSpacing(40, after: tiles)
        root.addArrangedSubview(panel)
        start = s
    }

    override var preferredFocusEnvironments: [UIFocusEnvironment] { start.map { [$0] } ?? [] }
}

/// A row of thirty cards wider than the screen, as a TV's content rows are.
/// It scrolls only as focus moves along it, so reaching a card off the
/// screen means pressing right until it has focus.
final class RowViewController: UIViewController {
    private var first: Tile?

    override func viewDidLoad() {
        super.viewDidLoad()
        let root = Ui.screen(self, title: "Row",
                             about: "Thirty cards in a row that scrolls with focus; the lines say which has focus and which was selected.")
        let focus = Ui.status("focusState", "Focused: none")
        let selected = Ui.status("selectState", "Selected: none")
        let scroll = UIScrollView()
        scroll.accessibilityIdentifier = "rowScroll"
        scroll.showsHorizontalScrollIndicator = false
        scroll.clipsToBounds = false
        scroll.translatesAutoresizingMaskIntoConstraints = false
        let row = UIStackView()
        row.spacing = 32
        row.accessibilityIdentifier = "row"
        row.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(row)
        for i in 1...30 {
            let name = "Card \(i)"
            let t = Tile(name, width: 360, height: 220)
            t.onFocus = { focus.text = "Focused: \(name)" }
            t.onActivate = { how in selected.text = "Selected: \(name), by \(how)" }
            row.addArrangedSubview(t)
            if first == nil { first = t }
        }
        root.addArrangedSubview(scroll)
        NSLayoutConstraint.activate([
            scroll.widthAnchor.constraint(equalTo: root.widthAnchor),
            scroll.heightAnchor.constraint(equalToConstant: 260),
            row.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
            row.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
            row.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 20),
            row.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -20),
            row.heightAnchor.constraint(equalTo: scroll.frameLayoutGuide.heightAnchor, constant: -40),
        ])
        root.setCustomSpacing(40, after: scroll)
        root.addArrangedSubview(focus)
        root.addArrangedSubview(selected)
    }

    override var preferredFocusEnvironments: [UIFocusEnvironment] { first.map { [$0] } ?? [] }
}

/// An ordinary two-button alert over a TV screen, answered with the remote.
/// On tvOS the remote's Menu button answers an alert with its cancel action,
/// so here Back answers "Keep" — the Android app reports "canceled" instead.
final class DialogViewController: UIViewController {
    private var open: Tile?

    override func viewDidLoad() {
        super.viewDidLoad()
        let root = Ui.screen(self, title: "Dialog",
                             about: "Open a two-button dialog; the line says how it was answered.")
        let outcome = Ui.status("dialogOutcome", "Dialog: not opened")
        let o = Tile("Open dialog", id: "dialogButton", width: 480)
        o.onActivate = { [weak self] _ in
            let a = UIAlertController(title: "Discard the draft?",
                                      message: "The draft is lost if you discard it.",
                                      preferredStyle: .alert)
            a.addAction(UIAlertAction(title: "Discard", style: .destructive) { _ in outcome.text = "Dialog: Discard" })
            a.addAction(UIAlertAction(title: "Keep", style: .cancel) { _ in outcome.text = "Dialog: Keep" })
            self?.present(a, animated: true)
        }
        root.addArrangedSubview(o)
        root.setCustomSpacing(40, after: o)
        root.addArrangedSubview(outcome)
        open = o
    }

    override var preferredFocusEnvironments: [UIFocusEnvironment] { open.map { [$0] } ?? [] }
}

/// A stand-in player that reports every remote button it receives. A media
/// key sent to a TV moves nothing a tool can see unless an app answers it,
/// so this screen is what makes "pressed play" checkable. The Siri Remote's
/// only media button is Play/Pause; Menu is counted and still goes back.
final class KeysViewController: UIViewController {
    private let player = Ui.status("playerState", "Player: paused")
    private let lastKey = Ui.status("lastKey", "Last key: none")
    private let count = Ui.status("keyCount", "Keys: 0")
    private var keys = 0
    private var playing = false

    override func viewDidLoad() {
        super.viewDidLoad()
        let root = Ui.screen(self, title: "Player Keys",
                             about: "Press the remote's buttons; the lines say what the player did and which button arrived.")
        root.addArrangedSubview(player)
        root.addArrangedSubview(lastKey)
        root.addArrangedSubview(count)
    }

    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        for p in presses {
            keys += 1
            lastKey.text = "Last key: \(Self.name(p.type))"
            count.text = "Keys: \(keys)"
            if p.type == .playPause {
                playing.toggle()
                player.text = playing ? "Player: playing" : "Player: paused"
            }
        }
        super.pressesBegan(presses, with: event)
    }

    static func name(_ t: UIPress.PressType) -> String {
        switch t {
        case .upArrow: return "upArrow"
        case .downArrow: return "downArrow"
        case .leftArrow: return "leftArrow"
        case .rightArrow: return "rightArrow"
        case .select: return "select"
        case .menu: return "menu"
        case .playPause: return "playPause"
        case .pageUp: return "pageUp"
        case .pageDown: return "pageDown"
        case .tvRemoteOneTwoThree: return "tvRemoteOneTwoThree"
        case .tvRemoteFourColors: return "tvRemoteFourColors"
        @unknown default: return "press \(t.rawValue)"
        }
    }
}
