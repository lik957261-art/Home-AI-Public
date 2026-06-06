"use strict";

const assert = require("node:assert/strict");
const { createMobileRuntimeThreadFacadeService } = require("../adapters/mobile-runtime-thread-facade-service");

let createCalls = 0;
let capturedOptions = null;
const compositionService = {
  getThreadDirectCreateExecutionService: (...args) => ({ method: "direct", args }),
  getThreadMessageCreateService: (...args) => ({ method: "message", args }),
  getThreadMessageRunRouteService: (...args) => ({ method: "run-route", args }),
  getThreadOwnerElevationRetryService: (...args) => ({ method: "owner-retry", args }),
};

const runtimeStateThreadService = {
  buildUserMessageContent: (...args) => ({ source: "message-content", args }),
  findThreadForRequest: (...args) => ({ source: "thread-request", args }),
};
const runtimeStateNormalizationService = {
  normalizeTaskGroupMeta: (...args) => ({ source: "task-meta", args }),
  sanitizeTaskGroupId: (...args) => `task:${args[0]}`,
};
const singleWindowThreadService = {
  isKanbanCaseTopicThread: (...args) => ({ source: "case-topic", args }),
};
const semanticDirectoryAttachmentService = {
  resolveTaskDirectoryAttachment: (...args) => ({ source: "resolve-directory", args }),
  semanticTaskDirectoryAttachment: (...args) => ({ source: "semantic-directory", args }),
  taskDirectoryAttachmentForGroup: (...args) => ({ source: "group-directory", args }),
};
const webPushDeliveryService = {
  notifyGroupChatMentions: (...args) => ({ source: "mention-push", args }),
  notifyTodoCreated: (...args) => ({ source: "todo-push", args }),
};

const baseOptions = {
  actionInboxService: { list: () => [] },
  attachUploadedArtifactsToMessage: () => {},
  authCanAccessWorkspace: () => true,
  authenticateRequest: () => ({ user: "owner" }),
  broadcast: () => {},
  chatGroupMemberWorkspaceIds: () => ["owner"],
  compactMessage: (message) => ({ id: message.id }),
  compactThread: (thread) => ({ id: thread.id }),
  compactThreadWithMessagePage: (thread) => ({ id: thread.id, page: true }),
  createThreadRuntimeCompositionService(options) {
    createCalls += 1;
    capturedOptions = options;
    return compositionService;
  },
  deriveTitle: (text) => String(text || "").slice(0, 10),
  detectDirectKanbanCreateRequest: () => null,
  detectDirectTodoCreateIntent: () => null,
  detectDirectTodoCreateIntentForWeb: () => null,
  directTodoCreateEnabled: () => true,
  findWorkspace: (workspaceId) => ({ id: workspaceId }),
  formatDirectTodoCreateSuccessMessage: () => "created",
  gatewayRoutingForModelRun: () => ({ profile: "openai" }),
  getRuntimeStateNormalizationService: () => runtimeStateNormalizationService,
  getRuntimeStateThreadService: () => runtimeStateThreadService,
  getSemanticDirectoryAttachmentService: () => semanticDirectoryAttachmentService,
  getSingleWindowThreadService: () => singleWindowThreadService,
  groupChatTaskGroupId: "group-chat",
  interpretKanbanNaturalLanguage: () => ({ kind: "kanban" }),
  isOwnerAuth: () => true,
  kanbanCardProvider: { listCards: () => [] },
  kanbanCaseTopicPermissionsForTaskGroup: () => ({ canView: true }),
  kanbanSingleCardCasePayload: () => ({ single: true }),
  makeId: (prefix) => `${prefix}_fixture`,
  maxMessageChars: 4000,
  nowIso: () => "2026-06-07T00:00:00.000Z",
  ownerElevationInstructions: () => "owner instructions",
  precedingUserMessageForAssistant: () => null,
  publicArtifactFromClient: (artifact) => ({ artifact }),
  publicTodo: (todo) => ({ id: todo.id }),
  readBody: () => "{}",
  removeThreadActiveRun: () => {},
  requireOwner: () => ({ ok: true }),
  runConcurrencyError: () => null,
  runConcurrencySnapshot: () => ({ active: 0 }),
  sanitizeElevationScope: (scope) => scope,
  saveState: () => {},
  sendJson: () => {},
  senderInfoForWorkspace: (workspaceId) => ({ workspaceId }),
  singleWindowChatTaskGroupId: "chat",
  startRunForThread: () => ({ run: true }),
  taskGroupHasRunningRun: () => false,
  threadMessageInitialLimit: 30,
  threadSummary: (thread) => ({ id: thread.id }),
  todoAssigneeLabel: () => "Owner",
  todoProvider: { list: () => [] },
  useKanbanTodoBackend: () => false,
  validReasoningEfforts: ["minimal", "low"],
  verifyDirectTodoCreateResult: () => ({ ok: true }),
  webPushDeliveryService: () => webPushDeliveryService,
  workspaceIdForPrincipal: (principalId) => `workspace:${principalId}`,
  workspacePrincipal: (workspaceId) => `principal:${workspaceId}`,
};

