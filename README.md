# MobiumApp

An application under test for [Mobium](https://github.com/mobiumdev/mobium).

A React Native app whose only job is to be driven. Every screen is a
**positive control** for something that can go wrong when a tool automates a
mobile app: a check that only ever sees the good case cannot tell you it would
notice the bad one, so each screen can produce both.

Mobium's end-to-end checks drive it — `docs/checks/mobium-app.sh`, `login.sh`,
`dialogs.sh`, `gestures.sh`, `autowait.sh` and others in the main repository.

## Why an app of its own

Real third-party apps are better evidence, and Mobium keeps using them: they
break rules a fixture never thought to break. This app does not replace them.
It exists for cases no shipped app can provide on demand — two live WebViews
in one app, a login with a known account, a dialog with three buttons, a
screen that never stops moving.

On iOS there is a second reason, and it is why the app had to be written
rather than downloaded: **a `WKWebView` is invisible to Remote Web Inspector
unless the app sets `isInspectable`** (iOS 16.4 and later), and that cannot be
forced from outside. An app that does not opt in is unreachable, so the app
under test opts in itself — `webviewDebuggingEnabled` on every `WebView`.

## Screens

| Screen | Main test IDs | What it is a control for |
| --- | --- | --- |
| WebViews | `webviewBtn`, `wideBtn`, `dualBtn`, `webstorageBtn`, `framesBtn` | Web pages inside the app. **Plain page** (`webview`): a WebView whose frame equals its content. **Wide viewport** (`wideWebview`): a page laid out at 1200 CSS px, so the visual and layout viewports differ. **Two WebViews** (`webviewTop`, `webviewBottom`): two inspectable pages alive at once. **Actionability** (`actionWebview`; `data-testid` `wSlide`, `wReplay`, `wDisabled`, `wArm`, `wEnabling`, `wAria`, `wFull`, `wHalf`, `wPass`, `wPlain`, `wBelow`; `actState()`): the Obstruction Demo's web counterpart — a target sliding in, disabled, disabled for a moment, `aria-disabled`, fully covered, center covered, under `pointer-events: none` (the negative control), under a plain div, and below the fold, each cover recording its own taps so `actState()` says what a tap really reached. **Web form** (`formWebview`; `data-testid` `fText`, `fEmail`, `fArea`, `fReadonly`, `fAriaReadonly`, `fDisabled`, `fPassword`, `fCheck`; `formState()`, `passwordIs()`): fields to type into — plain (mirrored live, so a tool can tell the page heard the change), email, multi-line — ones that must refuse text — read-only, `aria-readonly`, disabled — a password field reported only by length, and a checkbox, which is not a text field. **Web storage** (`storageWebview`, `storageBox`, `saveVisit`; `storageState()`): a page loaded with the base URL `https://mobiumapp.test/`, so it has an origin — and so cookies and web storage — while every other page here is inline with none; `.test` is reserved for testing and never resolves, so nothing leaves the device. It shows what it holds, read again every second, and Save a visit writes a cookie, a localStorage and a sessionStorage entry. **Frames** (`framesWebview`, `frameOutcome`, `frameTyped`): a same-origin frame, one nested inside it and a cross-origin one, each reporting which frame a tap reached; the cross-origin one also holds a text field (`crossField`), as a payment provider's card field sits in a frame of its own, whose contents `frameTyped` shows |
| Login Demo | `username`, `password`, `loginBtn`, `loginError`, `welcomeText`, `logoutBtn` | Mobile automation's hello world. Labeled fields validated on leaving and on submit, a one-second sign-in (a test must wait, not sleep), one message for a wrong password and an unknown user alike, and a screen reachable only by logging in. The password field is `secureTextEntry`, so a tool must never print its value |
| OTP Demo | `otpSend`, `otpShowCode`, `otpCodeShown`, `otpExpires`, `otpOutcome`, `otpBox0`–`otpBox5`, `otpEntered`, `otpVerifyBoxes`, `otpField`, `otpVerifyField` | A one-time code after the password. Six single-digit boxes that move focus on every digit and back on delete — typing the whole code into the first box, or losing a keystroke while focus moves, gets it wrong, and `otpEntered` shows exactly what they hold — beside one `oneTimeCode` field for comparison. The code is random and arrives as a local notification, read from the shade, or on screen with the switch where the shade cannot be read. It expires in 60 seconds (`otpExpires`), can be resent after 20 (the button is disabled until then), is single-use, and three wrong codes lock the form; `otpOutcome` says which, and stays near the top so it is on screen while the keyboard is up |
| Form Demo | `notifyCheck`, `termsCheck`, `planFree`/`planPro`/`planTeam`, `darkSwitch`, `formState`, `readOnlyField` | Controls with a **state** rather than only a label: checkboxes and radios as `Pressable` with `accessibilityRole` and `accessibilityState` — React Native has neither built in — a native `Switch`, and a read-only field. The Dark mode switch themes the whole app, so its effect can be checked in the hierarchy, in `formState` and in the screen's pixels |
| Pager Demo | `pager`, `card1`..`card8`, `pagerTapped` | A horizontal carousel. Nothing in a hierarchy says which way a container scrolls, so this is what a horizontal scroll is pointed at |
| Feed Demo | `feed`, `feedRow1`..`feedRow60`, `feedLoading`, `feedEnd`, `feedState`, `feedFast`, `feedSlow` | A list that grows as it is scrolled, as a timeline does: twenty rows a page, the next page loaded after a delay — 2.5 seconds, or 0.3 with Load in 0.3s — with a spinner (`feedLoading`) below the last row while it loads. The swipe that reaches the end of a page moves nothing, because the next rows are not there yet, so a tool that takes that for the end of the list stops early. The feed truly ends after three pages under `feedEnd`, the negative control, and `feedState` says how many rows the app holds and whether it is loading |
| Slider Demo | `volumeSlider`, `balanceSlider`, `sliderState` | Controls whose state is a position. **Volume** runs 0 to 100 in steps of 10, so a move that lands a step past its target shows as the wrong number; **Balance** is continuous from 0 to 1. Both are labeled, and neither belongs to the device, so moving them changes nothing a person owns, as a Settings slider would. `sliderState` says what the app holds and how many changes it received. Uses `@react-native-community/slider`: a native `SeekBar` on Android, which Mobium drives; on iOS a `UISlider` that reports itself to accessibility as a plain view, with no Adjustable trait and no value, so no tool outside the app can call it a slider |
| Busy Demo | `busyRefresh`, `busyQuiet`, `busyAlert`, `busyTwice`, `busyPoll`, `busyCrash`, `busyRowA`–`busyRowC`, `busySpinner`, `busyOutcome` | Work that finishes after the screen looks finished. Both buttons start the same 0.4 to 1.6 seconds of work, then bring a new generation of rows: **Refresh** shows a spinner in place of the rows meanwhile, **Refresh quietly** leaves the old rows up and tappable. A row says in `busyOutcome` whether the one tapped was `current` — the latest generation, with no work pending — or `stale`. The control for Mobium's gray box: the app tells its `graybox` module (`modules/graybox`) when work starts and when the new rows are rendered, and the module writes it to the device log when the app was launched with `-MobiumGrayBox YES` on iOS or with the intent extra `MobiumGrayBox=true` on Android. The edge controls are each a way a gray box could wait wrongly: **Refresh from an alert** starts the work from a button in the alert's own window, **Refresh twice** runs two at once, **Keep polling** never finishes, and **Crash during a refresh** dies holding the work |
| Audio Demo | `audioTone`, `audioSequence`, `audioLoop`, `audioSilent`, `audioAlarm`, `audioStop`, `audioState` | Known sounds, so a tool that says what an app played can be shown hearing it. Generated sine tones at a quarter of full volume: **440 Hz** for 2 s; **440 Hz, a second of silence, then 880 Hz**, for when sound starts and stops and which pitch it was; 440 Hz **until stopped** (a minute at most); and **660 Hz as an alarm**, a usage only Android keeps. **Silence** is the negative control: a player that is started and plays 2 s of zeros, which the platform reports exactly as it reports the tone. `audioState` says what was played and whether it finished or was stopped. Uses the app's own `tone` module (`AudioTrack` on Android, `AVAudioEngine` on iOS) |
| Hooks (any screen) | `hookToast` | Functions Mobium's gray box calls by name with `mobium hook`, registered at the app's root so they work on any screen: **raiseToast** shows its message in a toast the app draws (on Android a system toast too), **screen** answers the screen showing, **signIn** signs in as the name given without the Login Demo's form. Calls arrive only in a gray-box launch, through a field the library adds then (`mobium-mailbox`) |
| Interruption Demo | `keptDraft`, `lostDraft`, `askPermission`, `rebuildCount` | An interruption, and what the app has left afterwards. The button raises a real system permission dialog; of the two fields, the first keeps what was typed and the second is rebuilt empty, the way an app loses a half-written form. The second is the positive control, so "nothing was lost" can be told from a check that cannot see loss |
| Dialog Demo | `dialogOutcome`, `oneButtonBtn`, `twoButtonBtn`, `threeButtonBtn`, `lateAlertBtn`, `actionSheetBtn`, `promptBtn`, `shareBtn`, `locationBtn`, `notificationsBtn`, `cameraBtn`, `trackingBtn`, `pasteBtn`, `coveredBtn` | Every kind of dialog the app can raise, each writing what the app received to one line: alerts with one, two and three buttons, one that arrives late, an iOS action sheet, a prompt with a text field (iOS only), the share sheet, location, camera, notification and tracking permission, Allow Paste on iOS, a login-shaped form for Save Password, and a button the keyboard covers |
| Obstruction Demo | `obstructionOutcome`, `fullTarget`/`fullCover`, `halfTarget`/`halfCover`, `edgeTarget`/`edgeCover`, `passTarget`/`passCover`, `plainTarget`/`plainCover`, `hiddenTarget`, `scrimTarget`/`scrimCover`, `toastBtn`, `toastTarget`/`toastCover` | Targets the app has drawn something over, the kind a system dialog or the keyboard is not. Each cover is itself pressable, so `obstructionOutcome` names what a tap really touched: a cover over all of the target, over its center, over its edge only, a view with `pointerEvents="none"` (the negative control — the tap reaches the target), a plain view that swallows the tap, a pressable hidden from accessibility, a translucent scrim, and a toast that covers its button for 1.5 seconds |
| Accessibility Demo | `a11yState`, `a11yRefresh`, `a11ySample` | What the platform tells the app about its accessibility settings, on one line a check can read: Bold Text, Increase Contrast, Grayscale, Invert Colors, Reduce Motion, Reduce Transparency, VoiceOver, and the text scale, with a count of change events. Each value is updated live from the platform's change event and read afresh on Refresh, so a setting changed while the app runs can be told from one seen after a relaunch — the half of a setting written from outside that has to reach the app before it is worth anything |
| Layout Demo | `tinyTarget`, `narrowTarget`, `layoutWidth` | The positive control for mobium's layout inspection. `tinyTarget` is 24dp square, under Android's 48dp touch minimum at every screen size; `narrowTarget` is an eighth of the window's width, fine on a 411dp phone and too narrow below 384dp. A layout check must report the first everywhere and the second only when the screen shrinks — without them, a run that finds nothing cannot be told from one that sees nothing |
| Location Demo | `coords`, `fixCount` | The observer for a simulated location. iOS can set a position and not read one back, so the app reports what it sees. `fixCount` counts deliveries, not movement — compare `coords` to see a route |
| Motion Demo | `reduceMotion`, `honoringTarget`, `ignoringTarget`, `motionWebview`, `celebrateBtn`, `confettiState` | Targets that move. Two slide in over two seconds; one honors Reduce Motion and the other never does, as the negative control. **Confetti** is a burst over the screen that takes no touches, so a button beside it stays tappable — and a switch exposes the pieces as targets that never hold still |
| Crash Demo | `logLineBtn`, `loggedCount`, `crashJsBtn` | Device logs and crash reports. One button writes a numbered line to the device log; the other throws an unhandled JavaScript error, which a Release build treats as fatal. On a real iPhone, where nothing outside an app can crash it, this is the only way to produce a crash on demand |
| Storage Demo | `storedCount`, `storedFile`, `saveOneMoreBtn` | Clearing an app's data. A count kept in a file survives a relaunch and reads `stored: 0` once the data is cleared, so the app itself reports the outcome |
| Gestures | one screen per gesture | Every touch gesture's witness. **Tap and Press** (`pressTarget`, `lastGesture`), **Double Tap** (`doubleTapWebview`), **Drag** (`dragSource`, `dropZone`, `lastDrag`), **Flick and Pan** (`flickList`, `flickResult`), **Pinch and Spread** (`pinchWebview`), **Rotate** (`rotateWebview`), and **Multi-Touch** (`holdZone`, `tapZone`, `multiResult`, `multiEvents`), which records every raw touch event |
| Files Demo | `filesBtn` | A file crossing between a computer and the device, seen from the app. **Download the report** (`saveReportBtn`) saves `mobium-report.txt` where the device keeps downloads — the shared Download folder on Android, through a small native module (`modules/downloads`) since Expo writes only to the app's private folders; this app's Documents on iOS, which the Files app shows — and `savedFile` says where, how big and its first line. **Upload a file** (`pickFileBtn`) opens the system file picker, and `pickedFile` says the name, size and first line of what was picked. The observer `app_upload` and `app_download` are checked against |
| Biometrics Demo | `biometricsBtn`, `bioHardware`, `bioEnrolled`, `bioLevel`, `bioSignIn`, `bioPending`, `bioOutcome`, `bioAttempts` | A sign-in with a face or a finger, and what the platform answered — the observer `app_biometric` had none of. What the device offers (`bioHardware`: face, fingerprint) and whether one is enrolled (`bioEnrolled`, `bioLevel`) are read every second, since enrollment changes from outside while the app is on screen. **Sign in with biometrics** (`bioSignIn`) asks for biometrics only, with no passcode to fall back to, so a stranger comes back as a failure; `bioOutcome` says each attempt's answer — success, or the platform's reason (`not_enrolled`, `user_cancel`, `lockout`, `authentication_failed`) — numbered by `bioAttempts`, so a new answer can be told from the last, and `bioPending` says whether a prompt is up and waiting. Face ID's usage string is set, so the app can be signed with a free Apple ID and still ask |
| Battery Demo | `batteryBtn` | The battery as this device reports it through the platform's API: a battery drawn to the exact level (`batteryGauge`, whose label says the level and state), `batteryLevel` as a percentage, `batteryRaw` as the platform's 0–1 value, `batteryState` (unplugged, charging, full, unknown), `batteryLowPower`, and `batteryReads`, which counts the reads — every second — so a screen still reading can be told from one that stopped. The observer `app_battery` had none of: on an emulator `adb emu power capacity 42` moves it; a simulator has no battery: it shows No battery, and stops reading |

**The lost draft is a deliberate model, not an organic bug.** On Android the
same symptom comes from the activity being recreated, which the "don't keep
activities" developer option forces.

**Pages are shipped inline, not fetched**, so no check depends on a domain
staying up. Every page's "Learn more" is a real link to
`https://github.com/mobiumdev`, defined once as `LINK_URL`; a check asserts the
link's `href` by asking the page, which needs no network, and following it is
a separate, opt-in assertion.

**The Location screen is native, not a WebView**: `navigator.geolocation`
needs a secure context, and the inline pages are served at an `about:blank`
origin.

## A Flutter app beside it

[`flutter/`](flutter/README.md) is a second, smaller app under test, written in
Flutter: Flutter draws its own widgets and publishes a semantics tree, a
hierarchy shape React Native never produces. Mobium's `docs/checks/flutter.sh`
drives it. Its README has the screen and how to build it.

## The demo account

The Login Demo signs in with **`mobium`** / **`hunter2`**, and the screen shows
them. Capitals and surrounding spaces in the username are ignored. To see the
errors, leave a field empty, use a username shorter than three characters or
with a space in it, a password shorter than six, or a wrong password.

## Build

```sh
npm install

# iOS: a simulator, or an iPhone by its UDID
npx expo prebuild --platform ios
npx expo run:ios --configuration Release --device <udid>

# Android: an emulator or a phone
npx expo prebuild --platform android
npx expo run:android --variant release
```

Release rather than debug on purpose: it bundles the JavaScript, so the
installed app needs no Metro server and a check script can drive it cold.

The bundle identifier and package are both `dev.mobium.mobiumapp`.

## License

MIT — see [LICENSE](LICENSE).
