"use strict";

const assert = require("node:assert/strict");

const {
  REQUIRED_DELTA_IDS,
  VITE_DEV_ACCEPTANCE_PACKET_VERSION,
  buildViteDevelopmentAcceptancePacket,
  formatText,
  parseArgs,
} = require("../scripts/vite-development-acceptance-packet");

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

function step(id, status = "passed", command = `node ${id}.test.js`) {
  return { id, status, command };
}

function acceptanceReport(overrides = {}) {
  return {
    ok: true,
    status: "development_acceptance_passed",
    reportVersion: "test-report",
    sourceOnly: true,
    productionWrites: false,
    deployExecuted: false,
    productionDeployAuthorized: false,
    summary: {
      stepCount: 8,
      passedStepCount: 8,
      failedStepCount: 0,
      failedStepIds: [],
    },
    steps: [
      step("build_vite", "passed", "npm run build:vite"),
      step("audit_vite_globals", "passed", "npm run audit:vite-globals -- --json"),
      step("vite_preview_routes_smoke", "passed", "node tests/vite-dev-preview-routes-smoke.test.js"),
      step("vite_real_backend_parity_smoke", "passed", "node tests/vite-dev-real-backend-parity-smoke.test.js"),
      step("vite_dev_user_journeys_smoke", "passed", "npm run smoke:vite-dev-user-journeys"),
      step("vite_development_readiness", "passed", "npm run check:vite-readiness"),
      step("vite_preview_cache_policy", "passed", "npm run check:vite-cache-policy"),
      step("vite_owner_review_report", "passed", "npm run review:vite-cutover"),
    ],
    ownerApprovalRequest: {
      status: "ready_to_request_owner_approval",
      productionWrites: false,
      deployExecuted: false,
    },
    ...overrides,
  };
}

test("builds a source-only auditable development acceptance packet", () => {
  const packet = buildViteDevelopmentAcceptancePacket({
    acceptanceReport: acceptanceReport(),
  });
  assert.equal(packet.ok, true);
  assert.equal(packet.status, "dev_acceptance_packet_ready");
  assert.equal(packet.packetVersion, VITE_DEV_ACCEPTANCE_PACKET_VERSION);
  assert.equal(packet.sourceOnly, true);
  assert.equal(packet.productionWrites, false);
  assert.equal(packet.deployExecuted, false);
  assert.equal(packet.productionDeployAuthorized, false);
  assert.equal(packet.scope.developmentOnly, true);
  assert.equal(packet.scope.productionCutoverAllowed, false);
  assert.equal(packet.auditPacket.sections.length, 5);
  assert.ok(packet.migratedDevelopmentSurfaces.includes("runtime_state_event_bus"));
  assert.deepEqual(packet.auditPacket.missingDeltaIds, []);
  assert.deepEqual(packet.auditPacket.failedDeltaIds, []);
  assert.deepEqual(packet.auditPacket.deltaMatrix.map((entry) => entry.id), REQUIRED_DELTA_IDS);
  assert.ok(packet.migratedDevelopmentSurfaces.includes("plugin_iframe_lifecycle_model"));
  assert.ok(
    packet.auditPacket.sections
      .find((section) => section.id === "implementation_packet")
      .evidence.includes("plugin_iframe_lifecycle_model"),
  );
  assert.ok(packet.remainingProductionSurfaces.includes("production_cutover_source_change"));
  assert.ok(packet.riskRegister.some((entry) => entry.id === "classic_runtime_fallback_retired"));
  assert.doesNotMatch(JSON.stringify(packet), /Bearer|launchToken|sk-/);
});

test("marks packet incomplete when user journey evidence is missing", () => {
  const report = acceptanceReport({
    ok: false,
    status: "development_acceptance_failed",
    summary: {
      stepCount: 6,
      passedStepCount: 5,
      failedStepCount: 1,
      failedStepIds: ["vite_preview_routes_smoke"],
    },
    steps: [
      step("build_vite"),
      step("audit_vite_globals"),
      step("vite_preview_routes_smoke", "failed"),
      step("vite_real_backend_parity_smoke"),
      step("vite_dev_user_journeys_smoke"),
      step("vite_development_readiness"),
      step("vite_preview_cache_policy"),
      step("vite_owner_review_report"),
    ],
  });
  const packet = buildViteDevelopmentAcceptancePacket({ acceptanceReport: report });
  assert.equal(packet.ok, false);
  assert.equal(packet.status, "dev_acceptance_packet_incomplete");
  assert.ok(packet.auditPacket.failedDeltaIds.includes("user_journey_vs_acceptance"));
  assert.ok(packet.auditPacket.failedDeltaIds.includes("implementation_vs_validation"));
});

test("text formatter and parser expose bounded packet state", () => {
  const packet = buildViteDevelopmentAcceptancePacket({
    acceptanceReport: acceptanceReport(),
  });
  const text = formatText(packet);
  assert.match(text, /sourceOnly: true/);
  assert.match(text, /productionWrites: false/);
  assert.match(text, /deltaMatrix: 6\/6 passed/);
  assert.deepEqual(parseArgs(["--json", "--acceptance-json", "/tmp/report.json"]), {
    json: true,
    acceptanceJson: "/tmp/report.json",
  });
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
