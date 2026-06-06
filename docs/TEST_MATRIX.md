# Hermes Mobile Test Matrix

Last updated: 2026-06-06.

Use this matrix to pick focused tests before broader gates. Always add syntax checks for touched JS/Python/PowerShell files.

## Full Gates

- Broad product gate: `npm.cmd run productization:check`
- Standard test gate: `npm test`
- Architecture boundary: `node tests\architecture-refactor-boundary.test.js`
- Privacy scan: `node scripts\privacy-scan.js --all-files`
- Diff hygiene: `git diff --check`

Use full gates before public release, broad shared-service/runtime changes, permission/security/persistence changes, or when requested.

## Harness Requirement Gate

Before implementing non-trivial workflow changes, classify the change with
`docs\IMPLEMENTATION_NOTES\harness-required-matrix.md`.

- H1 flows require a workflow harness or a new harness scenario before the
  change is complete.
- H2 flows require contract/projection coverage for navigation, scroll,
  routing, cache, or visible status behavior.
- H3 changes may use focused syntax/unit/UI tests only when they do not alter
  state, async behavior, permissions, routing, release artifacts, navigation,
  scroll, or service-worker behavior.

For all Hermes Mobile mobile/PWA function, UI, navigation, cache,
service-worker, Web Push, file preview, and embedded-plugin validation, the
primary smoke path is the installed home-screen PWA icon in the emulator or
target device. Browser address-bar navigation is not a valid substitute; it is
browser-mode evidence only and may intentionally show the browser-shell guard
page.
Static-client cache fixes must prove both sides of the version contract:
unauthenticated `/api/client-version?clientVersion=<new-version>` returns
`refreshRequired=false`, the previous deployed static version returns
`refreshRequired=true`, and cache-sensitive JavaScript changes use a new
`?v=<client-version>` query string. If a production sync missed a script and the
same version was already exposed, the corrective deploy must bump the static
version again. Focused checks: `node tests\task-list-ui.test.js` and
`node tests\static-cache-version-harness.test.js`.
Production UI/static deploys must also prove the real client loaded the new
version after refresh, not only that source files contain the version string.
The minimum accepted evidence is a browser/Playwright or installed-PWA read of
`document.documentElement.dataset.clientVersion` matching `<new-version>` after a
reload, plus the `/api/client-version` old/new smoke above. If the loaded client
still reports the old version after a kill/reopen or reload, the deploy is not
complete and the corrective deploy must issue another static version.
Before any production API smoke, the harness must first prove the target origin
is Hermes Mobile, not another local service on a reused port. The identity proof
must use the exact origin that will be smoked and must verify a Hermes-specific
app-shell or public-config marker such as `Hermes Mobile`, the expected
`data-client-version`, or `/api/public-config` fields belonging to Hermes. If
the proof fails, stop and report `production_origin_identity_mismatch`; do not
continue by trying common ports such as `8787`, `8999`, or a first listening
Node process. This check is required before `/api/client-version`,
`/api/status?detail=1`, Playwright, Android/CDP, or plugin proxy smokes.
Authenticated production status smokes must use
`node scripts\production-status-smoke.js --access-key-file <file>` or an
equivalent checked harness. The only API header for file-backed Access Key
smokes is `X-Hermes-Web-Key`; `X-Hermes-Access-Key` is a negative
wrong-header case and must not be used as the authenticated path.
The smoke output must include bounded header-name evidence such as
`authHeader=X-Hermes-Web-Key` and `wrongAuthHeader=X-Hermes-Access-Key`
without printing the key or raw key file path. A status probe that authenticates
with `X-Hermes-Access-Key` is not a valid production smoke even if the key file
itself is correct.
Do not infer the auth header from the product credential label. "Access Key" is
the stored credential class, not the HTTP header. Any new production key-file
smoke must keep the positive `X-Hermes-Web-Key` probe and the
`X-Hermes-Access-Key` negative probe in the same committed harness.
`tests/production-status-smoke-harness.test.js` also scans `scripts/` and
allows `X-Hermes-Access-Key` only in the checked negative-control status smoke.
This prevents new one-off production scripts from reintroducing the wrong
header as a positive auth path.
Gateway Pool route selection must prove owner-maintenance requests fail closed
instead of selecting the `default` fallback. The focused contract is
`node tests\gateway-pool-provider.test.js`; the test must keep coverage for a
legacy `securityLevel=unspecified` fallback and for owner-maintenance manifest
missing/no-candidate cases returning bounded unavailable errors.
The checked harness must prove `/api/public-config` on the same origin before
sending the key and must fail as `production_origin_identity_mismatch` when the
target is not Home AI. Mac Gateway cold-start changes must also run
`node tests\mobile-runtime-environment-service.test.js` and
`node tests\gateway-worker-profile-launch-service.test.js` to prove
`HERMES_MOBILE_GATEWAY_PROFILE_LAUNCH_SCRIPT` reaches
`GATEWAY_POOL_ELASTIC_CONFIG` and avoids the Windows `powershell.exe` fallback.
Mac production cold-start smoke must also prove the launchd listener has
`HERMES_MOBILE_GATEWAY_START_HEALTH_WAIT_MS=90000` or an intentional larger
value before treating a stopped-profile cold start as accepted.
Mac profile-launcher contract changes must run
`node tests\macos-gateway-profile-launcher.test.js`,
`node tests\gateway-worker-profile-launch-service.test.js`, and
`node tests\mobile-runtime-environment-service.test.js`. The launcher must
accept profile and replica start/stop arguments, owner-maintenance mode,
bounded scheduler metadata arguments, and reject owner-maintenance requests for
non-maintenance targets. Production sync must install it as executable under
`/Users/hermes-host/HermesMobile/gateway-worker/macos-launch-gateway-profile.sh`.
Mac production user/profile migration changes must run
`node tests\macos-production-profile-audit.test.js` locally and the production
profile audit on the Mac with the pinned runtime. The production audit must
return `ok=true`, empty `issues`, no blocking `warnings`, active workspace keys
for registered retained users, required plugin Skill bundles, shared Response
baseline presence, and profile `skills`/`memories` links whose realpath points
at the matching `data/skill-profiles/<profileId>` store. On macOS it must also
prove every enabled manifest worker's system LaunchDaemon is loaded; any
`launchd_service_not_loaded:<profile>` issue is a cold-start blocker. It must
also reject `RunAtLoad=true` or `KeepAlive=true` on any worker that is not part
of the required warm baseline, because that launchd policy defeats Gateway idle
cooldown. It must also prove Mac Gateway usage telemetry is wired: every
enabled worker needs manifest `telemetryStateDbPath` and
`telemetryResponseStoreDbPath`, and existing DB files must be readable by the
listener user. Missing telemetry paths are issues because they make cached
input show as `Not reported`; missing DB files on never-started cold workers
are warnings until a cold-start run creates them. The checked repair harness is
`node tests\macos-gateway-telemetry-repair.test.js` plus the production command
`sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node /Users/hermes-host/HermesMobile/app/scripts/macos-gateway-telemetry-repair.js --root /Users/hermes-host/HermesMobile --write --grant-listener-read --json`.
It must not print raw Access Keys, token contents, key files, prompt bodies, or
plugin launch tokens.
Mac MCP callable schema evidence must use the real production manifest and
native agent schema probe, for example
`node scripts\gateway-tool-schema-smoke.js --manifest /Users/hermes-host/HermesMobile/data/gateway-pool-manifest-mac.json --profile <profile> --schema-only --agent-schema-mode native --runtime-source /Users/hermes-host/HermesMobile/runtime/hermes-agent-official/source --runtime-overrides /Users/hermes-host/HermesMobile/app/gateway-runtime-overrides --runtime-python /Users/hermes-host/HermesMobile/runtime/hermes-agent-official/venv/bin/python`. Do not treat a Windows-only WSL schema probe as Mac production evidence.
For Mac named profiles such as `hm-owner-openai-1`, the schema probe must also
require the standard profile-local base tools `http_request`, `weather`,
`mobile_web_search`, `mobile_web_extract`, `image_generate`,
`chatgpt_image_edit`, `chatgpt_image_erase`, `docx_extract_text`, and
`audio_transcribe`. A manifest `toolsets` list is insufficient if the
profile-local `gateway-plugins/hermes-mobile-*` directories were not copied.
Provider-specific Mac production smokes should use the checked Gateway Pool
smoke instead of one-off message scripts. Examples:
`node scripts\gateway-pool-production-smoke.js --key-file <file> --model deepseek-chat --provider deepseek --expected-profile deepseekgw1`,
`node scripts\gateway-pool-production-smoke.js --key-file <file> --model grok-4.3 --provider xai-oauth --expected-profile grokgw1`,
and
`node scripts\gateway-pool-production-smoke.js --key-file <file> --model deepseek-chat --provider deepseek --maintenance --expected-profile deepseekmaint1`.
The harness must request one-shot Owner elevation for maintenance runs, pass
the token only in the message body, and never print the key, token, prompt, or
full thread body.
Mac production closure must use the checked aggregate harness after deployment,
migration, Gateway/Profile repair, plugin provisioning, Weixin route repair,
ACL repair, or before declaring production closed:
`sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node /Users/hermes-host/HermesMobile/app/scripts/macos-production-closure-validation.js --json`.
After Windows/WSL-to-Mac data migration, also run the directory path migration
repair dry-run:
`sudo /Users/hermes-host/HermesMobile/runtime/node-current/bin/node /Users/hermes-host/HermesMobile/app/scripts/macos-directory-path-migration-repair.js --root /Users/hermes-host/HermesMobile --json`.
The local checked harness is
`node tests\macos-directory-path-migration-repair.test.js`. The dry-run must
show `changed=false` after repair before directory-topic chip or artifact-card
404s are treated as ACL bugs.
Source changes to this closure contract must run
`node tests\macos-production-closure-validation-harness.test.js` and
`node tests\macos-plugin-directory-production-smoke-harness.test.js`, and
`node tests\macos-wardrobe-binding-production-smoke-harness.test.js`. The
aggregate harness composes the checked status, profile audit, ACL, plugin
delivery-directory creation/preview, Wardrobe binding/proxy content, native MCP
schema, DeepSeek user/maintenance, Weixin heartbeat, Owner/OpenAI concurrent
product-route, and final-status smokes. The plugin directory smoke catches Mac workspace catalog
paths that still point at Windows/WSL drive prefixes and macOS ownership/ACL
failures before plugin-topic users see `插件目录暂不可用`. Grok/xAI manual OAuth
is a documented deferred follow-up outside the default closure gate.
The required PWA smoke sequence is:

1. Verify an Android emulator or target device is connected with `adb devices`.
2. Confirm a home-screen `Hermes` PWA shortcut exists. If it does not, open the
   Hermes HTTPS URL in Chrome only to use Chrome's `Install app` flow, then
   return to the launcher.
3. Start the app by tapping the launcher `Hermes` icon. Do not start the smoke
   by `adb am start ... -d <Hermes URL>` or by pasting the URL into the Chrome
   address bar.
4. Capture evidence from the standalone PWA shell:
   - screenshot without browser address bar;
   - visible client version or DevTools state showing the expected version;
   - loaded workspace list or current workspace content;
   - relevant bottom tab/plugin/file-preview/navigation state.
5. If direct Chrome URL launch shows `mode=browser` or the browser-shell guard,
   record it only as a guard-page diagnostic. It is not a failing PWA smoke and
   it is not passing functional evidence.

For emulator automation, use UI-tree coordinates only to install or tap the PWA
shortcut, then validate the rendered Hermes state with screenshot evidence and,
when needed, Chrome DevTools attached to the PWA WebView. UIAutomator may return
only a generic WebView node for rendered web content, so an empty accessibility
tree alone is not proof that Hermes failed to load.

Mac-side iOS Simulator gesture diagnostics may use Appium/XCUITest after the
Mac QA toolchain is installed. Start the local server with
`bash scripts/macos-ios-appium-start.sh` on the Mac and run
`node scripts/macos-ios-appium-smoke.js` for a bounded direct-control smoke.
Keep Appium at `--log-level warn` or quieter before any script enters Home AI
credentials, because verbose WebDriver logs can include request bodies. The
checked guard is `node tests\macos-ios-appium-smoke-harness.test.js`.

All Hermes Mobile UI changes require visual verification evidence before they
are treated as done. At minimum, run a Playwright mobile viewport check that
captures a screenshot and records relevant bounding rectangles for the changed
surface, including overlap-sensitive elements such as bottom navigation,
composers, fixed panels, popups, plugin docks, and scroll containers. When an
Android emulator or target device is available, also run the installed-PWA
smoke path above. Static DOM/unit assertions are necessary but not sufficient
for visual layout changes.
Topic root UI changes must assert that the root topic entry page has no active
composer, including after Chat->Topics tab switching or route restore paths that
call generic composer enable helpers. `node tests\task-list-ui.test.js` is the
focused DOM contract, and visual smoke must include composer bounds or absence
on the topic root plus normal composer visibility inside a topic detail.
For Mac production frontend incidents where the live app already has no local
Playwright dependency, use the shared production QA install instead of adding
Playwright to the live app package:

```bash
cd /Users/hermes-host/HermesMobile/app
export NODE_PATH=/Users/hermes-host/HermesMobile/qa-playwright/node_modules
/Users/hermes-host/HermesMobile/runtime/node-current/bin/node \
  scripts/playwright-visual-smoke.js \
  --url https://mac-studio.tail62e8ce.ts.net/?_hmv=<smoke-id> \
  --access-key-path <owner-web-key-file> \
  --view learning \
  --workspace-id owner \
  --screenshot /tmp/<smoke-id>.png
```

Run this as `hermes-host` for production-owned key files and browser cache
access. This is browser-mode evidence; if an iPhone installed PWA still fails
while the Mac HTTP/HTTPS Playwright smoke passes, the next check is the
device-side PWA cache/service-worker and exact workspace/view state.

As of 2026-06-02, an ADB-connected Android 13 e-ink target device is available
for Hermes Mobile mobile UI validation. For any UI/navigation/gesture/layout
change whose acceptance does not depend on exact color fidelity, this real
device smoke is required, not optional. Use it to verify tap targets, scroll,
right-swipe back behavior, bottom navigation, composer placement, fixed panels,
PWA refresh, and plugin iframe/tab transitions. Because the device renders as
black/white or grayscale, color, saturation, and brand-icon color decisions must
still be checked with Playwright/Chrome or a normal color phone.

Android Access Key setup for smoke must not use `adb input text` for Access Key
entry. Access Keys may include characters that ADB text injection or the active
IME can transform, which creates false login failures. Use the CDP-backed
harness `node scripts\android-pwa-plugin-dock-smoke.js --access-key-path <path>
--expect-version <version> --screenshot <file>` for plugin Dock visual checks:
it launches Chrome over ADB, forwards `chrome_devtools_remote`, writes the key
into same-origin `localStorage` and the `hermes_web_key` cookie without printing
the key, reloads the app, and verifies the Dock has one horizontally scrollable
row.

