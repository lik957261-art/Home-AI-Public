# Composer Event And Receipt Contract

This contract defines how the Home AI static client handles Composer-adjacent
events, terminal receipts, thread refreshes, scroll protection, and runtime
self-checks. It is a protocol contract for the ordered `public/app-*.js`
runtime, not a new framework migration.

## Event Classes

Composer-visible events are classified into these internal classes:

| Class | Source event shape | Owning module | Refresh rule |
| --- | --- | --- | --- |
| Run lifecycle | `run.event`, `thread.updated` with active/terminal run state | `public/app-events-composer-ui.js`, `public/app-run-progress-ui.js`, Gateway run event services | May update inline run status. Terminal summaries may request one current-thread refresh. |
| Message delta | `message.delta` | `public/app-composer-streaming-message-ui.js` | Patches the visible assistant message in place. Must not trigger a full thread refresh per delta. |
| Tool output / metadata | `message` payload with assistant/tool-derived metadata | Gateway output-event services, `public/app-composer-event-state-ui.js`, action-specific services | Metadata must already be durable before projection. Client may upsert and invalidate the visible message. |
| Receipt | terminal assistant `message` or terminal `thread.updated` followed by detail read | `public/app-composer-message-invalidation-ui.js`, `public/app-composer-current-thread-refresh-ui.js` | Must request a current-thread refresh so Usage, Skills, Gateway diagnostics, and plugin actions are not stranded until route re-entry. |
| Diagnostic | Composer runtime self-check payload | `public/app-composer-self-check-ui.js` | Metadata-only H2 diagnostics may be auto-submitted to AI Ops without Owner approval. |

`public/app-event-stream-ui.js` owns only `EventSource` connection glue and JSON
fanout into `applyEvent()`. It must not own send, upload, refresh, receipt,
diagnostic, native environment, or optimistic-message policy.

## Refresh Ownership

`public/app-composer-current-thread-refresh-ui.js` owns current-thread refresh
scheduling and the detail read. It must:

- coalesce equal or later refreshes through `ComposerRefreshScheduler`;
- keep route snapshots so stale timers cannot repaint another thread;
- preserve pending refresh intent while a detail request is already in flight;
- force `stickToBottom=false` whenever user scroll protection is active;
- preserve topic-root list scroll when the visible root signature is unchanged.

`public/app-composer-message-invalidation-ui.js` owns message projection
invalidation. It must patch visible streaming assistant messages in place when
possible. Terminal assistant messages must also call
`requestComposerTerminalReceiptRefresh()` and schedule the Composer terminal
self-check.

## Scroll Protection

The user scroll protection window is part of the receipt contract. If the user
has intentionally scrolled within the protection window, terminal receipt
refresh may still fetch fresh data, but it must not force the conversation back
to the bottom. Any attempted bypass must be reported as
`composer_scroll_protection_bypassed`.

The expected path is:

1. terminal summary or terminal assistant message requests a refresh;
2. refresh scheduling keeps or upgrades the earliest useful timer;
3. `refreshCurrentThreadFromServer()` recomputes `conversationUserScrollProtectActive()`;
4. protected refresh renders with `stickToBottom=false`;
5. terminal self-check verifies the visible assistant receipt.

## Terminal Receipt Self-Check

`public/app-composer-self-check-ui.js` owns metadata-only Composer runtime
self-checks. It must never include message bodies, prompts, attachment bytes,
raw URLs, cookies, access keys, provider payloads, or long logs.

Required H2 self-check codes:

- `composer_terminal_receipt_missing`
- `composer_terminal_active_run_stuck`
- `composer_duplicate_local_server_user_message`
- `composer_scroll_protection_bypassed`

A terminal assistant message with content but no Usage, Skills, Gateway
diagnostic, or plugin action metadata must submit
`composer_terminal_receipt_missing`. These are self-check/diagnostic repair
signals, not new feature requests, and can enter the remediation loop without
Owner approval.

## Required Checks

Changes to Composer event, refresh, receipt, scroll, or self-check behavior
must run:

```bash
node tests/composer-event-contract.test.js
node tests/composer-module-boundary.test.js
node tests/composer-message-invalidation-ui.test.js
node tests/composer-refresh-scheduler.test.js
node tests/composer-self-check-ui.test.js
node tests/current-thread-refresh-scheduling.test.js
node tests/thread-state-ui-behavior.test.js
node tests/run-progress-ui-behavior.test.js
node tests/architecture-code-test-harness-map.test.js
node tests/architecture-refactor-boundary.test.js
git diff --check
```

Use `npm test` and the deployment contract before claiming closure for a major
Composer runtime change.
