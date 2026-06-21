# Module: Grok Gateway

## Responsibility

The Grok Gateway module routes `@Grok` model requests through a dedicated low-permission Gateway profile configured for xAI OAuth.

Hermes Mobile should select the correct profile; it should not assume that passing a model name to a generic worker changes the official Gateway agent provider.

## Core Files

- `adapters/gateway-run-start-service.js`
- `adapters/gateway-run-toolset-routing-service.js`
- `adapters/gateway-run-stream-service.js`
- `gateway-plugins/hermes-mobile-web/__init__.py`
- `scripts/bridge-host.js`
- `scripts/grok-auth-metadata-smoke.js`
- `scripts/grok-xai-oauth-closure-checklist.js`
- `scripts/hermes-mobile-cron-dispatcher.py`
- `scripts/start-gateway-pool.ps1`
- `scripts/start-low-gateways.sh`
- `docs/MODULES/gateway-pool.md`

## Runtime Shape

- Dedicated profile: `grokgw1`
- Provider: `xai-oauth`
- Current exposed model family: `grok-4.3`
- Routing should use `preferred_worker_profiles: ["grokgw1"]` or equivalent manifest/profile selection.
- Windows production historically uses `grokgw1` on `18761`. NAS production
  must not assume that port: the maintained NAS hybrid manifest can use `18761`
  for an ordinary workspace OpenAI/Codex worker. NAS Grok must be discovered
  from the manifest by `provider=xai-oauth` and `profile=grokgw1`; on the
  current NAS host the planned Grok port is `18763`.
- The live port is manifest-derived from `gateway-pool-manifest.json`, but it
  must be stable across later personal workspace provisioning. Additional
  low-permission personal workers are appended after the existing Grok worker;
  they must not force `grokgw1` onto a later port.
- Cron-side `x_search` calls may run from a different WSL distro than the Grok Gateway worker. In that case the `x_search` proxy URL should use the bridge-host proxy prefix `/bridge/grok-gateway-proxy`. The plugin appends `/v1/responses`, so the actual bridge-host request path is `/bridge/grok-gateway-proxy/v1/responses`, and bridge host forwards only to the configured local Grok Gateway `/v1/responses` endpoint.
- The `hermes-mobile-web` plugin should default `x_search` to that bridge-host route when no explicit `HERMES_MOBILE_X_SEARCH_PROXY_URL` is available. Do not assume the plugin process can reach the Grok worker on its own `127.0.0.1`.

Do not expose stale Grok variants unless a live Gateway profile actually supports them.

## Bridge-Host Proxy For Automation `x_search`

Automation/Cron runners and web plugin processes may not share the same
loopback namespace as the dedicated Grok Gateway worker. Normal `@Grok` can be
healthy while Automation `x_search` fails or returns generic/tool-error output.

The durable path is:

1. Cron dispatcher derives the Windows host bridge URL when needed.
2. Cron child receives
   `HERMES_MOBILE_X_SEARCH_PROXY_URL=http://<windows-host>:8798/bridge/grok-gateway-proxy`.
3. `gateway-plugins/hermes-mobile-web` posts to
   `${HERMES_MOBILE_X_SEARCH_PROXY_URL}/v1/responses`.
4. `scripts/bridge-host.js` accepts
   `POST /bridge/grok-gateway-proxy/v1/responses` and forwards the body to
   `HERMES_MOBILE_GROK_GATEWAY_URL` when set, otherwise the first enabled
   `provider=xai-oauth` worker in the Gateway Pool manifest, otherwise the
   legacy `http://127.0.0.1:18761` fallback.

The bridge proxy requires an Authorization bearer key and must not expose OAuth
tokens or profile auth files.

In hybrid/on-demand Gateway Pool mode, the bridge proxy must not assume the
dedicated Grok worker is already warm. Before forwarding, bridge-host checks the
target Grok Gateway `/health`; if it is stopped, bridge-host starts only the
manifest Grok profile, currently `grokgw1`, waits for health, and then forwards
the request. Concurrent `x_search` proxy requests share one start attempt so a
cold Grok worker does not create multiple `start-gateway-pool.ps1` processes.
`HERMES_MOBILE_GROK_GATEWAY_PROXY_AUTOSTART=0` can disable this only for a
controlled diagnostic run.

If `gateway-plugins/hermes-mobile-web/__init__.py` changes, restart Gateway
Pool. If only `scripts/bridge-host.js` changes, restart listener/bridge-host.
If `scripts/hermes-mobile-cron-dispatcher.py` changes, restart the cron sidecar.

## Auth Boundary

