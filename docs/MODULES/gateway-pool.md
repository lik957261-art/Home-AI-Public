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
- Owner-maintenance runtime tree: `/opt/hermes-gateway-runtime/official-clean`
  in the owner WSL distro.
- Low Gateway runtime tree: `/opt/hermes-gateway-runtime/official-clean` inside
  the Windows `HermesMobileWorker` account's `HermesGatewayWorker` WSL distro.
  Operator-user `wsl.exe -l` does not show that worker distro.

## Worker Roles

- Low-permission workers: ordinary user/workspace runs.
- Owner-maintenance workers: high-permission Owner maintenance and ChatGPT Pro.
- Grok worker: `grokgw1`, provider `xai-oauth`.

Ordinary runs without a provider hint should not be scheduled onto `xai-oauth`
workers. Grok workers are selected only when model/provider routing explicitly
requests `provider=xai-oauth`, such as `@Grok4.3`.

Gateway startup and profile configuration must use the explicit
`profile`/`port` pairs in `gateway-pool-manifest.json`. Do not derive the Grok
port from the current maximum `lowgwN` index. New personal workspace workers
are appended after existing low/Grok workers and must not renumber or move
`grokgw1`; otherwise Grok/X Search proxy paths can drift after a workspace is
created.

## Run Liveness

Hermes Mobile tracks the Gateway stream and periodically checks the real Gateway
run id through `/v1/runs/:id`.

- `HERMES_WEB_RUN_LIVENESS_CHECK_AFTER_MS` defaults to `120000`.
- `HERMES_WEB_RUN_LIVENESS_CHECK_INTERVAL_MS` defaults to `45000`.
- `HERMES_WEB_RUN_LIVENESS_STALE_AFTER_MS` defaults to `600000`.
- `HERMES_MOBILE_RUN_MODEL_FIRST_BYTE_WARNING_MS` /
  `HERMES_WEB_RUN_MODEL_FIRST_BYTE_WARNING_MS` defaults to `45000`.

Repeated Gateway 404 responses are tolerated only while the stream has recent
events or remains inside the stale window. After the stale window expires,
Hermes Mobile marks the Web task failed and releases the queue instead of
leaving the UI in `running` indefinitely.

Hermes Mobile also projects stream wait states into the run-progress panel:

- `run.model_first_byte_retrying` is emitted when the execution stream has no
  Gateway event after the first-byte warning window. This is a Mobile status
  projection and must not reset the real Gateway `lastEventAt` used by liveness.
- `run.model_stream_started` is emitted when the first Gateway stream event is
  observed.
- `run.model_output_started` is emitted when the first text delta is observed.
- `run.stream_closed_without_terminal` is emitted when the response stream
  closes without a terminal `response.completed` / `response.failed` event. If
  text output has already arrived, Mobile synthesizes `response.completed` from
  the streamed content so the run does not become a false failed Web Push. If no
  model output arrived, Mobile releases the queue as cancelled instead of
  surfacing the old raw `Hermes stream ended without a terminal completion
  event` failure.
- `run.liveness_warning`, `run.liveness_stale`, `run.gateway_start_timeout`,
  and `run.stream_failed` make retry/stale/failure states visible before the
  terminal message update.
- The client-facing label for `run.liveness_warning` should be calm waiting
  language such as `等待模型返回`, not a Gateway-failure phrase. This event only
  means the run lookup is temporarily unavailable while Mobile keeps the stream
  open. `run.liveness_stale` remains the visible timeout/failure state.
- The run-progress client must merge the public Mobile run id and the Gateway
  response run id for the same assistant message. Startup events are often
  stored under the public `web_...` id, while model, Skill, and function events
  arrive under the `resp_...` id. Event-driven refresh should first match the
  newest assistant message by its own run ids (`runId`, `originalRunId`,
  `responseRunId`, `taskId`) and only use thread active ids as a fallback for a
  still-active message.
