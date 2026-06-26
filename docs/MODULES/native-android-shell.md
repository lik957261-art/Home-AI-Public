# Module: Native Android Shell

## Purpose

The Home AI Android shell exists to provide Android system integration that the
browser-installed PWA cannot reliably provide. The Web/PWA client remains the
source of truth for product UI, workspace policy, plugin routing, Gateway/MCP
use, and server APIs.

This is a separate platform target from the existing iOS Xcode shell. The iOS
shell workspace is `/Users/example/path AI` and is documented in
`docs/MODULES/native-ios-shell.md`; it cannot implement Android system
Back/Predictive Back behavior.

The current native Android shell workspace is
`/Users/example/path`. It is a Java/WebView Gradle
project with package id `app.homeai.android`. Do not route Android
launcher-exit fixes to the Xcode/iOS workspace.

The Android shell loads the Home AI Web/PWA client in a native WebView. It
normalizes the configured server URL to `/`, appends `source=pwa` and
`nativeShell=android`, and injects bounded startup state after navigation:
`homeAI.nativeShell=android`, `data-native-shell=android`,
`native-shell-android`, preserved Web preferences, and Home AI layout pulse
hooks analogous to the iOS WebView shell. Same-host navigation remains inside
the WebView; external HTTP/HTTPS hosts open through Android system intent
handling. The launcher icon is derived from the iOS native shell
`AppIcon-1024.png`.

The shell must keep native window and Android navigation-bar backgrounds opaque
and dark, and fit WebView content inside system windows. Rendering WebView
content behind a transparent Android system navigation area can expose a white
native strip and shift bottom composer hit testing, including the input-adjacent
add button.

The status bar and navigation bar must be handled separately. On the reported
Onyx physical device, framebuffer screenshots could look readable while the
physical e-ink display still hid status icons such as signal and volume. As of
Android shell v0.4.13, the app targets SDK 34 and uses a dark status bar with
light system icons to match Android system Dark mode on the reported device.
The bottom navigation bar may still follow the Home AI theme. The Activity must use
adjust-resize IME behavior so keyboard/Composer activation resizes the WebView
instead of panning content into the status bar.

Android WebView file uploads must be bridged by the native shell. A real
`input[type=file]` can correctly receive the Composer add-button touch in the
Web layer and still do nothing in the Android shell unless
`WebChromeClient.onShowFileChooser` forwards the request to the Android system
file picker and returns the selected URI array to WebView.

The shell supports user-confirmed APK updates. It reads a JSON manifest from
the configured `homeAiUpdateManifestUrl` build property /
`HOMEAI_ANDROID_UPDATE_MANIFEST_URL` environment variable, or defaults to
`<Home AI origin>/android-update.json`. Public APK and manifest delivery must
go through the Home AI HTTPS mapping, currently
`https://wardrobe-xuxin.synology.me:8555/android/android-update.json`, because
only the Home AI mapped port is externally reachable. If the manifest
`versionCode` is newer, the shell prompts the user, downloads the APK, verifies
SHA-256, and opens the Android system installer through a `FileProvider`.
Ordinary sideload apps must not claim silent update support; Android requires
user confirmation unless the app has device-owner or system installer
privileges.

Android APK release completion is defined centrally in
`docs/PLATFORM_CONTRACTS/macos-dev-to-production-deployment-contract.md`.
For this module, a release is not complete until the built APK and
`dist/android-update.json` are both published to the Home AI public `/android/`
directory behind `https://wardrobe-xuxin.synology.me:8555/android/`, then
HTTPS-read back. Each APK version bump must update the public manifest
`versionCode`, `versionName`, `size`, `sha256`, and APK file/URL. If the online
manifest still reports the previous `versionCode`, installed shells will not
prompt for an upgrade even when the Android workspace has a newer local APK.

The Android shell also provides the same native settings gesture as the iOS
shell: a two-finger long press for one second opens the native Home AI settings
dialog. The dialog can check APK updates, reload the WebView, or clear WebView
local data.

