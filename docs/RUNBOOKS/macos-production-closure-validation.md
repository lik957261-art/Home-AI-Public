# Mac Production Closure Validation

Use this runbook when Mac Studio production has been changed, migrated, repaired,
or revalidated after a Gateway/Profile/Skill/MCP/plugin/Weixin/auth-header
incident.

The checked closure harness is:

```bash
sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node \
  /Users/hermes-host/HermesMobile/app/scripts/macos-production-closure-validation.js \
  --json
```

Run it from an operator SSH session or the Mac terminal. It reads secret values
from their configured files, but it must not print key contents, raw key paths,
OAuth tokens, callback URLs, full prompts, full thread bodies, or private user
content.

## Scope

The harness is a production closure check, not an installer.

It validates:

- `/api/public-config` identifies `Home AI`.
- `/api/status?detail=1` passes with `activeGlobal=0`.
- The positive browser/API auth header is `X-Hermes-Web-Key`.
- The wrong browser/API header `X-Hermes-Access-Key` is rejected.
- Gateway Pool is enabled in hybrid mode and exposes the expected worker count.
- Mac production profile audit has `ok=true`, no issues, and no warnings.
- Mac worker filesystem ACL checks pass, including cross-workspace deny checks.
- Native Gateway schema probes expose the required MCP callables for Wuping,
  Owner, and test profiles.
- DeepSeek ordinary Owner routing uses `deepseekgw1`.
- DeepSeek Owner maintenance routing uses `deepseekmaint1` with
  `owner_high_privilege`.
- Weixin heartbeat ingress uses `X-Hermes-Mobile-Ingress-Key`, rejects
  `X-Hermes-Web-Key`, and does not create a run, thread, or message.
- Owner/OpenAI concurrent product-route smokes complete without the second run
  becoming a Gateway startup failure.
- Final status returns to `activeGlobal=0`.

Grok/xAI is intentionally outside the default closure gate. It remains a
deferred manual OAuth follow-up because it requires an interactive xAI login.
Use `docs/RUNBOOKS/grok-gateway-auth.md` and the Mac desktop
`HomeAI-Grok-XAI-Reauth.command` wrapper for that path. Do not paste OAuth callback URLs or authorization codes into chat, docs, logs, or handoffs.

## Expected Output

With `--json`, the top-level shape is bounded metadata:

```json
{
  "ok": true,
  "scope": {
    "grokXai": "deferred_manual_oauth_not_included"
  },
  "status": {
    "activeGlobal": 0,
    "authHeader": "X-Hermes-Web-Key",
    "wrongHeaderDenied": true
  },
  "profileAudit": {
    "issueCount": 0,
    "warningCount": 0
  },
  "acl": {
    "failedCount": 0
  }
}
```

Treat any top-level `ok=false`, nonzero profile issue/warning count, failed ACL
row, missing schema callable, wrong DeepSeek profile, failed Weixin route, or
nonzero final `activeGlobal` as a production blocker for the non-Grok closure
gate.

## Focused Alternatives

Use the focused harnesses when investigating one subsystem:

```bash
sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node \
  /Users/hermes-host/HermesMobile/app/scripts/production-status-smoke.js \
  --access-key-file /Users/hermes-host/HermesMobile/data/secrets/owner-web-key.secret \
  --base http://127.0.0.1:8797 \
  --json

sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node \
  /Users/hermes-host/HermesMobile/app/scripts/macos-production-profile-audit.js \
  --root /Users/hermes-host/HermesMobile \
  --json

sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node \
  /Users/hermes-host/HermesMobile/app/scripts/macos-worker-filesystem-access-harness.js \
  --root /Users/hermes-host/HermesMobile \
  --json
```

Do not replace the checked closure harness with an ad hoc inline Node/Python or
shell script. If a new Mac production failure mode needs closure coverage, add
it to `scripts/macos-production-closure-validation.js` and extend
`tests/macos-production-closure-validation-harness.test.js`.