Startup harnesses must also verify that workspace/project bootstrap failures do
not reveal a half-initialized shell with an empty workspace selector. The client
should retry bounded startup loading and then show an explicit recovery/retry
surface.
Static startup recovery must also cover stalled PWA/client-version updates: the
boot splash performs at most one session-scoped soft reload for a client
version, exposes retry/reset controls after a bounded wait, and the reset page
uses timeout-wrapped cache clear / hard-reset Service Worker unregister so the
recovery screen itself cannot hang indefinitely.
For client-version mismatches, automatic recovery must route through the bounded
reset page for the target version, preserve Access Key/theme/font preferences,
clear static caches, refresh Service Worker registrations, and reopen the app
with a cache-busting query. The Service Worker must serve app-shell requests
(`/`, `/index.html`, and `/hermes-mobile/`) network-first with `cache:
"no-store"` so kill/reopen cannot keep showing a stale shell.

NAS static production deploy is a cross-shell production operation. The source
harness must keep `scripts/deploy-nas-static-assets.ps1` on the safe transport
path that worked against the maintained Synology host: health check first,
abort on active runs, backup both NAS `app` and `source`, package local files as
tar, base64 the archive before SSH transport, decode/extract on NAS, compare
SHA-256 in both destinations, use the pinned NAS runtime Node path for checks,
and smoke both `/api/client-version` and the public origin HTML. `scp`, `sftp`,
and raw PowerShell binary tar pipes are failing cases for this maintained NAS
flow. Focused check: `node tests\nas-static-deploy-harness.test.js`.

NAS full-source production deploy is required when the current version changed
more than the narrow shell/cache files, or when NAS has drifted behind local
production. `scripts/deploy-nas-tracked-source.ps1` must package only
Git-tracked source files with `git archive`, back up overwritten NAS `app` and
`source` files, run pinned-runtime checks, and run a first-start preflight. The
preflight must fail when app/source/served client versions disagree, when
Gateway Pool is disabled, when NAS is not in `hybrid` Gateway mode, or when no
healthy `securityLevel=user` worker is available. A single `nas-local-codex`
wildcard worker is allowed as a bootstrap
bridge only with an explicit warning; it must not be treated as equivalent to
the maintained Windows hybrid/Owner-warm Gateway Pool. The same preflight must
fail Finance partial provisioning: a workspace with
`.hermes-finance/access-key.txt` but no sibling `.hermes-finance/config.json`
must report `nas_finance_config_missing:<workspaceId>` instead of being treated
as an active plugin/MCP binding. Focused check:
`node tests\nas-deploy-harness.test.js`.
The deploy harness must also sync runtime config launchers outside the tracked
app tree, including refreshing `config/start-nas-gateway-pool.sh` from
`app/scripts/start-nas-gateway-pool.sh`, before Gateway profile restart or
smoke. Otherwise new MCP registrations can be present in source but absent from
live generated profiles.
The same NAS version smoke must call `/api/owner-elevation` with Owner auth and
fail if `ownerElevation.available` is false. The maintained NAS launcher must
set `HERMES_MOBILE_ALLOW_OWNER_MAINTENANCE_RUNS=1` in
`config/hermes-mobile.env`, not after the `exec node server.js` line in
`config/start-hermes-mobile.sh`.
The same NAS deploy/preflight harness must verify runtime model parity across
all execution entrances: generated OpenAI/Codex Gateway profiles, NAS
`$HERMES_HOME/config.yaml`, NAS `.env`, and official CRON dispatcher startup
must not retain stale models such as `gpt-5.3-codex`. The maintained user-run
default is `gpt-5.5` with `medium` reasoning. Permission-only model preflight
is separate and defaults off; unless explicitly overridden for diagnostics,
ordinary runs must not spend an extra selector call before execution.
The official CRON dispatcher startup check must also prove model jobs are
proxied before official `cron.scheduler.run_job()` starts. The dispatcher must
inject `HERMES_MOBILE_CRON_MODEL_PROXY_URL` or the standard proxy variables
into `HTTPS_PROXY`, `HTTP_PROXY`, and `ALL_PROXY`, and a missing or unreachable
proxy must mark the job failed with `cron_model_proxy_*` instead of entering
the official model path and timing out. Pure `no_agent` script jobs remain
allowed without a model proxy. Focused check:
`node tests\cron-dispatcher-proxy-harness.test.js`.
Both NAS deploy scripts must use the fixed cross-shell transport: local tar to
base64 text, SSH text upload, NAS-side Python decode, extraction to both
`app` and `source`, and pinned NAS Node checks. They must not depend on
`scp`/`sftp`, raw PowerShell binary tar pipes, or ad-hoc inline Bash embedded
inside PowerShell. Focused check:
`node tests\cross-shell-command-harness.test.js`.
NAS listener restart is part of the same cross-shell harness. The tracked-source
deploy restart path must use the base64/remote-Python control channel, stop any
existing `node server.js` listener, wait for port `8797` to stop serving public
config, fail with `nas_listener_restart_port_still_busy` if the port remains
occupied, start only `config/start-hermes-mobile.sh`, and verify
`setupRequired=false`, `ownerKeyConfigured=true`, and `ownerKeySource=file`
after restart. Focused check: `node tests\nas-deploy-harness.test.js`.
The same harness must also cover NAS-native workspace isolation: user workers
must be single-workspace workers, worker `skills` links must point at
`data/skill-profiles/<profile>/skills`, worker `memories` links must point at a
per-workspace memory store, and `data/drive/users/<workspaceId>` directories
must not be publicly accessible. Plugin MCP registration must be
workspace-local: Wardrobe, Finance, Email, Health, Note, and future plugin toolsets may be
advertised only when the worker's target workspace has the matching
`.hermes-<plugin>` config/key directory. A worker without plugin config must not
fall back to Owner or expose a broken plugin toolset.
The same NAS harness must include an ordinary representative message smoke,
not a probe-only or content-specific shortcut. The smoke must compare the
Mobile run phase timeline with Windows/local production behavior:
`run.request_preparing` appears immediately, warm Owner runs show
`run.gateway_worker_reused` or an expected startup event before model
preflight/model output, and any `queued` state is backed by real capacity or
profile-affinity evidence. Direct Gateway `/health` timing alone is not enough.
The same smoke must treat a long pre-`run.request_preparing` gap as
listener-side setup/persistence latency. Runtime persistence tests must prove
normal message growth does not force a full state backup per message, while
message-drop refusal and explicit decreases still retain backup protection.
They must also prove the run-start fast path can skip SQLite full replacement
while writing the JSON snapshot, and that startup imports a newer JSON snapshot
back into SQLite before serving state.
Runtime-state backup harnesses must reject a design where every normal message
increase creates a full state backup or performs a forced SQLite full
replacement before run progress becomes visible. Focused check:
`node tests\runtime-state-persistence-service.test.js`.
Workspace-local plugin toolset projection must be covered before changing
ordinary-chat or plugin-topic activation. Focused checks:
`node tests\plugin-authorized-toolset-service.test.js`,
`node tests\access-policy-provider.test.js`, and the plugin capability run
assembly tests. The service must prove complete `.hermes-*` bindings become
authorized toolsets for the effective workspace, while partial key-only
bindings do not.
Gateway profile template materialization is an H1 Gateway workflow change. The
focused implementation harness must prove canonical template generation,
same-template toolset/MCP equality, no cross-tier slot reuse, stopped-slot
materialization before startup, warm reuse when the template key matches, cold
start to health, first text delta timing, terminal release, idle stop, and
`/api/status?detail=1` projection without exposing raw config bodies or secrets.
Phase 1 focused checks are
`node tests\gateway-profile-template-sync.test.js`,
`node tests\startup-scripts.test.js`, `bash -n scripts/start-low-gateways.sh`,
and a production verifier run against
`C:\ProgramData\HermesMobile\gateway-worker\telemetry\profiles`.
Phase 2 production smoke must also prove a selected stopped profile start logs
`lowgw-configure-template-peers` with the requested profile and the expanded
same-template peer group, then leaves the requested profile startable and the
baseline warm worker restorable.
Phase 3 focused checks add
`node tests\gateway-profile-template-builder.test.js` and a production builder
run such as
`node scripts\build-gateway-profile-template.js --manifest <manifest> --profiles-root <profiles> --profile lowgw10 --require-config`.
The builder must report the same selected peer group and capability hash as
`scripts\verify-gateway-profile-template-sync.js`, without printing raw config
bodies or secrets.
Phase 4 focused checks also require the builder render path:
`node scripts\build-gateway-profile-template.js --render-config-yaml --config-kind profile ...`,
`bash -n scripts/configure-low-gateways.sh`, and
`node tests\startup-scripts.test.js`. Local production validation must prove
WSL can call the builder through the effective Node path, then run a forced
configure/start smoke or an equivalent configure-only verifier to confirm the
materialized production profiles still share the expected capability hash.
Phase 5 focused checks require runtime projection and reuse-guard coverage:
`node --check adapters\gateway-profile-template-identity-service.js`,
`node tests\gateway-elastic-worker-scheduler.test.js`,
`node tests\gateway-pool-provider.test.js`,
`node tests\system-api-routes.test.js`, and
`node tests\architecture-refactor-boundary.test.js`. Status projection must show
only non-secret `templateKey`, `capabilityHash`, `capabilityStatus`,
`toolSchemaEpoch`, `materializedTemplateKey`, and
`materializedCapabilityHash`; a warm worker with a stale materialized hash must
not be reused merely because `/health` is `ok`.
Plugin capability activation and lazy MCP loading is an H1 Gateway/context
workflow change. Focused tests must prove ordinary chat receives the compact
capability catalog without full optional plugin MCP schemas or Skill bodies;
plugin-bound topics receive the current plugin required MCP/Skill bundle while
other authorized plugins remain catalog-only; lazy activation validates
workspace authorization, config/key completeness, health/schema probe, and no
Owner fallback; required plugin failure blocks generic fallback with a bounded
diagnostic; optional plugin failure does not slow or fail unrelated ordinary
chat; explicit wide mode probes each authorized plugin once and reports
unavailable plugins without raw secrets.
NAS Growth audio parity must cover the platform-specific transcription path:
Windows may use `scripts\transcribe-reading-audio.ps1`, while Linux/NAS must use
`scripts\transcribe-reading-audio.js` against the local Whisper large v3 Turbo
service on `127.0.0.1:8001`. The NAS deploy/runbook checks must treat a missing
8001 health endpoint as "Growth audio submission unavailable", even when stored
SQLite audio playback works. Focused checks include
`node tests\kanban-reading-workflow-service.test.js`.
NAS Grok parity must cover a manifest-derived dedicated `grokgw1`
`provider=xai-oauth` profile. The test workspace's historical `18761` worker
must remain an ordinary OpenAI/Codex worker on NAS; bridge-host must discover
the Grok URL from the manifest instead of assuming 18761. Focused checks include
`node tests\nas-deploy-harness.test.js` and
`node tests\bridge-host-grok-proxy.test.js`.
When a deployment chooses to disable or enable model permission preflight, the
NAS effective environment must be recorded explicitly and compared with the
intended local-production behavior instead of being treated as an implicit
default.

NAS-local single-worker Gateway configuration is also a production harness
surface. A NAS `nas-local-codex` style worker must prove that configured
toolsets have real callable schemas, not only configured names in
`/v1/toolsets`. The maintained smoke must verify that Hermes Mobile fallback
plugins are installed in the API-server Hermes home, listed in
`plugins.enabled`, included in `platform_toolsets.api_server`, visible through
`model_tools.get_tool_definitions(...)`, and exercised by a direct
`/v1/responses` request that emits `function_call` and
`function_call_output` for representative tools such as `web_search` and
`weather`. `browser` remains a runtime-dependency-gated toolset and requires
separate evidence that `agent-browser` plus its browser engine dependencies are
installed before treating `browser_*` as available.

Mac Studio production deployment is a separate production harness surface, not
a NAS variant. The future macOS installer/preflight must prove launchd service
generation, explicit service env/paths, Mac-native Gateway startup,
direct/proxy network-mode behavior, and OS-user workspace isolation. A passing
Mac install must show that non-Owner OS users cannot read Owner files, Skill
Store, Memory Store, or `.hermes-<plugin>/access-key.txt`; that Gateway workers
and MCP wrappers run as the effective workspace OS user; that plugin MCP
toolsets are exposed only for workspaces with matching `.hermes-<plugin>`
config/key; and that clean installs can enable plugins on demand through
provisioning instead of relying on pre-bound development data. Planned focused
checks: `node tests\macos-deploy-harness.test.js`,
`node tests\workspace-os-isolation-harness.test.js`,
`node tests\plugin-workspace-isolation-harness.test.js`, plus the existing
Gateway and CRON harnesses relevant to the touched files.

H1 includes Growth learning cards, Action Inbox passive notifications,
Automation/Cron execution, Gateway toolset selection/run telemetry,
Gateway elastic worker scheduling, cross-shell production operations, Web Push
click routing, permission/workspace boundaries, and Public Export/Release.

Directory topic collections are H1 when they change persistence, workspace
isolation, directory ACL, context assembly, default-topic selection, or
topic-open routing. They are H2 only for display-only card/list projection. The
harness must prove that one directory can collect multiple topics, one default
topic is enforced per directory, changing the default does not delete secondary
topics, Owner workspace switching does not fall back to Owner's directory or
topics, and context assembly includes only cleaned/selected/bounded files.
Focused checks should include
`node tests\directory-topic-binding-service.test.js`,
`node tests\directory-topic-context-service.test.js`,
`node tests\directory-topic-api-routes.test.js`, and
`node tests\task-list-ui.test.js` when implemented.

Static v446 directory-topic card projection is H2 display-only. Required
coverage for that increment:

- `public/app-directory-topics-ui.js` is loaded by `index.html`, cached by the
  service worker, and included in the app-shell harness.
- Directory-topic collections are derived from existing bound directory routes.
- Groups displayed inside directory-topic collection cards are removed from the
  regular topic grid to avoid duplicate entries.
- Plugin fixed topics such as `plugin:wardrobe`, `plugin:finance`,
  `plugin:email`, `plugin:health`, and `plugin:note` must not be included in directory-topic
  collection cards.
- The current Capability Entry Hub projection keeps the Directory capability in
  the fixed bottom capability Dock with the external plugin icons. It has no
  permanent chat/file mini actions beside the icon; Directory quick actions live
  in the long-press/context menu and in the frequent quick-action grid.
- Mobile Capability Entry Hub visual evidence must open that Dock menu through
  the touch long-press harness path and report
  `capabilityMenuGesture=touch-longpress`; desktop `contextmenu` evidence alone
  is not enough for iOS/PWA regressions.
- Directory-bound cards render a directory header with the folder icon on the
  left and the explicit directory name/path beside it. They must not render a
  second right-side directory icon. Bound child topics render below as an
  indented list so the parent directory relationship is visible.
- The Directory special card must use the shared standard folder icon asset
  already used by Growth delivery-directory links. Directory-bound topic cards
  must use a smaller topic/chat icon and must not reuse the same Directory icon.
- Opening the Directory special application card must reset to the Directory
  root list, not reuse the sidebar/current-directory entry. Shared directory
  roots must be included in the public project projection that backs that root
  list.
