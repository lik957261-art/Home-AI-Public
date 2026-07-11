"use strict";

const crypto = require("node:crypto");
const {
  createAutonomousDeliveryIntent,
} = require("./autonomous-delivery-intake-service");
const {
  DEFAULT_PLUGIN_TARGETS,
  HOME_AI_TARGET,
} = require("./ai-ops-diagnostic-remediation-service");
const {
  buildTaskContextPack,
  redactSensitiveValue,
  verifyEvidenceLedger,
} = require("./ai-operations-control-plane-service");
const {
  cardIdsFromTaskCardResult,
  exceptionTaskCardResult,
  normalizeTaskCardDispatchResult,
} = require("./task-card-dispatch-result-service");
const {
  appendDuplicateCaseObservation,
  buildAutonomousDeliveryStatusSummary,
  deriveAutonomousDeliveryCaseIdentity,
  initialCaseLedger,
} = require("./autonomous-delivery-case-ledger-service");
const {
  normalizeTaskCardReasoningEffort,
} = require("./task-card-dispatch-idempotency-service");
const {
  buildReturnWatchdogSummary,
  returnWatchdogMarkPatch,
} = require("./return-watchdog-service");
const {
  buildSourceReturnIntegrationSummary,
  sourceActivationProjection,
  sourceReturnIntegrationForReturn,
  sourceReturnIntegrationStalePatch,
} = require("./source-return-integration-watchdog-service");
const {
  buildAutonomousDeliveryRoutingDecision,
  routingDecisionTaskCardLines,
} = require("./autonomous-delivery-routing-decision-service");
const {
  selectWorkerLaneForDispatch,
} = require("./worker-lane-scheduler-service");
const {
  normalizeDeployRequest,
} = require("./central-deploy-governance-service");
const {
  parseSourceReturnFollowUpAction,
  pendingSourceActionProjection,
  transitionPendingSourceAction,
} = require("./source-return-follow-up-action-service");

const APP_WORKSPACE = "/Users/example/path";
const OWNER_WORKSPACE_ID = "owner";
const NOTIFICATION_TYPE = "autonomous_delivery.start_required";
const VERIFICATION_NOTIFICATION_TYPE = "autonomous_delivery.verification_required";
const CLOSURE_NOTIFICATION_TYPE = "autonomous_delivery.closure_required";
const REPAIR_NOTIFICATION_TYPE = "autonomous_delivery.repair_required";
const DEPLOYMENT_NOTIFICATION_TYPE = "autonomous_delivery.deploy_readback_required";
const FINAL_REPORT_NOTIFICATION_TYPE = "autonomous_delivery.final_report_ready";
const PLUGIN_AUDIT_TARGET = Object.freeze({
  label: "Plugin Workspace Audit",
  targetThreadTitle: "Plugin Workspace Audit",
  targetWorkspace: APP_WORKSPACE,
  auditKind: "plugin",
});
const PLATFORM_AUDIT_TARGET = Object.freeze({
  label: "Home AI Platform Audit",
  targetThreadTitle: "Home AI Platform Audit",
  targetWorkspace: APP_WORKSPACE,
  auditKind: "platform",
});
const DEPLOYMENT_TARGET = Object.freeze({
  label: "Home AI Deploy Lane Pool",
  targetThreadTitle: "",
  targetWorkspace: APP_WORKSPACE,
  auditKind: "deployment",
});
const CASE_STATUSES = Object.freeze([
  "decision_waiting",
  "ready_to_start",
  "running",
  "verification_waiting",
  "verification_dispatched",
  "deployment_waiting",
  "deployment_dispatched",
  "repair_waiting",
  "repair_dispatched",
  "verified_waiting",
  "completed",
  "blocked",
  "cancelled",
]);
const SLICE_STATUSES = Object.freeze([
  "pending",
  "requires_user",
  "dispatching",
  "dispatched",
  "completed",
  "blocked",
  "redirected",
  "rejected",
  "partially_completed",
]);
const TERMINAL_SLICE_STATUSES = Object.freeze([
  "completed",
  "blocked",
  "redirected",
  "rejected",
  "partially_completed",
]);
const ACTIVE_DISPATCH_STATUSES = Object.freeze(["dispatching", "dispatched"]);
const DISPATCH_CONTROL_ATTENTION_STATUSES = Object.freeze([
  "deferred_conflict",
  "failed",
  "dispatching",
  "sent",
  "return_stale",
]);
const DEFAULT_RETURN_WATCHDOG_STALE_MS = 4 * 60 * 60 * 1000;
const UNSAFE_EVIDENCE_METADATA_KEY_RE = /body|text|prompt|message|url|uri|path|file|filename|cookie|token|secret|password|oauth|access[_ -]?key|launch[_ -]?key|authorization|provider|screenshot|upload|raw|log/i;

function clean(value, max = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 500));
}

