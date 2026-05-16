"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const webpush = require("web-push");
const assessmentExamService = require("./adapters/assessment-exam-service");
const { assessmentConfigLine, createAssessmentExamWorkflowService } = require("./adapters/assessment-exam-workflow-service");
const studyAssessmentService = require("./adapters/study-assessment-service");
const { createConversationHistoryService } = require("./adapters/conversation-history-service");
const { createDocumentPreviewService } = require("./adapters/document-preview-service");
const { createDirectKanbanCreateService } = require("./adapters/direct-kanban-create-service");
const { createDirectoryBrowserBoundaryService } = require("./adapters/directory-browser-boundary-service");
const { createEventFanoutService } = require("./adapters/event-fanout-service");
const fileResourceService = require("./adapters/file-resource-service");
const { createAutomationProvider } = require("./adapters/automation-provider");
const { createAutomationDeliveryRequirement, createDeliveryBoundaryInstructions } = require("./adapters/delivery-boundary-provider");
const { createExternalIntegrationProvider } = require("./adapters/external-integration-provider");
const { createArtifactTextRegistrationService } = require("./adapters/artifact-text-registration-service");
const { createGatewayPoolProvider } = require("./adapters/gateway-pool-provider");
const { createGatewayRunner } = require("./adapters/gateway-runner");
const { createGatewayRunInstructionService } = require("./adapters/gateway-run-instruction-service");
const { createGatewayRuntimeCompositionService } = require("./adapters/gateway-runtime-composition-service");
const { gatewayPoolStatusHealthy } = require("./adapters/gateway-status-projection");
const { createGatewayUsageTelemetryProvider } = require("./adapters/gateway-usage-telemetry-provider");
const { createGroupChatSharedAttachmentService } = require("./adapters/group-chat-shared-attachment-service");
const { createOwnerElevationGrantService } = require("./adapters/owner-elevation-grant-service");
const { createRuntimeStatePersistenceService } = require("./adapters/runtime-state-persistence-service");
const {
  createRuntimeStateNormalizationService,
  normalizeStringList,
  normalizeStringMap,
} = require("./adapters/runtime-state-normalization-service");
const { createKanbanCardProvider } = require("./adapters/kanban-card-provider");
const { createRuntimeStateThreadService } = require("./adapters/runtime-state-thread-service");
const { createKanbanCaseTopicService } = require("./adapters/kanban-case-topic-service");
const { createKanbanExecutableProfileService } = require("./adapters/kanban-executable-profile-service");
const { createKanbanOutputAccessService } = require("./adapters/kanban-output-access-service");
const { createKanbanOutputProjectionService } = require("./adapters/kanban-output-projection-service");
const { createKanbanPlanCardCreationService } = require("./adapters/kanban-plan-card-creation-service");
const { createKanbanRuntimeServices } = require("./adapters/kanban-runtime-services");
const { createLearningCoinAwardService } = require("./adapters/learning-coin-award-service");
const {
  kanbanCardEffectiveCaseIndex,
  kanbanCardRevisionOf,
  visibleKanbanCaseCards,
} = require("./adapters/kanban-story-provider");
const { createKanbanTodoBridge } = require("./adapters/kanban-provider");
const { createLocalBridgeRuntimeService } = require("./adapters/local-bridge-runtime-service");
const { createLocalWorkspaceStoreService } = require("./adapters/local-workspace-store-service");
const { createMobileHttpRuntimeService } = require("./adapters/mobile-http-runtime-service");
const { createMobileRuntimeCoreProviders } = require("./adapters/mobile-runtime-core-providers");
const { createOwnerElevationRoutingService } = require("./adapters/owner-elevation-routing-service");
const { createRuntimeConfigProvider } = require("./adapters/runtime-config-provider");
const { createRuntimeWorkspaceCatalogService } = require("./adapters/runtime-workspace-catalog-service");
const { createSemanticDirectoryAttachmentService } = require("./adapters/semantic-directory-attachment-service");
const { createSingleWindowThreadService } = require("./adapters/single-window-thread-service");
const {
  createSystemRuntimeStatusService,
} = require("./adapters/system-runtime-status-service");
const { deriveKanbanWorkflowState } = require("./adapters/study-workflow-provider");
const { createSkillDetailProvider } = require("./adapters/skill-detail-provider");
const { buildRequestContext } = require("./adapters/request-context-provider");
const { createThreadRuntimeCompositionService } = require("./adapters/thread-runtime-composition-service");
const { createThreadViewService } = require("./adapters/thread-view-service");
const { createWorkspaceBindingsProvider } = require("./adapters/workspace-bindings-provider");
const { createWorkspaceDisplayPathService } = require("./adapters/workspace-display-path-service");
const { createWorkspacePublicProjectionService } = require("./adapters/workspace-public-projection-service");
const { createTodoProvider } = require("./adapters/todo-provider");
const { createTodoPublicProjectionService } = require("./adapters/todo-public-projection-service");
const { createWeixinIngressProvider } = require("./adapters/weixin-ingress-provider");
const { createWeixinRuntimeCompositionService } = require("./adapters/weixin-runtime-composition-service");
const { createWebPushDeliveryService } = require("./adapters/web-push-delivery-service");
const { createMobileApiComposition } = require("./server-routes/mobile-api-composition");
const { createMobileRuntimeEnvironment } = require("./adapters/mobile-runtime-environment-service");
const runtimeEnv = createMobileRuntimeEnvironment({ toolRoot: __dirname });
const { TOOL_ROOT, REPO_ROOT, PUBLIC_ROOT, INDEX_HTML_PATH, LOCAL_CONFIG_ROOT, HOST, PORT, DATA_DIR, OWNER_DEFAULT_WORKSPACE, WINDOWS_HOME, WSL_USER, WSL_HOME, WSL_HERMES_HOME, WSL_DISTRO, BOOT_TRACE_PATH } = runtimeEnv;
const { UPDATE_REMOTE_NAME, UPDATE_BRANCH, UPDATE_VERSION_URL, UPDATE_CHECK_TIMEOUT_MS, DEFAULT_TODO_BRIDGE_SCRIPT, DEFAULT_CRON_BRIDGE_SCRIPT, DEFAULT_DIRECTORY_BRIDGE_SCRIPT, DEFAULT_SKILL_BRIDGE_SCRIPT } = runtimeEnv;
const { HERMES_API_BASE, HERMES_API_TIMEOUT_MS, HERMES_ENV_PATHS, HERMES_API_KEY_PATHS, HERMES_CONFIG_PATHS, EXPLICIT_HERMES_CONFIG_PATHS, ALLOW_WSL_REASONING_CONFIG_LOOKUP } = runtimeEnv;
const { GATEWAY_POOL_ENABLED, GATEWAY_SKILL_PROFILE_ROUTING, GATEWAY_USAGE_TELEMETRY_ENABLED, GATEWAY_USAGE_TELEMETRY_PROFILE_ROOTS, GATEWAY_POOL_HEALTH_TIMEOUT_MS, GATEWAY_POOL_MANIFEST_PATHS } = runtimeEnv;
const { RUN_START_TIMEOUT_MS, RUN_LIVENESS_CHECK_AFTER_MS, RUN_LIVENESS_CHECK_INTERVAL_MS, RUN_LIVENESS_STALE_AFTER_MS, RUN_CONCURRENCY_MAX_GLOBAL, RUN_CONCURRENCY_MAX_PER_WORKSPACE } = runtimeEnv;
const { DISABLE_AUTH, AUTH_KEY_PATH, ACCESS_KEYS_PATH, PERMISSION_APPROVAL_MARKER, OWNER_MAINTENANCE_RUNS_ENABLED, OWNER_ELEVATION_DURATION_OPTIONS_MINUTES, OWNER_ELEVATION_DEFAULT_MINUTES, OWNER_ELEVATION_ONCE_TTL_MS } = runtimeEnv;
const { STATE_PATH, STATE_BACKUP_DIR, MAX_STATE_BACKUPS, STATE_BACKUP_MIN_INTERVAL_MS, AUDIT_EVENT_LOG_PATH, RUNTIME_CONFIG_PATH, SERVICE_STORE_BACKEND, MOBILE_SQLITE_DB_PATH } = runtimeEnv;
const { SHARED_DIRECTORIES_PATH, LOCAL_WORKSPACES_PATH, WORKSPACE_USERS_PATHS, WORKSPACE_ROUTE_MAP_PATHS, PROJECT_MAP_PATHS, WORKSPACE_UPLOAD_DIR_NAME, WORKSPACE_UPLOAD_SUBDIR } = runtimeEnv;
const { GROUP_DELIVERIES_DIR, WEIXIN_INGRESS_KEY_PATHS, WEIXIN_INGRESS_DEFAULT_WORKSPACE, ENABLE_LEGACY_WEIXIN_COMPAT, WEIXIN_FORWARD_MARKDOWN_MAX_BYTES, WEIXIN_DELIVERY_RETRY_LIMIT, WEIXIN_DELIVERY_RETRY_BASE_MS, WEIXIN_DELIVERY_RETRY_MAX_MS, WEIXIN_INGRESS_ATTACHMENT_CONTEXT_WINDOW_MS } = runtimeEnv;
const { MAX_BODY_BYTES, MAX_HISTORY_MESSAGES, CHAT_CONTEXT_MAX_MESSAGES, CHAT_CONTEXT_MAX_CHARS, MAX_MESSAGE_CHARS, MAX_API_TEXT_CHARS, THREAD_MESSAGE_INITIAL_LIMIT, THREAD_MESSAGE_PAGE_LIMIT, THREAD_MESSAGE_SEARCH_LIMIT, MAX_EVENT_PREVIEW_CHARS, MAX_STORED_EVENTS_PER_THREAD, MAX_UPLOAD_BYTES, MAX_FILE_PREVIEW_CHARS, SOURCE_MARKDOWN_SEARCH_LIMIT } = runtimeEnv;
const { TODO_BRIDGE_TIMEOUT_MS, KANBAN_BRIDGE_TIMEOUT_MS, CRON_BRIDGE_TIMEOUT_MS, CRON_BRIDGE_STDOUT_LIMIT_BYTES, CRON_LIST_CACHE_TTL_MS, AUTOMATION_CREATE_TIMEOUT_MS, AUTOMATION_CREATE_MODEL, DIRECTORY_BRIDGE_TIMEOUT_MS, SKILL_BRIDGE_TIMEOUT_MS } = runtimeEnv;
const { CRON_OUTPUT_ROOT, CRON_RUN_LOG_ROOT, TODO_BACKEND, AUTOMATION_BACKEND, LOCAL_TODO_STORE_PATH, LOCAL_AUTOMATION_STORE_PATH, DIRECT_TODO_CREATE_SETTING } = runtimeEnv;
const { KANBAN_COMMAND, KANBAN_COMMAND_ARGS, KANBAN_TODO_META_PATH, KANBAN_CARD_LIST_CACHE_PATH, KANBAN_CASE_SHARE_PATH, KANBAN_WORKSPACE_PATH_STYLE, KANBAN_DEPENDENCY_RECONCILE_INTERVAL_MS, KANBAN_CARD_LIST_CACHE_TTL_MS, KANBAN_BLOCKED_PUSH_DELAY_MINUTES } = runtimeEnv;
const { KANBAN_MULTI_AGENT_DEFAULT_PARALLEL, KANBAN_MULTI_AGENT_MAX_PARALLEL, KANBAN_MULTI_AGENT_MAX_CARDS, KANBAN_MULTI_AGENT_PLAN_TIMEOUT_MS, KANBAN_READING_PLAN_MAX_SESSIONS, KANBAN_READING_ANALYSIS_TIMEOUT_MS, KANBAN_READING_TRANSCRIBE_TIMEOUT_MS, KANBAN_READING_TRANSCRIBE_SCRIPT, KANBAN_READING_ARTIFACT_ROOT, KANBAN_READING_COVER_MAX_BYTES, KANBAN_SOURCE_DOCUMENT_MAX_BYTES, KANBAN_READING_QUIZ_TARGETING_VERSION } = runtimeEnv;
const { KANBAN_STUDY_CASE_MODES, KANBAN_ASSESSMENT_CASE_MODES, KANBAN_STUDY_SHARED_FOLDER_NAME, KANBAN_CASE_TOPIC_KIND, KANBAN_ASSESSMENT_PLAN_MAX_EXAMS, KANBAN_ASSESSMENT_MAX_QUESTIONS, KANBAN_ASSESSMENT_MODEL_TIMEOUT_MS } = runtimeEnv;
const { WEB_PUSH_ENABLED, WEB_PUSH_SUBJECT, WEB_PUSH_VAPID_PATH, TODO_WEB_PUSH_ENABLED, TODO_WEB_PUSH_INTERVAL_MS, WEB_PUSH_START_DELAY_MS, TODO_WEB_PUSH_START_DELAY_MS, TODO_WEB_PUSH_RECENT_CREATE_MINUTES, TODO_WEB_PUSH_RECEIPT_RETRY_MINUTES, TODO_WEB_PUSH_RECEIPT_RETRY_LIMIT, AUTOMATION_WEB_PUSH_ENABLED, AUTOMATION_WEB_PUSH_INTERVAL_MS, AUTOMATION_WEB_PUSH_START_DELAY_MS } = runtimeEnv;
const { BRIDGE_HOST_URL, BRIDGE_HOST_KEY_PATH, STATUS_INCLUDE_CATALOG, GOOGLE_TOKEN_PATHS, GOOGLE_CLIENT_SECRET_PATHS, OUTLOOK_GRAPH_TOKEN_PATHS, GITHUB_CLI_HOSTS_PATHS } = runtimeEnv;
const { SINGLE_WINDOW_CHAT_TASK_GROUP_ID, SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID, isSingleWindowConversationTaskGroupId, singleWindowChatTaskGroupId, GROUP_MESSAGE_REVOKED_TEXT, GROUP_AI_REPLY_REVOKED_TEXT, SINGLE_WINDOW_PROJECT_ID, SINGLE_WINDOW_THREAD_TITLE } = runtimeEnv;
const { OWNER_LABEL, OWNER_ROOT_FALLBACK_LABEL, OWNER_DRIVE_ROOT_NAMES, GENERIC_OWNER_TOPIC_PROJECT_PREFIXES, GENERIC_OWNER_TOPIC_PROJECT_IDS, PRINCIPAL_LABEL_PREFIXES } = runtimeEnv;
const { REASONING_EFFORT_OPTIONS, VALID_REASONING_EFFORTS, MESSAGE_TIME_FIELDS, MIME_BY_EXT, AUTOMATION_PUSH_DELIVERABLE_EXTENSIONS, AUTOMATION_PUSH_DELIVERABLE_LOOKBACK_MS, AUTOMATION_PUSH_DELIVERABLE_FUTURE_GRACE_MS, AUTOMATION_PUSH_INITIAL_LOOKBACK_MS } = runtimeEnv;
function dedupe(values) {
  return [...new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean))];
}
function isUncPath(value) {
  return /^\\\\/.test(String(value || ""));
}
function bootTrace(label) {
  if (!BOOT_TRACE_PATH) return;
  try {
    fs.mkdirSync(path.dirname(BOOT_TRACE_PATH), { recursive: true });
    fs.appendFileSync(BOOT_TRACE_PATH, `${new Date().toISOString()} pid=${process.pid} ${label}\n`, "utf8");
  } catch (_) {}
}
bootTrace("constants ready");
const documentPreviewService = createDocumentPreviewService({
  fs,
  maxPreviewChars: MAX_FILE_PREVIEW_CHARS,
});
const httpRuntimeService = createMobileHttpRuntimeService({
  clientVersionInfo,
  maxBodyBytes: MAX_BODY_BYTES,
  mimeByExt: MIME_BY_EXT,
  publicRoot: PUBLIC_ROOT,
});
let clients = new Set();
let activeStreams = new Map();
let gatewayRunner = null;
let gatewayPoolProvider = null;
let gatewayRuntimeCompositionService = null;
let assessmentExamWorkflowService = null;
let directoryBrowserBoundaryService = null;
let artifactTextRegistrationService = null;
let gatewayUsageTelemetryProvider = null;
let groupChatSharedAttachmentService = null;
let runtimeWorkspaceCatalogService = null;
const sourceMarkdownSearchCache = new Map();
let state = null;
let sqliteServiceStore = null;
let threadViewService = null;
let localBridgeRuntimeService = null;
let todoPublicProjectionService = null;
let kanbanOutputProjectionService = null;
let singleWindowThreadService = null;
let localWorkspaceStoreService = null;
let workspacePublicProjectionService = null;
let semanticDirectoryAttachmentService = null;
let kanbanCaseTopicService = null;
let kanbanPlanCardCreationService = null;
let runtimeStateNormalizationService = null;
let runtimeStatePersistenceService = null;
let runtimeStateThreadService = null;
let ownerElevationGrantService = null;
let threadRuntimeCompositionService = null;
let systemRuntimeStatusService = null;
let weixinRuntimeCompositionService = null;
let webPushDeliveryService = null;
const eventFanoutService = createEventFanoutService({
  clients, authCanAccessWorkspace, isOwnerAuth, state: () => state,
  threadAccessibleToAuth: (...args) => getRuntimeStateThreadService().threadAccessibleToAuth(...args),
});
function getGatewayRuntimeCompositionService() {
  if (!gatewayRuntimeCompositionService) {
    gatewayRuntimeCompositionService = createGatewayRuntimeCompositionService({
      accessPolicyHardeningOptionsForGatewayRouting, activeStreams, addThreadEvent, apiTimeoutMs: HERMES_API_TIMEOUT_MS,
      appendBounded, assertRunConcurrencyCapacity, buildAccessPolicy, buildConversationHistory, buildHermesInstructions,
      broadcast, chooseGatewayRunTarget, compactFullContent, compactMessage, dedupe, effectiveProjectForThread,
      ensureGroupChatSharedArtifactCopies, enqueueExternalDeliveryForTerminalMessage, findWorkspace, gatewayConversationId,
      gatewayPool, gatewaySkillRoutingForWorkspace,
      gatewayUrlForRun: (...args) => getRuntimeStateThreadService().storedGatewayUrlForRun(...args),
      groupChatDeliveryRootForThread, groupChatTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
      isOrdinaryToolSchemaElevationRequest, logger: console, makePublicTaskId, maxMessageChars: MAX_MESSAGE_CHARS,
      mergeAccessPolicyOverride, mkdirSync: (targetPath, options) => fs.mkdirSync(targetPath, options),
      modelPermissionApprovalRequest, nowIso, nowMs: () => Date.now(),
      notifyTaskTerminal: (...args) => webPushDeliveryService.notifyTaskTerminal(...args),
      projectForTaskDirectoryAttachment: (...args) => getSemanticDirectoryAttachmentService().projectForTaskDirectoryAttachment(...args),
      registerArtifactsFromText, runLivenessCheckAfterMs: RUN_LIVENESS_CHECK_AFTER_MS,
      runLivenessCheckIntervalMs: RUN_LIVENESS_CHECK_INTERVAL_MS, runLivenessStaleAfterMs: RUN_LIVENESS_STALE_AFTER_MS,
      runStartTimeoutMs: RUN_START_TIMEOUT_MS, sanitizePolicy, saveState, singleGatewayRunner,
      singleWindowProjectId: SINGLE_WINDOW_PROJECT_ID, state: () => state, stripPermissionApprovalMarkers, supplementGatewayUsage,
      taskDirectoryAttachmentForMessage: (...args) => getSemanticDirectoryAttachmentService().taskDirectoryAttachmentForMessage(...args),
      threadSummary, toolSchemaEpoch: GATEWAY_TOOL_SCHEMA_EPOCH, windowsPathToWsl,
    });
  }
  return gatewayRuntimeCompositionService;
}
const addThreadActiveRun = (...args) => getGatewayRuntimeCompositionService().addThreadActiveRun(...args);
const replaceThreadActiveRun = (...args) => getGatewayRuntimeCompositionService().replaceThreadActiveRun(...args);
const removeThreadActiveRun = (...args) => getGatewayRuntimeCompositionService().removeThreadActiveRun(...args);
const taskGroupHasRunningRun = (...args) => getGatewayRuntimeCompositionService().taskGroupHasRunningRun(...args);
const nextQueuedRunPairForTaskGroup = (...args) => getGatewayRuntimeCompositionService().nextQueuedRunPairForTaskGroup(...args);
const scheduleNextQueuedRunForTaskGroup = (...args) => getGatewayRuntimeCompositionService().scheduleNextQueuedRunForTaskGroup(...args);
const {
  accessPolicyProvider,
  auditEventProvider,
  authProvider,
  bridgeCommandProvider,
  CRON_BRIDGE_SCRIPT,
  DIRECTORY_BRIDGE_SCRIPT,
  egressPolicyProvider,
  fileArtifactAccessService,
  fileArtifactResolverService,
  fileResponseService,
  filesystemMountProvider,
  gatewayStatusProjection,
  learningCoinService,
  pathPolicyProvider,
  projectDiscoveryProvider,
  runConcurrencyPolicy,
  securityBoundaryProvider,
  sharedDirectoryProvider,
  SKILL_BRIDGE_SCRIPT,
  TODO_BRIDGE_SCRIPT,
} = createMobileRuntimeCoreProviders({
  artifactAccessibleToAuth: (...args) => getRuntimeStateThreadService().artifactAccessibleToAuth(...args),
  authCanAccessWorkspace, bootTrace, chatGroupMemberWorkspaceIds, compactText, contentDisposition, dedupe, ensureDataDir,
  env: process.env, extractDocxText,
  findArtifactReference: (...args) => getRuntimeStateThreadService().findArtifactReference(...args),
  findArtifactReferenceById: (...args) => getRuntimeStateThreadService().findArtifactReferenceById(...args),
  findWorkspace, fs, isOwnerAuth, isPathAllowed, isPathAllowedForThread, loadCatalog,
  logicalDirectoryDisplayPath: (...args) => workspaceDisplayPathService.logicalDirectoryDisplayPath(...args),
  logicalUserPathFallback: (...args) => workspaceDisplayPathService.logicalUserPathFallback(...args),
  makeId, mimeFor, mobileSqliteStore, normalizeLocalPath, normalizeStringList, nowIso, os, path,
  pathInsideAnyRoot, policyForThread, readJsonFirst, resolveArtifactPathFromMessage,
  resolveBrowserPath: (...args) => getDirectoryBrowserBoundaryService().resolveBrowserPath(...args),
  runDirectoryBridge, runtimeEnv, sendJson, sharedDirectoryProjectsForWorkspace, sharedDirectoryRoots,
  state: () => state, textBufferPreview, textFilePreview, uploadRootsForThread, useSqliteServiceStore,
  windowsPathToWsl, workspacePrincipal,
});
const learningCoinAwardService = createLearningCoinAwardService({
  learningCoinService,
  logger: console,
  onAward: (award) => broadcast({ type: "learning-coins.updated", workspaceId: award.workspaceId, studentId: award.studentId }),
});
const runtimeConfigProvider = createRuntimeConfigProvider({
  storagePath: () => RUNTIME_CONFIG_PATH, ensureDataDir, nowIso, defaultHermesApiBase: () => HERMES_API_BASE,
  apiKeyPaths: () => HERMES_API_KEY_PATHS, envPaths: () => HERMES_ENV_PATHS,
  defaultWebPushSubject: () => WEB_PUSH_SUBJECT, defaultWebPushVapidPath: () => WEB_PUSH_VAPID_PATH,
});
webPushDeliveryService = createWebPushDeliveryService({
  appRouteUrl, automationProvider: () => automationProvider, chatGroupMemberWorkspaceIds, compactText, dedupe,
  effectiveWebPushSubject, effectiveWebPushVapidPath, hashValue, findWorkspace,
  isWeixinSingleWindowThread: (...args) => getSingleWindowThreadService().isWeixinSingleWindowThread(...args),
  loadCatalog, loadRuntimeConfig, logger: console, makeId, maybeReconcileKanbanDependencyBlocks, normalizeStringList,
  nowIso, publicTodo, saveState, state: () => state, todoProvider: () => todoProvider, useKanbanTodoBackend,
  webpush, workspaceLabel, workspaceIdForPrincipal, workspacePrincipal,
  automationDeliverableExtensions: AUTOMATION_PUSH_DELIVERABLE_EXTENSIONS,
  automationDeliverableFutureGraceMs: AUTOMATION_PUSH_DELIVERABLE_FUTURE_GRACE_MS,
  automationDeliverableLookbackMs: AUTOMATION_PUSH_DELIVERABLE_LOOKBACK_MS,
  automationInitialLookbackMs: AUTOMATION_PUSH_INITIAL_LOOKBACK_MS,
  automationPushEnabled: AUTOMATION_WEB_PUSH_ENABLED, automationPushIntervalMs: AUTOMATION_WEB_PUSH_INTERVAL_MS,
  automationPushStartDelayMs: AUTOMATION_WEB_PUSH_START_DELAY_MS, kanbanBlockedPushDelayMinutes: KANBAN_BLOCKED_PUSH_DELAY_MINUTES,
  singleWindowChatTaskGroupId: SINGLE_WINDOW_CHAT_TASK_GROUP_ID, singleWindowGroupChatTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
  todoPushEnabled: TODO_WEB_PUSH_ENABLED, todoPushIntervalMs: TODO_WEB_PUSH_INTERVAL_MS,
  todoPushReceiptRetryLimit: TODO_WEB_PUSH_RECEIPT_RETRY_LIMIT, todoPushReceiptRetryMinutes: TODO_WEB_PUSH_RECEIPT_RETRY_MINUTES,
  todoPushRecentCreateMinutes: TODO_WEB_PUSH_RECENT_CREATE_MINUTES, todoPushStartDelayMs: TODO_WEB_PUSH_START_DELAY_MS,
  webPushEnabled: WEB_PUSH_ENABLED, webPushSubject: WEB_PUSH_SUBJECT, webPushVapidPath: WEB_PUSH_VAPID_PATH,
});
const weixinIngressProvider = createWeixinIngressProvider({
  listWorkspaces: () => loadCatalog().workspaces,
  workspaceIdForPrincipal,
  defaultWorkspaceId: () => WEIXIN_INGRESS_DEFAULT_WORKSPACE,
});
bootTrace("before loadState");
state = loadState();
bootTrace("after loadState");
threadViewService = createThreadViewService({
  compactArtifactsForMessage,
  compactText,
  comparablePath,
  findThreadForMessage,
  isSingleWindowConversationTaskGroupId,
  maxApiTextChars: MAX_API_TEXT_CHARS,
  maxStoredEventsPerThread: MAX_STORED_EVENTS_PER_THREAD,
  normalizeTaskGroupMeta: (...args) => getRuntimeStateNormalizationService().normalizeTaskGroupMeta(...args),
  projectSearchLabels: (...args) => getSemanticDirectoryAttachmentService().projectSearchLabels(...args),
  publicChatGroup,
  publicExternalIngress: (...args) => getSingleWindowThreadService().publicExternalIngress(...args),
  publicWeixinOutboundDelivery,
  sanitizeTaskTitle: (...args) => getRuntimeStateNormalizationService().sanitizeTaskTitle(...args),
  searchableText,
  singleWindowChatTaskGroupId: SINGLE_WINDOW_CHAT_TASK_GROUP_ID,
  singleWindowGroupChatTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
  singleWindowProjectId: SINGLE_WINDOW_PROJECT_ID,
  state: () => state,
  threadMessageInitialLimit: THREAD_MESSAGE_INITIAL_LIMIT,
  threadMessageSearchLimit: THREAD_MESSAGE_SEARCH_LIMIT,
});
bootTrace("thread view service ready");
const workspaceBindingsProvider = createWorkspaceBindingsProvider({
  interfaceToolsetsJson: () => process.env.HERMES_WEB_WORKSPACE_INTERFACE_TOOLSETS_JSON || "",
  ownerExternalAccessPolicy: () => ownerExternalAccessPolicy(),
  ownerExternalInterfaceBindings: () => ownerExternalInterfaceBindings(),
});
bootTrace("workspace bindings ready");
const workspaceDisplayPathService = createWorkspaceDisplayPathService({
  allProjectsForWorkspaceSync,
  comparablePath,
  findWorkspace,
  ownerDriveRootNames: () => OWNER_DRIVE_ROOT_NAMES,
  ownerRootFallbackLabel: () => OWNER_ROOT_FALLBACK_LABEL,
  normalizeLocalPath: (value) => normalizeLocalPath(value),
  pathInsideAnyRoot,
});
bootTrace("display paths ready");
function getRuntimeWorkspaceCatalogService() {
  if (!runtimeWorkspaceCatalogService) {
    runtimeWorkspaceCatalogService = createRuntimeWorkspaceCatalogService({
      accessPolicyProvider,
      bootTrace,
      comparablePath,
      defaultOwnerWorkspace: () => OWNER_DEFAULT_WORKSPACE,
      dedupe,
      fallbackOwnerPolicy: () => sanitizePolicy({
        principal_id: "owner",
        principal_label: OWNER_LABEL,
        access_mode: "unrestricted",
        default_workspace: OWNER_DEFAULT_WORKSPACE,
        source_platform: "web",
        reason: "hermes_web_fallback_owner",
      }),
      localWorkspaces: localWorkspaceRecords,
      normalizeStringList,
      ownerAliases: () => process.env.HERMES_WEB_OWNER_ALIASES || "owner",
      ownerLabel: () => OWNER_LABEL,
      path,
      projectDiscoveryProvider,
      projectMapPaths: PROJECT_MAP_PATHS,
      readJsonFirst,
      repoRoot: REPO_ROOT,
      routeMapPaths: WORKSPACE_ROUTE_MAP_PATHS,
      securityBoundaryProvider,
      sharedDirectoryProvider,
      usersPaths: WORKSPACE_USERS_PATHS,
      workspaceBindingsProvider,
    });
  }
  return runtimeWorkspaceCatalogService;
}
function loadRuntimeConfig() {
  return runtimeConfigProvider.load();
}
function saveRuntimeConfig(input, actor = "owner") {
  return runtimeConfigProvider.save(input, actor);
}
function effectiveHermesApiBase(config = loadRuntimeConfig()) {
  return runtimeConfigProvider.effectiveHermesApiBase(config);
}
function effectiveWebPushSubject(config = loadRuntimeConfig()) {
  return runtimeConfigProvider.effectiveWebPushSubject(config);
}
function effectiveWebPushVapidPath(config = loadRuntimeConfig()) {
  return runtimeConfigProvider.effectiveWebPushVapidPath(config);
}
function publicRuntimeConfig() {
  return runtimeConfigProvider.publicConfig({
    pushStatus: webPushDeliveryService.publicPushStatus(),
    webPushConfig: webPushDeliveryService?.getWebPushConfig?.() || null,
    webPushEnabled: WEB_PUSH_ENABLED,
  });
}
function loadHermesApiKey() {
  return runtimeConfigProvider.loadHermesApiKey();
}
function singleGatewayRunner() {
  if (!gatewayRunner) {
    gatewayRunner = createGatewayRunner({
      apiBase: () => effectiveHermesApiBase(),
      apiKey: () => loadHermesApiKey(),
      timeoutMs: () => HERMES_API_TIMEOUT_MS,
    });
  }
  return gatewayRunner;
}
function gatewayPool() {
  if (!gatewayPoolProvider) {
    gatewayPoolProvider = createGatewayPoolProvider({
      enabled: () => GATEWAY_POOL_ENABLED,
      manifestPaths: () => GATEWAY_POOL_MANIFEST_PATHS,
      fallbackApiBase: () => effectiveHermesApiBase(),
      fallbackApiKey: () => loadHermesApiKey(),
      timeoutMs: () => HERMES_API_TIMEOUT_MS,
      healthTimeoutMs: GATEWAY_POOL_HEALTH_TIMEOUT_MS,
      createGatewayRunner,
    });
  }
  return gatewayPoolProvider;
}
function gatewayUsageTelemetry() {
  if (!gatewayUsageTelemetryProvider) {
    gatewayUsageTelemetryProvider = createGatewayUsageTelemetryProvider({
      enabled: () => GATEWAY_USAGE_TELEMETRY_ENABLED,
      profileRoots: () => GATEWAY_USAGE_TELEMETRY_PROFILE_ROOTS,
      manifestPaths: () => GATEWAY_POOL_MANIFEST_PATHS,
    });
  }
  return gatewayUsageTelemetryProvider;
}
async function chooseGatewayRunTarget(hints = {}) {
  return gatewayPool().chooseTarget(hints);
}
function gatewayTargetForRun(runId) {
  return getGatewayRuntimeCompositionService().gatewayTargetForRun(runId);
}
function runConcurrencySnapshot() {
  return runConcurrencyPolicy.snapshot(state?.threads || []);
}
function runConcurrencyError(workspaceId) {
  return runConcurrencyPolicy.limitError(state?.threads || [], workspaceId);
}
function assertRunConcurrencyCapacity(workspaceId) {
  const error = runConcurrencyError(workspaceId);
  if (!error) return;
  const err = new Error(error.message);
  err.status = error.status || 429;
  err.code = error.code;
  err.details = error;
  throw err;
}
function publicReasoningInfoForAuth(auth) {
  const info = defaultReasoningInfo();
  const shared = {
    defaultEffort: info.defaultEffort || "medium",
    efforts: REASONING_EFFORT_OPTIONS,
    assistantLabel: info.assistantLabel || "AI",
    model: {
      default: info.defaultModel || "",
      provider: info.provider || "",
      label: info.assistantLabel || "AI",
    },
  };
  if (isOwnerAuth(auth)) {
    return Object.assign({}, shared, {
      source: info.source || "",
      model: Object.assign({}, shared.model, {
        baseUrl: info.baseUrl || "",
      }),
    });
  }
  return shared;
}
function publicGatewayPoolStatusForAuth(auth, pool) {
  return gatewayStatusProjection.publicGatewayPoolStatusForAuth(auth, pool);
}
function publicConcurrencyForAuth(auth) {
  if (isOwnerAuth(auth)) return runConcurrencySnapshot();
  const snapshot = runConcurrencySnapshot();
  const workspaceId = String(auth?.workspaceId || "").trim();
  return {
    maxPerWorkspace: snapshot.maxPerWorkspace,
    activeForWorkspace: workspaceId ? (snapshot.activeByWorkspace[workspaceId] || 0) : 0,
  };
}
const ownerElevationRoutingService = createOwnerElevationRoutingService({
  compactText,
  consumeOwnerElevationOnce,
  gatewaySkillProfileRouting: GATEWAY_SKILL_PROFILE_ROUTING,
  isOwnerAuth,
  isOwnerElevationActive,
  loadCatalog,
  permissionApprovalMarker: PERMISSION_APPROVAL_MARKER,
  securityBoundaryProvider,
});
const accessPolicyHardeningOptionsForGatewayRouting = (...args) => ownerElevationRoutingService.accessPolicyHardeningOptionsForGatewayRouting(...args);
const gatewayRoutingForModelRun = (...args) => ownerElevationRoutingService.gatewayRoutingForModelRun(...args);
const gatewaySkillRoutingForWorkspace = (...args) => ownerElevationRoutingService.gatewaySkillRoutingForWorkspace(...args);
const modelPermissionApprovalRequest = (...args) => ownerElevationRoutingService.modelPermissionApprovalRequest(...args);
const ownerElevationInstructions = (...args) => ownerElevationRoutingService.ownerElevationInstructions(...args);
const precedingUserMessageForAssistant = (...args) => ownerElevationRoutingService.precedingUserMessageForAssistant(...args);
const sanitizeElevationScope = (...args) => ownerElevationRoutingService.sanitizeElevationScope(...args);
const stripPermissionApprovalMarkers = (...args) => ownerElevationRoutingService.stripPermissionApprovalMarkers(...args);
function ownerSetupStatus() {
  return authProvider.ownerSetupStatus();
}
function createInitialOwnerKey() {
  return authProvider.createInitialOwnerKey();
}
function getUrl(req) { return httpRuntimeService.getUrl(req); }
function getLocalWorkspaceStoreService() {
  if (!localWorkspaceStoreService) {
    localWorkspaceStoreService = createLocalWorkspaceStoreService({
      storagePath: LOCAL_WORKSPACES_PATH,
      ownerDefaultWorkspace: OWNER_DEFAULT_WORKSPACE,
      ensureDataDir,
      nowIso,
      normalizeStringList,
      normalizeStringMap,
      findWorkspace,
      deleteWorkspaceAccessKey: (workspaceId) => authProvider.deleteWorkspaceAccessKey(workspaceId),
      invalidateCatalogCache,
      clearDynamicProjectCache: (workspaceId) => getRuntimeWorkspaceCatalogService().clearDynamicProjectCache(workspaceId),
      rootConflictsWithProtected: (root) => securityBoundaryProvider.rootConflictsWithProtected(root),
      filterRoots: (roots) => securityBoundaryProvider.filterRoots(roots),
    });
  }
  return localWorkspaceStoreService;
}
function workspaceIdSlug(value) {
  return getLocalWorkspaceStoreService().workspaceIdSlug(value);
}
function workspaceIdFromUsername(value) {
  return getLocalWorkspaceStoreService().workspaceIdFromUsername(value);
}
function localWorkspaceDefaults(input = {}, previous = {}) {
  return getLocalWorkspaceStoreService().localWorkspaceDefaults(input, previous);
}
function localWorkspaceRecords() {
  return getLocalWorkspaceStoreService().localWorkspaceRecords();
}
function upsertLocalWorkspace(input, actor = "owner") {
  return getLocalWorkspaceStoreService().upsertLocalWorkspace(input, actor);
}
function deleteLocalWorkspace(workspaceId) {
  return getLocalWorkspaceStoreService().deleteLocalWorkspace(workspaceId);
}
function authenticateRequest(req) {
  return authProvider.authenticateRequest(req);
}
function isOwnerAuth(auth) {
  return authProvider.isOwnerAuth(auth);
}
function getOwnerElevationGrantService() {
  if (!ownerElevationGrantService) {
    ownerElevationGrantService = createOwnerElevationGrantService({
      isOwnerAuth,
      maintenanceRunsEnabled: () => OWNER_MAINTENANCE_RUNS_ENABLED,
      durationOptionsMinutes: OWNER_ELEVATION_DURATION_OPTIONS_MINUTES,
      defaultDurationMinutes: OWNER_ELEVATION_DEFAULT_MINUTES,
      onceTtlMs: OWNER_ELEVATION_ONCE_TTL_MS,
      audit: (eventType, payload) => auditEventProvider.audit(eventType, payload),
    });
  }
  return ownerElevationGrantService;
}
function isOwnerElevationActive(auth) {
  return getOwnerElevationGrantService().isActive(auth);
}
function grantOwnerElevationOnce(auth) {
  return getOwnerElevationGrantService().grantOnce(auth);
}
function consumeOwnerElevationOnce(auth, token) {
  return getOwnerElevationGrantService().consumeOnce(auth, token);
}
function publicOwnerElevationStatus(auth) {
  return getOwnerElevationGrantService().publicStatus(auth);
}
function grantOwnerElevation(auth, durationMinutes) {
  return getOwnerElevationGrantService().grantTimed(auth, durationMinutes);
}
function revokeOwnerElevation(auth) {
  return getOwnerElevationGrantService().revoke(auth);
}
function authCanAccessWorkspace(auth, workspaceId) {
  return authProvider.authCanAccessWorkspace(auth, workspaceId);
}
function getRuntimeStateThreadService() {
  if (!runtimeStateThreadService) {
    runtimeStateThreadService = createRuntimeStateThreadService({
      authenticateRequest,
      authCanAccessWorkspace,
      chatGroupMemberWorkspaceIds,
      groupChatTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
      saveState,
      state: () => state,
    });
  }
  return runtimeStateThreadService;
}
function chatGroupMemberWorkspaceIds(thread, options = {}) {
  if (!thread?.singleWindow) return [];
  const group = normalizeChatGroup(thread.chatGroup || {}, thread.workspaceId, options);
  return group.enabled ? group.memberWorkspaceIds : [];
}
function resolveArtifactPathFromMessage(artifact, message) {
  const name = String(artifact?.name || "").trim();
  const candidates = extractArtifactPaths(message?.content || "")
    .map((rawPath) => {
      const localPath = normalizeLocalPath(rawPath);
      return { rawPath, localPath };
    })
    .filter((candidate) => candidate.localPath && fs.existsSync(candidate.localPath));
  if (!candidates.length) return null;
  if (name) {
    const matched = candidates.find((candidate) => path.basename(candidate.localPath) === name || path.basename(candidate.rawPath) === name);
    if (matched) return matched;
  }
  return candidates.length === 1 ? candidates[0] : null;
}
function pushWorkspaceForAuth(auth, requestedWorkspaceId = "owner") {
  const requested = String(requestedWorkspaceId || auth?.workspaceId || "owner").trim() || "owner";
  if (isOwnerAuth(auth)) return findWorkspace(requested) ? requested : "owner";
  return String(auth?.workspaceId || requestedWorkspaceId || "owner").trim() || "owner";
}
function getWorkspacePublicProjectionService() {
  if (!workspacePublicProjectionService) {
    workspacePublicProjectionService = createWorkspacePublicProjectionService({
      dedupe,
      filterRoots: (roots) => securityBoundaryProvider.filterRoots(roots),
      isOwnerAuth,
      loadCatalog,
      publicWorkspaceAccessKeyStatus: (workspace) => authProvider.publicWorkspaceAccessKeyStatus(workspace),
      publicWorkspaceBindings: (workspace) => workspaceBindingsProvider.publicBindings(workspace),
      rootConflictsWithProtected: (root) => securityBoundaryProvider.rootConflictsWithProtected(root),
    });
  }
  return workspacePublicProjectionService;
}
function publicWorkspacesForAuth(auth) {
  return getWorkspacePublicProjectionService().publicWorkspacesForAuth(auth);
}
function requireOwner(req, res) {
  const auth = authenticateRequest(req);
  if (!isOwnerAuth(auth)) {
    sendJson(res, 403, { error: "Owner access is required" });
    return null;
  }
  return auth;
}
function requireWorkspaceAccess(req, res, workspaceId) {
  const id = String(workspaceId || "owner").trim() || "owner";
  if (!findWorkspace(id)) {
    sendJson(res, 400, { error: "Unknown workspace" });
    return "";
  }
  if (!authCanAccessWorkspace(authenticateRequest(req), id)) {
    sendJson(res, 403, { error: "Workspace access is not allowed" });
    return "";
  }
  return id;
}
function ownerDirectoryBrowserThread() {
  return {
    id: "owner-directory-browser",
    title: "Owner Directory Browser",
    workspaceId: "owner",
    projectId: "",
    subprojectId: "",
    singleWindow: false,
    status: "idle",
    taskGroupMeta: {},
    chatGroup: { enabled: false, memberWorkspaceIds: [] },
    messages: [],
  };
}
function findDirectoryThreadForRequest(req, threadId) {
  const auth = authenticateRequest(req);
  const thread = getRuntimeStateThreadService().findThreadForAuth(auth, threadId);
  if (thread) return thread;
  return isOwnerAuth(auth) ? ownerDirectoryBrowserThread() : null;
}
function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(OWNER_DEFAULT_WORKSPACE, { recursive: true });
}
function getRuntimeStateNormalizationService() {
  if (!runtimeStateNormalizationService) {
    runtimeStateNormalizationService = createRuntimeStateNormalizationService({
      bootTrace,
      chatGroupMemberWorkspaceIds,
      compactFullContent,
      dedupe,
      findWorkspace,
      groupMessageRevokedText: GROUP_MESSAGE_REVOKED_TEXT,
      kanbanCaseTopicKind: KANBAN_CASE_TOPIC_KIND,
      makeId,
      maxStoredEventsPerThread: MAX_STORED_EVENTS_PER_THREAD,
      messageTimeFields: MESSAGE_TIME_FIELDS,
      normalizePushDelivery,
      normalizePushReceipt,
      normalizePushSubscription,
      normalizeSingleWindowMode,
      nowIso,
      singleWindowChatTaskGroupId,
      singleWindowChatTaskGroupIdValue: SINGLE_WINDOW_CHAT_TASK_GROUP_ID,
      singleWindowGroupChatTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
      validReasoningEfforts: VALID_REASONING_EFFORTS,
      workspaceLabel,
    });
  }
  return runtimeStateNormalizationService;
}
function getRuntimeStatePersistenceService() {
  if (!runtimeStatePersistenceService) {
    runtimeStatePersistenceService = createRuntimeStatePersistenceService({
      fs,
      path,
      statePath: STATE_PATH,
      dataDir: DATA_DIR,
      stateBackupDir: STATE_BACKUP_DIR,
      maxStateBackups: MAX_STATE_BACKUPS,
      stateBackupMinIntervalMs: STATE_BACKUP_MIN_INTERVAL_MS,
      bootTrace,
      defaultState,
      ensureDataDir,
      logError: (message) => console.error(message),
      mobileSqliteStore,
      normalizeState,
      pushSubscriptionScopeSignature,
      useSqliteServiceStore,
    });
  }
  return runtimeStatePersistenceService;
}
function defaultState() {
  return getRuntimeStateNormalizationService().defaultState();
}
function loadState() {
  return getRuntimeStatePersistenceService().loadState();
}
function normalizeState(value, options = {}) {
  return getRuntimeStateNormalizationService().normalizeState(value, options);
}
function normalizePushDelivery(item) {
  return webPushDeliveryService.normalizePushDelivery(item);
}
function normalizePushReceipt(item) {
  return webPushDeliveryService.normalizePushReceipt(item);
}
function normalizePushSubscription(item, options = {}) {
  return webPushDeliveryService.normalizePushSubscription(item, options);
}
function scopedPushPrincipalIds(principalIds) {
  const principals = normalizeStringList(principalIds);
  if (!principals.length) return ["owner"];
  if (principals.includes("owner")) return ["owner"];
  return [principals[principals.length - 1]];
}
function scopedPushWorkspaceIds(principalId, workspaceIds = [], options = {}) {
  const principal = String(principalId || "owner").trim() || "owner";
  if (principal === "owner") return ["owner"];
  const workspaceId = options.skipCatalogLookups
    ? (normalizeStringList(workspaceIds)[0] || principal)
    : (workspaceIdForPrincipal(principal) || normalizeStringList(workspaceIds)[0] || "");
  return workspaceId ? [workspaceId] : [];
}
function pushSubscriptionScopeSignature(items) {
  return webPushDeliveryService.pushSubscriptionScopeSignature(items);
}
function stripPrincipalLabelPrefixes(value) {
  let text = String(value || "").trim();
  for (const prefix of PRINCIPAL_LABEL_PREFIXES) {
    if (prefix && text.startsWith(prefix)) text = text.slice(prefix.length);
  }
  return text;
}
function normalizeChatGroup(value, ownerWorkspaceId = "owner", options = {}) {
  return getRuntimeStateNormalizationService().normalizeChatGroup(value, ownerWorkspaceId, options);
}
function saveState(next = state, options = {}) {
  return getRuntimeStatePersistenceService().saveState(next, options);
}
function hashValue(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}
function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}
function nowIso() {
  return new Date().toISOString();
}
function normalizeOwnerElevationDurations(value) {
  const parsed = normalizeStringList(value)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0 && item <= 240)
    .map((item) => Math.round(item));
  const unique = [...new Set(parsed)].sort((a, b) => a - b);
  return unique.length ? unique : [5, 15, 30, 60];
}
function normalizeSingleWindowMode(value) {
  return String(value || "").trim().toLowerCase() === "chat" ? "chat" : "task";
}
function configPathReadableForRuntimeInfo(configPath) {
  const text = String(configPath || "").trim();
  return Boolean(text && (
    !isUncPath(text)
    || EXPLICIT_HERMES_CONFIG_PATHS.has(text)
    || ALLOW_WSL_REASONING_CONFIG_LOOKUP
  ));
}
function gatewayPoolConfigPathCandidates() {
  const candidates = [];
  try {
    const loaded = gatewayPool().load();
    for (const worker of loaded.workers || []) {
      for (const dbPath of [worker.telemetryStateDbPath, worker.telemetryResponseStoreDbPath]) {
        if (dbPath) candidates.push(path.join(path.dirname(dbPath), "config.yaml"));
      }
      for (const root of GATEWAY_USAGE_TELEMETRY_PROFILE_ROOTS) {
        if (worker.profile) candidates.push(path.join(root, worker.profile, "config.yaml"));
        if (worker.telemetryProfile && worker.telemetryProfile !== worker.profile) {
          candidates.push(path.join(root, worker.telemetryProfile, "config.yaml"));
        }
      }
    }
  } catch (_) {}
  return candidates;
}
function runtimeConfigPathCandidates() {
  const base = HERMES_CONFIG_PATHS.filter(configPathReadableForRuntimeInfo);
  return dedupe([...gatewayPoolConfigPathCandidates(), ...base]).filter(configPathReadableForRuntimeInfo);
}
function getSystemRuntimeStatusService() {
  if (!systemRuntimeStatusService) {
    systemRuntimeStatusService = createSystemRuntimeStatusService({
      compactText,
      env: process.env,
      fetchText: fetchTextWithTimeout,
      fs,
      indexHtmlPath: INDEX_HTML_PATH,
      nowIso,
      path,
      process,
      repoRoot: REPO_ROOT,
      runProcessText,
      runtimeConfigPathCandidates,
      updateBranch: UPDATE_BRANCH,
      updateCheckTimeoutMs: UPDATE_CHECK_TIMEOUT_MS,
      updateRemoteName: UPDATE_REMOTE_NAME,
      updateVersionUrl: UPDATE_VERSION_URL,
    });
  }
  return systemRuntimeStatusService;
}
function runtimeModelConfigInfo() {
  return getSystemRuntimeStatusService().runtimeModelConfigInfo();
}
function defaultReasoningInfo() {
  return runtimeModelConfigInfo();
}
function readClientVersion() {
  return getSystemRuntimeStatusService().readClientVersion();
}
function clientVersionInfo(clientVersion = "") {
  return getSystemRuntimeStatusService().clientVersionInfo(clientVersion);
}
function runGitSync(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: "utf8",
    windowsHide: true,
    timeout: options.timeoutMs || UPDATE_CHECK_TIMEOUT_MS,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || "").trim(),
    stderr: compactText(String(result.stderr || result.error?.message || "").trim(), 600),
  };
}
async function fetchTextWithTimeout(url, timeoutMs = UPDATE_CHECK_TIMEOUT_MS) {
  const response = await fetch(url, { signal: AbortSignal.timeout(Math.max(1000, timeoutMs)), cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}
async function appUpdateStatus() {
  return getSystemRuntimeStatusService().appUpdateStatus();
}
async function applyAppUpdate() {
  const status = await appUpdateStatus();
  if (!status.repository.available) return Object.assign({}, status, { ok: false, error: status.warning || "App directory is not a git checkout." });
  if (!status.repository.clean) return Object.assign({}, status, { ok: false, error: "Working tree is not clean; update was not applied." });
  const fetchResult = runGitSync(["fetch", UPDATE_REMOTE_NAME, UPDATE_BRANCH], { timeoutMs: 30000 });
  if (!fetchResult.ok) return Object.assign({}, status, { ok: false, error: fetchResult.stderr || "git fetch failed." });
  const remoteRef = `${UPDATE_REMOTE_NAME}/${UPDATE_BRANCH}`;
  const localHead = runGitSync(["rev-parse", "HEAD"]);
  const remoteHead = runGitSync(["rev-parse", remoteRef]);
  if (!remoteHead.ok) return Object.assign({}, status, { ok: false, error: `Cannot resolve ${remoteRef}.` });
  if (localHead.ok && localHead.stdout === remoteHead.stdout) {
    return Object.assign({}, status, { ok: true, updated: false, upToDate: true, latestCommit: remoteHead.stdout });
  }
  const ancestor = runGitSync(["merge-base", "--is-ancestor", "HEAD", remoteRef]);
  if (!ancestor.ok) {
    return Object.assign({}, status, { ok: false, error: "Remote branch is not a fast-forward from the current checkout." });
  }
  const merge = runGitSync(["merge", "--ff-only", remoteRef], { timeoutMs: 30000 });
  if (!merge.ok) return Object.assign({}, status, { ok: false, error: merge.stderr || "git fast-forward failed." });
  getSystemRuntimeStatusService().resetCaches();
  return Object.assign({}, await appUpdateStatus(), {
    ok: true,
    updated: true,
    restartRequired: true,
    message: "Updated by git fast-forward. Restart Hermes Mobile if server code changed.",
  });
}
function requestClientVersion(req) { return httpRuntimeService.requestClientVersion(req); }
function attachClientVersionHeaders(req, res) { return httpRuntimeService.attachClientVersionHeaders(req, res); }
function sendJson(res, status, data) { return httpRuntimeService.sendJson(res, status, data); }
function readBody(req, maxBytes = MAX_BODY_BYTES) { return httpRuntimeService.readBody(req, maxBytes); }
function windowsPathToWsl(value) {
  return filesystemMountProvider.windowsPathToWsl(value);
}
function safeStorageSegment(value, fallback = "item") {
  return String(value || fallback)
    .replace(/[^A-Za-z0-9_.:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96) || fallback;
}
function getGroupChatSharedAttachmentService() {
  if (!groupChatSharedAttachmentService) {
    groupChatSharedAttachmentService = createGroupChatSharedAttachmentService({
      groupDeliveriesDir: GROUP_DELIVERIES_DIR,
      groupChatTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
      safeStorageSegment,
      safeFileName,
      normalizeLocalPath,
      isProtectedPath: (value) => securityBoundaryProvider.isProtectedPath(value),
      samePath,
      windowsPathToWsl,
      listArtifacts: () => state.artifacts || [],
    });
  }
  return groupChatSharedAttachmentService;
}
function groupChatDeliveryRootForThread(thread) {
  return getGroupChatSharedAttachmentService().deliveryRootForThread(thread);
}
function storedArtifactForMessageArtifact(artifact = {}) {
  return getGroupChatSharedAttachmentService().storedArtifactForMessageArtifact(artifact);
}
function safeArtifactCopyName(artifact = {}, index = 0) {
  return getGroupChatSharedAttachmentService().safeArtifactCopyName(artifact, index);
}
function ensureGroupChatSharedArtifactCopies(thread, latestUserMessage, deliveryRoot) {
  return getGroupChatSharedAttachmentService().ensureSharedArtifactCopies(thread, latestUserMessage, deliveryRoot);
}
function backendIsLocal(value, bridgeNames = []) {
  const backend = String(value || "").trim().toLowerCase();
  return !bridgeNames.includes(backend);
}
function useLocalTodoBackend() {
  return backendIsLocal(TODO_BACKEND, ["bridge", "plugin", "hermes", "hermes_todos", "kanban", "hermes_kanban"]);
}
function useKanbanTodoBackend() {
  return ["kanban", "hermes_kanban"].includes(TODO_BACKEND);
}
function directTodoCreateEnabled() {
  if (/^(0|false|no|off)$/i.test(DIRECT_TODO_CREATE_SETTING)) return false;
  if (/^(1|true|yes|on)$/i.test(DIRECT_TODO_CREATE_SETTING)) return true;
  return false;
}
function useLocalAutomationBackend() {
  return backendIsLocal(AUTOMATION_BACKEND, ["bridge", "cron", "hermes", "hermes_cron"]);
}
function useSqliteServiceStore() {
  return SERVICE_STORE_BACKEND === "sqlite";
}
function mobileSqliteStore() {
  if (!sqliteServiceStore) {
    const { createMobileSqliteStore } = require("./adapters/mobile-sqlite-store");
    sqliteServiceStore = createMobileSqliteStore({ dbPath: MOBILE_SQLITE_DB_PATH });
    sqliteServiceStore.migrate();
  }
  return sqliteServiceStore;
}
function readJsonStore(filePath, fallback) {
  ensureDataDir();
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return fallback;
  }
}
function writeJsonStore(filePath, value) {
  ensureDataDir();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, filePath);
}
function getLocalBridgeRuntimeService() {
  if (!localBridgeRuntimeService) {
    localBridgeRuntimeService = createLocalBridgeRuntimeService({
      bridgeCommandProvider,
      bridgeHostKeyPath: BRIDGE_HOST_KEY_PATH,
      bridgeHostUrl: () => BRIDGE_HOST_URL,
      compactText,
      createAutomationId: () => `auto_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`,
      cronBridgeScript: CRON_BRIDGE_SCRIPT,
      cronStdoutLimitBytes: 2_000_000,
      cronTimeoutMs: CRON_BRIDGE_TIMEOUT_MS,
      directoryBridgeScript: DIRECTORY_BRIDGE_SCRIPT,
      directoryStdoutLimitBytes: 4_000_000,
      directoryTimeoutMs: DIRECTORY_BRIDGE_TIMEOUT_MS,
      env: process.env,
      formatLocalDateTime,
      kanbanTodoBridge: () => kanbanTodoBridge,
      localAutomationStorePath: LOCAL_AUTOMATION_STORE_PATH,
      localTodoStorePath: LOCAL_TODO_STORE_PATH,
      mobileSqliteStore,
      nowIso,
      readJsonStore,
      sortJobs: webPushDeliveryService.automationListSortByLatestDeliverable,
      spawn,
      todoBridgeScript: TODO_BRIDGE_SCRIPT,
      todoStdoutLimitBytes: CRON_BRIDGE_STDOUT_LIMIT_BYTES,
      todoTimeoutMs: TODO_BRIDGE_TIMEOUT_MS,
      useKanbanTodoBackend,
      useLocalAutomationBackend,
      useLocalTodoBackend,
      useSqliteServiceStore,
      writeJsonStore,
    });
  }
  return localBridgeRuntimeService;
}
function runTodoBridge(payload) {
  return getLocalBridgeRuntimeService().runTodoBridge(payload);
}
const todoProvider = createTodoProvider({
  runBridge: runTodoBridge,
  workspacePrincipal,
  todoAssigneesForWorkspace,
  publicTodo,
  sourceName: () => useLocalTodoBackend()
    ? (useSqliteServiceStore() ? "sqlite_todos" : "local_todos")
    : (useKanbanTodoBackend() ? "hermes_kanban" : (process.env.HERMES_WEB_TODO_PLUGIN_NAME || "hermes_todos")),
});
function runCronBridge(payload) {
  return getLocalBridgeRuntimeService().runCronBridge(payload);
}
const automationProvider = createAutomationProvider({
  runBridge: runCronBridge,
  cacheTtlMs: CRON_LIST_CACHE_TTL_MS,
  cronOutputRoot: CRON_OUTPUT_ROOT,
  runLogRoot: CRON_RUN_LOG_ROOT,
  extraDeliverableRoots: () => String(process.env.HERMES_WEB_AUTOMATION_DELIVERABLE_ROOTS || "")
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean),
  normalizeLocalPath,
  isPathAllowed,
  isPathProtected: (value) => securityBoundaryProvider.isProtectedPath(value),
  mimeFor,
  findWorkspace,
  authCanAccessWorkspace,
  workspacePrincipal,
  jobMatchesOwner: cronJobMatchesOwner,
});
const externalIntegrationProvider = createExternalIntegrationProvider({
  envPaths: HERMES_ENV_PATHS,
  configPaths: HERMES_CONFIG_PATHS,
  githubCliHostsPaths: GITHUB_CLI_HOSTS_PATHS,
  googleTokenPaths: GOOGLE_TOKEN_PATHS,
  googleClientSecretPaths: GOOGLE_CLIENT_SECRET_PATHS,
  outlookGraphTokenPaths: OUTLOOK_GRAPH_TOKEN_PATHS,
});
function clearCronListCache() {
  automationProvider.clearListCache();
}
async function runCronListBridgeCached(options = {}) {
  return automationProvider.listJobs(Object.assign({ limit: 0 }, options));
}
function runDirectoryBridge(payload) {
  return getLocalBridgeRuntimeService().runDirectoryBridge(payload);
}
const skillDetailProvider = createSkillDetailProvider({
  timeoutMs: SKILL_BRIDGE_TIMEOUT_MS,
  compactText,
  spawn,
  bridgeCommand: () => {
    return bridgeCommandProvider.python(SKILL_BRIDGE_SCRIPT, [
      "HERMES_WEB_SKILLS_ROOT",
    ]);
  },
});
const kanbanExecutableProfileService = createKanbanExecutableProfileService({
  fs,
  loadGatewayPool: () => gatewayPool().load(),
  metadataPath: () => KANBAN_TODO_META_PATH,
});
const kanbanExecutableProfileForWorkspace = (...args) => kanbanExecutableProfileService.profileForWorkspace(...args);
const kanbanTodoBridge = createKanbanTodoBridge({
  command: KANBAN_COMMAND,
  baseArgs: KANBAN_COMMAND_ARGS,
  timeoutMs: KANBAN_BRIDGE_TIMEOUT_MS,
  metadataPath: KANBAN_TODO_META_PATH,
  boardForWorkspace: (workspaceId, principalId) => `workspace-${workspaceId || principalId || "default"}`,
  assigneeForWorkspace: kanbanExecutableProfileForWorkspace,
  boardNameForWorkspace: (workspaceId, principalId) => {
    const workspace = findWorkspace(workspaceId || principalId || "owner");
    return workspace?.label ? `Hermes Mobile ${workspace.label}` : `Hermes Mobile ${workspaceId || principalId || "default"}`;
  },
  workspacePathForWorkspace: (workspaceId) => {
    const root = workspaceDefaultRoot(workspaceId);
    if (!root) return "";
    const commandLooksWsl = /^(?:wsl|wsl\.exe)$/i.test(path.basename(KANBAN_COMMAND));
    if (KANBAN_WORKSPACE_PATH_STYLE === "native") return root;
    if (KANBAN_WORKSPACE_PATH_STYLE === "wsl" || commandLooksWsl) return windowsPathToWsl(root);
    return root;
  },
});
const kanbanCardProvider = createKanbanCardProvider({
  runBridge: (payload) => kanbanTodoBridge.run(payload),
  workspacePrincipal,
  assigneesForWorkspace: todoAssigneesForWorkspace,
  publicCard: publicTodo,
  sourceName: () => "hermes_kanban",
});
function workspacePrincipal(workspaceId) {
  const workspace = findWorkspace(workspaceId || "owner");
  return String(workspace?.policy?.principal_id || workspace?.id || "owner");
}
function todoAssigneesForWorkspace(workspaceId) {
  const catalog = loadCatalog();
  const source = workspacePrincipal(workspaceId);
  const allowedMap = catalog.routeMap?.principal_allowed_targets || {};
  let allowed = allowedMap[source];
  if (!Array.isArray(allowed)) allowed = allowed ? [allowed] : [source];
  const allowAll = allowed.includes("*") || source === "owner";
  const ids = new Set(allowAll ? catalog.workspaces.map((item) => item.id) : allowed.map(String));
  ids.add(source);
  return catalog.workspaces
    .filter((item) => ids.has(item.id))
    .map((item) => ({
      id: item.id,
      label: item.label || item.id,
      role: item.role || "user",
    }));
}
function pad2(value) {
  return String(value).padStart(2, "0");
}
function formatLocalDateTime(date) {
  return [
    date.getFullYear(),
    "-",
    pad2(date.getMonth() + 1),
    "-",
    pad2(date.getDate()),
    " ",
    pad2(date.getHours()),
    ":",
    pad2(date.getMinutes()),
  ].join("");
}
function todoAssigneeLabel(workspaceId, principalId) {
  return todoAssigneesForWorkspace(workspaceId).find((item) => item.id === principalId)?.label || principalId;
}
function resolveTodoAssigneeFromText(text, workspaceId) {
  const source = workspacePrincipal(workspaceId);
  const candidates = [];
  for (const item of todoAssigneesForWorkspace(workspaceId)) {
    const labels = [item.label, item.id, stripPrincipalLabelPrefixes(item.id)].filter(Boolean);
    for (const label of labels) candidates.push({ id: item.id, label: String(label) });
  }
  candidates.sort((a, b) => b.label.length - a.label.length);
  const rawText = String(text || "");
  const matched = candidates.find((item) => item.label && rawText.includes(item.label));
  return matched?.id || source;
}
const directKanbanCreateService = createDirectKanbanCreateService({
  formatLocalDateTime,
  resolveTodoAssigneeFromText,
  todoAssigneeLabel,
  stripPrincipalLabelPrefixes,
  useKanbanTodoBackend,
});
const parseTodoDueFromText = (...args) => directKanbanCreateService.parseWebTodoDueFromText(...args);
const detectDirectTodoCreateIntent = (...args) => directKanbanCreateService.detectDirectTodoCreateIntentForWeb(...args);
function parseWebTodoDueFromText(text, now = new Date()) {
  return directKanbanCreateService.parseWebTodoDueFromText(text, now);
}
function detectDirectTodoCreateIntentForWeb(text, workspaceId) {
  return directKanbanCreateService.detectDirectTodoCreateIntentForWeb(text, workspaceId);
}
function detectDirectKanbanCreateRequest(text) {
  return directKanbanCreateService.detectDirectKanbanCreateRequest(text);
}
function directTodoCreateNeedsKanbanFields(todo) {
  return directKanbanCreateService.directTodoCreateNeedsKanbanFields(todo);
}
function verifyDirectTodoCreateResult(todo) {
  return directKanbanCreateService.verifyDirectTodoCreateResult(todo);
}
function formatDirectTodoCreateSuccessMessage(intent, todo) {
  return directKanbanCreateService.formatDirectTodoCreateSuccessMessage(intent, todo);
}
function isKanbanStudyCaseMode(mode) {
  return KANBAN_STUDY_CASE_MODES.has(String(mode || "").trim());
}
function isKanbanAssessmentCaseMode(mode) {
  return KANBAN_ASSESSMENT_CASE_MODES.has(String(mode || "").trim());
}
function kanbanCaseTopicPermissionsForTaskGroup(thread, taskGroupId, auth) {
  if (!getSingleWindowThreadService().isKanbanCaseTopicThread(thread) || !taskGroupId) return null;
  const meta = getRuntimeStateNormalizationService().normalizeTaskGroupMeta(thread.taskGroupMeta)[taskGroupId] || {};
  const caseId = String(meta.kanbanCaseId || meta.kanban_case_id || "").trim();
  const ownerWorkspaceId = String(meta.kanbanCaseOwnerWorkspaceId || meta.kanban_case_owner_workspace_id || thread.workspaceId || "owner").trim() || "owner";
  if (!caseId) return null;
  const role = kanbanCaseShareService.roleForAuth(auth, ownerWorkspaceId, caseId);
  return kanbanCaseShareService.actorPermissions(role);
}
async function resolveKanbanCardAccess(req, res, workspaceId, cardId, capability = "view") {
  const id = String(workspaceId || "owner").trim() || "owner";
  if (!findWorkspace(id)) {
    sendJson(res, 400, { error: "Unknown workspace" });
    return null;
  }
  const auth = authenticateRequest(req);
  if (authCanAccessWorkspace(auth, id)) return { workspaceId: id, auth, role: "manager", context: null, card: null };
  const context = await readingContextForCard(id, cardId).catch(() => null);
  const card = context?.current || null;
  if (!card) {
    sendJson(res, 404, { error: "Kanban card not found" });
    return null;
  }
  const role = kanbanCaseShareService.roleForAuth(auth, id, card.kanbanCaseId);
  if (!role || !kanbanCaseShareService.permissionAllows(role, capability)) {
    sendJson(res, 403, { error: "Kanban card access is not allowed" });
    return null;
  }
  return { workspaceId: id, auth, role, context, card };
}
function getTodoPublicProjectionService() {
  if (!todoPublicProjectionService) {
    todoPublicProjectionService = createTodoPublicProjectionService({
      deriveKanbanWorkflowState,
      isKanbanAssessmentCaseMode,
      isKanbanStudyCaseMode,
      kanbanCardEffectiveCaseIndex,
      publicKanbanAssessmentSummary: (...args) => getAssessmentExamWorkflowService().publicKanbanAssessmentSummary(...args),
      publicKanbanCoverFile,
      publicKanbanOutputsFromText,
      publicKanbanReadingSubmissionSummary,
      visibleKanbanCaseCards,
    });
  }
  return todoPublicProjectionService;
}
function kanbanWorkflowStateCompleted(state = {}, officialDone = false) {
  return getTodoPublicProjectionService().kanbanWorkflowStateCompleted(state, officialDone);
}
function publicTodo(row, contextOrIndex = null, maybeRows = null) {
  return getTodoPublicProjectionService().publicTodo(row, contextOrIndex, maybeRows);
}
const { kanbanAssigneePolicy, kanbanCaseShareService, kanbanMaintenanceService, kanbanPlanService,
  kanbanReadingWorkflowService, kanbanStudyArtifactService, learningCardGuidanceService, naturalLanguageDraftService } = createKanbanRuntimeServices({
  authCanAccessWorkspace, automationCreateModel: AUTOMATION_CREATE_MODEL, automationTimeoutMs: AUTOMATION_CREATE_TIMEOUT_MS,
  broadcast, compactText, createAutomationDeliveryRequirement, dataDir: DATA_DIR, extractDocxText,
  extractJsonObject, fileExists: fs.existsSync, findWorkspace, hermesModelText, isKanbanStudyCaseMode, isOwnerAuth,
  kanbanCardEffectiveCaseIndex, kanbanCardListCachePath: KANBAN_CARD_LIST_CACHE_PATH, kanbanCardListCacheTtlMs: KANBAN_CARD_LIST_CACHE_TTL_MS,
  kanbanCardProvider, kanbanCardRevisionOf, kanbanCardUsesReadingTemplate: studyAssessmentService.kanbanCardUsesReadingTemplate,
  kanbanCaseSharePath: KANBAN_CASE_SHARE_PATH, kanbanDependencyReconcileIntervalMs: KANBAN_DEPENDENCY_RECONCILE_INTERVAL_MS,
  kanbanMultiAgentDefaultParallel: KANBAN_MULTI_AGENT_DEFAULT_PARALLEL, kanbanMultiAgentMaxCards: KANBAN_MULTI_AGENT_MAX_CARDS,
  kanbanMultiAgentMaxParallel: KANBAN_MULTI_AGENT_MAX_PARALLEL, kanbanMultiAgentPlanTimeoutMs: KANBAN_MULTI_AGENT_PLAN_TIMEOUT_MS,
  kanbanReadingAnalysisTimeoutMs: KANBAN_READING_ANALYSIS_TIMEOUT_MS, kanbanReadingArtifactRoot: KANBAN_READING_ARTIFACT_ROOT,
  kanbanReadingCoverMaxBytes: KANBAN_READING_COVER_MAX_BYTES, kanbanReadingQuizTargetingVersion: KANBAN_READING_QUIZ_TARGETING_VERSION,
  kanbanReadingTranscribeScript: KANBAN_READING_TRANSCRIBE_SCRIPT, kanbanReadingTranscribeTimeoutMs: KANBAN_READING_TRANSCRIBE_TIMEOUT_MS,
  kanbanSourceDocumentMaxBytes: KANBAN_SOURCE_DOCUMENT_MAX_BYTES, kanbanWorkflowStateCompleted, learningCoinAwardService, logger: console,
  maxFilePreviewChars: MAX_FILE_PREVIEW_CHARS, maxUploadBytes: MAX_UPLOAD_BYTES, maybeReconcileKanbanDependencyBlocks,
  mimeFor, mobileSqliteStore, nowIso, publicKanbanOutputFile, publicTodo, readJsonStore, runProcessText,
  safeFileName, safeStorageSegment, sanitizePolicy, textFilePreview, todoAssigneesForWorkspace, useKanbanTodoBackend,
  useSqliteServiceStore, validReasoningEfforts: VALID_REASONING_EFFORTS, visibleKanbanCaseCards, workspacePrincipal,
  writeJsonStore,
});
function normalizeKanbanNotificationAssignee(workspaceId, ...candidates) {
  return kanbanAssigneePolicy.normalizeNotificationAssignee(workspaceId, ...candidates);
}
function readingContextForCard(...args) { return kanbanReadingWorkflowService.readingContextForCard(...args); }
const kanbanOutputAccessService = createKanbanOutputAccessService({
  artifactRoot: KANBAN_READING_ARTIFACT_ROOT,
  authCanAccessWorkspace,
  caseShareService: kanbanCaseShareService,
  fs,
  isPathAllowedForThread,
  mimeFor,
  normalizeLocalPath,
  path,
  safeStorageSegment,
  workspaceDisplayPathService,
});
const kanbanOutputAccessThread = (...args) => kanbanOutputAccessService.accessThread(...args);
const kanbanOutputCaseIdFromPath = (...args) => kanbanOutputAccessService.caseIdFromPath(...args);
const authCanAccessKanbanOutput = (...args) => kanbanOutputAccessService.authCanAccess(...args);
const resolveKanbanOutputFile = (...args) => kanbanOutputAccessService.resolveFile(...args);
function getKanbanOutputProjectionService() {
  if (!kanbanOutputProjectionService) {
    kanbanOutputProjectionService = createKanbanOutputProjectionService({
      compactText,
      dateStringFromTaskLike,
      extractArtifactPaths,
      resolveKanbanOutputFile,
    });
  }
  return kanbanOutputProjectionService;
}
function publicKanbanOutputFile(workspaceId, rawPath) {
  return getKanbanOutputProjectionService().publicKanbanOutputFile(workspaceId, rawPath);
}
function publicKanbanCoverFile(workspaceId, rawCover) {
  return getKanbanOutputProjectionService().publicKanbanCoverFile(workspaceId, rawCover);
}
function publicKanbanOutputsFromText(workspaceId, text) {
  return getKanbanOutputProjectionService().publicKanbanOutputsFromText(workspaceId, text);
}
function publicKanbanReadingSubmissionSummary(workspaceId, card = {}) {
  return kanbanStudyArtifactService.publicReadingSubmissionSummary(workspaceId, card);
}
function publicKanbanCardDetail(workspaceId, detail = {}) {
  return getKanbanOutputProjectionService().publicKanbanCardDetail(workspaceId, detail);
}
function dateStringFromTaskLike(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d+(?:\.\d+)?$/.test(text)) return dateStringFromTaskLike(Number(text));
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}
function boolParam(value) {
  return /^(1|true|yes|on)$/i.test(String(value || ""));
}
function cronJobMatchesSearch(job, search) {
  if (!search) return true;
  return [
    job?.id,
    job?.name,
    job?.promptPreview,
    job?.schedule,
    job?.status,
    job?.deliver,
    job?.ownerPrincipalId,
    ...(Array.isArray(job?.skills) ? job.skills : []),
    ...(Array.isArray(job?.outputDocuments) ? job.outputDocuments.map((doc) => doc?.name || "") : []),
  ].join("\n").toLowerCase().includes(search);
}
function cronJobMatchesOwner(job, ownerPrincipalId) {
  const owner = String(job?.ownerPrincipalId || "").trim();
  const expected = String(ownerPrincipalId || "").trim();
  if (!expected) return false;
  if (owner) return owner === expected;
  return expected === "owner";
}
function responseTextFromValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(responseTextFromValue).filter(Boolean).join("");
  if (typeof value !== "object") return "";
  if (typeof value.output_text === "string") return value.output_text;
  if (typeof value.text === "string") return value.text;
  if (typeof value.content === "string") return value.content;
  return [
    responseTextFromValue(value.output),
    responseTextFromValue(value.content),
    responseTextFromValue(value.message),
    responseTextFromValue(value.response),
  ].filter(Boolean).join("");
}
function extractJsonObject(text) {
  return naturalLanguageDraftService.extractJsonObject(text);
}
async function hermesModelText(body, timeoutMs = AUTOMATION_CREATE_TIMEOUT_MS) {
  let text = "";
  const gatewayTarget = await chooseGatewayRunTarget({ purpose: "automation_draft" });
  const response = await gatewayPool().runnerFor(gatewayTarget).streamResponses(body, {
    signal: AbortSignal.timeout(Math.max(5000, timeoutMs)),
    gatewayUrl: gatewayTarget.apiBase,
    apiKey: gatewayTarget.apiKey,
    onEvent: (event) => {
      const eventName = String(event.event || event.type || "");
      if (eventName === "message.delta" || eventName === "response.output_text.delta") {
        text += String(event.delta || event.text || "");
      } else {
        text += responseTextFromValue(event.output_text || event.output || event.message || "");
      }
    },
  });
  if (!response?.body?.getReader) text += responseTextFromValue(response);
  return text.trim();
}
function runProcessText(command, args = [], options = {}) {
  return getLocalBridgeRuntimeService().runProcessText(command, args, options);
}
function normalizeAutomationDraft(raw, sourceText) {
  return naturalLanguageDraftService.normalizeAutomationDraft(raw, sourceText);
}
async function interpretAutomationNaturalLanguage(text, workspace, ownerPrincipalId) {
  return naturalLanguageDraftService.interpretAutomationNaturalLanguage(text, workspace, ownerPrincipalId);
}
function normalizeKanbanDraft(raw, sourceText, workspaceId) {
  return naturalLanguageDraftService.normalizeKanbanDraft(raw, sourceText, workspaceId);
}
async function interpretKanbanNaturalLanguage(text, workspace, ownerPrincipalId) {
  return naturalLanguageDraftService.interpretKanbanNaturalLanguage(text, workspace, ownerPrincipalId);
}
function normalizeKanbanMaxParallel(value) {
  return kanbanPlanService.normalizeMaxParallel(value);
}
function normalizeKanbanPlanReasoningEffort(value) {
  return kanbanPlanService.normalizeReasoningEffort(value);
}
function normalizeKanbanPlan(raw, sourceText, workspaceId, options = {}) {
  return kanbanPlanService.normalizePlan(raw, sourceText, workspaceId, options);
}
async function planKanbanMultiAgent(text, workspace, ownerPrincipalId, options = {}) {
  return naturalLanguageDraftService.planKanbanMultiAgent(text, workspace, ownerPrincipalId, options);
}
function kanbanPlanCardDescription(plan, card) {
  return kanbanPlanService.cardDescription(plan, card);
}
function kanbanPlanDependencyLabelsForServer(plan, card) {
  return kanbanPlanService.dependencyLabelsForServer(plan, card);
}
function kanbanSingleCardCasePayload(content, description = "", sourceText = "") {
  return kanbanPlanService.singleCardCasePayload(content, description, sourceText);
}
function getKanbanPlanCardCreationService() {
  if (!kanbanPlanCardCreationService) {
    kanbanPlanCardCreationService = createKanbanPlanCardCreationService({
      assessmentConfigLine,
      compactText,
      ensureKanbanCaseSharedDirectory,
      ensureKanbanCaseTopicThread,
      kanbanCardProvider,
      kanbanCaseTopicTitle,
      kanbanPlanCardDescription,
      kanbanPlanDependencyLabelsForServer,
      normalizeKanbanAssessmentPlan: (raw = {}, workspaceId = "owner", options = {}) => (
        studyAssessmentService.normalizeKanbanAssessmentPlan(raw, workspaceId, Object.assign({}, options, {
          assessmentMaxQuestions: KANBAN_ASSESSMENT_MAX_QUESTIONS,
          assessmentPlanMaxExams: KANBAN_ASSESSMENT_PLAN_MAX_EXAMS,
      normalizeWorkspaceIdList: (...args) => kanbanCaseShareService.normalizeWorkspaceIdList(...args),
        }))
      ),
      normalizeKanbanMaxParallel,
      normalizeKanbanNotificationAssignee,
      normalizeKanbanPlan,
      normalizeKanbanPlanReasoningEffort,
      normalizeKanbanStudyPlan: (raw = {}, workspaceId = "owner") => (
        studyAssessmentService.normalizeKanbanStudyPlan(raw, workspaceId, {
          maxSessions: KANBAN_READING_PLAN_MAX_SESSIONS,
          normalizeWorkspaceIdList: (...args) => kanbanCaseShareService.normalizeWorkspaceIdList(...args),
        })
      ),
      publicKanbanCoverFile,
      publicTodo,
      saveKanbanReadingCoverUpload: (...args) => kanbanReadingWorkflowService.saveKanbanReadingCoverUpload(...args),
      todoAssigneeLabel,
      upsertKanbanCaseShare: (...args) => kanbanCaseShareService.upsertShare(...args),
      verifyDirectTodoCreateResult,
      workspacePrincipal,
    });
  }
  return kanbanPlanCardCreationService;
}
async function createKanbanPlanCards(workspaceId, planInput, options = {}) {
  return getKanbanPlanCardCreationService().createKanbanPlanCards(workspaceId, planInput, options);
}
function getKanbanCaseTopicService() {
  if (!kanbanCaseTopicService) {
    kanbanCaseTopicService = createKanbanCaseTopicService({
      assertChildPathInside: (...args) => getDirectoryBrowserBoundaryService().assertChildPathInside(...args),
      broadcast,
      compactText,
      comparablePath,
      createSingleWindowThread: (...args) => getSingleWindowThreadService().createSingleWindowThread(...args),
      getState: () => state,
      isKanbanCaseTopicThread: (...args) => getSingleWindowThreadService().isKanbanCaseTopicThread(...args),
      makeId,
      mkdirp: (targetPath) => fs.mkdirSync(targetPath, { recursive: true }),
      normalizeChatGroup,
      normalizeLocalPath,
      normalizeTaskGroupMeta: (...args) => getRuntimeStateNormalizationService().normalizeTaskGroupMeta(...args),
      nowIso,
      pathExists: (targetPath) => fs.existsSync(targetPath),
      pathInsideAnyRoot,
      readKanbanCaseShare: (...args) => kanbanCaseShareService.readShare(...args),
      saveState,
      senderInfoForWorkspace,
      sharedDirectoriesForWorkspace,
      sharedFolderName: KANBAN_STUDY_SHARED_FOLDER_NAME,
      sortMessagesChronologically: (...args) => getSingleWindowThreadService().sortMessagesChronologically(...args),
      threadSummary,
      topicKind: KANBAN_CASE_TOPIC_KIND,
      upsertSharedDirectory,
      workspaceDefaultRoot,
      workspacePrincipal,
    });
  }
  return kanbanCaseTopicService;
}
function kanbanCaseTopicTitle(plan = {}) {
  return getKanbanCaseTopicService().caseTopicTitle(plan);
}
function kanbanStableTextKey(value, fallback = "item") {
  return getKanbanCaseTopicService().stableTextKey(value, fallback);
}
function kanbanLearnerRootDirectory(ownerWorkspaceId, ownerRoot, plan = {}) {
  return getKanbanCaseTopicService().learnerRootDirectory(ownerWorkspaceId, ownerRoot, plan);
}
function ensureKanbanCaseSharedDirectory(ownerWorkspaceId, plan = {}) {
  return getKanbanCaseTopicService().ensureSharedDirectory(ownerWorkspaceId, plan);
}
function ensureKanbanCaseTopicThread(ownerWorkspaceId, plan = {}, directoryInfo = null) {
  return getKanbanCaseTopicService().ensureTopicThread(ownerWorkspaceId, plan, directoryInfo);
}
function normalizeKanbanAssessmentSubjectId(value = "") {
  return studyAssessmentService.normalizeKanbanAssessmentSubjectId(value);
}
function getAssessmentExamWorkflowService() {
  if (!assessmentExamWorkflowService) {
    assessmentExamWorkflowService = createAssessmentExamWorkflowService({
      assessmentExamService,
      automationCreateModel: AUTOMATION_CREATE_MODEL,
      compactText,
      extractJsonObject,
      findWorkspace,
      hermesModelText,
      isKanbanAssessmentCaseMode,
      isKanbanStudyCaseMode,
      kanbanCardEffectiveCaseIndex,
      kanbanCardProvider,
      kanbanCardRevisionOf,
      kanbanWorkflowStateCompleted,
      learningCoinAwardService,
      logger: console,
      maxQuestions: KANBAN_ASSESSMENT_MAX_QUESTIONS,
      maybeReconcileKanbanDependencyBlocks,
      modelTimeoutMs: KANBAN_ASSESSMENT_MODEL_TIMEOUT_MS,
      normalizeKanbanAssessmentSubjectId,
      nowIso,
      publicTodo,
      randomHex: (bytes) => crypto.randomBytes(bytes).toString("hex"),
      readingContextForCard,
      safeFileName,
      sanitizePolicy,
      visibleKanbanCaseCards,
      artifactService: kanbanStudyArtifactService,
    });
  }
  return assessmentExamWorkflowService;
}
async function maybeReconcileKanbanDependencyBlocks(workspaceId, options = {}) {
  return kanbanMaintenanceService.maybeReconcileDependencyBlocks(workspaceId, options);
}
function readKanbanCardListCache(args = {}) {
  return kanbanMaintenanceService.readCardListCache(args);
}
function writeKanbanCardListCache(args = {}, payload = {}) {
  kanbanMaintenanceService.writeCardListCache(args, payload);
}
function clearKanbanCardListCache(workspaceId = "") {
  kanbanMaintenanceService.clearCardListCache(workspaceId);
}
function scheduleKanbanDependencyReconcile(workspaceId) {
  return kanbanMaintenanceService.scheduleDependencyReconcile(workspaceId);
}
function todoErrorResponse(res, result, fallbackStatus = 400) {
  sendJson(res, fallbackStatus, { error: result?.error || "Todo operation failed", result });
}
function kanbanErrorResponse(res, result, fallbackStatus = 400) {
  sendJson(res, fallbackStatus, { error: result?.error || "Kanban operation failed", result });
}
function mimeFor(file) { return httpRuntimeService.mimeFor(file); }
function contentDisposition(disposition, filename) { return httpRuntimeService.contentDisposition(disposition, filename); }
function loadVapidConfig() {
  return webPushDeliveryService.loadVapidConfig();
}
function initializeWebPush() {
  return webPushDeliveryService.initializeWebPush();
}
function generateWebPushVapidConfig(options = {}) {
  return webPushDeliveryService.generateWebPushVapidConfig(options);
}
function reloadWebPush() {
  return webPushDeliveryService.initializeWebPush();
}
function extractDocxText(filePath) {
  return documentPreviewService.extractDocxText(filePath);
}
function textFilePreview(filePath) {
  return documentPreviewService.textFilePreview(filePath);
}
function textBufferPreview(buffer) {
  return documentPreviewService.textBufferPreview(buffer);
}
function serveStatic(req, res) { return httpRuntimeService.serveStatic(req, res); }
function readJsonFirst(paths, fallback = {}) {
  for (const candidate of paths) {
    const p = String(candidate || "").trim();
    if (!p) continue;
    try {
      bootTrace(`readJsonFirst candidate ${isUncPath(p) ? "unc" : "local"} ${path.basename(p) || "root"}`);
      if (!fs.existsSync(p)) continue;
      bootTrace(`readJsonFirst exists ${path.basename(p) || "root"}`);
      const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
      bootTrace(`readJsonFirst parsed ${path.basename(p) || "root"}`);
      return { data: parsed, path: p };
    } catch (_) {
      // Try the next candidate. Recovery copies can be stale or damaged.
    }
  }
  return { data: fallback, path: "" };
}
function getSharedDirectoryProjectionService(...args) { return getRuntimeWorkspaceCatalogService().getSharedDirectoryProjectionService(...args); }
function sharedDirectoryLabel(...args) { return getRuntimeWorkspaceCatalogService().sharedDirectoryLabel(...args); }
function normalizeSharePermission(...args) { return getRuntimeWorkspaceCatalogService().normalizeSharePermission(...args); }
function normalizeShareTargets(...args) { return getRuntimeWorkspaceCatalogService().normalizeShareTargets(...args); }
function normalizeShareScope(...args) { return getRuntimeWorkspaceCatalogService().normalizeShareScope(...args); }
function sharedDirectoryRoots(...args) { return getRuntimeWorkspaceCatalogService().sharedDirectoryRoots(...args); }
function publicSharedDirectory(...args) { return getRuntimeWorkspaceCatalogService().publicSharedDirectory(...args); }
function removeSharedDirectoryRecord(...args) { return getRuntimeWorkspaceCatalogService().removeSharedDirectoryRecord(...args); }
function sharedDirectoriesForWorkspace(...args) { return getRuntimeWorkspaceCatalogService().sharedDirectoriesForWorkspace(...args); }
function updateSharedDirectoryAccess(...args) { return getRuntimeWorkspaceCatalogService().updateSharedDirectoryAccess(...args); }
function upsertSharedDirectory(...args) { return getRuntimeWorkspaceCatalogService().upsertSharedDirectory(...args); }
function sanitizePolicy(policy, hardeningOptions = {}) {
  return securityBoundaryProvider.hardenAccessPolicy(accessPolicyProvider.sanitize(policy), hardeningOptions);
}
function getWorkspaceProjectProvider(...args) { return getRuntimeWorkspaceCatalogService().getWorkspaceProjectProvider(...args); }
function invalidateCatalogCache(...args) { return getRuntimeWorkspaceCatalogService().invalidateCatalogCache(...args); }
function loadCatalog(...args) { return getRuntimeWorkspaceCatalogService().loadCatalog(...args); }
function mergeDefaultExternalAccessPolicy(...args) { return getRuntimeWorkspaceCatalogService().mergeDefaultExternalAccessPolicy(...args); }
function mergeAccessPolicyOverride(...args) { return getRuntimeWorkspaceCatalogService().mergeAccessPolicyOverride(...args); }
function buildAccessPolicy(...args) { return getRuntimeWorkspaceCatalogService().buildAccessPolicy(...args); }
function sharedDirectoryProjectsForWorkspace(...args) { return getRuntimeWorkspaceCatalogService().sharedDirectoryProjectsForWorkspace(...args); }
function projectsForWorkspace(...args) { return getRuntimeWorkspaceCatalogService().projectsForWorkspace(...args); }
function cachedDynamicProjectsForWorkspace(...args) { return getRuntimeWorkspaceCatalogService().cachedDynamicProjectsForWorkspace(...args); }
function setDynamicProjectsForWorkspace(...args) { return getRuntimeWorkspaceCatalogService().setDynamicProjectsForWorkspace(...args); }
function allProjectsForWorkspaceSync(...args) { return getRuntimeWorkspaceCatalogService().allProjectsForWorkspaceSync(...args); }
function publicProjectsForWorkspace(...args) { return getRuntimeWorkspaceCatalogService().publicProjectsForWorkspace(...args); }
function isShareableRootProject(...args) { return getRuntimeWorkspaceCatalogService().isShareableRootProject(...args); }
function shareableRootProjectForPath(...args) { return getRuntimeWorkspaceCatalogService().shareableRootProjectForPath(...args); }
function remoteWorkspaceDirectoryProjects(...args) { return getRuntimeWorkspaceCatalogService().remoteWorkspaceDirectoryProjects(...args); }
const dedupeProjects = (...args) => projectDiscoveryProvider.dedupeProjects(...args);
function findWorkspace(...args) { return getRuntimeWorkspaceCatalogService().findWorkspace(...args); }
function findProject(...args) { return getRuntimeWorkspaceCatalogService().findProject(...args); }
function findSubproject(...args) { return getRuntimeWorkspaceCatalogService().findSubproject(...args); }
function effectiveProjectForThread(...args) { return getRuntimeWorkspaceCatalogService().effectiveProjectForThread(...args); }
function policyForThread(...args) { return getRuntimeWorkspaceCatalogService().policyForThread(...args); }
function getSingleWindowThreadService() {
  if (!singleWindowThreadService) {
    singleWindowThreadService = createSingleWindowThreadService({
      chatGroupMemberWorkspaceIds,
      findProject,
      findWorkspace,
      kanbanCaseTopicKind: KANBAN_CASE_TOPIC_KIND,
      makeId,
      normalizeChatGroup,
      normalizeExternalDelivery: (...args) => getRuntimeStateNormalizationService().normalizeExternalDelivery(...args),
      normalizeExternalIngress: (...args) => getRuntimeStateNormalizationService().normalizeExternalIngress(...args),
      normalizeTaskGroupMeta: (...args) => getRuntimeStateNormalizationService().normalizeTaskGroupMeta(...args),
      normalizeThread: (...args) => getRuntimeStateNormalizationService().normalizeThread(...args),
      nowIso,
      saveState,
      singleWindowChatTaskGroupId: SINGLE_WINDOW_CHAT_TASK_GROUP_ID,
      singleWindowGroupChatTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
      singleWindowProjectId: SINGLE_WINDOW_PROJECT_ID,
      singleWindowThreadTitle: SINGLE_WINDOW_THREAD_TITLE,
      state: () => state,
      taskGroupOwnerWorkspaceId,
      taskGroupsForThread,
      threadAccessibleToAuth: (...args) => getRuntimeStateThreadService().threadAccessibleToAuth(...args),
      weixinIngressProvider,
    });
  }
  return singleWindowThreadService;
}
function workspaceLabel(workspaceId) {
  const workspace = findWorkspace(String(workspaceId || ""));
  return workspace?.label || workspace?.id || String(workspaceId || "");
}
function senderInfoForWorkspace(workspaceId) {
  const id = String(workspaceId || "owner").trim() || "owner";
  return {
    senderWorkspaceId: id,
    senderPrincipalId: workspacePrincipal(id),
    senderLabel: workspaceLabel(id),
  };
}
function publicChatGroup(thread) {
  const group = normalizeChatGroup(thread?.chatGroup || {}, thread?.workspaceId || "owner");
  return {
    enabled: group.enabled,
    kind: group.kind || "",
    topicKey: group.topicKey || "",
    memberWorkspaceIds: group.memberWorkspaceIds,
    members: group.memberWorkspaceIds.map((workspaceId) => ({
      workspaceId,
      label: workspaceLabel(workspaceId),
    })),
    createdAt: group.createdAt || "",
    updatedAt: group.updatedAt || "",
  };
}
function ownerExternalInterfaceBindings() {
  return externalIntegrationProvider.ownerInterfaceBindings();
}
function ownerExternalAccessPolicy() {
  return externalIntegrationProvider.ownerAccessPolicy();
}
function publicWorkspace(workspace) {
  return getWorkspacePublicProjectionService().publicWorkspace(workspace);
}
function publicAccessKeyStatus(workspace, record = null) {
  return authProvider.publicAccessKeyStatus(workspace, record);
}
function listWorkspaceAccessKeyStatuses(auth, options = {}) {
  return authProvider.listWorkspaceAccessKeyStatuses(auth, options);
}
function rotateWorkspaceAccessKey(workspaceId, options = {}) {
  return authProvider.rotateWorkspaceAccessKey(workspaceId, options);
}
function revokeWorkspaceAccessKey(workspaceId, options = {}) {
  return authProvider.revokeWorkspaceAccessKey(workspaceId, options);
}
function rotateGlobalAccessKey(options = {}) {
  return authProvider.rotateGlobalAccessKey(options);
}
function pathInsideAnyRoot(candidate, roots) {
  const normalized = comparablePath(candidate);
  return (roots || []).some((root) => {
    const r = comparablePath(root);
    return normalized === r || normalized.startsWith(`${r}/`);
  });
}
function pathRelativePartsUnderRoot(candidate, root) {
  const normalized = comparablePath(candidate);
  const r = comparablePath(root);
  if (!normalized || !r || normalized === r || !normalized.startsWith(`${r}/`)) return null;
  return normalized.slice(r.length + 1).split("/").filter(Boolean);
}
function pathDirectChildOfRoot(candidate, root) {
  const parts = pathRelativePartsUnderRoot(candidate, root);
  return Boolean(parts && parts.length === 1);
}
function comparablePath(value) {
  let p = String(value || "").trim().replaceAll("\\", "/");
  p = p.replace(/^\/\/wsl(?:\.localhost|\$)?\/[^/]+/i, "");
  p = p.replace(/^\/mnt\/([a-zA-Z])\//, (_, drive) => `${drive.toLowerCase()}:/`);
  p = p.replace(/^([A-Z]):\//, (_, drive) => `${drive.toLowerCase()}:/`);
  if (/^[a-z]:\//i.test(p)) p = path.win32.normalize(p).replaceAll("\\", "/").replace(/^([A-Z]):\//, (_, drive) => `${drive.toLowerCase()}:/`);
  else if (p.startsWith("/")) p = path.posix.normalize(p);
  else p = path.posix.normalize(p);
  return p.replace(/\/+$/, "").toLowerCase();
}
function searchableText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}
function getSemanticDirectoryAttachmentService() {
  if (!semanticDirectoryAttachmentService) {
    semanticDirectoryAttachmentService = createSemanticDirectoryAttachmentService({
      allProjectsForWorkspaceSync,
      comparablePath,
      dedupe,
      directoryRouteDisplayLabel: (...args) => workspaceDisplayPathService.directoryRouteDisplayLabel(...args),
      effectiveProjectForThread,
      findProject,
      findSubproject,
      genericDirectoryAliasInstruction: "If a semantic project match exists, do not emit a generic `目录别名：默认目录=...`; emit the matched project alias/path instead.",
      genericOwnerTopicProjectIds: [...GENERIC_OWNER_TOPIC_PROJECT_IDS],
      genericOwnerTopicProjectPrefixes: GENERIC_OWNER_TOPIC_PROJECT_PREFIXES,
      isDirectoryBrowserPathAllowedForThread,
      isSingleWindowConversationTaskGroupId,
      loadCatalog,
      logicalDirectoryDisplayPath: (...args) => workspaceDisplayPathService.logicalDirectoryDisplayPath(...args),
      normalizeLocalPath,
      searchableText,
      singleWindowProjectId: SINGLE_WINDOW_PROJECT_ID,
      textIncludesPath,
    });
  }
  return semanticDirectoryAttachmentService;
}
function formatAccessPolicyInstructionSummary(policy = {}) {
  return gatewayRunInstructionService.formatAccessPolicyInstructionSummary(policy);
}
function policyHasToolset(policy = {}, toolset = "") {
  return gatewayRunInstructionService.policyHasToolset(policy, toolset);
}
function callableFunctionHintsForToolsets(toolsets = []) {
  return gatewayRunInstructionService.callableFunctionHintsForToolsets(toolsets);
}
const GATEWAY_TOOL_SCHEMA_EPOCH = "20260513-audio-file-v1";
const gatewayRunInstructionService = createGatewayRunInstructionService({
  dedupe,
  toolSchemaEpoch: GATEWAY_TOOL_SCHEMA_EPOCH,
  normalizeSingleWindowMode,
  createDeliveryBoundaryInstructions,
  permissionBoundarySkillInstructions: (policy) => securityBoundaryProvider.permissionBoundarySkillInstructions(policy),
  semanticProjectRoutingInstructions: (...args) => getSemanticDirectoryAttachmentService().semanticProjectRoutingInstructions(...args),
  isKanbanCaseTopicThread: (...args) => getSingleWindowThreadService().isKanbanCaseTopicThread(...args),
});
const conversationHistoryService = createConversationHistoryService({
  policyHasToolset,
  compactText,
  isSingleWindowConversationTaskGroupId,
  maxHistoryMessages: MAX_HISTORY_MESSAGES,
  chatContextMaxMessages: CHAT_CONTEXT_MAX_MESSAGES,
  chatContextMaxChars: CHAT_CONTEXT_MAX_CHARS,
  maxApiTextChars: MAX_API_TEXT_CHARS,
});
function gatewayConversationId(thread, userMessage, runPolicy = {}) {
  return gatewayRunInstructionService.gatewayConversationId(thread, userMessage, runPolicy);
}
function currentToolSchemaOverrideInstructions(policy = {}) {
  return gatewayRunInstructionService.currentToolSchemaOverrideInstructions(policy);
}
function buildHermesInstructions(thread, policy, project, latestText = "", taskDirectory = null, options = {}) {
  return gatewayRunInstructionService.buildHermesInstructions(thread, policy, project, latestText, taskDirectory, options);
}
function safeFileName(value) {
  return fileArtifactAccessService.safeFileName(value);
}
function safeDirectoryName(value) {
  return fileArtifactAccessService.safeDirectoryName(value);
}
function uniqueChildPath(parentPath, filename) {
  return fileArtifactAccessService.uniqueChildPath(parentPath, filename);
}
function workspaceDefaultRoot(workspaceId) {
  return fileArtifactAccessService.workspaceDefaultRoot(workspaceId);
}
function threadUploadRoot(thread) {
  return fileArtifactAccessService.threadUploadRoot(thread);
}
function workspaceUploadRoot(workspaceId, threadId) {
  return fileArtifactAccessService.workspaceUploadRoot(workspaceId, threadId);
}
function uploadWorkspaceAllowedForThread(thread, workspaceId) {
  return fileArtifactAccessService.uploadWorkspaceAllowedForThread(thread, workspaceId);
}
function uploadWorkspaceIdForRequest(auth, thread, body = {}) {
  return fileArtifactAccessService.uploadWorkspaceIdForRequest(auth, thread, body);
}
function uploadRootsForThread(thread) {
  return fileArtifactAccessService.uploadRootsForThread(thread);
}
function workspaceUploadDirectoryForRequest(auth, thread, body = {}) {
  return fileArtifactAccessService.workspaceUploadDirectoryForRequest(auth, thread, body);
}
function registerUploadArtifact(thread, message, filePath, originalName, options = {}) {
  return fileArtifactAccessService.registerUploadArtifact(thread, message, filePath, originalName, options);
}
function publicArtifactFromClient(value) {
  return fileArtifactAccessService.publicArtifactFromClient(value);
}
function attachUploadedArtifactsToMessage(thread, message) {
  return fileArtifactAccessService.attachUploadedArtifactsToMessage(thread, message);
}
function getArtifactTextRegistrationService() {
  if (!artifactTextRegistrationService) {
    artifactTextRegistrationService = createArtifactTextRegistrationService({
      dedupe,
      effectiveProjectForThread,
      extractArtifactPaths,
      findProject,
      findSubproject,
      isPathAllowedForThread,
      makeId,
      mimeFor,
      normalizeLocalPath,
      nowIso,
      sourceMarkdownSearchCache,
      sourceMarkdownSearchLimit: SOURCE_MARKDOWN_SEARCH_LIMIT,
      state: () => state,
    });
  }
  return artifactTextRegistrationService;
}
function compactArtifactForMessage(value) {
  return getArtifactTextRegistrationService().compactArtifactForMessage(value);
}
function compactArtifactPathKey(value) {
  return getArtifactTextRegistrationService().compactArtifactPathKey(value);
}
function compactArtifactStemKey(value) {
  return getArtifactTextRegistrationService().compactArtifactStemKey(value);
}
function publicMarkdownPreviewArtifact(thread, rawPath, baseId = "") {
  return getArtifactTextRegistrationService().publicMarkdownPreviewArtifact(thread, rawPath, baseId);
}
function sourceMarkdownSearchRoots(thread) {
  return getArtifactTextRegistrationService().sourceMarkdownSearchRoots(thread);
}
function findMarkdownByStemUnderRoot(root, stem) {
  return getArtifactTextRegistrationService().findMarkdownByStemUnderRoot(root, stem);
}
function findSourceMarkdownForArtifact(thread, value) {
  return getArtifactTextRegistrationService().findSourceMarkdownForArtifact(thread, value);
}
function companionMarkdownPathForArtifact(thread, value) {
  return getArtifactTextRegistrationService().companionMarkdownPathForArtifact(thread, value);
}
function findThreadForMessage(message) {
  return getArtifactTextRegistrationService().findThreadForMessage(message);
}
function compactArtifactsForMessage(message, thread = null) {
  return getArtifactTextRegistrationService().compactArtifactsForMessage(message, thread);
}
function getWeixinRuntimeCompositionService() {
  if (!weixinRuntimeCompositionService) {
    weixinRuntimeCompositionService = createWeixinRuntimeCompositionService({
      attachmentContextWindowMs: WEIXIN_INGRESS_ATTACHMENT_CONTEXT_WINDOW_MS,
      authCanAccessWorkspace,
      bridgeFileBuffer: (...args) => fileResponseService.bridgeFileBuffer(...args),
      broadcast,
      chatGroupMemberWorkspaceIds,
      classifyMaintenanceIntent: (text) => securityBoundaryProvider.classifyMaintenanceIntent(text),
      compactMessage,
      compactText,
      compactThread,
      dataDir: DATA_DIR,
      deliveryId: (threadId, messageId) => weixinIngressProvider.deliveryId(threadId, messageId),
      egressDecide: (payload) => egressPolicyProvider.decide(payload),
      egressPolicyProvider,
      ensureThreadForEvent: (event, workspaceId) => getSingleWindowThreadService().ensureWeixinSingleWindowThread(workspaceId, event),
      ensureWeixinSingleWindowThread: (...args) => getSingleWindowThreadService().ensureWeixinSingleWindowThread(...args),
      findExistingIngressEvent: (...args) => getRuntimeStateThreadService().findExistingWeixinIngressEvent(...args),
      findThreadForAuth: (...args) => getRuntimeStateThreadService().findThreadForAuth(...args),
      findWorkspace,
      forwardMarkdownMaxBytes: WEIXIN_FORWARD_MARKDOWN_MAX_BYTES,
      hashValue,
      ingressKeyPaths: WEIXIN_INGRESS_KEY_PATHS,
      isOwnerAuth,
      isStaleHttpToolAvailabilityClaim,
      isStaleImageToolAvailabilityClaim,
      isWeixinSingleWindowThread: (...args) => getSingleWindowThreadService().isWeixinSingleWindowThread(...args),
      makeId,
      maxMessageChars: MAX_MESSAGE_CHARS,
      mimeFor,
      normalizeExternalDelivery: (...args) => getRuntimeStateNormalizationService().normalizeExternalDelivery(...args),
      normalizeExternalIngress: (...args) => getRuntimeStateNormalizationService().normalizeExternalIngress(...args),
      normalizeLocalPath,
      nowIso,
      removeThreadActiveRun,
      resolveArtifactForRequest,
      resolveAuthorizedCronDeliverableFile,
      resolveAuthorizedCronOutputFile,
      resolveFileForBrowserRequest,
      resolveKanbanOutputFile,
      retryBaseMs: WEIXIN_DELIVERY_RETRY_BASE_MS,
      retryLimit: WEIXIN_DELIVERY_RETRY_LIMIT,
      retryMaxMs: WEIXIN_DELIVERY_RETRY_MAX_MS,
      runConcurrencyError,
      safeFileName,
      saveState,
      sendJson,
      senderInfoForWorkspace,
      singleWindowChatTaskGroupId: SINGLE_WINDOW_CHAT_TASK_GROUP_ID,
      spawnSync,
      startRunForThread,
      state: () => state,
      taskGroupHasRunningRun,
      taskGroupId: SINGLE_WINDOW_CHAT_TASK_GROUP_ID,
      threadAccessibleToAuth: (...args) => getRuntimeStateThreadService().threadAccessibleToAuth(...args),
      threadSummary,
      weixinIngressProvider,
      workspaceLabel,
    });
  }
  return weixinRuntimeCompositionService;
}
const requireWeixinIngress = (...args) => getWeixinRuntimeCompositionService().requireWeixinIngress(...args);
const weixinIngressIsAttachmentOnlyEvent = (...args) => getWeixinRuntimeCompositionService().weixinIngressIsAttachmentOnlyEvent(...args);
const consumeWeixinPendingAttachmentMessages = (...args) => getWeixinRuntimeCompositionService().consumeWeixinPendingAttachmentMessages(...args);
const weixinIngressInstructions = (...args) => getWeixinRuntimeCompositionService().weixinIngressInstructions(...args);
const enqueueExternalDeliveryForTerminalMessage = (...args) => getWeixinRuntimeCompositionService().enqueueExternalDeliveryForTerminalMessage(...args);
function publicWeixinOutboundDelivery(...args) {
  return getWeixinRuntimeCompositionService().publicWeixinOutboundDelivery(...args);
}
const weixinTargetFromWorkspace = (...args) => getWeixinRuntimeCompositionService().weixinTargetFromWorkspace(...args);
const collectRecentWeixinForwardTargets = (...args) => getWeixinRuntimeCompositionService().collectRecentWeixinForwardTargets(...args);
const weixinForwardTargetsForWorkspace = (...args) => getWeixinRuntimeCompositionService().weixinForwardTargetsForWorkspace(...args);
const resolveWeixinForwardTarget = (...args) => getWeixinRuntimeCompositionService().resolveWeixinForwardTarget(...args);
const resolveFileFromSourceUrlForRequest = (...args) => getWeixinRuntimeCompositionService().resolveFileFromSourceUrlForRequest(...args);
const resolveWeixinForwardFile = (...args) => getWeixinRuntimeCompositionService().resolveWeixinForwardFile(...args);
const publicArtifactForWeixinForward = (...args) => getWeixinRuntimeCompositionService().publicArtifactForWeixinForward(...args);
const createWeixinFileForwardDelivery = (...args) => getWeixinRuntimeCompositionService().createWeixinFileForwardDelivery(...args);
const redactWeixinRunErrorText = (...args) => getWeixinRuntimeCompositionService().redactWeixinRunErrorText(...args);
function userFacingWeixinRunError(err) {
  const raw = redactWeixinRunErrorText(err?.message || err).trim();
  if (!raw) return "Hermes run failed before producing a reply.";
  if (/terminated|cancelled|canceled|aborted/i.test(raw)) {
    return "运行被终止，未生成回复。";
  }
  return raw;
}
const weixinDeliveryRetryCount = (...args) => getWeixinRuntimeCompositionService().weixinDeliveryRetryCount(...args);
const weixinDeliveryRetryDelayMs = (...args) => getWeixinRuntimeCompositionService().weixinDeliveryRetryDelayMs(...args);
const isWeixinInboundWakeRequiredFailure = (...args) => getWeixinRuntimeCompositionService().isWeixinInboundWakeRequiredFailure(...args);
const isWeixinDeliveryRetryable = (...args) => getWeixinRuntimeCompositionService().isWeixinDeliveryRetryable(...args);
const weixinDeliveryMatchesInboundEvent = (...args) => getWeixinRuntimeCompositionService().weixinDeliveryMatchesInboundEvent(...args);
const wakeWeixinOutboundDeliveriesForInboundEvent = (...args) => getWeixinRuntimeCompositionService().wakeWeixinOutboundDeliveriesForInboundEvent(...args);
const pendingWeixinOutboundDeliveries = (...args) => getWeixinRuntimeCompositionService().pendingWeixinOutboundDeliveries(...args);
const ackWeixinOutboundDelivery = (...args) => getWeixinRuntimeCompositionService().ackWeixinOutboundDelivery(...args);
const startWeixinIngressEvent = (...args) => getWeixinRuntimeCompositionService().startWeixinIngressEvent(...args);
function threadSummary(thread) {
  return threadViewService.threadSummary(thread);
}
function taskGroupsForThread(thread) {
  return threadViewService.taskGroupsForThread(thread);
}
function messageOwnerWorkspaceId(message, fallback = "") {
  return threadViewService.messageOwnerWorkspaceId(message, fallback);
}
function taskGroupOwnerWorkspaceId(group, fallback = "") {
  return threadViewService.taskGroupOwnerWorkspaceId(group, fallback);
}
function taskGroupTaskId(group) {
  return threadViewService.taskGroupTaskId(group);
}
function taskGroupPrompt(group) {
  return threadViewService.taskGroupPrompt(group);
}
function taskGroupTitle(group) {
  return threadViewService.taskGroupTitle(group);
}
function taskGroupPreview(group) {
  return threadViewService.taskGroupPreview(group);
}
function taskGroupStatus(group) {
  return threadViewService.taskGroupStatus(group);
}
function taskGroupHaystack(group) {
  return threadViewService.taskGroupHaystack(group);
}
function textIncludesPath(text, root) {
  return threadViewService.textIncludesPath(text, root);
}
function taskGroupMatchesProject(group, project, subproject = null) {
  return threadViewService.taskGroupMatchesProject(group, project, subproject);
}
function singleWindowProjectTaskSummaries(workspaceId, project, subproject, search = "") {
  return threadViewService.singleWindowProjectTaskSummaries(workspaceId, project, subproject, search);
}
function messagesForThreadMode(thread, options = {}) {
  return threadViewService.messagesForThreadMode(thread, options);
}
function messagePageTaskGroupId(options = {}) {
  return threadViewService.messagePageTaskGroupId(options);
}
function threadMessagesPage(thread, options = {}) {
  return threadViewService.threadMessagesPage(thread, options);
}
function searchThreadMessages(thread, options = {}) {
  return threadViewService.searchThreadMessages(thread, options);
}
function compactThread(thread, options = {}) {
  return threadViewService.compactThread(thread, options);
}
function compactThreadWithMessagePage(thread, options = {}) {
  return threadViewService.compactThreadWithMessagePage(thread, options);
}
function compactMessage(message, thread = null) {
  return threadViewService.compactMessage(message, thread);
}
function compactText(value, maxChars) {
  const text = String(value || "");
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.45);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n\n[truncated: ${text.length} chars total]\n\n${text.slice(-tail)}`;
}
function compactEventPreview(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value || "");
  }
}
function addThreadEvent(thread, event) {
  thread.events = thread.events || [];
  thread.events.push({
    event: String(event.event || event.type || "event"),
    timestamp: event.timestamp || Date.now() / 1000,
    runId: event.runId || event.run_id || null,
    tool: event.tool || null,
    preview: compactText(compactEventPreview(event.preview || event.text || event.error || ""), MAX_EVENT_PREVIEW_CHARS),
    duration: event.duration || null,
    error: Boolean(event.error),
  });
  if (thread.events.length > MAX_STORED_EVENTS_PER_THREAD) {
    thread.events = thread.events.slice(-MAX_STORED_EVENTS_PER_THREAD);
  }
}
function broadcast(payload) {
  eventFanoutService.broadcast(payload);
}
function payloadWorkspaceId(payload) {
  return eventFanoutService.payloadWorkspaceId(payload);
}
function clientCanReceivePayload(client, payload) {
  return eventFanoutService.clientCanReceivePayload(client, payload);
}
function appRouteUrl(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const text = String(value ?? "").trim();
    if (text) query.set(key, text);
  }
  const serialized = query.toString();
  return serialized ? `/?${serialized}` : "/";
}
function groupMessageRevoker(auth) {
  const workspaceId = isOwnerAuth(auth) ? "owner" : String(auth?.workspaceId || "").trim();
  return senderInfoForWorkspace(workspaceId || "owner");
}
function canRevokeGroupChatMessage(auth, thread, message) {
  if (!auth?.ok || !thread?.singleWindow || !message) return false;
  if (message.role !== "user") return false;
  if (message.taskGroupId !== SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID) return false;
  if (message.revokedAt) return false;
  if (isOwnerAuth(auth)) return true;
  const workspaceId = String(auth.workspaceId || "").trim();
  return Boolean(workspaceId && workspaceId === String(message.senderWorkspaceId || "").trim());
}
function groupAssistantReplyForUserMessage(thread, userMessage) {
  const messages = thread?.messages || [];
  const index = messages.findIndex((message) => message.id === userMessage?.id);
  if (index < 0) return null;
  const assistant = messages[index + 1];
  if (
    assistant?.role === "assistant"
    && assistant.taskGroupId === SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID
    && assistant.messageKind !== "plain"
  ) {
    return assistant;
  }
  return null;
}
function revokeGroupMessagePayload(message, now, revoker, text) {
  message.content = text || GROUP_MESSAGE_REVOKED_TEXT;
  message.revokedAt = now;
  message.revokedByWorkspaceId = revoker.senderWorkspaceId || "";
  message.revokedByPrincipalId = revoker.senderPrincipalId || "";
  message.revokedByLabel = revoker.senderLabel || "";
  message.error = null;
  message.artifacts = [];
  message.usage = null;
  message.directoryAliases = [];
  message.directoryRoute = null;
  message.updatedAt = now;
}
function workspaceIdForPrincipal(principalId) {
  const principal = String(principalId || "owner").trim() || "owner";
  const workspace = loadCatalog().workspaces.find((item) => {
    const itemPrincipal = String(item?.policy?.principal_id || item?.id || "").trim() || "owner";
    return item.id === principal || itemPrincipal === principal;
  });
  return workspace?.id || (principal === "owner" ? "owner" : principal);
}
async function getHermesStatus() {
  const status = await singleGatewayRunner().status();
  let poolStatus = null;
  try {
    poolStatus = await gatewayPool().status();
    status.gatewayPool = poolStatus;
  } catch (err) {
    status.gatewayPool = { enabled: false, error: err.message || String(err) };
  }
  if (!status.ok && gatewayPoolStatusHealthy(poolStatus)) {
    status.fallbackError = status.error || "";
    status.error = null;
    status.health = status.health || { status: "ok", platform: "gateway-pool" };
    status.ok = true;
  }
  return status;
}
function isToolUnavailableClaimText(text) {
  return conversationHistoryService.isToolUnavailableClaimText(text);
}
function isStaleHttpToolAvailabilityClaim(text) {
  return conversationHistoryService.isStaleHttpToolAvailabilityClaim(text);
}
function isStaleImageToolAvailabilityClaim(text) {
  return conversationHistoryService.isStaleImageToolAvailabilityClaim(text);
}
function isStaleDocxToolAvailabilityClaim(text) {
  return conversationHistoryService.isStaleDocxToolAvailabilityClaim(text);
}
function isStaleAudioToolAvailabilityClaim(text) {
  return conversationHistoryService.isStaleAudioToolAvailabilityClaim(text);
}
function isOrdinaryToolSchemaElevationRequest(approvalRequest, output, message = {}) {
  if (!approvalRequest?.elevationRequired) return false;
  const scope = String(approvalRequest.elevationScope || "").trim();
  if (scope && scope !== "owner_high_privilege") return false;
  const text = String(output || "");
  const runPolicy = message?.runOptions?.access_policy_context || message?.runOptions?.accessPolicyContext || {};
  return (
    (policyHasToolset(runPolicy, "image_gen") && isStaleImageToolAvailabilityClaim(text))
    || (policyHasToolset(runPolicy, "http") && isStaleHttpToolAvailabilityClaim(text))
    || (policyHasToolset(runPolicy, "file") && isStaleDocxToolAvailabilityClaim(text))
    || (policyHasToolset(runPolicy, "file") && isStaleAudioToolAvailabilityClaim(text))
  );
}
function conversationHistoryContentForMessage(msg, policy = {}) {
  return conversationHistoryService.conversationHistoryContentForMessage(msg, policy);
}
function buildConversationHistory(thread, latestUserMessageId, policy = {}) {
  return conversationHistoryService.buildConversationHistory(thread, latestUserMessageId, policy);
}
function stripDirectoryAliasLinesForChatHistory(text) {
  return conversationHistoryService.stripDirectoryAliasLinesForChatHistory(text);
}
function compactConversationHistory(messages, maxMessages, maxChars, policy = {}) {
  return conversationHistoryService.compactConversationHistory(messages, maxMessages, maxChars, policy);
}
function deriveTitle(text) {
  return conversationHistoryService.deriveTitle(text);
}
function makePublicTaskId(prefix) {
  const d = new Date();
  const stamp = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
    "_",
    String(d.getHours()).padStart(2, "0"),
    String(d.getMinutes()).padStart(2, "0"),
    String(d.getSeconds()).padStart(2, "0"),
  ].join("");
  return `${prefix}_${stamp}_${crypto.randomBytes(3).toString("hex")}`;
}
const startRunForThread = (...args) => getGatewayRuntimeCompositionService().startRunForThread(...args);
const stopRunIds = (...args) => getGatewayRuntimeCompositionService().stopRunIds(...args);
const gatewayUrlForRun = (...args) => getGatewayRuntimeCompositionService().gatewayUrlForRun(...args);
const abortActiveStreamAsFailed = (...args) => getGatewayRuntimeCompositionService().abortActiveStreamAsFailed(...args);
const checkActiveStreamLiveness = (...args) => getGatewayRuntimeCompositionService().checkActiveStreamLiveness(...args);
const streamResponse = (...args) => getGatewayRuntimeCompositionService().streamResponse(...args);
const readResponseEvents = (...args) => getGatewayRuntimeCompositionService().readResponseEvents(...args);
function parseSseFrame(frame) {
  const dataLines = [];
  let eventName = "";
  for (const rawLine of String(frame || "").split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  try {
    const parsed = JSON.parse(dataLines.join("\n"));
    if (eventName && parsed && typeof parsed === "object" && !parsed.event) parsed.event = eventName;
    return parsed;
  } catch (_) {
    return null;
  }
}
function findRunTarget(runId) {
  return getGatewayRuntimeCompositionService().findRunTarget(runId);
}
function supplementGatewayUsage(usage, runId, message = {}) {
  const target = gatewayTargetForRun(runId);
  return gatewayUsageTelemetry().supplementUsage(usage, Object.assign({}, target, {
    responseId: message.runId || runId,
    runId,
    gatewayProfile: message.gatewayProfile || target.profile || "",
    gatewayName: message.gatewayName || target.name || "",
    gatewayUrl: message.gatewayUrl || target.apiBase || "",
  }));
}
const applyHermesRunEvent = (...args) => getGatewayRuntimeCompositionService().applyHermesRunEvent(...args);
function extractCompletedOutput(event) {
  return getGatewayRuntimeCompositionService().extractCompletedOutput(event);
}
const markRunFailed = (...args) => getGatewayRuntimeCompositionService().markRunFailed(...args);
const markRunCancelled = (...args) => getGatewayRuntimeCompositionService().markRunCancelled(...args);
const reconcileDetachedActiveRuns = (...args) => getGatewayRuntimeCompositionService().reconcileDetachedActiveRuns(...args);
function appendBounded(current, delta, maxChars) {
  const next = `${current || ""}${delta || ""}`;
  if (next.length <= maxChars) return next;
  return `${next.slice(0, Math.floor(maxChars * 0.45))}\n\n[content truncated live: ${next.length} chars total]\n\n${next.slice(-Math.floor(maxChars * 0.45))}`;
}
function compactFullContent(value) {
  return compactText(value, MAX_MESSAGE_CHARS);
}
function registerArtifactsFromText(thread, message, text) {
  return getArtifactTextRegistrationService().registerArtifactsFromText(thread, message, text);
}
function extractArtifactPaths(text) {
  return fileResourceService.extractArtifactPaths(text);
}
function volume1WindowsMirrorPath(rawPath) {
  return filesystemMountProvider.volume1WindowsMirrorPath(rawPath);
}
function normalizeLocalPath(rawPath) {
  return filesystemMountProvider.normalizeLocalPath(rawPath);
}
function allowedRoots() {
  return securityBoundaryProvider.filterRoots(filesystemMountProvider.resolvedAllowedRoots());
}
function isPathAllowed(filePath) {
  if (securityBoundaryProvider.isProtectedPath(filePath)) return false;
  return filesystemMountProvider.isPathAllowed(filePath);
}
function isPathAllowedForThread(thread, localPath, originalPath = "") {
  return pathPolicyProvider.canReadForThread(thread, localPath, originalPath).allowed;
}
function isDirectoryBrowserPathAllowedForThread(thread, localPath, originalPath = "") {
  return pathPolicyProvider.canBrowseDirectoryForThread(thread, localPath, originalPath).allowed;
}
function getDirectoryBrowserBoundaryService() {
  if (!directoryBrowserBoundaryService) {
    directoryBrowserBoundaryService = createDirectoryBrowserBoundaryService({
      allProjectsForWorkspaceSync,
      authCanAccessWorkspace,
      chatGroupMemberWorkspaceIds,
      comparablePath,
      dedupe,
      isKanbanCaseTopicThread: (...args) => getSingleWindowThreadService().isKanbanCaseTopicThread(...args),
      isOwnerAuth,
      logicalDirectoryDisplayPath: (...args) => workspaceDisplayPathService.logicalDirectoryDisplayPath(...args),
      mimeFor,
      normalizeLocalPath,
      normalizeTaskGroupMeta: (...args) => getRuntimeStateNormalizationService().normalizeTaskGroupMeta(...args),
      pathDirectChildOfRoot,
      pathInsideAnyRoot,
      pathPolicyProvider,
      policyForThread,
      runDirectoryBridge,
      sharedDirectoryProvider,
      sharedDirectoryRoots,
    });
  }
  return directoryBrowserBoundaryService;
}
function resolveFileForBrowserRequest(query, auth = null) {
  return fileArtifactResolverService.resolveFileForBrowserRequest(query, auth);
}
function resolveArtifactForRequest(artifactId, auth = null) {
  return fileArtifactResolverService.resolveArtifactForRequest(artifactId, auth);
}
async function resolveAuthorizedCronOutputFile(query, auth = null) {
  return automationProvider.resolveAuthorizedOutputFile({ query, auth });
}
async function resolveAuthorizedCronDeliverableFile(query, auth = null) {
  return automationProvider.resolveAuthorizedDeliverableFile({ query, auth });
}
function sendResolvedFile(res, file, query) {
  return fileResponseService.sendResolvedFile(res, file, query);
}
function sendResolvedBridgeFile(res, file, query) {
  return fileResponseService.sendResolvedBridgeFile(res, file, query);
}
function sendResolvedFilePreview(res, file) {
  return fileResponseService.sendResolvedFilePreview(res, file);
}
function sendResolvedBridgeFilePreview(res, file) {
  return fileResponseService.sendResolvedBridgeFilePreview(res, file);
}
function getThreadRuntimeCompositionService() {
  if (!threadRuntimeCompositionService) {
    threadRuntimeCompositionService = createThreadRuntimeCompositionService({
      attachUploadedArtifactsToMessage,
      authCanAccessWorkspace,
      authenticateRequest,
      broadcast,
      buildUserMessageContent: (...args) => getRuntimeStateThreadService().buildUserMessageContent(...args),
      chatGroupMemberWorkspaceIds,
      compactMessage,
      compactThread,
      compactThreadWithMessagePage,
      deriveTitle,
      detectDirectKanbanCreateRequest,
      detectDirectTodoCreateIntent,
      detectDirectTodoCreateIntentForWeb,
      directTodoCreateEnabled,
      findThreadForRequest: (...args) => getRuntimeStateThreadService().findThreadForRequest(...args),
      findWorkspace,
      formatDirectTodoCreateSuccessMessage,
      gatewayRoutingForModelRun,
      groupChatTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
      interpretKanbanNaturalLanguage,
      isKanbanCaseTopicThread: (...args) => getSingleWindowThreadService().isKanbanCaseTopicThread(...args),
      isOwnerAuth,
      kanbanCardProvider,
      kanbanCaseTopicPermissionsForTaskGroup,
      kanbanSingleCardCasePayload,
      makeId,
      maxMessageChars: MAX_MESSAGE_CHARS,
      normalizeTaskGroupMeta: (...args) => getRuntimeStateNormalizationService().normalizeTaskGroupMeta(...args),
      notifyGroupChatMentions: webPushDeliveryService.notifyGroupChatMentions,
      notifyTodoCreated: webPushDeliveryService.notifyTodoCreated,
      nowIso,
      ownerElevationInstructions,
      precedingUserMessageForAssistant,
      publicArtifactFromClient,
      publicTodo,
      readBody,
      removeThreadActiveRun,
      requireOwner,
      resolveTaskDirectoryAttachment: (...args) => getSemanticDirectoryAttachmentService().resolveTaskDirectoryAttachment(...args),
      runConcurrencyError,
      runConcurrencySnapshot,
      sanitizeElevationScope,
      sanitizeTaskGroupId: (...args) => getRuntimeStateNormalizationService().sanitizeTaskGroupId(...args),
      saveState,
      semanticTaskDirectoryAttachment: (...args) => getSemanticDirectoryAttachmentService().semanticTaskDirectoryAttachment(...args),
      sendJson,
      senderInfoForWorkspace,
      singleWindowChatTaskGroupId,
      startRunForThread,
      taskDirectoryAttachmentForGroup: (...args) => getSemanticDirectoryAttachmentService().taskDirectoryAttachmentForGroup(...args),
      taskGroupHasRunningRun,
      threadMessageInitialLimit: THREAD_MESSAGE_INITIAL_LIMIT,
      threadSummary,
      todoAssigneeLabel,
      todoProvider,
      useKanbanTodoBackend,
      validReasoningEfforts: VALID_REASONING_EFFORTS,
      verifyDirectTodoCreateResult,
      workspaceIdForPrincipal,
      workspacePrincipal,
    });
  }
  return threadRuntimeCompositionService;
}
const getThreadOwnerElevationRetryService = (...args) => getThreadRuntimeCompositionService().getThreadOwnerElevationRetryService(...args);
const getThreadMessageCreateService = (...args) => getThreadRuntimeCompositionService().getThreadMessageCreateService(...args);
const getThreadDirectCreateExecutionService = (...args) => getThreadRuntimeCompositionService().getThreadDirectCreateExecutionService(...args);
const getThreadMessageRunRouteService = (...args) => getThreadRuntimeCompositionService().getThreadMessageRunRouteService(...args);
const { eventStreamApiRoutes, mobileApiDispatcher } = createMobileApiComposition({
  accessToken: null, activeStreams: () => activeStreams, ackWeixinOutboundDelivery, appRouteUrl, appUpdateStatus,
  applyAppUpdate, attachClientVersionHeaders, authCanAccessWorkspace, authenticateRequest, authProvider,
  automationProvider, basename: (value) => path.basename(value), boolParam, bootTrace, broadcast,
  buildRequestContext, canRevokeGroupChatMessage, chatGroupMemberWorkspaceIds, clearCronListCache, clearDynamicProjectCache: () => getRuntimeWorkspaceCatalogService().clearDynamicProjectCache(),
  clearDynamicProjectCacheForWorkspace: (workspaceId) => getRuntimeWorkspaceCatalogService().clearDynamicProjectCache(workspaceId), clearKanbanCardListCache, clientVersionInfo, compactMessage, compactText,
  compactThread, compactThreadWithMessagePage, contentDisposition, createInitialOwnerKey, createKanbanPlanCards,
  createWeixinFileForwardDelivery, cronJobMatchesOwner, cronJobMatchesSearch, dataDir: DATA_DIR, dedupe, deleteLocalWorkspace, detectDirectTodoCreateIntentForWeb,
  display: {
    ownerLabel: OWNER_LABEL,
    ownerDriveRootNames: OWNER_DRIVE_ROOT_NAMES,
    ownerRootFallbackLabel: OWNER_ROOT_FALLBACK_LABEL,
  },
  effectiveHermesApiBase, eventFanoutService, exists: (value) => fs.existsSync(value), extractDocxText, findDirectoryThreadForRequest,
  findProject, findSubproject, findWorkspace, generateWebPushVapidConfig, getAssessmentExamWorkflowService,
  getDirectoryBrowserBoundaryService, getHermesStatus, getKanbanPlanCardCreationService, getRuntimeStateNormalizationService, getRuntimeStateThreadService,
  getSharedDirectoryProjectionService, getSingleWindowThreadService, getThreadMessageRunRouteService, getUrl, grantOwnerElevation,
  grantOwnerElevationOnce, consumeOwnerElevationOnce, groupAiReplyRevokedText: GROUP_AI_REPLY_REVOKED_TEXT, groupAssistantReplyForUserMessage, groupMessageRevokedText: GROUP_MESSAGE_REVOKED_TEXT, groupMessageRevoker,
  includeStatusCatalog: STATUS_INCLUDE_CATALOG, interpretAutomationNaturalLanguage, invalidateCatalogCache, isDirectoryBrowserPathAllowedForThread, isOwnerAuth, isOwnerElevationActive,
  isSingleWindowConversationTaskGroupId, joinLocalPath: (parent, name) => path.join(parent, name), kanbanCardProvider, kanbanCaseShareService, kanbanErrorResponse,
  kanbanReadingWorkflowService, kanbanSingleCardCasePayload, learningCardGuidanceService, learningCoinService, listWorkspaceAccessKeyStatuses, loadCatalog, localWorkspaceDefaults,
  makeId, maxUploadBytes: MAX_UPLOAD_BYTES, maybeReconcileKanbanDependencyBlocks, mimeFor, mkdir: (value) => fs.mkdirSync(value),
  normalizeChatGroup, normalizeKanbanMaxParallel, normalizeKanbanNotificationAssignee, normalizeKanbanPlanReasoningEffort, normalizeStringList,
  nowIso, ownerSetupStatus, pendingWeixinOutboundDeliveries, planKanbanMultiAgent, publicConcurrencyForAuth,
  publicGatewayPoolStatusForAuth, publicKanbanCardDetail, publicOwnerElevationStatus, publicPushStatus: webPushDeliveryService.publicPushStatus, publicReasoningInfoForAuth,
  publicRuntimeConfig, publicTodo, publicWorkspace, publicWorkspacesForAuth, pushWorkspaceForAuth,
  readBody, requestClientVersion, readClientVersion, readKanbanCardListCache, readingCoverMaxBytes: KANBAN_READING_COVER_MAX_BYTES, reloadWebPush,
  registerUploadArtifact, removeThreadActiveRun, requireOwner, requireWeixinIngress, requireWorkspaceAccess, resolveArtifactForRequest,
  resolveAuthorizedCronDeliverableFile, resolveAuthorizedCronOutputFile, resolveFileForBrowserRequest, resolveKanbanCardAccess, resolveKanbanOutputFile,
  revokeGroupMessagePayload, revokeOwnerElevation, revokeWorkspaceAccessKey, rmdir: (value) => fs.rmdirSync(value), rmDirRecursive: (value) => fs.rmSync(value, { recursive: true, force: false }), rotateGlobalAccessKey,
  rotateWorkspaceAccessKey, runAutomationWebPushTick: webPushDeliveryService.runAutomationWebPushTick, runConcurrencySnapshot, runCronListBridgeCached, runDirectoryBridge,
  safeDirectoryName, safeFileName, sanitizePolicy, saveRuntimeConfig, saveState,
  scheduleKanbanDependencyReconcile, scheduleNextQueuedRunForTaskGroup, searchThreadMessages, sendJson, sendResolvedBridgeFile,
  sendResolvedBridgeFilePreview, sendResolvedFile, sendResolvedFilePreview, singleWindowGroupChatTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID, singleWindowProjectTaskSummaries,
  skillDetailProvider, sourceDocumentMaxBytes: KANBAN_SOURCE_DOCUMENT_MAX_BYTES, startWeixinIngressEvent, statSync: (value) => fs.statSync(value), state: () => state,
  stopRunIds, textFilePreview, threadMessageInitialLimit: THREAD_MESSAGE_INITIAL_LIMIT, threadMessagePageLimit: THREAD_MESSAGE_PAGE_LIMIT, threadMessageSearchLimit: THREAD_MESSAGE_SEARCH_LIMIT,
  threadMessagesPage, threadSummary, todoAssigneeLabel, todoErrorResponse, todoProvider,
  uniqueChildPath, unlink: (value) => fs.unlinkSync(value), upsertLocalWorkspace, useKanbanTodoBackend, verifyDirectTodoCreateResult,
  webPushDeliveryService, weixinForwardTargetsForWorkspace, weixinIngressProvider, workspacePrincipal, workspaceUploadDirectoryForRequest,
  writeFile: (filePath, buffer, options = {}) => fs.writeFileSync(filePath, buffer, { flag: options.flag || "w" }),
  writeKanbanCardListCache,
});
const server = http.createServer(async (req, res) => {
  try {
    const url = getUrl(req);
    if ((await eventStreamApiRoutes.handle(req, res, url)).handled) return;
    if (url.pathname.startsWith("/api/")) {
      await mobileApiDispatcher.handle(req, res);
      return;
    }
    serveStatic(req, res);
  } catch (err) {
    console.error(`Hermes Mobile request failed ${req.method || ""} ${req.url || ""}: ${err.stack || err.message || String(err)}`);
    sendJson(res, 500, { error: err.message || String(err) });
  }
});
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
reconcileDetachedActiveRuns();
function shutdown() {
  for (const stream of activeStreams.values()) {
    try {
      stream.controller.abort();
    } catch (_) {}
  }
  process.exit(0);
}
server.listen(PORT, HOST, () => {
  console.log(`Hermes Mobile listening on http://${HOST}:${PORT}`);
  console.log(`Hermes API base: ${effectiveHermesApiBase()}`);
  console.log(`State directory: ${DATA_DIR}`);
  console.log(DISABLE_AUTH ? "Authentication disabled by HERMES_WEB_DISABLE_AUTH." : `Authentication enabled; Owner key source is ${authProvider.ownerKeySource()}.`);
  if (!DISABLE_AUTH && authProvider.ownerKeySource() !== "env") {
    console.log("Current process login key is not printed; use the configured Owner key file or HERMES_WEB_KEY.");
  }
  webPushDeliveryService.startTodoWebPushDispatcher();
  webPushDeliveryService.startAutomationWebPushDispatcher();
});
