# Gateway Profile Template Materialization

Status: Phase 5 implemented in source and synced to local production.

Phase 1 adds:

- `scripts/verify-gateway-profile-template-sync.js`, a non-secret verifier for
  manifest/profile `config.yaml` capability drift.
- `scripts/start-low-gateways.sh` cache guard
  `profile_template_sync_current()`, which prevents a selected-profile start
  from skipping configure when already-generated same-template profiles expose
  different public capabilities.
- `tests/gateway-profile-template-sync.test.js` and startup-script harness
  coverage.

Phase 1 does not yet remove fixed `lowgw*` profile directories or add a new
  runtime status field for the materialized template key. Existing manifest
  slots are preserved.

Phase 2 adds:

- selected-profile low Gateway configure expansion by template peer group in
  `scripts/start-low-gateways.sh`;
- when a stopped slot such as `lowgw10` is started with configure required, the
  configure step materializes all generated profiles that share the same
  `workspaceId + securityLevel + provider` key, such as
  `lowgw1,lowgw2,lowgw3,lowgw4,lowgw10` for Owner low OpenAI/Codex;
- focused startup harness coverage that locks this behavior.

Phase 2 still preserves existing manifest slots and does not delete fixed
profile directories. The next step is to extract reusable template construction
logic so the config body itself is generated from a canonical builder instead
of embedded shell blocks.

Phase 3 adds:

- `scripts/build-gateway-profile-template.js`, a canonical non-secret template
  builder/query utility for manifest workers and materialized profile configs;
- builder output for selected template peer profiles, for example
  `lowgw10 -> lowgw1,lowgw2,lowgw3,lowgw4,lowgw10` on the maintained Owner low
  OpenAI/Codex production template;
- focused builder coverage in `tests/gateway-profile-template-builder.test.js`;
- an optional `start-low-gateways.sh` integration that uses the builder for
  peer expansion when Node is available in the WSL runtime, then falls back to
  the existing Python logic.

Phase 3 still does not migrate the shell-generated `config.yaml` bodies to a
JS generator. It defines and validates the canonical public capability shape so
the later YAML-generation migration can reuse one builder instead of
duplicating template peer and capability rules.

The maintained local Windows production sync for Phase 3 backed up the prior
script state under
`C:\ProgramData\HermesMobile\backups\20260603-gateway-profile-template-phase3-20260603-231631`
and verified the production builder output for `lowgw10` as
`lowgw1,lowgw2,lowgw3,lowgw4,lowgw10` with the same capability hash reported by
the verifier.

Phase 4 adds actual template YAML rendering:

- `scripts/build-gateway-profile-template.js` now supports
  `--render-config-yaml --config-kind <base|profile|grok|maintenance>` with repeated
  `--value key=value` inputs.
- `scripts/configure-low-gateways.sh` writes the base low-permission config,
  `lowgw*` / `deepseekgw*` profile configs, and `grokgw*` profile configs
  through the JS builder when Node is available.
- `scripts/start-low-gateways.sh` also uses the JS builder for selected-template
  peer expansion when Node is available.
- The maintained local WSL root runtime has no Linux `node`, but can call the
  Windows Node binary at `/mnt/c/Program Files/nodejs/node.exe`; the shell
  scripts convert builder/manifest paths with `wslpath` for that interop path.
- The original shell heredocs remain as a fallback if the builder script or Node
  is unavailable. Fallback preserves rollback and avoids breaking Gateway
  startup because of a tooling-path failure.

Phase 4 still preserves existing profile directories and manifest slots. It
does not remove shell-side workspace discovery, plugin copying, auth linking,
SQLite repair, or skill/memory symlink logic; those are materialization
surroundings, while the config YAML body is now builder-owned.

The maintained local Windows production sync for Phase 4 backed up the prior
script state under
`C:\ProgramData\HermesMobile\backups\20260603-gateway-profile-template-phase4-20260603-232840`.
Production validation confirmed:

- WSL can call the builder through Windows Node interop;
- configure-only rendered base, `lowgw1`, `lowgw2`, `lowgw3`, `lowgw4`,
  `lowgw10`, and `grokgw1` configs through the builder;
- the real `lowgw10 -ForceConfigure -NoStopExisting` start path rendered
  `lowgw1,lowgw2,lowgw3,lowgw4,lowgw10` through the builder;
- Owner low OpenAI/Codex profiles remained synchronized with capability hash
  `89b53f15d7138024`;
- final local production state returned to `lowgw1` warm and `lowgw10` stopped.

Phase 5 adds runtime status projection and scheduler reuse protection:

- `adapters/gateway-profile-template-identity-service.js` reads only public
  capability shape from materialized `config.yaml` files and projects
  `templateKey`, `capabilityHash`, `capabilityStatus`, and `toolSchemaEpoch`.
- Hybrid `/api/status?detail=1` Owner output can now distinguish current
  configured identity from the running process identity through
  `materializedTemplateKey` and `materializedCapabilityHash`.
- The elastic scheduler preserves a warm worker's materialized identity across
  health reconciliation and refuses to reuse it when the requested template key
  or current capability hash no longer matches.