- Thread active ids are a targeting fallback, not a general render input.
  A run-progress panel should render only the current message's own run ids and
  any response run id that was explicitly remembered for that message through
  event-driven fallback. This prevents a fast task panel from inheriting the
  timer or events of a different active chat run in the same thread.
- Visible run-progress rows should remain chronological. New model, Skill, and
  function events append downward; the client may cap the visible event count,
  but it must not move later function rows above earlier startup rows.
- Inline run-progress refreshes should preserve bottom visibility while the
  conversation is pinned, near the bottom, or inside the send/run follow window.
  The client should capture that scroll intent before replacing the panel DOM
  and then restick to the conversation bottom after the panel grows. If the user
  has intentionally scrolled away, run-progress refreshes should not hijack the
  viewport back to the bottom.
- Function-call status rows should print the concrete function name when
  available. The client must parse bounded JSON preview objects, object-shaped
  previews from live SSE payloads, the tool field, and paired `callId` metadata
  so `Function result` rows can inherit the matching function name instead of
  staying generic.
- The run-progress panel should not show separate adjacent start and done rows
  for the same Skill or function operation. The client keeps the raw event log
  unchanged, but visually folds a paired start/done operation into one row with
  a status tone and elapsed operation duration such as `完成 · 2秒`; an unpaired
  operation remains visible as `运行中`.

ChatGPT Pro bridge runs may still set a stream-specific longer start/liveness
window because those jobs can be intentionally long-running.

## Run Tool Budgets

Hermes Mobile enforces selected tool budgets in the Gateway stream layer, not
only through prompt wording. The stream service counts started
`response.output_item.added` tool calls and aborts the active stream when a
hard limit is exceeded.

Current enforced budget:

- `HERMES_MOBILE_RUN_WEB_SEARCH_MAX_CALLS` /
  `HERMES_WEB_RUN_WEB_SEARCH_MAX_CALLS` defaults to `6`.
- `HERMES_MOBILE_RUN_EXPLICIT_WEB_SEARCH_MAX_CALLS` /
  `HERMES_WEB_RUN_EXPLICIT_WEB_SEARCH_MAX_CALLS` defaults to `12` for runs
  whose newest message explicitly selects or asks for web/X search.
- The counter covers `mobile_web_search`, `web_search`, and hosted
  `web_search_call` output items.
- `0` disables this specific cap for a controlled runtime.
- When exceeded, Hermes Mobile emits `run.tool_budget_exceeded`, aborts the
  stream, marks the assistant message failed, and releases the queue.
- When the current run enables the `web` or `search` toolset, Hermes Mobile
  also injects a model-facing instruction that states the configured search
  budget, asks the model to plan/combine searches, prefer extraction for known
  URLs, and return a partial answer or ask for approval instead of starting a
  search beyond the cap.

This guard exists because bounded official-source lookups can otherwise loop
through repeated web/browser failures and consume very large token budgets
without producing a better answer. Product-specific lookup policies may add
narrower caps, but they should not rely on instructions alone.

Explicit search quality rule:

- If the newest user message explicitly asks for web search, online lookup,
  public web verification, X/Twitter search, or a source selector marks the run
  as `web_search` / `x_search`, search quality takes priority over small
  latency/token savings.
- The model-facing instruction must tell the worker to use focused query
  refinements, compare independent sources, extract relevant pages, and report
  evidence limits instead of stopping after the first shallow result.
- The hard stream cap remains a safety stop. If the explicit-search cap is not
  enough, the model should return the best evidence-labeled partial answer or
  ask the user for approval to continue rather than silently weakening the
  search.

## Model-First Toolset Selection

Gateway toolset optimization must be model-first, not system-hard-pruned.
Hermes Mobile may reduce latency by splitting a run into selection and
execution phases, but it must not irreversibly remove authorized callable
toolsets before the model has judged the task.

Required flow:

