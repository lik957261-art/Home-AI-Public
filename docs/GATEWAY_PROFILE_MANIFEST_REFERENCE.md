# Gateway Pool Manifest Reference

Last updated: 2026-05-29.

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
| `replicaId` | recommended | Stable runnable replica identity. During migration this usually equals `profile`, but scheduler state uses it before falling back to legacy aliases. |
| `profileAlias` | recommended | Legacy Gateway profile alias used by launch scripts, telemetry paths, and bounded diagnostics. It must not be treated as capability ownership. |
| `profileTemplateKey` | recommended | Derived capability template key in the current `<workspaceId>|<securityLevel>|<provider>` form. Runtime re-derives this value from worker metadata and routing hints before scheduling. |
| `poolKey` | recommended | Derived pool identity. In the current implementation it equals `profileTemplateKey`. |
| `host` | yes | Host used by Hermes Mobile to reach the Gateway API. |
| `port` | yes | Gateway API port. |
| `api_key` | deployment-only | Inline worker API key. Never commit real values. Prefer key-file/env injection in stricter deployments. |
| `apiKeyFile` / `api_key_file` | deployment-only | Path to the worker API key file. The Gateway Pool provider reads and trims this file before calling the worker. This is the preferred Mac production shape. Workspace provisioning must create a unique per-worker key file instead of copying a template worker's key path. |
| `apiKeyPath` / `api_key_path` | deployment-only | Compatibility alias for a worker API key file path. |
| `enabled` | yes | Whether the worker is schedulable. |
| `securityLevel` | yes | `user` or `owner-maintenance`. |
| `allowedWorkspaceIds` | recommended | Workspaces this worker can serve. Use `["*"]` only for truly shared low-permission workers. |
| `osUser` / `os_user` | Mac production | Isolated macOS user that owns and runs the materialized Gateway profile, for example `hm-xulu`. |
| `launchdLabel` / `launchd_label` | Mac production | System LaunchDaemon label for the worker, for example `com.hermesmobile.gateway.hm-xulu.openai.1`. Every enabled Mac worker must have a loaded service with this label, even when the worker is cold. |
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

### Low-Permission DeepSeek Worker

- `securityLevel: "user"`
- `provider: "deepseek"`
- Must be workspace-dedicated. Use `allowedWorkspaceIds` and
  `skillWorkspaceIds` for the same workspace binding as the corresponding
  OpenAI/Codex `lowgwN` profile.
- Owner has multiple low-permission DeepSeek profiles:
  `deepseekgw1`, `deepseekgw2`, and `deepseekgw99`. All three are Owner-only
  and share Owner memory, Owner full Skill store, and Owner-bound MCP
  registrations.
- Non-Owner users should receive their own dedicated `deepseekgwN` profile.
  Do not use `deepseekgw99` or `allowedWorkspaceIds: ["*"]` as a generic
  DeepSeek fallback.

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

### Owner DeepSeek Maintenance Worker

- `securityLevel: "owner-maintenance"`
- `allowMaintenance: true`
- `provider: "deepseek"`
- Dedicated profile such as `deepseekmaint1`.
- Used only when an explicit Owner high-permission run also selects the
  DeepSeek provider.
- Startup must configure the profile with `model.provider: deepseek` and
  `model.default: deepseek-chat`, enable the profile `skills` toolset against
  the Owner full Skill store, and fail closed if the deployment DeepSeek key
  file is missing.

## Safety Rules

- Never commit real API keys, OAuth tokens, cookies, browser credentials, auth file contents, or production-only private paths.
- Do not route Grok by only passing a model name to an ordinary worker; select a profile whose provider is configured for xAI.
- Do not route DeepSeek by only passing a request body provider to an OpenAI
  worker. Normal DeepSeek runs must use workspace-dedicated `deepseekgw*`;
  Owner high-permission DeepSeek runs must use `deepseekmaint*`.
- Do not let ordinary no-provider runs fall back to a Grok worker. `xai-oauth`
  workers should require an explicit provider/model route.
- Do not regenerate Grok ports from the current low-worker count during startup
  or workspace provisioning. Startup/configure scripts should honor manifest
  `profile`/`port` pairs.
- Do not use a broad `allowedWorkspaceIds: ["*"]` plus shared writable Skill store unless the deployment intentionally accepts that sharing model.
- Keep manifest diagnostics non-secret in browser status projections.
- Manifest key-file paths are deployment metadata, not key contents. Browser
  status projections must not expose raw key values, and docs/handoffs should
  record only the field names and storage pattern.
- Mac workspace provisioning must assign each materialized user worker its own
  key file under the deployment `data/secrets/gateway-workers` directory, using
  the worker macOS user and provider family in the filename. A newly
  provisioned `hm-xulu` workspace should therefore receive files such as
  `hm-xulu-openai-1.key`, `hm-xulu-openai-2.key`, and
  `hm-xulu-deepseek-1.key`. Copying another workspace's `apiKeyFile` from a
  template manifest row is invalid because the selected worker process will
  fail cold start with `missing Gateway API key` or later reject Mobile
  requests with a mismatched worker key.
- Workspace provisioning must also rewrite slot identity metadata for the
  target worker. `id`, `replicaId`, and `profileAlias` must match the actual
  `profile` slot, while `profileTemplateKey` and `poolKey` must match
  `<workspaceId>|user|<provider>`. A copied `replicaId` such as
  `hm-wuping-openai-1` on an `xjz` worker makes scheduler state and launch
  requests target the wrong replica even when `allowedWorkspaceIds` is correct.
- Keep `replicaId`, `profileAlias`, `profileTemplateKey`, and `poolKey`
  secret-free. These fields are metadata only. Do not place API keys, token
  paths, launch URLs, prompts, model output, or full config bodies in them.
- `profile` remains the process launch name while migration is in progress.
  Do not remove or rename it until the startup scripts no longer use profile
  directories and `-StartProfiles` / `-StopProfiles` arguments.

## Validation

- `node tests\gateway-pool-provider.test.js`
- `node tests\gateway-pool-manifest-replica-metadata-service.test.js`
- `node tests\gateway-pool-manifest-replica-metadata-script.test.js`
- `node tests\gateway-run-start-service.test.js`
- `node tests\gateway-run-toolset-routing-service.test.js`
- `node tests\startup-scripts.test.js`
- `/api/status?detail=1` smoke after production changes.
