# Production API Auth Header

Use this runbook when a production smoke, deployment script, or ad-hoc status
probe fails with an authentication error even though the access-key file exists.

## Canonical Rule

- Positive authenticated API smokes use `X-Hermes-Web-Key`.
- Same-origin browser sessions may use the `hermes_web_key` cookie.
- `X-Hermes-Access-Key` is not a Hermes Mobile API authentication header.
  It is reserved as a negative control in the checked smoke harness.

This is not a key-content failure. A valid Owner or workspace key will still be
rejected if it is transported under the unsupported `X-Hermes-Access-Key`
header.

## Required Harness

Run the checked harness instead of writing a one-off production status probe:

```powershell
node scripts\production-status-smoke.js --access-key-file <owner-key-file> --base <origin> --json
```

The harness must:

- prove the same origin through `/api/public-config` before sending a key;
- authenticate `/api/status?detail=1` with `X-Hermes-Web-Key`;
- verify that the same key sent with `X-Hermes-Access-Key` is rejected;
- output only bounded metadata, including `authHeader`, `wrongAuthHeader`,
  status, client version, active run count, and wrong-header status;
- never print key contents or the raw key file path.

## Failure Interpretation

- `production_origin_identity_mismatch`: the target origin is not Home AI, or
  the public config did not identify the expected app. Stop and fix the target
  origin before sending any key.
- `production_status_smoke_status_failed`: the canonical
  `X-Hermes-Web-Key` request failed. Check key validity, owner/workspace scope,
  listener state, and auth store state.
- `production_status_smoke_wrong_header_accepted`: the negative control passed.
  This is an auth-boundary regression and must be fixed before deployment is
  accepted.

## Why This Recurred

The product credential is commonly called an "Access Key", but the HTTP
transport contract is the web auth header `X-Hermes-Web-Key`. Hand-written
Node, Python, curl, or PowerShell probes can easily invent the plausible header
`X-Hermes-Access-Key`; the server does not read that header. This creates false
diagnoses such as "invalid key" even when the file-backed key is correct.

Do not write one-off production status probes unless the new probe is committed
as a source harness and has a wrong-header negative assertion.

Do not add `X-Hermes-Access-Key` as a compatibility alias to hide the mistake.
That would turn a failed diagnostic into a supported auth path and weaken the
boundary between credential labels, browser/API transport, and ingress
transport. Fix the harness or script that sent the wrong header instead.

## Regression Prevention Contract

- Treat "Access Key" as the credential class only. It must not be mechanically
  translated into an HTTP header name.
- Treat `X-Hermes-Web-Key` as the only positive browser/API header for
  file-backed Owner or workspace key smokes.
- Treat `X-Hermes-Access-Key` as a negative control only. A request that uses
  this header and receives `Invalid key` has not proven that the key file is
  wrong.
- Every production smoke that reads a key file must either use
  `scripts/production-status-smoke.js` or include an equivalent positive
  `X-Hermes-Web-Key` probe, same-origin identity proof, and wrong-header
  negative probe.
- Harness output may name the headers as bounded metadata, but must not print
  the key content or raw key path.
- `tests/production-status-smoke-harness.test.js` scans `scripts/` for
  `X-Hermes-Access-Key`; it is allowed only in the checked negative-control
  harness. If a new script needs a key-file production smoke, route it through
  `scripts/production-status-smoke.js` or extend the same positive/negative
  contract in a committed test.