The Android shell may persist the Home AI Web access key only in the native
encrypted state store backed by Android Keystore. On launch, if a stored access
key exists, the shell must gate automatic injection through Android biometric or
device credential UI where available, then restore the key into the Home AI Web
localStorage/cookie for the configured origin. Theme, font, workspace, and view
mode preferences may be mirrored into non-secret native preferences so APK
updates and origin migrations do not reset the user's Web settings. Plugin
credentials, Gateway profile credentials, provider secrets, and plugin launch
tokens remain out of scope for native persistence.

## Back / Predictive Back Contract

Android root and primary Home AI pages must not exit to the launcher through a
left-edge or system Back gesture. A production Android build must implement this
in the native shell with Android Back/Predictive Back callbacks, not with
browser `history.pushState` alone.

Required behavior:

- On Home AI root primary pages, native Back is consumed by the shell. The
  WebView must not reload the Home AI workspace, navigate to a different Home
  AI route, or exit to the Android launcher.
- On plugin primary pages, the Web layer must be allowed to run its existing
  host-return contract. A plugin first-level page returns to the Home AI host;
  it is not treated as a root-page launcher-exit bounce.
- The shell may show a small native edge-back rebound indicator or rely on the
  platform predictive-back cancellation animation.
- On secondary pages, plugin iframe history, document preview, topic detail,
  directory drill-down, and other Home AI secondary surfaces may receive a
  bounded native-to-Web back message so the existing Web `backSwipeTarget()`
  contract can run.
- Active in-app artifact/file preview overlays are secondary Back targets. The
  Web bridge should return `artifact-preview`, and native Back should close the
  active preview through `TaskDocumentPreviewUi.closeActivePreviewFromUser()`
  instead of primary-bouncing at the host root.
- If the Web layer reports that no secondary back target exists, the shell must
  consume the Back event on primary pages instead of calling Activity finish.

The browser/PWA `history.pushState` guard remains a best-effort fallback for
Chrome-installed PWA sessions. It is not final acceptance evidence for Android
launcher-exit prevention.

## Bridge Shape

The shell should expose only bounded capability messages:

- `HomeAINativeBack.query`: ask the Web layer whether a secondary back target
  is active.
- `HomeAINativeBack.perform`: request the Web layer to run the existing
  secondary back handler.
- `HomeAINativeBack.primaryBounce`: optional Web-visible notification for a
  consumed primary Back gesture.

The Web client also exposes the same object at `HomeAI.nativeBack` for a stable
namespace. The native shell must consume Back if this bridge is missing,
unavailable, or reports no secondary target.

The shell must not store plugin long-lived credentials, plugin launch tokens,
Gateway profile credentials, APNs/FCM provider secrets, or unencrypted access
keys.

## Validation

Real-device validation is required. Browser-mode Chrome and desktop viewport
tests cannot prove this contract.

Minimum Android acceptance:

- cold-launch Home AI from the Android launcher;
- verify current client version and authenticated workspace;
- on Topics, Chat, Inbox, and one plugin primary page, perform repeated system
  Back / edge-back gestures and confirm the app does not exit or reload;
- on one secondary surface, perform Back and confirm it returns one level
  inward without finishing the Activity;
- capture video or frame evidence for the root-page rebound/no-reload behavior.

Current source checks:

- Main app Web bridge: `node tests/music-plugin-back-swipe-harness.test.js`
- Android shell contract: `node scripts/android-shell-contract-check.js` from
  `/Users/example/path`
- Android debug build: `source scripts/android-env.sh && gradle --no-daemon assembleDebug`
- Android debug APK:
  `/Users/example/path`
- Current source public debug APK version: `0.4.16`, `versionCode=20`
- Current public debug APK SHA-256:
  `9f23019528cac42c04a48775d51071d6694145235eef33a07ef96c2b91409341`
