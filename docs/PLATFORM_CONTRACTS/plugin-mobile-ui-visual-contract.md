# Plugin Mobile UI And Visual Harness Contract

Contract version: `20260609-v6`.

## Purpose

Home AI and its plugins have repeatedly hit mobile UI issues that looked small
but were expensive to diagnose: bottom bars drifting, iframe blank bands,
iOS-safe-area differences, long-press menus opening in DOM but not painting,
old static clients, stale cached content, and browser-mode evidence that did
not match installed-PWA behavior.

This contract makes those lessons reusable across plugin workspaces. Plugin UI
work should start from this contract instead of rediscovering the same layout
and harness rules.

## Scope

Applies to:

- embedded plugin iframe apps;
- plugin-bound topics;
- plugin quick actions and capability entries;
- plugin bottom navigation, floating buttons, sheets, menus, and popovers;
- plugin mobile visual validation;
- Appium/iOS Simulator evidence;
- Playwright/mobile viewport evidence;
- installed-PWA or real-device evidence when shell behavior matters.

Primary supporting docs:

- `docs/IMPLEMENTATION_NOTES/embedded-plugin-ui-contract.md`
- `docs/IMPLEMENTATION_NOTES/embedded-surface-bottom-layout-standard.md`
- `docs/IMPLEMENTATION_NOTES/capability-entry-hub.md`
- `docs/RUNBOOKS/macos-ios-simulator-appium.md`
- `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`
- `docs/TEST_MATRIX.md`

## Design Language

Plugin UI should feel like a native part of Home AI when embedded, while still
preserving plugin identity.

Required posture:

- calm control-panel language;
- compact but not crowded;
- status-forward and permission-aware;
- repeated-use operational UI, not marketing-page composition;
- mobile-first, with touch targets at least `44px`;
- restrained color with semantic use of green, amber, red, and blue-gray;
- consistent icon, radius, spacing, and typography patterns.

Avoid:

- one-off decorative visual systems per plugin;
- oversized hero layouts inside tools;
- glassmorphism-heavy panels, bokeh, neon, decorative gradients, or random
  ornamental badges;
- hiding critical state behind color only;
- viewport-scaled fonts;
- fixed text buttons where an icon button and tooltip/label pattern already
  exists;
- plugin-specific bottom spacing hacks that duplicate Home AI footer space.

## Host Versus Plugin Ownership

Always classify the surface before fixing layout:

```text
Hermes-owned app shell
Hermes-owned chat/topic surface
Hermes-owned plugin-bound topic chat
plugin-owned iframe app
plugin-owned full-screen preview inside iframe
directory/file preview
```

Hermes owns:

- outer mobile shell;
- primary bottom navigation;
- plugin-context footer;
- chat composer;
- global plugin Dock;
- iframe viewport geometry;
- Home AI route/back behavior around iframe surfaces.

Plugin owns:

- layout inside its iframe;
- plugin app header if needed;
- plugin bottom tabs;
- plugin floating buttons;
- plugin-local sheets/popovers;
- plugin secondary pages and local back behavior.

The plugin must not reserve Home AI footer space inside its own iframe. The
host must not rely on broad outer-shell padding to separate iframe content from
Home AI footers.

## Bottom Layout Rules

Most mobile visual regressions come from unclear bottom ownership.

Non-negotiable:

- Home AI-owned bottom chrome must be arranged through the runtime measured
  bottom stack, not hand-tuned fixed pixel drops. The host writes measured CSS
  variables for primary bottom navigation, the global plugin Dock, and the
  combined bottom stack:
  `--mobile-bottom-nav-bottom-runtime`,
  `--mobile-bottom-nav-offset-height-runtime`,
  `--mobile-bottom-nav-reserved-height-runtime`,
  `--topic-plugin-dock-bottom-runtime`,
  `--topic-plugin-dock-reserved-height-runtime`, and
  `--mobile-bottom-stack-height-runtime`.
- Home AI may apply one shared host comfort inset to the measured bottom stack
  so bottom navigation is not visually flush with the viewport edge. That inset
  must be a single host-level variable/measurement input, not separate
  Mac/Windows/iOS overrides. The current Home AI default is 18px; do not add a
  plugin-local offset or a second Dock offset on top of the host measurement.
