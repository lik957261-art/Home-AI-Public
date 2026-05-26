"use strict";

const assert = require("node:assert/strict");
const { createThreadDirectCreateExecutionService } = require("../adapters/thread-direct-create-execution-service");

function baseThread(overrides = {}) {
  return Object.assign({
    id: "thread-1",
    title: "Existing title",
    workspaceId: "owner",
    messages: [],
    status: "running",
    updatedAt: "",
  }, overrides);
}

function directTodoPlan(thread, overrides = {}) {
  return Object.assign({
    thread,
    nextAction: "direct-todo-create",
    text: "create direct todo",
    directAction: {
      type: "todo",
      intent: {
        assignee: "child-principal",
        assigneeLabel: "Child",
        dueTime: "2026-05-16 09:00",
        content: "read chapter",
      },
    },
    userMessage: { id: "msg-user", role: "user", status: "done" },
    assistantMessage: { id: "msg-assistant", role: "assistant", status: "queued" },
  }, overrides);
}

function directKanbanPlan(thread, overrides = {}) {
  return Object.assign({
    thread,
    nextAction: "direct-kanban-create",
    text: "create direct kanban card",
    directAction: { type: "kanban" },
    userMessage: { id: "msg-user", role: "user", status: "done" },
    assistantMessage: { id: "msg-assistant", role: "assistant", status: "queued" },
  }, overrides);
}

function makeHarness(overrides = {}) {
  const calls = {
    broadcasts: [],
    compactResponses: [],
    format: [],
    inbox: [],
    interpret: [],
    kanbanAdd: [],
    kanbanNotifications: [],
    publicTodo: [],
    saveState: 0,
    title: [],
    todoAdd: [],
    todoNotifications: [],
    verify: [],
  };

  const service = createThreadDirectCreateExecutionService(Object.assign({
    nowIso: () => "2026-05-15T01:02:03.000Z",
    todoProvider: {
      async addTodo(payload) {
        calls.todoAdd.push(payload);
        if (overrides.todoThrows) throw new Error(overrides.todoThrows);
        return overrides.todoResult || {
          ok: true,
          id: "todo-1",
          content: payload.content,
          source: "local",
        };
      },
    },
    kanbanCardProvider: {
      async addCard(payload) {
        calls.kanbanAdd.push(payload);
        if (overrides.kanbanThrows) throw new Error(overrides.kanbanThrows);
        return overrides.kanbanResult || {
          ok: true,
          id: "card-1",
          content: payload.content,
          source: "kanban",
          kanbanBoard: `workspace-${payload.workspaceId}`,
          kanbanStatus: "todo",
        };
      },
    },
    async interpretKanbanNaturalLanguage(text, workspace, principal) {
      calls.interpret.push({ text, workspace, principal });
      if (overrides.interpretThrows) throw new Error(overrides.interpretThrows);
      return overrides.kanbanDraft || {
        assignee: "child-principal",
        content: "kanban card",
        description: "card details",
        dueTime: "2026-05-17 10:00",
        reason: "natural language",
      };
    },
    findWorkspace(workspaceId) {
      return { id: workspaceId, label: `Workspace ${workspaceId}` };
    },
    workspacePrincipal(workspaceId) {
      return `principal:${workspaceId}`;
    },
    buildDirectTodoAddPayload(plan) {
      return {
        workspaceId: plan.thread.workspaceId,
        assignee: plan.directAction.intent.assignee,
        content: plan.directAction.intent.content,
        dueTime: plan.directAction.intent.dueTime,
        suppressExternalNotice: true,
        reminderLeadMinutes: null,
        recurrence: "none",
        recurrenceDays: "",
        recurrenceUntil: "",
        manualOnly: true,
      };
    },
    buildDirectKanbanAddPayload(plan, draft) {
      return {
        workspaceId: plan.thread.workspaceId,
        assignee: draft.assignee,
        assigneeLabel: `label:${draft.assignee}`,
        content: draft.content,
        description: draft.description,
        dueTime: draft.dueTime,
        reason: draft.reason,
        sourceText: plan.text,
      };
    },
    publicTodo(result) {
      calls.publicTodo.push(result);
      return result.publicTodo || {
        id: result.id,
        content: result.content,
        source: result.source,
        kanbanBoard: result.kanbanBoard,
        kanbanStatus: result.kanbanStatus,
      };
    },
    actionInboxService: {
      upsertSourceItem(input) {
        calls.inbox.push(input);
        return { ok: true, item: { id: "ainb-direct-todo", workspaceId: input.workspaceId } };
      },
    },
    verifyDirectTodoCreateResult(todo) {
      calls.verify.push(todo);
      if (overrides.verifyResult) return overrides.verifyResult;
      return todo.id ? { ok: true, error: "" } : { ok: false, error: "missing visible id" };
    },
    formatDirectTodoCreateSuccessMessage(intent, todo) {
      calls.format.push({ intent, todo });
      return `formatted:${intent.assigneeLabel}|${intent.dueTime}|${intent.content}|${todo.id}`;
    },
    todoAssigneeLabel(_workspaceId, principalId) {
      return `label:${principalId}`;
    },
    workspaceIdForPrincipal(principalId) {
      return principalId ? `workspace:${principalId}` : "";
    },
    directTodoSuccessNotification(result, plan) {
      calls.todoNotifications.push({ result, planAction: plan.nextAction });
      return [
        { type: "todos.updated", workspaceId: plan.thread.workspaceId },
        { type: "todos.updated", workspaceId: "child" },
      ];
    },
    directKanbanSuccessNotifications(plan, draft) {
      calls.kanbanNotifications.push({ planAction: plan.nextAction, draft });
      return [
        { type: "kanban.updated", workspaceId: plan.thread.workspaceId },
        { type: "todos.updated", workspaceId: plan.thread.workspaceId },
        { type: "kanban.updated", workspaceId: "child" },
        { type: "todos.updated", workspaceId: "child" },
      ];
    },
    applyTitleUpdate(thread, plan) {
      calls.title.push({ threadId: thread.id, text: plan.text });
      thread.title = `title:${plan.text}`;
    },
    saveState() {
      calls.saveState += 1;
    },
    broadcast(payload) {
      calls.broadcasts.push(payload);
    },
    compactMessage(message) {
      return { id: message.id, status: message.status, content: message.content || "" };
    },
    threadSummary(thread) {
      return { id: thread.id, status: thread.status, messageCount: thread.messages.length };
    },
    compactResponseThread(thread, plan) {
      calls.compactResponses.push({ threadId: thread.id, action: plan.nextAction });
      return {
        id: thread.id,
        action: plan.nextAction,
        messageCount: thread.messages.length,
        updatedAt: thread.updatedAt,
      };
    },
  }, overrides.serviceOptions || {}));

  return { calls, service };
}

