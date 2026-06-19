# Module: ChatGPT Pro Bridge

## Responsibility

ChatGPT Pro bridge lets Owner-approved Hermes Mobile runs call the logged-in ChatGPT Pro browser path through Codex Mobile and return text or generated artifacts.

## Core Files

- `adapters/chatgpt-pro-codex-bridge-service.js`
- `scripts/bridge-host.js`
- `gateway-plugins/hermes-mobile-chatgpt-pro/__init__.py`
- `scripts/deploy-macos-production.js`
- `scripts/start-gateway-pool.ps1`
- `adapters/owner-elevation-routing-service.js`
- `adapters/gateway-run-start-service.js`
- `adapters/gateway-run-stream-service.js`

## Runtime

- Bridge host: `http://127.0.0.1:8798`
- Bridge endpoint: `POST /bridge/chatgpt-pro`
- Gateway tool: `chatgpt_pro_generate`
- Dedicated Codex Mobile thread name: `ChatGPT Pro`
- Current Mac production state file:
  `/Users/example/path`
- Current Mac production Codex Mobile workspace:
  `/Users/example/path`
- Current Mac production temp output directory:
  `/Users/example/path`
- Current Mac production Codex Mobile access key file:
  `/Users/example/path`. The file must remain readable
  by the `hermes-host` bridge-host service user through a narrow ACL; do not
  copy or print its raw contents.
- Legacy Windows-compatible defaults remain:
  `C:\ProgramData\HermesMobile\data\chatgpt-pro-bridge-state.json`,
  `C:\ProgramData\HermesMobile\data\tmp\chatgpt-pro`, and
  `%USERPROFILE%\Documents\Agent`.
- Default Codex Mobile `permissionMode`: `auto`. This maps to a workspace-write
  sandbox with request-time approval behavior in Codex Mobile instead of
  silently forcing full/danger access. Emergency full access must be explicit
  through `HERMES_MOBILE_CHATGPT_PRO_CODEX_PERMISSION_MODE=full` and should be
  paired with Owner maintenance/elevation review.

The Mac bridge-host LaunchDaemon must set these variables explicitly:

- `HERMES_MOBILE_CHATGPT_PRO_WORKSPACE`
- `HERMES_MOBILE_CHATGPT_PRO_CODEX_MOBILE_URL`
- `HERMES_MOBILE_CHATGPT_PRO_CODEX_MOBILE_KEY_FILE`
- `HERMES_MOBILE_CHATGPT_PRO_OUTPUT_DIR`

The `HERMES_WEB_CHATGPT_PRO_*` aliases are accepted for compatibility, but the
Mac production deploy script writes both names to avoid route/runtime drift.

## Timeouts

ChatGPT Pro can normally take 20-30 minutes. Product layers should allow at least 30 minutes:

- bridge service timeout
- bridge-host request timeout
- Gateway plugin URL open timeout
- Hermes Mobile run start/liveness overrides
- maintenance Gateway watchdog busy grace

## Validation

- `node tests\chatgpt-pro-codex-bridge-service.test.js`
- `python -m py_compile gateway-plugins\hermes-mobile-chatgpt-pro\__init__.py`
- `node tests\owner-elevation-routing-service.test.js`
- live smoke only when necessary, using Owner maintenance routing.

## Constraints

- Do not create durable artifacts under the source checkout or repo-level `outputs/`.
- Do not expose Codex Mobile keys, browser cookies, ChatGPT credentials, prompts, or generated private reports in logs/docs.
- Do not default the bridge to Codex Mobile `full` permission mode for public
  Hermes deployments. The bridge is reachable from an Owner-approved Gateway
  path and therefore needs least-privilege defaults even when the downstream
  Codex thread can still request explicit elevation.
- Routine production validation should not start same-profile Gateway schema smoke with `--replace` against live owner-maintenance ports.
