# Module: Static Client And Cache

## Responsibility

The static client owns PWA UI, client routing, service worker cache behavior, and mobile visual state.

## Core Files

- `public/index.html`
- `public/service-worker.js`
- `public/directory-viewer.html`
- `public/styles.css`
- `public/app-*.js`
- `tests/task-list-ui.test.js`
- focused UI tests such as `tests/app-learning-growth-ui.test.js`

## Frontend Build Direction

The existing primary PWA shell remains the stable ordered `public/app-*.js`
runtime and should not be migrated to Vite in one broad change. New independent
frontend capabilities should default to Vite-built islands when they are not
tightly coupled to chat, Composer, event streaming, plugin iframe hosting,
service-worker registration, or global navigation. The central rule lives in
`docs/PLATFORM_CONTRACTS/plugin-workspace-platform-contract.md` under
`Frontend Build Boundary`; Vite-built output must still obey this module's
static version, service-worker cache, deployment, and harness rules.

## Version Rule

Any client-visible static change must bump the static version consistently in:

- `public/index.html`
- `public/service-worker.js`
- `public/directory-viewer.html`
- `tests/task-list-ui.test.js`

After deployment, verify:

- `/api/status?detail=1`
- unauthenticated `/api/client-version?clientVersion=<new-version>`

If a cache-sensitive static file was missed during a production sync and is
then copied under the same `?v=<client-version>` URL, bump the client version
again before considering the hotfix deployed. Installed PWA clients can keep
the old JavaScript under the old query string and will not see a refresh prompt
when the server version has not changed.

PWA install metadata changes, including the installed app name, short name, or
manifest display fields, must publish a new fingerprinted manifest file and
update `public/index.html`, `public/service-worker.js`, and
`tests/task-list-ui.test.js` to reference it. Do not rely on mutating an older
dated manifest file in place, because browser install flows can keep a cached
manifest for the old URL.

## Deployment

Static-only changes:

- backup changed production files
- sync changed static/test files
- run focused production checks
- do not restart listener or Gateway Pool

Server/route changes:

- listener restart is required

## Static Resource Performance

The listener serves `index.html` and `service-worker.js` with `no-cache` so the
PWA can discover new client versions and Service Worker updates. Versioned
static assets referenced with `?v=<client-version>`, and fingerprinted static
files such as dated manifests/icons, should be cacheable with a long immutable
cache lifetime because a version bump changes the URL.

Text static assets such as JavaScript, CSS, HTML, JSON, SVG, and web manifests
should be returned compressed when the browser advertises `br` or `gzip`.
Mobile/PWA load checks should inspect:

- HTML response time.
- Number of JS/CSS assets in the first page.
- `Cache-Control` for versioned JS/CSS.
- `Content-Encoding` for large JS/CSS.
- Service Worker update behavior after a client version bump.

When diagnosing account-specific startup slowness, the client records a bounded
startup performance summary in `localStorage.hermesStartupPerfLast` and logs
`[Hermes startup]` entries to the browser console. The log contains stage
names, durations, selected workspace/view ids, message counts, and page totals
only; it must not include message bodies, access keys, cookies, push endpoints,
or plugin tokens.

Gateway plugin/schema/profile changes:

- Gateway Pool restart is required

## Composer Send Guard

The primary `sendMessage()` path must hold a generic
`state.composerSendInFlight` lock from just before request-body construction
until the request finishes. Button disabling remains only a UI affordance: it
does not protect against near-simultaneous native shell, voice, keyboard, or
iframe-triggered activations that enter the function before DOM state updates
settle. Surface-specific guards such as `directoryTopicDraftSendInFlight` may
add stricter behavior, but they do not replace the generic composer lock.

## Constraints

- Mobile UI must preserve the OS status bar, safe areas, bottom navigation, stable action icons, and readable compact panels.
- Mobile bottom navigation must keep a fixed visual container height. Do not
  add `env(safe-area-inset-bottom)` to `--mobile-bottom-nav-height` or
  `--plugin-context-bottom-nav-height`. iOS reports safe-area values per
  browser/PWA/origin context, so two deployments on the same physical phone can
  expose different values. Native tab bars remain stable because the bar height
  is fixed and the safe area is handled as background or internal spacing, not
  as a layout-height multiplier.
- If the mobile bottom navigation is visually lowered with
  `--mobile-bottom-nav-visual-drop`, any Dock or fixed surface above it must use
  the runtime measured visible top offset, not the full bottom-nav height. This
  keeps the global plugin Dock adjacent to the visible nav after the nav is
  dropped below the viewport edge.
