# Plugin Workspace Platform Contract

Contract version: `20260626-v6`.

## Purpose

Home AI plugins are separate workspaces, but they must operate as one platform
when they are deployed, debugged, accessed through Gateway/MCP, validated on
mobile, and linked through Reference / Memory Graph.

This contract is the canonical platform-level rule set for plugin workspaces.
Plugin repositories should point to this document and keep only plugin-local
facts in their own docs. They should not copy the full contract into each
plugin, because copied contracts will drift.

## Canonical Contract Docs

Every plugin workspace must treat these Home AI docs as the canonical platform
contracts:

- `docs/PLATFORM_CONTRACTS/plugin-workspace-platform-contract.md`
- `docs/PLATFORM_CONTRACTS/plugin-mobile-ui-visual-contract.md`
- `docs/PLATFORM_CONTRACTS/macos-dev-to-production-deployment-contract.md`
- `docs/PLATFORM_CONTRACTS/github-shared-source-account-contract.md`
- `docs/PLATFORM_CONTRACTS/root-cause-architecture-contract.md`
- `docs/PLATFORM_CONTRACTS/fallback-governance-contract.md`
- `docs/PLATFORM_CONTRACTS/product-reality-audit-contract.md`
- `docs/IMPLEMENTATION_NOTES/fallback-registry.md`
- `docs/IMPLEMENTATION_NOTES/product-reality-audit-loop.md`
- `docs/RUNBOOKS/macos-production-access.md`
- `docs/RUNBOOKS/github-shared-source-account.md`
- `docs/IMPLEMENTATION_NOTES/reference-memory-graph-v1.md`
- `docs/IMPLEMENTATION_NOTES/reference-memory-graph-harness-plan.md`
- `docs/IMPLEMENTATION_NOTES/plugin-topic-directory-claims.md`
- `docs/RUNBOOKS/mcp-tool-upgrade-closure.md`
- `docs/RUNBOOKS/macos-ios-simulator-appium.md`
- `docs/MODULES/ai-operations-control-plane.md`
- `docs/IMPLEMENTATION_NOTES/ai-operations-control-plane.md`
- `docs/MODULES/deployment.md`
- `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`
- `docs/TEST_MATRIX.md`

Plugin-local docs may add local port, path, command, and data-root facts, but
must not redefine the platform contract.

## In-App Dialog Requirement

All Home AI host and plugin product UI must use in-app dialogs, sheets, toasts,
forms, or status rows instead of browser-native blocking dialogs. This applies
to embedded plugin iframes, plugin standalone pages, Home AI host pages, and
viewer pages.

Forbidden in product UI:

- `window.alert(...)` / `alert(...)`
- `window.confirm(...)` / `confirm(...)`
- `window.prompt(...)` / `prompt(...)`
- `beforeunload` or `onbeforeunload` confirmation prompts for ordinary app
  navigation

Plugins must not send task cards to Home AI just to replace local browser
dialogs when the replacement can be implemented inside the plugin workspace.
They should implement plugin-local in-app surfaces and validate them through
their normal UI/harness path. Home AI owns only the shared host dialog service,
the central contract, and host-owned plugin bridge prompts.

Allowed exception: browser install/permission flows such as
`BeforeInstallPromptEvent.prompt()` are permitted because they are platform
capability prompts, not application page dialogs.

The central executable check is `tests/no-browser-native-dialogs.test.js`.
By default it fails on Home AI runtime UI files. Local cross-workspace audits
can set `HOMEAI_SCAN_ADJACENT_PLUGIN_DIALOGS=1` to scan locally available
adjacent plugin source files; any plugin findings must be repaired in the
owning plugin thread/workspace. Plugin repositories should keep their local
pointer docs aligned with this contract and should add an equivalent local
check when they own standalone UI pages.

## Plugin-Local Pointer File

Each plugin workspace should contain a small platform pointer file, preferably:

```text
docs/HOME_AI_PLATFORM_CONTRACT.md
```

If a plugin does not have `docs/`, use the smallest local equivalent such as
`AGENTS.md` plus `.agent-context/PROJECT_CONTEXT.md`.

The pointer file must include:

```text
Home AI platform contract version: 20260626-v6

Canonical Home AI contract source:
- <path-to-Home-AI>/docs/PLATFORM_CONTRACTS/plugin-workspace-platform-contract.md
- <path-to-Home-AI>/docs/PLATFORM_CONTRACTS/plugin-mobile-ui-visual-contract.md
- <path-to-Home-AI>/docs/PLATFORM_CONTRACTS/macos-dev-to-production-deployment-contract.md
- <path-to-Home-AI>/docs/PLATFORM_CONTRACTS/github-shared-source-account-contract.md
- <path-to-Home-AI>/docs/PLATFORM_CONTRACTS/root-cause-architecture-contract.md
- <path-to-Home-AI>/docs/PLATFORM_CONTRACTS/fallback-governance-contract.md
- <path-to-Home-AI>/docs/PLATFORM_CONTRACTS/product-reality-audit-contract.md
- <path-to-Home-AI>/docs/IMPLEMENTATION_NOTES/fallback-registry.md
- <path-to-Home-AI>/docs/IMPLEMENTATION_NOTES/product-reality-audit-loop.md
- <path-to-Home-AI>/docs/RUNBOOKS/macos-production-access.md
- <path-to-Home-AI>/docs/RUNBOOKS/github-shared-source-account.md
- <path-to-Home-AI>/docs/RUNBOOKS/mcp-tool-upgrade-closure.md
- <path-to-Home-AI>/docs/RUNBOOKS/macos-ios-simulator-appium.md
- <path-to-Home-AI>/docs/MODULES/ai-operations-control-plane.md
- <path-to-Home-AI>/docs/IMPLEMENTATION_NOTES/ai-operations-control-plane.md
- <path-to-Home-AI>/docs/IMPLEMENTATION_NOTES/reference-memory-graph-v1.md
- <path-to-Home-AI>/docs/IMPLEMENTATION_NOTES/plugin-topic-directory-claims.md

Plugin-local facts:
- plugin id
- repository path
- production source path
- production data path
- Windows dev URL/port
- Mac production URL/port
- launchd label or Windows service/task/process identity
- development runtime prerequisites
- MCP server command
- MCP schema endpoint
- credential storage locations by reference only
- required deployment command
- required local tests
- required production smoke/harness commands
- Reference Contract status
- mobile visual harness status
- AI Operations Control Plane command
- AI Operations required flow
- AI Operations evidence ledger path
- iOS visual harness command
- plugin manifest actions status
- GitHub shared source account status
```

The pointer file must not contain raw passwords, access keys, OAuth tokens,
cookies, launch tokens, full private payloads, or long logs.

## GitHub Shared Source Account And Plugin Push

Plugin workspaces may push their own source changes to GitHub through the Home
AI GitHub Shared Source Account when the central key is registered with the
GitHub SSA identity and repository access has been verified. The canonical
contract is:

```text
docs/PLATFORM_CONTRACTS/github-shared-source-account-contract.md
```

The local helper is:

