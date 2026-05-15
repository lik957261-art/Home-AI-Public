"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const webpush = require("web-push");
const assessmentExamService = require("./adapters/assessment-exam-service");
const {
  assessmentConfigLine,
  createAssessmentExamWorkflowService,
} = require("./adapters/assessment-exam-workflow-service");
const studyAssessmentService = require("./adapters/study-assessment-service");
const { createConversationHistoryService } = require("./adapters/conversation-history-service");
const { createDocumentPreviewService } = require("./adapters/document-preview-service");
const { createDirectKanbanCreateService } = require("./adapters/direct-kanban-create-service");
const { createDirectoryBrowserBoundaryService } = require("./adapters/directory-browser-boundary-service");
const { createEventFanoutService } = require("./adapters/event-fanout-service");
const fileResourceService = require("./adapters/file-resource-service");
const weixinMarkdownForwardService = require("./adapters/weixin-markdown-forward-service");
const { createAccessPolicyProvider } = require("./adapters/access-policy-provider");
const { createAuthProvider } = require("./adapters/auth-provider");
const { createAutomationProvider } = require("./adapters/automation-provider");
const { createBridgeCommandProvider } = require("./adapters/bridge-command-provider");
const { createAutomationDeliveryRequirement, createDeliveryBoundaryInstructions } = require("./adapters/delivery-boundary-provider");
const { createExternalIntegrationProvider } = require("./adapters/external-integration-provider");
const { createFileArtifactAccessService } = require("./adapters/file-artifact-access-service");
const { createFileArtifactResolverService } = require("./adapters/file-artifact-resolver-service");
const { createFileResponseService } = require("./adapters/file-response-service");
const { createArtifactTextRegistrationService } = require("./adapters/artifact-text-registration-service");
const { createFilesystemMountProvider } = require("./adapters/filesystem-mount-provider");
const { createGatewayPoolProvider } = require("./adapters/gateway-pool-provider");
const { createGatewayRunner } = require("./adapters/gateway-runner");
const { createGatewayRunEventService } = require("./adapters/gateway-run-event-service");
const { createGatewayRunInstructionService } = require("./adapters/gateway-run-instruction-service");
const { createGatewayRunLifecycleService } = require("./adapters/gateway-run-lifecycle-service");
const { createGatewayRunQueueService } = require("./adapters/gateway-run-queue-service");
const { createGatewayRunStartService } = require("./adapters/gateway-run-start-service");
const { createGatewayRunStreamService } = require("./adapters/gateway-run-stream-service");
const { createGatewayStatusProjection, gatewayPoolStatusHealthy } = require("./adapters/gateway-status-projection");
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
const { createKanbanAssigneePolicy } = require("./adapters/kanban-assignee-policy");
const { createKanbanCaseShareService } = require("./adapters/kanban-case-share-service");
const { createKanbanCaseTopicService } = require("./adapters/kanban-case-topic-service");
const { createKanbanMaintenanceService } = require("./adapters/kanban-maintenance-service");
const { createKanbanOutputProjectionService } = require("./adapters/kanban-output-projection-service");
const { createKanbanPlanCardCreationService } = require("./adapters/kanban-plan-card-creation-service");
const { createKanbanPlanService } = require("./adapters/kanban-plan-service");
const {
  kanbanCardEffectiveCaseIndex,
  kanbanCardRevisionOf,
  visibleKanbanCaseCards,
} = require("./adapters/kanban-story-provider");
const { createKanbanStudyArtifactService } = require("./adapters/kanban-study-artifact-service");
const { createKanbanReadingWorkflowService } = require("./adapters/kanban-reading-workflow-service");
const { createKanbanTodoBridge } = require("./adapters/kanban-provider");
const { createLocalBridgeRuntimeService } = require("./adapters/local-bridge-runtime-service");
const { createLocalWorkspaceStoreService } = require("./adapters/local-workspace-store-service");
const { createNaturalLanguageDraftService } = require("./adapters/natural-language-draft-service");
const { createAuditEventProvider } = require("./adapters/audit-event-provider");
const { createEgressPolicyProvider } = require("./adapters/egress-policy-provider");
const { createPathPolicyProvider } = require("./adapters/path-policy-provider");
const { createProjectDiscoveryProvider } = require("./adapters/project-discovery-provider");
const { createRuntimeConfigProvider } = require("./adapters/runtime-config-provider");
const { createRunConcurrencyPolicy } = require("./adapters/run-concurrency-policy");
const { createSecurityBoundaryProvider } = require("./adapters/security-boundary-provider");
const { createSemanticDirectoryAttachmentService } = require("./adapters/semantic-directory-attachment-service");
const { createSharedDirectoryProvider } = require("./adapters/shared-directory-provider");
const { createSharedDirectoryProjectionService } = require("./adapters/shared-directory-projection-service");
const { createSingleWindowThreadService } = require("./adapters/single-window-thread-service");
const {
  createSystemRuntimeStatusService,
} = require("./adapters/system-runtime-status-service");
const { deriveKanbanWorkflowState } = require("./adapters/study-workflow-provider");
const { createSkillDetailProvider } = require("./adapters/skill-detail-provider");
const { buildRequestContext } = require("./adapters/request-context-provider");
const { createThreadDirectCreateExecutionService } = require("./adapters/thread-direct-create-execution-service");
const { createThreadMessageCreateService } = require("./adapters/thread-message-create-service");
const { createThreadMessageRunRouteService } = require("./adapters/thread-message-run-route-service");
const { createThreadOwnerElevationRetryService } = require("./adapters/thread-owner-elevation-retry-service");
const { createThreadViewService } = require("./adapters/thread-view-service");
const { createWorkspaceBindingsProvider } = require("./adapters/workspace-bindings-provider");
const { createWorkspaceDisplayPathService } = require("./adapters/workspace-display-path-service");
const { createWorkspacePublicProjectionService } = require("./adapters/workspace-public-projection-service");
const { createWorkspaceProjectProvider } = require("./adapters/workspace-project-provider");
const { createTodoProvider } = require("./adapters/todo-provider");
const { createTodoPublicProjectionService } = require("./adapters/todo-public-projection-service");
const { createWeixinFileForwardService } = require("./adapters/weixin-file-forward-service");
const { createWeixinForwardService } = require("./adapters/weixin-forward-service");
const { createWeixinIngressEventService } = require("./adapters/weixin-ingress-event-service");
const { createWeixinIngressProvider } = require("./adapters/weixin-ingress-provider");
const { createWeixinOutboundDeliveryService } = require("./adapters/weixin-outbound-delivery-service");
const { createWebPushDeliveryService } = require("./adapters/web-push-delivery-service");
const { createAccessKeyApiRoutes } = require("./server-routes/access-key-api-routes");
const { createAutomationApiRoutes } = require("./server-routes/automation-api-routes");
const { createDirectoryBrowserApiRoutes } = require("./server-routes/directory-browser-api-routes");
const { createDirectoryMutationApiRoutes } = require("./server-routes/directory-mutation-api-routes");
const { createDirectoryShareApiRoutes } = require("./server-routes/directory-share-api-routes");
const { createEventStreamApiRoutes } = require("./server-routes/event-stream-api-routes");
const { createFileArtifactApiRoutes } = require("./server-routes/file-artifact-api-routes");
const { createKanbanCardApiRoutes } = require("./server-routes/kanban-card-api-routes");
const { createKanbanStudyApiRoutes } = require("./server-routes/kanban-study-api-routes");
const { createMobileApiDispatcher } = require("./server-routes/mobile-api-dispatcher");
const { createOwnerElevationApiRoutes } = require("./server-routes/owner-elevation-api-routes");
const { createPublicApiRoutes } = require("./server-routes/public-api-routes");
const { createPushApiRoutes } = require("./server-routes/push-api-routes");
const { createResourceApiRoutes } = require("./server-routes/resource-api-routes");
const { createRuntimeConfigApiRoutes } = require("./server-routes/runtime-config-api-routes");
const { createSingleWindowGroupChatApiRoutes } = require("./server-routes/single-window-group-chat-api-routes");
const { createSystemApiRoutes } = require("./server-routes/system-api-routes");
const { createThreadMessageRunApiRoutes } = require("./server-routes/thread-message-run-api-routes");
const { createThreadReadUploadApiRoutes } = require("./server-routes/thread-read-upload-api-routes");
const { createThreadTaskApiRoutes } = require("./server-routes/thread-task-api-routes");
const { createTodoApiRoutes } = require("./server-routes/todo-api-routes");
const { createWeixinApiRoutes } = require("./server-routes/weixin-api-routes");
const { createWorkspaceApiRoutes } = require("./server-routes/workspace-api-routes");

function normalizeAutoMode(value) {
  const text = String(value || "").trim();
  if (!text) return "auto";
  if (/^(1|true|yes|on)$/i.test(text)) return "on";
  if (/^(0|false|no|off)$/i.test(text)) return "off";
  if (/^auto$/i.test(text)) return "auto";
  return "auto";
}

function nonNegativeMilliseconds(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return fallback;
}

const TOOL_ROOT = __dirname;
const REPO_ROOT = path.resolve(process.env.HERMES_WEB_REPO_ROOT || process.env.HERMES_MOBILE_ROOT || TOOL_ROOT);
const PUBLIC_ROOT = path.join(TOOL_ROOT, "public");
const INDEX_HTML_PATH = path.join(PUBLIC_ROOT, "index.html");
const UPDATE_REMOTE_NAME = process.env.HERMES_MOBILE_UPDATE_REMOTE || process.env.HERMES_WEB_UPDATE_REMOTE || "origin";
const UPDATE_BRANCH = process.env.HERMES_MOBILE_UPDATE_BRANCH || process.env.HERMES_WEB_UPDATE_BRANCH || "main";
const UPDATE_VERSION_URL = process.env.HERMES_MOBILE_UPDATE_VERSION_URL || process.env.HERMES_WEB_UPDATE_VERSION_URL || "";
const UPDATE_CHECK_TIMEOUT_MS = Number(process.env.HERMES_MOBILE_UPDATE_CHECK_TIMEOUT_MS || process.env.HERMES_WEB_UPDATE_CHECK_TIMEOUT_MS || "6000");
const DEFAULT_TODO_BRIDGE_SCRIPT = path.join(TOOL_ROOT, "todo_bridge.py");
const DEFAULT_CRON_BRIDGE_SCRIPT = path.join(TOOL_ROOT, "cron_bridge.py");
const DEFAULT_DIRECTORY_BRIDGE_SCRIPT = path.join(TOOL_ROOT, "directory_bridge.py");
const DEFAULT_SKILL_BRIDGE_SCRIPT = path.join(TOOL_ROOT, "skill_bridge.py");
const LOCAL_CONFIG_ROOT = path.resolve(process.env.HERMES_WEB_CONFIG_DIR || path.join(REPO_ROOT, "config"));
const PERMISSION_APPROVAL_MARKER = "HERMES_PERMISSION_APPROVAL_REQUIRED";

const HOST = process.env.HERMES_WEB_HOST || "0.0.0.0";
const PORT = Number(process.env.HERMES_WEB_PORT || "8797");
const HERMES_API_BASE = stripTrailingSlash(
  process.env.HERMES_WEB_HERMES_API_BASE || process.env.HERMES_API_BASE || "http://127.0.0.1:8642",
);
const HERMES_API_TIMEOUT_MS = Number(process.env.HERMES_WEB_HERMES_API_TIMEOUT_MS || "8000");
const GATEWAY_POOL_ENABLED = process.env.HERMES_WEB_GATEWAY_POOL_ENABLED || "auto";
const GATEWAY_SKILL_PROFILE_ROUTING = normalizeAutoMode(
  process.env.HERMES_MOBILE_GATEWAY_SKILL_PROFILE_ROUTING
  || process.env.HERMES_WEB_GATEWAY_SKILL_PROFILE_ROUTING
  || "auto",
);
const GATEWAY_USAGE_TELEMETRY_ENABLED = (
  process.env.HERMES_MOBILE_GATEWAY_USAGE_TELEMETRY_ENABLED
  || process.env.HERMES_WEB_GATEWAY_USAGE_TELEMETRY_ENABLED
  || "auto"
);
const GATEWAY_USAGE_TELEMETRY_PROFILE_ROOTS = normalizeStringList(
  process.env.HERMES_MOBILE_GATEWAY_TELEMETRY_PROFILES_ROOTS
  || process.env.HERMES_WEB_GATEWAY_TELEMETRY_PROFILES_ROOTS
  || "",
);
const GATEWAY_POOL_HEALTH_TIMEOUT_MS = Number(process.env.HERMES_WEB_GATEWAY_POOL_HEALTH_TIMEOUT_MS || "5000");
const RUN_START_TIMEOUT_MS = Number(process.env.HERMES_WEB_RUN_START_TIMEOUT_MS || "90000");
const RUN_LIVENESS_CHECK_AFTER_MS = Number(process.env.HERMES_WEB_RUN_LIVENESS_CHECK_AFTER_MS || "120000");
const RUN_LIVENESS_CHECK_INTERVAL_MS = Number(process.env.HERMES_WEB_RUN_LIVENESS_CHECK_INTERVAL_MS || "45000");
const RUN_LIVENESS_STALE_AFTER_MS = Number(process.env.HERMES_WEB_RUN_LIVENESS_STALE_AFTER_MS || "0");
const RUN_CONCURRENCY_MAX_GLOBAL = Number(process.env.HERMES_WEB_MAX_ACTIVE_RUNS || "0");
const RUN_CONCURRENCY_MAX_PER_WORKSPACE = Number(process.env.HERMES_WEB_MAX_ACTIVE_RUNS_PER_WORKSPACE || "0");
const DISABLE_AUTH = /^(1|true|yes|on)$/i.test(process.env.HERMES_WEB_DISABLE_AUTH || "");
const DATA_DIR = path.resolve(process.env.HERMES_WEB_DATA_DIR || path.join(REPO_ROOT, "workspace", "hermes-web"));
const STATE_PATH = path.join(DATA_DIR, "state.json");
const STATE_BACKUP_DIR = path.join(DATA_DIR, "backups");
const SHARED_DIRECTORIES_PATH = path.join(DATA_DIR, "shared-directories.json");
const AUDIT_EVENT_LOG_PATH = path.resolve(process.env.HERMES_MOBILE_AUDIT_EVENT_LOG_PATH || process.env.HERMES_WEB_AUDIT_EVENT_LOG_PATH || path.join(DATA_DIR, "audit-events.jsonl"));
const ACCESS_KEYS_PATH = path.join(DATA_DIR, "access-keys.json");
const LOCAL_WORKSPACES_PATH = path.join(DATA_DIR, "workspaces.json");
const RUNTIME_CONFIG_PATH = path.join(DATA_DIR, "runtime-config.json");
const WEIXIN_INGRESS_KEY_PATHS = [
  process.env.HERMES_MOBILE_WEIXIN_INGRESS_KEY_PATH,
  process.env.HERMES_WEB_WEIXIN_INGRESS_KEY_PATH,
  path.join(DATA_DIR, "weixin-ingress.secret"),
].filter(Boolean);
const WEIXIN_INGRESS_DEFAULT_WORKSPACE = String(
  process.env.HERMES_MOBILE_WEIXIN_INGRESS_DEFAULT_WORKSPACE
    || process.env.HERMES_WEB_WEIXIN_INGRESS_DEFAULT_WORKSPACE
    || "",
).trim();
const GROUP_DELIVERIES_DIR = path.join(DATA_DIR, "artifacts", "group-deliveries");
const OWNER_DEFAULT_WORKSPACE = path.resolve(process.env.HERMES_WEB_OWNER_DEFAULT_WORKSPACE || path.join(DATA_DIR, "drive"));
const WORKSPACE_UPLOAD_DIR_NAME = ".hermes-mobile";
const WORKSPACE_UPLOAD_SUBDIR = "uploads";
const AUTH_KEY_PATH = path.resolve(process.env.HERMES_WEB_AUTH_KEY_PATH || path.join(REPO_ROOT, ".hermes_web_secret_key"));
const WEB_PUSH_VAPID_PATH = path.resolve(
  process.env.HERMES_WEB_VAPID_PATH || process.env.WEB_PUSH_VAPID_PATH || path.join(DATA_DIR, "web-push-vapid.json"),
);
const WSL_DISTRO = process.env.HERMES_WEB_WSL_DISTRO || "Ubuntu-24.04";
const WINDOWS_HOME = process.env.USERPROFILE || os.homedir() || "";
const WSL_USER = process.env.HERMES_WEB_WSL_USER || process.env.WSL_USER || process.env.USER || "hermes";
const WSL_HOME = stripTrailingSlash(process.env.HERMES_WEB_WSL_HOME || `/home/${WSL_USER}`);
const WSL_HERMES_HOME = stripTrailingSlash(process.env.HERMES_WEB_WSL_HERMES_HOME || `${WSL_HOME}/.hermes`);
const ENABLE_LEGACY_WEIXIN_COMPAT = /^(1|true|yes|on)$/i.test(
  process.env.HERMES_WEB_ENABLE_LEGACY_WEIXIN_COMPAT || process.env.HERMES_WEB_LEGACY_WEIXIN_COMPAT || "",
);
const HERMES_ENV_PATHS = [
  process.env.HERMES_WEB_HERMES_ENV_PATH,
  ...wslUncPathCandidates(WSL_HERMES_HOME, ".env"),
].filter(Boolean);
const HERMES_API_KEY_PATHS = [
  process.env.HERMES_WEB_HERMES_API_KEY_PATH,
  path.join(WINDOWS_HOME, ".hermes-windows", "hermes-api-server-key.secret"),
].filter(Boolean);
const WORKSPACE_USERS_PATHS = [
  process.env.HERMES_WEB_WORKSPACE_USERS_PATH,
  ...wslUncPathCandidates(WSL_HERMES_HOME, "access-control", "workspace-users.json"),
  path.join(LOCAL_CONFIG_ROOT, "access-control", "workspace-users.json"),
  process.env.HERMES_WEB_WEIXIN_USERS_PATH,
  ...(ENABLE_LEGACY_WEIXIN_COMPAT ? wslUncPathCandidates(WSL_HERMES_HOME, "access-control", "weixin-users.json") : []),
  ...(ENABLE_LEGACY_WEIXIN_COMPAT ? [path.join(LOCAL_CONFIG_ROOT, "access-control", "weixin-users.json")] : []),
].filter(Boolean);
const WORKSPACE_ROUTE_MAP_PATHS = [
  process.env.HERMES_WEB_WORKSPACE_ROUTE_MAP_PATH,
  ...wslUncPathCandidates(WSL_HERMES_HOME, "access-control", "workspace-routing-map.json"),
  path.join(LOCAL_CONFIG_ROOT, "access-control", "workspace-routing-map.json"),
  process.env.HERMES_WEB_WEIXIN_ROUTE_MAP_PATH,
  ...(ENABLE_LEGACY_WEIXIN_COMPAT ? wslUncPathCandidates(WSL_HERMES_HOME, "access-control", "weixin-routing-map.json") : []),
  ...(ENABLE_LEGACY_WEIXIN_COMPAT ? [path.join(LOCAL_CONFIG_ROOT, "access-control", "weixin-routing-map.json")] : []),
].filter(Boolean);
const HERMES_CONFIG_PATHS = [
  process.env.HERMES_WEB_HERMES_CONFIG_PATH,
  process.env.HERMES_CONFIG_PATH,
  ...wslUncPathCandidates(WSL_HERMES_HOME, "config.yaml"),
  path.join(LOCAL_CONFIG_ROOT, "hermes-config.yaml"),
  path.join(LOCAL_CONFIG_ROOT, "config.yaml"),
].filter(Boolean);
const EXPLICIT_HERMES_CONFIG_PATHS = new Set([
  process.env.HERMES_WEB_HERMES_CONFIG_PATH,
  process.env.HERMES_CONFIG_PATH,
].map((item) => String(item || "").trim()).filter(Boolean));
const ALLOW_WSL_REASONING_CONFIG_LOOKUP = /^(1|true|yes|on)$/i.test(
  process.env.HERMES_MOBILE_ALLOW_WSL_REASONING_CONFIG_LOOKUP
  || process.env.HERMES_WEB_ALLOW_WSL_REASONING_CONFIG_LOOKUP
  || "",
);
const STATUS_INCLUDE_CATALOG = /^(1|true|yes|on)$/i.test(
  process.env.HERMES_MOBILE_STATUS_INCLUDE_CATALOG
  || process.env.HERMES_WEB_STATUS_INCLUDE_CATALOG
  || "",
);
const GATEWAY_POOL_MANIFEST_PATHS = [
  process.env.HERMES_WEB_GATEWAY_POOL_MANIFEST,
  ...wslUncPathCandidates(WSL_HERMES_HOME, "worker-pool.json"),
].filter(Boolean);
const GOOGLE_TOKEN_PATHS = [
  process.env.HERMES_WEB_GOOGLE_TOKEN_PATH,
  ...wslUncPathCandidates(WSL_HERMES_HOME, "google_token.json"),
].filter(Boolean);
const GOOGLE_CLIENT_SECRET_PATHS = [
  process.env.HERMES_WEB_GOOGLE_CLIENT_SECRET_PATH,
  ...wslUncPathCandidates(WSL_HERMES_HOME, "google_client_secret.json"),
].filter(Boolean);
const OUTLOOK_GRAPH_TOKEN_PATHS = [
  process.env.HERMES_WEB_OUTLOOK_GRAPH_TOKEN_PATH,
  ...wslUncPathCandidates(WSL_HERMES_HOME, "microsoft-graph-outlook-mail", "token.json"),
].filter(Boolean);
const GITHUB_CLI_HOSTS_PATHS = [
  process.env.HERMES_WEB_GITHUB_CLI_HOSTS_PATH,
  path.join(WINDOWS_HOME, "AppData", "Roaming", "GitHub CLI", "hosts.yml"),
  ...wslUncPathCandidates(WSL_HOME, ".config", "gh", "hosts.yml"),
].filter(Boolean);
const PROJECT_MAP_PATHS = [
  process.env.HERMES_WEB_PROJECT_MAP_PATH,
  path.join(LOCAL_CONFIG_ROOT, "project-directory-map.json"),
].filter(Boolean);

