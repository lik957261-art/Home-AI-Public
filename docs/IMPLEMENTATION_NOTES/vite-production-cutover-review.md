# Vite Production Cutover Review

## Purpose

This document is the Owner review package for moving the Home AI primary
frontend from the classic ordered static shell toward the Vite-built shell in
production.

It is not an approval record. It is not a deployment receipt. Production
cutover still requires an explicit Owner approval in the active implementation
thread after the development evidence has been reviewed.

## Current State

- Development-only Vite migration readiness has passed local gates.
- The production business shell remains the classic `public/index.html`
  ordered static script chain.
- `public/vite-preview/` and `public/vite-islands/` are preview artifacts only
  until a separate cutover change explicitly wires a production route or shell
  switch.
- The maintained readiness command is:

```sh
npm run check:vite-readiness
```

That command reports:

- `sourceOnly=true`
- `ownerApprovalRequired=true`
- `productionDeployAuthorized=false`

## 2026-07-03 Source Cutover Change

Owner approval for creating and deploying a production Vite cutover source
change was given in the active implementation thread. The implemented cutover
is deliberately transitional: it does not replace the full Home AI business UI
with the development preview host. Instead, the Home AI listener serves the
existing classic shell and, when the selected shell mode is `vite`, injects the
Vite-built production bootstrap module:

```text
public/vite-islands/home-ai-production-bootstrap/home-ai-production-bootstrap.js
```

The bootstrap preserves the classic runtime, attaches bounded Vite production
readback state under `window.HomeAiViteProduction`, installs the Vite focus
lifecycle guard, and marks the selected shell mode with bounded HTML metadata.
This is a production bootstrap and readback cutover, not completion of the
full ESM replacement of chat, Composer, Plugin Host, document preview, and
task-topic navigation.

The shell mode is selected in this order:

1. Request override: `homeAiShellMode=vite|classic` or
   `shellMode=vite|classic`, used only for bounded readback/rollback checks.
2. Runtime environment:
   `HOMEAI_FRONTEND_SHELL_MODE` or `HERMES_WEB_FRONTEND_SHELL_MODE`.
3. Local config file: `config/home-ai-shell-mode.json`.
4. Fail-closed default: `classic` when no explicit mode can be read.

Current source config selects `vite` for production cutover:

```json
{
  "shellMode": "vite",
  "cutoverVersion": "20260703-vite-production-cutover-v1"
}
```

Rollback does not require a source revert: set the config or environment mode
back to `classic`, restart Home AI, and verify the shell response headers and
HTML no longer include the production bootstrap module.

The bounded source-change contract is:

```text
docs/IMPLEMENTATION_NOTES/vite-production-cutover-source-contract.json
```

It must pass:

```sh
npm run validate:vite-cutover-source -- --contract-json docs/IMPLEMENTATION_NOTES/vite-production-cutover-source-contract.json --require-ok
```

The maintained development acceptance command is:

```sh
npm run verify:vite-dev
```

That command runs the Vite build, global audit, mobile Playwright preview-route
smoke, real local backend parity smoke, readiness gate, Owner review report,
blocked cutover preflight, blocked handoff packet, repository static check,
readback validator contract, repository static check, local full test gate, and
diff hygiene check. The local full test gate still skips install/deploy lane
tests. It clears the cutover approval environment for the run and records
`productionWrites=false`, `deployExecuted=false`, and
`productionDeployAuthorized=false`. When all steps pass it also emits
`ownerApprovalRequest.status=ready_to_request_owner_approval` and the exact
Owner approval text required for the next boundary. That field is a request
package only; it still records no production writes, no deployment, and no
deploy-lane card.

The maintained source-only production cutover preflight is:

```sh
npm run plan:vite-cutover
```

Without the exact Owner approval text below, this preflight must report a
blocked `owner_approval_required` state. With the exact approval text, it still
does not deploy; it only reports that a separate fail-closed production cutover
source change may be created.

The maintained Owner review report is:

```sh
npm run review:vite-cutover
```

That report composes the development readiness check and the source-only
cutover preflight into one bounded JSON payload for review. It records
`sourceOnly=true`, `productionWrites=false`, `deployExecuted=false`, and
`productionDeployAuthorized=false`. It is not an approval record and must not
be used as a deploy-lane request.

The maintained source-only Owner approval request command is:

```sh
npm run request:vite-cutover-approval
```