```bash
node /Users/example/path status --json
node /Users/example/path smoke --repo git@github.com-homeai-ssa:pentiumxp/<repo>.git --json
```

Plugins must not create per-plugin GitHub tokens, copy the shared private key
into their repo, or send task cards to Home AI just to push plugin-owned
commits. Home AI owns the shared credential contract and helper; each plugin
owns its own commit, local validation, and push after the shared identity is
available.

When a plugin has no configured source remote, the canonical private source
repository name is `HomeAI-<CanonicalPluginName>`, for example
`HomeAI-Music` or `HomeAI-Movie`. Home AI may create that missing private
repository after explicit operator/user approval, but the plugin thread still
owns binding `origin`, running checks, committing any pointer update, and
pushing its source through the `github.com-homeai-ssa` alias. Existing source
repositories are not renamed during routine SSA adoption.

Public installation manifests remain HTTPS-based and are not replaced by the
SSH alias. The GitHub SSA is a private local development and push path only.

## Platform Contract Checker

The Home AI main workspace provides an executable cross-workspace checker:

```powershell
node scripts\plugin-workspace-platform-contract-check.js --json
```

For Mac production read-only evidence:

```powershell
node scripts\plugin-workspace-platform-contract-check.js --probe-mac --require-mac-ok --json
```

The checker validates:

- the standard inserted plugin set plus the Owner-critical Codex Mobile Web
  special insertion: Finance, Wardrobe, Note, Email, Health, and Codex Mobile;
- managed native client targets such as `home-ai-native-ios` separately from
  embedded plugins;
- plugin-local `docs/HOME_AI_PLATFORM_CONTRACT.md` files;
- central contract references;
- plugin-local required facts;
- plugin-local development runtime prerequisites, including Python for Python
  MCP wrappers and Node/npm for Node service plugins;
- declared AI Operations Control Plane intake command, required flow, and
  evidence ledger path;
- `.agent-context/HANDOFF.md` pointer adoption;
- no raw-looking secrets in the pointer and central rollout docs;
- declared `ios_visual_harness_command` using the Home AI checked
  `npm run ios:pwa:visual` path;
- Mac source directories, launchd labels, and manifest endpoints when
  `--probe-mac` is used.

Home AI Native iOS Shell is a managed native client target, not an embedded
business plugin. It has `client_id=home-ai-native-ios`, lives in the Xcode
workspace `/Users/example/path AI`, and contributes Apple system bridges
such as the `WKWebView` shell, HealthKit sync, APNs device registration, native
voice input capture, system share/receive, and WebView recovery signals. Its
near-term roadmap is system push completion, native voice input, system
share/receive, and WebView stability. Apple Watch and Bluetooth/BLE bridges are
deferred extension points, not current platform obligations. It must declare the
central platform pointer and AI Operations flow, but it must not appear in
plugin Dock, plugin-topic, MCP, Gateway worker, workspace grant, LaunchDaemon,
or loopback manifest checks. The durable module doc is
`docs/MODULES/native-ios-shell.md`.
Standalone PWA behavior is the compatibility baseline: native-shell changes must
be opt-in through `nativeShell=ios` or a bounded native bridge capability
handshake, and the ordinary PWA/browser route must keep its existing UI,
navigation, composer, plugin, and permission behavior unless an independent PWA
requirement changes it.
APNs registration is governed by `docs/MODULES/native-notifications.md`: native
clients use `POST /api/native/devices/register` with `X-Hermes-Web-Key`, send
only device/app metadata plus the APNs token, and rely on Home AI to clamp
workspace access, protect token storage, and fan out on channel
`native_ios_apns`.
HealthKit sync is a workspace-private native bridge. Native clients and
same-origin plugin proxy callers must send the selected/effective workspace
explicitly when issuing Health write requests. Home AI may use Owner
authentication to authorize the operation, but it must not use Owner as the
Health data workspace unless the request explicitly targets Owner. Missing or
ambiguous Health write workspace context must fail closed before plugin key
injection or upstream proxying.

Codex Mobile Web remains special for Owner-only visibility and permission
policy. It is not a normal workspace-grantable business plugin, but it must
still declare its platform pointer, live iOS PWA debug availability, deployment
facts, bounded production validation path, and support for the host
`hermes.plugin.viewport.footer.safeAreaBottom` bottom-comfort signal when Home
AI bottom chrome is hidden.

This Codex Mobile Web rule applies only to the Home AI embedded plugin variant
registered as `codex-mobile` and deployed under the Home AI Mac production
plugin root. It does not govern independently deployed Codex Mobile Web
instances that are not installed through Home AI, do not use the Home AI plugin
manifest/proxy/launch-token boundary, and do not deploy under
`/Users/example/path`. Independent
deployments may keep their own deployment, debug, and validation workflow; they
must not be forced to use the Home AI AI Operations Control Plane, Mac deploy
script, or iOS visual lane allocator unless they explicitly opt into Home AI
embedded-plugin mode.

GitHub Actions normally checks out only the Home AI repository, not the private
adjacent plugin workspaces. In that single-repository CI environment, the
checked unit test verifies the central contract and the fixture-based plugin
pointer rules, and accepts a bounded `pointer_missing` report when all adjacent
plugin workspaces are absent. The real cross-workspace closure still requires
running the checker from the local multi-workspace root, or running the Mac
read-only production probe when production evidence is required.

The checker is read-only. It does not accept passwords, Access Keys, cookies,
tokens, launch tokens, sudo input, or private payloads. Protected plugin schema
endpoints that correctly require a workspace id/key are reported as
`authRequired=true`; tool-specific schema closure still belongs to
`docs/RUNBOOKS/mcp-tool-upgrade-closure.md`.

## Plugin-Owned Deployment Closure And Task Cards

Plugin workspaces own their own closure when all of the following are true:

- the code, tests, data model, UI, MCP schema, or runtime behavior being changed
  lives inside that plugin repository or its Home AI development mirror under
  `/Users/example/path<plugin-id>`;
- the production operation can be expressed as a normal central deploy-script
  call such as
  `cd /Users/example/path && npm run --silent deploy:macos -- --plugin <plugin-id> --reason <reason> --execute`;
- validation can be completed with plugin-owned evidence, such as local tests,
  the plugin health/version endpoint, Home AI embedded launch/proxy smoke, MCP
  schema smoke, plugin data readback, or a reversible plugin-owned product
  smoke;
- the work does not require editing Home AI host source, changing platform
  policy, changing shared deployment script behavior, repairing Home AI
  workspace provisioning/binding logic, or modifying Gateway worker/toolset
  selection rules.

In that case the plugin thread must finish the operation itself. The fact that
the central deploy script lives in the Home AI app workspace, or that the final
smoke opens the plugin through the Home AI embedded shell, does not make the
task Home-AI-owned. Sending a cross-thread task card to Home AI for that class
of work interrupts the host-app work queue and should be treated as a routing
error.

