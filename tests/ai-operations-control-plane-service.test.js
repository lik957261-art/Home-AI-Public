"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const service = require("../adapters/ai-operations-control-plane-service");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "homeai-ai-ops-"));
}

{
  const pack = service.buildTaskContextPack({
    taskText: "Fix Codex mobile PWA bottom safe area visual bug",
    changedFiles: ["public/app-embedded-plugin-ui.js", "scripts/ios-pwa-visual-harness.js"],
  });
  assert.equal(pack.ok, true);
  assert.equal(pack.harnessClass, "H2");
  assert.ok(pack.modules.includes("Mobile Visual Debug And PWA Harness"));
  assert.ok(pack.requiredDocs.includes("docs/PLATFORM_CONTRACTS/plugin-mobile-ui-visual-contract.md"));
  assert.equal(pack.rootCauseGovernance.required, true);
  assert.equal(pack.rootCauseGovernance.fallbackPolicy.silentFallbackAllowed, false);
  assert.ok(pack.blockedIf.includes("root_cause_classification_missing"));
  assert.ok(pack.blockedIf.includes("fallback_status_unclassified"));
  assert.equal(pack.visualLane.required, true);
  assert.ok(pack.requiredChecks.some((item) => item.command.includes("ios-pwa-visual-harness.test.js")));
  assert.ok(pack.requiredChecks.some((item) => item.command.includes("fallback-governance-check.js")));
  assert.ok(pack.requiredChecks.some((item) => item.command === "node --check public/app-embedded-plugin-ui.js"));
}

{
  const plan = service.selectRequiredChecks({
    taskText: "Deploy production plugin MCP schema fix",
    changedFiles: ["adapters/hermes-plugin-service.js", "scripts/deploy-macos-production.js"],
  });
  assert.equal(plan.harnessClass, "H1");
  assert.equal(plan.deploymentRequired, true);
  assert.equal(plan.rootCauseGovernanceRequired, true);
  assert.ok(plan.requiredDocs.includes("docs/MODULES/plugins.md"));
  assert.ok(plan.requiredDocs.includes("docs/MODULES/deployment.md"));
  assert.ok(plan.requiredDocs.includes("docs/PLATFORM_CONTRACTS/fallback-governance-contract.md"));
  assert.ok(plan.requiredChecks.some((item) => item.command.includes("hermes-plugin-service.test.js")));
  assert.ok(plan.requiredChecks.some((item) => item.command.includes("fallback-governance-check.js")));
  assert.ok(plan.requiredChecks.some((item) => item.command.includes("deploy:macos")));
}

{
  const plan = service.selectRequiredChecks({
    taskText: "AI Operations Control Plane evidence ledger",
    changedFiles: ["adapters/ai-operations-control-plane-service.js"],
  });
  assert.equal(plan.harnessClass, "H1");
  assert.equal(plan.rootCauseGovernanceRequired, true);
  assert.ok(plan.modules.includes("AI Operations Control Plane"));
  assert.ok(plan.requiredChecks.some((item) => item.command === "node tests/ai-operations-control-plane-service.test.js"));
  assert.ok(plan.requiredChecks.some((item) => item.command.includes("fallback-governance-check.js")));
}

{
  const plan = service.selectRequiredChecks({
    taskText: "Autonomous Delivery Loop intent intake",
    changedFiles: [
      "adapters/autonomous-delivery-intake-service.js",
      "scripts/autonomous-delivery-loop.js",
    ],
  });
  assert.equal(plan.harnessClass, "H2");
  assert.equal(plan.rootCauseGovernanceRequired, true);
  assert.ok(plan.modules.includes("Autonomous Delivery Loop"));
  assert.ok(plan.requiredDocs.includes("docs/PLATFORM_CONTRACTS/autonomous-delivery-loop-contract.md"));
  assert.ok(plan.requiredDocs.includes("docs/IMPLEMENTATION_NOTES/autonomous-delivery-loop.md"));
  assert.ok(plan.requiredChecks.some((item) => item.command === "node tests/autonomous-delivery-intake-service.test.js"));
  assert.ok(plan.requiredChecks.some((item) => item.command === "node tests/autonomous-delivery-coordinator-service.test.js"));
  assert.ok(plan.requiredChecks.some((item) => item.command === "node tests/autonomous-delivery-api-routes.test.js"));
  assert.ok(plan.requiredChecks.some((item) => item.command === "node tests/app-action-inbox-ui.test.js"));
  assert.ok(plan.requiredChecks.some((item) => item.command === "node --check adapters/autonomous-delivery-intake-service.js"));
  assert.ok(plan.requiredChecks.some((item) => item.command === "node --check scripts/autonomous-delivery-loop.js"));
  assert.ok(plan.requiredChecks.some((item) => item.command.includes("fallback-governance-check.js")));
}

