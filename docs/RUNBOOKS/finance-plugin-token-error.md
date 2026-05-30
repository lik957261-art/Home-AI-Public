# Finance Plugin Token Error

Last updated: 2026-05-30.

Use this runbook when the Finance / accounting embedded plugin opens from
Hermes Mobile and shows a token error, falls back to a login page, or returns a
bounded plugin diagnostic during manifest or launch.

## Expected Contract

Hermes Mobile owns the embedded plugin host and calls Finance server-side:

- Finance manifest:
  `GET http://127.0.0.1:8791/api/v1/hermes/plugin/manifest`
- Finance launch:
  `POST http://127.0.0.1:8791/api/v1/hermes/plugin/launch`
- Hermes Mobile manifest route:
  `GET /api/hermes-plugins/finance/manifest`
- Browser-facing iframe entry:
  `/api/hermes-plugins/finance/proxy/api/v1/hermes/plugin/launch/<redacted>`
- Expected launch redirect:
  `/api/hermes-plugins/finance/proxy/finance.html?embed=hermes`
- Expected session cookie name:
  `finance_hermes_session`

Finance launch accepts `workspace_id`, `workspace_key`, and `role` in the JSON
body. `user_key` is optional and must be a separate workspace-user key when it
exists. Hermes Mobile must not synthesize `user_key` from the workspace key.

Hermes Mobile must not send the Finance workspace key as
`Authorization: Bearer ...` during launch. Finance owns Bearer credentials for
its independent direct-login access-token layer, so a Hermes workspace key in
the Bearer header is expected to fail as `finance_access_token_invalid`.

## Triage

1. Check Hermes Mobile status and wait for `concurrency.activeGlobal=0` before a
   listener restart.
2. Probe `GET /api/hermes-plugins/finance/manifest` through Hermes Mobile and
   record only bounded fields:
   - HTTP status
   - `available`
   - `code`
   - `tokenStatus`
   - `sameOriginProxy`
   - redacted `entryUrl` shape
3. If the Hermes manifest says `tokenStatus=launch_failed`, probe the Finance
   launch contract server-side with the same workspace id/key source.
4. Compare two launch shapes when diagnosing this specific regression:
   - body-only launch with `workspace_id`, `workspace_key`, and `role`
   - launch that also sends `Authorization: Bearer <workspace-key>`
5. If body-only succeeds and Bearer fails with `finance_access_token_invalid`,
   the problem is Hermes Mobile launch header construction, not Finance user
   binding.
6. After a Hermes-side fix, verify the full chain:
   - Hermes manifest returns `available=true`
   - `tokenStatus=launch_token_issued`
   - browser-facing entry is under
     `/api/hermes-plugins/finance/proxy/...`
   - launch proxy returns a `302`
   - redirected Finance page returns `200`
   - a bounded authenticated Finance API such as `/api/finance/overview`
     returns `200` and `ok=true`

## Non-Owner Workspaces

Finance is Owner-visible by default. A non-Owner workspace can list or launch
Finance only after an explicit Hermes plugin authorization or a deployment
authorized-workspace setting.

For non-Owner user binding, Hermes Mobile needs a real separate
workspace-user key or a deliberate workspace-only Finance binding. It must not
fall back to the Owner ledger, and it must not reuse the long-lived workspace
key as a user key.

## Privacy

Do not store or paste:

- raw Owner keys
- Finance workspace keys
- Finance direct-login access tokens
- launch token values
- session cookie values
- private finance rows or ledger contents
- full request/response bodies
- long logs

Allowed evidence is bounded metadata: route path, HTTP status, token status,
error code, request id, cookie name, redirect shape, and redacted entry URL
shape.
