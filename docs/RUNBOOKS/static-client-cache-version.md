# Runbook: Static Client Cache Version

## Symptom

Phone UI does not show a recent static/front-end change, or behavior differs between clients.

## Checks

1. Confirm static version in:
   - `public/index.html`
   - `public/service-worker.js`
   - `public/directory-viewer.html`
   - `tests/task-list-ui.test.js`
2. Check production:
   - `/api/status?detail=1`
   - `/api/client-version?clientVersion=<expected-version>`
3. If a phone still shows old behavior, confirm it refreshed to the expected version.
4. If a missed file is copied later under the same `?v=<client-version>` URL,
   treat the deployment as cache-tainted and issue a new static version. Do not
   rely on overwriting the production file with the unchanged query string.

## Deployment

Static-only sync:

1. Backup changed production files.
2. Sync changed `public/` and focused `tests/` files.
3. Run focused production syntax/tests.
4. Do not restart listener or Gateway Pool.

When a stale PWA shell is suspected, verify the old version reports
`refreshRequired=true` and the new version reports `refreshRequired=false` from
`/api/client-version`. Current clients run a one-time session-scoped
same-shell recovery on startup/foreground/API-response version mismatch by
navigating the current app URL with `resetClient=1` and
`targetVersion=<server-version>`. The inline app-shell reset clears bounded
static caches, unregisters Service Workers, preserves the stored Access
Key/theme/font preferences, and returns to the app with a cache-busting query.
Automatic update recovery must not use `/client-reset.html`, because mobile PWA
clients can open that page in a browser wrapper. If that does not happen,
inspect whether the client is still executing a pre-recovery static version.
The Service Worker must fetch app-shell requests (`/`, `/index.html`, and
`/hermes-mobile/`) network-first with `cache: "no-store"` so killing and
reopening the PWA does not replay an old cached shell before checking the
network.
The boot page also has a bounded startup watchdog: one soft reload is allowed
per client version when startup does not complete, and retry/reset controls must
appear shortly after that. A reset page that clears caches or unregisters the
Service Worker must use a timeout so the recovery screen cannot become the next
permanent hang.

## Constraint

Do not rely on service worker cache invalidation without a version bump.
