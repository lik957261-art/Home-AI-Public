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
PWA-in-place recovery on startup/foreground/API-response version mismatch, and
the Service Worker posts a client-version update message on activation. Automatic
version recovery should update the Service Worker and reload in place; it must
not unregister the Service Worker or jump through browser-shell reset unless the
user explicitly opens `/client-reset.html?hard=1`. If that does not happen,
inspect whether the client is still executing a pre-recovery static version.

## Constraint

Do not rely on service worker cache invalidation without a version bump.