async function testDirectTodoSuccessFinalizesAndBroadcasts() {
  const { calls, service } = makeHarness();
  const thread = baseThread({ workspaceId: "family" });
  const plan = directTodoPlan(thread);

  const result = await service.executeDirectTodoCreate({ thread, plan });

  assert.equal(result.status, 201);
  assert.equal(result.response.ok, true);
  assert.equal(result.response.todo.id, "todo-1");
  assert.equal(result.response.inboxItem.id, "ainb-direct-todo");
  assert.equal(calls.inbox.length, 1);
  assert.equal(calls.inbox[0].sourceType, "manual");
  assert.equal(calls.inbox[0].itemType, "todo");
  assert.equal(calls.inbox[0].title, "read chapter");
  assert.equal(calls.inbox[0].workspaceId, "workspace:child-principal");
  assert.equal(calls.inbox[0].deepLink, "/?view=todos&workspaceId=workspace%3Achild-principal&todoId=todo-1");
  assert.equal(plan.assistantMessage.status, "done");
  assert.equal(plan.assistantMessage.content, "\u5df2\u65b0\u589e\u5f85\u529e\uff1aChild | 2026-05-16 09:00 | read chapter");
  assert.equal(plan.assistantMessage.error, null);
  assert.equal(plan.assistantMessage.completedAt, "2026-05-15T01:02:03.000Z");
  assert.equal(plan.assistantMessage.failedAt, "");
  assert.deepEqual(thread.messages.map((message) => message.id), ["msg-user", "msg-assistant"]);
  assert.equal(thread.status, "idle");
  assert.equal(thread.updatedAt, "2026-05-15T01:02:03.000Z");
  assert.equal(thread.title, "title:create direct todo");
  assert.equal(calls.saveState, 1);
  assert.deepEqual(calls.todoAdd[0], {
    workspaceId: "family",
    assignee: "child-principal",
    content: "read chapter",
    dueTime: "2026-05-16 09:00",
    suppressExternalNotice: true,
    reminderLeadMinutes: null,
    recurrence: "none",
    recurrenceDays: "",
    recurrenceUntil: "",
    manualOnly: true,
  });
  assert.deepEqual(calls.broadcasts.map((payload) => payload.type), [
    "thread.updated",
    "message.updated",
    "message.updated",
    "todos.updated",
    "todos.updated",
    "actionInbox.updated",
  ]);
  assert.equal(calls.todoNotifications.length, 1);
  assert.equal(result.response.thread.messageCount, 2);
}