function cleanBlock(value, max = 1600) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 1600));
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function rawJsonObjectValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return objectValue(parsed);
  } catch (_) {
    return {};
  }
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function safeToken(value, fallback = "unknown", max = 120) {
  const token = clean(value, max)
    .replace(/[^A-Za-z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return token || fallback;
}

function boundedArray(items = [], max = 20, itemMax = 260) {
  return arrayValue(items)
    .map((item) => clean(item, itemMax))
    .filter(Boolean)
    .slice(0, max);
}

function shortHash(value, length = 16) {
  const text = String(value ?? "");
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, Math.max(8, Math.min(32, Number(length) || 16)));
}

function firstCleanString(values = [], max = 500) {
  for (const value of values) {
    const text = clean(value, max);
    if (text) return text;
  }
  return "";
}

function boundedEvidenceMetadata(value, key = "") {
  if (value == null) return value;
  if (UNSAFE_EVIDENCE_METADATA_KEY_RE.test(String(key || ""))) return "[REDACTED]";
  const redacted = redactSensitiveValue(value, key);
  if (Array.isArray(redacted)) return redacted.slice(0, 20).map((item) => boundedEvidenceMetadata(item));
  if (redacted && typeof redacted === "object") {
    const out = {};
    for (const [childKey, childValue] of Object.entries(redacted).slice(0, 40)) {
      out[childKey] = boundedEvidenceMetadata(childValue, childKey);
    }
    return out;
  }
  if (typeof redacted === "string") return cleanBlock(redacted, 500);
  return redacted;
}

function safeReferenceId(value) {
  const text = clean(value, 160);
  if (!text || /[\\/]/.test(text) || /(?:https?|file|smb|nfs):/i.test(text)) return "";
  return text.replace(/[^A-Za-z0-9._:-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120);
}

function boundedEvidencePointer(item = {}, defaultKind = "artifact") {
  const source = typeof item === "string" ? { ref: item } : objectValue(item);
  const ref = firstCleanString([
    source.ref,
    source.path,
    source.file,
    source.url,
    source.uri,
    source.href,
    source.artifactPath,
    source.artifact_path,
    source.id,
  ], 900);
  if (!ref) return null;
  const hash = shortHash(ref);
  const id = safeReferenceId(source.id || source.artifactId || source.artifact_id || "");
  const out = {
    kind: safeToken(source.kind || defaultKind, defaultKind, 80),
    refHash: hash,
    label: `${safeToken(defaultKind, "artifact", 40)}:${hash}`,
  };
  if (id) out.id = id;
  const status = clean(source.status || "", 80);
  if (status) out.status = status;
  const summary = cleanBlock(redactSensitiveValue(source.summary || ""), 240);
  if (summary) out.summary = summary;
  return out;
}

function boundedEvidencePointers(items = [], defaultKind = "artifact", max = 12) {
  const seen = new Set();
  const pointers = [];
  for (const item of arrayValue(items)) {
    const pointer = boundedEvidencePointer(item, defaultKind);
    if (!pointer || seen.has(pointer.refHash)) continue;
    seen.add(pointer.refHash);
    pointers.push(pointer);
    if (pointers.length >= max) break;
  }
  return pointers;
}

function evidencePointerInputs(input = {}, metadata = {}) {
  return [
    ...arrayValue(input.artifactPointers || input.artifact_pointers),
    ...arrayValue(input.artifactPaths || input.artifact_paths),
    ...arrayValue(input.evidencePointers || input.evidence_pointers),
    ...arrayValue(input.evidenceArtifacts || input.evidence_artifacts),
    ...arrayValue(metadata.artifactPointers || metadata.artifact_pointers),
    ...arrayValue(metadata.artifactPaths || metadata.artifact_paths),
    ...arrayValue(metadata.evidencePointers || metadata.evidence_pointers),
    ...arrayValue(metadata.evidenceArtifacts || metadata.evidence_artifacts),
  ];
}

function boundedEvidenceLedgerVerification(input = {}) {
  const metadata = objectValue(input.metadata || input.meta);
  const ledgerPath = firstCleanString([
    input.evidenceLedgerPath,
    input.evidence_ledger_path,
    input.ledgerPath,
    input.ledger_path,
    metadata.evidenceLedgerPath,
    metadata.evidence_ledger_path,
    metadata.ledgerPath,
    metadata.ledger_path,
  ], 900);
  if (!ledgerPath) return { checked: false };
  const requiredKinds = boundedArray(
    input.requiredKinds || input.required_kinds || metadata.requiredKinds || metadata.required_kinds,
    20,
    80,
  );
  const requiredStatuses = boundedArray(
    input.requiredStatuses || input.required_statuses || metadata.requiredStatuses || metadata.required_statuses,
    20,
    80,
  );
  const commitPrefix = clean(input.commitPrefix || input.commit_prefix || metadata.commitPrefix || metadata.commit_prefix || "", 80);
  const ledgerPathHash = shortHash(ledgerPath);
  try {
    const result = verifyEvidenceLedger({
      ledgerPath,
      requiredKinds,
      requiredStatuses,
      commitPrefix,
    });
    return {
      checked: true,
      ok: Boolean(result.ok),
      recordCount: Number(result.recordCount || 0),
      issues: boundedArray(result.issues, 20, 160),
      ledgerPathHash,
      label: `evidence-ledger:${ledgerPathHash}`,
      requiredKinds,
      requiredStatuses,
      commitPrefix,
    };
  } catch (err) {
    return {
      checked: true,
      ok: false,
      recordCount: 0,
      issues: [`evidence_ledger_verify_failed:${clean(err?.message || err || "unknown", 120)}`],
      ledgerPathHash,
      label: `evidence-ledger:${ledgerPathHash}`,
      requiredKinds,
      requiredStatuses,
      commitPrefix,
    };
  }
}

function boundedAiOpsCheck(item = {}) {
  return {
    command: cleanBlock(redactSensitiveValue(item.command || ""), 500),
    reason: clean(item.reason || "", 120),
    kind: clean(item.kind || "test", 80),
    required: item.required !== false,
  };
}

function boundedAiOpsContextPack(pack = {}) {
  const rootCause = objectValue(pack.rootCauseGovernance);
  const fallbackPolicy = objectValue(rootCause.fallbackPolicy);
  return {
    task: cleanBlock(pack.task || "", 900),
    harnessClass: clean(pack.harnessClass || "H3", 20),
    modules: boundedArray(pack.modules, 12, 160),
    requiredDocs: boundedArray(pack.requiredDocs, 30, 260),
    allowedBoundaries: boundedArray(pack.allowedBoundaries, 30, 260),
    requiredChecks: arrayValue(pack.requiredChecks).map(boundedAiOpsCheck).filter((item) => item.command).slice(0, 40),
    rootCauseGovernance: {
      required: Boolean(rootCause.required),
      classificationRequired: boundedArray(rootCause.classificationRequired, 6, 80),
      requiredDiagnosisFields: boundedArray(rootCause.requiredDiagnosisFields, 20, 120),
      fallbackPolicy: {
        silentFallbackAllowed: fallbackPolicy.silentFallbackAllowed === true,
        mitigationMayBeCalledClosure: fallbackPolicy.mitigationMayBeCalledClosure === true,
        registryPath: clean(fallbackPolicy.registryPath || "", 260),
        contractPath: clean(fallbackPolicy.contractPath || "", 260),
        checkCommand: cleanBlock(redactSensitiveValue(fallbackPolicy.checkCommand || ""), 600),
      },
      completionRule: cleanBlock(rootCause.completionRule || "", 500),
    },
    visualLane: {
      required: Boolean(pack.visualLane?.required),
      allocatorCommand: cleanBlock(redactSensitiveValue(pack.visualLane?.allocatorCommand || ""), 500),
    },
    deployment: {
      required: Boolean(pack.deployment?.required),
      planCommand: cleanBlock(redactSensitiveValue(pack.deployment?.planCommand || ""), 500),
    },
    blockedIf: boundedArray(pack.blockedIf, 20, 160),
  };
}

function aiOpsTaskTextForSlice(deliveryCase = {}, slice = {}, stage = "implementation") {
  return cleanBlock([
    `Autonomous Delivery Loop ${stage}`,
    deliveryCase.objective || "",
    `slice=${slice.sliceKey || slice.id || slice.sliceId || "slice"}`,
    `owner=${slice.ownerLayer || "unknown"}`,
    `target=${slice.targetWorkspaceId || slice.workspaceId || "unknown"}`,
    slice.summary || slice.description || "",
  ].filter(Boolean).join("; "), 1400);
}

function aiOpsProjectionForSlice(deliveryCase = {}, slice = {}, stage = "implementation", options = {}) {
  const packBuilder = typeof options.aiOpsContextPackBuilder === "function"
    ? options.aiOpsContextPackBuilder
    : buildTaskContextPack;
  const changedFiles = boundedArray(slice.aiOpsChangedFiles || slice.changedFiles || slice.changed_files || [], 20, 260);
  try {
    const pack = packBuilder({
      taskText: aiOpsTaskTextForSlice(deliveryCase, slice, stage),
      changedFiles,
    });
    return Object.assign(boundedAiOpsContextPack(pack), {
      stage: clean(stage, 60),
      requiredCheckCount: arrayValue(pack.requiredChecks).length,
      evidence: {
        status: "pending",
      },
    });
  } catch (err) {
    return {
      stage: clean(stage, 60),
      task: aiOpsTaskTextForSlice(deliveryCase, slice, stage),
      harnessClass: "H3",
      modules: [],
      requiredDocs: [],
      allowedBoundaries: [],
      requiredChecks: [],
      requiredCheckCount: 0,
      rootCauseGovernance: { required: false },
      visualLane: { required: false },
      deployment: { required: false },
      blockedIf: ["ai_ops_projection_unavailable"],
      evidence: {
        status: "blocked",
        summary: clean(err?.message || err || "ai_ops_projection_unavailable", 240),
      },
    };
  }
}

function boundedEvidenceRecord(item = {}) {
  const metadata = boundedEvidenceMetadata(objectValue(item.metadata || item.meta));
  return {
    kind: clean(item.kind || "info", 80),
    status: clean(item.status || "info", 80),
    summary: cleanBlock(redactSensitiveValue(item.summary || ""), 500),
    command: cleanBlock(redactSensitiveValue(item.command || ""), 500),
    artifactPointers: boundedEvidencePointers(item.artifactPaths || item.artifact_paths || item.artifactPointers || item.artifact_pointers, "artifact", 10),
    metadata,
  };
}

function aiOpsEvidenceForReturn(input = {}, status = "") {
  const metadata = objectValue(input.metadata || input.meta);
  const deployRequest = normalizeDeployRequest(input.deployRequest || input.deploy_request || metadata.deployRequest || metadata.deploy_request || {});
  const pendingSourceAction = objectValue(input.pendingSourceAction || input.pending_source_action || metadata.pendingSourceAction || metadata.pending_source_action);
  const evidenceRecords = arrayValue(input.evidenceRecords || input.evidence_records || metadata.evidenceRecords || metadata.evidence_records)
    .map(boundedEvidenceRecord)
    .slice(0, 20);
  const evidence = {
    status: status === "completed" ? "returned_completed" : "returned_terminal",
    returnStatus: clean(status || "", 80),
    returnCardId: clean(input.returnCardId || input.return_card_id || "", 160),
    summary: cleanBlock(redactSensitiveValue(input.summary || ""), 800),
    evidenceRecords,
    commandsRun: boundedArray(input.commandsRun || input.commands_run || metadata.commandsRun || metadata.commands_run, 20, 500)
      .map((command) => cleanBlock(redactSensitiveValue(command), 500)),
    ledgerVerification: boundedEvidenceLedgerVerification(input),
    artifactPointers: boundedEvidencePointers(evidencePointerInputs(input, metadata), "artifact", 12),
  };
  if (deployRequest.needed) {
    evidence.deployRequest = {
      needed: true,
      requestedByRole: deployRequest.requestedByRole,
      target: deployRequest.target,
      sourceRef: deployRequest.sourceRef,
      baseRef: deployRequest.baseRef,
      changedFileCount: deployRequest.changedFiles.length,
      validationSummaryCount: deployRequest.validationSummary.length,
      requiredReadbackCount: deployRequest.requiredReadback.length,
      risk: deployRequest.risk,
      authorization: deployRequest.authorization,
      deployAuthorized: deployRequest.deployAuthorized,
      issueCodes: deployRequest.issueCodes,
      dirty: deployRequest.dirtyState.dirty,
    };
  }
  if (pendingSourceAction.id) {
    evidence.pendingSourceAction = pendingSourceActionProjection(pendingSourceAction);
  }
  return evidence;
}

function aiOpsForReturn(slice = {}, input = {}, status = "") {
  const current = objectValue(slice.aiOps);
  return Object.assign({}, current, {
    evidence: Object.assign({}, objectValue(current.evidence), {
      lastReturn: aiOpsEvidenceForReturn(input, status),
      status: status === "completed" ? "returned_completed" : "returned_terminal",
    }),
  });
}

function aiOpsWithPendingSourceAction(aiOps = {}, action = {}) {
  const projection = pendingSourceActionProjection(action);
  if (!projection.id) return objectValue(aiOps);
  const current = objectValue(aiOps);
  const evidence = objectValue(current.evidence);
  const lastReturn = objectValue(evidence.lastReturn);
  return Object.assign({}, current, {
    evidence: Object.assign({}, evidence, {
      lastReturn: Object.assign({}, lastReturn, {
        pendingSourceAction: projection,
      }),
    }),
  });
}

function aiOpsForParentDeploymentEvidence(parentSlice = {}, deploymentSlice = {}, status = "") {
  const current = objectValue(parentSlice.aiOps);
  const deploymentAiOps = objectValue(deploymentSlice.aiOps);
  const deploymentLastReturn = objectValue(objectValue(deploymentAiOps.evidence).lastReturn);
  const deploymentLedgerVerification = objectValue(deploymentLastReturn.ledgerVerification);
  return Object.assign({}, current, {
    evidence: Object.assign({}, objectValue(current.evidence), {
      deployment: {
        status: clean(status || deploymentSlice.status || "", 80),
        deploymentSliceId: clean(deploymentSlice.sliceId || "", 160),
        deploymentTaskCardId: clean(deploymentSlice.taskCardId || "", 160),
        deploymentReturnCardId: clean(deploymentSlice.returnCardId || "", 160),
        summary: cleanBlock(redactSensitiveValue(deploymentSlice.returnSummary || ""), 800),
        evidenceRecordCount: arrayValue(deploymentLastReturn.evidenceRecords).length,
        commandCount: arrayValue(deploymentLastReturn.commandsRun).length,
        artifactPointerCount: arrayValue(deploymentLastReturn.artifactPointers).length,
        ledgerVerification: deploymentLedgerVerification.checked ? {
          checked: true,
          ok: deploymentLedgerVerification.ok === true,
          recordCount: Number(deploymentLedgerVerification.recordCount || 0),
          issues: boundedArray(deploymentLedgerVerification.issues, 10, 160),
          label: clean(deploymentLedgerVerification.label || "", 80),
        } : { checked: false },
      },
    }),
  });
}

function normalizeStatus(value, allowed, fallback) {
  const text = clean(value, 80).toLowerCase();
  return allowed.includes(text) ? text : fallback;
}

function nowIso(options = {}) {
  return typeof options.nowIso === "function" ? options.nowIso() : new Date().toISOString();
}

function makeId(options, prefix) {
  if (typeof options.makeId === "function") return options.makeId(prefix);
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function targetForWorkspace(workspaceId, targets = {}) {
  const id = safeToken(workspaceId, "home-ai", 80).toLowerCase();
  if (id === "home-ai") return HOME_AI_TARGET;
  return Object.assign({}, DEFAULT_PLUGIN_TARGETS, targets)[id] || null;
}

function aiOpsRequiredChecksLines(aiOps = {}) {
  const checks = arrayValue(aiOps.requiredChecks).filter((item) => item?.command);
  const docs = arrayValue(aiOps.requiredDocs).filter(Boolean);
  if (!checks.length && !docs.length && !aiOps.harnessClass) return [];
  const lines = [
    "## AI Ops Required Checks",
    "",
    `Harness class: \`${clean(aiOps.harnessClass || "H3", 20)}\``,
  ];
  if (arrayValue(aiOps.modules).length) {
    lines.push(`Modules: ${arrayValue(aiOps.modules).slice(0, 6).map((item) => `\`${clean(item, 120)}\``).join(", ")}`);
  }
  if (docs.length) {
    lines.push("", "Required docs:");
    for (const doc of docs.slice(0, 8)) lines.push(`- \`${clean(doc, 260)}\``);
    if (docs.length > 8) lines.push(`- ... ${docs.length - 8} more`);
  }
  if (checks.length) {
    lines.push("", "Required checks:");
    for (const check of checks.slice(0, 10)) {
      const marker = check.required === false ? "optional" : "required";
      lines.push(`- [${marker}] \`${cleanBlock(check.command, 500)}\``);
    }
    if (checks.length > 10) lines.push(`- ... ${checks.length - 10} more`);
  }
  if (aiOps.rootCauseGovernance?.required) {
    lines.push("", "Root-cause/fallback governance is required for this slice.");
  }
  if (aiOps.visualLane?.required) {
    lines.push("Visual lane allocation is required before visual harness mutation.");
  }
  if (aiOps.deployment?.required) {
    lines.push("Deployment planning/readback is required before closure.");
  }
  lines.push("", "If a required check is skipped, return the bounded reason and residual risk.");
  return lines;
}

function sliceRisk(slice = {}, caseRisk = "medium") {
  const id = clean(slice.id, 120).toLowerCase();
  const owner = clean(slice.ownerLayer, 120).toLowerCase();
  if (id.includes("deploy") || owner.includes("deployment")) return "high";
  if (id.includes("product_ui") || owner.includes("user_visible")) return "medium";
  if (id.includes("audit")) return "medium";
  if (id.includes("closure") || id.includes("verification")) return "low";
  if (id.includes("research")) return "low";
  if (caseRisk === "high") return "high";
  return caseRisk === "low" ? "low" : "medium";
}

function caseStatusForIntent(intent = {}) {
  return intent.userDecisionGate?.userInterventionRequired ? "decision_waiting" : "ready_to_start";
}

function publicCaseRecord(row = {}) {
  const raw = rawJsonObjectValue(row.rawJson || row.raw_json);
  return Object.assign({}, raw, {
    caseId: clean(row.caseId || row.case_id || raw.caseId, 160),
    workspaceId: clean(row.workspaceId || row.workspace_id || raw.workspaceId || OWNER_WORKSPACE_ID, 120) || OWNER_WORKSPACE_ID,
    objective: cleanBlock(row.objective || raw.objective, 1800),
    mode: clean(row.mode || raw.mode, 40),
    risk: clean(row.risk || raw.risk, 40),
    status: clean(row.status || raw.status, 80),
    requestedLowIntervention: Boolean(row.requestedLowIntervention ?? row.requested_low_intervention ?? raw.requestedLowIntervention),
    userDecisionGate: objectValue(row.userDecisionGate || row.user_decision_gate || raw.userDecisionGate),
    autonomyPolicy: objectValue(row.autonomyPolicy || row.autonomy_policy || raw.autonomyPolicy),
    privacyBoundary: objectValue(row.privacyBoundary || row.privacy_boundary || raw.privacyBoundary),
    sourceRef: objectValue(row.sourceRef || row.source_ref || raw.sourceRef),
    createdAt: clean(row.createdAt || row.created_at || raw.createdAt, 80),
    updatedAt: clean(row.updatedAt || row.updated_at || raw.updatedAt, 80),
    startedAt: clean(row.startedAt || row.started_at || raw.startedAt, 80),
    closedAt: clean(row.closedAt || row.closed_at || raw.closedAt, 80),
  });
}

function publicSliceRecord(row = {}) {
  const raw = rawJsonObjectValue(row.rawJson || row.raw_json);
  const returnFields = {};
  for (const key of [
    "returnSummary",
    "returnCardId",
    "originalTaskCardId",
    "returnCardEvent",
    "parentSliceId",
    "parentSliceKey",
    "verificationForTaskCardId",
    "verificationSliceId",
    "implementationReturnCardId",
    "implementationReturnSummary",
    "verificationStatus",
    "verificationReturnCardId",
    "verificationReturnSummary",
    "deploymentRequired",
    "deploymentReason",
    "deploymentForTaskCardId",
    "deploymentSliceId",
    "deploymentTaskCardId",
    "deploymentTaskCardIds",
    "deploymentStatus",
    "deploymentReturnCardId",
    "deploymentReturnSummary",
    "repairForTaskCardId",
    "repairTaskCardId",
    "repairTaskCardIds",
    "aiOps",
    "auditKind",
    "auditThreadTitle",
    "verificationTaskCardId",
    "verificationTaskCardIds",
    "dispatchConflict",
    "dispatchFailure",
    "verificationDispatchFailure",
    "deploymentDispatchFailure",
    "repairDispatchFailure",
    "returnWatchdog",
    "sourceReturnIntegration",
    "routingDecision",
  ]) {
    if (row[key] !== undefined) returnFields[key] = row[key];
  }
  return Object.assign({}, raw, returnFields, {
    sliceId: clean(row.sliceId || row.slice_id || raw.sliceId, 160),
    caseId: clean(row.caseId || row.case_id || raw.caseId, 160),
    workspaceId: clean(row.workspaceId || row.workspace_id || raw.workspaceId || OWNER_WORKSPACE_ID, 120) || OWNER_WORKSPACE_ID,
    sliceKey: clean(row.sliceKey || row.slice_key || raw.sliceKey, 160),
    ownerLayer: clean(row.ownerLayer || row.owner_layer || raw.ownerLayer, 120),
    targetWorkspaceId: clean(row.targetWorkspaceId || row.target_workspace_id || raw.targetWorkspaceId, 120),
    targetWorkspacePath: clean(row.targetWorkspacePath || row.target_workspace_path || raw.targetWorkspacePath, 600),
    status: clean(row.status || raw.status, 80),
    risk: clean(row.risk || raw.risk, 40),
    dispatchStatus: clean(row.dispatchStatus || row.dispatch_status || raw.dispatchStatus, 80),
    taskCardId: clean(row.taskCardId || row.task_card_id || raw.taskCardId, 160),
    title: clean(row.title || raw.title, 220),
    summary: cleanBlock(row.summary || raw.summary, 900),
    blockedReason: clean(row.blockedReason || row.blocked_reason || raw.blockedReason, 240),
    taskCard: objectValue(row.taskCard || row.task_card || raw.taskCard),
    createdAt: clean(row.createdAt || row.created_at || raw.createdAt, 80),
    updatedAt: clean(row.updatedAt || row.updated_at || raw.updatedAt, 80),
    startedAt: clean(row.startedAt || row.started_at || raw.startedAt, 80),
    completedAt: clean(row.completedAt || row.completed_at || raw.completedAt, 80),
  });
}

function taskCardBodyForSlice(deliveryCase = {}, slice = {}, ownerPrompt = "") {
  const prompt = cleanBlock(ownerPrompt, 1200);
  const targetWorkspace = clean(slice.targetWorkspacePath, 600);
  return [
    "# Autonomous Delivery Loop Task",
    "",
    `Delivery case: \`${deliveryCase.caseId}\``,
    `Slice: \`${slice.sliceKey || slice.sliceId}\``,
    `Objective: ${deliveryCase.objective}`,
    `Mode: \`${deliveryCase.mode}\``,
    `Risk: \`${deliveryCase.risk}\``,
    `Target workspace: \`${targetWorkspace}\``,
    "",
    "## Required Work",
    "",
    slice.summary || "Implement the assigned bounded delivery slice in the owning workspace.",
    "",
    "## Loop Contract",
    "",
    "- Do the work in the owning workspace only.",
    "- Add focused validation for the changed behavior.",
    "- If runtime behavior changes, deploy through the established central/plugin deploy contract and include production readback.",
    "- Return a real task card with completed, blocked, redirected, rejected, or partially_completed status.",
    "- Include changed files, commands run, residual risk, and privacy confirmation.",
    "- If an AI Ops evidence ledger or artifact path exists, return it in bounded metadata; Home AI will verify and store only redacted hashes/results.",
    "",
    ...routingDecisionTaskCardLines(slice.routingDecision),
    "",
    ...aiOpsRequiredChecksLines(slice.aiOps),
    "",
    prompt ? "## Owner Additional Prompt" : "",
    prompt ? "" : "",
    prompt,
    "",
    "## Privacy Boundary",
    "",
    "Do not include raw secrets, cookies, launch tokens, OAuth tokens, provider payloads, private plugin records, database rows, screenshots with private data, full prompts, or long logs in the return card.",
  ].filter((line, index, lines) => line || lines[index - 1] || lines[index + 1]).join("\n");
}

function taskCardForSlice(deliveryCase = {}, slice = {}, target = {}, ownerPrompt = "") {
  const label = clean(target.label || slice.targetWorkspaceId || "Home AI", 120);
  const routingDecision = objectValue(slice.routingDecision);
  const taskCard = {
    title: clean(`Delivery Loop: ${label} ${slice.sliceKey || slice.sliceId}`, 90),
    summary: clean(`${deliveryCase.caseId} ${slice.sliceKey}: ${deliveryCase.objective}`, 260),
    body: taskCardBodyForSlice(deliveryCase, slice, ownerPrompt),
    targetThreadId: target.targetThreadId || target.threadId || "",
    targetThreadTitle: target.targetThreadTitle || "",
    targetThreadTitlePrefix: target.targetThreadTitlePrefix || "",
    targetWorkspace: target.targetWorkspace || slice.targetWorkspacePath || "",
    workflowMode: "manual",
    reasoningEffort: normalizeTaskCardReasoningEffort({
      requested: deliveryCase.risk === "low" ? "medium" : "high",
      risk: deliveryCase.risk,
      severity: slice.aiOps?.harnessClass,
    }),
    requestId: `autonomous-delivery-${deliveryCase.caseId}-${slice.sliceKey || slice.sliceId}`,
  };
  if (routingDecision.cardKind) {
    taskCard.cardKind = clean(routingDecision.cardKind, 80);
  }
  if (isHomeAiTargetSlice(slice) && isImplementationSlice(slice)) {
    taskCard.cardKind = "home_ai_worker";
    taskCard.targetThreadTitle = "";
    taskCard.targetThreadTitlePrefix = "";
  }
  return taskCard;
}

function isHomeAiTargetSlice(slice = {}) {
  const targetWorkspaceId = safeToken(slice.targetWorkspaceId || "", "", 100).toLowerCase();
  const ownerLayer = clean(slice.ownerLayer || "", 120);
  return targetWorkspaceId === "home-ai" || ownerLayer === "home_ai_workspace";
}

function auditTargetForSlice(slice = {}) {
  return isHomeAiTargetSlice(slice) ? PLATFORM_AUDIT_TARGET : PLUGIN_AUDIT_TARGET;
}

function verificationSliceKeyForSlice(slice = {}) {
  return `${safeToken(slice.sliceKey || slice.sliceId || "slice", "slice", 100)}_verification`;
}

function verificationSliceIdForSlice(deliveryCase = {}, slice = {}) {
  return `${safeToken(deliveryCase.caseId, "delivery", 140)}_${verificationSliceKeyForSlice(slice)}`;
}

function repairSliceKeyForVerification(verificationSlice = {}, parentSlice = {}) {
  const parentKey = safeToken(parentSlice.sliceKey || verificationSlice.parentSliceKey || verificationSlice.parentSliceId || "slice", "slice", 100);
  const returnKey = safeToken(verificationSlice.returnCardId || verificationSlice.sliceId || "return", "return", 80);
  return `${parentKey}_repair_${returnKey}`;
}

function repairSliceIdForVerification(deliveryCase = {}, verificationSlice = {}, parentSlice = {}) {
  return `${safeToken(deliveryCase.caseId, "delivery", 140)}_${repairSliceKeyForVerification(verificationSlice, parentSlice)}`;
}

function deploymentSliceKeyForSlice(slice = {}) {
  const parentKey = safeToken(slice.sliceKey || slice.sliceId || "slice", "slice", 100);
  const returnKey = safeToken(slice.returnCardId || slice.taskCardId || "return", "return", 80);
  return `${parentKey}_deploy_readback_${returnKey}`;
}

function deploymentSliceIdForSlice(deliveryCase = {}, slice = {}) {
  return `${safeToken(deliveryCase.caseId, "delivery", 140)}_${deploymentSliceKeyForSlice(slice)}`;
}

function isVerificationSlice(slice = {}) {
  const ownerLayer = clean(slice.ownerLayer || "", 120);
  const sliceKey = clean(slice.sliceKey || "", 160);
  return ownerLayer === "verification_or_audit_thread"
    && Boolean(slice.parentSliceId || slice.verificationForTaskCardId || (sliceKey.endsWith("_verification") && sliceKey !== "closure_verification"));
}

function isPlannedClosureVerificationSlice(slice = {}) {
  const ownerLayer = clean(slice.ownerLayer || "", 120);
  const sliceKey = clean(slice.sliceKey || "", 160);
  return ownerLayer === "verification_or_audit_thread"
    && sliceKey === "closure_verification"
    && !isVerificationSlice(slice);
}

function isImplementationSlice(slice = {}) {
  return [
    "home_ai_workspace",
    "plugin_workspace",
    "implementation_thread",
  ].includes(clean(slice.ownerLayer || "", 120));
}

function isActiveImplementationSlice(slice = {}) {
  return isImplementationSlice(slice) && ACTIVE_DISPATCH_STATUSES.includes(clean(slice.status || "", 80));
}

function dispatchConflictKeyForSlice(slice = {}) {
  const targetWorkspaceId = safeToken(slice.targetWorkspaceId || "", "", 120).toLowerCase();
  if (targetWorkspaceId) return `workspace:${targetWorkspaceId}`;
  const targetWorkspacePath = clean(slice.targetWorkspacePath || "", 800);
  if (targetWorkspacePath) return `path:${shortHash(targetWorkspacePath, 16)}`;
  return "";
}

function boundedDispatchConflict(slice = {}, activeSlice = {}, code = "workspace_dispatch_conflict") {
  return {
    code,
    targetWorkspaceId: clean(slice.targetWorkspaceId || activeSlice.targetWorkspaceId || "", 120),
    activeSliceId: clean(activeSlice.sliceId || "", 180),
    activeCaseId: clean(activeSlice.caseId || "", 160),
    activeStatus: clean(activeSlice.status || "", 80),
    activeDispatchStatus: clean(activeSlice.dispatchStatus || "", 80),
    activeTaskCardId: clean(activeSlice.taskCardId || "", 160),
  };
}

function firstDispatchFailure(slice = {}) {
  for (const key of [
    "dispatchFailure",
    "verificationDispatchFailure",
    "deploymentDispatchFailure",
    "repairDispatchFailure",
  ]) {
    const failure = objectValue(slice[key]);
    if (Object.keys(failure).length) return failure;
  }
  return {};
}

function dispatchControlActionForSlice(slice = {}) {
  const dispatchStatus = clean(slice.dispatchStatus || "", 80);
  if (dispatchStatus === "deferred_conflict") return "wait_for_active_slice_then_retry_from_action_inbox";
  if (dispatchStatus === "failed") return "inspect_routing_failure_then_retry_from_action_inbox";
  if (dispatchStatus === "dispatching") return "observe_dispatch_completion";
  if (dispatchStatus === "return_stale") return "inspect_missing_return_then_record_terminal_return_or_reroute";
  if (dispatchStatus === "sent") return "observe_return_card";
  return "observe";
}

function dispatchControlItemForSlice(slice = {}) {
  const conflict = objectValue(slice.dispatchConflict);
  const failure = firstDispatchFailure(slice);
  return {
    caseId: clean(slice.caseId || "", 160),
    sliceId: clean(slice.sliceId || "", 160),
    sliceKey: clean(slice.sliceKey || "", 160),
    ownerLayer: clean(slice.ownerLayer || "", 120),
    targetWorkspaceId: clean(slice.targetWorkspaceId || "", 120),
    status: clean(slice.status || "", 80),
    dispatchStatus: clean(slice.dispatchStatus || "", 80),
    blockedReason: clean(slice.blockedReason || "", 160),
    taskCardId: clean(slice.taskCardId || "", 160),
    conflictCode: clean(conflict.code || "", 120),
    activeCaseId: clean(conflict.activeCaseId || "", 160),
    activeSliceId: clean(conflict.activeSliceId || "", 160),
    activeTaskCardId: clean(conflict.activeTaskCardId || "", 160),
    failureCode: clean(failure.code || failure.error || "", 120),
    returnWatchdogCode: clean(objectValue(slice.returnWatchdog).code || "", 120),
    recommendedAction: dispatchControlActionForSlice(slice),
    actionRequiresOwnerConfirmation: ["deferred_conflict", "failed", "return_stale"].includes(clean(slice.dispatchStatus || "", 80)),
    updatedAt: clean(slice.updatedAt || "", 80),
  };
}

function dispatchControlStatus(counts = {}) {
  if (Number(counts.failed || 0) > 0) return "degraded";
  if (Number(counts.returnStale || 0) > 0) return "degraded";
  if (Number(counts.deferredConflict || 0) > 0) return "warning";
  return "ok";
}

function parseIsoMs(value) {
  const parsed = Date.parse(clean(value || "", 100));
  return Number.isFinite(parsed) ? parsed : 0;
}

function boundedReturnWatchdogStaleMs(input = {}, options = {}) {
  const raw = input.staleAfterMs ?? input.stale_after_ms ?? options.returnWatchdogStaleMs ?? DEFAULT_RETURN_WATCHDOG_STALE_MS;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric < 0) return DEFAULT_RETURN_WATCHDOG_STALE_MS;
  return Math.min(30 * 24 * 60 * 60 * 1000, numeric);
}

function returnWatchdogCandidate(slice = {}) {
  const dispatchStatus = clean(slice.dispatchStatus || "", 80);
  if (!["sent", "return_stale"].includes(dispatchStatus)) return false;
  if (!clean(slice.taskCardId || "", 160)) return false;
  if (clean(slice.returnCardId || "", 160)) return false;
  if (TERMINAL_SLICE_STATUSES.includes(clean(slice.status || "", 80))) return false;
  return true;
}

function returnWatchdogItemForSlice(slice = {}, nowMs = Date.now(), staleAfterMs = DEFAULT_RETURN_WATCHDOG_STALE_MS) {
  const referenceMs = parseIsoMs(slice.updatedAt) || parseIsoMs(slice.startedAt) || parseIsoMs(slice.createdAt);
  const ageMs = referenceMs ? Math.max(0, nowMs - referenceMs) : 0;
  const alreadyMarked = clean(slice.dispatchStatus || "", 80) === "return_stale";
  const stale = alreadyMarked || (referenceMs && ageMs >= staleAfterMs);
  return {
    caseId: clean(slice.caseId || "", 160),
    sliceId: clean(slice.sliceId || "", 160),
    sliceKey: clean(slice.sliceKey || "", 160),
    ownerLayer: clean(slice.ownerLayer || "", 120),
    targetWorkspaceId: clean(slice.targetWorkspaceId || "", 120),
    dispatchStatus: clean(slice.dispatchStatus || "", 80),
    taskCardId: clean(slice.taskCardId || "", 160),
    ageMs,
    ageMinutes: Math.floor(ageMs / 60000),
    staleAfterMs,
    stale: Boolean(stale),
    alreadyMarked,
    code: stale ? "return_card_missing_after_sla" : "return_card_waiting",
    recommendedAction: stale
      ? "inspect_missing_return_then_record_terminal_return_or_reroute"
      : "observe_return_card",
    updatedAt: clean(slice.updatedAt || "", 80),
    startedAt: clean(slice.startedAt || "", 80),
  };
}

