# Plugin Workspace Contract Rollout Plan

Last updated: 2026-06-06.

## Purpose

This plan turns the Home AI plugin platform contract into an executable
cross-workspace rollout. It is the task plan for bringing Finance, Wardrobe,
Note, Email, People, Growth-adjacent plugin surfaces, Directory integrations,
and future plugins under one deployment, access, MCP, visual harness, and
Reference / Memory Graph contract.

Primary contract:

- `docs/PLATFORM_CONTRACTS/plugin-workspace-platform-contract.md`
- `docs/PLATFORM_CONTRACTS/plugin-mobile-ui-visual-contract.md`

Access runbook:

- `docs/RUNBOOKS/macos-production-access.md`

## Rollout Principles

- The Home AI main workspace owns the platform contract, shared access rules,
  deployment closure rules, and harness gates.
- Plugin workspaces own plugin-local facts, source code, local tests, local
  service health, plugin data, and plugin-specific MCP/API surfaces.
- Plugin workspaces must point to the center contract rather than copy it.
- Deployment and sudo access must remain platform-owned. Plugins may accept
  `--ssh-alias` and `--password-file`, but they must not define their own secret
  handling model.
- Harnesses must close the same layers that have failed historically:
  service schema, Gateway callable schema, selected profile, Mobile
  instruction/schema epoch, production data readback, and mobile visual
  behavior.
- The Reference / Memory Graph contract applies immediately to new plugin
  object references, even before V1 graph tables are implemented.

## Phase 0: Inventory

Goal:

- produce a current plugin workspace inventory without changing plugin code.

Collect for each plugin:

```text
plugin_id
workspace_path_windows
remote/branch/commit
production_source_path_macos
production_data_root_macos
service URL/port on Windows
service URL/port on Mac
launchd label or process identity
MCP command/wrapper
MCP schema endpoint
deployment command
local tests
production smokes
Reference Contract status
mobile visual harness status
known blockers
```

Suggested inventory output:

```text
docs/IMPLEMENTATION_NOTES/plugin-workspace-contract-rollout-status.md
```

Do not store raw credentials or private payloads in the inventory.

## Phase 1: Add Plugin Pointer Files

Goal:

- make every plugin workspace self-routing for future Codex sessions.

For each plugin workspace:

1. Read its existing `AGENTS.md`, `.agent-context/PROJECT_CONTEXT.md`, and
   `.agent-context/HANDOFF.md` if present.
2. Create or update:

```text
docs/HOME_AI_PLATFORM_CONTRACT.md
```

3. Add the central contract version:

```text
Home AI platform contract version: 20260606-v1
```

4. Add links or path references to:

```text
<Home-AI>/docs/PLATFORM_CONTRACTS/plugin-workspace-platform-contract.md
<Home-AI>/docs/PLATFORM_CONTRACTS/plugin-mobile-ui-visual-contract.md
<Home-AI>/docs/RUNBOOKS/macos-production-access.md
<Home-AI>/docs/RUNBOOKS/mcp-tool-upgrade-closure.md
<Home-AI>/docs/RUNBOOKS/macos-ios-simulator-appium.md
<Home-AI>/docs/IMPLEMENTATION_NOTES/reference-memory-graph-v1.md
```

5. Add plugin-local facts only.
6. Update plugin `.agent-context/HANDOFF.md`.

Acceptance:

- a future Codex thread starting in that plugin can discover Home AI platform
  rules without loading the Home AI conversation history;
- plugin docs contain no raw secrets, tokens, cookies, access keys, or long
  logs.
- the central checker passes:

```powershell
node scripts\plugin-workspace-platform-contract-check.js --json
```

## Phase 2: Normalize Deployment And Access

Goal:

- make every plugin deploy through the shared Mac access contract.

For each plugin with Mac deployment:

1. Ensure deployment command accepts or documents:

```text
--ssh-alias homeai-mac
--password-file <private-local-password-file>
--mac-root /Users/example/path
```

2. Ensure scripts use absolute Mac paths for privileged operations.
3. Ensure scripts do not depend on interactive shell startup files.
4. Ensure scripts do not print raw passwords, key contents, token contents, or
   private payloads.
5. Ensure production sync writes to the plugin's production source path under:

```text
/Users/example/path<plugin>
```

6. Ensure service restart and status checks are bounded and label-specific.

Acceptance:

- deployment can run from Windows through the shared SSH alias;
- sudo is stdin/password-file based or restricted-sudo based;
- production status reports include commit, PID/status, URL/port, and backup
  path where relevant;
- no per-plugin SSH tunnel or access secret is created.
- the read-only Mac probe passes when no deployment is being performed:

```powershell
node scripts\plugin-workspace-platform-contract-check.js --probe-mac --require-mac-ok --json
```

## Phase 3: MCP Tool Upgrade Closure

Goal:

- prevent repeat failures where a plugin service has a new tool but Gateway or
  Mobile cannot call it.

For each MCP plugin:

1. Add or verify service schema smoke.
2. Add or verify Gateway selected-profile schema smoke.
3. Add or verify Mobile instruction hint and schema epoch workflow when
   callables change.