const MAX_BODY_BYTES = 2_000_000;
const MAX_HISTORY_MESSAGES = 30;
const CHAT_CONTEXT_MAX_MESSAGES = Math.max(0, Number(process.env.HERMES_WEB_CHAT_CONTEXT_MAX_MESSAGES || "16") || 16);
const CHAT_CONTEXT_MAX_CHARS = Math.max(1000, Number(process.env.HERMES_WEB_CHAT_CONTEXT_MAX_CHARS || "20000") || 20000);
const MAX_MESSAGE_CHARS = 240_000;
const MAX_API_TEXT_CHARS = 80_000;
const THREAD_MESSAGE_INITIAL_LIMIT = Math.max(10, Number(process.env.HERMES_MOBILE_THREAD_MESSAGE_INITIAL_LIMIT || process.env.HERMES_WEB_THREAD_MESSAGE_INITIAL_LIMIT || "60") || 60);
const THREAD_MESSAGE_PAGE_LIMIT = Math.max(10, Number(process.env.HERMES_MOBILE_THREAD_MESSAGE_PAGE_LIMIT || process.env.HERMES_WEB_THREAD_MESSAGE_PAGE_LIMIT || "40") || 40);
const THREAD_MESSAGE_SEARCH_LIMIT = Math.max(10, Number(process.env.HERMES_MOBILE_THREAD_MESSAGE_SEARCH_LIMIT || process.env.HERMES_WEB_THREAD_MESSAGE_SEARCH_LIMIT || "120") || 120);
const MAX_EVENT_PREVIEW_CHARS = 1600;
const MAX_STORED_EVENTS_PER_THREAD = 80;
const MAX_UPLOAD_BYTES = Number(process.env.HERMES_WEB_MAX_UPLOAD_BYTES || "104857600");
const MAX_FILE_PREVIEW_CHARS = Number(process.env.HERMES_WEB_MAX_FILE_PREVIEW_CHARS || "180000");
const documentPreviewService = createDocumentPreviewService({
  maxPreviewChars: MAX_FILE_PREVIEW_CHARS,
});
const SOURCE_MARKDOWN_SEARCH_LIMIT = Number(
  process.env.HERMES_MOBILE_SOURCE_MARKDOWN_SEARCH_LIMIT
  || process.env.HERMES_WEB_SOURCE_MARKDOWN_SEARCH_LIMIT
  || "2000",
);
const WEIXIN_FORWARD_MARKDOWN_MAX_BYTES = Number(
  process.env.HERMES_MOBILE_WEIXIN_MARKDOWN_FORWARD_MAX_BYTES
  || process.env.HERMES_WEB_WEIXIN_MARKDOWN_FORWARD_MAX_BYTES
  || String(2 * 1024 * 1024),
);
const TODO_BRIDGE_TIMEOUT_MS = Number(process.env.HERMES_WEB_TODO_BRIDGE_TIMEOUT_MS || "15000");
const KANBAN_BRIDGE_TIMEOUT_MS = Number(process.env.HERMES_MOBILE_KANBAN_BRIDGE_TIMEOUT_MS || process.env.HERMES_WEB_KANBAN_BRIDGE_TIMEOUT_MS || "20000");
const CRON_BRIDGE_TIMEOUT_MS = Number(process.env.HERMES_WEB_CRON_BRIDGE_TIMEOUT_MS || "15000");
const CRON_BRIDGE_STDOUT_LIMIT_BYTES = Number(process.env.HERMES_MOBILE_CRON_BRIDGE_STDOUT_LIMIT_BYTES || process.env.HERMES_WEB_CRON_BRIDGE_STDOUT_LIMIT_BYTES || "50000000");
const CRON_LIST_CACHE_TTL_MS = Number(process.env.HERMES_WEB_CRON_LIST_CACHE_TTL_MS || "12000");
const AUTOMATION_CREATE_TIMEOUT_MS = Number(process.env.HERMES_WEB_AUTOMATION_CREATE_TIMEOUT_MS || "60000");
const AUTOMATION_CREATE_MODEL = process.env.HERMES_WEB_AUTOMATION_CREATE_MODEL || "gpt-5.4-mini";
const DIRECTORY_BRIDGE_TIMEOUT_MS = Number(process.env.HERMES_WEB_DIRECTORY_BRIDGE_TIMEOUT_MS || "15000");
const SKILL_BRIDGE_TIMEOUT_MS = Number(process.env.HERMES_WEB_SKILL_BRIDGE_TIMEOUT_MS || "12000");
const CRON_OUTPUT_ROOT = stripTrailingSlash(process.env.HERMES_WEB_CRON_OUTPUT_ROOT || `${WSL_HERMES_HOME}/cron/output`);
const CRON_RUN_LOG_ROOT = stripTrailingSlash(process.env.HERMES_WEB_RUN_LOG_ROOT || `${WSL_HERMES_HOME}/run-logs`);
const TODO_BACKEND = String(process.env.HERMES_WEB_TODO_BACKEND || "local").trim().toLowerCase();
const KANBAN_COMMAND = String(process.env.HERMES_MOBILE_KANBAN_COMMAND || process.env.HERMES_WEB_KANBAN_COMMAND || "hermes").trim() || "hermes";
const KANBAN_COMMAND_ARGS = String(process.env.HERMES_MOBILE_KANBAN_COMMAND_ARGS || process.env.HERMES_WEB_KANBAN_COMMAND_ARGS || "").trim();
const KANBAN_TODO_META_PATH = path.resolve(process.env.HERMES_MOBILE_KANBAN_TODO_META_PATH || process.env.HERMES_WEB_KANBAN_TODO_META_PATH || path.join(DATA_DIR, "kanban-todo-meta.json"));
const KANBAN_CARD_LIST_CACHE_PATH = path.resolve(process.env.HERMES_MOBILE_KANBAN_CARD_LIST_CACHE_PATH || process.env.HERMES_WEB_KANBAN_CARD_LIST_CACHE_PATH || path.join(DATA_DIR, "kanban-card-list-cache.json"));
const KANBAN_CASE_SHARE_PATH = path.resolve(process.env.HERMES_MOBILE_KANBAN_CASE_SHARE_PATH || process.env.HERMES_WEB_KANBAN_CASE_SHARE_PATH || path.join(DATA_DIR, "kanban-case-shares.json"));
const KANBAN_WORKSPACE_PATH_STYLE = String(process.env.HERMES_MOBILE_KANBAN_WORKSPACE_PATH_STYLE || process.env.HERMES_WEB_KANBAN_WORKSPACE_PATH_STYLE || "").trim().toLowerCase();
const KANBAN_DEPENDENCY_RECONCILE_INTERVAL_MS = Math.max(5000, Number(process.env.HERMES_MOBILE_KANBAN_DEPENDENCY_RECONCILE_INTERVAL_MS || process.env.HERMES_WEB_KANBAN_DEPENDENCY_RECONCILE_INTERVAL_MS || "30000") || 30000);
const KANBAN_CARD_LIST_CACHE_TTL_MS = Math.max(0, Number(process.env.HERMES_MOBILE_KANBAN_CARD_LIST_CACHE_TTL_MS || process.env.HERMES_WEB_KANBAN_CARD_LIST_CACHE_TTL_MS || String(30 * 60 * 1000)) || 0);
const KANBAN_BLOCKED_PUSH_DELAY_MINUTES = Math.max(0, Number(process.env.HERMES_MOBILE_KANBAN_BLOCKED_PUSH_DELAY_MINUTES || process.env.HERMES_WEB_KANBAN_BLOCKED_PUSH_DELAY_MINUTES || "10") || 0);
const KANBAN_MULTI_AGENT_DEFAULT_PARALLEL = 3;
const KANBAN_MULTI_AGENT_MAX_PARALLEL = Math.max(KANBAN_MULTI_AGENT_DEFAULT_PARALLEL, Math.min(12, Number(process.env.HERMES_MOBILE_KANBAN_MULTI_AGENT_MAX_PARALLEL || process.env.HERMES_WEB_KANBAN_MULTI_AGENT_MAX_PARALLEL || "8") || 8));
const KANBAN_MULTI_AGENT_MAX_CARDS = 8;
const KANBAN_MULTI_AGENT_PLAN_TIMEOUT_MS = Number(process.env.HERMES_MOBILE_KANBAN_PLAN_TIMEOUT_MS || process.env.HERMES_WEB_KANBAN_PLAN_TIMEOUT_MS || "90000");
const KANBAN_READING_PLAN_MAX_SESSIONS = Math.max(1, Math.min(60, Number(process.env.HERMES_MOBILE_READING_PLAN_MAX_SESSIONS || process.env.HERMES_WEB_READING_PLAN_MAX_SESSIONS || "31") || 31));
const KANBAN_READING_ANALYSIS_TIMEOUT_MS = Number(process.env.HERMES_MOBILE_READING_ANALYSIS_TIMEOUT_MS || process.env.HERMES_WEB_READING_ANALYSIS_TIMEOUT_MS || "120000");
const KANBAN_READING_TRANSCRIBE_TIMEOUT_MS = Number(process.env.HERMES_MOBILE_READING_TRANSCRIBE_TIMEOUT_MS || process.env.HERMES_WEB_READING_TRANSCRIBE_TIMEOUT_MS || "240000");
const KANBAN_READING_TRANSCRIBE_SCRIPT = path.resolve(process.env.HERMES_MOBILE_READING_TRANSCRIBE_SCRIPT || process.env.HERMES_WEB_READING_TRANSCRIBE_SCRIPT || path.join(__dirname, "scripts", "transcribe-reading-audio.ps1"));
const KANBAN_READING_ARTIFACT_ROOT = path.resolve(process.env.HERMES_MOBILE_READING_ARTIFACT_ROOT || process.env.HERMES_WEB_READING_ARTIFACT_ROOT || path.join(DATA_DIR, "artifacts", "kanban-reading"));
const KANBAN_READING_COVER_MAX_BYTES = Math.max(1, Math.min(MAX_UPLOAD_BYTES, Number(process.env.HERMES_MOBILE_READING_COVER_MAX_BYTES || process.env.HERMES_WEB_READING_COVER_MAX_BYTES || String(20 * 1024 * 1024)) || (20 * 1024 * 1024)));
const KANBAN_SOURCE_DOCUMENT_MAX_BYTES = Math.max(1, Math.min(MAX_UPLOAD_BYTES, Number(process.env.HERMES_MOBILE_KANBAN_SOURCE_DOCUMENT_MAX_BYTES || process.env.HERMES_WEB_KANBAN_SOURCE_DOCUMENT_MAX_BYTES || String(20 * 1024 * 1024)) || (20 * 1024 * 1024)));
const KANBAN_READING_QUIZ_TARGETING_VERSION = "20260513-score-weakness-v1";
const KANBAN_STUDY_CASE_MODES = new Set(["study-plan"]);
const KANBAN_ASSESSMENT_CASE_MODES = new Set(["assessment-plan"]);
const KANBAN_STUDY_SHARED_FOLDER_NAME = "\u5b66\u4e60\u8ba1\u5212";
const KANBAN_CASE_TOPIC_KIND = "case-topic";
const KANBAN_ASSESSMENT_PLAN_MAX_EXAMS = Math.max(1, Math.min(30, Number(process.env.HERMES_MOBILE_ASSESSMENT_PLAN_MAX_EXAMS || "30") || 30));
const KANBAN_ASSESSMENT_MAX_QUESTIONS = Math.max(5, Math.min(40, Number(process.env.HERMES_MOBILE_ASSESSMENT_MAX_QUESTIONS || "40") || 40));
const KANBAN_ASSESSMENT_MODEL_TIMEOUT_MS = Number(process.env.HERMES_MOBILE_ASSESSMENT_MODEL_TIMEOUT_MS || "180000");
const AUTOMATION_BACKEND = String(process.env.HERMES_WEB_AUTOMATION_BACKEND || "local").trim().toLowerCase();
const LOCAL_TODO_STORE_PATH = path.resolve(process.env.HERMES_WEB_TODO_STORE_PATH || path.join(DATA_DIR, "todos.json"));
const LOCAL_AUTOMATION_STORE_PATH = path.resolve(process.env.HERMES_WEB_AUTOMATION_STORE_PATH || path.join(DATA_DIR, "automations.json"));
const SERVICE_STORE_BACKEND = String(process.env.HERMES_WEB_SERVICE_STORE || "").trim().toLowerCase();
const MOBILE_SQLITE_DB_PATH = path.resolve(process.env.HERMES_WEB_DB_PATH || path.join(DATA_DIR, "hermes-mobile.sqlite3"));
const BRIDGE_HOST_URL = stripTrailingSlash(process.env.HERMES_MOBILE_BRIDGE_HOST_URL || process.env.HERMES_WEB_BRIDGE_HOST_URL || "");
const BRIDGE_HOST_KEY_PATH = process.env.HERMES_MOBILE_BRIDGE_HOST_KEY_PATH || process.env.HERMES_WEB_BRIDGE_HOST_KEY_PATH || "";
const OWNER_MAINTENANCE_RUNS_ENABLED = /^(1|true|yes|on)$/i.test(process.env.HERMES_MOBILE_ALLOW_OWNER_MAINTENANCE_RUNS || process.env.HERMES_WEB_ALLOW_OWNER_MAINTENANCE_RUNS || "");
const OWNER_ELEVATION_DURATION_OPTIONS_MINUTES = normalizeOwnerElevationDurations(process.env.HERMES_MOBILE_OWNER_ELEVATION_MINUTES || process.env.HERMES_WEB_OWNER_ELEVATION_MINUTES || "5,15,30,60");
const OWNER_ELEVATION_DEFAULT_MINUTES = OWNER_ELEVATION_DURATION_OPTIONS_MINUTES.includes(15)
  ? 15
  : OWNER_ELEVATION_DURATION_OPTIONS_MINUTES[0];
