# Mac Production Closure Validation

Use this runbook when Mac Studio production has been changed, migrated, repaired,
or revalidated after a Gateway/Profile/Skill/MCP/plugin/auth-header incident.

The checked closure harness is:

```bash
sudo <root>/runtime/node-current/bin/node \
  <root>/app/scripts/macos-production-closure-validation.js \
  --root <root> \
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
- Mac worker filesystem ACL checks pass, including cross-workspace deny checks
  and the workspace-catalog target ACL smoke for provisioned non-Owner
  workspaces with existing `hm-*` users.
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
- Automation cron audit verifies the canonical CRON job store and Skill store
  are readable, strict config checks pass, and no enabled job has latest status
  `error`, `failed`, or `failure`. A readable but failing script/no-agent job is
  still a closure blocker until a later successful run clears the status.
- Native Gateway schema probes follow `--expected-workspaces`: `owner` checks
  the Owner profile, `weixin_wuping`/`wuping` checks Wuping, and `test` checks
  the test profile. Each selected profile must expose the required MCP
  callables plus the standard profile-local base tools
  `http_request`, `weather`, `mobile_web_search`, `mobile_web_extract`,
  `image_generate`, `chatgpt_image_edit`, `chatgpt_image_erase`,
  `docx_create`, `docx_extract_text`, `office_extract_text`, `pptx_create`,
  `pptx_validate`, `pdf_create`, `pdf_extract_text`, `pdf_render_pages`, `audio_transcribe`,
  `archive_list`, and
  `archive_extract_safe`.
- Document-file tool closure also requires the profile-plugin schema smoke:
  `gateway-tool-schema-smoke.js --profile <profile> --profile-plugin-schema-only
  --profile-plugin-filter hermes-mobile-docx,hermes-mobile-pptx,hermes-mobile-pdf,hermes-mobile-audio,hermes-mobile-archive --require
  docx_create,docx_extract_text,office_extract_text,pptx_create,pptx_validate,pdf_create,pdf_extract_text,pdf_render_pages,audio_transcribe,archive_list,archive_extract_safe`.
  This check reads the production profile `config.yaml` and profile-local
  `plugins/` directory without starting the model provider, so it catches
  config/plugin drift independently from provider auth or full `AIAgent`
  startup failures.
- DeepSeek ordinary Owner routing uses `deepseekgw1`.
- DeepSeek Owner maintenance routing uses `deepseekmaint1` with
  `owner_high_privilege`.
  The DeepSeek smoke accepts the normal hybrid cold-pool baseline where workers
  are configured but not yet healthy because `ownerMinWarm=0`; it still fails if
  the pool is disabled, no workers are configured, the run fails, or the
  completed run does not report the expected profile.
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
  "workspaceTargetAcl": {
    "failedCount": 0,
    "targetWorkspaceCount": 1
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
  },
  "automationCron": {
    "ok": true,
    "jobCount": 15,
    "sourceIssueCount": 0,
    "configIssueCount": 0,
    "statusIssueCount": 0
  }
}
```

Treat any top-level `ok=false`, nonzero profile issue count, nonzero
`blockingWarningCount`, `launchd_service_not_loaded:<profile>`, failed ACL row,
failed runtime Python check, failed plugin delivery-directory creation/preview row, missing MCP schema
callable, missing standard profile-local base tool, failed directory-bound topic
preview row in either path-only or UI-route mode, Wardrobe binding row with a
legacy origin, Wardrobe manifest launch failure, zero/negative Wardrobe
bootstrap item count, unreadable Automation cron source, nonzero Automation
cron config/status issue count, wrong DeepSeek profile, or
nonzero final `activeGlobal` as a production blocker for the non-Grok closure
gate.

## Focused Alternatives

Use the focused harnesses when investigating one subsystem:

```bash
sudo <root>/runtime/node-current/bin/node \
  <root>/app/scripts/production-status-smoke.js \
  --access-key-file <root>/data/secrets/owner-web-key.secret \
  --base http://127.0.0.1:8797 \
  --json

sudo <root>/runtime/node-current/bin/node \
  <root>/app/scripts/macos-production-profile-audit.js \
  --root <root> \
  --json

sudo <root>/runtime/node-current/bin/node \
  <root>/app/scripts/macos-worker-filesystem-access-harness.js \
  --root <root> \
  --json

sudo <root>/runtime/node-current/bin/node \
  <root>/app/scripts/macos-plugin-directory-production-smoke.js \
  --root <root> \
  --base http://127.0.0.1:8797 \
  --json

sudo <root>/runtime/node-current/bin/node \
  <root>/app/scripts/macos-bound-directory-preview-smoke.js \
  --root <root> \
  --json

sudo <root>/runtime/node-current/bin/node \
  <root>/app/scripts/macos-bound-directory-preview-smoke.js \
  --root <root> \
  --all-workspaces \
  --simulate-ui-route \
  --json

sudo <root>/runtime/node-current/bin/node \
  <root>/app/scripts/macos-wardrobe-binding-production-smoke.js \
  --root <root> \
  --base http://127.0.0.1:8797 \
  --json

sudo <root>/runtime/node-current/bin/node \
  <root>/app/scripts/macos-automation-cron-audit.js \
  --root <root> \
  --strict-config \
  --strict-source \
  --strict-status \
  --json

<root>/runtime/node-current/bin/node \
  <root>/app/scripts/playwright-visual-smoke.js \
  --url http://127.0.0.1:8797/?_hmv=<smoke-id> \
  --access-key-path <root>/data/secrets/owner-web-key.secret \
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
