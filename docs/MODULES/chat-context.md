# Module: Chat Context And Topic Compaction

## Responsibility

Chat context owns how Hermes Mobile turns stored thread messages, task-group
state, compacted topic summaries, and evidence references into the bounded
conversation history sent to Gateway runs.

It does not own raw message storage, access-key auth, Gateway worker selection,
or UI rendering. Raw thread messages remain the canonical record; context
assembly only decides what is injected into the next model call.

## Core Rules

- The latest user request must be preserved through the run-start path. A
  compacted summary may add background, but must not replace the current
  request.
- Raw history remains stored in `threads` / `messages`; it is not deleted by
  compaction.
- Context compaction is scoped by `(threadId, taskGroupId)`.
- Ordinary Chat uses stable `taskGroupId=chat`.
- Group Chat uses stable `taskGroupId=group-chat` and still relies on group
  membership and sender-workspace access policy.
- Task-list/task-stream replies use their concrete task group id. Unquoted
  task-stream sends should remain stateless new tasks.
- Directory bindings are not automatically inherited by ordinary Chat. Stale
  `目录别名` / `Directory aliases` lines must be stripped from chat history.
- Directory-bound topics are explicit context scopes. One directory may collect
  multiple topic chats, but each topic context remains scoped by its own
  `(threadId, taskGroupId)` and may include only the selected directory's
  cleaned summaries, selected files, and bounded previews.
- Long artifacts, long tool logs, raw prompts, full learner content, secrets,
  and push endpoints must not be written into context summaries or debug
  metadata.

## Context Layers

The intended layered model is documented in
`docs/TOPIC_CONTEXT_LAYERED_COMPACTION_IMPLEMENTATION.zh-CN.md`.

Current implementation uses these practical layers:

- Runtime/system instructions and access policy are injected outside topic
  compaction.
- Plugin-topic bindings, when implemented, are injected as bounded metadata and
  routing context only after effective-workspace plugin authorization is
  resolved. Structured plugin MCP remains the primary source for live plugin
  data; cleaned delivery-directory files are supporting context.
- Directory-topic bindings, when implemented, are injected as bounded directory
  metadata and selected evidence. They do not authorize file access and must
  resolve all file context through the directory boundary service.
- `topic_summary` is read from `topic_context_summaries` when layered mode is
  enabled and a stable summary exists.
- `working_state` is read from `topic_working_states` when available.
- Recent raw messages are still included as a bounded window.
- `topic_context_refs` are injected only for historical-lookup style requests.
- If no compacted summary/state exists, the assembler falls back to the legacy
  bounded recent-window behavior.

## Configuration

- `HERMES_MOBILE_CONTEXT_ASSEMBLY_MODE` / `HERMES_WEB_CONTEXT_ASSEMBLY_MODE`
  controls assembly mode. Supported values are `layered` and `legacy`; current
  default is `layered`.
- `HERMES_MOBILE_CONTEXT_COMPACTION_ENABLED` /
  `HERMES_WEB_CONTEXT_COMPACTION_ENABLED` controls terminal-event compaction;
  current default is enabled.
- Legacy chat-window bounds remain available through
  `HERMES_WEB_CHAT_CONTEXT_MAX_MESSAGES` and
  `HERMES_WEB_CHAT_CONTEXT_MAX_CHARS`.

Use `legacy` as the first rollback if summaries appear stale, missing, or
harmful. Do not delete generated summary/state rows during rollback.

## Implementation Map

- `adapters/conversation-history-service.js`
  - legacy bounded history
  - stale tool-availability claim filtering
  - directory alias stripping
- `adapters/context-assembly-service.js`
  - layered assembly
  - profile selection
  - summary/state/evidence injection
  - fallback metadata
- `adapters/topic-context-compaction-service.js`
  - terminal-task compaction into summary/state/refs
- `adapters/gateway-run-event-service.js`
  - invokes compaction on run completed, failed, or cancelled
- `adapters/mobile-sqlite-store.js`
  - persists `topic_context_summaries`, `topic_working_states`, and
    `topic_context_refs`
- `adapters/mobile-runtime-environment-service.js`
  - owns context-related environment defaults

## Current Implementation Limits

- Current summary generation is a deterministic compact preview of recent
  messages and refs. It is not yet a full semantic summarizer.
- `long_form_generation` is part of the design target but is not a first-class
  current profile.
- Dedicated `tool_result_digest` service is still a design target. Current
  code relies on bounded message content, event previews, and existing runtime
  hygiene rather than a full digest repository.
- The SQLite schema has `input_hash` and event-id fields for future audit and
  concurrency work, but the current compaction service mainly guards by
  `lastCompactedMessageId`.
- Plugin-topic context is still a design target. The implementation must not
  blindly import plugin delivery directories into every prompt; it needs a
  service-owned selector that prefers cleaned summaries, selected reports,
  source ids, and bounded previews.

## Privacy

Never store these in summaries, refs, tests, docs, handoffs, or run-status
metadata:

- raw secrets, Access Keys, OAuth tokens, browser credentials, API keys
- push endpoints or subscription payloads
- raw prompts or full model responses
- full learner answers, full transcripts, full questions, answer keys, or full
  reading passages
- long tool logs or generated private reports

Use bounded summaries, source ids, counts, statuses, and short previews.

## Validation

Focused checks for this module:

- `node tests\conversation-history-service.test.js`
- `node tests\context-assembly-service.test.js`
- `node tests\topic-context-compaction-service.test.js`
- `node tests\gateway-run-event-service.test.js`
- `node tests\mobile-sqlite-store.test.js`
- `node tests\architecture-refactor-boundary.test.js` when runtime/service
  boundaries are touched.
