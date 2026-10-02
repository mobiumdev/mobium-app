import SwiftUI

// The full app an App Clip belongs to. An App Clip cannot ship alone: it is
// embedded in this app, and installing this app replaces the clip.
@main
struct HostApp: App {
    var body: some Scene {
        WindowGroup {
            VStack(spacing: 16) {
                Text("Clip Demo").font(.largeTitle)
                Text("The full app. Its App Clip is dev.mobium.clipdemo.Clip.")
                    .accessibilityIdentifier("hostNote")
            }
            .padding()
        }
    }
}