- Plugin and Directory topic cards must avoid nested framed panels. The outer
  card is the visible surface; internal app/topic buttons remain transparent,
  labels are compact, and mini actions are visually smaller than the app icon.
- Returning from a topic detail through top back or right-swipe must restore
  the topic-list scroll position captured before entering that detail.
- The card exposes icon actions for bound directory and secondary topic chips.
- Secondary topic chips must show a short readable topic name and not only a
  repeated icon. Manual topic titles take priority over first-message fallback
  names.
- Mobile topic-list scrolling must keep native vertical pan behavior; touch
  guards may not call `preventDefault()` while `.thread-list` can scroll in the
  gesture direction.
- Directory-topic deferred aggregation must not replace the topic-list DOM
  while scroll feedback, task-card swipe, or sidebar swipe state is active.
  Scroll feedback must measure the actual scroll target (`.thread-list` when it
  is the nested scroller) before deciding whether to block boundary over-scroll,
  and the sidebar right-swipe guard must let vertical task-list panning stay
  native.
- Static cache version harness proves `20260601-directory-topic-names-v446`
  reaches every shell resource that changed.

Gateway Pool startup/provisioning harnesses must cover stable manifest
profile/port mapping. `start-low-gateways.sh` and `configure-low-gateways.sh`
must consume explicit `gateway-pool-manifest.json` `profile`/`port` pairs for
`lowgw*`, `grokgw*`, and `deepseekgw*`. Workspace provisioning must append new
personal `lowgwN` entries after existing low/Grok/DeepSeek workers without
moving `grokgw1`, and ordinary workspaces must get two OpenAI/Codex `lowgw*`
candidates plus one workspace-dedicated `deepseekgw*` candidate when DeepSeek is
available. Deleting a workspace must not silently delete profile-local Gateway
state; profile retirement needs an explicit backup/cleanup flow. Focused checks:
`node tests\startup-scripts.test.js`,
`node tests\gateway-workspace-provisioning-service.test.js`, and
`node tests\cross-shell-command-harness.test.js`.
Gateway Pool startup/provisioning harnesses must also cover per-worker
API-server-key binding. Startup scripts must read the selected worker's own
manifest `api_key` by `profile` and pass that key to the worker process; using
the first manifest key or one class-wide key is a failing case because workers
can stay healthy while rejecting Mobile `/v1/responses` calls with
`401 invalid_api_key`. Gateway profile/schema deployments must sync source
scripts into the production worker root before restart and then run live schema
smoke with the same manifest key Mobile uses for the selected worker.
Windows-to-WSL plugin MCP environment is part of the same startup harness.
`start-low-gateways-child.ps1` must pass Finance MCP env such as
`HERMES_MOBILE_FINANCE_MCP_API_BASE_URL`, wrapper path, Python path, and user
drive root into `wsl.exe -- env ... configure-low-gateways.sh`; otherwise a
Windows-local Finance service can silently regenerate WSL profiles with
`http://127.0.0.1:8791`, which is WSL loopback and hides `mcp_finance_*` even
though Finance UI launch works. The fallback must resolve a Windows LAN address
for Finance, not a WSL NAT gateway such as `172.*`, because Finance may reject
that as `finance_mcp_dispatch_loopback_only`. Focused check:
`node tests\startup-scripts.test.js`.
Live plugin MCP smoke must target the exact selected Low Gateway profile, not a
generic or first healthy worker. A failure from `lowgw2` is only cleared by
schema evidence from `lowgw2` itself, for example
`node scripts\gateway-tool-schema-smoke.js --profile lowgw2 --schema-only --require mcp_finance_list_ledgers`,
plus direct wrapper evidence when the plugin service rejects WSL-origin calls.
Finance service startup must keep `FINANCE_MCP_PORT=8791` together with
`FINANCE_MCP_TRUSTED_GATEWAY_ADDRESSES` or `FINANCE_MCP_TRUSTED_GATEWAY_CIDRS`;
starting Finance without the port env can fall back to `8787`, while starting
without the trusted env keeps the UI healthy but hides the MCP schema behind
`finance_mcp_dispatch_loopback_only`.

Kanban-backed Todo board provisioning is part of the same H1 process-safety
harness. `ensureBoard()` must be single-flight per board, failed board creation
must use a bounded retry cooldown, and Windows bridge command timeouts must
terminate the full PowerShell/WSL child process tree. The Windows Kanban
wrapper must resolve the production WSL distro from explicit args or
`HERMES_*` environment values and support maintained caller-context execution
instead of silently defaulting to a retired `HermesGatewayWorker` distro.
Focused checks: `node tests\kanban-provider.test.js`,
`node tests\startup-scripts.test.js`, and `node tests\task-list-ui.test.js`.

OpenAI/Codex shared-auth harnesses must cover runtime-overlay protection for
symlink-preserving atomic writes that cross WSL ext4 and Windows-mounted
storage, including the `hermes_cli.auth` module's direct imported reference.
The static guard is `node tests\startup-scripts.test.js`; live repair
validation should use `/opt/hermes-gateway-runtime/bin/hermes auth list` with
`HOME=/home/hermes` and `HERMES_HOME=/home/hermes/.hermes`, then
`C:\ProgramData\HermesMobile\gateway-worker\check-worker-codex-auth.ps1`, with
no raw tokens or refresh tokens printed.

Gateway elastic worker scheduling is an H1 workflow. The source harness must
cover Owner OpenAI/Codex `minWarm=1` / `maxWorkers=4`, Owner DeepSeek
`minWarm=0` / `maxWorkers=2`, owner-maintenance `minWarm=0` / `maxWorkers=2`,
non-Owner OpenAI/Codex `minWarm=0` / `maxWorkers=2`, non-Owner DeepSeek
`minWarm=0` / `maxWorkers=1`, compatible warm-worker reuse, already-running
warm discovery, externally healthy later-candidate reuse before cold start,
bounded scheduler `decisionTrace`, profile/provider-compatible cold start, provider-scoped
workspace cap queueing, global cap queueing, idle TTL retirement, active-run
protection, bounded launch-failure diagnostics, public-to-real run id
replacement without worker-slot leakage, tier-scoped worker caps so
owner-maintenance workers do not consume the Owner low-permission user cap,
profile-specific owner-maintenance start/stop and watchdog skip in hybrid
on-demand mode,
hidden single-profile start/stop launchers, and
`/api/status?detail=1` treating configured-but-stopped workers as expected state
rather than unhealthy Gateway Pool degradation, including clearing a previously
warm worker after the process stops and `/health` no longer responds. It must
also cover externally discovered healthy on-demand workers: status
reconciliation may mark the process healthy, but non-baseline workers must enter
idle TTL countdown and required warm-baseline workers must not. It must also
cover wildcard profiles such as `grokgw1`: status reconciliation may mark the
process healthy, but must preserve the materialized template key/hash and must
not wake or reuse the worker for an incompatible request template. The
run-progress UI must
distinguish starting, reused, queued, idle-retirement, and failed states without
exposing API keys, workspace keys, plugin launch tokens, raw prompts, raw model
output, or long logs. The assistant message must receive its public `web_*` run
id before Gateway request construction and target selection start, and
`run.request_preparing`, `run.gateway_worker_queued`,
`run.gateway_worker_starting`, and permission preflight timeout/fallback events
must render in the inline run-progress panel immediately instead of waiting for
worker selection to finish. Cold-start `starting` must render as startup in the
model-status/run-progress UI rather than as queue depth; `queued` is reserved
for real capacity/profile waits. Before switching runtime scheduling to
pool-key selection, the source harness must also prove the
ProfileTemplate / WorkerReplica split: legacy aliases such as `lowgw1` and
`lowgw10` may remain as replica ids, but run compatibility must not include
legacy slot aliases, ports, API bases, raw API keys, or other process identity.
Provider, workspace, and permission tier remain hard pool boundaries. Focused
contract check: `node tests\gateway-profile-replica-model-harness.test.js`.
Composer optimistic-send coverage must also prove that a failed or timed-out
`POST /api/threads/:id/messages` clears the local pending user/assistant
messages, restores the draft text, and schedules a bounded thread refresh so a
client-only `queued` placeholder cannot masquerade as a real Gateway queue.
Focused check: `node tests\composer-send-pending-feedback.test.js`.
Before switching production from eager startup to hybrid/on-demand startup,
rerun these checks after syncing scripts into the production worker root and
then smoke `/api/status?detail=1` plus a real Owner run. Full hybrid/eager
starts and listener on-demand `-NoStopExisting`
single-profile starts must skip full reconfiguration when the selected profiles
are already configured and the non-secret configure signature is current.
Changing the manifest, generator script, plugin/schema source, runtime override
source, Skill Store mapping inputs, missing profile artifacts, or explicit
`-ForceConfigure` must run `configure-low-gateways.sh` again. Stop-only
operations must not require profile config/auth validation before killing the
selected port.
If the listener account cannot see the production WSL distro, the launch
service must use the configured Windows Scheduled Task relay: write only bounded
action/profile metadata to `elastic-requests`, trigger the task, wait for the
result file, and keep failures redacted. Focused checks must assert this relay
path in `node tests\gateway-worker-profile-launch-service.test.js`,
`node tests\startup-scripts.test.js`, and
`node tests\cross-shell-command-harness.test.js`.
On a single-user maintained deployment where WSL/Codex state belongs to the
operator account, the preferred production path is to run the listener itself in
that caller context. In that mode the scheduled-task relay must be disabled and
the live gate must prove listener-owned direct single-profile start works.
`scripts/start-worker-host.ps1` must also honor the caller-context marker/env
guard so a later plain `-ReplaceExisting` cannot relaunch the listener under a
separate worker account and recreate the on-demand startup failure.
After a start script returns success, the scheduler must poll the selected
worker's `/health` for the configured bounded window before emitting
`health_check_failed`; a single immediate health miss is a failing harness case
because it can race the newly opened Gateway listener.
Production setup must also verify that the scheduled task can be demand-started
by the listener account. The task principal should remain the WSL-owning
account, but the task file/Task Scheduler ACL must grant the listener account
read/execute permission to run it; otherwise the relay request will remain
pending and the user run will fail before WSL starts.
Because this account-boundary failure has recurred, production rollout is not
complete with only an operator-run `start-gateway-pool.ps1 -StartProfiles`
success. The required live gate is a real non-Owner Mobile API cold-start smoke
from a stopped profile through the listener, followed by healthy
`/api/status?detail=1` and no manual worker start.
Focused implementation checks should include
`node tests\gateway-elastic-worker-scheduler.test.js`,
`node tests\gateway-runtime-composition-service.test.js`,
`node tests\gateway-worker-profile-launch-service.test.js`,
`node tests\gateway-pool-provider.test.js`,
`node tests\gateway-run-start-service.test.js`,
`node tests\gateway-run-lifecycle-service.test.js`,
`node tests\gateway-status-projection.test.js`, `node tests\system-api-routes.test.js`,
`node tests\task-list-ui.test.js`, `node tests\startup-scripts.test.js`,
`node tests\cross-shell-command-harness.test.js`, and
`node tests\static-cache-version-harness.test.js`.

For graph-guided Growth card planning, the harness must preserve the
graph-first authoring contract. Formal model-generated cards must require a
validated `learningGraphPlan` or validated temporary graph node; prerequisites
must exist and be acyclic; stage assessments must declare graph-node coverage;
and learner difficulty feedback must update planning evidence without becoming
formal mastery failure by itself. External seed graphs must be converted into
native Hermes graph records before runtime use. Public curriculum foundation
imports must be manifest-driven, must preserve URL/status/hash provenance, and
must reject paid/restricted materials or learner-level mismatches such as using
IGCSE/A Level nodes as direct current targets for a Primary learner.

For Gateway toolset selection, the harness must preserve the model-first
contract when that selector is enabled. Do not hard-prune callable toolsets
before a first-round model selection. A first round may use a compact
capability catalog, and the execution round may expand only the selected
authorized toolsets, but the model must have an explicit escalation path for
additional authorized toolsets. If request-level schema proof is missing,
model-first toolset selection stays disabled and execution uses the full active
schema set chosen by plugin capability activation, not every authorized
optional plugin MCP schema in the workspace. Narrow `suggested_toolsets` remain
telemetry only unless the selector succeeds. The model-side permission
preflight is a separate switch and remains enabled by default.
The harness must cover selected narrow execution, allowed escalation, denied
blocked-toolset escalation, invalid selection fallback, and telemetry for
model-selection start/end, tool-call start/end, and final-message start/end.
Selector failure is explicitly recoverable: timeout, invalid JSON, missing
runner, or unauthorized selections must fall back to the originally authorized
toolset list. Permission and optional toolset choice must share the same
model-side preflight when both are enabled; when toolset choice is disabled,
that same preflight returns only the permission decision and execution keeps the
full active schema set. Selector failure has the same fallback rule: execution
restores the full originally active schema set, not the suggested subset. The
selector should use a ChatGPT low-cost model, a bounded
timeout of 30000ms by default, and best-effort cancellation when a selector run
id is known. Do not add local
natural-language permission routing before the model. If the model-side
preflight returns a `HERMES_PERMISSION_APPROVAL_REQUIRED`-style decision,
execution must not start until Owner approval.

Product-specific MCP capabilities are part of the same H1 contract. Wardrobe
ingestion/recommendation/writeback tests must assert that authorized
wardrobe-capable runs keep `wardrobe` in the model-selection catalog and can
select `wardrobe` with `vision`/`file` for image-backed writeback and readback
verification. A run that has a wardrobe-capable Gateway profile but lacks
`wardrobe` in `access_policy_context.allowed_toolsets` should be treated as a
Mobile policy/routing regression, not as a missing Gateway MCP.
All workspace-private plugin MCP capabilities must also prove user isolation,
not only schema presence. The harness for a plugin MCP must assert that:

- each target workspace has its own `.hermes-<plugin>/config.json` and
  `.hermes-<plugin>/access-key.txt` or plugin-owned equivalent;
- stdio MCP wrappers are compatible with the Hermes Agent MCP SDK transport,
  including newline-delimited JSON framing as used by `mcp.client.stdio`, not
  only `Content-Length` fixture clients;
- the Gateway profile's `mcp_servers.<plugin>` block points at that target
  workspace root and rejects runtime workspace override;
- an Owner session switched into a non-Owner workspace selects a profile/schema
  bound to the target workspace, not Owner's plugin directory;
- a missing target profile/schema omits the plugin MCP/toolset and returns a
  bounded diagnostic instead of falling back to Owner;
- raw workspace keys, Owner plugin keys, launch tokens, provider OAuth tokens,
  cookies, full mailbox bodies, private ledger rows, inventory dumps, or health
  records do not appear in manifests, prompts, frontend state, postMessage
  payloads, docs, logs, screenshots, or test output.

