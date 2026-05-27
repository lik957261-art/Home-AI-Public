"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-action-inbox-ui.js"), "utf8");

const sandbox = {
  URLSearchParams,
  state: {
    actionInboxStatusFilter: "open",
    selectedActionInboxItemId: "",
    selectedWorkspaceId: "owner",
  },
  escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  },
  formatTime(value) {
    if (String(value || "") === "2026-05-27T08:00:00.000Z") return "05/27 16:00";
    if (String(value || "") === "2026-05-27T01:01:10.226Z") return "05/27 09:01";
    return "";
  },
};

vm.runInNewContext(`${source}
this.ActionInboxUiTest = {
  actionInboxDisplaySummary,
  actionInboxDisplayTitle,
  actionInboxTodoDueText,
  renderActionInboxItem,
};`, sandbox);

const ui = sandbox.ActionInboxUiTest;

const openTodo = {
  id: "ainb-todo-1",
  sourceType: "manual",
  itemType: "todo",
  status: "open",
  title: "和 ann 见面",
  summary: "截止：2026-05-27T08:00:00.000Z",
  updatedAt: "2026-05-27T01:01:10.226Z",
};

const openTodoHtml = ui.renderActionInboxItem(openTodo);
assert.match(openTodoHtml, /data-swipe-kind="action-inbox"/);
assert.match(openTodoHtml, /data-complete-swipe="ainb-todo-1"/);
assert.match(openTodoHtml, /标记为已读/);
assert.match(openTodoHtml, /已读/);
assert.match(openTodoHtml, /截止 05\/27 16:00/);
assert.doesNotMatch(openTodoHtml, /2026-05-27T08:00:00\.000Z/);
assert.equal(ui.actionInboxTodoDueText(openTodo), "05/27 16:00");
assert.equal(ui.actionInboxDisplaySummary(openTodo), "");

const legacyTitle = Object.assign({}, openTodo, {
  title: "吃药 2026-05-27T08:00:00.000Z",
  summary: "",
  dueAt: "2026-05-27T08:00:00.000Z",
});
assert.equal(ui.actionInboxDisplayTitle(legacyTitle), "吃药 05/27 16:00");

const doneTodoHtml = ui.renderActionInboxItem(Object.assign({}, openTodo, { status: "done" }));
assert.doesNotMatch(doneTodoHtml, /data-complete-swipe/);
assert.doesNotMatch(doneTodoHtml, /data-swipe-kind="action-inbox"/);

console.log("app-action-inbox-ui tests passed");
