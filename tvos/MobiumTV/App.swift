import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let w = UIWindow(frame: UIScreen.main.bounds)
        let nav = UINavigationController(rootViewController: MenuViewController())
        nav.isNavigationBarHidden = true
        w.rootViewController = nav
        w.makeKeyAndVisible()
        window = w
        return true
    }
}
