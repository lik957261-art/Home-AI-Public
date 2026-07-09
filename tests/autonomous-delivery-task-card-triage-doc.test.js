"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const contract = fs.readFileSync(
  path.join(repoRoot, "docs", "PLATFORM_CONTRACTS", "autonomous-delivery-loop-contract.md"),
  "utf8",
);
const implementation = fs.readFileSync(
  path.join(repoRoot, "docs", "IMPLEMENTATION_NOTES", "autonomous-delivery-loop.md"),
  "utf8",
);

assert.match(contract, /Inbound Task-Card First-Step Triage/);
assert.match(contract, /first operational step is classification, not implementation/);
assert.match(contract, /production installation, deployment\/readback, private\s+`hermes-host` execution\/readback/);
assert.match(contract, /Relying on Owner\s+reminders to trigger Worker dispatch is a contract violation/);
assert.match(contract, /Return-Driven Continuation Rule/);
assert.match(contract, /return_continuation_decision/);
assert.match(contract, /original_objective_satisfied/);
assert.match(contract, /continuation_required/);
assert.match(contract, /next_action_type/);
assert.match(contract, /continuation_dispatch_card_id/);
assert.match(contract, /blocked_missing_continuation_dispatch/);
assert.match(contract, /now a Worker can be dispatched/);
assert.match(contract, /Worker Handoff Delta Lifecycle/);
assert.match(contract, /\.agent-context\/worker-handoffs\/active\/<taskCardId>\.md/);
assert.match(contract, /mergeDisposition/);
assert.match(contract, /expiresAfter/);
assert.match(contract, /Codex Mobile thread lifecycle events such as `achieved` and `superseded`/);
assert.match(contract, /node scripts\/worker-handoff-lifecycle-check\.js --json/);

assert.match(implementation, /Inbound cross-thread task cards use a first-step triage pass/);
assert.match(implementation, /source_then_delegate/);
assert.match(implementation, /delegate_deploy_lane/);
assert.match(implementation, /Movie production install\/readback routes to `Movie Deploy Lane`/);
assert.match(implementation, /Codex Mobile production deploy routes to `Codex Mobile Deploy Lane`/);
assert.match(implementation, /Return-driven continuation/);
assert.match(implementation, /return_continuation_decision/);
assert.match(implementation, /next_action_type=dispatch_worker/);
assert.match(implementation, /next_action_type=dispatch_deploy_readback/);
assert.match(implementation, /next_action_type=dispatch_verification_harness/);
assert.match(implementation, /blocked_missing_continuation_dispatch/);
assert.match(implementation, /Worker handoff delta lifecycle/);
assert.match(implementation, /\.agent-context\/worker-handoffs\/archive\/YYYY-MM-DD\/<taskCardId>\.md/);
assert.match(implementation, /discardable/);
assert.match(implementation, /scripts\/worker-handoff-lifecycle-check\.js --json/);
assert.match(implementation, /Latest-turn `completed` is not a lifecycle\s+cleanup signal/);

console.log("autonomous delivery task-card triage docs tests passed");
