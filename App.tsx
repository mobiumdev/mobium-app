import React, {useEffect, useRef, useState} from 'react';
import {
  Image, PixelRatio, Platform, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text,
  TextInput, View, Pressable, useWindowDimensions,
} from 'react-native';
import {AccessibilityInfo, ActionSheetIOS, ActivityIndicator, BackHandler, FlatList, Alert, Animated, Easing, KeyboardAvoidingView, PanResponder, Share, Switch} from 'react-native';
import {WebView} from 'react-native-webview';
import Slider from '@react-native-community/slider';
import * as Battery from 'expo-battery';
import Downloads from './modules/downloads/src/DownloadsModule';
import GrayBox from './modules/graybox/src/GrayBoxModule';
import * as Location from 'expo-location';
import {File, Paths} from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import {requestTrackingPermissionsAsync} from 'expo-tracking-transparency';
import {Camera} from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import * as LocalAuthentication from 'expo-local-authentication';
import {ground, ui} from './theme';

// Pages are shipped inline rather than fetched: a check that depends on a
// domain is a check that fails when somebody lets the domain lapse.
const page = (title: string, body: string, viewport = 'width=device-width, initial-scale=1') => `
<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="${viewport}">
<style>body{font:16px -apple-system,system-ui,sans-serif;margin:0;padding:16px}
h1{font-size:20px;margin:0 0 12px}a{color:#0a58ca}</style></head>
<body><h1>${title}</h1>${body}</body></html>`;

// Every "Learn more" is the same element, defined once, so there is one place
// where the destination can be wrong. A real link rather than a fragment: one
// that goes nowhere exercises the tap and proves nothing about where it leads.
//
// It points at the project's GitHub account, a page that exists: a link
// nobody can follow cannot be verified by following it, and this one is
// meant to be.
//
// The id is what the check asserts against — `document.querySelector` reaches
// it through app_eval, which asks the page directly instead of inferring the
// answer from what is on screen.
const LINK_URL = 'https://github.com/mobiumdev';
const LEARN_MORE = `<p><a id="link" href="${LINK_URL}">Learn more</a></p>`;

// ROTATE is the only thing on either platform that can say whether a rotation
// happened. Nothing in the accessibility hierarchy reports one, and unlike a
// zoom there is no WebView property to ask — `visualViewport.scale` has no
// rotational counterpart — so the page computes the angle between two touches
// itself and accumulates the change.
//
// `user-scalable=no` and `touch-action: none` are load-bearing rather than
// tidy: without them the browser claims the two-finger gesture as a pinch-zoom
// and the touch events never arrive, which would look exactly like a rotation
// that was never sent.
const ROTATE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<style>
  html,body{margin:0;height:100%;touch-action:none;
    font:16px -apple-system,system-ui,sans-serif}
  #pad{height:100%;display:flex;align-items:center;justify-content:center;
    background:#eef;flex-direction:column}
  #deg{font-size:40px;font-weight:600}
</style></head>
<body><div id="pad"><div id="deg">0.0</div><div>degrees turned</div></div>
<script>
  var base = null, total = 0;
  function angleOf(t) {
    return Math.atan2(t[1].clientY - t[0].clientY, t[1].clientX - t[0].clientX) * 180 / Math.PI;
  }
  addEventListener('touchmove', function (e) {
    if (e.touches.length < 2) return;
    var a = angleOf(e.touches);
    if (base === null) { base = a; return; }
    // Accumulate the change rather than compare against the start, so a turn
    // past the +/-180 seam does not read as a jump the other way.
    var d = a - base;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    total += d;
    base = a;
    document.getElementById('deg').textContent = total.toFixed(1);
  }, {passive: false});
  addEventListener('touchend', function () { base = null; });
  window.rotation = function () { return total; };
</script></body></html>`;

// DOUBLE_TAP is a double tap the platform agreed was one.
//
// A page rather than a native screen, for the same reason ROTATE is one:
// React Native has no onDoublePress, so a native screen could only record two
// presses and apply a threshold of its own — which would be this project
// testing mobium against a constant this project chose. A browser applies the
// platform's own double-tap determination, so \`dblclick\` firing is the
// platform agreeing, not us agreeing with ourselves.
//
// That holds on Android. An iOS WKWebView fires no \`dblclick\` for touches
// XCUITest injects, including WebDriverAgent's own double tap — yet the same
// double tap does trigger WebKit's double-tap zoom on a zoomable page (Safari,
// iPhone 15 Plus, 2026-09-23: visualViewport.scale 0.44 -> 1.30). The zoom is
// WebKit's gesture and \`dblclick\` is a page event, and only the gesture
// arrives; the gestures check asserts accordingly.
//
// \`touch-action: manipulation\` turns off double-tap-to-zoom here, which
// would otherwise eat the second tap before the page saw it.
//
// This page had a drag half too, measured from raw touch events. It could
// not witness a real drag on Android, where the WebView takes any press held
// past 500ms as its own long press, and nothing ever drove it once the native
// DragTarget on the Gestures screen replaced it — so it was removed rather
// than left looking like a check.
const DOUBLE_TAP = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<style>
  html,body{margin:0;height:100%;font:16px -apple-system,system-ui,sans-serif}
  button{display:block;width:100%;border:0;font:inherit;padding:0}
  #tap{height:40%;background:#efe;touch-action:manipulation}
  b{font-size:20px}
</style></head>
<body>
<button id="tap"><b id="taps">taps 0 / doubles 0</b></button>
<script>
  var clicks = 0, doubles = 0;
  var tap = document.getElementById('tap');
  tap.addEventListener('click', function () { clicks++; show(); });
  tap.addEventListener('dblclick', function () { doubles++; show(); });
  function show() {
    document.getElementById('taps').textContent =
      'taps ' + clicks + ' / doubles ' + doubles;
  }
  // Not window.taps: an element id becomes a property of window, and
  // <b id="taps"> had already claimed that name, so the accessor read back as
  // the element rather than the function. Measured on the emulator, and the
  // reason anything a check calls into is named for what it returns rather
  // than for the thing it describes.
  window.tapCounts = function () { return {clicks: clicks, doubles: doubles}; };
</script></body></html>`;

