"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const webpush = require("web-push");
const studyAssessmentService = require("./adapters/study-assessment-service");
const { createConversationHistoryService } = require("./adapters/conversation-history-service"); const { createTopicContextCompactionService } = require("./adapters/topic-context-compaction-service");
const { createDocumentPreviewService } = require("./adapters/document-preview-service");
const { createAppRouteUrlService } = require("./adapters/app-route-url-service");
const { createEventFanoutService } = require("./adapters/event-fanout-service");
const fileResourceService = require("./adapters/file-resource-service");
const {
  comparablePath: comparableBoundaryPath,
  pathDirectChildOfRoot: boundaryPathDirectChildOfRoot,
  pathInsideAnyRoot: boundaryPathInsideAnyRoot,
} = require("./adapters/path-boundary-service");
const { createAutomationJobFilterService } = require("./adapters/automation-job-filter-service"); const { createAutomationCronProfileService } = require("./adapters/automation-cron-profile-service");
const { createAutomationProvider } = require("./adapters/automation-provider");
const { createAutomationDeliveryRequirement, createDeliveryBoundaryInstructions } = require("./adapters/delivery-boundary-provider");
const { createExternalIntegrationProvider } = require("./adapters/external-integration-provider");
const { createGatewayRunInstructionService } = require("./adapters/gateway-run-instruction-service"); const { createGatewayRunToolsetRoutingService } = require("./adapters/gateway-run-toolset-routing-service"); const { createGatewayRunModelToolsetSelectionService } = require("./adapters/gateway-run-model-toolset-selection-service");
const { createGatewayRunContentService } = require("./adapters/gateway-run-content-service");
const { createGatewayRuntimeCompositionService } = require("./adapters/gateway-runtime-composition-service");
const { createMobileRuntimeArtifactFacadeService } = require("./adapters/mobile-runtime-artifact-facade-service");
const { createMobileRuntimeGatewayFacadeService } = require("./adapters/mobile-runtime-gateway-facade-service");
const { createMobileRuntimeGroupChatAttachmentService } = require("./adapters/mobile-runtime-group-chat-attachment-service");
const { createMobileRuntimeKanbanFacadeService } = require("./adapters/mobile-runtime-kanban-facade-service");
const { createMobileRuntimeOwnerElevationFacadeService } = require("./adapters/mobile-runtime-owner-elevation-facade-service");
const { createMobileRuntimePathAccessService } = require("./adapters/mobile-runtime-path-access-service");
const { createRuntimeStatePersistenceService } = require("./adapters/runtime-state-persistence-service");
const {
  createRuntimeStateNormalizationService,
  normalizeStringList,
  normalizeStringMap,
} = require("./adapters/runtime-state-normalization-service");
const { createKanbanCardProvider } = require("./adapters/kanban-card-provider");
const { createRuntimeStateThreadService } = require("./adapters/runtime-state-thread-service");
const { createRuntimeOperationErrorResponseService } = require("./adapters/runtime-operation-error-response-service");
const { createKanbanExecutableProfileService } = require("./adapters/kanban-executable-profile-service");
const { createKanbanOutputAccessService } = require("./adapters/kanban-output-access-service");
const { createKanbanRuntimeServices } = require("./adapters/kanban-runtime-services");
const { createLearningCoinAwardService } = require("./adapters/learning-coin-award-service");
const {
  kanbanCardEffectiveCaseIndex,
  kanbanCardRevisionOf,
  visibleKanbanCaseCards,
} = require("./adapters/kanban-story-provider");
const { createKanbanTodoBridge } = require("./adapters/kanban-provider");
const { createLocalBridgeRuntimeService } = require("./adapters/local-bridge-runtime-service");
const { createMobileHttpRuntimeService } = require("./adapters/mobile-http-runtime-service");
const { createMobileRuntimeBasicHelperService } = require("./adapters/mobile-runtime-basic-helper-service");
const { createMobileRuntimeHttpServerService } = require("./adapters/mobile-runtime-http-server-service");
const { createMobileRuntimeCoreProviders } = require("./adapters/mobile-runtime-core-providers");
const { createMobileRuntimeAccessPolicyFacadeService } = require("./adapters/mobile-runtime-access-policy-facade-service");
const { createMobileRuntimeLocalBridgeFacadeService } = require("./adapters/mobile-runtime-local-bridge-facade-service");
const { createMobileRuntimeNaturalLanguageGatewayService } = require("./adapters/mobile-runtime-natural-language-gateway-service");
const { createRuntimeConfigProvider } = require("./adapters/runtime-config-provider");
const { createMobileRuntimeAuthFacadeService } = require("./adapters/mobile-runtime-auth-facade-service");
const { createMobileRuntimeBackendPolicyService } = require("./adapters/mobile-runtime-backend-policy-service");
const { createMobileRuntimeBootTraceService } = require("./adapters/mobile-runtime-boot-trace-service");
const { createMobileRuntimeConfigFacadeService } = require("./adapters/mobile-runtime-config-facade-service");
const { createMobileRuntimeFileAccessFacadeService } = require("./adapters/mobile-runtime-file-access-facade-service");
const { createMobileRuntimeFileHelperService } = require("./adapters/mobile-runtime-file-helper-service");
const { createMobileRuntimeGatewayCompositionOptionsService } = require("./adapters/mobile-runtime-gateway-composition-options-service");
const { createMobileRuntimeGatewayContextFacadeService } = require("./adapters/mobile-runtime-gateway-context-facade-service");
const { createMobileRuntimeGroupChatFacadeService } = require("./adapters/mobile-runtime-group-chat-facade-service");
const { createMobileRuntimePublicStatusService } = require("./adapters/mobile-runtime-public-status-service");
const { createMobileRuntimeSqliteStoreFacadeService } = require("./adapters/mobile-runtime-sqlite-store-facade-service");
const { createMobileRuntimeStateFacadeService } = require("./adapters/mobile-runtime-state-facade-service");
const { createMobileRuntimeSystemStatusFacadeService } = require("./adapters/mobile-runtime-system-status-facade-service");
const { createMobileRuntimeThreadFacadeService } = require("./adapters/mobile-runtime-thread-facade-service");
const { createMobileRuntimeThreadViewFacadeService } = require("./adapters/mobile-runtime-thread-view-facade-service");
const { createMobileRuntimeTodoFacadeService } = require("./adapters/mobile-runtime-todo-facade-service");
const { createMobileRuntimeWeixinFacadeService } = require("./adapters/mobile-runtime-weixin-facade-service");
const { createMobileRuntimeWorkspaceIdentityFacadeService } = require("./adapters/mobile-runtime-workspace-identity-facade-service");
const { createMobileRuntimeWorkspaceFacadeService } = require("./adapters/mobile-runtime-workspace-facade-service");
const { createMobileRuntimeWorkspaceCatalogFacade } = require("./adapters/mobile-runtime-workspace-catalog-facade");
const { createRuntimeWorkspaceCatalogService } = require("./adapters/runtime-workspace-catalog-service");
const { createSemanticDirectoryAttachmentService } = require("./adapters/semantic-directory-attachment-service");
const { createSingleWindowThreadService } = require("./adapters/single-window-thread-service");
const {
  createSystemRuntimeStatusService,
} = require("./adapters/system-runtime-status-service");
const { createSkillDetailProvider } = require("./adapters/skill-detail-provider"); const { createPluginRequiredSkillPreloadService } = require("./adapters/plugin-required-skill-preload-service"); const { createPluginCapabilityActivationService } = require("./adapters/plugin-capability-activation-service");
const { buildRequestContext } = require("./adapters/request-context-provider");
const { createWorkspaceBindingsProvider } = require("./adapters/workspace-bindings-provider");
const { createWorkspaceDisplayPathService } = require("./adapters/workspace-display-path-service");
const { createWorkspaceSystemProvisioningExecutorService } = require("./adapters/workspace-system-provisioning-executor-service"); const { createWorkspaceSystemProvisioningHelperClientService } = require("./adapters/workspace-system-provisioning-helper-client-service"); const { createTodoProvider } = require("./adapters/todo-provider");
const { createWeixinIngressProvider } = require("./adapters/weixin-ingress-provider");
const { createWeixinRuntimeCompositionService } = require("./adapters/weixin-runtime-composition-service");
const { createWebPushDeliveryService } = require("./adapters/web-push-delivery-service"); const { createActionInboxService } = require("./adapters/action-inbox-service");
const { createMobileApiComposition } = require("./server-routes/mobile-api-composition");
const { createMobileRuntimeEnvironment } = require("./adapters/mobile-runtime-environment-service");
const runtimeEnv = createMobileRuntimeEnvironment({ toolRoot: __dirname });
const { TOOL_ROOT, REPO_ROOT, PUBLIC_ROOT, INDEX_HTML_PATH, LOCAL_CONFIG_ROOT, HOST, PORT, DATA_DIR, OWNER_DEFAULT_WORKSPACE, WINDOWS_HOME, WSL_USER, WSL_HOME, WSL_HERMES_HOME, WSL_DISTRO, BOOT_TRACE_PATH } = runtimeEnv;
const { UPDATE_REMOTE_NAME, UPDATE_BRANCH, UPDATE_VERSION_URL, UPDATE_CHECK_TIMEOUT_MS, DEFAULT_TODO_BRIDGE_SCRIPT, DEFAULT_CRON_BRIDGE_SCRIPT, DEFAULT_DIRECTORY_BRIDGE_SCRIPT, DEFAULT_SKILL_BRIDGE_SCRIPT } = runtimeEnv;
const { HERMES_API_BASE, HERMES_API_TIMEOUT_MS, HERMES_ENV_PATHS, HERMES_API_KEY_PATHS, HERMES_CONFIG_PATHS, EXPLICIT_HERMES_CONFIG_PATHS, ALLOW_WSL_REASONING_CONFIG_LOOKUP } = runtimeEnv;
const { GATEWAY_POOL_ENABLED, GATEWAY_POOL_START_MODE, GATEWAY_POOL_ELASTIC_CONFIG, GATEWAY_SKILL_PROFILE_ROUTING, GATEWAY_USAGE_TELEMETRY_ENABLED, GATEWAY_USAGE_TELEMETRY_PROFILE_ROOTS, GATEWAY_POOL_HEALTH_TIMEOUT_MS, GATEWAY_POOL_MANIFEST_PATHS } = runtimeEnv;
const { RUN_START_TIMEOUT_MS, RUN_STREAMING_SAVE_THROTTLE_MS, RUN_LIVENESS_CHECK_AFTER_MS, RUN_LIVENESS_CHECK_INTERVAL_MS, RUN_LIVENESS_STALE_AFTER_MS, RUN_MODEL_FIRST_BYTE_WARNING_MS, RUN_WEB_SEARCH_MAX_CALLS, RUN_EXPLICIT_WEB_SEARCH_MAX_CALLS, GATEWAY_MODEL_PERMISSION_PREFLIGHT_ENABLED, GATEWAY_MODEL_PERMISSION_PREFLIGHT_TIMEOUT_MS, GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_ENABLED, GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_TIMEOUT_MS, GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_STOP_TIMEOUT_MS, GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_MODEL, GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_PROVIDER, GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_REASONING_EFFORT, RUN_CONCURRENCY_MAX_GLOBAL, RUN_CONCURRENCY_MAX_PER_WORKSPACE } = runtimeEnv;
const { DISABLE_AUTH, AUTH_KEY_PATH, ACCESS_KEYS_PATH, PERMISSION_APPROVAL_MARKER, OWNER_MAINTENANCE_RUNS_ENABLED, OWNER_ELEVATION_DURATION_OPTIONS_MINUTES, OWNER_ELEVATION_DEFAULT_MINUTES, OWNER_ELEVATION_ONCE_TTL_MS } = runtimeEnv;
const { STATE_PATH, STATE_BACKUP_DIR, MAX_STATE_BACKUPS, STATE_BACKUP_MIN_INTERVAL_MS, AUDIT_EVENT_LOG_PATH, RUNTIME_CONFIG_PATH, SERVICE_STORE_BACKEND, MOBILE_SQLITE_DB_PATH } = runtimeEnv;
const { SHARED_DIRECTORIES_PATH, LOCAL_WORKSPACES_PATH, WORKSPACE_USERS_PATHS, WORKSPACE_ROUTE_MAP_PATHS, PROJECT_MAP_PATHS, WORKSPACE_UPLOAD_DIR_NAME, WORKSPACE_UPLOAD_SUBDIR } = runtimeEnv;
const { GROUP_DELIVERIES_DIR, WEIXIN_INGRESS_KEY_PATHS, WEIXIN_INGRESS_DEFAULT_WORKSPACE, ENABLE_LEGACY_WEIXIN_COMPAT, WEIXIN_FORWARD_MARKDOWN_MAX_BYTES, WEIXIN_DELIVERY_RETRY_LIMIT, WEIXIN_DELIVERY_RETRY_BASE_MS, WEIXIN_DELIVERY_RETRY_MAX_MS, WEIXIN_INGRESS_ATTACHMENT_CONTEXT_WINDOW_MS } = runtimeEnv;
const { MAX_BODY_BYTES, MAX_HISTORY_MESSAGES, CHAT_CONTEXT_MAX_MESSAGES, CHAT_CONTEXT_MAX_CHARS, CONTEXT_ASSEMBLY_MODE, CONTEXT_COMPACTION_ENABLED, MAX_MESSAGE_CHARS, MAX_API_TEXT_CHARS, THREAD_MESSAGE_INITIAL_LIMIT, THREAD_MESSAGE_PAGE_LIMIT, THREAD_MESSAGE_SEARCH_LIMIT, MAX_EVENT_PREVIEW_CHARS, MAX_STORED_EVENTS_PER_THREAD, MAX_UPLOAD_BYTES, MAX_FILE_PREVIEW_CHARS, SOURCE_MARKDOWN_SEARCH_LIMIT } = runtimeEnv;
const { TODO_BRIDGE_TIMEOUT_MS, KANBAN_BRIDGE_TIMEOUT_MS, CRON_BRIDGE_TIMEOUT_MS, CRON_BRIDGE_STDOUT_LIMIT_BYTES, CRON_LIST_CACHE_TTL_MS, AUTOMATION_CREATE_TIMEOUT_MS, AUTOMATION_CREATE_MODEL, LEARNING_GROWTH_JIT_MODEL, LEARNING_GROWTH_JIT_REASONING_EFFORT, DIRECTORY_BRIDGE_TIMEOUT_MS, SKILL_BRIDGE_TIMEOUT_MS } = runtimeEnv;
const { CRON_OUTPUT_ROOT, CRON_RUN_LOG_ROOT, TODO_BACKEND, AUTOMATION_BACKEND, LOCAL_TODO_STORE_PATH, LOCAL_AUTOMATION_STORE_PATH, DIRECT_TODO_CREATE_SETTING } = runtimeEnv;
const { KANBAN_COMMAND, KANBAN_COMMAND_ARGS, KANBAN_TODO_META_PATH, KANBAN_CARD_LIST_CACHE_PATH, KANBAN_CASE_SHARE_PATH, KANBAN_WORKSPACE_PATH_STYLE, KANBAN_DEPENDENCY_RECONCILE_INTERVAL_MS, KANBAN_CARD_LIST_CACHE_TTL_MS, KANBAN_BLOCKED_PUSH_DELAY_MINUTES } = runtimeEnv;
const { KANBAN_MULTI_AGENT_DEFAULT_PARALLEL, KANBAN_MULTI_AGENT_MAX_PARALLEL, KANBAN_MULTI_AGENT_MAX_CARDS, KANBAN_MULTI_AGENT_PLAN_TIMEOUT_MS, KANBAN_READING_PLAN_MAX_SESSIONS, KANBAN_READING_ANALYSIS_TIMEOUT_MS, KANBAN_READING_TRANSCRIBE_TIMEOUT_MS, KANBAN_READING_TRANSCRIBE_SCRIPT, KANBAN_READING_ARTIFACT_ROOT, KANBAN_READING_COVER_MAX_BYTES, KANBAN_SOURCE_DOCUMENT_MAX_BYTES, KANBAN_READING_QUIZ_TARGETING_VERSION } = runtimeEnv;
const { KANBAN_STUDY_CASE_MODES, KANBAN_ASSESSMENT_CASE_MODES, KANBAN_STUDY_SHARED_FOLDER_NAME, KANBAN_CASE_TOPIC_KIND, KANBAN_ASSESSMENT_PLAN_MAX_EXAMS, KANBAN_ASSESSMENT_MAX_QUESTIONS, KANBAN_ASSESSMENT_MODEL_TIMEOUT_MS } = runtimeEnv;
const { WEB_PUSH_ENABLED, WEB_PUSH_SUBJECT, WEB_PUSH_VAPID_PATH, TODO_WEB_PUSH_ENABLED, TODO_WEB_PUSH_INTERVAL_MS, WEB_PUSH_START_DELAY_MS, TODO_WEB_PUSH_START_DELAY_MS, TODO_WEB_PUSH_RECENT_CREATE_MINUTES, TODO_WEB_PUSH_RECEIPT_RETRY_MINUTES, TODO_WEB_PUSH_RECEIPT_RETRY_LIMIT, AUTOMATION_WEB_PUSH_ENABLED, AUTOMATION_WEB_PUSH_INTERVAL_MS, AUTOMATION_WEB_PUSH_START_DELAY_MS } = runtimeEnv;
const { BRIDGE_HOST_URL, BRIDGE_HOST_KEY_PATH, STATUS_INCLUDE_CATALOG, GOOGLE_TOKEN_PATHS, GOOGLE_CLIENT_SECRET_PATHS, OUTLOOK_GRAPH_TOKEN_PATHS, GITHUB_CLI_HOSTS_PATHS } = runtimeEnv;
const { SINGLE_WINDOW_CHAT_TASK_GROUP_ID, SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID, isSingleWindowConversationTaskGroupId, singleWindowChatTaskGroupId, GROUP_MESSAGE_REVOKED_TEXT, GROUP_AI_REPLY_REVOKED_TEXT, SINGLE_WINDOW_PROJECT_ID, SINGLE_WINDOW_THREAD_TITLE } = runtimeEnv;
const { OWNER_LABEL, OWNER_ROOT_FALLBACK_LABEL, OWNER_DRIVE_ROOT_NAMES, GENERIC_OWNER_TOPIC_PROJECT_PREFIXES, GENERIC_OWNER_TOPIC_PROJECT_IDS, PRINCIPAL_LABEL_PREFIXES } = runtimeEnv;
const { REASONING_EFFORT_OPTIONS, VALID_REASONING_EFFORTS, MESSAGE_TIME_FIELDS, MIME_BY_EXT, AUTOMATION_PUSH_DELIVERABLE_EXTENSIONS, AUTOMATION_PUSH_DELIVERABLE_LOOKBACK_MS, AUTOMATION_PUSH_DELIVERABLE_FUTURE_GRACE_MS, AUTOMATION_PUSH_INITIAL_LOOKBACK_MS } = runtimeEnv;
const RUNTIME_PATH_COMPARE_OPTIONS = Object.freeze({ slashFirst: true, stripWslPrefix: true, mapWslMountDrive: true });
const legacyHostGrowthApiEnabled = ["1", "true", "yes", "on"].includes(String(process.env.HERMES_MOBILE_LEGACY_HOST_GROWTH_API_ENABLED || process.env.HERMES_WEB_LEGACY_HOST_GROWTH_API_ENABLED || "").trim().toLowerCase());
const comparablePath = (value) => comparableBoundaryPath(value, RUNTIME_PATH_COMPARE_OPTIONS);
const pathInsideAnyRoot = (candidate, roots) => boundaryPathInsideAnyRoot(candidate, roots, RUNTIME_PATH_COMPARE_OPTIONS);
const pathDirectChildOfRoot = (candidate, root) => boundaryPathDirectChildOfRoot(candidate, root, RUNTIME_PATH_COMPARE_OPTIONS);
const mobileRuntimeBasicHelperService = createMobileRuntimeBasicHelperService({ crypto, normalizeStringList });
const {
  boolParam,
  compactText,
  dedupe,
  hashValue,
  isUncPath,
  makeId,
  makePublicTaskId,
  normalizeOwnerElevationDurations,
  normalizeSingleWindowMode,
  nowIso,
  responseTextFromValue,
  searchableText,
} = mobileRuntimeBasicHelperService;
const mobileRuntimeBackendPolicyService = createMobileRuntimeBackendPolicyService({
  automationBackend: AUTOMATION_BACKEND,
  directTodoCreateSetting: DIRECT_TODO_CREATE_SETTING,
  serviceStoreBackend: SERVICE_STORE_BACKEND,
  todoBackend: TODO_BACKEND,
});
const {
  directTodoCreateEnabled,
  useKanbanTodoBackend,
  useLocalAutomationBackend,
  useLocalTodoBackend,
  useSqliteServiceStore,
} = mobileRuntimeBackendPolicyService;
const mobileRuntimeSqliteStoreFacadeService = createMobileRuntimeSqliteStoreFacadeService({
  createMobileSqliteStore: (options) => require("./adapters/mobile-sqlite-store").createMobileSqliteStore(options),
  dbPath: MOBILE_SQLITE_DB_PATH,
});
const mobileSqliteStore = (...args) => mobileRuntimeSqliteStoreFacadeService.mobileSqliteStore(...args);
const bootTrace = createMobileRuntimeBootTraceService({ fs, path, process, tracePath: BOOT_TRACE_PATH }).bootTrace;
bootTrace("constants ready");
const clientLayoutDiagnosticService = require("./adapters/client-layout-diagnostic-service").createClientLayoutDiagnosticService({ fs, path, logPath: path.join(DATA_DIR, "diagnostics", "client-layout.jsonl"), nowIso });
const documentPreviewService = createDocumentPreviewService({
  fs,
  maxPreviewChars: MAX_FILE_PREVIEW_CHARS,
});
let mobileRuntimeLocalBridgeFacadeService = null;
const localBridgeFacade = () => {
  if (!mobileRuntimeLocalBridgeFacadeService) throw new Error("Mobile runtime local bridge facade is not initialized");
  return mobileRuntimeLocalBridgeFacadeService;
};
const runDirectoryBridge = (...args) => localBridgeFacade().runDirectoryBridge(...args);
const runProcessText = (...args) => localBridgeFacade().runProcessText(...args);
const mobileRuntimeSystemStatusFacadeService = createMobileRuntimeSystemStatusFacadeService({
  allowWslReasoningConfigLookup: ALLOW_WSL_REASONING_CONFIG_LOOKUP,
  compactText,
  createSystemRuntimeStatusService,
  dedupe,
  env: process.env,
  explicitHermesConfigPaths: EXPLICIT_HERMES_CONFIG_PATHS,
  fs,
  gatewayPool: () => gatewayPool(),
  gatewayUsageTelemetryProfileRoots: GATEWAY_USAGE_TELEMETRY_PROFILE_ROOTS,
  hermesConfigPaths: HERMES_CONFIG_PATHS,
  indexHtmlPath: INDEX_HTML_PATH,
  isUncPath,
  nowIso,
  path,
  process,
  repoRoot: REPO_ROOT,
  runProcessText,
  updateBranch: UPDATE_BRANCH,
  updateCheckTimeoutMs: UPDATE_CHECK_TIMEOUT_MS,
  updateRemoteName: UPDATE_REMOTE_NAME,
  updateVersionUrl: UPDATE_VERSION_URL,
});
const { appUpdateStatus, applyAppUpdate, clientVersionInfo, defaultReasoningInfo, readClientVersion, runtimeModelConfigInfo } = mobileRuntimeSystemStatusFacadeService;
const httpRuntimeService = createMobileHttpRuntimeService({
  clientVersionInfo,
  maxBodyBytes: MAX_BODY_BYTES,
  mimeByExt: MIME_BY_EXT,
  publicRoot: PUBLIC_ROOT,
});
const getUrl = (...args) => httpRuntimeService.getUrl(...args);
const requestClientVersion = (...args) => httpRuntimeService.requestClientVersion(...args);
const attachClientVersionHeaders = (...args) => httpRuntimeService.attachClientVersionHeaders(...args);
const sendJson = (...args) => httpRuntimeService.sendJson(...args);
const readBody = (...args) => httpRuntimeService.readBody(...args);
const runtimeOperationErrorResponseService = createRuntimeOperationErrorResponseService({ sendJson });
const todoErrorResponse = (...args) => runtimeOperationErrorResponseService.todoErrorResponse(...args);
const kanbanErrorResponse = (...args) => runtimeOperationErrorResponseService.kanbanErrorResponse(...args);
let mobileRuntimeStateFacadeService = null;
const ensureDataDir = (...args) => mobileRuntimeStateFacadeService.ensureDataDir(...args);
const {
  contentDisposition,
  extractDocxText,
  mimeFor,
  readJsonFirst,
  readJsonStore,
  serveStatic,
  textBufferPreview,
  textFilePreview,
  writeJsonStore,
} = createMobileRuntimeFileHelperService({
  bootTrace,
  documentPreviewService,
  ensureDataDir,
  fs,
  httpRuntimeService,
  isUncPath,
  nowMs: () => Date.now(),
  path,
  processId: process.pid,
});
let clients = new Set();
let activeStreams = new Map();
let mobileRuntimeGatewayFacadeService = null;
let mobileRuntimeFileAccessFacadeService = null;
let mobileRuntimeGroupChatFacadeService = null;
let mobileRuntimeArtifactFacadeService = null;
let mobileRuntimeKanbanFacadeService = null;
let mobileRuntimeWorkspaceFacadeService = null;
const sourceMarkdownSearchCache = new Map();
let state = null;
let mobileRuntimeThreadViewFacadeService = null;
let webPushDeliveryService = null;
const mobileRuntimeAuthFacadeService = createMobileRuntimeAuthFacadeService({
  authProvider: () => authProvider,
});
const authenticateRequest = (...args) => mobileRuntimeAuthFacadeService.authenticateRequest(...args);
const authCanAccessWorkspace = (...args) => mobileRuntimeAuthFacadeService.authCanAccessWorkspace(...args);
const isOwnerAuth = (...args) => mobileRuntimeAuthFacadeService.isOwnerAuth(...args);
const eventFanoutService = createEventFanoutService({
  clients, authCanAccessWorkspace, isOwnerAuth, state: () => state,
  threadAccessibleToAuth: (...args) => getRuntimeStateThreadService().threadAccessibleToAuth(...args),
}); const pluginCapabilityActivationService = createPluginCapabilityActivationService({ dedupe }); const pluginRequiredSkillPreloadService = createPluginRequiredSkillPreloadService({ dataDirs: [DATA_DIR], env: process.env, maxSkillChars: 80000, maxTotalChars: 120000 }); const gatewayModelPreflightEnabled = GATEWAY_MODEL_PERMISSION_PREFLIGHT_ENABLED || GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_ENABLED;
const appRouteUrlService = createAppRouteUrlService();
const appRouteUrl = (...args) => appRouteUrlService.appRouteUrl(...args);
const broadcast = (...args) => eventFanoutService.broadcast(...args);
const payloadWorkspaceId = (...args) => eventFanoutService.payloadWorkspaceId(...args);
const clientCanReceivePayload = (...args) => eventFanoutService.clientCanReceivePayload(...args);
const artifactFacade = () => {
  if (!mobileRuntimeArtifactFacadeService) throw new Error("Mobile runtime artifact facade is not initialized");
  return mobileRuntimeArtifactFacadeService;
};
const artifactMethod = (methodName) => (...args) => artifactFacade()[methodName](...args);
const artifactDelegates = Object.fromEntries("safeFileName safeDirectoryName uniqueChildPath workspaceDefaultRoot threadUploadRoot workspaceUploadRoot uploadWorkspaceAllowedForThread uploadWorkspaceIdForRequest uploadRootsForThread workspaceUploadDirectoryForRequest registerUploadArtifact publicArtifactFromClient attachUploadedArtifactsToMessage getArtifactTextRegistrationService compactArtifactForMessage compactArtifactPathKey compactArtifactStemKey publicMarkdownPreviewArtifact sourceMarkdownSearchRoots findMarkdownByStemUnderRoot findSourceMarkdownForArtifact companionMarkdownPathForArtifact findThreadForMessage compactArtifactsForMessage registerArtifactsFromText resolveArtifactPathFromMessage".split(" ").map((methodName) => [methodName, artifactMethod(methodName)]));
const { safeFileName, safeDirectoryName, uniqueChildPath, workspaceDefaultRoot, threadUploadRoot, workspaceUploadRoot, uploadWorkspaceAllowedForThread, uploadWorkspaceIdForRequest, uploadRootsForThread, workspaceUploadDirectoryForRequest, registerUploadArtifact, publicArtifactFromClient, attachUploadedArtifactsToMessage, getArtifactTextRegistrationService, compactArtifactForMessage, compactArtifactPathKey, compactArtifactStemKey, publicMarkdownPreviewArtifact, sourceMarkdownSearchRoots, findMarkdownByStemUnderRoot, findSourceMarkdownForArtifact, companionMarkdownPathForArtifact, findThreadForMessage, compactArtifactsForMessage, registerArtifactsFromText, resolveArtifactPathFromMessage } = artifactDelegates;
const extractArtifactPaths = (...args) => fileResourceService.extractArtifactPaths(...args);
const threadViewFacade = () => {
  if (!mobileRuntimeThreadViewFacadeService) throw new Error("Mobile runtime thread view facade is not initialized");
  return mobileRuntimeThreadViewFacadeService;
};
const threadViewMethod = (methodName) => (...args) => threadViewFacade()[methodName](...args);
const threadViewDelegates = Object.fromEntries("threadSummary taskGroupsForThread messageOwnerWorkspaceId taskGroupOwnerWorkspaceId taskGroupTaskId taskGroupPrompt taskGroupTitle taskGroupPreview taskGroupStatus taskGroupHaystack textIncludesPath taskGroupMatchesProject singleWindowProjectTaskSummaries messagesForThreadMode messagePageTaskGroupId threadMessagesPage searchThreadMessages compactThread compactThreadWithMessagePage compactMessage compactEventPreview addThreadEvent".split(" ").map((methodName) => [methodName, threadViewMethod(methodName)]));
const { threadSummary, taskGroupsForThread, messageOwnerWorkspaceId, taskGroupOwnerWorkspaceId, taskGroupTaskId, taskGroupPrompt, taskGroupTitle, taskGroupPreview, taskGroupStatus, taskGroupHaystack, textIncludesPath, taskGroupMatchesProject, singleWindowProjectTaskSummaries, messagesForThreadMode, messagePageTaskGroupId, threadMessagesPage, searchThreadMessages, compactThread, compactThreadWithMessagePage, compactMessage, compactEventPreview, addThreadEvent } = threadViewDelegates;
const fileAccessFacade = () => {
  if (!mobileRuntimeFileAccessFacadeService) throw new Error("Mobile runtime file access facade is not initialized");
  return mobileRuntimeFileAccessFacadeService;
};
const fileAccessMethod = (methodName) => (...args) => fileAccessFacade()[methodName](...args);
const fileAccessDelegates = Object.fromEntries("findDirectoryThreadForRequest getDirectoryBrowserBoundaryService resolveArtifactForRequest resolveFileForBrowserRequest sendResolvedBridgeFile sendResolvedBridgeFilePreview sendResolvedFile sendResolvedFilePreview".split(" ").map((methodName) => [methodName, fileAccessMethod(methodName)]));
const { findDirectoryThreadForRequest, getDirectoryBrowserBoundaryService, resolveArtifactForRequest, resolveFileForBrowserRequest, sendResolvedBridgeFile, sendResolvedBridgeFilePreview, sendResolvedFile, sendResolvedFilePreview } = fileAccessDelegates;
const kanbanFacade = () => {
  if (!mobileRuntimeKanbanFacadeService) throw new Error("Mobile runtime Kanban facade is not initialized");
  return mobileRuntimeKanbanFacadeService;
};
const kanbanMethod = (methodName) => (...args) => kanbanFacade()[methodName](...args);
const kanbanDelegates = Object.fromEntries("createKanbanPlanCards getAssessmentExamWorkflowService getKanbanCaseTopicService getKanbanPlanCardCreationService getKanbanOutputProjectionService getTodoPublicProjectionService isKanbanAssessmentCaseMode isKanbanStudyCaseMode kanbanCaseTopicPermissionsForTaskGroup kanbanCaseTopicTitle kanbanLearnerRootDirectory kanbanPlanCardDescription kanbanPlanDependencyLabelsForServer kanbanSingleCardCasePayload kanbanStableTextKey kanbanWorkflowStateCompleted maybeReconcileKanbanDependencyBlocks normalizeKanbanAssessmentSubjectId normalizeKanbanDraft normalizeKanbanMaxParallel normalizeKanbanNotificationAssignee normalizeKanbanPlan normalizeKanbanPlanReasoningEffort ensureKanbanCaseSharedDirectory ensureKanbanCaseTopicThread interpretKanbanNaturalLanguage planKanbanMultiAgent publicKanbanCardDetail publicKanbanCoverFile publicKanbanOutputFile publicKanbanOutputsFromText publicKanbanReadingSubmissionSummary publicTodo readKanbanCardListCache readingContextForCard resolveKanbanCardAccess scheduleKanbanDependencyReconcile writeKanbanCardListCache clearKanbanCardListCache".split(" ").map((methodName) => [methodName, kanbanMethod(methodName)]));
const { createKanbanPlanCards, getAssessmentExamWorkflowService, getKanbanCaseTopicService, getKanbanPlanCardCreationService, getKanbanOutputProjectionService, getTodoPublicProjectionService, isKanbanAssessmentCaseMode, isKanbanStudyCaseMode, kanbanCaseTopicPermissionsForTaskGroup, kanbanCaseTopicTitle, kanbanLearnerRootDirectory, kanbanPlanCardDescription, kanbanPlanDependencyLabelsForServer, kanbanSingleCardCasePayload, kanbanStableTextKey, kanbanWorkflowStateCompleted, maybeReconcileKanbanDependencyBlocks, normalizeKanbanAssessmentSubjectId, normalizeKanbanDraft, normalizeKanbanMaxParallel, normalizeKanbanNotificationAssignee, normalizeKanbanPlan, normalizeKanbanPlanReasoningEffort, ensureKanbanCaseSharedDirectory, ensureKanbanCaseTopicThread, interpretKanbanNaturalLanguage, planKanbanMultiAgent, publicKanbanCardDetail, publicKanbanCoverFile, publicKanbanOutputFile, publicKanbanOutputsFromText, publicKanbanReadingSubmissionSummary, publicTodo, readKanbanCardListCache, readingContextForCard, resolveKanbanCardAccess, scheduleKanbanDependencyReconcile, writeKanbanCardListCache, clearKanbanCardListCache } = kanbanDelegates;
const mobileRuntimeTodoFacadeService = createMobileRuntimeTodoFacadeService({
  findWorkspace: (...args) => findWorkspace(...args),
  loadCatalog: (...args) => loadCatalog(...args),
  principalLabelPrefixes: PRINCIPAL_LABEL_PREFIXES,
  useKanbanTodoBackend,
});
const {
  detectDirectKanbanCreateRequest,
  detectDirectTodoCreateIntentForWeb,
  directTodoCreateNeedsKanbanFields,
  formatDirectTodoCreateSuccessMessage,
  formatLocalDateTime,
  parseWebTodoDueFromText,
  resolveTodoAssigneeFromText,
  todoAssigneeLabel,
  todoAssigneesForWorkspace,
  verifyDirectTodoCreateResult,
  workspacePrincipal,
} = mobileRuntimeTodoFacadeService;
const parseTodoDueFromText = parseWebTodoDueFromText;
const detectDirectTodoCreateIntent = detectDirectTodoCreateIntentForWeb;
const mobileRuntimeWorkspaceIdentityFacadeService = createMobileRuntimeWorkspaceIdentityFacadeService({
  findWorkspace: (...args) => findWorkspace(...args),
  loadCatalog: (...args) => loadCatalog(...args),
  workspaceFacade: () => mobileRuntimeWorkspaceFacadeService,
  workspacePrincipal,
});
const workspaceLabel = (...args) => mobileRuntimeWorkspaceIdentityFacadeService.workspaceLabel(...args);
const senderInfoForWorkspace = (...args) => mobileRuntimeWorkspaceIdentityFacadeService.senderInfoForWorkspace(...args);
const workspaceIdForPrincipal = (...args) => mobileRuntimeWorkspaceIdentityFacadeService.workspaceIdForPrincipal(...args);
const gatewayRunContentService = createGatewayRunContentService({
  compactText,
  maxMessageChars: MAX_MESSAGE_CHARS,
});
const { appendBounded, compactFullContent } = gatewayRunContentService;
mobileRuntimeStateFacadeService = createMobileRuntimeStateFacadeService({
  bootTrace,
  compactFullContent,
  createRuntimeStateNormalizationService,
  createRuntimeStatePersistenceService,
  dataDir: DATA_DIR,
  dedupe,
  findWorkspace: (...args) => findWorkspace(...args),
  fs,
  groupMessageRevokedText: GROUP_MESSAGE_REVOKED_TEXT,
  kanbanCaseTopicKind: KANBAN_CASE_TOPIC_KIND,
  logError: (message) => console.error(message),
  makeId,
  maxStateBackups: MAX_STATE_BACKUPS,
  maxStoredEventsPerThread: MAX_STORED_EVENTS_PER_THREAD,
  messageTimeFields: MESSAGE_TIME_FIELDS,
  mobileSqliteStore,
  normalizeSingleWindowMode,
  nowIso,
  ownerDefaultWorkspace: OWNER_DEFAULT_WORKSPACE,
  path,
  singleWindowChatTaskGroupId,
  singleWindowChatTaskGroupIdValue: SINGLE_WINDOW_CHAT_TASK_GROUP_ID,
  singleWindowGroupChatTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
  stateBackupDir: STATE_BACKUP_DIR,
  stateBackupMinIntervalMs: STATE_BACKUP_MIN_INTERVAL_MS,
  statePath: STATE_PATH,
  useSqliteServiceStore,
  validReasoningEfforts: VALID_REASONING_EFFORTS,
  webPushDeliveryService: () => webPushDeliveryService,
  workspaceLabel,
});
const {
  chatGroupMemberWorkspaceIds,
  defaultState,
  getRuntimeStateNormalizationService,
  getRuntimeStatePersistenceService,
  loadState,
  normalizeChatGroup,
  normalizePushDelivery,
  normalizePushReceipt,
  normalizePushSubscription,
  normalizeState,
  pushSubscriptionScopeSignature,
} = mobileRuntimeStateFacadeService;
const saveState = (next = state, options = {}) => mobileRuntimeStateFacadeService.saveState(next, options);
const runtimeStateThreadService = createRuntimeStateThreadService({
  authenticateRequest,
  authCanAccessWorkspace,
  chatGroupMemberWorkspaceIds,
  groupChatTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
  saveState,
  state: () => state,
});
const getRuntimeStateThreadService = () => runtimeStateThreadService;
const mobileRuntimePathAccessService = createMobileRuntimePathAccessService({
  filesystemMountProvider: () => filesystemMountProvider,
  pathPolicyProvider: () => pathPolicyProvider,
  securityBoundaryProvider: () => securityBoundaryProvider,
});
const normalizeLocalPath = (...args) => mobileRuntimePathAccessService.normalizeLocalPath(...args);
const windowsPathToWsl = (...args) => mobileRuntimePathAccessService.windowsPathToWsl(...args);
const allowedRoots = (...args) => mobileRuntimePathAccessService.allowedRoots(...args);
const isPathAllowed = (...args) => mobileRuntimePathAccessService.isPathAllowed(...args);
const isPathAllowedForThread = (...args) => mobileRuntimePathAccessService.isPathAllowedForThread(...args);
const isDirectoryBrowserPathAllowedForThread = (...args) => mobileRuntimePathAccessService.isDirectoryBrowserPathAllowedForThread(...args);
const getGatewayRuntimeCompositionService = () => mobileRuntimeGatewayFacadeService.getGatewayRuntimeCompositionService();
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
  findWorkspace: (...args) => findWorkspace(...args), fs, isOwnerAuth, isPathAllowed, isPathAllowedForThread, loadCatalog: (...args) => loadCatalog(...args),
  logicalDirectoryDisplayPath: (...args) => workspaceDisplayPathService.logicalDirectoryDisplayPath(...args),
  logicalUserPathFallback: (...args) => workspaceDisplayPathService.logicalUserPathFallback(...args),
  makeId, mimeFor, mobileSqliteStore, normalizeLocalPath, normalizeStringList, nowIso, os, path,
  pathInsideAnyRoot, policyForThread: (...args) => policyForThread(...args), readJsonFirst, resolveArtifactPathFromMessage,
  resolveBrowserPath: (...args) => getDirectoryBrowserBoundaryService().resolveBrowserPath(...args),
  runDirectoryBridge, runtimeEnv, sendJson, sharedDirectoryProjectsForWorkspace: (...args) => sharedDirectoryProjectsForWorkspace(...args), sharedDirectoryRoots: (...args) => sharedDirectoryRoots(...args),
  state: () => state, textBufferPreview, textFilePreview, uploadRootsForThread, useSqliteServiceStore,
  windowsPathToWsl, workspacePrincipal,
});
const mobileRuntimeAccessPolicyFacadeService = createMobileRuntimeAccessPolicyFacadeService({
  accessPolicyProvider,
  securityBoundaryProvider,
});
const sanitizePolicy = (...args) => mobileRuntimeAccessPolicyFacadeService.sanitizePolicy(...args);
const ownerSetupStatus = (...args) => authProvider.ownerSetupStatus(...args);
const createInitialOwnerKey = (...args) => authProvider.createInitialOwnerKey(...args);
mobileRuntimeArtifactFacadeService = createMobileRuntimeArtifactFacadeService({
  fileArtifactAccessService,
  dedupe,
  effectiveProjectForThread: (...args) => effectiveProjectForThread(...args),
  extractArtifactPaths,
  findProject: (...args) => findProject(...args),
  findSubproject: (...args) => findSubproject(...args),
  fs,
  isPathAllowedForThread,
  makeId,
  mimeFor,
  normalizeLocalPath,
  nowIso,
  path,
  sourceMarkdownSearchCache,
  sourceMarkdownSearchLimit: SOURCE_MARKDOWN_SEARCH_LIMIT,
  state: () => state,
});
const runtimeConfigProvider = createRuntimeConfigProvider({
  storagePath: () => RUNTIME_CONFIG_PATH, ensureDataDir, nowIso, defaultHermesApiBase: () => HERMES_API_BASE,
  apiKeyPaths: () => HERMES_API_KEY_PATHS, envPaths: () => HERMES_ENV_PATHS,
  defaultWebPushSubject: () => WEB_PUSH_SUBJECT, defaultWebPushVapidPath: () => WEB_PUSH_VAPID_PATH,
  gatewayWorkerElasticConfig: () => GATEWAY_POOL_ELASTIC_CONFIG,
});
const mobileRuntimeConfigFacadeService = createMobileRuntimeConfigFacadeService({ runtimeConfigProvider, pushStatus: () => webPushDeliveryService?.publicPushStatus?.() || {}, webPushConfig: () => webPushDeliveryService?.getWebPushConfig?.() || null, webPushEnabled: () => WEB_PUSH_ENABLED });
const { effectiveHermesApiBase, effectiveWebPushSubject, effectiveWebPushVapidPath, loadHermesApiKey, loadRuntimeConfig, publicRuntimeConfig, saveRuntimeConfig } = mobileRuntimeConfigFacadeService;
const mobileRuntimeGatewayCompositionOptionsService = createMobileRuntimeGatewayCompositionOptionsService({
  constants: () => ({
    gatewayModelPreflightEnabled,
    runtimeEnv,
    toolSchemaEpoch: GATEWAY_TOOL_SCHEMA_EPOCH,
  }),
  delegates: () => ({
    accessPolicyHardeningOptionsForGatewayRouting,
    addThreadEvent,
    appendBounded,
    assertRunConcurrencyCapacity,
    buildAccessPolicy,
    buildConversationHistory,
    buildHermesInstructions,
    broadcast,
    chooseGatewayRunTarget,
    compactFullContent,
    compactMessage,
    dedupe,
    effectiveProjectForThread,
    ensureGroupChatSharedArtifactCopies,
    enqueueExternalDeliveryForTerminalMessage,
    findWorkspace,
    gatewayConversationId,
    gatewayPool,
    gatewaySkillRoutingForWorkspace,
    groupChatDeliveryRootForThread,
    isOrdinaryToolSchemaElevationRequest,
    makePublicTaskId,
    mergeAccessPolicyOverride,
    modelPermissionApprovalRequest,
    nowIso,
    nowMs: () => Date.now(),
    registerArtifactsFromText,
    releaseGatewayRunTarget,
    replaceGatewayRunTarget,
    sanitizePolicy,
    saveState,
    singleGatewayRunner,
    stripPermissionApprovalMarkers,
    supplementGatewayUsage,
    threadSummary,
    windowsPathToWsl,
  }),
  runtime: () => ({
    activeStreams,
    fs,
    logger: console,
    state: () => state,
  }),
  services: () => ({
    gatewayRunModelToolsetSelectionService,
    gatewayRunToolsetRoutingService,
    getRuntimeStateThreadService,
    getSemanticDirectoryAttachmentService,
    pluginCapabilityActivationService,
    pluginRequiredSkillPreloadService,
    topicContextCompactionService,
    webPushDeliveryService,
  }),
});
mobileRuntimeGatewayFacadeService = createMobileRuntimeGatewayFacadeService({
  apiTimeoutMs: () => HERMES_API_TIMEOUT_MS,
  createGatewayRuntimeCompositionService,
  effectiveHermesApiBase: () => effectiveHermesApiBase(),
  fs,
  gatewayPoolElasticConfig: () => runtimeConfigProvider.gatewayWorkerElasticConfig(loadRuntimeConfig(), GATEWAY_POOL_ELASTIC_CONFIG),
  gatewayPoolEnabled: () => GATEWAY_POOL_ENABLED,
  gatewayPoolHealthTimeoutMs: GATEWAY_POOL_HEALTH_TIMEOUT_MS,
  gatewayPoolManifestPaths: () => GATEWAY_POOL_MANIFEST_PATHS,
  gatewayRuntimeCompositionOptions: () => mobileRuntimeGatewayCompositionOptionsService.gatewayRuntimeCompositionOptions(),
  gatewayPoolStartMode: () => GATEWAY_POOL_START_MODE,
  gatewayToolSchemaEpoch: () => GATEWAY_TOOL_SCHEMA_EPOCH,
  gatewayUsageTelemetryEnabled: () => GATEWAY_USAGE_TELEMETRY_ENABLED,
  gatewayUsageTelemetryProfileRoots: () => GATEWAY_USAGE_TELEMETRY_PROFILE_ROOTS,
  loadHermesApiKey: () => loadHermesApiKey(),
  nowIso,
  path,
  runConcurrencyPolicy,
  state: () => state,
  toolRoot: TOOL_ROOT,
});
const mobileRuntimeGroupChatAttachmentService = createMobileRuntimeGroupChatAttachmentService({
  groupDeliveriesDir: GROUP_DELIVERIES_DIR,
  groupChatTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
  safeFileName: (...args) => safeFileName(...args),
  normalizeLocalPath: (...args) => normalizeLocalPath(...args),
  isProtectedPath: (value) => securityBoundaryProvider.isProtectedPath(value),
  windowsPathToWsl,
  listArtifacts: () => state.artifacts || [],
});
const {
  ensureGroupChatSharedArtifactCopies,
  groupChatDeliveryRootForThread,
  safeArtifactCopyName,
  safeStorageSegment,
  storedArtifactForMessageArtifact,
} = mobileRuntimeGroupChatAttachmentService;
const learningCoinAwardService = createLearningCoinAwardService({
  learningCoinService,
  logger: console,
  onAward: (award) => broadcast({ type: "learning-coins.updated", workspaceId: award.workspaceId, studentId: award.studentId }),
});
const actionInboxService = createActionInboxService({ compactText, makeId, nowIso, store: mobileSqliteStore });
webPushDeliveryService = createWebPushDeliveryService({
  actionInboxService: () => actionInboxService, appRouteUrl, automationProvider: () => automationProvider, chatGroupMemberWorkspaceIds, compactText, dedupe,
  effectiveWebPushSubject, effectiveWebPushVapidPath, hashValue, findWorkspace: (...args) => findWorkspace(...args),
  isWeixinSingleWindowThread: (...args) => getSingleWindowThreadService().isWeixinSingleWindowThread(...args),
  loadCatalog: (...args) => loadCatalog(...args), loadRuntimeConfig, logger: console, makeId, maybeReconcileKanbanDependencyBlocks, normalizeStringList,
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
const loadVapidConfig = (...args) => webPushDeliveryService.loadVapidConfig(...args);
const initializeWebPush = (...args) => webPushDeliveryService.initializeWebPush(...args);
const generateWebPushVapidConfig = (...args) => webPushDeliveryService.generateWebPushVapidConfig(...args);
const reloadWebPush = (...args) => webPushDeliveryService.initializeWebPush(...args);
const mobileRuntimePublicStatusService = createMobileRuntimePublicStatusService({
  defaultReasoningInfo: () => defaultReasoningInfo(),
  gatewayStatusProjection,
  isOwnerAuth: (...args) => isOwnerAuth(...args),
  loadRuntimeConfig: () => loadRuntimeConfig(),
  reasoningEffortOptions: REASONING_EFFORT_OPTIONS,
  runConcurrencySnapshot: () => runConcurrencySnapshot(),
  runtimeConfigProvider,
});
const weixinIngressProvider = createWeixinIngressProvider({
  listWorkspaces: () => loadCatalog().workspaces,
  workspaceIdForPrincipal,
  defaultWorkspaceId: () => WEIXIN_INGRESS_DEFAULT_WORKSPACE,
});
const mobileRuntimeWeixinFacadeService = createMobileRuntimeWeixinFacadeService({
  attachmentContextWindowMs: WEIXIN_INGRESS_ATTACHMENT_CONTEXT_WINDOW_MS,
  authCanAccessWorkspace,
  bridgeFileBuffer: (...args) => fileResponseService.bridgeFileBuffer(...args),
  broadcast,
  chatGroupMemberWorkspaceIds,
  classifyMaintenanceIntent: (text) => securityBoundaryProvider.classifyMaintenanceIntent(text),
  compactMessage,
  compactText,
  compactThread,
  createWeixinRuntimeCompositionService,
  dataDir: DATA_DIR,
  deliveryId: (threadId, messageId) => weixinIngressProvider.deliveryId(threadId, messageId),
  egressDecide: (payload) => egressPolicyProvider.decide(payload),
  egressPolicyProvider,
  ensureThreadForEvent: (event, workspaceId) => getSingleWindowThreadService().ensureWeixinSingleWindowThread(workspaceId, event),
  ensureWeixinSingleWindowThread: (...args) => getSingleWindowThreadService().ensureWeixinSingleWindowThread(...args),
  findExistingIngressEvent: (...args) => getRuntimeStateThreadService().findExistingWeixinIngressEvent(...args),
  findThreadForAuth: (...args) => getRuntimeStateThreadService().findThreadForAuth(...args),
  findWorkspace: (...args) => findWorkspace(...args),
  forwardMarkdownMaxBytes: WEIXIN_FORWARD_MARKDOWN_MAX_BYTES,
  hashValue,
  ingressKeyPaths: WEIXIN_INGRESS_KEY_PATHS,
  isOwnerAuth,
  isStaleHttpToolAvailabilityClaim: (...args) => mobileRuntimeGatewayContextFacadeService.isStaleHttpToolAvailabilityClaim(...args),
  isStaleImageToolAvailabilityClaim: (...args) => mobileRuntimeGatewayContextFacadeService.isStaleImageToolAvailabilityClaim(...args),
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
  resolveAuthorizedCronDeliverableFile: (...args) => resolveAuthorizedCronDeliverableFile(...args),
  resolveAuthorizedCronOutputFile: (...args) => resolveAuthorizedCronOutputFile(...args),
  resolveFileForBrowserRequest,
  resolveKanbanOutputFile: (...args) => resolveKanbanOutputFile(...args),
  retryBaseMs: WEIXIN_DELIVERY_RETRY_BASE_MS,
  retryLimit: WEIXIN_DELIVERY_RETRY_LIMIT,
  retryMaxMs: WEIXIN_DELIVERY_RETRY_MAX_MS,
  runConcurrencyError: (...args) => runConcurrencyError(...args),
  safeFileName,
  saveState,
  sendJson,
  senderInfoForWorkspace,
  singleWindowChatTaskGroupId: SINGLE_WINDOW_CHAT_TASK_GROUP_ID,
  spawnSync,
  startRunForThread: (...args) => startRunForThread(...args),
  state: () => state,
  taskGroupHasRunningRun,
  taskGroupId: SINGLE_WINDOW_CHAT_TASK_GROUP_ID,
  threadAccessibleToAuth: (...args) => getRuntimeStateThreadService().threadAccessibleToAuth(...args),
  threadSummary,
  weixinIngressProvider,
  workspaceLabel,
});
bootTrace("before loadState");
state = loadState();
bootTrace("after loadState");
mobileRuntimeGroupChatFacadeService = createMobileRuntimeGroupChatFacadeService({
  groupChatTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
  groupMessageRevokedText: GROUP_MESSAGE_REVOKED_TEXT,
  isOwnerAuth,
  normalizeChatGroup,
  senderInfoForWorkspace,
  workspaceLabel,
});
const groupChatRuntimeMethod = (methodName) => (...args) => mobileRuntimeGroupChatFacadeService[methodName](...args);
const groupChatRuntimeDelegates = Object.fromEntries("canRevokeGroupChatMessage groupAssistantReplyForUserMessage groupMessageRevoker publicChatGroup revokeGroupMessagePayload".split(" ").map((methodName) => [methodName, groupChatRuntimeMethod(methodName)]));
const { canRevokeGroupChatMessage, groupAssistantReplyForUserMessage, groupMessageRevoker, publicChatGroup, revokeGroupMessagePayload } = groupChatRuntimeDelegates;
bootTrace("group chat facade ready");
mobileRuntimeThreadViewFacadeService = createMobileRuntimeThreadViewFacadeService({
  compactArtifactsForMessage,
  compactText,
  comparablePath,
  findThreadForMessage,
  isSingleWindowConversationTaskGroupId,
  maxEventPreviewChars: MAX_EVENT_PREVIEW_CHARS,
  maxApiTextChars: MAX_API_TEXT_CHARS,
  maxStoredEventsPerThread: MAX_STORED_EVENTS_PER_THREAD,
  normalizeTaskGroupMeta: (...args) => getRuntimeStateNormalizationService().normalizeTaskGroupMeta(...args),
  projectSearchLabels: (...args) => getSemanticDirectoryAttachmentService().projectSearchLabels(...args),
  publicChatGroup,
  publicExternalIngress: (...args) => getSingleWindowThreadService().publicExternalIngress(...args),
  publicWeixinOutboundDelivery: (...args) => mobileRuntimeWeixinFacadeService.publicWeixinOutboundDelivery(...args),
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
const {
  allProjectsForWorkspaceSync,
  buildAccessPolicy,
  cachedDynamicProjectsForWorkspace,
  clearDynamicProjectCache,
  dedupeProjects,
  effectiveProjectForThread,
  findProject,
  findSubproject,
  findWorkspace,
  getSharedDirectoryProjectionService,
  getWorkspaceProjectProvider,
  invalidateCatalogCache,
  isShareableRootProject,
  loadCatalog,
  mergeAccessPolicyOverride,
  mergeDefaultExternalAccessPolicy,
  normalizeSharePermission,
  normalizeShareScope,
  normalizeShareTargets,
  policyForThread,
  projectsForWorkspace,
  publicProjectsForWorkspace,
  publicSharedDirectory,
  remoteWorkspaceDirectoryProjects,
  removeSharedDirectoryRecord,
  setDynamicProjectsForWorkspace,
  shareableRootProjectForPath,
  sharedDirectoriesForWorkspace,
  sharedDirectoryLabel,
  sharedDirectoryProjectsForWorkspace,
  sharedDirectoryRoots,
  updateSharedDirectoryAccess,
  upsertSharedDirectory,
} = createMobileRuntimeWorkspaceCatalogFacade({
  createRuntimeWorkspaceCatalogService,
  projectDiscoveryProvider,
  runtimeWorkspaceCatalogOptions: () => ({
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
  }),
});
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
const singleWindowThreadService = createSingleWindowThreadService({
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
const getSingleWindowThreadService = () => singleWindowThreadService;
const semanticDirectoryAttachmentService = createSemanticDirectoryAttachmentService({
  allProjectsForWorkspaceSync,
  comparablePath,
  dedupe,
  directoryRouteDisplayLabel: (...args) => workspaceDisplayPathService.directoryRouteDisplayLabel(...args),
  effectiveProjectForThread,
  findProject,
  findSubproject,
  genericDirectoryAliasInstruction: "If a semantic project match exists, do not emit a generic `鐩綍鍒悕锛氶粯璁ょ洰褰?...`; emit the matched project alias/path instead.",
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
const getSemanticDirectoryAttachmentService = () => semanticDirectoryAttachmentService;
mobileRuntimeFileAccessFacadeService = createMobileRuntimeFileAccessFacadeService({
  allProjectsForWorkspaceSync,
  authenticateRequest,
  authCanAccessWorkspace,
  chatGroupMemberWorkspaceIds,
  comparablePath,
  dedupe,
  fileArtifactResolverService,
  fileResponseService,
  findThreadForAuth: (auth, threadId) => getRuntimeStateThreadService().findThreadForAuth(auth, threadId),
  getRuntimeStateNormalizationService,
  getSingleWindowThreadService,
  isOwnerAuth,
  logicalDirectoryDisplayPath: (...args) => workspaceDisplayPathService.logicalDirectoryDisplayPath(...args),
  mimeFor,
  normalizeLocalPath,
  pathDirectChildOfRoot,
  pathInsideAnyRoot,
  pathPolicyProvider,
  policyForThread,
  runDirectoryBridge,
  sharedDirectoryProvider,
  sharedDirectoryRoots,
});
bootTrace("file access facade ready");
const singleGatewayRunner = (...args) => mobileRuntimeGatewayFacadeService.singleGatewayRunner(...args);
const gatewayPool = (...args) => mobileRuntimeGatewayFacadeService.gatewayPool(...args);
const getHermesStatus = (...args) => mobileRuntimeGatewayFacadeService.getHermesStatus(...args);
const getGatewayWorkspaceProvisioningService = (...args) => mobileRuntimeGatewayFacadeService.getGatewayWorkspaceProvisioningService(...args);
const gatewayUsageTelemetry = (...args) => mobileRuntimeGatewayFacadeService.gatewayUsageTelemetry(...args);
const chooseGatewayRunTarget = (...args) => mobileRuntimeGatewayFacadeService.chooseGatewayRunTarget(...args);
const releaseGatewayRunTarget = (...args) => mobileRuntimeGatewayFacadeService.releaseGatewayRunTarget(...args);
const replaceGatewayRunTarget = (...args) => mobileRuntimeGatewayFacadeService.replaceGatewayRunTarget(...args);
const runConcurrencySnapshot = (...args) => mobileRuntimeGatewayFacadeService.runConcurrencySnapshot(...args);
const runConcurrencyError = (...args) => mobileRuntimeGatewayFacadeService.runConcurrencyError(...args);
const assertRunConcurrencyCapacity = (...args) => mobileRuntimeGatewayFacadeService.assertRunConcurrencyCapacity(...args);
const publicReasoningInfoForAuth = (...args) => mobileRuntimePublicStatusService.publicReasoningInfoForAuth(...args);
const publicGatewayPoolStatusForAuth = (...args) => mobileRuntimePublicStatusService.publicGatewayPoolStatusForAuth(...args);
const publicConcurrencyForAuth = (...args) => mobileRuntimePublicStatusService.publicConcurrencyForAuth(...args);
const mobileRuntimeOwnerElevationFacadeService = createMobileRuntimeOwnerElevationFacadeService({
  audit: (eventType, payload) => auditEventProvider.audit(eventType, payload),
  compactText,
  defaultDurationMinutes: OWNER_ELEVATION_DEFAULT_MINUTES,
  durationOptionsMinutes: OWNER_ELEVATION_DURATION_OPTIONS_MINUTES,
  gatewaySkillProfileRouting: GATEWAY_SKILL_PROFILE_ROUTING,
  isOwnerAuth,
  loadCatalog,
  maintenanceRunsEnabled: () => OWNER_MAINTENANCE_RUNS_ENABLED,
  onceTtlMs: OWNER_ELEVATION_ONCE_TTL_MS,
  permissionApprovalMarker: PERMISSION_APPROVAL_MARKER,
  securityBoundaryProvider,
});
const accessPolicyHardeningOptionsForGatewayRouting = (...args) => mobileRuntimeOwnerElevationFacadeService.accessPolicyHardeningOptionsForGatewayRouting(...args);
const gatewayRoutingForModelRun = (...args) => mobileRuntimeOwnerElevationFacadeService.gatewayRoutingForModelRun(...args);
const gatewaySkillRoutingForWorkspace = (...args) => mobileRuntimeOwnerElevationFacadeService.gatewaySkillRoutingForWorkspace(...args);
const modelPermissionApprovalRequest = (...args) => mobileRuntimeOwnerElevationFacadeService.modelPermissionApprovalRequest(...args);
const ownerElevationInstructions = (...args) => mobileRuntimeOwnerElevationFacadeService.ownerElevationInstructions(...args);
const precedingUserMessageForAssistant = (...args) => mobileRuntimeOwnerElevationFacadeService.precedingUserMessageForAssistant(...args);
const sanitizeElevationScope = (...args) => mobileRuntimeOwnerElevationFacadeService.sanitizeElevationScope(...args);
const stripPermissionApprovalMarkers = (...args) => mobileRuntimeOwnerElevationFacadeService.stripPermissionApprovalMarkers(...args);
mobileRuntimeWorkspaceFacadeService = createMobileRuntimeWorkspaceFacadeService({
  authProvider,
  clearDynamicProjectCache,
  dedupe,
  deleteWorkspaceAccessKey: (workspaceId) => authProvider.deleteWorkspaceAccessKey(workspaceId),
  ensureDataDir,
  ensureWorkspaceGateway: (...args) => getGatewayWorkspaceProvisioningService().ensureWorkspaceGateway(...args),
  filterRoots: (roots) => securityBoundaryProvider.filterRoots(roots),
  findWorkspace: (...args) => findWorkspace(...args),
  invalidateCatalogCache,
  loadCatalog,
  normalizeStringList,
  normalizeStringMap,
  nowIso,
  ownerDefaultWorkspace: OWNER_DEFAULT_WORKSPACE,
  publicWorkspaceBindings: (workspace) => workspaceBindingsProvider.publicBindings(workspace),
  rootConflictsWithProtected: (root) => securityBoundaryProvider.rootConflictsWithProtected(root),
  sendJson,
  storagePath: LOCAL_WORKSPACES_PATH,
  workspacePrincipal,
});
const getLocalWorkspaceStoreService = (...args) => mobileRuntimeWorkspaceFacadeService.getLocalWorkspaceStoreService(...args);
const workspaceIdSlug = (...args) => mobileRuntimeWorkspaceFacadeService.workspaceIdSlug(...args);
const workspaceIdFromUsername = (...args) => mobileRuntimeWorkspaceFacadeService.workspaceIdFromUsername(...args);
const localWorkspaceDefaults = (...args) => mobileRuntimeWorkspaceFacadeService.localWorkspaceDefaults(...args);
const localWorkspaceRecords = (...args) => mobileRuntimeWorkspaceFacadeService.localWorkspaceRecords(...args);
const upsertLocalWorkspace = (...args) => mobileRuntimeWorkspaceFacadeService.upsertLocalWorkspace(...args);
const deleteLocalWorkspace = (...args) => mobileRuntimeWorkspaceFacadeService.deleteLocalWorkspace(...args);
const getOwnerElevationGrantService = (...args) => mobileRuntimeOwnerElevationFacadeService.getOwnerElevationGrantService(...args);
const isOwnerElevationActive = (...args) => mobileRuntimeOwnerElevationFacadeService.isOwnerElevationActive(...args);
const grantOwnerElevationOnce = (...args) => mobileRuntimeOwnerElevationFacadeService.grantOwnerElevationOnce(...args);
const consumeOwnerElevationOnce = (...args) => mobileRuntimeOwnerElevationFacadeService.consumeOwnerElevationOnce(...args);
const publicOwnerElevationStatus = (...args) => mobileRuntimeOwnerElevationFacadeService.publicOwnerElevationStatus(...args);
const grantOwnerElevation = (...args) => mobileRuntimeOwnerElevationFacadeService.grantOwnerElevation(...args);
const revokeOwnerElevation = (...args) => mobileRuntimeOwnerElevationFacadeService.revokeOwnerElevation(...args);
const pushWorkspaceForAuth = (...args) => mobileRuntimeWorkspaceFacadeService.pushWorkspaceForAuth(...args);
const getWorkspacePublicProjectionService = (...args) => mobileRuntimeWorkspaceFacadeService.getWorkspacePublicProjectionService(...args);
const publicWorkspacesForAuth = (...args) => mobileRuntimeWorkspaceFacadeService.publicWorkspacesForAuth(...args);
const requireOwner = (...args) => mobileRuntimeWorkspaceFacadeService.requireOwner(...args);
const requireWorkspaceAccess = (...args) => mobileRuntimeWorkspaceFacadeService.requireWorkspaceAccess(...args);
mobileRuntimeLocalBridgeFacadeService = createMobileRuntimeLocalBridgeFacadeService({
  bridgeCommandProvider,
  bridgeHostKeyPath: BRIDGE_HOST_KEY_PATH,
  bridgeHostUrl: () => BRIDGE_HOST_URL,
  compactText,
  createAutomationId: () => `auto_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`,
  createLocalBridgeRuntimeService,
  cronBridgeScript: CRON_BRIDGE_SCRIPT,
  cronStdoutLimitBytes: 2_000_000,
  cronTimeoutMs: CRON_BRIDGE_TIMEOUT_MS,
  automationBackend: AUTOMATION_BACKEND,
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
  sortJobs: (...args) => webPushDeliveryService.automationListSortByLatestDeliverable(...args),
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
const {
  getLocalBridgeRuntimeService,
  runCronBridge,
  runTodoBridge,
} = mobileRuntimeLocalBridgeFacadeService;
const todoProvider = createTodoProvider({
  runBridge: runTodoBridge,
  workspacePrincipal,
  todoAssigneesForWorkspace,
  publicTodo,
  sourceName: () => useLocalTodoBackend()
    ? (useSqliteServiceStore() ? "sqlite_todos" : "local_todos")
    : (useKanbanTodoBackend() ? "hermes_kanban" : (process.env.HERMES_WEB_TODO_PLUGIN_NAME || "hermes_todos")),
});
const automationJobFilterService = createAutomationJobFilterService(); const cronJobMatchesOwner = (...args) => automationJobFilterService.jobMatchesOwner(...args);
const cronJobMatchesSearch = (...args) => automationJobFilterService.jobMatchesSearch(...args);
const automationCronProfileService = createAutomationCronProfileService({ fs, manifestPaths: () => [process.env.HERMES_MOBILE_GATEWAY_POOL_MANIFEST, process.env.HERMES_WEB_GATEWAY_POOL_MANIFEST, process.env.HERMES_GATEWAY_POOL_MANIFEST_PATH, ...GATEWAY_POOL_MANIFEST_PATHS, path.join(DATA_DIR, "gateway-pool-manifest-mac.json"), path.join(DATA_DIR, "gateway-pool-manifest.json")] }); const resolveAutomationCronProfile = (...args) => automationCronProfileService.resolveProfile(...args);
const automationProvider = createAutomationProvider({
  runBridge: runCronBridge,
  automationBackend: AUTOMATION_BACKEND,
  allowLocalAutomationWrites: useLocalAutomationBackend(),
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
const ownerExternalInterfaceBindings = (...args) => externalIntegrationProvider.ownerInterfaceBindings(...args);
const ownerExternalAccessPolicy = (...args) => externalIntegrationProvider.ownerAccessPolicy(...args);
const clearCronListCache = (...args) => automationProvider.clearListCache(...args);
const runCronListBridgeCached = (options = {}) => automationProvider.listJobs(Object.assign({ limit: 0 }, options));
const mobileRuntimeNaturalLanguageGatewayService = createMobileRuntimeNaturalLanguageGatewayService({
  abortSignalTimeout: (ms) => AbortSignal.timeout(ms),
  chooseGatewayRunTarget,
  defaultTimeoutMs: AUTOMATION_CREATE_TIMEOUT_MS,
  gatewayPool,
  naturalLanguageDraftService: () => naturalLanguageDraftService,
  randomHex: (bytes) => crypto.randomBytes(bytes).toString("hex"),
  releaseGatewayRunTarget,
  responseTextFromValue,
});
const extractJsonObject = (...args) => mobileRuntimeNaturalLanguageGatewayService.extractJsonObject(...args);
const hermesModelText = (...args) => mobileRuntimeNaturalLanguageGatewayService.hermesModelText(...args);
const normalizeAutomationDraft = (...args) => mobileRuntimeNaturalLanguageGatewayService.normalizeAutomationDraft(...args);
const interpretAutomationNaturalLanguage = (...args) => mobileRuntimeNaturalLanguageGatewayService.interpretAutomationNaturalLanguage(...args);
const skillDetailProvider = createSkillDetailProvider({
  timeoutMs: SKILL_BRIDGE_TIMEOUT_MS,
  compactText,
  extractJsonObject,
  findWorkspace,
  hermesModelText,
  sanitizePolicy,
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
mobileRuntimeKanbanFacadeService = createMobileRuntimeKanbanFacadeService({
  authCanAccessWorkspace,
  authenticateRequest,
  automationCreateModel: AUTOMATION_CREATE_MODEL,
  assessmentMaxQuestions: KANBAN_ASSESSMENT_MAX_QUESTIONS,
  assessmentModelTimeoutMs: KANBAN_ASSESSMENT_MODEL_TIMEOUT_MS,
  assessmentPlanMaxExams: KANBAN_ASSESSMENT_PLAN_MAX_EXAMS,
  broadcast,
  compactText,
  comparablePath,
  extractArtifactPaths,
  extractJsonObject,
  findWorkspace,
  getDirectoryBrowserBoundaryService,
  getRuntimeStateNormalizationService,
  getSingleWindowThreadService,
  hermesModelText,
  kanbanAssigneePolicy,
  kanbanAssessmentCaseModes: KANBAN_ASSESSMENT_CASE_MODES,
  kanbanCardEffectiveCaseIndex,
  kanbanCardProvider,
  kanbanCardRevisionOf,
  kanbanCaseShareService,
  kanbanMaintenanceService,
  kanbanOutputAccessService,
  kanbanPlanService,
  kanbanReadingWorkflowService,
  kanbanStudyArtifactService,
  kanbanStudyCaseModes: KANBAN_STUDY_CASE_MODES,
  learningCoinAwardService,
  logger: console,
  makeId,
  mkdirp: (targetPath) => fs.mkdirSync(targetPath, { recursive: true }),
  naturalLanguageDraftService,
  normalizeChatGroup,
  normalizeLocalPath,
  nowIso,
  pathExists: (targetPath) => fs.existsSync(targetPath),
  pathInsideAnyRoot,
  randomHex: (bytes) => crypto.randomBytes(bytes).toString("hex"),
  readingPlanMaxSessions: KANBAN_READING_PLAN_MAX_SESSIONS,
  safeFileName,
  sanitizePolicy,
  saveState,
  sendJson,
  senderInfoForWorkspace,
  sharedDirectoriesForWorkspace,
  sharedFolderName: KANBAN_STUDY_SHARED_FOLDER_NAME,
  state: () => state,
  threadSummary,
  todoAssigneeLabel,
  topicKind: KANBAN_CASE_TOPIC_KIND,
  upsertSharedDirectory,
  verifyDirectTodoCreateResult,
  visibleKanbanCaseCards,
  workspaceDefaultRoot,
  workspacePrincipal,
});
const publicWorkspace = (...args) => mobileRuntimeWorkspaceFacadeService.publicWorkspace(...args);
const publicAccessKeyStatus = (...args) => mobileRuntimeWorkspaceFacadeService.publicAccessKeyStatus(...args);
const listWorkspaceAccessKeyStatuses = (...args) => mobileRuntimeWorkspaceFacadeService.listWorkspaceAccessKeyStatuses(...args);
const rotateWorkspaceAccessKey = (...args) => mobileRuntimeWorkspaceFacadeService.rotateWorkspaceAccessKey(...args);
const revokeWorkspaceAccessKey = (...args) => mobileRuntimeWorkspaceFacadeService.revokeWorkspaceAccessKey(...args);
const rotateGlobalAccessKey = (...args) => mobileRuntimeWorkspaceFacadeService.rotateGlobalAccessKey(...args);
const GATEWAY_TOOL_SCHEMA_EPOCH = "20260612-email-content-mcp-v1"; const gatewayRunInstructionService = createGatewayRunInstructionService({
  dedupe,
  toolSchemaEpoch: GATEWAY_TOOL_SCHEMA_EPOCH,
  normalizeSingleWindowMode,
  createDeliveryBoundaryInstructions,
  permissionBoundarySkillInstructions: (policy) => securityBoundaryProvider.permissionBoundarySkillInstructions(policy),
  semanticProjectRoutingInstructions: (...args) => getSemanticDirectoryAttachmentService().semanticProjectRoutingInstructions(...args),
  isKanbanCaseTopicThread: (...args) => getSingleWindowThreadService().isKanbanCaseTopicThread(...args),
  explicitWebSearchMaxCalls: RUN_EXPLICIT_WEB_SEARCH_MAX_CALLS, webSearchMaxCalls: RUN_WEB_SEARCH_MAX_CALLS,
});
const gatewayRunToolsetRoutingService = createGatewayRunToolsetRoutingService({ dedupe }); const gatewayRunModelToolsetSelectionService = createGatewayRunModelToolsetSelectionService({ dedupe, enabled: GATEWAY_MODEL_PERMISSION_PREFLIGHT_ENABLED || GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_ENABLED, toolsetSelectionEnabled: GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_ENABLED, gatewayPool: () => gatewayPool(), nowMs: () => Date.now(), selectorModel: GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_MODEL, selectorProvider: GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_PROVIDER, selectorReasoningEffort: GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_REASONING_EFFORT, stopTimeoutMs: GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_STOP_TIMEOUT_MS, timeoutMs: GATEWAY_MODEL_FIRST_TOOLSET_SELECTION_TIMEOUT_MS, permissionPreflightTimeoutMs: GATEWAY_MODEL_PERMISSION_PREFLIGHT_TIMEOUT_MS }); const topicContextCompactionService = createTopicContextCompactionService({ store: { getTopicContextSummary: (...args) => mobileSqliteStore().getTopicContextSummary(...args), getTopicWorkingState: (...args) => mobileSqliteStore().getTopicWorkingState(...args), listTopicContextRefs: (...args) => mobileSqliteStore().listTopicContextRefs(...args), upsertTopicContextSummary: (...args) => mobileSqliteStore().upsertTopicContextSummary(...args), upsertTopicWorkingState: (...args) => mobileSqliteStore().upsertTopicWorkingState(...args), replaceTopicContextRefs: (...args) => mobileSqliteStore().replaceTopicContextRefs(...args) }, nowIso }); const conversationHistoryService = createConversationHistoryService({
  policyHasToolset: (...args) => gatewayRunInstructionService.policyHasToolset(...args),
  compactText,
  isSingleWindowConversationTaskGroupId,
  maxHistoryMessages: MAX_HISTORY_MESSAGES,
  chatContextMaxMessages: CHAT_CONTEXT_MAX_MESSAGES,
  chatContextMaxChars: CHAT_CONTEXT_MAX_CHARS,
  maxApiTextChars: MAX_API_TEXT_CHARS,
  contextAssemblyMode: CONTEXT_ASSEMBLY_MODE,
  topicContextService: topicContextCompactionService,
});
const mobileRuntimeGatewayContextFacadeService = createMobileRuntimeGatewayContextFacadeService({
  conversationHistoryService,
  gatewayRunInstructionService,
  gatewayUsageTelemetry,
  getGatewayRuntimeCompositionService,
});
const gatewayContextMethod = (methodName) => (...args) => mobileRuntimeGatewayContextFacadeService[methodName](...args);
const gatewayContextDelegates = Object.fromEntries("buildConversationHistory buildHermesInstructions callableFunctionHintsForToolsets compactConversationHistory conversationHistoryContentForMessage currentToolSchemaOverrideInstructions deriveTitle extractCompletedOutput findRunTarget formatAccessPolicyInstructionSummary gatewayConversationId gatewayTargetForRun isOrdinaryToolSchemaElevationRequest isStaleAudioToolAvailabilityClaim isStaleDocxToolAvailabilityClaim isToolUnavailableClaimText policyHasToolset stripDirectoryAliasLinesForChatHistory supplementGatewayUsage".split(" ").map((methodName) => [methodName, gatewayContextMethod(methodName)]));
const { buildConversationHistory, buildHermesInstructions, callableFunctionHintsForToolsets, compactConversationHistory, conversationHistoryContentForMessage, currentToolSchemaOverrideInstructions, deriveTitle, extractCompletedOutput, findRunTarget, formatAccessPolicyInstructionSummary, gatewayConversationId, gatewayTargetForRun, isOrdinaryToolSchemaElevationRequest, isStaleAudioToolAvailabilityClaim, isStaleDocxToolAvailabilityClaim, isToolUnavailableClaimText, policyHasToolset, stripDirectoryAliasLinesForChatHistory, supplementGatewayUsage } = gatewayContextDelegates;
const getWeixinRuntimeCompositionService = () => mobileRuntimeWeixinFacadeService.getWeixinRuntimeCompositionService();
const requireWeixinIngress = (...args) => mobileRuntimeWeixinFacadeService.requireWeixinIngress(...args);
const weixinIngressIsAttachmentOnlyEvent = (...args) => mobileRuntimeWeixinFacadeService.weixinIngressIsAttachmentOnlyEvent(...args);
const consumeWeixinPendingAttachmentMessages = (...args) => mobileRuntimeWeixinFacadeService.consumeWeixinPendingAttachmentMessages(...args);
const weixinIngressInstructions = (...args) => mobileRuntimeWeixinFacadeService.weixinIngressInstructions(...args);
const enqueueExternalDeliveryForTerminalMessage = (...args) => mobileRuntimeWeixinFacadeService.enqueueExternalDeliveryForTerminalMessage(...args);
const weixinTargetFromWorkspace = (...args) => mobileRuntimeWeixinFacadeService.weixinTargetFromWorkspace(...args);
const collectRecentWeixinForwardTargets = (...args) => mobileRuntimeWeixinFacadeService.collectRecentWeixinForwardTargets(...args);
const weixinForwardTargetsForWorkspace = (...args) => mobileRuntimeWeixinFacadeService.weixinForwardTargetsForWorkspace(...args);
const resolveWeixinForwardTarget = (...args) => mobileRuntimeWeixinFacadeService.resolveWeixinForwardTarget(...args);
const resolveFileFromSourceUrlForRequest = (...args) => mobileRuntimeWeixinFacadeService.resolveFileFromSourceUrlForRequest(...args);
const resolveWeixinForwardFile = (...args) => mobileRuntimeWeixinFacadeService.resolveWeixinForwardFile(...args);
const publicArtifactForWeixinForward = (...args) => mobileRuntimeWeixinFacadeService.publicArtifactForWeixinForward(...args);
const createWeixinFileForwardDelivery = (...args) => mobileRuntimeWeixinFacadeService.createWeixinFileForwardDelivery(...args);
const userFacingWeixinRunError = (...args) => mobileRuntimeWeixinFacadeService.userFacingWeixinRunError(...args);
const weixinDeliveryRetryCount = (...args) => mobileRuntimeWeixinFacadeService.weixinDeliveryRetryCount(...args);
const weixinDeliveryRetryDelayMs = (...args) => mobileRuntimeWeixinFacadeService.weixinDeliveryRetryDelayMs(...args);
const isWeixinInboundWakeRequiredFailure = (...args) => mobileRuntimeWeixinFacadeService.isWeixinInboundWakeRequiredFailure(...args);
const isWeixinDeliveryRetryable = (...args) => mobileRuntimeWeixinFacadeService.isWeixinDeliveryRetryable(...args);
const weixinDeliveryMatchesInboundEvent = (...args) => mobileRuntimeWeixinFacadeService.weixinDeliveryMatchesInboundEvent(...args);
const wakeWeixinOutboundDeliveriesForInboundEvent = (...args) => mobileRuntimeWeixinFacadeService.wakeWeixinOutboundDeliveriesForInboundEvent(...args);
const pendingWeixinOutboundDeliveries = (...args) => mobileRuntimeWeixinFacadeService.pendingWeixinOutboundDeliveries(...args);
const ackWeixinOutboundDelivery = (...args) => mobileRuntimeWeixinFacadeService.ackWeixinOutboundDelivery(...args);
const startWeixinIngressEvent = (...args) => mobileRuntimeWeixinFacadeService.startWeixinIngressEvent(...args);
const startRunForThread = (...args) => getGatewayRuntimeCompositionService().startRunForThread(...args);
const stopRunIds = (...args) => getGatewayRuntimeCompositionService().stopRunIds(...args);
const gatewayUrlForRun = (...args) => getGatewayRuntimeCompositionService().gatewayUrlForRun(...args);
const abortActiveStreamAsFailed = (...args) => getGatewayRuntimeCompositionService().abortActiveStreamAsFailed(...args);
const checkActiveStreamLiveness = (...args) => getGatewayRuntimeCompositionService().checkActiveStreamLiveness(...args);
const streamResponse = (...args) => getGatewayRuntimeCompositionService().streamResponse(...args);
const readResponseEvents = (...args) => getGatewayRuntimeCompositionService().readResponseEvents(...args);
const applyHermesRunEvent = (...args) => getGatewayRuntimeCompositionService().applyHermesRunEvent(...args);
const markRunFailed = (...args) => getGatewayRuntimeCompositionService().markRunFailed(...args);
const markRunCancelled = (...args) => getGatewayRuntimeCompositionService().markRunCancelled(...args);
const reconcileDetachedActiveRuns = (...args) => getGatewayRuntimeCompositionService().reconcileDetachedActiveRuns(...args);
const resolveAuthorizedCronOutputFile = (query, auth = null) => automationProvider.resolveAuthorizedOutputFile({ query, auth });
const resolveAuthorizedCronDeliverableFile = (query, auth = null) => automationProvider.resolveAuthorizedDeliverableFile({ query, auth });
const mobileRuntimeThreadFacadeService = createMobileRuntimeThreadFacadeService({
  actionInboxService, attachUploadedArtifactsToMessage, authCanAccessWorkspace, authenticateRequest, broadcast,
  chatGroupMemberWorkspaceIds, compactMessage, compactThread, compactThreadWithMessagePage, deriveTitle,
  detectDirectKanbanCreateRequest, detectDirectTodoCreateIntent, detectDirectTodoCreateIntentForWeb, directTodoCreateEnabled,
  findWorkspace, formatDirectTodoCreateSuccessMessage, gatewayRoutingForModelRun,
  getRuntimeStateNormalizationService, getRuntimeStateThreadService, getSemanticDirectoryAttachmentService, getSingleWindowThreadService,
  groupChatTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID, interpretKanbanNaturalLanguage, isOwnerAuth, kanbanCardProvider,
  kanbanCaseTopicPermissionsForTaskGroup, kanbanSingleCardCasePayload, makeId, maxMessageChars: MAX_MESSAGE_CHARS, nowIso,
  ownerElevationInstructions, precedingUserMessageForAssistant, publicArtifactFromClient, publicTodo, readBody, removeThreadActiveRun,
  requireOwner, runConcurrencyError, runConcurrencySnapshot, sanitizeElevationScope, saveState, sendJson, senderInfoForWorkspace,
  singleWindowChatTaskGroupId, startRunForThread, taskGroupHasRunningRun, threadMessageInitialLimit: THREAD_MESSAGE_INITIAL_LIMIT,
  threadSummary, todoAssigneeLabel, todoProvider, useKanbanTodoBackend, validReasoningEfforts: VALID_REASONING_EFFORTS,
  verifyDirectTodoCreateResult, webPushDeliveryService: () => webPushDeliveryService, workspaceIdForPrincipal, workspacePrincipal,
});
const getThreadRuntimeCompositionService = (...args) => mobileRuntimeThreadFacadeService.getThreadRuntimeCompositionService(...args);
const getThreadOwnerElevationRetryService = (...args) => mobileRuntimeThreadFacadeService.getThreadOwnerElevationRetryService(...args);
const getThreadMessageCreateService = (...args) => mobileRuntimeThreadFacadeService.getThreadMessageCreateService(...args);
const getThreadDirectCreateExecutionService = (...args) => mobileRuntimeThreadFacadeService.getThreadDirectCreateExecutionService(...args);
const getThreadMessageRunRouteService = (...args) => mobileRuntimeThreadFacadeService.getThreadMessageRunRouteService(...args);
const { eventStreamApiRoutes, mobileApiDispatcher, services: mobileApiServices = {} } = createMobileApiComposition({
  accessToken: null, actionInboxService, activeStreams: () => activeStreams, ackWeixinOutboundDelivery, appRouteUrl, appUpdateStatus,
  applyAppUpdate, attachClientVersionHeaders, authCanAccessWorkspace, authenticateRequest, authProvider,
  automationCreateModel: AUTOMATION_CREATE_MODEL, learningGrowthJitModel: LEARNING_GROWTH_JIT_MODEL, learningGrowthJitReasoningEffort: LEARNING_GROWTH_JIT_REASONING_EFFORT, automationProvider, basename: (value) => path.basename(value), boolParam, bootTrace, broadcast,
  buildRequestContext, canRevokeGroupChatMessage, chatGroupMemberWorkspaceIds, clearCronListCache, clearDynamicProjectCache: () => clearDynamicProjectCache(),
  clearDynamicProjectCacheForWorkspace: (workspaceId) => clearDynamicProjectCache(workspaceId), clearKanbanCardListCache, clientLayoutDiagnosticService, clientVersionInfo, compactMessage, compactText,
  compactThread, compactThreadWithMessagePage, contentDisposition, createInitialOwnerKey, createKanbanPlanCards,
  createWeixinFileForwardDelivery, cronJobMatchesOwner, cronJobMatchesSearch, dataDir: DATA_DIR, dedupe, deleteLocalWorkspace, detectDirectTodoCreateIntentForWeb,
  display: {
    ownerLabel: OWNER_LABEL,
    ownerDriveRootNames: OWNER_DRIVE_ROOT_NAMES,
    ownerRootFallbackLabel: OWNER_ROOT_FALLBACK_LABEL,
  },
  effectiveHermesApiBase, eventFanoutService, exists: (value) => fs.existsSync(value), extractDocxText, extractJsonObject, findDirectoryThreadForRequest,
  findProject, findSubproject, findWorkspace, gatewayWorkspaceProvisioningService: getGatewayWorkspaceProvisioningService(), generateWebPushVapidConfig, getAssessmentExamWorkflowService, hermesModelText,
  getDirectoryBrowserBoundaryService, getHermesStatus, getKanbanPlanCardCreationService, getRuntimeStateNormalizationService, getRuntimeStateThreadService,
  getSharedDirectoryProjectionService, getSingleWindowThreadService, getThreadMessageRunRouteService, getUrl, grantOwnerElevation,
  grantOwnerElevationOnce, consumeOwnerElevationOnce, groupAiReplyRevokedText: GROUP_AI_REPLY_REVOKED_TEXT, groupAssistantReplyForUserMessage, groupMessageRevokedText: GROUP_MESSAGE_REVOKED_TEXT, groupMessageRevoker,
  includeStatusCatalog: STATUS_INCLUDE_CATALOG, interpretAutomationNaturalLanguage, invalidateCatalogCache, isDirectoryBrowserPathAllowedForThread, isOwnerAuth, isOwnerElevationActive,
  isSingleWindowConversationTaskGroupId, joinLocalPath: (parent, name) => path.join(parent, name), kanbanCardProvider, kanbanCaseShareService, kanbanErrorResponse,
  kanbanReadingWorkflowService, kanbanSingleCardCasePayload, kanbanStudyArtifactService, learningCardGuidanceService, learningCoinService, listWorkspaceAccessKeyStatuses, loadCatalog, localWorkspaceDefaults,
  makeId, maxUploadBytes: MAX_UPLOAD_BYTES, maybeReconcileKanbanDependencyBlocks, mimeFor, mobileSqliteStore, mkdir: (value) => fs.mkdirSync(value),
  normalizeChatGroup, normalizeKanbanMaxParallel, normalizeKanbanNotificationAssignee, normalizeKanbanPlanReasoningEffort, normalizeStringList,
  nowIso, ownerSetupStatus, pendingWeixinOutboundDeliveries, planKanbanMultiAgent, publicConcurrencyForAuth,
  publicGatewayPoolStatusForAuth, publicKanbanCardDetail, publicOwnerElevationStatus, publicPushStatus: webPushDeliveryService.publicPushStatus, publicReasoningInfoForAuth,
  publicRuntimeConfig, publicTodo, publicWorkspace, publicWorkspacesForAuth, pushWorkspaceForAuth,
  readBody, requestClientVersion, readClientVersion, readKanbanCardListCache, readingCoverMaxBytes: KANBAN_READING_COVER_MAX_BYTES, reloadWebPush,
  refreshGatewayRuntimeConfig: (...args) => mobileRuntimeGatewayFacadeService.resetGatewayRuntimeConfig(...args),
  registerUploadArtifact, removeThreadActiveRun, requireOwner, requireWeixinIngress, requireWorkspaceAccess, resolveArtifactForRequest,
  resolveAuthorizedCronDeliverableFile, resolveAuthorizedCronOutputFile, resolveAutomationCronProfile, resolveFileForBrowserRequest, resolveKanbanCardAccess, resolveKanbanOutputFile,
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
  workspaceSystemProvisioningExecutor: runtimeEnv.WORKSPACE_SYSTEM_PROVISIONING_EXECUTOR_ENABLED ? (runtimeEnv.WORKSPACE_SYSTEM_PROVISIONING_HELPER_SOCKET ? createWorkspaceSystemProvisioningHelperClientService({ socketPath: runtimeEnv.WORKSPACE_SYSTEM_PROVISIONING_HELPER_SOCKET, http }) : createWorkspaceSystemProvisioningExecutorService({ enabled: true, env: process.env, fs, liveRoot: path.basename(DATA_DIR) === "data" ? path.dirname(DATA_DIR) : DATA_DIR, path })) : null,
  repoRoot: TOOL_ROOT, writeFile: (filePath, buffer, options = {}) => fs.writeFileSync(filePath, buffer, { flag: options.flag || "w" }),
  writeKanbanCardListCache,
});
createMobileRuntimeHttpServerService({
  activeStreams, authProvider, dataDir: DATA_DIR, disableAuth: DISABLE_AUTH, effectiveHermesApiBase, eventStreamApiRoutes,
  getUrl, host: HOST, http, httpRuntimeService, logger: console, mobileApiDispatcher, mobileApiServices, port: PORT,
  process, reconcileDetachedActiveRuns, scheduleLearningGrowthQueueOnStartup: legacyHostGrowthApiEnabled, sendJson, serveStatic, webPushDeliveryService,
}).start();