function activeImplementationConflicts(currentStore, candidateSlices = []) {
  if (!currentStore || typeof currentStore.listAutonomousDeliverySlices !== "function") return new Map();
  const targetKeys = new Set(candidateSlices.map(dispatchConflictKeyForSlice).filter(Boolean));
  if (!targetKeys.size) return new Map();
  const conflicts = new Map();
  const activeSlices = currentStore.listAutonomousDeliverySlices({ limit: 500 })
    .filter(isActiveImplementationSlice);
  for (const activeSlice of activeSlices) {
    const key = dispatchConflictKeyForSlice(activeSlice);
    if (!key || !targetKeys.has(key) || conflicts.has(key)) continue;
    conflicts.set(key, activeSlice);
  }
  return conflicts;
}

function isDeploymentSlice(slice = {}) {
  return clean(slice.ownerLayer || "", 120) === "deployment_owner"
    || clean(slice.sliceKey || "", 160).includes("_deploy_readback_");
}

function parentSliceIdForVerification(slice = {}) {
  return clean(slice.parentSliceId || slice.parent_slice_id || "", 180);
}

function sliceRawJsonForUpdate(slice = {}, extra = {}) {
  const preserved = objectValue(slice.rawJson || slice.raw_json);
  for (const key of [
    "parentSliceId",
    "parentSliceKey",
    "verificationForTaskCardId",
    "implementationReturnCardId",
    "implementationReturnSummary",
    "auditKind",
    "auditThreadTitle",
    "verificationTaskCardId",
    "verificationTaskCardIds",
    "deploymentRequired",
    "deploymentReason",
    "deploymentForTaskCardId",
    "deploymentSliceId",
    "deploymentTaskCardId",
    "deploymentTaskCardIds",
    "deploymentStatus",
    "deploymentReturnCardId",
    "deploymentReturnSummary",
    "returnSummary",
    "returnCardId",
    "originalTaskCardId",
    "returnCardEvent",
    "returnWatchdog",
    "sourceReturnIntegration",
    "aiOps",
  ]) {
    if (slice[key] !== undefined && slice[key] !== "") preserved[key] = slice[key];
  }
  return Object.assign({}, preserved, extra);
}

function allImplementationSlicesVerified(slices = []) {
  const implementationSlices = arrayValue(slices).filter(isImplementationSlice);
  if (!implementationSlices.length) return false;
  return implementationSlices.every((slice) => {
    if (slice.status !== "completed") return false;
    return slices.some((candidate) => isVerificationSlice(candidate)
      && parentSliceIdForVerification(candidate) === slice.sliceId
      && candidate.status === "completed");
  });
}

function verificationTaskCardBodyForSlice(deliveryCase = {}, slice = {}, ownerPrompt = "") {
  const prompt = cleanBlock(ownerPrompt, 1200);
  const returnSummary = cleanBlock(slice.returnSummary || "", 1200);
  const deploymentSummary = cleanBlock(slice.deploymentReturnSummary || "", 1200);
  return [
    "# Autonomous Delivery Verification Task",
    "",
    `Delivery case: \`${deliveryCase.caseId}\``,
    `Implementation slice: \`${slice.sliceKey || slice.sliceId}\``,
    `Original task card: \`${slice.taskCardId || "unknown"}\``,
    `Implementation return card: \`${slice.returnCardId || "unknown"}\``,
    `Objective: ${deliveryCase.objective}`,
    `Implementation target: \`${slice.targetWorkspacePath || slice.targetWorkspaceId || "unknown"}\``,
    "",
    "## Verification Scope",
    "",
    "- Independently verify the returned implementation evidence for this slice.",
    "- Use read-only source/docs/tests/runtime evidence unless a separate repair card is required.",
    "- Confirm whether the implementation return satisfies the slice objective and privacy boundary.",
    "- If validation fails, return a terminal card with the exact blocker and owning repair layer.",
    "- Do not acknowledge this verification card with another acknowledgement-only return.",
    "",
    returnSummary ? "## Implementation Return Summary" : "",
    returnSummary ? "" : "",
    returnSummary,
    "",
    deploymentSummary ? "## Deployment / Readback Summary" : "",
    deploymentSummary ? "" : "",
    deploymentSummary,
    "",
    ...aiOpsRequiredChecksLines(slice.aiOps),
    "",
    prompt ? "## Owner Additional Verification Prompt" : "",
    prompt ? "" : "",
    prompt,
    "",
    "## Required Return",
    "",
    "- Return `completed` only when verification is independently closed.",
    "- Return `blocked`, `redirected`, `rejected`, or `partially_completed` when residual work remains.",
    "- Include bounded evidence, commands run, residual risk, and privacy confirmation.",
    "- If an AI Ops evidence ledger or artifact path exists, return it in bounded metadata; Home AI will verify and store only redacted hashes/results.",
    "",
    "## Privacy Boundary",
    "",
    "Do not include raw secrets, cookies, launch tokens, OAuth tokens, provider payloads, private plugin records, database rows, screenshots with private data, full prompts, raw task-card bodies, or long logs in the return card.",
  ].filter((line, index, lines) => line || lines[index - 1] || lines[index + 1]).join("\n");
}

function verificationTaskCardForSlice(deliveryCase = {}, slice = {}, target = {}, ownerPrompt = "") {
  const label = clean(target.label || "Audit", 120);
  return {
    title: clean(`Verify Delivery Loop: ${slice.sliceKey || slice.sliceId}`, 90),
    summary: clean(`${deliveryCase.caseId} verification for ${slice.sliceKey || slice.sliceId}`, 260),
    body: verificationTaskCardBodyForSlice(deliveryCase, slice, ownerPrompt),
    targetThreadTitle: target.targetThreadTitle || "",
    targetWorkspace: target.targetWorkspace || APP_WORKSPACE,
    auditKind: target.auditKind || "plugin",
    workflowMode: "manual",
    reasoningEffort: normalizeTaskCardReasoningEffort({
      requested: deliveryCase.risk === "low" ? "medium" : "high",
      risk: deliveryCase.risk,
      severity: slice.aiOps?.harnessClass,
    }),
    requestId: `autonomous-delivery-verification-${deliveryCase.caseId}-${slice.sliceKey || slice.sliceId}-${slice.returnCardId || slice.taskCardId || "return"}`,
    _targetLabel: label,
  };
}

function deploymentTaskCardBodyForSlice(deliveryCase = {}, deploymentSlice = {}, parentSlice = {}, target = {}, ownerPrompt = "") {
  const prompt = cleanBlock(ownerPrompt, 1200);
  const returnSummary = cleanBlock(parentSlice.returnSummary || "", 1200);
  const implementationTarget = objectValue(target.implementationTarget);
  const implementationWorkspace = clean(parentSlice.targetWorkspacePath || implementationTarget.targetWorkspace || "", 260);
  const implementationThread = clean(implementationTarget.targetThreadTitle || implementationTarget.targetThreadTitlePrefix || implementationTarget.label || "", 180);
  return [
    "# Autonomous Delivery Deployment / Readback Task",
    "",
    `Delivery case: \`${deliveryCase.caseId}\``,
    `Deployment slice: \`${deploymentSlice.sliceKey || deploymentSlice.sliceId}\``,
    `Implementation slice: \`${parentSlice.sliceKey || parentSlice.sliceId || "unknown"}\``,
    `Implementation task card: \`${parentSlice.taskCardId || "unknown"}\``,
    `Implementation return card: \`${parentSlice.returnCardId || "unknown"}\``,
    implementationThread ? `Implementation thread: \`${implementationThread}\`` : "",
    implementationWorkspace ? `Implementation target workspace: \`${implementationWorkspace}\`` : "",
    `Objective: ${deliveryCase.objective}`,
    "",
    "## Required Deployment / Readback",
    "",
    "- Source role: `central_deploy_coordinator`; this deploy card is generated by Home AI central coordination after Worker return metadata was merged.",
    `- Central coordinator ref: \`${deliveryCase.caseId || "unknown"}\``,
    "- Use the central Home AI deploy contract from this dedicated deployment thread; do not introduce ad-hoc production mutation paths.",
    "- Do not require plugin workspaces to read or pass sudo password files; local operator credential paths are Home AI deployment-thread private inputs.",
    "- Deploy only the returned implementation/repair scope needed for this slice.",
    "- Run bounded production readback for the changed runtime surface.",
    "- Return a real task card with completed, blocked, redirected, rejected, or partially_completed status.",
    "- Include deploy command class, production backup/readback markers, residual risk, and privacy confirmation.",
    "- If an AI Ops evidence ledger or artifact path exists, return it in bounded metadata; Home AI will verify and store only redacted hashes/results.",
    "",
    returnSummary ? "## Implementation Return Summary" : "",
    returnSummary ? "" : "",
    returnSummary,
    "",
    ...aiOpsRequiredChecksLines(deploymentSlice.aiOps),
    "",
    prompt ? "## Owner Additional Prompt" : "",
    prompt ? "" : "",
    prompt,
    "",
    "## Privacy Boundary",
    "",
    "Do not include raw secrets, sudo passwords, cookies, launch tokens, OAuth tokens, provider payloads, private plugin records, database rows, screenshots with private data, full prompts, raw task-card bodies, or long logs in the return card.",
  ].filter((line, index, lines) => line || lines[index - 1] || lines[index + 1]).join("\n");
}

function deploymentTaskCardForSlice(deliveryCase = {}, deploymentSlice = {}, parentSlice = {}, target = {}, ownerPrompt = "") {
  const label = clean(target.label || parentSlice.targetWorkspaceId || deploymentSlice.targetWorkspaceId || "Home AI", 120);
  return {
    title: clean(`Deploy Delivery Loop: ${label} ${parentSlice.sliceKey || parentSlice.sliceId || deploymentSlice.sliceKey}`, 90),
    summary: clean(`${deliveryCase.caseId} deploy/readback for ${parentSlice.sliceKey || parentSlice.sliceId}: ${deliveryCase.objective}`, 260),
    body: deploymentTaskCardBodyForSlice(deliveryCase, deploymentSlice, parentSlice, target, ownerPrompt),
    targetThreadTitle: target.targetThreadTitle || "",
    targetWorkspace: target.targetWorkspace || deploymentSlice.targetWorkspacePath || parentSlice.targetWorkspacePath || "",
    auditKind: target.auditKind || "deployment",
    cardKind: "plugin_deployment",
    pluginId: clean(parentSlice.targetWorkspaceId || deploymentSlice.targetWorkspaceId || "", 120),
    sourceRole: "central_deploy_coordinator",
    centralCoordinatorRef: clean(deliveryCase.caseId || "", 160),
    sourceRef: clean(parentSlice.returnCardId || parentSlice.taskCardId || "", 160),
    dirtyState: { dirty: false, files: [] },
    validationSummary: boundedArray(parentSlice.aiOps?.evidence?.lastReturn?.commandsRun || [], 12, 260),
    requiredReadback: ["production deploy/readback terminal return", "bounded source/prod parity or target health readback"],
    workflowMode: "manual",
    reasoningEffort: "high",
    requestId: `autonomous-delivery-deploy-readback-${deliveryCase.caseId}-${parentSlice.sliceKey || parentSlice.sliceId}-${parentSlice.returnCardId || parentSlice.taskCardId || "return"}`,
  };
}

function repairTaskCardBodyForSlice(deliveryCase = {}, repairSlice = {}, verificationSlice = {}, parentSlice = {}, ownerPrompt = "") {
  const prompt = cleanBlock(ownerPrompt, 1200);
  const verificationSummary = cleanBlock(verificationSlice.returnSummary || "", 1200);
  return [
    "# Autonomous Delivery Repair Task",
    "",
    `Delivery case: \`${deliveryCase.caseId}\``,
    `Repair slice: \`${repairSlice.sliceKey || repairSlice.sliceId}\``,
    `Original implementation slice: \`${parentSlice.sliceKey || parentSlice.sliceId || "unknown"}\``,
    `Verification slice: \`${verificationSlice.sliceKey || verificationSlice.sliceId || "unknown"}\``,
    `Verification return card: \`${verificationSlice.returnCardId || "unknown"}\``,
    `Verification status: \`${verificationSlice.status || "unknown"}\``,
    `Objective: ${deliveryCase.objective}`,
    "",
    "## Required Repair",
    "",
    repairSlice.summary || "Repair the returned verification finding in the owning workspace.",
    "",
    verificationSummary ? "## Verification Return Summary" : "",
    verificationSummary ? "" : "",
    verificationSummary,
    "",
    "## Loop Contract",
    "",
    "- Repair the owning workspace implementation, docs, tests, deployment, or evidence gap identified by verification.",
    "- Keep the change bounded to the failed slice unless the return card explicitly proves a broader owner.",
    "- Add focused validation for the repair.",
    "- If runtime behavior changes, deploy through the established central/plugin deploy contract and include production readback.",
    "- Return a real task card with completed, blocked, redirected, rejected, or partially_completed status.",
    "- If an AI Ops evidence ledger or artifact path exists, return it in bounded metadata; Home AI will verify and store only redacted hashes/results.",
    "",
    ...aiOpsRequiredChecksLines(repairSlice.aiOps),
    "",
    prompt ? "## Owner Additional Prompt" : "",
    prompt ? "" : "",
    prompt,
    "",
    "## Privacy Boundary",
    "",
    "Do not include raw secrets, cookies, launch tokens, OAuth tokens, provider payloads, private plugin records, database rows, screenshots with private data, full prompts, raw task-card bodies, or long logs in the return card.",
  ].filter((line, index, lines) => line || lines[index - 1] || lines[index + 1]).join("\n");
}

function repairTaskCardForSlice(deliveryCase = {}, repairSlice = {}, verificationSlice = {}, parentSlice = {}, target = {}, ownerPrompt = "") {
  const label = clean(target.label || parentSlice.targetWorkspaceId || repairSlice.targetWorkspaceId || "Home AI", 120);
  return {
    title: clean(`Repair Delivery Loop: ${label} ${parentSlice.sliceKey || parentSlice.sliceId || repairSlice.sliceKey}`, 90),
    summary: clean(`${deliveryCase.caseId} repair for ${parentSlice.sliceKey || parentSlice.sliceId}: ${deliveryCase.objective}`, 260),
    body: repairTaskCardBodyForSlice(deliveryCase, repairSlice, verificationSlice, parentSlice, ownerPrompt),
    targetThreadTitle: target.targetThreadTitle || "",
    targetWorkspace: target.targetWorkspace || repairSlice.targetWorkspacePath || parentSlice.targetWorkspacePath || "",
    workflowMode: "manual",
    reasoningEffort: normalizeTaskCardReasoningEffort({
      requested: deliveryCase.risk === "low" ? "medium" : "high",
      risk: deliveryCase.risk,
      severity: repairSlice.aiOps?.harnessClass,
    }),
    requestId: `autonomous-delivery-repair-${deliveryCase.caseId}-${parentSlice.sliceKey || parentSlice.sliceId}-${verificationSlice.returnCardId || verificationSlice.taskCardId || verificationSlice.sliceId}`,
  };
}

function ownerNotificationForCase(deliveryCase = {}, slices = []) {
  const required = arrayValue(deliveryCase.userDecisionGate?.required);
  const actionLabel = required.length ? "确认并开始" : "开始执行";
  return {
    workspaceId: OWNER_WORKSPACE_ID,
    assigneeWorkspaceId: OWNER_WORKSPACE_ID,
    sourceType: "autonomous_delivery",
    sourceId: deliveryCase.caseId,
    itemType: "approval",
    status: "open",
    priority: deliveryCase.risk === "high" ? "urgent" : (deliveryCase.risk === "medium" ? "high" : "normal"),
    title: clean(`交付 Loop 待启动：${deliveryCase.objective}`, 180),
    summary: [
      `模式：${deliveryCase.mode || "delivery"}，风险：${deliveryCase.risk || "medium"}`,
      required.length ? `需要 Owner 确认：${required.join(", ")}` : "Owner 可以手动启动第一批非高风险任务卡。",
      `工作切片：${slices.length}`,
    ].join("\n"),
    actionLabel,
    dedupeKey: `autonomous-delivery:${deliveryCase.caseId}:owner`,
    reopen: true,
    sourceRef: {
      notificationType: NOTIFICATION_TYPE,
      caseId: deliveryCase.caseId,
      mode: deliveryCase.mode,
      risk: deliveryCase.risk,
      requiredDecisions: required,
      sliceCount: slices.length,
    },
    rawJson: {
      autonomousDelivery: {
        case: deliveryCase,
        slices,
      },
    },
  };
}

function ownerVerificationNotificationForReturn(deliveryCase = {}, slice = {}) {
  const hasDeployment = Boolean(slice.deploymentSliceId || slice.deploymentReturnCardId);
  return {
    workspaceId: OWNER_WORKSPACE_ID,
    assigneeWorkspaceId: OWNER_WORKSPACE_ID,
    sourceType: "autonomous_delivery",
    sourceId: `${deliveryCase.caseId}:${slice.sliceId}:verification`,
    itemType: "review",
    status: "open",
    priority: deliveryCase.risk === "high" ? "urgent" : "high",
    title: clean(`交付 Loop 待验证：${deliveryCase.objective}`, 180),
    summary: [
      `工作切片：${slice.sliceKey || slice.sliceId}`,
      `回卡状态：${slice.status}`,
      hasDeployment ? "部署读回：已记录，验证需覆盖生产证据。" : "",
      slice.returnSummary ? `回卡摘要：${slice.returnSummary}` : "",
      "Owner 需要确认验证、部署或审计下一步。",
    ].filter(Boolean).join("\n"),
    actionLabel: "查看验证",
    dedupeKey: `autonomous-delivery:${deliveryCase.caseId}:${slice.sliceId}:verification`,
    reopen: true,
    sourceRef: {
      notificationType: VERIFICATION_NOTIFICATION_TYPE,
      caseId: deliveryCase.caseId,
      sliceId: slice.sliceId,
      sliceKey: slice.sliceKey,
      taskCardId: slice.taskCardId,
      returnCardId: slice.returnCardId,
      deploymentSliceId: slice.deploymentSliceId || "",
      deploymentTaskCardId: slice.deploymentTaskCardId || "",
      deploymentReturnCardId: slice.deploymentReturnCardId || "",
      caseStatus: deliveryCase.status,
    },
    rawJson: {
      autonomousDelivery: {
        case: deliveryCase,
        slice,
      },
    },
  };
}

function ownerDeploymentNotificationForReturn(deliveryCase = {}, slice = {}) {
  return {
    workspaceId: OWNER_WORKSPACE_ID,
    assigneeWorkspaceId: OWNER_WORKSPACE_ID,
    sourceType: "autonomous_delivery",
    sourceId: `${deliveryCase.caseId}:${slice.sliceId}:deploy-readback`,
    itemType: "review",
    status: "open",
    priority: "urgent",
    title: clean(`交付 Loop 待部署读回：${deliveryCase.objective}`, 180),
    summary: [
      `工作切片：${slice.sliceKey || slice.sliceId}`,
      slice.deploymentReason ? `原因：${slice.deploymentReason}` : "实现回卡提示存在运行时/生产路径变更，需要部署或读回证据。",
      slice.returnSummary ? `回卡摘要：${slice.returnSummary}` : "",
      "Owner 可以发送部署/读回卡；不会自动部署。",
    ].filter(Boolean).join("\n"),
    actionLabel: "部署读回",
    dedupeKey: `autonomous-delivery:${deliveryCase.caseId}:${slice.sliceId}:deploy-readback`,
    reopen: true,
    sourceRef: {
      notificationType: DEPLOYMENT_NOTIFICATION_TYPE,
      caseId: deliveryCase.caseId,
      sliceId: slice.sliceId,
      sliceKey: slice.sliceKey,
      taskCardId: slice.taskCardId,
      returnCardId: slice.returnCardId,
      deploymentRequired: true,
      deploymentReason: slice.deploymentReason || "",
      caseStatus: deliveryCase.status,
    },
    rawJson: {
      autonomousDelivery: {
        case: deliveryCase,
        slice,
      },
    },
  };
}