// MOTION_PAGE is the WebView half of the Motion screen: the same slide-in,
// done in CSS, and skipped under `prefers-reduced-motion: reduce` — which is
// how a web page honors the setting, and the only way it can. `motionState`
// reports what the page believes and when its target was tapped, so a check
// asks the page instead of inferring from the screen.
const MOTION_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{margin:0;padding:8px;font:15px -apple-system,system-ui,sans-serif}
  #webTarget{display:block;width:60%;height:48px;border:0;border-radius:8px;
    background:#2f7d4f;color:#fff;font:inherit;
    animation:slide 2s ease-out}
  @keyframes slide{from{margin-left:40%}to{margin-left:0}}
  @media (prefers-reduced-motion: reduce){#webTarget{animation:none}}
</style></head><body>
<p style="margin:0 0 6px;color:#555;font-size:13px">A web page's version: the same slide, in CSS, which the
page skips under prefers-reduced-motion — the only way a page can honor the setting.</p>
<button id="webTarget">Web target</button>
<div id="webOut">web: not tapped</div>
<script>
  var t0 = performance.now(), tapped = -1;
  document.getElementById('webTarget').addEventListener('click', function () {
    tapped = Math.round(performance.now() - t0);
    document.getElementById('webOut').textContent = 'web: tapped ' + tapped + 'ms after load';
  });
  window.motionState = function () {
    return {reduce: matchMedia('(prefers-reduced-motion: reduce)').matches, tappedAfter: tapped};
  };
</script></body></html>`;

// PINCH is a page that can be zoomed and says how far it is, for pinch and
// spread. The scale is WebKit's and Chromium's own visualViewport.scale — the
// browser's measurement, not this page's arithmetic — shown so a screenshot
// says it too, and returned by window.pinchScale() for a check.
const PINCH = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font:16px -apple-system,system-ui,sans-serif;margin:0;padding:16px;min-height:100vh;
box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;align-items:center}
#target{width:220px;height:220px;border:3px solid #3552FD;border-radius:12px;display:flex;
align-items:center;justify-content:center;background-color:#fff;
background-image:linear-gradient(#e3e6f5 1px,transparent 1px),linear-gradient(90deg,#e3e6f5 1px,transparent 1px);
background-size:20px 20px}
#scale{font-size:34px;font-weight:700;background:#fff;padding:2px 8px;border-radius:6px}
p{text-align:center;max-width:300px}</style></head>
<body><div id="target"><div id="scale">scale 1.00</div></div>
<p>Pinch in and spread out anywhere on this page. The number in the box is
the browser's own zoom level, read from visualViewport. It sits in the
middle, where a pinch about the screen's center lands, so a picture taken
after a zoom shows it magnified.</p>
<script>
  function show() {
    document.getElementById('scale').textContent = 'scale ' + visualViewport.scale.toFixed(2);
  }
  visualViewport.addEventListener('resize', show);
  window.pinchScale = function () { return visualViewport.scale; };
</script></body></html>`;

// ACTIONABLE is the Obstruction Demo's web counterpart: each case is a way a
// page makes a tap land somewhere other than its target, or nowhere. Every
// cover records a tap on itself, so actState() — and the line at the top —
// says what a tap really reached. The pointer-events:none layer is the
// negative control: covered to the eye and not to a finger. Unlike a native
// tree, a page can hit-test a point (document.elementFromPoint), so here the
// plain div that swallows a tap is detectable.
const ACTIONABLE = page('Actionability', `
<style>
  .case{position:relative;margin:0 0 14px}
  .case button{display:block;width:100%;height:48px;font:inherit}
  .cov{position:absolute;top:0;bottom:0;background:#5832FA;color:#fff;font-size:13px;display:flex;align-items:center;justify-content:center}
  .full{left:0;right:0}.half{left:0;width:60%}
  .ghost{pointer-events:none;opacity:.6}
  .slide{animation:slide 2s ease-out}
  @keyframes slide{from{margin-left:40%}to{margin-left:0}}
  #out{position:sticky;top:0;background:#fff;padding:6px 0;font-size:14px}
</style>
<div id="out">0: nothing yet</div>
<div class="case"><button data-testid="wReplay">Replay the slide</button></div>
<div class="case"><button data-testid="wSlide" class="slide">Sliding in</button></div>
<div class="case"><button data-testid="wDisabled" disabled>Always disabled</button></div>
<div class="case"><button data-testid="wArm">Arm: disable the next one for 2 s</button></div>
<div class="case"><button data-testid="wEnabling">Enabled after Arm + 2 s</button></div>
<div class="case"><button data-testid="wAria" aria-disabled="true">aria-disabled</button></div>
<div class="case"><button data-testid="wFull">Fully covered</button><div class="cov full" data-cover="full">full cover</div></div>
<div class="case"><button data-testid="wHalf">Center covered</button><div class="cov half" data-cover="half">half cover</div></div>
<div class="case"><button data-testid="wPass">Pass-through</button><div class="cov full ghost">pointer-events: none</div></div>
<div class="case"><button data-testid="wPlain">Under a plain div</button><div class="cov full" style="background:rgba(20,24,38,.5)">plain div</div></div>
<div style="height:1400px"></div>
<div class="case"><button data-testid="wBelow">Below the fold</button></div>
<script>
  var n = 0, last = 'nothing yet', t0 = performance.now();
  function hit(what){ n++; last = what; document.getElementById('out').textContent = n + ': ' + what; }
  document.querySelectorAll('button[data-testid]').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-testid');
      if (id === 'wReplay') { var s = document.querySelector('[data-testid=wSlide]');
        s.classList.remove('slide'); void s.offsetWidth; s.classList.add('slide'); t0 = performance.now(); hit('replayed'); return; }
      if (id === 'wArm') { var e = document.querySelector('[data-testid=wEnabling]');
        e.disabled = true; setTimeout(function () { e.disabled = false; }, 2000); hit('armed'); return; }
      if (id === 'wSlide') { hit('target wSlide ' + Math.round(performance.now() - t0) + 'ms after replay'); return; }
      hit('target ' + id);
    });
  });
  document.querySelectorAll('[data-cover]').forEach(function (c) {
    c.addEventListener('click', function () { hit('cover ' + c.getAttribute('data-cover')); });
  });
  window.actState = function () { return {taps: n, last: last}; };
</script>`);

// WEBFORM is the control for typing into a page. Each field is a case a
// tool can get wrong: a plain text input whose input listener mirrors it (so
// "the value changed" can be told from "the page heard it change"), an email
// input and a textarea, fields that must refuse text — read-only,
// aria-readonly, disabled — a password field, which the page reports only by
// length, and a checkbox, which is not a text field at all.
const WEBFORM = page('Web form', `
<style>
  label{display:block;font-size:13px;color:#555;margin:10px 0 4px}
  input,textarea{display:block;width:100%;box-sizing:border-box;font:inherit;padding:8px}
  #mirror{font-size:13px;color:#2f7d4f;margin-top:4px}
</style>
<label>Text</label><input data-testid="fText" placeholder="text input">
<div id="mirror">mirror: </div>
<label>Email</label><input data-testid="fEmail" type="email" placeholder="email input">
<label>Notes</label><textarea data-testid="fArea" placeholder="notes"></textarea>
<label>Read-only</label><input data-testid="fReadonly" value="fixed" readonly>
<label>aria-readonly</label><input data-testid="fAriaReadonly" aria-readonly="true" placeholder="aria-readonly">
<label>Disabled</label><input data-testid="fDisabled" placeholder="disabled" disabled>
<label>Password</label><input data-testid="fPassword" type="password" placeholder="password">
<label><input data-testid="fCheck" type="checkbox"> A checkbox</label>
<script>
  var inputs = 0, changes = 0;
  var text = document.querySelector('[data-testid=fText]');
  text.addEventListener('input', function () { document.getElementById('mirror').textContent = 'mirror: ' + text.value; });
  document.querySelectorAll('input,textarea').forEach(function (f) {
    f.addEventListener('input', function () { inputs++; });
    f.addEventListener('change', function () { changes++; });
  });
  var v = function (id) { return document.querySelector('[data-testid=' + id + ']').value; };
  window.formState = function () {
    return {text: v('fText'), email: v('fEmail'), area: v('fArea'), readonly: v('fReadonly'),
      ariaReadonly: v('fAriaReadonly'), disabled: v('fDisabled'), passwordLength: v('fPassword').length,
      checked: document.querySelector('[data-testid=fCheck]').checked,
      mirror: document.getElementById('mirror').textContent, inputs: inputs, changes: changes};
  };
  window.passwordIs = function (s) { return v('fPassword') === s; };
</script>`);

const PLAIN = page('Plain page', `<p id="para">The quick brown fox.</p>${LEARN_MORE}`);
const WIDE = page('Wide page', `<p id="para">Laid out at 1200 CSS pixels.</p>${LEARN_MORE}`, 'width=1200');
const SECOND = page('Second page', `<p id="para">A different page in a second WebView.</p>${LEARN_MORE}`);

// WEB_STORAGE is the page app_cookies and app_storage are checked against. An
// inline page has no origin — about:blank, or "null" — and a page with no
// origin holds no cookies and no web storage, so every other page here makes
// both tools refuse. This one is still inline, never fetched, but loaded with
// a base URL, which gives it an origin of its own. The domain is under .test,
// reserved for testing (RFC 2606): it cannot resolve, so it can never reach a
// server, and nothing leaves the device.
//
// The page reports what it holds itself — every cookie and storage key it can
// see, read again every second — so a check can tell a restore that reached
// the page from one that only reported success. "Save a visit" writes one of
// each, the way a page's own script would.
const WEB_STORAGE_BASE = 'https://mobiumapp.test/';
const WEB_STORAGE = page('Web storage', `
<p id="origin"></p>
<p>What this page holds, read again every second:</p>
<pre id="storageBox" style="white-space:pre-wrap;background:#f2f2f7;padding:10px;border-radius:8px;font-size:13px"></pre>
<button id="saveVisit">Save a visit</button>
<script>
  document.getElementById('origin').textContent = 'origin: ' + location.origin;
  function keys(st) {
    var out = [];
    try { for (var i = 0; i < st.length; i++) { var k = st.key(i); out.push(k + '=' + st.getItem(k)); } }
    catch (e) { return ['(unavailable: ' + e.name + ')']; }
    return out.sort();
  }
  function cookies() { return document.cookie ? document.cookie.split('; ').sort() : []; }
  window.storageState = function () {
    return {origin: location.origin, cookies: cookies(), local: keys(localStorage), session: keys(sessionStorage)};
  };
  function show() {
    var st = window.storageState();
    document.getElementById('storageBox').textContent =
      'cookies: ' + (st.cookies.join(', ') || 'none') + '\\n' +
      'localStorage: ' + (st.local.join(', ') || 'none') + '\\n' +
      'sessionStorage: ' + (st.session.join(', ') || 'none');
  }
  document.getElementById('saveVisit').onclick = function () {
    var n = Number(localStorage.getItem('visits') || 0) + 1;
    localStorage.setItem('visits', String(n));
    sessionStorage.setItem('lastVisit', 'visit ' + n);
    document.cookie = 'visited=yes; path=/; max-age=86400';
    show();
  };
  show();
  setInterval(show, 1000);
</script>`);

// FRAMES is one page holding frames of each kind a tool meets: a same-origin
// frame (srcdoc), a frame nested inside it, and a cross-origin frame (a data:
// URL is an opaque origin, so the page cannot see into it — no network or
// domain needed for the control). Every button, the page's own included,
// reports to the top page through postMessage, which crosses origins, so
// `frameOutcome` says which frame a tap really reached. The frames are built
// by the page's script rather than written into the markup, so no script tag
// has to be escaped inside another.
const FRAMES = page('Frames', `
<p>This page holds three frames. Tap the button in each: the line at the
bottom says which one the tap reached.</p>
<button id="pageBtn">A button on the page itself</button>
<div id="frames"></div>
<p id="frameOutcome">last tap: none</p>
<p id="frameTyped">typed: nothing</p>
<style>iframe{display:block;width:100%;height:130px;border:1px solid #bbb;border-radius:8px;margin:8px 0}</style>
<script>
  function say(where) { document.getElementById('frameOutcome').textContent = 'last tap: ' + where; }
  window.addEventListener('message', function (e) {
    if (e.data && e.data.frameTap) say(e.data.frameTap);
    if (e.data && typeof e.data.frameTyped === 'string')
      document.getElementById('frameTyped').textContent = 'typed: ' + e.data.frameTyped;
  });
  document.getElementById('pageBtn').onclick = function () { say('the page'); };
  // A frame's document: a line, a button, and — given a field id — a text
  // field whose contents are sent to the page as they change, the way a
  // payment provider's card field sits in a frame of its own.
  function frameDoc(id, text, who, field) {
    var input = field ? ' <input id="' + field + '" placeholder="Card number" style="width:9em">' : '';
    var typed = field ? 'document.getElementById("' + field + '").oninput = function (e) {' +
      ' top.postMessage({frameTyped: e.target.value}, "*"); };' : '';
    return '<!doctype html><html><body style="font:15px -apple-system,system-ui,sans-serif;margin:8px">' +
      '<p style="margin:0 0 6px">' + text + '</p><button id="' + id + '">Tap me</button>' + input +
      '<scr' + 'ipt>document.getElementById("' + id + '").onclick = function () {' +
      ' top.postMessage({frameTap: "' + who + '"}, "*"); };' + typed + '</scr' + 'ipt></body></html>';
  }
  var same = document.createElement('iframe');
  same.id = 'sameFrame';
  same.srcdoc = frameDoc('sameBtn', 'A same-origin frame: the page can see into it.', 'the same-origin frame');
  same.onload = function () {
    var d = same.contentDocument, nested = d.createElement('iframe');
    nested.id = 'nestedFrame';
    nested.style.cssText = 'width:100%;height:70px;border:1px dashed #999';
    nested.srcdoc = frameDoc('nestedBtn', 'A frame inside that frame.', 'the nested frame');
    d.body.appendChild(nested);
    same.style.height = '220px';
  };
  document.getElementById('frames').appendChild(same);
  var cross = document.createElement('iframe');
  cross.id = 'crossFrame';
  cross.src = 'data:text/html,' + encodeURIComponent(
    frameDoc('crossBtn', 'A cross-origin frame (a data: URL): the page cannot see into it.', 'the cross-origin frame', 'crossField'));
  document.getElementById('frames').appendChild(cross);
</script>`);

type Screen = 'home' | 'webviewhub' | 'frames' | 'webview' | 'wide' | 'dual' | 'login' | 'otp' | 'secret' | 'location' | 'pager' | 'popup' | 'form' | 'gesturehub' | 'tappress' | 'drag' | 'flick' | 'pinch' | 'multitouch' | 'rotate' | 'doubletap' | 'motion' | 'crash' | 'storage' | 'dialogs' | 'obstruction' | 'a11y' | 'actionable' | 'webform' | 'layout' | 'webstorage' | 'battery' | 'files' | 'biometrics' | 'feed' | 'slider' | 'busy';

const SCREENS: [Screen, string][] = [
  ['webviewhub', 'WebViews'],
  ['login', 'Login Demo'],
  ['otp', 'OTP Demo'],
  ['location', 'Location Demo'],
  ['pager', 'Pager Demo'],
  ['popup', 'Interruption Demo'],
  ['form', 'Form Demo'],
  ['gesturehub', 'Gestures'],
  ['motion', 'Motion Demo'],
  ['crash', 'Crash Demo'],
  ['storage', 'Storage Demo'],
  ['dialogs', 'Dialog Demo'],
  ['obstruction', 'Obstruction Demo'],
  ['a11y', 'Accessibility Demo'],
  ['layout', 'Layout Demo'],
  ['battery', 'Battery Demo'],
  ['files', 'Files Demo'],
  ['biometrics', 'Biometrics Demo'],
  ['feed', 'Feed Demo'],
  ['slider', 'Slider Demo'],
  ['busy', 'Busy Demo'],
];

// The gesture witnesses, in the order of the touch-gesture charts mobium's
// docs/GESTURES.md is organized by — tap, double tap, drag, flick, pinch and
// spread, press, rotate, and the gestures of more than one finger. One home
// entry opens them, so the home screen stays a list of problems rather than a
// list of gestures.
const GESTURE_SCREENS: [Screen, string][] = [
  ['tappress', 'Tap and Press'],
  ['doubletap', 'Double Tap'],
  ['drag', 'Drag'],
  ['flick', 'Flick and Pan'],
  ['pinch', 'Pinch and Spread'],
  ['rotate', 'Rotate'],
  ['multitouch', 'Multi-Touch'],
];
const IN_GESTURES = new Set<Screen>(GESTURE_SCREENS.map(([k]) => k));

// The WebView cases, each isolating one thing that goes wrong when a tool
// reaches into a web page shown inside an app. One home entry opens them,
// as with the gestures; the web pages that belong to another topic — the
// Motion screen's, the gesture witnesses' — stay with that topic. Each id is
// the one the screen had on the home list, so a locator for it still works.
const WEBVIEW_SCREENS: [Screen, string, string][] = [
  ['webview', 'Plain page',
    'One page in one WebView — the simplest case, and the control for the others. Switch into its ' +
    'context (app_contexts lists it), read the paragraph, and tap the Learn more link.'],
  ['wide', 'Wide viewport',
    'This page is laid out 1200 CSS pixels wide and shrunk to fit the screen, so a CSS pixel is about ' +
    'a quarter of a screen pixel. A tool that converts page positions with the wrong viewport taps the ' +
    'wrong place — correct only on ordinary pages, where the two agree.'],
  ['dual', 'Two WebViews',
    'Two pages alive at once, one above the other. A tool has to list them as two contexts and act on ' +
    'the one you chose, not whichever it found first.'],
  ['actionable', 'Actionability',
    'Targets a page makes hard to tap: one sliding in, disabled ones, covered ones, one under a layer that ' +
    'takes no touches, one under a plain div, and one below the fold. The line at the top says what a ' +
    'tap really reached.'],
  ['webform', 'Web form',
    'Fields in a page to type into: plain, email and multi-line ones, ones that must refuse text — ' +
    'read-only, aria-readonly and disabled — a password field, and a checkbox, which is not a text ' +
    'field at all. The page says what each one holds.'],
  ['webstorage', 'Web storage',
    'A page with an origin of its own, so it can hold cookies and web storage — every other page here is ' +
    'inline HTML with no origin, which holds neither. Save a visit writes a cookie and a localStorage entry; ' +
    'the box shows everything the page holds, read again every second, so a tool that saves, clears or ' +
    'restores it can be checked against what the page itself sees.'],
  ['frames', 'Frames',
    'One page holding frames: one from its own origin, one nested inside that, and one from another ' +
    'origin. Tap each button and the line at the bottom says which frame the tap reached. Whether a ' +
    'tool can see into each frame, and tap inside it, is what this measures.'],
];
const IN_WEBVIEWS = new Set<Screen>(WEBVIEW_SCREENS.map(([k]) => k));
const webviewLead = (k: Screen) => WEBVIEW_SCREENS.find(([key]) => key === k)?.[2] ?? '';

function Btn({id, label, onPress, disabled = false}: {id: string; label: string; onPress: () => void; disabled?: boolean}) {
  return (
    <Pressable testID={id} accessibilityLabel={label} accessibilityRole="button"
      accessibilityState={{disabled}} disabled={disabled}
      style={[s.btn, disabled ? s.btnBusy : null]} onPress={onPress}>
      <Text style={s.btnText}>{label}</Text>
    </Pressable>
  );
}

function Web({id, html, origins, baseUrl}: {id: string; html: string; origins?: string[]; baseUrl?: string}) {
  return (
    <WebView
      testID={id}
      source={baseUrl ? {html, baseUrl} : {html}}
      originWhitelist={origins}
      // The whole point of this app: without this the WKWebView is invisible
      // to Remote Web Inspector on iOS 16.4+, and to CDP on Android.
      webviewDebuggingEnabled={true}
      style={s.web}
    />
  );
}

// LocationScreen is the observer the geolocation tools had no way to be
// checked against. iOS can set a position and cannot read one back, so until
// something on the device reported what it sees, `app_location` on iOS
// confirmed only that simctl accepted the request.
//
// Deliberately native rather than a WebView calling navigator.geolocation:
// that needs a secure context, and this app's pages are shipped inline at an
// about:blank origin, so it would fail for reasons that have nothing to do
// with the position.
function LocationScreen() {
  const [coords, setCoords] = useState('unknown');
  const [fixes, setFixes] = useState(0);
  const [err, setErr] = useState('');

  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    let live = true;
    (async () => {
      const {status} = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErr('permission denied: ' + status);
        return;
      }
      // watchPositionAsync rather than a single read, because a route is only
      // observable as a sequence. The fix counter is what separates "moving"
      // from "stuck on the first value" without comparing coordinates.
      sub = await Location.watchPositionAsync(
        {accuracy: Location.Accuracy.Highest, timeInterval: 500, distanceInterval: 0},
        p => {
          if (!live) return;
          setCoords(
            p.coords.latitude.toFixed(6) + ',' + p.coords.longitude.toFixed(6));
          setFixes(n => n + 1);
        },
      );
    })().catch(e => setErr(String(e)));
    return () => {
      live = false;
      sub?.remove();
    };
  }, []);

  return (
    <View style={s.pad}>
      <Text style={s.h1}>Location</Text>
      <Text testID="coords" accessibilityLabel={'coords ' + coords} style={s.mono}>
        {coords}
      </Text>
      <Text testID="fixCount" accessibilityLabel={'fixes ' + fixes} style={s.mono}>
        fixes {fixes}
      </Text>
      {err ? <Text testID="locationError" style={s.err}>{err}</Text> : null}
    </View>
  );
}