This is a hard routing boundary, not an optimization preference. A plugin that
has a working `deploy:macos -- --plugin <plugin-id>` plan/execute path must run
that path from its own closure loop. It must not send Home AI a "deploy this
plugin" task card as a substitute for continuing its own work. If Home AI
receives such a routine plugin deploy card, Home AI must return `redirected`
or `blocked` with the exact plugin-owned commands and must not deploy the
plugin merely because it has access to the shared script, sudo password file,
or embedded shell smoke.

Send a task card to the Home AI workspace only when the blocking work is
host/platform owned, including:

- Home AI source edits in `app/`, `server-routes/`, `adapters/`, `public/`, or
  shared docs/contracts;
- a missing or broken central deploy-script capability that a plugin cannot
  express through the existing `--plugin <plugin-id>` path;
- host-side plugin manifest normalization, same-origin proxy, launch-token,
  workspace binding, authorization, or provisioning bugs;
- Gateway callable schema, worker profile, toolset activation, or MCP routing
  bugs that require Home AI source or profile-generation changes;
- cross-plugin/shared policy decisions that affect more than one plugin;
- production access failures where the plugin has followed the central contract
  but cannot obtain the required bounded evidence without a Home AI owned
  permission or platform repair.

When a card is necessary, it must name the failure layer and include bounded
evidence plus an explicit `Return Card Required` section naming the source
thread and expected reply shape. It must not ask Home AI to redo plugin-local
diagnosis, re-run ordinary plugin tests, or perform a plugin deploy that the
plugin thread can complete by calling the central script itself.

Receiving a task card does not automatically make the requested work owned by
the receiving workspace. Home AI and plugin threads must triage every incoming
card before acting:

- if the request is plugin-local and the plugin can close it with the existing
  central deploy script, plugin tests, plugin health/version endpoint, embedded
  launch/proxy smoke, MCP schema smoke, data readback, or visual harness, the
  Home AI receiver must not do the work; it must send a return card with the
  exact plugin-owned steps and escalation conditions;
- if the request is Home AI/platform-owned, the Home AI receiver accepts the
  card, performs the bounded implementation, deploy, repair, or validation, and
  then sends a return card with source changes, checks, production evidence,
  and remaining follow-up;
- if a plugin receives a Home AI or peer-plugin card that belongs to another
  layer, the plugin must likewise return the card with the owning workspace,
  evidence gap, and correct contract path instead of applying a local fallback;
- if the ownership boundary is ambiguous, the receiver should first answer with
  the boundary question or evidence needed to classify the card, not begin a
  broad implementation.

Every accepted or rejected cross-thread card must receive a bounded reply. The
reply must avoid raw secrets, access keys, cookies, launch tokens, OAuth tokens,
private payloads, provider responses, and long logs. A completed-work reply must
include the exact layer fixed plus tests, harnesses, deployment, or production
smoke evidence sufficient for the source thread to close its user-facing task.
The reply requirement also applies to redirected, blocked, partially completed,
or deferred cards. Silent consumption is a contract violation because the source
thread may remain waiting with no closure evidence.

## Moira Workspace Binding

Moira follows the normal workspace-private plugin provisioning contract. Home AI
plugin-manager grants must create the effective workspace's own
`.hermes-moira/config.json` plus the configured basename-only key file, normally
`access-key.txt`, before marking the grant active. Existing manual bindings may
also be discovered, including a legacy basename such as `workspace-key.txt`, but
new provisioning writes `access-key.txt`.

Owner and `weixin_wuping` do not share a Moira binding. A non-Owner workspace
without its own `.hermes-moira` binding must see Moira as unavailable instead of
falling back to Owner's plugin key or Owner's records. The same rule applies to
the embedded plugin launch path and the Gateway MCP profile path.

The Moira plugin service also has its own launch/MCP authorization boundary.
Home AI provisioning writes granted workspaces to the plugin-side
`MOIRA_HERMES_ALLOWED_WORKSPACES_FILE`, normally
`plugins/moira/data/allowed-workspaces.txt`; the Moira service reloads that file
during launch/MCP authorization checks. Static
`MOIRA_HERMES_ALLOWED_WORKSPACES` remains a deployment seed, not the only grant
source. Home AI must not treat a local binding alone as proof that the Moira
service will accept a workspace at runtime unless the allowlist file or a future
dynamic host-verified authorizer also covers it.

## Same-Origin Proxy CSP Contract

Home AI owns the browser-facing CSP for same-origin plugin proxy HTML. A plugin
served through `/api/hermes-plugins/<plugin-id>/proxy/...` must not depend on
its upstream loopback CSP being visible to the browser after proxying.

The default proxy document CSP remains narrow: `default-src 'self'`,
`object-src 'none'`, same-origin `frame-ancestors`, same-origin/HTTPS frame and
network scopes, and inline styles/scripts only for existing embedded plugin
shell compatibility.

If a plugin needs browser WebAssembly compilation, the need must be declared in
the central plugin service runtime security configuration rather than patched
into the global Home AI app CSP. The proxy may then add
`'wasm-unsafe-eval'` and the WebKit compatibility fallback `'unsafe-eval'` to
that plugin's HTML `script-src` only. Moira declares this because its Web core
uses the vendored Swiss Ephemeris `sweph-wasm` runtime. New WASM plugins must
add the same declaration, route tests, plugin-local pointer note, and production
smoke/readback evidence before deployment.

## Host Voice Input Contract

Home AI owns global voice input for Home AI composer surfaces. Native Home AI
composers receive text through host draft APIs; this contract covers the
embedded plugin part of the same capability. The voice input surface is host
chrome, not a plugin iframe feature and not a system keyboard or input method.

Host responsibilities:

- request and hold browser microphone permission from the top-level Home AI
  origin;
- render the recording/transcription/editing overlay outside the plugin iframe;
- dispatch audio to a configured local ASR backend through Home AI services;
- apply and learn conservative personal correction rules under actor,
  effective-workspace, composer surface, optional plugin, and optional thread
  scope;
- insert the user-confirmed text through host draft APIs for native composers
  or through the plugin bridge protocol for embedded plugin composers;
- keep raw audio temporary by default and avoid storing full transcripts or
  private audio in docs, handoffs, logs, model prompts, or screenshots.

Plugin responsibilities:

- do not request microphone permission or run a plugin-local ASR stack for the
  shared Home AI voice input path;
- do not add separate plugin microphone controls for the shared path. The host
  may activate recording from a long press on the active composer send button;
- expose `voice_input.capability_state` for the currently active composer,
  including whether it is writable and which actions are supported;
- implement supported actions by updating plugin draft state, not by simulating
  keyboard events;
- acknowledge insertion with a bounded result event and report bounded errors;
- optionally emit `voice_input.commit_result` after a send succeeds so Home AI
  can compare the original ASR transcript with the final user-submitted text;
- never include raw access keys, launch tokens, cookies, plugin private data,
  local file paths, ASR backend paths, or raw audio in voice-input
  postMessage payloads.

Initial event names:

```text
voice_input.capability_query
voice_input.capability_state
voice_input.insert_text
voice_input.append_text
voice_input.replace_draft
voice_input.submit
voice_input.start_request
voice_input.stop_request
voice_input.cancel_request
voice_input.insert_result
voice_input.commit_result
voice_input.error
```

