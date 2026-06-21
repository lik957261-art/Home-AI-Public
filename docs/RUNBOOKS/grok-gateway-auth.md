# Runbook: Grok Gateway Auth Or Routing Failure

## Symptoms

- `@Grok` replies fail while other Gateway workers are healthy.
- A Grok request is handled by a non-Grok model/provider.
- Gateway reports auth errors for xAI/Grok.
- A Grok request reports a Codex/OpenAI `access_token` error even though xAI
  OAuth metadata is present.
- Automation jobs using `x_search` produce generic results or tool errors while normal `@Grok` requests remain healthy.

## First Checks

1. Check `/api/status?detail=1` for Gateway worker health and profile names.
2. Confirm the selected run targets `grokgw1` or the configured Grok profile.
3. Confirm the profile config uses provider `xai-oauth` and the intended Grok model.
4. Run
   `node scripts\grok-auth-metadata-smoke.js --profile-auth-file <file> --shared-auth-file <file> --require-access-token --json`
   to check only profile-local and shared auth stores for xAI OAuth metadata.
   The output must show only provider/key names and token-field booleans, never
   auth paths or token values.
   The script can also read the shared store from
   `HERMES_GROK_GATEWAY_SHARED_AUTH_PATH`,
   `HERMES_MOBILE_GROK_SHARED_AUTH_PATH`, or
   `HERMES_WEB_GROK_SHARED_AUTH_PATH` when `--shared-auth-file` is omitted.
5. Generate `node scripts\grok-xai-oauth-closure-checklist.js --markdown`
   before accepting manual OAuth closure. The checklist is read-only and
   enumerates the metadata smoke, profile/provider audit, live
   `gateway-pool-production-smoke.js --provider xai-oauth --expected-profile
   grokgw1`, and optional Automation `x_search` proxy proof.
6. Run a short live smoke through the product route or live Gateway endpoint.
6. For cron/Automation `x_search`, check whether the runner is in a different WSL distro. The runner should use bridge host proxy prefix `/bridge/grok-gateway-proxy`, not a direct `127.0.0.1:<grok-port>` URL. The plugin appends `/v1/responses`, so bridge host receives `/bridge/grok-gateway-proxy/v1/responses`.

Do not print OAuth tokens, auth files, cookies, or raw headers.

## Likely Causes

- Hermes Mobile selected a generic lowgw profile instead of Grok profile.
- The Grok profile exists but xAI OAuth is not authenticated.
- The Grok profile was selected correctly, but its live `config.yaml` drifted
  to a generic `openai-codex` model provider. In that case the worker may report
  `Codex auth is missing access_token` even when xAI OAuth tokens are valid.
- The selected Grok profile points at an isolated auth store whose
  `providers.xai-oauth` or `credential_pool.xai-oauth` entry shadows the
  shared owner auth store.
- xAI returns `invalid_grant` / `Refresh token has been revoked` during token
  refresh. This is not recoverable by copying provider token fields back into
  `auth.json`; the account must re-authenticate or switch to a valid API-key
  provider.
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
- If `grokgw1` is selected and xAI metadata is valid but logs mention missing
  Codex access tokens, regenerate the live `grokgw1/config.yaml` from the
  canonical Grok template:
  `node scripts/build-gateway-profile-template.js --render-config-yaml --config-kind grok --value profile=grokgw1 --value port=<manifest-port>`.
  Back up the old config, install the rendered config with the profile owner,
  then restart only the Grok launchd service.
- On Windows local production, `grokgw1` should normally share
  `C:\ProgramData\HermesMobile\gateway-worker\telemetry\profiles\shared-auth\auth.json`
  with the other low-permission workers. Confirm:
  `/home/hermes/.hermes/profiles/grokgw1/auth.json ->
  /mnt/c/ProgramData/HermesMobile/gateway-worker/telemetry/profiles/shared-auth/auth.json`.
- If xAI reports a revoked refresh token, run the xAI OAuth login for the
  `hermes` worker profile so the shared auth store is rewritten:
  `HERMES_HOME=/home/hermes/.hermes/profiles/grokgw1 HERMES_PROFILE=grokgw1 hermes auth add xai-oauth --type oauth --label shared-xai-oauth`.
- On macOS production, use the same principle with the Mac Grok worker profile.
  If `scripts/grok-auth-metadata-smoke.js` reports
  `grok_xai_oauth_access_token_missing` for both the profile-local and shared
  auth stores, routing changes will not fix Grok. Re-authenticate xAI OAuth in
  the effective Grok profile environment, then rerun the metadata smoke and the
  provider smoke. Current `hermes auth add xai-oauth` may write usable tokens
  under `credential_pool.xai-oauth` as an array; the metadata smoke treats that
  as a valid access-token source and reports only booleans, never token values.
- For a Mac operator session, run the checked re-auth helper from the live app:
  `bash scripts/macos-grok-xai-reauth.sh`.
  If the desktop wrapper is installed, double-click
  `HomeAI-Grok-XAI-Reauth.command` on the Mac desktop instead.
  It starts Hermes' manual-paste xAI OAuth flow under the `hm-owner` /
  `grokgw1` profile environment and reruns
  `scripts/grok-auth-metadata-smoke.js --require-access-token` after the flow.
  Paste the failed callback URL or authorization code into that Mac terminal
  only; do not paste it into chat, docs, logs, or handoff files.
- The default Mac production closure harness deliberately reports Grok/xAI as a
  deferred manual OAuth follow-up. Do not treat
  `scripts/macos-production-closure-validation.js --json` as proof that Grok
  provider auth is fixed; run the metadata smoke and the `grokgw1` provider
  smoke after manual re-auth.
- Use `scripts/grok-xai-oauth-closure-checklist.js --markdown` as the operator
  handoff for those post-auth steps. It does not execute OAuth or inspect token
  files; it prevents the closure from stopping at metadata-only success.
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
- `grokgw1/config.yaml` contains `provider: xai-oauth` and the intended Grok
  model before any provider-auth conclusion is accepted.
- `scripts/grok-auth-metadata-smoke.js --require-access-token` returns
  `ok=true` before the provider smoke is treated as a routing/auth closure.
- `scripts/grok-xai-oauth-closure-checklist.js --markdown` lists all required
  post-auth evidence before the manual repair is accepted.
- Automation/Cron `x_search` smoke uses the bridge-host proxy and does not fail with `grok_gateway_proxy_failed`, `gateway_api_key_unavailable`, or `Tool x_search returned error`.
- A stopped `grokgw1` cold proxy smoke must start only that profile and not
  leave the run queued behind an unrelated low-permission OpenAI/Codex worker.
- `/api/status?detail=1` remains healthy.
- No live same-profile schema-smoke command should replace a production worker during routine validation.