const OWNER_ELEVATION_ONCE_TTL_MS = Number(process.env.HERMES_MOBILE_OWNER_ELEVATION_ONCE_TTL_MS || process.env.HERMES_WEB_OWNER_ELEVATION_ONCE_TTL_MS || "120000");
const WEB_PUSH_ENABLED = !/^(0|false|no|off)$/i.test(process.env.HERMES_WEB_PUSH_ENABLED || process.env.WEB_PUSH_ENABLED || "1");
const WEB_PUSH_SUBJECT = process.env.WEB_PUSH_SUBJECT || process.env.HERMES_WEB_PUSH_SUBJECT || "mailto:hermes-mobile@example.invalid";
const TODO_WEB_PUSH_ENABLED = !/^(0|false|no|off)$/i.test(process.env.HERMES_WEB_TODO_PUSH_ENABLED || "1");
const TODO_WEB_PUSH_INTERVAL_MS = Number(process.env.HERMES_WEB_TODO_PUSH_INTERVAL_MS || "60000");
const WEB_PUSH_START_DELAY_MS = nonNegativeMilliseconds(
  process.env.HERMES_MOBILE_WEB_PUSH_START_DELAY_MS
  || process.env.HERMES_WEB_WEB_PUSH_START_DELAY_MS,
  120000,
);
const TODO_WEB_PUSH_START_DELAY_MS = nonNegativeMilliseconds(
  process.env.HERMES_MOBILE_TODO_PUSH_START_DELAY_MS
  || process.env.HERMES_WEB_TODO_PUSH_START_DELAY_MS,
  WEB_PUSH_START_DELAY_MS,
);
const TODO_WEB_PUSH_RECENT_CREATE_MINUTES = Number(process.env.HERMES_WEB_TODO_PUSH_RECENT_CREATE_MINUTES || "30");
const TODO_WEB_PUSH_RECEIPT_RETRY_MINUTES = Number(process.env.HERMES_WEB_TODO_PUSH_RECEIPT_RETRY_MINUTES || "3");
const TODO_WEB_PUSH_RECEIPT_RETRY_LIMIT = Number(process.env.HERMES_WEB_TODO_PUSH_RECEIPT_RETRY_LIMIT || "3");
const WEIXIN_DELIVERY_RETRY_LIMIT = Math.max(0, Number(
  process.env.HERMES_MOBILE_WEIXIN_DELIVERY_RETRY_LIMIT
  || process.env.HERMES_WEB_WEIXIN_DELIVERY_RETRY_LIMIT
  || "3",
) || 0);
const WEIXIN_DELIVERY_RETRY_BASE_MS = Math.max(1000, Number(
  process.env.HERMES_MOBILE_WEIXIN_DELIVERY_RETRY_BASE_MS
  || process.env.HERMES_WEB_WEIXIN_DELIVERY_RETRY_BASE_MS
  || "60000",
) || 60000);
const WEIXIN_DELIVERY_RETRY_MAX_MS = Math.max(WEIXIN_DELIVERY_RETRY_BASE_MS, Number(
  process.env.HERMES_MOBILE_WEIXIN_DELIVERY_RETRY_MAX_MS
  || process.env.HERMES_WEB_WEIXIN_DELIVERY_RETRY_MAX_MS
  || "600000",
) || 600000);
const WEIXIN_INGRESS_ATTACHMENT_CONTEXT_WINDOW_MS = Math.max(0, Number(
  process.env.HERMES_MOBILE_WEIXIN_ATTACHMENT_CONTEXT_WINDOW_MS
  || process.env.HERMES_WEB_WEIXIN_ATTACHMENT_CONTEXT_WINDOW_MS
  || "30000",
) || 30000);
const AUTOMATION_WEB_PUSH_ENABLED = !/^(0|false|no|off)$/i.test(process.env.HERMES_WEB_AUTOMATION_PUSH_ENABLED || "1");
const AUTOMATION_WEB_PUSH_INTERVAL_MS = Number(process.env.HERMES_WEB_AUTOMATION_PUSH_INTERVAL_MS || "60000");
const AUTOMATION_WEB_PUSH_START_DELAY_MS = nonNegativeMilliseconds(
  process.env.HERMES_MOBILE_AUTOMATION_PUSH_START_DELAY_MS
  || process.env.HERMES_WEB_AUTOMATION_PUSH_START_DELAY_MS,
  WEB_PUSH_START_DELAY_MS,
);
const SINGLE_WINDOW_CHAT_TASK_GROUP_ID = "chat";
const SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID = "group-chat";
const GROUP_MESSAGE_REVOKED_TEXT = "\u6d88\u606f\u5df2\u64a4\u56de";
const GROUP_AI_REPLY_REVOKED_TEXT = "\u5173\u8054\u7684 AI \u56de\u590d\u5df2\u64a4\u56de";
const SINGLE_WINDOW_PROJECT_ID = "single-window";
const SINGLE_WINDOW_THREAD_TITLE = "Single Window";
const OWNER_LABEL = process.env.HERMES_WEB_OWNER_LABEL || "Owner";
const OWNER_ROOT_FALLBACK_LABEL = process.env.HERMES_WEB_OWNER_ROOT_LABEL || "Hermes Owner";
const OWNER_DRIVE_ROOT_NAMES = normalizeStringList(process.env.HERMES_WEB_OWNER_DRIVE_ROOT_NAMES || "ChatGPT-Drive");
const GENERIC_OWNER_TOPIC_PROJECT_PREFIXES = normalizeStringList(
  process.env.HERMES_WEB_GENERIC_OWNER_PROJECT_PREFIXES || "owner-",
);
const GENERIC_OWNER_TOPIC_PROJECT_IDS = new Set(normalizeStringList(
  process.env.HERMES_WEB_GENERIC_OWNER_PROJECT_IDS || "hermes-sync-folder",
));
const PRINCIPAL_LABEL_PREFIXES = normalizeStringList(
  process.env.HERMES_WEB_PRINCIPAL_LABEL_PREFIXES || (ENABLE_LEGACY_WEIXIN_COMPAT ? "weixin_" : ""),
);
const REASONING_EFFORT_OPTIONS = Object.freeze([
  { value: "low", label: "Low", shortLabel: "\u4f4e" },
  { value: "medium", label: "Medium", shortLabel: "\u4e2d" },
  { value: "high", label: "High", shortLabel: "\u9ad8" },
  { value: "xhigh", label: "Xhigh", shortLabel: "Xhigh" },
]);
const VALID_REASONING_EFFORTS = new Set(REASONING_EFFORT_OPTIONS.map((item) => item.value));
const MESSAGE_TIME_FIELDS = Object.freeze([
  "submittedAt",
  "queuedAt",
  "startedAt",
  "firstFeedbackAt",
  "completedAt",
  "failedAt",
  "cancelledAt",
]);

const MIME_BY_EXT = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".amr": "audio/amr",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function isSingleWindowConversationTaskGroupId(value) {
  const id = String(value || "");
  return id === SINGLE_WINDOW_CHAT_TASK_GROUP_ID || id === SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID;
}

function singleWindowChatTaskGroupId(requestedTaskGroupId = "") {
  return String(requestedTaskGroupId || "").trim() === SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID
    ? SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID
    : SINGLE_WINDOW_CHAT_TASK_GROUP_ID;
}

const AUTOMATION_PUSH_DELIVERABLE_EXTENSIONS = new Set([".md", ".pdf", ".doc", ".docx", ".xlsx", ".pptx"]);
const AUTOMATION_PUSH_DELIVERABLE_LOOKBACK_MS = Number(process.env.HERMES_WEB_AUTOMATION_PUSH_DELIVERABLE_LOOKBACK_MS || String(30 * 60 * 1000));
const AUTOMATION_PUSH_DELIVERABLE_FUTURE_GRACE_MS = Number(process.env.HERMES_WEB_AUTOMATION_PUSH_DELIVERABLE_FUTURE_GRACE_MS || String(30 * 60 * 1000));
const AUTOMATION_PUSH_INITIAL_LOOKBACK_MS = Number(process.env.HERMES_WEB_AUTOMATION_PUSH_INITIAL_LOOKBACK_MS || String(24 * 60 * 60 * 1000));
const MAX_STATE_BACKUPS = Number(process.env.HERMES_WEB_MAX_STATE_BACKUPS || "80");
const STATE_BACKUP_MIN_INTERVAL_MS = Number(process.env.HERMES_WEB_STATE_BACKUP_MIN_INTERVAL_MS || String(10 * 60 * 1000));
const DIRECT_TODO_CREATE_SETTING = String(process.env.HERMES_MOBILE_DIRECT_KANBAN_CREATE || process.env.HERMES_WEB_DIRECT_TODO_CREATE || "").trim();
const BOOT_TRACE_PATH = process.env.HERMES_MOBILE_BOOT_TRACE_PATH || process.env.HERMES_WEB_BOOT_TRACE_PATH || "";

function bootTrace(label) {
  if (!BOOT_TRACE_PATH) return;
  try {
    fs.mkdirSync(path.dirname(BOOT_TRACE_PATH), { recursive: true });
    fs.appendFileSync(BOOT_TRACE_PATH, `${new Date().toISOString()} pid=${process.pid} ${label}\n`, "utf8");
  } catch (_) {}
}

bootTrace("constants ready");

let clients = new Set();
let activeStreams = new Map();
let gatewayRunner = null;
let gatewayPoolProvider = null;
let gatewayRunStreamService = null;
let gatewayRunEventService = null;
let gatewayRunStartService = null;
let gatewayRunQueueService = null;
let assessmentExamWorkflowService = null;
let directoryBrowserBoundaryService = null;
let artifactTextRegistrationService = null;
let gatewayUsageTelemetryProvider = null;
let groupChatSharedAttachmentService = null;
let sharedDirectoryProjectionService = null;
let workspaceProjectProvider = null;
const dynamicProjectCache = new Map();
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
let threadDirectCreateExecutionService = null;
let threadMessageCreateService = null;
let threadMessageRunRouteService = null;
let threadOwnerElevationRetryService = null;
let systemRuntimeStatusService = null;
let weixinFileForwardService = null;
let weixinForwardService = null;
let weixinIngressEventService = null;
let weixinOutboundDeliveryService = null;
let webPushDeliveryService = null;

function getGatewayRunQueueService() {
  if (!gatewayRunQueueService) {
    gatewayRunQueueService = createGatewayRunQueueService({
      gatewayRunLifecycleService,
      nowIso,
      saveState,
      broadcast,
      compactMessage,
      threadSummary,
      startHermesRun: startRunForThread,
    });
  }
  return gatewayRunQueueService;
}

const addThreadActiveRun = (...args) => getGatewayRunQueueService().addThreadActiveRun(...args);
const replaceThreadActiveRun = (...args) => getGatewayRunQueueService().replaceThreadActiveRun(...args);
const removeThreadActiveRun = (...args) => getGatewayRunQueueService().removeThreadActiveRun(...args);
const taskGroupHasRunningRun = (...args) => getGatewayRunQueueService().taskGroupHasRunningRun(...args);
const nextQueuedRunPairForTaskGroup = (...args) => getGatewayRunQueueService().nextQueuedRunPairForTaskGroup(...args);
const scheduleNextQueuedRunForTaskGroup = (...args) => getGatewayRunQueueService().scheduleNextQueuedRunForTaskGroup(...args);

