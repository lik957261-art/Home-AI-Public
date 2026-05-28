"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-action-inbox-ui.js"), "utf8");

const sandbox = {
  URL,
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
  actionInboxActionMenuItems,
  actionInboxStatusActionLabel,
  actionInboxOpensSourceDirectly,
  actionInboxPrimaryDeliverable,
  actionInboxSourceDeepLink,
  actionInboxTodoDueText,
  openActionInboxItemDeliverableById,
  renderActionInboxActionSheet,
  renderActionInboxDetail,
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
assert.match(openTodoHtml, /data-swipe-commit="full"/);
assert.match(openTodoHtml, /data-complete-swipe="ainb-todo-1"/);
assert.match(openTodoHtml, /data-action-inbox-id="ainb-todo-1"/);
assert.match(openTodoHtml, /data-action-inbox-actions-id="ainb-todo-1"/);
assert.doesNotMatch(openTodoHtml, /data-action-inbox-open-source-id="ainb-todo-1"/);
assert.match(openTodoHtml, /class="action-inbox-state-badge action-inbox-state-action open"/);
assert.match(openTodoHtml, />\u5f85\u5904\u7406<\/button>/);
assert.doesNotMatch(openTodoHtml, />\u5904\u7406<\/button>/);
assert.match(openTodoHtml, /aria-label="状态：待处理，打开处理方式"/);
assert.doesNotMatch(openTodoHtml, /action-inbox-process-button/);
assert.doesNotMatch(openTodoHtml, /action-inbox-status-action/);
assert.doesNotMatch(openTodoHtml, /action-inbox-action-menu/);
assert.match(openTodoHtml, /标记为完成/);
assert.match(openTodoHtml, /完成/);
assert.match(openTodoHtml, /截止 05\/27 16:00/);
assert.doesNotMatch(openTodoHtml, /2026-05-27T08:00:00\.000Z/);
assert.equal(ui.actionInboxTodoDueText(openTodo), "05/27 16:00");
assert.equal(ui.actionInboxDisplaySummary(openTodo), "");
assert.equal(ui.actionInboxStatusActionLabel(openTodo), "\u5f85\u5904\u7406");
assert.equal(ui.actionInboxStatusActionLabel(Object.assign({}, openTodo, { status: "waiting" })), "\u7a0d\u540e");

const legacyDeepLinkTodo = Object.assign({}, openTodo, {
  id: "ainb-todo-legacy",
  deepLink: "/?view=todos&workspaceId=owner&todoId=todo-legacy",
});
assert.equal(ui.actionInboxSourceDeepLink(legacyDeepLinkTodo), "");
sandbox.state.actionInboxItems = [legacyDeepLinkTodo];
sandbox.state.selectedActionInboxItemId = "ainb-todo-legacy";
sandbox.state.actionInboxDetail = { item: legacyDeepLinkTodo, events: [] };
const legacyTodoDetailHtml = ui.renderActionInboxDetail();
assert.doesNotMatch(legacyTodoDetailHtml, /data-action-inbox-open-source/);
assert.doesNotMatch(legacyTodoDetailHtml, /\u6253\u5f00\u6765\u6e90/);
assert.match(legacyTodoDetailHtml, /class="action-inbox-state-badge action-inbox-state-action open"/);
assert.match(legacyTodoDetailHtml, /data-action-inbox-actions-id="ainb-todo-legacy"/);
assert.doesNotMatch(legacyTodoDetailHtml, /class="action-inbox-status/);

sandbox.state.actionInboxActionMenuItemId = "ainb-todo-legacy";
const legacyTodoDetailMenuHtml = ui.renderActionInboxDetail();
assert.match(legacyTodoDetailMenuHtml, /class="action-inbox-action-sheet-layer"/);
assert.match(legacyTodoDetailMenuHtml, /data-action-inbox-menu-action="complete"/);
sandbox.state.actionInboxActionMenuItemId = "";

const legacyTitle = Object.assign({}, openTodo, {
  title: "吃药 2026-05-27T08:00:00.000Z",
  summary: "",
  dueAt: "2026-05-27T08:00:00.000Z",
});
assert.equal(ui.actionInboxDisplayTitle(legacyTitle), "吃药 05/27 16:00");

const doneTodoHtml = ui.renderActionInboxItem(Object.assign({}, openTodo, { status: "done" }));
assert.doesNotMatch(doneTodoHtml, /data-complete-swipe/);
assert.doesNotMatch(doneTodoHtml, /data-swipe-kind="action-inbox"/);

const automationReceipt = {
  id: "ainb-auto-1",
  sourceType: "automation",
  itemType: "error",
  status: "open",
  title: "XSearch failed",
  summary: "Automation failed",
  sourceRef: { automationId: "auto-job-1" },
  workspaceId: "owner",
  updatedAt: "2026-05-27T01:01:10.226Z",
};

const automationLink = ui.actionInboxSourceDeepLink(automationReceipt);
assert.match(automationLink, /^\/\?/);
assert.match(automationLink, /view=automation/);
assert.match(automationLink, /automationId=auto-job-1/);
assert.match(automationLink, /returnTo=inbox/);
assert.match(automationLink, /returnScope=detail/);
assert.match(automationLink, /sourceInboxItemId=ainb-auto-1/);
assert.match(automationLink, /source=pwa/);
assert.equal(ui.actionInboxOpensSourceDirectly(automationReceipt), true);

const automationHtml = ui.renderActionInboxItem(automationReceipt);
assert.match(automationHtml, /data-action-inbox-open-source-id="ainb-auto-1"/);
assert.doesNotMatch(automationHtml, /data-action-inbox-id="ainb-auto-1"/);

const automationDelivery = {
  id: "ainb-auto-delivery",
  sourceType: "automation",
  itemType: "delivery",
  status: "open",
  title: "Weekly report",
  summary: "交付文件: weekly.md",
  sourceRef: {
    automationId: "auto-job-2",
    latestDeliverable: {
      name: "weekly.md",
      url: "/api/automations/deliverable?workspaceId=owner&jobId=auto-job-2&run=run.md&index=0",
      mime: "text/markdown",
    },
  },
  workspaceId: "owner",
};
const deliveryHtml = ui.renderActionInboxItem(automationDelivery);
assert.equal(ui.actionInboxOpensSourceDirectly(automationDelivery), true);
assert.equal(ui.actionInboxPrimaryDeliverable(automationDelivery).name, "weekly.md");
assert.match(deliveryHtml, /data-action-inbox-open-deliverable-id="ainb-auto-delivery"/);
assert.match(deliveryHtml, /<button class="action-inbox-item-main" type="button" data-action-inbox-open-source-id="ainb-auto-delivery">/);
assert.match(deliveryHtml, /class="action-inbox-deliverable-chip automation-doc-preview compact doc-markdown"/);
assert.match(deliveryHtml, /automation-doc-icon/);
assert.match(deliveryHtml, />\u6700\u540e\u4ea4\u4ed8<\/span>/);
assert.match(deliveryHtml, />weekly\.md<\/span>/);
assert.match(deliveryHtml, /data-task-doc/);
assert.match(deliveryHtml, /data-artifact-mime="text\/markdown"/);
assert.deepEqual(ui.actionInboxActionMenuItems(automationDelivery).map((action) => action.id), ["complete", "snooze", "dismiss"]);

const openedDeliverables = [];
sandbox.state.actionInboxItems = [automationDelivery];
sandbox.document = {
  createElement(tag) {
    assert.equal(tag, "a");
    return {
      dataset: {},
      setAttribute(name, value) {
        this[name] = value;
      },
    };
  },
};
sandbox.openTaskDocumentLink = (link) => openedDeliverables.push({
  href: link.href,
  name: link.dataset.artifactName,
  mime: link.dataset.artifactMime,
});
ui.openActionInboxItemDeliverableById("ainb-auto-delivery");
assert.deepEqual(openedDeliverables, [{
  href: "/api/automations/deliverable?workspaceId=owner&jobId=auto-job-2&run=run.md&index=0",
  name: "weekly.md",
  mime: "text/markdown",
}]);

const legacyAutomationDelivery = {
  id: "ainb-auto-legacy",
  sourceType: "automation",
  itemType: "delivery",
  status: "open",
  title: "Legacy report",
  summary: "交付文件: legacy.md",
  sourceRef: {
    automationId: "auto-job-legacy",
    latestDocumentName: "legacy.md",
    signature: "2026-05-28T09:03:52+08:00|ok|scheduled|||legacy.md:2026-05-28T09:03:33+08:00:2026-05-28T09:03:52+08:00:/api/automations/deliverable?jobId=auto-job-legacy&run=run.md&index=0",
  },
  workspaceId: "owner",
};
const legacyDeliveryHtml = ui.renderActionInboxItem(legacyAutomationDelivery);
assert.match(legacyDeliveryHtml, /data-action-inbox-open-deliverable-id="ainb-auto-legacy"/);
assert.equal(ui.actionInboxPrimaryDeliverable(legacyAutomationDelivery).url, "/api/automations/deliverable?jobId=auto-job-legacy&run=run.md&index=0");

const scheduledTodoDelivery = {
  id: "ainb-auto-scheduled",
  sourceType: "automation",
  itemType: "todo",
  status: "open",
  title: "\u5f85\u529e\u63d0\u9192",
  summary: "Daily discussion report\n\u4ea4\u4ed8\u6587\u4ef6: report.md",
  sourceRef: {
    automationId: "auto-job-scheduled",
    scheduledTodo: true,
    automationTitle: "Daily discussion report",
    latestDeliverable: {
      name: "report.md",
      url: "/api/automations/deliverable?jobId=auto-job-scheduled&run=run.md&index=0",
      mime: "text/markdown",
    },
  },
  workspaceId: "owner",
};
const scheduledTodoHtml = ui.renderActionInboxItem(scheduledTodoDelivery);
assert.equal(ui.actionInboxDisplayTitle(scheduledTodoDelivery), "Daily discussion report");
assert.equal(ui.actionInboxPrimaryDeliverable(scheduledTodoDelivery).name, "report.md");
assert.match(scheduledTodoHtml, /<button class="action-inbox-item-main" type="button" data-action-inbox-open-source-id="ainb-auto-scheduled">/);
assert.match(scheduledTodoHtml, /data-action-inbox-open-deliverable-id="ainb-auto-scheduled"/);
assert.match(scheduledTodoHtml, /class="action-inbox-deliverable-chip automation-doc-preview compact doc-markdown"/);
assert.match(scheduledTodoHtml, />report\.md<\/span>/);
assert.match(scheduledTodoHtml, /data-action-inbox-actions-id="ainb-auto-scheduled"/);
assert.deepEqual(ui.actionInboxActionMenuItems(scheduledTodoDelivery).map((action) => action.label), ["\u5b8c\u6210", "\u7a0d\u540e", "\u5220\u9664"]);

sandbox.state.actionInboxItems = [scheduledTodoDelivery];
sandbox.state.actionInboxActionMenuItemId = "ainb-auto-scheduled";
const actionSheetHtml = ui.renderActionInboxActionSheet();
assert.match(actionSheetHtml, /class="action-inbox-action-sheet-layer"/);
assert.match(actionSheetHtml, /class="action-inbox-action-sheet-backdrop"/);
assert.match(actionSheetHtml, /role="menu"/);
assert.match(actionSheetHtml, /data-action-inbox-menu-dismiss/);
assert.match(actionSheetHtml, /class="action-inbox-action-sheet-button primary"[^>]+data-action-inbox-menu-action="complete"/);
assert.match(actionSheetHtml, /class="action-inbox-action-sheet-button neutral"[^>]+data-action-inbox-menu-action="snooze"/);
assert.match(actionSheetHtml, /class="action-inbox-action-sheet-button danger"[^>]+data-action-inbox-menu-action="dismiss"/);
assert.doesNotMatch(actionSheetHtml, /action-inbox-action-menu/);

console.log("app-action-inbox-ui tests passed");