Every event must include a protocol version, plugin id, request id or voice
session id as applicable, and must pass the standard active-iframe origin
validation. The host must query capability shortly before injection; stale
capability state must not authorize replace or submit actions.

The ordinary Home AI chat composer is the first native host target. Codex
Mobile is the first embedded-plugin target for this bridge in Home AI
embedded-plugin mode only. Standalone Codex Mobile deployments are outside this
Home AI host-voice-input contract unless they explicitly opt in.
`voice_input.start_request`, `voice_input.stop_request`, and
`voice_input.cancel_request` are embedded-plugin-only requests for a plugin
composer send-button gesture to delegate recording to the Home AI host; they
must not be wired into standalone plugin launch paths by default.

## AI Operations Control Plane Contract

Every plugin Codex thread must use the Home AI AI Operations Control Plane as
the first operational gate for H1/H2, production deployment, visual debugging,
MCP/schema, plugin provisioning, or cross-module work.

Required entrypoint:

```bash
cd /Users/example/path
node scripts/ai-ops-control-plane.js intake --task "<task>" --json
```

For changed files, pass every known changed path:

```bash
node scripts/ai-ops-control-plane.js required-checks \
  --changed-file <path> \
  --json
```

Plugin threads must treat the control-plane output as the bounded startup
packet for the task:

- read the returned `requiredDocs` before editing;
- stay inside the returned `allowedBoundaries`, or explain the escalation;
- run the returned `requiredChecks`, or record why a check is not applicable;
- allocate a visual lane before Appium/Simulator/WebView mutating actions when
  `visualLane.required=true`;
- append focused test, visual, deployment, and production-smoke evidence before
  closing the task;
- create an incident cassette instead of copying raw logs into handoff when a
  bug crosses plugin, Gateway, visual toolchain, or production boundaries.

The plugin-local pointer must declare:

```text
ai_ops_control_plane_command
ai_ops_required_flow
ai_ops_evidence_ledger
```

The checker enforces those fields. Cross-thread cards may notify already-open
threads about this rule, but cards are transitional coordination only. The
durable enforcement path is this contract, each plugin pointer, and the
platform checker.

## Shared Visual Toolchain Contract

The Home AI live iOS PWA debug server, Appium starter, lane lease, visual
harness, and recovery rules are platform-owned shared tooling. Plugin
workspaces must consume the central tools instead of copying local Appium,
Simulator, screenshot, or WebView attach scripts. Toolchain fixes land in Home
AI first and become available to all plugins through this contract and the
plugin-local pointer.

Current shared toolchain correction: `20260610-visual-toolchain-shared-lane`.
This correction is global for Home AI-hosted plugin workspaces. It requires
all plugin threads to use the Home AI live-debug server, central Appium start
script, lane lease, visual harness lock, and recovery sequence documented
below. A plugin-local workaround is not considered durable until the same
behavior exists in the Home AI shared toolchain and is referenced by this
contract.

Central toolchain fixes are not plugin-local patches. When the live debug
server, visual harness, Appium starter, lane lease, or recovery behavior is
fixed, the change must be made in the Home AI workspace, validated there, and
recorded in this central contract or the linked visual contract. Plugin
workspaces then consume the corrected command through their pointer file and
the platform checker. A plugin must not close a visual-debug incident by
copying an older fixed command, vendoring a local Appium wrapper, changing
lane-lock behavior, or adding plugin-specific Simulator recovery steps unless
Home AI has first promoted that behavior into the shared toolchain.

Required plugin behavior:

- run AI Operations `intake` before visual-debug work and use the returned lane
  instruction as the first boundary;
- use `npm run ios:pwa:debug` from the Home AI workspace for interactive iOS
  PWA visual loops;
- use `npm run ios:pwa:visual` from the Home AI workspace for final bounded
  evidence when the issue has a supported scenario;
- never drive another plugin thread's active Simulator lane;
- treat `debug_lane_locked` as a hard stop for that lane and allocate a
  different Simulator/debug server before continuing;
- keep same-lane `ios:pwa:visual` runs serialized by the default lock;
- use `--no-lock` only on an isolated lane with its own Simulator UDID,
  live-debug port, WDA port, and MJPEG port;
- start or repair Appium only through
  `$HOME/.homeai-qa/scripts/macos-ios-appium-start.sh`;
- do not start foreground `appium server` processes from plugin workspaces for
  shared lanes;
- diagnose `fetch failed`, `appium_timeout`, `/contexts` timeout,
  `webview_context_missing`, `Unexpected EOF`, and `socket hang up` as
  toolchain-layer failures until Appium, WDA, and the live-debug server have
  passed the checks in `docs/RUNBOOKS/macos-ios-simulator-appium.md`;
- record only bounded evidence: scenario, lane/debug URL, client version,
  artifact path, key metrics, and pass/fail result. Do not record raw Access
  Keys, cookies, launch tokens, localStorage dumps, private plugin payloads, or
  full logs.
- if a plugin thread discovers a repeatable toolchain issue, file it against
  the Home AI shared toolchain and reference the affected central script,
  scenario, lane, and bounded failure metadata. The durable fix belongs in Home
  AI and this contract; the plugin thread may only keep a temporary workaround
  when it is clearly labeled and removed after the central fix lands.

Concurrent plugin debugging is allowed only through separate lanes. Each active
lane must have a unique Simulator UDID, live-debug `--port`,
`--wda-local-port`, and `--mjpeg-server-port`. The shared default lane is
`http://127.0.0.1:19073/`; plugin threads may observe it only when no other
thread owns the lease and must stop immediately when the lease reports another
owner.

Plugin-local pointer files must declare the checked visual harness command, but
they must not paste private lane state or duplicate the recovery procedure. The
canonical recovery sequence remains in
`docs/PLATFORM_CONTRACTS/plugin-mobile-ui-visual-contract.md` and
`docs/RUNBOOKS/macos-ios-simulator-appium.md`.

Minimum plugin pointer fields for visual-toolchain availability:

```text
ios_live_debug_available: yes | no
ios_visual_harness_command: cd /Users/example/path && npm run ios:pwa:visual -- --scenario embedded-plugin-shell --plugin-id <plugin-id> --debug-url http://127.0.0.1:19073/
visual_toolchain_contract: 20260610-visual-toolchain-shared-lane
visual_toolchain_owner: Home AI platform
```

`ios_live_debug_available: no` is allowed only when the plugin is not an
embedded mobile UI or when a concrete missing prerequisite is documented. It is
not a reason to use plugin-local Appium, Simulator, screenshot, WebView attach,
or lane-lock code.

## Runtime URL And Same-Origin Entry Contract

Standard same-host plugins must not hardcode a public, NAS, tailnet, or
machine-specific domain as their default Home AI runtime entry. Their
plugin-local pointer fields must use loopback defaults:

- `windows_dev_base_url`: `http://127.0.0.1:<plugin-port>`
- `macos_production_base_url`: `http://127.0.0.1:<plugin-port>`
- `manifest_url`: `http://127.0.0.1:<plugin-port>/api/v1/hermes/plugin/manifest`