1. First round: send a ChatGPT low-cost model a compact capability catalog plus
   the authorized policy summary. This round makes the model-side permission
   decision and chooses the toolsets needed for the task; it does not receive
   every expanded callable schema by default.
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
- This selector is the combined model-side permission and toolset preflight. It
  may return either selected authorized toolsets or a permission-elevation
  decision using `HERMES_PERMISSION_APPROVAL_REQUIRED` semantics.
- After a successful `model_first` selector decision, the execution prompt must
  not call `skill_view` or load
  `productivity/hermes-mobile-permission-boundary-check` again. That Skill is
  retained only as a legacy fallback/reference for non-selector paths.
- Hermes Mobile must not route or block ordinary model runs through
  natural-language permission guesses before this model-side preflight. Server
  code may still construct the access policy and honor explicit Owner
  maintenance approval routes.
- `HERMES_MOBILE_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION` /
  `HERMES_WEB_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION` disable the selector when
  set to `0`, `false`, `no`, or `off`; default is enabled.
- `HERMES_MOBILE_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_TIMEOUT_MS` /
  `HERMES_WEB_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_TIMEOUT_MS` controls the
  selector timeout; default is `45000`.
- `HERMES_MOBILE_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_MODEL` /
  `HERMES_WEB_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_MODEL` controls the compact
  selector model; default is `gpt-5.4-mini`. The provider and reasoning effort
  can be overridden with the matching `_PROVIDER` and `_REASONING_EFFORT`
  environment variables.
- `HERMES_MOBILE_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_STOP_TIMEOUT_MS` /
  `HERMES_WEB_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_STOP_TIMEOUT_MS` controls
  the best-effort stop request for a selector run id that was observed before a
  selector failure; default is `2000`.
- If selection fails, times out, or returns no authorized toolsets, Hermes
  Mobile falls back to the full originally authorized toolset list and records
  `run.toolset_selection_failed`.
- If model-side preflight returns a permission-elevation decision, Hermes Mobile
  marks the assistant message as requiring Owner approval and does not start the
  execution round.
- If selection succeeds, execution receives only the selected authorized
  toolsets, and the prompt includes `HERMES_TOOLSET_ESCALATION_REQUIRED` as the
  explicit path for requesting omitted authorized toolsets.
- `HERMES_TOOLSET_ESCALATION_REQUIRED` is an internal control marker, not a
  user-facing answer. Streaming delta and completion handling must strip the raw
  marker, persist `toolsetEscalationRequired` metadata and
  `run.toolset_escalation_required`, and show a controlled explanation with the
  requested toolset ids.
- When the requested toolsets are in the omitted authorized set, Mobile must
  automatically retry the same assistant message with the previous selected
  toolsets plus the requested authorized toolsets. This retry bypasses the
  selector so the model's explicit runtime finding is not lost to a second
  selector mistake. If the request is blocked, unauthorized, repeats without
  adding a new toolset, or exceeds the retry cap, Mobile keeps the controlled
  insufficient-toolset message instead of leaking the raw marker.
- `web`, `search`, and `browser` are one common lightweight companion set. If
  routing, selector output, or an escalation request includes any authorized
  member of that set, execution should keep all authorized members together so a
  run does not first retry for `web/search` and then immediately retry again for
  `browser`. The policy boundary still wins: `browser` is not granted when it is
  absent from the authorized catalog.
- The selector must not select every authorized toolset merely because the task
  is ambiguous, a ping, or a plain test message. If a selector response chooses
  the full authorized set only due uncertainty, Hermes Mobile narrows it to the
  existing suggested lightweight set before execution, preserving the later
  escalation path instead of exposing broad schemas up front.
- Product-specific MCP toolsets that are ordinary current-workspace capabilities
  must be present in the Mobile run policy before the selector can choose them.
  Profile registration alone is not enough. For wardrobe tasks, `wardrobe` must
  be included in the authorized catalog so the selector chooses Wardrobe MCP
  for writeback, readback verification, and main image / field checks. If the
  `wardrobe` MCP toolset is missing for a wardrobe run, treat it as a toolset
  routing gap; do not satisfy the wardrobe run with generic `http`.