const runConcurrencyPolicy = createRunConcurrencyPolicy({
  maxGlobal: () => RUN_CONCURRENCY_MAX_GLOBAL,
  maxPerWorkspace: () => RUN_CONCURRENCY_MAX_PER_WORKSPACE,
});
bootTrace("concurrency ready");
const authProvider = createAuthProvider({
  disableAuth: () => DISABLE_AUTH,
  envKey: () => process.env.HERMES_WEB_KEY || "",
  authKeyPath: () => AUTH_KEY_PATH,
  accessKeysPath: () => ACCESS_KEYS_PATH,
  allowMemoryKey: () => /^(1|true|yes|on)$/i.test(process.env.HERMES_WEB_ALLOW_MEMORY_KEY || ""),
  nowIso,
  ensureDataDir,
  findWorkspace,
  workspacePrincipal,
  listWorkspaces: () => loadCatalog().workspaces,
});
bootTrace("auth ready");
const gatewayStatusProjection = createGatewayStatusProjection({
  isOwnerAuth,
});
const fileArtifactAccessService = createFileArtifactAccessService({
  dataDir: DATA_DIR,
  workspaceUploadDirName: WORKSPACE_UPLOAD_DIR_NAME,
  workspaceUploadSubdir: WORKSPACE_UPLOAD_SUBDIR,
  state: () => state,
  findWorkspace,
  normalizeLocalPath,
  rootConflictsWithProtected: (value) => securityBoundaryProvider.rootConflictsWithProtected(value),
  pathInsideAnyRoot,
  chatGroupMemberWorkspaceIds,
  authCanAccessWorkspace,
  makeId,
  nowIso,
  mimeFor,
});
const fileResponseService = createFileResponseService({
  contentDisposition,
  extractDocxText,
  mimeFor,
  sendJson,
  textBufferPreview,
  textFilePreview,
});
const fileArtifactResolverService = createFileArtifactResolverService({
  state: () => state,
  normalizeLocalPath,
  resolveBrowserPath: (...args) => getDirectoryBrowserBoundaryService().resolveBrowserPath(...args),
  logicalUserPathFallback: (...args) => workspaceDisplayPathService.logicalUserPathFallback(...args),
  logicalDirectoryDisplayPath: (...args) => workspaceDisplayPathService.logicalDirectoryDisplayPath(...args),
  mimeFor,
  authCanAccessWorkspace,
  artifactAccessibleToAuth: (...args) => getRuntimeStateThreadService().artifactAccessibleToAuth(...args),
  isPathAllowedForThread,
  isPathAllowed,
  isOwnerAuth,
  findArtifactReferenceById: (...args) => getRuntimeStateThreadService().findArtifactReferenceById(...args),
  findArtifactReference: (...args) => getRuntimeStateThreadService().findArtifactReference(...args),
  resolveArtifactPathFromMessage,
});
const publicApiRoutes = createPublicApiRoutes({
  authenticateRequest,
  createInitialOwnerKey,
  ownerSetupStatus,
  readBody,
  sendJson,
});
bootTrace("public api routes ready");
const weixinIngressProvider = createWeixinIngressProvider({
  listWorkspaces: () => loadCatalog().workspaces,
  workspaceIdForPrincipal,
  defaultWorkspaceId: () => WEIXIN_INGRESS_DEFAULT_WORKSPACE,
});
bootTrace("ingress ready");
const weixinApiRoutes = createWeixinApiRoutes({
  requireWeixinIngress,
  readBody,
  sendJson,
  startWeixinIngressEvent,
  pendingWeixinOutboundDeliveries,
  ackWeixinOutboundDelivery,
  weixinIngressProvider,
  authCanAccessWorkspace,
  weixinForwardTargetsForWorkspace,
  createWeixinFileForwardDelivery,
});
bootTrace("weixin api routes ready");
const runtimeConfigProvider = createRuntimeConfigProvider({
  storagePath: () => RUNTIME_CONFIG_PATH,
  ensureDataDir,
  nowIso,
  defaultHermesApiBase: () => HERMES_API_BASE,
  apiKeyPaths: () => HERMES_API_KEY_PATHS,
  envPaths: () => HERMES_ENV_PATHS,
  defaultWebPushSubject: () => WEB_PUSH_SUBJECT,
  defaultWebPushVapidPath: () => WEB_PUSH_VAPID_PATH,
});
bootTrace("runtime config ready");
webPushDeliveryService = createWebPushDeliveryService({
  appRouteUrl,
  automationDeliverableExtensions: AUTOMATION_PUSH_DELIVERABLE_EXTENSIONS,
  automationDeliverableFutureGraceMs: AUTOMATION_PUSH_DELIVERABLE_FUTURE_GRACE_MS,
  automationDeliverableLookbackMs: AUTOMATION_PUSH_DELIVERABLE_LOOKBACK_MS,
  automationInitialLookbackMs: AUTOMATION_PUSH_INITIAL_LOOKBACK_MS,
  automationProvider: () => automationProvider,
  automationPushEnabled: AUTOMATION_WEB_PUSH_ENABLED,
  automationPushIntervalMs: AUTOMATION_WEB_PUSH_INTERVAL_MS,
  automationPushStartDelayMs: AUTOMATION_WEB_PUSH_START_DELAY_MS,
  chatGroupMemberWorkspaceIds,
  compactText,
  dedupe,
  effectiveWebPushSubject,
  effectiveWebPushVapidPath,
  hashValue,
  findWorkspace,
  isWeixinSingleWindowThread: (...args) => getSingleWindowThreadService().isWeixinSingleWindowThread(...args),
  kanbanBlockedPushDelayMinutes: KANBAN_BLOCKED_PUSH_DELAY_MINUTES,
  loadCatalog,
  loadRuntimeConfig,
  logger: console,
  makeId,
  maybeReconcileKanbanDependencyBlocks,
  normalizeStringList,
  nowIso,
  publicTodo,
  saveState,
  singleWindowChatTaskGroupId: SINGLE_WINDOW_CHAT_TASK_GROUP_ID,
  singleWindowGroupChatTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
  state: () => state,
  todoProvider: () => todoProvider,
  todoPushEnabled: TODO_WEB_PUSH_ENABLED,
  todoPushIntervalMs: TODO_WEB_PUSH_INTERVAL_MS,
  todoPushReceiptRetryLimit: TODO_WEB_PUSH_RECEIPT_RETRY_LIMIT,
  todoPushReceiptRetryMinutes: TODO_WEB_PUSH_RECEIPT_RETRY_MINUTES,
  todoPushRecentCreateMinutes: TODO_WEB_PUSH_RECENT_CREATE_MINUTES,
  todoPushStartDelayMs: TODO_WEB_PUSH_START_DELAY_MS,
  useKanbanTodoBackend,
  webpush,
  webPushEnabled: WEB_PUSH_ENABLED,
  webPushSubject: WEB_PUSH_SUBJECT,
  webPushVapidPath: WEB_PUSH_VAPID_PATH,
  workspaceLabel,
  workspaceIdForPrincipal,
  workspacePrincipal,
});
bootTrace("web push ready");
const systemApiRoutes = createSystemApiRoutes({
  authenticateRequest,
  appUpdateStatus,
  applyAppUpdate,
  bootTrace,
  clientVersionInfo,
  compactText,
  display: {
    ownerLabel: OWNER_LABEL,
    ownerDriveRootNames: OWNER_DRIVE_ROOT_NAMES,
    ownerRootFallbackLabel: OWNER_ROOT_FALLBACK_LABEL,
  },
  getHermesStatus,
  includeStatusCatalog: STATUS_INCLUDE_CATALOG,
  isOwnerAuth,
  loadCatalog,
  publicConcurrencyForAuth,
  publicGatewayPoolStatusForAuth,
  publicOwnerElevationStatus,
  publicPushStatus: webPushDeliveryService.publicPushStatus,
  publicReasoningInfoForAuth,
  requestClientVersion,
  sendJson,
});
const ownerElevationApiRoutes = createOwnerElevationApiRoutes({
  requireOwner,
  readBody,
  sendJson,
  publicOwnerElevationStatus,
  grantOwnerElevationOnce,
  grantOwnerElevation,
  revokeOwnerElevation,
});
const accessKeyApiRoutes = createAccessKeyApiRoutes({
  requireOwner,
  readBody,
  sendJson,
  isOwnerAuth,
  ownerKeySource: () => authProvider.ownerKeySource(),
  listWorkspaceAccessKeyStatuses,
  rotateWorkspaceAccessKey,
  revokeWorkspaceAccessKey,
  rotateGlobalAccessKey,
  boolParam,
});
const runtimeConfigApiRoutes = createRuntimeConfigApiRoutes({
  generateWebPushVapidConfig,
  getHermesStatus,
  publicPushStatus: webPushDeliveryService.publicPushStatus,
  publicRuntimeConfig,
  readBody,
  reloadWebPush,
  requireOwner,
  runConcurrencySnapshot,
  saveRuntimeConfig,
  sendJson,
});
const pushApiRoutes = createPushApiRoutes({
  appRouteUrl,
  authenticateRequest,
  nowIso,
  publicPushStatus: webPushDeliveryService.publicPushStatus,
  pushWorkspaceForAuth,
  readBody,
  recordPushReceipt: webPushDeliveryService.recordPushReceipt,
  removePushSubscription: webPushDeliveryService.removePushSubscription,
  requireOwner,
  requireWorkspaceAccess,
  savePushSubscription: webPushDeliveryService.savePushSubscription,
  sendJson,
  sendPushNotification: webPushDeliveryService.sendPushNotification,
  state: () => state,
  listPushReceipts: () => state?.pushReceipts || [],
  listPushDeliveries: () => state?.pushDeliveries || [],
  workspacePrincipal,
});
const workspaceApiRoutes = createWorkspaceApiRoutes({
  bootTrace,
  loadCatalog,
  publicWorkspacesForAuth,
  publicWorkspace,
  isOwnerAuth,
  requireOwner,
  localWorkspaceDefaults,
  sendJson,
  readBody,
  upsertLocalWorkspace,
  deleteLocalWorkspace,
  findWorkspace,
});
const resourceApiRoutes = createResourceApiRoutes({
  requireWorkspaceAccess,
  sendJson,
  sharedDirectoryProjectionService: {
    listPublicSharedDirectories: (...args) => getSharedDirectoryProjectionService().listPublicSharedDirectories(...args),
    publicProjectsForWorkspace: (...args) => getSharedDirectoryProjectionService().publicProjectsForWorkspace(...args),
  },
  skillDetailProvider: {
    detail: (...args) => skillDetailProvider.detail(...args),
  },
  compactText,
});
const fileArtifactApiRoutes = createFileArtifactApiRoutes({
  contentDisposition,
  extractDocxText,
  mimeFor,
  resolveArtifactForRequest,
  resolveFileForBrowserRequest,
  sendJson,
  textFilePreview,
});
const directoryBrowserApiRoutes = createDirectoryBrowserApiRoutes({
  compareDirectoryEntriesNewestFirst: (...args) => getDirectoryBrowserBoundaryService().compareDirectoryEntriesNewestFirst(...args),
  findDirectoryThreadForRequest,
  publicDirectoryEntry: (...args) => getDirectoryBrowserBoundaryService().publicDirectoryEntry(...args),
  publicRemoteDirectoryEntry: (...args) => getDirectoryBrowserBoundaryService().publicRemoteDirectoryEntry(...args),
  resolveBrowserPathAsync: (...args) => getDirectoryBrowserBoundaryService().resolveBrowserPathAsync(...args),
  runDirectoryBridge,
  sendJson,
});
const directoryShareApiRoutes = createDirectoryShareApiRoutes({
  basename: (value) => path.basename(value),
  clearDynamicProjectCache: () => dynamicProjectCache.clear(),
  directoryRequestParams: (...args) => getDirectoryBrowserBoundaryService().directoryRequestParams(...args),
  findDirectoryThreadForRequest,
  invalidateCatalogCache,
  nowIso,
  readBody,
  requireWorkspaceAccess,
  resolveBrowserPathAsync: (...args) => getDirectoryBrowserBoundaryService().resolveBrowserPathAsync(...args),
  sendJson,
  sharedDirectoryProjectionService: {
    normalizeSharePermission: (...args) => getSharedDirectoryProjectionService().normalizeSharePermission(...args),
    normalizeShareScope: (...args) => getSharedDirectoryProjectionService().normalizeShareScope(...args),
    normalizeShareTargets: (...args) => getSharedDirectoryProjectionService().normalizeShareTargets(...args),
    publicSharedDirectory: (...args) => getSharedDirectoryProjectionService().publicSharedDirectory(...args),
    removeSharedDirectoryRecord: (...args) => getSharedDirectoryProjectionService().removeSharedDirectoryRecord(...args),
    shareableRootProjectForPath: (...args) => getSharedDirectoryProjectionService().shareableRootProjectForPath(...args),
    sharedDirectoryLabel: (...args) => getSharedDirectoryProjectionService().sharedDirectoryLabel(...args),
    updateSharedDirectoryAccess: (...args) => getSharedDirectoryProjectionService().updateSharedDirectoryAccess(...args),
    upsertSharedDirectory: (...args) => getSharedDirectoryProjectionService().upsertSharedDirectory(...args),
  },
  statSync: (value) => fs.statSync(value),
  workspacePrincipal,
});
const directoryMutationApiRoutes = createDirectoryMutationApiRoutes({
  assertChildPathInside: (...args) => getDirectoryBrowserBoundaryService().assertChildPathInside(...args),
  authenticateRequest,
  clearDynamicProjectCache: (workspaceId) => dynamicProjectCache.delete(String(workspaceId || "")),
  directoryRequestParams: (...args) => getDirectoryBrowserBoundaryService().directoryRequestParams(...args),
  exists: (value) => fs.existsSync(value),
  findDirectoryThreadForRequest,
  invalidateCatalogCache,
  isDeletableWorkspaceRootChild: (...args) => getDirectoryBrowserBoundaryService().isDeletableWorkspaceRootChild(...args),
  isDirectoryBrowserPathAllowedForThread,
  isProtectedDirectoryRoot: (...args) => getDirectoryBrowserBoundaryService().isProtectedDirectoryRoot(...args),
  isSharedDirectoryWriteAllowed: (...args) => getDirectoryBrowserBoundaryService().isSharedDirectoryWriteAllowed(...args),
  joinDisplayPath: (...args) => getDirectoryBrowserBoundaryService().joinDisplayPath(...args),
  joinLocalPath: (parent, name) => path.join(parent, name),
  maxUploadBytes: MAX_UPLOAD_BYTES,
  mimeFor,
  mkdir: (value) => fs.mkdirSync(value),
  publicManagedEntry: (...args) => getDirectoryBrowserBoundaryService().publicManagedEntry(...args),
  publicRemoteDirectoryEntry: (...args) => getDirectoryBrowserBoundaryService().publicRemoteDirectoryEntry(...args),
  readBody,
  resolveBrowserPathAsync: (...args) => getDirectoryBrowserBoundaryService().resolveBrowserPathAsync(...args),
  rmdir: (value) => fs.rmdirSync(value),
  runDirectoryBridge,
  safeDirectoryName,
  safeFileName,
  sendJson,
  stat: (value) => fs.statSync(value),
  uniqueChildPath,
  unlink: (value) => fs.unlinkSync(value),
  write: (filePath, buffer, options = {}) => fs.writeFileSync(filePath, buffer, { flag: options.flag || "w" }),
});
const eventFanoutService = createEventFanoutService({
  clients,
  authCanAccessWorkspace,
  isOwnerAuth,
  state: () => state,
  threadAccessibleToAuth: (...args) => getRuntimeStateThreadService().threadAccessibleToAuth(...args),
});
const eventStreamApiRoutes = createEventStreamApiRoutes({
  activeStreams: () => activeStreams,
  authenticateRequest,
  clientVersionInfo,
  effectiveHermesApiBase,
  pruneEmptyThreads: (...args) => getRuntimeStateThreadService().pruneEmptyThreads(...args),
  readClientVersion,
  registerClient: eventFanoutService.registerClient,
  removeClient: eventFanoutService.removeClient,
  runConcurrencySnapshot,
  sendJson,
  state: () => state,
  threadAccessibleToAuth: (...args) => getRuntimeStateThreadService().threadAccessibleToAuth(...args),
  threadSummary,
});
const threadReadUploadApiRoutes = createThreadReadUploadApiRoutes({
  authenticateRequest,
  boolParam,
  broadcast,
  chatGroupMemberWorkspaceIds,
  compactMessage,
  compactThread,
  compactThreadWithMessagePage,
  findProject,
  findSubproject,
  findThreadForRequest: (...args) => getRuntimeStateThreadService().findThreadForRequest(...args),
  findWorkspace,
  isDiscardableEmptyThread: (...args) => getRuntimeStateThreadService().isDiscardableEmptyThread(...args),
  makeId,
  maxUploadBytes: MAX_UPLOAD_BYTES,
  normalizeThread: (...args) => getRuntimeStateNormalizationService().normalizeThread(...args),
  nowIso,
  pruneEmptyThreads: (...args) => getRuntimeStateThreadService().pruneEmptyThreads(...args),
  readBody,
  registerUploadArtifact,
  requireWorkspaceAccess,
  safeFileName,
  saveState,
  searchThreadMessages,
  sendJson,
  singleWindowProjectTaskSummaries,
  state: () => state,
  threadAccessibleToRequest: (...args) => getRuntimeStateThreadService().threadAccessibleToRequest(...args),
  threadMessageInitialLimit: THREAD_MESSAGE_INITIAL_LIMIT,
  threadMessagePageLimit: THREAD_MESSAGE_PAGE_LIMIT,
  threadMessageSearchLimit: THREAD_MESSAGE_SEARCH_LIMIT,
  threadMessagesPage,
  threadSummary,
  workspaceUploadDirectoryForRequest,
});
const threadTaskApiRoutes = createThreadTaskApiRoutes({
  broadcast,
  compactThread,
  dedupe,
  findThreadForRequest: (...args) => getRuntimeStateThreadService().findThreadForRequest(...args),
  isSingleWindowConversationTaskGroupId,
  normalizeTaskGroupMeta: (...args) => getRuntimeStateNormalizationService().normalizeTaskGroupMeta(...args),
  nowIso,
  readBody,
  sanitizeTaskGroupId: (...args) => getRuntimeStateNormalizationService().sanitizeTaskGroupId(...args),
  sanitizeTaskTitle: (...args) => getRuntimeStateNormalizationService().sanitizeTaskTitle(...args),
  saveState,
  sendJson,
  state: () => state,
  stopRunIds,
});
const singleWindowGroupChatApiRoutes = createSingleWindowGroupChatApiRoutes({
  authenticateRequest,
  broadcast,
  canRevokeGroupChatMessage,
  compactMessage,
  compactThread,
  compactThreadWithMessagePage,
  ensureSingleWindowThread: (...args) => getSingleWindowThreadService().ensureSingleWindowThread(...args),
  ensureWeixinSingleWindowThread: (...args) => getSingleWindowThreadService().ensureWeixinSingleWindowThread(...args),
  findGroupChatThreadForWorkspace: (...args) => getSingleWindowThreadService().findGroupChatThreadForWorkspace(...args),
  findThreadForRequest: (...args) => getRuntimeStateThreadService().findThreadForRequest(...args),
  findWeixinSingleWindowThreadForWorkspace: (...args) => getSingleWindowThreadService().findWeixinSingleWindowThreadForWorkspace(...args),
  findWorkspace,
  groupAiReplyRevokedText: GROUP_AI_REPLY_REVOKED_TEXT,
  groupAssistantReplyForUserMessage,
  groupChatTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
  groupMessageRevokedText: GROUP_MESSAGE_REVOKED_TEXT,
  groupMessageRevoker,
  kanbanCaseTopicThreadsForWorkspace: (...args) => getSingleWindowThreadService().kanbanCaseTopicThreadsForWorkspace(...args),
  normalizeChatGroup,
  normalizeStringList,
  nowIso,
  readBody,
  removeThreadActiveRun,
  requireOwner,
  requireWorkspaceAccess,
  revokeGroupMessagePayload,
  saveState,
  scheduleNextQueuedRunForTaskGroup,
  sendJson,
  state: () => state,
  stopRunIds,
  threadAccessibleToAuth: (...args) => getRuntimeStateThreadService().threadAccessibleToAuth(...args),
  threadMessageInitialLimit: THREAD_MESSAGE_INITIAL_LIMIT,
  threadSummary,
  weixinForwardTargetsForWorkspace,
});
const threadMessageRunApiRoutes = createThreadMessageRunApiRoutes({
  handleThreadMessageCreate: (...args) => getThreadMessageRunRouteService().handleThreadMessageCreate(...args),
  handleThreadMessageOwnerElevation: (...args) => getThreadMessageRunRouteService().handleThreadMessageOwnerElevation(...args),
});
let todoWebPushRunning = false;
let automationWebPushRunning = false;

const filesystemMountProvider = createFilesystemMountProvider({
  wslDistro: WSL_DISTRO,
  windowsHome: WINDOWS_HOME,
  repoRoot: REPO_ROOT,
  dataDir: DATA_DIR,
  volume1WindowsRoot: () => process.env.HERMES_WEB_VOLUME1_WINDOWS_ROOT || "",
  disabledVolume1Shares: () => normalizeStringList(process.env.HERMES_WEB_DISABLED_VOLUME1_WINDOWS_MIRROR_SHARES || ""),
  allowedArtifactRoots: () => String(process.env.HERMES_WEB_ALLOWED_ARTIFACT_ROOTS || ""),
});
bootTrace("filesystem mount ready");

const securityBoundaryProvider = createSecurityBoundaryProvider({
  allowUnrestricted: () => process.env.HERMES_MOBILE_SECURITY_ALLOW_UNRESTRICTED || process.env.HERMES_WEB_SECURITY_ALLOW_UNRESTRICTED || "",
  allowDeveloperToolsets: () => process.env.HERMES_MOBILE_SECURITY_ALLOW_DEVELOPER_TOOLSETS || process.env.HERMES_WEB_SECURITY_ALLOW_DEVELOPER_TOOLSETS || "",
  protectedRoots: () => dedupe([
    REPO_ROOT,
    TOOL_ROOT,
    PUBLIC_ROOT,
    LOCAL_CONFIG_ROOT,
    path.dirname(AUTH_KEY_PATH),
    WINDOWS_HOME ? path.join(WINDOWS_HOME, ".hermes-windows") : "",
    process.env.HERMES_WEB_HERMES_HOME,
    process.env.HERMES_MOBILE_HERMES_HOME,
    process.env.HERMES_WEB_HERMES_REPO,
    process.env.HERMES_MOBILE_HERMES_REPO,
    WSL_HERMES_HOME,
    `${WSL_HOME}/.hermes-update-sandboxes`,
    ...GATEWAY_USAGE_TELEMETRY_PROFILE_ROOTS,
    ...normalizeStringList(process.env.HERMES_MOBILE_SECURITY_PROTECTED_ROOTS || process.env.HERMES_WEB_SECURITY_PROTECTED_ROOTS || ""),
  ].filter(Boolean)),
  protectedFiles: () => dedupe([
    STATE_PATH,
    ACCESS_KEYS_PATH,
    LOCAL_WORKSPACES_PATH,
    RUNTIME_CONFIG_PATH,
    SHARED_DIRECTORIES_PATH,
    AUTH_KEY_PATH,
    WEB_PUSH_VAPID_PATH,
    LOCAL_TODO_STORE_PATH,
    LOCAL_AUTOMATION_STORE_PATH,
    MOBILE_SQLITE_DB_PATH,
    ...WEIXIN_INGRESS_KEY_PATHS,
    ...HERMES_ENV_PATHS,
    ...HERMES_API_KEY_PATHS,
    ...WORKSPACE_USERS_PATHS,
    ...WORKSPACE_ROUTE_MAP_PATHS,
    ...HERMES_CONFIG_PATHS,
    ...GATEWAY_POOL_MANIFEST_PATHS,
    ...GOOGLE_TOKEN_PATHS,
    ...GOOGLE_CLIENT_SECRET_PATHS,
    ...OUTLOOK_GRAPH_TOKEN_PATHS,
    ...GITHUB_CLI_HOSTS_PATHS,
    ...normalizeStringList(process.env.HERMES_MOBILE_SECURITY_PROTECTED_FILES || process.env.HERMES_WEB_SECURITY_PROTECTED_FILES || ""),
  ].filter(Boolean)),
  allowedExceptionRoots: () => dedupe([
    OWNER_DEFAULT_WORKSPACE,
    path.join(DATA_DIR, "drive"),
    path.join(DATA_DIR, "artifacts"),
    path.join(DATA_DIR, "uploads"),
    GROUP_DELIVERIES_DIR,
    CRON_OUTPUT_ROOT,
    CRON_RUN_LOG_ROOT,
    ...normalizeStringList(process.env.HERMES_MOBILE_SECURITY_ALLOWED_EXCEPTIONS || process.env.HERMES_WEB_SECURITY_ALLOWED_EXCEPTIONS || ""),
  ].filter(Boolean)),
});
bootTrace("security boundary ready");

