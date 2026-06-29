"use strict";

const crypto = require("node:crypto");

const {
  DEFAULT_PLUGIN_TARGETS,
} = require("./ai-ops-diagnostic-remediation-service");

const APP_WORKSPACE = "/Users/example/path";
const OWNER_WORKSPACE_ID = "owner";
const NOTIFICATION_TYPE = "plugin_conversation.repair_request";

const PLUGIN_ALIASES = Object.freeze({
  healthy: "health",
  homeai: "home-ai",
  home_ai: "home-ai",
  host: "home-ai",
  platform: "home-ai",
});

function clean(value, max = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 500));
}

function cleanBlock(value, max = 1600) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 1600));
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeToken(value, fallback = "unknown", max = 100) {
  const token = clean(value, max)
    .replace(/[^A-Za-z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return token || fallback;
}

function normalizePluginId(value) {
  const raw = safeToken(value, "", 80).toLowerCase();
  return PLUGIN_ALIASES[raw] || raw;
}

function normalizeSeverity(value) {
  const raw = clean(value || "H2", 20).toUpperCase();
  if (raw === "H1" || raw === "H2" || raw === "H3" || raw === "H4") return raw;
  return "H2";
}

function severityPriority(value) {
  const severity = normalizeSeverity(value);
  if (severity === "H1") return "urgent";
  if (severity === "H2") return "high";
  return "normal";
}

function hash(value, length = 16) {
  return crypto.createHash("sha256").update(String(value ?? "")).digest("hex").slice(0, length);
}

function nowIso(options = {}) {
  return typeof options.nowIso === "function" ? options.nowIso() : new Date().toISOString();
}

function appRouteUrl(options, params = {}) {
  if (typeof options.appRouteUrl === "function") return options.appRouteUrl(params);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const text = clean(value, 300);
    if (text) query.set(key, text);
  }
  const serialized = query.toString();
  return serialized ? `/?${serialized}` : "/";
}

function targetForPlugin(pluginId, targets = {}) {
  const target = Object.assign({}, DEFAULT_PLUGIN_TARGETS, targets)[pluginId];
  return target || null;
}

function targetDispatchReady(target = {}) {
  return Boolean(
    clean(target.targetWorkspace, 300)
    && (
      clean(target.targetThreadId, 180)
      || clean(target.targetThreadTitle, 180)
      || clean(target.targetThreadTitlePrefix, 180)
    ),
  );
}

function targetThreadLabel(target = {}) {
  return clean(target.targetThreadTitle || target.targetThreadTitlePrefix || target.targetThreadId || "", 180);
}

function isHomeAiTarget(recordOrPluginId = {}) {
  const pluginId = typeof recordOrPluginId === "string"
    ? normalizePluginId(recordOrPluginId)
    : normalizePluginId(recordOrPluginId.pluginId || recordOrPluginId.plugin_id);
  return pluginId === "home-ai";
}

function requestSignature(input = {}) {
  return hash([
    normalizePluginId(input.pluginId || input.plugin_id),
    safeToken(input.requestType || input.request_type || input.category || "repair_request", "repair_request", 120),
    clean(input.summary || input.title || input.problem || "", 400),
    clean(input.suggestedChange || input.suggested_change || input.acceptance || "", 600),
  ].join("\n"), 20);
}

function requestRecord(input = {}, target = {}, options = {}) {
  const pluginId = normalizePluginId(input.pluginId || input.plugin_id);
  const requestType = safeToken(input.requestType || input.request_type || input.category || "repair_request", "repair_request", 120);
  const severity = normalizeSeverity(input.severity || input.severity_hint || "H2");
  const signature = requestSignature(Object.assign({}, input, { pluginId, requestType }));
  const requestId = safeToken(input.requestId || input.request_id || `pcr_${pluginId}_${signature}`, `pcr_${pluginId}_${signature}`, 180);
  return {
    requestId,
    pluginId,
    pluginLabel: clean(target.label || pluginId, 80),
    requestType,
    severity,
    sourceWorkspaceId: clean(input.workspaceId || input.workspace_id || input.sourceWorkspaceId || input.source_workspace_id || "owner", 120) || "owner",
    sourceThreadId: clean(input.sourceThreadId || input.source_thread_id, 180),
    sourceTurnId: clean(input.sourceTurnId || input.source_turn_id, 180),
    title: clean(input.title || input.summary || `${target.label || pluginId} repair request`, 180),
    summary: cleanBlock(input.summary || input.problem || input.userSummary || input.user_summary || "", 900),
    suggestedChange: cleanBlock(input.suggestedChange || input.suggested_change || input.recommendedChange || input.recommended_change || "", 1800),
    acceptance: cleanBlock(input.acceptance || input.validation || input.expectedResult || input.expected_result || "", 1200),
    privacyBoundary: cleanBlock(input.privacyBoundary || input.privacy_boundary || "", 900),
    createdAt: clean(input.createdAt || input.created_at || nowIso(options), 80),
    signature,
    evidence: objectValue(input.evidence || input.boundedEvidence || input.bounded_evidence),
  };
}

function compactEvidence(evidence = {}, max = 1600) {
  const bounded = {};
  for (const [key, value] of Object.entries(objectValue(evidence))) {
    if (value == null) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      bounded[safeToken(key, "field", 80)] = clean(value, 300);
    } else if (Array.isArray(value)) {
      bounded[safeToken(key, "field", 80)] = value.slice(0, 12).map((item) => clean(item, 180));
    } else if (typeof value === "object") {
      bounded[safeToken(key, "field", 80)] = clean(JSON.stringify(value), 600);
    }
  }
  const text = JSON.stringify(bounded, null, 2);
  return text.length <= max ? text : `${text.slice(0, max - 24)}\n  \"truncated\": true\n}`;
}

