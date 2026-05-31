"use strict";

function clean(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizePriority(value) {
  const text = clean(value, 40).toLowerCase();
  return ["normal", "high", "urgent"].includes(text) ? text : "normal";
}

function normalizeStatus(value) {
  const text = clean(value, 40).toLowerCase();
  return ["open", "waiting", "done", "dismissed", "archived"].includes(text) ? text : "open";
}

function normalizeItemType(value) {
  const text = clean(value, 80).toLowerCase();
  return ["todo", "delivery", "review", "reflection", "revision", "approval", "mention", "error", "info"].includes(text)
    ? text
    : "info";
}

function financeLedgerJoinRequestEvent(input = {}) {
  const type = clean(input.type || input.notificationType || input.notification_type, 120);
  if (type !== "finance.ledger_join_request") return null;
  const ledger = objectValue(input.ledger);
  const requester = objectValue(input.requester);
  const target = objectValue(input.target);
  const requestId = clean(input.request_id || input.requestId || input.sourceId || input.source_id || input.eventId || input.event_id, 180);
  if (!requestId) return errorResult(400, "finance_ledger_join_request_id_required");
  const ledgerName = clean(ledger.name || ledger.title || "\u8d26\u672c", 180);
  const requesterName = clean(requester.display_name || requester.displayName || requester.name || requester.finance_user_id || requester.financeUserId || "\u7533\u8bf7\u4eba", 120);
  const requestedRole = clean(input.requested_role || input.requestedRole || "viewer", 80) || "viewer";
  const workspaceId = clean(
    input.workspaceId
    || input.workspace_id
    || target.workspaceId
    || target.workspace_id
    || target.hermesWorkspaceId
    || target.hermes_workspace_id
    || "owner",
    120,
  ) || "owner";
  const route = boundedRoute(input.route || { name: "ledger-join-request", itemId: requestId });
  return {
    ok: true,
    workspaceId,
    eventId: clean(input.eventId || input.event_id || requestId, 180) || requestId,
    sourceId: requestId,
    notificationType: type,
    itemType: "approval",
    status: "open",
    priority: normalizePriority(input.priority),
    title: clean(input.title || `\u8d26\u672c\u52a0\u5165\u7533\u8bf7\uff1a${ledgerName}`, 180),
    summary: clean(input.summary || `${requesterName} \u7533\u8bf7\u4ee5 ${requestedRole} \u8eab\u4efd\u52a0\u5165\u8d26\u672c\u3002`, 600),
    actionLabel: "\u5ba1\u6279",
    route,
    sourceRef: {
      requestId,
      ledger: {
        id: clean(ledger.id || ledger.ledger_id || ledger.ledgerId, 180),
        name: ledgerName,
      },
      requester: {
        financeUserId: clean(requester.finance_user_id || requester.financeUserId || requester.id, 180),
        displayName: requesterName,
      },
      target: {
        financeUserId: clean(target.finance_user_id || target.financeUserId || target.id, 180),
        displayName: clean(target.display_name || target.displayName || target.name, 120),
        workspaceId,
      },
      requestedRole,
      status: clean(input.status || "pending", 80) || "pending",
      createdAt: clean(input.created_at || input.createdAt, 80),
    },
    createdAt: clean(input.created_at || input.createdAt, 80),
  };
}

function truthyFlag(value) {
  return ["1", "true", "yes", "on"].includes(clean(value, 20).toLowerCase());
}

function falseyFlag(value) {
  return ["0", "false", "no", "off"].includes(clean(value, 20).toLowerCase());
}

function pluginNotificationCreatesInbox(input = {}, event = {}) {
  if (input.inbox === false || input.createInbox === false || input.create_inbox === false) return false;
  if (falseyFlag(input.inbox) || falseyFlag(input.createInbox || input.create_inbox)) return false;
  const inboxMode = clean(input.inboxMode || input.inbox_mode || input.deliveryMode || input.delivery_mode, 40).toLowerCase();
  if (["none", "push", "push_only", "push-only", "notification"].includes(inboxMode)) return false;
  if (input.inbox === true || input.createInbox === true || input.create_inbox === true) return true;
  if (truthyFlag(input.inbox) || truthyFlag(input.createInbox || input.create_inbox)) return true;
  return true;
}

function pluginNotificationDedupeKey(input = {}, event = {}) {
  const explicit = clean(input.dedupeKey || input.dedupe_key, 260);
  if (explicit) return explicit;
  if (event.pluginId === "codex-mobile") return `plugin:${event.pluginId}:workspace:${event.workspaceId}:latest`;
  return `plugin:${event.pluginId}:${event.sourceId}`;
}

function pluginViewMode(pluginId = "", fallback = "") {
  const id = clean(pluginId, 80);
  if (id === "wardrobe") return "wardrobe";
  if (id === "codex-mobile") return "codex";
  return clean(fallback, 80) || id;
}

function boundedRoute(route = {}) {
  const value = objectValue(route);
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!/^[a-zA-Z0-9_.-]{1,40}$/.test(key)) continue;
    if (raw == null) continue;
    if (typeof raw === "object") continue;
    const text = clean(raw, 160);
    if (text) out[key] = text;
  }
  return out;
}