const bridgeCommandProvider = createBridgeCommandProvider({
  wslDistro: () => WSL_DISTRO,
  windowsPathToWsl: (value) => windowsPathToWsl(value),
});
const TODO_BRIDGE_SCRIPT = bridgeCommandProvider.script("HERMES_WEB_TODO_BRIDGE_SCRIPT", DEFAULT_TODO_BRIDGE_SCRIPT);
const CRON_BRIDGE_SCRIPT = bridgeCommandProvider.script("HERMES_WEB_CRON_BRIDGE_SCRIPT", DEFAULT_CRON_BRIDGE_SCRIPT);
const DIRECTORY_BRIDGE_SCRIPT = bridgeCommandProvider.script("HERMES_WEB_DIRECTORY_BRIDGE_SCRIPT", DEFAULT_DIRECTORY_BRIDGE_SCRIPT);
const SKILL_BRIDGE_SCRIPT = bridgeCommandProvider.script("HERMES_WEB_SKILL_BRIDGE_SCRIPT", DEFAULT_SKILL_BRIDGE_SCRIPT);
bootTrace("bridge commands ready");

const sharedDirectoryProvider = createSharedDirectoryProvider({
  storagePath: SHARED_DIRECTORIES_PATH,
  ensureDataDir,
  nowIso,
  readJsonFirst,
  usersPaths: WORKSPACE_USERS_PATHS,
  loadCatalog,
  findWorkspace,
  workspacePrincipal,
  isRootAllowed: (root) => !securityBoundaryProvider.rootConflictsWithProtected(root),
});
bootTrace("shared directories ready");

const auditEventProvider = createAuditEventProvider({
  sink: (eventType, event) => {
    if (useSqliteServiceStore()) {
      mobileSqliteStore().audit(eventType, event);
      return;
    }
    ensureDataDir();
    fs.appendFileSync(AUDIT_EVENT_LOG_PATH, `${JSON.stringify(event)}\n`, "utf8");
  },
  onError: (err, event) => {
    console.warn("[audit] failed to record event", event?.eventType || "event", err?.message || String(err));
  },
});
bootTrace("audit events ready");

const egressPolicyProvider = createEgressPolicyProvider({
  audit: (eventType, payload) => auditEventProvider.audit(eventType, payload),
});
bootTrace("egress policy ready");

const pathPolicyProvider = createPathPolicyProvider({
  normalizeLocalPath: (value) => normalizeLocalPath(value),
  isProtectedPath: (value) => securityBoundaryProvider.isProtectedPath(value),
  isGloballyAllowedPath: (value) => isPathAllowed(value),
  uploadRootsForThread: (thread) => uploadRootsForThread(thread),
  policyForThread: (thread) => policyForThread(thread),
  ownerRootsForThread: (thread) => dedupe([
    ...loadCatalog().projects
      .filter((project) => project.workspaceId === "owner")
      .map((project) => project.root)
      .filter(Boolean),
    ...sharedDirectoryRoots(thread?.workspaceId),
  ]),
  directoryOwnerRootsForThread: (thread) => {
    const home = os.homedir();
    return [
      home ? path.join(home, "Documents") : "",
      home ? path.join(home, "SynologyDrive") : "",
      path.join(REPO_ROOT, "workspace"),
      path.join(REPO_ROOT, "outbox"),
      ...sharedDirectoryRoots(thread?.workspaceId),
      ...loadCatalog().projects
        .filter((project) => project.workspaceId === "owner")
        .flatMap((project) => [project.root, ...(project.children || []).map((child) => child.root)]),
    ].filter((root) => root && !securityBoundaryProvider.rootConflictsWithProtected(root));
  },
  audit: (eventType, payload) => {
    if (payload?.decision === "deny") auditEventProvider.audit(eventType, payload);
  },
});
bootTrace("path policy ready");

const accessPolicyProvider = createAccessPolicyProvider({
  uploadCacheRoot: () => path.join(DATA_DIR, "uploads"),
  sharedRoots: (principalId) => sharedDirectoryRoots(principalId),
});
bootTrace("access policy ready");

const projectDiscoveryProvider = createProjectDiscoveryProvider({
  repoRoot: REPO_ROOT,
  singleWindowProjectId: SINGLE_WINDOW_PROJECT_ID,
  singleWindowThreadTitle: SINGLE_WINDOW_THREAD_TITLE,
  ownerDriveRootNames: OWNER_DRIVE_ROOT_NAMES,
  normalizeLocalPath,
  runDirectoryBridge,
  sharedProjectsForWorkspace: sharedDirectoryProjectsForWorkspace,
  workspacePrincipal,
  findWorkspace,
  makeId,
});
bootTrace("project discovery ready");

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

weixinForwardService = createWeixinForwardService({
  authCanAccessWorkspace,
  chatGroupMemberWorkspaceIds,
  findWorkspace,
  isOwnerAuth,
  state: () => state,
  threadAccessibleToAuth: (...args) => getRuntimeStateThreadService().threadAccessibleToAuth(...args),
  workspaceLabel,
});
bootTrace("weixin forward service ready");

weixinFileForwardService = createWeixinFileForwardService({
  authCanAccessWorkspace,
  basename: path.basename,
  broadcast,
  compactMessage,
  compactText,
  compactThread,
  deliveryId: (threadId, messageId) => weixinIngressProvider.deliveryId(threadId, messageId),
  egressPolicyProvider,
  ensureWeixinSingleWindowThread: (...args) => getSingleWindowThreadService().ensureWeixinSingleWindowThread(...args),
  fileResultFromBridgeFileForForward,
  findThreadForAuth: (...args) => getRuntimeStateThreadService().findThreadForAuth(...args),
  fs,
  isOwnerAuth,
  isWeixinSingleWindowThread: (...args) => getSingleWindowThreadService().isWeixinSingleWindowThread(...args),
  makeId,
  materializeWeixinForwardFile,
  mimeFor,
  normalizeExternalDelivery: (...args) => getRuntimeStateNormalizationService().normalizeExternalDelivery(...args),
  normalizeLocalPath,
  nowIso,
  publicWeixinOutboundDelivery,
  resolveArtifactForRequest,
  resolveAuthorizedCronDeliverableFile,
  resolveAuthorizedCronOutputFile,
  resolveFileForBrowserRequest,
  resolveKanbanOutputFile,
  resolveWeixinForwardTarget,
  safeFileName,
  saveState,
  singleWindowChatTaskGroupId: SINGLE_WINDOW_CHAT_TASK_GROUP_ID,
  state: () => state,
  threadSummary,
});
bootTrace("weixin file forward service ready");

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

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function isUncPath(value) {
  return /^\\\\/.test(String(value || ""));
}

function wslUncPathCandidates(root, ...parts) {
  const allowWslUnc = /^(1|true|yes|on)$/i.test(
    process.env.HERMES_MOBILE_ALLOW_WSL_UNC_PROBES
    || process.env.HERMES_WEB_ALLOW_WSL_UNC_PROBES
    || "",
  );
  if (!allowWslUnc) return [];
  const normalizedRoot = String(root || "").replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!normalizedRoot) return [];
  const suffix = parts
    .map((part) => String(part || "").replaceAll("\\", "/").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
  const full = [normalizedRoot, suffix].filter(Boolean).join("/").replaceAll("/", "\\");
  return [
    `\\\\wsl.localhost\\${WSL_DISTRO}\\${full}`,
    `\\\\wsl$\\${WSL_DISTRO}\\${full}`,
  ];
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
  return getGatewayRunStreamService().gatewayTargetForRun(runId);
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

function mentionSearchText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function workspaceMentionCandidates(workspace = {}) {
  const policy = workspace.policy && typeof workspace.policy === "object" ? workspace.policy : {};
  return dedupe([
    workspace.id,
    workspace.workspaceId,
    workspace.label,
    workspace.name,
    workspace.displayName,
    workspace.principalId,
    policy.principal_id,
    policy.principal_label,
    ...(Array.isArray(workspace.aliases) ? workspace.aliases : []),
  ].map((item) => String(item || "").trim()).filter(Boolean));
}

function mentionedWorkspaceIdsInText(text) {
  const haystack = mentionSearchText(text);
  if (!haystack) return [];
  const matches = [];
  for (const workspace of loadCatalog().workspaces || []) {
    const workspaceId = String(workspace?.id || "").trim();
    if (!workspaceId) continue;
    for (const candidate of workspaceMentionCandidates(workspace)) {
      const needle = mentionSearchText(candidate);
      if (needle.length < 2) continue;
      if (haystack.includes(needle)) {
        matches.push(workspaceId);
        break;
      }
    }
  }
  return dedupe(matches);
}

function textLooksLikeAutomationWrite(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  const mentionsAutomation = (
    /automation|cron|scheduled?\s+(?:job|task)|timer\s+job/i.test(raw)
    || /\u81ea\u52a8\u5316|\u81ea\u52a8\u4efb\u52a1|\u5b9a\u65f6\u4efb\u52a1|\u5b9a\u65f6|\u89e6\u53d1\u65f6\u95f4|\u8ba1\u5212\u4efb\u52a1/.test(raw)
  );
  const hasWriteAction = (
    /create|add|update|modify|edit|change|delete|remove|pause|resume|enable|disable|reschedule|set/i.test(raw)
    || /\u521b\u5efa|\u65b0\u589e|\u66f4\u65b0|\u4fee\u6539|\u7f16\u8f91|\u6539\u4e3a|\u8c03\u6574|\u5220\u9664|\u79fb\u9664|\u6682\u505c|\u6062\u590d|\u542f\u7528|\u7981\u7528|\u8bbe\u7f6e|\u6539\u5230|\u6539\u6210/.test(raw)
  );
  return mentionsAutomation && hasWriteAction;
}

function classifyAutomationAdminIntentForRun(text, options = {}) {
  const actorWorkspaceId = String(options.actorWorkspaceId || options.actor_workspace_id || "").trim();
  let mentionedWorkspaceIds = [];
  if (textLooksLikeAutomationWrite(text)) {
    mentionedWorkspaceIds = mentionedWorkspaceIdsInText(text);
    if (mentionedWorkspaceIds.some((workspaceId) => workspaceId && workspaceId !== actorWorkspaceId)) {
      return {
        category: "automation_admin_write",
        elevationRequired: true,
        elevationScope: "automation_admin_write",
        message: "This looks like a cross-account automation management request. Confirm elevation to route this one run to an Owner maintenance Gateway.",
      };
    }
  }
  const classification = securityBoundaryProvider.classifyAutomationAdminWriteIntent(text);
  if (!classification) return null;
  if (mentionedWorkspaceIds.length && !mentionedWorkspaceIds.some((workspaceId) => workspaceId !== actorWorkspaceId)) return null;
  return classification;
}

function gatewayRoutingForModelRun(auth, text, options = {}) {
  const explicitMaintenance = Boolean(options.maintenanceMode || options.maintenance_mode);
  if (explicitMaintenance) {
    const onceToken = options.ownerElevationOnceToken || options.owner_elevation_once_token || "";
    if (consumeOwnerElevationOnce(auth, onceToken) || isOwnerElevationActive(auth)) {
      return {
        securityLevel: "owner-maintenance",
        maintenance: true,
        maintenanceCategory: options.elevationScope || options.elevation_scope || "owner_high_privilege",
      };
    }
    const err = new Error("Owner high-privilege authorization is not active. Use the Owner navigation permission control before running this request.");
    err.status = isOwnerAuth(auth) ? 409 : 403;
    err.code = "owner_high_privilege_required";
    err.operatorRequired = true;
    err.elevationRequired = Boolean(isOwnerAuth(auth));
    err.elevationScope = options.elevationScope || options.elevation_scope || "owner_high_privilege";
    throw err;
  }
  const classification = securityBoundaryProvider.classifyMaintenanceIntent(text)
    || classifyAutomationAdminIntentForRun(text, options)
    || securityBoundaryProvider.classifySharedSkillWriteIntent(text);
  if (!classification) return { securityLevel: "user", maintenance: false };
  const err = new Error(classification.message);
  err.status = isOwnerAuth(auth) ? 409 : 403;
  err.code = classification.category;
  err.operatorRequired = true;
  err.elevationRequired = Boolean(isOwnerAuth(auth) && classification.elevationRequired);
  err.elevationScope = classification.elevationScope || classification.category;
  throw err;
}

function sharedSkillElevationInstructions(options = {}) {
  const scope = String(options.elevationScope || options.elevation_scope || "").trim();
  if (scope !== "shared_skill_write") return "";
  return [
    "APPROVED OWNER ELEVATION: this run is allowed to create or update a shared/system Skill only.",
    "If a Skill should be available to all workspaces, place it in the shared Skill namespace, for example `shared/<skill-id>/SKILL.md`, through the current official Hermes Skill store.",
    "Do not modify unrelated Skills, runtime secrets, product source, worker manifests, or user-private workspace files.",
    "If the requested Skill is actually private to one workspace, do not use this elevated shared scope.",
  ].join("\n");
}

function ownerElevationInstructions(options = {}) {
  const scope = String(options.elevationScope || options.elevation_scope || "").trim();
  if (scope === "owner_high_privilege") {
    return [
      "APPROVED OWNER HIGH-PRIVILEGE RUN: this run is routed to an Owner maintenance Gateway because the Owner explicitly authorized high-privilege execution in Hermes Mobile.",
      "Use elevated tools only for the latest user request. Do not make unrelated changes, expose raw secrets, print keys/tokens, or modify worker manifests/runtime configuration unless the user explicitly requested that exact maintenance action.",
      "Image editing, object removal, background cleanup, P image requests, and erase/inpainting requests inside the current workspace are ordinary user work, not maintenance work. Even in an elevated run, use ChatGPT Image 2 image editing tools when available; do not use local PIL/OpenCV/rembg/SAM/ffmpeg/terminal/code image repair unless the user explicitly asks for local image processing.",
      "If the requested target is ambiguous, stop and ask for clarification instead of guessing.",
    ].join("\n");
  }
  if (scope === "shared_skill_write") return sharedSkillElevationInstructions(options);
  if (scope === "automation_admin_write") {
    return [
      "APPROVED OWNER ELEVATION: this run is allowed to inspect and update the Automation/CRON job explicitly requested in the latest user message.",
      "Limit the operation to the named target account/workspace and named automation job. Do not modify unrelated jobs, Access Keys, runtime secrets, worker manifests, product source, or user-private files.",
      "If the exact target job is ambiguous, stop and ask for clarification instead of guessing.",
      "Report the old schedule and new schedule in the final receipt.",
    ].join("\n");
  }
  return "";
}

function sanitizeElevationScope(value) {
  const scope = String(value || "").trim();
  if (/^[A-Za-z][A-Za-z0-9_-]{0,80}$/.test(scope)) return scope;
  return "owner_high_privilege";
}

function parsePermissionApprovalMarker(text) {
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    const markerIndex = line.indexOf(PERMISSION_APPROVAL_MARKER);
    if (markerIndex < 0) continue;
    const trailing = line.slice(markerIndex + PERMISSION_APPROVAL_MARKER.length).trim();
    let parsed = {};
    if (trailing.startsWith("{")) {
      try {
        parsed = JSON.parse(trailing);
      } catch (_) {
        parsed = {};
      }
    }
    return {
      elevationRequired: true,
      elevationScope: sanitizeElevationScope(parsed.scope || parsed.elevationScope || "owner_high_privilege"),
      elevationReason: compactText(parsed.reason || parsed.message || "Model permission boundary requested Owner approval.", 240),
      elevationSource: "model_permission_boundary",
    };
  }
  return null;
}

function stripPermissionApprovalMarkers(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => !line.includes(PERMISSION_APPROVAL_MARKER))
    .join("\n")
    .trim();
}

function inferPermissionApprovalRequest(text) {
  const raw = String(text || "");
  if (!raw.trim()) return null;
  const permissionDenied = (
    /outside\s+(?:the\s+)?current\s+(?:workspace\/Gateway\s+)?permission\s+scope/i.test(raw)
    || /permission\s+boundary|access_policy_context|current\s+Gateway\s+permission/i.test(raw)
    || /当前.*权限|权限范围|权限边界|超出.*权限|不在.*权限|无法访问.*路径/.test(raw)
  );
  const elevationHint = (
    /Owner|approval|approve|elevation|maintenance|high[-_\s]?privilege/i.test(raw)
    || /提权|高权限|批准|授权|Owner/.test(raw)
  );
  if (!permissionDenied || !elevationHint) return null;
  return {
    elevationRequired: true,
    elevationScope: "owner_high_privilege",
    elevationReason: compactText(raw.replace(/\s+/g, " ").trim(), 240),
    elevationSource: "model_permission_boundary_heuristic",
  };
}