function taskCardBody(record, target) {
  const evidence = compactEvidence(record.evidence);
  const homeAiTarget = isHomeAiTarget(record);
  const sections = [
    homeAiTarget ? "# Home AI Owner-Gated Repair Request" : "# Plugin Conversation Repair Request",
    "",
    homeAiTarget
      ? "Source surface: Home AI host chat or directory-bound conversation."
      : "Source surface: Home AI host plugin conversation window.",
    homeAiTarget
      ? `Target: \`${record.pluginId}\` (${record.pluginLabel})`
      : `Plugin: \`${record.pluginId}\` (${record.pluginLabel})`,
    `Request id: \`${record.requestId}\``,
    `Request type: \`${record.requestType}\``,
    `Severity hint: \`${record.severity}\``,
    `Source workspace: \`${record.sourceWorkspaceId}\``,
    `Target thread: \`${targetThreadLabel(target)}\``,
    `Target workspace: \`${target.targetWorkspace || ""}\``,
    "",
    "## User-Visible Problem",
    "",
    record.summary || record.title,
    "",
    "## Suggested Change",
    "",
    record.suggestedChange || "Inspect the plugin product contract and implement the smallest durable repair for the reported capability gap.",
    "",
    "## Acceptance",
    "",
    record.acceptance || "Add or update focused tests and return bounded source/deploy evidence. Do not mark completed until the user-facing path is verified or an exact blocker is returned.",
    "",
    "## Bounded Evidence",
    "",
    "```json",
    evidence,
    "```",
    "",
    "## Privacy Boundary",
    "",
    record.privacyBoundary || "Do not include raw secrets, cookies, launch tokens, OAuth tokens, provider payloads, private health records, private plugin payloads, database rows, screenshots with private data, full prompts, or long logs in the return card.",
  ];
  return sections.join("\n");
}