Hermes Mobile owns the browser-facing embedded entry. When the plugin is a
local or LAN HTTP service, the phone/PWA iframe must receive a Hermes
same-origin proxy path under
`/api/hermes-plugins/<plugin-id>/proxy/...`, not the upstream plugin URL. The
plugin may return relative paths or absolute URLs in its manifest and launch
response, but if Hermes fetched that manifest from a local/private source, the
runtime must resolve the entry back through the same local manifest source
before handing it to the HTTPS/PWA client.

Proxy paths are already plugin-scoped by `<plugin-id>` and plugins must not
invent alternate browser-facing proxy roots. If a plugin needs extra resource
rewriting, Home AI must add it as a central plugin proxy profile or a
plugin-id-scoped extension under the same prefix, with route tests proving that
the new rule affects only the intended plugin. Plugin workspaces may report a
missing proxy rule with bounded evidence, but they must not patch shared proxy
rewrites for another plugin or ask for a broad regex change that rewrites all
plugin traffic. Common rewrite rules remain the default profile; exceptions
such as Codex Mobile upload/generated-image routes, Finance APIs, Wardrobe
photo routes, or Note attachment routes must stay explicitly named and covered
by tests.

Plugin code running inside an iframe must derive the Hermes host origin from
the current parent/window/referrer context for postMessage navigation state and
back-result events. It must not retain a stale configured Hermes domain for
right-swipe/back handling. A stale domain can make a thread/detail page report
the wrong back state and cause iOS right-swipe to exit the Hermes host instead
of returning to the plugin list.

Embedded plugin iframes allow user-initiated popups so provider OAuth and
external account-link flows can open outside the sandbox. The host sandbox must
include `allow-popups allow-popups-to-escape-sandbox` together with the normal
script/form/download/modal permissions. Plugins must still use explicit
owner-clicked links, `noopener`/`noreferrer`, and bounded callback URLs; they
must not use background popups or unrestricted top-level replacement for
third-party login.

When a same-origin plugin proxy receives an upstream `302`, the host may rewrite
only redirects that resolve to the configured plugin upstream origin. External
OAuth/provider `Location` values must be returned unchanged. Rewriting
`https://login.<provider>/...` into
`/api/hermes-plugins/<plugin-id>/proxy/...` traps the browser in the plugin
proxy and breaks account linking.

External HTTPS plugin deployments are allowed only as explicit deployment
overrides. They must be documented as external entries, must pass frame-ancestor
and browser-facing HTTPS checks, and must not replace the standard inserted
plugin loopback defaults.

## Plugin Manifest Actions Contract

Plugin quick actions are declarative plugin entrypoints. They are not MCP
tools, host-owned forms, or duplicated plugin business workflows.

Each plugin manifest may expose:

```json
{
  "actions": [
    {
      "id": "record",
      "label": "记一笔",
      "description": "Open the quick transaction screen.",
      "entry": {
        "type": "plugin_route",
        "pluginRoute": "record"
      },
      "placement": ["plugin_drawer_frequent", "dock_long_press", "search"],
      "priority": 10
    }
  ]
}
```

Required rules:

- `id` must be stable within the plugin and must not include secrets,
  user-specific ids, local paths, or raw payloads.
- `entry.type=plugin_route` means the host opens the plugin iframe and passes
  `pluginActionId=<id>` plus `pluginRoute=<pluginRoute>` through launch route
  state. The plugin owns the final in-app screen, form, or conversation.
- Every host wrapper must apply the normalized route state to the final iframe
  entry URL. This includes plugin-specific wrappers such as Wardrobe; computing a
  route-aware URL and then rendering the raw manifest URL is a contract failure.
- The host validates effective-workspace plugin authorization before launch and
  records `pluginId:actionId` usage through `/api/plugin-topic-usage`.
- `placement` controls where the host may show the action:
  `plugin_drawer_frequent`, `dock_long_press`, and `search` are current
  production placements. `capability_hub` is accepted only as a compatibility
  alias for older clients and should not be used in new plugin docs.
- Home AI renders the Dock `常用` popup and plugin long-press/context popups
  from the same normalized action projection. Loaded plugin manifest actions
  override host fallback actions for the current workspace; fallback actions
  exist only so first paint remains usable before manifest refresh completes.
- Ordinary quick actions must not be represented as MCP schemas. MCP remains
  for Home AI / Gateway tool execution inside AI runs; quick actions are direct
  app navigation shortcuts.
- Codex plugin edition is special. It should not declare ordinary user quick
  actions and should not appear in normal Topics-root plugin conversations.
- Directory is built in but follows the same action projection model for
  launcher/search consistency.
- Any host or plugin change that touches quick-action manifests, Dock `常用`,
  plugin long-press menus, pinned plugin tabs, or plugin action routing must
  run the Home AI `plugin-drawer-action-gestures` visual harness on the iOS PWA
  lane. The harness uses native tap, native long-press, and native horizontal
  swipe through the live debug server, then asserts that the selected action
  launches the plugin with `pluginActionId` and `pluginRoute` route state.

## Required Plugin Facts

Every production plugin must declare these facts in its local pointer or module
doc:

| Field | Required | Notes |
| --- | --- | --- |
| `plugin_id` | yes | Stable id used by Home AI and Reference Graph. |
| `workspace_path_windows` | yes | Local development checkout path. |
| `production_source_path_macos` | yes | Usually under `/Users/example/path<plugin>`. |
| `production_data_root_macos` | yes | Data root and worker-local config roots. |
| `windows_dev_base_url` | if service plugin | Local dev service URL. |
| `macos_production_base_url` | if service plugin | Mac loopback production URL. |
| `launchd_label` | if Mac service | `system/<label>` or label string. |
| `dev_runtime_prerequisites` | yes | Required local interpreters/tools for DEV checks. Python MCP plugins must name `python` or `python3`; Node plugins must name Node/npm. |
| `mcp_command` | if MCP plugin | Command or wrapper used by Gateway. |
| `mcp_schema_endpoint` | if MCP plugin | Local schema endpoint or schema probe command. |
| `credential_locations` | if credentials exist | File paths or config keys only, never secret values. |
| `deploy_command` | yes | Must call the central Home AI deploy script from `docs/PLATFORM_CONTRACTS/macos-dev-to-production-deployment-contract.md`. |
| `local_validation_commands` | yes | Focused syntax/unit/service tests. |
| `production_validation_commands` | yes | Health, version, schema, Gateway, and data smoke. |
| `reference_contract_status` | yes | `none`, `planned`, `v1-minimal`, or `implemented`. |
| `mobile_visual_harness_status` | if embedded UI | `none`, `playwright`, `appium-simulator`, or `installed-pwa`. |
| `ai_ops_control_plane_command` | yes | Must call the Home AI `scripts/ai-ops-control-plane.js intake --task "<task>" --json` entrypoint from `/Users/example/path`. |
| `ai_ops_required_flow` | yes | Must include `intake`, `required-checks`, `lane allocate if visual`, `evidence append`, `production smoke`, and `handoff`. |
| `ai_ops_evidence_ledger` | yes | Local append-only JSONL evidence path, normally under `$HOME/.homeai-qa/`, with no raw secrets or private payloads. |
| `ios_live_debug_available` | if embedded UI | `yes` when the plugin can be debugged through the Home AI live iOS PWA server; otherwise `no` with a short reason. |
| `ios_visual_harness_command` | if embedded UI | Checked command using `npm run ios:pwa:visual` or `scripts/ios-pwa-visual-harness.js`; include `--scenario embedded-plugin-shell --plugin-id <plugin-id>` for plugin shell validation. Keyboard/composer changes must also declare or run `--scenario embedded-plugin-keyboard-composer --plugin-id <plugin-id>` with a real thread/route id when the input only exists on a detail page. Codex Mobile side-chat input changes must use `--scenario embedded-plugin-side-chat-keyboard --plugin-id codex-mobile --plugin-thread-id <thread-id>`. |

