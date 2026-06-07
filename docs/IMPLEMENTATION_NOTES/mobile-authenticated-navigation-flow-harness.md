# Mobile Authenticated Navigation Flow Harness

Last updated: 2026-06-07.

## Purpose

`scripts/authenticated-navigation-flow-smoke.js` is the repeatable acceptance
path for authenticated mobile navigation and tab switching. It turns the
previous manual observation loop into bounded evidence for:

- shell authentication and startup;
- Chat, Inbox, Topics, plugin/topic entry, and return flow;
- active bottom navigation state;
- visible surface after each switch;
- bottom navigation and composer bounds;
- composer/bottom-nav overlap;
- viewport and horizontal overflow;
- long tasks and layout-shift summary;
- tab-switch timing;
- stale cached surface warnings.

This harness complements `scripts/playwright-visual-smoke.js`. The visual smoke
is still the focused screenshot/bounds tool for a single target view. The
authenticated navigation flow is the cross-surface continuity tool for mobile
route, cache, stale-surface, and tab-switch regressions.

## Local Production Command

Run against the local production listener after starting Home AI on
`http://127.0.0.1:8797`:

```powershell
node scripts\authenticated-navigation-flow-smoke.js `
  --url http://127.0.0.1:8797 `
  --access-key-path <owner-access-key-file> `
  --workspace-id owner `
  --viewport 390x844 `
  --json
```

The harness reads the Access Key from the file, injects
`localStorage.hermesWebKey`, and sets the `hermes_web_key` cookie before app
startup. It must not print the key, raw key file path, cookies, push endpoints,
or user content. Output may include bounded origin, workspace id, viewport,
selector names, timings, rectangle metrics, and failure codes.

For touch-tablet coverage:

```powershell
node scripts\authenticated-navigation-flow-smoke.js `
  --url http://127.0.0.1:8797 `
  --access-key-path <owner-access-key-file> `
  --workspace-id owner `
  --viewport 1024x1366 `
  --json
```

## Acceptance Fields

Every run must emit `steps[]` entries that include:

- `currentView` and `activeNav`;
- `surfaces` and `surfaceVisible`;
- `bottomNavBounds`;
- `composerBounds`;
- `composerNavOverlap`;
- `viewportMetrics`;
- `horizontalOverflow`;
- `longTaskSummary`;
- `layoutStability`;
- `navigationTiming`;
- `tabSwitchTimingMs`;
- `staleSurfaceWarnings`.

The harness fails when the authenticated shell is not visible, horizontal
overflow appears, the bottom nav is outside the viewport, the composer overlaps
the bottom nav, the expected active nav is wrong, or the expected surface for a
required step is not visible.

Plugin/topic entry is accepted as the current available plugin app/topic entry.
If the plugin entry immediately returns to the Topics surface, the harness
records a warning rather than silently passing without evidence.

## When Required

Run this harness for:

- bottom navigation changes;
- topic/capability page changes;
- plugin topic or plugin entry changes;
- cached list/message reuse changes;
- composer/nav layout changes;
- mobile shell startup changes;
- static client cache behavior that could replay stale UI;
- touch-tablet layout changes.

Browser-mode Playwright evidence is valid mechanical evidence for this harness.
If the defect is PWA-specific, still add installed-PWA evidence from Android,
iOS Simulator/Appium, or a physical device according to the mobile UI contract.

## Focused Tests

```powershell
node --check scripts\authenticated-navigation-flow-smoke.js
node tests\authenticated-navigation-flow-smoke-harness.test.js
```

When UI files are touched, also run:

```powershell
node tests\task-list-ui.test.js
node tests\playwright-visual-smoke-harness.test.js
```