function taskCardForRecord(record, target) {
  return {
    title: clean(`Repair ${record.pluginLabel} ${record.requestType}`, 80),
    summary: clean(`${record.pluginId} ${record.requestType}: ${record.title || record.summary}`, 240),
    body: taskCardBody(record, target),
    sourceThreadId: clean(target.sourceThreadId, 180),
    sourceThreadTitle: clean(target.sourceThreadTitle, 180),
    sourceThreadTitlePrefix: clean(target.sourceThreadTitlePrefix, 180),
    targetThreadId: clean(target.targetThreadId, 180),
    targetThreadTitle: clean(target.targetThreadTitle, 180),
    targetThreadTitlePrefix: clean(target.targetThreadTitlePrefix, 180),
    targetWorkspace: target.targetWorkspace,
    workflowMode: "manual",
    reasoningEffort: record.severity === "H1" || record.severity === "H2" ? "xhigh" : "high",
    requestId: `plugin-conversation-${record.requestId}`,
  };
}

function ownerNotificationForRecord(record, target) {
  const taskCard = taskCardForRecord(record, target);
  const homeAiTarget = isHomeAiTarget(record);
  return {
    workspaceId: OWNER_WORKSPACE_ID,
    assigneeWorkspaceId: OWNER_WORKSPACE_ID,
    sourceType: "plugin_conversation",
    sourceId: record.requestId,
    itemType: "approval",
    status: "open",
    priority: severityPriority(record.severity),
    title: clean(`${homeAiTarget ? "Home AI 请求修复" : "插件请求修复"}：${record.pluginLabel} ${record.title || record.requestType}`, 180),
    summary: [
      `${record.pluginLabel} ${homeAiTarget ? "会话" : "插件会话"}提出 ${record.requestType} 修复请求。`,
      record.summary || record.suggestedChange || "",
      `目标：${targetThreadLabel(target) || target.targetWorkspace || "unknown"}`,
    ].filter(Boolean).join("\n"),
    actionLabel: "发修复卡",
    dedupeKey: `plugin-conversation-repair:${record.pluginId}:${record.signature}:owner`,
    reopen: true,
    sourceRef: {
      notificationType: NOTIFICATION_TYPE,
      requestId: record.requestId,
      pluginId: record.pluginId,
      sourceWorkspaceId: record.sourceWorkspaceId,
      sourceThreadId: record.sourceThreadId,
      sourceTurnId: record.sourceTurnId,
      severity: record.severity,
      requestType: record.requestType,
      sourceThreadIdForTaskCard: clean(target.sourceThreadId, 180),
      sourceThreadTitleForTaskCard: clean(target.sourceThreadTitle, 180),
      sourceThreadTitlePrefixForTaskCard: clean(target.sourceThreadTitlePrefix, 180),
      targetThreadId: clean(target.targetThreadId, 180),
      targetThreadTitle: targetThreadLabel(target),
      targetThreadTitlePrefix: target.targetThreadTitlePrefix || "",
      targetWorkspace: target.targetWorkspace || "",
    },
    rawJson: {
      pluginConversationActionBridge: {
        request: record,
        taskCard,
      },
    },
  };
}

function appendOwnerPrompt(taskCard, ownerPrompt) {
  const prompt = cleanBlock(ownerPrompt, 1200);
  if (!prompt) return taskCard;
  return Object.assign({}, taskCard, {
    body: [
      taskCard.body || "",
      "",
      "## Owner Additional Prompt",
      "",
      prompt,
    ].join("\n"),
  });
}

function cardIdsFromResult(result = {}) {
  if (Array.isArray(result.cardIds)) return result.cardIds.map((item) => clean(item, 160)).filter(Boolean);
  if (Array.isArray(result.taskCardIds)) return result.taskCardIds.map((item) => clean(item, 160)).filter(Boolean);
  if (result.cardId) return [clean(result.cardId, 160)].filter(Boolean);
  return [];
}

function shouldNotifyOwner(inboxResult = {}) {
  if (inboxResult.created === true || inboxResult.reopened === true) return true;
  if (inboxResult.created === false || inboxResult.updated === true) return false;
  const eventType = clean(inboxResult.event?.eventType || inboxResult.event?.event_type, 80);
  if (!eventType) return true;
  return eventType === "source_created";
}