{
  const root = tempRoot();
  const stateFile = path.join(root, "lanes.json");
  const first = service.allocateVisualLane({
    stateFile,
    pluginId: "codex-mobile",
    requester: "thread-a",
    now: "2026-06-09T00:00:00.000Z",
    ttlMs: 10000,
  });
  assert.equal(first.ok, true);
  assert.equal(first.lane.id, "ios-pwa-1");
  assert.equal(first.lane.liveDebugPort, 19073);
  assert.match(first.lane.commands.startLiveDebug, /--port 19073/);
  assert.match(first.lane.commands.startLiveDebug, /--appium-url http:\/\/127\.0\.0\.1:4723/);
  const second = service.allocateVisualLane({
    stateFile,
    pluginId: "note",
    requester: "thread-b",
    now: "2026-06-09T00:00:01.000Z",
    ttlMs: 10000,
  });
  assert.equal(second.ok, true);
  assert.equal(second.lane.id, "ios-pwa-2");
  assert.match(second.lane.commands.startLiveDebug, /--appium-url http:\/\/127\.0\.0\.1:4724/);
  const release = service.releaseVisualLane({ stateFile, leaseId: first.lane.lease.id });
  assert.equal(release.ok, true);
  const third = service.allocateVisualLane({
    stateFile,
    pluginId: "health",
    requester: "thread-c",
    now: "2026-06-09T00:00:02.000Z",
    ttlMs: 10000,
  });
  assert.equal(third.ok, true);
  assert.equal(third.lane.id, "ios-pwa-1");
}

{
  const root = tempRoot();
  const stateFile = path.join(root, "lanes.json");
  for (const pluginId of ["finance", "note", "health"]) {
    assert.equal(service.allocateVisualLane({ stateFile, pluginId, requester: pluginId, ttlMs: 10000 }).ok, true);
  }
  const fourth = service.allocateVisualLane({ stateFile, pluginId: "wardrobe", requester: "wardrobe", ttlMs: 10000 });
  assert.equal(fourth.ok, false);
  assert.equal(fourth.error, "lane_unavailable");
  assert.equal(fourth.activeLeases.length, 3);
}

{
  const root = tempRoot();
  const ledgerPath = path.join(root, "ledger.jsonl");
  const appended = service.appendEvidenceRecord({
    ledgerPath,
    kind: "test",
    status: "passed",
    summary: "focused test passed",
    command: "curl -H 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456' http://example.test",
    commit: "abc1234",
    metadata: { accessKey: "super-secret-value", nested: { token: "token-value" } },
  });
  assert.equal(appended.ok, true);
  assert.doesNotMatch(JSON.stringify(appended.record), /abcdefghijklmnopqrstuvwxyz123456/);
  assert.doesNotMatch(JSON.stringify(appended.record), /super-secret-value/);
  const listed = service.listEvidenceRecords({ ledgerPath });
  assert.equal(listed.records.length, 1);
  const verified = service.verifyEvidenceLedger({ ledgerPath, requiredKinds: ["test"], requiredStatuses: ["passed"], commitPrefix: "abc" });
  assert.equal(verified.ok, true);
  const missing = service.verifyEvidenceLedger({ ledgerPath, requiredKinds: ["deploy"] });
  assert.equal(missing.ok, false);
  assert.ok(missing.issues.includes("evidence_kind_missing:deploy"));
}

{
  const root = tempRoot();
  const created = service.createIncidentCassette({
    dir: root,
    now: "2026-06-09T01:02:03.000Z",
    symptom: "Note save failed with token abcdefghijklmnopqrstuvwxyz123456",
    issueCode: "note_save_failed",
    workspaceId: "weixin_wuping",
    pluginId: "note",
    clientVersion: "20260609-test",
    gateway: { authorization: "Bearer abcdefghijklmnopqrstuvwxyz123456", profile: "hm-wuping-openai-1" },
    reproductionSteps: ["Open Note receipt", "Click save"],
    expectedChecks: ["node tests/note-receipt-save-service.test.js"],
  });
  assert.equal(created.ok, true);
  assert.ok(fs.existsSync(created.file));
  assert.match(created.id, /^incident-20260609T010203Z-note-save-failed/);
  const text = fs.readFileSync(created.file, "utf8");
  assert.doesNotMatch(text, /abcdefghijklmnopqrstuvwxyz123456/);
  const listed = service.listIncidentCassettes({ dir: root });
  assert.equal(listed.incidents.length, 1);
  assert.equal(listed.incidents[0].pluginId, "note");
}

console.log("AI Operations Control Plane service tests passed");
