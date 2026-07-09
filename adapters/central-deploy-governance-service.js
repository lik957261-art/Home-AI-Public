"use strict";

const CENTRAL_DEPLOY_GOVERNANCE_VERSION = "20260709-central-deploy-governance-v1";

const CENTRAL_DEPLOY_SOURCE_ROLES = new Set([
  "home_ai_main",
  "owner_main",
  "central_deploy_coordinator",
  "explicit_deploy_orchestrator",
]);

const WORKER_DEPLOY_SOURCE_ROLES = new Set([
  "plugin_worker",
  "home_ai_worker",
  "repair_worker",
  "audit_worker",
  "loop_worker",
]);

const NON_COORDINATOR_DEPLOY_SOURCE_ROLES = new Set([
  ...WORKER_DEPLOY_SOURCE_ROLES,
  "plugin_source_thread",
]);

const CENTRAL_GOVERNANCE_CATEGORIES = new Set([
  "central_contract_governance",
  "central_deploy_governance",
  "platform_governance",
  "cross_plugin_contract",
  "shared_deployment_policy",
  "task_card_routing_policy",
  "worker_lane_policy",
  "central_visual_contract",
  "central_deploy_contract",
]);

function clean(value, max = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 240));
}

function cleanBlock(value, max = 1200) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 1200));
}

function normalizeToken(value, max = 120) {
  return clean(value, max).toLowerCase().replace(/[-\s]+/g, "_");
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return [value];
}

function boundedList(value, maxItems = 20, itemMax = 240) {
  return arrayValue(value)
    .flatMap((item) => String(item ?? "").split(","))
    .map((item) => clean(item, itemMax))
    .filter(Boolean)
    .slice(0, maxItems);
}

function boolValue(value, defaultValue = false) {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return defaultValue;
}

function dirtyStateOf(input = {}) {
  const dirtyState = objectValue(input.dirtyState || input.dirty_state || input.sourceDirtyState || input.source_dirty_state);
  return {
    dirty: boolValue(dirtyState.dirty ?? input.sourceDirty ?? input.source_dirty, false),
    files: boundedList(dirtyState.files || dirtyState.dirtyFiles || input.dirtyFiles || input.dirty_files, 20, 260),
  };
}

function firstClean(...values) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return "";
}

function sourceRoleOf(input = {}) {
  const metadata = objectValue(input.metadata || input.meta);
  const message = objectValue(input.message);
  return normalizeToken(firstClean(
    input.sourceRole,
    input.source_role,
    input.deploySourceRole,
    input.deploy_source_role,
    input.dispatchSourceRole,
    input.dispatch_source_role,
    input.requestedByRole,
    input.requested_by_role,
    metadata.sourceRole,
    metadata.source_role,
    message.sourceRole,
    message.source_role,
  ), 120);
}

function centralOverrideOf(input = {}) {
  const metadata = objectValue(input.metadata || input.meta);
  const governance = objectValue(input.deployGovernance || input.deploy_governance || metadata.deployGovernance || metadata.deploy_governance);
  return {
    requested: boolValue(input.centralOverride ?? input.central_override ?? governance.centralOverride ?? governance.central_override, false),
    reason: clean(input.overrideReason || input.override_reason || governance.overrideReason || governance.override_reason, 260),
    ownerApprovalRef: clean(input.ownerApprovalRef || input.owner_approval_ref || governance.ownerApprovalRef || governance.owner_approval_ref, 160),
    centralCoordinatorRef: clean(input.centralCoordinatorRef || input.central_coordinator_ref || governance.centralCoordinatorRef || governance.central_coordinator_ref, 160),
  };
}

