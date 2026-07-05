# macOS Codex Mobile Public Entry

This local profile keeps Home AI and Codex Mobile on separate ports while
allowing the phone to open Codex Mobile over the public Tailscale Funnel URL.

## Ports

- Home AI web: `127.0.0.1:8797`
- Codex Mobile plugin: `127.0.0.1:8789`
- Tailscale Funnel Home AI entry: `https://<tailscale-node>.<tailnet>.ts.net/`
- Tailscale Funnel Codex Mobile entry: `https://<tailscale-node>.<tailnet>.ts.net:8443/`

Expected Funnel mapping:

```text
https://<tailscale-node>.<tailnet>.ts.net       -> http://127.0.0.1:8797
https://<tailscale-node>.<tailnet>.ts.net:8443  -> http://127.0.0.1:8789
```

## Codex Mobile LaunchAgent Environment

The Codex Mobile LaunchAgent and its startup wrapper should publish the same
external URL that the phone can reach:

```bash
export CODEX_MOBILE_HOST=0.0.0.0
export CODEX_MOBILE_PORT=8789
export CODEX_MOBILE_PUBLIC_BASE_URL=https://<tailscale-node>.<tailnet>.ts.net:8443
export CODEX_MOBILE_HERMES_PLUGIN_BASE_URL=https://<tailscale-node>.<tailnet>.ts.net:8443
export CODEX_MOBILE_HERMES_PLUGIN_FRAME_ORIGINS="https://<tailscale-node>.<tailnet>.ts.net https://<tailscale-node>.<tailnet>.ts.net:8443 https://<legacy-sslip-entry> https://<legacy-ddns-entry>"
```

Runtime files used by the current macOS profile:

- `/Users/donglin/.codex-mobile-web/service/run-codex-mobile-web-public.sh`
- `/Users/donglin/Library/LaunchAgents/com.hermesmobile.plugin.codex-mobile.plist`

After changing those files, restart only Codex Mobile:

```bash
launchctl kickstart -k gui/$(id -u)/com.hermesmobile.plugin.codex-mobile
```

Do not restart Home AI or change its `8797` listener for this public-entry fix.

## Smoke Checks

```bash
curl -skI https://<tailscale-node>.<tailnet>.ts.net/
curl -skI https://<tailscale-node>.<tailnet>.ts.net:8443/
curl -sk https://<tailscale-node>.<tailnet>.ts.net:8443/api/public-config
curl -sk https://<tailscale-node>.<tailnet>.ts.net:8443/api/v1/hermes/plugin/manifest
```

Expected results:

- Home AI public entry returns HTTP 200.
- Codex Mobile public entry returns HTTP 200.
- Codex Mobile manifest `entry.url` and `program_api.base_url` use
  `https://<tailscale-node>.<tailnet>.ts.net:8443`.

## Known Bad Entry

Do not use a legacy DDNS entry until its DNS is verified. On 2026-07-05 the
local profile's previous DDNS entry resolved to `127.0.0.1`, which makes a
phone on 5G connect to itself instead of this Mac.