function modelPermissionApprovalRequest(text, message = {}) {
  const routing = message.runOptions?.gatewayRouting || {};
  if (routing.maintenance || routing.allowMaintenance || routing.allow_maintenance) return null;
  const markerRequest = parsePermissionApprovalMarker(text);
  return markerRequest || inferPermissionApprovalRequest(text);
}

function precedingUserMessageForAssistant(thread, assistantMessage) {
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  const index = messages.findIndex((item) => String(item.id || "") === String(assistantMessage?.id || ""));
  for (let i = (index >= 0 ? index - 1 : messages.length - 1); i >= 0; i -= 1) {
    const candidate = messages[i];
    if (!candidate || candidate.role !== "user") continue;
    if (assistantMessage?.taskGroupId && candidate.taskGroupId !== assistantMessage.taskGroupId) continue;
    return candidate;
  }
  return null;
}

function gatewaySkillRoutingForWorkspace(workspaceId, routing = {}) {
  if (GATEWAY_SKILL_PROFILE_ROUTING === "off") return {};
  const securityLevel = String(routing.securityLevel || routing.security_level || "user").trim();
  const maintenance = Boolean(routing.maintenance || routing.allowMaintenance || routing.allow_maintenance);
  if (maintenance || /^owner[-_]maintenance$/i.test(securityLevel)) return {};
  const skillWorkspaceId = String(workspaceId || "").trim();
  if (!skillWorkspaceId) return {};
  const hints = { skillWorkspaceId };
  if (GATEWAY_SKILL_PROFILE_ROUTING === "on") hints.requireSkillProfile = true;
  return hints;
}

function isOwnerMaintenanceGatewayRouting(routing = {}) {
  const securityLevel = String(routing.securityLevel || routing.security_level || "").trim();
  return Boolean(routing.maintenance || routing.allowMaintenance || routing.allow_maintenance || /^owner[-_]maintenance$/i.test(securityLevel));
}

function accessPolicyHardeningOptionsForGatewayRouting(routing = {}) {
  const allowMaintenanceTools = isOwnerMaintenanceGatewayRouting(routing);
  return {
    allowUnrestricted: allowMaintenanceTools,
    allowDeveloperToolsets: allowMaintenanceTools,
  };
}

function ownerSetupStatus() {
  return authProvider.ownerSetupStatus();
}

function createInitialOwnerKey() {
  return authProvider.createInitialOwnerKey();
}

function getUrl(req) {
  return new URL(req.url, `http://${req.headers.host || "localhost"}`);
}

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
      clearDynamicProjectCache: (workspaceId) => dynamicProjectCache.delete(String(workspaceId || "")),
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

function requestClientVersion(req) {
  const url = getUrl(req);
  return url.searchParams.get("clientVersion") || req.headers["x-hermes-web-client-version"] || "";
}

