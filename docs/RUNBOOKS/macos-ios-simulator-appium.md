# macOS iOS Simulator Appium QA

This runbook records the Mac-side Appium automation channel for Home AI iOS
Simulator validation. It is a QA toolchain, not a production service.

## Scope

- Drive iOS Simulator gestures through Appium/XCUITest.
- Capture screenshots and bounded accessibility/web source evidence.
- Validate that a reported iOS gesture issue can be reproduced on a real
  Simulator input path before changing production UI code.

This is not final iPhone/iPad acceptance evidence for installed-PWA behavior.
When the issue depends on Safari/PWA standalone shell semantics, the final
evidence still needs the installed home-screen app path or a real device.

## Mac QA Installation

The user-level QA root is:

```bash
/Users/xuxin/.homeai-qa
```

Installed components:

- Node: `/Users/xuxin/.homeai-qa/node-current`
- Appium npm prefix: `/Users/xuxin/.homeai-qa/appium-global`
- Appium server log: `/Users/xuxin/.homeai-qa/logs/appium-4723.log`
- Appium server URL: `http://127.0.0.1:4723`
- XCUITest driver: installed under the Appium user package store

The production Home AI runtime under `/Users/hermes-host/HermesMobile` is not
used as the Appium npm prefix and should not be made world-readable to support
QA tooling.

## Start Appium

On the Mac:

```bash
bash "$HOME/.homeai-qa/scripts/macos-ios-appium-start.sh"
```

The server binds to `127.0.0.1` and uses `--log-level warn`. Do not run Appium
with verbose or info logging when a future script might type an Access Key,
because verbose WebDriver logs can include request bodies.

## Minimal Smoke

On the Mac:

```bash
export PATH="$HOME/.homeai-qa/node-current/bin:$PATH"
node "$HOME/.homeai-qa/scripts/macos-ios-appium-smoke.js" \
  --url https://example.com/ \
  --out-dir "$HOME/.homeai-qa/artifacts"
```

Expected bounded output:

- `ok=true`
- `sessionMs`
- screenshot path
- source path
- source length

The script does not accept Access Keys, raw key files, cookies, or Home AI
credential material.

## Live PWA Debug Server

For high-frequency iOS PWA debugging, use the live debug server instead of
one-off screenshot scripts:

```bash
npm run ios:pwa:debug
```

Default URL:

```text
http://127.0.0.1:19073/
```

The server keeps one Appium/XCUITest session open and provides a local browser
UI with:

- continuously refreshed Simulator screenshots;
- optional WDA MJPEG video streaming for the fastest visual loop;
- click-to-tap on the screenshot;
- native Home and right-swipe/back actions;
- current WebView app state, client version, viewport, bottom-nav metrics, and
  active back target;
- WebView JavaScript execution;
- CSS selector click;
- PWA reload, open URL, and bounded static-cache clearing.

This is an interactive debugging tool, not a production service. Keep it bound
to `127.0.0.1`. Do not paste raw Access Keys, sudo passwords, cookies, launch
tokens, or private plugin payloads into the JavaScript panel or logs. If a test
requires credentials, set them through an explicit temporary wrapper and do not
print them.

The server enforces a cooperative debug lane lease for all mutating operations
and for WebView/Appium deep reads. The browser UI and checked visual harness
acquire `/api/lease` before calling `/api/action` or `/api/deep-state`; if the
lane is already owned by another thread, the request fails with
`debug_lane_locked`. Treat that as a hard stop for the current lane: allocate a
separate Simulator/debug server instead of continuing to drive the shared one.

Use the older smoke/proof scripts for final reproducible evidence when a bug
fix needs artifact paths, before/after screenshots, and bounded source files.

### Visual Harness

Use the deterministic visual harness when the live debug loop has reproduced a
mobile/PWA issue and the fix needs a bounded pass/fail artifact:

```bash
npm run ios:pwa:visual -- \
  --scenario directory-dark-status \
  --debug-url http://127.0.0.1:19073/
```

The harness talks only to the local live debug server endpoints
`/api/lease`, `/api/stream-info`, `/api/deep-state`, `/api/action`, and
`/api/screenshot?force=1`. It records a screenshot path, client version,
viewport metrics, relevant element bounds, computed styles, and assertion
results. For bottom-chrome changes it also samples the mobile bottom layout
multiple times in one run and fails if the nav bottom value oscillates or if
the comfort inset is treated as underflow. It does not accept Access Keys, sudo
passwords, cookies, launch tokens, or raw localStorage dumps.

