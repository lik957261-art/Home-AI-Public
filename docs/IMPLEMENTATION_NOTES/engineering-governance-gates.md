# Engineering Governance Gates

This note defines the repository-level closure gates for engineering changes
that affect Home AI product behavior, deployment, or production operations.

## CI-Enforced Constraints

Every pull request and push must keep `.github/workflows/ci.yml` wired to
`npm run productization:check`. The productization check is the broad
repository gate and must continue to run these checks in this order:

- `node scripts/engineering-governance-check.js`;
- `node scripts/fallback-governance-check.js --json`;
- `node scripts/public-install-preflight.js --source-only --json`;
- `node scripts/plugin-provisioning-coverage-audit.js`;
- `node scripts/macos-install-phase-coverage-audit.js`;
- `node scripts/macos-fresh-install-rehearsal.js`;
- `node scripts/macos-first-start-preflight.js --source-only --json`;
- `node scripts/macos-install-verification-classification.js`;
- `node scripts/macos-install-operator-closure-checklist.js`;
- `node scripts/grok-xai-oauth-closure-checklist.js`;
- `node scripts/windows-dev-services-boundary-checklist.js`;
- `node scripts/macos-workspace-file-broker-boundary-checklist.js`;
- `node tests/codex-mobile-recovery-service.test.js`;
- `node tests/codex-mobile-recovery-api-routes.test.js`;
- `node scripts/macos-web-push-production-audit.js --source-check --json`;
- `node scripts/production-self-diagnostics.js`;
- `node scripts/production-self-diagnostics-coverage-audit.js`;
- `node scripts/productization-acceptance-matrix.js --verify-docs`;
- `npm test`, including syntax checks, architecture boundary checks, security
  invariants, and the privacy scan;
- `start-hermes-web` check-only startup validation for the current platform;
- `git diff --check` and `git diff --cached --check`.

The governance check is intentionally small and static. It verifies that the
release gate, fallback governance check, production self-diagnostic scripts,
and productization acceptance matrix remain documented and discoverable. If a
future change replaces a gate, the replacement must update this note,
`docs/TEST_MATRIX.md`, and `scripts/engineering-governance-check.js` in the
same commit.

`scripts/fallback-governance-check.js` is the executable guard for the
root-cause and fallback governance contracts. The productization gate runs it
in default mode to prove that the contract, fallback registry, docs index, test
matrix, architecture map, and AI Operations Control Plane intake remain wired.
Task-specific AI Ops plans can add `--changed-file` arguments so newly added
high-risk fallback code is either removed or linked to an explicit registry
entry.

`docs/PLATFORM_CONTRACTS/audit-thread-governance-contract.md` defines the
dedicated Home AI audit thread model. The engineering governance check pins the
contract, Docs Index entry, AGENTS audit-thread exception, and Automation/Cron
boundary that scheduled jobs may create audit request cards but must not run
deep host or plugin audits directly.

The same gate also pins the audit report depth requirement. Dedicated audit
threads must include both a contract lane for explicit platform/module/security
violations and an architecture lane for root-cause and complexity risks such as
unclear domain contracts, duplicated state derivation, hidden fallback chains,
weak executable tests, oversized entrypoints, or dev/prod topology drift. A
read-only audit is incomplete if it only reports narrow contract violations
while ignoring the architecture that can keep generating the same class of
defects.

## Public Install Preflight

Public install and update closure must not depend on private machine paths,
hand-copied runtime state, hidden approvals, or unrecorded local assumptions.
`scripts/public-install-preflight.js` is the maintained machine-readable
preflight for repository install metadata and host prerequisites.

Use source-only mode in CI and productization gates:

```bash
node scripts/public-install-preflight.js --source-only --json
node tests/public-install-preflight.test.js
```

Use full host mode on a target machine before treating it as install-ready:

```bash
node scripts/public-install-preflight.js --json
node scripts/public-install-preflight.js --markdown
```

