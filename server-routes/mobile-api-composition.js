"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createAccessKeyApiRoutes } = require("./access-key-api-routes");
const { createActionInboxApiRoutes } = require("./action-inbox-api-routes");
const { createAutomationApiRoutes } = require("./automation-api-routes");
const { createDirectoryBrowserApiRoutes } = require("./directory-browser-api-routes");
const { createDirectoryMutationApiRoutes } = require("./directory-mutation-api-routes");
const { createDirectoryShareApiRoutes } = require("./directory-share-api-routes");
const { createEventStreamApiRoutes } = require("./event-stream-api-routes");
const { createFileArtifactApiRoutes } = require("./file-artifact-api-routes");
const { createHermesPluginApiRoutes } = require("./hermes-plugin-api-routes");
const { createKanbanCardApiRoutes } = require("./kanban-card-api-routes");
const { createKanbanLearningGuidanceApiRoutes } = require("./kanban-learning-guidance-api-routes");
const { createKanbanStudyApiRoutes } = require("./kanban-study-api-routes");
const { createLearningApiRoutes } = require("./learning-api-routes");
const { createLearningCoinApiRoutes } = require("./learning-coin-api-routes");
const { createLearningGrowthCardApiRoutes } = require("./learning-growth-card-api-routes");
const { createLearningParentReviewApiRoutes } = require("./learning-parent-review-api-routes");
const { createLearningProgramApiRoutes } = require("./learning-program-api-routes");
const { createLearningGrowthService } = require("../adapters/learning-growth-service");
const { createLearningGrowthLegacyTodoTaskService } = require("../adapters/learning-growth-legacy-todo-task-service");
const { createLearningGrowthDirectoryMaterializationService } = require("../adapters/learning-growth-directory-materialization-service");
const { createLearningGrowthKanbanTaskService } = require("../adapters/learning-growth-kanban-task-service");
const { createLearningGrowthJitTaskService } = require("../adapters/learning-growth-jit-task-service");
const { createLearningGrowthJitDecisionReportService } = require("../adapters/learning-growth-jit-decision-report-service");
const { createLearningGrowthMasteryProfileService } = require("../adapters/learning-growth-mastery-profile-service");
const { createLearningGrowthSequenceService } = require("../adapters/learning-growth-sequence-service");
const { createLearningGrowthTaskEvaluationService } = require("../adapters/learning-growth-task-evaluation-service");
const { createLearningGrowthTaskFeedbackService } = require("../adapters/learning-growth-task-feedback-service");
const { createLearningGrowthReflectionService } = require("../adapters/learning-growth-reflection-service");
const { createLearningGrowthExperienceSignalService } = require("../adapters/learning-growth-experience-signal-service");
const { createLearningGrowthStageAssessmentService } = require("../adapters/learning-growth-stage-assessment-service");
const { createLearningGrowthTeachingCheckService } = require("../adapters/learning-growth-teaching-check-service");
const { createLearningGrowthSubmissionService } = require("../adapters/learning-growth-submission-service");
const { createLearningParentReviewRequestService } = require("../adapters/learning-parent-review-request-service");
const { createLearningProgramPublishService } = require("../adapters/learning-program-publish-service");
const { createLearningProgramRepository } = require("../adapters/learning-program-repository");
const { createLearningProgramService } = require("../adapters/learning-program-service");
const { createActionInboxService } = require("../adapters/action-inbox-service");
const { createKanbanCaseTopicDeliveryService } = require("../adapters/kanban-case-topic-delivery-service");
const { createMobileApiDispatcher } = require("./mobile-api-dispatcher");
const { createOwnerElevationApiRoutes } = require("./owner-elevation-api-routes");
const { createPublicApiRoutes } = require("./public-api-routes");
const { createPushApiRoutes } = require("./push-api-routes");
const { createResourceApiRoutes } = require("./resource-api-routes");
const { createRuntimeConfigApiRoutes } = require("./runtime-config-api-routes");
const { createSingleWindowGroupChatApiRoutes } = require("./single-window-group-chat-api-routes");
const { createSystemApiRoutes } = require("./system-api-routes");
const { createThreadMessageRunApiRoutes } = require("./thread-message-run-api-routes");
const { createThreadReadUploadApiRoutes } = require("./thread-read-upload-api-routes");
const { createThreadTaskApiRoutes } = require("./thread-task-api-routes");
const { createTodoApiRoutes } = require("./todo-api-routes");
const { createWeixinApiRoutes } = require("./weixin-api-routes");
const { createWorkspaceApiRoutes } = require("./workspace-api-routes");
const { createHermesPluginService } = require("../adapters/hermes-plugin-service");
const { createHermesPluginNotificationService } = require("../adapters/hermes-plugin-notification-service");

function callBootTrace(deps, label) {
  if (typeof deps.bootTrace === "function") deps.bootTrace(label);
}