function deployCardEvidenceOf(input = {}) {
  const metadata = objectValue(input.metadata || input.meta);
  const governance = objectValue(input.deployGovernance || input.deploy_governance || metadata.deployGovernance || metadata.deploy_governance);
  return {
    sourceRef: clean(input.sourceRef || input.source_ref || governance.sourceRef || governance.source_ref || metadata.sourceRef || metadata.source_ref, 160),
    validationSummary: boundedList(input.validationSummary || input.validation_summary || governance.validationSummary || governance.validation_summary || metadata.validationSummary || metadata.validation_summary, 20, 260),
    requiredReadback: boundedList(input.requiredReadback || input.required_readback || governance.requiredReadback || governance.required_readback || metadata.requiredReadback || metadata.required_readback, 20, 260),
    coordinatorRef: clean(input.centralCoordinatorRef || input.central_coordinator_ref || governance.centralCoordinatorRef || governance.central_coordinator_ref || metadata.centralCoordinatorRef || metadata.central_coordinator_ref, 160),
    dirtyState: dirtyStateOf(Object.assign({}, metadata, governance, input)),
  };
}

function issue(code, detail = "") {
  return { code: clean(code, 120), detail: clean(detail, 320) };
}

function validateCentralOverride(input = {}) {
  const override = centralOverrideOf(input);
  const evidence = deployCardEvidenceOf(input);
  const issues = [];
  if (!override.requested) {
    return { ok: false, requested: false, accepted: false, issues: [issue("central_override_required")] };
  }
  if (!override.reason) issues.push(issue("central_override_reason_required"));
  if (!override.ownerApprovalRef && !override.centralCoordinatorRef) {
    issues.push(issue("central_override_authority_ref_required"));
  }
  if (!evidence.sourceRef) issues.push(issue("central_override_source_ref_required"));
  if (evidence.dirtyState.dirty) issues.push(issue("deploy_request_dirty_source"));
  if (!evidence.validationSummary.length) issues.push(issue("central_override_validation_summary_required"));
  if (!evidence.requiredReadback.length) issues.push(issue("central_override_readback_required"));
  return {
    ok: issues.length === 0,
    requested: true,
    accepted: issues.length === 0,
    issues,
    override,
  };
}

function validateDeployCardSourceAuthorization(input = {}) {
  const sourceRole = sourceRoleOf(input);
  const evidence = deployCardEvidenceOf(input);
  const override = validateCentralOverride(input);
  const issues = [];

  if (!sourceRole) {
    issues.push(issue("deploy_card_requires_central_coordinator", "Deploy lane cards must carry sourceRole/coordinator metadata."));
  } else if (CENTRAL_DEPLOY_SOURCE_ROLES.has(sourceRole)) {
    // allowed
  } else if (NON_COORDINATOR_DEPLOY_SOURCE_ROLES.has(sourceRole)) {
    if (!override.ok) {
      issues.push(issue(
        WORKER_DEPLOY_SOURCE_ROLES.has(sourceRole) ? "worker_direct_deploy_forbidden" : "deploy_source_role_not_authorized",
        "Non-coordinator roles may return deployRequest metadata but cannot dispatch deploy lane cards directly.",
      ));
    }
  } else if (!override.ok) {
    issues.push(issue("deploy_source_role_not_authorized", "Deploy lane source role is not authorized."));
  }

  if (sourceRole && !CENTRAL_DEPLOY_SOURCE_ROLES.has(sourceRole) && !override.ok) {
    issues.push(...override.issues.filter((item) => item.code !== "central_override_required"));
  }

  return {
    ok: issues.length === 0,
    schemaVersion: 1,
    version: CENTRAL_DEPLOY_GOVERNANCE_VERSION,
    issueCode: issues[0]?.code || "",
    issueCodes: issues.map((item) => item.code),
    issues,
    sourceRole,
    sourceRoleAuthorized: issues.length === 0,
    centralCoordinatorRef: evidence.coordinatorRef || centralOverrideOf(input).centralCoordinatorRef,
    centralOverride: override.requested,
    centralOverrideAccepted: override.ok,
    sourceRef: evidence.sourceRef,
    dirtyState: evidence.dirtyState,
  };
}

