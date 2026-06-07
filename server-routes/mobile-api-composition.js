"use strict";

const { createAutomationApiRoutes } = require("./automation-api-routes");
const { createEventStreamApiRoutes } = require("./event-stream-api-routes");
const { createMobileApiDirectoryComposition } = require("./mobile-api-directory-composition");
const { createMobileApiDispatcher } = require("./mobile-api-dispatcher");
const { createMobileApiLearningComposition } = require("./mobile-api-learning-composition");
const { createMobileApiPluginComposition } = require("./mobile-api-plugin-composition");
const { createMobileApiPlatformComposition } = require("./mobile-api-platform-composition");
const { createSingleWindowGroupChatApiRoutes } = require("./single-window-group-chat-api-routes");
const { createThreadMessageRunApiRoutes } = require("./thread-message-run-api-routes");
const { createThreadReadUploadApiRoutes } = require("./thread-read-upload-api-routes");
const { createThreadTaskApiRoutes } = require("./thread-task-api-routes");
const { createTodoApiRoutes } = require("./todo-api-routes");
function callBootTrace(deps, label) {
  if (typeof deps.bootTrace === "function") deps.bootTrace(label);
}

function createMobileApiComposition(deps = {}) {
  const platformComposition = createMobileApiPlatformComposition(deps);
  const {
    accessKeyApiRoutes,
    ownerElevationApiRoutes,
    platformCurrencyApiRoutes,
    publicApiRoutes,
    pushApiRoutes,
    resourceApiRoutes,
    runtimeConfigApiRoutes,
    systemApiRoutes,
    weixinApiRoutes,
    workspaceApiRoutes,
  } = platformComposition.routes;
  const {
    platformCurrencyService,
  } = platformComposition.services;

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
  const pluginComposition = createMobileApiPluginComposition(deps);
  const {
    actionInboxApiRoutes,
    hermesPluginApiRoutes,
    pluginTopicUsageApiRoutes,
  } = pluginComposition.routes;
  const {
    actionInboxService,
    financeLedgerJoinApprovalService,
    hermesPluginNotificationService,
    hermesPluginService,
    pluginTopicUsageService,
  } = pluginComposition.services;

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
    pluginTopicUsageApiRoutes,
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
      pluginTopicUsageService,
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
      pluginTopicUsageApiRoutes,
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
