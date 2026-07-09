"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const {
  buildDeployLaneGovernanceReport,
  validateDeployCardSourceAuthorization,
} = require("./central-deploy-governance-service");

const TERMINAL_STATUSES = new Set([
  "completed",
  "partially_completed",
  "redirected",
  "blocked",
  "rejected",
]);

const DEPLOY_PHASES = new Set([
  "queued",
  "deploy",
  "restart",
  "hash-readback",
  "runtime-gate",
  "handoff",
  "return",
  "completed",
  "blocked",
  "failed",
]);

function cleanString(value, maxLength = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizePluginId(value) {
  const pluginId = cleanString(value, 80).toLowerCase();
  if (!pluginId) return "";
  if (pluginId === "health") return "healthy";
  return pluginId;
}

function shortHash(value) {
  const text = cleanString(value, 1000);
  if (!text) return "";
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function cardBody(card = {}) {
  return cleanString(card.bodyMarkdown || card.body || card.message?.bodyMarkdown || card.message?.body, 8000);
}

function isTerminalReceiptShape(card = {}) {
  const title = cleanString(card.title || card.message?.title, 240);
  const body = cardBody(card);
  const status = cleanString(card.status || card.returnStatus || card.message?.status, 80).toLowerCase();
  return /^return:/i.test(title)
    || /Return policy:\s*terminal receipt/i.test(body)
    || TERMINAL_STATUSES.has(status);
}

function validateRoutinePluginDeploymentCard(card = {}) {
  const issues = [];
  const cardKind = cleanString(card.cardKind || card.card_kind || card.category || card.kind || card.message?.cardKind, 120);
  const pluginId = normalizePluginId(card.pluginId || card.plugin_id || card.plugin || card.message?.pluginId);
  const deployReason = cleanString(card.deployReason || card.deploy_reason || card.reason || card.message?.deployReason, 180);
  const sourceAuthorization = validateDeployCardSourceAuthorization(card);

  if (isTerminalReceiptShape(card)) {
    issues.push({ code: "deploy_card_is_terminal_receipt" });
  }
  if (cardKind !== "plugin_deployment") {
    issues.push({ code: "deploy_card_kind_required", actual: cardKind || "missing" });
  }
  if (!pluginId) {
    issues.push({ code: "deploy_card_plugin_id_required" });
  } else if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(pluginId)) {
    issues.push({ code: "deploy_card_plugin_id_invalid", pluginId });
  }
  if (!deployReason) {
    issues.push({ code: "deploy_card_reason_required" });
  }
  if (!sourceAuthorization.ok) {
    issues.push(...sourceAuthorization.issues);
  }

  return {
    ok: issues.length === 0,
    error: issues[0]?.code || "",
    issues,
    cardKind,
    pluginId,
    deployReason,
    sourceRole: sourceAuthorization.sourceRole,
    sourcePolicy: buildDeployLaneGovernanceReport(card),
    requestShape: issues.length === 0 ? "routine_plugin_deployment" : "invalid",
  };
}

function buildDeployLaneLockRecord(input = {}) {
  const productionPath = cleanString(input.productionPath, 1000);
  const phase = cleanString(input.phase || "queued", 80);
  return {
    schemaVersion: 1,
    pluginId: normalizePluginId(input.pluginId),
    launchdLabel: cleanString(input.launchdLabel, 240),
    productionPathBasename: productionPath ? path.basename(productionPath) : cleanString(input.productionPathBasename, 240),
    productionPathHash: cleanString(input.productionPathHash, 64) || shortHash(productionPath),
    deployReason: cleanString(input.deployReason, 180),
    taskCardId: cleanString(input.taskCardId, 120),
    laneTitle: cleanString(input.laneTitle, 160),
    laneThreadId: cleanString(input.laneThreadId, 120),
    phase,
    status: cleanString(input.status || phase, 80),
    startedAt: cleanString(input.startedAt, 80),
    completedAt: cleanString(input.completedAt, 80),
  };
}

function validateDeployLaneLockRecord(record = {}) {
  const issues = [];
  if (record.schemaVersion !== 1) issues.push({ code: "deploy_lane_lock_schema_version_invalid" });
  if (!normalizePluginId(record.pluginId)) issues.push({ code: "deploy_lane_lock_plugin_id_required" });
  if (!cleanString(record.startedAt, 80)) issues.push({ code: "deploy_lane_lock_started_at_required" });
  if (!DEPLOY_PHASES.has(cleanString(record.phase, 80))) {
    issues.push({ code: "deploy_lane_lock_phase_invalid", phase: cleanString(record.phase, 80) || "missing" });
  }
  if (!cleanString(record.launchdLabel, 240) && !cleanString(record.productionPathHash, 64)) {
    issues.push({ code: "deploy_lane_lock_mutation_target_required" });
  }
  if (["completed", "blocked", "failed"].includes(cleanString(record.phase, 80)) && !cleanString(record.completedAt, 80)) {
    issues.push({ code: "deploy_lane_lock_completed_at_required" });
  }
  return {
    ok: issues.length === 0,
    error: issues[0]?.code || "",
    issues,
    phase: cleanString(record.phase, 80),
    pluginId: normalizePluginId(record.pluginId),
  };
}

function stepOfType(payload = {}, type) {
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  return steps.find((step) => step?.type === type) || {};
}

function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function isStepOk(payload, type) {
  const step = stepOfType(payload, type);
  return step.ok === true || step.result?.ok === true || step.summary?.ok === true || step.detail?.ok === true;
}

function summarizePublicUpgradeDailySmoke(payload = {}) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "public_upgrade_rehearsal_missing_payload", coverage: {}, metadata: {} };
  }

  const preflight = stepOfType(payload, "public-source-preflight");
  const missingValidation = stepOfType(payload, "validate-missing-source-fail-closed");
  const cloneGateValidation = stepOfType(payload, "validate-operator-clone-gate-plan");
  const hermesRuntimeRequired = stepOfType(payload, "validate-hermes-runtime-repair-required");
  const hermesRuntimeGate = stepOfType(payload, "validate-hermes-runtime-repair-gate-plan");
  const sourceAdoptionRequired = stepOfType(payload, "validate-non-git-source-adoption-required");
  const sourceAdoptionGate = stepOfType(payload, "validate-source-adoption-gate-plan");

  const metadata = {
    pluginCount: firstNumber(cloneGateValidation.detail?.pluginCount, missingValidation.detail?.pluginCount),
    missingSourceBlockerCount: firstNumber(missingValidation.detail?.missingSourceBlockerCount),
    cloneActionCount: firstNumber(cloneGateValidation.detail?.cloneActionCount),
    deployActionCount: firstNumber(cloneGateValidation.detail?.deployActionCount, sourceAdoptionGate.detail?.deployActionCount),
    adoptActionCount: firstNumber(sourceAdoptionGate.detail?.adoptActionCount),
    movieOperatorAuthenticated: cloneGateValidation.detail?.movieOperatorAuthenticated === true,
    closureValidationPresent: cloneGateValidation.detail?.closureValidationPresent === true
      || hermesRuntimeGate.detail?.closureValidationPresent === true
      || sourceAdoptionGate.detail?.closureValidationPresent === true,
    hermesRuntimeRepairRequired: hermesRuntimeRequired.ok === true && hermesRuntimeRequired.detail?.runtimeRepairBlockerPresent === true,
    hermesRuntimeRepairGateOk: hermesRuntimeGate.ok === true && hermesRuntimeGate.detail?.runtimeRepairActionPresent === true,
    sourceAdoptionRequired: sourceAdoptionRequired.ok === true && firstNumber(sourceAdoptionRequired.detail?.sourceDirectoryNotGitBlockerCount) > 0,
    sourceAdoptionGateOk: sourceAdoptionGate.ok === true && firstNumber(sourceAdoptionGate.detail?.adoptActionCount) > 0,
    tempRemoved: payload.tempRemoved === true,
    stepCount: firstNumber(payload.stepCount, Array.isArray(payload.steps) ? payload.steps.length : 0),
    preflightOk: isStepOk(payload, "public-source-preflight"),
  };

  const coverage = {
    homeAi: metadata.preflightOk === true,
    plugins: metadata.cloneActionCount > 0 && metadata.deployActionCount > 0,
    hermesAgent: metadata.hermesRuntimeRepairRequired === true && metadata.hermesRuntimeRepairGateOk === true,
    providerIngress: metadata.closureValidationPresent === true,
    sourceAdoption: metadata.sourceAdoptionRequired === true && metadata.sourceAdoptionGateOk === true,
    closureValidation: metadata.closureValidationPresent === true,
  };

  let error = "";
  if (payload.ok === false) error = payload.error || "public_upgrade_rehearsal_failed";
  else if (metadata.tempRemoved !== true) error = "public_upgrade_rehearsal_temp_not_removed";
  else if (!metadata.preflightOk) error = "public_upgrade_rehearsal_preflight_failed";
  else if (missingValidation.ok !== true || metadata.missingSourceBlockerCount <= 0) error = "public_upgrade_missing_source_fail_closed_missing";
  else if (cloneGateValidation.ok !== true) error = "public_upgrade_clone_gate_validation_failed";
  else if (metadata.cloneActionCount <= 0) error = "public_upgrade_clone_actions_missing";
  else if (metadata.deployActionCount <= 0) error = "public_upgrade_deploy_actions_missing";
  else if (!metadata.movieOperatorAuthenticated) error = "public_upgrade_movie_operator_auth_missing";
  else if (!metadata.hermesRuntimeRepairRequired) error = "public_upgrade_hermes_runtime_repair_required_missing";
  else if (!metadata.hermesRuntimeRepairGateOk) error = "public_upgrade_hermes_runtime_repair_gate_missing";
  else if (!metadata.sourceAdoptionRequired) error = "public_upgrade_source_adoption_required_missing";
  else if (!metadata.sourceAdoptionGateOk) error = "public_upgrade_source_adoption_gate_missing";
  else if (!metadata.closureValidationPresent) error = "public_upgrade_closure_validation_missing";

  return {
    ok: !error,
    error,
    coverage,
    metadata,
  };
}

module.exports = {
  buildDeployLaneLockRecord,
  buildDeployLaneGovernanceReport,
  isTerminalReceiptShape,
  normalizePluginId,
  summarizePublicUpgradeDailySmoke,
  validateDeployLaneLockRecord,
  validateRoutinePluginDeploymentCard,
};