- The global plugin Dock is anchored to the measured primary bottom-nav top,
  and scroll containers reserve the measured combined stack height. A fix that
  changes only `bottom: Npx` without updating the measured reservation is not
  acceptable for Home AI host chrome. Collapsed state reserves only the handle
  height; expanded state reserves the full Dock height.
- The global plugin Dock is available on the Chat bottom-tab surface and on
  top-level plugin App surfaces so users can switch plugins without returning
  to the host first. It remains host-owned chrome; plugin iframes must not
  reserve extra internal space for it.
- Codex is a special embedded plugin surface and does not participate in the
  Home AI global plugin Dock. The host must not show the Dock dot, open the
  Dock drawer, or apply Dock-specific iframe reservation while `viewMode=codex`
  is active. This rule applies only to the Home AI plugin-hosted Codex surface;
  standalone Codex deployments are outside this Home AI Dock contract.
- When the global plugin Dock is visible above an embedded plugin iframe, the
  Home AI host must reserve iframe viewport space for both collapsed and
  expanded Dock states. This reserve is host-owned and applies uniformly to
  Finance, Wardrobe, Health, Note, Email, and future Dock-participating
  embedded plugins; do not implement plugin-specific Dock avoidance inside
  individual plugin workspaces.
- When the mobile keyboard is active, the Home AI host must suppress the global
  plugin Dock and clear Dock-specific embedded iframe reservation. A hidden Dock
  must never leave expanded-state padding behind while the user is typing in a
  host composer or plugin iframe input.
- When a top-level plugin App hides the primary Home AI bottom navigation, the
  global plugin Dock must anchor to the host comfort inset instead of the
  absent nav height. Otherwise the handle floats too high on plugin pages.
- The global plugin Dock must not become visible while the host is between
  plugin-topic detail and topic-list chrome states. Rendering may prepare the
  Dock HTML, but the Dock must remain hidden until `updateNavigationControls()`
  applies `global-plugin-dock-mode` and can reveal and measure it in one stable
  bottom-stack pass.
- The global plugin Dock must also remain hidden while a real right-swipe back
  surface is still in `page-back-dragging` or `page-back-settling`. The Dock
  may only reveal after the swipe surface is cleared and bottom-nav visible
  count classes have been updated, so the first visible Dock rect is the stable
  post-return rect.
- Global plugin Dock gesture changes must prove that short vertical mistouches
  and horizontal swipes do not expand the Dock, valid upward/downward handle
  swipes settle to the correct state, Chat and top-level plugin App surfaces
  can enter global Dock mode, and the primary bottom-nav rect does not move
  during the gesture.
- The measured bottom-nav top offset already includes the host comfort inset.
  Dock positioning must use that offset directly; adding the inset again creates
  an artificial Dock/nav gap and is a failing bottom-stack state.
- Runtime bottom-stack measurements must compare fixed-shell
  `getBoundingClientRect()` values against the layout viewport first
  (`window.innerHeight` / `documentElement.clientHeight`). `visualViewport`
  remains useful for keyboard/diagnostic state, but on iOS standalone PWA it can
  be shorter than the fixed layout viewport; using it as the bottom boundary can
  falsely lift the whole Dock/nav stack. Large runtime bottom overflow should
  remain diagnostic-only unless a bounded clamp is intentionally raised from the
  current `--mobile-bottom-nav-overflow-clamp: 0px` default.
- Home AI-owned bottom navigation, including plugin-context bottom navigation,
  must render an opaque host chrome background. Do not use a `transparent`
  color mix for this band; long message content can otherwise show through the
  iOS PWA safe-area/footer region.
- fixed or sticky bottom controls must have an explicit matching reservation in
  the scroll container they cover;
- the reservation belongs to the covered scroll container, not a random outer
  shell;
- do not stack multiple spacers for the same footer;
- do not use `100vh` / `100dvh` as the root answer inside embedded iframe
  shells;
- plugin iframe roots should fill the iframe, not the browser window;
- plugin-owned bottom nav sits at the iframe bottom;
- Hermes-owned composer/nav reserves only in Hermes-owned chat scroll
  containers;
