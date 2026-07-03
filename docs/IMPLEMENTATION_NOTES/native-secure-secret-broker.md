# Native Secure Secret Broker

## Goal

Owner sometimes needs to hand a temporary password or API key to Codex/Home AI
without typing it into chat or writing an ad hoc local file. The accepted path
is an explicit native iOS action:

1. User copies a secret.
2. User taps the native shell's "安全粘贴给 Codex/Home AI" action.
3. Native reads `UIPasteboard` once for that action.
4. Native POSTs the value to Home AI.
5. Home AI returns a short-lived `secretRef`.
6. The scoped target plugin runtime resolves or uses the reference through an
   authorized bounded path.

Home AI must not implement passive clipboard polling or arbitrary plugin
clipboard access.

## Server API

Create:

```http
POST /api/native/secure-secrets
X-Hermes-Web-Key: <Home AI Access Key>
Content-Type: application/json
```

```json
{
  "source": "ios_clipboard",
  "targetPlugin": "codex",
  "purpose": "current_task",
  "ttlSeconds": 600,
  "value": "<clipboard text>"
}
```

Response:

```json
{
  "ok": true,
  "secretRef": "sec_...",
  "expiresAt": "2026-07-03T00:00:00.000Z",
  "source": "ios_clipboard",
  "targetPlugin": "codex",
  "purpose": "current_task",
  "workspaceId": "owner",
  "maxUses": 1,
  "remainingUses": 1,
  "valueBytes": 32,
  "valueSha256Prefix": "..."
}
```

Resolve:

```http
POST /api/native/secure-secrets/<secretRef>/resolve
X-Hermes-Web-Key: <Home AI Access Key>
Content-Type: application/json
```

```json
{
  "targetPlugin": "codex",
  "purpose": "current_task"
}
```

The resolve route may return plaintext to a trusted runtime/tool caller. It is
not a UI projection and must not be surfaced into model-visible chat,
diagnostics, logs, task cards, screenshots, or normal plugin history.

## Implementation

- Service: `adapters/native-secure-secret-broker-service.js`
- Routes: `server-routes/native-secure-secret-api-routes.js`
- Dispatcher registration: `server-routes/mobile-api-dispatcher.js`
- Composition wiring: `server-routes/mobile-api-composition.js`
- Focused tests:
  - `tests/native-secure-secret-broker-service.test.js`
  - `tests/native-secure-secret-api-routes.test.js`

The first implementation is intentionally process-local and in-memory. It does
not write the raw value to SQLite, JSON, logs, diagnostics, or the filesystem.
Default TTL is ten minutes. Default `maxUses` is one, and the broker clears the
stored value after the final successful resolution. Expired records are pruned.

Allowed inputs in the first version:

- `source`: `ios_clipboard`
- `targetPlugin`: `codex`
- `purpose`: `current_task`
- maximum secret size: 64 KiB
- maximum TTL: 15 minutes
- maximum uses: 3

## Permission Model

The API uses normal Home AI browser/API auth through `X-Hermes-Web-Key`.
Workspace and principal are resolved from the authenticated request context.
Native request body fields such as `workspaceId`, `actorWorkspaceId`,
`principalId`, plugin launch tokens, cookies, or plugin access keys are not
authority and must not change the bound workspace.

Audit owner read-only keys are rejected because creating or resolving a secret
is a write/use operation.

Resolution requires:

- same workspace as the creating auth context;
- matching target plugin;
- matching purpose when supplied;
- not expired;
- remaining use count.

Failure codes are bounded, for example:

- `secure_secret_unauthorized`
- `secure_secret_readonly_key_denied`
- `secure_secret_workspace_required`
- `secure_secret_source_not_allowed`
- `secure_secret_target_not_allowed`
- `secure_secret_purpose_not_allowed`
- `secure_secret_value_required`
- `secure_secret_value_too_large`
- `secure_secret_not_found`
- `secure_secret_expired`
- `secure_secret_workspace_denied`
- `secure_secret_target_mismatch`
- `secure_secret_purpose_mismatch`
- `secure_secret_used_up`

## Native Integration Notes

The iOS shell should:

- expose only a deliberate user action, not passive clipboard monitoring;
- include `X-Hermes-Web-Key` and same Home AI origin policy as other native
  APIs;
- omit workspace override and plugin credential fields;
- show only the returned `secretRef`/expiry metadata if any UI confirmation is
  needed;
- avoid logging pasteboard contents, secretRef resolver responses, raw request
  bodies, or raw error bodies.

## Codex Plugin Integration Notes

Codex is the first supported target. The preferred future plugin integration is
tool/action-specific consumption such as "use this `secretRef` while running an
auth command" so plaintext never enters model-visible text. Until that exists,
the HTTP resolver is the bounded interoperability path for trusted runtime
code. Codex-side logs and task returns must redact plaintext and may mention
only the `secretRef`, expiry, target plugin, byte count, and bounded result
code.