function boolEnabled(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function appendPluginManifestAudit(deps = {}, event = {}) {
  const dataDir = String(deps.dataDir || process.env.HERMES_WEB_DATA_DIR || process.env.HERMES_MOBILE_DATA_DIR || path.join(process.cwd(), "workspace", "hermes-web"));
  const auditPath = path.join(dataDir, "logs", "plugin-manifest-requests.jsonl");
  try {
    fs.mkdirSync(path.dirname(auditPath), { recursive: true });
    fs.appendFileSync(auditPath, `${JSON.stringify(Object.assign({
      at: typeof deps.nowIso === "function" ? deps.nowIso() : new Date().toISOString(),
    }, event))}\n`, "utf8");
  } catch (err) {
    if (typeof deps.bootTrace === "function") deps.bootTrace(`plugin manifest audit failed: ${err?.message || String(err)}`);
  }
}

function createMobileApiComposition(deps = {}) {
  const publicApiRoutes = createPublicApiRoutes({
    authenticateRequest: deps.authenticateRequest,
    createInitialOwnerKey: deps.createInitialOwnerKey,
    ownerSetupStatus: deps.ownerSetupStatus,
    readBody: deps.readBody,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "public api routes ready");

  const weixinApiRoutes = createWeixinApiRoutes({
    requireWeixinIngress: deps.requireWeixinIngress,
    readBody: deps.readBody,
    sendJson: deps.sendJson,
    startWeixinIngressEvent: deps.startWeixinIngressEvent,
    pendingWeixinOutboundDeliveries: deps.pendingWeixinOutboundDeliveries,
    ackWeixinOutboundDelivery: deps.ackWeixinOutboundDelivery,
    weixinIngressProvider: deps.weixinIngressProvider,
    authCanAccessWorkspace: deps.authCanAccessWorkspace,
    weixinForwardTargetsForWorkspace: deps.weixinForwardTargetsForWorkspace,
    createWeixinFileForwardDelivery: deps.createWeixinFileForwardDelivery,
  });
  callBootTrace(deps, "weixin api routes ready");

  const systemApiRoutes = createSystemApiRoutes({
    authenticateRequest: deps.authenticateRequest,
    appUpdateStatus: deps.appUpdateStatus,
    applyAppUpdate: deps.applyAppUpdate,
    bootTrace: deps.bootTrace,
    clientVersionInfo: deps.clientVersionInfo,
    compactText: deps.compactText,
    display: deps.display,
    getHermesStatus: deps.getHermesStatus,
    includeStatusCatalog: deps.includeStatusCatalog,
    isOwnerAuth: deps.isOwnerAuth,
    loadCatalog: deps.loadCatalog,
    publicConcurrencyForAuth: deps.publicConcurrencyForAuth,
    publicGatewayPoolStatusForAuth: deps.publicGatewayPoolStatusForAuth,
    publicOwnerElevationStatus: deps.publicOwnerElevationStatus,
    publicPushStatus: deps.webPushDeliveryService.publicPushStatus,
    publicReasoningInfoForAuth: deps.publicReasoningInfoForAuth,
    requestClientVersion: deps.requestClientVersion,
    sendJson: deps.sendJson,
  });

  const ownerElevationApiRoutes = createOwnerElevationApiRoutes({
    requireOwner: deps.requireOwner,
    readBody: deps.readBody,
    sendJson: deps.sendJson,
    publicOwnerElevationStatus: deps.publicOwnerElevationStatus,
    grantOwnerElevationOnce: deps.grantOwnerElevationOnce,
    grantOwnerElevation: deps.grantOwnerElevation,
    revokeOwnerElevation: deps.revokeOwnerElevation,
  });

  const accessKeyApiRoutes = createAccessKeyApiRoutes({
    requireOwner: deps.requireOwner,
    readBody: deps.readBody,
    sendJson: deps.sendJson,
    isOwnerAuth: deps.isOwnerAuth,
    ownerKeySource: () => deps.authProvider.ownerKeySource(),
    listWorkspaceAccessKeyStatuses: deps.listWorkspaceAccessKeyStatuses,
    rotateWorkspaceAccessKey: deps.rotateWorkspaceAccessKey,
    revokeWorkspaceAccessKey: deps.revokeWorkspaceAccessKey,
    rotateGlobalAccessKey: deps.rotateGlobalAccessKey,
    boolParam: deps.boolParam,
  });

  const runtimeConfigApiRoutes = createRuntimeConfigApiRoutes({
    generateWebPushVapidConfig: deps.generateWebPushVapidConfig,
    getHermesStatus: deps.getHermesStatus,
    publicPushStatus: deps.webPushDeliveryService.publicPushStatus,
    publicRuntimeConfig: deps.publicRuntimeConfig,
    readBody: deps.readBody,
    reloadWebPush: deps.reloadWebPush,
    requireOwner: deps.requireOwner,
    runConcurrencySnapshot: deps.runConcurrencySnapshot,
    saveRuntimeConfig: deps.saveRuntimeConfig,
    sendJson: deps.sendJson,
  });

  const pushApiRoutes = createPushApiRoutes({
    appRouteUrl: deps.appRouteUrl,
    authenticateRequest: deps.authenticateRequest,
    nowIso: deps.nowIso,
    publicPushStatus: deps.webPushDeliveryService.publicPushStatus,
    pushWorkspaceForAuth: deps.pushWorkspaceForAuth,
    readBody: deps.readBody,
    recordPushReceipt: deps.webPushDeliveryService.recordPushReceipt,
    removePushSubscription: deps.webPushDeliveryService.removePushSubscription,
    requireOwner: deps.requireOwner,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    savePushSubscription: deps.webPushDeliveryService.savePushSubscription,
    sendJson: deps.sendJson,
    sendPushNotification: deps.webPushDeliveryService.sendPushNotification,
    state: deps.state,
    listPushReceipts: () => deps.state()?.pushReceipts || [],
    listPushDeliveries: () => deps.state()?.pushDeliveries || [],
    workspacePrincipal: deps.workspacePrincipal,
  });

  const workspaceApiRoutes = createWorkspaceApiRoutes({
    bootTrace: deps.bootTrace,
    loadCatalog: deps.loadCatalog,
    publicWorkspacesForAuth: deps.publicWorkspacesForAuth,
    publicWorkspace: deps.publicWorkspace,
    isOwnerAuth: deps.isOwnerAuth,
    requireOwner: deps.requireOwner,
    localWorkspaceDefaults: deps.localWorkspaceDefaults,
    sendJson: deps.sendJson,
    readBody: deps.readBody,
    upsertLocalWorkspace: deps.upsertLocalWorkspace,
    deleteLocalWorkspace: deps.deleteLocalWorkspace,
    findWorkspace: deps.findWorkspace,
  });

  const resourceApiRoutes = createResourceApiRoutes({
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
    sharedDirectoryProjectionService: {
      listPublicSharedDirectories: (...args) => deps.getSharedDirectoryProjectionService().listPublicSharedDirectories(...args),
      publicProjectsForWorkspace: (...args) => deps.getSharedDirectoryProjectionService().publicProjectsForWorkspace(...args),
    },
    skillDetailProvider: {
      detail: (...args) => deps.skillDetailProvider.detail(...args),
      analyze: (...args) => deps.skillDetailProvider.analyze(...args),
      applyFix: (...args) => deps.skillDetailProvider.applyFix(...args),
    },
    compactText: deps.compactText,
  });

  const hermesPluginService = deps.hermesPluginService || createHermesPluginService({
    nowIso: deps.nowIso,
    dataDir: deps.dataDir,
  });
  const fileArtifactApiRoutes = createFileArtifactApiRoutes({
    contentDisposition: deps.contentDisposition,
    extractDocxText: deps.extractDocxText,
    mimeFor: deps.mimeFor,
    resolveArtifactForRequest: deps.resolveArtifactForRequest,
    resolveFileForBrowserRequest: deps.resolveFileForBrowserRequest,
    sendJson: deps.sendJson,
    textFilePreview: deps.textFilePreview,
  });

  const directoryBrowserApiRoutes = createDirectoryBrowserApiRoutes({
    compareDirectoryEntriesNewestFirst: (...args) => deps.getDirectoryBrowserBoundaryService().compareDirectoryEntriesNewestFirst(...args),
    findDirectoryThreadForRequest: deps.findDirectoryThreadForRequest,
    publicDirectoryEntry: (...args) => deps.getDirectoryBrowserBoundaryService().publicDirectoryEntry(...args),
    publicRemoteDirectoryEntry: (...args) => deps.getDirectoryBrowserBoundaryService().publicRemoteDirectoryEntry(...args),
    resolveBrowserPathAsync: (...args) => deps.getDirectoryBrowserBoundaryService().resolveBrowserPathAsync(...args),
    runDirectoryBridge: deps.runDirectoryBridge,
    sendJson: deps.sendJson,
  });

  const directoryShareApiRoutes = createDirectoryShareApiRoutes({
    basename: deps.basename,
    clearDynamicProjectCache: deps.clearDynamicProjectCache,
    directoryRequestParams: (...args) => deps.getDirectoryBrowserBoundaryService().directoryRequestParams(...args),
    findDirectoryThreadForRequest: deps.findDirectoryThreadForRequest,
    invalidateCatalogCache: deps.invalidateCatalogCache,
    nowIso: deps.nowIso,
    readBody: deps.readBody,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    resolveBrowserPathAsync: (...args) => deps.getDirectoryBrowserBoundaryService().resolveBrowserPathAsync(...args),
    sendJson: deps.sendJson,
    sharedDirectoryProjectionService: {
      normalizeSharePermission: (...args) => deps.getSharedDirectoryProjectionService().normalizeSharePermission(...args),
      normalizeShareScope: (...args) => deps.getSharedDirectoryProjectionService().normalizeShareScope(...args),
      normalizeShareTargets: (...args) => deps.getSharedDirectoryProjectionService().normalizeShareTargets(...args),
      publicSharedDirectory: (...args) => deps.getSharedDirectoryProjectionService().publicSharedDirectory(...args),
      removeSharedDirectoryRecord: (...args) => deps.getSharedDirectoryProjectionService().removeSharedDirectoryRecord(...args),
      shareableRootProjectForPath: (...args) => deps.getSharedDirectoryProjectionService().shareableRootProjectForPath(...args),
      sharedDirectoryLabel: (...args) => deps.getSharedDirectoryProjectionService().sharedDirectoryLabel(...args),
      updateSharedDirectoryAccess: (...args) => deps.getSharedDirectoryProjectionService().updateSharedDirectoryAccess(...args),
      upsertSharedDirectory: (...args) => deps.getSharedDirectoryProjectionService().upsertSharedDirectory(...args),
    },
    statSync: deps.statSync,
    workspacePrincipal: deps.workspacePrincipal,
  });

  const directoryMutationApiRoutes = createDirectoryMutationApiRoutes({
    assertChildPathInside: (...args) => deps.getDirectoryBrowserBoundaryService().assertChildPathInside(...args),
    authenticateRequest: deps.authenticateRequest,
    clearDynamicProjectCache: deps.clearDynamicProjectCacheForWorkspace,
    directoryRequestParams: (...args) => deps.getDirectoryBrowserBoundaryService().directoryRequestParams(...args),
    exists: deps.exists,
    findDirectoryThreadForRequest: deps.findDirectoryThreadForRequest,
    invalidateCatalogCache: deps.invalidateCatalogCache,
    isDeletableWorkspaceRootChild: (...args) => deps.getDirectoryBrowserBoundaryService().isDeletableWorkspaceRootChild(...args),
    isDirectoryBrowserPathAllowedForThread: deps.isDirectoryBrowserPathAllowedForThread,
    isProtectedDirectoryRoot: (...args) => deps.getDirectoryBrowserBoundaryService().isProtectedDirectoryRoot(...args),
    isSharedDirectoryWriteAllowed: (...args) => deps.getDirectoryBrowserBoundaryService().isSharedDirectoryWriteAllowed(...args),
    joinDisplayPath: (...args) => deps.getDirectoryBrowserBoundaryService().joinDisplayPath(...args),
    joinLocalPath: deps.joinLocalPath,
    maxUploadBytes: deps.maxUploadBytes,
    mimeFor: deps.mimeFor,
    mkdir: deps.mkdir,
    publicManagedEntry: (...args) => deps.getDirectoryBrowserBoundaryService().publicManagedEntry(...args),
    publicRemoteDirectoryEntry: (...args) => deps.getDirectoryBrowserBoundaryService().publicRemoteDirectoryEntry(...args),
    readBody: deps.readBody,
    resolveBrowserPathAsync: (...args) => deps.getDirectoryBrowserBoundaryService().resolveBrowserPathAsync(...args),
    rmdir: deps.rmdir,
    rmDirRecursive: deps.rmDirRecursive,
    runDirectoryBridge: deps.runDirectoryBridge,
    safeDirectoryName: deps.safeDirectoryName,
    safeFileName: deps.safeFileName,
    sendJson: deps.sendJson,
    stat: deps.statSync,
    uniqueChildPath: deps.uniqueChildPath,
    unlink: deps.unlink,
    isOwnerAuth: deps.isOwnerAuth,
    isOwnerElevationActive: deps.isOwnerElevationActive,
    consumeOwnerElevationOnce: deps.consumeOwnerElevationOnce,
    write: deps.writeFile,
  });

  const eventStreamApiRoutes = createEventStreamApiRoutes({
    activeStreams: deps.activeStreams,
    authenticateRequest: deps.authenticateRequest,
    clientVersionInfo: deps.clientVersionInfo,
    effectiveHermesApiBase: deps.effectiveHermesApiBase,
    pruneEmptyThreads: (...args) => deps.getRuntimeStateThreadService().pruneEmptyThreads(...args),
    readClientVersion: deps.readClientVersion,
    registerClient: deps.eventFanoutService.registerClient,
    removeClient: deps.eventFanoutService.removeClient,
    runConcurrencySnapshot: deps.runConcurrencySnapshot,
    sendJson: deps.sendJson,
    state: deps.state,
    threadAccessibleToAuth: (...args) => deps.getRuntimeStateThreadService().threadAccessibleToAuth(...args),
    threadSummary: deps.threadSummary,
  });

  const threadReadUploadApiRoutes = createThreadReadUploadApiRoutes({
    authenticateRequest: deps.authenticateRequest,
    boolParam: deps.boolParam,
    broadcast: deps.broadcast,
    chatGroupMemberWorkspaceIds: deps.chatGroupMemberWorkspaceIds,
    compactMessage: deps.compactMessage,
    compactThread: deps.compactThread,
    compactThreadWithMessagePage: deps.compactThreadWithMessagePage,
    findProject: deps.findProject,
    findSubproject: deps.findSubproject,
    findThreadForRequest: (...args) => deps.getRuntimeStateThreadService().findThreadForRequest(...args),
    findWorkspace: deps.findWorkspace,
    isDiscardableEmptyThread: (...args) => deps.getRuntimeStateThreadService().isDiscardableEmptyThread(...args),
    makeId: deps.makeId,
    maxUploadBytes: deps.maxUploadBytes,
    normalizeThread: (...args) => deps.getRuntimeStateNormalizationService().normalizeThread(...args),
    nowIso: deps.nowIso,
    pruneEmptyThreads: (...args) => deps.getRuntimeStateThreadService().pruneEmptyThreads(...args),
    readBody: deps.readBody,
    registerUploadArtifact: deps.registerUploadArtifact,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    safeFileName: deps.safeFileName,
    saveState: deps.saveState,
    searchThreadMessages: deps.searchThreadMessages,
    sendJson: deps.sendJson,
    singleWindowProjectTaskSummaries: deps.singleWindowProjectTaskSummaries,
    state: deps.state,
    threadAccessibleToRequest: (...args) => deps.getRuntimeStateThreadService().threadAccessibleToRequest(...args),
    threadMessageInitialLimit: deps.threadMessageInitialLimit,
    threadMessagePageLimit: deps.threadMessagePageLimit,
    threadMessageSearchLimit: deps.threadMessageSearchLimit,
    threadMessagesPage: deps.threadMessagesPage,
    threadSummary: deps.threadSummary,
    workspaceUploadDirectoryForRequest: deps.workspaceUploadDirectoryForRequest,
  });

  const threadTaskApiRoutes = createThreadTaskApiRoutes({
    broadcast: deps.broadcast,
    compactThread: deps.compactThread,
    dedupe: deps.dedupe,
    findThreadForRequest: (...args) => deps.getRuntimeStateThreadService().findThreadForRequest(...args),
    isSingleWindowConversationTaskGroupId: deps.isSingleWindowConversationTaskGroupId,
    normalizeTaskGroupMeta: (...args) => deps.getRuntimeStateNormalizationService().normalizeTaskGroupMeta(...args),
    nowIso: deps.nowIso,
    readBody: deps.readBody,
    sanitizeTaskGroupId: (...args) => deps.getRuntimeStateNormalizationService().sanitizeTaskGroupId(...args),
    sanitizeTaskTitle: (...args) => deps.getRuntimeStateNormalizationService().sanitizeTaskTitle(...args),
    saveState: deps.saveState,
    sendJson: deps.sendJson,
    state: deps.state,
    stopRunIds: deps.stopRunIds,
  });

  const singleWindowGroupChatApiRoutes = createSingleWindowGroupChatApiRoutes({
    authenticateRequest: deps.authenticateRequest,
    broadcast: deps.broadcast,
    canRevokeGroupChatMessage: deps.canRevokeGroupChatMessage,
    compactMessage: deps.compactMessage,
    compactThread: deps.compactThread,
    compactThreadWithMessagePage: deps.compactThreadWithMessagePage,
    ensureGroupChatThreadForWorkspace: (...args) => deps.getSingleWindowThreadService().ensureGroupChatThreadForWorkspace(...args),
    ensureSingleWindowThread: (...args) => deps.getSingleWindowThreadService().ensureSingleWindowThread(...args),
    ensureWeixinSingleWindowThread: (...args) => deps.getSingleWindowThreadService().ensureWeixinSingleWindowThread(...args),
    findGroupChatThreadForWorkspace: (...args) => deps.getSingleWindowThreadService().findGroupChatThreadForWorkspace(...args),
    findThreadForRequest: (...args) => deps.getRuntimeStateThreadService().findThreadForRequest(...args),
    findWeixinSingleWindowThreadForWorkspace: (...args) => deps.getSingleWindowThreadService().findWeixinSingleWindowThreadForWorkspace(...args),
    findWorkspace: deps.findWorkspace,
    groupAiReplyRevokedText: deps.groupAiReplyRevokedText,
    groupAssistantReplyForUserMessage: deps.groupAssistantReplyForUserMessage,
    groupChatTaskGroupId: deps.singleWindowGroupChatTaskGroupId,
    groupMessageRevokedText: deps.groupMessageRevokedText,
    groupMessageRevoker: deps.groupMessageRevoker,
    kanbanCaseTopicThreadsForWorkspace: (...args) => deps.getSingleWindowThreadService().kanbanCaseTopicThreadsForWorkspace(...args),
    normalizeChatGroup: deps.normalizeChatGroup,
    normalizeStringList: deps.normalizeStringList,
    nowIso: deps.nowIso,
    readBody: deps.readBody,
    removeThreadActiveRun: deps.removeThreadActiveRun,
    requireOwner: deps.requireOwner,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    revokeGroupMessagePayload: deps.revokeGroupMessagePayload,
    saveState: deps.saveState,
    scheduleNextQueuedRunForTaskGroup: deps.scheduleNextQueuedRunForTaskGroup,
    sendJson: deps.sendJson,
    state: deps.state,
    stopRunIds: deps.stopRunIds,
    threadAccessibleToAuth: (...args) => deps.getRuntimeStateThreadService().threadAccessibleToAuth(...args),
    threadMessageInitialLimit: deps.threadMessageInitialLimit,
    threadSummary: deps.threadSummary,
    weixinForwardTargetsForWorkspace: deps.weixinForwardTargetsForWorkspace,
  });

  const threadMessageRunApiRoutes = createThreadMessageRunApiRoutes({
    handleThreadMessageCreate: (...args) => deps.getThreadMessageRunRouteService().handleThreadMessageCreate(...args),
    handleThreadMessageOwnerElevation: (...args) => deps.getThreadMessageRunRouteService().handleThreadMessageOwnerElevation(...args),
  });

  const actionInboxService = deps.actionInboxService || createActionInboxService({
    compactText: deps.compactText,
    makeId: deps.makeId,
    nowIso: deps.nowIso,
    store: deps.mobileSqliteStore,
  });
  const hermesPluginNotificationService = deps.hermesPluginNotificationService || createHermesPluginNotificationService({
    actionInboxService,
    appRouteUrl: deps.appRouteUrl,
    compactText: deps.compactText,
    hermesPluginService,
    nowIso: deps.nowIso,
    sendPushNotification: deps.webPushDeliveryService.sendPushNotification,
    workspacePrincipal: deps.workspacePrincipal,
  });
  const hermesPluginApiRoutes = createHermesPluginApiRoutes({
    authenticateRequest: deps.authenticateRequest,
    broadcast: deps.broadcast,
    isOwnerAuth: deps.isOwnerAuth,
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
    hermesPluginService,
    hermesPluginNotificationService,
    auditPluginManifestRequest: (event) => appendPluginManifestAudit(deps, event),
  });
  callBootTrace(deps, "hermes plugin api routes ready");
  const actionInboxApiRoutes = createActionInboxApiRoutes({
    actionInboxService,
    broadcast: deps.broadcast,
    readBody: deps.readBody,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "action inbox api routes ready");

  const todoApiRoutes = createTodoApiRoutes({
    actionInboxService,
    boolParam: deps.boolParam,
    broadcast: deps.broadcast,
    clearKanbanCardListCache: deps.clearKanbanCardListCache,
    maybeReconcileKanbanDependencyBlocks: deps.maybeReconcileKanbanDependencyBlocks,
    notifyTodoCreated: deps.webPushDeliveryService.notifyTodoCreated,
    publicTodo: deps.publicTodo,
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    runTodoWebPushTick: deps.webPushDeliveryService.runTodoWebPushTick,
    sendJson: deps.sendJson,
    todoErrorResponse: deps.todoErrorResponse,
    todoProvider: deps.todoProvider,
    useKanbanTodoBackend: deps.useKanbanTodoBackend,
    workspacePrincipal: deps.workspacePrincipal,
  });
  callBootTrace(deps, "todo api routes ready");

  const learningGrowthTaskService = createLearningGrowthKanbanTaskService({
    kanbanCardProvider: deps.kanbanCardProvider,
  });
  const learningGrowthTaskFeedbackService = createLearningGrowthTaskFeedbackService({
    extractJsonObject: deps.extractJsonObject,
    findWorkspace: deps.findWorkspace,
    hermesModelText: deps.hermesModelText,
    model: deps.automationCreateModel,
    sanitizePolicy: deps.sanitizePolicy,
  });
  const learningGrowthTaskEvaluationService = createLearningGrowthTaskEvaluationService({
    extractJsonObject: deps.extractJsonObject,
    findWorkspace: deps.findWorkspace,
    hermesModelText: deps.hermesModelText,
    model: deps.automationCreateModel,
    requireModel: true,
    sanitizePolicy: deps.sanitizePolicy,
  });
  const learningGrowthDirectoryMaterializationService = createLearningGrowthDirectoryMaterializationService({
    dataDir: deps.dataDir,
  });
  const learningGrowthJitDecisionReportService = createLearningGrowthJitDecisionReportService({
    dataDir: deps.dataDir,
    nowIso: deps.nowIso,
    reportDirectoryForCard: (workspaceId, taskCardId, task) => learningGrowthDirectoryMaterializationService.reportDirectoryForCard(workspaceId, taskCardId, task),
  });
  const learningGrowthReflectionService = createLearningGrowthReflectionService({
    extractJsonObject: deps.extractJsonObject,
    findWorkspace: deps.findWorkspace,
    hermesModelText: deps.hermesModelText,
    model: deps.automationCreateModel,
    requireModel: true,
    sanitizePolicy: deps.sanitizePolicy,
    saveAudioUpload: (...args) => deps.kanbanReadingWorkflowService.saveKanbanReadingAudioUpload(...args),
    transcribeAudio: (...args) => deps.kanbanReadingWorkflowService.transcribeKanbanReadingAudio(...args),
  });
  let learningGrowthMasteryProfileService = null;
  const learningGrowthMasteryProfileBridge = {
    recordTaskEvidence: (...args) => learningGrowthMasteryProfileService?.recordTaskEvidence?.(...args),
    projectForNextCard: (...args) => learningGrowthMasteryProfileService?.projectForNextCard?.(...args),
  };
  const learningGrowthSequenceService = createLearningGrowthSequenceService({
    decisionReportService: learningGrowthJitDecisionReportService,
    getJitTaskService: () => learningGrowthJitTaskService,
    getLearningProgramService: () => learningProgramService,
    masteryProfileService: learningGrowthMasteryProfileBridge,
    nowIso: deps.nowIso,
    reportDirectoryForCard: (workspaceId, taskCardId, task) => learningGrowthDirectoryMaterializationService.reportDirectoryForCard(workspaceId, taskCardId, task),
  });
  const learningGrowthSubmissionService = createLearningGrowthSubmissionService({
    aiFeedbackService: learningGrowthTaskFeedbackService,
    artifactService: deps.kanbanStudyArtifactService,
    directoryMaterializationService: learningGrowthDirectoryMaterializationService,
    evaluationService: learningGrowthTaskEvaluationService,
    kanbanCardProvider: deps.kanbanCardProvider,
    getLearningProgramService: () => learningProgramService,
    learningCoinService: deps.learningCoinService,
    notifyEvaluationComplete: deps.webPushDeliveryService.notifyLearningGrowthEvaluationComplete,
    notifyTaskComplete: deps.webPushDeliveryService.notifyLearningGrowthTaskComplete,
    masteryProfileService: learningGrowthMasteryProfileBridge,
    reflectionService: learningGrowthReflectionService,
    saveSubmissionAudioUpload: (...args) => deps.kanbanReadingWorkflowService.saveKanbanReadingAudioUpload(...args),
    sequenceService: learningGrowthSequenceService,
    transcribeSubmissionAudio: (...args) => deps.kanbanReadingWorkflowService.transcribeKanbanReadingAudio(...args),
  });
  learningGrowthSubmissionService.scheduleEvaluationQueue();
  const kanbanCaseTopicDeliveryService = createKanbanCaseTopicDeliveryService({
    broadcast: deps.broadcast,
    makeId: deps.makeId,
    normalizeTaskGroupMeta: (...args) => deps.getRuntimeStateNormalizationService().normalizeTaskGroupMeta(...args),
    nowIso: deps.nowIso,
    saveState: deps.saveState,
    state: deps.state,
    threadSummary: deps.threadSummary,
  });

  const kanbanCardApiRoutes = createKanbanCardApiRoutes({
    annotateKanbanCardsForAuth: (...args) => deps.kanbanCaseShareService.annotateCardsForAuth(...args),
    authenticateRequest: deps.authenticateRequest,
    boolParam: deps.boolParam,
    broadcast: deps.broadcast,
    clearKanbanCardListCache: deps.clearKanbanCardListCache,
    compactText: deps.compactText,
    createKanbanPlanCards: deps.createKanbanPlanCards,
    detectDirectTodoCreateIntentForWeb: deps.detectDirectTodoCreateIntentForWeb,
    extractKanbanSourceDocumentText: (...args) => deps.kanbanReadingWorkflowService.extractKanbanSourceDocumentText(...args),
    findWorkspace: deps.findWorkspace,
    isOwnerAuth: deps.isOwnerAuth,
    kanbanCardProvider: deps.kanbanCardProvider,
    kanbanCaseSharesForActor: (...args) => deps.kanbanCaseShareService.sharesForActor(...args),
    kanbanCaseTopicDeliveryService,
    kanbanErrorResponse: deps.kanbanErrorResponse,
    kanbanSingleCardCasePayload: deps.kanbanSingleCardCasePayload,
    learningGrowthKanbanTaskService: learningGrowthTaskService,
    learningGrowthSubmissionService,
    normalizeKanbanNotificationAssignee: deps.normalizeKanbanNotificationAssignee,
    normalizeKanbanMaxParallel: deps.normalizeKanbanMaxParallel,
    normalizeKanbanPlanReasoningEffort: deps.normalizeKanbanPlanReasoningEffort,
    planKanbanMultiAgent: deps.planKanbanMultiAgent,
    publicKanbanCardDetail: deps.publicKanbanCardDetail,
    publicTodo: deps.publicTodo,
    readBody: deps.readBody,
    readKanbanCardListCache: deps.readKanbanCardListCache,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    resolveKanbanCardAccess: deps.resolveKanbanCardAccess,
    resolveKanbanOutputFile: deps.resolveKanbanOutputFile,
    saveKanbanSourceDocumentUpload: (...args) => deps.kanbanReadingWorkflowService.saveKanbanSourceDocumentUpload(...args),
    scheduleKanbanDependencyReconcile: deps.scheduleKanbanDependencyReconcile,
    sendJson: deps.sendJson,
    sendResolvedFile: deps.sendResolvedFile,
    sendResolvedFilePreview: deps.sendResolvedFilePreview,
    sharedKanbanCardsForAuth: (...args) => deps.kanbanCaseShareService.sharedCardsForAuth(...args),
    maxUploadBytes: deps.maxUploadBytes,
    sourceDocumentMaxBytes: deps.sourceDocumentMaxBytes,
    todoAssigneeLabel: deps.todoAssigneeLabel,
    useKanbanTodoBackend: deps.useKanbanTodoBackend,
    verifyDirectTodoCreateResult: deps.verifyDirectTodoCreateResult,
    workspacePrincipal: deps.workspacePrincipal,
    writeKanbanCardListCache: deps.writeKanbanCardListCache,
  });
  callBootTrace(deps, "kanban card api routes ready");

  const kanbanStudyApiRoutes = createKanbanStudyApiRoutes({
    annotateKanbanCardForAuth: (...args) => deps.kanbanCaseShareService.annotateCardForAuth(...args),
    broadcast: deps.broadcast,
    clearKanbanCardListCache: deps.clearKanbanCardListCache,
    compactText: deps.compactText,
    createKanbanAssessmentPlanCards: (...args) => deps.getKanbanPlanCardCreationService().createKanbanAssessmentPlanCards(...args),
    createKanbanStudyPlanCards: (...args) => deps.getKanbanPlanCardCreationService().createKanbanStudyPlanCards(...args),
    getKanbanAssessmentExam: (...args) => deps.getAssessmentExamWorkflowService().getKanbanAssessmentExam(...args),
    getKanbanReadingQuiz: (...args) => deps.kanbanReadingWorkflowService.getKanbanReadingQuiz(...args),
    kanbanErrorResponse: deps.kanbanErrorResponse,
    kanbanCaseTopicDeliveryService,
    maxUploadBytes: deps.maxUploadBytes,
    readBody: deps.readBody,
    readingCoverMaxBytes: deps.readingCoverMaxBytes,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    resolveKanbanCardAccess: deps.resolveKanbanCardAccess,
    sendJson: deps.sendJson,
    startKanbanAssessmentExam: (...args) => deps.getAssessmentExamWorkflowService().startKanbanAssessmentExam(...args),
    submitKanbanAssessmentExam: (...args) => deps.getAssessmentExamWorkflowService().submitKanbanAssessmentExam(...args),
    submitKanbanReadingQuiz: (...args) => deps.kanbanReadingWorkflowService.submitKanbanReadingQuiz(...args),
    submitKanbanReadingSubmission: (...args) => deps.kanbanReadingWorkflowService.submitKanbanReadingSubmission(...args),
    useKanbanTodoBackend: deps.useKanbanTodoBackend,
  });
  callBootTrace(deps, "kanban study api routes ready");

  const kanbanLearningGuidanceApiRoutes = createKanbanLearningGuidanceApiRoutes({
    compactText: deps.compactText,
    learningCardGuidanceService: deps.learningCardGuidanceService,
    readBody: deps.readBody,
    resolveKanbanCardAccess: deps.resolveKanbanCardAccess,
    sendJson: deps.sendJson,
    useKanbanTodoBackend: deps.useKanbanTodoBackend,
  });
  callBootTrace(deps, "kanban learning guidance api routes ready");

  const learningProgramRepository = createLearningProgramRepository({
    dataDir: deps.dataDir,
    dbPath: deps.learningProgramDbPath,
  });
  learningGrowthMasteryProfileService = createLearningGrowthMasteryProfileService({
    repository: learningProgramRepository,
  });
  const learningGrowthJitTaskService = createLearningGrowthJitTaskService({
    extractJsonObject: deps.extractJsonObject,
    findWorkspace: deps.findWorkspace,
    hermesModelText: deps.hermesModelText,
    listSources: (filters) => learningProgramRepository.listSources(filters),
    model: deps.learningGrowthJitModel || "gpt-5.5",
    reasoningEffort: deps.learningGrowthJitReasoningEffort || "xhigh",
    requireModel: true,
    sanitizePolicy: deps.sanitizePolicy,
  });
  const learningProgramPublishService = createLearningProgramPublishService({
    createKanbanStudyPlanCards: (...args) => deps.getKanbanPlanCardCreationService().createKanbanStudyPlanCards(...args),
    directoryMaterializationService: learningGrowthDirectoryMaterializationService,
    jitTaskService: learningGrowthJitTaskService,
  });
  const learningParentReviewRequestService = createLearningParentReviewRequestService({
    repository: learningProgramRepository,
  });
  const learningProgramService = createLearningProgramService({
    dataDir: deps.dataDir,
    directoryMaterializationService: learningGrowthDirectoryMaterializationService,
    extractJsonObject: deps.extractJsonObject,
    findWorkspace: deps.findWorkspace,
    hermesModelText: deps.hermesModelText,
    learningCoinService: deps.learningCoinService,
    model: deps.automationCreateModel,
    parentReviewRequestService: learningParentReviewRequestService,
    publishService: learningProgramPublishService,
    repository: learningProgramRepository,
    requireLargeRewardReview: boolEnabled(deps.env?.HERMES_MOBILE_LEARNING_REQUIRE_LARGE_REWARD_REVIEW || deps.env?.HERMES_WEB_LEARNING_REQUIRE_LARGE_REWARD_REVIEW, false),
    requireModelForPlanDecomposition: true,
    requireModelForTaskSeriesRecommendation: true,
    sanitizePolicy: deps.sanitizePolicy,
  });
  const learningGrowthLegacyTodoTaskService = createLearningGrowthLegacyTodoTaskService({
    mobileStore: deps.mobileSqliteStore,
  });
  const learningGrowthExperienceSignalService = createLearningGrowthExperienceSignalService({
    repository: learningProgramRepository,
  });
  const learningGrowthTeachingCheckService = createLearningGrowthTeachingCheckService({
    experienceSignalService: learningGrowthExperienceSignalService,
    learningProgramService,
    repository: learningProgramRepository,
  });
  const learningGrowthStageAssessmentService = createLearningGrowthStageAssessmentService({
    learningProgramService,
    repository: learningProgramRepository,
  });

  const learningApiRoutes = createLearningApiRoutes({
    isOwnerAuth: deps.isOwnerAuth,
    learningCoinService: deps.learningCoinService,
    learningGrowthService: createLearningGrowthService({
      legacyTodoTaskService: learningGrowthLegacyTodoTaskService,
      learningCoinService: deps.learningCoinService,
      learningProgramService,
    }),
    learningGrowthTaskService,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "learning api routes ready");

  const learningProgramApiRoutes = createLearningProgramApiRoutes({
    isOwnerAuth: deps.isOwnerAuth,
    learningGrowthMasteryProfileService,
    learningGrowthSubmissionService,
    learningProgramService,
    maxUploadBytes: deps.maxUploadBytes,
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "learning program api routes ready");

  const learningGrowthCardApiRoutes = createLearningGrowthCardApiRoutes({
    authCanAccessWorkspace: deps.authCanAccessWorkspace,
    isOwnerAuth: deps.isOwnerAuth,
    learningGrowthExperienceSignalService,
    learningGrowthStageAssessmentService,
    learningGrowthTeachingCheckService,
    learningProgramService,
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "learning growth card api routes ready");

  const learningParentReviewApiRoutes = createLearningParentReviewApiRoutes({
    learningParentReviewRequestService,
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "learning parent review api routes ready");

  const learningCoinApiRoutes = createLearningCoinApiRoutes({
    broadcast: deps.broadcast,
    isOwnerAuth: deps.isOwnerAuth,
    learningCoinService: deps.learningCoinService,
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "learning coin api routes ready");

  const automationApiRoutes = createAutomationApiRoutes({
    automationListSortByLatestDeliverable: deps.webPushDeliveryService.automationListSortByLatestDeliverable,
    automationProvider: deps.automationProvider,
    boolParam: deps.boolParam,
    clearCronListCache: deps.clearCronListCache,
    compactText: deps.compactText,
    cronJobMatchesOwner: deps.cronJobMatchesOwner,
    cronJobMatchesSearch: deps.cronJobMatchesSearch,
    findWorkspace: deps.findWorkspace,
    interpretAutomationNaturalLanguage: deps.interpretAutomationNaturalLanguage,
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    resolveAuthorizedCronDeliverableFile: deps.resolveAuthorizedCronDeliverableFile,
    resolveAuthorizedCronOutputFile: deps.resolveAuthorizedCronOutputFile,
    runAutomationWebPushTick: deps.webPushDeliveryService.runAutomationWebPushTick,
    runCronListBridgeCached: deps.runCronListBridgeCached,
    sanitizePolicy: deps.sanitizePolicy,
    sendJson: deps.sendJson,
    sendResolvedBridgeFile: deps.sendResolvedBridgeFile,
    sendResolvedBridgeFilePreview: deps.sendResolvedBridgeFilePreview,
    sendResolvedFile: deps.sendResolvedFile,
    sendResolvedFilePreview: deps.sendResolvedFilePreview,
    workspacePrincipal: deps.workspacePrincipal,
  });
  callBootTrace(deps, "automation api routes ready");

  const mobileApiDispatcher = createMobileApiDispatcher({
    accessKeyApiRoutes,
    actionInboxApiRoutes,
    attachClientVersionHeaders: deps.attachClientVersionHeaders,
    authenticateRequest: deps.authenticateRequest,
    automationApiRoutes,
    buildRequestContext: deps.buildRequestContext,
    directoryBrowserApiRoutes,
    directoryMutationApiRoutes,
    directoryShareApiRoutes,
    fileArtifactApiRoutes,
    hermesPluginApiRoutes,
    getUrl: deps.getUrl,
    kanbanCardApiRoutes,
    kanbanLearningGuidanceApiRoutes,
    kanbanStudyApiRoutes,
    learningApiRoutes,
    learningCoinApiRoutes,
    learningGrowthCardApiRoutes,
    learningParentReviewApiRoutes,
    learningProgramApiRoutes,
    ownerElevationApiRoutes,
    publicApiRoutes,
    pushApiRoutes,
    requestClientVersion: deps.requestClientVersion,
    resourceApiRoutes,
    runtimeConfigApiRoutes,
    sendJson: deps.sendJson,
    singleWindowGroupChatApiRoutes,
    systemApiRoutes,
    threadMessageRunApiRoutes,
    threadReadUploadApiRoutes,
    threadTaskApiRoutes,
    todoApiRoutes,
    weixinApiRoutes,
    workspaceApiRoutes,
  });
  callBootTrace(deps, "core api routes ready");

  return {
    eventStreamApiRoutes,
    mobileApiDispatcher,
    services: {
      actionInboxService,
      learningGrowthSubmissionService,
      learningGrowthTeachingCheckService,
      learningGrowthExperienceSignalService,
      learningGrowthStageAssessmentService,
      hermesPluginService,
      hermesPluginNotificationService,
    },
    routes: {
      accessKeyApiRoutes,
      actionInboxApiRoutes,
      automationApiRoutes,
      directoryBrowserApiRoutes,
      directoryMutationApiRoutes,
      directoryShareApiRoutes,
      fileArtifactApiRoutes,
      hermesPluginApiRoutes,
      kanbanCardApiRoutes,
      kanbanLearningGuidanceApiRoutes,
      kanbanStudyApiRoutes,
      learningApiRoutes,
      learningCoinApiRoutes,
      learningGrowthCardApiRoutes,
      learningParentReviewApiRoutes,
      learningProgramApiRoutes,
      ownerElevationApiRoutes,
      publicApiRoutes,
      pushApiRoutes,
      resourceApiRoutes,
      runtimeConfigApiRoutes,
      singleWindowGroupChatApiRoutes,
      systemApiRoutes,
      threadMessageRunApiRoutes,
      threadReadUploadApiRoutes,
      threadTaskApiRoutes,
      todoApiRoutes,
      weixinApiRoutes,
      workspaceApiRoutes,
    },
  };
}

module.exports = {
  createMobileApiComposition,
};
