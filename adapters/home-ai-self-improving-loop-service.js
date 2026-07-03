"use strict";

const { summarizePublicUpgradeDailySmoke } = require("./deploy-upgrade-lane-closure-service");
const {
  observationsFromGatewayCapabilityAvailability,
  observationsFromPluginProxyLatency,
  observationsFromUiRuntimeHealth,
} = require("./self-improving-runtime-health-observation-service");

const DEFAULT_APP_WORKSPACE = "/Users/example/path";
const DEFAULT_PLATFORM_AUDIT_THREAD_TITLE = "Home AI Platform Audit";
const DEFAULT_PLUGIN_AUDIT_THREAD_TITLE = "Plugin Workspace Audit";

const SEVERITY_RANK = Object.freeze({ info: 0, H4: 1, H3: 2, H2: 3, H1: 4 });
const SKIPPED_STATUSES = new Set(["skipped", "not_applicable", "blocked_by_context"]);

const SIGNAL_MATRIX_VERSION = "20260701-self-improving-loop-v13";

const DEFAULT_SIGNALS = Object.freeze([
  Object.freeze({
    id: "system_resource_health",
    title: "Host system resource and resident service health",
    domain: "system_resource",
    owner: "home-ai-platform",
    severity: "H2",
    source: "owner-system-console/system-resource-status-service",
    expected: "CPU, memory, disk, uptime, and bounded resident launchd services remain within configured thresholds and visible through Owner Console",
    threshold: "no degraded host resource state, repeated warning pressure, missing resource snapshot, or stopped critical resident service",
    evidence: [
      "overallStatus",
      "cpuOverallPercent",
      "cpuTopProcessLabels",
      "cpuTopProcessTotalPercent",
      "memoryPercentUsed",
      "memoryPercentSource",
      "memoryResidentPercentUsed",
      "memoryPressureFreePercent",
      "diskMaxPercentUsed",
      "serviceIssueCount",
      "failingSignalCount",
    ],
    closureReadbacks: [
      "system_resource_status_snapshot",
      "owner_system_console_api_readback",
      "launchd_state_readback",
      "post_fix_resource_probe",
    ],
    target: "Home AI",
    checks: [
      "node tests/system-resource-status-service.test.js",
      "node tests/owner-system-console-service.test.js",
      "node tests/home-ai-self-improving-loop-service.test.js",
    ],
  }),
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
    title: "Home AI Deploy lane pool liveness",
    domain: "deployment",
    owner: "home-ai-platform",
    severity: "H2",
    source: "codex-thread-task-card-service",
    expected: "at least one configured Home AI deploy lane is discoverable, live, and non-terminal",
    threshold: "deploy lane pool must not be missing; configured lane titles must not be completed, archived, deleted, duplicated, or ambiguous",
    evidence: ["threadTitle", "threadStatus", "targetWorkspaceCwd", "laneTitle", "pluginId"],
    closureReadbacks: ["deploy_lane_thread_readback", "task_card_route_readback"],
    target: "Home AI deploy lane pool",
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
    id: "composer_runtime_feedback",
    title: "Composer terminal receipt and viewport feedback health",
    domain: "composer_runtime",
    owner: "home-ai-static-client",
    severity: "H2",
    source: "app-composer-self-check-ui",
    expected: "terminal assistant messages settle with visible receipt metadata, no duplicate local/server user echo, no stale active run, and no receipt refresh forcing scroll while user protection is active",
    threshold: "no repeated metadata-only composer self-check report for missing terminal receipt, duplicate pending echo, stuck terminal active run, or protected-scroll bypass",
    evidence: ["threadId", "messageId", "runId", "errorCode", "duplicateCount", "activeRunCount", "userScrollProtected"],
    closureReadbacks: [
      "composer_self_check_event",
      "terminal_receipt_refresh_probe",
      "pending_echo_dedup_probe",
      "scroll_protection_probe",
      "production_static_version_readback",
    ],
    target: "Home AI",
    checks: [
      "node tests/composer-self-check-ui.test.js",
      "node tests/composer-message-invalidation-ui.test.js",
      "node tests/composer-send-pending-feedback.test.js",
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
    source: "Home AI deploy lane pool / deploy-macos-production",
    expected: "routine plugin deploys route to the configured Home AI deploy lane pool and close with production readback instead of plugin-visible sudo/password retry loops or receipt-shaped request cards",
    threshold: "no plugin thread needs password-file access, direct production execute, or a terminal receipt masquerading as a routine deployment request",
    evidence: ["pluginId", "deployReason", "targetThreadTitle", "taskCardId", "cardKind", "productionVersion"],
    closureReadbacks: ["deploy_lane_card_route", "receipt_shape_rejection", "production_manifest_readback", "launchd_state_readback", "return_card_receipt"],
    target: "Home AI deploy lane pool",
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
    id: "plugin_action_metadata_health",
    title: "Plugin message action metadata and deterministic bridge health",
    domain: "plugin_action_metadata",
    owner: "home-ai-plugin-host",
    severity: "H2",
    source: "gateway-output-metadata-attachment/thread-view-service/plugin-conversation-action-bridge",
    expected: "Gateway tool outputs that contain executable plugin intents are attached to message metadata, projected to the renderer, and executed through deterministic action bridge calls without a model turn",
    threshold: "no actionable plugin intent is dropped, renderer-filtered, or blocked by missing bridge state when schema and principal/workspace checks pass",
    evidence: ["pluginId", "actionKind", "missingMetadataCount", "rendererFilteredCount", "bridgeUnavailableCount"],
    closureReadbacks: [
      "gateway_output_metadata_attachment",
      "thread_view_plugin_action_projection",
      "message_action_render_probe",
      "action_bridge_execution_probe",
    ],
    target: "Home AI",
    checks: [
      "node tests/thread-view-service.test.js",
      "node tests/plugin-conversation-action-bridge-service.test.js",
      "node tests/plugin-conversation-action-api-routes.test.js",
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
    title: "Public repository upgrade daily smoke closure",
    domain: "public_upgrade",
    owner: "home-ai-deployment",
    severity: "H2",
    source: "homeai-public-upgrade-rehearsal",
    expected: "published public repo can be cloned and target-side upgrade planning proves missing-source fail-closed, explicit clone/deploy closure, Hermes Agent runtime repair gating, source adoption gating, and Provider/closure validation",
    threshold: "public rehearsal must pass source preflight, fail closed without clone/adoption/runtime gates, and produce clone/deploy/runtime-repair/source-adoption/closure-validation actions with explicit operator gates",
    evidence: [
      "pluginCount",
      "missingSourceBlockerCount",
      "cloneActionCount",
      "deployActionCount",
      "movieOperatorAuthenticated",
      "closureValidationPresent",
      "hermesRuntimeRepairRequired",
      "hermesRuntimeRepairGateOk",
      "sourceAdoptionRequired",
      "sourceAdoptionGateOk",
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
      "node tests/deploy-upgrade-lane-closure-service.test.js",
      "node tests/deploy-upgrade-lane-closure-smoke.test.js",
      "node scripts/deploy-upgrade-lane-closure-smoke.js --json",
    ],
  }),
  Object.freeze({
    id: "install_upgrade_canary",
    title: "Install and public upgrade canary closure",
    domain: "install_upgrade",
    owner: "home-ai-deployment",
    severity: "H2",
    source: "homeai-install-upgrade-canary",
    expected: "source-safe install and upgrade closure phases pass as one bounded canary report",
    threshold: "no required fresh-install, public-upgrade, plugin-provisioning, or Runtime SLO canary phase fails",
    evidence: [
      "phaseCount",
      "passedPhaseCount",
      "failedPhaseCount",
      "freshInstallPassed",
      "publicUpgradePassed",
      "pluginProvisioningPassed",
      "selfImprovingLoopPassed",
      "closureStatus",
      "cleanTargetCanaryStatus",
    ],
    closureReadbacks: [
      "install_upgrade_canary_report",
      "fresh_install_rehearsal_summary",
      "deploy_upgrade_lane_closure_summary",
      "runtime_slo_audit_summary",
      "clean_target_lane_readback_when_available",
    ],
    target: "Home AI",
    checks: [
      "node tests/home-ai-install-upgrade-canary-service.test.js",
      "node tests/homeai-install-upgrade-canary-script.test.js",
      "node scripts/homeai-install-upgrade-canary.js --json",
    ],
  }),
  Object.freeze({
    id: "runtime_slo_coverage",
    title: "3A Runtime SLO coverage and repair-routing health",
    domain: "runtime_slo",
    owner: "home-ai-platform",
    severity: "H2",
    source: "homeai-self-improving-loop runtime-slo-audit",
    expected: "the maintained Runtime SLO model covers every self-check signal with owner, bounded evidence, closure readbacks, focused checks, and repair-card routing",
    threshold: "no unmapped signal, duplicate signal, empty dimension, missing owner/evidence/readback/check, or missing H1/H2 repair routing",
    evidence: ["modelVersion", "matrixVersion", "signalCount", "sloCount", "issueCount", "unmappedSignalCount", "duplicateSignalCount"],
    closureReadbacks: [
      "runtime_slo_audit_summary",
      "signal_matrix_readback",
      "diagnostic_event_probe",
      "focused_slo_tests",
    ],
    target: "Home AI",
    checks: [
      "node tests/home-ai-runtime-slo-service.test.js",
      "node tests/home-ai-self-improving-loop-service.test.js",
      "node tests/homeai-self-improving-loop-script.test.js",
      "node scripts/homeai-self-improving-loop.js --runtime-slo-audit --json",
    ],
  }),
]);

