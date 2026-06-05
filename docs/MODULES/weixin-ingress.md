# Module: Weixin And iLink Ingress

## Responsibility

Weixin/iLink ingress owns inbound event normalization, workspace/account routing, dedicated Weixin chat window behavior, outbound delivery state, and manual Weixin file forwarding.

Hermes Mobile owns product routing and delivery state; official Hermes Gateway remains the model/tool execution kernel.

## Core Files

- `docs/WEIXIN_INGRESS.md`
- `server-routes/weixin-api-routes.js`
- `adapters/weixin-ingress-event-service.js`
- `adapters/weixin-ingress-provider.js`
- `adapters/weixin-runtime-composition-service.js`
- `adapters/weixin-outbound-delivery-service.js`
- `adapters/weixin-forward-service.js`
- `adapters/weixin-file-forward-service.js`
- `adapters/weixin-markdown-forward-service.js`
- `adapters/weixin-window-migration-service.js`
- `scripts/weixin-ingress-production-smoke.js`
- `scripts/weixin-mobile-ingress-bridge.py`
- `scripts/weixin-ingress-sidecar.py`
- `scripts/start-weixin-mobile-ingress-bridge.ps1`

## Product Rules

- Weixin traffic is separated from ordinary Hermes Mobile chat.
- The dedicated Weixin window is identified by `thread.externalIngress.source === "weixin"` and opened with `weixinChat=1`.
- Ordinary private chat must not absorb Weixin messages.
- A normalized inbound text event that is exactly `#` or full-width `＃`, with no attachments, is a heartbeat command. It must not create a thread, message, Gateway run, or delivery.
- Only one poller may own a Weixin account. Do not run a legacy direct Gateway poller and the Mobile sidecar for the same account.
- Ingress uses its own sidecar credential. Production ingress smokes use
  `X-Hermes-Mobile-Ingress-Key`; browser/API `X-Hermes-Web-Key` is a negative
  wrong-header probe for this endpoint, not a valid ingress transport.

## Production Smoke

Use the checked heartbeat production smoke for Mac route workspaces:

```powershell
node scripts\weixin-ingress-production-smoke.js --base http://127.0.0.1:8797 --ingress-key-file <ingress-key-file> --workspaces weixin_wuping,weixin_stephen,weixin_test_1 --json
```

The harness first proves `/api/public-config` on the same origin, then verifies
that the ingress key is rejected under the browser/API `X-Hermes-Web-Key`
header, then posts one `#` heartbeat event per route workspace using
`X-Hermes-Mobile-Ingress-Key`. Its output is bounded metadata only:
workspace ids, status, heartbeat/skipped/reason, event id, and header names. It
must not print the ingress key, raw key path, message text, contact lists,
mailbox codes, or Weixin histories.

For Mac production closure, this heartbeat smoke is also run by
`scripts/macos-production-closure-validation.js`. Keep the focused harness for
route-level diagnosis and use the closure harness before declaring a Mac
deployment or repair complete.

This is a route/auth/heartbeat production smoke. It proves the sidecar auth
boundary and route workspaces are accepted without creating a thread, message,
Gateway run, or delivery. It is not a full normal-message end-to-end proof; a
normal text event can create a Gateway run and outbound delivery and should be
performed only as a controlled user-approved E2E check for a real route.

## File Forwarding Rules

- Manual Markdown forwarding should materialize a phone-readable PDF or a safe fallback instead of sending raw Markdown by default.
- Persistent UI status should show only for manual file forwards whose delivery has reached a terminal acknowledged status.
- Do not synthesize misleading default captions for forwarded files.

## Validation

- Route/service tests for changed Weixin modules.
- Sidecar check mode or one bounded metadata-only test event.
- Production route workspace checks use
  `node scripts\weixin-ingress-production-smoke.js --ingress-key-file <file>`
  plus `node tests\weixin-ingress-production-smoke-harness.test.js`.
- Listener restart is required for service/route changes.
- Do not print Weixin credentials, mailbox codes, push endpoints, raw contact lists, or full message histories.

## Debug Pointers

If Weixin messages appear in the ordinary chat, inspect route-to-thread logic before Gateway routing. If duplicate messages appear, verify that only one poller owns the account. If a heartbeat creates a task, check exact normalized-text handling in `weixin-ingress-event-service`.
