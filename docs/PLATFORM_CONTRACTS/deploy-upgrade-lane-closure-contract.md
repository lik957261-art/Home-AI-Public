# Deploy And Upgrade Lane Closure Contract

This contract productizes the Home AI deployment lane and public upgrade loop
as repeatable closure gates. It exists because routine plugin deployment and
third-party upgrade work can otherwise appear complete while the actual request
card, deploy lane lock, Hermes Agent runtime, Provider ingress, or source
adoption path is still missing.

## Routine Plugin Deploy Cards

Routine plugin deploy cards must be request cards, not terminal receipts.

Required bounded fields:

- `cardKind=plugin_deployment`
- `pluginId=<plugin-id>`
- `deployReason=<bounded reason>`
- `sourceRole=home_ai_main|owner_main|central_deploy_coordinator|explicit_deploy_orchestrator`
- `centralCoordinatorRef=<case/card/ref>` for coordinator-origin deploys
- target lane selected by the deploy lane pool

Fail closed when any of these are true:

- title starts with `Return:`;
- body contains `Return policy: terminal receipt`;
- terminal status is already present, such as `completed`,
  `partially_completed`, `redirected`, `blocked`, or `rejected`;
- `cardKind` is missing or not `plugin_deployment`;
- `pluginId` is missing or not a bounded plugin id;
- `deployReason` is missing.
- `sourceRole` is missing or not an authorized central deploy source role.

Terminal receipts may record completed work, but they must not be accepted as
new deployment requests.

## Source Role And Central Governance Gate

Deploy lanes accept production deployment cards only from central deploy
owners: `home_ai_main`, `owner_main`, `central_deploy_coordinator`, or
`explicit_deploy_orchestrator`.

Worker-origin roles such as `plugin_worker`, `home_ai_worker`,
`repair_worker`, `audit_worker`, `loop_worker`, and `plugin_source_thread` must
return `deployRequest` metadata to their source/coordinator instead of creating
Deploy Lane cards directly. The deploy-card validator fails closed with bounded
issue codes including:

- `deploy_card_requires_central_coordinator`
- `worker_direct_deploy_forbidden`
- `deploy_source_role_not_authorized`

Terminal return markers such as `deploy_needed=true`, `deploy_requested`, or
`blocked_by_deploy_readback` are source-coordinator follow-up signals. They
must create a `pendingSourceAction` and feed central deploy aggregation before a
Deploy Lane card exists; they are not accepted as deploy-lane dispatch
authority.

An emergency direct deploy requires auditable override metadata:

- `centralOverride=true`
- `overrideReason`
- `ownerApprovalRef` or `centralCoordinatorRef`
- clean `dirtyState`
- `sourceRef`
- validation summary
- required readback

The deploy lane report must include bounded source-role/coordinator/override
metadata and must not include secrets, sudo password paths, cookies, launch
tokens, endpoint bodies, private thread bodies, raw logs, or private payloads.

## Deploy Lane Lock Record

Each lane should maintain a bounded lock record while it owns a deploy card.
The record may be stored in task-card metadata, lane handoff, or a future lock
store, but it must avoid secrets and raw private paths beyond the bounded
basename/hash fields below.

Required lock fields:

- `pluginId`
- `launchdLabel` or `productionPathHash`
- `productionPathBasename` when available
- `deployReason`
- `taskCardId`
- `laneTitle`
- `laneThreadId`
- `phase`
- `startedAt`
- `completedAt` for terminal phases
- `status`

Allowed phases:

- `queued`
- `deploy`
- `restart`
- `hash-readback`
- `runtime-gate`
- `handoff`
- `return`
- `completed`
- `blocked`
- `failed`

Deploy/restart mutation for the same plugin label remains serialized. Read-only
hash parity, marker scans, manifest checks, and bounded API readbacks may run
in parallel after the mutation phase.

## Public Upgrade Daily Smoke

The daily public upgrade smoke must prove the third-party upgrade loop across
all first-class deployment dependencies:

- Home AI source preflight succeeds.
- Missing plugin sources fail closed without `--clone-missing-plugins`.
- Explicit operator clone gate produces clone, deploy, and closure-validation
  actions.
- Movie and Moira are in the deployable plugin source inventory.
- Hermes Agent runtime repair fails closed when the managed runtime is missing
  and produces an explicit repair action only when the operator provides the
  matching gate.
- Present-but-non-Git source directories fail closed without
  `--adopt-non-git-sources`.
- Explicit source-adoption gate produces adoption and deploy actions.
- Provider/profile closure validation remains present.
- Temporary rehearsal workspaces are removed after execution.

The smoke is a planning and rehearsal gate. It must not mutate production
unless the operator runs the public upgrade script with explicit `--execute`.

## Harness

Source and production readback should run:

```sh
node tests/deploy-upgrade-lane-closure-service.test.js
node tests/deploy-upgrade-lane-closure-smoke.test.js
node scripts/deploy-upgrade-lane-closure-smoke.js --json
```

When a real `homeai-public-upgrade-rehearsal.js --execute --json` output is
available, the smoke can validate it directly:

```sh
node scripts/deploy-upgrade-lane-closure-smoke.js \
  --rehearsal-json /path/to/rehearsal.json \
  --json
```

## Privacy

Do not store raw sudo passwords, SSH keys, access keys, cookies, launch tokens,
Provider payloads, private thread bodies, production logs, or raw auth URLs in
deploy card metadata, lane locks, rehearsal output, or return cards.
