"use strict";

const assert = require("node:assert/strict");

const {
  REQUIRED_DELTA_IDS,
  REQUIRED_MIGRATED_SURFACES,
  REQUIRED_REMAINING_PRODUCTION_SURFACES,
  REQUIRED_VALIDATION_COMMAND_MARKERS,
  VITE_DEV_GOAL_AUDIT_VERSION,
  buildViteDevelopmentGoalAudit,
  formatText,
  parseArgs,
} = require("../scripts/vite-development-goal-audit");

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

function packet(overrides = {}) {
  return {
    ok: true,
    status: "dev_acceptance_packet_ready",
    sourceOnly: true,
    productionWrites: false,
    deployExecuted: false,
    productionDeployAuthorized: false,
    scope: {
      developmentOnly: true,
      productionCutoverAllowed: false,
      publicPushAllowed: false,
      userDataMutationAllowed: false,
    },
    migratedDevelopmentSurfaces: [...REQUIRED_MIGRATED_SURFACES],
    remainingProductionSurfaces: [...REQUIRED_REMAINING_PRODUCTION_SURFACES],
    auditPacket: {
      sections: [
        { id: "requirements_packet", evidence: [] },
        { id: "design_contract_packet", evidence: [] },
        { id: "implementation_packet", evidence: [] },
        { id: "validation_packet", evidence: [...REQUIRED_VALIDATION_COMMAND_MARKERS] },
        { id: "privacy_packet", evidence: [] },
      ],
      deltaMatrix: REQUIRED_DELTA_IDS.map((id) => ({ id, status: "passed" })),
    },
    acceptanceSummary: {
      ok: true,
      status: "development_acceptance_passed",
      stepCount: 16,
      passedStepCount: 16,
      failedStepCount: 0,
      failedStepIds: [],
    },
    ownerApprovalRequest: {
      status: "ready_to_request_owner_approval",
      requiredForProduction: true,
      productionWrites: false,
      deployExecuted: false,
      deployCardSent: false,
      nextAllowedAction: "request_exact_owner_approval",
      afterApprovalSequence: [
        "create_fail_closed_cutover_source_change",
        "rerun_planned_validation",
        "convert_handoff_packet_into_real_deploy_lane_card",
        "central_mac_deploy_and_bounded_readback",
      ],
    },
    ...overrides,
  };
}

test("verifies the source-only Vite development goal from a ready packet", () => {
  const result = buildViteDevelopmentGoalAudit({ packet: packet() });
  assert.equal(result.ok, true);
  assert.equal(result.status, "development_goal_complete_verified");
  assert.equal(result.auditVersion, VITE_DEV_GOAL_AUDIT_VERSION);
  assert.equal(result.sourceOnly, true);
  assert.equal(result.productionWrites, false);
  assert.equal(result.deployExecuted, false);
  assert.equal(result.productionDeployAuthorized, false);
  assert.equal(result.summary.failedCount, 0);
  assert.deepEqual(result.summary.failedIds, []);
  assert.equal(result.checks.every((entry) => entry.status === "passed"), true);
});

test("fails when a required migrated development surface is missing", () => {
  const broken = packet({
    migratedDevelopmentSurfaces: REQUIRED_MIGRATED_SURFACES.filter((id) => id !== "chat_runtime_island"),
  });
  const result = buildViteDevelopmentGoalAudit({ packet: broken });
  assert.equal(result.ok, false);
  assert.equal(result.status, "development_goal_incomplete");
  assert.ok(result.summary.failedIds.includes("migrated_development_surfaces"));
  const check = result.checks.find((entry) => entry.id === "migrated_development_surfaces");
  assert.deepEqual(check.missing, ["chat_runtime_island"]);
});

test("fails when production boundary is accidentally authorized", () => {
  const result = buildViteDevelopmentGoalAudit({
    packet: packet({
      productionDeployAuthorized: true,
      scope: {
        developmentOnly: true,
        productionCutoverAllowed: true,
        publicPushAllowed: false,
        userDataMutationAllowed: false,
      },
    }),
  });
  assert.equal(result.ok, false);
  assert.ok(result.summary.failedIds.includes("source_only_boundary"));
});

test("fails when validation command coverage loses browser journey smoke", () => {
  const result = buildViteDevelopmentGoalAudit({
    packet: packet({
      auditPacket: {
        sections: [
          { id: "requirements_packet", evidence: [] },
          { id: "design_contract_packet", evidence: [] },
          { id: "implementation_packet", evidence: [] },
          {
            id: "validation_packet",
            evidence: REQUIRED_VALIDATION_COMMAND_MARKERS
              .filter((command) => !command.includes("smoke:vite-dev-user-journeys")),
          },
          { id: "privacy_packet", evidence: [] },
        ],
        deltaMatrix: REQUIRED_DELTA_IDS.map((id) => ({ id, status: "passed" })),
      },
    }),
  });
  assert.equal(result.ok, false);
  assert.ok(result.summary.failedIds.includes("validation_command_coverage"));
  const check = result.checks.find((entry) => entry.id === "validation_command_coverage");
  assert.deepEqual(check.missing, ["npm run --silent smoke:vite-dev-user-journeys"]);
});

test("formatter and parser expose the dev-only completion boundary", () => {
  const result = buildViteDevelopmentGoalAudit({ packet: packet() });
  const text = formatText(result);
  assert.match(text, /development_goal_complete_verified/);
  assert.match(text, /productionDeployAuthorized: false/);
  assert.deepEqual(parseArgs(["--json", "--require-ok", "--packet-json=/tmp/packet.json"]), {
    json: true,
    requireOk: true,
    packetJson: "/tmp/packet.json",
  });
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