4. Add or verify worker restart/cache refresh rule.
5. Add or verify one bounded live/readback smoke for the new callable.

Required reference:

- `docs/RUNBOOKS/mcp-tool-upgrade-closure.md`

Acceptance:

- service schema and Gateway callable schema both contain the expected callable;
- selected worker/profile evidence is bound to the same workspace profile used
  by real Mobile runs;
- output includes no raw keys, key file paths, private payloads, or raw prompts.

## Phase 4: Mobile Visual Harness Adoption

Goal:

- make embedded plugin UI and mobile-visible plugin entrypoints testable with
  visual evidence.

Required contract:

- `docs/PLATFORM_CONTRACTS/plugin-mobile-ui-visual-contract.md`

For each plugin with embedded UI:

1. Declare current visual harness status:

```text
none
playwright
appium-simulator
installed-pwa
```

2. Add the minimum smoke for its highest-risk mobile surface:

- plugin open/load;
- main content visible;
- bottom controls not overlapped;
- iframe/host sizing correct;
- back/return path works;
- no blank surface after navigation;
- viewport metrics and element bounds recorded.

3. If the plugin participates in iOS gestures, adopt the Mac Appium channel.
4. If standalone shell, keyboard, safe-area, service-worker, or install behavior
   is part of the risk, use installed-PWA or real-device evidence.

Acceptance:

- plugin UI change cannot be closed with only a desktop browser screenshot;
- artifact paths, viewport metrics, and bounded visual evidence are recorded;
- raw access keys, cookies, token contents, or verbose WebDriver request bodies
  are not logged.

## Phase 5: Reference Contract Adoption

Goal:

- make plugin objects linkable without making Note or the graph a fact store.

For each plugin that owns structured facts:

1. Declare supported object types.
2. Implement or plan the V1 reference methods:

```text
reference_object_types()
reference_get(object_type, object_id)
reference_summarize(object_type, object_id, purpose?)
```

3. Ensure object identity is stable:

```text
workspace_id + plugin_id + object_type + object_id
```

4. Add plugin-local tests for permission-checked `reference_get` and bounded
   `reference_summarize`.
5. Do not let Note or graph store full plugin objects.

Acceptance:

- object refs are stable and permission-checkable;
- summaries are bounded and suitable for Note/Graph display;
- unauthorized reads return controlled diagnostics;
- tests prove graph/Note layers do not need full fact copies.

## Phase 6: Production Closure Per Plugin

Goal:

- give each plugin a repeatable production closure checklist.

For each plugin after deployment:

```text
Windows commit and branch
Mac production commit/source state
service health/version
launchd label status or PID
Mac loopback URL/port
service schema
Gateway selected-profile schema when MCP changed
production data readback
mobile visual harness if UI changed
backup path when production data/code changed
known blockers
```

Acceptance:

- plugin deployment can be independently audited;
- Home AI production closure can compose plugin closure results;
- failures are classified by layer instead of becoming generic "plugin
  unavailable" reports.

## Recommended Execution Order

Order by current risk and platform dependence:

1. Finance
   - recent MCP attachment upgrade exposed schema/Gateway closure gaps.
2. Wardrobe
   - embedded UI, data migration, Reference Contract, and mobile topic flows are
     high-value and high-risk.
3. Note
   - required for non-structured memory and future graph links.
4. People
   - required for cross-plugin identity resolution and event links.
5. Email
   - permission-sensitive and should adopt bounded summaries before graph
     linking.
6. Directory integrations
   - file/artifact references and delivery-directory links need stable object
     refs.
7. Growth-related plugin surfaces
   - reuse graph-first discipline but keep Growth graph separate from global
     Reference / Memory Graph.

If a plugin is currently broken in production, fix its production health first,
then add the pointer and contract. Do not bury active production failures under
documentation-only work.

## Manual Checklist For Each Plugin

```text
[ ] Read plugin workspace context.
[ ] Confirm branch/commit/status.
[ ] Add/update docs/HOME_AI_PLATFORM_CONTRACT.md.
[ ] Record plugin-local facts.
[ ] Confirm deployment command uses shared Mac access contract.
[ ] Confirm local tests.
[ ] Confirm production smoke.
[ ] Confirm MCP closure path if MCP exists.
[ ] Confirm visual harness status if embedded UI exists.
[ ] Confirm Reference Contract status if structured facts exist.
[ ] Update plugin handoff.
[ ] Return bounded summary to Home AI handoff or rollout status doc.
```

## Future Automation

After the manual rollout proves the shape, add platform checkers:

```text
scripts/check-plugin-workspace-contract.js
scripts/check-plugin-mcp-contract.js
scripts/check-plugin-deploy-contract.js
scripts/check-plugin-visual-harness-contract.js
```

The checker should fail on:

- missing platform pointer;
- missing plugin-local facts;
- missing deploy command;
- missing local/production validation declarations;
- missing MCP schema closure for MCP plugins;
- missing visual harness status for embedded UI plugins;
- missing Reference Contract status for structured fact plugins;
- raw-looking secrets in docs.

Do not write the checker until the first manual pass through Finance, Wardrobe,
and Note confirms the fields are correct.
