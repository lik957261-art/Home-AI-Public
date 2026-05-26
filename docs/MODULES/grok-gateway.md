# Module: Grok Gateway

## Responsibility

The Grok Gateway module routes `@Grok` model requests through a dedicated low-permission Gateway profile configured for xAI OAuth.

Hermes Mobile should select the correct profile; it should not assume that passing a model name to a generic worker changes the official Gateway agent provider.

## Core Files

- `adapters/gateway-run-start-service.js`
- `adapters/gateway-run-toolset-routing-service.js`
- `adapters/gateway-run-stream-service.js`
- `scripts/start-gateway-pool.ps1`
- `scripts/start-low-gateways.sh`
- `docs/MODULES/gateway-pool.md`

## Runtime Shape

- Dedicated profile: `grokgw1`
- Provider: `xai-oauth`
- Current exposed model family: `grok-4.3`
- Routing should use `preferred_worker_profiles: ["grokgw1"]` or equivalent manifest/profile selection.
- Cron-side `x_search` calls may run from a different WSL distro than the Grok Gateway worker. In that case the `x_search` proxy URL should be the bridge-host route `/bridge/grok-gateway-proxy`, which forwards only to the configured local Grok Gateway `/v1/responses` endpoint.
- The `hermes-mobile-web` plugin should default `x_search` to that bridge-host route when no explicit `HERMES_MOBILE_X_SEARCH_PROXY_URL` is available. Do not assume the plugin process can reach the Grok worker on its own `127.0.0.1`.

Do not expose stale Grok variants unless a live Gateway profile actually supports them.

## Auth Boundary

- xAI/Grok auth lives in the Gateway profile/auth store, not in browser payloads or Hermes Mobile docs.
- Do not copy OAuth tokens into profile-local files unless the deployment explicitly uses that layout.
- Do not add local hosts overrides for xAI/Grok domains unless DNS comparison against public resolvers proves a real local resolution problem.

## Validation

- Check `/api/status?detail=1` for worker health and selected profiles.
- For live smoke, use a short authenticated Grok request through Hermes Mobile or the relevant live Gateway endpoint.
- Avoid routine schema-smoke commands that start a same-profile Gateway with `--replace` against live production profiles.

## Debug Pointers

If Grok calls go to the wrong provider, inspect worker/profile selection before prompt/model parameters. If the worker is selected but auth fails, repair xAI OAuth in the Gateway profile rather than changing Hermes Mobile routing.
