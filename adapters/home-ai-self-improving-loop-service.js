"use strict";

const DEFAULT_APP_WORKSPACE = "/Users/example/path";
const DEFAULT_PLATFORM_AUDIT_THREAD_TITLE = "Home AI Platform Audit";
const DEFAULT_PLUGIN_AUDIT_THREAD_TITLE = "Plugin Workspace Audit";

const SEVERITY_RANK = Object.freeze({ info: 0, H4: 1, H3: 2, H2: 3, H1: 4 });
const SKIPPED_STATUSES = new Set(["skipped", "not_applicable", "blocked_by_context"]);

const SIGNAL_MATRIX_VERSION = "20260629-self-improving-loop-v5";

const DEFAULT_SIGNALS = Object.freeze([
  Object.freeze({
    id: "gateway_profile_health",
    title: "Gateway profile and worker health",
    domain: "gateway",
    owner: "home-ai-gateway",
    severity: "H2",
    source: "production-status-smoke",
    expected: "status ok, worker policy ok, selected profiles healthy",
    threshold: "status ok, worker-policy healthy, and activeGlobal below configured maximum",
    evidence: ["activeGlobal", "gatewayPool.workerCount", "gatewayWorkerPolicyContract.ok"],
    closureReadbacks: ["production_status_smoke", "gateway_worker_policy_contract", "active_run_count_readback"],
    target: "Home AI",
    checks: [
      "node tests/production-status-smoke-harness.test.js",
      "node tests/mobile-runtime-gateway-status-service.test.js",
    ],
  }),
  Object.freeze({
    id: "mcp_schema_closure",
    title: "MCP selected-profile callable schema closure",
    domain: "mcp_schema",
    owner: "home-ai-gateway-toolset",
    severity: "H1",
    source: "mcp-tool-upgrade-closure-smoke",
    expected: "service schema, selected profile schema, and dispatcher registry agree",
    threshold: "no missing required callable or required input property",
    evidence: ["toolset", "profile", "missingToolCount", "missingPropertyCount", "dispatcherCallableCount"],
    closureReadbacks: [
      "service_schema_readback",
      "selected_profile_schema_readback",
      "dispatcher_registry_probe",
      "callable_invocation_probe",
    ],
    target: "Home AI",
    checks: [
      "node tests/mcp-tool-upgrade-closure-harness.test.js",
      "node scripts/mcp-tool-upgrade-closure-smoke.js --json",
    ],
  }),
  Object.freeze({
    id: "deploy_lane_liveness",
    title: "Home AI Deploy lane liveness",
    domain: "deployment",
    owner: "home-ai-platform",
    severity: "H2",
    source: "codex-thread-task-card-service",
    expected: "Home AI Deploy thread is discoverable, live, and non-terminal",
    threshold: "deploy lane must not be missing, completed, archived, deleted, or ambiguous",
    evidence: ["threadTitle", "threadStatus", "targetWorkspaceCwd"],
    closureReadbacks: ["deploy_lane_thread_readback", "task_card_route_readback"],
    target: "Home AI Deploy",
    checks: [
      "node tests/codex-thread-task-card-service.test.js",
      "node tests/macos-production-deploy-script.test.js",
    ],
  }),
  Object.freeze({
    id: "task_card_dispatch",
    title: "Owner-gated task-card dispatch",
    domain: "task_card",
    owner: "home-ai-platform",
    severity: "H2",
    source: "ai-ops-diagnostic-remediation-workflow",
    expected: "eligible cases produce visible Owner action and true ttc_* dispatch after Owner trigger",
    threshold: "no repeated failed dispatch for the same action or legacy t_* repair-card claim",
    evidence: ["caseId", "actionInboxItemId", "dispatchStatus", "errorCode"],
    closureReadbacks: ["action_inbox_item_readback", "task_card_id_readback", "target_thread_readback", "return_card_state"],
    target: "Home AI",
    checks: [
      "node tests/ai-ops-diagnostic-remediation-workflow-service.test.js",
      "node tests/plugin-conversation-action-bridge-service.test.js",
      "node tests/codex-thread-task-card-service.test.js",
    ],
  }),
  Object.freeze({
    id: "plugin_proxy_latency",
    title: "Embedded plugin proxy latency gap",
    domain: "plugin_proxy",
    owner: "home-ai-plugin-host",
    severity: "H2",
    source: "plugin-proxy-timing-service",
    expected: "host proxy elapsed time tracks upstream plugin timing within bounded buckets",
    threshold: "no repeated client/proxy gap above 2s for warm plugin thread/list/detail routes",
    evidence: ["pluginId", "routeKind", "durationBucket", "upstreamMsBucket", "gapMsBucket"],
    closureReadbacks: ["host_proxy_timing_split", "upstream_timing_readback", "post_fix_latency_probe", "diagnostic_return_card"],
    target: "Home AI",
    checks: [
      "node tests/plugin-proxy-timing-service.test.js",
      "node tests/hermes-plugin-api-routes.test.js",
    ],
  }),
  Object.freeze({
    id: "media_preview_health",
    title: "Mobile media and document preview health",
    domain: "media_preview",
    owner: "home-ai-media-preview",
    severity: "H2",
    source: "document-preview-device-policy/browser-runtime-self-check",
    expected: "PDF, Word, PPT, and generated image previews use native bridge or protected browser-safe routes with a visible recovery action",
    threshold: "no supported media kind renders an unrecoverable blank/broken preview without open/share/download recovery action",
    evidence: ["pluginId", "mediaKind", "failureKind", "sourceKind", "nativeBridgeMode", "recoveryActionAvailable"],
    closureReadbacks: [
      "browser_runtime_self_check",
      "protected_media_route_probe",
      "native_bridge_open_result",
      "visible_fallback_action_probe",
    ],
    target: "Home AI or native shell",
    checks: [
      "node tests/document-preview-device-policy.test.js",
      "node tests/file-artifact-api-routes.test.js",
    ],
  }),
  Object.freeze({
    id: "gateway_document_tool_capability",
    title: "Low-permission Gateway document tool capability",
    domain: "gateway_tooling",
    owner: "home-ai-gateway-toolset",
    severity: "H2",
    source: "gateway-tool-schema-smoke",
    expected: "ordinary low-permission Gateway profiles expose real PDF, Word, PowerPoint, audio, and archive file tools when file toolset is authorized",
    threshold: "no authorized low-permission workspace reports missing document creation/extraction tools for explicit file-delivery requests",
    evidence: ["workspaceId", "profile", "toolName", "missingToolCount", "requiredToolCount"],
    closureReadbacks: [
      "low_gateway_schema_smoke",
      "document_tool_invocation_probe",
      "media_attachment_delivery_probe",
    ],
    target: "Home AI",
    checks: [
      "node tests/gateway-run-instruction-service.test.js",
      "node tests/hermes-mobile-pdf-plugin.test.js",
      "node tests/hermes-mobile-office-plugin.test.js",
      "node tests/hermes-mobile-pptx-plugin.test.js",
    ],
  }),
  Object.freeze({
    id: "plugin_deploy_contract_closure",
    title: "Plugin deployment lane contract closure",
    domain: "deployment",
    owner: "home-ai-platform",
    severity: "H2",
    source: "Home AI Deploy lane / deploy-macos-production",
    expected: "routine plugin deploys route to Home AI Deploy and close with production readback instead of plugin-visible sudo/password retry loops or receipt-shaped request cards",
    threshold: "no plugin thread needs password-file access, direct production execute, or a terminal receipt masquerading as a routine deployment request",
    evidence: ["pluginId", "deployReason", "targetThreadTitle", "taskCardId", "cardKind", "productionVersion"],
    closureReadbacks: ["deploy_lane_card_route", "receipt_shape_rejection", "production_manifest_readback", "launchd_state_readback", "return_card_receipt"],
    target: "Home AI Deploy",
    checks: [
      "node tests/codex-thread-task-card-service.test.js",
      "node tests/macos-production-deploy-script.test.js",
    ],
  }),
  Object.freeze({
    id: "plugin_proxy_workspace_boundary",
    title: "Plugin proxy workspace propagation boundary",
    domain: "plugin_proxy_workspace",
    owner: "home-ai-plugin-host",
    severity: "H2",
    source: "hermes-plugin proxy workspace enforcement",
    expected: "write-capable plugin proxy calls carry explicit effective workspace and fail closed when workspace is missing",
    threshold: "no Owner auth default writes to the wrong workspace; missing workspace remains a bounded 400",
    evidence: ["pluginId", "workspaceId", "statusCode", "errorCode", "routeKind"],
    closureReadbacks: ["workspace_header_or_query_probe", "missing_workspace_400_probe", "target_workspace_write_probe"],
    target: "Home AI or native shell",
    checks: [
      "node tests/hermes-plugin-api-routes.test.js",
      "node tests/health-plugin-provisioning-service.test.js",
    ],
  }),
  Object.freeze({
    id: "native_bridge_capability",
    title: "Native shell bridge capability agreement",
    domain: "native_bridge",
    owner: "home-ai-native-shell",
    severity: "H2",
    source: "native shell capability projection",
    expected: "Web caller and native shell agree on document, notification, workspace, and open-in capabilities",
    threshold: "no supported shell version with missing advertised bridge or unsupported same-origin document open",
    evidence: ["platform", "appVersion", "capability", "boundedError"],
    closureReadbacks: ["native_capability_object", "same_origin_bridge_result", "fallback_path_result"],
    target: "Native shell or Home AI",
    checks: [
      "node tests/document-preview-device-policy.test.js",
      "node tests/native-notification-service.test.js",
    ],
  }),
  Object.freeze({
    id: "notification_delivery",
    title: "Owner notification delivery and duplicate suppression",
    domain: "notification",
    owner: "home-ai-notifications",
    severity: "H2",
    source: "web-push-native-channel-service",
    expected: "Owner notification fan-out is delivered once per eligible case/action and deduped by signature",
    threshold: "no duplicate push storm and no silent failed H1/H2 notification",
    evidence: ["channel", "attempted", "sent", "failed", "dedupeKey"],
    closureReadbacks: ["delivery_receipt_count", "duplicate_signature_count", "failed_delivery_visibility"],
    target: "Home AI",
    checks: [
      "node tests/web-push-delivery-service.test.js",
      "node tests/ai-ops-diagnostic-remediation-workflow-service.test.js",
    ],
  }),
  Object.freeze({
    id: "plugin_manifest_health",
    title: "Embedded plugin manifest and authorization health",
    domain: "plugin_manifest",
    owner: "home-ai-plugin-host",
    severity: "H2",
    source: "hermes-plugin-service",
    expected: "Owner-visible plugin manifests and non-Owner availability follow workspace policy",
    threshold: "no stale plugin version, wrong action exposure, or non-Owner leakage",
    evidence: ["pluginId", "workspaceId", "available", "version", "actionCount"],
    closureReadbacks: ["direct_plugin_manifest", "owner_proxy_manifest", "non_owner_denial", "host_action_count"],
    target: "Home AI or plugin owner",
    checks: [
      "node tests/hermes-plugin-service.test.js",
      "node tests/hermes-plugin-authorization-service.test.js",
    ],
  }),
  Object.freeze({
    id: "audit_thread_liveness",
    title: "Dedicated audit thread liveness",
    domain: "audit",
    owner: "home-ai-platform",
    severity: "H2",
    source: "codex-thread-task-card-service",
    expected: "Home AI Platform Audit and Plugin Workspace Audit are discoverable current audit lanes",
    threshold: "audit request automation must fail visibly if either lane is missing or ambiguous",
    evidence: ["auditKind", "threadTitle", "threadStatus", "targetWorkspaceCwd"],
    closureReadbacks: ["platform_audit_thread_readback", "plugin_audit_thread_readback", "audit_card_route_readback"],
    target: "Home AI Platform Audit / Plugin Workspace Audit",
    checks: [
      "node tests/codex-thread-task-card-service.test.js",
      "node tests/plugin-workspace-audit-runner.test.js",
    ],
  }),
  Object.freeze({
    id: "automation_cron_health",
    title: "Automation cron scheduler and job health",
    domain: "automation",
    owner: "home-ai-automation",
    severity: "H2",
    source: "macos-automation-cron-audit",
    expected: "canonical cron store, skills, runtime scripts, and recent job status are healthy",
    threshold: "no source, config, or recent status issues in strict cron audit",
    evidence: ["jobCount", "skillCount", "sourceIssueCount", "configIssueCount", "statusIssueCount"],
    closureReadbacks: ["cron_source_audit", "cron_config_audit", "cron_recent_status_audit"],
    target: "Home AI",
    checks: [
      "node tests/macos-automation-cron-audit.test.js",
      "node tests/automation-provider.test.js",
    ],
  }),
  Object.freeze({
    id: "production_self_diagnostics",
    title: "Production self-diagnostics inventory health",
    domain: "production_diagnostics",
    owner: "home-ai-platform",
    severity: "H2",
    source: "production-self-diagnostics",
    expected: "production self-diagnostic inventory is synchronized and issue-free",
    threshold: "no missing script, missing source harness, or inventory coverage issue",
    evidence: ["diagnosticCount", "issueCount"],
    closureReadbacks: ["production_diagnostic_inventory", "source_harness_coverage", "coverage_audit_result"],
    target: "Home AI",
    checks: [
      "node tests/production-self-diagnostics.test.js",
      "node tests/production-self-diagnostics-coverage-audit.test.js",
    ],
  }),
  Object.freeze({
    id: "public_upgrade_rehearsal",
    title: "Public repository upgrade rehearsal closure",
    domain: "public_upgrade",
    owner: "home-ai-deployment",
    severity: "H2",
    source: "homeai-public-upgrade-rehearsal",
    expected: "published public repo can be cloned and target-side upgrade planning proves missing-source fail-closed and explicit clone/deploy closure",
    threshold: "public rehearsal must pass source preflight, fail closed without clone gate, and produce clone/deploy/closure-validation actions with the clone gate",
    evidence: [
      "pluginCount",
      "missingSourceBlockerCount",
      "cloneActionCount",
      "deployActionCount",
      "movieOperatorAuthenticated",
      "closureValidationPresent",
      "tempRemoved",
    ],
    closureReadbacks: [
      "public_repo_remote_head",
      "source_rehearsal_execute",
      "production_rehearsal_execute",
      "release_public_validation",
    ],
    target: "Home AI",
    checks: [
      "node tests/public-upgrade-rehearsal-service.test.js",
      "node tests/homeai-public-upgrade-rehearsal-script.test.js",
    ],
  }),
]);