- Wardrobe directory authorization starts in `access-policy-provider`, not only
  in the routing selector. A project or directory route whose id, label, path,
  or root identifies a wardrobe/closet/outfit space adds `wardrobe` to the
  current run's authorized toolset catalog before model-side selection.
- Topic-bound wardrobe directories are an explicit routing signal. When a topic
  carries a directory route whose project id, label, path, or root identifies it
  as a wardrobe/closet directory, Mobile suggests authorized `wardrobe`,
  `vision`, and `file` for all AI runs in that topic by default. This does not
  grant new permission; it only keeps already-authorized MCP/input capabilities
  visible to the model-side selector.
- The selector may still choose a narrower set, but it must not split the
  wardrobe-bound input companion set. If the suggested set contains authorized
  `wardrobe`, `vision`, and `file`, and the selector chooses `wardrobe`, the
  execution policy keeps `vision` and `file` with it so image-backed wardrobe
  verification does not degrade into a later toolset-escalation loop.
- Missing or unresolved topic directory bindings are valid. Single-window chat
  and topics without a concrete directory route must fall back to ordinary chat
  routing or the effective default workspace policy; they must not fail during
  toolset routing because `taskDirectory` or `project` is null.
- For plain chat probes in an existing conversation, the selector should prefer
  the existing suggested lightweight set over `clarify` alone, because the
  execution round still receives bounded conversation context and may otherwise
  request an avoidable toolset escalation.
- The execution prompt also includes a latest-message override for ping,
  greeting, acknowledgement, and plain test messages. That override tells
  the model not to inherit a previous tool/search intent from conversation
  history unless the newest message explicitly asks for a tool-backed action.
- A retry/rerun message is not a plain probe when recent task context or
  toolset-escalation metadata exists. Toolset routing should use that recent
  context, prioritizing the same `taskGroupId` before the global chat tail, so
  retries after a narrowed execution can re-select toolsets such as `weather`
  and `wardrobe` instead of looping with only `file`.
- The selector is an internal JSON-only preflight. It must not browse, search,
  call tools, or load Skills while selecting permission/toolsets; the selector
  request should disable tool calls and live probes should verify no tool-role
  messages appear in the selector session.
- Responses streams can repeat the same JSON decision across delta/done/final
  events. Selector parsing must scan JSON candidates and accept a valid final
  decision instead of treating duplicated JSON text as an `invalid_json`
  failure.
- Treat the request body's `model` value as configuration intent only. When
  validating latency/cost, inspect the Gateway session or worker log for the
  actual model because a worker profile default can override what the envelope
  reports.

2026-05-27 selector probe findings:

- Before the selector was made internal JSON-only, a live X Search selector
  probe completed in about 31s but loaded Skills/tools and produced duplicated
  JSON in the stream, which surfaced as `invalid_json`.
- After disabling selector tool calls and hardening JSON-candidate parsing, a
  live low Gateway selector probe returned the expected `x_search` selection in
  about 9.2s with no tool-role messages in the selector session.
- The same live evidence showed the worker's actual session model was its
  profile default, not necessarily the `body.model` request value, so future
  selector-model tuning must validate the actual worker profile/runtime path.
- A later live plain-chat probe showed the selector could still spend a model
  call and then choose every authorized toolset because the prompt treated
  ambiguity as a reason to fail open. That made the execution round expose
  `skills`; the main model loaded mandatory Skills and a two-character test
  reply used about 52k tokens. The selector contract now forbids all-toolset
  selection solely due uncertainty and narrows that case to the lightweight
  suggested set.
- The same hotfix also records `model_first` routing metadata explicitly after
  selection, because policy sanitization may strip `toolset_routing` from the
  access policy while the run still needs auditable selected-toolset metadata.

