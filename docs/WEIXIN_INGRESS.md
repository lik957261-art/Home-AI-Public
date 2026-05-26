# Weixin Ingress Boundary

Hermes Mobile can own Weixin/iLink message intake without patching official
Hermes Gateway source. The Gateway remains the agent execution kernel; Mobile
owns account routing, scheduling, Web Push, and outbound delivery state.

## Flow

```text
iLink / Weixin poller sidecar
  POST /api/ingress/weixin/events
Hermes Mobile
  resolves workspace/account permissions
  creates or queues a Gateway Pool run
Official Hermes Gateway profile
  streams the assistant result back to Mobile
Hermes Mobile
  exposes pending delivery
iLink / Weixin sender sidecar
  GET /api/ingress/weixin/outbound
  POST /api/ingress/weixin/outbound/<deliveryId>/ack
```

## Configuration

- `HERMES_MOBILE_WEIXIN_INGRESS_KEY`
- `HERMES_MOBILE_WEIXIN_INGRESS_KEY_PATH`
- `HERMES_MOBILE_WEIXIN_INGRESS_DEFAULT_WORKSPACE`

The ingress key is separate from browser Owner/workspace Access Keys. Do not
commit the key or the key file.

## Cutover Rule

Only one poller may own a Weixin account. If a Hermes Gateway process is still
polling the same account, Mobile cannot reliably get messages first. Cutover is
therefore:

1. Back up production Mobile state and deployment config.
2. Disable the target Weixin account in the Hermes-native Gateway poller.
3. Enable the Mobile sidecar for that account with the same cursor policy.
4. Post one controlled event to `/api/ingress/weixin/events`.
5. Confirm a Gateway Pool run starts and terminal output appears in
   `/api/ingress/weixin/outbound`.
6. Let the sender sidecar deliver the output and acknowledge it.

Do not enable two pollers and rely on timing. That can create duplicate or lost
messages.

## Event Shape

Minimal event:

```json
{
  "eventId": "provider-message-id",
  "accountId": "account-a",
  "chatId": "chat-or-room-id",
  "userId": "sender-id",
  "text": "message text",
  "timestamp": "2026-05-08T00:00:00Z"
}
```

Routing priority:

1. Explicit `workspaceId` when it exists in the workspace catalog.
2. `principalId` mapped through the workspace catalog.
3. Account/chat/user fields matched against workspace policy/route metadata.
4. Optional `HERMES_MOBILE_WEIXIN_INGRESS_DEFAULT_WORKSPACE`.

If no route matches, Mobile returns `404` and does not create a run.

## Delivery Shape

Pending outbound deliveries include:

- `deliveryId`
- account/chat/user route fields
- `threadId`, `messageId`, `taskId`
- final text content
- artifacts registered from `MEDIA:` lines
- terminal status

The sidecar must acknowledge each delivery as `sent`, `failed`, or `skipped`.
Failed acknowledgements are retained for inspection instead of being silently
retried forever.

## Sidecar Client

The repository includes a transport-only helper:

```powershell
python scripts\weixin-ingress-sidecar.py --base http://127.0.0.1:8797 --key-file <ingress-key-file> post-event --event-file event.json
python scripts\weixin-ingress-sidecar.py --base http://127.0.0.1:8797 --key-file <ingress-key-file> poll-outbound --once
python scripts\weixin-ingress-sidecar.py --base http://127.0.0.1:8797 --key-file <ingress-key-file> ack --delivery-id <id> --status sent
```

Production can use `scripts\weixin-mobile-ingress-bridge.py` through
`scripts\start-weixin-mobile-ingress-bridge.ps1` for the native iLink
transport. That bridge imports the official Weixin adapter for polling,
downloads inbound media, posts normalized events to Mobile ingress, polls
Mobile outbound delivery, and acknowledges the result after sending through
iLink. It must replace the legacy direct `hermes gateway run --replace`
Weixin poller for the same account; the starter fails its health check when
that legacy direct poller is still running.

The legacy-poller cleanup must be scoped to the top-level Weixin `HERMES_HOME`
process only. It must not match Gateway Pool profiles such as
`officialclean1`, `officialclean2`, `lowgw*`, or any process with
`HERMES_PROFILE` set or `HERMES_HOME` under `.hermes/profiles/`.

Deployment-specific iLink wrappers may still be used, but they should wrap
this Mobile ingress boundary rather than modifying `server.js` or official
Hermes Gateway source.
