# Topic Context Layered Compaction Implementation Note

## Purpose

This note maps the original layered-context design to the current Hermes Mobile
implementation. The original design remains in
`docs/TOPIC_CONTEXT_LAYERED_COMPACTION_IMPLEMENTATION.zh-CN.md`; this file is
the code-facing companion that future agents should read before changing
context behavior.

## Product Intent

Hermes Mobile should not keep injecting long raw topic history into every model
call. Raw history remains stored and auditable, but the prompt should normally
use compact topic state plus a bounded recent window.

The target behavior is:

- current request first
- stable topic summary for long-term facts and decisions
- working state for the active task
- bounded recent raw turns for local continuity
- evidence refs only when the user asks for historical basis or details
- fallback to legacy history if compacted context is missing or unsafe

## Current Code State

Current implementation is a minimum viable layered system.

Implemented:

- `adapters/context-assembly-service.js`
  - supports `legacy` and `layered` modes
  - selects `normal_chat`, `tool_dense`, and `historical_lookup`
  - injects formatted topic summary, working state, and historical refs
  - records bounded debug metadata through `lastAssemblyDebug()`
- `adapters/topic-context-compaction-service.js`
  - compacts one `(threadId, taskGroupId)` into summary/state/refs
  - writes through the injected store boundary
  - skips duplicate compaction when `lastCompactedMessageId` is unchanged
- `adapters/gateway-run-event-service.js`
  - triggers compaction on `run.completed`, `run.failed`, and `run.cancelled`
- `adapters/mobile-sqlite-store.js`
  - persists `topic_context_summaries`
  - persists `topic_working_states`
  - persists `topic_context_refs`
- `adapters/mobile-runtime-environment-service.js`
  - defaults `CONTEXT_ASSEMBLY_MODE` to `layered`
  - defaults compaction to enabled

Not fully implemented:

- model-assisted semantic summary merge
- dedicated `tool_result_digest` repository/service
- full `long_form_generation` profile
- source-ref search beyond stored compact refs
- strict `input_hash` concurrency merge workflow
- UI surface for context summary version/source diagnostics

## Data Flow

1. A user message starts a Gateway run.
2. `conversation-history-service` delegates history assembly to
   `context-assembly-service`.
3. In `layered` mode, the assembler reads topic summary/state/refs for the
   current `(threadId, taskGroupId)`.
4. If summary/state is absent, the assembler uses the legacy bounded recent
   history.
5. When the run reaches a terminal state, `gateway-run-event-service` calls
   `compactTaskGroup()`.
6. The compaction service rebuilds summary/state/refs from completed user and
   assistant messages in that task group and persists them in SQLite.
7. Later runs read the stable persisted summary/state before adding recent raw
   messages.

## Assembly Rules

- The latest user request is handled outside the prior-message history and must
  not be replaced by a summary.
- For `singleWindow` threads, prior messages are filtered to the latest
  message's task group.
- Running assistant placeholders are excluded from context history.
- Empty content is excluded.
- Ordinary chat strips stale directory alias lines.
- `tool_dense` uses a shorter recent window than `normal_chat`.
- `historical_lookup` may include compact evidence refs.

## Persistence Rules

Primary tables:

- `topic_context_summaries`
- `topic_working_states`
- `topic_context_refs`

Persistence is summary-only. Store stable ids, short previews, versions, and
timestamps. Do not store raw private payloads.

The current compaction service increments `summaryVersion` and `stateVersion`
from the previous stored values. It uses `lastCompactedMessageId` to avoid
rewriting unchanged task-group summaries.

## Rollback

First rollback:

```text
HERMES_MOBILE_CONTEXT_ASSEMBLY_MODE=legacy
```

Second rollback, if terminal compaction itself is causing production issues:

```text
HERMES_MOBILE_CONTEXT_COMPACTION_ENABLED=0
```

Rollback should not delete existing SQLite rows. Keeping rows makes later
diagnosis and re-enable safer.

## Safety Boundaries

- Do not print or persist full prompt text.
- Do not print or persist raw Gateway request bodies for context debugging.
- Do not persist full learner submissions, transcripts, questions, answer keys,
  full reading passages, raw prompts, long tool logs, secrets, or push
  endpoints.
- Debug metadata should be counts, mode/profile, estimated characters,
  versions, ids, and short previews only.

## Tests

Focused tests:

- `node tests\conversation-history-service.test.js`
- `node tests\context-assembly-service.test.js`
- `node tests\topic-context-compaction-service.test.js`
- `node tests\gateway-run-event-service.test.js`
- `node tests\mobile-sqlite-store.test.js`

Run `node tests\architecture-refactor-boundary.test.js` if service/runtime
composition is touched.

## Future Hardening

- Add a deterministic source-ref retrieval layer for `historical_lookup`.
- Add a bounded tool-result digest service so long tool outputs never re-enter
  prompt through message content.
- Add semantic merge rules for user corrections and superseded decisions.
- Populate and enforce `input_hash` conflict checks before asynchronous
  background compaction overwrites a summary.
- Add a read-only Owner diagnostic endpoint that reports context mode, summary
  version, latest compacted message id, ref count, and fallback state without
  exposing private content.