## Frontend Build Boundary

Home AI's existing primary PWA shell is not a candidate for a one-shot Vite
migration. The current `public/index.html`, `public/service-worker.js`,
`public/styles.css`, and ordered `public/app-*.js` runtime remain the stable
host for chat, Composer, event streaming, plugin iframe hosting, service-worker
refresh, PWA install behavior, and the iOS native shell bridge until a separate
architecture migration is explicitly approved.

New independent frontend capabilities should use a Vite-built island by
default when they are not tightly coupled to the existing shell boot order. This
includes new standalone panels, training tools, admin/debug pages, isolated
settings surfaces, and plugin-owned embedded UIs. A Vite island must:

- keep business/runtime integration through Home AI APIs or a documented plugin
  bridge instead of reaching into unrelated global shell state;
- emit built assets into a deterministic static path that can be referenced
  from `public/` or the plugin service entry;
- remain compatible with the existing Home AI static deployment model,
  including `?v=<client-version>` or fingerprinted asset URLs where applicable;
- update `public/index.html`, `public/service-worker.js`,
  `public/directory-viewer.html`, and `tests/task-list-ui.test.js` whenever a
  Home AI static client-version bump is required;
- provide focused local validation for the Vite build plus the relevant Home AI
  harness, such as `node tests/static-cache-version-harness.test.js`,
  `node tests/task-list-ui.test.js`, and mobile/iOS visual harnesses when the
  feature is visible in the app shell;
- keep PWA-only behavior unchanged when native-shell markers or plugin bridge
  handshakes are absent.

Existing shell modules may be refactored toward ES-module-compatible boundaries
incrementally, but they must not be bundled into a Vite app merely to reduce
file count. Any migration of chat, Composer, event streaming, plugin host,
service-worker registration, or global navigation requires a dedicated
implementation note, rollback plan, cache-version plan, and visual/mobile
harness evidence before deployment.

## Required Native Client Facts

Every Home AI native client target must declare these facts in its local
pointer or module doc:

| Field | Required | Notes |
| --- | --- | --- |
| `client_id` | yes | Stable native client id, for example `home-ai-native-ios`. |
| `repository_path_macos` | yes | Local native workspace checkout path. |
| `xcode_project` | if Apple client | Xcode project file. |
| `main_bundle_id` | if Apple app | Main app bundle id. |
| `share_extension_bundle_id` | if share extension exists | Extension bundle id. |
| `app_group` | if shared container exists | App Group id only; no credentials. |
| `home_ai_origin_policy` | yes | Must state HTTPS-only Home AI origin usage and no LAN/local plugin HTTP access. |
| `auth_transport` | yes | Home AI browser/API Access Key transport, currently `X-Hermes-Web-Key`. |
| `default_workspace_id` | yes | Default selected Home AI workspace, normally `owner`. |
| `native_shell_query` | yes | Native shell marker such as `nativeShell=ios`. Native-specific behavior must be disabled when this marker or an equivalent bridge handshake is absent. |
| `native_capabilities` | yes | Bounded capability ids such as `pwa_webview_shell`, `apple_health_sync`, `apns_device_registration`, `ios_share_extension`, `native_voice_input_overlay`, `system_share_receive`, `apns_interaction_completion`, and `webview_recovery_bridge`. Apple Watch and Bluetooth/BLE ids should not be declared as active or near-term capabilities unless a future contract reopens them. |
| `platform_management_status` | yes | `managed_native_client` when the target is checked by the Home AI platform checker. |
| `ai_ops_control_plane_command` | yes | Same Home AI `scripts/ai-ops-control-plane.js intake --task "<task>" --json` entrypoint used by plugin workspaces. |
| `ai_ops_required_flow` | yes | Must include `intake`, `required-checks`, `lane allocate if visual`, `evidence append`, `production smoke`, and `handoff`. |
| `ai_ops_evidence_ledger` | yes | Local append-only JSONL evidence path, normally under `$HOME/.homeai-qa/`, with no raw secrets or private payloads. |
| `local_validation_command` | yes | Focused native build/test command, such as `xcodebuild ... build`. |

## Access And Privilege Boundary

Plugins must not independently decide how to obtain SSH or sudo access.

Rules:

- SSH and sudo procedures are owned by
  `docs/RUNBOOKS/macos-production-access.md`.
- Plugin deployment scripts may accept a `--password-file`, `--ssh-alias`, or
  environment variable, but they must not print the password, print key
  contents, echo shell commands that contain secrets, or persist raw secrets in
  logs.
- The shared Windows SSH aliases are platform facts, not plugin-specific facts.
- The shared Mac production access channel is reusable by all plugin
  workspaces.
- Future state should prefer SSH keys plus restricted sudoers rules over
  repeated broad password sudo.
- Until restricted sudoers exists, sudo must be passed through stdin-only or an
  approved secure wrapper and must be used only for bounded production
  operations.

## Deployment Contract

Mac production deployment is centralized in:

```text
<path-to-Home-AI>/docs/PLATFORM_CONTRACTS/macos-dev-to-production-deployment-contract.md
```

Plugin threads must read that file before production deploys. A plugin may keep
local facts such as its launchd label, health URL, schema command, and data
readback command, but it must not replace the central deploy path with a
plugin-private sudo/rsync flow.

Standard plugin deploy plan command:

```bash
cd /Users/example/path
npm run --silent deploy:macos -- --plugin <plugin-id> --source /Users/example/path<plugin-id> --json
```

Standard plugin execute command shape:

```bash
cd /Users/example/path
npm run --silent deploy:macos -- --plugin <plugin-id> --source /Users/example/path<plugin-id> --restart-label <label> --health-url <url> --execute --password-file <private-local-password-file> --json
```

The password file path is an operator-local secret reference. Plugin docs may
name the argument or environment variable, but must not store the password or
copy the password file into a plugin repository.

Plugin deployment must verify all layers that can fail independently:

1. local source state;
2. plugin service syntax/unit tests;
3. Windows development service health when applicable;
4. Mac production source sync;
5. launchd service status or process status;
6. Mac loopback health/version endpoint;
7. plugin-local MCP schema endpoint;
8. Gateway selected-profile callable schema when an MCP tool changed;
9. Home AI conversation boundary or toolset hint/epoch when model-callable
   tools changed;
