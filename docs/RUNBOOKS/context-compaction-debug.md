# Runbook: Context Compaction And Chat History Debugging

Use this runbook when Hermes Mobile appears to forget topic context, carry stale
context into a new chat, become slow from long history, or answer from the wrong
Single Window / topic task group.

## Safety

Do not dump raw prompts, Gateway request bodies, full learner answers,
transcripts, full questions, push endpoints, secrets, or long tool logs while
debugging. Use ids, counts, versions, timestamps, short previews, and route
names.

## Fast Classification

1. Identify the visible surface:
   - ordinary Chat: `taskGroupId=chat`
   - group chat: `taskGroupId=group-chat`
   - task-list detail or task-stream follow-up: concrete task group id
2. Confirm whether the symptom is:
   - stale context from another task group
   - missing historical context
   - slow run start from oversized recent window
   - terminal run did not compact
   - summary exists but is low quality or misleading
3. Check whether the system is in `layered` or `legacy` mode.

## Files To Inspect

- `adapters/conversation-history-service.js`
- `adapters/context-assembly-service.js`
- `adapters/topic-context-compaction-service.js`
- `adapters/gateway-run-event-service.js`
- `adapters/mobile-runtime-environment-service.js`
- `adapters/mobile-sqlite-store.js`
- `docs/MODULES/chat-context.md`
- `docs/IMPLEMENTATION_NOTES/topic-context-layered-compaction.md`

## Configuration Checks

Relevant environment variables:

```text
HERMES_MOBILE_CONTEXT_ASSEMBLY_MODE
HERMES_WEB_CONTEXT_ASSEMBLY_MODE
HERMES_MOBILE_CONTEXT_COMPACTION_ENABLED
HERMES_WEB_CONTEXT_COMPACTION_ENABLED
HERMES_WEB_CHAT_CONTEXT_MAX_MESSAGES
HERMES_WEB_CHAT_CONTEXT_MAX_CHARS
```

Current default is layered assembly with compaction enabled.

If production behavior is harmful and the user needs function restored quickly,
temporarily set:

```text
HERMES_MOBILE_CONTEXT_ASSEMBLY_MODE=legacy
```

Restart the Hermes Mobile listener only. Gateway Pool restart is not required
for listener-side context assembly changes.

## SQLite Checks

Use the production SQLite database only through bounded metadata queries.

Tables:

```sql
SELECT topic_id, task_group_id, workspace_id, summary_version,
       last_compacted_message_id, updated_at
FROM topic_context_summaries
ORDER BY updated_at DESC
LIMIT 20;

SELECT topic_id, task_group_id, workspace_id, state_version,
       status, updated_at
FROM topic_working_states
ORDER BY updated_at DESC
LIMIT 20;

SELECT topic_id, task_group_id, COUNT(*) AS ref_count, MAX(updated_at) AS latest
FROM topic_context_refs
GROUP BY topic_id, task_group_id
ORDER BY latest DESC
LIMIT 20;
```

Do not select or print full `summary_json`, `state_json`, or `ref_json` unless
you first bound the output to a short preview and verified it contains no
private content.

## Expected Runtime Behavior

- A successful, failed, or cancelled assistant run should trigger
  `compactTaskGroup()` when the terminal message has a task group id.
- A second terminal event for the same latest message should usually return
  `already_compacted`.
- If summary/state is missing, the next run should still work through legacy
  bounded recent history.
- Historical lookup requests should include compact refs; ordinary chat should
  not inject large historical evidence.

## Common Faults

### Stale Directory Context Appears In Ordinary Chat

Check:

- `conversation-history-service.stripDirectoryAliasLinesForChatHistory()`
- whether an old client submitted stale `replyToMessageId`
- whether the message was actually sent in task stream rather than Chat

Expected behavior: ordinary Chat should not inherit task directory bindings.

### New Topic Cannot Remember Earlier Decisions

Check:

- whether `topic_context_summaries` has a row for the current
  `(threadId, taskGroupId)`
- whether the last assistant terminal event compacted successfully
- whether the system fell back to legacy because summary/state was absent

If summaries are missing but raw messages exist, this is usually a compaction
trigger or persistence problem, not data loss.

### Context Feels Slow Or Bloated

Check:

- `contextAssemblyDebug()` metadata if available
- recent message count and estimated chars
- whether long artifacts or tool output entered assistant message content
- whether request type was classified as `tool_dense`

Use bounded previews only.

### Summary Is Wrong

Immediate mitigation:

- switch to `legacy`
- keep SQLite rows for audit
- do not delete raw messages

Then inspect short previews and source refs to determine whether the summary was
low quality, stale, or generated from the wrong task group.

## Focused Tests

Run these before deploying context changes:

```powershell
node tests\conversation-history-service.test.js
node tests\context-assembly-service.test.js
node tests\topic-context-compaction-service.test.js
node tests\gateway-run-event-service.test.js
node tests\mobile-sqlite-store.test.js
node tests\architecture-refactor-boundary.test.js
git diff --check
```

For production listener changes, check `/api/status?detail=1` before restart,
backup changed files, restart listener only, then smoke status again.
