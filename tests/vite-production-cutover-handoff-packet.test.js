"use strict";

const assert = require("node:assert/strict");

const {
  CUTOVER_SOURCE_CHANGE_VALIDATION_COMMAND,
  DEFAULT_DEPLOY_LANE_POOL,
  HANDOFF_PACKET_VERSION,
  PRIVACY_BOUNDARY,
  PRODUCTION_READBACK_VALIDATION_COMMAND,
  buildViteProductionCutoverHandoffPacket,
  formatText,
  parseArgs,
} = require("../scripts/vite-production-cutover-handoff-packet");
const {
  PLANNED_DEPLOY_COMMAND,
  REQUIRED_OWNER_APPROVAL_TEXT,
} = require("../scripts/vite-production-cutover-preflight");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

function readinessFixture(overrides = {}) {
  return {
    ok: true,
    checkVersion: "test-readiness",
    sourceOnly: true,
    productionDeployAuthorized: false,
    summary: {
      failedCount: 0,
      warningCount: 0,
    },
    checks: [],
    ...overrides,
  };
}

test("packet blocks without Owner approval and does not create a card", () => {
  const packet = buildViteProductionCutoverHandoffPacket({
    readiness: readinessFixture(),
    env: {},
  });
  assert.equal(packet.ok, false);
  assert.equal(packet.status, "blocked");
  assert.equal(packet.blockedReason, "owner_approval_required");
  assert.equal(packet.packetVersion, HANDOFF_PACKET_VERSION);
  assert.equal(packet.sourceOnly, true);
  assert.equal(packet.productionWrites, false);
  assert.equal(packet.deployExecuted, false);
  assert.equal(packet.deployCardSent, false);
  assert.equal(packet.taskCardCreated, false);
  assert.equal(packet.productionDeployAuthorized, false);
  assert.equal(packet.ownerApproval.recorded, false);
  assert.equal(packet.cutoverSourceChange.status, "not_created");
  assert.equal(packet.deployLaneCardDraft, null);
});

test("packet blocks readiness failures even with exact Owner approval", () => {
  const packet = buildViteProductionCutoverHandoffPacket({
    readiness: readinessFixture({
      ok: false,
      summary: {
        failedCount: 1,
        warningCount: 0,
      },
    }),
    ownerApprovalText: REQUIRED_OWNER_APPROVAL_TEXT,
  });
  assert.equal(packet.ok, false);
  assert.equal(packet.status, "blocked");
  assert.equal(packet.blockedReason, "vite_development_readiness_failed");
  assert.equal(packet.ownerApproval.recorded, true);
  assert.equal(packet.deployLaneCardDraft, null);
});

