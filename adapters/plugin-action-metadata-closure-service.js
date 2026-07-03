"use strict";

const crypto = require("node:crypto");

const { parsePluginConversationActionComments } = require("./gateway-run-completion-service");
const { normalizeManifest } = require("./hermes-plugin-service");
const { createPluginConversationActionBridgeService } = require("./plugin-conversation-action-bridge-service");
const { createThreadViewService } = require("./thread-view-service");
const {
  ACTION_KEY: WARDROBE_ACTION_KEY,
  GATEWAY_PREPARE_TOOL: WARDROBE_PREPARE_TOOL,
  LOCAL_EXECUTE_TOOL: WARDROBE_EXECUTE_TOOL,
  attachPreparedIntentToMessage,
  createWardrobeOutfitWearIntentActionService,
  extractPreparedIntentFromOutputItemEvent,
  publicPluginActionDiagnostics,
} = require("./wardrobe-outfit-wear-intent-action-service");

const MODEL_VERSION = "20260702-plugin-action-metadata-closure-v3";

function sha12(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 12);
}

function nowIso(options = {}) {
  return String(options.nowIso || "2026-07-01T08:00:00.000Z");
}

function buildReferenceWardrobeIntent(options = {}) {
  const timestamp = nowIso(options);
  return {
    type: "outfit_wear_intent",
    schema_version: 1,
    plugin_id: "wardrobe",
    principal_id: "owner",
    workspace_id: "owner",
    wear_date: "2026-07-01",
    timezone: "Asia/Shanghai",
    items: [
      { role: "Outer", code: "OUT-001" },
      { role: "Footwear", code: "SHOE-001" },
    ],
    source_message: {
      message_id: "assistant_reference",
      thread_id: "thread_reference",
      run_id: "run_reference",
    },
    idempotency_key: `wardrobe:outfit_wear_intent:${sha12(`reference:${timestamp}`)}`,
    expires_at: "2026-07-02T08:00:00.000Z",
    action: {
      mcp_tool: "wardrobe.execute_outfit_wear_intent",
      default_mode: "create_only",
      confirm_mode: "replace",
    },
  };
}

function compactStage(id, ok, evidence = {}) {
  return {
    id,
    ok: Boolean(ok),
    evidence,
  };
}

function familySummary(familyId, pluginId, actionKind, actionClass, stages = [], extra = {}) {
  const failed = stages.filter((stage) => !stage.ok);
  return Object.assign({
    familyId,
    pluginId,
    actionKind,
    actionClass,
    stageCount: stages.length,
    passedStageCount: stages.length - failed.length,
    failedStageCount: failed.length,
    stages,
    failedStages: failed.map((stage) => stage.id),
  }, extra, {
    ok: failed.length === 0,
  });
}

function aggregateFamilies(families = []) {
  const stageCount = families.reduce((sum, family) => sum + Number(family.stageCount || 0), 0);
  const passedStageCount = families.reduce((sum, family) => sum + Number(family.passedStageCount || 0), 0);
  const failedStageCount = families.reduce((sum, family) => sum + Number(family.failedStageCount || 0), 0);
  const actionClasses = [...new Set(families.map((family) => family.actionClass).filter(Boolean))];
  const failedStages = families.flatMap((family) => (
    Array.isArray(family.failedStages)
      ? family.failedStages.map((stage) => `${family.familyId}:${stage}`)
      : []
  ));
  const ok = families.length > 0 && families.every((family) => family.ok);
  return {
    ok,
    schemaVersion: 2,
    modelVersion: MODEL_VERSION,
    reference: {
      pluginId: "wardrobe",
      actionKind: "wardrobeOutfitWearIntent",
    },
    familyCount: families.length,
    actionFamilyCount: families.length,
    generalizedActionFamilyCount: Math.max(0, families.length - 1),
    actionClassCount: actionClasses.length,
    actionClasses,
    stageCount,
    passedStageCount,
    failedStageCount,
    stages: families.flatMap((family) => family.stages.map((stage) => Object.assign({}, stage, {
      familyId: family.familyId,
      actionClass: family.actionClass,
    }))),
    actionFamilies: families,
    failedStages,
    deterministicActionGeneralization: {
      status: ok && families.length >= 2 && actionClasses.length >= 2 ? "ok" : "partial",
      requiredFamilyCount: 2,
      observedFamilyCount: families.length,
      observedActionClassCount: actionClasses.length,
    },
    privacy: "metadata_only",
  };
}

