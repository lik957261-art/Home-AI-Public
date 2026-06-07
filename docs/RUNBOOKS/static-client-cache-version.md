# Runbook: Static Client Cache Version

## Symptom

Phone UI does not show a recent static/front-end change, or behavior differs between clients.

## Checks

1. Confirm static version in:
   - `public/index.html`
   - `public/service-worker.js`
   - `public/directory-viewer.html`
   - `tests/task-list-ui.test.js`
2. Prove the production origin identity before any API smoke. Use the exact
   origin that will be tested and verify it is Hermes Mobile, for example by
   reading a Hermes app-shell `data-client-version` or Hermes-specific
   `/api/public-config` fields. If this proof fails, stop with
   `production_origin_identity_mismatch`; do not keep trying common local ports
   or the first listening Node process.
3. Check production:
   - `/api/status?detail=1`
   - unauthenticated `/api/client-version?clientVersion=<expected-version>`
4. If a phone still shows old behavior, confirm it refreshed to the expected version.
5. If a missed file is copied later under the same `?v=<client-version>` URL,
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
unauthenticated `/api/client-version`. Current clients should show a refresh
notice on startup/foreground/API-response version mismatch and should not
automatically reload or reset the client. The visible refresh action navigates
the current app URL with `resetClient=1` and `targetVersion=<server-version>`. The inline
app-shell reset clears bounded static caches, unregisters Service Workers for
explicit hard refresh, preserves the stored Access Key/theme/font preferences
and plugin-topic preference caches, and returns to the app with a cache-busting
query. Manual update recovery must
not use `/client-reset.html`, because mobile PWA clients can open that page in a
browser wrapper. If that does not happen, inspect whether the client is still
executing a pre-recovery static version.
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