const DEFAULT_INCIDENT_COVERAGE_REQUIREMENTS = Object.freeze([
  Object.freeze({
    id: "codex_proxy_latency_gap",
    title: "Codex Mobile embedded proxy latency gap",
    severity: "H2",
    incidentClass: "performance_regression",
    requiredSignals: ["plugin_proxy_latency"],
    requiredEvidence: ["pluginId", "routeKind", "durationBucket", "upstreamMsBucket", "gapMsBucket"],
    requiredClosureReadbacks: ["host_proxy_timing_split", "upstream_timing_readback", "post_fix_latency_probe"],
    remediationGate: "self_check_auto_dispatch",
  }),
  Object.freeze({
    id: "generated_media_preview_failure",
    title: "Generated image or Office/PDF preview cannot be opened",
    severity: "H2",
    incidentClass: "rendering_regression",
    requiredSignals: ["media_preview_health", "native_bridge_capability"],
    requiredEvidence: ["pluginId", "mediaKind", "failureKind", "sourceKind", "nativeBridgeMode"],
    requiredClosureReadbacks: ["browser_runtime_self_check", "protected_media_route_probe", "native_bridge_open_result"],
    remediationGate: "self_check_auto_dispatch",
  }),
  Object.freeze({
    id: "mcp_dispatcher_schema_missing",
    title: "Plugin MCP callable exists in hints but dispatcher reports missing tool",
    severity: "H1",
    incidentClass: "schema_dispatch_mismatch",
    requiredSignals: ["mcp_schema_closure"],
    requiredEvidence: ["toolset", "profile", "missingToolCount", "missingPropertyCount", "dispatcherCallableCount"],
    requiredClosureReadbacks: ["service_schema_readback", "selected_profile_schema_readback", "dispatcher_registry_probe", "callable_invocation_probe"],
    remediationGate: "self_check_auto_dispatch",
  }),
  Object.freeze({
    id: "gateway_document_tool_capability_gap",
    title: "Low-permission Gateway cannot generate or return real Office/PDF artifacts",
    severity: "H2",
    incidentClass: "capability_regression",
    requiredSignals: ["gateway_document_tool_capability", "media_preview_health"],
    requiredEvidence: ["workspaceId", "profile", "toolName", "missingToolCount"],
    requiredClosureReadbacks: ["low_gateway_schema_smoke", "document_tool_invocation_probe", "media_attachment_delivery_probe"],
    remediationGate: "self_check_auto_dispatch",
  }),
  Object.freeze({
    id: "plugin_deploy_auth_or_lane_regression",
    title: "Plugin deployment falls back to plugin-visible sudo/password execution",
    severity: "H2",
    incidentClass: "deployment_regression",
    requiredSignals: ["deploy_lane_liveness", "plugin_deploy_contract_closure"],
    requiredEvidence: ["pluginId", "deployReason", "targetThreadTitle", "taskCardId", "cardKind"],
    requiredClosureReadbacks: ["deploy_lane_card_route", "receipt_shape_rejection", "production_manifest_readback", "return_card_receipt"],
    remediationGate: "self_check_auto_dispatch",
  }),
  Object.freeze({
    id: "plugin_workspace_propagation_regression",
    title: "Plugin proxy write request loses effective workspace",
    severity: "H1",
    incidentClass: "workspace_boundary_regression",
    requiredSignals: ["plugin_proxy_workspace_boundary"],
    requiredEvidence: ["pluginId", "workspaceId", "statusCode", "errorCode"],
    requiredClosureReadbacks: ["workspace_header_or_query_probe", "missing_workspace_400_probe", "target_workspace_write_probe"],
    remediationGate: "self_check_auto_dispatch",
  }),
  Object.freeze({
    id: "task_card_route_or_duplicate_notification",
    title: "Task card routes to stale thread or duplicate notifications repeat",
    severity: "H2",
    incidentClass: "task_card_routing_regression",
    requiredSignals: ["task_card_dispatch", "notification_delivery"],
    requiredEvidence: ["caseId", "actionInboxItemId", "dispatchStatus", "dedupeKey"],
    requiredClosureReadbacks: ["action_inbox_item_readback", "task_card_id_readback", "target_thread_readback", "duplicate_signature_count"],
    remediationGate: "self_check_auto_dispatch",
  }),
  Object.freeze({
    id: "public_upgrade_rehearsal_regression",
    title: "Published public repo cannot rehearse target-side upgrade closure",
    severity: "H2",
    incidentClass: "public_upgrade_regression",
    requiredSignals: ["public_upgrade_rehearsal"],
    requiredEvidence: ["pluginCount", "missingSourceBlockerCount", "cloneActionCount", "deployActionCount", "movieOperatorAuthenticated"],
    requiredClosureReadbacks: ["public_repo_remote_head", "source_rehearsal_execute", "production_rehearsal_execute"],
    remediationGate: "self_check_auto_dispatch",
  }),
]);

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

