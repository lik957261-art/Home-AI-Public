# Plugin Workspace Contract Rollout Status

Last updated: 2026-06-11.
Home AI platform contract version: `20260611-v3`.

## Scope

This status file tracks inserted Home AI plugin workspaces that need local
pointers to the central platform contract, including the Owner-critical Codex
Mobile Web special insertion.

Included in this pass:

- Finance
- Wardrobe
- Note
- Email
- Health
- Growth
- Codex Mobile Web, only for the Home AI embedded plugin variant registered as
  `codex-mobile`

Still excluded in this pass:

- Candidate or adjacent workspaces that are not currently standard inserted
  plugins for this pass.
- Independently deployed Codex Mobile Web instances that are not installed
  through the Home AI plugin manifest/proxy/launch-token boundary and do not
  deploy under the Home AI Mac production plugin root.

No production services, Gateway workers, plugin code, plugin data, secrets, or
credentials were changed by this rollout status update.

## Central Contract Sources

- `docs/PLATFORM_CONTRACTS/plugin-workspace-platform-contract.md`
- `docs/PLATFORM_CONTRACTS/plugin-mobile-ui-visual-contract.md`
- `docs/RUNBOOKS/macos-production-access.md`
- `docs/RUNBOOKS/mcp-tool-upgrade-closure.md`
- `docs/RUNBOOKS/macos-ios-simulator-appium.md`
- `docs/MODULES/ai-operations-control-plane.md`
- `docs/IMPLEMENTATION_NOTES/ai-operations-control-plane.md`
- `scripts/ai-ops-control-plane.js`
- `tests/ai-ops-control-plane-cli.test.js`
- `docs/IMPLEMENTATION_NOTES/reference-memory-graph-v1.md`
- `docs/IMPLEMENTATION_NOTES/reference-memory-graph-harness-plan.md`
- `scripts/ios-pwa-visual-harness.js`
- `tests/ios-pwa-visual-harness.test.js`

## Executable Checker

Local cross-workspace contract check:

```powershell
node scripts\plugin-workspace-platform-contract-check.js --json
```

Mac production read-only probe:

```powershell
node scripts\plugin-workspace-platform-contract-check.js --probe-mac --require-mac-ok --json
```

The checker is read-only. It does not accept passwords, Access Keys, cookies,
tokens, launch tokens, sudo input, or private payloads.

The checker also requires every included embedded plugin pointer to declare
`ios_visual_harness_command` with the checked Home AI visual harness command:

```powershell
npm run ios:pwa:visual -- --scenario embedded-plugin-shell --plugin-id <plugin-id> --debug-url http://127.0.0.1:19073/
```

For embedded keyboard/composer/input-obstruction changes, the checked command
adds the keyboard scenario and a real detail route when needed. Codex Mobile
side-chat input changes must use the side-chat target scenario rather than only
the main composer scenario:

```powershell
npm run ios:pwa:visual -- --scenario embedded-plugin-keyboard-composer --plugin-id <plugin-id> --plugin-thread-id <thread-id> --debug-url http://127.0.0.1:19073/
```

The checker now also requires `plugin_manifest_actions_status`. Standard
plugins should declare whether their manifest `actions` are available for the
Home AI Dock `常用` menu, plugin long-press/context menus, and search. Codex
Mobile Web is marked as a Home AI embedded special plugin and must not declare
ordinary user quick actions.

```powershell
npm run ios:pwa:visual -- --scenario embedded-plugin-side-chat-keyboard --plugin-id codex-mobile --plugin-thread-id <thread-id> --debug-url http://127.0.0.1:19073/
```

If the local Appium/Safari lane cannot surface the iOS software keyboard inside
an embedded iframe, the keyboard scenario injects the canonical
`hermes.plugin.viewport` keyboard payload and reports `keyboard.simulated=true`
so plugin layout response can still be gated with screenshot evidence.

The checker requires `dev_runtime_prerequisites` as a plugin-local fact. This
prevents environment failures from being misclassified as MCP/schema failures:
Note and Wardrobe must declare Python, Node-based service plugins must declare
Node/npm, Growth must declare Node/npm, and Codex Mobile must also declare
Codex CLI availability.

The checker requires every included plugin pointer to declare the AI Operations
Control Plane entrypoint and flow. Plugin threads must run control-plane
`intake` before H1/H2, deployment, MCP/schema, visual-debug, or cross-module
work, must use `required-checks` for changed files, must allocate a visual lane
before mutating Appium/Simulator actions, and must append bounded evidence
instead of relying on narrative handoff.

The shared visual toolchain correction is now part of the central contract.
Every plugin thread must use the Home AI live iOS PWA debug server, checked
visual harness, lane lease, and central Appium start script instead of
plugin-local Appium/Simulator scripts. Same-lane visual runs are serialized by
the default lock; `debug_lane_locked` requires a separate Simulator/debug
server; `--no-lock` is valid only on an isolated lane with unique UDID, WDA,
MJPEG, and live-debug ports. Toolchain errors such as `fetch failed`,
`appium_timeout`, `/contexts` timeout, `webview_context_missing`,
`Unexpected EOF`, and `socket hang up` must be classified by Appium, WDA, and
live-debug layer health before a plugin UI regression is filed.

