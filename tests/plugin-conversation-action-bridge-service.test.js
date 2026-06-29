"use strict";

const assert = require("node:assert/strict");
const {
  createPluginConversationActionBridgeService,
} = require("../adapters/plugin-conversation-action-bridge-service");

function createHarness(options = {}) {
  const items = new Map();
  const dedupeItems = new Map();
  const calls = [];
  const actionInboxService = {
    upsertSourceItem(input) {
      calls.push({ type: "upsertSourceItem", input });
      const dedupeKey = input.dedupeKey || input.dedupe_key || "";
      const before = dedupeKey ? dedupeItems.get(dedupeKey) : null;
      const item = Object.assign({
        id: before?.id || input.id || "ainb_plugin_conversation_1",
        sourceRef: input.sourceRef,
        rawJson: input.rawJson,
        status: input.status || "open",
      }, before || {}, input);
      items.set(item.id, item);
      if (dedupeKey) dedupeItems.set(dedupeKey, item);
      return {
        ok: true,
        item,
        event: { eventType: before ? "source_updated" : "source_created" },
        created: !before,
        updated: Boolean(before),
        reopened: false,
      };
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
  assert.equal(result.inboxItem.sourceRef.targetWorkspace, "/Users/example/path");
  assert.equal(result.inboxItem.rawJson.pluginConversationActionBridge.taskCard.targetThreadTitle, "健康");
  assert.equal(result.inboxItem.rawJson.pluginConversationActionBridge.taskCard.targetWorkspace, "/Users/example/path");
  assert.ok(result.inboxItem.rawJson.pluginConversationActionBridge.taskCard.title);
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

async function testDispatchReadsSerializedTopLevelBridge() {
  const harness = createHarness();
  const created = await harness.service.createRequest({
    pluginId: "movie",
    requestType: "catalog_missing",
    title: "Movie MCP callable tools missing",
    summary: "Movie conversation reports mcp_movie_* tools are not exposed.",
    suggestedChange: "Sync Movie MCP callable hints and Gateway schema.",
  });
  const serializedItem = Object.assign({}, created.inboxItem, created.inboxItem.rawJson || {});
  delete serializedItem.rawJson;
  harness.items.set(created.inboxItem.id, serializedItem);
  const result = await harness.service.dispatchTaskCard({ itemId: created.inboxItem.id });
  assert.equal(result.ok, true);
  assert.equal(result.dispatched, true);
  assert.equal(harness.taskCards.length, 1);
  assert.equal(harness.taskCards[0].targetThreadTitle, "Movie");
  assert.equal(harness.taskCards[0].targetWorkspace, "/Users/example/path");
  assert.match(harness.taskCards[0].body, /mcp_movie_\* tools are not exposed/);
}

async function testCreateHomeAiCapabilityGapTargetsHomeAiThread() {
  const { calls, pushes, service } = createHarness();
  const result = await service.createRequest({
    pluginId: "homeai",
    workspaceId: "wuping",
    requestType: "capability_gap",
    severity: "H2",
    title: "Low gateway cannot generate verified PPTX",
    summary: "A directory-bound low-permission Gateway can prepare an Office capability repair request but has no host-persisted Owner approval id.",
    suggestedChange: "Add a safe Home AI tool path for generating and validating real Office/PPTX files from low-permission Gateway runs.",
    acceptance: "A low-permission directory-bound run creates an Owner Action Inbox approval with a real ainb_* id and does not claim a ttc_* until Owner dispatch.",
    evidence: {
      capability: "office_pptx_generation_validation",
      affected_surface: "directory-bound chat",
      required_tools: ["pptx_create", "pptx_validate"],
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.autoDispatched, false);
  assert.equal(result.request.pluginId, "home-ai");
  assert.equal(result.inboxItem.workspaceId, "owner");
  assert.equal(result.inboxItem.assigneeWorkspaceId, "owner");
  assert.equal(result.inboxItem.sourceRef.pluginId, "home-ai");
  assert.equal(result.inboxItem.sourceRef.sourceThreadTitleForTaskCard, "Home AI Task Intake");
  assert.equal(result.inboxItem.sourceRef.sourceThreadTitlePrefixForTaskCard, "Home AI Task Intake");
  assert.equal(result.inboxItem.sourceRef.targetThreadTitle, "Home AI");
  assert.equal(result.inboxItem.sourceRef.targetThreadTitlePrefix, "Home AI");
  assert.equal(result.inboxItem.sourceRef.targetWorkspace, "/Users/example/path");
  const taskCard = result.inboxItem.rawJson.pluginConversationActionBridge.taskCard;
  assert.equal(taskCard.sourceThreadTitle, "Home AI Task Intake");
  assert.equal(taskCard.sourceThreadTitlePrefix, "Home AI Task Intake");
  assert.equal(taskCard.targetThreadTitle, "");
  assert.equal(taskCard.targetThreadTitlePrefix, "Home AI");
  assert.equal(taskCard.targetWorkspace, "/Users/example/path");
  assert.match(taskCard.body, /Home AI Owner-Gated Repair Request/);
  assert.match(taskCard.body, /office_pptx_generation_validation/);
  assert.equal(calls.filter((call) => call.type === "upsertSourceItem").length, 1);
  assert.equal(pushes[0].payload.data.messageType, "plugin_conversation_repair_request");
}

async function testDuplicateRequestDoesNotSendDuplicatePush() {
  const { pushes, service } = createHarness();
  const input = {
    pluginId: "health",
    workspaceId: "owner",
    requestType: "catalog_gap",
    title: "Add push_up exercise",
    summary: "Missing push-up action.",
    suggestedChange: "Add push_up.",
  };
  const first = await service.createRequest(input);
  const second = await service.createRequest(input);
  assert.equal(first.ok, true);
  assert.equal(first.notified, true);
  assert.equal(second.ok, true);
  assert.equal(second.notified, false);
  assert.equal(pushes.length, 1);
  assert.equal(first.inboxItem.id, second.inboxItem.id);
}

async function testDispatchUpgradesLegacyHomeAiTargetToCurrentPrefix() {
  const harness = createHarness();
  const created = await harness.service.createRequest({
    pluginId: "home-ai",
    requestType: "capability_gap",
    title: "Home AI native card callable missing",
    summary: "Low Gateway prepared a request but could not submit a real card.",
    suggestedChange: "Repair Home AI task-card dispatch.",
  });
  const bridge = created.inboxItem.rawJson.pluginConversationActionBridge;
  bridge.taskCard.targetThreadTitle = "Home AI 06-18";
  delete bridge.taskCard.targetThreadTitlePrefix;
  harness.items.set(created.inboxItem.id, created.inboxItem);

  const result = await harness.service.dispatchTaskCard({ itemId: created.inboxItem.id });

  assert.equal(result.ok, true);
  assert.equal(harness.taskCards.length, 1);
  assert.equal(harness.taskCards[0].sourceThreadTitle, "Home AI Task Intake");
  assert.equal(harness.taskCards[0].sourceThreadTitlePrefix, "Home AI Task Intake");
  assert.equal(harness.taskCards[0].targetThreadTitle, undefined);
  assert.equal(harness.taskCards[0].targetThreadTitlePrefix, "Home AI");
  assert.equal(harness.taskCards[0].targetWorkspace, "/Users/example/path");
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

async function testIncompleteTargetDoesNotCreateUndispatchableInboxItem() {
  const { calls, service } = createHarness({
    pluginTargets: {
      health: {
        label: "Health",
        targetThreadTitle: "",
        targetWorkspace: "/Users/example/path",
      },
    },
  });
  const result = await service.createRequest({
    pluginId: "health",
    title: "Add push_up",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 500);
  assert.equal(result.error, "plugin_conversation_target_incomplete");
  assert.equal(calls.some((call) => call.type === "upsertSourceItem"), false);
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

async function testDispatchRecoversTaskCardMissingTargetThreadFromDefaultTarget() {
  const harness = createHarness();
  const created = await harness.service.createRequest({
    pluginId: "health",
    title: "Add push_up",
  });
  delete created.inboxItem.rawJson.pluginConversationActionBridge.taskCard.targetThreadId;
  delete created.inboxItem.rawJson.pluginConversationActionBridge.taskCard.targetThreadTitle;
  const result = await harness.service.dispatchTaskCard({ itemId: created.inboxItem.id });
  assert.equal(result.ok, true);
  assert.equal(harness.taskCards.length, 1);
  assert.equal(harness.taskCards[0].targetThreadId, "019ea9d5-8f99-7d92-90a2-e9ae094a7977");
  assert.equal(harness.taskCards[0].targetThreadTitle, "健康");
}

async function run() {
  await testCreateHealthCatalogGapCreatesOwnerApprovalOnly();
  await testDispatchAttachesOwnerPromptAndCompletesItem();
  await testDispatchReadsSerializedTopLevelBridge();
  await testCreateHomeAiCapabilityGapTargetsHomeAiThread();
  await testDuplicateRequestDoesNotSendDuplicatePush();
  await testDispatchUpgradesLegacyHomeAiTargetToCurrentPrefix();
  await testUnknownPluginIsRejected();
  await testIncompleteTargetDoesNotCreateUndispatchableInboxItem();
  await testMissingTaskCardServiceBlocksDispatch();
  await testDispatchRecoversTaskCardMissingTargetThreadFromDefaultTarget();
  console.log("plugin conversation action bridge service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