- No raw `config.yaml` body, API key, MCP env value, workspace key, prompt, or
  model output is projected into status or scheduler events.

The maintained local Windows production sync for Phase 5 backed up the prior
runtime files under
`C:\ProgramData\HermesMobile\backups\20260604-gateway-template-runtime-identity-20260603-235923`.
Production validation confirmed:

- the listener restarted successfully through
  `app\scripts\start-worker-host.ps1 -ReplaceExisting`;
- `/api/public-config` identified the origin as Hermes Mobile;
- authenticated `/api/status?detail=1` projected non-secret template identity
  fields for workers;
- `lowgw1,lowgw2,lowgw3,lowgw4,lowgw10` remained synchronized for
  `owner|user|openai-codex` with capability hash `89b53f15d7138024`;
- no raw config body, manifest API key, or test secret marker appeared in the
  status projection.

Phase 6 completes the production high-permission profile coverage:

- `--config-kind maintenance` renders Owner maintenance configs for
  `officialclean*` and `deepseekmaint*`.
- ChatGPT Codex maintenance profiles are no longer a narrow
  `chatgpt_pro + hermes-cli` surface. They include the Owner low standard
  toolsets, Owner MCP bindings (`wardrobe`, `finance`, `note`), the standard
  Hermes Mobile plugins, `skills`, `chatgpt_pro`, and `hermes-cli`.
- DeepSeek maintenance stays provider-specific (`provider: deepseek`,
  `default: deepseek-chat`) while keeping the same high-permission public
  tool/schema surface.
- `scripts/start-gateway-pool.ps1` now writes both the WSL `HERMES_HOME`
  `config.yaml` and the telemetry profile mirror for Owner maintenance workers.
  It also links `officialclean*` and `deepseekmaint*` to
  `owner-full/skills`, instead of linking only DeepSeek maintenance profiles.
- Owner maintenance startup now installs the full maintenance plugin set into
  each maintenance profile, not only `hermes-mobile-chatgpt-pro`.

The maintained local Windows production sync for Phase 6 backed up the prior
runtime scripts under
`C:\ProgramData\HermesMobile\backups\20260604-maintenance-profile-complete-20260604-090144`.
Production validation confirmed:

- `officialclean1`, `officialclean2`, and `deepseekmaint1` configs were
  materialized in both telemetry profile roots and WSL profile homes;
- each maintenance profile had `config.yaml`, an `owner-full/skills` symlink,
  and 8 plugin directories;
- the production full verifier passed with 28 profiles, 19 template groups, and
  no issues;
- the production owner-maintenance start path started
  `officialclean1,officialclean2,deepseekmaint1` to healthy and then stopped
  them successfully;
- authenticated status on port `8797` returned `ok=true`, `health=ok`,
  `activeGlobal=0`, and `queueDepth=0` after cleanup.

## Problem

The current Gateway Pool treats each manifest profile, such as `lowgw1`,
`lowgw2`, and `lowgw10`, as both a schedulable worker slot and a durable
capability profile. That makes ordinary capacity expansion easy, but it also
allows profile-instance drift: two Owner low-permission OpenAI/Codex workers can
serve the same workspace and permission tier while exposing different
`toolsets`, MCP servers, or workspace plugin bindings.

That drift is unsafe when model-first toolset narrowing is disabled and Mobile
sends the full authorized toolset set. A run can fail even though another
sibling profile would have had the required tools.

## Target Model

Separate the concepts:

```text
Capability profile template = workspace + permission tier + provider + tool/MCP binding.
Gateway slot = reusable process/port/telemetry slot that materializes one template before startup.
```

The scheduler may keep the current hybrid policy:

- Owner low OpenAI/Codex can keep `minWarm=1` for current user experience.
- Additional compatible slots start on demand.
- Idle slots can stay reusable for a bounded TTL, for example 60 minutes.
- Owner maintenance/high-permission slots remain a separate tier.

The difference is that a new slot is not allowed to own an independent toolset
decision. Before startup, the slot must materialize the canonical template for
the requested `workspaceId + securityLevel + provider` into that slot's
`HERMES_HOME`.

## Template Keys

The canonical template key is:

```text
workspaceId | securityLevel | provider
```

Examples:

- `owner | user | openai-codex`
- `owner | owner-maintenance | openai-codex`
- `owner | user | deepseek`
- `weixin_wuping | user | openai-codex`

Grok/xAI remains provider-specific because its OAuth and routing are not
interchangeable with OpenAI/Codex. DeepSeek remains provider-specific because a
DeepSeek request must not be silently moved onto an OpenAI/Codex worker.

Within the same template key, the top-level `toolsets`,
`platform_toolsets.api_server`, plugin MCP registrations, Skill Store link, and
workspace plugin bindings must be identical. Differences between slots in the
same template key are runtime identity only: port, pid, telemetry DB path,
logs, and per-slot health/lifecycle state.

## Permission Boundary

Low-permission and high-permission templates must never collapse into one
template. A high-permission Owner maintenance template may expose developer,
source, terminal, bridge, or maintenance tools that ordinary user templates must
not expose.

