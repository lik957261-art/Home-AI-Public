"use strict";

const assert = require("node:assert/strict");
const { createTodoProvider } = require("../adapters/todo-provider");

async function run() {
  const calls = [];
  const provider = createTodoProvider({
    async runBridge(payload) {
      calls.push(payload);
      if (payload.action === "list") {
        return {
          ok: true,
          todos: [
            { id: "td_1", content: "Buy milk", assignee: "user_a", due_local: "tomorrow" },
            { id: "td_2", content: "Call bank", assignee: "user_b", due_local: "today" },
          ],
        };
      }
      return Object.assign({ ok: true }, payload);
    },
    workspacePrincipal(workspaceId) {
      return `principal:${workspaceId}`;
    },
    todoAssigneesForWorkspace(workspaceId) {
      return [{ id: `assignee:${workspaceId}`, label: "Assignee" }];
    },
    publicTodo(row) {
      return {
        id: row.id,
        content: row.content,
        assigneeLabel: row.assignee,
        dueLocal: row.due_local,
      };
    },
    sourceName: () => "custom_todos",
  });

  const listed = await provider.listTodos({
    workspaceId: "workspace_a",
    scope: "all",
    includeCompleted: true,
    assignee: "user_a",
    limit: 20,
    search: "milk",
  });
  assert.equal(listed.ok, true);
  assert.equal(listed.source, "custom_todos");
  assert.deepEqual(listed.assignees, [{ id: "assignee:workspace_a", label: "Assignee" }]);
  assert.equal(listed.data.length, 1);
  assert.equal(listed.data[0].id, "td_1");
  assert.deepEqual(calls.at(-1), {
    action: "list",
    workspace_id: "workspace_a",
    source_principal: "principal:workspace_a",
    scope: "all",
    include_completed: true,
    assignee: "user_a",
    limit: 20,
  });

  await provider.addTodo({
    workspaceId: "workspace_b",
    assignee: "user_b",
    content: "Read report",
    dueTime: "2026-05-07 18:00",
    reminderLeadMinutes: 30,
    recurrence: "weekly",
    recurrenceDays: "1,3",
    recurrenceUntil: "2026-06-01",
  });
  assert.deepEqual(calls.at(-1), {
    action: "add",
    workspace_id: "workspace_b",
    source_principal: "principal:workspace_b",
    assignee: "user_b",
    content: "Read report",
    due_time: "2026-05-07 18:00",
    suppress_external_notice: true,
    reminder_lead_minutes: 30,
    recurrence: "weekly",
    recurrence_days: "1,3",
    recurrence_until: "2026-06-01",
    manual_only: true,
    auto_dispatch: false,
  });

  await provider.mutateTodo({
    workspaceId: "workspace_b",
    action: "postpone",
    todoId: "td_9",
    assignee: "user_b",
    recurrenceScope: "series",
    dueTime: "2026-05-08 09:00",
    reason: "later",
  });
  assert.deepEqual(calls.at(-1), {
    action: "postpone",
    workspace_id: "workspace_b",
    source_principal: "principal:workspace_b",
    todo_id: "td_9",
    assignee: "user_b",
    recurrence_scope: "series",
    due_time: "2026-05-08 09:00",
    reason: "later",
  });

  await provider.mutateTodo({
    workspaceId: "workspace_b",
    action: "comment",
    todoId: "td_9",
    comment: "approve preview only",
    author: "xuxin",
  });
  assert.deepEqual(calls.at(-1), {
    action: "comment",
    workspace_id: "workspace_b",
    source_principal: "principal:workspace_b",
    todo_id: "td_9",
    assignee: "",
    recurrence_scope: "one",
    due_time: "",
    reason: "",
    comment: "approve preview only",
    author: "xuxin",
  });

  await provider.pendingPushes({
    sourcePrincipal: "owner",
    principals: ["user_a"],
    limit: 10,
    recentCreateMinutes: 15,
    confirmedMarkKeys: ["todo:td_1:created_by_other"],
    retryWithoutReceiptMinutes: 5,
    retryLimit: 2,
  });
  assert.deepEqual(calls.at(-1), {
    action: "web_pending_pushes",
    source_principal: "owner",
    principals: ["user_a"],
    limit: 10,
    recent_create_minutes: 15,
    confirmed_mark_keys: ["todo:td_1:created_by_other"],
    retry_without_receipt_minutes: 5,
    retry_limit: 2,
  });

  await provider.markWebPush({
    markKey: "todo:td_1:created_by_other",
    todoId: "td_1",
    principalId: "user_a",
    messageType: "created_by_other",
    localDate: "2026-05-07",
    status: "shown",
    countAttempt: false,
    error: "",
  });
  assert.deepEqual(calls.at(-1), {
    action: "web_mark_push",
    markKey: "todo:td_1:created_by_other",
    todoId: "td_1",
    principalId: "user_a",
    messageType: "created_by_other",
    localDate: "2026-05-07",
    status: "shown",
    countAttempt: false,
    error: "",
  });
}

run()
  .then(() => console.log("todo-provider contract passed."))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
