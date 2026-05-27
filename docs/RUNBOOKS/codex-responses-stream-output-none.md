# Codex Responses Stream Output None

Last updated: 2026-05-27.

Use this runbook when Hermes Mobile chat, Automation/Cron, or maintenance runs
fail quickly on `openai-codex` with:

- `TypeError: 'NoneType' object is not iterable`
- `Non-retryable client error (HTTP None)`
- `provider=openai-codex`
- `base_url=https://chatgpt.com/backend-api/codex`

## Symptom Pattern

- Different prompts or Automation jobs fail with the same error.
- The failure happens before domain tools complete.
- The failed run may still write a local failure wrapper, but no fresh
  user-facing deliverable is produced.
- Direct raw SSE inspection shows `response.completed` while
  `response.output` is `None`.

The same root-cause class can affect Hermes Mobile-owned Gateway plugins that
call the Codex backend directly. For `gateway-plugins/hermes-mobile-image`,
`chatgpt_image_edit` may fail with the same `NoneType` error even though the
tool was selected correctly and `gpt-image-2` was used. In that case, inspect
the plugin first: it must collect image output from raw streamed
`response.output_item.done` / partial-image events and must not call the SDK
high-level `responses.stream()` helper or `get_final_response()`.

## Root Cause Class

This is a provider/SDK streaming compatibility issue, not an Automation,
XSearch, mailbox, SQLite, or prompt-content failure.

On 2026-05-27, `chatgpt.com/backend-api/codex` streamed valid output item and
text events, then ended with a terminal response whose `output` field was
`None`. OpenAI Python SDK `2.24.0` attempted to iterate that field inside the
Responses streaming state machine and raised `TypeError`.

Evidence collected during the incident:

- The production OpenAI Python package and SDK streaming parser were installed
  on 2026-05-18 and had not changed before the 2026-05-27 hotfix.
- The Hermes official-clean runtime file dated from 2026-05-18 before the
  hotfix backup was created.
- `openai-codex` calls were still succeeding in production at
  2026-05-26 23:32 +08.
- The first observed Automation failure with this signature was
  2026-05-27 08:00 +08.
- A retry after the hotfix completed successfully at 2026-05-27 09:33 +08.

The most likely cause is an upstream `chatgpt.com/backend-api/codex` streaming
contract drift between the last successful night run and the first morning
failure. No local package update, Hermes Mobile public release, or Automation
job-content change explains the timing.

Separate note: a 2026-05-27 00:03 +08 log showed `x_search` failing after a
long Grok gateway proxy reset. That explains a separate XSearch/Grok stall
symptom, but it is not the `NoneType` production-wide chat/Automation failure.

## Diagnosis

1. Check production status before any restart:
   - authenticated `/api/status?detail=1`
   - confirm `concurrency.activeGlobal=0` before restarting workers.
2. Check recent Cron or Gateway logs for the shared signature above.
3. Use a minimal `openai-codex` probe that does not include task body text or
   raw generated content. Record only provider, model, event types, completion
   status, and exception type.
4. If raw SSE emits `response.output_item.*`, `response.output_text.*`, and
   `response.completed` but the terminal response has `output=None`, treat it
   as this runbook.

## Official Runtime Cutover On 2026-05-27

The first production recovery was a local `run_agent.py` hotfix. That local
patch is now superseded by an official upstream `main` cutover.

Official source state used for the cutover:

- Latest formal upstream release/tag observed: `v2026.5.16`.
- Production runtime commit after cutover:
  `febc4cfec0a79b175a430304765473c97e10622f`
  (`v2026.5.16-1128-gfebc4cfec`).
- Relevant upstream fix: `cb38ce28c`, which dropped the SDK
  `responses.stream()` helper in Codex runtime and consumes stream events
  directly from `responses.create(stream=True)`.

The official fix matches this incident class because it reconstructs output
from streamed `response.output_item.*` / `response.output_text.*` events
instead of trusting the terminal `response.output` field to be iterable.

Production runtime trees that must be updated together:

- Owner-maintenance runtime in the owner WSL distro:
  `/opt/hermes-gateway-runtime/official-clean`
- Low Gateway runtime in the Windows `HermesMobileWorker` account's
  `HermesGatewayWorker` WSL distro:
  `/opt/hermes-gateway-runtime/official-clean`

2026-05-27 cutover backups:

- Owner-maintenance distro:
  `/opt/hermes-gateway-runtime/backups/pre-official-main-20260527-160752`
- Worker low-gateway distro:
  `/opt/hermes-gateway-runtime/backups/pre-official-main-worker-20260527-162250`

After replacing either runtime tree, restart the affected worker group so
already-running Python processes reload the new `agent/codex_runtime.py`.

## Superseded Local Hotfix

Runtime path:

- `/opt/hermes-gateway-runtime/official-clean/run_agent.py`

Backup path:

- `/opt/hermes-gateway-runtime/official-clean/run_agent.py.backup-20260527-codex-stream-none-output`

Patch shape:

- Catch the specific stream parser `TypeError` containing `NoneType` and
  `not iterable` in `_run_codex_stream`.
- Fall back to the existing `responses.create(stream=True)` raw stream path.
- Backfill terminal responses when `response.output` is `None` as well as when
  it is an empty list.

The same patch must be present in both runtime trees:

- Owner-maintenance runtime under the normal owner WSL distro.
- Low Gateway worker runtime under the `HermesMobileWorker` managed WSL distro.

Do not reapply this local patch after the official-main cutover unless a future
upstream regression is proven and explicitly approved.

## Validation

Required checks:

- `python -m py_compile /opt/hermes-gateway-runtime/official-clean/run_agent.py`
- `python -m py_compile /opt/hermes-gateway-runtime/official-clean/agent/codex_runtime.py`
- Minimal `AIAgent._run_codex_stream()` probe returns `status=completed`.
- Direct low Gateway `/v1/responses` smoke returns `response.completed` and no
  `run.error` or `NoneType`.
- For ChatGPT Image 2 editing, `node tests\hermes-mobile-image-plugin.test.js`
  passes and a small direct low Gateway `chatgpt_image_edit` smoke returns
  `ok=true` with a PNG output file.
- Hermes Mobile production smoke through Gateway Pool returns a completed
  assistant message with a non-secret worker label.
- Authenticated `/api/status?detail=1` reports all expected workers healthy.

Do not store raw Authorization headers, access tokens, API keys, prompt bodies,
model outputs, or long logs in this runbook.
