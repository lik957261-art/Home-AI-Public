# Gateway Profile Replica Pools

Status: design, harness, runtime scheduler migration, launch metadata, and
manifest replica metadata backfill are enabled. Legacy launch script aliases
remain compatible.

## Problem

The historical Gateway manifest uses names such as `lowgw1`, `lowgw2`,
`lowgw10`, `officialclean1`, and `deepseekgw1` as both:

- capability/profile identifiers; and
- runnable process slots with ports, API keys, telemetry paths, health state,
  idle TTL, and active-run assignments.

That coupling was acceptable when every slot had its own profile. It is no
longer the right abstraction after profile materialization moved toward one
capability template per workspace, permission tier, and provider. Keeping slot
numbers as profile semantics makes warm reuse, profile refresh, workspace
provisioning, and provider expansion harder than necessary.

## Target Model

Gateway Pool has two separate identity layers.

### ProfileTemplate

A ProfileTemplate defines the durable capability boundary:

- workspace id;
- permission tier, such as `user` or `owner-maintenance`;
- provider family, such as `openai-codex`, `deepseek`, or `xai-oauth`;
- authorized Skill Store and MCP/plugin bindings;
- authorized capability hash;
- tool schema epoch.

The first implementation key remains compatible with the current template tuple:

```text
<workspaceId>|<permissionTier>|<provider>
```

Examples:

```text
owner|user|openai-codex
owner|owner-maintenance|openai-codex
owner|user|deepseek
weixin_test_1|user|openai-codex
```

### WorkerReplica

A WorkerReplica is only a runnable process identity:

- replica id;
- legacy profile alias, when present, such as `lowgw1`;
- pool/template key;
- port or API endpoint;
- process health;
- API key presence, but never the raw key in status or harness output;
- active-run count;
- idle/warm lifecycle state;
- materialized template key/hash observed from the running process.

Replica ids may initially reuse legacy aliases for compatibility. Those aliases
must not decide capability ownership. They are process labels only.

### PoolKey

The scheduler chooses a pool by workspace, permission tier, and provider. The
first pool key equals the ProfileTemplate key. Future revisions may add policy
fields, but must not add replica id, legacy profile alias, port, or API key.

### CompatibilityKey

Run compatibility is template-scoped, not replica-scoped. It may include:

- pool key;
- profile template key;
- active schema/toolset set for the run;
- MCP/plugin binding names or safe binding hashes;
- Skill workspace id set;
- capability hash;
- tool schema epoch.

It must not include:

- `lowgwN`, `officialcleanN`, or other slot aliases;
- port numbers or API base URLs;
- API keys;
- process ids;
- run prompts, model output, plugin launch tokens, workspace keys, or secrets.

The separate ReplicaIdentityKey may include the replica id and endpoint so the
pool can track process health and logs, but it is not a run compatibility
boundary.

## Scheduling Contract

1. Normalize the request to `(workspaceId, permissionTier, provider)`.
2. Resolve that tuple to a ProfileTemplate and pool key.
3. Find warm/idle WorkerReplicas in that pool whose materialized template
   identity and requested active schema are compatible.
4. If none is reusable, start another replica from the same pool when pool and
   global caps allow.
5. If all replicas in the pool are busy and caps are reached, queue within that
   pool. Do not jump to a different provider, workspace, or permission tier.
6. Legacy `lowgwN` aliases remain only as replica aliases during migration.
   Owner does not own special semantic slots such as `1-4` or `10`; Owner owns
   a pool with `minWarm` and `maxWorkers`.

## Migration Phases

### Phase A: Contract and Harness

Added in this change:

- `adapters/gateway-profile-replica-model.js`
- `tests/gateway-profile-replica-model-harness.test.js`

This phase is source-only. It does not change scheduler runtime behavior,
production manifest format, listener startup, or Gateway worker processes.

### Phase B: Manifest Projection

Keep reading the existing manifest, but project each worker into:

- `profileTemplateKey`;
- `poolKey`;
- `replicaId`;
- `profileAlias`;
- endpoint metadata.

Status endpoints may show the alias as a process label, but product logic should
route by pool key.

Initial runtime projection is implemented in
`adapters/gateway-elastic-worker-scheduler.js` and
`adapters/gateway-pool-provider.js`: status and scheduler events expose bounded
`poolKey`, `profileTemplateKey`, `replicaId`, and `profileAlias` metadata.
`replicaId` prefers an explicit replica id, then the legacy manifest `profile`
alias, because existing start/stop scripts and telemetry paths are still keyed
by profile alias.

### Phase C: Scheduler Selection

Move scheduler compatibility and warm reuse from profile-number-first to
pool-key-first:

- warm reuse compares run compatibility without `profile=...`;
- replica identity remains available for port/key/process operations;
- `planHybridStartup()` starts the first warm replica from the Owner
  `owner|user|openai-codex` pool instead of hard-coding `lowgw1`;
- queue/capacity decisions are per pool and global cap.

Initial runtime selection is implemented for compatibility keys:
`buildGatewayWorkerCompatibilityKey()` no longer includes the legacy profile
alias or API endpoint. It remains bounded by workspace, permission tier,
provider, profile template key, capability hash, tool schema epoch, active
toolsets, MCP binding names, Skill profile, and Skill workspace ids. This means
same-template replicas can be reused or refreshed without pretending that
`lowgw1`, `lowgw2`, or `lowgw10` are different capability profiles, while
different provider, workspace, permission, capability, or active schema
requests remain hard boundaries.

### Phase D: Materialization