- full-screen plugin previews must report fullscreen state so Home AI can hide
  plugin-context footer reservations.

Failing visual states:

- blank band between plugin content and Home AI footer;
- plugin bottom nav floating above the iframe bottom;
- Home AI composer covering newest chat messages;
- global Dock reserve remaining after switching to an ineligible view;
- newest topic content opening in the middle instead of bottoming when the user
  expects chat-like behavior;
- iframe content reserving both plugin footer and Home AI footer space.

## Safe-Area, Keyboard, And Viewport Rules

Mobile shell changes must account for:

- iOS safe-area;
- Android/WebAPK viewport behavior;
- mobile browser chrome versus standalone PWA shell;
- keyboard open/close;
- orientation and touch-tablet landscape;
- foreground resume and service-worker refresh.

Rules:

- cap safe-area contribution when it can inflate bottom navigation beyond the
  intended control height;
- recompute geometry after orientation, keyboard blur, PWA resume, and viewport
  metric changes;
- embedded iframe plugins must consume the Home AI host
  `hermes.plugin.viewport` postMessage event for iframe-root viewport sizing,
  Home AI footer geometry, host-bottom reservation, and diagnostics. The host
  event is not raw system input-method state; plugin-owned sheets, remark
  layers, floating buttons, and fixed form actions may use plugin-local keyboard
  calculations as long as they do not add Home AI footer space twice;
- Owner-critical direct embedded plugins such as Codex may hide Home AI bottom
  chrome. They still must consume `footer.safeAreaBottom` /
  `footer.hostBottomSafeArea` from `hermes.plugin.viewport` and apply it inside
  their iframe when the keyboard is closed, so plugin controls do not become
  physically flush with the PWA bottom.
- the Home AI host must rebroadcast bounded plugin viewport metrics through a
  short settled sequence after host visual viewport resize, scroll, or
  orientation events, and must reset host page scroll while an embedded iframe
  is active, because native keyboard focus can originate inside the iframe
  rather than the Home AI composer. Host window `scroll` is also a settle signal
  because some mobile shells pan the host document on first iframe input focus
  before the plugin receives stable keyboard geometry;
- plugin mobile visual harnesses must prove the host viewport event is received
  or explicitly stubbed when validating keyboard and bottom-layer behavior in
  `embed=hermes`;
- do not assume Safari browser-mode equals installed-PWA behavior;
- do not accept a layout fix until the loaded client version and
  `/api/client-version` refresh contract are proven when static assets changed.

## Navigation And Back Behavior

Plugin UI must have predictable return paths.

Requirements:

- embedded plugin secondary pages should expose plugin-owned back first;
- Home AI back/right-swipe should return from the current secondary surface, not
  jump to an unrelated root;
- open menus, sheets, and popovers must be dismissible without taking an action;
- dismissal must support non-menu tap/click, `Escape` where relevant, and
  right-swipe for touch surfaces when the surface uses swipe navigation;
- plugin topic/chat content should preserve scroll intent and avoid forcing the
  viewport downward after the user has intentionally scrolled away.

## Menus, Long Press, And Popovers

iOS can produce DOM state changes without visible paint. Long-press evidence
must prove user-visible output, not only event handlers.

Requirements:

- mobile long-press validation must use real touch/Appium/XCUITest or a direct
  touch path, not only desktop `contextmenu`;
- menu proof must include DOM visibility, computed styles, hit tests, and
  screenshot or pixel evidence;
- menus, sheets, inline details popovers, and action panels must use host or
  plugin theme tokens for background, text, border, and shadow. Dark/system-dark
  fixes are incomplete if the base menu rule still uses a hard-coded white or
  pale background and only happens to work through a separate override;
- avoid fixed-position menus trapped inside fixed Dock subtrees if iOS proof
  shows the menu can open in DOM but fail to paint;
- menus should be compact, task-labeled, and reversible;
- destructive or management actions should not be mixed into daily-use plugin
  quick-action menus.

## Loading, Stale Content, And Blank Surfaces

Do not use full blanking as the normal refresh path.

Rules:

- keep cached rows/messages visible while refreshing in the background when the
  previous content is still valid;
- use full loading only for first load, explicit force-load, or confirmed
  recovery states;