The rule is:

- same workspace + same permission tier + same provider => same tool/schema set;
- different workspace => workspace-local MCP keys and roots may differ;
- different permission tier => tool/schema set may differ;
- different provider => model/provider config and available provider-specific
  tools may differ.

## Materialization Contract

When the scheduler chooses a slot, startup should:

1. Resolve the requested template key from routing hints.
2. Generate or load the canonical template for that key.
3. Write the slot-local `config.yaml` from the template.
4. Link/copy slot-local plugin directories required by the template.
5. Link the correct Skill Store and memory store for that workspace/tier.
6. Link the correct auth material for that provider and tier.
7. Start the Gateway process with `HERMES_HOME` pointing at the slot directory.
8. Poll `/health` until ready.
9. Verify the running worker exposes the expected toolset/schema epoch before
   assigning the user run when practical.

The materialization request/result files and logs may contain only profile
template ids, slot ids, status, and bounded diagnostics. They must not contain
raw API keys, workspace keys, OAuth tokens, plugin launch tokens, prompts,
model output, or full MCP config bodies.

## Scheduler Compatibility

The compatibility key should continue to include workspace, provider, permission
tier, toolset/schema set, MCP binding, and manifest identity. After
materialization, the profile/slot component represents the process identity,
while the template key represents capability identity.

A warm slot can be reused only when all are true:

- the slot's current materialized template key matches the requested template
  key;
- if a current configured capability hash is available, the slot's
  materialized capability hash matches that hash;
- the slot's observed toolsets/schema epoch still match that template.

If the slot is stopped or configured but not running, it can be rematerialized
to another compatible template in the same broad slot class only when doing so
does not cross the permission boundary. For example, a low-permission OpenAI
slot may be rematerialized from one user workspace low OpenAI template to
another low OpenAI template, but it must not become an Owner maintenance slot.

## Startup And Idle Policy

The existing hybrid scheduler remains the right operating model. Template
materialization should not require every request to cold-start a process.

Recommended initial policy for local production:

- Owner low OpenAI/Codex: `minWarm=1`, `maxWorkers=4`, idle TTL 60 minutes.
- Ordinary workspace OpenAI/Codex: `minWarm=0`, `maxWorkers=2`, idle TTL 60
  minutes.
- Owner maintenance: `minWarm=0`, `maxWorkers=2`, idle TTL 30-60 minutes.
- DeepSeek: provider-specific cold/on-demand policy remains separate.

The measured Windows local production cold-start evidence from 2026-06-03 was:

- stopped Owner low OpenAI/Codex `lowgw10` to `/health`: about 14.9 seconds;
- minimal streamed model request after health to first text delta: about 20.4
  seconds;
- full cold start to first text delta: about 35.3 seconds;
- stopping the temporary worker: about 1.6 seconds.

Those measurements justify keeping at least one Owner low warm worker for
current UX while still using on-demand slots for expansion.

## Validation And Guardrails

The verifier fails when two generated slots that claim the same template key
expose different capabilities. The script inspects non-secret data only:

- manifest worker metadata;
- slot `config.yaml` toolsets and provider/tier fields;
- MCP server names, not raw env values or keys;
- Skill/memory link targets as sanitized paths or workspace ids.

Required focused tests/harnesses:

- canonical template generation for Owner low OpenAI/Codex;
- separate template generation for Owner maintenance;
- per-workspace low template generation with workspace-local plugin MCP;
- no cross-tier slot reuse;
- warm reuse when template key matches;
- rematerialization of a stopped low slot to a compatible low template;
- failure when same-template slots drift in toolsets or MCP server names
  (`tests/gateway-profile-template-sync.test.js`);
- production smoke: cold start, health ready, first text delta, terminal
  release, idle stop, and `/api/status?detail=1` projection.

## Migration Plan

1. Add read-only profile-template validation against the current manifest and
   generated `config.yaml` files. Completed in Phase 1.
2. Introduce canonical template generation while still writing existing
   `lowgw*`, `deepseekgw*`, and `officialclean*` directories. Phase 2
   materialized same-template peer groups through the existing shell generator.
   Phase 3 added the dedicated builder/query utility. Phase 4 moved low Gateway
   YAML body rendering for base, low/deepseek, and Grok profiles into that
   builder while keeping shell fallback. Phase 6 added Owner maintenance
   high-permission rendering for `officialclean*` and `deepseekmaint*`.
3. Make startup materialize the selected template into a stopped slot before
   process launch. Completed for low Gateway same-template peer groups in Phase
   2 while preserving existing slot ids.
4. Record template key and schema epoch in status projection. Completed in
   Phase 5 for non-secret runtime projection.
5. Enforce same-template equality and fail closed on drift. Completed in Phase
   5 for warm-worker reuse; stopped-slot rematerialization remains constrained
   by the existing startup scripts and manifest slot classes.
6. Later, reduce durable profile maintenance to templates while keeping slots
   as process/port capacity.

Do not delete existing profile directories or renumber manifest workers during
the first implementation. Preserve rollback by allowing the start scripts to
fall back to the current fixed-profile generation path.
