# MobiumApp for Flutter

A Flutter app under test for [Mobium](https://github.com/mobiumdev/mobium).

React Native draws real native views, so the main MobiumApp is driven like any
native app. Flutter draws its own widgets and hands the platform a semantics
tree instead, and that tree is all a tool outside the app can see. This app is
the control for that case: one screen whose controls are labeled or not, carry
a Semantics identifier or not, and report their state or not, so a tool can be
shown seeing each of them or failing to.

Mobium's [`docs/checks/flutter.sh`](https://github.com/mobiumdev/mobium/blob/main/docs/checks/flutter.sh)
drives it with no Flutter driver and nothing added to the app, on Android
emulators and phones, iOS simulators and iPhones.

## The screen

| Control | What it is a control for |
| --- | --- |
| Settings icon button, with a tooltip | an icon button labeled by its tooltip |
| Heart icon button, with no tooltip | an icon button with no label at all |
| Username field | a field labeled by its decoration, with no identifier |
| Password field, Semantics identifier `password` | a password field; on iOS Flutter reports it as a plain text field until it holds something |
| Sign In button, Semantics identifier `signIn` | an identifier as a locator; on iOS it lands on a sibling of the button in the same frame |
| Tap me, and the Taps and Icon taps counters | taps the app counts, so a tap is judged by what the app says it got |
| Remember me checkbox, Notifications switch | controls with a checked state |
| Details row | a pushed screen, and back from it |
| Rows 1 to 40 | a list that needs a scroll to reach its last row |

Flutter passes a Semantics identifier on as the resource-id on Android and the
accessibility identifier on iOS.

## Building and installing

Needs the Flutter SDK. The app ids are `dev.mobium.mobium_flutter` on Android
and `dev.mobium.mobiumFlutter` on iOS.

```sh
cd flutter
flutter build apk --debug
adb install -r build/app/outputs/flutter-apk/app-debug.apk

flutter build ios --simulator
xcrun simctl install booted build/ios/iphonesimulator/Runner.app
```

On an iPhone, open `ios/Runner.xcworkspace` in Xcode, set a signing team, and
run it once from there.

Then, from a checkout of Mobium:

```sh
docs/checks/flutter.sh <android-serial | simulator-udid | iphone-udid>
```

## License

MIT, as the rest of MobiumApp.