function referenceThread(intent = {}) {
  const workspaceId = String(intent.workspace_id || "reference_workspace");
  const principalId = String(intent.principal_id || workspaceId);
  return {
    id: "thread_reference",
    title: "Wardrobe reference action",
    workspaceId,
    status: "done",
    messages: [
      {
        id: "assistant_reference",
        role: "assistant",
        content: "Bounded Wardrobe reference recommendation.",
        status: "done",
        runId: "run_reference",
        senderPrincipalId: principalId,
        senderWorkspaceId: workspaceId,
        loadedTools: [{ name: WARDROBE_PREPARE_TOOL }],
      },
    ],
  };
}

function outputItemEventForIntent(intent) {
  return {
    event: "response.output_item.done",
    item: {
      type: "function_call_output",
      call_id: "call_prepare_reference",
      output: JSON.stringify({ structuredContent: { intent } }),
    },
  };
}

function createReferenceActionService(calls, options = {}) {
  const responses = [
    {
      ok: true,
      result: {
        structuredContent: {
          ok: true,
          status: "needs_confirmation",
          needs_confirmation: true,
          confirm_mode: "replace",
          existing_outfit_id: "existing_reference",
        },
      },
    },
    {
      ok: true,
      result: {
        structuredContent: {
          ok: true,
          status: "stored",
          outfit_id: "stored_reference",
          readback_verified: true,
        },
      },
    },
  ];
  return createWardrobeOutfitWearIntentActionService({
    nowIso: () => nowIso(options),
    compactMessage: (message) => ({ id: message.id, pluginActions: message.pluginActions || null }),
    threadSummary: (thread) => ({ id: thread.id, workspaceId: thread.workspaceId, updatedAt: thread.updatedAt || "" }),
    saveState: (_state, saveOptions) => calls.saves.push({ reason: saveOptions?.reason || "" }),
    broadcast: (event) => calls.broadcasts.push({ type: event?.type || "", messageId: event?.messageId || "" }),
    async callWardrobeMcpTool(name, args) {
      calls.mcp.push({
        name,
        confirmReplace: Boolean(args?.confirm_replace),
        mode: String(args?.mode || ""),
        intentHash: sha12(args?.intent?.idempotency_key || ""),
      });
      return responses[Math.min(calls.mcp.length - 1, responses.length - 1)];
    },
  });
}

async function runWardrobeReferenceClosure(options = {}) {
  const family = await runWardrobeReferenceFamily(options);
  return Object.assign(aggregateFamilies([family]), {
    schemaVersion: 1,
    familyCount: 1,
    actionFamilyCount: 1,
    generalizedActionFamilyCount: 0,
    actionFamilies: [family],
    deterministicActionGeneralization: {
      status: "partial",
      requiredFamilyCount: 2,
      observedFamilyCount: 1,
      observedActionClassCount: 1,
    },
  });
}

