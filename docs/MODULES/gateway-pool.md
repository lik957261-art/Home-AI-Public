# Module: Gateway Pool

## Responsibility

Gateway Pool owns official-clean Hermes worker startup, health checks, routing targets, maintenance worker lifecycle, and Gateway plugin availability.

## Core Files

- `scripts/start-gateway-pool.ps1`
- `scripts/start-low-gateways.sh`
- `scripts/configure-low-gateways.sh`
- `scripts/check-worker-codex-auth.ps1`
- `adapters/gateway-run-start-service.js`
- `adapters/gateway-run-stream-service.js`
- `adapters/owner-elevation-routing-service.js`
- `gateway-plugins/`

## Production Paths

- Manifest: `C:\ProgramData\HermesMobile\data\gateway-pool-manifest.json`
- Gateway worker root: `C:\ProgramData\HermesMobile\gateway-worker`
- Owner-maintenance profiles: `/home/<owner>/.hermes/profiles/officialclean1`, `/home/<owner>/.hermes/profiles/officialclean2`
- Low Gateway profiles: `C:\ProgramData\HermesMobile\gateway-worker\telemetry\profiles\lowgw*`

## Worker Roles

- Low-permission workers: ordinary user/workspace runs.
- Owner-maintenance workers: high-permission Owner maintenance and ChatGPT Pro.
- Grok worker: `grokgw1`, provider `xai-oauth`.

Ordinary runs without a provider hint should not be scheduled onto `xai-oauth`
workers. Grok workers are selected only when model/provider routing explicitly
requests `provider=xai-oauth`, such as `@Grok4.3`.

## Run Liveness

Hermes Mobile tracks the Gateway stream and periodically checks the real Gateway
run id through `/v1/runs/:id`.

- `HERMES_WEB_RUN_LIVENESS_CHECK_AFTER_MS` defaults to `120000`.
- `HERMES_WEB_RUN_LIVENESS_CHECK_INTERVAL_MS` defaults to `45000`.
- `HERMES_WEB_RUN_LIVENESS_STALE_AFTER_MS` defaults to `600000`.

Repeated Gateway 404 responses are tolerated only while the stream has recent
events or remains inside the stale window. After the stale window expires,
Hermes Mobile marks the Web task failed and releases the queue instead of
leaving the UI in `running` indefinitely.

ChatGPT Pro bridge runs may still set a stream-specific longer start/liveness
window because those jobs can be intentionally long-running.

## Model-First Toolset Selection

Gateway toolset optimization must be model-first, not system-hard-pruned.
Hermes Mobile may reduce latency by splitting a run into selection and
execution phases, but it must not irreversibly remove authorized callable
toolsets before the model has judged the task.

Required flow:

1. First round: send the model a compact capability catalog plus the authorized
   policy summary. This round chooses the toolsets needed for the task; it does
   not receive every expanded callable schema by default.
2. Execution round: expose only the selected authorized toolsets and their
   callable schema.
3. Escalation: if the model determines an additional authorized toolset is
   needed, it must request expansion explicitly and continue with the expanded
   schema. Escalation to blocked or cross-boundary toolsets is denied unless the
   request enters an explicit Owner maintenance path.
4. Telemetry: persist non-secret metadata for model-selection start/end,
   selected toolsets, expanded callable count, tool-call start/end,
   final-message start/end, terminal status, and liveness failures.

This keeps task success safer than regex or route-level pruning while avoiding
the cost of showing every ordinary tool schema on every simple run. It also
lets the UI distinguish "choosing tools", "waiting for a tool", and
"generating final reply" instead of showing a single opaque running state.

Current runtime behavior:

- `adapters/gateway-run-model-toolset-selection-service.js` runs a bounded
  selector request before execution. The selector receives only a compact
  authorized-toolset catalog and an empty callable `allowed_toolsets` list.
- `HERMES_MOBILE_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION` /
  `HERMES_WEB_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION` disable the selector when
  set to `0`, `false`, `no`, or `off`; default is enabled.
- `HERMES_MOBILE_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_TIMEOUT_MS` /
  `HERMES_WEB_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_TIMEOUT_MS` controls the
  selector timeout; default is `15000`.
- If selection fails, times out, or returns no authorized toolsets, Hermes
  Mobile falls back to the full originally authorized toolset list and records
  `run.toolset_selection_failed`.
