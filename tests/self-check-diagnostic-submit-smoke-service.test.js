"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  SMOKE_MODEL_VERSION,
  buildFeatureRequestDiagnosticEvent,
  buildSelfCheckDiagnosticEvent,
  buildSystemResourceDiagnosticEvent,
  runSelfCheckDiagnosticSubmitSmoke,
} = require("../adapters/self-check-diagnostic-submit-smoke-service");
const { SIGNAL_MATRIX_VERSION } = require("../adapters/home-ai-self-improving-loop-service");

async function testSmokeClosesSelfCheckAndKeepsFeatureOwnerGated() {
  const result = await runSelfCheckDiagnosticSubmitSmoke({ nowIso: "2026-07-01T00:00:00.000Z" });
  assert.equal(result.ok, true);
  assert.equal(result.modelVersion, SMOKE_MODEL_VERSION);
  assert.equal(result.matrixVersion, SIGNAL_MATRIX_VERSION);
  assert.equal(result.externalMutation, false);
  assert.equal(result.taskCardDispatchMode, "fake_codex_task_card_service");
  assert.equal(result.actionInboxMode, "fake_owner_action_inbox_service");

  assert.equal(result.selfCheck.ok, true);
  assert.equal(result.selfCheck.submitClosure.ok, true);
  assert.equal(result.selfCheck.submitClosure.eventCount, 2);
  assert.equal(result.selfCheck.submitClosure.autoDispatchedCount, 2);
  assert.equal(result.selfCheck.submitClosure.ownerNotifiedCount, 0);
  assert.equal(result.selfCheck.submitClosure.rows[0].signalId, "plugin_proxy_latency");
  assert.equal(result.selfCheck.submitClosure.rows[0].status, "auto_dispatched");
  assert.equal(result.selfCheck.submitClosure.rows[0].task_card_id, "ttc_smoke_1");
  assert.equal(result.selfCheck.submitClosure.rows[1].signalId, "system_resource_health");
  assert.equal(result.selfCheck.submitClosure.rows[1].status, "auto_dispatched");
  assert.equal(result.selfCheck.submitClosure.rows[1].task_card_id, "ttc_smoke_2");
  assert.equal(result.selfCheck.cases.length, 2);
  assert.equal(result.selfCheck.cases.every((item) => item.status === "card_sent"), true);
  assert.equal(result.selfCheck.taskCardCount, 2);

  assert.equal(result.featureRequestGate.ok, true);
  assert.equal(result.featureRequestGate.ownerNotified, true);
  assert.equal(result.featureRequestGate.autoDispatched, false);
  assert.equal(result.featureRequestGate.dispatchPolicy, "owner_gated");
  assert.equal(result.featureRequestGate.ownerApprovalRequired, true);
  assert.equal(result.featureRequestGate.inboxItemCount, 1);
  assert.equal(result.featureRequestGate.case.status, "card_candidate");
  assert.equal(result.boundedArtifacts.taskCards.length, 2);
  assert.equal(result.boundedArtifacts.inboxItems.length, 1);
  assert.equal(result.privacy.rawSecretsIncluded, false);
  assert.equal(result.privacy.rawPromptsIncluded, false);
  assert.equal(result.privacy.rawLogsIncluded, false);
}

async function testSmokeKeepsExplicitDataDirWhenRequested() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-submit-smoke-test-"));
  const result = await runSelfCheckDiagnosticSubmitSmoke({
    dataDir: dir,
    cleanup: false,
    nowIso: "2026-07-01T00:00:00.000Z",
  });
  assert.equal(result.ok, true);
  assert.equal(result.boundedArtifacts.cleanup, false);
  assert.equal(fs.existsSync(path.join(dir, "ai-ops", "diagnostics", "diagnostics.sqlite")), true);
  fs.rmSync(dir, { recursive: true, force: true });
}

function testFixtureEventsAreBounded() {
  const selfCheckEvent = buildSelfCheckDiagnosticEvent("2026-07-01T00:00:00.000Z");
  assert.equal(selfCheckEvent.plugin_id, "home-ai");
  assert.equal(selfCheckEvent.source_surface, "home-ai-self-check");
  assert.equal(selfCheckEvent.diagnostic_type, "self_check_signal_failed");
  assert.equal(selfCheckEvent.category, "self_check_plugin_proxy");
  assert.deepEqual(selfCheckEvent.context.closure_readbacks, [
    "host_proxy_timing_split",
    "upstream_timing_readback",
    "post_fix_latency_probe",
    "diagnostic_return_card",
  ]);

  const featureEvent = buildFeatureRequestDiagnosticEvent("2026-07-01T00:00:00.000Z");
  assert.equal(featureEvent.diagnostic_type, "capability_gap");
  assert.equal(featureEvent.context.owner_gate_required, true);
  assert.doesNotMatch(JSON.stringify(featureEvent), /secret|token|cookie|prompt|payload/i);

  const systemResourceEvent = buildSystemResourceDiagnosticEvent("2026-07-01T00:00:00.000Z");
  assert.equal(systemResourceEvent.plugin_id, "home-ai");
  assert.equal(systemResourceEvent.source_surface, "home-ai-self-check");
  assert.equal(systemResourceEvent.diagnostic_type, "self_check_signal_failed");
  assert.equal(systemResourceEvent.category, "self_check_system_resource");
  assert.equal(systemResourceEvent.severity_hint, "H1");
  assert.equal(systemResourceEvent.error_code, "system_resource_degraded");
  assert.deepEqual(systemResourceEvent.context.closure_readbacks, [
    "system_resource_status_snapshot",
    "owner_system_console_api_readback",
    "launchd_state_readback",
    "post_fix_resource_probe",
  ]);
  assert.doesNotMatch(JSON.stringify(systemResourceEvent), /secret|token|cookie|prompt|payload/i);
}

(async () => {
  await testSmokeClosesSelfCheckAndKeepsFeatureOwnerGated();
  await testSmokeKeepsExplicitDataDirWhenRequested();
  testFixtureEventsAreBounded();
  console.log("self-check diagnostic submit smoke service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
