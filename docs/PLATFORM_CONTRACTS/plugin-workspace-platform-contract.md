# Plugin Workspace Platform Contract

Contract version: `20260606-v1`.

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
- `docs/RUNBOOKS/macos-production-access.md`
- `docs/IMPLEMENTATION_NOTES/reference-memory-graph-v1.md`
- `docs/IMPLEMENTATION_NOTES/reference-memory-graph-harness-plan.md`
- `docs/RUNBOOKS/mcp-tool-upgrade-closure.md`
- `docs/RUNBOOKS/macos-ios-simulator-appium.md`
- `docs/MODULES/deployment.md`
- `docs/IMPLEMENTATION_NOTES/harness-required-matrix.md`
- `docs/TEST_MATRIX.md`

Plugin-local docs may add local port, path, command, and data-root facts, but
must not redefine the platform contract.

## Plugin-Local Pointer File

Each plugin workspace should contain a small platform pointer file, preferably:

```text
docs/HOME_AI_PLATFORM_CONTRACT.md
```

If a plugin does not have `docs/`, use the smallest local equivalent such as
`AGENTS.md` plus `.agent-context/PROJECT_CONTEXT.md`.

The pointer file must include:

```text
Home AI platform contract version: 20260606-v1

Canonical Home AI contract source:
- <path-to-Home-AI>/docs/PLATFORM_CONTRACTS/plugin-workspace-platform-contract.md
- <path-to-Home-AI>/docs/PLATFORM_CONTRACTS/plugin-mobile-ui-visual-contract.md
- <path-to-Home-AI>/docs/PLATFORM_CONTRACTS/macos-dev-to-production-deployment-contract.md
- <path-to-Home-AI>/docs/RUNBOOKS/macos-production-access.md
- <path-to-Home-AI>/docs/RUNBOOKS/mcp-tool-upgrade-closure.md
- <path-to-Home-AI>/docs/RUNBOOKS/macos-ios-simulator-appium.md
- <path-to-Home-AI>/docs/IMPLEMENTATION_NOTES/reference-memory-graph-v1.md

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
- iOS visual harness command
```

The pointer file must not contain raw passwords, access keys, OAuth tokens,
cookies, launch tokens, full private payloads, or long logs.

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
- plugin-local `docs/HOME_AI_PLATFORM_CONTRACT.md` files;
- central contract references;
- plugin-local required facts;
- plugin-local development runtime prerequisites, including Python for Python
  MCP wrappers and Node/npm for Node service plugins;
- `.agent-context/HANDOFF.md` pointer adoption;
- no raw-looking secrets in the pointer and central rollout docs;
- declared `ios_visual_harness_command` using the Home AI checked
  `npm run ios:pwa:visual` path;
- Mac source directories, launchd labels, and manifest endpoints when
  `--probe-mac` is used.

Codex Mobile Web remains special for Owner-only visibility and permission
policy. It is not a normal workspace-grantable business plugin, but it must
still declare its platform pointer, live iOS PWA debug availability, deployment
facts, bounded production validation path, and support for the host
`hermes.plugin.viewport.footer.safeAreaBottom` bottom-comfort signal when Home
AI bottom chrome is hidden.

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

Plugin code running inside an iframe must derive the Hermes host origin from
the current parent/window/referrer context for postMessage navigation state and
back-result events. It must not retain a stale configured Hermes domain for
right-swipe/back handling. A stale domain can make a thread/detail page report
the wrong back state and cause iOS right-swipe to exit the Hermes host instead
of returning to the plugin list.

External HTTPS plugin deployments are allowed only as explicit deployment
overrides. They must be documented as external entries, must pass frame-ancestor
and browser-facing HTTPS checks, and must not replace the standard inserted
plugin loopback defaults.

## Required Plugin Facts

Every production plugin must declare these facts in its local pointer or module
doc:

