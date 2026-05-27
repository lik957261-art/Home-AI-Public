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

## Hotfix Applied On 2026-05-27

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

After patching, restart Gateway Pool or the affected worker group so already
running Python processes reload `run_agent.py`.

## Validation

Required checks:

- `python -m py_compile /opt/hermes-gateway-runtime/official-clean/run_agent.py`
- Minimal `AIAgent._run_codex_stream()` probe returns `status=completed`.
- Direct low Gateway `/v1/responses` smoke returns `response.completed` and no
  `run.error` or `NoneType`.
- Authenticated `/api/status?detail=1` reports all expected workers healthy.

Do not store raw Authorization headers, access tokens, API keys, prompt bodies,
model outputs, or long logs in this runbook.
