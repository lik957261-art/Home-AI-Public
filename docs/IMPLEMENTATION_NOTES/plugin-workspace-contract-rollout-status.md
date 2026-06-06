# Plugin Workspace Contract Rollout Status

Last updated: 2026-06-06.
Home AI platform contract version: `20260606-v1`.

## Scope

This status file tracks only standard inserted Home AI plugin workspaces that
need local pointers to the central platform contract.

Included in this pass:

- Finance
- Wardrobe
- Note
- Email
- Health

Excluded in this pass:

- Codex Mobile Web, by user instruction, because it is a special insertion and
  should not be treated as a standard plugin workspace for this rollout.
- Candidate or adjacent workspaces that are not currently standard inserted
  plugins for this pass.

No production services, Gateway workers, plugin code, plugin data, secrets, or
credentials were changed by this rollout status update.

## Central Contract Sources

- `docs/PLATFORM_CONTRACTS/plugin-workspace-platform-contract.md`
- `docs/PLATFORM_CONTRACTS/plugin-mobile-ui-visual-contract.md`
- `docs/RUNBOOKS/macos-production-access.md`
- `docs/RUNBOOKS/mcp-tool-upgrade-closure.md`
- `docs/RUNBOOKS/macos-ios-simulator-appium.md`
- `docs/IMPLEMENTATION_NOTES/reference-memory-graph-v1.md`
- `docs/IMPLEMENTATION_NOTES/reference-memory-graph-harness-plan.md`

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

## Workspace Adoption Status

| Plugin | Workspace | Snapshot | Local pointer | Handoff pointer | Primary remaining product work |
| --- | --- | --- | --- | --- | --- |
| Finance | Windows Finance workspace | `codex/finance-mcp-design` at `d8d0a5b`; status clean before pointer | `docs/HOME_AI_PLATFORM_CONTRACT.md` added | Added | Business Reference Contract V1; Appium embedded UI evidence when Finance embedded UI layout changes; MCP upgrade closure remains mandatory for schema changes. |
| Wardrobe | Windows Wardrobe workspace | `codex/program-api-item-uploads` at `3bec104`; existing unrelated dirty tree | `docs/HOME_AI_PLATFORM_CONTRACT.md` added | Added | Business Reference Contract V1; Appium/Simulator proof when embedded UI, long-press, menu, or bottom layout changes; Mac-local route regression checks. |
| Note | Windows Note workspace | `main` at `fb92356`; existing unrelated dirty tree | `docs/HOME_AI_PLATFORM_CONTRACT.md` added | Added | Note link tools; Reference / Memory Graph harness; Appium proof when preview, gesture, or PWA shell behavior changes. |
| Email | Windows Email workspace | `main` at `75a1ea0`; existing unrelated dirty tree | `docs/HOME_AI_PLATFORM_CONTRACT.md` added | Added | Business Reference Contract V1 for messages, threads, attachments, and accounts; exact deploy command stabilization; Appium proof when embedded UI or account switching changes. |
| Health | Windows Health workspace | `main` at `3495ae8`; existing unrelated dirty tree | `docs/HOME_AI_PLATFORM_CONTRACT.md` added | Added | Business Reference Contract V1; Appium proof when embedded UI or mobile navigation changes. |

## Mac Read-Only Probe Status

`node scripts\plugin-workspace-platform-contract-check.js --probe-mac --require-mac-ok --json`
passed on 2026-06-06 through `homeai-mac`.

Verified facts:

| Plugin | Mac source | Launchd | Manifest | Notes |
| --- | --- | --- | --- | --- |
| Finance | `/Users/hermes-host/HermesMobile/plugins/finance` | `com.hermesmobile.plugin.finance` loaded | `http://127.0.0.1:8791/api/v1/hermes/plugin/manifest` returned HTTP 200 | `/api/finance/client-version` returned HTTP 200. `/api/finance/mcp/schemas` correctly requires workspace id/key without printing any key. |
| Wardrobe | `/Users/hermes-host/HermesMobile/plugins/wardrobe` | `com.hermesmobile.plugin.wardrobe` loaded | `http://127.0.0.1:8765/api/v1/hermes/plugin/manifest` returned HTTP 200 | No old NAS route is accepted as the source path in this checker. |
| Note | `/Users/hermes-host/HermesMobile/plugins/note` | `com.hermesmobile.plugin.note` loaded | `http://127.0.0.1:4181/api/v1/hermes/plugin/manifest` returned HTTP 200 | Data root observed under `/Users/hermes-host/HermesMobile/plugins/note/data`. |
| Email | `/Users/hermes-host/HermesMobile/plugins/email` | `com.hermesmobile.plugin.email` loaded | `http://127.0.0.1:5175/api/v1/hermes/plugin/manifest` returned HTTP 200 | Runtime/data root observed under `/Users/hermes-host/HermesMobile/plugins/email/runtime`. |
| Health | `/Users/hermes-host/HermesMobile/plugins/healthy` | `com.hermesmobile.plugin.health` loaded | `http://127.0.0.1:4877/api/v1/hermes/plugin/manifest` returned HTTP 200 | The source directory is `healthy`, not `health`; data root observed under `/Users/hermes-host/HermesMobile/plugins/healthy/data`. |

## Closure State

The platform rollout has completed these closure items for the five included
plugins:

1. plugin-local pointer files exist;
2. plugin-local required facts are declared;
3. plugin handoffs point to the contract;
4. central status inventory exists;
5. the executable local checker passes;
6. the read-only Mac source/launchd/manifest probe passes;
7. Codex Mobile Web is explicitly excluded from this standard-plugin rollout.

These items are now gates, not one-off notes:

- Future plugin pointer or deployment fact changes must run
  `node scripts\plugin-workspace-platform-contract-check.js --json`.
- Future Mac production path/launchd/manifest changes must run
  `node scripts\plugin-workspace-platform-contract-check.js --probe-mac --require-mac-ok --json`.
- Future plugin MCP callable changes must run the checked MCP upgrade closure
  path in `docs/RUNBOOKS/mcp-tool-upgrade-closure.md`.
- Future embedded UI changes must produce the visual/Appium evidence required
  by `docs/PLATFORM_CONTRACTS/plugin-mobile-ui-visual-contract.md`.
- Business Reference Contract V1 implementation remains plugin-specific product
  work. This rollout makes the contract and harness gate enforceable; it does
  not add read/write reference methods to plugin business code.

## Secret Handling

The rollout records only paths, labels, command names, ports, and bounded
status. Do not add raw passwords, access keys, OAuth tokens, cookies, launch
tokens, workspace keys, private payloads, uploaded file bytes, or long logs to
this status file or any plugin pointer.