Plugin-bound application topics are H1 when they influence plugin visibility,
MCP/toolset routing, workspace switching, delivery-directory creation, or
context assembly. The harness must assert that visible topic cards use the same
effective-workspace plugin projection as the app drawer and manifest routes;
open-app, open-topic, and open-file-directory are separate actions; the
standard plugin file directory is created/resolved under the target workspace as
`插件/<plugin title>`; context uses cleaned selected directory files only; and a
plugin topic run uses the selected workspace's MCP
schema or omits the plugin toolset with a bounded diagnostic. Owner fallback to
Owner's plugin app, directory, or MCP is a failing case. Focused checks should
include `node tests\plugin-topic-binding-service.test.js`,
`node tests\plugin-topic-delivery-directory-service.test.js`,
`node tests\plugin-topic-context-service.test.js`,
`node tests\plugin-topic-api-routes.test.js`,
`node tests\gateway-run-toolset-routing-service.test.js`,
`node tests\context-assembly-service.test.js`, and
`node tests\app-plugin-topics-ui.test.js` once those tests exist.

Wardrobe callable-schema coverage must include actual-wear history writeback
through `mcp_wardrobe_wardrobe_write_history`, not only item write/search/read
and photo functions.
Wardrobe-bound directory projects must first add `wardrobe` in the access
policy catalog; selector routing alone is insufficient because it cannot grant
toolsets absent from `allowed_toolsets`.
If a topic is already bound to a wardrobe/closet directory, every AI run in
that topic must keep authorized `wardrobe`, `vision`, and `file` in the
suggested model-selection catalog by default, even when the latest message is
semantically light. This is still a policy-bounded suggestion: the router must
not grant toolsets that the run policy did not already authorize.
Wardrobe root UI harnesses must assert shared centered page title, no repeated
body hero title/directory pill, no visible disabled Stop button, and top-right
three-dot section switching for overview, watches, maintenance, wear, featured
looks, and log. Wardrobe stats tests must also cover currency-prefixed prices
such as `¥4,787` so totals and average price do not undercount. Full Wardrobe
UI parity must be tested as a future embedded-app plugin contract, not by
copying Wardrobe detail/photo/settings screens into Hermes Mobile.
Wardrobe MCP schema smoke must use a real selected Gateway worker and require
`mcp_wardrobe_wardrobe_search_items`, `mcp_wardrobe_wardrobe_get_item`,
`mcp_wardrobe_wardrobe_write_item`, `mcp_wardrobe_wardrobe_upload_photo`,
`mcp_wardrobe_wardrobe_set_primary_photo`, and
`mcp_wardrobe_wardrobe_write_history`. A policy record that says `wardrobe` is
enabled is not enough if the callable schema exposed to the model lacks those
functions. MCP registration logs are not enough either: for MCP-required
smoke, use a session schema when the runtime writes one, or run
`node scripts\gateway-tool-schema-smoke.js --profile <profile> --schema-only
--require <mcp_...>` so the harness constructs that profile's actual
`AIAgent` under the production runtime overlay. Runtime-log-only MCP evidence
is allowed only with an explicit emergency override and must not be used as
normal pass evidence. Provider selection remains user intent: if the selected
provider is OpenAI/ChatGPT, repair that OpenAI profile's schema exposure rather
than auto-routing to DeepSeek; the reverse is also true.
When model-first toolset selection is disabled, Wardrobe-intent or
wardrobe-bound-topic runs must still execute with the full active Wardrobe
required bundle plus baseline schemas selected by capability activation. The
deterministic route may record a narrower `suggested_toolsets` hint such as
`wardrobe`, `vision`, `file`, `skills`, and weather-sensitive `weather`, but
tests must assert that this hint does not prune the required plugin bundle or
force unrelated optional plugin schemas into the run.
For selector/runtime-overlay changes, standalone schema smoke is not sufficient.
The harness must also exercise the real `/v1/responses` request path and prove
that Mobile's top-level `enabled_toolsets` becomes the effective
`AIAgent.enabled_toolsets`. If that proof is unavailable during a hotfix window,
keep `HERMES_MOBILE_GATEWAY_MODEL_FIRST_TOOLSET_SELECTION=0` while leaving
`HERMES_MOBILE_GATEWAY_MODEL_PERMISSION_PREFLIGHT=0` unless there is an
explicit diagnostic rollback.
Runtime configuration harnesses must also check the effective production
launcher before concluding the selector is on or off:
`C:\ProgramData\HermesMobile\start-hermes-mobile-production.ps1` is the real
toggle owner, while `%USERPROFILE%\.hermes-windows\start-hermes-mobile-production.ps1`
is only a forwarding wrapper. A selector rollout or rollback must document the
launcher value, the backup path, and a post-restart `/api/status?detail=1`
smoke. Changing the selector does not require a Gateway Pool restart by itself,
and it must not change provider routing or silently re-enable permission
preflight.
Public reverse-proxy hardening is a permission/security workflow. The harness
must cover global HTTP security headers on JSON and route-owned responses,
including `Strict-Transport-Security`, `Content-Security-Policy`,
`X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy`; query-string
Access Keys disabled by the effective production launcher; header-based Owner
auth still accepted; anonymous plugin proxy requests denied before upstream
fetch; and Codex Mobile bridge default permission mode remaining below
`full`/dangerous execution unless explicitly overridden. Production rollout
must record the launcher backup, post-restart `/api/public-config` header
smoke, query-key denial smoke, authenticated `/api/status?detail=1` smoke, and
Windows firewall state for generic Node.js Public inbound rules.
Embedded app plugin host tests must assert manifest-driven tab loading,
same-window iframe navigation, no `target=_blank` browser handoff, a short-lived
signed embed token with no raw keys in URLs, a persistent iframe host that does
not reparent launch iframes, a clean blank host during manifest/launch loading,
and a postMessage/back contract. The host-side harness must also assert that
the parent `edgeSwipeZone` starts a real edge back-swipe state for plugin pages
instead of only swallowing iframe-adjacent touch events with `preventDefault()`.
Mobile bottom navigation must keep Codex as a first-level tab while collecting
Wardrobe, Finance, and Email under the centered `插件` drawer without bypassing
their manifest/workspace visibility rules; hidden legacy plugin tabs must not
consume bottom navigation hit targets.
Plugin-context bottom navigation must remain a three-entry browser-style footer.
It is not the ordinary five-entry app navigation: it should be icon-first,
compact, fixed outside the embedded browser viewport, and visually separated by
a clear top divider with minimal wasted vertical space. Embedded plugin iframes
must hide the normal Hermes topbar/header; plugin-specific headers belong inside
the iframe. It must not add host-owned bottom padding to the embedded iframe.
Exiting plugin context back to the topic home must clear plugin host classes,
plugin view-mode classes, scroll feedback state, and sidebar/right-swipe state
before the topic list is rendered again; otherwise directory-bound topic cards
can become non-scrollable after entering and leaving a plugin.
The host plugin viewport must subtract the plugin-context footer height so the
iframe starts at the host viewport top and ends at the footer's top edge, and
plugin-context iframe/shell min-height must be cleared so standalone `100dvh`
plugin layouts cannot slide under the Hermes buttons. The
plugin-side UI harness must also follow
`docs/IMPLEMENTATION_NOTES/embedded-plugin-ui-contract.md`: iframe app roots use
iframe-relative `height: 100%` sizing in `embed=hermes`, plugin-owned bottom nav
or floating action bars reserve only plugin-owned footer space, and device/CDP
checks measure both the iframe/footer gap and the plugin local-nav/iframe-bottom
gap. If Finance-like plugin pages align while another plugin floats above the
footer, treat that as a plugin-side embedded layout failure unless host geometry
shows the iframe still extends under the Hermes footer. The
same-origin proxy harness must also cover plugin-owned JSON image paths,
including Note `/api/v1/app/attachments/<id>` URLs in note bodies and
attachment metadata; these URLs must be rewritten to
`/api/hermes-plugins/note/proxy/...` with the selected workspace id. The
harness must also assert that an empty directory-bound topic draft can be
dismissed by top-left or right-swipe back, and that switching from that empty
draft to a plugin app discards only the pending draft state instead of locking
the plugin footer. The draft recognition must be based on the pending directory
attachment itself, not on the return route still being present, and
`loadSelectedView()` must not clear `state.directoryReturnRoute` while that
draft is active. Discarding the draft must clear both `pendingTaskDirectory` and
`taskDirectoryFilter`.
Codex Mobile is a special Owner-critical plugin surface: when its embedded
iframe is active, Hermes must hide both ordinary bottom navigation and the
plugin-context three-entry bar, reserve zero bottom-nav space, and let the Codex
iframe occupy the bottom of the viewport. This must hold even on mobile
secondary/back-visible states that normally re-show plugin-context navigation.
Plugin-owned full-screen image/file previews must use the embedded plugin
postMessage contract to hide the Hermes plugin-context footer and reserve zero
bottom space until the preview closes. Frontend harnesses must assert the host
accepts `previewFullscreen` / `fullscreenPreview` navigation state, hides the
bottom nav even when mobile back-visible rules would normally re-show it, and
sets the embedded iframe viewport bottom to `0`.
Right-swipe/back from a plugin context must prefer plugin-owned navigation over
host exit: when `canGoBack=true`, the swipe target sends `hermes.plugin.back` to
the iframe, and only falls back to `plugin-context-home` after the plugin has no
secondary page to close.
These are generic plugin requirements, not Wardrobe-only behavior; new plugins
must satisfy the same host contract before being treated as production-ready.
Installed plugin visibility must also be covered: Owner sees installed plugins
by default only when the effective workspace is `owner`; when an Owner session
switches to a non-Owner workspace, ordinary plugin list/navigation/manifest
projection must simulate that target workspace. Non-Owner workspaces do not
list or launch a plugin unless there is an explicit Owner authorization signal.
A global plugin key is not enough to authorize every workspace. Plugin-manager
changes must additionally test Owner-only admin routes, grant/revoke
persistence, normal business-plugin visibility after a grant, Codex Mobile
grant denial, Codex Mobile absence during Owner-to-non-Owner workspace
switching, and the side-navigation manager being hidden from non-Owner users.
Finance workspace provisioning is an H1 plugin authorization workflow. Granting
Finance to a workspace, and Owner first use of the default-visible Finance
plugin, must create a workspace-local
`.hermes-finance/access-key.txt` and non-secret `.hermes-finance/config.json`,
call Finance
`POST /api/v1/hermes/plugin/users/bind` with UTF-8 workspace display name,
register `mcp_servers.finance` for the target workspace profile, expose the
`finance` toolset only when that profile/schema exists, launch Finance through
the standard Python stdio wrapper (`finance_mcp_stdio.py`) rather than a
profile-specific ad-hoc runtime, record only `active` or bounded
`provisioning_failed` status, and block non-Owner list/manifest/launch when
provisioning has failed or is still pending. Harnesses must assert the raw
workspace key is not returned in the grant result, manifest, frontend state,
URL, postMessage payload, docs, logs, or screenshots, and that Owner switching
into a non-Owner workspace cannot reach Owner's Finance user or ledger through
either iframe launch or MCP. Windows+WSL smoke must additionally prove the
Finance Python wrapper can call `tools/list` and receive `mcp_finance_*`; a
non-loopback `--api-base-url` that hits Finance's loopback-only MCP bridge and
returns `finance_mcp_dispatch_loopback_only` is a failing deployment state.
Owner profiles must be tested for the same `.hermes-finance` presence before
MCP registration; falling back to the Hermes Owner web key is not valid MCP
provisioning evidence.
Focused checks include
`node tests\finance-plugin-provisioning-service.test.js`,
`node tests\startup-scripts.test.js`,
`node tests\hermes-plugin-service.test.js`,
`node tests\hermes-plugin-api-routes.test.js`,
`node tests\wardrobe-plugin-navigation-ui.test.js`, and
`node tests\task-list-ui.test.js`.
Wardrobe workspace provisioning is also an H1 plugin authorization workflow.
Granting Wardrobe to a workspace must create that Hermes user's own Wardrobe
workspace id, write workspace-local `.hermes-wardrobe/access-key.txt` and
non-secret `.hermes-wardrobe/config.json`, call Wardrobe
`POST /api/v1/hermes/plugin/workspaces` with a server-side `owners:write` or
`admin:*` registration bearer credential, install the keyless
complete `productivity/wardrobe-style-operations` Skill bundle into that user's
Skill Store, refresh the workspace Gateway profile binding, and block non-Owner
list/manifest/launch while provisioning is pending or failed. Harnesses must
assert generated target keys use Wardrobe's accepted Program API prefix, replace
invalid legacy placeholder-prefixed keys before registration, and keep the
target raw Wardrobe key present only in the server-to-server registration body
and the workspace-local key file, not in the grant result, manifest, frontend
state, iframe URL, postMessage payload, docs, logs, or screenshots. They must
also assert the target Skill Store contains the full `SKILL.md`,
`references/wardrobe-program-api.md`, at least one other reference Markdown
file, and `scripts/render_wardrobe_phone_pdf.py`; a fixture or runtime source
that lacks `references/` must fail closed instead of falling back to a short
template. The installed Skill bundle must not contain concrete Wardrobe
workspace keys, plugin launch tokens, or `Authorization: Bearer ...`
credentials. Missing/invalid registration credentials or incomplete Skill
bundles are bounded provisioning failures. Focused checks include
`node tests\wardrobe-plugin-provisioning-service.test.js`,
`node tests\gateway-workspace-provisioning-service.test.js`,
`node tests\hermes-plugin-service.test.js`, and
`node tests\hermes-plugin-api-routes.test.js`.
Email workspace provisioning is an H1 plugin authorization workflow. Granting
Email to a workspace must call Email
`POST /api/v1/hermes/plugin/workspaces` with a server-side Email Owner key,
bounded workspace identity, and the target workspace root. The resulting
workspace-local `.hermes-email/config.json` and `.hermes-email/access-key.txt`
are the only long-lived launch materials Hermes should use; Email owns mailbox
credentials, local mail storage, sync cursors, and per-user account filtering.
The Email MCP harness must prove the `email` toolset and `mcp_servers.email`
are bound to the target workspace directory, reject workspace override, expose
single-prefixed Gateway callables such as `mcp_email_search_messages`, and do
not expose provider OAuth/token material to Hermes or the model. Ordinary chat
must keep Email catalog-only, while explicit mailbox intent must activate
Email before the Gateway stream begins.
Harnesses must assert the raw Email Owner key, workspace key, launch token, full
mail body, attachment content, and provider credentials are not returned in the
grant result, manifest, frontend state, iframe URL, postMessage payload, docs,
logs, or screenshots. Pending or failed Email provisioning must block non-Owner
list/manifest/launch. Focused checks include
`node tests\email-plugin-provisioning-service.test.js`,
`node tests\email-mcp-wrapper.test.js`,
`node tests\gateway-profile-template-builder.test.js`,
`node tests\gateway-run-start-service.test.js`,
`node tests\hermes-plugin-service.test.js`,
`node tests\app-embedded-plugin-ui.test.js`, and
`node tests\task-list-ui.test.js`.
Health workspace provisioning is the same H1 plugin authorization workflow.
Granting Health to a workspace must create workspace-local
`.hermes-health/access-key.txt`, write non-secret `.hermes-health/config.json`,
and call Health `POST /api/v1/hermes/plugin/workspaces` with a server-side
registration credential such as `HEALTHY_REGISTRATION_KEY` or the Hermes Mobile
Health owner-key env/file aliases. The registration request must include the
bare Hermes workspace id in `workspace_id`, `target_workspace_id`, and
`hermes_workspace_id`, and may send `access_key_hash`; it must not send the raw
workspace key. Health may respond with canonical `workspace_id` such as
`health:owner`; Hermes must persist that canonical id in config. Missing or
empty registration credentials, failed Health registration, key/config write
failure, or missing MCP wrapper binding must keep the grant out of `active` and
block list/manifest/launch instead of falling back to Owner. A fresh Health
manifest means installed only: Owner and non-Owner workspaces must not see
Health in ordinary plugin lists, plugin topics, launch manifests, or MCP
toolsets until explicit provisioning creates both `.hermes-health/access-key.txt`
and `.hermes-health/config.json` for that effective workspace. Focused checks include
`node tests\health-plugin-provisioning-service.test.js`,
`node tests\hermes-plugin-service.test.js`, and
`node tests\task-list-ui.test.js`.
Generic plugin provisioning states must also be covered. A plugin-manager grant
may enter `pending` only when Hermes owns an automatic provisioning service for
that plugin. Finance, Wardrobe, Email, and Health are automatic provisioning
plugins; pending or failed records for any of them must block non-Owner
list/manifest/launch.
Manual/external-binding plugins without a Hermes provisioner should store
`manual_required` and must not be blocked by the pending/failed gate solely due
to the grant record. Codex Mobile remains non-grantable. The service harness
must cover Finance auto-provisioning, Finance failure blocking, Wardrobe
auto-provisioning, Wardrobe failure blocking, Email auto-provisioning, Email
failure blocking, legacy Wardrobe pending blocking, and Codex grant denial in
`node tests\hermes-plugin-service.test.js`.
Plugin notification coverage must assert that
`POST /api/hermes-plugins/<plugin-id>/notifications` requires Hermes auth,
requires a stable `sourceId`/`eventId`, supports durable Inbox-backed events and
push-only events, sends Web Push through Hermes when requested, and never
exposes plugin keys, launch tokens, push endpoints, or raw plugin content.
The default push click target is the Inbox item when one exists; `openMode=plugin`
or push-only events click the plugin route. Codex Mobile task completion keeps
one latest Inbox record per workspace through a stable workspace-scoped dedupe
key, so a new completion overwrites that workspace's previous Codex completion
item instead of creating a growing Inbox list. Codex Web Push clicks must still
go directly to the Codex plugin route, with the Inbox id carried only as
metadata. Codex completion push must be suppressed unless the plugin event is
terminal, includes bounded final receipt detail, and carries a route anchor that
can focus the completed thread/task/turn. If a plugin supplies bounded
`detailMessage`, Action Inbox detail must render it as the long receipt; Web
Push assertions must prove the long body does not appear in the push payload and
that `openMode=plugin` payloads preserve `pluginRoute`, `pluginItemId`,
`pluginThreadId`, `pluginTaskId`, and `sourceTurnId` before generic Inbox
routing.
Finance ledger join approval is an H1 plugin-to-Inbox workflow. Harnesses must
cover `finance.ledger_join_request` normalization into an Inbox `approval` item,
compact ledger/requester/role display, approve/reject actions, Finance review
contract invocation before Inbox state transition, Finance plugin refresh after
review, and privacy limits that exclude Finance tokens, Hermes workspace keys,
cookies, bank/account details, voucher bodies, push endpoints, and long logs.
Focused checks: `node tests\hermes-plugin-notification-service.test.js`,
`node tests\finance-ledger-join-approval-service.test.js`,
`node tests\action-inbox-api-routes.test.js`, and
`node tests\app-action-inbox-ui.test.js`.
Plugin projects must also carry their own harness: manifest shape, launch
exchange, frame-ancestor origin registration, `?embed=hermes` mode,
`<plugin-id>.plugin.navigation`, `hermes.plugin.back`, optional
`<plugin-id>.plugin.back_result` with `handled=false` fallback to the Hermes
outer back layer, same-iframe internal navigation, no `window.open` /
`target=_blank`, state preservation across tab switches, and installed-PWA
smoke. Hermes Mobile host tests do not replace the plugin project's own
embedded-mode tests.
The first NAS-backed registration uses
`GET /api/hermes-plugins/wardrobe/manifest` as the Mobile-side contract and
defaults the live source to
`http://127.0.0.1:8765/api/v1/hermes/plugin/manifest`, with an environment
override for later local/production source changes. Codex Mobile Web uses the
same generic route shape through `GET /api/hermes-plugins/codex-mobile/manifest`
and defaults to the local Codex plugin manifest at
`http://127.0.0.1:8787/api/v1/hermes/plugin/manifest`.
HTTPS/PWA embedded-plugin tests must assert that a raw HTTP iframe entry is
never silently rendered as a blank plugin pane. External plugins need an HTTPS
browser-facing entry or a visible diagnostic. Local/LAN plugins such as Codex
Mobile and Wardrobe may remain HTTP upstreams only when Hermes Mobile rewrites
the browser-facing entry to `/api/hermes-plugins/<plugin-id>/proxy/...` and
proxies HTML, static assets, plugin API calls, redirect headers, and session
cookies through that path. A same-origin proxied entry must not be marked
unavailable merely because the upstream plugin's `frame-ancestors` directive
does not list the Hermes origin; the browser frames the Hermes proxy URL. Direct
HTTPS/non-proxied plugin entries must still pass the frame-ancestor allow check.
The test must hit the real Mobile dispatcher route
as well as the plugin route module. Same-origin proxy launch tests must prove
server-side `fetch` uses manual redirect handling, because automatic redirect
following consumes launch `302` cookies before the browser can store them. Tests
must also assert upstream cookie `Domain` is stripped and `Path` is rewritten to
the plugin proxy prefix. They must also assert Owner switching into a non-Owner
workspace cannot reuse an Owner plugin session: the proxied launch entry must
carry the effective target `workspaceId`, upstream requests must forward
`x-hermes-plugin-workspace-id` for that target, and session cookies must be
namespaced by plugin id plus workspace id. Rewritten plugin HTML, JavaScript,
CSS, and JSON resource/API URLs must also carry the effective `workspaceId` when
the URL is a static string so a browser request that omits `Referer` still lands
in the selected workspace. JavaScript template-string URLs with runtime query
fragments, such as ``/api/threads${params}`` or
``/api/auth/status?_ts=${Date.now()}``, must preserve the template expression
and only rewrite the static path prefix to the proxy; inserting `workspaceId`
inside the expression or concatenating it as `workspaceId=ownerlimit=...` is a
failing harness case.
The client auth harness must also assert that `public/app-api-client.js` syncs
the same-origin `hermes_web_key` cookie whenever it sends `X-Hermes-Web-Key`;
otherwise authenticated plugin iframes cannot navigate to the protected
same-origin proxy because iframe navigations cannot attach custom headers.
Incoming proxy requests may translate only the current plugin/workspace cookie
back to the upstream cookie name; they must drop Owner-scoped plugin cookies,
other-workspace plugin cookies, and old unscoped plugin cookies. If a request
has no workspace hint and carries multiple workspace-scoped cookies for the same
plugin, the proxy must fail closed as an ambiguous workspace instead of falling
back to Owner. This is a generic embedded-plugin harness requirement, not a
Wardrobe-only case; cover normal workspace-private plugins such as Wardrobe and
Finance, and keep Owner-only plugins such as Codex Mobile hidden when the
effective workspace is non-Owner. Harnesses must also assert stale
session cleanup: manifest responses expire known raw upstream session cookie
names plus Owner/current Hermes-scoped names, and launch-token proxy requests do
not forward any existing plugin session cookie before the upstream issues the
fresh workspace session. The same-origin proxy must also
rewrite plugin-owned image/static URLs in HTML, JavaScript, CSS, and JSON
responses so absolute upstream image URLs and root-relative `/uploads`,
`/media`, `/images`, `/assets`, and `/static` paths stay under
`/api/hermes-plugins/<plugin-id>/proxy/...`; explicit plugin resource APIs such
as `/api/uploads/file` and `/api/files/preview/content` must also be proxied.
Wardrobe JSON photo paths such as `/api/photos/<id>/content`,
`/api/outfit-photos/<id>/content`, `/api/featured-look-photos/<id>/content`,
and `/api/v1/items/<code>/photos/...` are resource URLs and must be proxied
rather than resolved against Hermes Mobile's own `/api` namespace.
JSON responses must be parsed and rewritten structurally so thread/chat prose,
code snippets, and ordinary `/api` strings are not changed. Binary image
requests through that path must be streamed with their original content type.
Embedded plugin upload harnesses must also cover same-origin proxy upload
compatibility: sandbox strings include `allow-forms` and `allow-modals`,
multipart `FormData` upload requests keep the original body/content type, and
Wardrobe CSS proxy output turns hidden `.upload-btn input` file controls into
transparent interactive file inputs instead of `display:none` controls.
Active embedded plugin
hosts must hide the Hermes page header so plugin content is not double-framed;
the Hermes bottom navigation must also be hidden for plugin root and secondary
pages. Deployment
smoke for this class must include the installed Android PWA launched from the
home-screen icon. Opening the same URL in the Chrome/Safari address bar is
explicitly not a valid PWA smoke, because Hermes Mobile shows a browser-shell
guard page there and it does not exercise standalone storage, service-worker,
navigation, or plugin iframe behavior. Dark-mode plugin-tab smoke must also
assert that a newly created iframe is hidden behind a theme-colored shell until
load, so Codex/Wardrobe tab entry does not flash a white browser default
surface. Wardrobe-specific host tests must cover the same loading-shell
contract even when the tab uses `.wardrobe-plugin-*` classes rather than the
generic embedded-plugin host classes. Refresh stability assertions must prove an existing iframe remains
visible while the host fetches a fresh launch URL, passive/non-forced boot
warmup refresh attempts are suppressed, explicit
`<plugin-id>.plugin.refresh_required` postMessages can recover a consumed or
invalid launch page without bypassing relaunch cooldown, and entering plugin
mode clears stale keyboard viewport metrics so the chat composer returns to its
normal bottom alignment.
Dark-mode installed-PWA resume must also assert that the pre-JS shell,
manifest `background_color`/`theme_color`, `html`/`body` background, plugin
host background, and iframe loading shell share the effective dark background.
The navigation regression path `plugin -> topic -> chat` must verify stale
`keyboard-viewport-active`, `keyboard-context-mode`, `--keyboard-*` CSS
variables, and bottom-nav reservation do not shift the composer downward.
Embedded-plugin host tests must also cover the outer return layer: entering a
plugin from a Hermes page records the source route, plugin internal
`canGoBack=true` sends `hermes.plugin.back`, and plugin root /
`back_result handled=false` restores the saved Hermes page instead of trapping
the user inside the plugin tab. Plugin root and secondary pages must hide the
Hermes bottom navigation; exiting a full-screen plugin uses the host
back/right-swipe contract and saved Hermes route restoration, not a visible
bottom-tab escape path inside the plugin surface.
If Hermes sends `hermes.plugin.back` and the plugin does not acknowledge with a
fresh navigation or back-result event inside the bounded fallback window, the
host must treat that back as unconsumed and restore the saved Hermes route when
available.
Plugin refresh coupling must be covered by the host contract: the iframe may
send `<plugin-id>.plugin.refresh_required`, Hermes must validate the plugin
entry origin, discard stale iframe/launch state, fetch a fresh manifest through
the Mobile plugin route, and preserve only bounded route hints so the active
plugin returns to its intended Codex/Wardrobe position after refresh. Wrong
origin refresh messages and payloads carrying keys, cookies, launch tokens,
raw plugin content, prompts, or local paths are failing cases.
The host must still throttle passive launch-health rebuilds so an invalid
plugin page cannot create a relaunch loop; the harness must cover same-window
explicit refresh recovery, messages sent while manifest/launch loading is
already in progress, and active-tab frame rebuild without leaking route hints
beyond bounded plugin route fields. Host-side launch-health retries must use
the same throttle, and a normal host re-render must preserve an already-mounted
iframe instead of requesting another launch token.
Embedded-plugin appearance sync is part of the launch contract. Host tests must
assert Hermes sends sanitized `appearance.theme` and `appearance.fontSize` in
Codex, Finance, and Wardrobe launch bodies, maps Hermes `standard` font size to
plugin `default`, and creates iframe entries only after the short launch path
contains matching `pluginTheme` / `pluginFontSize` query parameters. The host
must treat these as session-scoped preferences and must not leak keys, launch
tokens, local paths, raw settings dumps, or private content into appearance
metadata.
The host cache harness must also assert a manifest/launch result is reused only
when both workspace id and sanitized appearance key match. A previously fetched
`system/default` Wardrobe manifest must not satisfy a later `dark/large` launch;
the next plugin entry must fetch a new launch token and entry URL with matching
appearance query parameters. The render path must apply the same
workspace-and-appearance check before reusing an existing iframe shell, so a new
appearance-aware launch token cannot remain unconsumed while the old iframe
session stays mounted.
The same harness must require stale plugin shells to be discarded when the
workspace-and-appearance key no longer matches; `preserve_iframe_state`,
navigation metadata, and refresh warmup/cooldown paths must not preserve an old
`system/default` Wardrobe iframe after a `dark/large` launch has been requested.
Launch-token plugin harnesses must also cover plugin-side version changes. A
cached launch-token manifest must expire on a short TTL, and when a fresh
manifest/launch returns a different browser-facing iframe entry URL, the host
must rebuild the iframe shell even if the previous iframe recently posted
navigation events. Refresh-required postMessages from the still-mounted frame
origin must remain accepted so the plugin can trigger the refresh that replaces
the stale shell. Focused check: `node tests\embedded-plugin-refresh-harness.test.js`.
Plugin appearance harnesses must assert Hermes launches plugins with the
effective host theme. A host preference of `system` must be resolved via
`prefers-color-scheme` before launch, so a dark-mode PWA sends `dark` rather
than relying on each plugin to interpret `system` identically.
Plugin API route tests must also assert bounded manifest audit events capture
requested and response appearance without recording keys, launch tokens, entry
URLs, cookies, plugin content, or request bodies. This audit is the required
diagnostic path when a plugin reports receiving `system/default` while Hermes is
visibly in dark mode.
Static-client hotfixes must also run `node tests\static-cache-version-harness.test.js`.
This harness fails when cache-sensitive `public/app-*.js`, `public/styles.css`,
viewer HTML, `index.html`, or `service-worker.js` changes are present without a
client/cache version bump from `HEAD`, and it checks that the versioned app shell
uses the current embedded-plugin host script URL. Windows edits to static/test
files with Chinese text must use UTF-8-safe paths; PowerShell raw text rewrites
are not an acceptable harness path for version replacement.
Finance embedded-app registration follows the same host contract. Tests must
cover compact manifest normalization (`entry` string, top-level `launch`,
`toolsets`, `mcpServer`, `permissions`, and `embedding` events), Owner-default
visibility with non-Owner denial unless explicitly authorized, server-side
Finance launch body fields (`workspace_id`, `workspace_key`, `role`, and
optional `user_key`) without leaking raw keys into the returned manifest, and
the current Finance auth split where `user_key` is optional and must be a separate
workspace-user key, not a reused workspace key, while the workspace key is not
sent in an `Authorization: Bearer ...` header. Tests must also cover
same-origin proxy rewriting for `/finance.html`, `/manifest.webmanifest`,
`/app-finance-ui.js`, and plugin-owned `/api/finance/...` resource URLs, plus
quoted and unquoted CSS `url(...)` resources such as
`url("/assets/wacai-ledger-bg.svg")`; malformed quote stripping that causes
later rules such as `.finance-bottom-nav` to disappear from the browser CSSOM is
a failing case. Tests must also cover
negative cases where anonymous or unauthorized workspace requests are denied
before any upstream fetch. The
Finance token-error smoke must record only bounded evidence: manifest
`available`, `tokenStatus`, redacted proxy launch URL shape, launch `302`
preservation, redirect shape, `finance_hermes_session` cookie name, and a
bounded authenticated `/api/finance/overview` result.
Focused checks for this contract include
`node tests\hermes-plugin-service.test.js`,
`node tests\hermes-plugin-api-routes.test.js`,
`node tests\embedded-plugin-refresh-harness.test.js`,
`node tests\wardrobe-plugin-refresh-harness.test.js`, and
`node tests\app-embedded-plugin-ui.test.js`.
Finance MCP registration checks must also prove the real Gateway callable schema,
not only generated profile files or MCP registration logs:
`node scripts\gateway-tool-schema-smoke.js --profile <finance-capable-profile> --schema-only --require mcp_finance_list_ledgers,mcp_finance_add_transaction_attachment --require-tool-property mcp_finance_add_transaction_attachment:file_path,mcp_finance_add_transaction_attachment:upload_path`.
This smoke is required after changing Finance provisioning, MCP wrapper framing,
Gateway profile generation, WSL/NAS MCP API-base propagation, or startup scripts.
Plugin MCP schema changes must also bump the Mobile `GATEWAY_TOOL_SCHEMA_EPOCH`
and the default instruction-service `toolSchemaEpoch`. The run history for a
plugin topic must show a conversation key with the current plugin-MCP epoch; an
older Wardrobe-only epoch paired with `Enabled toolsets: finance` is a failing
state because it can reuse a cached callable schema without `mcp_finance_*`.
Finance attachment support is not accepted unless the Mobile instruction-service
Finance callable hints and current tool schema override both name
`mcp_finance_add_transaction_attachment`, the service schema includes
`finance.add_transaction_attachment:file_path` and `:upload_path`, and the
Gateway callable schema includes
`mcp_finance_add_transaction_attachment:file_path` and `:upload_path`. A plugin
service `/schemas` pass alone, or a Gateway tool-name-only pass, does not prove
the model can call the attachment tool with a server-local upload path in a live
run.
For any plugin MCP tool addition or rename, run
`node scripts\mcp-tool-upgrade-closure-smoke.js` with the plugin service schema
URL, the local service tool name, the Gateway `mcp_<server>_<tool>` callable,
any required tool properties, the new `GATEWAY_TOOL_SCHEMA_EPOCH`, and the
selected production profile when a live Gateway is available. The source guard
for that closure is
`node tests\mcp-tool-upgrade-closure-harness.test.js`.
Health MCP registration follows the same rule. A passing Health integration must
prove the selected profile exposes the single-prefixed callable
`mcp_health_records_get_summary`; a double-prefixed callable such as
`mcp_health_mcp_health_records_get_summary` means the plugin wrapper returned an
already-prefixed tool name and is not a valid pass, even if the profile lists
`health` under `platform_toolsets.api_server`.
Note MCP registration follows the same selected-profile rule. A passing Note
integration must prove the selected profile exposes single-prefixed callables
such as `mcp_note_notes_search` and `mcp_note_notes_create`; a profile that
lists `note` but lacks `mcp_note_notes_*`, double-prefixes the tools, or binds
to Owner's `.hermes-note` while viewing another workspace is a failing
workspace/provisioning state.
Local Windows Note MCP validation must also include a WSL-to-Note API
reachability probe. A profile that exposes `mcp_note_notes_create` but points
the wrapper at Windows-only loopback or an unreachable LAN address is failing,
because create/update calls can time out even though schema discovery succeeds.
Switching away from a plugin tab must force-hide the plugin host and clear the
active host class even if the iframe shell record is missing, stale, or still
loading; a plugin iframe must not remain above chat/topic content after a
bottom-tab switch.
Wardrobe dashboard binding tests must cover directory ambiguity: a configured
wardrobe root with `.hermes-wardrobe/config.json` must win, child delivery
folders such as `衣橱/交付` must not steal the root, and generic outfit output
folders such as `穿搭建议` must not be treated as the deterministic dashboard
workspace.
The execution policy must also preserve the wardrobe companion set after
model-first narrowing. If the suggested set contains authorized
`wardrobe`, `vision`, and `file`, a selector result of `wardrobe,file` must
still execute with `wardrobe,vision,file`; otherwise the main run will be forced
into an avoidable `HERMES_TOOLSET_ESCALATION_REQUIRED` loop.
The same harness must cover the low-level regression where the selector returns
`clarify` alone for a wardrobe MCP task or an MCP visibility check. When the
router has already suggested authorized `wardrobe`, `vision`, `file`, and
`skills`, execution must expand back to that stack instead of starting a run
whose policy text mentions wardrobe but whose model-selected execution set
cannot expose `mcp_wardrobe_*`.
The common web companion set follows the same rule: `web`, `search`, and
`browser` should be suggested, retained, and escalation-retried together when
authorized, while the negative harness must prove `browser` is not granted if
the run policy did not authorize it.