- Android update manifest:
  `https://wardrobe-xuxin.synology.me:8555/android/android-update.json` through
  the Home AI HTTPS mapping
- Real-device Back smoke:
  `ANDROID_SERIAL=<serial> HOMEAI_ANDROID_URL=http://<host>:8797 scripts/android-device-back-smoke.sh`
  from `/Users/example/path`

Real-device smoke performed on 2026-06-21 against device `e0cd9d2b`:

- installed `app.homeai.android` debug build;
- enabled the package after the Onyx launcher had disabled it;
- launched `app.homeai.android/.MainActivity`;
- sent five system Back key events and three left-edge swipe events;
- verified the resumed Activity stayed `app.homeai.android/.MainActivity`;
- repeated this path with `scripts/android-device-back-smoke.sh`;
- screenshot evidence was captured at `/tmp/homeai-android-shell-back-smoke.png`.

Authenticated production secondary-page validation was also performed on
2026-06-21 against device `e0cd9d2b` after the static client was deployed as
`20260621-native-back-bridge-v895`:

- loaded production `http://192.168.10.110:8797/` in the Android shell;
- authenticated with the owner access key without printing the key;
- confirmed through WebView DevTools that `window.HERMES_STATIC_VERSION` was
  `20260621-native-back-bridge-v895` and `HomeAINativeBack` was present;
- opened a real topic detail page where `HomeAINativeBack.query()` returned a
  secondary target;
- sent one Android system Back event;
- confirmed the Web layer returned to the root Topics surface and the resumed
  Activity stayed `app.homeai.android/.MainActivity`;
- screenshot evidence was captured at
  `/tmp/homeai-android-prod-v895-secondary-open.png` and
  `/tmp/homeai-android-prod-v895-secondary-after-back.png`.

Public v0.4.13 update validation was performed on 2026-06-21:

- built the APK with
  `-PhomeAiUrl=https://wardrobe-xuxin.synology.me:8555` and
  `-PhomeAiUpdateManifestUrl=https://wardrobe-xuxin.synology.me:8555/android/android-update.json`;
- deployed the APK and manifest through the Home AI HTTPS mapping;
- verified the public manifest reports `versionCode=17`, `versionName=0.4.13`,
  size `3673283`, and SHA-256
  `b4c6c282019e5d6ea1628e0d52e625555def3ea6f0d6c4b378f233e69253ef31`;
- downloaded the public APK over HTTPS and verified the same size and SHA-256;
- installed v0.4.11 on the connected ADB device `e0cd9d2b` and confirmed
  Android reported `versionCode=15`, `versionName=0.4.11`; this device is not the
  user's hand-held problem device and is only installability evidence;
- confirmed update checks still run on foreground resume with a short cooldown;
- v0.4.11 forwards WebView file input requests through
  `WebChromeClient.onShowFileChooser` to the Android system file picker;
- v0.4.13 targets SDK 34 and uses a dark status bar with light system icons
  because the user's Android system desktop is Dark mode and the v0.4.12
  white-status/dark-icon strategy still failed on the physical display.

Static client `20260621-android-bottom-guard-v897` additionally keeps the
Android back-guard rearm listener out of the Composer and bottom control
region. Events from the Composer, attach button, send button, message input,
attachment/source menus, bottom navigation, or the bottom exclusion band must
not rearm the Android history guard. This prevents WebView back-swipe handling
from interfering with the input-adjacent attach button.

Static client `20260621-plugin-topic-async-v899` additionally treats active
artifact/file preview overlays as secondary Web back targets. Native Back closes
the preview through the Web preview controller instead of consuming the event as
a primary-page bounce.

Static client `20260621-android-plugin-exit-v903` clears active embedded plugin
host state at the start of primary Home AI navigation. This prevents stale Music
or other plugin iframe hosts from remaining visible while the selected-view load
is deferred after rapid bottom-tab or plugin-context navigation.