const facade = createMobileRuntimeThreadFacadeService(baseOptions);

assert.equal(createCalls, 0);
assert.equal(facade.getThreadRuntimeCompositionService(), compositionService);
assert.equal(facade.getThreadRuntimeCompositionService(), compositionService);
assert.equal(createCalls, 1);

assert.deepEqual(facade.getThreadOwnerElevationRetryService("a"), { method: "owner-retry", args: ["a"] });
assert.deepEqual(facade.getThreadMessageCreateService("b"), { method: "message", args: ["b"] });
assert.deepEqual(facade.getThreadDirectCreateExecutionService("c"), { method: "direct", args: ["c"] });
assert.deepEqual(facade.getThreadMessageRunRouteService("d"), { method: "run-route", args: ["d"] });
assert.equal(createCalls, 1);

assert.equal(capturedOptions.groupChatTaskGroupId, "group-chat");
assert.equal(capturedOptions.singleWindowChatTaskGroupId, "chat");
assert.equal(capturedOptions.threadMessageInitialLimit, 30);
assert.deepEqual(capturedOptions.validReasoningEfforts, ["minimal", "low"]);
assert.deepEqual(capturedOptions.buildUserMessageContent("msg"), { source: "message-content", args: ["msg"] });
assert.deepEqual(capturedOptions.findThreadForRequest("req"), { source: "thread-request", args: ["req"] });
assert.deepEqual(capturedOptions.normalizeTaskGroupMeta({ a: 1 }), { source: "task-meta", args: [{ a: 1 }] });
assert.equal(capturedOptions.sanitizeTaskGroupId("abc"), "task:abc");
assert.deepEqual(capturedOptions.isKanbanCaseTopicThread("thread"), { source: "case-topic", args: ["thread"] });
assert.deepEqual(capturedOptions.resolveTaskDirectoryAttachment("thread", "msg"), { source: "resolve-directory", args: ["thread", "msg"] });
assert.deepEqual(capturedOptions.semanticTaskDirectoryAttachment("thread"), { source: "semantic-directory", args: ["thread"] });
assert.deepEqual(capturedOptions.taskDirectoryAttachmentForGroup("thread", "group"), { source: "group-directory", args: ["thread", "group"] });
assert.deepEqual(capturedOptions.notifyGroupChatMentions("thread"), { source: "mention-push", args: ["thread"] });
assert.deepEqual(capturedOptions.notifyTodoCreated("todo"), { source: "todo-push", args: ["todo"] });

assert.throws(
  () => createMobileRuntimeThreadFacadeService({ createThreadRuntimeCompositionService: "bad" }),
  /requires createThreadRuntimeCompositionService/
);

console.log("mobile runtime thread facade service tests passed");