The selector/preflight is an internal JSON-only step. Tests must assert that
preflight requests disable tool calls, that live preflight probes do not contain
tool-role messages, and that repeated JSON candidates from streamed Responses
events are parsed as a valid final decision rather than `invalid_json`.
Tens-of-seconds latency is acceptable if the preflight reliably returns;
latency/cost claims must verify the actual Gateway session or worker log model
instead of trusting only the request body's `model` field. A successful
model-first decisions must also suppress a second permission-classifier pass
before execution: the main execution prompt must not ask the model to load the
permission-boundary Skill again or call `skill_view` for
`productivity/hermes-mobile-permission-boundary-check`. Permission-only
preflight is a legacy explicit opt-in path; default run-start coverage must
assert that disabling it does not send a selector model call and does not emit
`run.permission_preflight_*` rows. If temporarily re-enabled for diagnostics,
timeout/error coverage must remain bounded by
`HERMES_MOBILE_GATEWAY_MODEL_PERMISSION_PREFLIGHT_TIMEOUT_MS`.

Run status harnesses must cover no-first-byte visibility. If the execution
stream receives no Gateway event after the configured warning window, the
system may store a diagnostic warning event without refreshing the real Gateway
`lastEventAt` used by liveness/stale decisions. Harness coverage should assert
visible first-stream-event, first-text-output, liveness stale, and stream-failed
statuses. Run-progress UI must not render `run.liveness_warning` as a visible
row; only stale/start-timeout/stream-failed states should consume visible
status space. Light and dark theme checks must also assert the inline active
run-status panel does not collapse into a thin empty border: the panel, header,
rows, elapsed time, and at least one status row must remain visible in both
themes.
Stream-closed-without-terminal coverage is required: if streamed text already
arrived, Mobile must emit `run.stream_closed_without_terminal`, synthesize
completion from the accumulated content, and avoid failed Web Push / failed
external delivery. If no model output arrived, Mobile should release the queue
without showing the raw `Hermes stream ended without a terminal completion
event` string.
Task terminal Web Push coverage must assert duplicate terminal events are
idempotent. A second `response.completed` / `run.completed` for the same
assistant message must return a terminal-ignored result, not enqueue another
external delivery or call `notifyTaskTerminal` again; `notifyTaskTerminal`
itself must skip a duplicate send when the same task receipt tag already has a
successful push delivery.
Run-progress UI tests must also cover preflight burst stability: model-selected
and toolset-selection events should update an existing panel in place, compact
`run.toolset_selection_started` with the matching terminal result, and use only
one delayed fallback thread refresh when no target assistant message is visible.
They must not call the generic whole-thread render path for each preflight
event, because that produces visible mobile screen jitter.
Single Window topic reply and thread-merge harnesses must assert that replying
inside an open topic posts the selected `taskGroupId`, and that a locally
running message not present in an idle incoming thread is removed rather than
kept as a stale pending card.
Wardrobe routing harnesses must include weather-sensitive outfit recommendation:
a wardrobe-bound topic asking for an outfit should add authorized `weather` to
the Wardrobe companion `suggested_toolsets`. With the selector disabled or
after selector fallback, the same test must prove execution still receives the
full active Wardrobe required bundle rather than the suggested subset.
Long-reply jump control harnesses must cover terminal DOM replacement and
historical scrolling: arrow visibility recalculation must resolve the current
conversation/message node when the queued callback executes, fall back from a
detached pre-terminal node to the live conversation, and run a short delayed
settle pass after final markdown/layout replacement. The eligibility check must
also cover one-screen overflow by measured rendered height and viewport
geometry, not by the 6000-character rich-render threshold. If a reply footer is
visible, the up/start arrow must stay inline beside the Usage/Skill/status chips;
floating is only allowed while the footer is outside the viewport. Viewport
harnesses must also cover orientation recovery: after landscape/portrait changes,
the client must clear stale keyboard viewport state when the composer is no
longer actually focused, clear temporary conversation scroll-layer reset state,
recompute bottom navigation reservation, and recalculate long-reply arrows.

