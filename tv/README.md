# MobiumTV

An app under test for [Mobium](https://github.com/mobiumdev/mobium) on TVs:
Fire TV, Android TV and Google TV. Each screen is a positive control for
something a TV does differently from a phone, driven with a remote's D-pad,
select and media keys.

A TV is somebody's living room. Its home screen and its apps show the owner's
profiles, watch history and network, so a check written against them has to
filter what it prints and avoid what it plays. An app of our own has none of
that, and every screen says in its own text what just happened, so a check
judges by what the app received rather than by what a tool reported.

## Screens

| Screen | Ids | What it is a control for |
| --- | --- | --- |
| Menu | `openGrid`, `openFocusSelect`, `openRow`, `openDialog`, `openKeys` | the launcher: a `LEANBACK_LAUNCHER` activity, the only kind a TV's home screen lists |
| Focus Grid | `grid`, `focusState`, `selectState` | twelve tiles in four columns. Reading focus, a D-pad press judged by where focus went, and selecting what has it |
| Focus or Select | `onFocusTile`, `onSelectTile`, `panel` | a tile that opens on focus alone, as a TV launcher's tabs do, beside one that opens only when selected. A touch gives the first focus rather than a click, so "tapped" has to be read back |
| Row | `rowScroll`, `row`, `focusState`, `selectState` | thirty cards in a row wider than the screen, which scrolls only as focus moves along it |
| Dialog | `dialogButton`, `dialogOutcome` | an ordinary two-button dialog over a TV screen, answered with the remote or canceled with back |
| Player Keys | `playerState`, `lastKey`, `keyCount` | a stand-in player that answers play, pause, stop, fast-forward and rewind and names every key it receives. A media key moves nothing a tool can see unless an app answers it |

Every selection says how it arrived: `by select` for the remote's center or
Enter key, `by touch` for a finger, and `by accessibility` for a click that
was neither, such as an accessibility action. A TV app sees these
differently.

## Building and installing

Needs a JDK 17 or later and the Android SDK (compile SDK 36). It is plain
Android, with no libraries beyond the platform. The app id is `dev.mobium.tv`;
it runs on Android 7.1 and later, which covers Fire OS 6 (Android 7.1),
Fire OS 7 (Android 9) and Fire OS 8 (Android 11).

```sh
cd tv
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

On a Fire TV, turn on ADB debugging under Settings > My Fire TV > Developer
Options, then `adb connect <tv-address>:5555` before installing. Google's
Android TV emulator image (`system-images;android-34;android-tv;arm64-v8a`)
runs it with no TV at all.

## License

MIT, as the rest of MobiumApp.