- If selection succeeds, execution receives only the selected authorized
  toolsets, and the prompt includes `HERMES_TOOLSET_ESCALATION_REQUIRED` as the
  explicit path for requesting omitted authorized toolsets.

## Codex Responses Stream Compatibility

If `openai-codex` workers fail across unrelated chat or Automation runs with
`TypeError: 'NoneType' object is not iterable` and `HTTP None`, check
`docs/RUNBOOKS/codex-responses-stream-output-none.md` before blaming the
Automation job, XSearch, Grok routing, or task prompt. The known 2026-05-27
failure class is a `chatgpt.com/backend-api/codex` streaming response whose
terminal `response.output` is `None`; the Gateway runtime must fall back to the
raw stream path and backfill output from streamed items.

## Cross-Shell Operation Rule

Gateway Pool operations often cross from Windows PowerShell into WSL. Do not
pass inline or multi-line Bash through `bash -lc` or `bash -c` from PowerShell.
Write the Bash body to a UTF-8 no-BOM script file, convert the Windows path with
`wslpath`, and execute `bash <script-path>`. This rule is enforced by
`node tests\cross-shell-command-harness.test.js` so production hotfixes and
startup scripts do not fail because of PowerShell/Bash quote expansion.

## Profile MCP Registration

- Low Gateway profile MCP servers are generated into each profile `config.yaml` by `C:\ProgramData\HermesMobile\gateway-worker\configure-low-gateways.sh`.
- Wardrobe MCP runtime is installed under `C:\ProgramData\HermesMobile\gateway-worker\wardrobe-mcp`.
- Wardrobe-capable profiles expose toolset `wardrobe` through `platform_toolsets.api_server`.
- Owner wardrobe profiles bind `wardrobe` to the XuXin wardrobe workspace; WuPing profile `lowgw5` binds it to the WuPing wardrobe workspace.
- Wardrobe MCP is launched with `--no-workspace-override`; a model call must not switch a Gateway profile to another owner's `.hermes-wardrobe/access-key.txt`.
- Profile config changes require a Gateway Pool restart before already-running Gateway processes expose the new callable tool schema.

## Weather Plugin

- `gateway-plugins/hermes-mobile-weather` is a Hermes Mobile-owned profile-local Gateway plugin, not an official Hermes built-in toolset.
- China city queries should resolve through the plugin's local alias map first. Mapped Chinese names must not be sent directly to Open-Meteo geocoding because that upstream does not reliably support Chinese input.
- For mapped China cities, the plugin uses `weather.cn` city data first. If that provider fails, it may fall back to Open-Meteo using the mapped English city query instead of the original Chinese input.
- Unknown Chinese locations should fail closed with `chinese_location_not_mapped` until the alias map is extended.
- Changes to this plugin require copying the updated plugin into production and restarting Gateway Pool so already-running lowgw profiles reload the callable implementation.

## Watchdog Rule

`Hermes Mobile Maintenance Gateway Watchdog` runs every 5 minutes and calls `start-gateway-pool.ps1 -OwnerMaintenanceOnly -OnlyWhenOwnerMaintenanceUnhealthy`.

It must not replace a maintenance worker during a long tool call merely because `/health` is slow. If HTTP health fails but TCP port remains open, the busy-grace guard defers replacement for `OwnerMaintenanceBusyGraceMinutes` (default 45).

## Validation

- `node tests\startup-scripts.test.js`
- `node tests\cross-shell-command-harness.test.js`
- `node tests\gateway-run-model-toolset-selection-service.test.js`
- `node tests\gateway-run-toolset-routing-service.test.js`
- `node tests\gateway-run-start-service.test.js`
- `node tests\gateway-run-event-service.test.js`
- `node tests\gateway-run-stream-service.test.js`
- `node tests\gateway-run-lifecycle-service.test.js`
- PowerShell parse check for `scripts\start-gateway-pool.ps1`
- `/api/status?detail=1` should report expected worker count and healthy workers.

## Constraints

- Do not patch official Hermes runtime for product-specific worker behavior unless explicitly approved.
- Gateway plugin/schema/profile changes usually require Gateway Pool restart.
- Listener-only restart is insufficient after plugin/schema/profile changes.
- Do not print API keys, auth tokens, or browser credentials.