10. production data/readback smoke for the changed feature;
11. backup path when production data or code is replaced;
12. bounded failure classification if any layer fails.

The deployment is not closed until the selected production profile and selected
worker are proven. Registration logs and service-local schemas are diagnostic
only; they are not enough for Gateway/MCP closure.

On macOS production, a workspace plugin grant writes the canonical binding under
the Home AI data drive, for example
`data/drive/users/<workspaceId>/.hermes-<plugin>`. Gateway worker profiles read
from the per-user worker root instead. Before a plugin MCP can be declared
available for a selected profile, the restricted Home AI workspace provisioning
executor must mirror each complete binding into
`/Users/<hm-user>/HermesWorkspace/.hermes-<plugin>` with private ownership and
must render the Gateway profile from that worker-local mirror. A plugin thread
must not claim Gateway/MCP closure from a manifest, service-local schema, or
data-drive binding alone.

The worker-side MCP implementation files must also exist under the Gateway
worker root before profile rendering. When a plugin wrapper imports local
modules, the whole required file set must be materialized, not only the wrapper
entrypoint. After rendering, the Gateway manifest's `toolsets`, `mcpServers`,
and `configPath` must match the rendered profile capabilities. A selected
Gateway worker whose manifest omits the plugin toolset is not closed, even if
its `config.yaml` happens to contain `mcp_servers.<plugin>`.

## MCP Tool Upgrade Contract

Any plugin that adds, renames, removes, or changes an MCP callable must follow:

- `docs/RUNBOOKS/mcp-tool-upgrade-closure.md`

Minimum closure:

- plugin service schema exposes the local tool;
- Gateway callable schema exposes the `mcp_<server>_<tool>` name;
- Mobile instruction hints and schema epoch are updated when the callable set
  changes;
- existing workers are restarted or proven to have refreshed callable schema;
- a live or production-like selected profile can see the tool;
- outputs contain bounded schema/tool names only, not raw credentials or user
  payloads.

Cross-workspace ownership boundary:

- The plugin workspace owns plugin service schema, plugin-local MCP wrapper
  behavior, plugin-local manifest `mcp.required_tools`, and plugin-local
  production deployment.
- The Home AI workspace owns Mobile instruction hints, `GATEWAY_TOOL_SCHEMA_EPOCH`,
  Gateway selected-profile callable schema closure, worker restart/refresh,
  and Home AI production deployment.
- A plugin Codex thread must not inspect, edit, patch, test, deploy, or commit
  Home AI source files unless that thread is explicitly running in the Home AI
  workspace. This includes `adapters/gateway-run-instruction-service.js`,
  `mobile-server-runtime.js`, Gateway profile generation code, central tests,
  and central docs.
- If a plugin MCP schema changes and the plugin thread cannot mutate Home AI,
  it must either run the read-only service/source part of
  `scripts/mcp-tool-upgrade-closure-smoke.js` from the Home AI workspace when
  that workspace is available, or send a Codex Mobile cross-thread task card to
  the Home AI app thread using the template in
  `docs/RUNBOOKS/mcp-tool-upgrade-closure.md`.
- The task card is the handoff boundary. It must include bounded evidence:
  plugin id/toolset, service schema URL, local tool names, expected
  `mcp_<server>_<tool>` callable names, proposed schema epoch, selected
  Gateway profile if known, and exact service-only validation results. It must
  not include raw plugin keys, cookies, OAuth tokens, launch tokens, private
  catalog rows, or long logs.
- The Home AI target thread must complete the central half: update instruction
  hints and epoch, run focused source tests, run service schema closure, prove
  the selected Gateway worker exposes the callable names, restart or refresh
  stale workers if needed, deploy Home AI if production behavior changes, and
  update Home AI handoff/docs.

## Reference Object Contract

Plugins that expose objects to cross-plugin memory must follow:

- `docs/IMPLEMENTATION_NOTES/reference-memory-graph-v1.md`
- `docs/IMPLEMENTATION_NOTES/reference-memory-graph-harness-plan.md`

Minimum V1 methods:

```text
reference_object_types()
reference_get(object_type, object_id)
reference_summarize(object_type, object_id, purpose?)
```

Object identity must be stable:

```text
workspace_id + plugin_id + object_type + object_id
```

The graph and Note layers may store bounded display snapshots, but full details
remain owned by the source plugin and must be resolved through that plugin's
permission-checked API/MCP surface.

## Mobile Visual Harness Contract

Embedded UI plugins and Home AI surfaces that change mobile layout must provide
visual evidence. The required level depends on the surface:

- static browser-mode Playwright evidence is diagnostic only;
- mobile viewport Playwright evidence is acceptable for early layout checks;
- Mac iOS Simulator Appium evidence is required for iOS gesture or Simulator
  reproduction work;
- installed-PWA or real-device evidence is required when standalone shell,
  safe-area, keyboard, service-worker, or browser/PWA differences are material.
- On Mac, high-frequency iOS PWA/plugin visual debugging should start with the
  Home AI live debug server:

  ```bash
  cd /Users/example/path
  npm run ios:pwa:debug
  ```

  Default local UI: `http://127.0.0.1:19073/`.
  This tool provides a fast Simulator screenshot loop plus native actions, and
  can enable WDA MJPEG stream mode with
  `--stream wda-mjpeg --mjpeg-server-port <port>` for the fastest visual loop.
  It uses Appium/WebView state only when available. Plugin teams should use it
  to reproduce and iterate, then record bounded final smoke artifacts.

  Concurrent plugin debugging must allocate one Simulator per active plugin
  lane. Do not point multiple live-debug servers at the same Simulator UDID.
  Each lane needs a unique live-debug `--port`, Simulator `--udid`, WDA
  `--wda-local-port`, and MJPEG `--mjpeg-server-port`; native actions and
  WebView deep state remain serialized within that lane. The live server also
  enforces a debug lane lease: callers must acquire `/api/lease` before
  mutating actions or WebView/Appium deep reads, and `debug_lane_locked` means
  the current plugin thread must stop and allocate its own lane.

  Visual toolchain failures must be diagnosed by layer before they are treated
  as plugin UI failures. `appium_timeout`, `/contexts` timeout,
  `webview_context_missing`, `Unexpected EOF`, `socket hang up`, and live-debug
  `fetch failed` mean the plugin thread must first check Appium `4723`, WDA
  `8101`, and its live-debug server port. The preferred bounded check is:

  ```bash
  npm run ios:pwa:visual -- --debug-url http://127.0.0.1:19073/ --preflight-only --json
  ```

  If this reports `failureLayer=appium`, restart Appium through the central
  script:

  ```bash
  bash "$HOME/.homeai-qa/scripts/macos-ios-appium-start.sh"
  ```

  If the live-debug port is down, restart `npm run ios:pwa:debug` for that
  lane. If Appium and WDA are up but WebView attach still times out, reset the
  live-debug Appium session once with `/api/action` using `type=connect` and
  `resetSession=true`. Restart WDA or the Simulator only after those layer
  checks fail. Killing and reopening the PWA is not sufficient when the
  Appium/WebKit remote-debugging layer is partially stuck.

  Plugin teams must not start foreground `appium server` processes for shared
  lanes. The central Appium start script intentionally runs Appium through a
  per-user LaunchAgent, replaces stale lane jobs, uses session override
  behavior, and rejects transient startup where `/status` responds once but the
  process exits before a second check. This prevents a half-online lane in
  which WDA still responds but Appium/WebView operations time out. If the
  central script is updated, plugin teams must consume that script instead of
  copying an older Appium command.