async function testDirectTodoVerificationFailureFinalizesWithoutSuccessNotifications() {
  const { calls, service } = makeHarness({
    verifyResult: { ok: false, error: "missing visible card id" },
  });
  const thread = baseThread();
  const plan = directTodoPlan(thread);

  const result = await service.executeDirectTodoCreate({ thread, plan });

  assert.equal(result.status, 400);
  assert.equal(result.response.ok, false);
  assert.equal(result.response.todo, null);
  assert.equal(result.result.ok, false);
  assert.equal(result.result.error, "missing visible card id");
  assert.deepEqual(result.verification, { ok: false, error: "missing visible card id" });
  assert.equal(plan.assistantMessage.status, "failed");
  assert.equal(plan.assistantMessage.content, "\u65b0\u589e\u5f85\u529e\u5931\u8d25\uff1amissing visible card id");
  assert.equal(plan.assistantMessage.error, "missing visible card id");
  assert.equal(plan.assistantMessage.completedAt, "");
  assert.equal(plan.assistantMessage.failedAt, "2026-05-15T01:02:03.000Z");
  assert.equal(calls.publicTodo.length, 1);
  assert.equal(calls.verify.length, 1);
  assert.equal(calls.todoNotifications.length, 0);
  assert.deepEqual(calls.broadcasts.map((payload) => payload.type), [
    "thread.updated",
    "message.updated",
    "message.updated",
  ]);
}

async function testDirectKanbanSuccessUsesInterpreterAndFormatter() {
  const { calls, service } = makeHarness();
  const thread = baseThread({ workspaceId: "owner" });
  const plan = directKanbanPlan(thread);

  const result = await service.executeDirectKanbanCreate({ thread, plan });

  assert.equal(result.status, 201);
  assert.equal(result.response.ok, true);
  assert.equal(result.response.card.id, "card-1");
  assert.deepEqual(calls.interpret, [{
    text: "create direct kanban card",
    workspace: { id: "owner", label: "Workspace owner" },
    principal: "principal:owner",
  }]);
  assert.deepEqual(calls.kanbanAdd[0], {
    workspaceId: "owner",
    assignee: "child-principal",
    assigneeLabel: "label:child-principal",
    content: "kanban card",
    description: "card details",
    dueTime: "2026-05-17 10:00",
    reason: "natural language",
    sourceText: "create direct kanban card",
  });
  assert.equal(plan.assistantMessage.status, "done");
  assert.equal(plan.assistantMessage.content, "formatted:label:child-principal|2026-05-17 10:00|kanban card|card-1");
  assert.equal(calls.format.length, 1);
  assert.equal(calls.kanbanNotifications.length, 1);
  assert.deepEqual(calls.broadcasts.map((payload) => payload.type), [
    "thread.updated",
    "message.updated",
    "message.updated",
    "kanban.updated",
    "todos.updated",
    "kanban.updated",
    "todos.updated",
  ]);
  assert.equal(result.response.thread.messageCount, 2);
}

async function testDirectKanbanProviderFailureFinalizesWithoutVerification() {
  const { calls, service } = makeHarness({ kanbanThrows: "kanban bridge failed" });
  const thread = baseThread();
  const plan = directKanbanPlan(thread);

  const result = await service.executeDirectKanbanCreate({ thread, plan });

  assert.equal(result.status, 400);
  assert.equal(result.response.ok, false);
  assert.equal(result.response.card, null);
  assert.equal(result.result.error, "kanban bridge failed");
  assert.deepEqual(result.verification, { ok: false, error: "kanban bridge failed" });
  assert.equal(plan.assistantMessage.status, "failed");
  assert.equal(plan.assistantMessage.content, "\u65b0\u589e\u770b\u677f\u5361\u7247\u5931\u8d25\uff1akanban bridge failed");
  assert.equal(plan.assistantMessage.error, "kanban bridge failed");
  assert.equal(calls.interpret.length, 1);
  assert.equal(calls.kanbanAdd.length, 1);
  assert.equal(calls.publicTodo.length, 0);
  assert.equal(calls.verify.length, 0);
  assert.equal(calls.kanbanNotifications.length, 0);
  assert.deepEqual(calls.broadcasts.map((payload) => payload.type), [
    "thread.updated",
    "message.updated",
    "message.updated",
  ]);
}

(async () => {
  await testDirectTodoSuccessFinalizesAndBroadcasts();
  await testDirectTodoVerificationFailureFinalizesWithoutSuccessNotifications();
  await testDirectKanbanSuccessUsesInterpreterAndFormatter();
  await testDirectKanbanProviderFailureFinalizesWithoutVerification();
  console.log("thread-direct-create-execution-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
