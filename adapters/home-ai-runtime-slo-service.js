"use strict";

const {
  DEFAULT_SIGNALS,
  SIGNAL_MATRIX_VERSION,
  buildSignalMatrix,
} = require("./home-ai-self-improving-loop-service");

const RUNTIME_SLO_MODEL_VERSION = "20260701-runtime-slo-v4";

const SEVERITY_RANK = Object.freeze({ info: 0, H4: 1, H3: 2, H2: 3, H1: 4 });

const RUNTIME_SLO_DIMENSIONS = Object.freeze([
  Object.freeze({
    id: "availability",
    title: "Availability",
    objective: "Key Home AI user paths remain reachable, responsive, and recoverable on the real production path.",
  }),
  Object.freeze({
    id: "accuracy",
    title: "Accuracy",
    objective: "Host, Gateway, plugin, MCP schema, message projection, and UI action state agree across boundaries.",
  }),
  Object.freeze({
    id: "autonomy",
    title: "Autonomy",
    objective: "Recurring failures become bounded diagnostics, repair cards, deploy/readback evidence, and explicit closure.",
  }),
]);

const SIGNAL_TO_DIMENSION = Object.freeze({
  system_resource_health: "availability",
  gateway_profile_health: "availability",
  mcp_schema_closure: "accuracy",
  deploy_lane_liveness: "availability",
  task_card_dispatch: "autonomy",
  plugin_proxy_latency: "availability",
  composer_runtime_feedback: "accuracy",
  media_preview_health: "availability",
  gateway_document_tool_capability: "accuracy",
  plugin_deploy_contract_closure: "autonomy",
  plugin_proxy_workspace_boundary: "accuracy",
  native_bridge_capability: "availability",
  notification_delivery: "availability",
  plugin_manifest_health: "accuracy",
  plugin_action_metadata_health: "accuracy",
  audit_thread_liveness: "autonomy",
  automation_cron_health: "autonomy",
  production_self_diagnostics: "autonomy",
  public_upgrade_rehearsal: "autonomy",
  install_upgrade_canary: "autonomy",
  runtime_slo_coverage: "autonomy",
});

function cleanString(value, maxLength = 240) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeToken(value, defaultValue = "unknown", maxLength = 120) {
  const token = cleanString(value, maxLength)
    .replace(/[^A-Za-z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return token || defaultValue;
}

function normalizeSeverity(value, defaultValue = "H2") {
  const raw = cleanString(value || defaultValue, 20).toUpperCase();
  if (raw === "H1" || raw === "H2" || raw === "H3" || raw === "H4") return raw;
  if (raw === "INFO") return "info";
  return defaultValue;
}

function severityRank(value) {
  return SEVERITY_RANK[normalizeSeverity(value, "info")] || 0;
}

function normalizedList(value = [], maxItems = 64) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value.slice(0, maxItems)) {
    const token = safeToken(item, "", 180);
    if (token && !out.includes(token)) out.push(token);
  }
  return out;
}

function dimensionById(id) {
  return RUNTIME_SLO_DIMENSIONS.find((item) => item.id === id) || null;
}

function diagnosticCategoryForSignal(signal) {
  return `self_check_${safeToken(signal.domain || signal.id, "unknown", 80)}`;
}

function repairRoutingForSignal(signal) {
  const severity = normalizeSeverity(signal.severity, "H2");
  const autoDispatchEligible = severityRank(severity) >= severityRank("H2");
  return {
    policy: autoDispatchEligible
      ? "self_check_auto_dispatch_after_ai_ops_gate"
      : "owner_gated_or_manual_review",
    target: cleanString(signal.target || "Home AI", 120),
    owner: cleanString(signal.owner || "home-ai-platform", 120),
    autoDispatchEligible,
    ownerGateForFeatureOrCapabilityRequests: true,
    requiresReturnCard: true,
  };
}

function sloFromSignal(signal, index) {
  const signalId = safeToken(signal.id, "unknown_signal", 100);
  const dimensionId = SIGNAL_TO_DIMENSION[signalId] || "unmapped";
  const dimension = dimensionById(dimensionId);
  const closureReadbacks = normalizedList(signal.closureReadbacks || [], 32);
  const checks = Array.isArray(signal.checks)
    ? signal.checks.map((item) => cleanString(item, 240)).filter(Boolean)
    : [];
  return {
    id: `runtime_slo_${String(index + 1).padStart(2, "0")}_${signalId}`,
    signalId,
    dimension: dimension ? dimension.id : "unmapped",
    title: cleanString(signal.title || signalId, 180),
    severity: normalizeSeverity(signal.severity, "H2"),
    owner: cleanString(signal.owner || "", 160),
    source: cleanString(signal.source || "", 160),
    expected: cleanString(signal.expected || "", 320),
    threshold: cleanString(signal.threshold || "", 320),
    evidence: normalizedList(signal.evidence || [], 64),
    closureReadbacks,
    checks,
    diagnosticCategory: diagnosticCategoryForSignal(Object.assign({}, signal, { id: signalId })),
    repairRouting: repairRoutingForSignal(signal),
    productionClosureRequired: closureReadbacks.length > 0,
  };
}

