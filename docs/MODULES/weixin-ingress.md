# Module: Weixin And iLink Ingress

## Status

Retired on 2026-06-28.

Home AI no longer exposes Weixin/iLink ingress, outbound delivery, manual
Weixin file forwarding, or a dedicated Weixin chat window. Home AI is the
maintained communication surface. The old Weixin transport was a narrower,
less stable subset and increased runtime, deployment, and security complexity.

This document is kept only as a retirement record so future work does not
reintroduce the old sidecar boundary by accident.

## Removed Runtime Surface

The following surfaces are intentionally absent:

- `/api/ingress/weixin/events`
- `/api/ingress/weixin/outbound`
- `/api/ingress/weixin/outbound/<deliveryId>/ack`
- `/api/weixin/forward-targets`
- `/api/weixin/forward-file`
- `/api/weixin/forward-markdown`
- Weixin ingress/outbound route registration in the mobile API dispatcher.
- Dedicated Weixin chat URL state such as `weixinChat=1`.
- Weixin manual file-forward buttons in artifact, PDF, and file preview views.
- Weixin sidecar startup scripts and production heartbeat smoke scripts.

## Preserved Compatibility

Existing workspace ids such as `weixin_wuping`, `weixin_stephen`, and
`weixin_test_1` remain valid workspace identities. They are historical names,
not evidence that a Weixin transport is active.

Workspace catalogs and plugin bindings may still reference those ids. Do not
rename them as part of the Weixin ingress retirement unless a separate
workspace-identity migration is planned and validated.

## Replacement Product Path

- Use Home AI chat, group chat, directory-bound topics, plugin conversations,
  Action Inbox, and native app share/open flows as the maintained user-facing
  communication and file-ingress surfaces.
- Files should enter through Home AI Directory APIs, native share extensions,
  uploads, or plugin-owned import flows. They should not depend on a Weixin
  polling sidecar.
- External delivery should go through maintained Web Push/native notification,
  Action Inbox, plugin notification, email, or explicit user-approved export
  paths.

## Guardrails

- Do not restore Weixin routes, sidecar scripts, or manual forwarding buttons
  without a new product requirement and a fresh security review.
- Do not add Weixin to `EXTERNAL_DESTINATIONS` or trusted origin-reply egress
  policy.
- Do not treat `weixin_*` workspace ids as transport state.
- Keep the negative tests that assert retired Weixin files and routes remain
  absent.
