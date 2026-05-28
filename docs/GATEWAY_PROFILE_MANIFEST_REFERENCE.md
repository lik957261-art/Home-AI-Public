# Gateway Pool Manifest Reference

Last updated: 2026-05-25.

This reference documents public-safe manifest fields. The example file is `examples/gateway-pool-manifest.example.json`.

## Top-Level Shape

```json
{
  "enabled": true,
  "version": 1,
  "workers": []
}
```

## Worker Fields

| Field | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Public-safe worker label shown in status/debug projections. |
| `profile` | yes | Official Hermes Gateway profile name. |
| `host` | yes | Host used by Hermes Mobile to reach the Gateway API. |
| `port` | yes | Gateway API port. |
| `api_key` | deployment-only | Worker API key. Never commit real values. Prefer key-file/env injection in stricter deployments. |
| `enabled` | yes | Whether the worker is schedulable. |
| `securityLevel` | yes | `user` or `owner-maintenance`. |
| `allowedWorkspaceIds` | recommended | Workspaces this worker can serve. Use `["*"]` only for truly shared low-permission workers. |
| `allowMaintenance` | owner-maintenance | Required for explicit Owner maintenance workers. |
| `provider` | optional | Provider hint such as `xai-oauth` for Grok profile routing. |
| `skillProfile` | recommended | Non-secret Skill store/profile label for diagnostics and routing. |
| `skillWorkspaceIds` | recommended | Workspace ids served by this Skill store. |
| `telemetryStateDbPath` | optional | Gateway profile state DB for usage telemetry. Treat as non-public deployment metadata. |
| `telemetryResponseStoreDbPath` | optional | Gateway response store DB for usage telemetry. Treat as non-public deployment metadata. |

## Worker Types

### Low-Permission User Worker

- `securityLevel: "user"`
- Used for ordinary user work, including Owner ordinary chat.
- May expose current-workspace tools only.
- Must not include owner-maintenance/developer/source/system tools by default.

### Grok Worker

- `securityLevel: "user"`
- `provider: "xai-oauth"`
- Dedicated profile such as `grokgw1`.
- xAI OAuth must be configured in the Gateway profile/auth store outside the manifest.
- Its port is part of the manifest contract. Bridge-host Grok proxy routing
  should discover the enabled `provider=xai-oauth` worker from the manifest
  when `HERMES_MOBILE_GROK_GATEWAY_URL` is not explicitly set.
- The Grok worker's manifest port should stay stable when new personal
  workspace workers are provisioned. Append new `lowgwN` personal workers after
  the existing Grok worker and assign them a later free port instead of shifting
  `grokgw1`.

### Owner Maintenance Worker

- `securityLevel: "owner-maintenance"`
- `allowMaintenance: true`
- Used only by explicit Owner maintenance/elevation flows such as ChatGPT Pro bridge paths.
- Should not be a fallback for ordinary users when low-permission workers are unavailable.

## Safety Rules

- Never commit real API keys, OAuth tokens, cookies, browser credentials, auth file contents, or production-only private paths.
- Do not route Grok by only passing a model name to an ordinary worker; select a profile whose provider is configured for xAI.
- Do not let ordinary no-provider runs fall back to a Grok worker. `xai-oauth`
  workers should require an explicit provider/model route.
- Do not regenerate Grok ports from the current low-worker count during startup
  or workspace provisioning. Startup/configure scripts should honor manifest
  `profile`/`port` pairs.
- Do not use a broad `allowedWorkspaceIds: ["*"]` plus shared writable Skill store unless the deployment intentionally accepts that sharing model.
- Keep manifest diagnostics non-secret in browser status projections.

## Validation

- `node tests\gateway-pool-provider.test.js`
- `node tests\gateway-run-start-service.test.js`
- `node tests\gateway-run-toolset-routing-service.test.js`
- `node tests\startup-scripts.test.js`
- `/api/status?detail=1` smoke after production changes.