| Field | Required | Notes |
| --- | --- | --- |
| `plugin_id` | yes | Stable id used by Home AI and Reference Graph. |
| `workspace_path_windows` | yes | Local development checkout path. |
| `production_source_path_macos` | yes | Usually under `/Users/hermes-host/HermesMobile/plugins/<plugin>`. |
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
| `ios_live_debug_available` | if embedded UI | `yes` when the plugin can be debugged through the Home AI live iOS PWA server; otherwise `no` with a short reason. |
| `ios_visual_harness_command` | if embedded UI | Checked command using `npm run ios:pwa:visual` or `scripts/ios-pwa-visual-harness.js`; include `--scenario embedded-plugin-shell --plugin-id <plugin-id>` for plugin shell validation. Keyboard/composer changes must also declare or run `--scenario embedded-plugin-keyboard-composer --plugin-id <plugin-id>` with a real thread/route id when the input only exists on a detail page. Codex Mobile side-chat input changes must use `--scenario embedded-plugin-side-chat-keyboard --plugin-id codex-mobile --plugin-thread-id <thread-id>`. |

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
cd /Users/hermes-dev/HermesMobileDev/app
npm run --silent deploy:macos -- --plugin <plugin-id> --source /Users/hermes-dev/HermesMobileDev/plugins/<plugin-id> --json
```

Standard plugin execute command shape:

```bash
cd /Users/hermes-dev/HermesMobileDev/app
npm run --silent deploy:macos -- --plugin <plugin-id> --source /Users/hermes-dev/HermesMobileDev/plugins/<plugin-id> --restart-label <label> --health-url <url> --execute --password-file <private-local-password-file> --json
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
  cd /Users/hermes-dev/HermesMobileDev/app
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
  `8101`, and its live-debug server port. If Appium is down, restart it through
  the central script:

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
  lanes. The central Appium start script intentionally keeps the background
  Appium process alive across terminal Ctrl-C, preventing a half-online lane in
  which WDA still responds but Appium/WebView operations time out.

- Final bounded visual evidence should use the checked visual harness:

  ```bash
  cd /Users/hermes-dev/HermesMobileDev/app
  npm run ios:pwa:visual -- \
    --scenario embedded-plugin-shell \
    --plugin-id <plugin-id> \
    --debug-url http://127.0.0.1:19073/
  ```

  Keyboard/composer or input-obstruction changes use the checked keyboard
  scenario for the obstructed input surface:

  ```bash
  cd /Users/hermes-dev/HermesMobileDev/app
  npm run ios:pwa:visual -- \
    --scenario embedded-plugin-keyboard-composer \
    --plugin-id <plugin-id> \
    --plugin-thread-id <thread-id> \
    --debug-url http://127.0.0.1:19073/
  ```

  ```bash
  cd /Users/hermes-dev/HermesMobileDev/app
  npm run ios:pwa:visual -- \
    --scenario embedded-plugin-side-chat-keyboard \
    --plugin-id codex-mobile \
    --plugin-thread-id <thread-id> \
    --debug-url http://127.0.0.1:19073/
  ```

  For Codex Mobile, `<thread-id>` must be a real Codex thread so the harness
  validates the thread-detail composer rather than the primary thread list. The
  side-chat scenario uses the same thread requirement and validates the
  left-swipe side-chat textarea specifically. The scenarios record host
  keyboard metrics, iframe bounds, plugin keyboard viewport receipt, and
  input/composer clearance above the keyboard top. If the local Appium/Safari
  lane cannot display the iOS software keyboard for iframe controls, the
  harness injects the same
  `hermes.plugin.viewport` keyboard payload used by the host and marks
  `keyboard.simulated=true`; this remains a layout gate, while a real keyboard
  artifact can still be required for final installed-PWA/device acceptance.

  Use `--app-url http://127.0.0.1:18797/?source=pwa` when validating a local
  Home AI development server instead of production. Host-owned scenarios such
  as Directory dark loading use
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

## Required Future Platform Check

The eventual platform checker should verify each plugin workspace for:

- platform pointer file exists and names the contract version;
- plugin-local facts are present;
- deploy command exists;
- local tests are declared;
- production smoke is declared;
- MCP schema closure is declared when MCP exists;
- Reference Contract status is declared;
- mobile visual harness status is declared when embedded UI exists;
- iOS live debug availability is declared when embedded mobile UI exists;
- iOS visual harness command is declared and points to the checked Home AI
  visual harness;
- no raw-looking secret values are present in docs;
- `.agent-context` exists or is explicitly not needed.

Planned checker name:

```text
scripts/check-plugin-workspace-contract.js
```

Until that checker exists, reviewers must use this document as the manual
checklist.
