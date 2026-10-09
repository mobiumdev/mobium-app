# MobiumTV for Apple TV

The [`tv/`](../tv/README.md) app's screens on tvOS: an app under test for
[Mobium](https://github.com/mobiumdev/mobium) on an Apple TV simulator,
driven with the remote's D-pad, select, Menu and Play/Pause buttons. Same
app id, same screens, same ids and the same status lines, so one check,
Mobium's `docs/checks/tv-app.sh`, drives both and differs only where the
platforms do.

Every screen says in its own text what just happened, so a check judges by
what the app received rather than by what a tool reported.

## Screens

| Screen | Ids | What it is a control for |
| --- | --- | --- |
| Menu | `openGrid`, `openFocusSelect`, `openRow`, `openDialog`, `openKeys` | the remote's way in: focus starts on the first entry, select opens it, Menu comes back |
| Focus Grid | `grid`, `focusState`, `selectState` | twelve tiles in four columns. Reading focus, a D-pad press judged by where focus went, and selecting what has it |
| Focus or Select | `onFocusTile`, `onSelectTile`, `panel` | a tile that opens on focus alone, as a TV launcher's tabs do, beside one that opens only when selected |
| Row | `rowScroll`, `row`, `focusState`, `selectState` | thirty cards in a row wider than the screen, which scrolls only as focus moves along it |
| Dialog | `dialogButton`, `dialogOutcome` | an ordinary two-button alert over a TV screen, answered with the remote |
| Player Keys | `playerState`, `lastKey`, `keyCount` | a stand-in player that answers Play/Pause and names every remote button it receives |

## Where it differs from the Android app

Each difference is the platform's, not the app's:

- **No touch.** tvOS has no touch screen, so a selection says `by select`
  for the remote's center press or `by accessibility` for an activation that
  was no press, never `by touch`.
- **Back answers an alert with its cancel button.** The remote's Menu button
  on an alert runs the alert's cancel action, so Back reports `Dialog: Keep`
  where Android's back reports `Dialog: canceled`.
- **One media key.** The Siri Remote's only media button is Play/Pause, so
  Player Keys toggles between playing and paused. `Last key:` names the
  `UIPress` type, `playPause`, where Android names its keycode.

## Building and installing

Needs Xcode with the tvOS simulator platform (Xcode > Settings >
Components, or `xcodebuild -downloadPlatform tvOS`). Plain UIKit, no
dependencies. The project is generated from `project.yml` with
[XcodeGen](https://github.com/yonaskolb/XcodeGen) and committed, so
building needs only Xcode; run `xcodegen` after editing `project.yml`.

```sh
cd tvos
xcodebuild -project MobiumTV.xcodeproj -scheme MobiumTV \
  -destination 'generic/platform=tvOS Simulator' -configuration Release \
  -derivedDataPath build build
xcrun simctl install <apple-tv-udid> build/Build/Products/Release-appletvsimulator/MobiumTV.app
```

The app id is `dev.mobium.tv`, as on Android, and it runs on tvOS 17 and
later.

## License

MIT, as the rest of MobiumApp.