async function runWardrobeReferenceFamily(options = {}) {
  const intent = buildReferenceWardrobeIntent(options);
  const thread = referenceThread(intent);
  const message = thread.messages[0];
  const event = outputItemEventForIntent(intent);
  const stages = [];

  const extracted = extractPreparedIntentFromOutputItemEvent(event, { functionName: WARDROBE_PREPARE_TOOL });
  stages.push(compactStage("gateway_output_metadata_attachment", Boolean(extracted), {
    pluginId: "wardrobe",
    actionKind: "wardrobeOutfitWearIntent",
    source: "response.output_item",
    itemCount: Array.isArray(extracted?.items) ? extracted.items.length : 0,
    idempotencyHash: sha12(extracted?.idempotency_key || ""),
  }));

  const attached = attachPreparedIntentToMessage(message, extracted, { updatedAt: nowIso(options) });
  stages.push(compactStage("message_metadata_persistence", Boolean(attached && message.pluginActions?.[WARDROBE_ACTION_KEY]), {
    actionKey: WARDROBE_ACTION_KEY,
    status: attached?.status || "",
    executable: Boolean(attached?.executable),
  }));

  const view = createThreadViewService({ nowIso: () => nowIso(options) });
  const projected = view.compactMessage(message, thread);
  stages.push(compactStage("thread_view_plugin_action_projection", Boolean(projected.pluginActions?.[WARDROBE_ACTION_KEY]), {
    actionKey: WARDROBE_ACTION_KEY,
    status: projected.pluginActions?.[WARDROBE_ACTION_KEY]?.status || "",
    diagnosticCode: projected.pluginActionDiagnostics?.[WARDROBE_ACTION_KEY]?.code || "",
  }));

  const missingMetadataDiagnostics = publicPluginActionDiagnostics({
    id: "assistant_missing",
    loadedTools: [{ name: WARDROBE_PREPARE_TOOL }],
  }, {
    workspaceId: "reference_workspace",
    principalId: "owner",
    prepareToolLoaded: true,
  });
  const filteredDiagnostics = publicPluginActionDiagnostics({
    id: "assistant_filtered",
    pluginActions: {
      [WARDROBE_ACTION_KEY]: {
        status: "ready",
        executable: true,
        intent: Object.assign({}, intent, { workspace_id: "other_workspace" }),
      },
    },
  }, {
    workspaceId: "reference_workspace",
    principalId: "owner",
  });
  stages.push(compactStage("plugin_action_projection_diagnostics", Boolean(
    missingMetadataDiagnostics?.[WARDROBE_ACTION_KEY]?.code === "intent_metadata_missing"
      && filteredDiagnostics?.[WARDROBE_ACTION_KEY]?.code === "renderer_filtered",
  ), {
    missingCode: missingMetadataDiagnostics?.[WARDROBE_ACTION_KEY]?.code || "",
    filteredCode: filteredDiagnostics?.[WARDROBE_ACTION_KEY]?.code || "",
    filteredReason: filteredDiagnostics?.[WARDROBE_ACTION_KEY]?.reason || "",
  }));

  const calls = { mcp: [], saves: [], broadcasts: [] };
  const actionService = createReferenceActionService(calls, options);
  const first = await actionService.execute({
    thread,
    message,
    workspaceId: "owner",
    principalId: "owner",
    mode: "create_only",
  });
  const second = await actionService.execute({
    thread,
    message,
    workspaceId: "owner",
    principalId: "owner",
    confirmReplace: true,
  });
  stages.push(compactStage("action_bridge_execution_probe", Boolean(
    first?.actionState?.status === "needs_confirmation"
      && second?.actionState?.status === "stored"
      && calls.mcp.length === 2,
  ), {
    mcpTool: WARDROBE_EXECUTE_TOOL,
    firstStatus: first?.actionState?.status || "",
    secondStatus: second?.actionState?.status || "",
    callCount: calls.mcp.length,
    modes: calls.mcp.map((call) => call.mode),
    confirmReplaceCalls: calls.mcp.filter((call) => call.confirmReplace).length,
    saveCount: calls.saves.length,
    broadcastCount: calls.broadcasts.length,
  }));

  const postExecutionProjected = view.compactMessage(message, thread);
  const projectedActionState = postExecutionProjected.pluginActions?.[WARDROBE_ACTION_KEY] || null;
  stages.push(compactStage("action_state_readback_probe", Boolean(
    second?.actionState?.status === "stored"
      && second?.actionState?.readbackVerified === true
      && Boolean(second?.actionState?.outfitId)
      && message.pluginActions?.[WARDROBE_ACTION_KEY]?.status === "stored"
      && projectedActionState?.status === "stored"
      && projectedActionState?.readbackVerified === true
      && calls.saves.length >= 4
      && calls.broadcasts.some((event) => event.type === "message.updated"),
  ), {
    finalStatus: second?.actionState?.status || "",
    readbackVerified: second?.actionState?.readbackVerified === true,
    outfitIdHash: sha12(second?.actionState?.outfitId || ""),
    persistedStatus: message.pluginActions?.[WARDROBE_ACTION_KEY]?.status || "",
    projectedStatus: projectedActionState?.status || "",
    projectedReadbackVerified: projectedActionState?.readbackVerified === true,
    saveCount: calls.saves.length,
    messageUpdateBroadcastCount: calls.broadcasts.filter((event) => event.type === "message.updated").length,
  }));

  const noModelRunEnqueued = calls.mcp.every((call) => call.name === WARDROBE_EXECUTE_TOOL);
  stages.push(compactStage("no_model_run_action_boundary", noModelRunEnqueued, {
    deterministicToolCalls: calls.mcp.length,
    modelRunCreated: false,
  }));

  return familySummary(
    "wardrobe_outfit_wear_intent",
    "wardrobe",
    "wardrobeOutfitWearIntent",
    "mcp_intent_action",
    stages,
    {
      reference: {
        pluginId: "wardrobe",
        actionKind: "wardrobeOutfitWearIntent",
      },
    },
  );
}