- On top-level plugin App pages where the primary Home AI bottom navigation is
  hidden, the global plugin Dock must use the host comfort inset as its runtime
  bottom anchor. It must not fall back to the normal bottom-nav height, because
  that places the collapsed handle too high on plugin pages.
- The global plugin Dock may overlap the bottom nav by the controlled
  `--topic-plugin-dock-nav-overlap: 1px` bridge and should keep its bottom
  padding at `0` so translucent page background cannot show through between
  the plugin buttons and the tab bar.
- Bottom safe-area may only contribute a small internal content buffer through
  `--mobile-bottom-nav-content-safe-area`. Topic docks, plugin context bars,
  composer offsets, and runtime bottom-nav measurements must be based on the
  fixed bar height plus measured bounds, not a raw safe-area-expanded CSS
  height. Font-size preferences must not increase the bottom nav container
  height beyond `--mobile-bottom-nav-height`.
- The visual vertical position of the primary mobile bottom nav is owned by
  `updateMobileBottomNavReservation()`, not only by CSS. If the nav needs to
  move up or down, update the runtime `comfortInset`, the matching
  `--mobile-bottom-nav-comfort-inset` fallback, and `task-list-ui.test.js`
  together. Changing only `.bottom-nav` CSS can be masked by runtime
  `--mobile-bottom-nav-bottom-runtime` after the first layout measurement.
  The bottom navigation container uses one shared host comfort inset
  (`--mobile-bottom-nav-comfort-inset: 18px` as of
  `20260609-dock-back-swipe-stability-v661`) so newly installed iOS PWAs are not
  visually flush with the viewport edge. Tab content should not be lifted by
  default (`--mobile-bottom-nav-visual-lift: 0px` as of
  `20260609-bottom-surface-visible-v652`); any future small visual lift must
  stay inside the tab content transform, not in a bottom offset that moves the
  entire Dock/nav stack. Runtime bottom overflow is diagnostic-only by default:
  `--mobile-bottom-nav-overflow-clamp: 0px` prevents iOS standalone PWA
  viewport-coordinate mismatches from becoming a large bottom offset that lifts
  the full Dock/nav stack.
  Runtime bottom underflow is separate from overflow: if a fixed bottom nav
  reports `rect.bottom` above the layout viewport on an iOS standalone PWA
  cold/re-login path, `updateMobileBottomNavReservation()` may apply the bounded
  `--mobile-bottom-nav-underflow-clamp` correction. The normal host comfort
  inset is not underflow: diagnostics record `navBottomGapRaw`, and
  `navBottomUnderflowRaw` is only `max(0, navBottomGapRaw - comfortInset)`.
  This prevents the runtime from alternating between the intended host inset
  and 0px on repeated layout measurements.
  Standalone/fullscreen PWA surface underflow is diagnostic-only for host
  chrome as of `20260609-bottom-surface-visible-v652`: if the measured `100lvh`
  surface is taller than the layout viewport and the safe-area probe exposes a
  positive top inset, `updateMobileBottomNavReservation()` records the measured
  `100lvh - rect.bottom` delta as `surfaceUnderflowRaw` /
  `surfaceUnderflowCandidate`. It must not apply that delta as a negative
  bottom offset for the primary fixed nav, because iOS can clip or hide tab
  content once the fixed bar is placed outside the layout viewport. Global Dock
  and composer offsets must stay derived from the visible fixed nav position.
  Underflow correction may only run against a laid-out nav rect with positive
  width, height, and bottom coordinate; collapsed early-start rects such as
  `0/0/0` must leave the runtime bottom offset at the comfort inset instead of
  writing a negative correction.
  Chat composer context rows must bridge into the input row with the same
  opaque `var(--ui-chrome)` background as the composer. A transparent gap
  between context chips and the input row is a failing mobile bottom-region
  state because page content can show through during PWA viewport settles.
  When measuring fixed bottom chrome, compare `getBoundingClientRect()` against
  the layout viewport (`window.innerHeight` / `documentElement.clientHeight`),
  not `visualViewport.height`. iOS standalone PWA can report a shorter visual
  viewport because of safe-area/status chrome; using it as the primary bottom
  boundary can falsely detect bottom overflow and push the whole bottom stack
  upward by far more than the intended visual lift.