- avoid clearing iframe or topic content before the replacement surface is
  ready unless the old surface would be misleading or unsafe;
- a surface that briefly becomes white/blank after navigation is a regression
  unless there is an explicit loading state with bounded duration and clear
  recovery.

## Component And Icon Rules

Plugin entrypoints should reuse the Home AI component vocabulary.

Rules:

- app/capability icons should share the same container size, radius, shadow,
  and visual weight across plugins and built-in capabilities;
- a built-in capability such as Directory may use a distinct glyph but should
  not appear smaller or visually unrelated to plugin icons in the same Dock;
- quick actions should be task-first and limited; do not turn them into a
  second full app launcher;
- repeated cards, rows, badges, receipts, status panels, and action sheets
  should reuse existing Home AI patterns;
- text must fit mixed Chinese/English labels without clipping or overlap;
- icon-only controls need accessible labels or visible adjacent context.

## Visual Harness Levels

Use the highest applicable evidence level:

| Level | Use When | Evidence |
| --- | --- | --- |
| DOM/unit UI | deterministic helper or projection only | focused test assertions |
| Playwright mobile viewport | early layout, browser-mode comparison, static cache | screenshot, bounding rects, loaded version |
| Mac iOS PWA live debug | high-frequency iOS PWA interaction/debug loops | live Simulator screenshot, native actions, optional WebView state |
| Mac iOS PWA visual harness | reproducible host/plugin PWA visual assertions after live reproduction | screenshot path, client version, viewport metrics, DOM bounds, computed styles, pass/fail assertions |
| Mac iOS Simulator Appium | iOS gesture, menu, Safari/Simulator reproduction | Appium input, DOM state, screenshots, hit tests |
| Installed PWA / real device | standalone shell, safe-area, keyboard, service-worker, final mobile acceptance | launcher/PWA proof, screenshot, viewport metrics |

Browser-mode Safari or Chrome evidence must be labeled browser-mode. It cannot
replace installed-PWA evidence when the issue depends on standalone shell
semantics.

For Mac-hosted Home AI work, plugin teams should use the Home AI live debug
server for interactive iOS PWA debugging before falling back to one-off
screenshot/coordinate scripts:

```bash
cd <Home-AI>
npm run ios:pwa:debug
```

Default local UI:

```text
http://127.0.0.1:19073/
```

The live debug server separates the fast visual loop from the slower Appium
WebView attach path: stable screenshots come from
`xcrun simctl io ... screenshot`, and deeper interactive sessions can enable
WDA MJPEG stream mode with `--stream wda-mjpeg --mjpeg-server-port <port>`.
Native gestures, selector clicks, JavaScript execution, and deep WebView state
use Appium/XCUITest when available. A missing WebView context is not itself a
visual-smoke failure if the screenshot or MJPEG stream and native-action path
still prove the reported layout or gesture issue. For final acceptance
evidence, record bounded artifact paths and metrics from the relevant harness
level.

The live debug server has a required debug lane lease. Mutating operations and
WebView/Appium deep reads must acquire `/api/lease` first; `debug_lane_locked`
means another thread owns that lane and the current plugin thread must allocate
a different Simulator/debug server instead of continuing on the shared lane.

## Visual Toolchain Health And Recovery

Visual tool failures must be classified by infrastructure layer before a plugin
team treats them as UI evidence.

Layer checks:

```bash
curl -fsS http://127.0.0.1:4723/status
curl -fsS http://127.0.0.1:8101/status
lsof -nP -iTCP:19073 -sTCP:LISTEN
```

Recovery order:

1. If Appium `4723` is down, start it through the central script:

   ```bash
   bash "$HOME/.homeai-qa/scripts/macos-ios-appium-start.sh"
   ```

2. If the live debug server `19073` is down, start it from Home AI:

   ```bash
   cd <Home-AI>
   npm run ios:pwa:debug
   ```

3. If Appium is up but WebView attach, `/contexts`, or harness actions fail
   with `appium_timeout`, `fetch failed`, `Unexpected EOF`, `socket hang up`,
   or `webview_context_missing`, reset the live-debug Appium session once with
   `/api/action` using `type=connect` and `resetSession=true`, then retry the
   harness.