// PagerScreen is a horizontal carousel, which the hierarchy cannot be told
// apart from a vertical list: Android clips child bounds to the parent, so
// every scrollable reports zero overflow in both axes (mobium CHALLENGES 21). That is
// why app_scroll_to takes the direction from the caller rather than inferring
// it, and why this screen exists — there was nothing to point a horizontal
// scroll at.
//
// Eight cards, each most of a screen wide, so the last is several swipes away
// and cannot be reached by luck.
function PagerScreen() {
  const cards = [1, 2, 3, 4, 5, 6, 7, 8];
  // Pressable rather than View: `map` returns actionable elements, so a plain
  // View is in the hierarchy and not in the map. A carousel of tappable cards
  // is also the realistic shape, and it lets a scroll be followed by a tap on
  // the thing the scroll found.
  const [tapped, setTapped] = useState(0);
  return (
    <View>
      <Text style={s.h1}>Pager</Text>
      <ScrollView
        horizontal
        testID="pager"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.pagerRow}>
        {cards.map(n => (
          <Pressable
            key={n}
            testID={'card' + n}
            accessibilityLabel={'Card ' + n}
            accessibilityRole="button"
            style={s.card}
            onPress={() => setTapped(n)}>
            <Text style={s.cardText}>Card {n}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text testID="pagerNote" style={s.note}>
        Card 8 starts off screen to the right.
      </Text>
      <Text testID="pagerTapped" style={s.note}>
        tapped: {tapped === 0 ? 'none' : 'Card ' + tapped}
      </Text>
    </View>
  );
}

// FeedScreen is a list that grows as it is scrolled, as a timeline does: twenty
// rows a page, the next page loaded a moment after the end is reached, with a
// spinner below the last row while it loads. A swipe at the end of a page
// moves nothing — the rows that will follow are not there yet — and a tool
// that takes "the swipe moved nothing" for "the list has ended" stops there.
// Mobium's scroll loop did exactly that check and nothing else, and Ice
// Cubes' timeline never showed it, because its pages arrived before the next
// swipe; iOS cannot slow a network from outside, so the delay is the app's.
//
// The feed truly ends after three pages, under "End of feed": the negative
// control, a real end that must still read as one. feedState says what the
// app holds, so a check can tell "not loaded yet" from "not there".
const FEED_PAGE = 20;
const FEED_PAGES = 3;

function FeedScreen() {
  const [rows, setRows] = useState(FEED_PAGE);
  const [loading, setLoading] = useState(false);
  const [delay, setDelay] = useState(2500);
  const [tapped, setTapped] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const done = rows >= FEED_PAGE * FEED_PAGES;
  const more = () => {
    if (loading || done) return;
    setLoading(true);
    timer.current = setTimeout(() => {
      setRows(n => Math.min(n + FEED_PAGE, FEED_PAGE * FEED_PAGES));
      setLoading(false);
    }, delay);
  };
  const data = Array.from({length: rows}, (_, i) => i + 1);
  return (
    <View style={s.fill}>
      <Text style={s.h1}>Feed</Text>
      <View style={s.row}>
        <Btn id="feedFast" label="Load in 0.3s" onPress={() => setDelay(300)} />
        <Btn id="feedSlow" label="Load in 2.5s" onPress={() => setDelay(2500)} />
      </View>
      <Text testID="feedState" style={s.outcome}>
        rows: {rows}, {loading ? 'loading' : done ? 'end' : 'idle'}, delay: {delay}ms
        {tapped ? ', tapped: Row ' + tapped : ''}
      </Text>
      <FlatList
        testID="feed"
        style={s.fill}
        data={data}
        keyExtractor={n => String(n)}
        onEndReached={more}
        onEndReachedThreshold={0.05}
        renderItem={({item}) => (
          <Pressable testID={'feedRow' + item} accessibilityLabel={'Row ' + item} accessibilityRole="button"
            style={s.feedRow} onPress={() => setTapped(item)}>
            <Text style={s.cardText}>Row {item}</Text>
          </Pressable>
        )}
        ListFooterComponent={
          loading ? (
            <View style={s.row}>
              <ActivityIndicator testID="feedLoading" accessibilityLabel="Loading more" />
              <Text style={s.note}> Loading more…</Text>
            </View>
          ) : done ? (
            <Text testID="feedEnd" style={s.note}>End of feed</Text>
          ) : null
        }
      />
    </View>
  );
}

// SliderScreen is a control whose state is a position rather than a word. A
// slider is set by moving its thumb, and what the app makes of the position
// is the app's own: a tool can only know where it landed by reading back.
// Volume runs 0 to 100 in steps of ten, so a move that lands a step past its
// target shows as the wrong number; Balance is continuous. Neither belongs to
// the device, so moving them changes nothing a person owns — which a
// Settings slider, brightness or text size, would. Each is labeled, so a
// tool has a name to find it by, and sliderState says what the app holds and
// how many changes it received.
// BusyScreen is the Busy Demo, the control for Mobium's gray box: work that
// finishes after the screen looks finished. Both buttons start the same
// work, 0.4 to 1.6 seconds, and bring a new generation of rows. Refresh
// shows it — the rows give way to a spinner — and Refresh quietly does not:
// the old rows stay, tappable, until the new ones replace them.
//
// A row says whether the one tapped was current: its generation is the
// latest and no work was pending. A tool that waits only for what it can see
// taps a stale row after a quiet refresh; that is the failure this isolates,
// and Refresh is its control, where waiting for the rows is enough.
//
// The app tells GrayBox when work starts, and that it has finished only once
// the new rows are rendered, so idle means "done and on screen".
function BusyScreen() {
  const [gen, setGen] = useState(1);
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState('nothing tapped yet');
  const latest = useRef(1);
  const pending = useRef(0);
  const finished = useRef<string[]>([]);
  useEffect(() => {
    while (finished.current.length) {
      pending.current -= 1;
      GrayBox.idle(finished.current.shift()!);
    }
  }, [gen]);
  const refresh = (visible: boolean) => {
    const tag = visible ? 'refresh' : 'quiet';
    pending.current += 1;
    GrayBox.busy(tag);
    if (visible) setLoading(true);
    setTimeout(() => {
      latest.current += 1;
      finished.current.push(tag);
      setLoading(false);
      setGen(latest.current);
    }, 400 + Math.random() * 1200);
  };
  const tap = (row: string, rendered: number) => {
    const current = rendered === latest.current && pending.current === 0;
    setOutcome(`row ${row}, generation ${rendered}: ${current ? 'current' : 'stale'}`);
  };
  return (
    <View>
      <Text style={s.h1}>Busy</Text>
      <Text testID="busyOutcome" style={s.outcome}>{outcome}</Text>
      <Text style={s.note}>Both refresh the rows after 0.4 to 1.6 s. Refresh shows a spinner meanwhile; Refresh quietly leaves the old rows up.</Text>
      <Btn id="busyRefresh" label="Refresh" onPress={() => refresh(true)} />
      <Btn id="busyQuiet" label="Refresh quietly" onPress={() => refresh(false)} />
      {loading ? (
        <ActivityIndicator testID="busySpinner" accessibilityLabel="Loading" />
      ) : (
        ['A', 'B', 'C'].map(r => (
          <Pressable key={r} testID={'busyRow' + r} accessibilityRole="button" style={s.row} onPress={() => tap(r, gen)}>
            <Text>Row {r} · generation {gen}</Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

function SliderScreen() {
  const [volume, setVolume] = useState(50);
  const [balance, setBalance] = useState(0.5);
  const [changes, setChanges] = useState(0);
  return (
    <View>
      <Text style={s.h1}>Sliders</Text>
      <Text testID="sliderState" style={s.outcome}>
        volume: {volume}, balance: {balance.toFixed(2)}, changes: {changes}
      </Text>
      <Text style={s.note}>Volume, 0 to 100 in steps of 10</Text>
      <Slider testID="volumeSlider" accessibilityLabel="Volume" minimumValue={0} maximumValue={100} step={10}
        value={volume} onValueChange={v => { setVolume(Math.round(v)); setChanges(n => n + 1); }} />
      <Text style={s.note}>Balance, 0 to 1, continuous</Text>
      <Slider testID="balanceSlider" accessibilityLabel="Balance" minimumValue={0} maximumValue={1}
        value={balance} onValueChange={v => { setBalance(v); setChanges(n => n + 1); }} />
    </View>
  );
}

// GestureScreen distinguishes gestures that look alike from outside.
//
// A long press is a tap that is held, so a long press delivered *as* a tap is
// indistinguishable to anything watching the screen — the element highlights
// either way and the app does something either way. The only way to tell is to
// ask the app which one it received, which is why this records the last
// gesture rather than merely reacting to it.
//
// That matters because `long_press` has shipped in mobium since the beginning
// and nothing had ever proven it does anything. A check that tapped and
// asserted "something happened" would have passed on a tool that never sent a
// long press at all.
function GestureScreen() {
  const [last, setLast] = useState('nothing yet');
  const [count, setCount] = useState(0);
  const [gap, setGap] = useState(-1);
  const [taps, setTaps] = useState(-1);
  const prev = useRef(0);
  const record = (what: string) => {
    setLast(what);
    setCount(n => n + 1);
  };
  // The interval between two presses, which is the whole content of a double
  // tap: AOSP reads 40-300ms apart as one gesture and anything else as two.
  //
  // Reported instead of the platform's own verdict because on iOS there is no
  // way to ask for one from here. A WKWebView does not synthesize `dblclick`
  // from XCUITest-injected touches — measured, including through
  // WebDriverAgent's own doubleTap endpoint, which is the platform primitive
  // — so the page that witnesses the Android double tap cannot witness the
  // iOS one. What both platforms can report is when the taps arrived, and
  // that is the thing mobium actually controls.
  const press = (e: any) => {
    const now = Date.now();
    setGap(prev.current ? now - prev.current : -1);
    prev.current = now;
    // iOS forwards UITouch.tapCount on some paths; Android has no
    // counterpart. Shown when it is there rather than relied on.
    setTaps(typeof e?.nativeEvent?.tapCount === 'number' ? e.nativeEvent.tapCount : -1);
    record('tap');
  };
  return (
    <View>
      <Text style={s.h1}>Tap and Press</Text>
      <Pressable
        testID="pressTarget"
        accessibilityLabel="Press target"
        accessibilityRole="button"
        // RN's default is 500ms and mobium holds for 800ms by default, so the
        // two agree without either being tuned to the other.
        delayLongPress={500}
        onPress={press}
        onLongPress={() => record('long press')}
        style={s.target}>
        <Text style={s.targetText}>Press and hold me</Text>
      </Pressable>
      <Text testID="lastGesture" style={s.note}>last: {last}</Text>
      <Text testID="gestureCount" style={s.note}>gestures: {count}</Text>
      <Text testID="tapGap" style={s.note}>gap: {gap}ms tapCount: {taps}</Text>
    </View>
  );
}

// DragTarget is a **native** witness for a drag, and it exists because the
// obvious witness turned out not to be one.
//
// The first attempt measured a drag inside a WebView, from raw touch events,
// the way the rotate page measures a rotation. It worked for holds up to
// 480ms and reported nothing at all from 520ms upward — a hard edge at
// Android's 500ms long-press timeout, measured on a Pixel 7 AVD. Past that
// the WebView claims the press as a long press of its own and the page stops
// receiving touchmove entirely.
//
// Which makes a WebView unable to witness the one thing worth witnessing: a
// drag holds *past* that timeout on purpose, because that timeout is what a
// drag-to-reorder list arms on. A control that can only see the gesture when
// it is set up wrongly is not a control.
//
// So this records the same four numbers natively: how long the finger rested
// before it moved, how many moves arrived, how far it traveled, and whether
// it came up over the drop zone. A swipe gets all four wrong.
function DragTarget() {
  const [info, setInfo] = useState('no drag yet');
  const drop = useRef({top: 0, bottom: 0});
  const dropView = useRef<View>(null);
  const st = useRef({t0: 0, first: 0, last: 0, moves: 0, realMoves: 0, px: 0, py: 0});

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Native event timestamps, not the JS clock: on a slow Android 17 AVD
      // the JS thread handled the last move late enough to shrink a 700ms
      // closing hold to ~160ms, while a Pixel 8 Pro on the same Android read 725.
      onPanResponderGrant: e => {
        st.current = {t0: e.nativeEvent.timestamp, first: 0, last: 0, moves: 0, realMoves: 0, px: 0, py: 0};
      },
      onPanResponderMove: (e, g) => {
        const now = e.nativeEvent.timestamp;
        st.current.moves += 1;
        // A move event is not movement. iOS delivers touch-move for a finger
        // that is holding still — measured: a 700ms opening hold produced 91
        // move events against a swipe's 47, while the first of them arrived
        // 28ms in. Timing from the first *event* would therefore report no
        // opening hold on iOS and a correct one on Android, for the same
        // gesture. So the clock starts at the first event that has actually
        // displaced the finger.
        // And a move event with no movement *since the last one* is not the
        // finger moving either: at the far end the finger rests 134pt from
        // where it started, so judging the closing hold by distance from the
        // start counted every event Android 17 sends for a resting finger as
        // travel — the 700ms hold read as ~170ms on an Android 17 AVD.
        const since = Math.hypot(g.dx - st.current.px, g.dy - st.current.py);
        if (Math.hypot(g.dx, g.dy) > 2 && since > 1) {
          if (!st.current.first) st.current.first = now;
          st.current.last = now;
          st.current.realMoves += 1;
          st.current.px = g.dx;
          st.current.py = g.dy;
        }
      },
      onPanResponderRelease: (e, g) => {
        const now = e.nativeEvent.timestamp;
        const c = st.current;
        const y = e.nativeEvent.pageY;
        const inZone = y >= drop.current.top && y <= drop.current.bottom;
        setInfo(
          'holdBefore ' + (c.first ? Math.round(c.first - c.t0) : -1) +
          ' moves ' + c.realMoves +
          ' travel ' + Math.round(Math.hypot(g.dx, g.dy)) +
          ' holdAfter ' + (c.last ? Math.round(now - c.last) : -1) +
          ' dropped ' + (inZone ? 'yes' : 'no'));
      },
    }),
  ).current;

  return (
    <View>
      <View
        testID="dragSource"
        accessible={true}
        accessibilityLabel="Drag source"
        accessibilityRole="button"
        style={s.dragSrc}
        {...pan.panHandlers}>
        <Text style={s.targetText}>Drag me</Text>
      </View>
      <View
        ref={dropView}
        testID="dropZone"
        accessible={true}
        accessibilityLabel="Drop zone"
        accessibilityRole="button"
        style={s.dragDst}
        onLayout={() => {
          // Measured in window coordinates rather than taken from the layout
          // event, because the release reports pageY and the two are only
          // the same when nothing above has scrolled.
          dropView.current?.measureInWindow((_x, y, _w, h) => {
            drop.current = {top: y, bottom: y + h};
          });
        }}>
        <Text style={s.targetText}>Drop here</Text>
      </View>
      <Text testID="lastDrag" style={s.note}>drag: {info}</Text>
    </View>
  );
}

// MotionScreen is what Reduce Motion is supposed to buy an automation tool,
// made measurable.
//
// mobium waits for a target's rectangle to stop moving before it touches it,
// so an animation is time spent waiting. An app that honors Reduce Motion
// should cost less of it — but nothing driven here had ever shown that:
// Settings' push is a slide the setting does not replace, and on the
// simulator launch plus map took the same time with it on and off.
//
// Two panels, identical except for one line. The honoring panel reads
// AccessibilityInfo.isReduceMotionEnabled and appears at once when it is on;
// the ignoring one always slides. The ignoring panel is the negative control:
// its time must not move when the setting does, or the measurement is
// measuring something else. Each records how long after its own Replay its
// target was pressed, so the app — not the tool — is the stopwatch.
//
// marginLeft rather than a transform, and the JS driver rather than the
// native one: a layout property moves the element's frame, which is what the
// hierarchy reports. Whether a native-driver transform reaches the
// accessibility frame at all is a separate question, not to be confounded
// with this one.
const SLIDE_MS = 2000;

function MotionPanel({id, label, honors, reduce}: {id: string; label: string; honors: boolean; reduce: boolean}) {
  const offset = useRef(new Animated.Value(0)).current;
  const started = useRef(0);
  const [result, setResult] = useState('not tapped');
  const replay = () => {
    started.current = Date.now();
    setResult('not tapped');
    if (honors && reduce) {
      offset.setValue(0);
      return;
    }
    offset.setValue(1);
    Animated.timing(offset, {
      toValue: 0, duration: SLIDE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
  };
  // Every panel slides in when the screen opens, the same way Replay does.
  useEffect(replay, [reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={s.motionPanel}>
      <Btn id={id + 'Replay'} label={'Replay ' + label} onPress={replay} />
      <Animated.View style={{marginLeft: offset.interpolate({inputRange: [0, 1], outputRange: ['0%', '45%']})}}>
        <Pressable
          testID={id + 'Target'}
          accessibilityLabel={label + ' target'}
          accessibilityRole="button"
          style={s.motionTarget}
          onPress={() => setResult('tapped ' + (Date.now() - started.current) + 'ms after replay')}>
          <Text style={s.btnText}>{label} target</Text>
        </Pressable>
      </Animated.View>
      <Text testID={id + 'Result'} style={s.note}>{label}: {result}</Text>
    </View>
  );
}

// Confetti is a screen that will not hold still, on purpose: a burst of
// pieces falling for CONFETTI_MS over the Motion screen, or with Reduce Motion
// on a still "🎉 Done" instead. It is a control for three things that go
// wrong with movement: a
// setting honored or not; acting on a still target while everything around it
// moves — the pieces take no touches, so a button under the burst stays
// tappable; and backends that wait for the screen to go idle.
//
// The pieces are hidden from accessibility by default, so the burst is
// something drawn over the screen rather than sixty elements in it — the case
// a real celebration animation is. The switch puts them in the hierarchy,
// each named, moving by layout rather than transform so their frames move
// with them, and falling four times slower: then a piece is a target that
// never holds still, on screen long enough to be aimed at — at the normal
// speed every piece had left the screen before one read of it came back — and
// a tool should refuse it rather than chase it.
const CONFETTI_MS = 3000;
const PIECES = 60;
const CONFETTI_COLORS = ['#3552FD', '#763CFB', '#01CBDD', '#F5B400', '#E5484D', '#30A46C'];

function Confetti({burst, exposed, width, height}: {burst: number; exposed: boolean; width: number; height: number}) {
  const pieces = useRef(Array.from({length: PIECES}, (_, i) => ({
    x: new Animated.Value(0), y: new Animated.Value(-20),
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size: 6 + (i % 4) * 2,
  }))).current;
  useEffect(() => {
    if (burst === 0) return;
    const ms = exposed ? CONFETTI_MS * 4 : CONFETTI_MS;
    const anims = pieces.map(p => {
      const startX = Math.random() * width;
      p.x.setValue(startX);
      p.y.setValue(-20 - Math.random() * 80);
      return Animated.parallel([
        Animated.timing(p.y, {toValue: height + 20, duration: ms * (0.7 + Math.random() * 0.3),
          easing: Easing.in(Easing.quad), useNativeDriver: false}),
        Animated.timing(p.x, {toValue: startX + (Math.random() - 0.5) * 120, duration: ms,
          useNativeDriver: false}),
      ]);
    });
    Animated.parallel(anims).start();
  }, [burst]); // eslint-disable-line react-hooks/exhaustive-deps
  if (burst === 0) return null;
  return (
    <View pointerEvents="none" style={s.confetti}
      accessibilityElementsHidden={!exposed}
      importantForAccessibility={exposed ? 'auto' : 'no-hide-descendants'}>
      {pieces.map((p, i) => (
        <Animated.View key={i} testID={exposed ? 'confetti' + i : undefined}
          accessible={exposed} accessibilityLabel={exposed ? 'confetti ' + i : undefined}
          style={{position: 'absolute', left: p.x, top: p.y, width: p.size, height: p.size * 1.6,
            backgroundColor: p.color, borderRadius: 2}} />
      ))}
    </View>
  );
}

function MotionScreen() {
  const [reduce, setReduce] = useState<boolean | null>(null);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  const [burst, setBurst] = useState(0);
  const [exposed, setExposed] = useState(false);
  const [confetti, setConfetti] = useState('idle');
  const [size, setSize] = useState({width: 0, height: 0});
  const celebrate = () => {
    if (reduce) {
      setConfetti('still: reduce motion');
      return;
    }
    setBurst(b => b + 1);
    setConfetti('falling');
    setTimeout(() => setConfetti('done'), (exposed ? CONFETTI_MS * 4 : CONFETTI_MS) + 200);
  };
  return (
    <View onLayout={e => setSize({width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height})}>
      <Text style={s.h1}>Motion</Text>
      <Text style={s.lead}>
        Each target slides in over two seconds. With Reduce Motion on, the
        honoring one and the web page below appear at once; the ignoring one
        always slides, as the control. Tap a target and it says how long after
        its Replay the tap arrived.
      </Text>
      <Text testID="reduceMotion" style={s.note}>reduceMotion={String(reduce)}</Text>
      {reduce === null ? null : (
        <>
          <MotionPanel id="honoring" label="Honoring" honors={true} reduce={reduce} />
          <MotionPanel id="ignoring" label="Ignoring" honors={false} reduce={reduce} />
        </>
      )}
      <Btn id="celebrateBtn" label="Celebrate 🎉" onPress={celebrate} />
      <View style={s.row}>
        <Switch testID="confettiExposed" accessibilityLabel="Pieces visible to automation"
          value={exposed} onValueChange={setExposed} />
        <Text style={s.rowText}>  Pieces visible to automation</Text>
      </View>
      <Text testID="confettiState" style={s.note}>
        confetti: {confetti}{confetti === 'still: reduce motion' ? '  🎉 Done' : ''}
      </Text>
      <Confetti burst={reduce ? 0 : burst} exposed={exposed} width={size.width} height={size.height} />
    </View>
  );
}

// FlickScreen tells a flick from a pan, which look alike from outside: both
// are one finger moving across a list. The difference is what happens after
// the finger lifts. A flick leaves the list moving on its own momentum; a pan
// stops where the finger stopped. mobium sends both through app_swipe, as a
// fast swipe and a slow one, and until this screen nothing had ever checked
// that the speed changed anything.
//
// What decides it is how far the list coasts after the lift, and the
// verdict's rule is written here so it can be argued with: 20 or more
// (points on iOS, dp on Android) is a flick, less is a pan, and the distance
// is always shown. The platform's momentum event alone is not the answer —
// iOS fires it only for a fast release, but Android fires it for any release
// and coasts a continuously smaller distance: 1560, 246, 52, 30 and 6 dp for
// swipes of 120, 300, 600, 1000 and 2500ms on a Pixel 7 AVD, where iOS
// coasted 1360 and 445 for the first two and not at all after.
function FlickScreen() {
  const [result, setResult] = useState('nothing yet');
  const [count, setCount] = useState(0);
  const lift = useRef(0);
  const offset = useRef(0);
  const coasting = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rows = Array.from({length: 120}, (_, i) => i + 1);
  return (
    <View style={{flex: 1}}>
      <Text style={s.h1}>Flick and Pan</Text>
      <Text testID="flickResult" style={s.note}>scroll: {result}</Text>
      <Text testID="flickCount" style={s.note}>lifts: {count}</Text>
      <ScrollView
        testID="flickList"
        accessibilityLabel="Flick list"
        style={s.flickList}
        scrollEventThrottle={16}
        onScroll={e => { offset.current = e.nativeEvent.contentOffset.y; }}
        onScrollBeginDrag={() => {
          coasting.current = false;
          if (timer.current) clearTimeout(timer.current);
        }}
        onScrollEndDrag={e => {
          lift.current = e.nativeEvent.contentOffset.y;
          setCount(n => n + 1);
          // Momentum begins within a frame or two of the lift, or not at all.
          timer.current = setTimeout(() => {
            if (!coasting.current) setResult('pan, coasted 0');
          }, 400);
        }}
        onMomentumScrollBegin={() => { coasting.current = true; }}
        onMomentumScrollEnd={() => {
          if (!coasting.current) return;
          const travel = Math.round(Math.abs(offset.current - lift.current));
          setResult((travel >= 20 ? 'flick' : 'pan') + ', coasted ' + travel);
        }}>
        {rows.map(n => (
          <Text key={n} style={s.flickRow}>Row {n}</Text>
        ))}
      </ScrollView>
    </View>
  );
}

// MultiTouchScreen is the witness for the gestures in which fingers do
// different things: press and tap, press and drag, and taps of two or more
// fingers at once. Native, not a page: a WebView takes a finger held past
// Android's 500ms long-press timeout as its own gesture and stops reporting
// touches (mobium CHALLENGES 68), and holding is the point of all three.
//
// It records each finger — when it landed, when it lifted, how far it moved —
// and names the gesture only once every finger is up, from that record. So
// the classification is this screen's, and it is written down here so it can
// be argued with:
//   - every finger landed within 60ms of the first and lifted within 60ms of
//     the first to lift, none moved more than 20pt: an N-finger tap
//   - two fingers, the second landing at least 100ms after the first and
//     lifting before it: press and tap if the second moved under 20pt, press
//     and drag if it moved more
// Anything else is reported as "other", with the numbers, rather than forced
// into a name.
type Finger = {down: number; up: number; x0: number; y0: number; x: number; y: number; lost?: boolean};

// Times are the native event's own timestamp, not Date.now() when JavaScript
// gets around to the event: a finger's landing is the moment the platform
// saw it, and the JS thread can be behind by more than the gaps measured here.
// The zones are Pressables only so Android counts them as targets: a View with
// a label and no press handler is not clickable there, and mobium maps what a
// user can touch. The press does nothing; the pad's own touch handlers, which
// see every finger whatever it lands on, are the witness.
const noop = () => {};

function MultiTouchScreen() {
  const [result, setResult] = useState('nothing yet');
  const [detail, setDetail] = useState('');
  const [events, setEvents] = useState('');
  const log = useRef<string[]>([]);
  const fingers = useRef(new Map<string, Finger>());
  const order = useRef<string[]>([]);
  // The platform's identifier for each finger now down, to the record it
  // belongs to.
  const live = useRef(new Map<string, string>());

  const stamp = (e: any) => Math.round(e.nativeEvent.timestamp);
  const onStart = (e: any) => {
    // A gesture that begins with no other finger down starts a fresh record,
    // so one broken gesture cannot poison every reading after it.
    if (e.nativeEvent.touches.length === e.nativeEvent.changedTouches.length) {
      fingers.current.clear();
      order.current = [];
      log.current = [];
      live.current.clear();
    }
    note('down', e);
    for (const t of e.nativeEvent.changedTouches) {
      // iOS reuses a lifted finger's identifier for the next one down, so a
      // finger is keyed by its identifier *and* how many times that
      // identifier has landed — otherwise two touches merge into one record.
      let id = String(t.identifier);
      while (fingers.current.has(id) && fingers.current.get(id)!.up) id += "'";
      if (!fingers.current.has(id)) {
        fingers.current.set(id, {down: stamp(e), up: 0, x0: t.pageX, y0: t.pageY, x: t.pageX, y: t.pageY});
        order.current.push(id);
        live.current.set(String(t.identifier), id);
      }
    }
  };
  // Every event as it arrived — which fingers it changed, how many were down
  // after it, and when — so a verdict can be checked against its evidence.
  const note = (kind: string, e: any) => {
    const t0 = fingers.current.size ? fingers.current.get(order.current[0])!.down : stamp(e);
    const ids = Array.from(e.nativeEvent.changedTouches,
      (t: any) => t.identifier + '(' + Math.round(t.pageX) + ',' + Math.round(t.pageY) + ')').join('+');
    log.current.push(kind + ' ' + ids + '@' + (stamp(e) - t0) + ' n=' + e.nativeEvent.touches.length);
  };
  const onMove = (e: any) => {
    for (const t of e.nativeEvent.changedTouches) {
      const f = fingers.current.get(live.current.get(String(t.identifier)) ?? '');
      if (f) { f.x = t.pageX; f.y = t.pageY; }
    }
  };
  const onEnd = (e: any) => {
    note('up', e);
    for (const t of e.nativeEvent.changedTouches) {
      const f = fingers.current.get(live.current.get(String(t.identifier)) ?? '');
      if (f && !f.up) { f.up = stamp(e); f.x = t.pageX; f.y = t.pageY; }
      live.current.delete(String(t.identifier));
    }
    // Finished when the platform says no finger is down — not when every
    // finger this screen saw has lifted, which a lost lift would make never.
    // A finger whose lift was never reported is closed here, and says so.
    if (e.nativeEvent.touches.length > 0) return;
    const all = order.current.map(id => fingers.current.get(id)!);
    if (all.length === 0) return;
    for (const f of all) {
      if (!f.up) { f.up = stamp(e); f.lost = true; }
    }
    setResult(classify(all));
    // The evidence behind the verdict: each finger's landing and lifting,
    // in ms from the first landing, and how far it moved.
    const t0 = all[0].down;
    setDetail(all.map(f => '[' + (f.down - t0) + '-' + (f.up - t0) + ' moved ' +
      Math.round(Math.hypot(f.x - f.x0, f.y - f.y0)) + (f.lost ? ' no lift seen' : '') + ']').join(' '));
    setEvents(log.current.join(', '));
    fingers.current.clear();
    order.current = [];
  };

  return (
    <View>
      <Text style={s.h1}>Multi-Touch</Text>
      <Text testID="multiResult" style={s.note}>multi: {result}</Text>
      <Text testID="multiDetail" style={s.note}>fingers: {detail}</Text>
      <Text testID="multiEvents" style={s.note}>events: {events}</Text>
      <View
        style={s.multiPad}
        onTouchStart={onStart}
        onTouchMove={onMove}
        onTouchEnd={onEnd}
        onTouchCancel={onEnd}>
        <View style={s.multiRow}>
          <Pressable testID="holdZone" accessibilityLabel="Hold zone" accessibilityRole="button"
            onPress={noop} style={[s.multiZone, s.holdZone]}>
            <Text style={s.targetText}>Hold</Text>
          </Pressable>
          <Pressable testID="actZone" accessibilityLabel="Act zone" accessibilityRole="button"
            onPress={noop} style={[s.multiZone, s.actZone]}>
            <Text style={s.targetText}>Tap or drag</Text>
          </Pressable>
        </View>
        <Pressable testID="dragEnd" accessibilityLabel="Drag end" accessibilityRole="button"
          onPress={noop} style={s.dragEndZone}>
          <Text style={s.targetText}>Drag to here</Text>
        </Pressable>
        <Pressable testID="tapZone" accessibilityLabel="Finger tap zone" accessibilityRole="button"
          onPress={noop} style={s.tapZone}>
          <Text style={s.targetText}>Tap with several fingers</Text>
        </Pressable>
      </View>
    </View>
  );
}

function classify(all: Finger[]): string {
  const moved = (f: Finger) => Math.round(Math.hypot(f.x - f.x0, f.y - f.y0));
  const first = all[0];
  const n = all.length;
  const firstUp = Math.min(...all.map(f => f.up));
  const together = all.every(f => f.down - first.down <= 60 && f.up - firstUp <= 60);
  if (n >= 2 && together && all.every(f => moved(f) <= 20)) {
    return n + '-finger tap';
  }
  if (n === 2) {
    const second = all[1];
    const lead = second.down - first.down;
    if (lead >= 100 && second.up <= first.up) {
      const kind = moved(second) <= 20 ? 'press and tap' : 'press and drag';
      return kind + ', lead ' + lead + 'ms, second moved ' + moved(second) +
        ', first moved ' + moved(first) + ', held ' + (first.up - first.down) + 'ms';
    }
  }
  if (n === 1) {
    return 'one finger, moved ' + moved(first) + ', held ' + (first.up - first.down) + 'ms';
  }
  return 'other, ' + n + ' fingers, landed over ' +
    (Math.max(...all.map(f => f.down)) - first.down) + 'ms';
}

// FormScreen is the controls that have a *state* rather than only a label.
//
// A checkbox is not a button. Tapping one toggles it, so a caller that cannot
// see whether it is already ticked cannot reach a desired state — it can only
// flip whatever is there and hope. That makes "what does map report" the
// interesting question on this screen, not "can it be tapped".
//
// React Native has no checkbox or radio of its own: only `Switch` is native.
// The other two are the conventional spelling — a Pressable carrying
// `accessibilityRole` and `accessibilityState={{checked}}` — which is what
// every RN app does and therefore what a tool meets in the wild. Whether that
// reaches the hierarchy as a real checked state on each platform is exactly
// what had never been measured here.
//
// The switch is the app's dark mode, and it has an effect that can be checked
// three ways that do not lean on each other: the switch's state in the
// hierarchy, `theme=` in formState, and the screen's colors in a screenshot —
// the last being what nothing that only echoes a value back can fake. It used
// to be tied to the terms checkbox, which showed one control moving another
// and nothing more.
function FormScreen({dark, setDark}: {dark: boolean; setDark: (v: boolean) => void}) {
  const [notify, setNotify] = useState(false);
  const [terms, setTerms] = useState(false);
  const [plan, setPlan] = useState('free');

  const Check = ({id, label, on, set}: {id: string; label: string; on: boolean; set: (v: boolean) => void}) => (
    <Pressable
      testID={id}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{checked: on}}
      style={s.row}
      onPress={() => set(!on)}>
      <Text style={s.box}>{on ? '☑' : '☐'}</Text>
      <Text style={s.rowText}>{label}</Text>
    </Pressable>
  );

  const Radio = ({id, label, value}: {id: string; label: string; value: string}) => (
    <Pressable
      testID={id}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{checked: plan === value}}
      style={s.row}
      onPress={() => setPlan(value)}>
      <Text style={s.box}>{plan === value ? '◉' : '○'}</Text>
      <Text style={s.rowText}>{label}</Text>
    </Pressable>
  );

  return (
    <View>
      <Text style={s.h1}>Form</Text>

      <Check id="notifyCheck" label="Email me" on={notify} set={setNotify} />
      <Check id="termsCheck" label="Accept terms" on={terms} set={setTerms} />

      <View accessibilityRole="radiogroup" style={s.group}>
        <Radio id="planFree" label="Free" value="free" />
        <Radio id="planPro" label="Pro" value="pro" />
        <Radio id="planTeam" label="Team" value="team" />
      </View>

      <View style={s.row}>
        <Switch
          testID="darkSwitch"
          accessibilityLabel="Dark mode"
          value={dark}
          onValueChange={setDark}
        />
        <Text style={s.rowText}>Dark mode, for the whole app</Text>
      </View>

      {/* A field that shows text and cannot be edited — the control for
          typing into something that is not editable, which Vibium refuses
          before trying. */}
      <Text style={s.label}>Read-only</Text>
      <TextInput testID="readOnlyField" accessibilityLabel="read-only field" style={s.input}
        value="This field cannot be edited" editable={false} />

      <Text testID="formState" style={s.note}>
        notify={String(notify)} terms={String(terms)} plan={plan} theme={dark ? 'dark' : 'light'}
      </Text>
    </View>
  );
}

// CrashScreen is the positive control for mobium's app_logs and app_crashes
// on a real iPhone, where nothing outside an app can make it crash — a signal
// sent from outside produces no crash report on a phone, and there is no
// `am crash` or injected library there. Without a crash the app causes itself,
// "no crashes for this app" could never be told apart from a tool that cannot
// see them.
//
// Both buttons are JavaScript, because this app has no native module of its
// own and a crash screen is no reason to add one. In a Release build — the one
// the README builds — console.error reaches the device log and an unhandled
// error is fatal on both platforms. console.warn does not reach it: measured on
// an iPhone 15 Plus, a warn from the Release build appeared nowhere in the
// phone's log while the app's other lines did, which is React Native's release
// log threshold at work. So the markers are errors, though nothing is wrong.
// On a crash: RCTFatal raises an
// exception on iOS, which the crash report carries as the application-specific
// message; a JavascriptException kills the process on Android. In a debug
// build the same error is a red box instead, and this screen proves nothing.
//
// The error is thrown from a timer, outside any handler React could attribute
// it to, so nothing between it and the global handler can catch it. Each
// message carries a marker a check can search for, and the log line's count is
// on screen so a read can be matched to the press that wrote it.
//
// Not here, and said rather than approximated: a native crash (a signal from
// native code) and an ANR (a blocked main thread). Both need native code.
const LOG_MARKER = 'mobium-log-control';
const CRASH_MARKER = 'mobium-crash-control';

function CrashScreen() {
  const [logged, setLogged] = useState(0);

  const logLine = () => {
    const n = logged + 1;
    console.error(`${LOG_MARKER} #${n}`);
    setLogged(n);
  };

  const crash = () => {
    console.error(`${CRASH_MARKER}: throwing now`);
    setTimeout(() => {
      throw new Error(`${CRASH_MARKER}: an unhandled JavaScript error`);
    }, 0);
  };

  return (
    <View>
      <Text style={s.h1}>Crash</Text>
      <Btn id="logLineBtn" label="Log a line" onPress={logLine} />
      <Text testID="loggedCount" style={s.note}>logged: {logged}</Text>
      <Btn id="crashJsBtn" label="Crash with a JavaScript error" onPress={crash} />
      <Text style={s.note}>The app quits. Relaunch it to come back.</Text>
    </View>
  );
}

// StorageScreen is the positive control for clearing an app's data. The app
// otherwise keeps nothing of its own — the only files in its data directory
// are the frameworks' — so "the data was cleared" had nothing to be seen
// through except root on an emulator, which a phone does not give.
//
// A count, kept in a file in the documents directory and read back each time
// the screen opens. Press the button, and the count survives a relaunch; clear
// the app's data, and it reads 0 and says the file is absent. The app itself
// reports the outcome, identically on all four kinds of device.
//
// A file rather than preferences, because it is the one store that is plainly
// the app's on both platforms: iOS preferences pass through a daemon that
// caches them, which is a question of its own and not this screen's.
const STORE = 'mobium-storage.json';

// LayoutScreen is the positive control for mobium's layout inspection
// (formflux): two touch targets whose verdict is known at every screen size,
// so a run that reports nothing can be told from one that cannot see. The
// tiny one is 24dp square, under Android's 48dp at every size. The narrow
// one is an eighth of the window's width and 60dp tall: 51dp wide on a
// 411dp screen, and under 48dp once the screen is narrower than 384dp — a
// target that breaks when the screen shrinks, which is the thing formflux
// exists to find.
function LayoutScreen() {
  const {width} = useWindowDimensions();
  const narrow = Math.round(width / 8);
  const [last, setLast] = useState('nothing yet');
  return (
    <View>
      <Text style={s.h1}>Layout</Text>
      <Text style={s.lead}>
        Two targets sized to fail. The square one is too small at every screen size; the wide bar is an
        eighth of the screen across, and becomes too narrow to tap once the screen is under 384dp.
      </Text>
      <Pressable testID="tinyTarget" accessibilityLabel="Tiny target" accessibilityRole="button"
        onPress={() => setLast('tiny')} style={[s.target, {width: 24, height: 24}]} />
      <Pressable testID="narrowTarget" accessibilityLabel="Narrow target" accessibilityRole="button"
        onPress={() => setLast('narrow')} style={[s.target, {width: narrow, height: 60, marginTop: 16}]} />
      <Text testID="layoutWidth" style={s.note}>window {Math.round(width)}dp, narrow target {narrow}dp</Text>
      <Text testID="layoutLast" style={s.note}>last: {last}</Text>
    </View>
  );
}

// BatteryScreen is the observer app_battery had none of. mobium reads the
// battery from outside — dumpsys on Android, the device's own report on iOS —
// and until something on the device said what it saw, a level read back was
// only mobium agreeing with itself. The app reads the same battery through
// the platform's API, every second and on every change the platform
// announces, and shows it as a battery drawn to the exact level and as text,
// so a check can hold mobium's answer to the app's, and a person can see it.
//
// On an emulator the battery is the console's to set — `adb emu power
// capacity 42`, `adb emu power status charging` — which is the control: the
// drawing follows a level nobody could have guessed. An iOS simulator has no
// battery, and says so: the platform reports its level as -1, shown as no
// battery rather than as an empty one, and the screen stops reading.
const BATTERY_STATES: Record<number, string> = {
  [Battery.BatteryState.UNKNOWN]: 'unknown',
  [Battery.BatteryState.UNPLUGGED]: 'unplugged',
  [Battery.BatteryState.CHARGING]: 'charging',
  [Battery.BatteryState.FULL]: 'full',
};

// The fill is drawn to the pixel: the width inside the border and padding,
// times the level. A percentage width would be of the padded box, and wrong
// by up to the padding.
const BATTERY_WIDTH = 260, BATTERY_BORDER = 6, BATTERY_PAD = 6;
const BATTERY_INNER = BATTERY_WIDTH - 2 * (BATTERY_BORDER + BATTERY_PAD);

function BatteryScreen() {
  const [level, setLevel] = useState<number | null>(null);
  const [state, setState] = useState<Battery.BatteryState>(Battery.BatteryState.UNKNOWN);
  const [lowPower, setLowPower] = useState<boolean | null>(null);
  const [reads, setReads] = useState(0);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const read = async () => {
      try {
        const [l, st, lp] = await Promise.all([
          Battery.getBatteryLevelAsync(), Battery.getBatteryStateAsync(), Battery.isLowPowerModeEnabledAsync(),
        ]);
        if (!live) return;
        setLevel(l);
        setState(st);
        setLowPower(lp);
        setReads(n => n + 1);
        // No battery — a simulator's -1 — is an answer, not a read still
        // to come: polling on would count reads of nothing, which looked like
        // a screen stuck reading.
        if (l < 0 && timer !== undefined) {
          clearInterval(timer);
          timer = undefined;
        }
      } catch (e) {
        setErr(String(e));
      }
    };
    // A poll as well as the listeners: the reads counter is what tells a
    // screen that is still reading from one that stopped.
    timer = setInterval(read, 1000);
    read();
    const a = Battery.addBatteryLevelListener(({batteryLevel}) => live && setLevel(batteryLevel));
    const b = Battery.addBatteryStateListener(({batteryState}) => live && setState(batteryState));
    return () => {
      live = false;
      if (timer !== undefined) clearInterval(timer);
      a.remove();
      b.remove();
    };
  }, []);

  const known = level !== null && level >= 0;
  const none = level !== null && level < 0;
  // The level as the platform gives it, 0 to 1, as a percentage with no more
  // rounding than a tenth: Android reports whole percents, a real iPhone
  // steps of five. Android's is a 32-bit float, so 42% arrives as
  // 0.41999998688697815; the raw line shows six significant digits, which is
  // every digit the platform meant.
  const pct = known ? Math.round(level * 1000) / 10 : null;
  const words = BATTERY_STATES[state] ?? 'unknown';
  const fill = pct === null ? 'transparent' : pct > 50 ? '#34C759' : pct > 20 ? '#FFCC00' : '#FF3B30';
  const said = none ? 'No battery' : pct === null ? 'Battery not read yet' : `Battery ${pct} percent, ${words}`;

  return (
    <View>
      <Text style={s.h1}>Battery</Text>
      <Text style={s.lead}>
        What this device reports about its battery, drawn and in words, read again every second. mobium
        battery reads the same battery from outside; on an emulator, adb emu power capacity changes it, and the
        drawing follows. A simulator has no battery, and says so.
      </Text>
      <View style={s.batteryRow} testID="batteryGauge" accessible accessibilityLabel={said}>
        <View style={s.batteryBody}>
          <View style={[s.batteryFill, {width: BATTERY_INNER * (pct ?? 0) / 100, backgroundColor: fill}]} />
          <Text style={none ? s.batteryNone : s.batteryText}>
            {none ? 'No battery' : pct === null ? '…' : `${pct}%`}{words === 'charging' ? ' ⚡' : ''}
          </Text>
        </View>
        <View style={s.batteryCap} />
      </View>
      <Text testID="batteryLevel" style={s.mono}>
        level: {none ? 'none' : pct === null ? 'not read yet' : `${pct}%`}
      </Text>
      <Text testID="batteryRaw" style={s.note}>
        raw: {level === null ? 'not read yet' : String(Number(level.toPrecision(6)))}
      </Text>
      <Text testID="batteryState" style={s.mono}>state: {words}</Text>
      <Text testID="batteryLowPower" style={s.note}>
        low power mode: {lowPower === null ? 'not read yet' : lowPower ? 'on' : 'off'}
      </Text>
      <Text testID="batteryReads" style={s.note}>
        reads: {reads}{none ? ' — stopped: this device reports no battery (level -1), and there is nothing to watch' : ''}
      </Text>
      {err !== '' && <Text testID="batteryError" style={s.note}>error: {err}</Text>}
    </View>
  );
}

// BiometricsScreen is the observer for app_biometric: a sign-in the platform
// decides, and the app says what it was told. mobium enrolls a face or a
// finger from outside and presents a matching or a non-matching one; nothing
// outside the app can see whether the app's own prompt took it, so the app
// reports the answer — success, or the platform's reason — on one line.
//
// What the device offers is read again every second, because enrollment
// changes from outside while the app is on screen (on a simulator, with no
// app switch at all), and a check has to see it arrive. The attempt counter
// separates a new answer from the last one, and `bioPending` says a prompt is
// up and waiting, so a finger presented to nobody can be told from one the
// prompt refused.
//
// Biometrics only: no passcode to fall back to, so a face that does not
// match comes back as a failure rather than as a passcode screen, and the
// answer is the biometric's alone.
const BIO_TYPES: Record<number, string> = {
  [LocalAuthentication.AuthenticationType.FINGERPRINT]: 'fingerprint',
  [LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION]: 'face',
  [LocalAuthentication.AuthenticationType.IRIS]: 'iris',
};
const BIO_LEVELS: Record<number, string> = {
  [LocalAuthentication.SecurityLevel.NONE]: 'none',
  [LocalAuthentication.SecurityLevel.SECRET]: 'passcode only',
  [LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK]: 'biometric (weak)',
  [LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG]: 'biometric (strong)',
};

function BiometricsScreen() {
  const [hardware, setHardware] = useState<boolean | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [level, setLevel] = useState('not read yet');
  const [attempts, setAttempts] = useState(0);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState('none yet');
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    const read = async () => {
      try {
        const [h, t, e, l] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.supportedAuthenticationTypesAsync(),
          LocalAuthentication.isEnrolledAsync(),
          LocalAuthentication.getEnrolledLevelAsync(),
        ]);
        if (!live) return;
        setHardware(h);
        setTypes(t.map(x => BIO_TYPES[x] ?? String(x)));
        setEnrolled(e);
        setLevel(BIO_LEVELS[l] ?? String(l));
      } catch (e) {
        setErr(String(e));
      }
    };
    const timer = setInterval(read, 1000);
    read();
    return () => { live = false; clearInterval(timer); };
  }, []);

  const signIn = async () => {
    const n = attempts + 1;
    setAttempts(n);
    setPending(true);
    setOutcome(`#${n}: waiting for the prompt`);
    try {
      const r = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Sign in to MobiumApp',
        cancelLabel: 'Cancel',
        disableDeviceFallback: true,
        fallbackLabel: '',
        biometricsSecurityLevel: 'strong',
      });
      setOutcome(r.success ? `#${n}: success` : `#${n}: failed (${r.error})${r.warning ? ' — ' + r.warning : ''}`);
    } catch (e) {
      setOutcome(`#${n}: error ${String(e)}`);
    } finally {
      setPending(false);
    }
  };

  const yesNo = (v: boolean | null) => v === null ? 'not read yet' : v ? 'yes' : 'no';
  return (
    <View>
      <Text style={s.h1}>Biometrics</Text>
      <Text style={s.lead}>
        Sign in with a face or a finger, and the line below says what the platform answered. mobium biometric
        enrolls one from outside and presents a match or a non-match; only an emulator or a simulator can be
        told either, and a real phone needs a real finger.
      </Text>
      <Text testID="bioHardware" style={s.mono}>
        hardware: {yesNo(hardware)}{types.length ? ` (${types.join(', ')})` : ''}
      </Text>
      <Text testID="bioEnrolled" style={s.mono}>enrolled: {yesNo(enrolled)}</Text>
      <Text testID="bioLevel" style={s.note}>security level: {level}</Text>
      <Btn id="bioSignIn" label="Sign in with biometrics" onPress={signIn} disabled={pending} />
      <Text testID="bioPending" style={s.note}>{pending ? 'prompt: up, waiting' : 'prompt: none'}</Text>
      <Text testID="bioOutcome" style={s.mono}>outcome: {outcome}</Text>
      <Text testID="bioAttempts" style={s.note}>attempts: {attempts}</Text>
      {err !== '' && <Text testID="bioError" style={s.note}>error: {err}</Text>}
    </View>
  );
}

