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
- Do not copy OAuth tokens into profile-local files unless the deployment explicitly uses that layout.
- Do not add local hosts overrides for xAI/Grok domains unless DNS comparison against public resolvers proves a real local resolution problem.

## Validation

- Check `/api/status?detail=1` for worker health and selected profiles.
- For live smoke, use a short authenticated Grok request through Hermes Mobile or the relevant live Gateway endpoint.
- For Automation/Cron `x_search`, validate through a cron/Automation path or a controlled plugin call that uses the bridge-host proxy prefix, not only ordinary `@Grok`.
- In hybrid mode, validate the cold proxy path too: stop or leave `grokgw1`
  configured, trigger the bridge-host proxy, and confirm bridge-host starts
  only `grokgw1`, `/api/status?detail=1` stays healthy, and 18761 becomes
  healthy without starting unrelated worker profiles.
- Avoid routine schema-smoke commands that start a same-profile Gateway with `--replace` against live production profiles.

## Debug Pointers

If Grok calls go to the wrong provider, inspect worker/profile selection before prompt/model parameters. If the worker is selected but auth fails, repair xAI OAuth in the Gateway profile rather than changing Hermes Mobile routing.
