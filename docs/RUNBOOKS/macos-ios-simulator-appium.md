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