By default, the harness serializes each live-debug lane with a lock under
`$HOME/.homeai-qa/locks` keyed by `--debug-url`. Keep this lock enabled for
the shared `http://127.0.0.1:19073/` lane. The harness also acquires the live
server debug lane lease before it opens URLs, runs JavaScript, reads deep state,
or captures final evidence. `--no-lock` disables only the filesystem lock and
is valid only when the run is pointing at an isolated Simulator/debug-server
lane with a unique port, UDID, WDA port, and MJPEG port. Use
`--expected-client-version <version>` when static assets changed, and keep the
screenshot artifact assertion enabled through `--min-screenshot-bytes` unless
the run is intentionally screenshotless.

For embedded plugin shells, use the same harness with the plugin id:

```bash
npm run ios:pwa:visual -- \
  --scenario embedded-plugin-shell \
  --plugin-id finance \
  --debug-url http://127.0.0.1:19073/
```

When validating a development build instead of production, open that build
through the harness:

```bash
npm run ios:pwa:visual -- \
  --app-url http://127.0.0.1:18797/?source=pwa \
  --scenario embedded-plugin-shell \
  --plugin-id finance \
  --debug-url http://127.0.0.1:19073/
```

Source and contract coverage for this harness is in
`scripts/ios-pwa-visual-harness.js` and
`tests/ios-pwa-visual-harness.test.js`.

### WDA MJPEG Stream Mode

For deeper interactive debugging, run the live server with WDA MJPEG streaming:

```bash
npm run ios:pwa:debug -- \
  --stream wda-mjpeg \
  --mjpeg-server-port 9100 \
  --wda-local-port 8101
```

This mode proxies the WebDriverAgent MJPEG server through
`/api/stream.mjpeg`. The browser shows the MJPEG stream in the same clickable
image surface, so tap coordinates still use normalized screen positions. If
the MJPEG stream is unavailable, the page automatically falls back to the
bounded `/api/screenshot` PNG loop.

WDA normally exposes status on `--wda-local-port` and MJPEG on
`--mjpeg-server-port`; these are separate ports and both must be unique per
concurrent Simulator lane.

### Concurrent Plugin Debugging

One iOS Simulator UDID can have only one reliable Appium/XCUITest session at a
time. Multiple plugin teams must not point separate live debug servers at the
same UDID with the same Appium/WDA/MJPEG ports, because the newer session can
terminate the older session and make WebView state reads, gestures, or video
streams flaky.

To debug plugins concurrently, allocate one Simulator per active plugin lane and
run one live debug server per Simulator:

```bash
npm run ios:pwa:debug -- \
  --port 19073 \
  --udid <simulator-udid-a> \
  --wda-local-port 8101 \
  --mjpeg-server-port 9100

npm run ios:pwa:debug -- \
  --port 19074 \
  --udid <simulator-udid-b> \
  --wda-local-port 8102 \
  --mjpeg-server-port 9101
```

The `simctl` screenshot path is independent and fast per Simulator, and WDA
MJPEG stream mode is faster when its port is available. Native actions and
WebView deep state are still serialized within each server instance. If a team
only needs visual observation, keep to the screenshot/live-view path. If a team
needs selectors, JavaScript execution, or gestures, use that Simulator's own
live debug server instance.

The checked visual harness follows the same lane rule. Separate plugin threads
may run `npm run ios:pwa:visual` concurrently only when they target different
`--debug-url` lanes. Runs against the same debug URL are serialized by the
default lock and by the live server debug lane lease; bypassing the filesystem
lock with `--no-lock` on a shared lane is invalid evidence, and a
`debug_lane_locked` response means the thread must stop and create its own lane.

## Gesture Smoke

To issue a normalized viewport long press:

```bash
node "$HOME/.homeai-qa/scripts/macos-ios-appium-smoke.js" \
  --url https://example.com/ \
  --long-press 0.90,0.87,1200
```

The output records only the normalized action result and artifact paths.

## Home AI Dock Long-Press Proof

For authenticated Home AI gesture incidents, keep Appium at `--log-level warn`
or quieter before entering any Access Key. Pass the key through an environment
variable or stdin-only secure wrapper; do not print the key or the raw key file
path.

The current Home AI Dock proof script on the Mac records:

- authenticated app load and `data-client-version`;
- Dock button bounds and native coordinate translation from
  `mobile: calibrateWebToRealCoordinatesTranslation`;
- menu DOM visibility and computed styles after a real
  `mobile: touchAndHold`;
- `elementFromPoint` and `elementsFromPoint` hit-test stacks at menu points;
- Appium and `xcrun simctl io` before/after screenshots;
- page source lengths and bounded artifact paths.