## Codex Responses Stream Compatibility

If `openai-codex` workers fail across unrelated chat or Automation runs with
`TypeError: 'NoneType' object is not iterable` and `HTTP None`, check
`docs/RUNBOOKS/codex-responses-stream-output-none.md` before blaming the
Automation job, XSearch, Grok routing, or task prompt. The known 2026-05-27
failure class is a `chatgpt.com/backend-api/codex` streaming response whose
terminal `response.output` is `None`; the Gateway runtime must fall back to the
raw stream path and backfill output from streamed items.

As of 2026-05-27, both owner-maintenance and low-gateway production runtimes
track upstream official `main` commit
`febc4cfec0a79b175a430304765473c97e10622f`
(`v2026.5.16-1128-gfebc4cfec`) because the latest formal upstream release tag
was still `v2026.5.16` while the Codex streaming fix had already landed on
`main`. Runtime updates for this issue must cut over both distro copies; moving
only the owner distro leaves ordinary lowgw workers on the old code.

When `start-low-gateways.sh` is invoked through the Windows worker wrapper, the
wrapper process can remain attached even after detached Gateway Python
processes are healthy. Do not treat the wrapper exit alone as the source of
truth. Verify the worker-distro `official-clean` commit, lowgw listening ports,
process start times, `/api/status?detail=1`, and a Gateway Pool production
smoke; then clean up only the stale wrapper processes if they remain attached.

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
- Hermes Mobile access-policy hardening and toolset routing must also preserve
  `wardrobe`. If a wardrobe ingestion or recommendation run reaches a
  wardrobe-capable profile without `wardrobe` in `access_policy_context.allowed_toolsets`,
  that is a Mobile policy/routing bug, not a Gateway MCP registration failure.
- Profile config changes require a Gateway Pool restart before already-running Gateway processes expose the new callable tool schema.

## Weather Plugin

- `gateway-plugins/hermes-mobile-weather` is a Hermes Mobile-owned profile-local Gateway plugin, not an official Hermes built-in toolset.
- China city queries should resolve through the plugin's local alias map first. Mapped Chinese names must not be sent directly to Open-Meteo geocoding because that upstream does not reliably support Chinese input.
- For mapped China cities, the plugin uses `weather.cn` city data first. If that provider fails, it may fall back to Open-Meteo using the mapped English city query instead of the original Chinese input.
- Unknown Chinese locations should fail closed with `chinese_location_not_mapped` until the alias map is extended.
- Changes to this plugin require copying the updated plugin into production and restarting Gateway Pool so already-running lowgw profiles reload the callable implementation.

## Image Plugin

- `gateway-plugins/hermes-mobile-image` is a Hermes Mobile-owned profile-local Gateway plugin, not official Hermes runtime source.
- `image_edit`, `image_erase`, `chatgpt_image_edit`, and `chatgpt_image_erase` call ChatGPT Image 2 through the Codex backend with scoped local input/output paths.
- The plugin must consume Responses streaming at the event level with `responses.create(..., stream=True)`. It must not use the SDK high-level `responses.stream()` helper or `get_final_response()`, because Codex backend terminal responses may legally arrive with `response.output=None` while useful image output was already emitted in earlier output-item events.
- Plugin tests must cover `response.output_item.done`, partial image events, and a `response.completed` event whose `response.output` is `None`.
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
- `node tests\hermes-mobile-image-plugin.test.js`
- PowerShell parse check for `scripts\start-gateway-pool.ps1`
- `/api/status?detail=1` should report expected worker count and healthy workers.

## Constraints

- Do not patch official Hermes runtime for product-specific worker behavior unless explicitly approved.
- Gateway plugin/schema/profile changes usually require Gateway Pool restart.
- Listener-only restart is insufficient after plugin/schema/profile changes.
- Do not print API keys, auth tokens, or browser credentials.