function boundedMetadata(value = {}, maxKeys = 24) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [key, raw] of Object.entries(value).slice(0, maxKeys)) {
    const safeKey = safeToken(key, "", 80);
    if (!safeKey) continue;
    if (/authorization|cookie|password|secret|token|access.?key|launch.?key|oauth|bearer|private.?key/i.test(safeKey)) {
      out[safeKey] = "[REDACTED]";
    } else if (/path|url|body|content|prompt|completion|payload|screenshot|image/i.test(safeKey)) {
      out[safeKey] = "[REDACTED]";
    } else if (typeof raw === "number" || typeof raw === "boolean") {
      out[safeKey] = raw;
    } else {
      out[safeKey] = cleanString(raw, 160);
    }
  }
  return out;
}

function signalMap(signals = DEFAULT_SIGNALS) {
  const map = new Map();
  for (const signal of signals) map.set(signal.id, signal);
  return map;
}

function normalizedList(value = [], maxItems = 32) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value.slice(0, maxItems)) {
    const token = safeToken(item, "", 120);
    if (token && !out.includes(token)) out.push(token);
  }
  return out;
}

function unionSignalFields(signals, fieldName) {
  const out = [];
  for (const signal of signals) {
    for (const item of normalizedList(signal?.[fieldName] || [], 64)) {
      if (!out.includes(item)) out.push(item);
    }
  }
  return out;
}