This command runs the development acceptance report, confirms the Owner review
state, confirms the handoff packet remains blocked without approval, and then
emits a single bounded approval request with the exact approval text. It still
creates no production source change, no Worker card, and no deployment.

The maintained source-only production readback validator is:

```sh
npm run validate:vite-cutover-readback -- --readback-json <deploy-readback.json>
```

It validates the deploy-lane return after production execution. It does not
connect to production or perform deployment; it checks that the returned JSON
contains every required readback id, each row is passed/verified with bounded
evidence, and privacy confirmation is present.

The maintained source-only final goal-state audit is:

```sh
npm run audit:vite-goal -- --acceptance-json <development-acceptance.json> --cutover-source-contract-json <cutover-source-change-contract.json> --production-readback-json <production-readback.json>
```

It does not connect to production, deploy, or send task cards. It only checks
whether the full objective is proven by bounded evidence: development
acceptance, exact Owner approval, the cutover source-change contract, the
deploy-lane packet boundary, and the production readback validator. Without
those evidence files it must report `goal_incomplete`.

The maintained source-only cutover source-change validator is:

```sh
npm run validate:vite-cutover-source -- --contract-json <cutover-source-change-contract.json>
```

Default current-repo mode must remain blocked with
`cutover_source_change_not_created` until exact Owner approval exists and a
separate cutover source change is created. With a bounded contract JSON, the
validator requires the future source change to prove fail-closed classic
default behavior, an explicit shell-mode switch, rollback switch, Service
Worker/cache version plan, Vite manifest/readback evidence, exclusion of dev
preview mocks from production, Owner Console permission preservation,
non-Owner denial, deploy-lane routing, required validation commands, and
privacy confirmation. It does not mutate files, deploy, or connect to
production.

The maintained source-only handoff packet command is:

```sh
npm run packet:vite-cutover
```

Without the exact Owner approval text, this command reports a blocked
`owner_approval_required` state and creates no card. With the exact approval
text, it still does not deploy, does not send a Worker card, and does not
claim production authorization. It only produces a bounded deploy-lane draft
that remains `sendable=false` until the separate fail-closed cutover source
change exists and has passed validation.
The draft targets the Home AI deploy lane pool, including `Home AI Deploy`,
`Home AI Deploy Lane A`, `Home AI Deploy Lane B`, and
`Home AI Deploy Lane C`. It must not be sent until the source-change contract
passes `npm run validate:vite-cutover-source -- --contract-json <file>
--require-ok`; after deploy/readback, the lane return must pass
`npm run validate:vite-cutover-readback -- --readback-json <file>
--require-ok`.

The source-only preflight and review report both expose
`requiredProductionReadback`, a structured checklist of the required production
readback ids. This exists so a later deploy lane proves the same bounded
evidence rather than reconstructing the checklist from prose.

## Owner Approval Boundary

Owner approval must be explicit and must name the production action. A valid
approval should be equivalent to:

```text
批准 Home AI Vite 生产切换：允许创建生产 cutover 改动，并通过 Mac central deploy lane 部署和读回。
```

Before that approval exists, agents must not:

- run `deploy:macos --execute` for the Vite cutover;
- change production `/` to the Vite shell;
- treat built preview assets as the production default shell;
- bump the Service Worker production cache for Vite default-shell behavior;
- send a deploy-lane card that asks a Worker to perform the cutover.
- treat `npm run request:vite-cutover-approval` as approval by itself.
- send the `npm run packet:vite-cutover` draft as a real Worker card before a
  separate cutover source change exists and passes validation.
- treat `npm run validate:vite-cutover-source` default current-repo blocked
  output as production cutover approval or source-change closure.
- hard-code a single deploy lane when another live non-terminal Home AI deploy
  lane can execute the central Mac deploy/readback contract.

## Required Pre-Cutover Evidence

The implementation thread must collect fresh evidence immediately before
requesting or acting on Owner approval:

```sh
npm run build:vite
npm run audit:vite-globals -- --json
npm run verify:vite-dev
npm run check:vite-readiness
node tests/vite-owner-review-report.test.js
npm run review:vite-cutover
node tests/vite-production-cutover-preflight.test.js
npm run plan:vite-cutover
node tests/vite-production-cutover-handoff-packet.test.js
npm run packet:vite-cutover
node tests/vite-owner-approval-request.test.js
npm run request:vite-cutover-approval
node tests/vite-goal-state-audit.test.js
npm run audit:vite-goal
node tests/vite-cutover-source-change-validator.test.js
npm run validate:vite-cutover-source
node tests/vite-production-readback-validator.test.js
node tests/vite-development-readiness-check.test.js
node tests/vite-dev-preview-routes-smoke.test.js
node tests/vite-plugin-host-model.test.js
node tests/vite-plugin-host-island.test.js
node tests/vite-dev-real-backend-parity-smoke.test.js
node tests/static-cache-version-harness.test.js
npm test
npm run check
git diff --check
```