const DEFAULT_INCIDENT_COVERAGE_REQUIREMENTS = Object.freeze([
  Object.freeze({
    id: "host_resource_pressure_regression",
    title: "Host CPU, memory, disk, or resident service pressure becomes user-visible",
    severity: "H1",
    incidentClass: "availability_regression",
    requiredSignals: ["system_resource_health"],
    requiredEvidence: ["overallStatus", "cpuOverallPercent", "memoryPercentUsed", "diskMaxPercentUsed", "serviceIssueCount"],
    requiredClosureReadbacks: ["system_resource_status_snapshot", "owner_system_console_api_readback", "post_fix_resource_probe"],
    remediationGate: "self_check_auto_dispatch",
  }),
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
  Object.freeze({
    id: "composer_runtime_feedback_regression",
    title: "Composer terminal receipt, pending echo, or scroll protection feedback regressed",
    severity: "H2",
    incidentClass: "composer_runtime_regression",
    requiredSignals: ["composer_runtime_feedback"],
    requiredEvidence: ["threadId", "messageId", "errorCode"],
    requiredClosureReadbacks: ["composer_self_check_event", "terminal_receipt_refresh_probe", "scroll_protection_probe"],
    remediationGate: "self_check_auto_dispatch",
  }),
  Object.freeze({
    id: "plugin_action_metadata_regression",
    title: "Plugin deterministic action metadata is dropped before rendering",
    severity: "H2",
    incidentClass: "plugin_action_metadata_regression",
    requiredSignals: ["plugin_action_metadata_health"],
    requiredEvidence: ["pluginId", "actionKind", "missingMetadataCount"],
    requiredClosureReadbacks: ["gateway_output_metadata_attachment", "thread_view_plugin_action_projection", "action_bridge_execution_probe"],
    remediationGate: "self_check_auto_dispatch",
  }),
  Object.freeze({
    id: "runtime_slo_coverage_regression",
    title: "Runtime SLO model no longer covers maintained self-check signals",
    severity: "H2",
    incidentClass: "self_check_governance_regression",
    requiredSignals: ["runtime_slo_coverage"],
    requiredEvidence: ["modelVersion", "matrixVersion", "issueCount", "unmappedSignalCount", "duplicateSignalCount"],
    requiredClosureReadbacks: ["runtime_slo_audit_summary", "signal_matrix_readback", "diagnostic_event_probe"],
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
    } else if (/path|url|body|content|message|prompt|completion|transcript|text|input|value|payload|screenshot|image/i.test(safeKey)) {
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
  const collectorContext = normalizeCollectorContext(options.collectorContext);
  if (payload.skipped === true) {
    const errorCode = cleanString(payload.reason || payload.error || "production_status_smoke_skipped", 120);
    const sourceSkip = collectorContext === "source";
    return {
      signalId: "gateway_profile_health",
      status: sourceSkip ? "skipped" : "failed",
      errorCode,
      diagnosticEligible: !sourceSkip,
      count: 0,
      metadata: {
        collectorContext,
        skipped: true,
        reason: safeToken(errorCode, "production_status_smoke_skipped", 120),
      },
    };
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
      collectorContext,
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
  if (payload.skipped === true) {
    const reason = cleanString(payload.reason || payload.error || "public_upgrade_rehearsal_skipped", 120);
    return {
      signalId: "public_upgrade_rehearsal",
      status: "skipped",
      errorCode: reason,
      diagnosticEligible: false,
      count: 0,
      metadata: {
        skipped: true,
        reason: safeToken(reason, "public_upgrade_rehearsal_skipped", 120),
      },
    };
  }
  const dailySmoke = summarizePublicUpgradeDailySmoke(payload);
  const errorCode = dailySmoke.error || "";

  return {
    signalId: "public_upgrade_rehearsal",
    status: errorCode ? "failed" : "ok",
    errorCode,
    count: firstNumber(dailySmoke.metadata?.cloneActionCount) + firstNumber(dailySmoke.metadata?.deployActionCount),
    metadata: dailySmoke.metadata || {},
  };
}

function installUpgradeCanaryServiceUserBoundary(payload = {}) {
  if (cleanString(payload.error || "", 160) === "production_rehearsal_requires_service_user") {
    return true;
  }
  const issues = Array.isArray(payload.issues) ? payload.issues : [];
  return issues.some((issue) => {
    const code = cleanString(issue?.code || "", 120);
    const error = cleanString(issue?.error || "", 160);
    const phaseId = cleanString(issue?.phaseId || "", 160);
    return phaseId === "macos_fresh_install_rehearsal"
      && (error === "production_rehearsal_requires_service_user"
        || code === "production_rehearsal_requires_service_user");
  });
}

function observationFromInstallUpgradeCanary(payload = {}, options = {}) {
  if (!payload || typeof payload !== "object") {
    return observationForCommandFailure("install_upgrade_canary", "install_upgrade_canary_missing_payload");
  }
  const issues = Array.isArray(payload.issues) ? payload.issues : [];
  const firstIssue = issues[0] || {};
  const failedPhaseCount = firstNumber(payload.failedPhaseCount);
  const categories = payload.categories && typeof payload.categories === "object" ? payload.categories : {};
  const collectorContext = normalizeCollectorContext(options.collectorContext);
  const serviceUserBoundary = installUpgradeCanaryServiceUserBoundary(payload);
  const planOnly = cleanString(payload.mode || "", 40) === "plan";
  const cleanTargetCanary = payload.cleanTargetCanary && typeof payload.cleanTargetCanary === "object"
    ? payload.cleanTargetCanary
    : {};
  const cleanTargetEnvironment = payload.cleanTargetEnvironment && typeof payload.cleanTargetEnvironment === "object"
    ? payload.cleanTargetEnvironment
    : {};
  const cleanTargetEnvironmentIssues = Array.isArray(cleanTargetEnvironment.issueCodes)
    ? cleanTargetEnvironment.issueCodes.map((item) => safeToken(item, "", 120)).filter(Boolean).slice(0, 12)
    : [];
  const cleanTargetCanaryStatus = cleanString(cleanTargetCanary.status || "", 40);
  const cleanTargetEnvironmentStatus = cleanString(cleanTargetEnvironment.status || "", 40);
  const cleanTargetClosed = cleanTargetCanaryStatus === "passed" && cleanTargetCanary.noCompletionClaim === false;
  if (payload.skipped === true || planOnly || (serviceUserBoundary && collectorContext === "source")) {
    const errorCode = cleanString(
      payload.reason
        || payload.error
        || (planOnly
          ? "install_upgrade_canary_plan_only"
          : (serviceUserBoundary ? "production_rehearsal_requires_service_user" : "install_upgrade_canary_skipped")),
      120,
    );
    const explicitSkip = payload.skipped === true || planOnly;
    return {
      signalId: "install_upgrade_canary",
      status: explicitSkip || collectorContext === "source" ? "skipped" : "failed",
      errorCode,
      diagnosticEligible: !explicitSkip && collectorContext !== "source",
      count: firstNumber(payload.phaseCount),
      metadata: {
        collectorContext,
        skipped: explicitSkip || collectorContext === "source",
        reason: safeToken(errorCode, "install_upgrade_canary_skipped", 120),
        serviceUserBoundary,
        planOnly,
        mode: cleanString(payload.mode || "", 40),
        phaseCount: firstNumber(payload.phaseCount),
        passedPhaseCount: firstNumber(payload.passedPhaseCount),
        failedPhaseCount,
        freshInstallPassed: categories.fresh_install?.ok === true,
        publicUpgradePassed: categories.public_upgrade?.ok === true,
        pluginProvisioningPassed: categories.plugin_provisioning?.ok === true,
        selfImprovingLoopPassed: categories.self_improving_loop?.ok === true,
        cleanTargetCanaryStatus,
        cleanTargetEnvironmentStatus,
        cleanTargetEnvironmentIssueCodes: cleanTargetEnvironmentIssues,
        firstFailedPhase: cleanString(firstIssue.phaseId || "", 120),
      },
    };
  }
  let errorCode = "";
  if (payload.ok !== true) errorCode = cleanString(firstIssue.code || payload.error || "install_upgrade_canary_failed", 120);
  else if (failedPhaseCount > 0) errorCode = "install_upgrade_canary_phase_failed";

  if (!errorCode && !cleanTargetClosed) {
    const reason = cleanTargetEnvironmentStatus === "blocked"
      ? "clean_target_environment_blocked"
      : "clean_target_canary_not_closed";
    return {
      signalId: "install_upgrade_canary",
      status: "skipped",
      errorCode: reason,
      diagnosticEligible: false,
      count: firstNumber(payload.phaseCount),
      metadata: {
        collectorContext,
        skipped: true,
        reason,
        mode: cleanString(payload.mode || "", 40),
        phaseCount: firstNumber(payload.phaseCount),
        passedPhaseCount: firstNumber(payload.passedPhaseCount),
        failedPhaseCount,
        freshInstallPassed: categories.fresh_install?.ok === true,
        publicUpgradePassed: categories.public_upgrade?.ok === true,
        pluginProvisioningPassed: categories.plugin_provisioning?.ok === true,
        selfImprovingLoopPassed: categories.self_improving_loop?.ok === true,
        cleanTargetCanaryStatus,
        cleanTargetEnvironmentStatus,
        cleanTargetEnvironmentIssueCodes: cleanTargetEnvironmentIssues,
        firstFailedPhase: cleanString(firstIssue.phaseId || "", 120),
      },
    };
  }

  return {
    signalId: "install_upgrade_canary",
    status: errorCode ? "failed" : "ok",
    errorCode,
    count: firstNumber(payload.phaseCount),
    metadata: {
      collectorContext,
      phaseCount: firstNumber(payload.phaseCount),
      passedPhaseCount: firstNumber(payload.passedPhaseCount),
      failedPhaseCount,
      freshInstallPassed: categories.fresh_install?.ok === true,
      publicUpgradePassed: categories.public_upgrade?.ok === true,
      pluginProvisioningPassed: categories.plugin_provisioning?.ok === true,
      selfImprovingLoopPassed: categories.self_improving_loop?.ok === true,
      cleanTargetCanaryStatus,
      cleanTargetEnvironmentStatus,
      cleanTargetEnvironmentIssueCodes: cleanTargetEnvironmentIssues,
      firstFailedPhase: cleanString(firstIssue.phaseId || "", 120),
    },
  };
}

function observationFromRuntimeSloAudit(payload = {}) {
  if (!payload || typeof payload !== "object") {
    return observationForCommandFailure("runtime_slo_coverage", "runtime_slo_audit_missing_payload");
  }
  const issueCount = firstNumber(payload.issueCount);
  const unmappedSignalCount = firstNumber(payload.unmappedSignalCount);
  const duplicateSignalCount = firstNumber(payload.duplicateSignalCount);
  let errorCode = "";
  if (payload.ok !== true) errorCode = cleanString(payload.error || "runtime_slo_audit_failed", 120);
  else if (issueCount > 0) errorCode = "runtime_slo_audit_issues";
  else if (unmappedSignalCount > 0) errorCode = "runtime_slo_unmapped_signals";
  else if (duplicateSignalCount > 0) errorCode = "runtime_slo_duplicate_signals";

  return {
    signalId: "runtime_slo_coverage",
    status: errorCode ? "failed" : "ok",
    errorCode,
    count: issueCount + unmappedSignalCount + duplicateSignalCount,
    metadata: {
      modelVersion: payload.modelVersion || "",
      matrixVersion: payload.matrixVersion || "",
      dimensionCount: firstNumber(payload.dimensionCount),
      signalCount: firstNumber(payload.signalCount),
      sloCount: firstNumber(payload.sloCount),
      issueCount,
      unmappedSignalCount,
      duplicateSignalCount,
      status: payload.status || "",
    },
  };
}

function summarizeSystemResourceSignals(payload = {}) {
  const signals = Array.isArray(payload.signals) ? payload.signals : [];
  const failingSignals = signals.filter((signal) => {
    const status = safeToken(signal?.status || "", "", 40).toLowerCase();
    return status && status !== "ok";
  });
  const warningSignals = failingSignals.filter((signal) => safeToken(signal?.status || "", "", 40).toLowerCase() === "warning");
  const degradedSignals = failingSignals.filter((signal) => safeToken(signal?.status || "", "", 40).toLowerCase() === "degraded");
  const unknownSignals = failingSignals.filter((signal) => safeToken(signal?.status || "", "", 40).toLowerCase() === "unknown");
  return {
    failingSignals,
    warningSignals,
    degradedSignals,
    unknownSignals,
    failingSignalIds: normalizedList(failingSignals.map((signal) => signal.signalId || signal.signal_id || signal.id), 12),
    failingCategories: normalizedList(failingSignals.map((signal) => signal.category), 12),
  };
}

function launchdIssueCounts(payload = {}) {
  const services = Array.isArray(payload.launchd?.services)
    ? payload.launchd.services
    : (Array.isArray(payload.services) ? payload.services : []);
  let stopped = 0;
  let unknown = 0;
  for (const service of services) {
    const status = safeToken(service?.status || service?.state || "", "", 40).toLowerCase();
    if (status === "stopped" || status === "warning" || status === "degraded") stopped += 1;
    else if (!status || status === "unknown") unknown += 1;
  }
  return {
    serviceCount: services.length,
    stoppedServiceCount: stopped,
    unknownServiceCount: unknown,
    serviceIssueCount: stopped + unknown,
  };
}

function observationFromSystemResourceStatus(payload = {}, options = {}) {
  if (!payload || typeof payload !== "object") {
    return observationForCommandFailure("system_resource_health", "system_resource_status_missing_payload");
  }
  const overallStatus = safeToken(payload.overallStatus || payload.status || "", "unknown", 40).toLowerCase();
  const collectorContext = normalizeCollectorContext(options.collectorContext);
  const {
    failingSignals,
    warningSignals,
    degradedSignals,
    unknownSignals,
    failingSignalIds,
    failingCategories,
  } = summarizeSystemResourceSignals(payload);
  const serviceCounts = launchdIssueCounts(payload);
  let errorCode = "";
  if (payload.ok === false && overallStatus === "degraded") errorCode = "system_resource_degraded";
  else if (payload.ok === false) errorCode = cleanString(payload.error || "system_resource_status_failed", 120);
  else if (overallStatus === "degraded") errorCode = "system_resource_degraded";
  else if (overallStatus === "unknown") errorCode = "system_resource_unknown";
  else if (degradedSignals.length) errorCode = "system_resource_degraded";
  else if (unknownSignals.length) errorCode = "system_resource_unknown";
  const sourceUnknownOnly = collectorContext === "source"
    && errorCode === "system_resource_unknown"
    && !["warning", "degraded"].includes(overallStatus);

  return {
    signalId: "system_resource_health",
    status: sourceUnknownOnly ? "skipped" : (errorCode ? "failed" : "ok"),
    errorCode,
    severity: overallStatus === "degraded" ? "H1" : undefined,
    diagnosticEligible: !sourceUnknownOnly,
    count: failingSignals.length || serviceCounts.serviceIssueCount,
    metadata: {
      collectorContext,
      overallStatus,
      cpuOverallPercent: firstNumber(payload.cpu?.overallPercent),
      cpuSustainedPercent: firstNumber(payload.cpu?.sustainedPercent),
      cpuCoreCount: firstNumber(payload.cpu?.coreCount),
      cpuAttributionAvailable: Boolean(payload.cpu?.processAttribution?.available),
      cpuTopProcessCount: firstNumber(payload.cpu?.processAttribution?.topProcessCount),
      cpuTopProcessTotalPercent: firstNumber(payload.cpu?.processAttribution?.topProcessTotalPercent),
      cpuTopProcessLabels: normalizedList(
        (Array.isArray(payload.cpu?.processAttribution?.topProcesses)
          ? payload.cpu.processAttribution.topProcesses
          : []
        ).map((processRow) => processRow?.label),
        8,
      ).join(","),
      memoryPercentUsed: firstNumber(payload.memory?.percentUsed),
      memoryPercentSource: safeToken(payload.memory?.percentSource || "", "unknown", 80),
      memoryResidentPercentUsed: firstNumber(payload.memory?.residentPercentUsed),
      memoryPressureFreePercent: firstNumber(payload.memory?.pressure?.freePercent),
      memoryPressureAvailable: Boolean(payload.memory?.pressure?.available),
      memoryPressureStatus: safeToken(payload.memory?.pressure?.status || "", "unknown", 40),
      swapPercentUsed: firstNumber(payload.memory?.swap?.percentUsed),
      swapAvailable: Boolean(payload.memory?.swap?.available),
      diskMaxPercentUsed: firstNumber(payload.disk?.maxPercentUsed),
      diskMinAvailableGb: Math.round((firstNumber(payload.disk?.availableBytes) / (1024 ** 3)) * 10) / 10,
      serviceCount: serviceCounts.serviceCount,
      stoppedServiceCount: serviceCounts.stoppedServiceCount,
      unknownServiceCount: serviceCounts.unknownServiceCount,
      serviceIssueCount: serviceCounts.serviceIssueCount,
      failingSignalCount: failingSignals.length,
      warningSignalCount: warningSignals.length,
      degradedSignalCount: degradedSignals.length,
      unknownSignalCount: unknownSignals.length,
      failingSignalIds: failingSignalIds.join(","),
      failingCategories: failingCategories.join(","),
    },
  };
}

function failedPluginActionStages(payload = {}) {
  const explicit = Array.isArray(payload.failedStages) ? payload.failedStages : [];
  const fromStages = Array.isArray(payload.stages)
    ? payload.stages.filter((stage) => stage?.ok === false).map((stage) => stage.id)
    : [];
  const fromFamilies = Array.isArray(payload.actionFamilies)
    ? payload.actionFamilies.flatMap((family) => (
      Array.isArray(family.failedStages)
        ? family.failedStages.map((stage) => `${family.familyId || family.actionKind || "family"}:${stage}`)
        : []
    ))
    : [];
  return normalizedList([...explicit, ...fromStages, ...fromFamilies], 24);
}

function observationFromPluginActionMetadataClosure(payload = {}) {
  if (!payload || typeof payload !== "object") {
    return observationForCommandFailure("plugin_action_metadata_health", "plugin_action_metadata_closure_missing_payload");
  }
  const stages = failedPluginActionStages(payload);
  const failedStageCount = firstNumber(payload.failedStageCount, stages.length);
  const metadataMissingCount = stages.some((stage) => (
    stage.endsWith("gateway_output_metadata_attachment")
      || stage.endsWith("message_metadata_persistence")
      || stage.endsWith("gateway_output_action_comment_parse")
  )) ? 1 : 0;
  const rendererFilteredCount = stages.some((stage) => (
    stage.endsWith("thread_view_plugin_action_projection")
      || stage.endsWith("plugin_action_projection_diagnostics")
      || stage.endsWith("plugin_route_action_projection")
      || stage.endsWith("route_snapshot_readback")
  )) ? 1 : 0;
  const bridgeUnavailableCount = stages.some((stage) => (
    stage.endsWith("action_bridge_execution_probe")
      || stage.endsWith("task_card_dispatch_bridge_probe")
      || stage.endsWith("action_inbox_projection")
      || stage.endsWith("owner_push_dedupe_boundary")
      || stage.endsWith("no_model_run_action_boundary")
  )) ? 1 : 0;
  let errorCode = "";
  if (payload.ok === false && bridgeUnavailableCount) errorCode = "plugin_action_bridge_unavailable";
  else if (payload.ok === false && rendererFilteredCount) errorCode = "plugin_action_renderer_filtered";
  else if (payload.ok === false && metadataMissingCount) errorCode = "plugin_action_metadata_missing";
  else if (payload.ok === false) errorCode = cleanString(payload.error || "plugin_action_metadata_closure_failed", 120);
  else if (failedStageCount > 0) errorCode = "plugin_action_metadata_closure_failed";

  return {
    signalId: "plugin_action_metadata_health",
    status: errorCode ? "failed" : "ok",
    errorCode,
    count: failedStageCount,
    metadata: {
      pluginId: safeToken(payload.reference?.pluginId || payload.pluginId || (Array.isArray(payload.actionFamilies) ? "multiple" : "unknown"), "unknown", 80),
      actionKind: safeToken(payload.reference?.actionKind || payload.actionKind || (Array.isArray(payload.actionFamilies) ? "multiple" : "unknown"), "unknown", 80),
      missingMetadataCount: metadataMissingCount,
      rendererFilteredCount,
      bridgeUnavailableCount,
      actionFamilyCount: firstNumber(payload.actionFamilyCount, payload.familyCount),
      generalizedActionFamilyCount: firstNumber(payload.generalizedActionFamilyCount),
      actionClassCount: firstNumber(payload.actionClassCount),
      stageCount: firstNumber(payload.stageCount),
      passedStageCount: firstNumber(payload.passedStageCount),
      failedStageCount,
      failedStages: stages.join(","),
      modelVersion: cleanString(payload.modelVersion || "", 120),
    },
  };
}

function observationFromMcpSchemaClosure(payload = {}) {
  if (!payload || typeof payload !== "object") {
    return observationForCommandFailure("mcp_schema_closure", "mcp_schema_closure_missing_payload");
  }
  const errorCode = payload.ok === false
    ? cleanString(payload.error || payload.code || "mcp_schema_closure_failed", 120)
    : "";
  const gatewayTools = normalizedList(payload.source?.gatewayTools || payload.gatewayTools || [], 32);
  return {
    signalId: "mcp_schema_closure",
    status: errorCode ? "failed" : "ok",
    errorCode,
    count: firstNumber(payload.missingToolCount, payload.missingPropertyCount),
    metadata: {
      toolset: safeToken(payload.toolset || "", "", 80),
      epoch: safeToken(payload.epoch || payload.source?.epoch || "", "", 120),
      sourceGatewayToolCount: gatewayTools.length,
      serviceSkipped: payload.service?.skipped === true,
      serviceReason: safeToken(payload.service?.reason || "", "", 120),
      gatewaySkipped: payload.gateway?.skipped === true,
      gatewayReason: safeToken(payload.gateway?.reason || "", "", 120),
      schemaPropertyMatchCount: Array.isArray(payload.schemaPropertyMatches) ? payload.schemaPropertyMatches.length : 0,
    },
  };
}

function observationFromDeployLaneDiscovery(payload = {}, options = {}) {
  if (!payload || typeof payload !== "object") {
    return observationForCommandFailure("deploy_lane_liveness", "deploy_lane_discovery_missing_payload");
  }
  const collectorContext = normalizeCollectorContext(options.collectorContext);
  const skipped = payload.skipped === true;
  const laneCount = firstNumber(payload.deployLaneCount, Array.isArray(payload.deployLanes) ? payload.deployLanes.length : 0);
  let errorCode = "";
  let diagnosticEligible = true;
  let status = "";
  if (skipped && collectorContext === "source") {
    status = "skipped";
    diagnosticEligible = false;
    errorCode = cleanString(payload.reason || payload.error || "deploy_lane_discovery_skipped", 120);
  } else if (payload.ok === false) errorCode = cleanString(payload.error || payload.code || "deploy_lane_discovery_failed", 120);
  else if (laneCount < 1) errorCode = "deploy_lane_not_found";
  return {
    signalId: "deploy_lane_liveness",
    status: status || (errorCode ? "failed" : "ok"),
    errorCode,
    diagnosticEligible,
    count: laneCount,
    metadata: {
      collectorContext,
      deployLaneCount: laneCount,
      assignedRouteCount: firstNumber(payload.assignedRouteCount, Array.isArray(payload.assignedRoutes) ? payload.assignedRoutes.length : 0),
      skipped,
      reason: safeToken(payload.reason || "", "", 120),
    },
  };
}

function observationFromTaskCardDispatchState(payload = {}, options = {}) {
  if (!payload || typeof payload !== "object") {
    return observationForCommandFailure("task_card_dispatch", "task_card_dispatch_state_missing_payload");
  }
  const collectorContext = normalizeCollectorContext(options.collectorContext);
  const skipped = payload.skipped === true;
  let errorCode = "";
  let status = "";
  let diagnosticEligible = true;
  if (skipped && collectorContext === "source") {
    status = "skipped";
    diagnosticEligible = false;
    errorCode = cleanString(payload.reason || payload.error || "task_card_dispatch_probe_skipped", 120);
  } else if (payload.ok === false) errorCode = cleanString(payload.error || payload.code || "task_card_dispatch_state_failed", 120);
  else if (payload.sourceThreadRequired === true && payload.sourceThreadVisible === false) errorCode = "task_card_source_thread_not_visible";
  else if (payload.targetThreadVisible === false) errorCode = "task_card_target_thread_not_visible";
  return {
    signalId: "task_card_dispatch",
    status: status || (errorCode ? "failed" : "ok"),
    errorCode,
    diagnosticEligible,
    count: firstNumber(payload.routeCount, payload.checkedRouteCount),
    metadata: {
      collectorContext,
      dryRunOnly: payload.dryRunOnly !== false,
      sourceThreadVisible: payload.sourceThreadVisible === true,
      sourceThreadRequired: payload.sourceThreadRequired === true,
      targetThreadVisible: payload.targetThreadVisible === true,
      checkedRouteCount: firstNumber(payload.checkedRouteCount, payload.routeCount),
      skipped,
      reason: safeToken(payload.reason || "", "", 120),
    },
  };
}

function observationFromAuditThreadDiscovery(payload = {}, options = {}) {
  if (!payload || typeof payload !== "object") {
    return observationForCommandFailure("audit_thread_liveness", "audit_thread_discovery_missing_payload");
  }
  const collectorContext = normalizeCollectorContext(options.collectorContext);
  const skipped = payload.skipped === true;
  const platformVisible = payload.platformAuditVisible === true;
  const pluginVisible = payload.pluginAuditVisible === true;
  let errorCode = "";
  let status = "";
  let diagnosticEligible = true;
  if (skipped && collectorContext === "source") {
    status = "skipped";
    diagnosticEligible = false;
    errorCode = cleanString(payload.reason || payload.error || "audit_thread_discovery_skipped", 120);
  } else if (payload.ok === false) errorCode = cleanString(payload.error || payload.code || "audit_thread_discovery_failed", 120);
  else if (!platformVisible || !pluginVisible) errorCode = "audit_thread_not_found";
  return {
    signalId: "audit_thread_liveness",
    status: status || (errorCode ? "failed" : "ok"),
    errorCode,
    diagnosticEligible,
    count: firstNumber(payload.auditThreadCount, Number(platformVisible) + Number(pluginVisible)),
    metadata: {
      collectorContext,
      platformAuditVisible: platformVisible,
      pluginAuditVisible: pluginVisible,
      auditThreadCount: firstNumber(payload.auditThreadCount, Number(platformVisible) + Number(pluginVisible)),
      skipped,
      reason: safeToken(payload.reason || "", "", 120),
    },
  };
}

function observationFromNotificationDelivery(payload = {}, options = {}) {
  if (!payload || typeof payload !== "object") {
    return observationForCommandFailure("notification_delivery", "notification_delivery_missing_payload");
  }
  const collectorContext = normalizeCollectorContext(options.collectorContext);
  const skipped = payload.skipped === true;
  const issues = Array.isArray(payload.issues) ? payload.issues : [];
  let errorCode = "";
  let status = "";
  let diagnosticEligible = true;
  if (skipped && collectorContext === "source") {
    status = "skipped";
    diagnosticEligible = false;
    errorCode = cleanString(payload.reason || payload.error || "notification_delivery_audit_skipped", 120);
  } else if (payload.ok === false) {
    errorCode = cleanString(issues[0]?.code || payload.error || "notification_delivery_audit_failed", 120);
  } else if (firstNumber(payload.deliveries?.failed) > 0) {
    errorCode = "notification_delivery_failures_present";
  }
  return {
    signalId: "notification_delivery",
    status: status || (errorCode ? "failed" : "ok"),
    errorCode,
    diagnosticEligible,
    count: issues.length,
    metadata: {
      collectorContext,
      channel: "web_push",
      attempted: firstNumber(payload.deliveries?.attempted),
      sent: firstNumber(payload.deliveries?.sent),
      failed: firstNumber(payload.deliveries?.failed),
      recentSuccess: firstNumber(payload.deliveries?.recentSuccess),
      activeSubscriptions: firstNumber(payload.subscriptions?.active),
      matchingOrigin: firstNumber(payload.subscriptions?.matchingOrigin),
      vapidConfigured: payload.vapid?.configured === true,
      stateSource: safeToken(payload.stateSource || "", "", 80),
      issueCount: issues.length,
      skipped,
      reason: safeToken(payload.reason || "", "", 120),
    },
  };
}

function observationFromPluginManifestHealth(payload = {}, options = {}) {
  if (!payload || typeof payload !== "object") {
    return observationForCommandFailure("plugin_manifest_health", "plugin_manifest_health_missing_payload");
  }
  const collectorContext = normalizeCollectorContext(options.collectorContext);
  const skipped = payload.skipped === true;
  const failedCount = firstNumber(payload.failedCount);
  let errorCode = "";
  let status = "";
  let diagnosticEligible = true;
  if (skipped && collectorContext === "source") {
    status = "skipped";
    diagnosticEligible = false;
    errorCode = cleanString(payload.reason || payload.error || "plugin_manifest_probe_skipped", 120);
  } else if (payload.ok === false) errorCode = cleanString(payload.error || payload.code || "plugin_manifest_probe_failed", 120);
  else if (failedCount > 0) errorCode = "plugin_manifest_probe_failed";
  return {
    signalId: "plugin_manifest_health",
    status: status || (errorCode ? "failed" : "ok"),
    errorCode,
    diagnosticEligible,
    count: failedCount,
    metadata: {
      collectorContext,
      pluginCount: firstNumber(payload.pluginCount),
      availableCount: firstNumber(payload.availableCount),
      failedCount,
      actionCount: firstNumber(payload.actionCount),
      maxElapsedMs: firstNumber(payload.maxElapsedMs),
      skipped,
      reason: safeToken(payload.reason || "", "", 120),
    },
  };
}

function observationFromPluginProxyLiveProbe(payload = {}, options = {}) {
  if (!payload || typeof payload !== "object") {
    return observationForCommandFailure("plugin_proxy_latency", "plugin_proxy_probe_missing_payload");
  }
  const collectorContext = normalizeCollectorContext(options.collectorContext);
  const skipped = payload.skipped === true;
  const failedCount = firstNumber(payload.failedCount);
  const maxElapsedMs = firstNumber(payload.maxElapsedMs);
  let errorCode = "";
  let status = "";
  let diagnosticEligible = true;
  if (skipped && collectorContext === "source") {
    status = "skipped";
    diagnosticEligible = false;
    errorCode = cleanString(payload.reason || payload.error || "plugin_proxy_probe_skipped", 120);
  } else if (payload.ok === false) errorCode = cleanString(payload.error || payload.code || "plugin_proxy_probe_failed", 120);
  else if (failedCount > 0) errorCode = "plugin_proxy_probe_failed";
  else if (maxElapsedMs > 2000) errorCode = "plugin_proxy_latency_gap_detected";
  return {
    signalId: "plugin_proxy_latency",
    status: status || (errorCode ? "failed" : "ok"),
    errorCode,
    diagnosticEligible,
    count: maxElapsedMs,
    metadata: {
      collectorContext,
      routeKind: "host_manifest_probe",
      durationBucket: maxElapsedMs > 2000 ? "gt_2s" : "lt_2s",
      pluginCount: firstNumber(payload.pluginCount),
      failedCount,
      maxElapsedMs,
      skipped,
      reason: safeToken(payload.reason || "", "", 120),
    },
  };
}

function observationFromPluginDeployContractClosure(payload = {}, options = {}) {
  if (!payload || typeof payload !== "object") {
    return observationForCommandFailure("plugin_deploy_contract_closure", "plugin_deploy_contract_closure_missing_payload");
  }
  const collectorContext = normalizeCollectorContext(options.collectorContext);
  const skipped = payload.skipped === true;
  const issues = Array.isArray(payload.issues) ? payload.issues : [];
  const markerChecks = Array.isArray(payload.markerChecks) ? payload.markerChecks : [];
  const missingMarkerCount = markerChecks.filter((item) => item?.ok === false).length;
  const deployCard = payload.deployCard && typeof payload.deployCard === "object" ? payload.deployCard : {};
  const deployLaneLock = payload.deployLaneLock && typeof payload.deployLaneLock === "object" ? payload.deployLaneLock : {};
  let errorCode = "";
  let status = "";
  let diagnosticEligible = true;
  if (skipped && collectorContext === "source") {
    status = "skipped";
    diagnosticEligible = false;
    errorCode = cleanString(payload.reason || payload.error || "plugin_deploy_contract_closure_skipped", 120);
  } else if (payload.ok === false) errorCode = cleanString(issues[0]?.code || payload.error || "plugin_deploy_contract_closure_failed", 120);
  else if (deployCard.validRequestOk !== true) errorCode = "deploy_card_request_shape_invalid";
  else if (deployCard.terminalReceiptRejected !== true) errorCode = "deploy_terminal_receipt_not_rejected";
  else if (deployLaneLock.ok !== true) errorCode = "deploy_lane_lock_invalid";
  else if (missingMarkerCount > 0) errorCode = "deploy_contract_source_marker_missing";
  return {
    signalId: "plugin_deploy_contract_closure",
    status: status || (errorCode ? "failed" : "ok"),
    errorCode,
    diagnosticEligible,
    count: issues.length + missingMarkerCount,
    metadata: {
      collectorContext,
      validRequestOk: deployCard.validRequestOk === true,
      terminalReceiptRejected: deployCard.terminalReceiptRejected === true,
      deployLaneLockOk: deployLaneLock.ok === true,
      issueCount: issues.length,
      missingMarkerCount,
      skipped,
      reason: safeToken(payload.reason || "", "", 120),
    },
  };
}

function observationFromPluginProxyWorkspaceBoundary(payload = {}, options = {}) {
  if (!payload || typeof payload !== "object") {
    return observationForCommandFailure("plugin_proxy_workspace_boundary", "plugin_proxy_workspace_boundary_missing_payload");
  }
  const collectorContext = normalizeCollectorContext(options.collectorContext);
  const skipped = payload.skipped === true;
  const issues = Array.isArray(payload.issues) ? payload.issues : [];
  let errorCode = "";
  let status = "";
  let diagnosticEligible = true;
  if (skipped && collectorContext === "source") {
    status = "skipped";
    diagnosticEligible = false;
    errorCode = cleanString(payload.reason || payload.error || "plugin_proxy_workspace_boundary_skipped", 120);
  } else if (payload.ok === false) errorCode = cleanString(issues[0]?.code || payload.error || "plugin_proxy_workspace_boundary_failed", 120);
  else if (payload.missingWorkspaceFailsClosed !== true) errorCode = "plugin_proxy_missing_workspace_not_fail_closed";
  else if (payload.workspaceHeaderPropagated !== true) errorCode = "plugin_proxy_workspace_header_missing";
  else if (payload.actorHeaderPropagated !== true) errorCode = "plugin_proxy_actor_header_missing";
  else if (payload.browserAuthOverwritten !== true) errorCode = "plugin_proxy_browser_auth_not_overwritten";
  return {
    signalId: "plugin_proxy_workspace_boundary",
    status: status || (errorCode ? "failed" : "ok"),
    errorCode,
    diagnosticEligible,
    count: issues.length,
    metadata: {
      collectorContext,
      routeKind: safeToken(payload.routeKind || "source_contract_smoke", "source_contract_smoke", 80),
      missingWorkspaceFailsClosed: payload.missingWorkspaceFailsClosed === true,
      workspaceHeaderPropagated: payload.workspaceHeaderPropagated === true,
      actorHeaderPropagated: payload.actorHeaderPropagated === true,
      browserAuthOverwritten: payload.browserAuthOverwritten === true,
      checkCount: firstNumber(payload.checkCount),
      issueCount: issues.length,
      skipped,
      reason: safeToken(payload.reason || "", "", 120),
    },
  };
}

function observationFromNativeBridgeCapability(payload = {}, options = {}) {
  if (!payload || typeof payload !== "object") {
    return observationForCommandFailure("native_bridge_capability", "native_bridge_capability_missing_payload");
  }
  const collectorContext = normalizeCollectorContext(options.collectorContext);
  const skipped = payload.skipped === true;
  let errorCode = "";
  let status = "";
  let diagnosticEligible = true;
  if (skipped) {
    status = "skipped";
    diagnosticEligible = false;
    errorCode = cleanString(payload.reason || "native_bridge_runtime_not_attached", 120);
  } else if (payload.ok === false) errorCode = cleanString(payload.error || payload.code || "native_bridge_capability_failed", 120);
  return {
    signalId: "native_bridge_capability",
    status: status || (errorCode ? "failed" : "ok"),
    errorCode,
    diagnosticEligible,
    count: firstNumber(payload.capabilityCount),
    metadata: {
      collectorContext,
      platform: safeToken(payload.platform || "", "", 80),
      appVersion: safeToken(payload.appVersion || payload.app_version || "", "", 80),
      capability: safeToken(payload.capability || "", "", 120),
      capabilityCount: firstNumber(payload.capabilityCount),
      skipped,
      reason: safeToken(payload.reason || "", "", 120),
    },
  };
}

function observedSignalStatus(observations = []) {
  const normalized = Array.isArray(observations) ? observations : [];
  if (normalized.some((item) => item.status === "failed")) return "failed";
  if (normalized.some((item) => item.status === "unknown")) return "unknown";
  if (normalized.some((item) => item.status === "skipped")) return "skipped";
  if (normalized.some((item) => item.status === "ok")) return "ok";
  return "not_collected";
}

function buildProductionSignalReport(input = {}) {
  const signals = Array.isArray(input.signals) && input.signals.length ? input.signals : DEFAULT_SIGNALS;
  const observations = Array.isArray(input.observations) ? input.observations : [];
  const bySignal = new Map();
  for (const observation of observations) {
    const signalId = safeToken(observation?.signalId || observation?.signal_id || "", "", 100);
    if (!signalId) continue;
    if (!bySignal.has(signalId)) bySignal.set(signalId, []);
    bySignal.get(signalId).push({
      status: safeToken(observation?.status || "unknown", "unknown", 80).toLowerCase(),
      errorCode: safeToken(observation?.errorCode || observation?.error_code || "", "", 120),
      diagnosticEligible: observation?.diagnosticEligible !== false && observation?.diagnostic_eligible !== false,
    });
  }
  const rows = signals.map((signal) => {
    const signalId = safeToken(signal.id, "unknown_signal", 100);
    const signalObservations = bySignal.get(signalId) || [];
    const status = signalObservations.length ? observedSignalStatus(signalObservations) : "not_collected";
    return {
      signalId,
      status,
      observed: signalObservations.length > 0,
      observationCount: signalObservations.length,
      failedObservationCount: signalObservations.filter((item) => item.status === "failed").length,
      skippedObservationCount: signalObservations.filter((item) => item.status === "skipped" && item.diagnosticEligible === false).length,
      errorCodes: signalObservations.map((item) => item.errorCode).filter(Boolean).slice(0, 8),
      severity: normalizeSeverity(signal.severity, "H2"),
      domain: safeToken(signal.domain || signalId, signalId, 80),
      owner: cleanString(signal.owner || "", 120),
      closureReadbackCount: normalizedList(signal.closureReadbacks || [], 32).length,
    };
  });
  const notCollected = rows.filter((row) => !row.observed);
  const observed = rows.filter((row) => row.observed);
  return {
    ok: true,
    schemaVersion: 1,
    matrixVersion: SIGNAL_MATRIX_VERSION,
    signalCount: rows.length,
    reportedSignalCount: rows.length,
    observedSignalCount: observed.length,
    notCollectedSignalCount: notCollected.length,
    failedSignalCount: rows.filter((row) => row.status === "failed").length,
    skippedSignalCount: rows.filter((row) => row.status === "skipped").length,
    notCollectedSignalIds: notCollected.map((row) => row.signalId),
    rows,
    policy: {
      reportsAllMaintainedSignals: true,
      notCollectedIsDiagnosticContextOnly: true,
      failuresCreateDiagnosticEvents: true,
    },
  };
}

function signalIdFromDiagnosticEvent(event = {}) {
  return safeToken(
    event?.context?.signal_id
      || event?.context?.signalId
      || event?.signal_id
      || event?.signalId
      || "",
    "",
    100,
  );
}

function closureReadbacksFromDiagnosticEvent(event = {}) {
  return normalizedList(
    event?.context?.closure_readbacks
      || event?.context?.closureReadbacks
      || event?.closure_readbacks
      || event?.closureReadbacks
      || [],
    16,
  );
}

function buildDiagnosticSubmitClosureReport(input = {}) {
  const enabled = Boolean(input.enabled);
  const events = enabled && Array.isArray(input.events) ? input.events : [];
  const submitResults = enabled && Array.isArray(input.submitResults) ? input.submitResults : [];
  const rows = events.map((event, index) => {
    const result = submitResults[index] || {};
    const closureReadbacks = closureReadbacksFromDiagnosticEvent(event);
    const submitOk = result.ok === true;
    const hasCaseAndEvent = Boolean(result.case_id && result.event_id);
    let status = "accepted";
    if (!submitOk) status = "submit_failed";
    else if (!hasCaseAndEvent) status = "accepted_missing_case_or_event_id";
    else if (result.auto_dispatched) status = "auto_dispatched";
    else if (result.owner_notified) status = "owner_notified";
    return {
      index,
      signalId: signalIdFromDiagnosticEvent(event) || "unknown_signal",
      status,
      ok: submitOk && hasCaseAndEvent && closureReadbacks.length > 0,
      case_id: cleanString(result.case_id || "", 160),
      event_id: cleanString(result.event_id || "", 160),
      owner_notified: Boolean(result.owner_notified),
      auto_dispatched: Boolean(result.auto_dispatched),
      task_card_id: cleanString(result.task_card_id || "", 160),
      reason: cleanString(result.reason || "", 160),
      closureReadbackCount: closureReadbacks.length,
      closureReadbacks,
    };
  });
  return {
    enabled,
    ok: rows.every((row) => row.ok),
    schemaVersion: 1,
    matrixVersion: SIGNAL_MATRIX_VERSION,
    eventCount: rows.length,
    acceptedCount: rows.filter((row) => row.ok).length,
    autoDispatchedCount: rows.filter((row) => row.auto_dispatched).length,
    ownerNotifiedCount: rows.filter((row) => row.owner_notified).length,
    failedSubmitCount: rows.filter((row) => row.status === "submit_failed").length,
    missingCaseOrEventIdCount: rows.filter((row) => row.status === "accepted_missing_case_or_event_id").length,
    missingClosureReadbackCount: rows.filter((row) => row.closureReadbackCount === 0).length,
    rows,
    policy: {
      requiresCaseAndEventIds: true,
      requiresClosureReadbacks: true,
      selfCheckMayAutoDispatch: true,
      featureRequestsRemainOwnerGated: true,
    },
  };
}

function buildProductionObservations(input = {}) {
  const observations = [];
  if (Object.prototype.hasOwnProperty.call(input, "systemResourceStatus")) {
    observations.push(observationFromSystemResourceStatus(input.systemResourceStatus, input));
  }
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
  if (Object.prototype.hasOwnProperty.call(input, "installUpgradeCanary")) {
    observations.push(observationFromInstallUpgradeCanary(input.installUpgradeCanary, input));
  }
  if (Object.prototype.hasOwnProperty.call(input, "runtimeSloAudit")) {
    observations.push(observationFromRuntimeSloAudit(input.runtimeSloAudit));
  }
  if (Object.prototype.hasOwnProperty.call(input, "pluginActionMetadataClosure")) {
    observations.push(observationFromPluginActionMetadataClosure(input.pluginActionMetadataClosure));
  }
  if (Object.prototype.hasOwnProperty.call(input, "mcpSchemaClosure")) {
    observations.push(observationFromMcpSchemaClosure(input.mcpSchemaClosure));
  }
  if (Object.prototype.hasOwnProperty.call(input, "deployLaneDiscovery")) {
    observations.push(observationFromDeployLaneDiscovery(input.deployLaneDiscovery, input));
  }
  if (Object.prototype.hasOwnProperty.call(input, "pluginDeployContractClosure")) {
    observations.push(observationFromPluginDeployContractClosure(input.pluginDeployContractClosure, input));
  }
  if (Object.prototype.hasOwnProperty.call(input, "taskCardDispatchState")) {
    observations.push(observationFromTaskCardDispatchState(input.taskCardDispatchState, input));
  }
  if (Object.prototype.hasOwnProperty.call(input, "auditThreadDiscovery")) {
    observations.push(observationFromAuditThreadDiscovery(input.auditThreadDiscovery, input));
  }
  if (Object.prototype.hasOwnProperty.call(input, "notificationDelivery")) {
    observations.push(observationFromNotificationDelivery(input.notificationDelivery, input));
  }
  if (Object.prototype.hasOwnProperty.call(input, "pluginManifestHealth")) {
    observations.push(observationFromPluginManifestHealth(input.pluginManifestHealth, input));
    observations.push(observationFromPluginProxyLiveProbe(input.pluginManifestHealth, input));
  }
  if (Object.prototype.hasOwnProperty.call(input, "pluginProxyWorkspaceBoundary")) {
    observations.push(observationFromPluginProxyWorkspaceBoundary(input.pluginProxyWorkspaceBoundary, input));
  }
  if (Object.prototype.hasOwnProperty.call(input, "nativeBridgeCapability")) {
    observations.push(observationFromNativeBridgeCapability(input.nativeBridgeCapability, input));
  }
  if (Object.prototype.hasOwnProperty.call(input, "pluginProxyLatency")) {
    observations.push(...observationsFromPluginProxyLatency(input.pluginProxyLatency, input));
  }
  if (Object.prototype.hasOwnProperty.call(input, "gatewayCapabilityAvailability")) {
    observations.push(...observationsFromGatewayCapabilityAvailability(input.gatewayCapabilityAvailability, input));
  }
  if (Object.prototype.hasOwnProperty.call(input, "uiRuntimeHealth")) {
    observations.push(...observationsFromUiRuntimeHealth(input.uiRuntimeHealth));
  }
  const signalReport = buildProductionSignalReport({ observations, signals: input.signals || DEFAULT_SIGNALS });
  return {
    ok: observations.every((item) => item.status === "ok" || (item.status === "skipped" && item.diagnosticEligible === false)),
    schemaVersion: 1,
    matrixVersion: SIGNAL_MATRIX_VERSION,
    observationCount: observations.length,
    skippedObservationCount: observations.filter((item) => item.status === "skipped" && item.diagnosticEligible === false).length,
    signalReport,
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
  buildDiagnosticSubmitClosureReport,
  buildProductionObservations,
  buildProductionSignalReport,
  buildSelfImprovingLoopReport,
  buildSignalMatrix,
  evaluateObservations,
  normalizeObservation,
  observationFromCronAudit,
  observationFromInstallUpgradeCanary,
  observationFromPluginDeployContractClosure,
  observationFromPluginActionMetadataClosure,
  observationFromPluginProxyWorkspaceBoundary,
  observationFromAuditThreadDiscovery,
  observationFromPublicUpgradeRehearsal,
  observationFromDeployLaneDiscovery,
  observationFromMcpSchemaClosure,
  observationFromNativeBridgeCapability,
  observationFromNotificationDelivery,
  observationFromPluginManifestHealth,
  observationFromPluginProxyLiveProbe,
  observationFromProductionDiagnostics,
  observationFromRuntimeSloAudit,
  observationFromStatusSmoke,
  observationFromSystemResourceStatus,
  observationFromTaskCardDispatchState,
  observationsFromGatewayCapabilityAvailability,
  observationsFromPluginProxyLatency,
  observationsFromUiRuntimeHealth,
  cronAuditPermissionBlocked,
};