// FilesScreen is the observer for app_upload and app_download: a file that
// crosses between a computer and the device, checked from the app's side.
//
// Download saves a small report where the device keeps downloads — the
// shared Download folder on Android, through MediaStore as an app's own
// downloads land; the app's Documents folder on iOS, which the Files app
// shows — and says what it wrote, so a file brought back can be compared
// with what the app saved. Upload opens the system file picker, which is
// where a file sent to the device has to be findable, and says the name,
// size and first line of what was picked, so the app confirms what arrived.
// Nothing is fetched: the report is written here, and the picker only reads.
const REPORT_NAME = 'mobium-report.txt';

function FilesScreen() {
  const [saves, setSaves] = useState(0);
  const [saved, setSaved] = useState('nothing yet');
  const [picked, setPicked] = useState('nothing yet');
  const [err, setErr] = useState('');

  const saveReport = async () => {
    const n = saves + 1;
    const text = `MobiumApp report ${n}\nSaved by the Files Demo.\n`;
    try {
      const where = await Downloads.saveAsync(REPORT_NAME, text);
      setSaves(n);
      setSaved(`${where} (${text.length} bytes) — MobiumApp report ${n}`);
      setErr('');
    } catch (e) {
      setErr(String(e));
    }
  };

  const pick = async () => {
    try {
      const result = await File.pickFileAsync();
      if (result.canceled) {
        setPicked('canceled');
        return;
      }
      const f = result.result;
      const text = await f.text();
      const first = text.split('\n')[0].slice(0, 80);
      const name = await Downloads.nameAsync(f.uri);
      setPicked(`${name} (${f.size} bytes) — ${first}`);
      setErr('');
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <View>
      <Text style={s.h1}>Files</Text>
      <Text style={s.lead}>
        Download saves a small report where this device keeps downloads — the Download folder on Android, this
        app's Documents on iOS. Upload opens the system file picker; pick a file, and the line under it says
        what arrived.
      </Text>
      <Btn id="saveReportBtn" label="Download the report" onPress={saveReport} />
      <Text testID="savedFile" style={s.mono}>saved: {saved}</Text>
      <Btn id="pickFileBtn" label="Upload a file" onPress={pick} />
      <Text testID="pickedFile" style={s.mono}>picked: {picked}</Text>
      {err !== '' && <Text testID="filesError" style={s.note}>error: {err}</Text>}
    </View>
  );
}

function StorageScreen() {
  const [count, setCount] = useState(0);
  const [present, setPresent] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    try {
      const f = new File(Paths.document, STORE);
      setPresent(f.exists);
      setCount(f.exists ? JSON.parse(f.textSync()).count ?? 0 : 0);
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  const saveOneMore = () => {
    try {
      const f = new File(Paths.document, STORE);
      if (!f.exists) {
        f.create();
      }
      const n = count + 1;
      f.write(JSON.stringify({count: n}));
      setCount(n);
      setPresent(true);
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <View>
      <Text style={s.h1}>Storage</Text>
      <Text testID="storedCount" style={s.note}>stored: {count}</Text>
      <Text testID="storedFile" style={s.note}>file: {present ? 'present' : 'absent'}</Text>
      <Btn id="saveOneMoreBtn" label="Save one more" onPress={saveOneMore} />
      {err !== '' && <Text testID="storageError" style={s.note}>error: {err}</Text>}
    </View>
  );
}

// DialogScreen raises every kind of dialog this app can raise, on demand, and
// says what came of each — the positive controls for mobium's handling of
// dialogs.
//
// The kinds differ in who owns the window, and that is the point of having
// them side by side. The app's own alerts and the iOS action sheet are the
// app's, and iOS keeps what they cover in the app's hierarchy; a permission
// prompt is another process's (SpringBoard, the permission controller); the
// share sheet is a system view hosted over the app; "Save Password?" is iOS's,
// raised for a form it recognizes as a login. Each button writes its outcome
// to one line, `dialogOutcome`, so a check reads what the app received rather
// than inferring it from the dialog going away.
//
// Late Alert raises its alert two seconds after the tap, because a real
// dialog does not wait for a test to be ready — Save Password arrives a
// moment after the screen it follows.
//
// The last section is a button the keyboard covers. On iOS it stays in the
// hierarchy, marked not visible, and a tap on it lands on the keyboard. On Android 15 it
// leaves the hierarchy: edge-to-edge is enforced, so adjustResize no longer
// shrinks the window, and UiAutomator2 drops what the keyboard covers —
// measured on a Pixel 7 AVD, where the field being typed into went with it.
//
// Notification permission, App Tracking Transparency and the camera come
// from Expo's modules for them; ATT is Apple's alone, and the screen says so
// on Android rather than pretending a prompt.
function DialogScreen() {
  const [outcome, setOutcome] = useState('nothing yet');
  const [saveUser, setSaveUser] = useState('');
  const [savePass, setSavePass] = useState('');
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState('');
  const say = (kind: string, what: string) => setOutcome(kind + ': ' + what);

  const oneButton = () =>
    Alert.alert('Saved', 'Your changes were saved.', [{text: 'OK', onPress: () => say('one-button', 'OK')}]);
  const twoButton = () =>
    Alert.alert('Discard changes?', 'They will be lost.', [
      {text: 'Keep Editing', style: 'cancel', onPress: () => say('two-button', 'Keep Editing')},
      {text: 'Discard', style: 'destructive', onPress: () => say('two-button', 'Discard')},
    ]);
  const threeButton = () =>
    Alert.alert('Save this draft?', 'You can come back to it later.', [
      {text: 'Cancel', style: 'cancel', onPress: () => say('three-button', 'Cancel')},
      {text: "Don't Save", onPress: () => say('three-button', "Don't Save")},
      {text: 'Save', onPress: () => say('three-button', 'Save')},
    ]);
  const late = () => {
    say('late', 'waiting');
    setTimeout(() => Alert.alert('Session expiring', 'Stay signed in?', [
      {text: 'Sign Out', style: 'cancel', onPress: () => say('late', 'Sign Out')},
      {text: 'Stay', onPress: () => say('late', 'Stay')},
    ]), 2000);
  };
  const actionSheet = () => {
    if (Platform.OS !== 'ios') {
      say('action sheet', 'none on android: ActionSheetIOS is iOS-only');
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {title: 'Share photo', options: ['Cancel', 'Copy Link', 'Delete Photo'], cancelButtonIndex: 0, destructiveButtonIndex: 2},
      i => say('action sheet', ['Cancel', 'Copy Link', 'Delete Photo'][i]),
    );
  };
  const share = async () => {
    try {
      const r = await Share.share({message: 'Mobium — mobile automation for agents and humans'});
      // Android resolves with sharedAction however the sheet closed — pressing
      // Back gave "shared" on a Pixel 7 AVD — so there it says only closed.
      if (Platform.OS === 'android') {
        say('share', 'closed (android cannot tell shared from dismissed)');
        return;
      }
      say('share', r.action === Share.sharedAction ? 'shared' + (r.activityType ? ' via ' + r.activityType : '') : 'dismissed');
    } catch (e) {
      say('share', 'error: ' + String(e));
    }
  };
  const location = async () => {
    try {
      const r = await Location.requestForegroundPermissionsAsync();
      say('location', r.status);
    } catch (e) {
      say('location', 'error: ' + String(e));
    }
  };
  // Each asks through its module and reports the status it resolves to —
  // granted, denied, or undetermined when the prompt did not come.
  const ask = (kind: string, request: () => Promise<{status: string}>) => async () => {
    try {
      say(kind, (await request()).status);
    } catch (e) {
      say(kind, 'error: ' + String(e));
    }
  };
  const notifications = ask('notifications', () => Notifications.requestPermissionsAsync());
  const camera = ask('camera', () => Camera.requestCameraPermissionsAsync());
  const prompt = () => {
    if (Platform.OS !== 'ios') {
      say('prompt', 'none on android: Alert.prompt is iOS-only');
      return;
    }
    Alert.prompt('Name this draft', 'It will be saved under that name.', [
      {text: 'Cancel', style: 'cancel', onPress: () => say('prompt', 'canceled')},
      {text: 'Save', onPress: (t?: string) => say('prompt', 'saved as ' + (t || '(empty)'))},
    ], 'plain-text');
  };
  // Reading the clipboard is itself a dialog on iOS 16 and later: "Allow
  // Paste" when the content came from another app — a simctl pbcopy counts.
  // Android reads without asking while the app is in front, and says so only
  // in a toast. Reports the length, not the content.
  const paste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      say('paste', text ? text.length + ' characters' : 'empty, or not allowed');
    } catch (e) {
      say('paste', 'error: ' + String(e));
    }
  };
  const tracking = Platform.OS === 'ios'
    ? ask('tracking', () => requestTrackingPermissionsAsync())
    : () => say('tracking', 'none on android: App Tracking Transparency is Apple\'s');

  return (
    <View style={s.fill}>
      <ScrollView contentContainerStyle={s.dialogList} keyboardShouldPersistTaps="handled">
        <Text style={s.h1}>Dialogs</Text>
        <Text style={s.lead}>
          Each button raises a dialog. Answer it, and the line below says what
          the app received.
        </Text>
        <Text testID="dialogOutcome" style={s.outcome}>{outcome}</Text>

        <Text style={s.label}>The app's own</Text>
        <Btn id="oneButtonBtn" label="One-button alert" onPress={oneButton} />
        <Btn id="twoButtonBtn" label="Two-button alert" onPress={twoButton} />
        <Btn id="threeButtonBtn" label="Three-button alert" onPress={threeButton} />
        <Btn id="lateAlertBtn" label="Alert in 2 seconds" onPress={late} />
        <Btn id="actionSheetBtn" label="Action sheet" onPress={actionSheet} />
        <Btn id="promptBtn" label="Prompt with a text field" onPress={prompt} />

        <Text style={s.label}>The system's</Text>
        <Btn id="shareBtn" label="Share sheet" onPress={share} />
        <Btn id="locationBtn" label="Location permission" onPress={location} />
        <Btn id="notificationsBtn" label="Notification permission" onPress={notifications} />
        <Btn id="cameraBtn" label="Camera permission" onPress={camera} />
        <Btn id="trackingBtn" label="Tracking permission (App Tracking Transparency)" onPress={tracking} />
        <Btn id="pasteBtn" label="Paste from the clipboard" onPress={paste} />
        <Text style={s.hintNote}>
          Android's "keeps stopping" dialog comes when an app crashes again soon
          after crashing: press the Crash Demo's crash button twice in a row.
          Neither accept nor dismiss can press its buttons; tap Close app.
        </Text>

        <Text style={s.label}>Save Password (iOS offers it after this form)</Text>
        {saved ? (
          <View>
            <Text testID="savedText" style={s.ok}>✓ Signed in. iOS may now offer to save the password.</Text>
            <Btn id="saveResetBtn" label="Show the form again" onPress={() => setSaved(false)} />
          </View>
        ) : (
          <View>
            <TextInput testID="saveUser" accessibilityLabel="save username" placeholder="any username"
              style={s.input} autoCapitalize="none" autoCorrect={false} value={saveUser} onChangeText={setSaveUser} />
            <TextInput testID="savePass" accessibilityLabel="save password" placeholder="any password"
              style={s.input} secureTextEntry autoCapitalize="none" value={savePass} onChangeText={setSavePass} />
            <Btn id="saveSubmitBtn" label="Sign In" onPress={() => {
              setSavePass('');
              setSaved(true);
              say('save password', 'form submitted');
            }} />
          </View>
        )}

        <Text style={s.label}>Under the keyboard</Text>
        <Text style={s.hintNote}>
          Type in this field, and the on-screen keyboard covers the button
          pinned to the bottom of the screen, and often the field too. With a
          hardware keyboard attached — a simulator's, or a headed emulator's —
          there is no such keyboard, and nothing is covered.
        </Text>
        <TextInput testID="coverField" accessibilityLabel="cover field" placeholder="type here"
          style={s.input} value={note} onChangeText={setNote} />
      </ScrollView>
      {/* Below the list, not over it: pinned over the list, it covered the
          list's last buttons, and a tap on the camera button landed on it. */}
      <View style={s.pinned}>
        <Btn id="coveredBtn" label="Pinned to the bottom" onPress={() => say('pinned button', 'tapped')} />
      </View>
    </View>
  );
}


// DraftField keeps its text in its own state. Change its key and it remounts,
// taking the text with it — which is what a screen rebuilding does to anything
// it was holding.
// A11yScreen reports the accessibility settings the app is told about, on one
// line a check can read: what the platform says to an app, which is the half
// a setting written from outside has to reach before it is worth anything.
// The system's own switches in Settings are the other half. Each value is
// updated live from the platform's change event, and read afresh on Refresh,
// so "changed while the app ran" can be told from "seen after a relaunch".
type A11yFlags = {[k: string]: boolean};
const A11Y_QUERIES: [string, () => Promise<boolean>][] = [
  ['bold', AccessibilityInfo.isBoldTextEnabled],
  ['contrast', AccessibilityInfo.isDarkerSystemColorsEnabled],
  ['grayscale', AccessibilityInfo.isGrayscaleEnabled],
  ['invert', AccessibilityInfo.isInvertColorsEnabled],
  ['motion', AccessibilityInfo.isReduceMotionEnabled],
  ['transparency', AccessibilityInfo.isReduceTransparencyEnabled],
  ['screenReader', AccessibilityInfo.isScreenReaderEnabled],
];
const A11Y_EVENTS: [string, string][] = [
  ['bold', 'boldTextChanged'],
  ['contrast', 'darkerSystemColorsChanged'],
  ['grayscale', 'grayscaleChanged'],
  ['invert', 'invertColorsChanged'],
  ['motion', 'reduceMotionChanged'],
  ['transparency', 'reduceTransparencyChanged'],
  ['screenReader', 'screenReaderChanged'],
];

function A11yScreen() {
  const [flags, setFlags] = useState<A11yFlags>({});
  const [changes, setChanges] = useState(0);
  const [scale, setScale] = useState(PixelRatio.getFontScale());
  const read = async () => {
    const out: A11yFlags = {};
    for (const [k, q] of A11Y_QUERIES) {
      try { out[k] = await q(); } catch { out[k] = false; }
    }
    setFlags(out);
    setScale(PixelRatio.getFontScale());
  };
  useEffect(() => {
    read();
    const subs = A11Y_EVENTS.map(([k, ev]) =>
      AccessibilityInfo.addEventListener(ev as never, (v: boolean) => {
        setFlags(f => ({...f, [k]: v}));
        setChanges(n => n + 1);
      }));
    return () => subs.forEach(x => x.remove());
  }, []);
  const line = A11Y_QUERIES.map(([k]) => k + '=' + (flags[k] ?? '?')).join(' ') +
    ' fontScale=' + scale.toFixed(2) + ' changes=' + changes;
  return (
    <ScrollView contentContainerStyle={s.dialogList}>
      <Text style={s.lead}>
        The accessibility settings this app is told about. Changes arrive as
        they happen; Refresh asks again.
      </Text>
      <Text testID="a11yState" style={s.outcome}>{line}</Text>
      <Btn id="a11yRefresh" label="Refresh" onPress={read} />
      <Text testID="a11ySample" style={s.lead}>A line of body text, to see the size and weight change.</Text>
    </ScrollView>
  );
}

// ObstructionScreen is the control for an element that is in the hierarchy,
// marked visible, with real bounds, that a tap cannot reach because the app
// has drawn something else over it. Mobium refuses a target under a system
// dialog and under the keyboard; this is the kind it could not see, the app's
// own view.
//
// Each case is a target and a cover, the cover a later sibling so it draws on
// top. Every cover is itself pressable, so `obstructionOutcome` says which one
// really received the tap — the target, or the thing over it — and a tap that
// reports success while landing on the cover can be told from one that
// reached its target. The pass-through case is the negative control: covered
// to the eye and not to a finger, so refusing it would be wrong.
const TOAST_MS = 1500;

function ObstructionScreen() {
  const [taps, setTaps] = useState(0);
  const [outcome, setOutcome] = useState('nothing yet');
  const [toast, setToast] = useState(false);
  const hit = (what: string) => {
    setTaps(n => n + 1);
    setOutcome(what);
  };
  const showToast = () => {
    setToast(true);
    setTimeout(() => setToast(false), TOAST_MS);
  };
  const target = (id: string, label: string) => (
    <Pressable testID={id} accessibilityLabel={label} accessibilityRole="button"
      style={s.btn} onPress={() => hit('target ' + id)}>
      <Text style={s.btnText}>{label}</Text>
    </Pressable>
  );
  const cover = (id: string, label: string, style: object) => (
    <Pressable testID={id} accessibilityLabel={label} accessibilityRole="button"
      style={[s.obsCover, style]} onPress={() => hit('cover ' + id)}>
      <Text style={s.obsCoverText}>{label}</Text>
    </Pressable>
  );
  return (
    <ScrollView contentContainerStyle={s.dialogList}>
      <Text style={s.lead}>
        Each button has something drawn over it. The line says which one a tap
        really reached.
      </Text>
      <Text testID="obstructionOutcome" style={s.outcome}>{taps}: {outcome}</Text>

      <Text style={s.label}>Fully covered</Text>
      <View style={s.obsCase}>
        {target('fullTarget', 'Fully covered')}
        {cover('fullCover', 'full cover', s.obsFull)}
      </View>

      <Text style={s.label}>Center covered</Text>
      <View style={s.obsCase}>
        {target('halfTarget', 'Center covered')}
        {cover('halfCover', 'half cover', s.obsHalf)}
      </View>

      <Text style={s.label}>Edge covered, center clear</Text>
      <View style={s.obsCase}>
        {target('edgeTarget', 'Edge covered')}
        {cover('edgeCover', 'edge cover', s.obsEdge)}
      </View>

      <Text style={s.label}>Covered by a view that takes no touches</Text>
      <View style={s.obsCase}>
        {target('passTarget', 'Pass-through')}
        <View testID="passCover" accessible accessibilityLabel="pass-through cover"
          pointerEvents="none" style={[s.obsCover, s.obsFull]}>
          <Text style={s.obsCoverText}>pass-through cover</Text>
        </View>
      </View>

      <Text style={s.label}>Covered by a plain view</Text>
      <View style={s.obsCase}>
        {target('plainTarget', 'Under a plain view')}
        <View testID="plainCover" accessible accessibilityLabel="plain cover"
          style={[s.obsCover, s.obsFull]}>
          <Text style={s.obsCoverText}>plain cover</Text>
        </View>
      </View>
      <Text style={s.note}>
        A view with no touch handler of its own: it reports nothing when tapped,
        and the button under it gets nothing either — so a tap here should leave
        the line above unchanged.
      </Text>

      <Text style={s.label}>Under an overlay hidden from accessibility</Text>
      <View style={s.obsCase}>
        {target('hiddenTarget', 'Under a hidden overlay')}
        <Pressable accessible={false} importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden style={[s.obsCover, s.obsFull]}
          onPress={() => hit('cover hidden overlay')}>
          <Text style={s.obsCoverText}>hidden overlay</Text>
        </Pressable>
      </View>

      <Text style={s.label}>Under a translucent scrim</Text>
      <View style={s.obsCase}>
        {target('scrimTarget', 'Under a scrim')}
        {cover('scrimCover', 'scrim', s.obsScrim)}
      </View>

      <Text style={s.label}>Covered for a moment</Text>
      <Btn id="toastBtn" label="Show a toast" onPress={showToast} />
      <View style={s.obsCase}>
        {target('toastTarget', 'Under a toast')}
        {toast ? cover('toastCover', 'toast', s.obsFull) : null}
      </View>
      <Text style={s.note}>
        The toast covers the button below it for {TOAST_MS / 1000} seconds and
        takes touches while it is up.
      </Text>
    </ScrollView>
  );
}

function DraftField({testID, label}: {testID: string; label: string}) {
  const [text, setText] = useState('');
  return (
    <TextInput
      testID={testID}
      accessibilityLabel={label}
      placeholder={label}
      autoCapitalize="none"
      style={s.input}
      value={text}
      onChangeText={setText}
    />
  );
}

// PopupScreen is an interruption, and what the app has left afterwards.
//
// The popup itself is the easy half and not the interesting one. It is a real
// system permission dialog — a different window, owned by the OS, not an
// in-app modal — so an automation tool has to find and answer something that
// is not part of the app's own hierarchy.
//
// The half worth testing is what survives it. **Both fields below look
// identical after the dialog clears, and only one still holds what was typed
// into it**: `keptDraft` lives in this component's state, and `lostDraft`
// lives inside a child that is remounted when the permission resolves. A
// screenshot cannot tell them apart. Neither can a check that only asserts the
// screen came back.
//
// The second field is a deliberate model of a real failure rather than an
// organic bug — on Android the same symptom comes from the activity being
// recreated, which is what the "don't keep activities" developer option
// forces. Having it here is the point: a check that only ever sees state
// survive cannot tell you it would notice state vanishing.
function PopupScreen() {
  const [keptDraft, setKeptDraft] = useState('');
  const [rebuilds, setRebuilds] = useState(0);
  const [status, setStatus] = useState('not asked');

  const interrupt = async () => {
    try {
      const res = await Location.requestForegroundPermissionsAsync();
      setStatus(res.status);
    } catch (e) {
      setStatus('error: ' + String(e));
    }
    // The interruption is over; the screen rebuilds what it was holding
    // loosely, and keeps what it was holding properly.
    setRebuilds(n => n + 1);
  };

  return (
    <View>
      <Text style={s.h1}>Popup</Text>
      <Text style={s.lead}>
        What does an app keep when a system dialog interrupts it? Type something
        into both fields, then ask for location. After the dialog, the first
        field still holds your text; the second is rebuilt empty — the way an
        app loses a half-written form when it is interrupted.
      </Text>

      <Text style={s.label}>Kept draft — survives the interruption</Text>
      <TextInput
        testID="keptDraft"
        accessibilityLabel="kept draft"
        placeholder="kept draft"
        autoCapitalize="none"
        style={s.input}
        value={keptDraft}
        onChangeText={setKeptDraft}
      />
      <Text style={s.label}>Lost draft — rebuilt empty afterwards</Text>
      <DraftField key={rebuilds} testID="lostDraft" label="lost draft" />

      <Btn id="askPermission" label="Ask for location" onPress={interrupt} />

      <Text testID="permissionStatus" style={s.note}>permission: {status}</Text>
      <Text testID="rebuildCount" style={s.note}>rebuilds: {rebuilds}</Text>
    </View>
  );
}

// LoginScreen is a login form built the way a real one is, because the
// checks that drive it are about what real forms do to automation.
//
// Each field is validated when it is left and when the form is submitted, and
// then again as it is edited, so a message never lags the text. Each says
// either what is wrong or that the field is fine — a notice for both
// outcomes, so a check can tell "valid" from "not yet judged".
//
// Sanitizing happens on submit, never on a keystroke. A field that rewrote
// its text as it was typed would make every read-back disagree with what was
// typed, and mobium's keyboard check types quotes, a space and a ü into the
// username on purpose. The username is trimmed, NFC-normalized and lowercased
// before it is judged; the password is never altered — trimming or
// normalizing one changes which password it is.
//
// Wrong credentials get one message for both fields, as a real form does, so
// the form does not say which half was right. The password is cleared from
// memory once the form is left.
//
// Signing in takes a moment on purpose — SIGN_IN_MS, with the button disabled
// and saying so — because a real one waits on a server, and a demo of
// automation should show the tool waiting for the app rather than sleeping.
// The demo account is on screen, in a hint for whoever picks the app up
// cold. That is the app saying it, not a leak: the rule mobium keeps is that
// what is typed into a password field is never printed, and the checks look
// at the field.
//
// The keyboard is not dismissed on submit: the form unmounts and takes it
// along. Keyboard.dismiss() did the same thing more slowly, and the
// dismissal swallowed the first tap on the welcome screen — every time,
// within half a second of it appearing, on an iPhone 17 Pro simulator.
//
// iOS offers to save the password after a successful login — "Save
// Password?", a system sheet over the app that swallows the next tap. Nothing
// the app sets prevents it: measured on an iPhone 17 Pro simulator, it came
// for every username not yet answered with textContentType "none",
// autoComplete "off", "oneTimeCode" on the password field, and with the field
// cleared and drawn empty before the form left the screen. Once answered for
// a username on a device, it does not come back for that one. It belongs to
// the system-dialog mechanism, not to this screen; the login check says
// when it has appeared rather than failing on the tap it swallowed.
// The fields still say they are not for the password manager, which is true.
//
// No test ID here contains another. mobium matches a hand-written testid= by
// substring, so `usernameError` next to `username` would make the field's own
// locator ambiguous; the notices are userError, userOk, passError, passOk.
const LOGIN_USER = 'mobium';
const LOGIN_PASS = 'hunter2';
const USERNAME_CHARS = /^[a-z0-9._-]+$/;
const USERNAME_MAX = 32;
const PASSWORD_MAX = 64;
const SIGN_IN_MS = 1000;

// The OTP Demo: a one-time code, the way a second factor asks for one. What
// automation finds hard about it is the field — six single-digit boxes that
// move focus on every digit and back on delete, where a tool that types the
// whole code into the first box, or loses a keystroke while focus moves, gets
// it wrong — and where the code comes from. The code is random and arrives as
// a local notification, which a check reads from the shade, or on screen, for
// a platform where the shade cannot be read. It expires, can be resent after
// a cooldown, and three wrong codes lock the form. `otpEntered` shows exactly
// what the boxes hold, so a dropped keystroke is seen rather than inferred.
const OTP_LEN = 6;
const OTP_TTL_S = 60;
const OTP_RESEND_S = 20;
const OTP_ATTEMPTS = 3;

// A notification posted while the app is in front is shown only if the app
// says so; without a handler it is dropped, and the code would never reach
// the shade.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false,
  }),
});