The checker also enforces the standard inserted plugin runtime URL rule:
`windows_dev_base_url`, `macos_production_base_url`, and `manifest_url` must use
the plugin loopback port. Public, NAS, tailnet, or historical personal domains
are explicit external deployment overrides, not standard plugin defaults.

## Workspace Adoption Status

| Plugin | Workspace | Snapshot | Local pointer | Handoff pointer | Primary remaining product work |
| --- | --- | --- | --- | --- | --- |
| Finance | Windows Finance workspace | `codex/finance-mcp-design` at `d8d0a5b`; status clean before pointer | `docs/HOME_AI_PLATFORM_CONTRACT.md` added | Added | Business Reference Contract V1; `ios_visual_harness_command` required for embedded shell/layout changes; MCP upgrade closure remains mandatory for schema changes. |
| Wardrobe | Windows Wardrobe workspace | `codex/program-api-item-uploads` at `3bec104`; existing unrelated dirty tree | `docs/HOME_AI_PLATFORM_CONTRACT.md` added | Added | Business Reference Contract V1; `ios_visual_harness_command` required for embedded UI, long-press, menu, or bottom layout changes; Mac-local route regression checks. |
| Note | Windows Note workspace | `main` at `fb92356`; existing unrelated dirty tree | `docs/HOME_AI_PLATFORM_CONTRACT.md` added | Added | Note link tools; Reference / Memory Graph harness; `ios_visual_harness_command` required when preview, gesture, or PWA shell behavior changes. |
| Email | Windows Email workspace | `main` at `75a1ea0`; existing unrelated dirty tree | `docs/HOME_AI_PLATFORM_CONTRACT.md` added | Added | Business Reference Contract V1 for messages, threads, attachments, and accounts; exact deploy command stabilization; `ios_visual_harness_command` required for embedded UI or account switching changes. |
| Health | Windows Health workspace | `main` at `3495ae8`; existing unrelated dirty tree | `docs/HOME_AI_PLATFORM_CONTRACT.md` added | Added | Business Reference Contract V1; `ios_visual_harness_command` required for embedded UI or mobile navigation changes. |
| Growth | Mac Growth plugin workspace | New plugin workspace at `/Users/hermes-dev/HermesMobileDev/plugins/growth`; production deployment pending | `docs/HOME_AI_PLATFORM_CONTRACT.md` added | Added | Built-in Growth extraction is in progress. The plugin currently reads the Home AI `/api/growth/v1/*` facade, imports bounded snapshots with readback, delivers bounded events through the Home AI notification endpoint when configured, and exposes read-only MCP schemas plus execute. Production Mac probe is deferred until the service is installed. |
| Codex Mobile Web | Mac Codex Mobile plugin workspace | `main` at `bc82703` plus local Mac hotfix work when pointer was added | `docs/HOME_AI_PLATFORM_CONTRACT.md` added | Added | Owner-critical Home AI embedded plugin insertion only; not normal workspace-grantable plugin visibility and not a rule for independent Codex Mobile deployments. `ios_visual_harness_command` is required for embedded keyboard, gesture, cache, and PWA reproduction loops. |

## Mac Read-Only Probe Status

`node scripts\plugin-workspace-platform-contract-check.js --probe-mac --require-mac-ok --json`
passed for Finance, Wardrobe, Note, Email, and Health on 2026-06-06 through
`homeai-mac`. Codex Mobile Web passed on 2026-06-08 from the Mac development
host with `--ssh-alias local`. Growth is included in the local contract checker,
but its Mac source/launchd/manifest probe is deferred until the production
service is installed.

Verified facts:

| Plugin | Mac source | Launchd | Manifest | Notes |
| --- | --- | --- | --- | --- |
| Finance | `/Users/hermes-host/HermesMobile/plugins/finance` | `com.hermesmobile.plugin.finance` loaded | `http://127.0.0.1:8791/api/v1/hermes/plugin/manifest` returned HTTP 200 | `/api/finance/client-version` returned HTTP 200. `/api/finance/mcp/schemas` correctly requires workspace id/key without printing any key. |
| Wardrobe | `/Users/hermes-host/HermesMobile/plugins/wardrobe` | `com.hermesmobile.plugin.wardrobe` loaded | `http://127.0.0.1:8765/api/v1/hermes/plugin/manifest` returned HTTP 200 | No old NAS route is accepted as the source path in this checker. |
| Note | `/Users/hermes-host/HermesMobile/plugins/note` | `com.hermesmobile.plugin.note` loaded | `http://127.0.0.1:4181/api/v1/hermes/plugin/manifest` returned HTTP 200 | Data root observed under `/Users/hermes-host/HermesMobile/plugins/note/data`. |
| Email | `/Users/hermes-host/HermesMobile/plugins/email` | `com.hermesmobile.plugin.email` loaded | `http://127.0.0.1:5175/api/v1/hermes/plugin/manifest` returned HTTP 200 | Runtime/data root observed under `/Users/hermes-host/HermesMobile/plugins/email/runtime`. |
| Health | `/Users/hermes-host/HermesMobile/plugins/healthy` | `com.hermesmobile.plugin.health` loaded | `http://127.0.0.1:4877/api/v1/hermes/plugin/manifest` returned HTTP 200 | The source directory is `healthy`, not `health`; data root observed under `/Users/hermes-host/HermesMobile/plugins/healthy/data`. |
| Growth | `/Users/hermes-host/HermesMobile/plugins/growth` | `com.hermesmobile.plugin.growth` deferred | `http://127.0.0.1:4881/api/v1/hermes/plugin/manifest` deferred | Production service is not installed yet. Local contract/pointer checks are enforced; read-only Mac probe is intentionally skipped by the checker until deployment. |
| Codex Mobile Web | `/Users/hermes-host/HermesMobile/plugins/codex-mobile-web` | `com.hermesmobile.plugin.codex-mobile` loaded | `http://127.0.0.1:8787/api/v1/hermes/plugin/manifest` returned HTTP 200 | 2026-06-08 same-host probe used `--ssh-alias local` and also verified `/api/public-config`. |

## Closure State

The platform rollout has completed these closure items for the included
production plugin entries, with Growth included as a development-stage plugin
whose production Mac probe remains deferred:

1. plugin-local pointer files exist;
2. plugin-local required facts are declared;
3. plugin handoffs point to the contract;
4. central status inventory exists;
5. the executable local checker passes;
6. the read-only Mac source/launchd/manifest probe passes;
7. standard plugin runtime URL fields are loopback defaults;
8. Codex Mobile Web is included as an Owner-critical special insertion: it has
   a local pointer and live-debug contract, while remaining outside normal
   workspace-grantable business plugin visibility;
9. every included plugin pointer declares the AI Operations Control Plane
   `intake` command, required workflow, and evidence ledger path;
10. every included plugin pointer declares `ios_visual_harness_command` pointing
   to the checked Home AI `npm run ios:pwa:visual` harness;
11. every included plugin pointer declares `dev_runtime_prerequisites`, with
    Python declared for Python MCP wrappers such as Note.
12. the checked iOS visual harness serializes same-lane runs by default,
    requires the live server debug lane lease before driving the Simulator,
    supports isolated-lane `--no-lock`, and can assert loaded static client
    version plus non-empty screenshot artifacts.
13. central visual toolchain recovery and concurrency rules are now durable
    plugin rules: plugin threads consume the Home AI live-debug server,
    visual harness, lane lease, and central Appium start script, and must
    classify Appium/WDA/live-debug layer failures before treating a failure as
    plugin UI evidence.

These items are now gates, not one-off notes:

- Future plugin pointer or deployment fact changes must run
  `node scripts\plugin-workspace-platform-contract-check.js --json`.
- Future H1/H2, deployment, visual-debug, MCP/schema, plugin-provisioning, or
  cross-module plugin work must start with
  `node scripts\ai-ops-control-plane.js intake --task "<task>" --json` from
  the Home AI workspace and close with evidence ledger entries for the checks
  and production smokes that were actually run.
- Future standard plugin runtime defaults must keep the plugin source local to
  Hermes (`http://127.0.0.1:<port>`); browser-facing plugin entries must be
  generated by Hermes same-origin proxy logic, not by hardcoded domains.
- Future Mac production path/launchd/manifest changes must run
  `node scripts\plugin-workspace-platform-contract-check.js --probe-mac --require-mac-ok --json`.
- Future plugin MCP callable changes must run the checked MCP upgrade closure
  path in `docs/RUNBOOKS/mcp-tool-upgrade-closure.md`.
- Future DEV-side test failures must first verify the declared
  `dev_runtime_prerequisites`; for Note MCP, `python -m py_compile
  scripts/note_mcp_stdio.py` is an environment gate before classifying the
  failure as an MCP wrapper/protocol issue.
- Future embedded UI changes must produce the visual/Appium evidence required
  by `docs/PLATFORM_CONTRACTS/plugin-mobile-ui-visual-contract.md`, and must
  use `scripts/ios-pwa-visual-harness.js` when the issue can be represented by
  `directory-dark-status`, `embedded-plugin-shell`, or
  `embedded-plugin-keyboard-composer`; Codex Mobile side-chat keyboard issues
  use `embedded-plugin-side-chat-keyboard`.
- Business Reference Contract V1 implementation remains plugin-specific product
  work. This rollout makes the contract and harness gate enforceable; it does
  not add read/write reference methods to plugin business code.

## Secret Handling

The rollout records only paths, labels, command names, ports, and bounded
status. Do not add raw passwords, access keys, OAuth tokens, cookies, launch
tokens, workspace keys, private payloads, uploaded file bytes, or long logs to
this status file or any plugin pointer.
