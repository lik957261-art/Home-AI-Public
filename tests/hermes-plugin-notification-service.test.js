"use strict";

const assert = require("node:assert/strict");
const { createHermesPluginNotificationService } = require("../adapters/hermes-plugin-notification-service");

function createHarness(overrides = {}) {
  const calls = { inbox: [], push: [] };
  const service = createHermesPluginNotificationService(Object.assign({
    nowIso: () => "2026-05-29T10:00:00.000Z",
    appRouteUrl(params = {}) {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value) query.set(key, String(value));
      }
      return `/?${query.toString()}`;
    },
    workspacePrincipal(workspaceId) {
      return workspaceId === "weixin_wuping" ? "weixin_wuping" : "owner";
    },
    hermesPluginService: {
      pluginManifestUrl(id) {
        if (id === "wardrobe") return "http://192.168.10.99:8765/api/v1/hermes/plugin/manifest";
        if (id === "codex-mobile") return "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest";
        if (id === "finance") return "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest";
        return "";
      },
    },
    actionInboxService: {
      upsertSourceItem(input) {
        calls.inbox.push(input);
        return {
          ok: true,
          item: Object.assign({ id: "ainb-plugin-1" }, input),
        };
      },
    },
    sendPushNotification(payload, options) {
      calls.push.push({ payload, options });
      return Promise.resolve({ enabled: true, attempted: 1, sent: 1, failed: 0, removed: 0 });
    },
  }, overrides));
  return { calls, service };
}