Materialize a selected replica from the ProfileTemplate before startup. A
stopped replica can be rebuilt from the current template regardless of its old
alias. A warm replica can be reused only when its materialized template
key/hash/schema still matches.

Initial runtime materialization context is implemented. When the scheduler cold
starts a stopped replica, `startWorkerProfile()` now derives bounded launch
metadata from the selected worker and scheduler hints:

- `poolKey`;
- `profileTemplateKey` / `templateKey`;
- `replicaId`;
- `profileAlias`;
- workspace id;
- permission tier;
- provider;
- optional capability hash and tool schema epoch.

The standard Windows listener launch path writes that metadata into scheduled
task request files and direct `start-gateway-pool.ps1` arguments. The
PowerShell launcher validates the values with a narrow safe character set,
logs only bounded metadata, and passes the template request into
`start-low-gateways-child.ps1`, which exposes it to the WSL start script as
`HERMES_GATEWAY_REQUEST_*` environment variables. The WSL script records a
`lowgw-template-request` line before its existing builder-backed template peer
expansion and config rendering. Custom profile launch scripts are not forced to
accept new arguments; they keep the legacy `--start-profiles` contract for
rollback and NAS compatibility.

### Phase E: Cleanup

After production has run with pool-key scheduling, remove user-facing semantic
references to `lowgw1`, `lowgw2`, and similar names. They may remain in bounded
diagnostic output as replica aliases until all launch scripts and telemetry
paths are migrated.

Initial cleanup is conservative: product logic and scheduler compatibility use
pool/template identity, while `lowgw*`, `officialclean*`, and `deepseekgw*`
remain only as `replicaId` / `profileAlias` metadata for launch scripts,
telemetry paths, port mapping, and bounded diagnostics. Do not remove those
aliases from scripts until the manifest and process lifecycle no longer depend
on them.

### Phase F: Manifest Metadata And Replica-First Scheduler State

Implemented in this change:

- `adapters/gateway-pool-manifest-replica-metadata-service.js` derives
  secret-free `replicaId`, `profileAlias`, `profileTemplateKey`, and `poolKey`
  fields for manifest workers.
- `scripts/normalize-gateway-pool-manifest-replica-metadata.js` can dry-run or
  write those fields into an existing manifest without printing worker bodies
  or API keys.
- `adapters/gateway-workspace-provisioning-service.js` writes replica metadata
  for new workspace workers and backfills existing manifest workers when a
  provisioning or binding-refresh operation touches the manifest.
- `adapters/gateway-pool-provider.js` preserves manifest replica metadata when
  normalizing workers.
- `adapters/gateway-elastic-worker-scheduler.js` now keys scheduler state and
  run assignment by `replicaId` before falling back to legacy worker/profile
  fields. This keeps an explicit replica id from losing warm/busy/idle state
  when it differs from the manifest row id.

The profile alias remains the launch-script handle. The manifest metadata is
not trusted as an authorization source: template/pool identity is still
re-derived from workspace, permission tier, provider, and runtime hints before
selection and status projection.

## Harness Coverage

`node tests\gateway-profile-replica-model-harness.test.js` covers:

- legacy Owner aliases such as `lowgw1` and `lowgw10` share the same
  ProfileTemplate and PoolKey while retaining distinct replica identities;
- run compatibility does not contain legacy slot aliases, ports, endpoints, or
  raw keys;
- provider, workspace, and permission tier remain hard pool boundaries;
- bounded pool summaries do not expose raw API keys.

Future runtime implementation must add scheduler scenarios proving:

- compatible warm replica reuse by pool key;
- cold start from a stopped replica in the same pool;
- no cross-provider or cross-permission fallback;
- queueing when pool caps are exhausted;
- legacy manifest compatibility while slot aliases have no capability semantics.

The first runtime scheduler/provider scenarios are now covered by:

- `node tests\gateway-elastic-worker-scheduler.test.js`
- `node tests\gateway-pool-provider.test.js`

These tests prove runtime compatibility keys do not include legacy slot aliases
or endpoints, scheduler events/status expose bounded pool/replica metadata,
same-pool warm workers are reused before cold-starting another replica, and
status projection does not expose raw API keys or config bodies.

Phase D/E launch context coverage is in:

- `node tests\gateway-worker-profile-launch-service.test.js`
- `node tests\startup-scripts.test.js`

These tests prove scheduled-task requests and direct standard launcher calls
carry bounded template metadata, custom launch scripts remain backward
compatible, PowerShell/WSL child scripts pass only `HERMES_GATEWAY_REQUEST_*`
metadata, and the shell start script records the template materialization
request before using the existing builder-backed peer expansion.

Phase F manifest/state coverage is in:

- `node tests\gateway-pool-manifest-replica-metadata-service.test.js`
- `node tests\gateway-pool-manifest-replica-metadata-script.test.js`
- `node tests\gateway-workspace-provisioning-service.test.js`
- `node tests\gateway-pool-provider.test.js`
- `node tests\gateway-elastic-worker-scheduler.test.js`

These tests prove manifest metadata is derived without leaking API keys,
stale manifest template fields are overwritten by canonical tuple metadata,
workspace provisioning writes and backfills replica metadata, provider
normalization preserves it, and scheduler state/release uses `replicaId` when
it differs from the manifest row id.

## Privacy Boundary

Docs, status events, harness failures, and decision traces may include bounded
metadata such as pool key, replica id, profile alias, provider, workspace id,
permission tier, state, health, and active-run count.

They must not include raw API keys, workspace keys, Skill Store private data,
MCP access keys, plugin launch tokens, prompts, model output, full config YAML,
or long process logs.