function governanceCategoryOf(input = {}) {
  const metadata = objectValue(input.metadata || input.meta);
  const category = normalizeToken(firstClean(input.category, input.cardCategory, input.card_category, metadata.category));
  if (CENTRAL_GOVERNANCE_CATEGORIES.has(category)) return category;
  const body = cleanBlock([
    input.title,
    input.body,
    input.bodyMarkdown,
    input.summary,
    metadata.title,
    metadata.summary,
  ].filter(Boolean).join(" "), 3000).toLowerCase();
  if (/(central|平台|中央).{0,40}(deploy|deployment|部署).{0,40}(governance|contract|policy|治理|契约|策略)/i.test(body)) {
    return "central_deploy_governance";
  }
  if (/(worker lane|task-card routing|cross-plugin contract|shared deployment policy|中央契约|跨插件|部署治理)/i.test(body)) {
    return "central_contract_governance";
  }
  return "";
}

function validateCentralGovernanceWorkerCard(input = {}) {
  const category = governanceCategoryOf(input);
  const requiresMainThreadDesign = boolValue(input.requiresMainThreadDesign ?? input.requires_main_thread_design, false);
  const forbiddenDirectWorkerImplementation = boolValue(
    input.forbiddenDirectWorkerImplementation ?? input.forbidden_direct_worker_implementation,
    false,
  );
  const directWorkerImplementation = boolValue(input.directWorkerImplementation ?? input.direct_worker_implementation, true);
  const sourceRole = sourceRoleOf(input);
  const relevant = Boolean(category || requiresMainThreadDesign || forbiddenDirectWorkerImplementation);
  const issues = [];

  if (relevant && directWorkerImplementation && !CENTRAL_DEPLOY_SOURCE_ROLES.has(sourceRole)) {
    issues.push(issue(
      sourceRole === "plugin_source_thread"
        ? "platform_governance_card_must_start_from_home_ai_main"
        : "central_contract_work_requires_main_thread_design",
      "Central deploy/platform governance implementation must start from Home AI main/coordinator design.",
    ));
  }

  return {
    ok: issues.length === 0,
    schemaVersion: 1,
    version: CENTRAL_DEPLOY_GOVERNANCE_VERSION,
    issueCode: issues[0]?.code || "",
    issueCodes: issues.map((item) => item.code),
    issues,
    category,
    sourceRole,
    requiresMainThreadDesign: relevant,
    forbiddenDirectWorkerImplementation: relevant && !CENTRAL_DEPLOY_SOURCE_ROLES.has(sourceRole),
  };
}

function normalizeDeployRequest(input = {}) {
  const source = objectValue(input.deployRequest || input.deploy_request || input);
  const dirtyState = dirtyStateOf(source);
  const needed = boolValue(source.needed ?? source.deployNeeded ?? source.deploy_needed, false);
  const normalized = {
    needed,
    requestedByRole: normalizeToken(source.requestedByRole || source.requested_by_role, 120),
    sourceWorkspace: clean(source.sourceWorkspace || source.source_workspace, 260),
    target: clean(source.target, 120),
    sourceRef: clean(source.sourceRef || source.source_ref, 160),
    baseRef: clean(source.baseRef || source.base_ref, 160),
    changedFiles: boundedList(source.changedFiles || source.changed_files, 40, 260),
    validationSummary: boundedList(source.validationSummary || source.validation_summary, 30, 260),
    requiredReadback: boundedList(source.requiredReadback || source.required_readback, 30, 260),
    risk: normalizeToken(source.risk || "medium", 40) || "medium",
    issueCodes: boundedList(source.issueCodes || source.issue_codes, 20, 120),
    requiresCentralIntegration: boolValue(source.requiresCentralIntegration ?? source.requires_central_integration, false),
    supersedesDeployRefs: boundedList(source.supersedesDeployRefs || source.supersedes_deploy_refs, 20, 160),
    dirtyState,
  };
  const issues = [];
  if (needed) {
    if (!normalized.requestedByRole) issues.push(issue("deploy_request_requested_by_role_required"));
    if (!normalized.target) issues.push(issue("deploy_request_target_required"));
    if (!normalized.sourceRef) issues.push(issue("deploy_request_source_ref_required"));
    if (dirtyState.dirty) issues.push(issue("deploy_request_dirty_source"));
    if (WORKER_DEPLOY_SOURCE_ROLES.has(normalized.requestedByRole)) {
      issues.push(issue("deploy_request_metadata_only", "Worker deployRequest is metadata for central coordinator, not deploy authorization."));
    }
  }
  return Object.assign(normalized, {
    ok: issues.filter((item) => item.code !== "deploy_request_metadata_only").length === 0,
    authorization: "metadata_only",
    deployAuthorized: false,
    issues,
    issueCodes: Array.from(new Set([...normalized.issueCodes, ...issues.map((item) => item.code)])),
  });
}