function dispatchTaskCardTarget(baseTaskCard = {}, sourceRef = {}, pluginTargets = {}) {
  const pluginId = normalizePluginId(sourceRef.pluginId || sourceRef.plugin_id);
  const target = targetForPlugin(pluginId, pluginTargets) || {};
  const next = Object.assign({}, baseTaskCard);
  if (target.targetWorkspace && !next.targetWorkspace) next.targetWorkspace = target.targetWorkspace;
  if (target.sourceThreadId && !next.sourceThreadId) next.sourceThreadId = target.sourceThreadId;
  if (target.sourceThreadTitle && !next.sourceThreadTitle) next.sourceThreadTitle = target.sourceThreadTitle;
  if (target.sourceThreadTitlePrefix && !next.sourceThreadTitlePrefix) next.sourceThreadTitlePrefix = target.sourceThreadTitlePrefix;
  if (target.targetThreadId && !next.targetThreadId) next.targetThreadId = target.targetThreadId;
  if (target.targetThreadTitlePrefix) {
    next.targetThreadTitlePrefix = target.targetThreadTitlePrefix;
    if (!target.targetThreadTitle) delete next.targetThreadTitle;
  } else if (target.targetThreadTitle && !next.targetThreadTitle) {
    next.targetThreadTitle = target.targetThreadTitle;
  }
  return next;
}