2026-06-06 evidence on Mac production `20260606-plugin-origin-allow-v575`:

- Baseline artifact directory:
  `/Users/xuxin/.homeai-qa/artifacts/homeai-dock-proof-directory-native-style`.
- The Directory Dock button long-press triggered the handler:
  `openMenuCount=1`, `chosenButtonMenuOpenClass=true`, and the menu computed
  as `display:grid`, `visibility:visible`, `position:fixed`, `z-index:45`.
- Hit tests at the menu center and menu item centers returned the menu's child
  nodes as the top web elements.
- Both Appium and native `simctl` screenshots showed no visible menu. Pixel
  comparison for the translated expected menu rectangle reported
  `changedPixels=0` while the Dock button region changed, proving that the
  event and DOM state changed but the menu was not painted for the user.
- A harness-only `dock-absolute` CSS variant changed the menu to an absolute
  Dock overlay. The same long-press path then produced a visible menu in both
  screenshots, with the expected menu rectangle changing by about `98.65%`.

Interpretation: this is not a missing binding, missing Directory entry, or bad
touch coordinate. The evidence points to the current fixed-position menu inside
the fixed Dock structure as the visual failure mode on iOS Simulator Safari.
After a production CSS or portal fix, rerun the baseline proof without the
variant; the baseline must show a non-zero menu-rect pixel change and a visible
menu.

Production fix validation:

- `20260606-dock-menu-absolute-v576` moves the Dock menu to an absolute Dock
  overlay while the menu is open and lets the Dock/launcher/strip overflow only
  during that open state.
- Baseline artifact directory:
  `/Users/xuxin/.homeai-qa/artifacts/homeai-dock-proof-directory-v576-baseline`.
- The baseline proof, without the harness-only CSS variant, reported the menu as
  `position:absolute`, `z-index:80`, `openMenuCount=1`, and
  `chosenButtonMenuOpenClass=true`.
- Appium and native `simctl` screenshots both show the Directory menu.
- Pixel comparison for the translated expected menu rectangle reported about
  `98.65%` changed pixels in both screenshot sources, replacing the prior
  `changedPixels=0` failure.

Current production validation:

- `20260606-directory-dock-consistent-v587` was validated with the same Mac
  Appium baseline proof against the Directory Dock button.
- Long-press artifact directory:
  `/Users/xuxin/.homeai-qa/artifacts/homeai-dock-proof-v587-directory-consistent`.
- Click-through artifact directory:
  `/Users/xuxin/.homeai-qa/artifacts/homeai-directory-click-v587`.
- The proof loaded `data-client-version=20260606-directory-dock-consistent-v587`
  and used native `mobile: touchAndHold` at the translated Directory Dock
  point.
- The menu opened with `openMenuCount=1`,
  `chosenButtonMenuOpenClass=true`, `position:absolute`, `z-index:80`, and
  `visibility:visible`.
- A direct Directory Dock click changed the app to `projects-mode`, cleared
  `task-list-mode`, hid `#topicPluginDock`, and showed the Directory title and
  folder list without a bottom Dock white reserve.
- The before-longpress `simctl` screenshot shows the Directory Dock icon as a
  Dock-consistent plugin app icon: rounded teal/blue gradient tile with a white
  folder glyph.

Historical v586 result:

- `20260606-centered-file-icon-v586` was validated with the same Mac Appium
  baseline proof against the Directory Dock button.
- Artifact directory:
  `/Users/xuxin/.homeai-qa/artifacts/homeai-dock-proof-v586-centered-file-icon`.
- The proof loaded `data-client-version=20260606-centered-file-icon-v586` and
  used native `mobile: touchAndHold` at the translated Directory Dock point.
- The menu opened with `openMenuCount=1`,
  `chosenButtonMenuOpenClass=true`, `position:absolute`, `z-index:80`, and
  `visibility:visible`.
- Hit tests at the menu center and first item returned
  `.capability-action-menu` children as top web elements, confirming that the
  visible menu receives interaction at the expected points.
- The before-longpress `simctl` screenshot shows the Directory Dock icon as a
  system Files-style visual: white rounded-square tile with a centered, fuller
  blue folder mark.

## Current Known Result

As of 2026-06-06, Appium `3.5.0` with XCUITest driver `11.9.0` created an
iOS Safari session on `HomeAI iPhone 17 Pro`
`C2EB6D31-F485-4DAE-BFB4-25E27FC65389`, opened `https://example.com/`, captured
a screenshot, and read page source. The first session took about 32 seconds
because WebDriverAgent startup had to be initialized.
