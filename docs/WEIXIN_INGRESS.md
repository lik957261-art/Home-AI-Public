# Weixin Ingress Boundary

## Status

Retired on 2026-06-28.

The historical Weixin/iLink ingress boundary has been removed from Home AI.
Home AI is now the maintained communication and file-ingress product surface.
The old Weixin sidecar, ingress API, outbound delivery queue, and manual
forwarding UI are intentionally absent.

## Removed Interfaces

These former interfaces must not be treated as available:

- `POST /api/ingress/weixin/events`
- `GET /api/ingress/weixin/outbound`
- `POST /api/ingress/weixin/outbound/<deliveryId>/ack`
- `GET /api/weixin/forward-targets`
- `POST /api/weixin/forward-file`
- `POST /api/weixin/forward-markdown`
- `scripts/weixin-ingress-sidecar.py`
- `scripts/weixin-mobile-ingress-bridge.py`
- `scripts/weixin-ingress-production-smoke.js`
- `scripts/start-weixin-mobile-ingress-bridge.ps1`
- `scripts/start-weixin-mobile-ingress-bridge-windows.ps1`

## Compatibility Note

Workspace ids whose names start with `weixin_` are historical workspace
identifiers only. They remain valid identities for users, Gateway profiles,
plugin grants, Growth, Wardrobe, and other workspace-scoped data. They do not
mean Weixin transport is enabled.

## Replacement Paths

- Home AI app chat and group chat replace Weixin message intake.
- Home AI Directory, uploads, and native share/open bridges replace Weixin file
  ingress.
- Action Inbox, Web Push/native notifications, plugin notifications, and
  explicit exports replace Weixin outbound delivery.

Any future reintroduction of a third-party message sidecar must be designed as
a new product surface with a new threat model, route inventory, test matrix,
and deployment runbook. Do not reuse the retired Weixin route names or scripts.
