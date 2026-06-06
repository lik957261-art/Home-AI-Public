"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createAccessKeyApiRoutes } = require("./access-key-api-routes");
const { createActionInboxApiRoutes } = require("./action-inbox-api-routes");
const { createAutomationApiRoutes } = require("./automation-api-routes");
const { createEventStreamApiRoutes } = require("./event-stream-api-routes");
const { createHermesPluginApiRoutes } = require("./hermes-plugin-api-routes");
const { createActionInboxService } = require("../adapters/action-inbox-service");
const { createMobileApiDirectoryComposition } = require("./mobile-api-directory-composition");
const { createMobileApiDispatcher } = require("./mobile-api-dispatcher");
const { createMobileApiLearningComposition } = require("./mobile-api-learning-composition");
const { createOwnerElevationApiRoutes } = require("./owner-elevation-api-routes");
const { createPlatformCurrencyApiRoutes } = require("./platform-currency-api-routes");
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
const { createFinanceLedgerJoinApprovalService } = require("../adapters/finance-ledger-join-approval-service");
const { createPlatformCurrencyService } = require("../adapters/platform-currency-service");

function callBootTrace(deps, label) {
  if (typeof deps.bootTrace === "function") deps.bootTrace(label);
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
  const platformCurrencyService = deps.platformCurrencyService || createPlatformCurrencyService({
    nowIso: deps.nowIso,
    store: () => (typeof deps.mobileSqliteStore === "function" ? deps.mobileSqliteStore() : null),
  });
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
    platformCurrencyService,
  });

  const platformCurrencyApiRoutes = createPlatformCurrencyApiRoutes({
    platformCurrencyService,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
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
    gatewayWorkspaceProvisioningService: deps.gatewayWorkspaceProvisioningService,
    repoRoot: deps.repoRoot,
    workspaceLabelForId: (workspaceId) => {
      const workspace = typeof deps.findWorkspace === "function" ? deps.findWorkspace(workspaceId) : null;
      if (workspace) return workspace.label || workspace.name || workspace.title || workspace.id || workspaceId;
      if (typeof deps.loadCatalog === "function") {
        const catalog = deps.loadCatalog() || {};
        const found = (catalog.workspaces || []).find((item) => item.id === workspaceId);
        if (found) return found.label || found.name || found.title || found.id || workspaceId;
      }
      return workspaceId;
    },
  });
  const directoryComposition = createMobileApiDirectoryComposition(deps);
  const {
    directoryBrowserApiRoutes,
    directoryMutationApiRoutes,
    directoryShareApiRoutes,
    fileArtifactApiRoutes,
    noteReceiptApiRoutes,
  } = directoryComposition.routes;
  const {
    noteReceiptSaveService,
  } = directoryComposition.services;

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
  const financeLedgerJoinApprovalService = deps.financeLedgerJoinApprovalService || createFinanceLedgerJoinApprovalService({
    actionInboxService,
    reviewLedgerJoinRequest: deps.reviewFinanceLedgerJoinRequest || ((input) => hermesPluginService.reviewFinanceLedgerJoin(input)),
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
    financeLedgerJoinApprovalService,
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

  const learningComposition = createMobileApiLearningComposition(deps);
  const {
    kanbanCardApiRoutes,
    kanbanLearningGuidanceApiRoutes,
    kanbanStudyApiRoutes,
    learningApiRoutes,
    learningCoinApiRoutes,
    learningGrowthCardApiRoutes,
    learningParentReviewApiRoutes,
    learningProgramApiRoutes,
  } = learningComposition.routes;
  const {
    learningGrowthSubmissionService,
    learningGrowthTeachingCheckService,
    learningGrowthExperienceSignalService,
    learningGrowthStageAssessmentService,
  } = learningComposition.services;

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
    platformCurrencyApiRoutes,
    getUrl: deps.getUrl,
    kanbanCardApiRoutes,
    kanbanLearningGuidanceApiRoutes,
    kanbanStudyApiRoutes,
    learningApiRoutes,
    learningCoinApiRoutes,
    learningGrowthCardApiRoutes,
    learningParentReviewApiRoutes,
    learningProgramApiRoutes,
    noteReceiptApiRoutes,
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
      financeLedgerJoinApprovalService,
      learningGrowthSubmissionService,
      platformCurrencyService,
      learningGrowthTeachingCheckService,
      learningGrowthExperienceSignalService,
      learningGrowthStageAssessmentService,
      hermesPluginService,
      hermesPluginNotificationService,
      noteReceiptSaveService,
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
      platformCurrencyApiRoutes,
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