function attachClientVersionHeaders(req, res) {
  const info = clientVersionInfo(requestClientVersion(req));
  res.setHeader("X-Hermes-Web-Version", info.version);
  res.setHeader("X-Hermes-Web-Client-Version", info.clientVersion || "");
  res.setHeader("X-Hermes-Web-Refresh-Required", info.refreshRequired ? "1" : "0");
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

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

const todoApiRoutes = createTodoApiRoutes({
  boolParam,
  broadcast,
  clearKanbanCardListCache,
  maybeReconcileKanbanDependencyBlocks,
  notifyTodoCreated: webPushDeliveryService.notifyTodoCreated,
  publicTodo,
  readBody,
  requireOwner,
  requireWorkspaceAccess,
  runTodoWebPushTick: webPushDeliveryService.runTodoWebPushTick,
  sendJson,
  todoErrorResponse,
  todoProvider,
  useKanbanTodoBackend,
  workspacePrincipal,
});
bootTrace("todo api routes ready");

const kanbanCardProvider = createKanbanCardProvider({
  runBridge: (payload) => kanbanTodoBridge.run(payload),
  workspacePrincipal,
  assigneesForWorkspace: todoAssigneesForWorkspace,
  publicCard: publicTodo,
  sourceName: () => "hermes_kanban",
});
const kanbanCaseShareService = createKanbanCaseShareService({
  sharePath: KANBAN_CASE_SHARE_PATH,
  readJsonStore,
  writeJsonStore,
  useSqliteServiceStore,
  mobileSqliteStore,
  nowIso,
  findWorkspace,
  isOwnerAuth,
  authCanAccessWorkspace,
  kanbanCardProvider,
});
const kanbanMaintenanceService = createKanbanMaintenanceService({
  cardListCachePath: KANBAN_CARD_LIST_CACHE_PATH,
  cardListCacheTtlMs: KANBAN_CARD_LIST_CACHE_TTL_MS,
  dependencyReconcileIntervalMs: KANBAN_DEPENDENCY_RECONCILE_INTERVAL_MS,
  readJsonStore,
  writeJsonStore,
  nowIso,
  fileExists: fs.existsSync,
  useKanbanTodoBackend,
  kanbanCardProvider,
  broadcast,
  logger: console,
});
const kanbanStudyArtifactService = createKanbanStudyArtifactService({
  artifactRoot: KANBAN_READING_ARTIFACT_ROOT,
  nowIso,
  safeStorageSegment,
  readJsonStore,
  writeJsonStore,
  publicKanbanOutputFile,
  caseDirectoryPathForCase: (...args) => kanbanCaseShareService.caseDirectoryPathForCase(...args),
  isKanbanStudyCaseMode,
});
const kanbanReadingWorkflowService = createKanbanReadingWorkflowService({
  artifactService: kanbanStudyArtifactService,
  analysisTimeoutMs: KANBAN_READING_ANALYSIS_TIMEOUT_MS,
  automationCreateModel: AUTOMATION_CREATE_MODEL,
  compactText,
  dataDir: DATA_DIR,
  extractDocxText,
  extractJsonObject,
  findWorkspace,
  hermesModelText,
  isKanbanStudyCaseMode,
  kanbanCardEffectiveCaseIndex,
  kanbanCardProvider,
  kanbanCardRevisionOf,
  kanbanCardUsesReadingTemplate: studyAssessmentService.kanbanCardUsesReadingTemplate,
  kanbanWorkflowStateCompleted,
  maxUploadBytes: MAX_UPLOAD_BYTES,
  maybeReconcileKanbanDependencyBlocks,
  maxCoverBytes: KANBAN_READING_COVER_MAX_BYTES,
  maxFilePreviewChars: MAX_FILE_PREVIEW_CHARS,
  maxSourceDocumentBytes: KANBAN_SOURCE_DOCUMENT_MAX_BYTES,
  mimeFor,
  nowIso,
  publicTodo,
  runProcessText,
  safeFileName,
  safeStorageSegment,
  sanitizePolicy,
  textFilePreview,
  transcribeScript: KANBAN_READING_TRANSCRIBE_SCRIPT,
  transcribeTimeoutMs: KANBAN_READING_TRANSCRIBE_TIMEOUT_MS,
  quizTargetingVersion: KANBAN_READING_QUIZ_TARGETING_VERSION,
  visibleKanbanCaseCards,
});
function readingContextForCard(...args) {
  return kanbanReadingWorkflowService.readingContextForCard(...args);
}
const gatewayRunLifecycleService = createGatewayRunLifecycleService();
const kanbanPlanService = createKanbanPlanService({
  compactText,
  defaultMaxParallel: KANBAN_MULTI_AGENT_DEFAULT_PARALLEL,
  maxParallelLimit: KANBAN_MULTI_AGENT_MAX_PARALLEL,
  maxCards: KANBAN_MULTI_AGENT_MAX_CARDS,
  validReasoningEfforts: VALID_REASONING_EFFORTS,
  createPlanId: () => `kanban-plan-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
  createSingleCaseId: () => `kanban-single-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
});
const naturalLanguageDraftService = createNaturalLanguageDraftService({
  automationCreateModel: AUTOMATION_CREATE_MODEL,
  automationTimeoutMs: AUTOMATION_CREATE_TIMEOUT_MS,
  compactText,
  createAutomationDeliveryRequirement,
  createConversationId: (prefix) => `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
  hermesModelText,
  kanbanPlanService,
  kanbanPlanTimeoutMs: KANBAN_MULTI_AGENT_PLAN_TIMEOUT_MS,
  nowIso,
  sanitizePolicy,
});
const kanbanAssigneePolicy = createKanbanAssigneePolicy({
  workspacePrincipal,
  todoAssigneesForWorkspace,
});
const directKanbanCreateService = createDirectKanbanCreateService({
  formatLocalDateTime,
  resolveTodoAssigneeFromText,
  todoAssigneeLabel,
  stripPrincipalLabelPrefixes,
  escapeRegExp,
  useKanbanTodoBackend,
});

const kanbanCardApiRoutes = createKanbanCardApiRoutes({
  annotateKanbanCardsForAuth: (...args) => kanbanCaseShareService.annotateCardsForAuth(...args),
  authenticateRequest,
  boolParam,
  broadcast,
  clearKanbanCardListCache,
  compactText,
  createKanbanPlanCards,
  detectDirectTodoCreateIntentForWeb,
  extractKanbanSourceDocumentText: (...args) => kanbanReadingWorkflowService.extractKanbanSourceDocumentText(...args),
  findWorkspace,
  kanbanCardProvider,
  kanbanCaseSharesForActor: (...args) => kanbanCaseShareService.sharesForActor(...args),
  kanbanErrorResponse,
  kanbanSingleCardCasePayload,
  normalizeKanbanNotificationAssignee,
  normalizeKanbanMaxParallel,
  normalizeKanbanPlanReasoningEffort,
  planKanbanMultiAgent,
  publicKanbanCardDetail,
  publicTodo,
  readBody,
  readKanbanCardListCache,
  requireWorkspaceAccess,
  resolveKanbanCardAccess,
  resolveKanbanOutputFile,
  saveKanbanSourceDocumentUpload: (...args) => kanbanReadingWorkflowService.saveKanbanSourceDocumentUpload(...args),
  scheduleKanbanDependencyReconcile,
  sendJson,
  sendResolvedFile,
  sendResolvedFilePreview,
  sharedKanbanCardsForAuth: (...args) => kanbanCaseShareService.sharedCardsForAuth(...args),
  sourceDocumentMaxBytes: KANBAN_SOURCE_DOCUMENT_MAX_BYTES,
  todoAssigneeLabel,
  useKanbanTodoBackend,
  verifyDirectTodoCreateResult,
  workspacePrincipal,
  writeKanbanCardListCache,
});
bootTrace("kanban card api routes ready");
const kanbanStudyApiRoutes = createKanbanStudyApiRoutes({
  annotateKanbanCardForAuth: (...args) => kanbanCaseShareService.annotateCardForAuth(...args),
  broadcast,
  clearKanbanCardListCache,
  compactText,
  createKanbanAssessmentPlanCards: (...args) => getKanbanPlanCardCreationService().createKanbanAssessmentPlanCards(...args),
  createKanbanStudyPlanCards: (...args) => getKanbanPlanCardCreationService().createKanbanStudyPlanCards(...args),
  getKanbanAssessmentExam: (...args) => getAssessmentExamWorkflowService().getKanbanAssessmentExam(...args),
  getKanbanReadingQuiz: (...args) => kanbanReadingWorkflowService.getKanbanReadingQuiz(...args),
  kanbanErrorResponse,
  maxUploadBytes: MAX_UPLOAD_BYTES,
  readBody,
  readingCoverMaxBytes: KANBAN_READING_COVER_MAX_BYTES,
  requireWorkspaceAccess,
  resolveKanbanCardAccess,
  sendJson,
  startKanbanAssessmentExam: (...args) => getAssessmentExamWorkflowService().startKanbanAssessmentExam(...args),
  submitKanbanAssessmentExam: (...args) => getAssessmentExamWorkflowService().submitKanbanAssessmentExam(...args),
  submitKanbanReadingQuiz: (...args) => kanbanReadingWorkflowService.submitKanbanReadingQuiz(...args),
  submitKanbanReadingSubmission: (...args) => kanbanReadingWorkflowService.submitKanbanReadingSubmission(...args),
  useKanbanTodoBackend,
});
bootTrace("kanban study api routes ready");

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

const automationApiRoutes = createAutomationApiRoutes({
  automationListSortByLatestDeliverable: webPushDeliveryService.automationListSortByLatestDeliverable,
  automationProvider,
  boolParam,
  clearCronListCache,
  compactText,
  cronJobMatchesOwner,
  cronJobMatchesSearch,
  findWorkspace,
  interpretAutomationNaturalLanguage,
  readBody,
  requireOwner,
  requireWorkspaceAccess,
  resolveAuthorizedCronDeliverableFile,
  resolveAuthorizedCronOutputFile,
  runAutomationWebPushTick: webPushDeliveryService.runAutomationWebPushTick,
  runCronListBridgeCached,
  sanitizePolicy,
  sendJson,
  sendResolvedBridgeFile,
  sendResolvedBridgeFilePreview,
  sendResolvedFile,
  sendResolvedFilePreview,
  workspacePrincipal,
});
bootTrace("automation api routes ready");

const mobileApiDispatcher = createMobileApiDispatcher({
  accessKeyApiRoutes,
  attachClientVersionHeaders,
  authenticateRequest,
  automationApiRoutes,
  buildRequestContext,
  directoryBrowserApiRoutes,
  directoryMutationApiRoutes,
  directoryShareApiRoutes,
  fileArtifactApiRoutes,
  getUrl,
  kanbanCardApiRoutes,
  kanbanStudyApiRoutes,
  ownerElevationApiRoutes,
  publicApiRoutes,
  pushApiRoutes,
  requestClientVersion,
  resourceApiRoutes,
  runtimeConfigApiRoutes,
  sendJson,
  singleWindowGroupChatApiRoutes,
  systemApiRoutes,
  threadMessageRunApiRoutes,
  threadReadUploadApiRoutes,
  threadTaskApiRoutes,
  todoApiRoutes,
  weixinApiRoutes,
  workspaceApiRoutes,
});
bootTrace("core api routes ready");

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

function workerAllowsWorkspace(worker, workspaceId) {
  if (!worker || !workspaceId) return false;
  const allowed = Array.isArray(worker.allowedWorkspaceIds) ? worker.allowedWorkspaceIds : [];
  const skills = Array.isArray(worker.skillWorkspaceIds) ? worker.skillWorkspaceIds : [];
  return allowed.includes("*")
    || allowed.includes(workspaceId)
    || skills.includes("*")
    || skills.includes(workspaceId);
}

const kanbanExecutableProfileCursor = new Map();

function workerProfileId(worker) {
  return String(worker?.profile || worker?.id || worker?.name || "").trim();
}

function kanbanProfileAssignmentCounts(workspace, profiles) {
  const profileSet = new Set((Array.isArray(profiles) ? profiles : []).map(String).filter(Boolean));
  const counts = new Map([...profileSet].map((profile) => [profile, 0]));
  if (!KANBAN_TODO_META_PATH || !profileSet.size) return counts;
  try {
    const parsed = JSON.parse(fs.readFileSync(KANBAN_TODO_META_PATH, "utf8"));
    const todos = parsed?.todos && typeof parsed.todos === "object" ? Object.values(parsed.todos) : [];
    for (const meta of todos) {
      if (String(meta?.workspaceId || meta?.workspace_id || "") !== workspace) continue;
      if (meta?.deletedAt || meta?.deleted_at || meta?.cancelledAt || meta?.cancelled_at || meta?.completedAt || meta?.completed_at) continue;
      const profile = String(meta?.kanbanAssignee || meta?.kanban_assignee || "").trim();
      if (profileSet.has(profile)) counts.set(profile, (counts.get(profile) || 0) + 1);
    }
  } catch (_) {
    // Missing or corrupt metadata should not block Kanban card creation.
  }
  return counts;
}

function nextKanbanExecutableProfile(workspace, workers) {
  const pool = (Array.isArray(workers) ? workers : []).filter((worker) => workerProfileId(worker));
  if (!pool.length) return "";
  const counts = kanbanProfileAssignmentCounts(workspace, pool.map(workerProfileId));
  const lowestCount = Math.min(...pool.map((worker) => counts.get(workerProfileId(worker)) || 0));
  const leastLoaded = pool.filter((worker) => (counts.get(workerProfileId(worker)) || 0) === lowestCount);
  const key = [
    String(workspace || "default").trim() || "default",
    leastLoaded.map(workerProfileId).join(","),
  ].join("|");
  const previous = kanbanExecutableProfileCursor.get(key) || "";
  const previousIndex = leastLoaded.findIndex((worker) => workerProfileId(worker) === previous);
  const nextIndex = (previousIndex + 1) % leastLoaded.length;
  const profile = workerProfileId(leastLoaded[nextIndex]);
  kanbanExecutableProfileCursor.set(key, profile);
  return profile;
}

function kanbanExecutableProfileForWorkspace(workspaceId, principalId, requestedAssignee = "") {
  const workspace = String(workspaceId || principalId || requestedAssignee || "owner").trim() || "owner";
  try {
    const loaded = gatewayPool().load();
    const workers = Array.isArray(loaded?.workers) ? loaded.workers : [];
    const candidates = workers
      .filter((worker) => worker?.profile && worker.securityLevel === "user" && !worker.allowMaintenance)
      .filter((worker) => workerAllowsWorkspace(worker, workspace));
    const explicit = String(requestedAssignee || "").trim();
    const explicitWorker = candidates.find((worker) => workerProfileId(worker) === explicit);
    if (explicitWorker) return workerProfileId(explicitWorker);
    const exactSkill = candidates.filter((worker) => (worker.skillWorkspaceIds || []).includes(workspace));
    const exactAllowed = candidates.filter((worker) => (worker.allowedWorkspaceIds || []).includes(workspace));
    const wildcard = candidates.filter((worker) => (worker.skillWorkspaceIds || []).includes("*") || (worker.allowedWorkspaceIds || []).includes("*"));
    return nextKanbanExecutableProfile(workspace, exactSkill.length ? exactSkill : (exactAllowed.length ? exactAllowed : (wildcard.length ? wildcard : candidates)));
  } catch (_) {
    return "";
  }
}

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

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function normalizeKanbanNotificationAssignee(workspaceId, ...candidates) {
  return kanbanAssigneePolicy.normalizeNotificationAssignee(workspaceId, ...candidates);
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

function parseTodoDueFromText(text, now = new Date()) {
  const raw = String(text || "");
  const iso = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T]*(\d{1,2})(?::|：)?(\d{1,2})?/);
  if (iso) {
    const date = new Date(now);
    date.setFullYear(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    date.setHours(Number(iso[4]), Number(iso[5] || 0), 0, 0);
    return { dueTime: formatLocalDateTime(date), raw: iso[0] };
  }
  const match = raw.match(/(今天|明天|后天)?\s*(今晚|明早|凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2})\s*(?:点|:|：)\s*(半|\d{1,2}\s*分?)?/);
  if (!match) return null;
  const date = new Date(now);
  const dateWord = match[1] || "";
  const timeWord = match[2] || "";
  let dayOffset = dateWord === "后天" ? 2 : dateWord === "明天" || timeWord === "明早" ? 1 : 0;
  date.setDate(date.getDate() + dayOffset);
  let hour = Number(match[3]);
  let minute = 0;
  const minuteRaw = String(match[4] || "").trim();
  if (minuteRaw === "半") minute = 30;
  else if (minuteRaw) minute = Number((minuteRaw.match(/\d{1,2}/) || ["0"])[0]);
  if ((timeWord === "下午" || timeWord === "晚上" || timeWord === "今晚") && hour < 12) hour += 12;
  if (timeWord === "中午" && hour < 11) hour += 12;
  date.setHours(hour, minute, 0, 0);
  return { dueTime: formatLocalDateTime(date), raw: match[0] };
}

function detectDirectTodoCreateIntent(text, workspaceId) {
  const rawText = String(text || "").trim();
  if (!rawText || !/(待办|看板|卡片|kanban|todo|to-do)/i.test(rawText)) return null;
  if (!/(新增|新建|创建|开启|添加|加|安排|提醒)/.test(rawText)) return null;
  const due = parseTodoDueFromText(rawText);
  if (!due?.dueTime) return null;
  const assignee = resolveTodoAssigneeFromText(rawText, workspaceId);
  const assigneeLabel = todoAssigneeLabel(workspaceId, assignee);
  let content = rawText;
  for (const token of [assigneeLabel, assignee, stripPrincipalLabelPrefixes(assignee)].filter(Boolean)) {
    content = content.replace(new RegExp(`(?:给|为|帮)?\\s*${escapeRegExp(token)}`, "g"), " ");
  }
  content = content
    .replace(due.raw, " ")
    .replace(/(?:请|帮我|给我|我想|我要|需要)?\s*(?:新增|新建|创建|开启|添加|加|安排|提醒)\s*(?:一个|一条|一张)?\s*(?:待办(?:事项)?|看板(?:卡片)?|卡片|kanban|todo|to-do)/ig, " ")
    .replace(/(?:待办(?:事项)?|看板(?:卡片)?|卡片|kanban|todo|to-do)/ig, " ")
    .replace(/[，,。；;：:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!content) return null;
  return { assignee, assigneeLabel, dueTime: due.dueTime, content };
}

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

function kanbanOutputAccessThread(workspaceId) {
  const workspace = String(workspaceId || "owner").trim() || "owner";
  return {
    id: `kanban-output-${workspace}`,
    workspaceId: workspace,
    projectId: "general",
    subprojectId: "",
    singleWindow: false,
  };
}

function kanbanOutputCaseIdFromPath(workspaceId, rawPath) {
  const localPath = normalizeLocalPath(rawPath);
  if (!localPath) return "";
  const root = path.resolve(KANBAN_READING_ARTIFACT_ROOT, safeStorageSegment(workspaceId || "owner"));
  const relative = path.relative(root, localPath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return relative.split(/[\\/]+/)[0] || "";
  const share = kanbanCaseShareService.shareForCaseDirectoryPath(workspaceId, localPath);
  return String(share?.caseId || share?.case_id || "").trim();
}

function authCanAccessKanbanOutput(auth, workspaceId, rawPath) {
  const workspace = String(workspaceId || "owner").trim() || "owner";
  if (authCanAccessWorkspace(auth, workspace)) return true;
  const caseId = kanbanOutputCaseIdFromPath(workspace, rawPath);
  if (!caseId) return false;
  return Boolean(kanbanCaseShareService.roleForAuth(auth, workspace, caseId));
}

function resolveKanbanOutputFile(workspaceId, rawPath, auth = null) {
  const workspace = String(workspaceId || "owner").trim() || "owner";
  if (auth && !authCanAccessKanbanOutput(auth, workspace, rawPath)) return { status: 404, error: "File not found" };
  const displayPath = String(rawPath || "").trim();
  const localPath = normalizeLocalPath(displayPath);
  if (!displayPath || !localPath) return { status: 404, error: "File not found" };
  const thread = kanbanOutputAccessThread(workspace);
  const allowedByCaseDirectory = Boolean(kanbanCaseShareService.shareForCaseDirectoryPath(workspace, localPath));
  if (!allowedByCaseDirectory && !isPathAllowedForThread(thread, localPath, displayPath)) return { status: 404, error: "File not found or not allowed" };
  let stat;
  try {
    stat = fs.statSync(localPath);
  } catch (_) {
    return { status: 404, error: "File not found" };
  }
  if (!stat.isFile()) return { status: 400, error: "Path is not a file" };
  return {
    file: {
      localPath,
      displayPath: workspaceDisplayPathService.logicalUserPathFallback(displayPath, path.basename(localPath)),
      name: path.basename(localPath),
      mime: mimeFor(localPath),
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
    },
  };
}

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

function mimeFor(file) {
  return MIME_BY_EXT[path.extname(file).toLowerCase()] || "application/octet-stream";
}

function contentDisposition(disposition, filename) {
  const safeDisposition = disposition === "attachment" ? "attachment" : "inline";
  const safeAscii = String(filename || "file")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_")
    .slice(0, 160) || "file";
  return `${safeDisposition}; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(filename || "file")}`;
}

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

function serveStatic(req, res) {
  const url = getUrl(req);
  const pathname = url.pathname === "/hermes-mobile" ? "/hermes-mobile/" : url.pathname;
  const rel = decodeURIComponent((pathname === "/" || pathname === "/hermes-mobile/") ? "/index.html" : pathname);
  const target = path.normalize(path.join(PUBLIC_ROOT, rel));
  if (!target.startsWith(PUBLIC_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(target, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": mimeFor(target),
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
}

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

function getSharedDirectoryProjectionService() {
  if (!sharedDirectoryProjectionService) {
    sharedDirectoryProjectionService = createSharedDirectoryProjectionService({
      sharedDirectoryProvider,
      assertRootNotProtected: (root, message) => securityBoundaryProvider.assertRootNotProtected(root, message),
      cachedDynamicProjectsForWorkspace,
      comparablePath,
      dedupeProjects,
      isShareableRootProject,
      loadCatalog,
      remoteWorkspaceDirectoryProjects,
      setDynamicProjectsForWorkspace,
    });
  }
  return sharedDirectoryProjectionService;
}

function sharedDirectoryLabel(rawPath) {
  return getSharedDirectoryProjectionService().sharedDirectoryLabel(rawPath);
}

function normalizeSharePermission(value) {
  return getSharedDirectoryProjectionService().normalizeSharePermission(value);
}

function normalizeShareTargets(value) {
  return getSharedDirectoryProjectionService().normalizeShareTargets(value);
}

function normalizeShareScope(value, targets) {
  return getSharedDirectoryProjectionService().normalizeShareScope(value, targets);
}

function sharedDirectoryRoots(workspaceId = "") {
  return getSharedDirectoryProjectionService().roots(workspaceId, workspaceId);
}

function publicSharedDirectory(record, workspaceId = "owner") {
  return getSharedDirectoryProjectionService().publicSharedDirectory(record, workspaceId);
}

function removeSharedDirectoryRecord(identifier, workspaceId = "owner") {
  return getSharedDirectoryProjectionService().removeSharedDirectoryRecord(identifier, workspaceId);
}

function sharedDirectoriesForWorkspace(workspaceId = "owner") {
  return sharedDirectoryProvider.directoriesForWorkspace(workspaceId);
}

function updateSharedDirectoryAccess(identifier, workspaceId = "owner", updates = {}) {
  return getSharedDirectoryProjectionService().updateSharedDirectoryAccess(identifier, workspaceId, updates);
}

function upsertSharedDirectory(record) {
  return getSharedDirectoryProjectionService().upsertSharedDirectory(record);
}

function sanitizePolicy(policy, hardeningOptions = {}) {
  return securityBoundaryProvider.hardenAccessPolicy(accessPolicyProvider.sanitize(policy), hardeningOptions);
}

function dedupe(values) {
  return [...new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function getWorkspaceProjectProvider() {
  if (!workspaceProjectProvider) {
    workspaceProjectProvider = createWorkspaceProjectProvider({
      readJsonFirst,
      usersPaths: WORKSPACE_USERS_PATHS,
      routeMapPaths: WORKSPACE_ROUTE_MAP_PATHS,
      projectMapPaths: PROJECT_MAP_PATHS,
      repoRoot: REPO_ROOT,
      defaultOwnerWorkspace: () => OWNER_DEFAULT_WORKSPACE,
      ownerLabel: () => OWNER_LABEL,
      normalizeStringList,
      buildAccessPolicy,
      projectsForWorkspace,
      localWorkspaces: localWorkspaceRecords,
      ownerAliases: () => process.env.HERMES_WEB_OWNER_ALIASES || "owner",
      fallbackOwnerPolicy: () => sanitizePolicy({
        principal_id: "owner",
        principal_label: OWNER_LABEL,
        access_mode: "unrestricted",
        default_workspace: OWNER_DEFAULT_WORKSPACE,
        source_platform: "web",
        reason: "hermes_web_fallback_owner",
      }),
    });
  }
  return workspaceProjectProvider;
}

function invalidateCatalogCache() {
  if (workspaceProjectProvider) workspaceProjectProvider.invalidate();
}

function loadCatalog() {
  bootTrace("loadCatalog enter");
  const catalog = getWorkspaceProjectProvider().loadCatalog();
  bootTrace(`loadCatalog done workspaces=${catalog.workspaces.length} projects=${catalog.projects.length}`);
  return catalog;
}

function mergeDefaultExternalAccessPolicy(policy) {
  const source = policy && typeof policy === "object" ? policy : {};
  const additions = workspaceBindingsProvider.accessPolicyAdditions(source);
  return Object.assign({}, source, {
    allowed_toolsets: dedupe([
      ...(source.allowed_toolsets || []),
      ...(additions.allowed_toolsets || []),
    ]),
    connector_profiles: Object.assign(
      {},
      source.connector_profiles || {},
      additions.connector_profiles || {},
    ),
  });
}

function mergeAccessPolicyOverride(basePolicy, overridePolicy) {
  const base = basePolicy && typeof basePolicy === "object" ? basePolicy : {};
  const override = overridePolicy && typeof overridePolicy === "object" ? overridePolicy : {};
  const merged = Object.assign({}, base, override);
  merged.allowed_toolsets = dedupe([
    ...(base.allowed_toolsets || []),
    ...(override.allowed_toolsets || []),
  ]);
  merged.connector_profiles = Object.assign(
    {},
    base.connector_profiles || {},
    override.connector_profiles || {},
  );
  return merged;
}

function buildAccessPolicy(route, user, project, hardeningOptions = {}) {
  const policy = mergeDefaultExternalAccessPolicy(accessPolicyProvider.build(route, user, project));
  return securityBoundaryProvider.hardenAccessPolicy(policy, hardeningOptions);
}

function sharedDirectoryProjectsForWorkspace(workspaceId, workspaces = null) {
  return getSharedDirectoryProjectionService().sharedDirectoryProjectsForWorkspace(workspaceId, workspaces);
}

function projectsForWorkspace(workspace, projectEntries, workspaces = null) {
  return projectDiscoveryProvider.projectsForWorkspace(workspace, projectEntries, workspaces);
}

function cachedDynamicProjectsForWorkspace(workspaceId) {
  const cached = dynamicProjectCache.get(String(workspaceId || ""));
  if (!cached || Date.now() > cached.expiresAt) {
    dynamicProjectCache.delete(String(workspaceId || ""));
    return [];
  }
  return cached.projects || [];
}

function setDynamicProjectsForWorkspace(workspaceId, projects) {
  dynamicProjectCache.set(String(workspaceId || ""), {
    expiresAt: Date.now() + 30_000,
    projects: dedupeProjects(projects || []),
  });
}

function allProjectsForWorkspaceSync(workspaceId) {
  return getSharedDirectoryProjectionService().allProjectsForWorkspaceSync(workspaceId);
}

async function publicProjectsForWorkspace(workspaceId) {
  return getSharedDirectoryProjectionService().publicProjectsForWorkspace(workspaceId);
}

function isShareableRootProject(project) {
  return projectDiscoveryProvider.isShareableRootProject(project);
}

async function shareableRootProjectForPath(workspaceId, displayPath) {
  return getSharedDirectoryProjectionService().shareableRootProjectForPath(workspaceId, displayPath);
}

async function remoteWorkspaceDirectoryProjects(workspace) {
  return projectDiscoveryProvider.remoteWorkspaceDirectoryProjects(workspace);
}

function dedupeProjects(projects) {
  return projectDiscoveryProvider.dedupeProjects(projects);
}

function hashId(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex").slice(0, 10);
}

function findWorkspace(id) {
  return loadCatalog().workspaces.find((item) => item.id === id) || null;
}

function findProject(workspaceId, projectId) {
  return allProjectsForWorkspaceSync(workspaceId).find((item) => item.workspaceId === workspaceId && item.id === projectId) || null;
}

function findSubproject(project, subprojectId) {
  if (!project || !subprojectId) return null;
  return (project.children || []).find((item) => item.id === subprojectId) || null;
}

function effectiveProjectForThread(thread) {
  const project = findProject(thread.workspaceId, thread.projectId);
  const subproject = findSubproject(project, thread.subprojectId);
  if (!subproject) return project;
  return Object.assign({}, subproject, {
    workspaceId: project.workspaceId,
    parentProjectId: project.id,
    parentLabel: project.label,
  });
}

function policyForThread(thread) {
  const workspace = findWorkspace(thread.workspaceId);
  const project = effectiveProjectForThread(thread);
  return buildAccessPolicy(workspace?.policy || workspace || {}, {}, project);
}

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

function readFirstConfiguredSecret(paths) {
  for (const candidate of paths || []) {
    const filePath = String(candidate || "").trim();
    if (!filePath) continue;
    try {
      if (!fs.existsSync(filePath)) continue;
      const text = fs.readFileSync(filePath, "utf8").trim();
      if (text) return text.split(/\r?\n/)[0].trim();
    } catch (_) {}
  }
  return "";
}

function configuredWeixinIngressKey() {
  return String(
    process.env.HERMES_MOBILE_WEIXIN_INGRESS_KEY
      || process.env.HERMES_WEB_WEIXIN_INGRESS_KEY
      || readFirstConfiguredSecret(WEIXIN_INGRESS_KEY_PATHS)
      || "",
  ).trim();
}

function requestIngressKey(req) {
  const auth = String(req.headers.authorization || "").trim();
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  return String(
    req.headers["x-hermes-mobile-ingress-key"]
      || req.headers["x-hermes-web-ingress-key"]
      || (bearer ? bearer[1] : "")
      || "",
  ).trim();
}

function constantTimeStringEqual(a, b) {
  const left = Buffer.from(hashValue(a), "hex");
  const right = Buffer.from(hashValue(b), "hex");
  return crypto.timingSafeEqual(left, right);
}

function authenticateWeixinIngressRequest(req) {
  const configured = configuredWeixinIngressKey();
  if (!configured) return { ok: false, status: 503, error: "Weixin ingress key is not configured" };
  const provided = requestIngressKey(req);
  if (!provided || !constantTimeStringEqual(provided, configured)) {
    return { ok: false, status: 401, error: "Invalid Weixin ingress key" };
  }
  return { ok: true };
}

function requireWeixinIngress(req, res) {
  const auth = authenticateWeixinIngressRequest(req);
  if (!auth.ok) {
    sendJson(res, auth.status || 401, { ok: false, error: auth.error || "Unauthorized" });
    return null;
  }
  return auth;
}

function getWeixinIngressEventService() {
  if (!weixinIngressEventService) {
    weixinIngressEventService = createWeixinIngressEventService({
      weixinIngressProvider,
      findWorkspace,
      findExistingIngressEvent: (...args) => getRuntimeStateThreadService().findExistingWeixinIngressEvent(...args),
      wakeOutboundForInbound: wakeWeixinOutboundDeliveriesForInboundEvent,
      classifyMaintenanceIntent: (text) => securityBoundaryProvider.classifyMaintenanceIntent(text),
      ensureThreadForEvent: weixinIngressThreadForEvent,
      taskGroupId: SINGLE_WINDOW_CHAT_TASK_GROUP_ID,
      nowIso,
      makeId,
      senderInfoForWorkspace,
      normalizeExternalIngress: (...args) => getRuntimeStateNormalizationService().normalizeExternalIngress(...args),
      normalizeExternalDelivery: (...args) => getRuntimeStateNormalizationService().normalizeExternalDelivery(...args),
      deliveryMatchesInboundEvent: weixinDeliveryMatchesInboundEvent,
      attachmentContextWindowMs: WEIXIN_INGRESS_ATTACHMENT_CONTEXT_WINDOW_MS,
      taskGroupHasRunningRun,
      runConcurrencyError,
      saveState,
      broadcast,
      threadSummary,
      compactThread,
      compactMessage,
      startRunForThread,
      userFacingRunError: userFacingWeixinRunError,
      enqueueTerminalDelivery: enqueueExternalDeliveryForTerminalMessage,
      removeThreadActiveRun,
    });
  }
  return weixinIngressEventService;
}

function weixinIngressIsAttachmentOnlyEvent(event) {
  return !String(event?.text || "").trim() && Array.isArray(event?.attachments) && event.attachments.length > 0;
}

function consumeWeixinPendingAttachmentMessages(thread, event, consumedAt = nowIso()) {
  return getWeixinIngressEventService().consumePendingAttachmentMessages(thread, event, consumedAt);
}

function weixinIngressInstructions(event, pendingAttachmentMessages = []) {
  return getWeixinIngressEventService().instructionsForWeixinIngress(event, pendingAttachmentMessages);
}

function weixinIngressThreadForEvent(event, workspaceId) {
  return getSingleWindowThreadService().ensureWeixinSingleWindowThread(workspaceId, event);
}

function getWeixinOutboundDeliveryService() {
  if (!weixinOutboundDeliveryService) {
    weixinOutboundDeliveryService = createWeixinOutboundDeliveryService({
      state: () => state,
      nowIso,
      normalizeExternalDelivery: (...args) => getRuntimeStateNormalizationService().normalizeExternalDelivery(...args),
      deliveryId: (threadId, messageId) => weixinIngressProvider.deliveryId(threadId, messageId),
      compactText,
      maxMessageChars: MAX_MESSAGE_CHARS,
      retryLimit: WEIXIN_DELIVERY_RETRY_LIMIT,
      retryBaseMs: WEIXIN_DELIVERY_RETRY_BASE_MS,
      retryMaxMs: WEIXIN_DELIVERY_RETRY_MAX_MS,
      egressDecide: (payload) => egressPolicyProvider.decide(payload),
      isStaleHttpToolAvailabilityClaim,
      isStaleImageToolAvailabilityClaim,
      saveState,
      broadcast,
      threadSummary,
      compactMessage,
    });
  }
  return weixinOutboundDeliveryService;
}

function enqueueExternalDeliveryForTerminalMessage(thread, message, terminalStatus) {
  return getWeixinOutboundDeliveryService().enqueueForTerminalMessage(thread, message, terminalStatus);
}

function publicWeixinOutboundDelivery(thread, message) {
  return getWeixinOutboundDeliveryService().publicDelivery(thread, message);
}

function weixinTargetFromWorkspace(workspace) {
  return weixinForwardService.targetFromWorkspace(workspace);
}

function collectRecentWeixinForwardTargets(workspaceId, auth) {
  return weixinForwardService.collectRecentTargets(workspaceId, auth);
}

function weixinForwardTargetsForWorkspace(workspaceId, auth) {
  return weixinForwardService.targetsForWorkspace(workspaceId, auth);
}

function resolveWeixinForwardTarget(body, auth, workspaceId) {
  return weixinForwardService.resolveTarget(body, auth, workspaceId);
}

function fileResultFromBridgeFileForForward(file, workspaceId) {
  const buffer = bridgeFileBuffer(file);
  if (!buffer.length) return { status: 404, error: "File not found" };
  const safeName = safeFileName(file?.name || path.basename(file?.displayPath || "") || "file");
  const dir = path.join(DATA_DIR, "artifacts", "weixin-forward", safeFileName(workspaceId || "owner"));
  fs.mkdirSync(dir, { recursive: true });
  const localPath = path.join(dir, `${Date.now()}-${makeId("file")}-${safeName}`);
  fs.writeFileSync(localPath, buffer);
  return {
    file: {
      localPath,
      displayPath: file?.displayPath || localPath,
      name: safeName,
      mime: file?.mime || mimeFor(safeName),
      size: buffer.length,
      updatedAt: nowIso(),
    },
  };
}

function materializeWeixinForwardFile(file, workspaceId) {
  return weixinMarkdownForwardService.materializeWeixinForwardFile(file, workspaceId, {
    dataDir: DATA_DIR,
    makeId,
    maxBytes: WEIXIN_FORWARD_MARKDOWN_MAX_BYTES,
    mimeFor,
    normalizeLocalPath,
    nowIso,
    safeFileName,
    spawnSync,
  });
}

async function resolveFileFromSourceUrlForRequest(sourceUrl, auth) {
  return weixinFileForwardService.resolveFileFromSourceUrlForRequest(sourceUrl, auth);
}

async function resolveWeixinForwardFile(body, auth) {
  return weixinFileForwardService.resolveWeixinForwardFile(body, auth);
}

function publicArtifactForWeixinForward(file, thread, message) {
  return weixinFileForwardService.publicArtifactForWeixinForward(file, thread, message);
}

async function createWeixinFileForwardDelivery(auth, body = {}) {
  return weixinFileForwardService.createWeixinFileForwardDelivery(auth, body);
}

function redactWeixinRunErrorText(value) {
  let text = String(value || "");
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]");
  text = text.replace(/\b(?:sk|sess|eyJ)[A-Za-z0-9._~+/=-]{16,}/g, "[redacted-token]");
  text = text.replace(/\b(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|secret|password|cookie|credential)\s*[:=]\s*([^\s,;]+)/gi, "$1=[redacted]");
  text = text.replace(/(?:[A-Za-z]:\\|\/)[^\s"'<>]*(?:secret|token|auth|credential)[^\s"'<>]*/gi, "[redacted-path]");
  return text;
}

function userFacingWeixinRunError(err) {
  const raw = redactWeixinRunErrorText(err?.message || err).trim();
  if (!raw) return "Hermes run failed before producing a reply.";
  if (/terminated|cancelled|canceled|aborted/i.test(raw)) {
    return "运行被终止，未生成回复。";
  }
  return raw;
}

function weixinDeliveryRetryCount(delivery) {
  return getWeixinOutboundDeliveryService().deliveryRetryCount(delivery);
}

function weixinDeliveryRetryDelayMs(retryCount) {
  return getWeixinOutboundDeliveryService().deliveryRetryDelayMs(retryCount);
}

function isWeixinInboundWakeRequiredFailure(ack = {}) {
  return getWeixinOutboundDeliveryService().isInboundWakeRequiredFailure(ack);
}

function isWeixinDeliveryRetryable(delivery, nowMs = Date.now()) {
  return getWeixinOutboundDeliveryService().isDeliveryRetryable(delivery, nowMs);
}

function weixinDeliveryMatchesInboundEvent(delivery, event, workspaceId) {
  return getWeixinOutboundDeliveryService().deliveryMatchesInboundEvent(delivery, event, workspaceId);
}

function wakeWeixinOutboundDeliveriesForInboundEvent(event, workspaceId) {
  return getWeixinOutboundDeliveryService().wakeForInboundEvent(event, workspaceId);
}

function pendingWeixinOutboundDeliveries(filters = {}) {
  return getWeixinOutboundDeliveryService().pendingDeliveries(filters);
}

function ackWeixinOutboundDelivery(deliveryId, ack) {
  return getWeixinOutboundDeliveryService().ackDelivery(deliveryId, ack);
}

async function startWeixinIngressEvent(body) {
  return getWeixinIngressEventService().start(body);
}

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

function getGatewayRunStartService() {
  if (!gatewayRunStartService) {
    gatewayRunStartService = createGatewayRunStartService({
      accessPolicyHardeningOptionsForGatewayRouting,
      addThreadActiveRun,
      assertRunConcurrencyCapacity,
      buildAccessPolicy,
      buildConversationHistory,
      buildHermesInstructions,
      chooseGatewayRunTarget,
      compactMessage,
      dedupe,
      effectiveProjectForThread,
      findWorkspace,
      gatewayConversationId,
      gatewaySkillRoutingForWorkspace,
      groupChatDeliveryRootForThread,
      groupChatTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
      makePublicTaskId,
      mergeAccessPolicyOverride,
      mkdirSync: (targetPath, options) => fs.mkdirSync(targetPath, options),
      nowIso,
      projectForTaskDirectoryAttachment: (...args) => getSemanticDirectoryAttachmentService().projectForTaskDirectoryAttachment(...args),
      removeThreadActiveRun,
      sanitizePolicy,
      saveState,
      singleWindowProjectId: SINGLE_WINDOW_PROJECT_ID,
      streamResponse,
      taskDirectoryAttachmentForMessage: (...args) => getSemanticDirectoryAttachmentService().taskDirectoryAttachmentForMessage(...args),
      threadSummary,
      toolSchemaEpoch: GATEWAY_TOOL_SCHEMA_EPOCH,
      windowsPathToWsl,
      ensureGroupChatSharedArtifactCopies,
      broadcast,
    });
  }
  return gatewayRunStartService;
}

async function startRunForThread(thread, userMessage, assistantMessage, options = {}) {
  return getGatewayRunStartService().startRunForThread(thread, userMessage, assistantMessage, options);
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

async function stopRunIds(runIds) {
  return getGatewayRunStreamService().stopRunIds(runIds);
}

function gatewayUrlForRun(runId) {
  return getGatewayRunStreamService().gatewayUrlForRun(runId);
}

function getGatewayRunStreamService() {
  if (!gatewayRunStreamService) {
    gatewayRunStreamService = createGatewayRunStreamService({
      activeStreams,
      apiTimeoutMs: HERMES_API_TIMEOUT_MS,
      dedupe,
      gatewayPool,
      gatewayUrlForRun: (...args) => getRuntimeStateThreadService().storedGatewayUrlForRun(...args),
      livenessDecisionAfterCheck: gatewayRunLifecycleService.livenessDecisionAfterCheck,
      logger: console,
      markRunCancelled,
      markRunFailed,
      nowMs: () => Date.now(),
      onHermesRunEvent: applyHermesRunEvent,
      runLivenessCheckAfterMs: RUN_LIVENESS_CHECK_AFTER_MS,
      runLivenessCheckIntervalMs: RUN_LIVENESS_CHECK_INTERVAL_MS,
      runLivenessStaleAfterMs: RUN_LIVENESS_STALE_AFTER_MS,
      runStartTimeoutMs: RUN_START_TIMEOUT_MS,
      singleGatewayRunner,
    });
  }
  return gatewayRunStreamService;
}

function abortActiveStreamAsFailed(publicRunId, reason) {
  return getGatewayRunStreamService().abortActiveStreamAsFailed(publicRunId, reason);
}

async function checkActiveStreamLiveness(publicRunId) {
  return getGatewayRunStreamService().checkActiveStreamLiveness(publicRunId);
}

function streamResponse(runId, threadId, messageId, body, options = {}) {
  return getGatewayRunStreamService().streamResponse(runId, threadId, messageId, body, options);
}

async function readResponseEvents(runId, body, signal) {
  return getGatewayRunStreamService().readResponseEvents(runId, body, signal);
}

function getGatewayRunEventService() {
  if (!gatewayRunEventService) {
    gatewayRunEventService = createGatewayRunEventService({
      activeStreams,
      addThreadEvent,
      appendBounded,
      broadcast,
      compactFullContent,
      compactMessage,
      enqueueExternalDeliveryForTerminalMessage,
      isOrdinaryToolSchemaElevationRequest,
      maxMessageChars: MAX_MESSAGE_CHARS,
      modelPermissionApprovalRequest,
      nowIso,
      nowMs: () => Date.now(),
      notifyTaskTerminal: (...args) => webPushDeliveryService.notifyTaskTerminal(...args),
      registerArtifactsFromText,
      removeThreadActiveRun,
      replaceThreadActiveRun,
      saveState,
      scheduleNextQueuedRunForTaskGroup,
      state: () => state,
      stripPermissionApprovalMarkers,
      supplementGatewayUsage,
      threadSummary,
    });
  }
  return gatewayRunEventService;
}

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
  return getGatewayRunEventService().findRunTarget(runId);
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

function applyHermesRunEvent(event) {
  return getGatewayRunEventService().applyHermesRunEvent(event);
}

function extractCompletedOutput(event) {
  return getGatewayRunEventService().extractCompletedOutput(event);
}

function markRunFailed(threadId, messageId, runId, err) {
  return getGatewayRunEventService().markRunFailed(threadId, messageId, runId, err);
}

function markRunCancelled(threadId, messageId, runId) {
  return getGatewayRunEventService().markRunCancelled(threadId, messageId, runId);
}

function reconcileDetachedActiveRuns(reason = "Hermes Mobile restarted while this task was running; the result stream is no longer attached. Please rerun the task.") {
  return getGatewayRunEventService().reconcileDetachedActiveRuns(reason);
}

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

function getThreadOwnerElevationRetryService() {
  if (!threadOwnerElevationRetryService) {
    threadOwnerElevationRetryService = createThreadOwnerElevationRetryService({
      broadcast,
      compactMessage,
      compactThread,
      gatewayRoutingForModelRun,
      isOwnerAuth,
      makeId,
      nowIso,
      ownerElevationInstructions,
      precedingUserMessageForAssistant,
      removeThreadActiveRun,
      runConcurrencyError,
      runConcurrencySnapshot,
      sanitizeElevationScope,
      saveState,
      startRunForThread,
      threadSummary,
    });
  }
  return threadOwnerElevationRetryService;
}

function getThreadMessageCreateService() {
  if (!threadMessageCreateService) {
    threadMessageCreateService = createThreadMessageCreateService({
      authCanAccessWorkspace,
      broadcast,
      buildUserMessageContent: (...args) => getRuntimeStateThreadService().buildUserMessageContent(...args),
      chatGroupMemberWorkspaceIds,
      compactMessage,
      deriveTitle,
      detectDirectKanbanCreateRequest,
      detectDirectTodoCreateIntent,
      detectDirectTodoCreateIntentForWeb,
      directTodoCreateEnabled,
      formatDirectTodoCreateSuccessMessage,
      gatewayRoutingForModelRun,
      groupChatTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
      isKanbanCaseTopicThread: (...args) => getSingleWindowThreadService().isKanbanCaseTopicThread(...args),
      isOwnerAuth,
      kanbanCaseTopicPermissionsForTaskGroup,
      kanbanSingleCardCasePayload,
      makeId,
      normalizeTaskGroupMeta: (...args) => getRuntimeStateNormalizationService().normalizeTaskGroupMeta(...args),
      notifyGroupChatMentions: webPushDeliveryService.notifyGroupChatMentions,
      notifyTodoCreated: webPushDeliveryService.notifyTodoCreated,
      nowIso,
      ownerElevationInstructions,
      publicArtifactFromClient,
      removeThreadActiveRun,
      resolveTaskDirectoryAttachment: (...args) => getSemanticDirectoryAttachmentService().resolveTaskDirectoryAttachment(...args),
      runConcurrencyError,
      runConcurrencySnapshot,
      sanitizeTaskGroupId: (...args) => getRuntimeStateNormalizationService().sanitizeTaskGroupId(...args),
      saveState,
      semanticTaskDirectoryAttachment: (...args) => getSemanticDirectoryAttachmentService().semanticTaskDirectoryAttachment(...args),
      senderInfoForWorkspace,
      singleWindowChatTaskGroupId,
      startRunForThread,
      taskDirectoryAttachmentForGroup: (...args) => getSemanticDirectoryAttachmentService().taskDirectoryAttachmentForGroup(...args),
      taskGroupHasRunningRun,
      threadSummary,
      todoAssigneeLabel,
      useKanbanTodoBackend,
      validReasoningEfforts: VALID_REASONING_EFFORTS,
      workspaceIdForPrincipal,
      workspacePrincipal,
    });
  }
  return threadMessageCreateService;
}

function getThreadDirectCreateExecutionService() {
  if (!threadDirectCreateExecutionService) {
    threadDirectCreateExecutionService = createThreadDirectCreateExecutionService({
      broadcast,
      compactMessage,
      findWorkspace,
      formatDirectTodoCreateSuccessMessage,
      interpretKanbanNaturalLanguage,
      kanbanCardProvider,
      publicTodo,
      saveState,
      threadMessageCreateService: getThreadMessageCreateService(),
      threadSummary,
      todoAssigneeLabel,
      todoProvider,
      verifyDirectTodoCreateResult,
      workspacePrincipal,
      compactResponseThread: (...args) => getThreadMessageRunRouteService().compactThreadForMessageCreatePlan(...args),
      nowIso,
    });
  }
  return threadDirectCreateExecutionService;
}

function getThreadMessageRunRouteService() {
  if (!threadMessageRunRouteService) {
    threadMessageRunRouteService = createThreadMessageRunRouteService({
      attachUploadedArtifactsToMessage,
      authenticateRequest,
      compactThread,
      compactThreadWithMessagePage,
      findThreadForRequest: (...args) => getRuntimeStateThreadService().findThreadForRequest(...args),
      getThreadDirectCreateExecutionService,
      getThreadMessageCreateService,
      getThreadOwnerElevationRetryService,
      nowIso,
      readBody,
      requireOwner,
      sendJson,
      threadMessageInitialLimit: THREAD_MESSAGE_INITIAL_LIMIT,
    });
  }
  return threadMessageRunRouteService;
}

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