The full host mode fails closed when required tools such as Node.js 22+,
Python 3.12+, or Git are missing or too old. Source-only mode verifies the
public plugin source manifest, required install docs/scripts, package metadata,
and public HTTPS GitHub clone URLs without depending on the current host.
`scripts/plugin-provisioning-coverage-audit.js` is the source guard for
plugin provisioning drift. It verifies that public-default business plugins
have host-side provisioning adapters, tests, and `hermes-plugin-service`
wiring, and that special public plugins such as Codex Mobile and Music are not
treated as ordinary public-default provisioning targets.
`scripts/install-macos-production.sh --json` is the current phase-based Mac
installer entrypoint. It is dry-run by default and returns a machine-readable
18-phase install plan. Its `--execute` path requires `--phase`; read-only
phases, the low-risk idempotent `create-directory-layout` phase, the
conservative `create-service-users` audit/create phase, and the
fresh-install-only `install-hermes-mobile` source copy phase are executable
now. The service-user phase audits the configured macOS service users by
default, fails closed on missing users, and creates missing users only when run
as root with `HOMEAI_INSTALL_ALLOW_USER_CREATE=1`; existing users are not
rewritten. The `configure-owner` phase creates a missing Owner Web Access Key
file with `0600` permissions, tightens an existing key file's mode when
needed, and never prints the key contents; existing non-empty key contents are
not overwritten. The `configure-workspace-isolation` phase creates the baseline
workspace data/upload/artifact and Skill/Memory directory scaffold from a
bounded workspace map. It applies macOS ownership/ACL repairs only when run as
root with `HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1`; the final per-profile ACL
matrix still depends on Gateway/profile provisioning and must be proved by the
worker filesystem access harness. The source copy phase fails closed when
`root/app` is not empty and excludes private/local state such as `.git`,
`.agent-context`, `.env*`, and `node_modules`. The
`install-official-hermes-runtime` phase pins a Node.js `>=22` executable at
`runtime/node-current/bin/node` and fails closed if an existing runtime link
points elsewhere. The `install-dependencies` phase runs locked production
dependency installation with `npm ci --omit=dev` in `root/app` and fails closed
when `package-lock.json` is missing. The `configure-gateway-profiles` phase
creates a fresh-install Mac Gateway manifest, per-worker Mobile-to-Gateway API
key files, and non-secret profile config skeletons from the canonical Gateway
template builder. The fresh skeleton covers ordinary OpenAI/Codex workers,
ordinary DeepSeek workers, Owner Grok, and Owner maintenance OpenAI/DeepSeek
workers while still preserving a non-empty existing manifest, rejecting inline
worker API keys, and marking provider auth as not copied because OAuth state,
browser credentials, and provider API keys must come from explicit
provider-specific setup. The `install-gateway-launchd-services` phase reads
that manifest, materializes per-worker Gateway start scripts, and stages
`com.hermesmobile.gateway.*` LaunchDaemon plists with `RunAtLoad=false` and
`KeepAlive=false` by default. It writes
`data/gateway-launchd-services-plan.json`; the same explicit
`HOMEAI_INSTALL_LAUNCHD_APPLY=1` gate copies those plists into the configured
LaunchDaemons directory and loads them. The worker start scripts read API keys
from per-worker files at runtime and must not embed provider secrets. The
`repair-gateway-worker-acl` phase writes
`data/gateway-worker-acl-plan.json` by default, and with
`HOMEAI_INSTALL_APPLY_WORKSPACE_ACL=1` applies the final per-profile ACL/chown
repairs required for worker users to read the live Gateway manifest, their own
worker API key files, provider key files, bridge-host secret, and generated
profile directories without exposing raw secret values in output. The
`configure-plugins` phase validates the public plugin source manifest and
writes `data/plugin-source-plan.json` by default without workspace grants;
explicit `--plugin-source-mode clone` may clone missing public HTTPS plugin
checkouts but must fail closed on conflicting non-Git targets. The
`plan-plugin-workspace-provisioning` phase writes
`data/plugin-workspace-provisioning-plan.json` from the public plugin manifest,
workspace map, current authorization store, and existing `.hermes-<plugin>`
binding evidence. It covers only ordinary default business plugins and
explicitly remains plan-only: no plugin keys, grants, launch tokens,
plugin-owned rows, or bind/register calls are created by the installer. The
`configure-cron` phase creates the official Hermes CRON scaffold, empty or
preserved canonical `cron/jobs.json`, helper scripts, and source-controlled
productivity Skills without creating business jobs or loading launchd. The
`install-launchd-services` phase stages the canonical core
launchd plist files plus plugin plist files for the public plugin set: Codex
Mobile, Email, Finance, Growth, Health, Moira, Music, Note, and Wardrobe. It
writes `data/launchd-services-plan.json`, but by default it does not install
files under `/Library/LaunchDaemons` and does not load or restart services.
The `run-smoke-tests` phase invokes the live app
`macos-production-closure-validation.js` through the configured production
Node runtime when present and wraps only bounded closure metadata in the
installer report.
The audited phase list is `system-preflight`, `install-dependencies`,
`create-service-users`, `create-directory-layout`, `install-hermes-mobile`,
`install-official-hermes-runtime`, `configure-owner`,
`configure-workspace-isolation`, `configure-gateway-profiles`,
`install-gateway-launchd-services`, `repair-gateway-worker-acl`,
`configure-cron`, `configure-plugins`,
`plan-plugin-workspace-provisioning`, `install-launchd-services`,
`run-first-start-preflight`, `run-smoke-tests`, and `print-access-info`.
`scripts/macos-install-phase-coverage-audit.js` verifies that this phase array,
command generator, execution dispatcher, executable allowlist, install tests,
and durable docs remain synchronized.
`scripts/macos-fresh-install-rehearsal.js` performs a source-only fresh-install
rehearsal in a temporary root. It executes the no-sudo staging/configuration
phases and verifies the owner key, Gateway manifest, Gateway launchd plan, CRON
plan, plugin source plan, plugin workspace provisioning plan, and core/plugin
launchd plan are actually written.
`scripts/macos-install-verification-classification.js` is the companion
evidence classifier. It labels every installer phase as `source_check`,
`source_rehearsed`, `external_input`, `privileged_apply`, or `live_runtime`,
and fails if source-rehearsed phases drift away from the rehearsal script or if
durable docs stop naming the verification classes. This prevents a dry-run
green check from being treated as proof of privileged apply or live runtime
closure.
`scripts/macos-install-operator-closure-checklist.js` consumes that
classification and turns every `external_input`, `privileged_apply`, and
`live_runtime` phase into an operator-facing closure item with bounded
commands, required evidence, explicit operator inputs, and a risk boundary.
Public fresh-install handoff must not treat a source-only rehearsal as full
closure while any action-required checklist item remains unperformed.
The central privileged gate is explicit:
`sudo HOMEAI_INSTALL_LAUNCHD_APPLY=1 bash scripts/install-macos-production.sh
--execute --phase install-launchd-services --root <root> --json`. That gate
copies every staged plist into the configured LaunchDaemons directory, applies
mode `0644`, runs best-effort `launchctl unload -w`, then runs
`launchctl load -w` and marks the plan installed/loaded only if every load
succeeds. Tests inject a temporary LaunchDaemons directory and fake
`launchctl` so the rollback/load contract is covered without mutating the
host.
`scripts/macos-first-start-preflight.js` is the read-only first-start
environment gate referenced by that plan.