function buildSignalMatrix(options = {}) {
  const signals = Array.isArray(options.signals) && options.signals.length ? options.signals : DEFAULT_SIGNALS;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso() : (options.nowIso || new Date().toISOString());
  return {
    ok: true,
    schemaVersion: 1,
    matrixVersion: SIGNAL_MATRIX_VERSION,
    generatedAt: nowIso,
    signalCount: signals.length,
    outputPolicy: "bounded metadata only",
    forbiddenOutput: [
      "raw secrets",
      "cookies",
      "launch tokens",
      "access keys",
      "private payloads",
      "database rows",
      "screenshots with private data",
      "full prompts",
      "long logs",
    ],
    signals: signals.map((signal) => Object.assign({}, signal, {
      id: safeToken(signal.id, "unknown_signal", 100),
      severity: normalizeSeverity(signal.severity, "H2"),
      closureReadbacks: normalizedList(signal.closureReadbacks || [], 32),
      privacy: "metadata_only",
      remediationPolicy: "diagnose_then_ai_ops_remediation_gate",
      fallbackPolicy: "no_silent_fallback_no_restart_as_closure",
    })),
  };
}

function normalizeCoverageRequirement(input = {}) {
  return {
    id: safeToken(input.id, "unknown_requirement", 100),
    title: cleanString(input.title || input.id || "Unknown coverage requirement", 180),
    severity: normalizeSeverity(input.severity || "H2", "H2"),
    incidentClass: safeToken(input.incidentClass || input.incident_class || "unknown", "unknown", 80),
    requiredSignals: normalizedList(input.requiredSignals || input.required_signals || [], 16),
    requiredEvidence: normalizedList(input.requiredEvidence || input.required_evidence || [], 32),
    requiredClosureReadbacks: normalizedList(input.requiredClosureReadbacks || input.required_closure_readbacks || [], 32),
    remediationGate: safeToken(input.remediationGate || input.remediation_gate || "self_check_auto_dispatch", "self_check_auto_dispatch", 80),
  };
}

function evaluateCoverageRequirement(requirement, signalsById) {
  const signals = requirement.requiredSignals.map((id) => signalsById.get(id)).filter(Boolean);
  const presentSignalIds = signals.map((signal) => signal.id);
  const missingSignals = requirement.requiredSignals.filter((id) => !signalsById.has(id));
  const evidence = unionSignalFields(signals, "evidence");
  const closureReadbacks = unionSignalFields(signals, "closureReadbacks");
  const missingEvidence = requirement.requiredEvidence.filter((item) => !evidence.includes(item));
  const missingClosureReadbacks = requirement.requiredClosureReadbacks.filter((item) => !closureReadbacks.includes(item));
  const weakSignals = signals
    .filter((signal) => normalizedList(signal.closureReadbacks || []).length === 0)
    .map((signal) => signal.id);
  let status = "covered";
  if (missingSignals.length) status = "missing_signal";
  else if (missingClosureReadbacks.length) status = "missing_closure_readback";
  else if (missingEvidence.length || weakSignals.length) status = "weak_signal";
  return {
    id: requirement.id,
    title: requirement.title,
    severity: requirement.severity,
    incidentClass: requirement.incidentClass,
    status,
    requiredSignals: requirement.requiredSignals,
    presentSignalIds,
    missingSignals,
    missingEvidence,
    missingClosureReadbacks,
    weakSignals,
    remediationGate: requirement.remediationGate,
  };
}