- Touch tablets up to `1366px` wide use the same mobile shell as phone portrait:
  a single-column app, bottom navigation, and an overlay sidebar. Do not let
  iPad-like landscape layouts fall back to the desktop fixed sidebar or hide the
  primary bottom navigation.
- The mobile shell rule does not mean all embedded previews should be forced
  into phone projection. PDF preview links must keep phone widths in the
  embedded Hermes viewer but route wide tablet/foldable surfaces to same-window
  native/original document preview when a same-origin source URL is available.
  Word/DOCX must stay in the Home AI `file-viewer.html` preview path on wide
  surfaces because raw DOCX URLs usually download instead of rendering inline.
- Top-level PWA shell changes must keep time, battery, and Wi-Fi indicators
  visible on mobile; browser-shell guards and full-viewport overlays need
  explicit status-bar/safe-area checks. The installed iOS PWA shell should use
  opaque status-bar modes (`default` for light/system-light, `black` for dark),
  not `black-translucent`: in dark standalone PWA runs, WebKit can report
  `100vh`/`100lvh` as the full physical screen while `100dvh`, `innerHeight`,
  fixed bottom chrome, and the document root are shortened by the top safe-area
  inset. Using a translucent status bar makes the bottom nav appear lifted and
  can push plugin iframe tops under the status area. The app already paints
  status-bar background through safe-area CSS when the inset is exposed, so it
  does not need transparent status-bar content.
- The initial inline boot splash is part of the mobile shell contract. On iOS
  installed PWA cold start, `100dvh` can be reported before WebKit settles the
  standalone viewport, so the mobile boot splash must start below the safe area
  instead of relying only on centered `100dvh` placement. This protects the
  first frame before app modules can run viewport-settle JavaScript.
- Embedded plugin host pages hide the normal Home AI topbar, so the iframe host
  `.main` must use the mobile status-bar safe-area top inset instead of raw
  `top: 0`. The iframe bottom reservation must be derived from the visible Home
  AI bottom stack, not a fixed plugin-context footer height. Embedded hosts such
  as Codex, Note, and Wardrobe should reserve the top safe-area through `.main`
  padding rather than a device-specific bottom offset. If a temporary
  chrome-free preview hides Home AI bottom chrome, the host publishes the shared
  bottom comfort inset through
  `hermes.plugin.viewport.footer.safeAreaBottom` so the plugin iframe can pad
  its own composer without a visible host footer.
- `POST /api/client-layout-diagnostics` is the bounded real-device layout
  diagnostic channel for temporary PWA debugging. It stores sanitized viewport,
  CSS variable, and element-rect snapshots in
  `<data>/diagnostics/client-layout.jsonl`; `GET /api/client-layout-diagnostics`
  requires a valid Home AI key and returns recent sanitized entries. Do not log
  access keys, cookies, message text, thread content, or raw plugin content.
  The diagnostic payload may include non-secret PWA chrome state such as the
  current `apple-mobile-web-app-status-bar-style`, theme mode, root/app class
  lists, numeric safe-area probe values, and measured `100vh` / `100dvh` /
  `100lvh` / `100svh` heights so real iOS viewport behavior can be debugged
  without hard-coding a device-specific correction.
- The settings sheet owns device-local display preferences. Theme mode is a
  three-state client preference: `system`, `light`, or `dark`. The shell must
  set `data-theme` before loading CSS to avoid first-paint flashes, update
  `theme-color` / `apple-mobile-web-app-status-bar-style`, and listen for system
  color-scheme changes only while the selected mode is `system`.
- Embedded-plugin launches must pass the current device-local theme and font
  size as sanitized appearance metadata. Hermes `standard` maps to plugin
  `default`; the plugin iframe should not be initialized until the launch entry
  carries the matching `pluginTheme` and `pluginFontSize` query values.
- Embedded-plugin launch manifest caches must include the sanitized appearance
  key, not only the workspace id. If a user changes theme or font size, the next
  plugin entry must request a fresh launch token instead of reusing an older
  `system/default` manifest.
- Static hotfixes that touch cache-sensitive client assets, including
  `public/app-*.js`, `public/styles.css`, `public/index.html`,
  `public/service-worker.js`, or viewer HTML files, must bump the
  client/cache version in the same change before deployment. Deploying changed
  JavaScript under an unchanged `?v=<client-version>` URL can leave installed
  PWA/service-worker clients on the old script even when the production file has
  been copied.