## Production Self-Diagnostics

Production fixes are not closed only because a local source test passes. A
change that can affect startup, deployment, profile access, plugin visibility,
worker filesystem permissions, public update, Automation, Gateway routing, or
Mac production state needs either an existing production self-diagnostic or a
new bounded diagnostic.

The maintained baseline diagnostics are:

- `scripts/production-status-smoke.js`;
- `scripts/macos-production-profile-audit.js`;
- `scripts/grok-auth-metadata-smoke.js`;
- `scripts/grok-xai-oauth-closure-checklist.js`;
- `scripts/windows-dev-services-boundary-checklist.js`;
- `scripts/macos-workspace-file-broker-boundary-checklist.js`;
- `scripts/deploy-macos-production.js` Home AI drift gate plan;
- `scripts/macos-first-start-preflight.js`;
- `scripts/macos-install-phase-coverage-audit.js`;
- `scripts/macos-fresh-install-rehearsal.js`;
- `scripts/macos-install-verification-classification.js`;
- `scripts/macos-install-operator-closure-checklist.js`;
- `scripts/production-self-diagnostics-coverage-audit.js`;
- `scripts/macos-production-drift-reconcile.js`;
- `scripts/homeai-production-drift-audit-watchdog.sh`;
- `scripts/macos-web-push-production-audit.js`;
- `scripts/macos-worker-filesystem-access-harness.js`;
- `scripts/macos-gateway-manifest-toolset-smoke.js`;
- `scripts/gateway-tool-schema-smoke.js` for document/file tools callable
  schema (`docx_create`, `docx_extract_text`, `office_extract_text`,
  `pptx_create`, `pdf_create`, `pdf_extract_text`, `pdf_render_pages`,
  `audio_transcribe`, `archive_list`,
  `archive_extract_safe`);
- `scripts/macos-plugin-directory-production-smoke.js`;
- `scripts/macos-bound-directory-preview-smoke.js`;
- `scripts/macos-automation-cron-audit.js`;
- `scripts/macos-automation-cron-launchd-smoke.js`;
- `scripts/plugin-workspace-audit-runner.js`;
- `scripts/plugin-provisioning-coverage-audit.js`;
- `scripts/macos-production-closure-validation.js`.

