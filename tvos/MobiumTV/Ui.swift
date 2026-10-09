import UIKit

/// The pieces every screen is built from: a title, focusable tiles, status
/// lines. The same as the Android app's `Ui`, with tvOS's focus engine in
/// place of Android's.
enum Ui {
    static let muted = UIColor(white: 0.62, alpha: 1)

    /// A screen: a title, a line saying what it is a control for, then a
    /// vertical stack its content goes into.
    static func screen(_ vc: UIViewController, title: String, about: String) -> UIStackView {
        vc.view.backgroundColor = UIColor(red: 0.07, green: 0.08, blue: 0.10, alpha: 1)
        let t = UILabel()
        t.text = title
        t.font = .boldSystemFont(ofSize: 64)
        t.textColor = .white
        let s = UILabel()
        s.text = about
        s.font = .systemFont(ofSize: 34)
        s.textColor = muted
        s.numberOfLines = 0
        let root = UIStackView(arrangedSubviews: [t, s])
        root.axis = .vertical
        root.alignment = .leading
        root.spacing = 12
        root.setCustomSpacing(48, after: s)
        root.translatesAutoresizingMaskIntoConstraints = false
        vc.view.addSubview(root)
        let g = vc.view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            root.leadingAnchor.constraint(equalTo: g.leadingAnchor),
            root.trailingAnchor.constraint(equalTo: g.trailingAnchor),
            root.topAnchor.constraint(equalTo: g.topAnchor),
        ])
        return root
    }

    /// A line of state a check reads back, by its accessibility identifier.
    static func status(_ id: String, _ text: String) -> UILabel {
        let l = UILabel()
        l.accessibilityIdentifier = id
        l.text = text
        l.font = .systemFont(ofSize: 40)
        l.textColor = .white
        return l
    }
}

/// A focusable tile, outlined while it has focus, that says how it was
/// activated: "select" for the remote's center press, and "accessibility"
/// for an activation that arrived as no press, such as VoiceOver's or an
/// accessibility action. tvOS has no touch screen, so the Android app's
/// third answer, "touch", cannot arrive here.
final class Tile: UIView {
    let name: String
    /// Called when the tile is activated, with how.
    var onActivate: ((String) -> Void)?
    /// Called when the tile gains focus.
    var onFocus: (() -> Void)?
    private let label = UILabel()

    init(_ name: String, id: String? = nil, width: CGFloat, height: CGFloat? = nil) {
        self.name = name
        super.init(frame: .zero)
        label.text = name
        label.font = .systemFont(ofSize: 38)
        label.textColor = .white
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        addSubview(label)
        backgroundColor = UIColor(white: 0.18, alpha: 1)
        layer.cornerRadius = 12
        layer.borderColor = UIColor.white.cgColor
        translatesAutoresizingMaskIntoConstraints = false
        var cs = [
            widthAnchor.constraint(equalToConstant: width),
            label.centerXAnchor.constraint(equalTo: centerXAnchor),
            label.centerYAnchor.constraint(equalTo: centerYAnchor),
            label.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 20),
        ]
        cs.append(height.map { heightAnchor.constraint(equalToConstant: $0) }
            ?? label.topAnchor.constraint(equalTo: topAnchor, constant: 28))
        if height == nil { cs.append(label.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -28)) }
        NSLayoutConstraint.activate(cs)
        isAccessibilityElement = true
        accessibilityLabel = name
        accessibilityTraits = .button
        accessibilityIdentifier = id
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    override var canBecomeFocused: Bool { true }

    override func didUpdateFocus(in context: UIFocusUpdateContext, with coordinator: UIFocusAnimationCoordinator) {
        let has = context.nextFocusedView === self
        coordinator.addCoordinatedAnimations {
            self.layer.borderWidth = has ? 6 : 0
            self.backgroundColor = UIColor(white: has ? 0.32 : 0.18, alpha: 1)
            self.transform = has ? CGAffineTransform(scaleX: 1.06, y: 1.06) : .identity
        }
        if has { onFocus?() }
    }

    override func pressesEnded(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        if presses.contains(where: { $0.type == .select }) {
            onActivate?("select")
            return
        }
        super.pressesEnded(presses, with: event)
    }

    override func accessibilityActivate() -> Bool {
        onActivate?("accessibility")
        return true
    }
}