function buildRuntimeSloModel(options = {}) {
  const signals = Array.isArray(options.signals) && options.signals.length ? options.signals : DEFAULT_SIGNALS;
  const matrix = buildSignalMatrix({ signals, nowIso: options.nowIso });
  const slos = matrix.signals.map(sloFromSignal);
  const dimensions = RUNTIME_SLO_DIMENSIONS.map((dimension) => {
    const signalIds = slos.filter((slo) => slo.dimension === dimension.id).map((slo) => slo.signalId);
    return Object.assign({}, dimension, {
      signalCount: signalIds.length,
      signalIds,
    });
  });
  const unmappedSignalIds = slos.filter((slo) => slo.dimension === "unmapped").map((slo) => slo.signalId);
  return {
    ok: unmappedSignalIds.length === 0,
    schemaVersion: 1,
    modelVersion: RUNTIME_SLO_MODEL_VERSION,
    matrixVersion: SIGNAL_MATRIX_VERSION,
    generatedAt: matrix.generatedAt,
    dimensionCount: dimensions.length,
    signalCount: matrix.signalCount,
    sloCount: slos.length,
    dimensions,
    unmappedSignalIds,
    slos,
    policy: {
      outputPolicy: "bounded metadata only",
      noSilentFallback: true,
      noRestartAsClosure: true,
      closureRequiresReadback: true,
      selfCheckAutomationMayAutoDispatch: true,
      ownerGateForFeatureOrCapabilityRequests: true,
    },
  };
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return Array.from(duplicates);
}

function auditRuntimeSloModel(options = {}) {
  const model = buildRuntimeSloModel(options);
  const signalIds = model.slos.map((slo) => slo.signalId);
  const duplicateSignalIds = duplicateValues(signalIds);
  const issues = [];

  for (const signalId of model.unmappedSignalIds) {
    issues.push({
      code: "runtime_slo_dimension_unmapped",
      signalId,
      severity: "H2",
      status: "missing_dimension_mapping",
    });
  }

  for (const signalId of duplicateSignalIds) {
    issues.push({
      code: "runtime_slo_duplicate_signal",
      signalId,
      severity: "H2",
      status: "duplicate_signal_mapping",
    });
  }

  for (const dimension of model.dimensions) {
    if (dimension.signalCount === 0) {
      issues.push({
        code: "runtime_slo_dimension_empty",
        dimension: dimension.id,
        severity: "H2",
        status: "empty_dimension",
      });
    }
  }

  for (const slo of model.slos) {
    if (!slo.owner) {
      issues.push({ code: "runtime_slo_owner_missing", signalId: slo.signalId, severity: "H2", status: "missing_owner" });
    }
    if (!slo.evidence.length) {
      issues.push({ code: "runtime_slo_evidence_missing", signalId: slo.signalId, severity: "H2", status: "missing_evidence" });
    }
    if (!slo.closureReadbacks.length) {
      issues.push({ code: "runtime_slo_closure_readback_missing", signalId: slo.signalId, severity: "H2", status: "missing_closure_readback" });
    }
    if (!slo.checks.length) {
      issues.push({ code: "runtime_slo_checks_missing", signalId: slo.signalId, severity: "H2", status: "missing_checks" });
    }
    if (!slo.diagnosticCategory || !slo.diagnosticCategory.startsWith("self_check_")) {
      issues.push({ code: "runtime_slo_diagnostic_category_missing", signalId: slo.signalId, severity: "H2", status: "missing_diagnostic_category" });
    }
    if (severityRank(slo.severity) >= severityRank("H2") && !slo.repairRouting.autoDispatchEligible) {
      issues.push({ code: "runtime_slo_repair_routing_missing", signalId: slo.signalId, severity: "H2", status: "missing_repair_routing" });
    }
  }

  return {
    ok: issues.length === 0,
    schemaVersion: 1,
    modelVersion: model.modelVersion,
    matrixVersion: model.matrixVersion,
    generatedAt: model.generatedAt,
    status: issues.length ? "coverage_gap" : "covered",
    dimensionCount: model.dimensionCount,
    signalCount: model.signalCount,
    sloCount: model.sloCount,
    issueCount: issues.length,
    unmappedSignalCount: model.unmappedSignalIds.length,
    duplicateSignalCount: duplicateSignalIds.length,
    dimensions: model.dimensions.map((dimension) => ({
      id: dimension.id,
      signalCount: dimension.signalCount,
      signalIds: dimension.signalIds,
    })),
    issues,
    model,
  };
}

module.exports = {
  RUNTIME_SLO_DIMENSIONS,
  RUNTIME_SLO_MODEL_VERSION,
  SIGNAL_TO_DIMENSION,
  auditRuntimeSloModel,
  buildRuntimeSloModel,
};