function OtpScreen() {
  const [code, setCode] = useState('');
  const [used, setUsed] = useState(false);
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [boxes, setBoxes] = useState<string[]>(Array(OTP_LEN).fill(''));
  const [single, setSingle] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [outcome, setOutcome] = useState('no code sent');
  const [showCode, setShowCode] = useState(false);
  const refs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const age = sentAt ? Math.floor((now - sentAt) / 1000) : 0;
  const expiresIn = sentAt ? Math.max(0, OTP_TTL_S - age) : 0;
  const resendIn = sentAt ? Math.max(0, OTP_RESEND_S - age) : 0;
  const locked = attempts >= OTP_ATTEMPTS;

  const send = async () => {
    const c = String(Math.floor(Math.random() * 1e6)).padStart(OTP_LEN, '0');
    const t = Date.now();
    setCode(c); setUsed(false); setSentAt(t); setNow(t); setAttempts(0);
    setBoxes(Array(OTP_LEN).fill('')); setSingle('');
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) {
      setOutcome('sent; notifications are off, so switch on the code below');
      return;
    }
    await Notifications.scheduleNotificationAsync({
      content: {title: 'MobiumApp', body: `Your MobiumApp code is ${c}`},
      trigger: null,
    });
    setOutcome('sent as a notification');
  };

  const verify = (entered: string) => {
    if (!code) return setOutcome('no code sent');
    if (used) return setOutcome('already used: send a new code');
    if (locked) return setOutcome('locked: too many attempts');
    if (expiresIn === 0) return setOutcome('expired: send a new code');
    if (entered.length !== OTP_LEN) return setOutcome(`incomplete: ${entered.length} of ${OTP_LEN} digits`);
    if (entered === code) {
      setUsed(true);
      return setOutcome('verified');
    }
    const n = attempts + 1;
    setAttempts(n);
    setOutcome(n >= OTP_ATTEMPTS ? 'locked: too many attempts'
      : `wrong code, ${OTP_ATTEMPTS - n} ${OTP_ATTEMPTS - n === 1 ? 'attempt' : 'attempts'} left`);
  };

  // A digit moves focus on; more than one — a paste, or the platform filling
  // in a code — is spread across the boxes from this one.
  const onBox = (i: number, text: string) => {
    const digits = text.replace(/\D/g, '');
    const next = [...boxes];
    if (digits.length > 1) {
      for (let k = 0; k < digits.length && i + k < OTP_LEN; k++) next[i + k] = digits[k];
      setBoxes(next);
      refs.current[Math.min(OTP_LEN - 1, i + digits.length)]?.focus();
      return;
    }
    next[i] = digits;
    setBoxes(next);
    if (digits && i < OTP_LEN - 1) refs.current[i + 1]?.focus();
  };
  // Delete in an empty box goes back and clears the one before.
  const onKey = (i: number, key: string) => {
    if (key !== 'Backspace' || boxes[i] || i === 0) return;
    const next = [...boxes];
    next[i - 1] = '';
    setBoxes(next);
    refs.current[i - 1]?.focus();
  };

  const sendLabel = !code ? 'Send code' : resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code';

  return (
    <View>
      <Text style={s.h1}>One-time code</Text>
      <Text style={s.lead}>
        A code after the password, as a second factor asks for one. The six boxes move focus on
        every digit and back on delete: typing the whole code into the first box, or losing a
        keystroke while focus moves, gets it wrong, and "entered" shows exactly what they hold. The
        code arrives as a notification, or here with the switch. It expires in {OTP_TTL_S} seconds,
        can be resent after {OTP_RESEND_S}, and {OTP_ATTEMPTS} wrong codes lock the form.
      </Text>

      <Btn id="otpSend" label={sendLabel} onPress={send} disabled={!!code && resendIn > 0} />
      <View style={s.row}>
        <Switch testID="otpShowCode" accessibilityLabel="Show the code here"
          value={showCode} onValueChange={setShowCode} />
        <Text style={s.rowText}>  Show the code here</Text>
      </View>
      {showCode && code ? <Text testID="otpCodeShown" style={s.mono}>code: {code}</Text> : null}
      <Text testID="otpExpires" style={s.note}>
        {!code ? 'no code' : used ? 'used' : expiresIn > 0 ? `expires in ${expiresIn}s` : 'expired'}
      </Text>
      {/* Near the top, so the answer stays on screen while the keyboard is up. */}
      <Text testID="otpOutcome" accessibilityRole="alert" style={s.outcome}>{outcome}</Text>

      <Text style={s.label}>Six boxes</Text>
      <View style={s.otpRow}>
        {boxes.map((b, i) => (
          <TextInput key={i} ref={r => { refs.current[i] = r; }}
            testID={`otpBox${i}`} accessibilityLabel={`digit ${i + 1}`}
            style={s.otpBox} value={b} keyboardType="number-pad"
            autoComplete="off" textContentType="none" autoCorrect={false}
            onChangeText={t => onBox(i, t)}
            onKeyPress={e => onKey(i, e.nativeEvent.key)} />
        ))}
      </View>
      <Text testID="otpEntered" style={s.mono}>entered: {boxes.map(b => b || '_').join('')}</Text>
      <Btn id="otpVerifyBoxes" label="Verify the boxes" onPress={() => verify(boxes.join(''))} />

      <Text style={s.label}>One field</Text>
      <TextInput testID="otpField" accessibilityLabel="one-time code" placeholder="6-digit code"
        style={s.input} value={single} maxLength={OTP_LEN} keyboardType="number-pad"
        textContentType="oneTimeCode" autoComplete="sms-otp"
        onChangeText={t => setSingle(t.replace(/\D/g, ''))} />
      <Btn id="otpVerifyField" label="Verify the field" onPress={() => verify(single)} />

    </View>
  );
}