function buildReferencePluginConversationOutput(options = {}) {
  const payload = {
    pluginId: "home-ai",
    requestType: "capability_gap",
    severity: "H2",
    title: "Repair bounded plugin action closure",
    summary: "Bounded reference repair request for deterministic action bridge closure.",
    suggestedChange: "Use Owner-gated task-card dispatch with bounded metadata.",
    acceptance: "A deterministic task card can be dispatched without a model turn.",
    workspaceId: "reference_workspace",
    sourceThreadId: "thread_reference",
    sourceTurnId: "assistant_reference",
    createdAt: nowIso(options),
    evidence: {
      source: "plugin-action-metadata-closure-smoke",
      privacy: "metadata_only",
    },
  };
  return [
    "Bounded plugin repair recommendation.",
    "<!-- homeai-plugin-conversation-action",
    JSON.stringify(payload),
    "-->",
  ].join("\n");
}

function createReferenceActionInbox(calls) {
  const items = new Map();
  const events = new Map();
  return {
    upsertSourceItem(notification) {
      calls.inboxUpserts.push({
        dedupeKey: notification.dedupeKey || "",
        title: notification.title || "",
        status: notification.status || "",
      });
      const key = notification.dedupeKey || notification.sourceId || `item:${items.size + 1}`;
      const existing = items.get(key);
      const item = Object.assign({}, existing || {}, notification, {
        id: existing?.id || `ainb_reference_${items.size + 1}`,
      });
      items.set(key, item);
      return {
        ok: true,
        created: !existing,
        updated: Boolean(existing),
        item,
        event: {
          eventType: existing ? "source_updated" : "source_created",
        },
      };
    },
    getItem({ itemId }) {
      for (const item of items.values()) {
        if (item.id === itemId) return { ok: true, item, events: events.get(item.id) || [] };
      }
      return { ok: false, status: 404, error: "item_not_found" };
    },
    completeItem({ itemId, payload }) {
      for (const [key, item] of items.entries()) {
        if (item.id !== itemId) continue;
        const completed = Object.assign({}, item, {
          status: "completed",
          completion: payload || {},
        });
        items.set(key, completed);
        const event = {
          id: `ainbe_reference_${(events.get(itemId) || []).length + 1}`,
          eventType: "completed",
          payload: payload || {},
          createdAt: nowIso(),
        };
        events.set(itemId, [event].concat(events.get(itemId) || []));
        calls.completedItems.push({ itemId, reason: payload?.reason || "" });
        return { ok: true, item: completed, event };
      }
      return { ok: false, status: 404, error: "item_not_found" };
    },
  };
}