function ownerClosureNotificationForVerification(deliveryCase = {}, verificationSlice = {}, parentSlice = {}) {
  return {
    workspaceId: OWNER_WORKSPACE_ID,
    assigneeWorkspaceId: OWNER_WORKSPACE_ID,
    sourceType: "autonomous_delivery",
    sourceId: `${deliveryCase.caseId}:closure`,
    itemType: "review",
    status: "open",
    priority: deliveryCase.risk === "high" ? "urgent" : "high",
    title: clean(`交付 Loop 待收尾：${deliveryCase.objective}`, 180),
    summary: [
      parentSlice?.sliceKey ? `已验证切片：${parentSlice.sliceKey}` : "",
      verificationSlice.returnSummary ? `验证摘要：${verificationSlice.returnSummary}` : "",
      "Owner 确认可审计证据后完成闭环。",
    ].filter(Boolean).join("\n"),
    actionLabel: "完成闭环",
    dedupeKey: `autonomous-delivery:${deliveryCase.caseId}:closure`,
    reopen: true,
    sourceRef: {
      notificationType: CLOSURE_NOTIFICATION_TYPE,
      caseId: deliveryCase.caseId,
      parentSliceId: parentSlice?.sliceId || "",
      parentSliceKey: parentSlice?.sliceKey || "",
      verificationSliceId: verificationSlice.sliceId,
      verificationTaskCardId: verificationSlice.taskCardId,
      verificationReturnCardId: verificationSlice.returnCardId,
      caseStatus: deliveryCase.status,
    },
    rawJson: {
      autonomousDelivery: {
        case: deliveryCase,
        parentSlice,
        verificationSlice,
      },
    },
  };
}

function ownerRepairNotificationForVerification(deliveryCase = {}, verificationSlice = {}, parentSlice = {}) {
  return {
    workspaceId: OWNER_WORKSPACE_ID,
    assigneeWorkspaceId: OWNER_WORKSPACE_ID,
    sourceType: "autonomous_delivery",
    sourceId: `${deliveryCase.caseId}:${verificationSlice.sliceId}:repair`,
    itemType: "review",
    status: "open",
    priority: "urgent",
    title: clean(`交付 Loop 待修复：${deliveryCase.objective}`, 180),
    summary: [
      parentSlice?.sliceKey ? `原切片：${parentSlice.sliceKey}` : "",
      `验证状态：${verificationSlice.status}`,
      verificationSlice.returnSummary ? `验证摘要：${verificationSlice.returnSummary}` : "",
      "Owner 可以向原实现工作区发送修复卡。",
    ].filter(Boolean).join("\n"),
    actionLabel: "发修复卡",
    dedupeKey: `autonomous-delivery:${deliveryCase.caseId}:${verificationSlice.sliceId}:repair`,
    reopen: true,
    sourceRef: {
      notificationType: REPAIR_NOTIFICATION_TYPE,
      caseId: deliveryCase.caseId,
      parentSliceId: parentSlice?.sliceId || "",
      parentSliceKey: parentSlice?.sliceKey || "",
      verificationSliceId: verificationSlice.sliceId,
      verificationTaskCardId: verificationSlice.taskCardId,
      verificationReturnCardId: verificationSlice.returnCardId,
      verificationStatus: verificationSlice.status,
      caseStatus: deliveryCase.status,
    },
    rawJson: {
      autonomousDelivery: {
        case: deliveryCase,
        parentSlice,
        verificationSlice,
      },
    },
  };
}

function finalReportSliceSummary(slice = {}) {
  const aiOps = objectValue(slice.aiOps);
  const evidence = objectValue(aiOps.evidence);
  const lastReturn = objectValue(evidence.lastReturn);
  const ledgerVerification = objectValue(lastReturn.ledgerVerification);
  const deploymentEvidence = objectValue(evidence.deployment);
  const deploymentLedgerVerification = objectValue(deploymentEvidence.ledgerVerification);
  return {
    sliceId: clean(slice.sliceId, 160),
    sliceKey: clean(slice.sliceKey, 160),
    ownerLayer: clean(slice.ownerLayer, 120),
    targetWorkspaceId: clean(slice.targetWorkspaceId, 120),
    status: clean(slice.status, 80),
    risk: clean(slice.risk, 40),
    taskCardId: clean(slice.taskCardId, 160),
    returnCardId: clean(slice.returnCardId, 160),
    returnSummary: cleanBlock(slice.returnSummary || "", 600),
    deploymentSliceId: clean(slice.deploymentSliceId, 160),
    deploymentTaskCardId: clean(slice.deploymentTaskCardId, 160),
    deploymentReturnCardId: clean(slice.deploymentReturnCardId, 160),
    deploymentReturnSummary: cleanBlock(slice.deploymentReturnSummary || "", 600),
    verificationTaskCardId: clean(slice.verificationTaskCardId || slice.taskCardId, 160),
    verificationReturnCardId: clean(slice.verificationReturnCardId || slice.returnCardId, 160),
    verificationReturnSummary: cleanBlock(slice.verificationReturnSummary || "", 600),
    repairTaskCardId: clean(slice.repairTaskCardId, 160),
    aiOps: {
      stage: clean(aiOps.stage || "", 60),
      harnessClass: clean(aiOps.harnessClass || "", 20),
      modules: boundedArray(aiOps.modules, 8, 160),
      requiredCheckCount: arrayValue(aiOps.requiredChecks).length,
      requiredDocs: boundedArray(aiOps.requiredDocs, 8, 260),
      requiredChecks: arrayValue(aiOps.requiredChecks).map(boundedAiOpsCheck).slice(0, 12),
      rootCauseRequired: Boolean(aiOps.rootCauseGovernance?.required),
      visualLaneRequired: Boolean(aiOps.visualLane?.required),
      deploymentRequired: Boolean(aiOps.deployment?.required),
      blockedIf: boundedArray(aiOps.blockedIf, 10, 160),
      evidenceStatus: clean(evidence.status || "", 80),
      lastReturnStatus: clean(lastReturn.returnStatus || "", 80),
      lastReturnEvidenceCount: arrayValue(lastReturn.evidenceRecords).length,
      lastReturnCommandCount: arrayValue(lastReturn.commandsRun).length,
      lastReturnArtifactPointerCount: arrayValue(lastReturn.artifactPointers).length,
      lastReturnLedgerChecked: Boolean(ledgerVerification.checked),
      lastReturnLedgerOk: ledgerVerification.checked ? ledgerVerification.ok === true : false,
      lastReturnLedgerRecordCount: Number(ledgerVerification.recordCount || 0),
      lastReturnLedgerIssues: boundedArray(ledgerVerification.issues, 10, 160),
      lastReturnLedgerLabel: clean(ledgerVerification.label || "", 80),
      deploymentEvidenceStatus: clean(deploymentEvidence.status || "", 80),
      deploymentEvidenceSummary: cleanBlock(deploymentEvidence.summary || "", 500),
      deploymentEvidenceRecordCount: Number(deploymentEvidence.evidenceRecordCount || 0),
      deploymentEvidenceCommandCount: Number(deploymentEvidence.commandCount || 0),
      deploymentArtifactPointerCount: Number(deploymentEvidence.artifactPointerCount || 0),
      deploymentLedgerChecked: Boolean(deploymentLedgerVerification.checked),
      deploymentLedgerOk: deploymentLedgerVerification.checked ? deploymentLedgerVerification.ok === true : false,
      deploymentLedgerRecordCount: Number(deploymentLedgerVerification.recordCount || 0),
      deploymentLedgerIssues: boundedArray(deploymentLedgerVerification.issues, 10, 160),
      deploymentLedgerLabel: clean(deploymentLedgerVerification.label || "", 80),
    },
  };
}