`scripts/production-self-diagnostics-coverage-audit.js` verifies that every
baseline diagnostic has a unique id, existing script, source harness linked to
that diagnostic's script name or id, bounded command template, non-empty
use-case list, and durable references in this governance note and
`docs/MODULES/deployment.md`. Diagnostic command templates must keep
deployment-specific paths parameterized with placeholders such as `<node>`,
`<app>`, and `<mac-root>` rather than hard-coding local `/Users/example/path`,
`/Volumes/...`, or Windows user paths.

`scripts/homeai-production-drift-audit-watchdog.sh` may run bounded
auto-repair when installed with `HOMEAI_PRODUCTION_DRIFT_AUTO_REPAIR=1`, but
that auto-repair must stay routed through
`scripts/macos-production-drift-reconcile.js`. Do not add direct credential,
provider/model, profile config, ACL, or user-data rewrites to the watchdog
itself. New repair classes must first be covered by the reconcile script tests
and documented in `docs/MODULES/deployment.md`.

`scripts/macos-web-push-production-audit.js` is the read-only Web Push
production-state diagnostic. It checks VAPID metadata, public origin alignment,
subscription origin/PWA metadata, and delivery summaries without printing raw
endpoints or sending a notification. Use `--require-public-origin` plus
`--require-active-external-subscription` after device re-registration to close
the migration proof. The default productization gate runs
`scripts/macos-web-push-production-audit.js --source-check --json` against a
temporary fixture so the strict production-audit path cannot drift out of the
repository, but that source check is not a substitute for the real
external-origin subscription proof.

`scripts/grok-xai-oauth-closure-checklist.js` is the read-only operator
handoff for deferred Grok/xAI manual OAuth repair. It does not inspect token
files or execute OAuth; it keeps the required post-auth metadata smoke,
profile/provider audit, live `grokgw1` provider smoke, and optional Automation
`x_search` proxy proof visible before a manual repair is accepted.

`scripts/windows-dev-services-boundary-checklist.js` is the read-only
boundary checklist for restored Windows Task Scheduler services. It records
that Windows tasks are development launchers only, that hidden PowerShell
launcher coverage remains in place, and that Mac production rollback evidence
must come from Mac backups/diagnostics rather than Windows task state.

`scripts/macos-workspace-file-broker-boundary-checklist.js` is the read-only
boundary checklist for the Mac Stage 1 versus Stage 2 workspace file-access
line. It records that Stage 1 OS-level worker/MCP isolation is the current
production minimum, that host file routes still need product ACL checks, and
that Stage 2 is not closed until listener-side workspace-private file reads
move through per-workspace file brokers.

The machine-readable baseline is:

```bash
node scripts/production-self-diagnostics.js
node scripts/production-self-diagnostics.js --markdown
node scripts/grok-xai-oauth-closure-checklist.js
node scripts/windows-dev-services-boundary-checklist.js
node scripts/macos-workspace-file-broker-boundary-checklist.js
node scripts/macos-install-verification-classification.js
node scripts/macos-install-operator-closure-checklist.js
node scripts/macos-web-push-production-audit.js --source-check --json
node scripts/macos-web-push-production-audit.js --root <mac-root> --public-origin <external-origin> --require-public-origin --require-active-external-subscription --json
node scripts/homeai-self-improving-loop.js --matrix --json
node scripts/homeai-self-improving-loop.js --coverage-audit --json
node scripts/homeai-self-improving-loop.js --collect-production-observations --status-smoke-json '{"ok":true,"activeGlobal":0,"gatewayPool":{"enabled":true,"workerCount":1},"gatewayWorkerPolicyContract":{"ok":true}}' --cron-audit-json '{"ok":true,"jobCount":1,"skillCount":1,"sourceIssueCount":0,"configIssueCount":0,"statusIssueCount":0}' --production-diagnostics-json '{"ok":true,"diagnosticCount":1,"diagnostics":[],"issues":[]}' --json
node scripts/production-self-diagnostics-coverage-audit.js
node tests/production-self-diagnostics.test.js
node tests/production-self-diagnostics-coverage-audit.test.js
node tests/home-ai-self-improving-loop-service.test.js
node tests/homeai-self-improving-loop-script.test.js
```

The JSON output lists the diagnostic id, script path, source harness, intended
production command, required use cases, closure readbacks, and bounded-output
policy. This command does not execute production repair or smoke actions by itself; it is the
operator-facing checklist and source-side guard for selecting the right
production diagnostic before closure.

