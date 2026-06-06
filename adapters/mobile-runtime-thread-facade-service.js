"use strict";

const { createThreadRuntimeCompositionService: defaultCreateThreadRuntimeCompositionService } = require("./thread-runtime-composition-service");

function requiredFactory(options, name, fallback = null) {
  const value = options[name] || fallback;
  if (typeof value === "function") return value;
  throw new Error(`MobileRuntimeThreadFacadeService requires ${name}`);
}

function createMobileRuntimeThreadFacadeService(options = {}) {
  const createThreadRuntimeCompositionService = requiredFactory(
    options,
    "createThreadRuntimeCompositionService",
    defaultCreateThreadRuntimeCompositionService
  );

  let threadRuntimeCompositionService = null;

  function getThreadRuntimeCompositionService() {
    if (!threadRuntimeCompositionService) {
      const webPushDeliveryService = typeof options.webPushDeliveryService === "function"
        ? options.webPushDeliveryService()
        : options.webPushDeliveryService;
      threadRuntimeCompositionService = createThreadRuntimeCompositionService({
        attachUploadedArtifactsToMessage: options.attachUploadedArtifactsToMessage,
        authCanAccessWorkspace: options.authCanAccessWorkspace,
        authenticateRequest: options.authenticateRequest,
        actionInboxService: options.actionInboxService,
        broadcast: options.broadcast,
        buildUserMessageContent: (...args) => options.getRuntimeStateThreadService().buildUserMessageContent(...args),
        chatGroupMemberWorkspaceIds: options.chatGroupMemberWorkspaceIds,
        compactMessage: options.compactMessage,
        compactThread: options.compactThread,
        compactThreadWithMessagePage: options.compactThreadWithMessagePage,
        deriveTitle: options.deriveTitle,
        detectDirectKanbanCreateRequest: options.detectDirectKanbanCreateRequest,
        detectDirectTodoCreateIntent: options.detectDirectTodoCreateIntent,
        detectDirectTodoCreateIntentForWeb: options.detectDirectTodoCreateIntentForWeb,
        directTodoCreateEnabled: options.directTodoCreateEnabled,
        findThreadForRequest: (...args) => options.getRuntimeStateThreadService().findThreadForRequest(...args),
        findWorkspace: options.findWorkspace,
        formatDirectTodoCreateSuccessMessage: options.formatDirectTodoCreateSuccessMessage,
        gatewayRoutingForModelRun: options.gatewayRoutingForModelRun,
        groupChatTaskGroupId: options.groupChatTaskGroupId,
        interpretKanbanNaturalLanguage: options.interpretKanbanNaturalLanguage,
        isKanbanCaseTopicThread: (...args) => options.getSingleWindowThreadService().isKanbanCaseTopicThread(...args),
        isOwnerAuth: options.isOwnerAuth,
        kanbanCardProvider: options.kanbanCardProvider,
        kanbanCaseTopicPermissionsForTaskGroup: options.kanbanCaseTopicPermissionsForTaskGroup,
        kanbanSingleCardCasePayload: options.kanbanSingleCardCasePayload,
        makeId: options.makeId,
        maxMessageChars: options.maxMessageChars,
        normalizeTaskGroupMeta: (...args) => options.getRuntimeStateNormalizationService().normalizeTaskGroupMeta(...args),
        notifyGroupChatMentions: webPushDeliveryService?.notifyGroupChatMentions,
        notifyTodoCreated: webPushDeliveryService?.notifyTodoCreated,
        nowIso: options.nowIso,
        ownerElevationInstructions: options.ownerElevationInstructions,
        precedingUserMessageForAssistant: options.precedingUserMessageForAssistant,
        publicArtifactFromClient: options.publicArtifactFromClient,
        publicTodo: options.publicTodo,
        readBody: options.readBody,
        removeThreadActiveRun: options.removeThreadActiveRun,
        requireOwner: options.requireOwner,
        resolveTaskDirectoryAttachment: (...args) => options.getSemanticDirectoryAttachmentService().resolveTaskDirectoryAttachment(...args),
        runConcurrencyError: options.runConcurrencyError,
        runConcurrencySnapshot: options.runConcurrencySnapshot,
        sanitizeElevationScope: options.sanitizeElevationScope,
        sanitizeTaskGroupId: (...args) => options.getRuntimeStateNormalizationService().sanitizeTaskGroupId(...args),
        saveState: options.saveState,
        semanticTaskDirectoryAttachment: (...args) => options.getSemanticDirectoryAttachmentService().semanticTaskDirectoryAttachment(...args),
        sendJson: options.sendJson,
        senderInfoForWorkspace: options.senderInfoForWorkspace,
        singleWindowChatTaskGroupId: options.singleWindowChatTaskGroupId,
        startRunForThread: options.startRunForThread,
        taskDirectoryAttachmentForGroup: (...args) => options.getSemanticDirectoryAttachmentService().taskDirectoryAttachmentForGroup(...args),
        taskGroupHasRunningRun: options.taskGroupHasRunningRun,
        threadMessageInitialLimit: options.threadMessageInitialLimit,
        threadSummary: options.threadSummary,
        todoAssigneeLabel: options.todoAssigneeLabel,
        todoProvider: options.todoProvider,
        useKanbanTodoBackend: options.useKanbanTodoBackend,
        validReasoningEfforts: options.validReasoningEfforts,
        verifyDirectTodoCreateResult: options.verifyDirectTodoCreateResult,
        workspaceIdForPrincipal: options.workspaceIdForPrincipal,
        workspacePrincipal: options.workspacePrincipal,
      });
    }
    return threadRuntimeCompositionService;
  }

  function callService(methodName, args) {
    return getThreadRuntimeCompositionService()[methodName](...args);
  }

  return Object.freeze({
    getThreadDirectCreateExecutionService: (...args) => callService("getThreadDirectCreateExecutionService", args),
    getThreadMessageCreateService: (...args) => callService("getThreadMessageCreateService", args),
    getThreadMessageRunRouteService: (...args) => callService("getThreadMessageRunRouteService", args),
    getThreadOwnerElevationRetryService: (...args) => callService("getThreadOwnerElevationRetryService", args),
    getThreadRuntimeCompositionService,
  });
}

module.exports = {
  createMobileRuntimeThreadFacadeService,
};