- When the app detects a server/client version mismatch during startup, status
  refresh, foreground, focus, push, or timer checks, it must show the refresh
  notice and must not automatically reset or reload the client. The user-visible
  refresh action navigates to the current app URL with `resetClient=1` and
  `targetVersion=<server-version>`; the inline app-shell reset clears bounded
  static caches, unregisters Service Workers for explicit hard refresh,
  preserves the stored Access Key/theme/font preferences plus the
  `hermesPluginTopicUsage`, `hermesPluginTopicOrder`, and
  `hermesPinnedPluginBottomTabs` local caches, including their
  workspace-suffixed variants, and
  returns to the app with a cache-busting query. Manual update recovery must not navigate to
  `/client-reset.html`, because mobile PWA clients can open that page in a
  browser wrapper.
- The Service Worker must treat app-shell requests (`/`, `/index.html`, and
  `/hermes-mobile/`) as network-first with `cache: "no-store"`. Killing and
  reopening the PWA after a version bump must not replay an old cached app shell
  before checking the network.
- The boot splash must not leave a user on an endless animated progress bar. If
  startup has not completed after the short watchdog window, the shell may run
  one session-scoped soft reload for the current client version; if startup
  still has not completed, retry/reset controls must become visible. The
  non-hard reset path may clear bounded static caches but must preserve the
  stored Access Key, theme, font preferences, and plugin-topic preference
  caches. Service Worker unregister is reserved for explicit hard reset and
  must also be bounded by a timeout.
- The app shell stores a bounded `hermesWebRouteSnapshot` with route ids and
  scroll position on background, foreground, internal route opens, and throttled
  conversation scroll. If iOS/PWA or the browser process reloads the app without
  an explicit URL route, startup should restore that snapshot before falling
  back to the default launch view. Explicit notification/deep-link URL
  parameters must continue to take precedence over the stored snapshot.
- On Windows, do not rewrite static/test files containing Chinese text through
  PowerShell `Get-Content -Raw` plus `Set-Content` / `WriteAllText` unless the
  command explicitly preserves UTF-8 from a known UTF-8 source. Prefer
  `apply_patch` for targeted edits or a Node-based byte/UTF-8 script for
  mechanical version replacement. This prevents mojibake in UI strings and test
  regexes.
- Theme changes must be verified against real app surfaces, not only root token
  strings. At minimum, check sidebar/top bar, composer, user and assistant
  messages, topic cards, Action Inbox rows and deliverable tags, Growth warning
  or danger cards, and the settings/access-key sheet in light, dark, and system
  mode. A dark-mode fix is incomplete if any of those surfaces still uses a
  hard-coded pale background with low-contrast foreground text.
- Visual smoke checks should capture both screenshots and bounding rectangles
  for the changed fixed/sticky surfaces. `scripts/playwright-visual-smoke.js`
  records viewport metrics, key shell rectangles, horizontal overflow, bottom
  navigation bounds, and composer/bottom-nav overlap. Browser-mode visual smoke
  is useful for mechanical layout evidence, but installed-PWA behavior still
  requires the PWA/device harness when the issue is PWA-specific.
- Authenticated visual smoke should pass the Access Key by file path only:
  `--access-key-path <path>` or `HERMES_VISUAL_SMOKE_ACCESS_KEY_PATH`. The
  harness injects `localStorage.hermesWebKey` and the `hermes_web_key` cookie
  before app startup, may set `--workspace-id` and `--view`, and reports only
  bounded auth/layout state. It must not print the key or raw local key file
  contents.
- The same harness records navigation timing, Chromium long-task entries, and
  the bounded `localStorage.hermesStartupPerfLast` summary when present. Long
  tasks above `--long-task-warn-ms` default to warnings; set
  `HERMES_VISUAL_SMOKE_FAIL_ON_LONG_TASK=1` only for a calibrated performance
  gate after measuring normal local production variance.
- Authenticated cross-surface mobile navigation must use
  `scripts/authenticated-navigation-flow-smoke.js` when the change can affect
  Chat, Inbox, Topics, plugin/topic entry, return behavior, cached surface
  reuse, bottom navigation, composer layout, tab-switch timing, horizontal
  overflow, or long-task behavior. The harness covers Chat -> Inbox -> Topics
  -> plugin/topic entry -> return, records active nav, visible surfaces,
  bottom-nav bounds, composer bounds, composer/nav overlap, viewport metrics,
  horizontal overflow, layout stability, long-task summary, navigation timing,
  tab-switch timing, and stale cached surface warnings. It accepts Access Keys
  only through `--access-key-path` or `HERMES_NAV_FLOW_ACCESS_KEY_PATH` and must
  not print the key or raw key path.