function buildCoverageAudit(input = {}) {
  const signals = Array.isArray(input.signals) && input.signals.length ? input.signals : DEFAULT_SIGNALS;
  const requirements = Array.isArray(input.requirements) && input.requirements.length
    ? input.requirements.map(normalizeCoverageRequirement)
    : DEFAULT_INCIDENT_COVERAGE_REQUIREMENTS.map(normalizeCoverageRequirement);
  const matrix = buildSignalMatrix({ signals, nowIso: input.nowIso });
  const signalsById = new Map(matrix.signals.map((signal) => [signal.id, signal]));
  const requirementResults = requirements.map((requirement) => evaluateCoverageRequirement(requirement, signalsById));
  const missingSignalCount = requirementResults.reduce((sum, item) => sum + item.missingSignals.length, 0);
  const missingClosureReadbackCount = requirementResults.reduce((sum, item) => sum + item.missingClosureReadbacks.length, 0);
  const weakSignalCount = requirementResults.filter((item) => item.status === "weak_signal").length;
  const coveredCount = requirementResults.filter((item) => item.status === "covered").length;
  return {
    ok: missingSignalCount === 0 && missingClosureReadbackCount === 0 && weakSignalCount === 0,
    schemaVersion: 1,
    matrixVersion: SIGNAL_MATRIX_VERSION,
    generatedAt: matrix.generatedAt,
    requirementCount: requirementResults.length,
    coveredCount,
    missingSignalCount,
    missingClosureReadbackCount,
    weakSignalCount,
    status: missingSignalCount || missingClosureReadbackCount
      ? "coverage_gap"
      : (weakSignalCount ? "weak_signal" : "covered"),
    requirements: requirementResults,
    policy: {
      outputPolicy: "bounded metadata only",
      closureRequired: true,
      noSilentFallback: true,
      selfCheckAutomationMayAutoDispatch: true,
      ownerGateForFeatureOrCapabilityRequests: true,
    },
  };
}


function normalizeObservation(input = {}, signals = DEFAULT_SIGNALS) {
  const map = signalMap(signals);
  const signalId = safeToken(input.signalId || input.signal_id || input.id, "", 100);
  const signal = map.get(signalId);
  const status = safeToken(input.status || input.state || "", "unknown", 80).toLowerCase();
  return {
    signalId,
    signal,
    status,
    ok: ["ok", "healthy", "passed", "pass", "available", "success"].includes(status),
    severity: normalizeSeverity(input.severity || signal?.severity || "H2", signal?.severity || "H2"),
    errorCode: safeToken(input.errorCode || input.error_code || input.code || "", "", 120),
    durationBucket: safeToken(input.durationBucket || input.duration_bucket || "", "", 80),
    count: Number.isFinite(Number(input.count)) ? Number(input.count) : undefined,
    metadata: boundedMetadata(input.metadata || input.context || {}),
    diagnosticEligible: input.diagnosticEligible !== false && input.diagnostic_eligible !== false,
    observedAt: cleanString(input.observedAt || input.observed_at || "", 80),
  };
}

function diagnosticEventForIssue(issue, signal, nowIso) {
  return {
    plugin_id: "home-ai",
    source_surface: "home-ai-self-check",
    diagnostic_type: "self_check_signal_failed",
    category: `self_check_${safeToken(signal.domain || issue.signalId, "unknown", 80)}`,
    severity_hint: issue.severity,
    evidence_confidence: issue.confidence,
    error_code: issue.errorCode || "home_ai_self_check_signal_failed",
    duration_bucket: issue.durationBucket || "",
    build_id: SIGNAL_MATRIX_VERSION,
    route: "/system/self-check",
    counts: {
      failing_signal_count: 1,
      observation_count: issue.count == null ? 1 : issue.count,
    },
    context: {
      signal_id: issue.signalId,
      signal_domain: signal.domain,
      owner: signal.owner,
      target: signal.target,
      matrix_version: SIGNAL_MATRIX_VERSION,
      closure_readbacks: normalizedList(signal.closureReadbacks || [], 16),
    },
    breadcrumbs: [{
      kind: "home_ai_self_check",
      code: issue.errorCode || "signal_failed",
      status: issue.status,
      duration_bucket: issue.durationBucket || "",
      fields: Object.assign({
        signal_hash: safeToken(issue.signalId, "unknown", 80),
        source: signal.source,
      }, issue.metadata || {}),
    }],
    created_at: nowIso,
  };
}

