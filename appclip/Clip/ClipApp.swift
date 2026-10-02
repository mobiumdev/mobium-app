import SwiftUI

// An App Clip with one of each thing Mobium has to find in it: a screen of
// its own, a control whose effect the screen reports, and a navigation stack
// to go back through — iOS's only back, the bar's button or a swipe.
@main
struct ClipApp: App {
    @State private var invocation = "none"

    var body: some Scene {
        WindowGroup {
            ClipHome(invocation: invocation)
                // The URL that opened the clip: an App Clip Code, a link, or
                // Xcode's _XCAppClipURL. Shown so a check can read it.
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    invocation = activity.webpageURL?.absoluteString ?? "a web activity with no URL"
                }
        }
    }
}

struct ClipHome: View {
    let invocation: String
    @State private var taps = 0

    var body: some View {
        NavigationStack {
            List {
                Text("This is an App Clip").accessibilityIdentifier("clipNote")
                Text("Invoked by: \(invocation)").accessibilityIdentifier("invocation")
                Button("Tap me") { taps += 1 }.accessibilityIdentifier("tapMe")
                Text("Taps: \(taps)").accessibilityIdentifier("taps")
                NavigationLink("Details") { ClipDetails() }.accessibilityIdentifier("detailsLink")
            }
            .navigationTitle("Clip Home")
        }
    }
}

struct ClipDetails: View {
    var body: some View {
        Text("The details screen").accessibilityIdentifier("detailsNote")
            .navigationTitle("Details")
    }
}