function createPluginConversationActionBridgeService(options = {}) {
  const actionInboxService = options.actionInboxService;
  const taskCardService = options.taskCardService;
  const sendPushNotification = typeof options.sendPushNotification === "function" ? options.sendPushNotification : null;
  const pluginTargets = options.pluginTargets || {};

  async function createRequest(input = {}) {
    const pluginId = normalizePluginId(input.pluginId || input.plugin_id);
    if (!pluginId) return { ok: false, status: 400, error: "plugin_conversation_plugin_id_required" };
    const target = targetForPlugin(pluginId, pluginTargets);
    if (!target) return { ok: false, status: 400, error: "plugin_conversation_target_unknown", pluginId };
    if (!targetDispatchReady(target)) {
      return { ok: false, status: 500, error: "plugin_conversation_target_incomplete", pluginId };
    }
    if (!actionInboxService || typeof actionInboxService.upsertSourceItem !== "function") {
      return { ok: false, status: 503, error: "action_inbox_service_unavailable" };
    }
    const record = requestRecord(Object.assign({}, input, { pluginId }), target, options);
    const notification = ownerNotificationForRecord(record, target);
    const inboxResult = await Promise.resolve(actionInboxService.upsertSourceItem(notification));
    if (!inboxResult?.ok) return inboxResult || { ok: false, status: 500, error: "action_inbox_upsert_failed" };
    const ownerPushRequired = shouldNotifyOwner(inboxResult);
    let push = null;
    if (sendPushNotification && ownerPushRequired) {
      const url = appRouteUrl(options, {
        view: "inbox",
        workspaceId: OWNER_WORKSPACE_ID,
        inboxItemId: inboxResult.item?.id || "",
      });
      push = await Promise.resolve(sendPushNotification({
        title: inboxResult.item?.title || "插件请求修复",
        body: clean(inboxResult.item?.summary || "插件会话提交了需要 Owner 审批的修复请求。", 240),
        tag: `homeai-plugin-conversation-${record.requestId}`,
        requireInteraction: true,
        renotify: true,
        data: {
          url,
          viewMode: "inbox",
          workspaceId: OWNER_WORKSPACE_ID,
          inboxItemId: inboxResult.item?.id || "",
          messageType: "plugin_conversation_repair_request",
          pluginId,
          requestId: record.requestId,
        },
      }, {
        principalId: OWNER_WORKSPACE_ID,
        urgency: severityPriority(record.severity) === "normal" ? "normal" : "high",
        ttl: 24 * 60 * 60,
      })).catch((err) => ({
        ok: false,
        error: clean(err?.message || err || "plugin_conversation_push_failed", 240),
      }));
    }
    return {
      ok: true,
      notified: Boolean(ownerPushRequired),
      request: record,
      inboxItem: inboxResult.item,
      event: inboxResult.event,
      push,
      dispatchReady: true,
      autoDispatched: false,
    };
  }

  async function dispatchTaskCard(input = {}) {
    const itemId = clean(input.itemId || input.item_id || input.id, 160);
    if (!itemId) return { ok: false, status: 400, error: "plugin_conversation_inbox_item_required" };
    if (!actionInboxService || typeof actionInboxService.getItem !== "function") {
      return { ok: false, status: 503, error: "action_inbox_service_unavailable" };
    }
    if (!taskCardService || typeof taskCardService.sendTaskCard !== "function") {
      return { ok: false, status: 503, error: "codex_task_card_service_unavailable" };
    }
    const itemResult = await Promise.resolve(actionInboxService.getItem({ itemId }));
    if (!itemResult?.ok) return itemResult || { ok: false, status: 404, error: "action_inbox_item_not_found" };
    const item = itemResult.item || {};
    const sourceRef = objectValue(item.sourceRef || item.source_ref);
    if (clean(sourceRef.notificationType, 160) !== NOTIFICATION_TYPE) {
      return { ok: false, status: 409, error: "plugin_conversation_item_not_dispatchable" };
    }
    const raw = objectValue(item.rawJson || item.raw_json);
    if (item.pluginConversationActionBridge && typeof item.pluginConversationActionBridge === "object" && !Array.isArray(item.pluginConversationActionBridge)) {
      raw.pluginConversationActionBridge = item.pluginConversationActionBridge;
    }
    const bridge = objectValue(raw.pluginConversationActionBridge);
    const baseTaskCard = dispatchTaskCardTarget(objectValue(bridge.taskCard), sourceRef, pluginTargets);
    if (!baseTaskCard.title || !baseTaskCard.body || !baseTaskCard.targetWorkspace || !(baseTaskCard.targetThreadTitle || baseTaskCard.targetThreadId || baseTaskCard.targetThreadTitlePrefix)) {
      return { ok: false, status: 409, error: "plugin_conversation_task_card_missing" };
    }
    const ownerPrompt = cleanBlock(input.ownerPrompt || input.owner_prompt || "", 1200);
    const taskCard = appendOwnerPrompt(baseTaskCard, ownerPrompt);
    const sent = await Promise.resolve(taskCardService.sendTaskCard(Object.assign({}, taskCard, {
      sourceWorkspaceCwd: APP_WORKSPACE,
      targetWorkspaceCwd: taskCard.targetWorkspace,
    })));
    const cardIds = cardIdsFromResult(sent);
    let completeResult = null;
    if (typeof actionInboxService.completeItem === "function") {
      completeResult = await Promise.resolve(actionInboxService.completeItem({
        itemId,
        actorWorkspaceId: OWNER_WORKSPACE_ID,
        actorPrincipalId: clean(input.actor || "owner", 80),
        payload: {
          reason: "plugin_conversation_task_card_sent",
          taskCardIds: cardIds,
          ownerPromptAttached: Boolean(ownerPrompt),
        },
      }));
    }
    return {
      ok: true,
      dispatched: true,
      inboxItem: completeResult?.item || item,
      taskCardResult: sent,
      taskCardIds: cardIds,
      ownerPromptAttached: Boolean(ownerPrompt),
    };
  }

  return Object.freeze({
    createRequest,
    dispatchTaskCard,
  });
}

module.exports = {
  NOTIFICATION_TYPE,
  OWNER_WORKSPACE_ID,
  createPluginConversationActionBridgeService,
  ownerNotificationForRecord,
  taskCardForRecord,
};
