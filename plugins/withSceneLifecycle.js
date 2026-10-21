// Adopts the scene-based life cycle on iOS, which iOS 27 requires.
//
// An app built with the iOS 27 SDK that keeps the app-delegate-only life cycle
// is stopped at launch on iOS 27: MobiumApp built by Xcode 27.1 trapped in
// UIKit's `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` on the
// iPhone 15 Plus (iOS 27.0.1), every launch. Expo SDK 57 ships the scene
// delegate, `ExpoAppSceneDelegate`, but its template still creates the window
// in the app delegate, so a fresh prebuild crashes the same way. This makes
// the app delegate an `ExpoReactNativeFactoryProvider` — the window and the
// factory it already declares are what the protocol asks for — leaves the
// window and React Native's start to the scene delegate on iOS, and names it
// in the scene manifest. tvOS keeps the app delegate's window.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const START_IN_APP_DELEGATE = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)`;

module.exports = function withSceneLifecycle(config) {
  config = withAppDelegate(config, (config) => {
    let src = config.modResults.contents;
    if (!src.includes('ExpoReactNativeFactoryProvider')) {
      src = src.replace('class AppDelegate: ExpoAppDelegate {',
        'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
    }
    if (src.includes(START_IN_APP_DELEGATE)) {
      src = src.replace(START_IN_APP_DELEGATE,
        `// On iOS the scene delegate creates the window and starts React Native.\n#if os(tvOS)\n    window = UIWindow(frame: UIScreen.main.bounds)`);
    }
    if (!src.includes('ExpoReactNativeFactoryProvider') || src.includes(START_IN_APP_DELEGATE)) {
      throw new Error('withSceneLifecycle: AppDelegate.swift is not the template it was written for');
    }
    config.modResults.contents = src;
    return config;
  });
  return withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [{
          UISceneConfigurationName: 'Default Configuration',
          UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
        }],
      },
    };
    return config;
  });
};