function sanitizeUsername(raw: string): string {
  return raw.normalize('NFC').trim().toLowerCase();
}

function usernameProblem(raw: string): string | null {
  const u = sanitizeUsername(raw);
  if (u === '') return 'Enter your username.';
  if (u.length < 3) return 'Username must be at least 3 characters.';
  if (!USERNAME_CHARS.test(u)) {
    return 'Username can contain only letters, numbers, dots (.), dashes (-) and underscores (_).';
  }
  return null;
}

function passwordProblem(raw: string): string | null {
  if (raw === '') return 'Enter your password.';
  if ([...raw].length < 6) return 'Password must be at least 6 characters.';
  return null;
}

// FieldNotice is the line under a field: an error, a confirmation, or nothing
// while the field has not been judged yet.
function FieldNotice({id, problem, ok, shown}: {id: string; problem: string | null; ok: string; shown: boolean}) {
  if (!shown) return null;
  return problem
    ? <Text testID={id + 'Error'} accessibilityLiveRegion="polite" style={s.err}>{problem}</Text>
    : <Text testID={id + 'Ok'} accessibilityLiveRegion="polite" style={s.ok}>✓ {ok}</Text>;
}

function LoginScreen({onLogin}: {onLogin: (username: string) => void}) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [touched, setTouched] = useState({user: false, pass: false});
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);
  const passRef = useRef<TextInput>(null);

  const userProblem = usernameProblem(user);
  const passProblem = passwordProblem(pass);

  const submit = () => {
    if (busy) return;
    setTouched({user: true, pass: true});
    setFormErr('');
    if (userProblem || passProblem) return;
    const u = sanitizeUsername(user);
    const ok = u === LOGIN_USER && pass === LOGIN_PASS;
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      if (ok) {
        setPass('');
        onLogin(u);
        return;
      }
      setFormErr('Incorrect username or password.');
      AccessibilityInfo.announceForAccessibility('Incorrect username or password.');
    }, SIGN_IN_MS);
  };

  return (
    <View>
      <Text style={s.h1}>Log in</Text>
      <Text style={s.lead}>Sign in to continue.</Text>

      <View testID="loginHint" style={s.hint}>
        <Text style={s.hintTitle}>Demo account</Text>
        <Text style={s.hintText}>Username: {LOGIN_USER}</Text>
        <Text style={s.hintText}>Password: {LOGIN_PASS}</Text>
        <Text style={s.hintNote}>
          Try a wrong password, a short one, or a username with a space to see
          each error. Spaces around the username and capitals are ignored.
        </Text>
      </View>

      <Text style={s.label}>Username</Text>
      <TextInput testID="username" accessibilityLabel="username" placeholder="username"
        style={[s.input, touched.user && userProblem ? s.inputBad : null]}
        autoCapitalize="none" autoCorrect={false} spellCheck={false}
        autoComplete="off" textContentType="none" maxLength={USERNAME_MAX}
        returnKeyType="next" submitBehavior="submit"
        onSubmitEditing={() => passRef.current?.focus()}
        value={user}
        onChangeText={t => { setUser(t); setFormErr(''); }}
        onBlur={() => setTouched(v => ({...v, user: true}))} />
      <FieldNotice id="user" problem={userProblem} ok="Username looks good." shown={touched.user} />

      <Text style={s.label}>Password</Text>
      <TextInput ref={passRef} testID="password" accessibilityLabel="password" placeholder="password"
        style={[s.input, touched.pass && passProblem ? s.inputBad : null]}
        secureTextEntry autoCapitalize="none" autoCorrect={false} spellCheck={false}
        autoComplete="off" textContentType="none" maxLength={PASSWORD_MAX}
        returnKeyType="go" onSubmitEditing={submit}
        value={pass}
        onChangeText={t => { setPass(t); setFormErr(''); }}
        onBlur={() => setTouched(v => ({...v, pass: true}))} />
      <FieldNotice id="pass" problem={passProblem} ok="Password meets the requirements." shown={touched.pass} />

      {formErr ? <Text testID="loginError" accessibilityRole="alert" style={s.err}>{formErr}</Text> : null}
      <Btn id="loginBtn" label={busy ? 'Signing in…' : 'Log In'} onPress={submit} disabled={busy} />
    </View>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [loggedInAs, setLoggedInAs] = useState('');
  // The app's own dark mode, set from the Form screen's switch. It themes
  // every screen of the app; a WebView's page follows prefers-color-scheme,
  // not this, and keeps its own colors.
  const [dark, setDark] = useState(false);
  s = (dark ? darkStyles : lightStyles) as typeof lightStyles;

  // Where Back goes from each screen: the hub it was chosen from, or home.
  const parent: Screen = IN_GESTURES.has(screen) ? 'gesturehub' : IN_WEBVIEWS.has(screen) ? 'webviewhub' : 'home';
  const back = (
    <Btn id="backBtn" label="Back" onPress={() => setScreen(parent)} />
  );

  // Android's back — the key, or the edge swipe in gesture navigation — goes
  // where the Back button goes. Unhandled, it reached the activity, which
  // finished: every back from a demo closed the app and reopened it at home.
  // On home it is left to the system, which closes the app as Android does.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'home') return false;
      setScreen(parent);
      return true;
    });
    return () => sub.remove();
  }, [screen, parent]);

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      {screen === 'home' && (
        <ScrollView testID="homeList" contentContainerStyle={s.pad}>
          <View style={s.brand}>
            <Image
              testID="mobiumLogo"
              accessibilityLabel="Mobium"
              source={require('./assets/mobium-mark.png')}
              style={s.mark}
            />
            <Text testID="title" style={s.h1}>MobiumApp</Text>
          </View>
          {SCREENS.map(([k, label]) => (
            <Btn key={k} id={k + 'Btn'} label={label} onPress={() => setScreen(k)} />
          ))}
        </ScrollView>
      )}

      {screen === 'webviewhub' && (
        <ScrollView testID="webviewList" contentContainerStyle={s.pad}>
          {back}
          <Text style={s.h1}>WebViews</Text>
          <Text style={s.lead}>
            Web pages shown inside the app. An automation tool reaches into each
            one as a context of its own, then reads and taps the page itself,
            not the pixels over it. Each case isolates one thing that goes wrong.
          </Text>
          {WEBVIEW_SCREENS.map(([k, label]) => (
            <Btn key={k} id={k + 'Btn'} label={label} onPress={() => setScreen(k)} />
          ))}
        </ScrollView>
      )}
      {IN_WEBVIEWS.has(screen) && (
        <View style={s.padTop}>
          {back}
          <Text style={s.lead}>{webviewLead(screen)}</Text>
        </View>
      )}
      {screen === 'webview' && <Web id="webview" html={PLAIN} />}
      {screen === 'wide' && <Web id="wideWebview" html={WIDE} />}
      {screen === 'dual' && (
        <>
          <Web id="webviewTop" html={PLAIN} />
          <Web id="webviewBottom" html={SECOND} />
        </>
      )}
      {/* Every origin, for this page only: on iOS react-native-webview refuses
          any navigation whose origin is not on its list — http and https by
          default — and a srcdoc frame (about:srcdoc) and a data: frame are
          neither, so both rendered empty on an iPhone 17 Pro simulator while
          Android, which does not apply the list to frames, drew them. */}
      {screen === 'frames' && <Web id="framesWebview" html={FRAMES} origins={['*']} />}
      {screen === 'webstorage' && <Web id="storageWebview" html={WEB_STORAGE} baseUrl={WEB_STORAGE_BASE} />}
      {screen === 'actionable' && <Web id="actionWebview" html={ACTIONABLE} />}
      {screen === 'webform' && <Web id="formWebview" html={WEBFORM} />}

      {screen === 'login' && (
        // The form scrolls, and moves out of the keyboard's way on iOS, so Log
        // In is always reachable: without it the button sat under an
        // iPhone's keyboard and a tap on it landed on the keyboard instead.
        <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
            {back}
            <LoginScreen onLogin={u => { setLoggedInAs(u); setScreen('secret'); }} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {screen === 'rotate' && (
        <>
          <View style={s.pad}>{back}</View>
          <Web id="rotateWebview" html={ROTATE} />
        </>
      )}

      {screen === 'doubletap' && (
        <>
          <View style={s.pad}>{back}</View>
          <Web id="doubleTapWebview" html={DOUBLE_TAP} />
        </>
      )}

      {screen === 'motion' && (
        <>
          <View style={s.pad}>
            {back}
            <MotionScreen />
          </View>
          <Web id="motionWebview" html={MOTION_PAGE} />
        </>
      )}

      {screen === 'gesturehub' && (
        <ScrollView testID="gestureList" contentContainerStyle={s.pad}>
          {back}
          <Text style={s.h1}>Gestures</Text>
          {GESTURE_SCREENS.map(([k, label]) => (
            <Btn key={k} id={k + 'Btn'} label={label} onPress={() => setScreen(k)} />
          ))}
        </ScrollView>
      )}

      {screen === 'tappress' && (
        <View style={s.pad}>
          {back}
          <GestureScreen />
        </View>
      )}

      {screen === 'drag' && (
        <View style={s.pad}>
          {back}
          <Text style={s.h1}>Drag</Text>
          <DragTarget />
        </View>
      )}

      {screen === 'flick' && (
        <View style={[s.pad, {flex: 1}]}>
          {back}
          <FlickScreen />
        </View>
      )}

      {screen === 'pinch' && (
        <>
          <View style={s.pad}>{back}</View>
          <Web id="pinchWebview" html={PINCH} />
        </>
      )}

      {screen === 'multitouch' && (
        <View style={s.pad}>
          {back}
          <MultiTouchScreen />
        </View>
      )}

      {screen === 'form' && (
        <View style={s.pad}>
          {back}
          <FormScreen dark={dark} setDark={setDark} />
        </View>
      )}

      {screen === 'crash' && (
        <View style={s.pad}>
          {back}
          <CrashScreen />
        </View>
      )}

      {screen === 'layout' && (
        <View style={s.pad}>
          {back}
          <LayoutScreen />
        </View>
      )}

      {screen === 'otp' && (
        <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
          {back}
          <OtpScreen />
        </ScrollView>
      )}

      {screen === 'storage' && (
        <View style={s.pad}>
          {back}
          <StorageScreen />
        </View>
      )}

      {screen === 'files' && (
        <ScrollView contentContainerStyle={s.pad}>
          {back}
          <FilesScreen />
        </ScrollView>
      )}

      {screen === 'biometrics' && (
        <ScrollView contentContainerStyle={s.pad}>
          {back}
          <BiometricsScreen />
        </ScrollView>
      )}

      {screen === 'battery' && (
        <ScrollView contentContainerStyle={s.pad}>
          {back}
          <BatteryScreen />
        </ScrollView>
      )}

      {screen === 'dialogs' && (
        <View style={s.fill}>
          <View style={s.padTop}>{back}</View>
          <DialogScreen />
        </View>
      )}

      {screen === 'a11y' && (
        <View style={s.fill}>
          <View style={s.padTop}>{back}</View>
          <A11yScreen />
        </View>
      )}

      {screen === 'obstruction' && (
        <View style={s.fill}>
          <View style={s.padTop}>{back}</View>
          <ObstructionScreen />
        </View>
      )}


      {screen === 'popup' && (
        <View style={s.pad}>
          {back}
          <PopupScreen />
        </View>
      )}

      {screen === 'slider' && (
        <View style={s.pad}>
          {back}
          <SliderScreen />
        </View>
      )}

      {screen === 'busy' && (
        <View style={s.pad}>
          {back}
          <BusyScreen />
        </View>
      )}

      {screen === 'feed' && (
        <View style={[s.pad, s.fill]}>
          {back}
          <FeedScreen />
        </View>
      )}

      {screen === 'pager' && (
        <View style={s.pad}>
          {back}
          <PagerScreen />
        </View>
      )}

      {screen === 'location' && (
        <View style={s.pad}>
          {back}
          <LocationScreen />
        </View>
      )}

      {screen === 'secret' && (
        <View style={s.pad}>
          {back}
          <Text testID="welcomeText" style={s.h1}>Welcome, {loggedInAs}!</Text>
          <Text testID="secretText" style={s.lead}>You are logged in.</Text>
          <Btn id="logoutBtn" label="Log Out" onPress={() => { setLoggedInAs(''); setScreen('login'); }} />
        </View>
      )}
    </SafeAreaView>
  );
}

