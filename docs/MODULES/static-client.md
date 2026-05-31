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
- `/api/client-version?clientVersion=<new-version>`

## Deployment

Static-only changes:

- backup changed production files
- sync changed static/test files
- run focused production checks
- do not restart listener or Gateway Pool

Server/route changes:

- listener restart is required

Gateway plugin/schema/profile changes:

- Gateway Pool restart is required

## Constraints

- Mobile UI must preserve the OS status bar, safe areas, bottom navigation, stable action icons, and readable compact panels.
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
- Theme changes must be verified against real app surfaces, not only root token
  strings. At minimum, check sidebar/top bar, composer, user and assistant
  messages, topic cards, Action Inbox rows and deliverable tags, Growth warning
  or danger cards, and the settings/access-key sheet in light, dark, and system
  mode. A dark-mode fix is incomplete if any of those surfaces still uses a
  hard-coded pale background with low-contrast foreground text.
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