test("exact Owner approval creates a non-sendable deploy-lane draft only", () => {
  const packet = buildViteProductionCutoverHandoffPacket({
    readiness: readinessFixture(),
    ownerApprovalText: REQUIRED_OWNER_APPROVAL_TEXT,
  });
  assert.equal(packet.ok, true);
  assert.equal(packet.status, "handoff_packet_ready");
  assert.equal(packet.ownerApproval.recorded, true);
  assert.equal(packet.productionWrites, false);
  assert.equal(packet.deployExecuted, false);
  assert.equal(packet.deployCardSent, false);
  assert.equal(packet.taskCardCreated, false);
  assert.equal(packet.productionDeployAuthorized, false);
  assert.equal(packet.cutoverSourceChange.required, true);
  assert.equal(packet.cutoverSourceChange.status, "not_created");
  assert.equal(packet.deployLaneCardDraft.sendable, false);
  assert.equal(packet.deployLaneCardDraft.notSendableReason, "cutover_source_change_not_created");
  assert.equal(packet.deployLaneCardDraft.workflowMode, "manual");
  assert.equal(packet.deployLaneCardDraft.requestedReasoningEffort, "high");
  assert.deepEqual(packet.deployLaneCardDraft.target.preferredThreadTitles, DEFAULT_DEPLOY_LANE_POOL);
  assert.equal(DEFAULT_DEPLOY_LANE_POOL.includes("Home AI Deploy"), true);
  assert.equal(packet.deployLaneCardDraft.requiredPreSendGates.some((gate) => {
    return gate.id === "cutover_source_change_validated" &&
      gate.requiredCommand === CUTOVER_SOURCE_CHANGE_VALIDATION_COMMAND &&
      gate.status === "not_satisfied";
  }), true);
  assert.equal(packet.deployLaneCardDraft.requiredPreSendGates.some((gate) => {
    return gate.id === "production_readback_validator_planned" &&
      gate.requiredCommand === PRODUCTION_READBACK_VALIDATION_COMMAND;
  }), true);
  assert.equal(packet.deployLaneCardDraft.bodyMarkdown.includes(PLANNED_DEPLOY_COMMAND), true);
  assert.equal(packet.deployLaneCardDraft.bodyMarkdown.includes("npm run verify:vite-dev"), true);
  assert.equal(packet.deployLaneCardDraft.bodyMarkdown.includes(CUTOVER_SOURCE_CHANGE_VALIDATION_COMMAND), true);
  assert.equal(packet.deployLaneCardDraft.bodyMarkdown.includes("node tests/vite-production-readback-validator.test.js"), true);
  assert.equal(packet.deployLaneCardDraft.bodyMarkdown.includes(PRODUCTION_READBACK_VALIDATION_COMMAND), true);
  assert.equal(packet.deployLaneCardDraft.bodyMarkdown.includes("selected_shell_mode"), true);
  assert.equal(packet.deployLaneCardDraft.bodyMarkdown.includes("voice_pending_cancel"), true);
  assert.equal(packet.deployLaneCardDraft.bodyMarkdown.includes("wardrobe_usage_action"), true);
  assert.equal(packet.deployLaneCardDraft.bodyMarkdown.includes("launch tokens"), true);
});

test("packet exposes bounded production readback and privacy requirements", () => {
  const packet = buildViteProductionCutoverHandoffPacket({
    readiness: readinessFixture(),
    ownerApprovalText: REQUIRED_OWNER_APPROVAL_TEXT,
  });
  assert.equal(packet.requiredProductionReadback.some((check) => check.id === "plugin_host_manifest_proxy"), true);
  assert.equal(packet.requiredProductionReadback.some((check) => check.id === "document_preview_delivery"), true);
  assert.equal(packet.requiredProductionReadback.some((check) => check.id === "rollback_switch"), true);
  assert.deepEqual(packet.privacyBoundary, PRIVACY_BOUNDARY);
  for (const entry of packet.privacyBoundary) {
    assert.equal(typeof entry, "string");
    assert.notEqual(entry, "");
  }
});

test("text formatter includes source-only and no-card boundaries", () => {
  const packet = buildViteProductionCutoverHandoffPacket({
    readiness: readinessFixture(),
    ownerApprovalText: REQUIRED_OWNER_APPROVAL_TEXT,
  });
  const text = formatText(packet);
  assert.match(text, /sourceOnly: true/);
  assert.match(text, /productionWrites: false/);
  assert.match(text, /deployExecuted: false/);
  assert.match(text, /deployCardSent: false/);
  assert.match(text, /deployLaneDraftSendable: false/);
});

test("argument parsing supports exact approval and built asset options", () => {
  const options = parseArgs([
    "--json",
    "--require-approved",
    "--no-require-built-assets",
    `--owner-approval-text=${REQUIRED_OWNER_APPROVAL_TEXT}`,
  ]);
  assert.equal(options.json, true);
  assert.equal(options.requireApproved, true);
  assert.equal(options.requireBuiltAssets, false);
  assert.equal(options.ownerApprovalText, REQUIRED_OWNER_APPROVAL_TEXT);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