async function runPluginConversationRepairRequestClosure(options = {}) {
  const output = buildReferencePluginConversationOutput(options);
  const parsedActions = parsePluginConversationActionComments(output);
  const stages = [];
  const action = parsedActions[0] || null;
  stages.push(compactStage("gateway_output_action_comment_parse", parsedActions.length === 1 && action?.pluginId === "home-ai", {
    actionCount: parsedActions.length,
    pluginId: action?.pluginId || "",
    requestType: action?.requestType || "",
  }));

  const calls = {
    inboxUpserts: [],
    pushes: [],
    sentTaskCards: [],
    completedItems: [],
  };
  const actionInboxService = createReferenceActionInbox(calls);
  const taskCardService = {
    sendTaskCard(taskCard) {
      calls.sentTaskCards.push({
        title: taskCard.title || "",
        targetWorkspace: taskCard.targetWorkspace || taskCard.targetWorkspaceCwd || "",
        targetThreadTitle: taskCard.targetThreadTitle || taskCard.targetThreadTitlePrefix || "",
        requestId: taskCard.requestId || "",
      });
      return { ok: true, cardId: "ttc_reference_plugin_conversation" };
    },
  };
  const bridge = createPluginConversationActionBridgeService({
    actionInboxService,
    taskCardService,
    nowIso: () => nowIso(options),
    appRouteUrl: (params) => `/?view=${encodeURIComponent(params.view || "")}&workspaceId=${encodeURIComponent(params.workspaceId || "")}&inboxItemId=${encodeURIComponent(params.inboxItemId || "")}`,
    sendPushNotification(payload, pushOptions) {
      calls.pushes.push({
        title: payload.title || "",
        tag: payload.tag || "",
        urgency: pushOptions?.urgency || "",
      });
      return { ok: true };
    },
    pluginTargets: {
      "home-ai": {
        label: "Home AI",
        targetWorkspace: "/Users/example/path",
        targetThreadTitle: "Home AI",
        sourceThreadTitle: "Home AI",
      },
    },
  });

  const first = action ? await bridge.createRequest(action) : null;
  const second = action ? await bridge.createRequest(action) : null;
  stages.push(compactStage("action_inbox_projection", Boolean(first?.ok && first?.inboxItem?.id), {
    inboxItemIdHash: sha12(first?.inboxItem?.id || ""),
    created: first?.event?.eventType === "source_created",
    dispatchReady: Boolean(first?.dispatchReady),
    pushCount: calls.pushes.length,
  }));
  stages.push(compactStage("owner_push_dedupe_boundary", Boolean(first?.notified === true && second?.notified === false && calls.pushes.length === 1), {
    firstNotified: Boolean(first?.notified),
    secondNotified: Boolean(second?.notified),
    pushCount: calls.pushes.length,
    upsertCount: calls.inboxUpserts.length,
    pushTagHash: sha12(calls.pushes[0]?.tag || ""),
  }));

  const dispatch = first?.inboxItem?.id ? await bridge.dispatchTaskCard({
    itemId: first.inboxItem.id,
    actor: "owner",
  }) : null;
  stages.push(compactStage("task_card_dispatch_bridge_probe", Boolean(dispatch?.ok && calls.sentTaskCards.length === 1), {
    dispatched: Boolean(dispatch?.dispatched),
    taskCardCount: calls.sentTaskCards.length,
    targetWorkspace: calls.sentTaskCards[0]?.targetWorkspace || "",
    taskCardRequestIdHash: sha12(calls.sentTaskCards[0]?.requestId || ""),
    completedItemCount: calls.completedItems.length,
  }));
  const duplicateDispatch = first?.inboxItem?.id ? await bridge.dispatchTaskCard({
    itemId: first.inboxItem.id,
    actor: "owner",
  }) : null;
  stages.push(compactStage("task_card_dispatch_idempotency_probe", Boolean(duplicateDispatch?.ok && duplicateDispatch?.alreadyDispatched === true && calls.sentTaskCards.length === 1), {
    alreadyDispatched: Boolean(duplicateDispatch?.alreadyDispatched),
    taskCardCount: calls.sentTaskCards.length,
    taskCardIdCount: Array.isArray(duplicateDispatch?.taskCardIds) ? duplicateDispatch.taskCardIds.length : 0,
  }));
  stages.push(compactStage("no_model_run_action_boundary", Boolean(dispatch?.ok && !dispatch?.modelRunCreated), {
    deterministicBridgeCalls: calls.inboxUpserts.length + calls.sentTaskCards.length,
    modelRunCreated: false,
  }));

  return familySummary(
    "plugin_conversation_repair_request",
    "home-ai",
    "pluginConversationRepairRequest",
    "owner_task_card_action",
    stages,
    {
      reference: {
        pluginId: "home-ai",
        actionKind: "pluginConversationRepairRequest",
      },
    },
  );
}