- Final bounded visual evidence should use the checked visual harness:

  ```bash
  cd /Users/example/path
  npm run ios:pwa:visual -- \
    --scenario embedded-plugin-shell \
    --plugin-id <plugin-id> \
    --debug-url http://127.0.0.1:19073/
  ```

  Keyboard/composer or input-obstruction changes use the checked keyboard
  scenario for the obstructed input surface:

  ```bash
  cd /Users/example/path
  npm run ios:pwa:visual -- \
    --scenario embedded-plugin-keyboard-composer \
    --plugin-id <plugin-id> \
    [--plugin-thread-id <thread-or-route-id>] \
    --debug-url http://127.0.0.1:19073/
  ```

  ```bash
  cd /Users/example/path
  npm run ios:pwa:visual -- \
    --scenario embedded-plugin-side-chat-keyboard \
    --plugin-id codex-mobile \
    --plugin-thread-id <thread-id> \
    --debug-url http://127.0.0.1:19073/
  ```

  Quick-action and plugin Dock gesture changes use the checked native gesture
  scenario. `--plugin-id` and `--plugin-action-id` are optional; when omitted,
  the harness validates `finance:record`, which is the canonical ordinary
  `plugin_route` sample. The scenario converts WebView DOM bounds to native
  Appium touch coordinates through the shared live debug server; plugin
  workspaces must not keep plugin-local tap offset scripts for this gate:

  ```bash
  cd /Users/example/path
  npm run ios:pwa:visual -- \
    --scenario plugin-drawer-action-gestures \
    --plugin-id finance \
    --plugin-action-id record \
    --debug-url http://127.0.0.1:19073/
  ```

  Use `--plugin-thread-id` only when the target input exists on a detail route.
  For Codex Mobile, `<thread-id>` must be a real Codex thread so the harness
  validates the thread-detail composer rather than the primary thread list. The
  side-chat scenario uses the same thread requirement and validates the
  left-swipe side-chat textarea specifically. The scenarios record host
  keyboard metrics, iframe bounds, plugin keyboard viewport receipt, and
  input/composer clearance above the keyboard top. If the local Appium/Safari
  lane cannot display the iOS software keyboard for iframe controls, the
  harness injects the same `hermes.plugin.viewport` keyboard payload used by
  the host for any plugin that implements `handleHermesPluginViewportMessage`
  and marks `keyboard.simulated=true`; this remains a layout gate, while a real
  keyboard artifact can still be required for final installed-PWA/device
  acceptance.

  When validating a local Home AI development server from the iOS Simulator,
  do not assume `127.0.0.1:<home-ai-port>` points to the Mac host. Start Home
  AI with a non-loopback bind, then pass the Mac LAN URL to the harness:

  ```bash
  HERMES_WEB_HOST=0.0.0.0 npm start

  npm run ios:pwa:visual -- \
    --app-url http://<mac-lan-ip>:18797/?source=pwa \
    --scenario embedded-plugin-shell \
    --plugin-id <plugin-id> \
    --debug-url http://127.0.0.1:19073/
  ```

  Plugin services may remain loopback-bound when Home AI reaches them
  server-side through the plugin manifest/proxy. Do not expose plugin service
  ports to the LAN only to satisfy Simulator visual checks.

  Harness recovery may treat a navigation-time WebKit `Unexpected EOF` as a
  recoverable disconnect after the navigation was accepted. In that case the
  harness should retry or reopen deep state through the live server before
  failing the plugin. For embedded plugin shell checks, the harness may reuse
  an already-open shell, skip unrelated bottom-nav pre-sampling, and use a
  segmented measurement fallback after recoverable WebKit errors; the final
  artifact must still include shell/frame bounds, overflow checks, client
  version, and screenshot evidence.

  Host-owned scenarios such as Directory dark loading use
  `--scenario directory-dark-status`. The harness implementation is
  `scripts/ios-pwa-visual-harness.js` and its source contract is
  `tests/ios-pwa-visual-harness.test.js`.

  The harness locks by `--debug-url` under `$HOME/.homeai-qa/locks` by default.
  It also acquires the live server debug lane lease before driving the
  Simulator. Plugin teams may run visual harnesses concurrently only when they
  use distinct live-debug lanes: unique `--debug-url` / live-debug `--port`,
  Simulator `--udid`, WDA port, and MJPEG port. `--no-lock` is valid only for
  an isolated lane and disables only the filesystem lock, not the server lease.
  Runs against the same lane must remain serialized because screenshots,
  WebView JavaScript, native gestures, and deep-state reads share one
  Appium/XCUITest session.

Use:

- `docs/PLATFORM_CONTRACTS/plugin-mobile-ui-visual-contract.md`
- `docs/RUNBOOKS/macos-ios-simulator-appium.md`
- `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`
- `docs/TEST_MATRIX.md`

Visual harness output must include bounded artifacts, screenshot paths, viewport
metrics, element bounds, and pass/fail summaries. It must not include raw keys,
cookies, token contents, full private text, or verbose WebDriver request bodies.
When static assets changed, the command should include
`--expected-client-version <version>` so the evidence proves the loaded PWA is
the intended client build. The default screenshot artifact assertion should
remain enabled through `--min-screenshot-bytes`.

## Workspace Context Contract

Every plugin workspace that is expected to be operated by Codex must have or
initialize:

```text
.agent-context/PROJECT_CONTEXT.md
.agent-context/HANDOFF.md
AGENTS.md or equivalent workspace instructions
```

If missing, initialize context with the platform initialization script from the
Home AI workspace and then add plugin-local facts only.

Handoff updates must record:

- current branch/commit;
- current deployment target;
- changed files;
- validation commands and bounded results;
- production backup paths;
- unresolved blockers;
- no raw secrets or long logs.

## Required Platform Check

The platform checker verifies each plugin workspace or managed native client
workspace for:

- platform pointer file exists and names the contract version;
- plugin-local or native-client-local facts are present;
- deploy command exists;
- local tests are declared;
- production smoke is declared;
- MCP schema closure is declared when MCP exists;
- Reference Contract status is declared;
- mobile visual harness status is declared when embedded UI exists;
- AI Operations Control Plane command, required flow, and evidence ledger are
  declared;
- iOS live debug availability is declared when embedded mobile UI exists;
- iOS visual harness command is declared and points to the checked Home AI
  visual harness;
- no raw-looking secret values are present in docs;
- `.agent-context` exists or is explicitly not needed.

Checker:

```text
scripts/plugin-workspace-platform-contract-check.js
```
