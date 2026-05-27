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
- Do not expose raw local paths or sensitive metadata in normal UI.
- Do not rely on cached clients receiving changes without a version bump.