function evaluateObservations(input = {}) {
  const signals = Array.isArray(input.signals) && input.signals.length ? input.signals : DEFAULT_SIGNALS;
  const nowIso = typeof input.nowIso === "function" ? input.nowIso() : (input.nowIso || new Date().toISOString());
  const observations = Array.isArray(input.observations) ? input.observations : [];
  const issues = [];
  const unknownObservations = [];
  const skippedObservations = [];
  for (const raw of observations) {
    const observed = normalizeObservation(raw, signals);
    if (!observed.signal) {
      unknownObservations.push({ signalId: observed.signalId || "unknown", status: observed.status });
      continue;
    }
    if (observed.ok) continue;
    if (!observed.diagnosticEligible && SKIPPED_STATUSES.has(observed.status)) {
      skippedObservations.push({
        signalId: observed.signalId,
        status: observed.status,
        errorCode: observed.errorCode,
        metadata: observed.metadata,
      });
      continue;
    }
    const signal = observed.signal;
    const issue = {
      code: observed.errorCode || "self_check_signal_unhealthy",
      signalId: signal.id,
      title: signal.title,
      domain: signal.domain,
      owner: signal.owner,
      target: signal.target,
      severity: observed.severity,
      status: observed.status,
      errorCode: observed.errorCode,
      durationBucket: observed.durationBucket,
      count: observed.count,
      metadata: observed.metadata,
      confidence: severityRank(observed.severity) >= severityRank("H2") ? 0.82 : 0.62,
      observedAt: observed.observedAt || nowIso,
      expected: signal.expected,
      threshold: signal.threshold,
      checks: signal.checks,
      closureReadbacks: normalizedList(signal.closureReadbacks || [], 16),
    };
    issue.diagnosticEvent = diagnosticEventForIssue(issue, signal, nowIso);
    issues.push(issue);
  }
  return {
    ok: issues.length === 0 && unknownObservations.length === 0,
    schemaVersion: 1,
    matrixVersion: SIGNAL_MATRIX_VERSION,
    generatedAt: nowIso,
    observationCount: observations.length,
    issueCount: issues.length,
    unknownObservationCount: unknownObservations.length,
    skippedObservationCount: skippedObservations.length,
    issues,
    unknownObservations,
    skippedObservations,
    diagnosticEvents: issues.map((issue) => issue.diagnosticEvent),
  };
}