- For mobile and tablet layout work, run at least the default phone portrait
  viewport and one explicit wider viewport with `--viewport <width>x<height>`.
  Use `--mobile` or `--desktop` only when the target shell mode needs to be
  forced; otherwise the harness keeps the mobile/touch browser context by
  default so tablet PWA-style checks do not accidentally become desktop checks.
- Dark mode should follow the mobile control-panel reference: near-black page
  background, slightly lifted charcoal cards, low-noise hairlines, high-contrast
  off-white text, and brighter low-saturation status colors. Hard-coded dark
  green text is not acceptable on dark surfaces; use the theme variables for
  headings, receipt labels, file tags, status chips, and run/tool panels.
- Floating menus, context menus, inline details popovers, and action panels must
  use theme tokens such as `--ui-menu-bg`, `--ui-sheet`, `--text`,
  `--ui-hairline-strong`, and `--shadow`. Dark/system-dark fixes are incomplete
  if a menu or popover still relies on a hard-coded white/pale background in its
  base rule and only happens to work because of a separate override.
- Settings/access-key, Owner Admin, Runtime Config, Plugin Admin, and group
  sheet surfaces are covered by the iOS PWA `dark-admin-surfaces` scenario.
  They must use theme tokens for panels, buttons, chips, code values, and
  status rows; a dark-mode pass is invalid if any sampled surface keeps a pale
  solid background or low-contrast dark green/brown text.
- Growth teaching card detail, native Growth submission, program, coin, and
  readiness surfaces are covered by the iOS PWA `dark-growth-surfaces`
  scenario. Teaching steppers, worked examples, feedback panels, action chips,
  reward/coin panels, and readiness checks must use theme tokens in both
  dark and system-dark mode; a dark-mode pass is invalid if any sampled Growth
  surface keeps a pale solid background or low-contrast dark green/brown text.
- In dark/system-dark mode, green/success semantics may remain in backgrounds,
  borders, dots, or subtle status surfaces, but text that previously used dark
  green must resolve to off-white (`--ink` / `--ui-success-ink`) unless a
  dedicated contrast check proves it remains readable. This applies to Action
  Inbox source/status badges, Automation success labels, group/member action
  buttons, topic secondary-page header controls and directory chips, and
  reading fullscreen controls.
- Settings-sheet option groups are a grouped-control surface. In dark/system-dark
  mode, active theme, font, and default-model options must use a visible
  high-contrast selected frame plus an inner outline; a subtle fill alone is not
  enough to communicate the selected option.
- Long assistant replies must keep their per-reply start/end jump controls
  available after streaming settles. Arrow visibility recalculation must resolve
  the current DOM at execution time and include a delayed settle pass after final
  markdown/layout replacement so a stale pre-terminal message node cannot leave
  the footer arrow hidden. Eligibility must use the assistant message's original
  rendered height and viewport geometry: if the rendered reply cannot fit in one
  conversation screen, the jump control must be visible. Character-count or rich
  render limits are only no-layout fallbacks. When the reply footer is already in
  view, the up/start arrow must stay inline beside the Usage/Skill/status chips
  instead of floating away to the top of the message. Once content estimation or
  measured layout proves a reply is long, terminal Usage/Skill/run-status footer
  refreshes must not clear that eligibility.
- Active assistant replies must not stream the full growing answer directly into
  the visible receipt. While status is `queued` or `running`, the message should
  show a fixed-line streaming receipt preview with hidden overflow and keep the
  inline run-progress panel bounded in the same message body. After the assistant
  reaches a terminal state, the normal full Markdown/receipt renderer takes over.
- Save-to-Note success feedback must remain a local Hermes route action. If the
  Note API returns a saved note id, the toast should be clickable/keyboard
  actionable and open the Note plugin with that id in the plugin route payload.
  The client must not hard-code deployment hostnames. Note receipt titles are a
  server-side responsibility: prefer the receipt heading, then the first
  meaningful content line, and add a short plugin prefix when a plugin context is
  available.
- Mobile orientation changes must have a deterministic viewport recovery pass:
  clear any temporary conversation scroll-layer reset, clear stale keyboard
  viewport CSS when the composer is no longer actually focused, recompute bottom
  navigation reservation, and recalculate long-message jump controls after the
  orientation settles.
- Do not expose raw local paths or sensitive metadata in normal UI.
- Do not rely on cached clients receiving changes without a version bump.