function normalizeDetailMessage(value = {}, compactText) {
  const input = objectValue(value);
  const body = compactText(input.body || "", 12_000);
  if (!body) return null;
  const format = clean(input.format || "text", 20).toLowerCase() === "markdown" ? "markdown" : "text";
  return {
    format,
    sourceTurnId: clean(input.sourceTurnId || input.source_turn_id || input.turnId || input.turn_id, 180),
    body,
    truncated: Boolean(input.truncated),
  };
}

function safeRelativeLink(value = "") {
  const text = clean(value, 600);
  if (!text || !text.startsWith("/") || text.startsWith("//")) return "";
  if (/[\r\n]/.test(text)) return "";
  return text;
}

function errorResult(status, error) {
  return { ok: false, status, error };
}

function createHermesPluginNotificationService(options = {}) {
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const compactText = typeof options.compactText === "function"
    ? options.compactText
    : ((value, max = 200) => clean(value, max));
  const appRouteUrl = typeof options.appRouteUrl === "function"
    ? options.appRouteUrl
    : ((params = {}) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        const text = clean(value, 240);
        if (text) query.set(key, text);
      }
      const serialized = query.toString();
      return serialized ? `/?${serialized}` : "/";
    });
  const workspacePrincipal = typeof options.workspacePrincipal === "function"
    ? options.workspacePrincipal
    : ((workspaceId) => clean(workspaceId, 120) || "owner");

  function actionInboxService() {
    const service = typeof options.actionInboxService === "function" ? options.actionInboxService() : options.actionInboxService;
    return service && typeof service.upsertSourceItem === "function" ? service : null;
  }

  function sendPushNotification() {
    return typeof options.sendPushNotification === "function" ? options.sendPushNotification : null;
  }

  function pluginRegistered(pluginId) {
    if (typeof options.pluginRegistered === "function") return Boolean(options.pluginRegistered(pluginId));
    if (options.hermesPluginService && typeof options.hermesPluginService.pluginManifestUrl === "function") {
      return Boolean(options.hermesPluginService.pluginManifestUrl(pluginId));
    }
    return true;
  }

  function normalizeEvent(input = {}) {
    const financeJoin = financeLedgerJoinRequestEvent(input);
    if (financeJoin && !financeJoin.ok) return financeJoin;
    const pluginId = clean(input.pluginId || input.plugin_id, 80);
    const workspaceId = financeJoin?.workspaceId || clean(input.workspaceId || input.workspace_id || "owner", 120) || "owner";
    const eventId = financeJoin?.eventId || clean(input.eventId || input.event_id || input.id, 180);
    const sourceId = financeJoin?.sourceId || clean(input.sourceId || input.source_id || eventId, 180);
    const title = financeJoin?.title || compactText(input.title || "", 180);
    const summary = financeJoin?.summary || compactText(input.summary || input.body || input.content || "", 600);
    const route = financeJoin?.route || boundedRoute(input.route || input.pluginRoute || input.plugin_route);
    const detailMessage = normalizeDetailMessage(input.detailMessage || input.detail_message, compactText);
    const viewMode = pluginViewMode(pluginId, input.viewMode || input.view || route.view);
    if (!pluginId) return errorResult(400, "plugin_id_required");
    if (!pluginRegistered(pluginId)) return errorResult(404, "plugin_not_registered");
    if (!sourceId) return errorResult(400, "plugin_notification_source_id_required");
    if (!title && !summary) return errorResult(400, "plugin_notification_requires_title_or_summary");
    const notificationType = financeJoin?.notificationType || clean(input.type || input.notificationType || input.notification_type || "plugin_notification", 80);
    const pluginUrl = appRouteUrl({
      view: viewMode,
      workspaceId,
      pluginId,
      pluginRoute: route.name || route.route || "",
      pluginItemId: route.itemId || route.item_id || route.id || "",
    });
    const event = {
      ok: true,
      pluginId,
      workspaceId,
      principalId: clean(input.principalId || input.principal_id || workspacePrincipal(workspaceId), 160) || workspacePrincipal(workspaceId),
      eventId: eventId || sourceId,
      sourceId,
      notificationType,
      itemType: financeJoin?.itemType || normalizeItemType(input.itemType || input.item_type),
      status: financeJoin?.status || normalizeStatus(input.status),
      priority: financeJoin?.priority || normalizePriority(input.priority),
      title,
      summary,
      detailMessage,
      actionLabel: clean(input.actionLabel || input.action_label || "打开", 80),
      route,
      viewMode,
      pluginUrl: safeRelativeLink(input.deepLink || input.deep_link) || pluginUrl,
      dedupeKey: "",
      openMode: clean(input.openMode || input.open_mode || (pluginId === "codex-mobile" ? "plugin" : "inbox"), 40).toLowerCase() === "plugin" ? "plugin" : "inbox",
      notify: input.notify !== false,
      createInbox: null,
      requireInteraction: input.requireInteraction !== false,
      dueAt: clean(input.dueAt || input.due_at, 80),
      availableAt: clean(input.availableAt || input.available_at, 80),
      createdAt: financeJoin?.createdAt || clean(input.createdAt || input.created_at, 80),
      updatedAt: clean(input.updatedAt || input.updated_at, 80) || nowIso(),
      sourceRef: financeJoin?.sourceRef || null,
    };
    if (financeJoin?.actionLabel) event.actionLabel = financeJoin.actionLabel;
    event.dedupeKey = pluginNotificationDedupeKey(input, event);
    return event;
  }

  async function postNotification(input = {}) {
    const event = normalizeEvent(input);
    if (!event.ok) return event;
    event.createInbox = pluginNotificationCreatesInbox(input, event);
    let inboxResult = null;
    if (event.createInbox) {
      const inbox = actionInboxService();
      if (!inbox) return errorResult(503, "action_inbox_service_unavailable");
      inboxResult = await Promise.resolve(inbox.upsertSourceItem({
        workspaceId: event.workspaceId,
        assigneeWorkspaceId: event.workspaceId,
        sourceType: "plugin",
        sourceId: event.sourceId,
        sourceRef: {
          pluginId: event.pluginId,
          eventId: event.eventId,
          notificationType: event.notificationType,
          route: event.route,
          pluginViewMode: event.viewMode,
          detailMessage: event.detailMessage,
          ...objectValue(event.sourceRef),
        },
        itemType: event.itemType,
        status: event.status,
        priority: event.priority,
        title: event.title,
        summary: event.summary,
        actionLabel: event.actionLabel,
        deepLink: event.pluginUrl,
        dedupeKey: event.dedupeKey,
        dueAt: event.dueAt,
        availableAt: event.availableAt,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      }));
      if (!inboxResult?.ok) return inboxResult || errorResult(500, "action_inbox_upsert_failed");
    }

    const inboxUrl = event.createInbox ? appRouteUrl({
      view: "inbox",
      workspaceId: event.workspaceId,
      inboxItemId: inboxResult?.item?.id || "",
    }) : "";
    const clickUrl = event.createInbox && event.openMode !== "plugin" ? inboxUrl : event.pluginUrl;
    let push = null;
    const sendPush = sendPushNotification();
    if (event.notify && typeof sendPush === "function") {
      push = await sendPush({
        title: event.title || "插件通知",
        body: event.summary || event.title || "插件有新的通知",
        tag: `hermes-plugin-${event.pluginId}-${event.sourceId}`,
        renotify: true,
        requireInteraction: event.requireInteraction,
        timestamp: Date.now(),
        data: {
          url: clickUrl,
          originalUrl: event.pluginUrl,
          viewMode: event.openMode === "plugin" ? event.viewMode : "inbox",
          workspaceId: event.workspaceId,
          principalId: event.principalId,
          messageType: "plugin_notification",
          pluginId: event.pluginId,
          pluginEventId: event.eventId,
          inboxItemId: inboxResult?.item?.id || "",
          sourceInboxItemId: inboxResult?.item?.id || "",
          requireInteraction: event.requireInteraction,
        },
      }, {
        principalId: event.principalId,
        urgency: event.priority === "normal" ? "normal" : "high",
        ttl: 24 * 60 * 60,
      });
    }
    return {
      ok: true,
      pluginId: event.pluginId,
      workspaceId: event.workspaceId,
      principalId: event.principalId,
      inboxItem: inboxResult?.item || null,
      clickUrl,
      push,
    };
  }

  return {
    normalizeEvent,
    postNotification,
  };
}

module.exports = {
  createHermesPluginNotificationService,
  pluginViewMode,
};
