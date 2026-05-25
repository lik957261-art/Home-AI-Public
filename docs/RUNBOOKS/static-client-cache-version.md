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

## Deployment

Static-only sync:

1. Backup changed production files.
2. Sync changed `public/` and focused `tests/` files.
3. Run focused production syntax/tests.
4. Do not restart listener or Gateway Pool.

## Constraint

Do not rely on service worker cache invalidation without a version bump.
