"use strict";

const { createAutomationApiRoutes } = require("./automation-api-routes");
const { createEventStreamApiRoutes } = require("./event-stream-api-routes");
const { createMobileApiDataContextComposition } = require("./mobile-api-data-context-composition");
const { createMobileApiDirectoryComposition } = require("./mobile-api-directory-composition");
const { createMobileApiDispatcher } = require("./mobile-api-dispatcher");
const { createMobileApiLearningComposition } = require("./mobile-api-learning-composition");
const { createMobileApiPluginComposition } = require("./mobile-api-plugin-composition");
const { createMobileApiPlatformComposition } = require("./mobile-api-platform-composition");
const { createMobileApiVoiceComposition } = require("./mobile-api-voice-composition");
const { createAiOpsDiagnosticApiRoutes } = require("./ai-ops-diagnostic-api-routes");
const { createAutonomousDeliveryApiRoutes } = require("./autonomous-delivery-api-routes");
const { createHomeAiTtsApiRoutes } = require("./home-ai-tts-api-routes");
const { createNativeSecureSecretApiRoutes } = require("./native-secure-secret-api-routes");
const { createPluginConversationActionApiRoutes } = require("./plugin-conversation-action-api-routes");
const { createSingleWindowGroupChatApiRoutes } = require("./single-window-group-chat-api-routes");
const { createThreadMessageRunApiRoutes } = require("./thread-message-run-api-routes");
const { createThreadReadUploadApiRoutes } = require("./thread-read-upload-api-routes");
const { createThreadTaskApiRoutes } = require("./thread-task-api-routes");
const { createTodoApiRoutes } = require("./todo-api-routes");
const { createWorkspaceOnboardingApiRoutes } = require("./workspace-onboarding-api-routes");
const { createPluginWorkspaceAuditService } = require("../adapters/plugin-workspace-audit-service");
const { createAiOpsDiagnosticIntakeService } = require("../adapters/ai-ops-diagnostic-intake-service");
const { createAiOpsDiagnosticRemediationWorkflowService } = require("../adapters/ai-ops-diagnostic-remediation-workflow-service");
const { createAutonomousDeliveryCoordinatorService } = require("../adapters/autonomous-delivery-coordinator-service");
const { createCodexThreadTaskCardService } = require("../adapters/codex-thread-task-card-service");
const { createHomeAiTtsService } = require("../adapters/home-ai-tts-service");
const { createNativeSecureSecretBrokerService } = require("../adapters/native-secure-secret-broker-service");
const { createPluginConversationActionBridgeService } = require("../adapters/plugin-conversation-action-bridge-service");
const { createWardrobeOutfitWearIntentActionService } = require("../adapters/wardrobe-outfit-wear-intent-action-service");
const { createWorkspaceOnboardingService } = require("../adapters/workspace-onboarding-service");
function callBootTrace(deps, label) { if (typeof deps.bootTrace === "function") deps.bootTrace(label); }
function createMobileApiComposition(deps = {}) {
  const platformComposition = createMobileApiPlatformComposition(deps);
  const {
    accessKeyApiRoutes,
    familyProfileApiRoutes,
    nativeDeviceApiRoutes,
    nativeEnvironmentContextApiRoutes,
    nativeIosShellApiRoutes,
    ownerElevationApiRoutes,
    ownerSystemConsoleApiRoutes,
    platformCurrencyApiRoutes,
    publicApiRoutes,
    pushApiRoutes,
    resourceApiRoutes,
    runtimeConfigApiRoutes,
    systemApiRoutes,
    workspaceApiRoutes,
  } = platformComposition.routes;
  const {
    familyProfileInsightService,
    familyProfileProjectionService,
    familyProfileRepository,
    familyProfileService,
    currentEnvironmentContextService,
    nativeIosShellVersionPolicyService,
    ownerSystemConsoleService,
    platformCurrencyService,
    systemResourceStatusService,
  } = platformComposition.services;

  const pluginComposition = createMobileApiPluginComposition(deps);
  const {
    actionInboxApiRoutes,
    codexMobileRecoveryApiRoutes,
    hermesPluginApiRoutes,
    pluginTopicApiRoutes,
    pluginTopicContextApiRoutes,
    pluginTopicUsageApiRoutes,
  } = pluginComposition.routes;
  const {
    actionInboxService, actionInboxTodoService,
    codexMobileRecoveryService,
    financeLedgerJoinApprovalService,
    hermesPluginNotificationService,
    hermesPluginService,
    pluginDirectoryContextBindingService,
    pluginTopicBindingService,
    pluginTopicContextSourceService,
    pluginTopicUsageService,
  } = pluginComposition.services;
  const workspaceOnboardingService = deps.workspaceOnboardingService || createWorkspaceOnboardingService({
    defaultPluginIds: deps.workspaceOnboardingDefaultPluginIds,
    ensureWorkspaceGateway: (...args) => deps.gatewayWorkspaceProvisioningService.ensureWorkspaceGateway(...args),
    findWorkspace: deps.findWorkspace,
    hermesPluginService,
    liveRoot: deps.workspaceOnboardingLiveRoot,
    nowIso: deps.nowIso,
    rotateWorkspaceAccessKey: deps.rotateWorkspaceAccessKey,
    systemProvisioningExecutor: deps.workspaceSystemProvisioningExecutor,
    upsertLocalWorkspace: deps.upsertLocalWorkspace,
  });
  const workspaceOnboardingApiRoutes = createWorkspaceOnboardingApiRoutes({
    isOwnerAuth: deps.isOwnerAuth,
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    sendJson: deps.sendJson,
    workspaceOnboardingService,
  });
  const directoryComposition = createMobileApiDirectoryComposition(Object.assign({}, deps, {
    actionInboxService,
  }));
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

  const voiceComposition = createMobileApiVoiceComposition(deps);
  const { voiceInputApiRoutes } = voiceComposition.routes;
  const {
    voiceInputAsrProvider,
    voiceInputCorrectionService,
    voiceInputService,
  } = voiceComposition.services;

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
    isOwnerAuth: deps.isOwnerAuth,
    makeId: deps.makeId,
    maxUploadBytes: deps.maxUploadBytes,
    normalizeThread: (...args) => deps.getRuntimeStateNormalizationService().normalizeThread(...args),
    nowIso: deps.nowIso,
    pruneEmptyThreads: (...args) => deps.getRuntimeStateThreadService().pruneEmptyThreads(...args),
    readBody: deps.readBody,
    registerUploadArtifact: deps.registerUploadArtifact,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    resolveBrowserPathAsync: (...args) => deps.getDirectoryBrowserBoundaryService().resolveBrowserPathAsync(...args),
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
    addThreadEvent: deps.addThreadEvent,
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
    findGroupChatThreadForWorkspace: (...args) => deps.getSingleWindowThreadService().findGroupChatThreadForWorkspace(...args),
    findThreadForRequest: (...args) => deps.getRuntimeStateThreadService().findThreadForRequest(...args),
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
  });

  const threadMessageRunApiRoutes = createThreadMessageRunApiRoutes({
    handleThreadMessageCreate: (...args) => deps.getThreadMessageRunRouteService().handleThreadMessageCreate(...args),
    handleThreadMessageOwnerElevation: (...args) => deps.getThreadMessageRunRouteService().handleThreadMessageOwnerElevation(...args),
  });

  const todoApiRoutes = createTodoApiRoutes({
    actionInboxService,
    actionInboxTodoService,
    boolParam: deps.boolParam,
    broadcast: deps.broadcast,
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    runTodoWebPushTick: deps.webPushDeliveryService.runTodoWebPushTick,
    sendJson: deps.sendJson,
    workspacePrincipal: deps.workspacePrincipal,
  });
  callBootTrace(deps, "todo api routes ready");

  const learningComposition = createMobileApiLearningComposition(deps);
  const {
    growthPluginFacadeApiRoutes,
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
    growthPluginFacadeService,
    learningGrowthSubmissionService,
    learningGrowthTeachingCheckService,
    learningGrowthExperienceSignalService,
    learningGrowthStageAssessmentService,
  } = learningComposition.services;
  const pluginWorkspaceAuditService = deps.pluginWorkspaceAuditService || createPluginWorkspaceAuditService({ actionInboxService, auditTargets: deps.pluginWorkspaceAuditTargets, compactText: deps.compactText, env: deps.env, isPathProtected: deps.isPathProtected, nowIso: deps.nowIso, pluginService: hermesPluginService, resolveAuditTarget: deps.resolvePluginWorkspaceAuditTarget, resolveAutomationCronProfile: deps.resolveAutomationCronProfile });

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
    pluginWorkspaceAuditService,
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    resolveAuthorizedCronDeliverableFile: deps.resolveAuthorizedCronDeliverableFile,
    resolveAuthorizedCronOutputFile: deps.resolveAuthorizedCronOutputFile,
    resolveAutomationCronProfile: deps.resolveAutomationCronProfile,
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
  const dataContextComposition = createMobileApiDataContextComposition(deps);
  const { routes: { dataContextApiRoutes }, services: { dataContextService } } = dataContextComposition;
  callBootTrace(deps, "data context api routes ready");
  const homeAiTtsService = deps.homeAiTtsService || createHomeAiTtsService({
    dataDir: deps.DATA_DIR || deps.dataDir,
    env: deps.env || process.env,
  });
  const homeAiTtsApiRoutes = createHomeAiTtsApiRoutes({
    homeAiTtsService,
    readBody: deps.readBody,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "home ai tts api routes ready");
  const nativeSecureSecretBrokerService = deps.nativeSecureSecretBrokerService || createNativeSecureSecretBrokerService({
    nowMs: deps.nowMs,
  });
  const nativeSecureSecretApiRoutes = createNativeSecureSecretApiRoutes({
    nativeSecureSecretBrokerService,
    readBody: deps.readBody,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "native secure secret api routes ready");
  const aiOpsDiagnosticIntakeService = deps.aiOpsDiagnosticIntakeService || createAiOpsDiagnosticIntakeService({
    dataDir: deps.DATA_DIR || deps.dataDir,
    env: deps.env || process.env,
  });
  const codexThreadTaskCardService = deps.codexThreadTaskCardService || createCodexThreadTaskCardService({
    env: deps.env || process.env,
  });
  const autonomousDeliveryCoordinatorService = deps.autonomousDeliveryCoordinatorService || createAutonomousDeliveryCoordinatorService({
    actionInboxService,
    store: deps.mobileSqliteStore,
    taskCardService: codexThreadTaskCardService,
  });
  const autonomousDeliveryApiRoutes = createAutonomousDeliveryApiRoutes({
    autonomousDeliveryCoordinatorService,
    broadcast: deps.broadcast,
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "autonomous delivery api routes ready");
  const aiOpsDiagnosticRemediationWorkflowService = deps.aiOpsDiagnosticRemediationWorkflowService || createAiOpsDiagnosticRemediationWorkflowService({
    actionInboxService,
    appRouteUrl: deps.appRouteUrl,
    diagnosticIntakeService: aiOpsDiagnosticIntakeService,
    sendPushNotification: deps.webPushDeliveryService?.sendPushNotification,
    taskCardService: codexThreadTaskCardService,
  });
  const aiOpsDiagnosticApiRoutes = createAiOpsDiagnosticApiRoutes({
    aiOpsDiagnosticIntakeService,
    aiOpsDiagnosticRemediationWorkflowService,
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
  });
  callBootTrace(deps, "ai ops diagnostic api routes ready");
  const pluginConversationActionBridgeService = deps.pluginConversationActionBridgeService || createPluginConversationActionBridgeService({
    actionInboxService,
    appRouteUrl: deps.appRouteUrl,
    pluginTargets: deps.pluginConversationActionTargets,
    sendPushNotification: deps.webPushDeliveryService?.sendPushNotification,
    taskCardService: codexThreadTaskCardService,
  });
  const wardrobeOutfitWearIntentActionService = deps.wardrobeOutfitWearIntentActionService || createWardrobeOutfitWearIntentActionService({
    broadcast: deps.broadcast,
    compactMessage: deps.compactMessage,
    dataDir: deps.DATA_DIR || deps.dataDir,
    nowIso: deps.nowIso,
    saveState: deps.saveState,
    threadSummary: deps.threadSummary,
    wardrobeUserDriveRoot: deps.wardrobeUserDriveRoot,
  });
  const pluginConversationActionApiRoutes = createPluginConversationActionApiRoutes({
    broadcast: deps.broadcast,
    findThreadForRequest: (...args) => deps.getRuntimeStateThreadService().findThreadForRequest(...args),
    pluginConversationActionBridgeService,
    readBody: deps.readBody,
    requireOwner: deps.requireOwner,
    requireWorkspaceAccess: deps.requireWorkspaceAccess,
    sendJson: deps.sendJson,
    wardrobeOutfitWearIntentActionService,
  });
  callBootTrace(deps, "plugin conversation action api routes ready");
  const mobileApiDispatcher = createMobileApiDispatcher({
    accessKeyApiRoutes,
    actionInboxApiRoutes,
    autonomousDeliveryApiRoutes,
    aiOpsDiagnosticApiRoutes,
    attachClientVersionHeaders: deps.attachClientVersionHeaders,
    authenticateRequest: deps.authenticateRequest,
    automationApiRoutes,
    buildRequestContext: deps.buildRequestContext,
    directoryBrowserApiRoutes,
    directoryMutationApiRoutes,
    directoryShareApiRoutes,
    dataContextApiRoutes,
    familyProfileApiRoutes,
    fileArtifactApiRoutes,
    codexMobileRecoveryApiRoutes,
    hermesPluginApiRoutes,
    pluginConversationActionApiRoutes,
    pluginTopicApiRoutes,
    pluginTopicContextApiRoutes,
    pluginTopicUsageApiRoutes,
    platformCurrencyApiRoutes,
    growthPluginFacadeApiRoutes,
    homeAiTtsApiRoutes,
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
    nativeDeviceApiRoutes,
    nativeEnvironmentContextApiRoutes,
    nativeIosShellApiRoutes,
    nativeSecureSecretApiRoutes,
    ownerElevationApiRoutes,
    ownerSystemConsoleApiRoutes,
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
    voiceInputApiRoutes,
    workspaceOnboardingApiRoutes,
    workspaceApiRoutes,
  });
  callBootTrace(deps, "core api routes ready");

  return {
    eventStreamApiRoutes,
    mobileApiDispatcher,
    services: {
      actionInboxService,
      actionInboxTodoService,
      aiOpsDiagnosticIntakeService,
      aiOpsDiagnosticRemediationWorkflowService,
      autonomousDeliveryCoordinatorService,
      codexMobileRecoveryService,
      codexThreadTaskCardService,
      currentEnvironmentContextService,
      nativeIosShellVersionPolicyService,
      familyProfileInsightService,
      familyProfileProjectionService,
      familyProfileRepository,
      familyProfileService,
      financeLedgerJoinApprovalService,
      growthPluginFacadeService,
      learningGrowthSubmissionService,
      ownerSystemConsoleService,
      platformCurrencyService,
      pluginWorkspaceAuditService,
      pluginConversationActionBridgeService,
      wardrobeOutfitWearIntentActionService,
      learningGrowthTeachingCheckService,
      learningGrowthExperienceSignalService,
      learningGrowthStageAssessmentService,
      dataContextService,
      hermesPluginService,
      hermesPluginNotificationService,
      homeAiTtsService,
      noteReceiptSaveService,
      nativeSecureSecretBrokerService,
      pluginDirectoryContextBindingService,
      pluginTopicBindingService,
      pluginTopicContextSourceService,
      pluginTopicUsageService,
      voiceInputAsrProvider,
      voiceInputCorrectionService,
      voiceInputService,
      workspaceOnboardingService,
      systemResourceStatusService,
    },
    routes: {
      accessKeyApiRoutes,
      actionInboxApiRoutes,
      autonomousDeliveryApiRoutes,
      aiOpsDiagnosticApiRoutes,
      automationApiRoutes,
      dataContextApiRoutes,
      directoryBrowserApiRoutes,
      directoryMutationApiRoutes,
      directoryShareApiRoutes,
      familyProfileApiRoutes,
      fileArtifactApiRoutes,
      codexMobileRecoveryApiRoutes,
      hermesPluginApiRoutes,
      pluginConversationActionApiRoutes,
      pluginTopicApiRoutes,
      pluginTopicContextApiRoutes,
      pluginTopicUsageApiRoutes,
      platformCurrencyApiRoutes,
      growthPluginFacadeApiRoutes,
      homeAiTtsApiRoutes,
      kanbanCardApiRoutes,
      kanbanLearningGuidanceApiRoutes,
      kanbanStudyApiRoutes,
      learningApiRoutes,
      learningCoinApiRoutes,
      learningGrowthCardApiRoutes,
      learningParentReviewApiRoutes,
      learningProgramApiRoutes,
      ownerElevationApiRoutes,
      ownerSystemConsoleApiRoutes,
      nativeSecureSecretApiRoutes,
      nativeIosShellApiRoutes,
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
      voiceInputApiRoutes,
      workspaceOnboardingApiRoutes,
      workspaceApiRoutes,
    },
  };
}

module.exports = {
  createMobileApiComposition,
};