function runManifestRouteActionClosure(options = {}) {
  const manifest = normalizeManifest({
    id: "finance",
    title: "Finance",
    entry: "/finance.html",
    actions: [
      {
        id: "record",
        label: "Record",
        entry: { type: "plugin_route", pluginRoute: "record" },
      },
    ],
  }, {
    id: "finance",
    manifestUrl: "http://127.0.0.1:4191/api/v1/hermes/plugin/manifest",
    fetchedAt: nowIso(options),
  });
  const action = manifest.actions[0] || null;
  const route = {
    pluginActionId: action?.id || "",
    pluginRoute: action?.entry?.pluginRoute || "",
    pluginItemId: action?.entry?.pluginItemId || "",
    pluginThreadId: action?.entry?.pluginThreadId || "",
    pluginTaskId: action?.entry?.pluginTaskId || "",
    sourceTurnId: action?.entry?.sourceTurnId || "",
  };
  const routeQuery = new URLSearchParams();
  routeQuery.set("view", "finance");
  routeQuery.set("pluginId", "finance");
  for (const [key, value] of Object.entries(route)) {
    if (value) routeQuery.set(key, value);
  }
  const stages = [
    compactStage("host_manifest_action_normalization", Boolean(action?.entry?.type === "plugin_route" && action.entry.pluginRoute === "record"), {
      pluginId: manifest.id,
      actionId: action?.id || "",
      entryType: action?.entry?.type || "",
      pluginRoute: action?.entry?.pluginRoute || "",
    }),
    compactStage("plugin_route_action_projection", Boolean(route.pluginActionId === "record" && route.pluginRoute === "record"), {
      pluginActionId: route.pluginActionId,
      pluginRoute: route.pluginRoute,
    }),
    compactStage("route_snapshot_readback", Boolean(routeQuery.get("pluginActionId") === "record" && routeQuery.get("pluginRoute") === "record"), {
      view: routeQuery.get("view") || "",
      pluginId: routeQuery.get("pluginId") || "",
      hasPluginActionId: Boolean(routeQuery.get("pluginActionId")),
      hasPluginRoute: Boolean(routeQuery.get("pluginRoute")),
    }),
    compactStage("no_model_run_action_boundary", true, {
      deterministicRouteOpen: true,
      modelRunCreated: false,
    }),
  ];
  return familySummary(
    "finance_manifest_route_action",
    "finance",
    "manifestPluginRouteAction",
    "manifest_route_action",
    stages,
    {
      reference: {
        pluginId: "finance",
        actionKind: "manifestPluginRouteAction",
      },
    },
  );
}

async function runPluginActionMetadataClosure(options = {}) {
  const families = [];
  const action = String(options.action || "all").trim() || "all";
  if (action === "all" || action === "wardrobe-outfit-wear-intent") {
    families.push(await runWardrobeReferenceFamily(options));
  }
  if (action === "all" || action === "plugin-conversation-repair-request") {
    families.push(await runPluginConversationRepairRequestClosure(options));
  }
  if (action === "all" || action === "finance-manifest-route-action") {
    families.push(runManifestRouteActionClosure(options));
  }
  if (!families.length) throw new Error(`unsupported_plugin_action_metadata_smoke:${action}`);
  return aggregateFamilies(families);
}

module.exports = {
  MODEL_VERSION,
  buildReferenceWardrobeIntent,
  buildReferencePluginConversationOutput,
  runManifestRouteActionClosure,
  runPluginActionMetadataClosure,
  runPluginConversationRepairRequestClosure,
  runWardrobeReferenceClosure,
};
