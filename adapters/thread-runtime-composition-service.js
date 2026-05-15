"use strict";

const { createThreadDirectCreateExecutionService } = require("./thread-direct-create-execution-service");
const { createThreadMessageCreateService } = require("./thread-message-create-service");
const { createThreadMessageRunRouteService } = require("./thread-message-run-route-service");
const { createThreadOwnerElevationRetryService } = require("./thread-owner-elevation-retry-service");

function createThreadRuntimeCompositionService(deps = {}) {
  let ownerElevationRetryService = null;
  let messageCreateService = null;
  let directCreateExecutionService = null;
  let messageRunRouteService = null;

  function getOwnerElevationRetryService() {
    if (!ownerElevationRetryService) {
      ownerElevationRetryService = createThreadOwnerElevationRetryService({
        broadcast: deps.broadcast,
        compactMessage: deps.compactMessage,
        compactThread: deps.compactThread,
        gatewayRoutingForModelRun: deps.gatewayRoutingForModelRun,
        isOwnerAuth: deps.isOwnerAuth,
        makeId: deps.makeId,
        nowIso: deps.nowIso,
        ownerElevationInstructions: deps.ownerElevationInstructions,
        precedingUserMessageForAssistant: deps.precedingUserMessageForAssistant,
        removeThreadActiveRun: deps.removeThreadActiveRun,
        runConcurrencyError: deps.runConcurrencyError,
        runConcurrencySnapshot: deps.runConcurrencySnapshot,
        sanitizeElevationScope: deps.sanitizeElevationScope,
        saveState: deps.saveState,
        startRunForThread: deps.startRunForThread,
        threadSummary: deps.threadSummary,
      });
    }
    return ownerElevationRetryService;
  }

  function getMessageCreateService() {
    if (!messageCreateService) {
      messageCreateService = createThreadMessageCreateService({
        authCanAccessWorkspace: deps.authCanAccessWorkspace,
        broadcast: deps.broadcast,
        buildUserMessageContent: deps.buildUserMessageContent,
        chatGroupMemberWorkspaceIds: deps.chatGroupMemberWorkspaceIds,
        compactMessage: deps.compactMessage,
        deriveTitle: deps.deriveTitle,
        detectDirectKanbanCreateRequest: deps.detectDirectKanbanCreateRequest,
        detectDirectTodoCreateIntent: deps.detectDirectTodoCreateIntent,
        detectDirectTodoCreateIntentForWeb: deps.detectDirectTodoCreateIntentForWeb,
        directTodoCreateEnabled: deps.directTodoCreateEnabled,
        formatDirectTodoCreateSuccessMessage: deps.formatDirectTodoCreateSuccessMessage,
        gatewayRoutingForModelRun: deps.gatewayRoutingForModelRun,
        groupChatTaskGroupId: deps.groupChatTaskGroupId,
        isKanbanCaseTopicThread: deps.isKanbanCaseTopicThread,
        isOwnerAuth: deps.isOwnerAuth,
        kanbanCaseTopicPermissionsForTaskGroup: deps.kanbanCaseTopicPermissionsForTaskGroup,
        kanbanSingleCardCasePayload: deps.kanbanSingleCardCasePayload,
        makeId: deps.makeId,
        normalizeTaskGroupMeta: deps.normalizeTaskGroupMeta,
        notifyGroupChatMentions: deps.notifyGroupChatMentions,
        notifyTodoCreated: deps.notifyTodoCreated,
        nowIso: deps.nowIso,
        ownerElevationInstructions: deps.ownerElevationInstructions,
        publicArtifactFromClient: deps.publicArtifactFromClient,
        removeThreadActiveRun: deps.removeThreadActiveRun,
        resolveTaskDirectoryAttachment: deps.resolveTaskDirectoryAttachment,
        runConcurrencyError: deps.runConcurrencyError,
        runConcurrencySnapshot: deps.runConcurrencySnapshot,
        sanitizeTaskGroupId: deps.sanitizeTaskGroupId,
        saveState: deps.saveState,
        semanticTaskDirectoryAttachment: deps.semanticTaskDirectoryAttachment,
        senderInfoForWorkspace: deps.senderInfoForWorkspace,
        singleWindowChatTaskGroupId: deps.singleWindowChatTaskGroupId,
        startRunForThread: deps.startRunForThread,
        taskDirectoryAttachmentForGroup: deps.taskDirectoryAttachmentForGroup,
        taskGroupHasRunningRun: deps.taskGroupHasRunningRun,
        threadSummary: deps.threadSummary,
        todoAssigneeLabel: deps.todoAssigneeLabel,
        useKanbanTodoBackend: deps.useKanbanTodoBackend,
        validReasoningEfforts: deps.validReasoningEfforts,
        workspaceIdForPrincipal: deps.workspaceIdForPrincipal,
        workspacePrincipal: deps.workspacePrincipal,
      });
    }
    return messageCreateService;
  }

  function getDirectCreateExecutionService() {
    if (!directCreateExecutionService) {
      directCreateExecutionService = createThreadDirectCreateExecutionService({
        broadcast: deps.broadcast,
        compactMessage: deps.compactMessage,
        findWorkspace: deps.findWorkspace,
        formatDirectTodoCreateSuccessMessage: deps.formatDirectTodoCreateSuccessMessage,
        interpretKanbanNaturalLanguage: deps.interpretKanbanNaturalLanguage,
        kanbanCardProvider: deps.kanbanCardProvider,
        publicTodo: deps.publicTodo,
        saveState: deps.saveState,
        threadMessageCreateService: getMessageCreateService(),
        threadSummary: deps.threadSummary,
        todoAssigneeLabel: deps.todoAssigneeLabel,
        todoProvider: deps.todoProvider,
        verifyDirectTodoCreateResult: deps.verifyDirectTodoCreateResult,
        workspacePrincipal: deps.workspacePrincipal,
        compactResponseThread: (...args) => getMessageRunRouteService().compactThreadForMessageCreatePlan(...args),
        nowIso: deps.nowIso,
      });
    }
    return directCreateExecutionService;
  }

  function getMessageRunRouteService() {
    if (!messageRunRouteService) {
      messageRunRouteService = createThreadMessageRunRouteService({
        attachUploadedArtifactsToMessage: deps.attachUploadedArtifactsToMessage,
        authenticateRequest: deps.authenticateRequest,
        compactThread: deps.compactThread,
        compactThreadWithMessagePage: deps.compactThreadWithMessagePage,
        findThreadForRequest: deps.findThreadForRequest,
        getThreadDirectCreateExecutionService: getDirectCreateExecutionService,
        getThreadMessageCreateService: getMessageCreateService,
        getThreadOwnerElevationRetryService: getOwnerElevationRetryService,
        nowIso: deps.nowIso,
        readBody: deps.readBody,
        requireOwner: deps.requireOwner,
        sendJson: deps.sendJson,
        threadMessageInitialLimit: deps.threadMessageInitialLimit,
      });
    }
    return messageRunRouteService;
  }

  return {
    getThreadDirectCreateExecutionService: getDirectCreateExecutionService,
    getThreadMessageCreateService: getMessageCreateService,
    getThreadMessageRunRouteService: getMessageRunRouteService,
    getThreadOwnerElevationRetryService: getOwnerElevationRetryService,
  };
}

module.exports = {
  createThreadRuntimeCompositionService,
};
