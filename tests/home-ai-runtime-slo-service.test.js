"use strict";

const assert = require("node:assert/strict");

const {
  DEFAULT_SIGNALS,
  SIGNAL_MATRIX_VERSION,
} = require("../adapters/home-ai-self-improving-loop-service");
const {
  RUNTIME_SLO_MODEL_VERSION,
  auditRuntimeSloModel,
  buildRuntimeSloModel,
} = require("../adapters/home-ai-runtime-slo-service");

function sorted(values) {
  return [...values].sort();
}

function testBuildRuntimeSloModel() {
  const model = buildRuntimeSloModel({ nowIso: "2026-07-01T00:00:00.000Z" });
  assert.equal(model.ok, true);
  assert.equal(model.modelVersion, RUNTIME_SLO_MODEL_VERSION);
  assert.equal(model.matrixVersion, SIGNAL_MATRIX_VERSION);
  assert.equal(model.dimensionCount, 3);
  assert.equal(model.signalCount, DEFAULT_SIGNALS.length);
  assert.equal(model.sloCount, DEFAULT_SIGNALS.length);
  assert.deepEqual(sorted(model.dimensions.map((item) => item.id)), ["accuracy", "autonomy", "availability"]);
  assert.deepEqual(
    sorted(model.slos.map((item) => item.signalId)),
    sorted(DEFAULT_SIGNALS.map((item) => item.id)),
  );
  assert.equal(model.slos.find((item) => item.signalId === "plugin_proxy_latency").dimension, "availability");
  assert.equal(model.slos.find((item) => item.signalId === "gateway_document_tool_capability").dimension, "accuracy");
  assert.equal(model.slos.find((item) => item.signalId === "task_card_dispatch").dimension, "autonomy");
  assert.equal(model.slos.find((item) => item.signalId === "plugin_action_metadata_health").dimension, "accuracy");
  assert.equal(model.slos.every((item) => item.productionClosureRequired), true);
  assert.equal(model.policy.ownerGateForFeatureOrCapabilityRequests, true);
}

function testEverySloCarriesDiagnosticClosureFields() {
  const model = buildRuntimeSloModel();
  for (const slo of model.slos) {
    assert.ok(slo.owner, `${slo.signalId} should carry owner`);
    assert.ok(slo.evidence.length > 0, `${slo.signalId} should carry bounded evidence fields`);
    assert.ok(slo.closureReadbacks.length > 0, `${slo.signalId} should carry closure readbacks`);
    assert.ok(slo.checks.length > 0, `${slo.signalId} should carry checks`);
    assert.match(slo.diagnosticCategory, /^self_check_/);
    assert.equal(slo.repairRouting.requiresReturnCard, true);
    assert.equal(slo.repairRouting.ownerGateForFeatureOrCapabilityRequests, true);
  }
}

function testRuntimeSloAuditPassesForCurrentMatrix() {
  const audit = auditRuntimeSloModel({ nowIso: "2026-07-01T00:00:00.000Z" });
  assert.equal(audit.ok, true);
  assert.equal(audit.status, "covered");
  assert.equal(audit.issueCount, 0);
  assert.equal(audit.unmappedSignalCount, 0);
  assert.equal(audit.duplicateSignalCount, 0);
  assert.equal(audit.sloCount, DEFAULT_SIGNALS.length);
}

function testRuntimeSloAuditFailsClosedForUnmappedSignal() {
  const extraSignal = Object.freeze({
    id: "new_signal_without_slo_mapping",
    title: "New signal without SLO mapping",
    domain: "new_signal",
    owner: "home-ai-platform",
    severity: "H2",
    source: "unit-test",
    expected: "new signal has a maintained SLO dimension",
    threshold: "missing SLO mapping fails closed",
    evidence: ["status"],
    closureReadbacks: ["new_signal_readback"],
    target: "Home AI",
    checks: ["node tests/home-ai-runtime-slo-service.test.js"],
  });
  const audit = auditRuntimeSloModel({ signals: [...DEFAULT_SIGNALS, extraSignal] });
  assert.equal(audit.ok, false);
  assert.equal(audit.status, "coverage_gap");
  assert.equal(audit.unmappedSignalCount, 1);
  assert.equal(
    audit.issues.some((item) => item.code === "runtime_slo_dimension_unmapped" && item.signalId === "new_signal_without_slo_mapping"),
    true,
  );
}

testBuildRuntimeSloModel();
testEverySloCarriesDiagnosticClosureFields();
testRuntimeSloAuditPassesForCurrentMatrix();
testRuntimeSloAuditFailsClosedForUnmappedSignal();

console.log("Home AI runtime SLO service tests passed");