4. Restart WDA or the Simulator lane only when the WDA `8101` status check is
   unhealthy or the Appium session reset still cannot attach.

Do not classify `appium_timeout`, `/contexts` timeout, or live-debug
`fetch failed` as a plugin UI regression until the layer checks above have
passed. Killing and reopening the PWA is only an app-state reset; it is
insufficient when Appium, WDA, or WebKit remote debugging is partially stuck.

Plugin teams must not start foreground `appium server` processes from their
own terminal sessions for shared lanes. Use the central Appium start script so
the background Appium process ignores terminal SIGINT; otherwise Ctrl-C in a
live-debug terminal can kill Appium while WDA remains alive, leaving the lane
in a half-online state that times out later.

After an issue is reproduced, promote the final check to the reusable visual
harness instead of leaving it as a manual screenshot loop:

```bash
cd <Home-AI>
npm run ios:pwa:visual -- \
  --scenario directory-dark-status \
  --debug-url http://127.0.0.1:19073/
```

Embedded plugin shells use the plugin scenario:

```bash
cd <Home-AI>
npm run ios:pwa:visual -- \
  --scenario embedded-plugin-shell \
  --plugin-id <plugin-id> \
  --debug-url http://127.0.0.1:19073/
```

Embedded plugin keyboard/composer changes must use the keyboard scenario after
the issue is reproduced in the live debug server. Use the scenario that matches
the obstructed input surface:

```bash
cd <Home-AI>
npm run ios:pwa:visual -- \
  --scenario embedded-plugin-keyboard-composer \
  --plugin-id <plugin-id> \
  --plugin-thread-id <thread-id> \
  --debug-url http://127.0.0.1:19073/
```

```bash
cd <Home-AI>
npm run ios:pwa:visual -- \
  --scenario embedded-plugin-side-chat-keyboard \
  --plugin-id codex-mobile \
  --plugin-thread-id <thread-id> \
  --debug-url http://127.0.0.1:19073/
```

Plugin-bound topic detail to topic-list return changes must use the Dock
stability scenario. The scenario constructs a synthetic plugin-bound topic,
simulates the real right-swipe return settle path, calls the same
`openTaskList()` return path, and fails if the global Dock is unhidden or
visible before `global-plugin-dock-mode` is applied, visible during
`page-back-settling`, or unstable after the return surface is cleared:

```bash
cd <Home-AI>
npm run ios:pwa:visual -- \
  --scenario plugin-topic-dock-return-stability \
  --plugin-id <plugin-id> \
  --debug-url http://127.0.0.1:19073/
```

Global Dock handle gesture changes must also run:

```bash
cd <Home-AI>
npm run ios:pwa:visual -- \
  --scenario global-plugin-dock-gesture-stability \
  --debug-url http://127.0.0.1:19073/
```

For Codex Mobile, pass a real thread id so the harness opens the thread-detail
composer instead of the plugin's primary thread list. The scenario uses native
tap coordinates to focus the iframe input when Appium can deliver them, asserts
host keyboard metrics are visible, verifies the plugin received a keyboard
viewport state, and checks the composer/input bounding boxes stay above the
keyboard top. If the local Appium/Safari lane cannot show the iOS software
keyboard for iframe `contenteditable` controls, the scenario injects the same
`hermes.plugin.viewport` keyboard payload that the host sends in production and
marks the report as `keyboard.simulated=true`; this is valid for layout
regression gating, while final installed-PWA/device acceptance may still use a
real keyboard artifact. If no thread id is provided, the scenario may attempt a
first-thread fallback, but that fallback is diagnostic only and is not a
production acceptance substitute.