function deployRequestKey(request = {}) {
  return `${request.target || "unknown"}|${request.sourceWorkspace || "unknown"}`;
}

function aggregateDeployRequests(inputs = []) {
  const requests = arrayValue(inputs)
    .map(normalizeDeployRequest)
    .filter((request) => request.needed);
  const groups = new Map();
  for (const request of requests) {
    const key = deployRequestKey(request);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(request);
  }
  const candidates = [];
  const issues = [];
  for (const [key, group] of groups.entries()) {
    const refs = Array.from(new Set(group.map((item) => item.sourceRef).filter(Boolean)));
    const supersededRefs = new Set(group.flatMap((item) => item.supersedesDeployRefs));
    const activeRefs = refs.filter((ref) => !supersededRefs.has(ref));
    const dirty = group.find((item) => item.dirtyState.dirty);
    const candidateIssues = [];
    if (dirty) candidateIssues.push(issue("deploy_request_dirty_source"));
    if (activeRefs.length > 1 || group.some((item) => item.requiresCentralIntegration)) {
      candidateIssues.push(issue("deploy_request_requires_integration"));
      if (activeRefs.length > 1) candidateIssues.push(issue("deploy_request_source_ref_divergent"));
    }
    const [target, sourceWorkspace] = key.split("|");
    const latest = group[group.length - 1] || {};
    candidates.push({
      key,
      target,
      sourceWorkspace,
      sourceRef: activeRefs.length === 1 ? activeRefs[0] : clean(latest.sourceRef || "", 160),
      requestCount: group.length,
      status: candidateIssues.length ? "integration_required" : "deploy_candidate",
      issueCodes: candidateIssues.map((item) => item.code),
      changedFiles: Array.from(new Set(group.flatMap((item) => item.changedFiles))).slice(0, 80),
      validationSummary: Array.from(new Set(group.flatMap((item) => item.validationSummary))).slice(0, 40),
      requiredReadback: Array.from(new Set(group.flatMap((item) => item.requiredReadback))).slice(0, 40),
      supersededRefs: Array.from(supersededRefs).slice(0, 20),
    });
    issues.push(...candidateIssues);
  }
  return {
    ok: issues.length === 0,
    schemaVersion: 1,
    version: CENTRAL_DEPLOY_GOVERNANCE_VERSION,
    issueCode: issues[0]?.code || "",
    issueCodes: Array.from(new Set(issues.map((item) => item.code))),
    requestCount: requests.length,
    candidateCount: candidates.length,
    candidates,
  };
}

function buildDeployLaneGovernanceReport(input = {}) {
  const authorization = validateDeployCardSourceAuthorization(input);
  return {
    schemaVersion: 1,
    version: CENTRAL_DEPLOY_GOVERNANCE_VERSION,
    ok: authorization.ok,
    issueCode: authorization.issueCode,
    issueCodes: authorization.issueCodes,
    sourceRole: authorization.sourceRole,
    centralCoordinatorRef: authorization.centralCoordinatorRef,
    centralOverride: authorization.centralOverride,
    centralOverrideAccepted: authorization.centralOverrideAccepted,
    sourceRef: authorization.sourceRef,
    dirty: authorization.dirtyState.dirty,
  };
}

module.exports = {
  CENTRAL_DEPLOY_GOVERNANCE_VERSION,
  CENTRAL_DEPLOY_SOURCE_ROLES,
  WORKER_DEPLOY_SOURCE_ROLES,
  aggregateDeployRequests,
  buildDeployLaneGovernanceReport,
  normalizeDeployRequest,
  sourceRoleOf,
  validateCentralGovernanceWorkerCard,
  validateCentralOverride,
  validateDeployCardSourceAuthorization,
};
