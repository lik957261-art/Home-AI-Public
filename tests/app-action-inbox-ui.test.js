"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-action-inbox-ui.js"), "utf8");
const styles = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");

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
  actionInboxFilterQuery,
  actionInboxItemsForActiveFilter,
  actionInboxCountsText,
  actionInboxDisplaySummary,
  actionInboxDisplayTitle,
  actionInboxActionMenuItems,
  actionInboxPluginLabel,
  actionInboxStatusActionLabel,
  actionInboxOpensSourceDirectly,
  actionInboxPrimaryDeliverable,
  actionInboxSourceDeepLink,
  actionInboxTodoDueText,
  actionInboxDetailMessage,
  openActionInboxItemDeliverableById,
  renderActionInboxActionSheet,
  renderActionInboxCreatePanel,
  renderActionInboxDetail,
  renderActionInboxFilters,
  renderActionInboxItem,
  actionInboxShouldShowLoading,
};`, sandbox);

const ui = sandbox.ActionInboxUiTest;

assert.doesNotMatch(source, /actionInboxPluginAuditSchedule/);
assert.match(source, /state\.actionInboxPluginAuditMode = state\.actionInboxPluginAuditMode \|\| "alignment"/);
assert.match(source, /showPushToast\(message, "success"\)/);
assert.match(styles, /\.action-inbox-item-head strong \{[\s\S]*?font-weight: 760;/);
assert.match(styles, /\.action-inbox-item-summary \{[\s\S]*?color: var\(--muted\);/);
assert.match(styles, /:root\[data-theme="dark"\] \.action-inbox-item-summary \{[\s\S]*?rgba\(226, 233, 232, 0\.72\)/);

assert.equal(String(ui.actionInboxFilterQuery()), "workspaceId=owner&limit=120&excludeItemType=todo&status=open");
sandbox.state.actionInboxStatusFilter = "todo";
assert.equal(String(ui.actionInboxFilterQuery()), "workspaceId=owner&limit=120&itemType=todo");
sandbox.state.actionInboxStatusFilter = "all";
assert.equal(String(ui.actionInboxFilterQuery()), "workspaceId=owner&limit=120&excludeItemType=todo&includeDone=1");
sandbox.state.actionInboxStatusFilter = "open";
sandbox.state.actionInboxCounts = { byStatus: { open: 2, waiting: 1, done: 3 }, byItemType: { todo: 4 } };
assert.equal(ui.actionInboxCountsText(), "\u5f85\u529e 4 · \u5f85\u5904\u7406 2 · \u7a0d\u540e 1 · \u5df2\u5b8c\u6210 3");
const filterHtml = ui.renderActionInboxFilters();
assert.match(filterHtml, /data-action-inbox-filter="open"[^>]*aria-selected="true"[^>]*>\u5f53\u524d<\/button>/);
assert.match(filterHtml, /data-action-inbox-filter="todo"[^>]*>\u5f85\u529e<\/button>/);
assert.match(filterHtml, /data-action-inbox-filter="all"[^>]*>\u5176\u4ed6<\/button>/);

const mixedInboxItems = [
  { id: "todo-row", itemType: "todo" },
  { id: "delivery-row", itemType: "delivery" },
  { id: "error-row", item_type: "error" },
];
sandbox.state.actionInboxStatusFilter = "todo";
assert.deepEqual(ui.actionInboxItemsForActiveFilter(mixedInboxItems).map((item) => item.id), ["todo-row"]);
sandbox.state.actionInboxStatusFilter = "open";
assert.deepEqual(ui.actionInboxItemsForActiveFilter(mixedInboxItems).map((item) => item.id), ["delivery-row", "error-row"]);

sandbox.state.actionInboxCreateOpen = true;
sandbox.state.actionInboxCreateMode = "plugin-audit";
sandbox.state.actionInboxPluginAuditPluginId = "codex-mobile";
sandbox.state.actionInboxPluginAuditMode = "alignment";
sandbox.state.actionInboxCreateDraftText = "Focus on routing.";
const pluginAuditCreateHtml = ui.renderActionInboxCreatePanel();
assert.match(pluginAuditCreateHtml, /data-action-inbox-create-mode="plugin-audit"/);
assert.match(pluginAuditCreateHtml, /id="actionInboxPluginAuditPluginId"/);
assert.match(pluginAuditCreateHtml, /value="codex-mobile"/);
assert.doesNotMatch(pluginAuditCreateHtml, /id="actionInboxPluginAuditSchedule"/);
assert.match(pluginAuditCreateHtml, /id="actionInboxPluginAuditMode"/);
assert.match(pluginAuditCreateHtml, />\u76ee\u6807\u4e00\u81f4\u6027<\/option>/);
assert.match(pluginAuditCreateHtml, />\u7acb\u5373\u5ba1\u8ba1<\/button>/);
sandbox.state.actionInboxCreateOpen = false;
sandbox.state.actionInboxCreateMode = "todo";

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

const codexReceipt = {
  id: "ainb-codex-1",
  sourceType: "plugin",
  itemType: "delivery",
  status: "open",
  title: "Codex task complete",
  summary: "This turn 已结束",
  sourceRef: {
    pluginId: "codex-mobile",
    detailMessage: {
      format: "markdown",
      sourceTurnId: "turn-1",
      body: "# Result\n\nLong final receipt",
      truncated: true,
    },
  },
};
sandbox.state.actionInboxDetail = { item: codexReceipt, events: [] };
sandbox.state.selectedActionInboxItemId = "ainb-codex-1";
assert.deepEqual(ui.actionInboxDetailMessage(codexReceipt), {
  format: "markdown",
  sourceTurnId: "turn-1",
  body: "# Result\n\nLong final receipt",
  truncated: true,
});
const codexReceiptHtml = ui.renderActionInboxDetail();
assert.match(codexReceiptHtml, /action-inbox-detail-message/);
assert.match(codexReceiptHtml, /Long final receipt/);
assert.match(codexReceiptHtml, /\u5df2\u622a\u65ad/);

const financeLedgerJoin = {
  id: "ainb-finance-join",
  sourceType: "plugin",
  itemType: "approval",
  status: "open",
  title: "\u8d26\u672c\u52a0\u5165\u7533\u8bf7\uff1aFamily Ledger",
  summary: "Lulu \u7533\u8bf7\u4ee5 viewer \u8eab\u4efd\u52a0\u5165\u8d26\u672c\u3002",
  sourceRef: {
    pluginId: "finance",
    notificationType: "finance.ledger_join_request",
    requestId: "join-req-1",
    requestedRole: "viewer",
  },
};
const financeJoinHtml = ui.renderActionInboxItem(financeLedgerJoin);
assert.equal(ui.actionInboxPluginLabel(financeLedgerJoin), "\u8bb0\u8d26");
assert.match(financeJoinHtml, /\u6765\u6e90\uff1a\u8bb0\u8d26/);
assert.deepEqual(ui.actionInboxActionMenuItems(financeLedgerJoin).map((action) => action.id), [
  "finance-ledger-join-approve",
  "finance-ledger-join-reject",
]);
sandbox.state.actionInboxItems = [financeLedgerJoin];
sandbox.state.actionInboxActionMenuItemId = "ainb-finance-join";
const financeJoinActionSheetHtml = ui.renderActionInboxActionSheet();
assert.match(financeJoinActionSheetHtml, /data-action-inbox-menu-action="finance-ledger-join-approve"/);
assert.match(financeJoinActionSheetHtml, /data-action-inbox-menu-action="finance-ledger-join-reject"/);
sandbox.state.actionInboxActionMenuItemId = "";

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
sandbox.state.selectedActionInboxItemId = "";
sandbox.state.actionInboxDetail = null;
sandbox.state.actionInboxItems = [];
sandbox.state.actionInboxCounts = null;
assert.equal(ui.actionInboxShouldShowLoading({}), true);
sandbox.state.actionInboxItems = [openTodo];
assert.equal(ui.actionInboxShouldShowLoading({}), false);
sandbox.state.actionInboxItems = [];
sandbox.state.actionInboxCounts = { byStatus: { open: 0, waiting: 0, done: 0 } };
assert.equal(ui.actionInboxShouldShowLoading({}), false);
sandbox.state.actionInboxCounts = null;

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

const automationReviewDelivery = {
  id: "ainb-audit-review",
  sourceType: "automation",
  itemType: "review",
  status: "open",
  title: "Codex audit needs review",
  summary: "1 finding, top severity high.",
  sourceRef: {
    automationId: "audit-job-1",
    latestDeliverable: {
      name: "plugin-workspace-audit-codex-mobile.md",
      url: "/api/automations/output?jobId=audit-job-1&file=plugin-workspace-audit-codex-mobile.md",
      mime: "text/markdown; charset=utf-8",
    },
  },
  workspaceId: "owner",
};
const reviewDeliveryHtml = ui.renderActionInboxItem(automationReviewDelivery);
assert.equal(ui.actionInboxPrimaryDeliverable(automationReviewDelivery).name, "plugin-workspace-audit-codex-mobile.md");
assert.match(reviewDeliveryHtml, /data-action-inbox-open-deliverable-id="ainb-audit-review"/);
assert.match(reviewDeliveryHtml, /class="action-inbox-deliverable-chip automation-doc-preview compact doc-markdown"/);

const openedDeliverables = [];
sandbox.state.actionInboxItems = [automationDelivery, automationReviewDelivery];
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
