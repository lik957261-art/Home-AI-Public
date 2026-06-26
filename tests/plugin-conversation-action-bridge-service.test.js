"use strict";

const assert = require("node:assert/strict");
const {
  createPluginConversationActionBridgeService,
} = require("../adapters/plugin-conversation-action-bridge-service");

function createHarness(options = {}) {
  const items = new Map();
  const calls = [];
  const actionInboxService = {
    upsertSourceItem(input) {
      calls.push({ type: "upsertSourceItem", input });
      const item = Object.assign({
        id: input.id || "ainb_plugin_conversation_1",
        sourceRef: input.sourceRef,
        rawJson: input.rawJson,
        status: input.status || "open",
      }, input);
      items.set(item.id, item);
      return { ok: true, item, event: { eventType: "source_created" } };
    },
    getItem(input) {
      calls.push({ type: "getItem", input });
      const item = items.get(input.itemId || input.id);
      if (!item) return { ok: false, status: 404, error: "action_inbox_item_not_found" };
      return { ok: true, item, events: [] };
    },
    completeItem(input) {
      calls.push({ type: "completeItem", input });
      const item = Object.assign({}, items.get(input.itemId), {
        status: "done",
        completedPayload: input.payload,
      });
      items.set(input.itemId, item);
      return { ok: true, item, event: { eventType: "completed" } };
    },
  };
  const taskCards = [];
  const taskCardService = {
    async sendTaskCard(input) {
      taskCards.push(input);
      return { ok: true, cardIds: ["ttc_plugin_conversation_1"] };
    },
  };
  const pushes = [];
  const service = createPluginConversationActionBridgeService(Object.assign({
    actionInboxService,
    appRouteUrl(params) {
      return `/?${new URLSearchParams(params).toString()}`;
    },
    nowIso: () => "2026-06-25T08:00:00.000Z",
    sendPushNotification(payload, meta) {
      pushes.push({ payload, meta });
      return { ok: true, sent: 1 };
    },
    taskCardService,
  }, options));
  return { calls, items, pushes, service, taskCards };
}

async function testCreateHealthCatalogGapCreatesOwnerApprovalOnly() {
  const { calls, pushes, service } = createHarness();
  const result = await service.createRequest({
    pluginId: "healthy",
    workspaceId: "weixin_fanfan",
    requestType: "catalog_gap",
    severity: "H2",
    title: "Add push_up exercise",
    summary: "Health conversation could not structure a push-up workout because the strength catalog lacks push_up.",
    suggestedChange: "Add key push_up with Chinese label 俯卧撑 and common aliases.",
    acceptance: "Focused catalog tests pass and push-up can be selected as a structured strength exercise.",
    evidence: {
      missing_key: "push_up",
      bounded_counts: "4 sets / 65 reps",
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.autoDispatched, false);
  assert.equal(result.inboxItem.workspaceId, "owner");
  assert.equal(result.inboxItem.assigneeWorkspaceId, "owner");
  assert.equal(result.inboxItem.sourceType, "plugin_conversation");
  assert.equal(result.inboxItem.sourceRef.pluginId, "health");
  assert.equal(result.inboxItem.sourceRef.targetThreadTitle, "健康");
  assert.equal(result.inboxItem.rawJson.pluginConversationActionBridge.taskCard.targetWorkspace, "/Users/example/path");
  assert.match(result.inboxItem.rawJson.pluginConversationActionBridge.taskCard.body, /push_up/);
  assert.match(result.inboxItem.rawJson.pluginConversationActionBridge.taskCard.body, /Plugin Conversation Repair Request/);
  assert.equal(calls.filter((call) => call.type === "upsertSourceItem").length, 1);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].payload.data.messageType, "plugin_conversation_repair_request");
}

async function testDispatchAttachesOwnerPromptAndCompletesItem() {
  const { calls, service, taskCards } = createHarness();
  const created = await service.createRequest({
    pluginId: "health",
    requestType: "catalog_gap",
    title: "Add push_up exercise",
    summary: "Missing push-up action.",
    suggestedChange: "Add push_up.",
  });
  const dispatched = await service.dispatchTaskCard({
    itemId: created.inboxItem.id,
    ownerPrompt: "Also check whether aliases include 伏地挺身 before deploying.",
    actor: "owner",
  });
  assert.equal(dispatched.ok, true);
  assert.equal(dispatched.dispatched, true);
  assert.equal(dispatched.ownerPromptAttached, true);
  assert.deepEqual(dispatched.taskCardIds, ["ttc_plugin_conversation_1"]);
  assert.match(taskCards[0].body, /## Owner Additional Prompt/);
  assert.match(taskCards[0].body, /伏地挺身/);
  assert.equal(taskCards[0].reasoningEffort, "xhigh");
  const completeCall = calls.find((call) => call.type === "completeItem");
  assert.equal(completeCall.input.payload.reason, "plugin_conversation_task_card_sent");
  assert.equal(completeCall.input.payload.ownerPromptAttached, true);
}

async function testUnknownPluginIsRejected() {
  const { service } = createHarness();
  const result = await service.createRequest({
    pluginId: "not-a-plugin",
    summary: "unknown",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.error, "plugin_conversation_target_unknown");
}

async function testMissingTaskCardServiceBlocksDispatch() {
  const harness = createHarness({ taskCardService: null });
  const created = await harness.service.createRequest({
    pluginId: "health",
    title: "Add push_up",
  });
  const result = await harness.service.dispatchTaskCard({ itemId: created.inboxItem.id });
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.error, "codex_task_card_service_unavailable");
}

async function run() {
  await testCreateHealthCatalogGapCreatesOwnerApprovalOnly();
  await testDispatchAttachesOwnerPromptAndCompletesItem();
  await testUnknownPluginIsRejected();
  await testMissingTaskCardServiceBlocksDispatch();
  console.log("plugin conversation action bridge service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