const lightStyles = StyleSheet.create({
  // React Native's own SafeAreaView is iOS-only -- on Android it renders as a
  // plain View, so the header sat under the status bar. Pad it manually
  // rather than take on react-native-safe-area-context, which would be a
  // native dependency and another prebuild for one number.
  root: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
  },
  pad: {padding: 16},
  fill: {flex: 1},
  confetti: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0},
  padTop: {paddingHorizontal: 16, paddingTop: 16},
  dialogList: {padding: 16},
  pinned: {paddingHorizontal: 16, paddingBottom: 16},
  outcome: {fontSize: 16, fontWeight: '600', color: ui.ink, marginBottom: 16},
  h1: {fontSize: 22, fontWeight: '600', marginBottom: 16, color: ui.ink},
  brand: {alignItems: 'center', marginBottom: 8},
  mark: {width: 96, height: 96, marginBottom: 8, resizeMode: 'contain'},
  btn: {backgroundColor: ui.accent, padding: 14, borderRadius: 8, marginBottom: 10},
  btnBusy: {opacity: 0.6},
  btnText: {color: '#fff', fontSize: 16, textAlign: 'center'},
  input: {borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 12, marginBottom: 10, fontSize: 16},
  err: {color: '#b00', marginBottom: 10},
  ok: {color: '#1a7f37', marginBottom: 10},
  hint: {backgroundColor: '#eef1ff', borderRadius: 8, padding: 12, marginBottom: 16},
  hintTitle: {fontSize: 14, fontWeight: '600', color: ui.ink, marginBottom: 4},
  hintText: {fontSize: 14, color: ui.ink, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'},
  hintNote: {fontSize: 13, color: '#444', marginTop: 6},
  lead: {fontSize: 15, color: '#333', marginBottom: 16, lineHeight: 21},
  label: {fontSize: 14, fontWeight: '600', color: ui.ink, marginBottom: 4},
  inputBad: {borderColor: '#b00'},
  mono: {fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 18, marginBottom: 8},
  batteryRow: {flexDirection: 'row', alignItems: 'center', marginVertical: 24, alignSelf: 'center'},
  batteryBody: {width: 260, height: 120, borderWidth: 6, borderColor: ui.ink, borderRadius: 18, padding: 6,
    justifyContent: 'center', overflow: 'hidden'},
  batteryFill: {position: 'absolute', left: 6, top: 6, bottom: 6, borderRadius: 10},
  batteryText: {fontSize: 44, fontWeight: '700', textAlign: 'center', color: ui.ink},
  batteryNone: {fontSize: 26, fontWeight: '600', textAlign: 'center', color: ui.ink},
  batteryCap: {width: 14, height: 44, marginLeft: 4, borderTopRightRadius: 6, borderBottomRightRadius: 6,
    backgroundColor: ui.ink},
  target: {
    height: 160,
    borderRadius: 10,
    backgroundColor: ui.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  targetText: {color: '#fff', fontSize: 18, fontWeight: '600'},
  dragSrc: {
    height: 120,
    borderRadius: 10,
    backgroundColor: '#b4443a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  dragDst: {
    height: 120,
    borderRadius: 10,
    backgroundColor: '#3a5cb4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  row: {flexDirection: 'row', alignItems: 'center', marginBottom: 10},
  otpRow: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8},
  otpBox: {width: 46, height: 54, borderWidth: 1, borderColor: '#bbb', borderRadius: 8, textAlign: 'center', fontSize: 22},
  box: {fontSize: 22, marginRight: 10},
  rowText: {fontSize: 16, flexShrink: 1},
  group: {marginVertical: 8},
  pagerRow: {paddingVertical: 8},
  card: {
    width: 260,
    height: 160,
    marginRight: 12,
    borderRadius: 10,
    backgroundColor: ui.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {color: '#fff', fontSize: 20, fontWeight: '600'},
  feedRow: {height: 64, marginBottom: 8, borderRadius: 10, backgroundColor: ui.accent, alignItems: 'center', justifyContent: 'center'},
  note: {marginTop: 12, color: '#555'},
  web: {flex: 1},
  motionPanel: {marginTop: 4},
  flickList: {flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, marginTop: 8},
  flickRow: {paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: '#eee', fontSize: 16},
  multiPad: {marginTop: 8},
  multiRow: {flexDirection: 'row', marginBottom: 10},
  multiZone: {flex: 1, height: 140, borderRadius: 10, alignItems: 'center', justifyContent: 'center'},
  holdZone: {backgroundColor: '#b4443a', marginRight: 10},
  actZone: {backgroundColor: '#3a5cb4'},
  dragEndZone: {height: 100, borderRadius: 10, backgroundColor: '#6a3ab4', alignItems: 'center', justifyContent: 'center', marginBottom: 10},
  tapZone: {height: 140, borderRadius: 10, backgroundColor: '#2f7d4f', alignItems: 'center', justifyContent: 'center'},
  motionTarget: {width: '55%', backgroundColor: '#2f7d4f', padding: 14, borderRadius: 8},
  obsCase: {position: 'relative'},
  obsCover: {position: 'absolute', top: 0, bottom: 10, justifyContent: 'center', alignItems: 'center', borderRadius: 8},
  obsCoverText: {color: '#fff', fontSize: 13},
  obsFull: {left: 0, right: 0, backgroundColor: '#5832FA'},
  obsHalf: {left: 0, width: '60%', backgroundColor: '#5832FA'},
  obsEdge: {left: 0, width: '25%', backgroundColor: '#5832FA'},
  obsScrim: {left: 0, right: 0, backgroundColor: 'rgba(20, 24, 38, 0.55)'},
});
// The dark theme is the light one with its colors replaced, so no style can
// exist in one and be missing from the other. `s` is what every component
// reads while it renders, and App points it at one or the other before
// rendering: a theme swap re-renders the tree in place, so each screen keeps
// its state — the Form screen's own switch included — where remounting with a
// theme key would reset it.
const DARK = {bg: ground.dark, text: '#E6E8F0', muted: '#A8AEC0', line: '#3A4058'};
const darkStyles = StyleSheet.create({
  ...lightStyles,
  root: {...lightStyles.root, backgroundColor: DARK.bg},
  outcome: {...lightStyles.outcome, color: DARK.text},
  h1: {...lightStyles.h1, color: DARK.text},
  batteryBody: {...lightStyles.batteryBody, borderColor: DARK.text},
  batteryText: {...lightStyles.batteryText, color: DARK.text},
  batteryNone: {...lightStyles.batteryNone, color: DARK.text},
  batteryCap: {...lightStyles.batteryCap, backgroundColor: DARK.text},
  input: {...lightStyles.input, borderColor: DARK.line, color: DARK.text},
  otpBox: {...lightStyles.otpBox, borderColor: DARK.line, color: DARK.text},
  err: {...lightStyles.err, color: '#FF7B7B'},
  ok: {...lightStyles.ok, color: '#4ADE80'},
  hint: {...lightStyles.hint, backgroundColor: '#1F2540'},
  hintTitle: {...lightStyles.hintTitle, color: DARK.text},
  hintText: {...lightStyles.hintText, color: DARK.text},
  hintNote: {...lightStyles.hintNote, color: DARK.muted},
  lead: {...lightStyles.lead, color: '#C9CDD8'},
  label: {...lightStyles.label, color: DARK.text},
  note: {...lightStyles.note, color: DARK.muted},
  mono: {...lightStyles.mono, color: DARK.text},
  box: {...lightStyles.box, color: DARK.text},
  rowText: {...lightStyles.rowText, color: DARK.text},
  flickList: {...lightStyles.flickList, borderColor: DARK.line},
  flickRow: {...lightStyles.flickRow, borderColor: '#262B3D', color: DARK.text},
});
let s = lightStyles;