Diagnostic output must be bounded metadata. It must not print raw Access Keys,
provider keys, OAuth tokens, push endpoints, full prompts, full model
responses, private file contents, or long logs. A diagnostic may report paths,
ids, labels, versions, counts, status codes, and issue codes when those values
are needed for repair.

Triggered production diagnostics follow the same rule. A runtime failure such
as a Gateway worker `health_check_failed` may write a bounded report and a
Codex repair task-card recommendation, but the diagnostic process must stay
report-only. Any repair that changes runtime state, files, ACLs, databases,
deployments, or service processes must be performed by a Codex repair thread
after explicit Owner approval.

## Productization Acceptance Matrix

Every product-facing change must be reviewed against this acceptance matrix.
The goal is to prevent maintainer-only fixes that work on one Mac but fail for
a fresh public deployment or another workspace.

Required dimensions:

- `owner-workspace`: Owner workspace behavior;
- `non-owner-workspace`: Non-Owner workspace behavior when the surface is
  user-visible;
- `public-fresh-install`: Public fresh install behavior without private
  machine paths or copied runtime state;
- `public-update`: Public update behavior for an existing clean checkout;
- `migration-restore`: Migration or restore behavior when the change touches
  persisted state;
- `backup-rollback`: Backup and rollback path when production data can be
  changed;
- `permission-boundary`: Permission boundary for workspace, plugin, Gateway,
  Skill, Memory, Soul, or filesystem access;
- `ui-pwa-cache`: UI, PWA, and cache behavior when static client behavior
  changes;
- `production-self-diagnostic`: Production self-diagnostic coverage for likely
  failure modes.

The accepted production self-diagnostic evidence ids are:

- `status-smoke`;
- `profile-audit`;
- `grok-xai-oauth-metadata`;
- `grok-xai-oauth-closure`;
- `windows-dev-services-boundary`;
- `workspace-file-broker-boundary`;
- `deployment-drift-gate`;
- `first-start-preflight`;
- `macos-install-phase-coverage`;
- `macos-fresh-install-rehearsal`;
- `macos-install-verification-classification`;
- `macos-install-operator-closure`;
- `production-self-diagnostics-coverage`;
- `self-improving-loop`;
- `production-drift-reconcile`;
- `production-drift-watchdog`;
- `web-push-production-audit`;
- `worker-filesystem-access`;
- `gateway-manifest-toolset`;
- `gateway-document-file-tools-schema`;
- `plugin-directory`;
- `bound-directory-preview`;
- `automation-cron`;
- `automation-cron-launchd`;
- `plugin-workspace-audit`;
- `plugin-provisioning-coverage`;
- `production-closure`.

The machine-readable matrix is:

```bash
node scripts/productization-acceptance-matrix.js
node scripts/productization-acceptance-matrix.js --markdown
node scripts/productization-acceptance-matrix.js --verify-docs
node tests/productization-acceptance-matrix.test.js
```

Use `--markdown` when a change needs a checklist in an implementation note,
pull request, or handoff. Use `--verify-docs` when changing the matrix or
governance docs.

If a dimension is not applicable, the implementation note, test plan, or
handoff must say why. If it is applicable but not yet covered, the gap must be
recorded as a follow-up before the work is treated as productized.

## Local Check

Run the governance check directly when changing CI, deployment docs, production
diagnostics, public release behavior, or this document:

```bash
node scripts/engineering-governance-check.js --json
node scripts/fallback-governance-check.js --json
node tests/public-install-preflight.test.js
node tests/install-macos-production.test.js
node tests/macos-install-phase-coverage-audit.test.js
node tests/macos-fresh-install-rehearsal.test.js
node tests/macos-install-verification-classification.test.js
node tests/macos-install-operator-closure-checklist.test.js
node scripts/macos-first-start-preflight.js --source-only --json
node tests/macos-first-start-preflight.test.js
node tests/grok-xai-oauth-closure-checklist.test.js
node tests/windows-dev-services-boundary-checklist.test.js
node tests/macos-workspace-file-broker-boundary-checklist.test.js
node tests/macos-web-push-production-audit.test.js
node tests/engineering-governance-check.test.js
node tests/fallback-governance-check.test.js
node tests/production-self-diagnostics.test.js
node tests/production-self-diagnostics-coverage-audit.test.js
node scripts/productization-acceptance-matrix.js --verify-docs
node tests/productization-acceptance-matrix.test.js
```

The broad gate remains:

```bash
npm run productization:check
```