function finalReportMarkdown(deliveryCase = {}, sliceSummaries = [], events = []) {
  const counts = sliceSummaries.reduce((acc, slice) => {
    const status = slice.status || "unknown";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const lines = [
    "# Autonomous Delivery Loop Final Report",
    "",
    `Case: \`${deliveryCase.caseId || "unknown"}\``,
    `Status: \`${deliveryCase.status || "unknown"}\``,
    `Objective: ${deliveryCase.objective || ""}`,
    `Mode: \`${deliveryCase.mode || "delivery"}\``,
    `Risk: \`${deliveryCase.risk || "medium"}\``,
    "",
    "## Slice Status",
    "",
    `- Total: ${sliceSummaries.length}`,
    ...Object.keys(counts).sort().map((status) => `- ${status}: ${counts[status]}`),
    "",
    "## Evidence Trail",
    "",
  ];
  for (const slice of sliceSummaries) {
    const evidence = [
      slice.taskCardId ? `task ${slice.taskCardId}` : "",
      slice.returnCardId ? `return ${slice.returnCardId}` : "",
      slice.deploymentTaskCardId ? `deploy ${slice.deploymentTaskCardId}` : "",
      slice.deploymentReturnCardId ? `deploy return ${slice.deploymentReturnCardId}` : "",
      slice.verificationReturnCardId && slice.ownerLayer === "verification_or_audit_thread" ? `verification return ${slice.verificationReturnCardId}` : "",
    ].filter(Boolean).join("; ");
    lines.push(`- \`${slice.sliceKey || slice.sliceId || "slice"}\`: ${slice.status || "unknown"}${evidence ? ` (${evidence})` : ""}`);
    if (slice.returnSummary) lines.push(`  - Return: ${slice.returnSummary}`);
    if (slice.deploymentReturnSummary) lines.push(`  - Deployment/readback: ${slice.deploymentReturnSummary}`);
    if (slice.aiOps?.requiredCheckCount) {
      const gates = [
        slice.aiOps.rootCauseRequired ? "root-cause" : "",
        slice.aiOps.visualLaneRequired ? "visual-lane" : "",
        slice.aiOps.deploymentRequired ? "deployment" : "",
      ].filter(Boolean).join(", ");
      lines.push(`  - AI Ops: ${slice.aiOps.requiredCheckCount} required checks; harness ${slice.aiOps.harnessClass || "H3"}${gates ? `; gates ${gates}` : ""}`);
      const commands = arrayValue(slice.aiOps.requiredChecks).map((check) => check.command).filter(Boolean).slice(0, 3);
      for (const command of commands) lines.push(`    - \`${command}\``);
      if (slice.aiOps.requiredCheckCount > commands.length) lines.push(`    - ... ${slice.aiOps.requiredCheckCount - commands.length} more`);
    }
    if (slice.aiOps?.lastReturnEvidenceCount || slice.aiOps?.lastReturnCommandCount) {
      lines.push(`  - Evidence projection: ${slice.aiOps.lastReturnEvidenceCount} records, ${slice.aiOps.lastReturnCommandCount} commands`);
    }
    if (slice.aiOps?.lastReturnLedgerChecked) {
      lines.push(`  - Evidence ledger: ${slice.aiOps.lastReturnLedgerOk ? "passed" : "failed"}; records ${slice.aiOps.lastReturnLedgerRecordCount}; ref ${slice.aiOps.lastReturnLedgerLabel || "evidence-ledger"}`);
      for (const issue of arrayValue(slice.aiOps.lastReturnLedgerIssues).slice(0, 3)) {
        lines.push(`    - ${issue}`);
      }
    }
    if (slice.aiOps?.lastReturnArtifactPointerCount) {
      lines.push(`  - Artifact pointers: ${slice.aiOps.lastReturnArtifactPointerCount} bounded references`);
    }
    if (slice.aiOps?.deploymentEvidenceSummary) {
      lines.push(`  - Deployment evidence projection: ${slice.aiOps.deploymentEvidenceSummary}`);
    }
    if (slice.aiOps?.deploymentEvidenceRecordCount || slice.aiOps?.deploymentEvidenceCommandCount) {
      lines.push(`  - Deployment evidence counts: ${slice.aiOps.deploymentEvidenceRecordCount} records, ${slice.aiOps.deploymentEvidenceCommandCount} commands`);
    }
    if (slice.aiOps?.deploymentLedgerChecked) {
      lines.push(`  - Deployment evidence ledger: ${slice.aiOps.deploymentLedgerOk ? "passed" : "failed"}; records ${slice.aiOps.deploymentLedgerRecordCount}; ref ${slice.aiOps.deploymentLedgerLabel || "evidence-ledger"}`);
      for (const issue of arrayValue(slice.aiOps.deploymentLedgerIssues).slice(0, 3)) {
        lines.push(`    - ${issue}`);
      }
    }
    if (slice.aiOps?.deploymentArtifactPointerCount) {
      lines.push(`  - Deployment artifact pointers: ${slice.aiOps.deploymentArtifactPointerCount} bounded references`);
    }
  }
  const eventNames = arrayValue(events)
    .slice(0, 12)
    .map((event) => clean(event.eventType || event.event_type || "", 80))
    .filter(Boolean);
  if (eventNames.length) {
    lines.push("", "## Recent Ledger Events", "");
    for (const eventName of eventNames) lines.push(`- ${eventName}`);
  }
  lines.push(
    "",
    "## Privacy",
    "",
    "This projection includes bounded ids, statuses, summaries, and evidence markers only. It excludes raw secrets, cookies, launch tokens, private payloads, database rows, screenshots, full prompts, raw task-card bodies, and long logs.",
  );
  return cleanBlock(lines.join("\n"), 5000);
}

function deliveryFinalReportForCase(deliveryCase = {}, slices = [], events = []) {
  const sliceSummaries = arrayValue(slices).map(finalReportSliceSummary);
  const terminalCount = sliceSummaries.filter((slice) => TERMINAL_SLICE_STATUSES.includes(slice.status) || slice.status === "completed").length;
  return {
    caseId: clean(deliveryCase.caseId, 160),
    status: clean(deliveryCase.status, 80),
    objective: cleanBlock(deliveryCase.objective || "", 900),
    sliceCount: sliceSummaries.length,
    terminalSliceCount: terminalCount,
    taskCardIds: sliceSummaries.map((slice) => slice.taskCardId).filter(Boolean),
    returnCardIds: sliceSummaries.map((slice) => slice.returnCardId).filter(Boolean),
    deploymentReturnCardIds: sliceSummaries.map((slice) => slice.deploymentReturnCardId).filter(Boolean),
    verificationReturnCardIds: sliceSummaries
      .filter((slice) => slice.ownerLayer === "verification_or_audit_thread")
      .map((slice) => slice.verificationReturnCardId)
      .filter(Boolean),
    slices: sliceSummaries,
    markdown: finalReportMarkdown(deliveryCase, sliceSummaries, events),
  };
}

function ownerFinalReportNotificationForCase(deliveryCase = {}, slices = [], events = []) {
  const report = deliveryFinalReportForCase(deliveryCase, slices, events);
  return {
    workspaceId: OWNER_WORKSPACE_ID,
    assigneeWorkspaceId: OWNER_WORKSPACE_ID,
    sourceType: "autonomous_delivery",
    sourceId: `${deliveryCase.caseId}:final-report`,
    itemType: "delivery",
    status: "open",
    priority: "normal",
    title: clean(`交付 Loop 报告：${deliveryCase.objective}`, 180),
    summary: [
      `状态：${deliveryCase.status || "completed"}`,
      `切片：${report.terminalSliceCount}/${report.sliceCount}`,
      report.deploymentReturnCardIds.length ? `部署读回：${report.deploymentReturnCardIds.length}` : "",
      report.verificationReturnCardIds.length ? `验证回卡：${report.verificationReturnCardIds.length}` : "",
    ].filter(Boolean).join("\n"),
    actionLabel: "查看报告",
    dedupeKey: `autonomous-delivery:${deliveryCase.caseId}:final-report`,
    reopen: true,
    sourceRef: {
      notificationType: FINAL_REPORT_NOTIFICATION_TYPE,
      caseId: deliveryCase.caseId,
      caseStatus: deliveryCase.status,
      sliceCount: report.sliceCount,
      terminalSliceCount: report.terminalSliceCount,
      taskCardIds: report.taskCardIds,
      returnCardIds: report.returnCardIds,
      deploymentReturnCardIds: report.deploymentReturnCardIds,
      verificationReturnCardIds: report.verificationReturnCardIds,
      detailMessage: {
        format: "markdown",
        sourceTurnId: deliveryCase.caseId,
        body: report.markdown,
        truncated: false,
      },
    },
    rawJson: {
      autonomousDelivery: {
        finalReport: Object.assign({}, report, { markdown: undefined }),
      },
    },
  };
}

function inputBoolean(input = {}, keys = []) {
  for (const key of keys) {
    if (input[key] === true || input[key] === false) return input[key];
  }
  return undefined;
}

function returnRequiresDeployment(input = {}, slice = {}) {
  const metadata = objectValue(input.metadata || input.meta);
  const event = objectValue(input.returnCardEvent || input.return_card_event);
  const deployRequest = normalizeDeployRequest(input.deployRequest || input.deploy_request || metadata.deployRequest || metadata.deploy_request || {});
  if (deployRequest.needed) return true;
  const followUp = parseSourceReturnFollowUpAction(input);
  if (followUp.required && followUp.actionType === "deploy") return true;
  const explicitDeploymentRequired = inputBoolean(input, [
    "requiresDeployment",
    "requires_deployment",
    "deploymentRequired",
    "deployment_required",
  ]);
  if (explicitDeploymentRequired !== undefined) return Boolean(explicitDeploymentRequired);
  const nestedDeploymentRequired = inputBoolean(metadata, ["requiresDeployment", "deploymentRequired"])
    ?? inputBoolean(event, ["requiresDeployment", "deploymentRequired"]);
  if (nestedDeploymentRequired !== undefined) return Boolean(nestedDeploymentRequired);
  const runtimeChanged = inputBoolean(input, ["runtimeChanged", "runtime_changed", "productionChanged", "production_changed"])
    ?? inputBoolean(metadata, ["runtimeChanged", "productionChanged"])
    ?? inputBoolean(event, ["runtimeChanged", "productionChanged"]);
  const summary = cleanBlock([
    input.summary,
    input.title,
    metadata.summary,
    metadata.title,
    event.title,
    slice.returnSummary,
  ].filter(Boolean).join(" "), 3000).toLowerCase();
  if (!summary) return false;
  if (/deploy(ed|ment)?\s+(completed|succeeded|passed)|deployed through|production readback|deploy result[:=]\s*ok|readback (passed|returned|verified)|已部署|部署完成|生产读回|读回通过|上线完成/i.test(summary)) {
    return false;
  }
  if (/not deployed|deploy(?:ment)? required|production deploy required|deploy pending|not yet deployed|needs deploy|needs production readback|runtime behavior changed|runtime change|production path changed|未部署|待部署|需要部署|需要上线|需要生产读回|待上线/i.test(summary)) {
    return true;
  }
  if (runtimeChanged === true && !/deployed|deployment|production readback|读回|部署|上线/i.test(summary)) return true;
  return false;
}

function deploymentReasonForReturn(input = {}, slice = {}) {
  const metadata = objectValue(input.metadata || input.meta);
  return clean(input.deploymentReason || input.deployment_reason || metadata.deploymentReason || slice.deploymentReason || "runtime_or_production_readback_required", 180);
}

function cardIdsFromResult(result = {}) {
  return cardIdsFromTaskCardResult(result);
}

function taskCardDispatchContextForSlice(slice = {}, target = {}) {
  return {
    targetWorkspaceId: clean(slice.targetWorkspaceId || "", 120),
    targetWorkspace: clean(target.targetWorkspace || slice.targetWorkspacePath || "", 600),
    targetThreadId: clean(target.targetThreadId || "", 180),
    targetThreadTitle: clean(target.targetThreadTitle || target.targetThreadTitlePrefix || "", 180),
  };
}

function lifecycleThreadProjection(thread = {}) {
  const current = objectValue(thread);
  if (!Object.keys(current).length) return {};
  return {
    id: clean(current.id || current.threadId || current.thread_id || "", 180),
    title: clean(current.title || current.name || "", 180),
    cwd: clean(current.cwd || current.workspace || current.workspaceCwd || current.workspace_cwd || "", 600),
    role: clean(current.role || "", 100),
    threadRole: clean(current.threadRole || current.thread_role || "", 100),
    purpose: clean(current.purpose || "", 120),
    status: clean(current.status || "", 80),
    deliverable: current.deliverable === true,
    deliverabilityReason: clean(current.deliverabilityReason || current.deliverability_reason || "", 160),
  };
}

function boundedLifecycleResult(result = {}, request = {}) {
  const current = objectValue(result);
  return {
    required: true,
    ok: current.ok !== false,
    action: clean(current.action || request.action || "", 80),
    requestedAction: clean(request.requestedAction || "", 120),
    role: clean(request.role || current.role || "", 100),
    workspaceCwd: clean(request.cwd || request.workspaceCwd || "", 600),
    error: clean(current.error || current.code || "", 180),
    createReason: clean(current.createReason || current.create_reason || "", 120),
    count: Number(current.count || 0) || 0,
    selectedFromCandidates: current.selectedFromCandidates === true,
    selectedFromCandidateCount: Number(current.selectedFromCandidateCount || 0) || 0,
    needsTitleNormalization: current.needsTitleNormalization === true,
    thread: lifecycleThreadProjection(current.thread),
    policy: {
      boundedMetadataOnly: true,
      exactThreadIdPreferred: true,
    },
  };
}

function lifecycleResolveRoleForDecision(routingDecision = {}) {
  const lifecycle = objectValue(routingDecision.codexMobileThreadLifecycle);
  const action = clean(lifecycle.action || "", 120);
  const role = clean(lifecycle.role || routingDecision.role || "", 100);
  if (action === "resolve_or_ensure_worker_lane") return "home_ai_worker";
  if (action === "resolve_or_ensure_plugin_worker_lane") return "plugin_worker";
  if (action === "resolve_or_ensure_plugin_main_thread") return "requirements";
  if (action === "start_or_ensure_plugin_loop") return "requirements";
  if (action === "ensure_or_create_role_lanes" && role === "home_ai_worker_loop") return "home_ai_worker";
  if (action === "ensure_or_create_role_lanes" && role === "plugin_worker_loop") return "requirements";
  if (role === "plugin_requirements") return "requirements";
  if (role === "home_ai_worker_loop") return "home_ai_worker";
  if (role === "plugin_worker_loop") return "requirements";
  return role || "implementation";
}

function lifecycleApiActionFor(requestedAction = "") {
  const action = clean(requestedAction, 120);
  if (/ensure|create|start/.test(action)) return "ensure";
  if (/resolve/.test(action)) return "resolve";
  return "resolve";
}

function lifecycleTargetFromResult(target = {}, result = {}) {
  const thread = lifecycleThreadProjection(result.thread);
  if (!thread.id) return target;
  return Object.assign({}, target, {
    targetThreadId: thread.id,
    targetThreadTitle: thread.title || target.targetThreadTitle || "",
    targetThreadTitlePrefix: "",
    targetWorkspace: thread.cwd || target.targetWorkspace || "",
  });
}

async function resolveCodexMobileThreadLifecycle(input = {}) {
  const routingDecision = objectValue(input.routingDecision);
  const lifecycle = objectValue(routingDecision.codexMobileThreadLifecycle);
  if (!lifecycle.required) {
    return {
      ok: true,
      target: input.target,
      routingDecision,
      lifecycleResult: { required: false },
    };
  }
  const threadLifecycleService = input.threadLifecycleService;
  if (!threadLifecycleService || typeof threadLifecycleService.threadLifecycle !== "function") {
    return {
      ok: false,
      error: "codex_mobile_thread_lifecycle_unavailable",
      target: input.target,
      routingDecision,
      lifecycleResult: {
        required: true,
        ok: false,
        action: "resolve",
        requestedAction: clean(lifecycle.action || "", 120),
        role: lifecycleResolveRoleForDecision(routingDecision),
        workspaceCwd: clean(lifecycle.workspaceCwd || input.slice?.targetWorkspacePath || "", 600),
        error: "codex_mobile_thread_lifecycle_unavailable",
      },
    };
  }
  const role = lifecycleResolveRoleForDecision(routingDecision);
  const requestedAction = clean(lifecycle.action || "", 120);
  const pluginId = role === "plugin_worker"
    ? clean(lifecycle.pluginId || lifecycle.plugin_id || input.slice?.pluginId || input.slice?.plugin_id || input.slice?.targetWorkspaceId || "", 120).toLowerCase()
    : clean(lifecycle.pluginId || lifecycle.plugin_id || input.slice?.pluginId || input.slice?.plugin_id || "", 120).toLowerCase();
  const requestId = clean(`autonomous-delivery-${input.deliveryCase?.caseId || input.deliveryCase?.id || "case"}-${input.slice?.sliceKey || input.slice?.sliceId || "slice"}-${requestedAction || "lifecycle"}`, 180);
  const request = {
    action: lifecycleApiActionFor(requestedAction),
    requestedAction: clean(lifecycle.action || "", 120),
    role,
    pluginId,
    sourceThreadId: clean(lifecycle.sourceThreadId || lifecycle.source_thread_id || input.deliveryCase?.sourceThreadId || input.deliveryCase?.source_thread_id || "", 180),
    purpose: clean(lifecycle.purpose || "worker_lane", 120),
    workerPurpose: clean(lifecycle.workerPurpose || lifecycle.worker_purpose || "worker_lane", 120),
    taskCardId: clean(input.slice?.taskCardId || input.slice?.task_card_id || "", 180),
    status: clean(lifecycle.status || "", 80),
    summary: clean(input.slice?.summary || input.deliveryCase?.objective || "", 240),
    requestId,
    idempotencyKey: clean(lifecycle.idempotencyKey || lifecycle.idempotency_key || requestId, 220),
    cwd: clean(lifecycle.workspaceCwd || input.slice?.targetWorkspacePath || input.target?.targetWorkspace || "", 1000),
    workspaceCwd: clean(lifecycle.workspaceCwd || input.slice?.targetWorkspacePath || input.target?.targetWorkspace || "", 1000),
    targetThreadId: clean(input.target?.targetThreadId || "", 180),
    threadId: clean(input.target?.targetThreadId || "", 180),
    limit: 40,
  };
  let result;
  try {
    result = await Promise.resolve(threadLifecycleService.threadLifecycle(request));
  } catch (err) {
    result = {
      ok: false,
      action: "resolve",
      error: clean(err?.code || err?.message || err || "codex_mobile_thread_lifecycle_request_failed", 180),
    };
  }
  if (result && result.ok !== false && !lifecycleThreadProjection(result.thread).id && Array.isArray(result.threads)) {
    const selected = selectWorkerLaneForDispatch({
      threads: result.threads,
      role,
      pluginId: request.pluginId,
      cwd: request.workspaceCwd,
      sourceThreadId: request.sourceThreadId,
      requestKey: request.idempotencyKey || request.requestId,
    });
    if (selected.ok) {
      result = Object.assign({}, result, {
        thread: selected.lane,
        selectedFromCandidates: true,
        selectedFromCandidateCount: selected.selectedFromCandidateCount,
        needsTitleNormalization: selected.needsTitleNormalization,
      });
    } else {
      result = Object.assign({}, result, {
        ok: false,
        error: selected.code || "worker_lane_selection_failed",
        createReason: selected.createReason || "",
        candidateCount: selected.candidateCount || 0,
      });
    }
  }
  const lifecycleResult = boundedLifecycleResult(result, request);
  const thread = lifecycleThreadProjection(result?.thread);
  const ok = result && result.ok !== false && thread.id && thread.deliverable !== false;
  const nextRoutingDecision = Object.assign({}, routingDecision, {
    codexMobileThreadLifecycle: Object.assign({}, lifecycle, {
      resolved: lifecycleResult,
    }),
  });
  if (!ok) {
    return {
      ok: false,
      error: lifecycleResult.error || "codex_mobile_thread_lifecycle_resolve_failed",
      target: input.target,
      routingDecision: nextRoutingDecision,
      lifecycleResult,
    };
  }
  return {
    ok: true,
    target: lifecycleTargetFromResult(input.target, result),
    routingDecision: nextRoutingDecision,
    lifecycleResult,
  };
}

function rawJsonWithDispatchFailure(rawJson = {}, failure = {}, key = "dispatchFailure") {
  const out = Object.assign({}, objectValue(rawJson), {
    dispatchFailure: failure,
  });
  if (key && key !== "dispatchFailure") out[key] = failure;
  return out;
}

function boundedReturnEvent(input = {}) {
  const metadata = objectValue(input.metadata || input.meta);
  return {
    returnCardId: clean(input.returnCardId || input.return_card_id || input.cardId || input.card_id || "", 160),
    originalTaskCardId: clean(input.taskCardId || input.task_card_id || input.originalTaskCardId || input.original_task_card_id || input.sourceTaskCardId || input.source_task_card_id || "", 160),
    status: normalizeStatus(input.status, SLICE_STATUSES, ""),
    title: clean(input.title || metadata.title || "", 180),
    sourceThreadId: clean(input.sourceThreadId || input.source_thread_id || metadata.sourceThreadId || "", 180),
    targetThreadId: clean(input.targetThreadId || input.target_thread_id || metadata.targetThreadId || "", 180),
    workflowId: clean(input.workflowId || input.workflow_id || metadata.workflowId || "", 180),
    terminal: Boolean(input.terminal ?? metadata.terminal),
    ackPolicy: clean(input.ackPolicy || input.ack_policy || metadata.ackPolicy || "", 40),
    receivedAt: clean(input.receivedAt || input.received_at || "", 80),
  };
}

function createAutonomousDeliveryCoordinatorService(options = {}) {
  const store = options.store;
  const actionInboxService = options.actionInboxService;
  const taskCardService = options.taskCardService;
  const threadLifecycleService = options.threadLifecycleService || taskCardService;
  const createIntent = typeof options.createIntent === "function" ? options.createIntent : createAutonomousDeliveryIntent;
  const targets = options.targets || {};

  function requireStore() {
    const currentStore = typeof store === "function" ? store() : store;
    if (!currentStore || typeof currentStore.upsertAutonomousDeliveryCase !== "function") {
      throw new Error("autonomous delivery coordinator requires mobile sqlite store");
    }
    return currentStore;
  }

  function appendEvent(caseId, eventType, payload = {}, actor = {}) {
    const currentStore = requireStore();
    if (typeof currentStore.addAutonomousDeliveryEvent !== "function") return null;
    return currentStore.addAutonomousDeliveryEvent({
      caseId,
      eventType,
      actorWorkspaceId: clean(actor.actorWorkspaceId || actor.workspaceId || "owner", 120),
      actorPrincipalId: clean(actor.actorPrincipalId || actor.principalId || "owner", 120),
      payload,
      createdAt: nowIso(options),
    });
  }

  function persistSlices(deliveryCase, taskSlices = []) {
    const currentStore = requireStore();
    return taskSlices.map((slice, index) => {
      const workspaceId = clean(slice.workspaceId || deliveryCase.workspaceId || OWNER_WORKSPACE_ID, 120) || OWNER_WORKSPACE_ID;
      const sliceKey = clean(slice.id || `slice_${index + 1}`, 120) || `slice_${index + 1}`;
      const risk = sliceRisk(slice, deliveryCase.risk);
      const status = normalizeStatus(slice.status, SLICE_STATUSES, slice.status === "requires_user" ? "requires_user" : "pending");
      const target = targetForWorkspace(workspaceId, targets);
      const now = nowIso(options);
      const sliceRecord = {
        id: sliceKey,
        sliceKey,
        ownerLayer: slice.ownerLayer || "",
        targetWorkspaceId: workspaceId,
        workspaceId,
        summary: slice.description || "",
        description: slice.description || "",
        aiOpsChangedFiles: slice.aiOpsChangedFiles || slice.changedFiles || slice.changed_files || [],
      };
      const stage = slice.ownerLayer === "deployment_owner"
        ? "deployment"
        : (slice.ownerLayer === "verification_or_audit_thread" ? "verification" : "implementation");
      const aiOps = aiOpsProjectionForSlice(deliveryCase, sliceRecord, stage, options);
      return publicSliceRecord(currentStore.upsertAutonomousDeliverySlice({
        sliceId: `${deliveryCase.caseId}_${safeToken(sliceKey, `slice_${index + 1}`, 80)}`,
        caseId: deliveryCase.caseId,
        workspaceId: deliveryCase.workspaceId,
        sliceKey,
        ownerLayer: slice.ownerLayer || "",
        targetWorkspaceId: workspaceId,
        targetWorkspacePath: slice.workspacePath || target?.targetWorkspace || "",
        status,
        risk,
        dispatchStatus: "not_started",
        title: clean(slice.description || sliceKey, 220),
        summary: cleanBlock(slice.description || "", 900),
        rawJson: Object.assign({}, slice, { aiOps }),
        createdAt: now,
        updatedAt: now,
      }));
    });
  }

  async function createCase(input = {}) {
    const currentStore = requireStore();
    const createdAt = clean(input.createdAt || nowIso(options), 80);
    const intent = createIntent({
      text: input.text || input.objective || input.requirement || "",
      workspaces: input.workspaces || input.workspaceIds || [],
      approvals: input.approvals || {},
      now: input.now || createdAt,
    });
    if (!intent.ok) return { ok: false, status: 400, error: "autonomous_delivery_intent_required", intent };
    const workspaceId = clean(input.workspaceId || input.workspace_id || OWNER_WORKSPACE_ID, 120) || OWNER_WORKSPACE_ID;
    const identity = deriveAutonomousDeliveryCaseIdentity(input, intent);
    const caseId = clean(input.caseId || input.case_id || identity.caseId || intent.id, 160);
    const existing = publicCaseRecord(currentStore.getAutonomousDeliveryCase(caseId) || {});
    if (existing.caseId) {
      const duplicateLedger = appendDuplicateCaseObservation(existing.deliveryLedger, identity, createdAt);
      const nextCase = publicCaseRecord(currentStore.upsertAutonomousDeliveryCase(Object.assign({}, existing, {
        sourceRef: Object.assign({}, existing.sourceRef || {}, input.sourceRef || input.source_ref || {}, {
          idempotencyRef: duplicateLedger.idempotencyRef,
        }),
        rawJson: Object.assign({}, existing, {
          deliveryLedger: duplicateLedger,
        }),
        updatedAt: createdAt,
      })));
      const slices = currentStore.listAutonomousDeliverySlices({ caseId }).map(publicSliceRecord);
      appendEvent(caseId, "case_duplicate_observed", {
        idempotencySource: identity.idempotencySource,
        idempotencyHash: identity.idempotencyHash,
        duplicateSuppressedCount: duplicateLedger.duplicateSuppressedCount,
        ownerPromptSuppressed: true,
      }, input.auth || {});
      return {
        ok: true,
        duplicate: true,
        duplicateSuppressed: true,
        case: nextCase,
        slices,
        intent,
        inboxItem: null,
        inboxEvent: null,
        source: { name: "autonomous_delivery_coordinator", storage: "sqlite" },
      };
    }
    const deliveryCase = publicCaseRecord(currentStore.upsertAutonomousDeliveryCase({
      caseId,
      workspaceId,
      objective: intent.objective,
      mode: intent.mode,
      risk: intent.risk,
      status: normalizeStatus(input.status, CASE_STATUSES, caseStatusForIntent(intent)),
      requestedLowIntervention: intent.requestedLowIntervention,
      userDecisionGate: intent.userDecisionGate,
      autonomyPolicy: intent.autonomyPolicy,
      privacyBoundary: intent.privacyBoundary,
      sourceRef: Object.assign({}, objectValue(input.sourceRef || input.source_ref), {
        idempotencyRef: identity.idempotencyRef,
      }),
      rawJson: {
        intent,
        deliveryLedger: initialCaseLedger(identity, createdAt),
      },
      createdAt,
      updatedAt: createdAt,
    }));
    const slices = persistSlices(deliveryCase, intent.taskSlices || []);
    appendEvent(caseId, "case_created", { mode: deliveryCase.mode, risk: deliveryCase.risk, sliceCount: slices.length }, input.auth || {});
    let inbox = null;
    if (actionInboxService && typeof actionInboxService.upsertSourceItem === "function") {
      inbox = await Promise.resolve(actionInboxService.upsertSourceItem(ownerNotificationForCase(deliveryCase, slices)));
    }
    return {
      ok: true,
      case: deliveryCase,
      slices,
      intent,
      inboxItem: inbox?.item || null,
      inboxEvent: inbox?.event || null,
      source: { name: "autonomous_delivery_coordinator", storage: "sqlite" },
    };
  }

  function getCase(input = {}) {
    const caseId = clean(input.caseId || input.case_id || input.id, 160);
    const currentStore = requireStore();
    const deliveryCase = publicCaseRecord(currentStore.getAutonomousDeliveryCase(caseId) || {});
    if (!deliveryCase.caseId) return { ok: false, status: 404, error: "autonomous_delivery_case_not_found" };
    const slices = currentStore.listAutonomousDeliverySlices({ caseId }).map(publicSliceRecord);
    const events = typeof currentStore.listAutonomousDeliveryEvents === "function"
      ? currentStore.listAutonomousDeliveryEvents({ caseId, limit: input.eventLimit || 50 })
      : [];
    return { ok: true, case: deliveryCase, slices, events, source: { name: "autonomous_delivery_coordinator", storage: "sqlite" } };
  }

  function listCases(input = {}) {
    const currentStore = requireStore();
    const workspaceId = clean(input.workspaceId || input.workspace_id || OWNER_WORKSPACE_ID, 120) || OWNER_WORKSPACE_ID;
    const cases = currentStore.listAutonomousDeliveryCases({
      workspaceId,
      status: clean(input.status || "", 80),
      limit: input.limit || 100,
    }).map(publicCaseRecord);
    return { ok: true, cases, source: { name: "autonomous_delivery_coordinator", storage: "sqlite" } };
  }

  function dispatchControlSummary(input = {}) {
    const currentStore = requireStore();
    const workspaceId = clean(input.workspaceId || input.workspace_id || OWNER_WORKSPACE_ID, 120) || OWNER_WORKSPACE_ID;
    const limit = Math.max(1, Math.min(50, Number(input.limit || 20) || 20));
    const slices = currentStore.listAutonomousDeliverySlices({ limit: 500 })
      .map(publicSliceRecord)
      .filter((slice) => !workspaceId || slice.workspaceId === workspaceId)
      .filter((slice) => DISPATCH_CONTROL_ATTENTION_STATUSES.includes(clean(slice.dispatchStatus || "", 80)));
    const counts = {
      deferredConflict: slices.filter((slice) => slice.dispatchStatus === "deferred_conflict").length,
      failed: slices.filter((slice) => slice.dispatchStatus === "failed").length,
      dispatching: slices.filter((slice) => slice.dispatchStatus === "dispatching").length,
      sent: slices.filter((slice) => slice.dispatchStatus === "sent").length,
      returnStale: slices.filter((slice) => slice.dispatchStatus === "return_stale").length,
    };
    const status = dispatchControlStatus(counts);
    const items = slices
      .sort((a, b) => {
        const rank = (slice) => {
          if (slice.dispatchStatus === "failed") return 0;
          if (slice.dispatchStatus === "return_stale") return 1;
          if (slice.dispatchStatus === "deferred_conflict") return 2;
          if (slice.dispatchStatus === "dispatching") return 3;
          return 3;
        };
        return rank(a) - rank(b) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
      })
      .slice(0, limit)
      .map(dispatchControlItemForSlice);
    return {
      ok: status === "ok",
      schemaVersion: 1,
      generatedAt: nowIso(options),
      status,
      workspaceId,
      counts,
      itemCount: items.length,
      items,
      source: { name: "autonomous_delivery_coordinator", storage: "sqlite" },
      policy: {
        ownerVisible: true,
        readOnlySummary: true,
        retryViaActionInbox: true,
        boundedMetadataOnly: true,
      },
    };
  }

  function deliveryLoopStatusSummary(input = {}) {
    const currentStore = requireStore();
    const workspaceId = clean(input.workspaceId || input.workspace_id || OWNER_WORKSPACE_ID, 120) || OWNER_WORKSPACE_ID;
    const cases = currentStore.listAutonomousDeliveryCases({
      workspaceId,
      limit: input.caseLimit || input.case_limit || 200,
    }).map(publicCaseRecord);
    const slices = [];
    const eventsByCase = {};
    for (const deliveryCase of cases) {
      const caseId = deliveryCase.caseId;
      slices.push(...currentStore.listAutonomousDeliverySlices({ caseId, limit: 500 }).map(publicSliceRecord));
      if (typeof currentStore.listAutonomousDeliveryEvents === "function") {
        eventsByCase[caseId] = currentStore.listAutonomousDeliveryEvents({ caseId, limit: 50 });
      }
    }
    return buildAutonomousDeliveryStatusSummary({
      cases,
      slices,
      eventsByCase,
      generatedAt: nowIso(options),
      workspaceId,
      limit: input.limit,
    });
  }

  function returnWatchdogSummary(input = {}) {
    const currentStore = requireStore();
    const workspaceId = clean(input.workspaceId || input.workspace_id || OWNER_WORKSPACE_ID, 120) || OWNER_WORKSPACE_ID;
    const now = nowIso(options);
    return Object.assign(buildReturnWatchdogSummary({
      slices: currentStore.listAutonomousDeliverySlices({ limit: 500 }).map(publicSliceRecord),
      workspaceId,
      staleAfterMs: input.staleAfterMs ?? input.stale_after_ms,
      limit: input.limit,
      generatedAt: now,
      options,
    }), {
      source: { name: "autonomous_delivery_coordinator", storage: "sqlite" },
    });
  }

  function runReturnWatchdog(input = {}) {
    const currentStore = requireStore();
    const dryRun = input.dryRun === true || input.dry_run === true;
    const summary = returnWatchdogSummary(input);
    if (dryRun) return Object.assign({}, summary, { dryRun: true, markedCount: 0, marked: [] });
    const now = nowIso(options);
    const marked = [];
    for (const item of summary.items.filter((candidate) => candidate.stale && !candidate.alreadyMarked)) {
      const slice = publicSliceRecord(currentStore.listAutonomousDeliverySlices({ caseId: item.caseId, limit: 500 })
        .find((candidate) => candidate.sliceId === item.sliceId) || {});
      if (!slice.sliceId || clean(slice.dispatchStatus || "", 80) !== "sent") continue;
      const watchdog = {
        code: item.code,
        staleAfterMs: summary.staleAfterMs,
        ageMs: item.ageMs,
        detectedAt: now,
        taskCardId: item.taskCardId,
        policy: "no_auto_retry",
      };
      const patch = returnWatchdogMarkPatch(item, summary, now);
      const updated = publicSliceRecord(currentStore.upsertAutonomousDeliverySlice(Object.assign({}, slice, {
        status: patch.status || slice.status || "dispatched",
        dispatchStatus: patch.dispatchStatus,
        blockedReason: patch.blockedReason,
        updatedAt: now,
        rawJson: sliceRawJsonForUpdate(slice, {
          returnWatchdog: Object.assign({}, watchdog, patch.returnWatchdog || {}),
        }),
      })));
      appendEvent(item.caseId, "return_card_watchdog_stale", {
        sliceId: item.sliceId,
        sliceKey: item.sliceKey,
        taskCardId: item.taskCardId,
        ageMinutes: item.ageMinutes,
      }, input.auth || {});
      marked.push(dispatchControlItemForSlice(updated));
    }
    return Object.assign({}, returnWatchdogSummary(input), {
      dryRun: false,
      markedCount: marked.length,
      marked,
    });
  }

  function sourceReturnIntegrationSlices(workspaceId = OWNER_WORKSPACE_ID) {
    const currentStore = requireStore();
    const cases = currentStore.listAutonomousDeliveryCases({
      workspaceId,
      limit: 500,
    }).map(publicCaseRecord);
    const slices = [];
    for (const deliveryCase of cases) {
      slices.push(...currentStore.listAutonomousDeliverySlices({ caseId: deliveryCase.caseId, limit: 500 })
        .map((slice) => Object.assign(publicSliceRecord(slice), {
          caseStatus: deliveryCase.status,
        })));
    }
    return slices;
  }

  function sourceReturnIntegrationSummary(input = {}) {
    const workspaceId = clean(input.workspaceId || input.workspace_id || OWNER_WORKSPACE_ID, 120) || OWNER_WORKSPACE_ID;
    const now = nowIso(options);
    return Object.assign(buildSourceReturnIntegrationSummary({
      slices: sourceReturnIntegrationSlices(workspaceId),
      workspaceId,
      staleAfterMs: input.staleAfterMs ?? input.stale_after_ms,
      limit: input.limit,
      generatedAt: now,
      options,
    }), {
      source: { name: "autonomous_delivery_coordinator", storage: "sqlite" },
    });
  }

  function runSourceReturnIntegrationWatchdog(input = {}) {
    const currentStore = requireStore();
    const dryRun = input.dryRun === true || input.dry_run === true;
    const summary = sourceReturnIntegrationSummary(input);
    if (dryRun) return Object.assign({}, summary, { dryRun: true, markedCount: 0, marked: [] });
    const now = nowIso(options);
    const marked = [];
    for (const item of summary.items.filter((candidate) => candidate.stale && !candidate.alreadyMarked)) {
      const slice = publicSliceRecord(currentStore.listAutonomousDeliverySlices({ caseId: item.caseId, limit: 500 })
        .find((candidate) => candidate.sliceId === item.sliceId) || {});
      if (!slice.sliceId || !slice.returnCardId) continue;
      const integration = objectValue(slice.sourceReturnIntegration);
      if (clean(integration.status || "", 80) === "stale") continue;
      const patch = sourceReturnIntegrationStalePatch(item, summary, now, integration);
      const updated = publicSliceRecord(currentStore.upsertAutonomousDeliverySlice(Object.assign({}, slice, {
        updatedAt: now,
        rawJson: sliceRawJsonForUpdate(slice, patch),
      })));
      appendEvent(item.caseId, "source_return_integration_stale", {
        sliceId: item.sliceId,
        sliceKey: item.sliceKey,
        taskCardId: item.taskCardId,
        returnCardId: item.returnCardId,
        ageMinutes: item.ageMinutes,
      }, input.auth || {});
      marked.push({
        caseId: item.caseId,
        sliceId: item.sliceId,
        sliceKey: item.sliceKey,
        taskCardId: item.taskCardId,
        returnCardId: item.returnCardId,
        integrationStatus: clean(updated.sourceReturnIntegration?.status || "stale", 80),
        code: clean(updated.sourceReturnIntegration?.code || "source_return_integration_stale", 120),
        recommendedAction: clean(updated.sourceReturnIntegration?.recommendedAction || item.recommendedAction, 180),
      });
    }
    return Object.assign({}, sourceReturnIntegrationSummary(input), {
      dryRun: false,
      markedCount: marked.length,
      marked,
    });
  }

  function dispatchableSlices(deliveryCase, slices = []) {
    if (deliveryCase.risk === "high") return [];
    return slices.filter((slice) => {
      if (slice.status !== "pending") return false;
      if (slice.risk === "high") return false;
      if (["verification_or_audit_thread", "deployment_owner", "user_visible_decision"].includes(slice.ownerLayer)) return false;
      return ["home_ai_workspace", "plugin_workspace", "implementation_thread"].includes(slice.ownerLayer)
        || slice.sliceKey === "research";
    });
  }

  async function startCase(input = {}) {
    const currentStore = requireStore();
    const caseId = clean(input.caseId || input.case_id || input.id, 160);
    const loaded = getCase({ caseId });
    if (!loaded.ok) return loaded;
    const deliveryCase = loaded.case;
    const required = arrayValue(deliveryCase.userDecisionGate?.required);
    if (required.length && !input.confirmDecisions && !input.confirm_decisions) {
      return { ok: false, status: 409, error: "autonomous_delivery_decision_gate_required", required };
    }
    if (deliveryCase.risk === "high") {
      return { ok: false, status: 409, error: "autonomous_delivery_high_risk_manual_only", required };
    }
    if (!taskCardService || typeof taskCardService.sendTaskCard !== "function") {
      return { ok: false, status: 503, error: "codex_task_card_service_unavailable" };
    }
    const now = nowIso(options);
    const ownerPrompt = cleanBlock(input.ownerPrompt || input.owner_prompt || "", 1200);
    const ready = dispatchableSlices(deliveryCase, loaded.slices);
    if (!ready.length) {
      currentStore.upsertAutonomousDeliveryCase(Object.assign({}, deliveryCase, {
        status: "blocked",
        updatedAt: now,
        rawJson: Object.assign({}, deliveryCase.rawJson || {}, { blockedReason: "no_dispatchable_non_high_risk_slices" }),
      }));
      appendEvent(caseId, "case_blocked", { reason: "no_dispatchable_non_high_risk_slices" }, input.auth || {});
      return { ok: false, status: 409, error: "autonomous_delivery_no_dispatchable_slices" };
    }
    const dispatched = [];
    const deferred = [];
    const failed = [];
    const blocked = [];
    const activeConflicts = activeImplementationConflicts(currentStore, ready);
    const reservedTargets = new Set();
    for (const slice of ready.slice(0, Math.max(1, Math.min(5, Number(input.maxSlices || input.max_slices || 3) || 3)))) {
      const target = targetForWorkspace(slice.targetWorkspaceId, targets);
      if (!target) {
        const routingDecision = buildAutonomousDeliveryRoutingDecision({
          deliveryCase,
          slice,
          target: null,
          ownerPrompt,
        });
        const blockedSlice = publicSliceRecord(currentStore.upsertAutonomousDeliverySlice(Object.assign({}, slice, {
          status: "blocked",
          dispatchStatus: "blocked",
          blockedReason: routingDecision.code || "target_workspace_unknown",
          rawJson: sliceRawJsonForUpdate(slice, {
            routingDecision,
          }),
          updatedAt: now,
        })));
        blocked.push({ slice: blockedSlice, reason: routingDecision.code || "target_workspace_unknown", routingDecision });
        continue;
      }
      const conflictKey = dispatchConflictKeyForSlice(slice);
      const activeConflict = conflictKey ? activeConflicts.get(conflictKey) : null;
      if (activeConflict || (conflictKey && reservedTargets.has(conflictKey))) {
        const conflict = activeConflict
          ? boundedDispatchConflict(slice, activeConflict)
          : boundedDispatchConflict(slice, {}, "workspace_dispatch_batch_conflict");
        const deferredSlice = publicSliceRecord(currentStore.upsertAutonomousDeliverySlice(Object.assign({}, slice, {
          status: "pending",
          dispatchStatus: "deferred_conflict",
          blockedReason: "workspace_dispatch_conflict",
          rawJson: sliceRawJsonForUpdate(slice, {
            dispatchConflict: conflict,
            routingDecision: Object.assign(buildAutonomousDeliveryRoutingDecision({
              deliveryCase,
              slice,
              target,
              ownerPrompt,
            }), {
              action: "blocked_or_redirected",
              code: conflict.code,
              ok: false,
              reasons: [{
                code: conflict.code,
                detail: "An active or reserved slice already owns this target workspace in the current dispatch window.",
              }],
            }),
          }),
          updatedAt: now,
        })));
        deferred.push({ slice: deferredSlice, conflict });
        appendEvent(caseId, "slice_dispatch_deferred", {
          sliceId: slice.sliceId,
          sliceKey: slice.sliceKey,
          reason: conflict.code,
          targetWorkspaceId: conflict.targetWorkspaceId,
          activeSliceId: conflict.activeSliceId,
          activeTaskCardId: conflict.activeTaskCardId,
        }, input.auth || {});
        continue;
      }
      if (conflictKey) reservedTargets.add(conflictKey);
      const routingDecision = buildAutonomousDeliveryRoutingDecision({
        deliveryCase,
        slice,
        target,
        ownerPrompt,
      });
      const lifecycleResolution = await resolveCodexMobileThreadLifecycle({
        deliveryCase,
        slice,
        target,
        routingDecision,
        threadLifecycleService,
      });
      const effectiveRoutingDecision = lifecycleResolution.routingDecision || routingDecision;
      if (!lifecycleResolution.ok) {
        const dispatchFailure = {
          code: lifecycleResolution.error || "codex_mobile_thread_lifecycle_resolve_failed",
          status: 0,
          targetWorkspaceId: clean(slice.targetWorkspaceId || "", 120),
          targetWorkspace: clean(target.targetWorkspace || slice.targetWorkspacePath || "", 500),
          targetThreadId: clean(target.targetThreadId || "", 180),
          targetThreadTitle: clean(target.targetThreadTitle || target.targetThreadTitlePrefix || "", 180),
        };
        const failedSlice = publicSliceRecord(currentStore.upsertAutonomousDeliverySlice(Object.assign({}, slice, {
          status: "blocked",
          dispatchStatus: "failed",
          blockedReason: dispatchFailure.code,
          rawJson: sliceRawJsonForUpdate(slice, {
            dispatchFailure,
            routingDecision: effectiveRoutingDecision,
          }),
          updatedAt: nowIso(options),
          startedAt: now,
        })));
        failed.push({ slice: failedSlice, failure: dispatchFailure });
        appendEvent(caseId, "slice_dispatch_failed", {
          sliceId: slice.sliceId,
          sliceKey: slice.sliceKey,
          reason: dispatchFailure.code,
          targetWorkspaceId: dispatchFailure.targetWorkspaceId,
        }, input.auth || {});
        continue;
      }
      const effectiveTarget = lifecycleResolution.target || target;
      const sliceForDispatch = Object.assign({}, slice, { routingDecision: effectiveRoutingDecision });
      const taskCard = taskCardForSlice(deliveryCase, sliceForDispatch, effectiveTarget, ownerPrompt);
      currentStore.upsertAutonomousDeliverySlice(Object.assign({}, slice, {
        status: "dispatching",
        dispatchStatus: "dispatching",
        taskCard,
        rawJson: sliceRawJsonForUpdate(slice, {
          routingDecision: effectiveRoutingDecision,
        }),
        updatedAt: now,
        startedAt: now,
      }));
      let sent;
      try {
        sent = await Promise.resolve(taskCardService.sendTaskCard(Object.assign({}, taskCard, {
          sourceWorkspaceCwd: APP_WORKSPACE,
          targetWorkspaceCwd: taskCard.targetWorkspace,
        })));
      } catch (err) {
        sent = exceptionTaskCardResult(err);
      }
      const dispatchResult = normalizeTaskCardDispatchResult(sent, taskCardDispatchContextForSlice(slice, effectiveTarget));
      const cardIds = dispatchResult.cardIds;
      if (!dispatchResult.ok) {
        const dispatchFailure = dispatchResult.failure;
        const failedSlice = publicSliceRecord(currentStore.upsertAutonomousDeliverySlice(Object.assign({}, slice, {
          status: "blocked",
          dispatchStatus: "failed",
          blockedReason: dispatchFailure.code,
          taskCard,
          rawJson: sliceRawJsonForUpdate(slice, {
            dispatchFailure,
            routingDecision: effectiveRoutingDecision,
          }),
          updatedAt: nowIso(options),
          startedAt: now,
        })));
        failed.push({ slice: failedSlice, failure: dispatchFailure });
        appendEvent(caseId, "slice_dispatch_failed", {
          sliceId: slice.sliceId,
          sliceKey: slice.sliceKey,
          reason: dispatchFailure.code,
          targetWorkspaceId: dispatchFailure.targetWorkspaceId,
        }, input.auth || {});
        continue;
      }
      const updated = publicSliceRecord(currentStore.upsertAutonomousDeliverySlice(Object.assign({}, slice, {
        status: "dispatched",
        dispatchStatus: "sent",
        taskCardId: cardIds[0] || "",
        taskCard,
        rawJson: sliceRawJsonForUpdate(slice, {
          routingDecision: effectiveRoutingDecision,
        }),
        updatedAt: nowIso(options),
        startedAt: now,
      })));
      dispatched.push({ slice: updated, taskCardResult: sent, taskCardIds: cardIds });
      appendEvent(caseId, "slice_dispatched", {
        sliceId: slice.sliceId,
        sliceKey: slice.sliceKey,
        taskCardIds: cardIds,
      }, input.auth || {});
    }
    if (!dispatched.length) {
      const nextCase = publicCaseRecord(currentStore.upsertAutonomousDeliveryCase(Object.assign({}, deliveryCase, {
        status: failed.length || blocked.length ? "blocked" : deliveryCase.status,
        updatedAt: nowIso(options),
        rawJson: Object.assign({}, deliveryCase.rawJson || {}, {
          dispatchDeferredCount: deferred.length,
          dispatchFailedCount: failed.length,
          dispatchBlockedCount: blocked.length,
        }),
      })));
      appendEvent(caseId, "case_dispatch_not_started", {
        deferredCount: deferred.length,
        failedCount: failed.length,
        blockedCount: blocked.length,
      }, input.auth || {});
      return {
        ok: false,
        status: failed.length ? 502 : 409,
        error: failed.length
          ? "autonomous_delivery_task_card_dispatch_failed"
          : "autonomous_delivery_workspace_dispatch_conflict",
        case: nextCase,
        dispatched,
        deferred,
        failed,
        blocked,
      };
    }
    const nextCase = publicCaseRecord(currentStore.upsertAutonomousDeliveryCase(Object.assign({}, deliveryCase, {
      status: "running",
      startedAt: deliveryCase.startedAt || now,
      updatedAt: nowIso(options),
    })));
    if (actionInboxService && typeof actionInboxService.completeItem === "function" && input.inboxItemId) {
      await Promise.resolve(actionInboxService.completeItem({
        itemId: input.inboxItemId,
        actorWorkspaceId: OWNER_WORKSPACE_ID,
        actorPrincipalId: clean(input.actor || "owner", 120),
        payload: {
          reason: "autonomous_delivery_started",
          caseId,
          dispatchedCount: dispatched.length,
          ownerPromptAttached: Boolean(ownerPrompt),
        },
      })).catch(() => null);
    }
    appendEvent(caseId, "case_started", { dispatchedCount: dispatched.length }, input.auth || {});
    return { ok: true, case: nextCase, dispatched, deferred, failed, blocked, autoDispatched: false };
  }

  async function startVerification(input = {}) {
    const currentStore = requireStore();
    const caseId = clean(input.caseId || input.case_id || input.id, 160);
    const sliceId = clean(input.sliceId || input.slice_id, 180);
    if (!caseId || !sliceId) return { ok: false, status: 400, error: "autonomous_delivery_verification_target_required" };
    if (!taskCardService || typeof taskCardService.sendTaskCard !== "function") {
      return { ok: false, status: 503, error: "codex_task_card_service_unavailable" };
    }
    const loaded = getCase({ caseId });
    if (!loaded.ok) return loaded;
    const parentSlice = loaded.slices.find((item) => item.sliceId === sliceId);
    if (!parentSlice) return { ok: false, status: 404, error: "autonomous_delivery_slice_not_found" };
    if (parentSlice.status !== "completed") {
      return { ok: false, status: 409, error: "autonomous_delivery_verification_requires_completed_return" };
    }

    const verificationSliceId = verificationSliceIdForSlice(loaded.case, parentSlice);
    const existing = loaded.slices.find((item) => item.sliceId === verificationSliceId);
    if (existing?.taskCardId) {
      if (actionInboxService && typeof actionInboxService.completeItem === "function" && input.inboxItemId) {
        await Promise.resolve(actionInboxService.completeItem({
          itemId: input.inboxItemId,
          actorWorkspaceId: OWNER_WORKSPACE_ID,
          actorPrincipalId: clean(input.actor || "owner", 120),
          payload: {
            reason: "autonomous_delivery_verification_already_sent",
            caseId,
            sliceId,
            taskCardIds: [existing.taskCardId],
          },
        })).catch(() => null);
      }
      return {
        ok: true,
        alreadyDispatched: true,
        case: loaded.case,
        parentSlice,
        verificationSlice: existing,
        taskCardIds: [existing.taskCardId],
        autoDispatched: false,
      };
    }

    const now = nowIso(options);
    const target = auditTargetForSlice(parentSlice);
    const ownerPrompt = cleanBlock(input.ownerPrompt || input.owner_prompt || "", 1200);
    const rawJson = {
      parentSliceId: parentSlice.sliceId,
      parentSliceKey: parentSlice.sliceKey,
      verificationForTaskCardId: parentSlice.taskCardId,
      implementationReturnCardId: parentSlice.returnCardId,
      implementationReturnSummary: parentSlice.returnSummary,
      auditKind: target.auditKind,
      auditThreadTitle: target.targetThreadTitle,
    };
    rawJson.aiOps = aiOpsProjectionForSlice(loaded.case, {
      sliceKey: verificationSliceKeyForSlice(parentSlice),
      ownerLayer: "verification_or_audit_thread",
      targetWorkspaceId: target.auditKind === "platform" ? "home-ai-platform-audit" : "plugin-workspace-audit",
      summary: `Independently verify returned slice ${parentSlice.sliceKey || parentSlice.sliceId}. ${parentSlice.returnSummary || ""}`,
    }, "verification", options);
    let verificationSlice = publicSliceRecord(currentStore.upsertAutonomousDeliverySlice({
      sliceId: verificationSliceId,
      caseId,
      workspaceId: loaded.case.workspaceId,
      sliceKey: verificationSliceKeyForSlice(parentSlice),
      ownerLayer: "verification_or_audit_thread",
      targetWorkspaceId: target.auditKind === "platform" ? "home-ai-platform-audit" : "plugin-workspace-audit",
      targetWorkspacePath: APP_WORKSPACE,
      status: "dispatching",
      risk: "low",
      dispatchStatus: "dispatching",
      title: clean(`Verify ${parentSlice.title || parentSlice.sliceKey || parentSlice.sliceId}`, 220),
      summary: cleanBlock(`Independently verify returned slice ${parentSlice.sliceKey || parentSlice.sliceId}.`, 900),
      rawJson,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      startedAt: existing?.startedAt || now,
    }));
    const taskCard = verificationTaskCardForSlice(loaded.case, Object.assign({}, parentSlice, {
      aiOps: verificationSlice.aiOps,
    }), target, ownerPrompt);
    let sent;
    try {
      sent = await Promise.resolve(taskCardService.sendTaskCard(Object.assign({}, taskCard, {
        sourceWorkspaceCwd: APP_WORKSPACE,
        targetWorkspaceCwd: APP_WORKSPACE,
        auditKind: target.auditKind,
      })));
    } catch (err) {
      sent = exceptionTaskCardResult(err);
    }
    const dispatchResult = normalizeTaskCardDispatchResult(sent, {
      targetWorkspaceId: verificationSlice.targetWorkspaceId,
      targetWorkspace: APP_WORKSPACE,
      targetThreadTitle: target.targetThreadTitle,
    });
    const cardIds = dispatchResult.cardIds;
    if (!dispatchResult.ok) {
      const dispatchFailure = dispatchResult.failure;
      verificationSlice = publicSliceRecord(currentStore.upsertAutonomousDeliverySlice(Object.assign({}, verificationSlice, {
        status: "blocked",
        dispatchStatus: "failed",
        blockedReason: dispatchFailure.code,
        taskCard,
        rawJson: rawJsonWithDispatchFailure(rawJson, dispatchFailure, "verificationDispatchFailure"),
        updatedAt: nowIso(options),
        startedAt: verificationSlice.startedAt || now,
      })));
      const nextCase = publicCaseRecord(currentStore.upsertAutonomousDeliveryCase(Object.assign({}, loaded.case, {
        status: "verification_waiting",
        updatedAt: nowIso(options),
      })));
      appendEvent(caseId, "verification_dispatch_failed", {
        sliceId,
        verificationSliceId,
        auditKind: target.auditKind,
        reason: dispatchFailure.code,
      }, input.auth || {});
      return {
        ok: false,
        status: 502,
        error: "autonomous_delivery_task_card_dispatch_failed",
        case: nextCase,
        parentSlice,
        verificationSlice,
        taskCardResult: sent,
        dispatchFailure,
        taskCardIds: [],
        autoDispatched: false,
      };
    }
    verificationSlice = publicSliceRecord(currentStore.upsertAutonomousDeliverySlice(Object.assign({}, verificationSlice, {
      status: "dispatched",
      dispatchStatus: "sent",
      taskCardId: cardIds[0] || "",
      taskCard,
      rawJson: Object.assign({}, rawJson, {
        verificationTaskCardId: cardIds[0] || "",
        verificationTaskCardIds: cardIds,
      }),
      updatedAt: nowIso(options),
      startedAt: verificationSlice.startedAt || now,
    })));
    const nextCase = publicCaseRecord(currentStore.upsertAutonomousDeliveryCase(Object.assign({}, loaded.case, {
      status: "verification_dispatched",
      updatedAt: nowIso(options),
    })));
    if (actionInboxService && typeof actionInboxService.completeItem === "function" && input.inboxItemId) {
      await Promise.resolve(actionInboxService.completeItem({
        itemId: input.inboxItemId,
        actorWorkspaceId: OWNER_WORKSPACE_ID,
        actorPrincipalId: clean(input.actor || "owner", 120),
        payload: {
          reason: "autonomous_delivery_verification_sent",
          caseId,
          sliceId,
          taskCardIds: cardIds,
          ownerPromptAttached: Boolean(ownerPrompt),
        },
      })).catch(() => null);
    }
    appendEvent(caseId, "verification_dispatched", {
      sliceId,
      verificationSliceId,
      auditKind: target.auditKind,
      taskCardIds: cardIds,
    }, input.auth || {});
    return {
      ok: true,
      case: nextCase,
      parentSlice,
      verificationSlice,
      taskCardResult: sent,
      taskCardIds: cardIds,
      autoDispatched: false,
    };
  }

  function recordReturn(input = {}) {
    const currentStore = requireStore();
    const caseId = clean(input.caseId || input.case_id, 160);
    const sliceId = clean(input.sliceId || input.slice_id, 180);
    const status = normalizeStatus(input.status, SLICE_STATUSES, "");
    if (!caseId || !sliceId) return { ok: false, status: 400, error: "autonomous_delivery_return_target_required" };
    if (!status || !TERMINAL_SLICE_STATUSES.includes(status)) {
      return { ok: false, status: 400, error: "autonomous_delivery_return_status_invalid" };
    }
    const loaded = getCase({ caseId });
    if (!loaded.ok) return loaded;
    const slice = loaded.slices.find((item) => item.sliceId === sliceId);
    if (!slice) return { ok: false, status: 404, error: "autonomous_delivery_slice_not_found" };
    const returnCardId = clean(input.returnCardId || input.return_card_id || "", 160);
    if (
      TERMINAL_SLICE_STATUSES.includes(slice.status)
      && slice.status === status
      && (!returnCardId || clean(slice.returnCardId || "", 160) === returnCardId)
    ) {
      return {
        ok: true,
        alreadyRecorded: true,
        case: loaded.case,
        slice,
      };
    }
    const now = nowIso(options);
    const followUp = parseSourceReturnFollowUpAction(Object.assign({}, input, {
      returnCardId,
      status,
      createdAt: now,
    }), { nowIso: () => now });
    const pendingSourceAction = objectValue(followUp.pendingSourceAction);
    const nextAiOps = aiOpsForReturn(slice, Object.assign({}, input, {
      returnCardId,
      pendingSourceAction,
    }), status);
    const sourceReturnIntegration = sourceReturnIntegrationForReturn({
      caseId,
      sliceId,
      sliceKey: slice.sliceKey,
      taskCardId: clean(input.taskCardId || input.task_card_id || slice.taskCardId || "", 160),
      returnCardId,
      status,
      recordedAt: now,
      metadata: objectValue(input.metadata || input.meta),
      returnCardEvent: objectValue(input.returnCardEvent || input.return_card_event),
      sourceThreadId: clean(input.sourceThreadId || input.source_thread_id || "", 160),
      sourceThreadStatus: clean(input.sourceThreadStatus || input.source_thread_status || "", 80),
      sourceThreadRole: clean(input.sourceThreadRole || input.source_thread_role || "", 120),
      pendingSourceActionRequired: Boolean(pendingSourceAction.id),
      pendingSourceActionId: clean(pendingSourceAction.id || "", 160),
    });
    if (pendingSourceAction.id) {
      sourceReturnIntegration.pendingSourceAction = pendingSourceAction;
      sourceReturnIntegration.pendingSourceActionProjection = pendingSourceActionProjection(pendingSourceAction);
      sourceReturnIntegration.sourceActivation = Object.assign({}, objectValue(sourceReturnIntegration.sourceActivation), {
        status: "pending_source_action",
        code: "pending_source_action_required",
        activationKind: "pending_source_action",
        issueCodes: ["source_thread_activation_required_for_return", "pending_source_action_required"],
        recommendedAction: "resolve_pending_source_action_before_closure",
        updatedAt: now,
      });
      sourceReturnIntegration.sourceActivationProjection = sourceActivationProjection(sourceReturnIntegration.sourceActivation);
      sourceReturnIntegration.recommendedAction = "resolve_pending_source_action_before_closure";
      sourceReturnIntegration.counts = Object.assign({}, sourceReturnIntegration.counts, {
        pendingSourceAction: 1,
      });
    }
    let nextSlice = publicSliceRecord(currentStore.upsertAutonomousDeliverySlice(Object.assign({}, slice, {
      status,
      dispatchStatus: status === "completed" ? "returned_completed" : "returned_terminal",
      completedAt: now,
      updatedAt: now,
      aiOps: nextAiOps,
      rawJson: sliceRawJsonForUpdate(slice, {
        returnSummary: cleanBlock(input.summary || "", 1200),
        returnCardId,
        originalTaskCardId: clean(input.taskCardId || input.task_card_id || "", 160),
        returnCardEvent: objectValue(input.returnCardEvent || input.return_card_event),
        sourceReturnIntegration,
        aiOps: nextAiOps,
      }),
    })));
    if (status === "completed" && isImplementationSlice(nextSlice) && returnRequiresDeployment(input, nextSlice)) {
      const deploymentReason = deploymentReasonForReturn(input, nextSlice);
      nextSlice = publicSliceRecord(currentStore.upsertAutonomousDeliverySlice(Object.assign({}, nextSlice, {
        updatedAt: now,
        rawJson: sliceRawJsonForUpdate(nextSlice, {
          deploymentRequired: true,
          deploymentReason,
        }),
      })));
    }
    appendEvent(caseId, "slice_returned", {
      sliceId,
      status,
      returnCardId: clean(input.returnCardId || input.return_card_id || "", 160),
    }, input.auth || {});
    const refreshed = getCase({ caseId });
    if (isDeploymentSlice(nextSlice)) {
      const parentSliceId = parentSliceIdForVerification(nextSlice);
      const parentSlice = refreshed.slices.find((item) => item.sliceId === parentSliceId) || {};
      if (status === "completed" && parentSlice.sliceId) {
        const deployedParent = publicSliceRecord(currentStore.upsertAutonomousDeliverySlice(Object.assign({}, parentSlice, {
          updatedAt: now,
          rawJson: sliceRawJsonForUpdate(parentSlice, {
            deploymentRequired: false,
            deploymentStatus: "completed",
            deploymentSliceId: nextSlice.sliceId,
            deploymentTaskCardId: nextSlice.taskCardId,
            deploymentReturnCardId: nextSlice.returnCardId,
            deploymentReturnSummary: nextSlice.returnSummary,
            aiOps: aiOpsForParentDeploymentEvidence(parentSlice, nextSlice, status),
          }),
        })));
        const nextCase = publicCaseRecord(currentStore.upsertAutonomousDeliveryCase(Object.assign({}, refreshed.case, {
          status: "verification_waiting",
          updatedAt: now,
        })));
        appendEvent(caseId, "deployment_readback_completed", {
          sliceId: nextSlice.sliceId,
          parentSliceId,
          returnCardId,
        }, input.auth || {});
        if (actionInboxService && typeof actionInboxService.upsertSourceItem === "function") {
          actionInboxService.upsertSourceItem(ownerVerificationNotificationForReturn(nextCase, deployedParent));
        }
        return { ok: true, case: nextCase, slice: nextSlice, parentSlice: deployedParent };
      }
      let deploymentParent = parentSlice;
      if (parentSlice.sliceId) {
        deploymentParent = publicSliceRecord(currentStore.upsertAutonomousDeliverySlice(Object.assign({}, parentSlice, {
          updatedAt: now,
          rawJson: sliceRawJsonForUpdate(parentSlice, {
            deploymentRequired: true,
            deploymentStatus: status,
            deploymentSliceId: nextSlice.sliceId,
            deploymentTaskCardId: nextSlice.taskCardId,
            deploymentReturnCardId: nextSlice.returnCardId,
            deploymentReturnSummary: nextSlice.returnSummary,
            deploymentReason: `deployment_return_${status}`,
            aiOps: aiOpsForParentDeploymentEvidence(parentSlice, nextSlice, status),
          }),
        })));
      }
      const nextCase = publicCaseRecord(currentStore.upsertAutonomousDeliveryCase(Object.assign({}, refreshed.case, {
        status: parentSlice.sliceId ? "deployment_waiting" : "blocked",
        updatedAt: now,
      })));
      appendEvent(caseId, "deployment_readback_terminal_residual", {
        sliceId: nextSlice.sliceId,
        parentSliceId,
        status,
        returnCardId,
      }, input.auth || {});
      if (parentSlice.sliceId && actionInboxService && typeof actionInboxService.upsertSourceItem === "function") {
        actionInboxService.upsertSourceItem(ownerDeploymentNotificationForReturn(nextCase, deploymentParent));
      }
      return { ok: true, case: nextCase, slice: nextSlice, parentSlice: deploymentParent };
    }
    if (isVerificationSlice(nextSlice)) {
      const parentSliceId = parentSliceIdForVerification(nextSlice);
      const parentSlice = refreshed.slices.find((item) => item.sliceId === parentSliceId) || {};
      if (status === "completed" && allImplementationSlicesVerified(refreshed.slices)) {
        const closureSlice = refreshed.slices.find(isPlannedClosureVerificationSlice);
        let completedClosureSlice = closureSlice;
        if (closureSlice?.sliceId) {
          completedClosureSlice = publicSliceRecord(currentStore.upsertAutonomousDeliverySlice(Object.assign({}, closureSlice, {
            status: "completed",
            dispatchStatus: "verified",
            completedAt: now,
            updatedAt: now,
            rawJson: sliceRawJsonForUpdate(closureSlice, {
              verifiedAt: now,
              verificationSliceId: nextSlice.sliceId,
              verificationTaskCardId: nextSlice.taskCardId,
              verificationReturnCardId: nextSlice.returnCardId,
            }),
          })));
        }
        const nextCase = publicCaseRecord(currentStore.upsertAutonomousDeliveryCase(Object.assign({}, refreshed.case, {
          status: "verified_waiting",
          updatedAt: now,
        })));
        appendEvent(caseId, "verification_closed", {
          sliceId: nextSlice.sliceId,
          parentSliceId,
          closureSliceId: completedClosureSlice?.sliceId || "",
          returnCardId,
        }, input.auth || {});
        if (actionInboxService && typeof actionInboxService.upsertSourceItem === "function") {
          actionInboxService.upsertSourceItem(ownerClosureNotificationForVerification(nextCase, nextSlice, parentSlice));
        }
        return { ok: true, case: nextCase, slice: nextSlice, parentSlice, closureSlice: completedClosureSlice || null };
      }
      const nextCase = publicCaseRecord(currentStore.upsertAutonomousDeliveryCase(Object.assign({}, refreshed.case, {
        status: status === "completed" ? "verification_waiting" : (parentSlice.sliceId ? "repair_waiting" : "blocked"),
        updatedAt: now,
      })));
      appendEvent(caseId, "verification_terminal_residual", {
        sliceId: nextSlice.sliceId,
        parentSliceId,
        status,
        returnCardId,
      }, input.auth || {});
      if (status !== "completed" && parentSlice.sliceId && actionInboxService && typeof actionInboxService.upsertSourceItem === "function") {
        actionInboxService.upsertSourceItem(ownerRepairNotificationForVerification(nextCase, nextSlice, parentSlice));
      }
      return { ok: true, case: nextCase, slice: nextSlice, parentSlice };
    }
    const terminal = refreshed.slices.filter((item) => TERMINAL_SLICE_STATUSES.includes(item.status));
    let nextCase = refreshed.case;
    if (terminal.length === refreshed.slices.length) {
      const anyUnclosed = refreshed.slices.some((item) => item.status !== "completed");
      nextCase = publicCaseRecord(currentStore.upsertAutonomousDeliveryCase(Object.assign({}, refreshed.case, {
        status: anyUnclosed ? "blocked" : "completed",
        closedAt: now,
        updatedAt: now,
      })));
      appendEvent(caseId, "case_terminal", { status: nextCase.status }, input.auth || {});
    } else if (status === "completed") {
      nextCase = publicCaseRecord(currentStore.upsertAutonomousDeliveryCase(Object.assign({}, refreshed.case, {
        status: nextSlice.deploymentRequired ? "deployment_waiting" : "verification_waiting",
        updatedAt: now,
      })));
      if (actionInboxService && typeof actionInboxService.upsertSourceItem === "function") {
        actionInboxService.upsertSourceItem(nextSlice.deploymentRequired
          ? ownerDeploymentNotificationForReturn(nextCase, nextSlice)
          : ownerVerificationNotificationForReturn(nextCase, nextSlice));
      }
    }
    return { ok: true, case: nextCase, slice: nextSlice };
  }

  async function closeCase(input = {}) {
    const currentStore = requireStore();
    const caseId = clean(input.caseId || input.case_id || input.id, 160);
    if (!caseId) return { ok: false, status: 400, error: "autonomous_delivery_case_id_required" };
    const loaded = getCase({ caseId });
    if (!loaded.ok) return loaded;
    if (loaded.case.status === "completed") {
      return { ok: true, alreadyClosed: true, case: loaded.case, slices: loaded.slices };
    }
    if (loaded.case.status !== "verified_waiting") {
      return { ok: false, status: 409, error: "autonomous_delivery_close_requires_verified_waiting" };
    }
    const hasCompletedVerification = loaded.slices.some((slice) => isVerificationSlice(slice) && slice.status === "completed");
    if (!hasCompletedVerification) {
      return { ok: false, status: 409, error: "autonomous_delivery_close_requires_completed_verification" };
    }
    const now = nowIso(options);
    const nextCase = publicCaseRecord(currentStore.upsertAutonomousDeliveryCase(Object.assign({}, loaded.case, {
      status: "completed",
      closedAt: now,
      updatedAt: now,
    })));
    if (actionInboxService && typeof actionInboxService.completeItem === "function" && input.inboxItemId) {
      await Promise.resolve(actionInboxService.completeItem({
        itemId: input.inboxItemId,
        actorWorkspaceId: OWNER_WORKSPACE_ID,
        actorPrincipalId: clean(input.actor || "owner", 120),
        payload: {
          reason: "autonomous_delivery_closed_by_owner",
          caseId,
        },
      })).catch(() => null);
    }
    appendEvent(caseId, "case_closed_by_owner", {
      caseId,
      status: "completed",
    }, input.auth || {});
    const finalEvents = typeof currentStore.listAutonomousDeliveryEvents === "function"
      ? currentStore.listAutonomousDeliveryEvents({ caseId, limit: 30 })
      : [];
    let finalReportItem = null;
    if (actionInboxService && typeof actionInboxService.upsertSourceItem === "function") {
      const latest = getCase({ caseId });
      const finalReport = ownerFinalReportNotificationForCase(nextCase, latest.ok ? latest.slices : loaded.slices, finalEvents);
      const upserted = await Promise.resolve(actionInboxService.upsertSourceItem(finalReport)).catch(() => null);
      finalReportItem = upserted?.item || null;
    }
    return { ok: true, case: nextCase, slices: loaded.slices, finalReportItem };
  }

  async function startDeployment(input = {}) {
    const currentStore = requireStore();
    const caseId = clean(input.caseId || input.case_id || input.id, 160);
    const parentSliceId = clean(input.sliceId || input.slice_id || input.parentSliceId || input.parent_slice_id, 180);
    if (!caseId || !parentSliceId) return { ok: false, status: 400, error: "autonomous_delivery_deployment_target_required" };
    if (!input.confirmDeployment && !input.confirm_deployment) {
      return { ok: false, status: 409, error: "autonomous_delivery_deployment_confirmation_required" };
    }
    if (!taskCardService || typeof taskCardService.sendTaskCard !== "function") {
      return { ok: false, status: 503, error: "codex_task_card_service_unavailable" };
    }
    const loaded = getCase({ caseId });
    if (!loaded.ok) return loaded;
    const parentSlice = loaded.slices.find((item) => item.sliceId === parentSliceId);
    if (!parentSlice) return { ok: false, status: 404, error: "autonomous_delivery_slice_not_found" };
    if (!isImplementationSlice(parentSlice) || parentSlice.status !== "completed") {
      return { ok: false, status: 409, error: "autonomous_delivery_deployment_requires_completed_implementation_return" };
    }
    if (!parentSlice.deploymentRequired) {
      return { ok: false, status: 409, error: "autonomous_delivery_deployment_not_required" };
    }
    const deploymentSliceId = deploymentSliceIdForSlice(loaded.case, parentSlice);
    const existing = loaded.slices.find((item) => item.sliceId === deploymentSliceId);
    if (existing?.taskCardId) {
      if (actionInboxService && typeof actionInboxService.completeItem === "function" && input.inboxItemId) {
        await Promise.resolve(actionInboxService.completeItem({
          itemId: input.inboxItemId,
          actorWorkspaceId: OWNER_WORKSPACE_ID,
          actorPrincipalId: clean(input.actor || "owner", 120),
          payload: {
            reason: "autonomous_delivery_deployment_already_sent",
            caseId,
            parentSliceId,
            taskCardIds: [existing.taskCardId],
          },
        })).catch(() => null);
      }
      return {
        ok: true,
        alreadyDispatched: true,
        case: loaded.case,
        parentSlice,
        deploymentSlice: existing,
        taskCardIds: [existing.taskCardId],
        autoDispatched: false,
      };
    }

    const target = targetForWorkspace(parentSlice.targetWorkspaceId, targets);
    if (!target) return { ok: false, status: 409, error: "autonomous_delivery_deployment_target_unknown" };
    const deploymentTarget = Object.assign({}, DEPLOYMENT_TARGET, objectValue(options.deploymentTarget), {
      implementationTarget: target,
    });
    const now = nowIso(options);
    const deploymentSliceKey = deploymentSliceKeyForSlice(parentSlice);
    const rawJson = {
      parentSliceId: parentSlice.sliceId,
      parentSliceKey: parentSlice.sliceKey,
      deploymentForTaskCardId: parentSlice.taskCardId,
      implementationReturnCardId: parentSlice.returnCardId,
      implementationReturnSummary: parentSlice.returnSummary,
      deploymentReason: parentSlice.deploymentReason || "runtime_or_production_readback_required",
    };
    rawJson.aiOps = aiOpsProjectionForSlice(loaded.case, {
      sliceKey: deploymentSliceKey,
      ownerLayer: "deployment_owner",
      targetWorkspaceId: parentSlice.targetWorkspaceId,
      summary: `Deploy/read back returned slice ${parentSlice.sliceKey || parentSlice.sliceId}. ${parentSlice.returnSummary || ""}`,
    }, "deployment", options);
    let deploymentSlice = publicSliceRecord(currentStore.upsertAutonomousDeliverySlice({
      sliceId: deploymentSliceId,
      caseId,
      workspaceId: loaded.case.workspaceId,
      sliceKey: deploymentSliceKey,
      ownerLayer: "deployment_owner",
      targetWorkspaceId: parentSlice.targetWorkspaceId,
      targetWorkspacePath: parentSlice.targetWorkspacePath || target.targetWorkspace || "",
      status: "dispatching",
      risk: "high",
      dispatchStatus: "dispatching",
      title: clean(`Deploy ${parentSlice.title || parentSlice.sliceKey || parentSlice.sliceId}`, 220),
      summary: cleanBlock(`Deploy/read back returned slice ${parentSlice.sliceKey || parentSlice.sliceId}.`, 900),
      rawJson,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      startedAt: existing?.startedAt || now,
    }));
    const ownerPrompt = cleanBlock(input.ownerPrompt || input.owner_prompt || "", 1200);
    const taskCard = deploymentTaskCardForSlice(loaded.case, deploymentSlice, parentSlice, deploymentTarget, ownerPrompt);
    let sent;
    try {
      sent = await Promise.resolve(taskCardService.sendTaskCard(Object.assign({}, taskCard, {
        sourceWorkspaceCwd: APP_WORKSPACE,
        targetWorkspaceCwd: taskCard.targetWorkspace,
        auditKind: "deployment",
      })));
    } catch (err) {
      sent = exceptionTaskCardResult(err);
    }
    const dispatchResult = normalizeTaskCardDispatchResult(sent, taskCardDispatchContextForSlice(deploymentSlice, deploymentTarget));
    const cardIds = dispatchResult.cardIds;
    if (!dispatchResult.ok) {
      const dispatchFailure = dispatchResult.failure;
      deploymentSlice = publicSliceRecord(currentStore.upsertAutonomousDeliverySlice(Object.assign({}, deploymentSlice, {
        status: "blocked",
        dispatchStatus: "failed",
        blockedReason: dispatchFailure.code,
        taskCard,
        rawJson: rawJsonWithDispatchFailure(rawJson, dispatchFailure, "deploymentDispatchFailure"),
        updatedAt: nowIso(options),
        startedAt: deploymentSlice.startedAt || now,
      })));
      const nextCase = publicCaseRecord(currentStore.upsertAutonomousDeliveryCase(Object.assign({}, loaded.case, {
        status: "deployment_waiting",
        updatedAt: nowIso(options),
      })));
      appendEvent(caseId, "deployment_readback_dispatch_failed", {
        parentSliceId,
        deploymentSliceId,
        reason: dispatchFailure.code,
      }, input.auth || {});
      return {
        ok: false,
        status: 502,
        error: "autonomous_delivery_task_card_dispatch_failed",
        case: nextCase,
        parentSlice,
        deploymentSlice,
        taskCardResult: sent,
        dispatchFailure,
        taskCardIds: [],
        autoDispatched: false,
      };
    }
    deploymentSlice = publicSliceRecord(currentStore.upsertAutonomousDeliverySlice(Object.assign({}, deploymentSlice, {
      status: "dispatched",
      dispatchStatus: "sent",
      taskCardId: cardIds[0] || "",
      taskCard,
      rawJson: Object.assign({}, rawJson, {
        deploymentTaskCardId: cardIds[0] || "",
        deploymentTaskCardIds: cardIds,
      }),
      updatedAt: nowIso(options),
      startedAt: deploymentSlice.startedAt || now,
    })));
    const parentSourceReturnIntegration = objectValue(parentSlice.sourceReturnIntegration);
    const pendingSourceAction = objectValue(parentSourceReturnIntegration.pendingSourceAction);
    const resolvedPendingSourceAction = pendingSourceAction.id
      ? transitionPendingSourceAction(pendingSourceAction, {
        status: "resolved",
        actionTaken: "central_deploy_card_dispatched",
        centralDeployCardId: cardIds[0] || "",
        centralCoordinatorRef: caseId,
        updatedAt: nowIso(options),
      })
      : {};
    const parentPatch = {
      deploymentSliceId,
      deploymentTaskCardId: cardIds[0] || "",
      deploymentTaskCardIds: cardIds,
      deploymentStatus: "dispatched",
    };
    if (resolvedPendingSourceAction.id) {
      parentPatch.sourceReturnIntegration = Object.assign({}, parentSourceReturnIntegration, {
        pendingSourceAction: resolvedPendingSourceAction,
        pendingSourceActionProjection: pendingSourceActionProjection(resolvedPendingSourceAction),
        updatedAt: resolvedPendingSourceAction.updatedAt,
      });
      parentPatch.aiOps = aiOpsWithPendingSourceAction(parentSlice.aiOps, resolvedPendingSourceAction);
    }
    const updatedParent = publicSliceRecord(currentStore.upsertAutonomousDeliverySlice(Object.assign({}, parentSlice, {
      updatedAt: nowIso(options),
      rawJson: sliceRawJsonForUpdate(parentSlice, parentPatch),
    })));
    const nextCase = publicCaseRecord(currentStore.upsertAutonomousDeliveryCase(Object.assign({}, loaded.case, {
      status: "deployment_dispatched",
      updatedAt: nowIso(options),
    })));
    if (actionInboxService && typeof actionInboxService.completeItem === "function" && input.inboxItemId) {
      await Promise.resolve(actionInboxService.completeItem({
        itemId: input.inboxItemId,
        actorWorkspaceId: OWNER_WORKSPACE_ID,
        actorPrincipalId: clean(input.actor || "owner", 120),
        payload: {
          reason: "autonomous_delivery_deployment_sent",
          caseId,
          parentSliceId,
          taskCardIds: cardIds,
          ownerPromptAttached: Boolean(ownerPrompt),
        },
      })).catch(() => null);
    }
    appendEvent(caseId, "deployment_readback_dispatched", {
      parentSliceId,
      deploymentSliceId,
      taskCardIds: cardIds,
    }, input.auth || {});
    return {
      ok: true,
      case: nextCase,
      parentSlice: updatedParent,
      deploymentSlice,
      taskCardResult: sent,
      taskCardIds: cardIds,
      autoDispatched: false,
    };
  }

  async function startRepair(input = {}) {
    const currentStore = requireStore();
    const caseId = clean(input.caseId || input.case_id || input.id, 160);
    const verificationSliceId = clean(input.sliceId || input.slice_id || input.verificationSliceId || input.verification_slice_id, 180);
    if (!caseId || !verificationSliceId) return { ok: false, status: 400, error: "autonomous_delivery_repair_target_required" };
    if (!taskCardService || typeof taskCardService.sendTaskCard !== "function") {
      return { ok: false, status: 503, error: "codex_task_card_service_unavailable" };
    }
    const loaded = getCase({ caseId });
    if (!loaded.ok) return loaded;
    const verificationSlice = loaded.slices.find((item) => item.sliceId === verificationSliceId);
    if (!verificationSlice) return { ok: false, status: 404, error: "autonomous_delivery_verification_slice_not_found" };
    if (!isVerificationSlice(verificationSlice)) {
      return { ok: false, status: 409, error: "autonomous_delivery_repair_requires_verification_slice" };
    }
    if (!TERMINAL_SLICE_STATUSES.includes(verificationSlice.status) || verificationSlice.status === "completed") {
      return { ok: false, status: 409, error: "autonomous_delivery_repair_requires_failed_verification" };
    }
    const parentSliceId = parentSliceIdForVerification(verificationSlice);
    const parentSlice = loaded.slices.find((item) => item.sliceId === parentSliceId);
    if (!parentSlice) return { ok: false, status: 404, error: "autonomous_delivery_repair_parent_slice_not_found" };
    if (parentSlice.risk === "high" || loaded.case.risk === "high") {
      return { ok: false, status: 409, error: "autonomous_delivery_high_risk_manual_only" };
    }

    const repairSliceId = repairSliceIdForVerification(loaded.case, verificationSlice, parentSlice);
    const existing = loaded.slices.find((item) => item.sliceId === repairSliceId);
    if (existing?.taskCardId) {
      if (actionInboxService && typeof actionInboxService.completeItem === "function" && input.inboxItemId) {
        await Promise.resolve(actionInboxService.completeItem({
          itemId: input.inboxItemId,
          actorWorkspaceId: OWNER_WORKSPACE_ID,
          actorPrincipalId: clean(input.actor || "owner", 120),
          payload: {
            reason: "autonomous_delivery_repair_already_sent",
            caseId,
            verificationSliceId,
            taskCardIds: [existing.taskCardId],
          },
        })).catch(() => null);
      }
      return {
        ok: true,
        alreadyDispatched: true,
        case: loaded.case,
        parentSlice,
        verificationSlice,
        repairSlice: existing,
        taskCardIds: [existing.taskCardId],
        autoDispatched: false,
      };
    }

    const target = targetForWorkspace(parentSlice.targetWorkspaceId, targets);
    if (!target) return { ok: false, status: 409, error: "autonomous_delivery_repair_target_unknown" };
    const now = nowIso(options);
    const repairSliceKey = repairSliceKeyForVerification(verificationSlice, parentSlice);
    const rawJson = {
      parentSliceId: parentSlice.sliceId,
      parentSliceKey: parentSlice.sliceKey,
      verificationSliceId: verificationSlice.sliceId,
      verificationTaskCardId: verificationSlice.taskCardId,
      verificationReturnCardId: verificationSlice.returnCardId,
      verificationStatus: verificationSlice.status,
      verificationReturnSummary: verificationSlice.returnSummary,
      repairForTaskCardId: parentSlice.taskCardId,
    };
    rawJson.aiOps = aiOpsProjectionForSlice(loaded.case, {
      sliceKey: repairSliceKey,
      ownerLayer: parentSlice.ownerLayer,
      targetWorkspaceId: parentSlice.targetWorkspaceId,
      summary: `Repair failed verification for ${parentSlice.sliceKey || parentSlice.sliceId}. ${verificationSlice.returnSummary || ""}`,
    }, "repair", options);
    let repairSlice = publicSliceRecord(currentStore.upsertAutonomousDeliverySlice({
      sliceId: repairSliceId,
      caseId,
      workspaceId: loaded.case.workspaceId,
      sliceKey: repairSliceKey,
      ownerLayer: parentSlice.ownerLayer,
      targetWorkspaceId: parentSlice.targetWorkspaceId,
      targetWorkspacePath: parentSlice.targetWorkspacePath || target.targetWorkspace || "",
      status: "dispatching",
      risk: parentSlice.risk || "medium",
      dispatchStatus: "dispatching",
      title: clean(`Repair ${parentSlice.title || parentSlice.sliceKey || parentSlice.sliceId}`, 220),
      summary: cleanBlock(`Repair failed verification for ${parentSlice.sliceKey || parentSlice.sliceId}. Verification status: ${verificationSlice.status}. ${verificationSlice.returnSummary || ""}`, 900),
      rawJson,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      startedAt: existing?.startedAt || now,
    }));
    const ownerPrompt = cleanBlock(input.ownerPrompt || input.owner_prompt || "", 1200);
    const taskCard = repairTaskCardForSlice(loaded.case, repairSlice, verificationSlice, parentSlice, target, ownerPrompt);
    let sent;
    try {
      sent = await Promise.resolve(taskCardService.sendTaskCard(Object.assign({}, taskCard, {
        sourceWorkspaceCwd: APP_WORKSPACE,
        targetWorkspaceCwd: taskCard.targetWorkspace,
      })));
    } catch (err) {
      sent = exceptionTaskCardResult(err);
    }
    const dispatchResult = normalizeTaskCardDispatchResult(sent, taskCardDispatchContextForSlice(repairSlice, target));
    const cardIds = dispatchResult.cardIds;
    if (!dispatchResult.ok) {
      const dispatchFailure = dispatchResult.failure;
      repairSlice = publicSliceRecord(currentStore.upsertAutonomousDeliverySlice(Object.assign({}, repairSlice, {
        status: "blocked",
        dispatchStatus: "failed",
        blockedReason: dispatchFailure.code,
        taskCard,
        rawJson: rawJsonWithDispatchFailure(rawJson, dispatchFailure, "repairDispatchFailure"),
        updatedAt: nowIso(options),
        startedAt: repairSlice.startedAt || now,
      })));
      const nextCase = publicCaseRecord(currentStore.upsertAutonomousDeliveryCase(Object.assign({}, loaded.case, {
        status: "repair_waiting",
        updatedAt: nowIso(options),
      })));
      appendEvent(caseId, "repair_dispatch_failed", {
        parentSliceId: parentSlice.sliceId,
        verificationSliceId,
        repairSliceId,
        reason: dispatchFailure.code,
      }, input.auth || {});
      return {
        ok: false,
        status: 502,
        error: "autonomous_delivery_task_card_dispatch_failed",
        case: nextCase,
        parentSlice,
        verificationSlice,
        repairSlice,
        taskCardResult: sent,
        dispatchFailure,
        taskCardIds: [],
        autoDispatched: false,
      };
    }
    repairSlice = publicSliceRecord(currentStore.upsertAutonomousDeliverySlice(Object.assign({}, repairSlice, {
      status: "dispatched",
      dispatchStatus: "sent",
      taskCardId: cardIds[0] || "",
      taskCard,
      rawJson: Object.assign({}, rawJson, {
        repairTaskCardId: cardIds[0] || "",
        repairTaskCardIds: cardIds,
      }),
      updatedAt: nowIso(options),
      startedAt: repairSlice.startedAt || now,
    })));
    const nextCase = publicCaseRecord(currentStore.upsertAutonomousDeliveryCase(Object.assign({}, loaded.case, {
      status: "repair_dispatched",
      updatedAt: nowIso(options),
    })));
    if (actionInboxService && typeof actionInboxService.completeItem === "function" && input.inboxItemId) {
      await Promise.resolve(actionInboxService.completeItem({
        itemId: input.inboxItemId,
        actorWorkspaceId: OWNER_WORKSPACE_ID,
        actorPrincipalId: clean(input.actor || "owner", 120),
        payload: {
          reason: "autonomous_delivery_repair_sent",
          caseId,
          verificationSliceId,
          taskCardIds: cardIds,
          ownerPromptAttached: Boolean(ownerPrompt),
        },
      })).catch(() => null);
    }
    appendEvent(caseId, "repair_dispatched", {
      parentSliceId: parentSlice.sliceId,
      verificationSliceId,
      repairSliceId,
      taskCardIds: cardIds,
    }, input.auth || {});
    return {
      ok: true,
      case: nextCase,
      parentSlice,
      verificationSlice,
      repairSlice,
      taskCardResult: sent,
      taskCardIds: cardIds,
      autoDispatched: false,
    };
  }

  function recordReturnForTaskCard(input = {}) {
    const currentStore = requireStore();
    const taskCardId = clean(input.taskCardId || input.task_card_id || input.originalTaskCardId || input.original_task_card_id, 160);
    if (!taskCardId) return { ok: false, status: 400, error: "autonomous_delivery_task_card_id_required" };
    if (typeof currentStore.getAutonomousDeliverySliceByTaskCardId !== "function") {
      return { ok: false, status: 503, error: "autonomous_delivery_task_card_lookup_unavailable" };
    }
    const slice = publicSliceRecord(currentStore.getAutonomousDeliverySliceByTaskCardId(taskCardId) || {});
    if (!slice.sliceId || !slice.caseId) {
      return { ok: false, status: 404, error: "autonomous_delivery_task_card_slice_not_found" };
    }
    return recordReturn(Object.assign({}, input, {
      caseId: slice.caseId,
      sliceId: slice.sliceId,
      taskCardId,
    }));
  }

  function recordReturnCardEvent(input = {}) {
    const event = boundedReturnEvent(input);
    if (!event.originalTaskCardId) {
      return { ok: false, status: 400, error: "autonomous_delivery_return_event_task_card_required" };
    }
    if (!event.status || !TERMINAL_SLICE_STATUSES.includes(event.status)) {
      return { ok: false, status: 400, error: "autonomous_delivery_return_event_status_invalid" };
    }
    const summary = cleanBlock(input.summary || input.returnSummary || input.return_summary || input.resultSummary || input.result_summary || "", 1200);
    return recordReturnForTaskCard(Object.assign({}, input, {
      taskCardId: event.originalTaskCardId,
      status: event.status,
      returnCardId: event.returnCardId,
      summary,
      returnCardEvent: event,
    }));
  }

  return Object.freeze({
    closeCase,
    createCase,
    deliveryLoopStatusSummary,
    dispatchControlSummary,
    getCase,
    listCases,
    recordReturn,
    recordReturnCardEvent,
    recordReturnForTaskCard,
    returnWatchdogSummary,
    runSourceReturnIntegrationWatchdog,
    runReturnWatchdog,
    sourceReturnIntegrationSummary,
    startCase,
    startDeployment,
    startVerification,
    startRepair,
  });
}

module.exports = {
  CASE_STATUSES,
  CLOSURE_NOTIFICATION_TYPE,
  DEPLOYMENT_NOTIFICATION_TYPE,
  FINAL_REPORT_NOTIFICATION_TYPE,
  NOTIFICATION_TYPE,
  REPAIR_NOTIFICATION_TYPE,
  SLICE_STATUSES,
  TERMINAL_SLICE_STATUSES,
  VERIFICATION_NOTIFICATION_TYPE,
  createAutonomousDeliveryCoordinatorService,
  deliveryFinalReportForCase,
  deploymentTaskCardForSlice,
  ownerClosureNotificationForVerification,
  ownerDeploymentNotificationForReturn,
  ownerFinalReportNotificationForCase,
  ownerNotificationForCase,
  ownerRepairNotificationForVerification,
  ownerVerificationNotificationForReturn,
  repairTaskCardForSlice,
  taskCardForSlice,
  verificationTaskCardForSlice,
};