For development builds, add `--app-url <local-dev-url>` so the same iOS PWA
Simulator opens the dev port before assertions run. Add
`--expected-client-version <version>` when static assets changed so the
artifact proves the loaded PWA build. The checked harness lives in
`scripts/ios-pwa-visual-harness.js` with source coverage in
`tests/ios-pwa-visual-harness.test.js`. It defaults to a per-`--debug-url` lane
lock under `$HOME/.homeai-qa/locks` and also acquires the live server debug
lane lease before driving the Simulator; use `--no-lock` only for an isolated
Simulator/live-debug lane with its own port, UDID, WDA port, and MJPEG port.
For host or plugin changes that affect the bottom chrome, the harness must
include multi-sample mobile bottom stability evidence; a single screenshot or
single metric read is not sufficient when the reported bug is flicker,
oscillation, or delayed layout drift.
The Directory dark-status scenario asserts `.directory-status`,
`.directory-shell`, `#conversation`, and `--ui-surface-muted` so gray/pale
loading-surface regressions fail deterministically. The
embedded-plugin-shell scenario asserts the host shell, iframe existence,
meaningful frame size, no horizontal overflow, and a non-empty screenshot
artifact by default. The embedded-plugin-keyboard-composer scenario asserts
host keyboard visibility, plugin keyboard viewport receipt, and that the
iframe-local input/composer are not covered by the iOS keyboard. The
embedded-plugin-side-chat-keyboard scenario targets Codex Mobile's left-swipe
side-chat textarea and additionally asserts that the side-chat panel is open
and the side-chat draft textarea is the focused keyboard owner.

For concurrent plugin debugging, allocate one Simulator per active plugin lane.
Do not share one Simulator UDID across multiple Appium/XCUITest control
sessions. Each lane must use a unique `--port`, `--udid`,
`--wda-local-port`, and `--mjpeg-server-port`; screenshot observation can run
quickly per Simulator, WDA MJPEG is faster when enabled, but native gestures,
selector clicks, JavaScript execution, and deep WebView state are serialized
within that lane.

Runs that fail the debug lane lease are not valid visual evidence. Start a new
Simulator instance and pass its unique `--debug-url` to the harness.

## Minimum Plugin UI Smoke

For each embedded UI plugin, the minimum smoke should prove:

```text
plugin opens through Home AI
expected plugin content is visible
iframe fills the host viewport
plugin bottom nav, if any, sits at the iframe bottom
Home AI footer is outside the iframe and not overlapped
no horizontal overflow
no blank band below plugin content
primary plugin action is tappable
back/return path works
loaded client/plugin version is recorded when available
artifact paths and bounded metrics are recorded
```

If the plugin has a bottom composer, search box, login field, note field, or
other keyboard-owned input inside the iframe, the minimum smoke also needs a
keyboard-open pass/fail assertion: the focused input and its fixed/sticky
action surface must stay above the keyboard top, and the artifact must include
the host keyboard metrics plus the iframe-local element bounds.

If the plugin has long-press, sheet, menu, or gesture behavior, the smoke must
also prove open and dismissal paths.

For iterative debugging, plugin teams should first reproduce the issue through
the live debug server, then promote the final proof to a deterministic
plugin-specific smoke script or documented artifact set. Do not rely on manual
visual impressions alone when closing a plugin mobile UI bug.

## Static Client And Deployment UI Closure

When a UI/static asset changes:

- bump static versions where Home AI cache rules require it;
- deploy with a new cache-busting version rather than overwriting the same
  version;
- prove loaded `data-client-version` or plugin version;
- prove `/api/client-version` reports new version as current and previous
  version as refresh-required where applicable;
- capture visual evidence on the target origin.

For plugin-only UI deployments, the plugin should provide an equivalent
version/health proof so Home AI can distinguish stale plugin assets from host
layout bugs.

## Cross-Workspace Adoption

Every plugin pointer file should declare:

```text
mobile_visual_harness_status: none | playwright | appium-simulator | installed-pwa
ios_live_debug_available: yes | no
ios_visual_harness_command:
primary_mobile_surfaces:
required_visual_smokes:
known_ui_boundaries:
```

Plugins with embedded UI should also link this contract:

```text
<Home-AI>/docs/PLATFORM_CONTRACTS/plugin-mobile-ui-visual-contract.md
```

## Completion Rule

A plugin UI change is not complete if:

- it only has desktop browser evidence for a mobile bug;
- it changes fixed/sticky/bottom layout without bounding rectangles;
- it changes iOS gesture behavior without touch/Appium or real-device evidence;
- it changes cached static assets without proving the loaded version;
- it leaves a known blank surface, overlap, horizontal overflow, or unreachable
  return path;
- it records raw access keys, cookies, token contents, private payloads, or
  verbose WebDriver bodies in artifacts or logs.