Static client UI tests must cover device-local theme settings when the settings
sheet changes: `system` / `light` / `dark` options render in the settings menu,
the selected mode is stored as `hermesWebTheme`, `index.html` applies
`data-theme` before CSS load, and the app updates mobile `theme-color` plus
`apple-mobile-web-app-status-bar-style` so the OS status bar stays readable.
Theme visual harnesses must also cover real dark-mode surfaces, not just root
variables: sidebar/top bar, composer, user and assistant messages, topic cards,
Action Inbox rows and deliverable file tags, Growth warning/danger cards, and
settings/access-key sheets. A change that adds or modifies theme tokens must
include a screenshot or browser visual smoke against those surfaces and focused
assertions that the critical CSS rules consume theme variables instead of
hard-coded pale surfaces.
Dark-mode contrast harnesses must also check that message markdown headings,
receipt labels, file/artifact buttons, Growth teaching badges, and file viewer
shells do not use hard-coded dark green or pale backgrounds on dark surfaces.
Green/success text in dark/system-dark mode should be treated as a contrast
risk: tests should assert success/status text resolves to off-white variables
while preserving green only as a non-text semantic cue such as background,
border, or status dot. Cover Action Inbox source/status badges, Automation
success labels, group/member action buttons, topic secondary-page header
controls and directory chips, and reading fullscreen controls.
Settings-sheet grouped controls must also have dark/system-dark selected-state
coverage: theme options, font options, and default model options need a visible
selected frame/inner outline, not only a low-contrast fill.
Standalone `file-viewer.html`, `markdown-viewer.html`, and `pdf-viewer.html`
must read the saved `hermesWebTheme` preference before paint and expose
near-black page backgrounds in dark mode.
Foreground restore tests must also assert `handleAppForegrounded()` reapplies
the saved theme preference before refresh/render work, so a light-mode user does
not briefly see a dark-mode repaint when returning to the PWA.

Mobile sidebar shell tests must assert the side navigation is full-screen at
mobile/PWA widths (`100vw`, `100dvh`, safe-area padding, no visible underlying
app strip) and remains vertically scrollable without horizontal overflow.
Gateway provider status rows inside the sidebar must wrap through a compact
name/status layout rather than fixed three-column rows, so provider labels and
`Low`/`High` availability text cannot overlap on narrow devices.

Growth card detail/share UI tests must cover the H2 projection contract:
teaching-card and formal-card details render a `data-learning-growth-card-share`
control, use the local image-share pipeline with Web Share file payloads plus
clipboard/download fallback, and keep the detail page as a single-column
reading shell rather than nested table-like card grids. Assertions should cover
`app-learning-growth-task-ui`, `app-learning-program-ui`, `app-share-image-ui`,
and CSS rules that prevent card detail sections and structured questions from
compressing mobile text width.

Action Inbox harnesses must cover the low-click delivery and Todo semantics:
Automation delivery rows with `sourceRef.latestDeliverable` must render a
direct same-window document preview file tag that reuses the Automation detail
deliverable visual pattern and does not hardcode Markdown-only wording;
scheduled Todo/reminder Automation triggers must create `itemType=todo` Inbox
occurrences; scheduled Todo Automation rows with a safe deliverable must still
render the direct document preview action; row title/main areas must open the
Automation source detail with Inbox return context; row status must render as a
compact action badge after source/type, and tapping that status badge opens a
viewport-level action sheet with complete, snooze, and delete/dismiss actions;
the default open-state action badge must render the real status label `待处理`,
not a generic `处理` command, and its visual size/weight/color must stay close to
compact metadata text rather than a filled action pill;
the list must not render a separate right-side `处理` button that duplicates the
status badge or compresses the mobile row; generic
`待办提醒` titles must be replaced by the actual Automation/reminder title in
new projections or UI fallback; partial left swipes must not complete an Inbox
item while full swipes complete it once; and the default Inbox list must sort
newest items first by update/event/create time rather than grouping older Todo
rows above newer Automation receipts. Scheduled
Todo/reminder Automation pushes must also assert same-run idempotency: after a
deliverable push is marked for a `lastRunAt`, a later scan for the same run with
no newer deliverable must not send a second no-deliverable push, create another
Inbox upsert, or downgrade the stored mark.
Manual `sourceType=manual,itemType=todo` Inbox rows are already on their source
surface. If legacy data carries `/?view=todos...` or `todoId` deep links,
projection tests must assert the detail page does not render `Open source`, row
navigation does not call the internal route helper, and back navigation never
lands in the retired official Kanban/Todo compatibility surface.
The same compact source/type/status action contract applies to the Inbox detail
secondary page, not only the root list: the detail meta row must reuse the same
status-action badge and action-sheet path instead of rendering a larger legacy
status pill or separate process button.
The Inbox visual harness must also cover adjacent row badges/actions: `来源`,
`类型`, and status-action labels in the same meta row must share height,
padding, font family, font size, font weight, line-height, and letter spacing.
The status action may show a subtle chevron and semantic color, but must not
fall back to a larger browser-default button style.
This must be asserted with the app font-size setting enabled: the generic
`:root[data-font-size] button` rule must not enlarge an inline status button
relative to adjacent span badges.

Topic/navigation harnesses must assert that a missing `currentTaskGroupId`
does not leave the app permanently on `Restoring topic...` because of unrelated
active runs in the same single-window thread. The restore placeholder is valid
only for queued/running messages belonging to the same task group or while the
current thread fetch is actually in flight.

Directory plugin topic-start harnesses must assert that opening a topic from a
folder enters a directory-bound draft detail page in place, not the ordinary
topic-list root. The draft page must keep the composer visible and enabled,
hide the normal bottom navigation, preserve the pending directory attachment,
and restore the same directory view through top-left back or right-swipe before
the first message is sent. The first message from that draft must be guarded by
a draft-local in-flight state so repeated click/Enter submits cannot create
multiple topics for the same pending directory; after success, later messages
must target the created topic group rather than creating another one.

