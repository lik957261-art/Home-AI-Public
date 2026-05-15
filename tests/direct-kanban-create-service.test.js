"use strict";

const assert = require("node:assert/strict");
const { createDirectKanbanCreateService } = require("../adapters/direct-kanban-create-service");

function service(options = {}) {
  return createDirectKanbanCreateService({
    resolveTodoAssigneeFromText(text, workspaceId) {
      return String(text || "").includes("\u51e1\u51e1") ? "child" : `${workspaceId}-principal`;
    },
    todoAssigneeLabel(_workspaceId, principalId) {
      return principalId === "child" ? "\u51e1\u51e1" : principalId;
    },
    stripPrincipalLabelPrefixes(value) {
      return String(value || "").replace(/^weixin_/, "");
    },
    useKanbanTodoBackend() {
      return Boolean(options.kanbanBackend);
    },
  });
}

{
  const direct = service();
  const due = direct.parseWebTodoDueFromText("2026-05-16 09:30", new Date(2026, 4, 15, 13, 10));
  assert.deepEqual(due, { dueTime: "2026-05-16 09:30", raw: "2026-05-16 09:30" });
}

{
  const direct = service();
  const due = direct.parseWebTodoDueFromText(
    "\u660e\u5929\u665a\u4e0a8\u70b9\u534a",
    new Date(2026, 4, 15, 13, 10),
  );
  assert.deepEqual(due, { dueTime: "2026-05-16 20:30", raw: "\u660e\u5929\u665a\u4e0a8\u70b9\u534a" });
}

{
  const direct = service();
  const intent = direct.detectDirectTodoCreateIntentForWeb(
    "\u8bf7\u7ed9\u51e1\u51e1\u65b0\u589e\u4e00\u5f20\u770b\u677f\u5361\u7247\uff0c\u660e\u5929\u665a\u4e0a8\u70b9\u534a\u9605\u8bfb\u7b2c3\u7ae0",
    "owner",
    new Date(2026, 4, 15, 13, 10),
  );
  assert.deepEqual(intent, {
    assignee: "child",
    assigneeLabel: "\u51e1\u51e1",
    dueTime: "2026-05-16 20:30",
    content: "\u9605\u8bfb\u7b2c3\u7ae0",
  });
}

{
  const direct = service();
  assert.equal(direct.detectDirectTodoCreateIntentForWeb("\u65b0\u589e\u4e00\u5f20\u770b\u677f\u5361\u7247\uff0c\u53ea\u6709\u6807\u9898", "owner"), null);
  assert.equal(direct.detectDirectKanbanCreateRequest("\u65b0\u589e\u770b\u677f\u5361\u7247\uff1a\u6574\u7406Hotmail"), true);
  assert.equal(direct.detectDirectKanbanCreateRequest("create kanban card for cleanup"), true);
  assert.equal(direct.detectDirectKanbanCreateRequest("schedule a meeting"), false);
}

{
  const direct = service({ kanbanBackend: true });
  assert.deepEqual(direct.verifyDirectTodoCreateResult({ id: "" }), {
    ok: false,
    error: "Todo created but no visible card id returned.",
  });
  assert.deepEqual(direct.verifyDirectTodoCreateResult({ id: "t1", source: "kanban" }), {
    ok: false,
    error: "Kanban card creation returned without board/status metadata.",
  });
  assert.deepEqual(direct.verifyDirectTodoCreateResult({
    id: "t1",
    source: "kanban",
    kanbanBoard: "workspace-owner",
    kanbanStatus: "todo",
  }), { ok: true, error: "" });
}

{
  const direct = service();
  assert.equal(direct.directTodoCreateNeedsKanbanFields({ id: "t1", source: "local" }), false);
  const message = direct.formatDirectTodoCreateSuccessMessage(
    { assigneeLabel: "\u51e1\u51e1", dueTime: "2026-05-16 20:30", content: "\u9605\u8bfb\u7b2c3\u7ae0" },
    { id: "t1", source: "kanban", kanbanBoard: "workspace-child", kanbanStatus: "todo" },
  );
  assert.match(message, /\u5df2\u65b0\u589e\u770b\u677f\u5361\u7247/);
  assert.match(message, /ID: t1 \| Source: kanban \| Board: workspace-child \| Status: todo/);
}

console.log("direct kanban create service tests passed");
