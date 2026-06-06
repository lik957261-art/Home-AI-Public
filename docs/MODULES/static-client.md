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

## Constraints

- Mobile UI must preserve the OS status bar, safe areas, bottom navigation, stable action icons, and readable compact panels.
- Mobile bottom navigation must keep a fixed visual container height. Do not
  add `env(safe-area-inset-bottom)` to `--mobile-bottom-nav-height` or
  `--plugin-context-bottom-nav-height`. iOS reports safe-area values per
  browser/PWA/origin context, so two deployments on the same physical phone can
  expose different values. Native tab bars remain stable because the bar height
  is fixed and the safe area is handled as background or internal spacing, not
  as a layout-height multiplier.
- Bottom safe-area may only contribute a small internal content buffer through
  `--mobile-bottom-nav-content-safe-area`. Topic docks, plugin context bars,
  composer offsets, and runtime bottom-nav measurements must be based on the
  fixed bar height plus measured bounds, not a raw safe-area-expanded CSS
  height. Font-size preferences must not increase the bottom nav container
  height beyond `--mobile-bottom-nav-height`.
- Touch tablets up to `1366px` wide use the same mobile shell as phone portrait:
  a single-column app, bottom navigation, and an overlay sidebar. Do not let
  iPad-like landscape layouts fall back to the desktop fixed sidebar or hide the
  primary bottom navigation.
- Top-level PWA shell changes must keep time, battery, and Wi-Fi indicators visible on mobile; browser-shell guards and full-viewport overlays need explicit status-bar/safe-area checks.
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
  preserves the stored Access Key/theme/font preferences, and returns to the app
  with a cache-busting query. Manual update recovery must not navigate to
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
  stored Access Key, theme, and font preferences. Service Worker unregister is
  reserved for explicit hard reset and must also be bounded by a timeout.
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
  instead of floating away to the top of the message.
- Mobile orientation changes must have a deterministic viewport recovery pass:
  clear any temporary conversation scroll-layer reset, clear stale keyboard
  viewport CSS when the composer is no longer actually focused, recompute bottom
  navigation reservation, and recalculate long-message jump controls after the
  orientation settles.
- Do not expose raw local paths or sensitive metadata in normal UI.
- Do not rely on cached clients receiving changes without a version bump.