Toolset escalation and retry harnesses must assert that
`HERMES_TOOLSET_ESCALATION_REQUIRED` is stripped from visible chat content,
stored as bounded `toolsetEscalationRequired` metadata, and projected as
`run.toolset_escalation_required`. When the requested toolsets are omitted but
authorized, the same assistant message must automatically retry with the
previous selected toolsets plus the requested toolsets, skip a second selector
pass, emit `run.toolset_escalation_retrying`, and avoid terminal delivery until
that retry finishes. If the model requests a toolset that is already selected,
the raw marker must still be stripped and recorded as a controlled
schema-mismatch escalation without starting a duplicate retry. A later manual
retry/rerun message should also reuse recent task context or stored escalation
metadata to suggest the needed authorized toolsets instead of treating retry as
a plain probe, including when the relevant task context is in the same
`taskGroupId` but no longer in the global message tail.
Streaming-delta tests must also cover marker suppression before completion so
the raw escalation marker cannot appear briefly in the visible receipt while the
retry is being prepared.

Run tool-budget harnesses must prevent both extremes: runaway Web search loops
must abort when the configured cap is exceeded, but the default cap must not
kill an ordinary user-requested news/search run on the third search call. The
instruction harness must also assert that web/search-enabled runs tell the model
the configured Web-search budget before tool use.

Explicit user-requested web/X search uses the higher explicit-search budget and
quality-first instruction. Harness coverage must assert that explicit
`web_search` / `x_search` runs tell the model to prioritize source quality,
meaningful coverage, and verifiable evidence over small time/token savings,
while ordinary incidental web-enabled runs keep the normal cap.
`x_search` bridge-host proxy coverage must also include hybrid cold starts:
when the manifest Grok profile is configured but stopped, bridge-host checks
Grok `/health`, starts only the manifest `xai-oauth` profile, waits for health,
and then forwards the proxy request. Concurrent proxy requests must share one
start attempt. Focused checks include `node tests\bridge-host-grok-proxy.test.js`
and `node tests\startup-scripts.test.js`.

Run-progress UI behavior tests must also assert chronological downward row
ordering, public `web_...` plus response `resp_...` id merging for the same
assistant message, isolation from unrelated thread active ids so a fast task
cannot inherit another active chat run's elapsed time or events, and bottom
visibility when the inline status panel grows while the conversation is already
following the run. Function-call UI tests must also assert that object-shaped
previews and paired `callId` result events display the concrete function name
when available, and that paired Skill/function start and done events render as
one compact operation row with a status/duration label rather than adjacent
duplicate start/result rows. For `function_call` / `function_call_output`
pairs, the duration assertion must use the output/result completion timestamp
minus the original function-call start timestamp; the intermediate
`function_call.done` event must not be treated as tool execution completion.
Gateway event-service tests must also cover both `item` and `output_item`
payload shapes so function names are preserved while raw arguments and raw tool
outputs remain excluded. Once streamed text begins, run-progress UI tests must
assert the inline panel switches to compact display unless a later tool
operation has started. UI fallback tests must assert unnamed function events are
omitted instead of rendering generic labels such as `Function` or duplicated
labels such as `Function Function`.
Terminal assistant receipts must collapse completed run-progress details into a
footer tag similar to Usage/Skill; opening the tag shows historical rows from
the first retained event, remains scrollable and inside the portrait viewport,
prefers space above the tapped status chip instead of covering the lower
conversation/composer area, and terminal history must not render an ongoing
quiet/still-running row. Skill footer tests must assert no synthetic response
fallback Skill is projected when no real Skill was loaded.
The terminal run-progress history panel must not reserve a tall blank fixed
area when content is short. Mobile positioning should use content-aware
`top + max-height` with `bottom:auto`; only long histories should scroll.

For same-window navigation and browser-frame bugs, the required harness must
cover both root-mounted and prefix-mounted app-shell paths. If the issue is
reported through an external reverse-proxy/PWA URL, validation must include
that exact external entry path and the changed route-helper JavaScript from the
same origin/path; local root smoke alone is insufficient.
Web Push chat/topic receipt routing must cover terminal receipt `messageId`
projection, single-window route precedence over generic `taskGroupId`, and
frontend scroll target consumption after chat/topic messages render. Web Push
subscription and delivery tests must also cover deployment-origin scoping:
frontend `clientContext.origin`, subscribe-route server-origin forwarding,
matching-origin delivery, and skipped delivery for copied legacy subscriptions
with missing or mismatched origin when `HERMES_MOBILE_PUBLIC_ORIGIN` or
`HERMES_WEB_PUBLIC_ORIGIN` is configured.

For secondary-page return bugs, the harness must also cover async race
conditions: a late response from the page being left must not repaint that page
after the return target has already been restored.
Topic-list harnesses must cover Kanban-generated case-topic cleanup: the root
topic list must not render Kanban study/case topics even when their backing
cards still exist. Those records are source evidence for Growth/Todo/Kanban or
Inbox deep links, not ordinary root topics. The same filter must apply to
first-party topic groups carrying `kanbanCaseId`/`kanbanCaseMode` and shared
case-topic threads.

## CodeGraph-Assisted Test Selection

Use CodeGraph for structural test selection, not as a replacement for the test
matrix.

- Check index health first when structural results matter:
  - `codegraph status`
- For known backend symbols:
  - `codegraph callers <symbol>`
  - `codegraph callees <symbol>`
  - `codegraph impact <symbol>`
- For broad backend task context:
  - `codegraph context "<task>"`
- Prefer MCP CodeGraph when available. The 2026-05-26 local benchmark showed
  MCP structural calls around `12-18ms`; CLI calls were around `196-218ms`
  because of process startup.
- Keep `rg` for literal text, docs, static versions, DOM strings, and frontend
  closure functions. In the same benchmark, `codegraph affected
  public/app-learning-growth-task-ui.js -q` returned no UI tests while targeted
  `rg` found related UI test references.
- If `codegraph impact` and `rg` disagree on tests, run the union of relevant
  focused tests unless the difference is clearly unrelated.

## CodeGraph-First Read Budget

For H1/H2 changes, especially navigation, route, passive notification, Web
Push, Automation, Growth, Gateway, or workflow bugs, keep initial context
loading bounded:

- Use MCP CodeGraph first when available; CLI `codegraph` is a fallback because
  each CLI call starts a process.
- Run up to three CodeGraph structural queries before opening source files:
  `codegraph_context`, then a targeted `codegraph_search`/`codegraph_callers`
  or `codegraph_trace`/`codegraph_impact` depending on the question.
- Open no more than four source files in the first triage pass, and read only
  the symbol body or about 80-120 lines around each relevant symbol.
- For frontend closure-local functions, DOM strings, `data-*` attributes, URL
  query parameters, static versions, and tests, run one targeted `rg` pass after
  CodeGraph identifies the likely files.
- For `.agent-context/HANDOFF.md` and long docs, search headings or keywords
  first with `Select-String`/`rg`; do not read long tails by default.
- If more context is needed, state the missing fact and widen the read scope
  deliberately.

The guard test is:

- `node tests\codegraph-harness-discipline.test.js`

## Module Focused Tests