async function testPluginNotificationCreatesInboxAndPush() {
  const { calls, service } = createHarness();
  const result = await service.postNotification({
    pluginId: "wardrobe",
    workspaceId: "weixin_wuping",
    eventId: "maintenance-watch-1",
    type: "maintenance_due",
    title: "腕表保养提醒",
    summary: "有一块腕表到保养时间。",
    itemType: "todo",
    priority: "high",
    route: {
      name: "watch-maintenance",
      itemId: "watch-1",
      privateDump: { should: "drop" },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.inboxItem.id, "ainb-plugin-1");
  assert.equal(calls.inbox.length, 1);
  assert.equal(calls.inbox[0].sourceType, "plugin");
  assert.equal(calls.inbox[0].sourceId, "maintenance-watch-1");
  assert.equal(calls.inbox[0].dedupeKey, "plugin:wardrobe:maintenance-watch-1");
  assert.equal(calls.inbox[0].sourceRef.pluginId, "wardrobe");
  assert.equal(calls.inbox[0].sourceRef.notificationType, "maintenance_due");
  assert.deepEqual(calls.inbox[0].sourceRef.route, { name: "watch-maintenance", itemId: "watch-1" });
  assert.equal(calls.inbox[0].deepLink, "/?view=wardrobe&workspaceId=weixin_wuping&pluginId=wardrobe&pluginRoute=watch-maintenance&pluginItemId=watch-1");
  assert.equal(calls.push.length, 1);
  assert.equal(calls.push[0].payload.data.messageType, "plugin_notification");
  assert.equal(calls.push[0].payload.data.inboxItemId, "ainb-plugin-1");
  assert.equal(calls.push[0].payload.data.url, "/?view=inbox&workspaceId=weixin_wuping&inboxItemId=ainb-plugin-1");
  assert.equal(calls.push[0].options.principalId, "weixin_wuping");
  assert.equal(calls.push[0].options.urgency, "high");
  assert.doesNotMatch(JSON.stringify(result), /endpoint|Bearer|access_key|password/i);
}

async function testPluginOpenModeCanClickThroughToPluginTab() {
  const { calls, service } = createHarness();
  const result = await service.postNotification({
    pluginId: "wardrobe",
    workspaceId: "owner",
    sourceId: "outfit-log-1",
    title: "穿着日志已更新",
    openMode: "plugin",
    route: { name: "outfit-log", itemId: "log-1" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.clickUrl, "/?view=wardrobe&workspaceId=owner&pluginId=wardrobe&pluginRoute=outfit-log&pluginItemId=log-1");
  assert.equal(calls.push[0].payload.data.viewMode, "wardrobe");
  assert.equal(calls.push[0].payload.data.url, result.clickUrl);
  assert.equal(calls.push[0].payload.data.originalUrl, result.clickUrl);
}

async function testRequiresStableSourceIdAndRegisteredPlugin() {
  const { service } = createHarness();
  assert.equal((await service.postNotification({ pluginId: "wardrobe", title: "Missing source" })).error, "plugin_notification_source_id_required");
  assert.equal((await service.postNotification({ pluginId: "missing", sourceId: "evt-1", title: "Missing plugin" })).error, "plugin_not_registered");
}

async function testNotifyFalseSkipsPush() {
  const { calls, service } = createHarness();
  const result = await service.postNotification({
    pluginId: "wardrobe",
    sourceId: "evt-2",
    title: "只入收件箱",
    notify: false,
  });
  assert.equal(result.ok, true);
  assert.equal(calls.inbox.length, 1);
  assert.equal(calls.push.length, 0);
  assert.equal(result.push, null);
}

async function testCodexTaskCompleteUsesWorkspaceScopedInboxRecord() {
  const { calls, service } = createHarness();
  const result = await service.postNotification({
    pluginId: "codex-mobile",
    workspaceId: "owner",
    sourceId: "codex-task-1",
    title: "Codex task complete",
    type: "task_complete",
    summary: "This turn 已结束 · 14:32",
    route: { name: "task", itemId: "codex-task-1" },
    openMode: "plugin",
    detailMessage: {
      format: "markdown",
      sourceTurnId: "turn-1",
      body: "# Codex task complete\n\nLong final receipt",
      truncated: false,
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.inboxItem.id, "ainb-plugin-1");
  assert.equal(calls.inbox.length, 1);
  assert.equal(calls.inbox[0].sourceType, "plugin");
  assert.equal(calls.inbox[0].sourceId, "codex-task-1");
  assert.equal(calls.inbox[0].dedupeKey, "plugin:codex-mobile:workspace:owner:latest");
  assert.deepEqual(calls.inbox[0].sourceRef.detailMessage, {
    format: "markdown",
    sourceTurnId: "turn-1",
    body: "# Codex task complete\n\nLong final receipt",
    truncated: false,
  });
  assert.equal(calls.push.length, 1);
  assert.equal(calls.push[0].payload.body, "This turn 已结束 · 14:32");
  assert.equal(JSON.stringify(calls.push[0]).includes("Long final receipt"), false);
  assert.equal(result.clickUrl, "/?view=codex&workspaceId=owner&pluginId=codex-mobile&pluginRoute=task&pluginItemId=codex-task-1");
  assert.equal(calls.push[0].payload.data.viewMode, "codex");
  assert.equal(calls.push[0].payload.data.url, result.clickUrl);
  assert.equal(calls.push[0].payload.data.originalUrl, result.clickUrl);
  assert.equal(calls.push[0].payload.data.inboxItemId, "ainb-plugin-1");
}

async function testPluginNotificationCanExplicitlySkipInbox() {
  const { calls, service } = createHarness({
    actionInboxService: null,
  });
  const result = await service.postNotification({
    pluginId: "wardrobe",
    workspaceId: "owner",
    sourceId: "wardrobe-toast-1",
    title: "Wardrobe background update",
    inbox: false,
    openMode: "plugin",
    route: { name: "updates" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.inboxItem, null);
  assert.equal(calls.inbox.length, 0);
  assert.equal(calls.push.length, 1);
  assert.equal(calls.push[0].payload.data.url, "/?view=wardrobe&workspaceId=owner&pluginId=wardrobe&pluginRoute=updates");
}

async function testFinanceLedgerJoinRequestCreatesApprovalInboxItem() {
  const { calls, service } = createHarness();
  const result = await service.postNotification({
    pluginId: "finance",
    type: "finance.ledger_join_request",
    request_id: "join-req-1",
    ledger: { id: "ledger-1", name: "Family Ledger" },
    requester: { finance_user_id: "finance-user-2", display_name: "Lulu" },
    target: { finance_user_id: "finance-owner", display_name: "Owner", hermesWorkspaceId: "owner" },
    requested_role: "viewer",
    status: "pending",
    created_at: "2026-05-31T09:00:00.000Z",
  });
  assert.equal(result.ok, true);
  assert.equal(calls.inbox.length, 1);
  assert.equal(calls.inbox[0].workspaceId, "owner");
  assert.equal(calls.inbox[0].sourceType, "plugin");
  assert.equal(calls.inbox[0].sourceId, "join-req-1");
  assert.equal(calls.inbox[0].itemType, "approval");
  assert.equal(calls.inbox[0].status, "open");
  assert.equal(calls.inbox[0].actionLabel, "\u5ba1\u6279");
  assert.equal(calls.inbox[0].sourceRef.pluginId, "finance");
  assert.equal(calls.inbox[0].sourceRef.notificationType, "finance.ledger_join_request");
  assert.equal(calls.inbox[0].sourceRef.requestId, "join-req-1");
  assert.deepEqual(calls.inbox[0].sourceRef.ledger, { id: "ledger-1", name: "Family Ledger" });
  assert.equal(calls.inbox[0].sourceRef.requestedRole, "viewer");
  assert.doesNotMatch(JSON.stringify(calls.inbox[0]), /token|cookie|bank|password|endpoint/i);
}

async function run() {
  await testPluginNotificationCreatesInboxAndPush();
  await testPluginOpenModeCanClickThroughToPluginTab();
  await testRequiresStableSourceIdAndRegisteredPlugin();
  await testNotifyFalseSkipsPush();
  await testCodexTaskCompleteUsesWorkspaceScopedInboxRecord();
  await testPluginNotificationCanExplicitlySkipInbox();
  await testFinanceLedgerJoinRequestCreatesApprovalInboxItem();
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
