# Runbook: Grok Gateway Auth Or Routing Failure

## Symptoms

- `@Grok` replies fail while other Gateway workers are healthy.
- A Grok request is handled by a non-Grok model/provider.
- Gateway reports auth errors for xAI/Grok.
- Automation jobs using `x_search` produce generic results or tool errors while normal `@Grok` requests remain healthy.

## First Checks

1. Check `/api/status?detail=1` for Gateway worker health and profile names.
2. Confirm the selected run targets `grokgw1` or the configured Grok profile.
3. Confirm the profile config uses provider `xai-oauth` and the intended Grok model.
4. Run a short live smoke through the product route or live Gateway endpoint.
5. For cron/Automation `x_search`, check whether the runner is in a different WSL distro. The runner should use bridge host proxy prefix `/bridge/grok-gateway-proxy`, not a direct `127.0.0.1:<grok-port>` URL. The plugin appends `/v1/responses`, so bridge host receives `/bridge/grok-gateway-proxy/v1/responses`.

Do not print OAuth tokens, auth files, cookies, or raw headers.

## Likely Causes

- Hermes Mobile selected a generic lowgw profile instead of Grok profile.
- The Grok profile exists but xAI OAuth is not authenticated.
- A stale UI exposes a Grok model variant that no live profile supports.
- DNS/proxy rules affect xAI endpoints.
- The cron runner's `HERMES_MOBILE_X_SEARCH_PROXY_URL` points at the runner's own loopback instead of the Windows bridge-host proxy prefix.
- Bridge host does not expose `POST /bridge/grok-gateway-proxy/v1/responses` or is not restarted after a bridge-host change.
- In hybrid Gateway Pool mode, `grokgw1` is configured but stopped and the
  bridge-host proxy is not starting it before forwarding, causing
  `ECONNREFUSED 127.0.0.1:18761`.

## Repair

- Fix routing in Hermes Mobile profile selection if the wrong worker is chosen.
- Fix xAI OAuth in the Gateway profile if the right worker is chosen but auth fails.
- Remove unsupported model variants from UI/config until backed by live profiles.
- For cross-distro cron runners, set or let the dispatcher set `HERMES_MOBILE_X_SEARCH_PROXY_URL` to the proxy prefix `http://<windows-host>:8798/bridge/grok-gateway-proxy`.
- For hybrid cold starts, keep bridge-host Grok proxy autostart enabled so the
  proxy checks `/health`, starts only `grokgw1`, waits for health, and then
  forwards the request.
- If `scripts/bridge-host.js` changed, restart listener/bridge-host through `scripts\start-worker-host.ps1 -ReplaceExisting`.
- If `scripts/hermes-mobile-cron-dispatcher.py` changed, restart the cron sidecar.
- If `gateway-plugins/hermes-mobile-web/__init__.py` changed, restart Gateway Pool so worker plugin code is reloaded.
- Only change DNS/hosts/proxy after comparing against public resolver behavior.

## Validation

- Short `@Grok` smoke returns through the Grok worker.
- Automation/Cron `x_search` smoke uses the bridge-host proxy and does not fail with `grok_gateway_proxy_failed`, `gateway_api_key_unavailable`, or `Tool x_search returned error`.
- A stopped `grokgw1` cold proxy smoke must start only that profile and not
  leave the run queued behind an unrelated low-permission OpenAI/Codex worker.
- `/api/status?detail=1` remains healthy.
- No live same-profile schema-smoke command should replace a production worker during routine validation.
