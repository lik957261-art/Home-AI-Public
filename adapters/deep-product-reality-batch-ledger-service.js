"use strict";

const TERMINAL_PLUGIN_STATUSES = new Set([
  "closed_deep",
  "findings_sent_deep",
  "closed_surface_only",
  "partially_completed",
  "blocked",
  "not_applicable",
]);

const FINAL_BATCH_STATUSES = new Set([
  "completed",
  "partially_completed",
  "blocked",
  "invalid_return",
]);

const CLOSED_STATUSES = new Set(["closed_deep", "not_applicable"]);

const ASSESSMENT_AXIS_NAMES = ["architecture", "implementation", "ux"];

const ASSESSMENT_AXIS_VERDICTS = new Set([
  "aligned",
  "improvement_recommended",
  "finding",
  "blocked",
  "not_applicable",
]);

const ASSESSMENT_REQUIRED_STATUSES = new Set([
  "closed_deep",
  "findings_sent_deep",
  "closed_surface_only",
  "partially_completed",
]);

function clean(value, max = 400) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizePluginId(value) {
  const text = clean(value, 120).toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,119}$/.test(text) ? text : "";
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function firstValue(source, keys) {
  const object = objectValue(source);
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null) return object[key];
  }
  return undefined;
}

function stringList(value, maxItems = 24, maxText = 240) {
  const raw = Array.isArray(value)
    ? value
    : (typeof value === "string" ? value.split(/\r?\n|[;,，；]+/u) : []);
  const out = [];
  for (const item of raw) {
    const text = clean(item, maxText);
    if (text && !out.includes(text)) out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function normalizeAssessmentAxis(value) {
  const source = objectValue(value);
  return {
    verdict: clean(firstValue(source, ["verdict", "status", "result"]), 80).toLowerCase(),
    opinion: clean(firstValue(source, ["opinion", "assessment", "summary", "review"]), 800),
    evidence: stringList(firstValue(source, ["evidence", "evidence_refs", "evidenceRefs", "trail", "trails"]), 12, 280),
    improvements: stringList(firstValue(source, ["improvements", "recommendations", "recommended_changes", "recommendedChanges"]), 12, 280),
  };
}

function normalizeAssessmentAxes(row, digest) {
  const source = objectValue(firstValue(digest, [
    "assessment_axes",
    "assessmentAxes",
    "audit_axes",
    "auditAxes",
  ]) ?? firstValue(row, [
    "assessment_axes",
    "assessmentAxes",
    "audit_axes",
    "auditAxes",
  ]));
  const out = {};
  for (const axis of ASSESSMENT_AXIS_NAMES) {
    out[axis] = normalizeAssessmentAxis(firstValue(source, [axis, `${axis}_review`, `${axis}Review`]));
  }
  return out;
}

function normalizeEvidenceDigest(row) {
  const digest = objectValue(firstValue(row, ["evidence_digest", "evidenceDigest", "evidence"]));
  return {
    documentsRead: stringList(firstValue(digest, ["documents_read", "documentsRead", "docs_read", "docsRead"]) ?? firstValue(row, ["documents_read", "documentsRead"])),
    journeys: stringList(firstValue(digest, ["journeys", "core_journeys", "coreJourneys"]) ?? firstValue(row, ["journeys", "core_journeys", "coreJourneys"])),
    sourceTestRuntimeTrails: stringList(firstValue(digest, [
      "source_test_runtime_trails",
      "sourceTestRuntimeTrails",
      "evidence_trails",
      "evidenceTrails",
      "trails",
    ]) ?? firstValue(row, ["source_test_runtime_trails", "sourceTestRuntimeTrails", "evidence_trails", "evidenceTrails"])),
    skippedBoundaries: stringList(firstValue(digest, ["skipped_boundaries", "skippedBoundaries", "skipped"]) ?? firstValue(row, ["skipped_boundaries", "skippedBoundaries"])),
    openQuestions: stringList(firstValue(digest, ["open_questions", "openQuestions"]) ?? firstValue(row, ["open_questions", "openQuestions"])),
    reducedScopeReason: clean(firstValue(digest, ["reduced_scope_reason", "reducedScopeReason"]) ?? firstValue(row, ["reduced_scope_reason", "reducedScopeReason"]), 500),
    assessmentAxes: normalizeAssessmentAxes(row, digest),
  };
}

function normalizeCoverageRow(row) {
  const source = objectValue(row);
  const evidenceDigest = normalizeEvidenceDigest(source);
  return {
    pluginId: normalizePluginId(firstValue(source, ["plugin_id", "pluginId", "id"])),
    status: clean(firstValue(source, ["status", "plugin_status", "pluginStatus"]), 80),
    journeyCount: numberValue(firstValue(source, ["journey_count", "journeyCount", "journeys_count", "journeysCount"])),
    findingCount: numberValue(firstValue(source, ["finding_count", "findingCount", "findings_count", "findingsCount"])),
    repairCards: stringList(firstValue(source, ["repair_cards", "repairCards"]), 20, 120),
    blockedReason: clean(firstValue(source, ["blocked_reason", "blockedReason", "open_reason", "openReason", "residual_reason", "residualReason"]), 800),
    evidenceDigest,
    raw: source,
  };
}

function addIssue(issues, code, message, pluginId = "") {
  issues.push({
    code,
    message,
    pluginId: normalizePluginId(pluginId),
    severity: "error",
  });
}

function addWarning(warnings, code, message, pluginId = "") {
  warnings.push({
    code,
    message,
    pluginId: normalizePluginId(pluginId),
    severity: "warning",
  });
}

function hasXhighReasoning(evidence) {
  const object = objectValue(evidence);
  const values = [
    object.requested,
    object.requestedReasoningEffort,
    object.requested_reasoning_effort,
    object.delivery_reasoning_effort,
    object.deliveryReasoningEffort,
    object.injection_runtime_reasoning_effort,
    object.injectionRuntimeReasoningEffort,
    object.reasoningEffort,
  ].map((value) => clean(value, 40).toLowerCase()).filter(Boolean);
  return values.includes("xhigh");
}

function hasRawSecretMarker(input) {
  const text = JSON.stringify(input || {});
  return /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/.test(text)
    || /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/.test(text)
    || /access_token["'=:\s]+[A-Za-z0-9._~+/=-]{12,}/i.test(text)
    || /refresh_token["'=:\s]+[A-Za-z0-9._~+/=-]{12,}/i.test(text)
    || /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(text);
}

function validateClosedDeep(row, issues) {
  const digest = row.evidenceDigest;
  const effectiveJourneyCount = Math.max(row.journeyCount, digest.journeys.length);
  if (effectiveJourneyCount < 2 && !digest.reducedScopeReason) {
    addIssue(issues, "closed_deep_core_journey_count_missing", "`closed_deep` requires at least two journeys or a reduced-scope reason", row.pluginId);
  }
  if (!digest.documentsRead.length) {
    addIssue(issues, "closed_deep_documents_missing", "`closed_deep` requires bounded documents-read evidence", row.pluginId);
  }
  if (!digest.journeys.length) {
    addIssue(issues, "closed_deep_journeys_missing", "`closed_deep` requires selected journey names", row.pluginId);
  }
  if (!digest.sourceTestRuntimeTrails.length) {
    addIssue(issues, "closed_deep_evidence_trails_missing", "`closed_deep` requires at least one source/test/runtime evidence trail", row.pluginId);
  }
  if (!digest.skippedBoundaries.length) {
    addIssue(issues, "closed_deep_skipped_boundaries_missing", "`closed_deep` requires skipped-boundary accounting", row.pluginId);
  }
  if (!digest.openQuestions.length) {
    addIssue(issues, "closed_deep_open_questions_missing", "`closed_deep` requires open-question accounting, even when the value is `none`", row.pluginId);
  }
}

function validateDeepAssessmentAxes(row, issues) {
  const axes = row.evidenceDigest.assessmentAxes || {};
  for (const axisName of ASSESSMENT_AXIS_NAMES) {
    const axis = objectValue(axes[axisName]);
    if (!axis.verdict && !axis.opinion && !axis.evidence?.length && !axis.improvements?.length) {
      addIssue(issues, "deep_assessment_axis_missing", `Deep Product Reality rows require a ${axisName} assessment axis`, row.pluginId);
      continue;
    }
    if (!ASSESSMENT_AXIS_VERDICTS.has(axis.verdict)) {
      addIssue(issues, "deep_assessment_axis_verdict_invalid", `${axisName} assessment verdict must be aligned, improvement_recommended, finding, blocked, or not_applicable`, row.pluginId);
    }
    if (!axis.opinion) {
      addIssue(issues, "deep_assessment_axis_opinion_missing", `${axisName} assessment requires a bounded audit opinion`, row.pluginId);
    }
    if (!axis.evidence?.length) {
      addIssue(issues, "deep_assessment_axis_evidence_missing", `${axisName} assessment requires bounded evidence references`, row.pluginId);
    }
    if ((axis.verdict === "finding" || axis.verdict === "improvement_recommended") && !axis.improvements?.length) {
      addIssue(issues, "deep_assessment_axis_improvements_missing", `${axisName} assessment findings or recommendations require concrete improvements`, row.pluginId);
    }
  }
}

function validateDeepProductRealityBatchLedger(input = {}, options = {}) {
  const source = objectValue(input);
  const issues = [];
  const warnings = [];
  const requestedPlugins = stringList(
    options.requestedPlugins
      ?? firstValue(source, ["requested_plugins", "requestedPlugins", "target_plugins", "targetPlugins"]),
    80,
    120,
  ).map(normalizePluginId).filter(Boolean);
  const batchStatus = clean(firstValue(source, ["batch_status", "batchStatus", "status"]), 80);
  const coverageInput = firstValue(source, ["coverage", "status_by_plugin", "statusByPlugin"])
    ?? firstValue(objectValue(source.batch_ledger || source.batchLedger), ["coverage", "status_by_plugin", "statusByPlugin"])
    ?? [];
  const coverage = (Array.isArray(coverageInput) ? coverageInput : []).map(normalizeCoverageRow);
  const coverageByPlugin = new Map();

  if (!requestedPlugins.length) {
    addIssue(issues, "requested_plugins_missing", "Requested plugin ids are required");
  }
  if (!FINAL_BATCH_STATUSES.has(batchStatus)) {
    addIssue(issues, "batch_status_invalid", "Batch status must be completed, partially_completed, blocked, or invalid_return");
  }
  if (!coverage.length) {
    addIssue(issues, "coverage_missing", "Coverage matrix is required");
  }
  if (options.requireXhigh !== false && !hasXhighReasoning(firstValue(source, ["reasoning_evidence", "reasoningEvidence"]))) {
    addIssue(issues, "xhigh_reasoning_evidence_missing", "X High reasoning receipt evidence is required");
  }

  for (const row of coverage) {
    if (!row.pluginId) {
      addIssue(issues, "plugin_id_missing", "Coverage row is missing a valid plugin id");
      continue;
    }
    if (coverageByPlugin.has(row.pluginId)) {
      addIssue(issues, "plugin_duplicate", "Coverage matrix contains duplicate plugin id", row.pluginId);
    }
    coverageByPlugin.set(row.pluginId, row);
    if (!TERMINAL_PLUGIN_STATUSES.has(row.status)) {
      addIssue(issues, "plugin_status_non_terminal", "Plugin row does not have a terminal ledger status", row.pluginId);
    }
    if (row.status === "closed_deep") validateClosedDeep(row, issues);
    if (ASSESSMENT_REQUIRED_STATUSES.has(row.status)) validateDeepAssessmentAxes(row, issues);
    if ((row.status === "blocked" || row.status === "partially_completed") && !row.blockedReason) {
      addIssue(issues, "open_status_reason_missing", "Blocked or partially completed rows require a bounded reason", row.pluginId);
    }
    if (row.status === "not_applicable" && !row.blockedReason && !row.evidenceDigest.reducedScopeReason) {
      addIssue(issues, "not_applicable_justification_missing", "`not_applicable` rows require a justification", row.pluginId);
    }
    if (row.findingCount > 0 && !row.repairCards.length && row.status !== "blocked") {
      addIssue(issues, "finding_repair_destination_missing", "Rows with findings require repair card ids or a blocked status", row.pluginId);
    }
  }

  for (const pluginId of requestedPlugins) {
    if (!coverageByPlugin.has(pluginId)) {
      addIssue(issues, "requested_plugin_missing_from_coverage", "Requested plugin id is missing from coverage matrix", pluginId);
    }
  }
  for (const row of coverage) {
    if (row.pluginId && requestedPlugins.length && !requestedPlugins.includes(row.pluginId)) {
      addWarning(warnings, "coverage_plugin_not_requested", "Coverage contains a plugin id not present in the requested target list", row.pluginId);
    }
  }

  const hasOpenPluginStatus = coverage.some((row) => row.pluginId && !CLOSED_STATUSES.has(row.status));
  if (batchStatus === "completed" && hasOpenPluginStatus) {
    addIssue(issues, "batch_completed_with_open_plugin_status", "`completed` batch status cannot contain open plugin rows");
  }

  const privacyReview = clean(firstValue(source, ["privacy_review", "privacyReview"]), 1200);
  if (!privacyReview) {
    addIssue(issues, "privacy_review_missing", "Privacy review summary is required");
  }
  if (hasRawSecretMarker(source)) {
    addIssue(issues, "privacy_raw_secret_marker", "Ledger contains raw secret-like material");
  }

  return {
    ok: issues.length === 0,
    status: issues.length ? "invalid_return" : batchStatus,
    issues,
    warnings,
    requestedPlugins,
    coverage: coverage.map((row) => ({
      pluginId: row.pluginId,
      status: row.status,
      journeyCount: row.journeyCount,
      findingCount: row.findingCount,
      repairCards: row.repairCards,
      blockedReason: row.blockedReason,
      evidenceDigest: row.evidenceDigest,
    })),
  };
}

module.exports = {
  ASSESSMENT_AXIS_NAMES,
  ASSESSMENT_AXIS_VERDICTS,
  FINAL_BATCH_STATUSES,
  TERMINAL_PLUGIN_STATUSES,
  validateDeepProductRealityBatchLedger,
};
