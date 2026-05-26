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
- `scripts/weixin-mobile-ingress-bridge.py`
- `scripts/weixin-ingress-sidecar.py`
- `scripts/start-weixin-mobile-ingress-bridge.ps1`

## Product Rules

- Weixin traffic is separated from ordinary Hermes Mobile chat.
- The dedicated Weixin window is identified by `thread.externalIngress.source === "weixin"` and opened with `weixinChat=1`.
- Ordinary private chat must not absorb Weixin messages.
- A normalized inbound text event that is exactly `#` or full-width `＃`, with no attachments, is a heartbeat command. It must not create a thread, message, Gateway run, or delivery.
- Only one poller may own a Weixin account. Do not run a legacy direct Gateway poller and the Mobile sidecar for the same account.

## File Forwarding Rules

- Manual Markdown forwarding should materialize a phone-readable PDF or a safe fallback instead of sending raw Markdown by default.
- Persistent UI status should show only for manual file forwards whose delivery has reached a terminal acknowledged status.
- Do not synthesize misleading default captions for forwarded files.

## Validation

- Route/service tests for changed Weixin modules.
- Sidecar check mode or one bounded metadata-only test event.
- Listener restart is required for service/route changes.
- Do not print Weixin credentials, mailbox codes, push endpoints, raw contact lists, or full message histories.

## Debug Pointers

If Weixin messages appear in the ordinary chat, inspect route-to-thread logic before Gateway routing. If duplicate messages appear, verify that only one poller owns the account. If a heartbeat creates a task, check exact normalized-text handling in `weixin-ingress-event-service`.
