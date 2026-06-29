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
  actionInboxIsAutonomousDeliveryStartRequest,
  actionInboxIsAutonomousDeliveryVerificationRequest,
  actionInboxIsAutonomousDeliveryDeploymentRequest,
  actionInboxIsAutonomousDeliveryClosureRequest,
  actionInboxIsAutonomousDeliveryFinalReport,
  actionInboxIsAutonomousDeliveryRepairRequest,
  actionInboxIsPluginConversationRepairRequest,
  actionInboxPluginLabel,
  actionInboxStatusActionLabel,
  actionInboxOpensSourceDirectly,
  actionInboxPrimaryDeliverable,
  actionInboxSourceDeepLink,
  actionInboxTodoDueText,
  actionInboxDetailMessage,
  actionInboxAuditTargetOptions,
  actionInboxValidAuditTargetId,
  actionInboxActionState,
  setActionInboxActionState,
  clearActionInboxActionState,
  actionInboxTaskCardActionLabel,
  openActionInboxItemDeliverableById,
  renderActionInboxActionFeedback,
  renderActionInboxActionSheet,
  renderActionInboxCreatePanel,
  renderActionInboxDetail,
  renderActionInboxFilters,
  renderActionInboxItem,
  actionInboxShouldShowLoading,
};`, sandbox);

const ui = sandbox.ActionInboxUiTest;

assert.doesNotMatch(source, /actionInboxPluginAuditSchedule/);
assert.match(source, /state\.actionInboxPluginAuditPluginId = actionInboxValidAuditTargetId\(state\.actionInboxPluginAuditPluginId \|\| "home-ai"\)/);
assert.match(source, /state\.actionInboxPluginAuditMode = state\.actionInboxPluginAuditMode \|\| "product_reality"/);
assert.match(source, /showPushToast\(message, "success"\)/);
assert.doesNotMatch(source, /插件审计已提交，后台执行中/);
assert.match(source, /审计请求已发送到/);
assert.doesNotMatch(source, /invalidateAutomationListCache\(\);\s*const cardId/);
assert.match(styles, /\.action-inbox-item-head strong \{[\s\S]*?font-weight: 760;/);
assert.match(styles, /\.action-inbox-item-summary \{[\s\S]*?color: var\(--muted\);/);
assert.match(styles, /\.action-inbox-action-feedback\.pending \{[\s\S]*?color: var\(--ui-accent-ink\);/);
assert.match(styles, /\.action-inbox-action-feedback\.error \{[\s\S]*?color: var\(--ui-danger-ink\);/);
assert.match(styles, /\.action-inbox-action-sheet-button:disabled,[\s\S]*?cursor: progress;/);
assert.match(styles, /:root\[data-theme="dark"\] \.action-inbox-item-summary \{[\s\S]*?rgba\(226, 233, 232, 0\.72\)/);

assert.equal(String(ui.actionInboxFilterQuery()), "workspaceId=owner&limit=120&excludeItemType=todo&status=open");
sandbox.state.actionInboxStatusFilter = "todo";
assert.equal(String(ui.actionInboxFilterQuery()), "workspaceId=owner&limit=120&itemType=todo&sourceType=manual");
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
  { id: "todo-row", sourceType: "manual", itemType: "todo" },
  { id: "automation-todo-row", sourceType: "automation", itemType: "todo" },
  { id: "delivery-row", itemType: "delivery" },
  { id: "error-row", item_type: "error" },
];
sandbox.state.actionInboxStatusFilter = "todo";
assert.deepEqual(ui.actionInboxItemsForActiveFilter(mixedInboxItems).map((item) => item.id), ["todo-row"]);
sandbox.state.actionInboxStatusFilter = "open";
assert.deepEqual(ui.actionInboxItemsForActiveFilter(mixedInboxItems).map((item) => item.id), ["delivery-row", "error-row"]);

sandbox.state.actionInboxCreateOpen = true;
sandbox.state.actionInboxCreateMode = "plugin-audit";
sandbox.state.actionInboxPluginAuditPluginId = "home-ai";
sandbox.state.actionInboxPluginAuditMode = "product_reality";
sandbox.state.actionInboxCreateDraftText = "Focus on routing.";
const pluginAuditCreateHtml = ui.renderActionInboxCreatePanel();
assert.match(pluginAuditCreateHtml, /data-action-inbox-create-mode="plugin-audit"/);
assert.match(pluginAuditCreateHtml, /id="actionInboxPluginAuditPluginId"/);
assert.match(pluginAuditCreateHtml, /<select id="actionInboxPluginAuditPluginId"/);
assert.doesNotMatch(pluginAuditCreateHtml, /type="text" autocomplete="off" value="codex-mobile"/);
assert.match(pluginAuditCreateHtml, /value="home-ai" selected>Home AI \u5bbf\u4e3b \u00b7 Home AI Platform Audit<\/option>/);
assert.match(pluginAuditCreateHtml, /value="codex-mobile">Codex \u00b7 Plugin Workspace Audit<\/option>/);
assert.doesNotMatch(pluginAuditCreateHtml, /id="actionInboxPluginAuditSchedule"/);
assert.match(pluginAuditCreateHtml, /id="actionInboxPluginAuditMode"/);
assert.match(pluginAuditCreateHtml, />\u4ea7\u54c1\u73b0\u5b9e\u4e00\u81f4\u6027<\/option>/);
assert.match(pluginAuditCreateHtml, />\u76ee\u6807\u4e00\u81f4\u6027<\/option>/);
assert.match(pluginAuditCreateHtml, />\u7acb\u5373\u5ba1\u8ba1<\/button>/);
assert.equal(ui.actionInboxValidAuditTargetId("freeform-plugin"), "home-ai");
assert.equal(ui.actionInboxValidAuditTargetId("music"), "music");
assert.ok(ui.actionInboxAuditTargetOptions().some((target) => target.id === "home-ai" && target.thread === "Home AI Platform Audit"));
sandbox.state.actionInboxCreateMode = "delivery-loop";
sandbox.state.actionInboxCreateDraftText = "\u4fee\u590d Music \u64ad\u653e\u5931\u8d25\u5e76\u95ed\u73af\u9a8c\u8bc1";
const deliveryLoopCreateHtml = ui.renderActionInboxCreatePanel();
assert.match(deliveryLoopCreateHtml, /data-action-inbox-create-mode="delivery-loop"/);
assert.match(deliveryLoopCreateHtml, />\u4ea4\u4ed8\u76ee\u6807<\/label>/);
assert.match(deliveryLoopCreateHtml, />\u521b\u5efa\u4ea4\u4ed8 Loop<\/button>/);
assert.match(deliveryLoopCreateHtml, /\u4fee\u590d Music \u64ad\u653e\u5931\u8d25\u5e76\u95ed\u73af\u9a8c\u8bc1/);
assert.match(source, /\/api\/autonomous-delivery\/cases/);
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

const diagnosticRemediationItem = {
  id: "ainb-diag-1",
  sourceType: "ai_ops",
  itemType: "error",
  status: "open",
  title: "\u8bca\u65ad\u9700\u8981\u4fee\u590d\uff1awardrobe outfit_retry_failed",
  summary: "wardrobe H2 diagnostic case diagcase_1",
  sourceId: "diagcase_1",
  sourceRef: {
    notificationType: "ai_ops.diagnostic_remediation_candidate",
    caseId: "diagcase_1",
    pluginId: "wardrobe",
    targetThreadTitle: "\u7537\u88c5\u8863\u6a71",
  },
};
assert.equal(ui.actionInboxPluginLabel(diagnosticRemediationItem), "AI Ops");
assert.deepEqual(ui.actionInboxActionMenuItems(diagnosticRemediationItem).map((action) => action.id), [
  "diagnostic-remediation-send-card",
  "snooze",
  "dismiss",
]);
sandbox.state.actionInboxItems = [diagnosticRemediationItem];
sandbox.state.actionInboxActionMenuItemId = "ainb-diag-1";
const diagnosticActionSheetHtml = ui.renderActionInboxActionSheet();
assert.match(diagnosticActionSheetHtml, /data-action-inbox-menu-action="diagnostic-remediation-send-card"/);
assert.match(diagnosticActionSheetHtml, />\u53d1\u4fee\u590d\u5361<\/button>/);
ui.setActionInboxActionState("ainb-diag-1", { pending: true });
assert.deepEqual(ui.actionInboxActionState("ainb-diag-1"), { pending: true });
assert.equal(ui.actionInboxTaskCardActionLabel(diagnosticRemediationItem), "\u6b63\u5728\u53d1\u9001...");
assert.equal(ui.actionInboxStatusActionLabel(diagnosticRemediationItem), "\u53d1\u9001\u4e2d");
assert.match(ui.renderActionInboxActionFeedback(diagnosticRemediationItem), /\u6b63\u5728\u53d1\u9001\u4fee\u590d\u5361/);
const diagnosticPendingActionSheetHtml = ui.renderActionInboxActionSheet();
assert.match(diagnosticPendingActionSheetHtml, /data-action-inbox-menu-action="diagnostic-remediation-send-card"[^>]*disabled aria-disabled="true"/);
assert.match(diagnosticPendingActionSheetHtml, />\u6b63\u5728\u53d1\u9001\.\.\.<\/button>/);
ui.setActionInboxActionState("ainb-diag-1", { pending: false, error: "\u7f51\u7edc\u9519\u8bef", failureCount: 3 });
assert.equal(ui.actionInboxTaskCardActionLabel(diagnosticRemediationItem), "\u91cd\u65b0\u53d1\u9001");
assert.equal(ui.actionInboxStatusActionLabel(diagnosticRemediationItem), "\u53d1\u9001\u5931\u8d25");
assert.match(ui.renderActionInboxActionFeedback(diagnosticRemediationItem), /\u4fee\u590d\u5361\u53d1\u9001\u5931\u8d25/);
assert.match(ui.renderActionInboxActionFeedback(diagnosticRemediationItem), /\u7b2c 3 \u6b21/);
assert.match(ui.renderActionInboxActionFeedback(diagnosticRemediationItem), /\u7f51\u7edc\u9519\u8bef/);
ui.clearActionInboxActionState("ainb-diag-1");
sandbox.state.actionInboxActionMenuItemId = "";
assert.match(source, /ACTION_INBOX_TASK_CARD_FAILURE_THRESHOLD = 3/);
assert.match(source, /action_inbox_diagnostic_task_card_failed/);
assert.match(source, /action_inbox_plugin_conversation_task_card_failed/);
assert.match(source, /action_inbox_autonomous_delivery_start_failed/);
assert.match(source, /action_inbox_autonomous_delivery_deployment_failed/);
assert.match(source, /action_inbox_autonomous_delivery_repair_failed/);
assert.match(source, /action_inbox_autonomous_delivery_close_failed/);
assert.match(source, /reportActionInboxTaskCardDispatchFailure\(item, action, error, failureCount\)/);
assert.match(source, /timeoutMs: 25000/);

const pluginConversationRepairItem = {
  id: "ainb-plugin-conversation-1",
  sourceType: "plugin_conversation",
  itemType: "approval",
  status: "open",
  title: "\u63d2\u4ef6\u8bf7\u6c42\u4fee\u590d\uff1aHealth catalog_gap",
  summary: "\u5065\u5eb7\u4f1a\u8bdd\u9700\u8981\u589e\u52a0\u4fef\u5367\u6491\u52a8\u4f5c\u952e\u3002",
  sourceId: "pcr_health_push_up",
  sourceRef: {
    notificationType: "plugin_conversation.repair_request",
    requestId: "pcr_health_push_up",
    pluginId: "health",
    targetThreadTitle: "\u5065\u5eb7",
  },
};
assert.equal(ui.actionInboxPluginLabel(pluginConversationRepairItem), "\u5065\u5eb7");
assert.equal(ui.actionInboxIsPluginConversationRepairRequest(pluginConversationRepairItem), "pcr_health_push_up");
assert.deepEqual(ui.actionInboxActionMenuItems(pluginConversationRepairItem).map((action) => action.id), [
  "plugin-conversation-send-card",
  "snooze",
  "dismiss",
]);
sandbox.state.actionInboxItems = [pluginConversationRepairItem];
sandbox.state.actionInboxActionMenuItemId = "ainb-plugin-conversation-1";
const pluginConversationActionSheetHtml = ui.renderActionInboxActionSheet();
assert.match(pluginConversationActionSheetHtml, /data-action-inbox-menu-action="plugin-conversation-send-card"/);
assert.match(pluginConversationActionSheetHtml, />\u53d1\u4fee\u590d\u5361<\/button>/);
assert.doesNotMatch(pluginConversationActionSheetHtml, /data-action-inbox-menu-action="plugin-conversation-send-card"[^>]*disabled aria-disabled="true"/);
const incompletePluginConversationRepairItem = Object.assign({}, pluginConversationRepairItem, {
  id: "ainb-plugin-conversation-missing",
  rawJson: {},
});
const missingTaskCardAction = ui.actionInboxActionMenuItems(incompletePluginConversationRepairItem)[0];
assert.deepEqual(missingTaskCardAction, {
  id: "plugin-conversation-send-card",
  label: "\u53d1\u4fee\u590d\u5361",
  tone: "primary",
  disabled: false,
});
sandbox.state.actionInboxItems = [incompletePluginConversationRepairItem];
sandbox.state.actionInboxActionMenuItemId = "ainb-plugin-conversation-missing";
const missingPluginConversationActionSheetHtml = ui.renderActionInboxActionSheet();
assert.match(missingPluginConversationActionSheetHtml, /data-action-inbox-menu-action="plugin-conversation-send-card"/);
assert.doesNotMatch(missingPluginConversationActionSheetHtml, /data-action-inbox-menu-action="plugin-conversation-send-card"[^>]*disabled aria-disabled="true"/);
assert.match(missingPluginConversationActionSheetHtml, />\u53d1\u4fee\u590d\u5361<\/button>/);
sandbox.state.actionInboxActionMenuItemId = "";
assert.match(source, /ownerPrompt/);
assert.match(source, /openActionInboxOwnerPromptDialog/);
assert.doesNotMatch(source, /window\.prompt/);
assert.match(source, /\/api\/plugin-conversation\/actions\/\$\{encodeURIComponent\(id\)\}\/task-card/);

const autonomousDeliveryStartItem = {
  id: "ainb-delivery-loop-1",
  sourceType: "autonomous_delivery",
  itemType: "approval",
  status: "open",
  title: "\u4ea4\u4ed8 Loop \u5f85\u542f\u52a8\uff1a\u4fee\u590d Music \u64ad\u653e",
  summary: "\u6a21\u5f0f\uff1adelivery",
  sourceId: "delivery_1",
  sourceRef: {
    notificationType: "autonomous_delivery.start_required",
    caseId: "delivery_1",
    requiredDecisions: ["ui_product_decision"],
  },
};
assert.equal(ui.actionInboxPluginLabel(autonomousDeliveryStartItem), "\u4ea4\u4ed8 Loop");
assert.equal(ui.actionInboxIsAutonomousDeliveryStartRequest(autonomousDeliveryStartItem), "delivery_1");
assert.deepEqual(ui.actionInboxActionMenuItems(autonomousDeliveryStartItem).map((action) => action.id), [
  "autonomous-delivery-start",
  "snooze",
  "dismiss",
]);
sandbox.state.actionInboxItems = [autonomousDeliveryStartItem];
sandbox.state.actionInboxActionMenuItemId = "ainb-delivery-loop-1";
const deliveryStartActionSheetHtml = ui.renderActionInboxActionSheet();
assert.match(deliveryStartActionSheetHtml, /data-action-inbox-menu-action="autonomous-delivery-start"/);
assert.match(deliveryStartActionSheetHtml, />\u786e\u8ba4\u5e76\u5f00\u59cb<\/button>/);
ui.setActionInboxActionState("ainb-delivery-loop-1", { pending: true });
assert.equal(ui.actionInboxTaskCardActionLabel(autonomousDeliveryStartItem), "\u6b63\u5728\u542f\u52a8...");
assert.match(ui.renderActionInboxActionFeedback(autonomousDeliveryStartItem), /\u6b63\u5728\u542f\u52a8\u4ea4\u4ed8 Loop/);
ui.setActionInboxActionState("ainb-delivery-loop-1", { pending: false, error: "\u7f51\u7edc\u9519\u8bef", failureCount: 3 });
assert.equal(ui.actionInboxTaskCardActionLabel(autonomousDeliveryStartItem), "\u91cd\u65b0\u5f00\u59cb");
assert.match(ui.renderActionInboxActionFeedback(autonomousDeliveryStartItem), /\u4ea4\u4ed8 Loop \u542f\u52a8\u5931\u8d25/);
assert.match(ui.renderActionInboxActionFeedback(autonomousDeliveryStartItem), /\u7b2c 3 \u6b21/);
ui.clearActionInboxActionState("ainb-delivery-loop-1");
sandbox.state.actionInboxActionMenuItemId = "";
assert.match(source, /\/api\/autonomous-delivery\/cases\/\$\{encodeURIComponent\(caseId\)\}\/start/);

const autonomousDeliveryReviewItem = {
  id: "ainb-delivery-loop-review-1",
  sourceType: "autonomous_delivery",
  itemType: "review",
  status: "open",
  title: "\u4ea4\u4ed8 Loop \u5f85\u9a8c\u8bc1\uff1a\u4fee\u590d Music \u64ad\u653e",
  summary: "\u56de\u5361\u72b6\u6001\uff1acompleted",
  sourceId: "delivery_1:slice_1:verification",
  sourceRef: {
    notificationType: "autonomous_delivery.verification_required",
    caseId: "delivery_1",
    sliceId: "slice_1",
    returnCardId: "ttc_return_1",
  },
};
const autonomousReviewHtml = ui.renderActionInboxItem(autonomousDeliveryReviewItem);
assert.match(autonomousReviewHtml, /\u6765\u6e90\uff1a\u4ea4\u4ed8 Loop/);
assert.match(autonomousReviewHtml, /\u7c7b\u578b\uff1a\u5ba1\u9605/);
assert.equal(ui.actionInboxIsAutonomousDeliveryStartRequest(autonomousDeliveryReviewItem), "");
assert.equal(ui.actionInboxIsAutonomousDeliveryVerificationRequest(autonomousDeliveryReviewItem), "slice_1");
assert.deepEqual(ui.actionInboxActionMenuItems(autonomousDeliveryReviewItem).map((action) => action.id), [
  "autonomous-delivery-start-verification",
  "snooze",
  "dismiss",
]);
assert.equal(ui.actionInboxActionMenuItems(autonomousDeliveryReviewItem)[0].label, "\u5f00\u59cb\u9a8c\u8bc1");
assert.equal(ui.actionInboxActionMenuItems(autonomousDeliveryReviewItem).some((action) => action.id === "autonomous-delivery-start"), false);
ui.setActionInboxActionState("ainb-delivery-loop-review-1", { action: "autonomous-delivery-start-verification", pending: true });
assert.equal(ui.actionInboxTaskCardActionLabel(autonomousDeliveryReviewItem), "\u6b63\u5728\u8bf7\u6c42...");
assert.match(ui.renderActionInboxActionFeedback(autonomousDeliveryReviewItem), /\u6b63\u5728\u8bf7\u6c42\u9a8c\u8bc1/);
ui.setActionInboxActionState("ainb-delivery-loop-review-1", { action: "autonomous-delivery-start-verification", pending: false, error: "\u7ebf\u7a0b\u4e0d\u53ef\u7528", failureCount: 3 });
assert.equal(ui.actionInboxTaskCardActionLabel(autonomousDeliveryReviewItem), "\u91cd\u65b0\u8bf7\u6c42");
assert.match(ui.renderActionInboxActionFeedback(autonomousDeliveryReviewItem), /\u9a8c\u8bc1\u5361\u53d1\u9001\u5931\u8d25/);
ui.clearActionInboxActionState("ainb-delivery-loop-review-1");
assert.match(source, /\/api\/autonomous-delivery\/cases\/\$\{encodeURIComponent\(caseId\)\}\/slices\/\$\{encodeURIComponent\(sliceId\)\}\/verification\/start/);

const autonomousDeliveryDeploymentItem = {
  id: "ainb-delivery-loop-deploy-1",
  sourceType: "autonomous_delivery",
  itemType: "review",
  status: "open",
  title: "\u4ea4\u4ed8 Loop \u5f85\u90e8\u7f72\u8bfb\u56de\uff1a\u4fee\u590d Music \u64ad\u653e",
  summary: "\u8fd0\u884c\u65f6\u884c\u4e3a\u5df2\u53d8\u66f4\uff0c\u9700\u8981\u751f\u4ea7\u8bfb\u56de",
  sourceId: "delivery_1:slice_1:deploy-readback",
  sourceRef: {
    notificationType: "autonomous_delivery.deploy_readback_required",
    caseId: "delivery_1",
    sliceId: "slice_1",
    returnCardId: "ttc_return_1",
    deploymentRequired: true,
  },
};
assert.equal(ui.actionInboxIsAutonomousDeliveryDeploymentRequest(autonomousDeliveryDeploymentItem), "slice_1");
assert.equal(ui.actionInboxIsAutonomousDeliveryVerificationRequest(autonomousDeliveryDeploymentItem), false);
assert.deepEqual(ui.actionInboxActionMenuItems(autonomousDeliveryDeploymentItem).map((action) => action.id), [
  "autonomous-delivery-start-deployment",
  "snooze",
  "dismiss",
]);
assert.equal(ui.actionInboxActionMenuItems(autonomousDeliveryDeploymentItem)[0].label, "\u90e8\u7f72\u8bfb\u56de");
ui.setActionInboxActionState("ainb-delivery-loop-deploy-1", { action: "autonomous-delivery-start-deployment", pending: true });
assert.equal(ui.actionInboxTaskCardActionLabel(autonomousDeliveryDeploymentItem), "\u6b63\u5728\u53d1\u9001...");
assert.match(ui.renderActionInboxActionFeedback(autonomousDeliveryDeploymentItem), /\u6b63\u5728\u53d1\u9001\u90e8\u7f72\u8bfb\u56de\u5361/);
ui.setActionInboxActionState("ainb-delivery-loop-deploy-1", { action: "autonomous-delivery-start-deployment", pending: false, error: "\u7ebf\u7a0b\u4e0d\u53ef\u7528", failureCount: 3 });
assert.equal(ui.actionInboxTaskCardActionLabel(autonomousDeliveryDeploymentItem), "\u91cd\u65b0\u53d1\u9001");
assert.match(ui.renderActionInboxActionFeedback(autonomousDeliveryDeploymentItem), /\u90e8\u7f72\u8bfb\u56de\u5361\u53d1\u9001\u5931\u8d25/);
ui.clearActionInboxActionState("ainb-delivery-loop-deploy-1");
assert.match(source, /\/api\/autonomous-delivery\/cases\/\$\{encodeURIComponent\(caseId\)\}\/slices\/\$\{encodeURIComponent\(sliceId\)\}\/deployment\/start/);
assert.match(source, /confirmDeployment: true/);

const autonomousDeliveryRepairItem = {
  id: "ainb-delivery-loop-repair-1",
  sourceType: "autonomous_delivery",
  itemType: "review",
  status: "open",
  title: "\u4ea4\u4ed8 Loop \u5f85\u4fee\u590d\uff1a\u4fee\u590d Music \u64ad\u653e",
  summary: "\u9a8c\u8bc1\u8fd4\u56de partially_completed",
  sourceId: "delivery_1:verify_slice_1:repair",
  sourceRef: {
    notificationType: "autonomous_delivery.repair_required",
    caseId: "delivery_1",
    parentSliceId: "slice_1",
    verificationSliceId: "verify_slice_1",
    verificationReturnCardId: "ttc_verify_return_partial",
  },
};
assert.equal(ui.actionInboxIsAutonomousDeliveryRepairRequest(autonomousDeliveryRepairItem), "verify_slice_1");
assert.equal(ui.actionInboxIsAutonomousDeliveryVerificationRequest(autonomousDeliveryRepairItem), false);
assert.deepEqual(ui.actionInboxActionMenuItems(autonomousDeliveryRepairItem).map((action) => action.id), [
  "autonomous-delivery-start-repair",
  "snooze",
  "dismiss",
]);
assert.equal(ui.actionInboxActionMenuItems(autonomousDeliveryRepairItem)[0].label, "\u53d1\u4fee\u590d\u5361");
ui.setActionInboxActionState("ainb-delivery-loop-repair-1", { action: "autonomous-delivery-start-repair", pending: true });
assert.equal(ui.actionInboxTaskCardActionLabel(autonomousDeliveryRepairItem), "\u6b63\u5728\u53d1\u9001...");
assert.match(ui.renderActionInboxActionFeedback(autonomousDeliveryRepairItem), /\u6b63\u5728\u53d1\u9001\u4fee\u590d\u5361/);
ui.setActionInboxActionState("ainb-delivery-loop-repair-1", { action: "autonomous-delivery-start-repair", pending: false, error: "\u7ebf\u7a0b\u4e0d\u53ef\u7528", failureCount: 3 });
assert.equal(ui.actionInboxTaskCardActionLabel(autonomousDeliveryRepairItem), "\u91cd\u65b0\u53d1\u9001");
assert.match(ui.renderActionInboxActionFeedback(autonomousDeliveryRepairItem), /\u4fee\u590d\u5361\u53d1\u9001\u5931\u8d25/);
ui.clearActionInboxActionState("ainb-delivery-loop-repair-1");
assert.match(source, /\/api\/autonomous-delivery\/cases\/\$\{encodeURIComponent\(caseId\)\}\/slices\/\$\{encodeURIComponent\(verificationSliceId\)\}\/repair\/start/);

const autonomousDeliveryClosureItem = {
  id: "ainb-delivery-loop-close-1",
  sourceType: "autonomous_delivery",
  itemType: "review",
  status: "open",
  title: "\u4ea4\u4ed8 Loop \u5f85\u6536\u5c3e\uff1a\u4fee\u590d Music \u64ad\u653e",
  summary: "\u9a8c\u8bc1\u5df2\u5b8c\u6210",
  sourceId: "delivery_1:closure",
  sourceRef: {
    notificationType: "autonomous_delivery.closure_required",
    caseId: "delivery_1",
    verificationSliceId: "delivery_1_implement_note_verification",
    verificationReturnCardId: "ttc_verify_return_1",
  },
};
assert.equal(ui.actionInboxIsAutonomousDeliveryClosureRequest(autonomousDeliveryClosureItem), "delivery_1");
assert.equal(ui.actionInboxIsAutonomousDeliveryVerificationRequest(autonomousDeliveryClosureItem), false);
assert.deepEqual(ui.actionInboxActionMenuItems(autonomousDeliveryClosureItem).map((action) => action.id), [
  "autonomous-delivery-close",
  "snooze",
  "dismiss",
]);
assert.equal(ui.actionInboxActionMenuItems(autonomousDeliveryClosureItem)[0].label, "\u5b8c\u6210\u95ed\u73af");
ui.setActionInboxActionState("ainb-delivery-loop-close-1", { action: "autonomous-delivery-close", pending: true });
assert.equal(ui.actionInboxTaskCardActionLabel(autonomousDeliveryClosureItem), "\u6b63\u5728\u6536\u5c3e...");
assert.match(ui.renderActionInboxActionFeedback(autonomousDeliveryClosureItem), /\u6b63\u5728\u5b8c\u6210\u4ea4\u4ed8\u95ed\u73af/);
ui.setActionInboxActionState("ainb-delivery-loop-close-1", { action: "autonomous-delivery-close", pending: false, error: "\u72b6\u6001\u4e0d\u53ef\u6536\u5c3e", failureCount: 3 });
assert.equal(ui.actionInboxTaskCardActionLabel(autonomousDeliveryClosureItem), "\u91cd\u65b0\u6536\u5c3e");
assert.match(ui.renderActionInboxActionFeedback(autonomousDeliveryClosureItem), /\u4ea4\u4ed8 Loop \u6536\u5c3e\u5931\u8d25/);
ui.clearActionInboxActionState("ainb-delivery-loop-close-1");
assert.match(source, /\/api\/autonomous-delivery\/cases\/\$\{encodeURIComponent\(caseId\)\}\/close/);

const autonomousDeliveryFinalReportItem = {
  id: "ainb-delivery-loop-final-1",
  sourceType: "autonomous_delivery",
  itemType: "delivery",
  status: "open",
  title: "\u4ea4\u4ed8 Loop \u6700\u7ec8\u62a5\u544a\uff1a\u4fee\u590d Music \u64ad\u653e",
  summary: "\u4ea4\u4ed8 Loop \u5df2\u95ed\u73af",
  sourceId: "delivery_1:final-report",
  sourceRef: {
    notificationType: "autonomous_delivery.final_report_ready",
    caseId: "delivery_1",
    detailMessage: {
      format: "markdown",
      body: "# Autonomous Delivery Loop Final Report\n\nStatus: completed\n",
    },
  },
};
assert.equal(ui.actionInboxIsAutonomousDeliveryFinalReport(autonomousDeliveryFinalReportItem), "delivery_1");
assert.equal(ui.actionInboxStatusActionLabel(autonomousDeliveryFinalReportItem), "\u67e5\u770b\u62a5\u544a");
assert.deepEqual(ui.actionInboxActionMenuItems(autonomousDeliveryFinalReportItem).map((action) => action.id), [
  "detail",
  "dismiss",
]);
assert.equal(ui.actionInboxActionMenuItems(autonomousDeliveryFinalReportItem)[0].label, "\u67e5\u770b\u62a5\u544a");
sandbox.state.actionInboxDetail = { item: autonomousDeliveryFinalReportItem, events: [] };
sandbox.state.selectedActionInboxItemId = "ainb-delivery-loop-final-1";
const autonomousDeliveryFinalReportHtml = ui.renderActionInboxDetail();
assert.match(autonomousDeliveryFinalReportHtml, /action-inbox-detail-message/);
assert.match(autonomousDeliveryFinalReportHtml, /Autonomous Delivery Loop Final Report/);
sandbox.state.actionInboxDetail = null;
sandbox.state.selectedActionInboxItemId = "";

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
  summary: "Daily discussion report",
  sourceRef: {
    automationId: "auto-job-scheduled",
    scheduledTodo: true,
    automationTitle: "Daily discussion report",
  },
  workspaceId: "owner",
};
const scheduledTodoHtml = ui.renderActionInboxItem(scheduledTodoDelivery);
assert.equal(ui.actionInboxDisplayTitle(scheduledTodoDelivery), "Daily discussion report");
assert.equal(ui.actionInboxPrimaryDeliverable(scheduledTodoDelivery), null);
assert.match(scheduledTodoHtml, /<button class="action-inbox-item-main" type="button" data-action-inbox-open-source-id="ainb-auto-scheduled">/);
assert.doesNotMatch(scheduledTodoHtml, /data-action-inbox-open-deliverable-id="ainb-auto-scheduled"/);
assert.doesNotMatch(scheduledTodoHtml, /class="action-inbox-deliverable-chip automation-doc-preview compact doc-markdown"/);
assert.doesNotMatch(scheduledTodoHtml, />report\.md<\/span>/);
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
