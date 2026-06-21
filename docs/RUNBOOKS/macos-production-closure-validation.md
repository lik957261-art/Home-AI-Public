# Mac Production Closure Validation

Use this runbook when Mac Studio production has been changed, migrated, repaired,
or revalidated after a Gateway/Profile/Skill/MCP/plugin/Weixin/auth-header
incident.

The checked closure harness is:

```bash
sudo /Users/example/path \
  /Users/example/path \
  --json
```

The harness reads the expected static client version from
`/Users/example/path` by default and passes it
to every `production-status-smoke.js` call as `--expected-version`. Operators
may pass `--expected-version <version>` only when validating an explicitly
reviewed production app path. A served version mismatch is a closure failure.

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
- Mac production profile audit has `ok=true`, no issues, and no blocking
  warnings, including loaded system LaunchDaemons for every enabled manifest
  worker. Cold workers that have never started may report
  `telemetry_state_db_missing:<profile>` or
  `telemetry_response_store_missing:<profile>` as allowed warnings after
  manifest telemetry paths and listener ACLs are already in place.
- The configured Gateway runtime Python is executable and does not resolve into
  a developer account home such as `/Users/example/path` or `/Users/example/path`.
  Production workers must run from a production-owned runtime copy.
- Mac worker filesystem ACL checks pass, including cross-workspace deny checks.
- Workspace catalog paths resolve to the Mac live drive, and all active
  workspaces can create and preview the standard plugin delivery directories
  under `插件/<plugin title>`. Temporary `codex-disposable-*` workspaces may be
  reported as skipped when they do not expose an allowed writable directory
  boundary; ordinary user workspaces must still pass.
- Directory-bound topics pass all-workspace preview in both path-only and
  `--simulate-ui-route` modes. This catches Windows/WSL-to-Mac metadata drift,
  rootless Mac drive paths, stale project/subproject ids, and shared-directory
  repairs that are valid by physical path but fail when clicked from the static
  client.
- Wardrobe binding/proxy content smoke verifies live `.hermes-wardrobe`
  configs do not point at the legacy `192.168.10.99:8765` origin, Home manifest
  launches Wardrobe through `http://127.0.0.1:8765`, the same-origin proxy entry
  returns nonblank HTML, and the launched workspace exposes a positive bounded
  bootstrap `item_count`.
- Native Gateway schema probes expose the required MCP callables for Wuping,
  Owner, and test profiles, plus the standard profile-local base tools
  `http_request`, `weather`, `mobile_web_search`, `mobile_web_extract`,
  `image_generate`, `chatgpt_image_edit`, `chatgpt_image_erase`,
  `docx_extract_text`, and `audio_transcribe`.
- DeepSeek ordinary Owner routing uses `deepseekgw1`.
- DeepSeek Owner maintenance routing uses `deepseekmaint1` with
  `owner_high_privilege`.
- Weixin heartbeat ingress uses `X-Hermes-Mobile-Ingress-Key`, rejects
  `X-Hermes-Web-Key`, and does not create a run, thread, or message.
- After static UI changes, `/api/client-version` reports the deployed client
  version from the live Mac listener, the served `/api/status?detail=1`
  `clientVersion` matches the expected app-shell version, and visual smoke
  verifies the changed surface against the live Mac URL rather than only the
  development checkout.
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
  "expectedVersion": "20260608-runtime-config-arch-v627",
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
    "warningCount": 2,
    "blockingWarningCount": 0,
    "allowedWarningCount": 2
  },
  "runtimePython": {
    "ok": true,
    "issue": ""
  },
  "acl": {
    "failedCount": 0
  },
  "pluginDirectory": {
    "ok": true,
    "workspaceCount": 6
  },
  "boundDirectory": {
    "path": {
      "ok": true,
      "workspaceCount": 6
    },
    "uiRoute": {
      "ok": true,
      "workspaceCount": 6
    }
  },
  "wardrobeBinding": {
    "ok": true,
    "expectedOrigin": "http://127.0.0.1:8765",
    "bindingCount": 4
  }
}
```

Treat any top-level `ok=false`, nonzero profile issue count, nonzero
`blockingWarningCount`, `launchd_service_not_loaded:<profile>`, failed ACL row,
failed runtime Python check, failed plugin delivery-directory creation/preview row, missing MCP schema
callable, missing standard profile-local base tool, failed directory-bound topic
preview row in either path-only or UI-route mode, Wardrobe binding row with a
legacy origin, Wardrobe manifest launch failure, zero/negative Wardrobe
bootstrap item count, wrong DeepSeek profile, failed Weixin route, or nonzero
final `activeGlobal` as a production blocker for the non-Grok closure gate.

## Focused Alternatives

Use the focused harnesses when investigating one subsystem:

```bash
sudo /Users/example/path \
  /Users/example/path \
  --access-key-file /Users/example/path \
  --base http://127.0.0.1:8797 \
  --json

sudo /Users/example/path \
  /Users/example/path \
  --root /Users/example/path \
  --json

sudo /Users/example/path \
  /Users/example/path \
  --root /Users/example/path \
  --json

sudo /Users/example/path \
  /Users/example/path \
  --root /Users/example/path \
  --base http://127.0.0.1:8797 \
  --json

sudo /Users/example/path \
  /Users/example/path \
  --root /Users/example/path \
  --json

sudo /Users/example/path \
  /Users/example/path \
  --root /Users/example/path \
  --all-workspaces \
  --simulate-ui-route \
  --json

sudo /Users/example/path \
  /Users/example/path \
  --root /Users/example/path \
  --base http://127.0.0.1:8797 \
  --json

/Users/example/path \
  /Users/example/path \
  --url http://127.0.0.1:8797/?_hmv=<smoke-id> \
  --access-key-path /Users/example/path \
  --view topics \
  --workspace-id owner \
  --viewport 390x844 \
  --open-capability-menu directory \
  --screenshot /tmp/homeai-capability-dock-smoke.png
```

Do not replace the checked closure harness with an ad hoc inline Node/Python or
shell script. If a new Mac production failure mode needs closure coverage, add
it to `scripts/macos-production-closure-validation.js` and extend
`tests/macos-production-closure-validation-harness.test.js`.

For Capability Entry Hub or fixed Dock changes, the visual smoke output must
include `clientVersion=<expected-version>`, `capabilityMenuOpened=true`, and
`capabilityMenuGesture=touch-longpress`. A `contextmenu`-only check is not
sufficient for iOS/PWA long-press behavior.