| Area | Focused Tests |
| --- | --- |
| Architecture/code/test/harness map | `node tests\architecture-code-test-harness-map.test.js`, `node tests\architecture-refactor-boundary.test.js`, `node tests\codegraph-harness-discipline.test.js` |
| API registry/dispatcher | `node tests\api-route-registry.test.js`, `node tests\api-route-inventory.test.js`, `node tests\mobile-api-dispatcher.test.js` |
| Multi-user/task platform | `node tests\auth-provider.test.js`, `node tests\access-key-api-routes.test.js`, `node tests\workspace-api-routes.test.js`, `node tests\gateway-run-start-service.test.js`, `node tests\gateway-run-toolset-routing-service.test.js`, `node tests\conversation-history-service.test.js`, `node tests\action-inbox-service.test.js`, `node tests\web-push-delivery-service.test.js` |
| Auth/workspace/access keys | `node tests\auth-provider.test.js`, `node tests\access-key-api-routes.test.js`, `node tests\workspace-api-routes.test.js`, `node tests\workspace-public-projection-service.test.js`, `node tests\mobile-http-runtime-service.test.js` |
| Public reverse-proxy security | `node tests\auth-provider.test.js`, `node tests\mobile-http-runtime-service.test.js`, `node tests\chatgpt-pro-codex-bridge-service.test.js`, `node tests\hermes-plugin-api-routes.test.js`, `node tests\mobile-api-dispatcher.test.js`, `node tests\api-route-inventory.test.js`, `node tests\architecture-refactor-boundary.test.js`, `npm.cmd run security:invariants`, `npm.cmd run privacy:scan`, production smoke: `/api/public-config` headers, query-string key denial, header-authenticated `/api/status?detail=1`, anonymous plugin proxy denial, and Windows firewall state |
| Gateway run lifecycle | `node tests\plugin-capability-probe-service.test.js`, `node tests\plugin-capability-activation-service.test.js`, `node tests\gateway-run-model-toolset-selection-service.test.js`, `node tests\gateway-run-error-message-service.test.js`, `node tests\gateway-run-start-service.test.js`, `node tests\gateway-run-toolset-routing-service.test.js`, `node tests\gateway-run-event-service.test.js`, `node tests\gateway-run-stream-service.test.js`, `node tests\gateway-run-lifecycle-service.test.js`, `node tests\gateway-run-queue-service.test.js`, `node tests\run-liveness.test.js`, `node tests\task-list-ui.test.js`, `node tests\run-progress-ui-behavior.test.js` |
| Chat context/compaction | `node tests\conversation-history-service.test.js`, `node tests\context-assembly-service.test.js`, `node tests\topic-context-compaction-service.test.js`, `node tests\gateway-run-event-service.test.js`, `node tests\mobile-sqlite-store.test.js` |
| Gateway Pool/scripts | `node tests\gateway-elastic-worker-scheduler.test.js`, `node tests\gateway-pool-provider.test.js`, `node tests\gateway-profile-template-sync.test.js`, `node tests\gateway-profile-template-builder.test.js`, `node tests\gateway-profile-replica-model-harness.test.js`, `node tests\plugin-capability-probe-service.test.js`, `node tests\gateway-run-toolset-routing-service.test.js`, `node tests\startup-scripts.test.js`, `node tests\cross-shell-command-harness.test.js`, `node tests\macos-production-profile-audit.test.js`, `node tests\gateway-pool-production-smoke-harness.test.js`, `node tests\macos-production-closure-validation-harness.test.js`, `node tests\macos-plugin-directory-production-smoke-harness.test.js`, `node tests\macos-wardrobe-binding-production-smoke-harness.test.js`, `node tests\macos-directory-path-migration-repair.test.js`, `node tests\hermes-mobile-image-plugin.test.js` |
| Gateway MCP callable schema | `python -m py_compile gateway-runtime-overrides\sitecustomize.py gateway-runtime-overrides\model_tools.py`, `node scripts\probe-lowgw1-wardrobe-mcp.js`, `node tests\no-window-command-harness.test.js` |
| ChatGPT Pro | `node tests\chatgpt-pro-codex-bridge-service.test.js`, `node tests\owner-elevation-routing-service.test.js`, `node tests\thread-message-create-service.test.js` |
| Grok/model routing | `node tests\gateway-model-routing-service.test.js`, `node tests\gateway-run-start-service.test.js`, `node tests\gateway-run-toolset-routing-service.test.js`, `node tests\grok-auth-metadata-smoke-harness.test.js`; script syntax: `bash -n scripts/macos-grok-xai-reauth.sh`; production xAI OAuth triage: `node scripts\grok-auth-metadata-smoke.js --profile-auth-file <file> --shared-auth-file <file> --require-access-token --json`. On Mac production, use `bash scripts/macos-grok-xai-reauth.sh` for the manual-paste OAuth repair, then rerun metadata smoke and finally `node scripts\gateway-pool-production-smoke.js --key-file <file> --model grok-4.3 --provider xai-oauth --expected-profile grokgw1` only after metadata shows an xAI access token is present. |
| Direct provider keys / Gateway Pool distro | `node tests\gateway-model-routing-service.test.js`, `node tests\gateway-pool-provider.test.js`, `node tests\gateway-status-projection.test.js`, `node tests\thread-message-create-service.test.js`, `node tests\startup-scripts.test.js`, production smoke: `/api/status?detail=1`, all low/owner-maintenance Gateway health ports, provider-tier status matrix, workspace-dedicated DeepSeek profile routing including Owner-only `deepseekgw99`, and process-environment evidence that target workers received the expected provider key without logging the raw key |
| Web Push | `node tests\web-push-delivery-service.test.js`, `node tests\push-api-routes.test.js`, `node tests\task-list-ui.test.js`, `node tests\same-window-navigation-harness.test.js` |
| Static client/UI shell | `node tests\task-list-ui.test.js`, `node tests\run-progress-ui-behavior.test.js`, `node tests\keyboard-viewport-ui.test.js`, `node tests\viewport-scroll-ui.test.js`, `node tests\same-window-navigation-harness.test.js`, `node tests\playwright-visual-smoke-harness.test.js`, `node scripts\playwright-visual-smoke.js` |
| Action Inbox | `node tests\action-inbox-service.test.js`, `node tests\action-inbox-api-routes.test.js`, `node tests\mobile-sqlite-store.test.js`, `node tests\app-action-inbox-ui.test.js`, `node tests\task-list-ui.test.js`, `node tests\web-push-delivery-service.test.js` |
| Embedded plugin host / Wardrobe, Codex, Finance, Email, Health, and Note plugin tabs | `node tests\hermes-plugin-authorization-service.test.js`, `node tests\hermes-plugin-service.test.js`, `node tests\hermes-plugin-notification-service.test.js`, `node tests\hermes-plugin-api-routes.test.js`, `node tests\app-embedded-plugin-ui.test.js`, `node tests\embedded-plugin-refresh-harness.test.js`, `node tests\app-action-inbox-ui.test.js`, `node tests\app-wardrobe-ui.test.js`, `node tests\wardrobe-plugin-navigation-ui.test.js`, `node tests\wardrobe-plugin-provisioning-service.test.js`, `node tests\macos-wardrobe-binding-production-smoke-harness.test.js`, `node scripts\macos-wardrobe-binding-production-smoke.js` on Mac production after Wardrobe binding repairs, `node tests\email-plugin-provisioning-service.test.js` when Email behavior changes, `node tests\health-plugin-provisioning-service.test.js` when Health behavior changes, `node tests\note-plugin-provisioning-service.test.js` when Note behavior changes, `node tests\mcp-tool-upgrade-closure-harness.test.js` and `node scripts\mcp-tool-upgrade-closure-smoke.js` when plugin MCP tools change, `node tests\task-list-ui.test.js`, `node tests\api-route-inventory.test.js`, `node tests\mobile-api-dispatcher.test.js`, `node tests\gateway-run-toolset-routing-service.test.js`, `node tests\gateway-run-start-service.test.js`, Android emulator PWA smoke from the home-screen Hermes icon for embedded-plugin changes. First-run plugin enablement must verify Owner and one non-Owner workspace cannot project `active` until workspace-local key/config, plugin-side bind/register, required Skill/MCP setup, and manifest/launch smoke pass. Plugin-manager projection must also prove Owner records can be persisted, Owner workspace-local key/config discovery is reflected as already enabled, and failed Owner provisioning remains a retryable diagnostic instead of reverting to a plain unopened button. |
| Plugin-bound application topics | Current frontend projection: `node tests\task-list-ui.test.js`, `node tests\app-embedded-plugin-ui.test.js`, `node tests\static-cache-version-harness.test.js`. Service/runtime phases: `node tests\plugin-capability-probe-service.test.js`, `node tests\plugin-capability-activation-service.test.js`, `node tests\gateway-run-start-service.test.js`, `node tests\gateway-run-instruction-service.test.js`, `node tests\plugin-topic-binding-service.test.js`, `node tests\plugin-topic-delivery-directory-service.test.js`, `node tests\plugin-topic-context-service.test.js`, `node tests\plugin-topic-api-routes.test.js`, `node tests\app-plugin-topics-ui.test.js`, plus `node tests\gateway-run-toolset-routing-service.test.js`, `node tests\context-assembly-service.test.js`, `node tests\directory-browser-api-routes.test.js`, and `node tests\architecture-refactor-boundary.test.js` when implementation touches services/routes/runtime. Frontend harness must cover direct app/capability launch from the fixed bottom capability Dock, the built-in Directory icon in that Dock, touch long-press/context quick-action menus including bounded move controls and `capabilityMenuGesture=touch-longpress`, frequent quick actions with bounded source badges, and the absence of mid-page plugin desktop icons. The root Topics page should keep daily app/capability launch in the fixed bottom Dock while the scrollable page body carries quick actions and Directory-bound topic collections. The same harness must cover the Directory capability with no generic mini-button stack, bottom Dock icons without nested framed panels, six visible Dock entries before horizontal scrolling, five-slot primary bottom navigation with Topics centered, default launch to Topics when no saved view exists, fixed `plugin:<pluginId>` topic ids, automatic `插件/<plugin title>` directory creation through the directory API, returning from that directory to the topic list, restoring topic-list scroll position after topic-detail back/right-swipe, clearing stale plugin view-mode classes before opening the topic detail so the message composer is visible, hiding the bottom navigation on ordinary plugin-topic secondary pages, preserving the three-item plugin-context bar inside plugin app/topic/directory context, and making plugin-context right-swipe/browser-back exit through the dedicated topic-root renderer without calling `openTaskList()`, `restoreTaskListThreadFromCache()`, or `loadSingleWindow()`. |
| Directory-bound topic collections | Planned: `node tests\directory-topic-binding-service.test.js`, `node tests\directory-topic-context-service.test.js`, `node tests\directory-topic-api-routes.test.js`, `node tests\directory-browser-api-routes.test.js`, `node tests\context-assembly-service.test.js`, and `node tests\task-list-ui.test.js`. Harness must cover multiple topics per directory, one default topic per directory, default-topic reassignment without deleting secondary topics, explicit open-directory/open-default-topic/open-topic-picker actions, workspace isolation, cleaned/selected/bounded directory context, and exclusion of fixed plugin topics from directory collections. Frontend harness must also prove the topic list can render its first frame before directory-topic aggregation runs, that directory collections are visually attached below the Capability Entry Hub quick-action area, that the directory header keeps the folder icon on the left with bound topic chips below, that background aggregation/API refresh preserves the user's current topic-list scroll position, that deferred directory-topic rendering waits while scroll/swipe gestures are active, and that task-list vertical pan is not captured by sidebar right-swipe handling, because directory route extraction may scan many existing messages on large accounts. |
| Directory/files/artifacts | `node tests\directory-browser-api-routes.test.js`, `node tests\directory-mutation-api-routes.test.js`, `node tests\directory-share-api-routes.test.js`, `node tests\file-artifact-api-routes.test.js`, `node tests\file-artifact-access-service.test.js`, `node tests\macos-directory-path-migration-repair.test.js` after Windows/WSL-to-Mac data migration |
| Skill permissions/details | `node tests\skill-detail-provider.test.js`, `node tests\skill-analysis-service.test.js`, `node tests\plugin-required-skill-preload-service.test.js`, `node tests\plugin-capability-activation-service.test.js`, `node tests\resource-api-routes.test.js`, `node tests\gateway-workspace-provisioning-service.test.js`, `node tests\startup-scripts.test.js`, `node tests\link-skill-profile-store.test.js`, `node tests\macos-production-profile-audit.test.js`, `node tests\task-list-ui.test.js` |
| Automation/Cron | `node tests\automation-api-routes.test.js`, `node tests\automation-provider.test.js`, `node tests\cron-bridge.test.js`, `node tests\cron-dispatcher-proxy-harness.test.js`, `node tests\local-automation-bridge-service.test.js`, `node tests\mobile-runtime-environment-service.test.js`, `node tests\startup-scripts.test.js`; production/NAS smoke must verify that `/api/automations?detail=summary&refresh=1` reads the configured canonical scheduler and does not silently report an empty SQLite mirror when official CRON has jobs |
| Weixin ingress/delivery | `node tests\weixin-api-routes.test.js`, `node tests\weixin-ingress-event-service.test.js`, `node tests\weixin-ingress-provider.test.js`, `node tests\weixin-outbound-delivery-service.test.js`, `node tests\weixin-runtime-composition-service.test.js`, `node tests\weixin-ingress-production-smoke-harness.test.js`; Mac production route workspace smoke: `node scripts\weixin-ingress-production-smoke.js --base http://127.0.0.1:8797 --ingress-key-file <file> --workspaces weixin_wuping,weixin_stephen,weixin_test_1 --json`. The production harness is a heartbeat route smoke: it uses `X-Hermes-Mobile-Ingress-Key`, proves `X-Hermes-Web-Key` is rejected for ingress, and must not print the key, raw key path, message text, contact lists, or Weixin histories. |
| Group chat | `node tests\single-window-group-chat-api-routes.test.js`, `node tests\group-chat-ui.test.js`, `node tests\group-chat-shared-attachment-service.test.js`, `node tests\web-push-delivery-service.test.js` |
| Runtime SQLite/state | `node tests\mobile-sqlite-store.test.js`, `node tests\runtime-state-repository.test.js`, `node tests\runtime-state-store-service.test.js`, `node tests\runtime-state-persistence-service.test.js`, `node tests\runtime-state-normalization-service.test.js` |
| Growth board/program/task | `node tests\learning-program-api-routes.test.js`, `node tests\learning-program-service.test.js`, `node tests\learning-program-publish-service.test.js`, `node tests\learning-program-repository.test.js`, `node tests\learning-growth-jit-task-service.test.js`, `node tests\learning-growth-service.test.js`, `node tests\learning-growth-board-projection-service.test.js`, `node tests\learning-growth-teaching-card-services.test.js`, `node tests\learning-growth-card-api-routes.test.js` |
| Growth submissions/evaluation queue | `node tests\learning-growth-submission-service.test.js`, `node tests\learning-growth-task-evaluation-service.test.js`, `node tests\learning-growth-task-interaction-state-service.test.js`, `node tests\learning-growth-task-feedback-service.test.js`; audio submission/reflection changes must also prove `learning_task_audio_blobs` persistence and authenticated playback with `node tests\learning-program-repository.test.js` and `node tests\learning-program-api-routes.test.js` |
| Growth mastery/evergreen | `node tests\learning-growth-mastery-profile-service.test.js`, `node tests\learning-growth-mastery-repository.test.js`, `node tests\learning-growth-next-card-strategy-service.test.js`, `node tests\learning-growth-sequence-service.test.js` |
| Growth frontend | `node tests\app-learning-growth-ui.test.js`, `node tests\app-learning-growth-task-ui.test.js`, `node tests\app-learning-program-ui.test.js`, `node tests\app-learning-native-growth-submission-controller.test.js`, `node tests\task-list-ui.test.js` |
| Learning rewards/coins | `node tests\learning-reward-settlement-service.test.js`, `node tests\learning-coin-service.test.js`, `node tests\learning-coin-api-routes.test.js` |
| Tongbao platform currency | v399 wallet foundation: `node tests\platform-currency-service.test.js`, `node tests\platform-currency-api-routes.test.js`, `node tests\workspace-api-routes.test.js`, `node tests\mobile-sqlite-store.test.js`, `node tests\api-route-inventory.test.js`, `node tests\task-list-ui.test.js`, and `node tests\architecture-refactor-boundary.test.js`; future exchange/spend/grant work must also add `node tests\platform-currency-exchange-service.test.js`, `node tests\learning-coin-service.test.js`, and `node tests\learning-coin-api-routes.test.js` |
| Public export/release | `node tests\public-export.test.js`, `node scripts\privacy-scan.js --all-files`, `npm.cmd run export:public` |

## Planned Growth Workflow Contract Gate

The workflow harness described in `docs\IMPLEMENTATION_NOTES\growth-learning-workflow-contract-harness.md` is the required next gate for non-trivial Growth card workflow work. Once implemented, Growth changes that touch submission, evaluation, reflection, queue recovery, reward settlement, or workflow projection should run:

- `node tests\learning-card-workflow-contract.test.js`
- `node tests\learning-card-workflow-recovery.test.js`
- `node tests\learning-card-workflow-reconciler.test.js`
- `node tests\learning-card-workflow-privacy.test.js`
- `node tests\app-learning-program-ui.test.js`
- `node tests\task-list-ui.test.js`

Until those harness tests exist, implementation agents must add the relevant scenario before claiming the workflow change is complete.

## Planned Growth Knowledge Graph Gate

The graph-guided planning docs in
`docs\IMPLEMENTATION_NOTES\growth-knowledge-graph-*.md` are the required
pre-coding gate for future graph-guided Growth card authoring. Current guard:

- `node tests\learning-growth-knowledge-graph-docs.test.js`

Once graph services are implemented, Growth changes that touch graph nodes,
domain packs, seed import, card graph bindings, or graph-guided card publishing
should run:

- `node tests\learning-graph-node-service.test.js`
- `node tests\learning-graph-import-service.test.js`
- `node tests\learning-graph-plan-service.test.js`
- `node tests\learning-card-graph-binding-service.test.js`
- `node tests\learning-growth-knowledge-graph-harness.test.js`
- the relevant Growth publish/JIT/projection/UI tests from the module table.

## Planned Reference / Memory Graph Gate

The cross-plugin Reference / Memory Graph design in
`docs\IMPLEMENTATION_NOTES\reference-memory-graph-v1.md` is the required
pre-coding gate for future Note links, plugin object references, event links,
cross-plugin backlinks, and graph-backed memory recall.

The detailed harness plan is:

- `docs\IMPLEMENTATION_NOTES\reference-memory-graph-harness-plan.md`

This work is strategic P1. It should not preempt active P0 closure for Mac
production stability, mobile visual/interaction stability, and MCP/schema
deployment harnesses. It still applies immediately as an architecture
constraint: new plugin and Note features must not introduce incompatible ad-hoc
reference formats.

Reference / Memory Graph changes are H1 because they cross plugin boundaries,
permissions, persistence, idempotency, Gateway/MCP tool exposure, and production
profile selection.

Once graph services are implemented, changes that touch reference nodes, object
refs, graph edges, Note links, backlinks, event grouping, permission trimming,
or plugin reference contracts should run:

- `node tests\reference-graph-repository.test.js`
- `node tests\reference-graph-service.test.js`
- `node tests\reference-graph-permission.test.js`
- `node tests\reference-graph-idempotency.test.js`
- `node tests\reference-graph-mcp-schema-harness.test.js`
- `node tests\note-reference-link-service.test.js`
- the relevant plugin reference contract tests for Finance, Wardrobe, People,
  Email, Note, Directory, or Growth.

The first production-grade harness must prove:

- Note can link to a Finance transaction and list backlinks;
- one event can connect Note, Finance, Wardrobe, and People references;
- permission-trimmed listing does not leak restricted plugin details;
- retries with the same idempotency key do not duplicate notes, objects, events,
  or edges;
- the selected Gateway profile exposes the graph and Note link MCP tools.

## Plugin Workspace Platform Contract Gate

The cross-workspace plugin platform contract in
`docs\PLATFORM_CONTRACTS\plugin-workspace-platform-contract.md`, the mobile UI
contract in `docs\PLATFORM_CONTRACTS\plugin-mobile-ui-visual-contract.md`, and
the rollout plan in
`docs\IMPLEMENTATION_NOTES\plugin-workspace-contract-rollout-plan.md` are the
required pre-work gate for standardizing plugin repositories.

This gate applies before changing plugin workspace docs, deployment scripts,
MCP schema upgrade flows, mobile visual harnesses, Reference Contract surfaces,
or Mac production access in Finance, Wardrobe, Note, People, Email, Directory,
Growth-adjacent plugin surfaces, or future plugins.

The gate must verify:

- plugin-local `docs\HOME_AI_PLATFORM_CONTRACT.md` or equivalent pointer exists;
- plugin-local facts are declared;
- shared Mac access follows `docs\RUNBOOKS\macos-production-access.md`;
- deployment command and production smoke are declared;
- MCP service and Gateway selected-profile schema closure are declared for MCP
  plugins;
- visual harness status is declared for embedded UI plugins;
- embedded UI changes follow the shared bottom-layout, safe-area, long-press,
  blank-surface, and evidence rules in the mobile UI contract;
- Reference Contract status is declared for structured fact plugins;
- docs contain no raw-looking secrets, tokens, cookies, access keys, or private
  long payloads.

Current checker commands:

- `node tests\plugin-workspace-platform-contract-check.test.js`
- `node scripts\plugin-workspace-platform-contract-check.js --json`
- optional Mac read-only production evidence:
  `node scripts\plugin-workspace-platform-contract-check.js --probe-mac --require-mac-ok --json`

This checker verifies the standard inserted plugin set, explicitly excludes
Codex Mobile Web when it is not part of the standard plugin rollout, validates
plugin-local `docs\HOME_AI_PLATFORM_CONTRACT.md` pointers and handoff adoption,
and performs read-only Mac source/launchd/manifest probes when requested.
Plugin MCP callable changes still require `node tests\mcp-tool-upgrade-closure-harness.test.js`
and the checked `scripts\mcp-tool-upgrade-closure-smoke.js` path. Embedded UI
changes still require visual/Appium evidence under the mobile UI contract.

## Production Verification Tiers

- Static-only change: sync static/test files, run syntax/focused UI tests in production app directory, smoke `/api/client-version`.
- Listener code change: check `/api/status?detail=1` first, backup, sync, run focused tests, listener-only restart, smoke status.
- Gateway plugin/profile/schema/startup change: backup, sync, run focused checks, restart Gateway Pool, smoke worker health. ChatGPT Image 2 plugin changes must also run `node tests\hermes-mobile-image-plugin.test.js` and a bounded direct low Gateway `chatgpt_image_edit` smoke.
- Data repair: backup data first, apply bounded repair, verify metadata/API results, avoid restart unless runtime memory could overwrite the repair.