- xAI/Grok auth lives in the Gateway profile/auth store, not in browser payloads or Hermes Mobile docs.
- Windows local production should default `grokgw1` to the same owner/workspace
  shared auth store as the other low-permission Gateways:
  `C:\ProgramData\HermesMobile\gateway-worker\telemetry\profiles\shared-auth\auth.json`.
  This keeps the same authorized tool/provider set available across workers and
  avoids a Grok-only auth store drifting out of date.
- `HERMES_GROK_GATEWAY_AUTH_ROOT`, `HERMES_GROK_GATEWAY_AUTH_PATH`, and
  `HERMES_GROK_GATEWAY_AUTH_LOCK_PATH` remain explicit override knobs for a
  deployment that intentionally isolates Grok credentials.
- `scripts/grok-auth-metadata-smoke.js` also recognizes
  `HERMES_GROK_GATEWAY_SHARED_AUTH_PATH`,
  `HERMES_MOBILE_GROK_SHARED_AUTH_PATH`, and
  `HERMES_WEB_GROK_SHARED_AUTH_PATH` for the shared fallback store. These are
  diagnostic inputs only; the smoke reports metadata booleans and must not
  print the configured file paths.
- A profile-local `providers.xai-oauth` or `credential_pool.xai-oauth` entry
  shadows global fallback. If an isolated Grok auth store has a revoked
  refresh token, it can keep failing even when the shared owner auth store is
  usable; either re-authenticate that isolated store or point Grok back at the
  shared store.
- Use `scripts/grok-auth-metadata-smoke.js` to inspect only non-secret xAI
  OAuth metadata for the profile-local and shared auth stores. With
  `--require-access-token`, it fails as
  `grok_xai_oauth_access_token_missing` when no configured store has an
  `access_token`. The script recognizes both singleton provider state and
  `credential_pool.xai-oauth` entries, including the array shape written by
  current `hermes auth add xai-oauth` flows. The script must not print auth
  paths or token values.
- Use `scripts/grok-xai-oauth-closure-checklist.js --markdown` as the
  operator handoff after any manual xAI OAuth re-authentication. It ties the
  bounded metadata smoke, profile/provider configuration audit, live
  `gateway-pool-production-smoke.js --provider xai-oauth --expected-profile
  grokgw1`, and optional Automation `x_search` proxy proof into one checklist.
  The checklist is read-only and does not inspect token files or execute OAuth.
- On macOS production, `scripts/macos-grok-xai-reauth.sh` is the bounded
  operator entrypoint for re-authenticating the `grokgw1` xAI OAuth profile.
  It uses Hermes' `auth add xai-oauth --type oauth --manual-paste` flow under
  the target `hm-owner` profile environment, then immediately reruns the
  metadata smoke. The callback URL or authorization code belongs only in that
  terminal session and must not be pasted into chat, docs, logs, or handoffs.
  The same helper can be launched from the installed desktop wrapper
  `HomeAI-Grok-XAI-Reauth.command`; the wrapper only calls the live helper and
  does not contain secrets or OAuth material.
- The aggregate Mac production closure harness marks Grok/xAI as
  `deferred_manual_oauth_not_included`. Treat that as a scoped production gate,
  not as a successful Grok provider-auth result.
- Do not copy OAuth tokens into profile-local files unless the deployment explicitly uses that layout.
- Do not add local hosts overrides for xAI/Grok domains unless DNS comparison against public resolvers proves a real local resolution problem.

## Validation

- Check `/api/status?detail=1` for worker health and selected profiles.
- Generate `node scripts\grok-xai-oauth-closure-checklist.js --markdown` for
  the current operator closure commands before accepting a manual OAuth repair.
- Run `node scripts\grok-auth-metadata-smoke.js --profile-auth-file <file> --shared-auth-file <file> --require-access-token --json` before changing routing when logs say xAI OAuth is missing token state.
- For live smoke, use
  `node scripts\gateway-pool-production-smoke.js --key-file <file> --model
  grok-4.3 --provider xai-oauth --expected-profile grokgw1` or an equivalent
  short authenticated Grok request through Hermes Mobile.
- For Automation/Cron `x_search`, validate through a cron/Automation path or a controlled plugin call that uses the bridge-host proxy prefix, not only ordinary `@Grok`.
- In hybrid mode, validate the cold proxy path too: stop or leave `grokgw1`
  configured, trigger the bridge-host proxy, and confirm bridge-host starts
  only `grokgw1`, `/api/status?detail=1` stays healthy, and 18761 becomes
  healthy without starting unrelated worker profiles.
- Avoid routine schema-smoke commands that start a same-profile Gateway with `--replace` against live production profiles.

## Debug Pointers

If Grok calls go to the wrong provider, inspect worker/profile selection before prompt/model parameters. If the worker is selected but auth fails, repair xAI OAuth in the Gateway profile rather than changing Hermes Mobile routing.