function numberField(value, key) {
  const raw = value && typeof value === "object" ? value[key] : undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function observationForCommandFailure(signalId, code, metadata = {}) {
  return {
    signalId,
    status: "failed",
    errorCode: safeToken(code, "collector_command_failed", 120),
    metadata,
  };
}

function normalizeCollectorContext(value) {
  const text = safeToken(value || "production", "production", 40).toLowerCase();
  if (text === "source" || text === "local" || text === "dev" || text === "manual") return "source";
  if (text === "production" || text === "prod" || text === "scheduled" || text === "cron") return "production";
  return "production";
}

function cronAuditPermissionBlocked(payload = {}) {
  const sourceIssues = Array.isArray(payload.sourceIssues) ? payload.sourceIssues : [];
  if (!sourceIssues.length) return false;
  if (numberField(payload, "jobCount") !== 0 || numberField(payload, "skillCount") !== 0) return false;
  return sourceIssues.every((issue) => {
    const detail = cleanString(issue?.detail || "", 40);
    const code = cleanString(issue?.code || "", 120);
    return (detail === "EACCES" || detail === "EPERM")
      && /cron_(jobs_store|skill_store|runtime_script_installed)_unreadable/.test(code);
  });
}

function observationFromStatusSmoke(payload = {}, options = {}) {
  if (!payload || typeof payload !== "object") {
    return observationForCommandFailure("gateway_profile_health", "production_status_smoke_missing_payload");
  }
  const workerPolicyOk = Boolean(payload.gatewayWorkerPolicyContract?.ok);
  const maxActiveGlobal = Math.max(0, Number(options.maxActiveGlobal ?? 64) || 64);
  const activeGlobal = Number(payload.activeGlobal ?? 0) || 0;
  let errorCode = "";
  if (payload.ok === false) errorCode = payload.error || "production_status_smoke_failed";
  else if (!workerPolicyOk) errorCode = "gateway_worker_policy_unhealthy";
  else if (activeGlobal > maxActiveGlobal) errorCode = "gateway_active_runs_present";
  return {
    signalId: "gateway_profile_health",
    status: errorCode ? "failed" : "ok",
    errorCode,
    count: activeGlobal,
    metadata: {
      activeGlobal,
      clientVersion: payload.clientVersion || "",
      workerCount: payload.gatewayPool?.workerCount ?? "",
      gatewayPoolEnabled: Boolean(payload.gatewayPool?.enabled),
      gatewayPoolMode: payload.gatewayPool?.mode || "",
      workerPolicyOk,
      wrongHeaderDenied: Boolean(payload.wrongHeaderDenied),
      originTitle: payload.originIdentity?.title || "",
    },
  };
}

function observationFromCronAudit(payload = {}, options = {}) {
  if (!payload || typeof payload !== "object") {
    return observationForCommandFailure("automation_cron_health", "automation_cron_audit_missing_payload");
  }
  const sourceIssueCount = numberField(payload, "sourceIssueCount");
  const configIssueCount = numberField(payload, "configIssueCount");
  const statusIssueCount = numberField(payload, "statusIssueCount");
  const collectorContext = normalizeCollectorContext(options.collectorContext);
  const permissionBlocked = cronAuditPermissionBlocked(payload);
  let errorCode = "";
  let status = "";
  let severity = undefined;
  let diagnosticEligible = true;
  if (permissionBlocked && collectorContext === "source") {
    errorCode = "automation_cron_audit_permission_blocked";
    status = "skipped";
    severity = "info";
    diagnosticEligible = false;
  } else if (permissionBlocked) errorCode = "automation_cron_audit_permission_blocked";
  else if (sourceIssueCount) errorCode = "automation_cron_source_issues";
  else if (configIssueCount) errorCode = "automation_cron_config_issues";
  else if (statusIssueCount) errorCode = "automation_cron_recent_status_issues";
  else if (payload.ok === false) errorCode = payload.error || "automation_cron_audit_failed";
  return {
    signalId: "automation_cron_health",
    status: status || (errorCode ? "failed" : "ok"),
    errorCode,
    severity,
    diagnosticEligible,
    count: sourceIssueCount + configIssueCount + statusIssueCount,
    metadata: {
      collectorContext,
      permissionBlocked,
      jobCount: numberField(payload, "jobCount"),
      skillCount: numberField(payload, "skillCount"),
      sourceIssueCount,
      configIssueCount,
      statusIssueCount,
      statusSince: payload.statusSince || "",
    },
  };
}

function observationFromProductionDiagnostics(payload = {}) {
  if (!payload || typeof payload !== "object") {
    return observationForCommandFailure("production_self_diagnostics", "production_self_diagnostics_missing_payload");
  }
  const issueCount = Array.isArray(payload.issues) ? payload.issues.length : numberField(payload, "issueCount");
  const missingEntryCount = Array.isArray(payload.diagnostics)
    ? payload.diagnostics.filter((item) => !item?.scriptExists || !item?.sourceHarnessExists).length
    : 0;
  let errorCode = "";
  if (payload.ok === false) errorCode = payload.error || "production_self_diagnostics_failed";
  else if (issueCount) errorCode = "production_self_diagnostics_issues";
  else if (missingEntryCount) errorCode = "production_self_diagnostics_missing_entries";
  return {
    signalId: "production_self_diagnostics",
    status: errorCode ? "failed" : "ok",
    errorCode,
    count: issueCount + missingEntryCount,
    metadata: {
      diagnosticCount: numberField(payload, "diagnosticCount"),
      issueCount,
      missingEntryCount,
    },
  };
}

function stepOfType(payload = {}, type) {
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  return steps.find((step) => step && step.type === type) || {};
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function observationFromPublicUpgradeRehearsal(payload = {}) {
  if (!payload || typeof payload !== "object") {
    return observationForCommandFailure("public_upgrade_rehearsal", "public_upgrade_rehearsal_missing_payload");
  }
  const preflight = stepOfType(payload, "public-source-preflight");
  const missingPlan = stepOfType(payload, "upgrade-plan-missing-sources-fail-closed");
  const missingValidation = stepOfType(payload, "validate-missing-source-fail-closed");
  const cloneGatePlan = stepOfType(payload, "upgrade-plan-with-operator-clone-gate");
  const cloneGateValidation = stepOfType(payload, "validate-operator-clone-gate-plan");

  const missingSourceBlockerCount = firstNumber(
    missingValidation.detail?.missingSourceBlockerCount,
    missingPlan.summary?.missingSourceBlockerCount,
  );
  const cloneActionCount = firstNumber(
    cloneGateValidation.detail?.cloneActionCount,
    cloneGatePlan.summary?.cloneActionCount,
  );
  const deployActionCount = firstNumber(
    cloneGateValidation.detail?.deployActionCount,
    cloneGatePlan.summary?.deployActionCount,
  );
  const pluginCount = firstNumber(
    cloneGateValidation.detail?.pluginCount,
    cloneGatePlan.summary?.pluginCount,
    missingValidation.detail?.pluginCount,
    missingPlan.summary?.pluginCount,
  );
  const movieOperatorAuthenticated = cloneGateValidation.detail?.movieOperatorAuthenticated === true
    || cloneGatePlan.summary?.movieOperatorAuthenticated === true;
  const closureValidationPresent = cloneGateValidation.detail?.closureValidationPresent === true
    || cloneGatePlan.summary?.closureValidationPresent === true;

  let errorCode = "";
  if (payload.ok === false) errorCode = payload.error || "public_upgrade_rehearsal_failed";
  else if (payload.tempRemoved !== true) errorCode = "public_upgrade_rehearsal_temp_not_removed";
  else if (preflight.summary?.ok !== true && preflight.result?.ok !== true) errorCode = "public_upgrade_rehearsal_preflight_failed";
  else if (missingValidation.ok !== true || missingSourceBlockerCount <= 0) errorCode = "public_upgrade_missing_source_fail_closed_missing";
  else if (cloneGateValidation.ok !== true) errorCode = "public_upgrade_clone_gate_validation_failed";
  else if (cloneActionCount <= 0) errorCode = "public_upgrade_clone_actions_missing";
  else if (deployActionCount <= 0) errorCode = "public_upgrade_deploy_actions_missing";
  else if (!movieOperatorAuthenticated) errorCode = "public_upgrade_movie_operator_auth_missing";
  else if (!closureValidationPresent) errorCode = "public_upgrade_closure_validation_missing";

  return {
    signalId: "public_upgrade_rehearsal",
    status: errorCode ? "failed" : "ok",
    errorCode,
    count: cloneActionCount + deployActionCount,
    metadata: {
      pluginCount,
      missingSourceBlockerCount,
      cloneActionCount,
      deployActionCount,
      movieOperatorAuthenticated,
      closureValidationPresent,
      tempRemoved: payload.tempRemoved === true,
      stepCount: firstNumber(payload.stepCount),
      preflightOk: preflight.summary?.ok === true || preflight.result?.ok === true,
    },
  };
}

function buildProductionObservations(input = {}) {
  const observations = [];
  if (Object.prototype.hasOwnProperty.call(input, "statusSmoke")) {
    observations.push(observationFromStatusSmoke(input.statusSmoke, input));
  }
  if (Object.prototype.hasOwnProperty.call(input, "cronAudit")) {
    observations.push(observationFromCronAudit(input.cronAudit, input));
  }
  if (Object.prototype.hasOwnProperty.call(input, "productionDiagnostics")) {
    observations.push(observationFromProductionDiagnostics(input.productionDiagnostics));
  }
  if (Object.prototype.hasOwnProperty.call(input, "publicUpgradeRehearsal")) {
    observations.push(observationFromPublicUpgradeRehearsal(input.publicUpgradeRehearsal));
  }
  return {
    ok: observations.every((item) => item.status === "ok" || (item.status === "skipped" && item.diagnosticEligible === false)),
    schemaVersion: 1,
    matrixVersion: SIGNAL_MATRIX_VERSION,
    observationCount: observations.length,
    skippedObservationCount: observations.filter((item) => item.status === "skipped" && item.diagnosticEligible === false).length,
    observations,
  };
}

function auditRequestBody(kind, options = {}) {
  const nowIso = typeof options.nowIso === "function" ? options.nowIso() : (options.nowIso || new Date().toISOString());
  const targetTitle = kind === "platform" ? DEFAULT_PLATFORM_AUDIT_THREAD_TITLE : DEFAULT_PLUGIN_AUDIT_THREAD_TITLE;
  const scope = kind === "platform" ? "Home AI host/platform" : "Home AI plugin workspaces";
  return [
    `# Daily Self-Improving Loop Audit Request: ${scope}`,
    "",
    "## Trigger Boundary",
    "",
    "- This request was generated by Home AI Self-Improving Loop v1.",
    "- Scheduled automation is only the trigger. Do not run the deep audit inside CRON or the Home AI app process.",
    `- Target audit thread: \`${targetTitle}\`.`,
    "- Use the dedicated audit-thread governance contract.",
    "- Start from contracts, source, tests, scripts, git metadata, and bounded read-only runtime evidence.",
    "- Do not read Home AI implementation handoffs as audit context.",
    "",
    "## Scope",
    "",
    `- audit_kind: ${kind}`,
    `- workspace: ${DEFAULT_APP_WORKSPACE}`,
    `- matrix_version: ${SIGNAL_MATRIX_VERSION}`,
    `- generated_at: ${nowIso}`,
    "",
    "## Required Audit Focus",
    "",
    kind === "platform"
      ? "- Check Home AI self-check signal coverage for Gateway, MCP/schema, deploy lane, task-card dispatch, plugin proxy, native bridge, notifications, plugin manifest health, and audit-thread liveness."
      : "- Check plugin workspaces for bounded diagnostic reports, manifest/deploy contract adherence, plugin MCP/schema closure, mobile UI bridge compliance, and no silent mitigation/restart-as-closure behavior.",
    "- Report findings first, ordered by severity.",
    "- Send implementation repair cards only to the owning workspace/layer.",
    "- Require return cards for every repair card.",
    "",
    "## Privacy Boundary",
    "",
    "Do not include raw secrets, cookies, launch tokens, OAuth tokens, provider payloads, private records, database rows, screenshots with private data, full prompts, or long logs.",
    "",
    "## Return Card Required",
    "",
    "- Return to the Home AI source thread with completed, blocked, redirected, or partially_completed status.",
    "- Include bounded findings, repair cards sent, closure status, residual risks, and privacy confirmation.",
  ].join("\n");
}

function buildAuditRequestCards(input = {}) {
  const nowIso = typeof input.nowIso === "function" ? input.nowIso() : (input.nowIso || new Date().toISOString());
  const scope = safeToken(input.scope || "all", "all", 40).toLowerCase();
  const includePlatform = scope === "all" || scope === "platform";
  const includePlugin = scope === "all" || scope === "plugin" || scope === "plugins";
  const cards = [];
  if (includePlatform) {
    cards.push({
      auditKind: "platform",
      targetThreadTitle: DEFAULT_PLATFORM_AUDIT_THREAD_TITLE,
      targetWorkspaceCwd: DEFAULT_APP_WORKSPACE,
      title: "Daily Home AI platform self-audit request",
      summary: "Daily self-improving loop platform audit request",
      body: auditRequestBody("platform", { nowIso }),
      workflowMode: "manual",
      reasoningEffort: "xhigh",
      requestId: `home-ai-self-loop:platform:${nowIso.slice(0, 10)}`,
    });
  }
  if (includePlugin) {
    cards.push({
      auditKind: "plugin",
      targetThreadTitle: DEFAULT_PLUGIN_AUDIT_THREAD_TITLE,
      targetWorkspaceCwd: DEFAULT_APP_WORKSPACE,
      title: "Daily plugin workspace self-audit request",
      summary: "Daily self-improving loop plugin workspace audit request",
      body: auditRequestBody("plugin", { nowIso }),
      workflowMode: "manual",
      reasoningEffort: "xhigh",
      requestId: `home-ai-self-loop:plugin:${nowIso.slice(0, 10)}`,
    });
  }
  return {
    ok: true,
    schemaVersion: 1,
    matrixVersion: SIGNAL_MATRIX_VERSION,
    generatedAt: nowIso,
    scope,
    cardCount: cards.length,
    cards,
  };
}

function buildSelfImprovingLoopReport(input = {}) {
  const nowIso = typeof input.nowIso === "function" ? input.nowIso() : (input.nowIso || new Date().toISOString());
  const matrix = buildSignalMatrix({ nowIso });
  const evaluation = evaluateObservations({ observations: input.observations || [], nowIso });
  const auditRequests = input.includeAuditRequests
    ? buildAuditRequestCards({ scope: input.auditScope || "all", nowIso })
    : { ok: true, schemaVersion: 1, matrixVersion: SIGNAL_MATRIX_VERSION, generatedAt: nowIso, scope: "none", cardCount: 0, cards: [] };
  return {
    ok: evaluation.ok && auditRequests.ok,
    schemaVersion: 1,
    matrixVersion: SIGNAL_MATRIX_VERSION,
    generatedAt: nowIso,
    status: evaluation.ok ? "healthy_or_no_observations" : "issues_detected",
    matrix,
    evaluation,
    auditRequests,
    policy: {
      repairMode: "self_check_auto_task_card_or_owner_gated",
      automationMode: "request_card_only",
      noSilentFallback: true,
      noRestartAsClosure: true,
    },
  };
}

module.exports = {
  DEFAULT_APP_WORKSPACE,
  DEFAULT_INCIDENT_COVERAGE_REQUIREMENTS,
  DEFAULT_PLATFORM_AUDIT_THREAD_TITLE,
  DEFAULT_PLUGIN_AUDIT_THREAD_TITLE,
  DEFAULT_SIGNALS,
  SIGNAL_MATRIX_VERSION,
  buildAuditRequestCards,
  buildCoverageAudit,
  buildProductionObservations,
  buildSelfImprovingLoopReport,
  buildSignalMatrix,
  evaluateObservations,
  normalizeObservation,
  observationFromCronAudit,
  observationFromPublicUpgradeRehearsal,
  observationFromProductionDiagnostics,
  observationFromStatusSmoke,
  cronAuditPermissionBlocked,
};