The local `npm test` gate intentionally skips install/deploy lane tests. Do not
use ordinary local execution to claim clean install, clean upgrade, production
deployment, or production Service Worker cutover closure.

## Cutover Change Requirements

A production cutover implementation must be a separate change after Owner
approval. It must include:

- a single explicit routing/config switch for classic shell versus Vite shell;
- a fail-closed default that keeps classic shell active unless the switch is
  enabled;
- static cache and Service Worker version behavior for the selected shell;
- a rollback path that can restore the classic shell without a source revert;
- Owner-only System Console access preserved exactly;
- non-Owner permission denial preserved exactly;
- iOS native shell focus, document preview, voice input, upload, and safe-area
  behavior covered by focused local or device/simulator evidence;
- no dev-preview API mocks wired into `server.js`;
- no raw keys, cookies, launch tokens, provider payloads, private data rows,
  screenshots with private data, or long logs in docs or return cards.
- a bounded source-change contract JSON that passes
  `npm run validate:vite-cutover-source -- --contract-json <file> --require-ok`
  before any deploy-lane card is sent.

## Production Deploy Boundary

Production deploy/readback must use the central Mac deployment contract:

```sh
npm run --silent deploy:macos -- --execute --json --reason home-ai-vite-production-cutover
```

The exact command may include additional contract-required flags once the
cutover change exists. It must be run from an appropriate production deploy
lane or through the Home AI central deploy contract, not by hand-editing
production files.
If the preferred deploy lane is stuck, hidden, archived, terminal, or rejects
task-card transport, try another live non-terminal Home AI deploy lane before
declaring the Vite production deployment blocked.

`npm run plan:vite-cutover` is not a deployment command. It is allowed in local
development because it is source-only, records `productionWrites=false`, and
records `deployExecuted=false`.

## Required Production Readback

The deploy return must include bounded evidence for:

- central deploy result `ok=true`;
- backup path created by the deploy script;
- Home AI listener restart/readback state;
- `/api/public-config` reachable from the production listener;
- Owner-authenticated `/api/status?detail=1` reachable;
- production shell route reports the selected Vite/classic mode;
- Service Worker/cache version matches the cutover expectation;
- static Vite asset manifest and selected shell assets are reachable;
- Owner System Console opens from the feedback menu shortcut for Owner;
- non-Owner cannot open Owner System Console;
- embedded Plugin Host can open sampled Owner-visible plugins through the
  production manifest/proxy path without exposing launch tokens;
- Markdown preview, PPTX/document preview, voice pending-cancel, chat send,
  SSE readback, task/topic navigation, and Wardrobe 入库 action all pass
  bounded smoke/readback;
- rollback switch or rollback deploy returns the classic shell when exercised
  in a bounded validation plan.

The maintained source-only checklist ids are:

- `central_deploy_result`
- `home_ai_listener_readback`
- `selected_shell_mode`
- `service_worker_cache_version`
- `vite_asset_manifest`
- `owner_console_permission`
- `plugin_host_manifest_proxy`
- `document_preview_delivery`
- `voice_pending_cancel`
- `chat_sse_task_topic`
- `wardrobe_usage_action`
- `rollback_switch`

Do not include secrets, access keys, cookies, launch tokens, private message
bodies, private plugin records, database rows, screenshots with private data,
or long logs in the deploy return.

The deploy lane should save or return a bounded JSON payload that can be
validated with:

```sh
npm run validate:vite-cutover-readback -- --readback-json <deploy-readback.json> --require-ok
```

The payload may use `checks[]`, `readbackChecks[]`, `readbacks{}`, or
`readbackMap{}`. Each required id must be present with `status=passed`,
`status=verified`, `ok=true`, `passed=true`, or `verified=true`, plus bounded
evidence. The payload must include privacy confirmation and must not include
bearer tokens, launch-token URLs, cookies, private keys, or raw provider/private
payloads.

## Rejection Or Deferral

If Owner does not approve production cutover, the correct terminal state is:

- development Vite migration ready for review;
- production still classic;
- no production deployment performed.

That state is not a failure. It preserves the requested approval boundary.
