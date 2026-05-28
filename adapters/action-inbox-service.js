"use strict";

function defaultNowIso() {
  return new Date().toISOString();
}

function defaultMakeId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getStore(store) {
  return typeof store === "function" ? store() : store;
}

function clean(value, limit = 1000) {
  const text = String(value ?? "").trim();
  const max = Math.max(1, Number(limit || 1000) || 1000);
  return text.length > max ? text.slice(0, max) : text;
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeStatus(value, fallback = "open") {
  const text = clean(value).toLowerCase();
  if (["open", "waiting", "done", "dismissed", "archived"].includes(text)) return text;
  return fallback;
}

function normalizePriority(value) {
  const text = clean(value).toLowerCase();
  if (["normal", "high", "urgent"].includes(text)) return text;
  return "normal";
}

function actorFrom(input = {}) {
  const auth = objectValue(input.auth);
  return {
    actorWorkspaceId: clean(input.actorWorkspaceId || input.workspaceId || auth.workspaceId || auth.principalId, 120),
    actorPrincipalId: clean(input.actorPrincipalId || auth.principalId || input.principalId, 120),
  };
}

function errorResult(status, error, details = {}) {
  return Object.assign({ ok: false, status, error }, details);
}

function dedupeKeyFor(input = {}) {
  const explicit = clean(input.dedupeKey || input.dedupe_key, 240);
  if (explicit) return explicit;
  const sourceType = clean(input.sourceType || input.source_type || "manual", 80);
  const sourceId = clean(input.sourceId || input.source_id, 160);
  const itemType = clean(input.itemType || input.item_type || "todo", 80);
  if (sourceId) return `${sourceType}:${sourceId}:${itemType}`;
  return "";
}

function itemDateMs(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

function itemSortTimeMs(item = {}) {
  return Math.max(
    itemDateMs(item.updatedAt || item.updated_at),
    itemDateMs(item.lastEventAt || item.last_event_at),
    itemDateMs(item.createdAt || item.created_at),
  );
}

function actionInboxPriorityRank(item = {}) {
  const status = normalizeStatus(item.status, "open");
  if (["done", "dismissed", "archived"].includes(status)) return 90;
  const sourceType = clean(item.sourceType || item.source_type, 80).toLowerCase();
  const itemType = clean(item.itemType || item.item_type, 80).toLowerCase();
  if (itemType === "todo") return 10;
  if (["approval", "review", "reflection", "revision"].includes(itemType)) return 20;
  if (itemType === "error") return 30;
  if (sourceType === "automation" && itemType === "delivery") return 50;
  return 40;
}

function sortActionInboxItems(items = []) {
  return items.slice().sort((left, right) => {
    const leftTerminal = actionInboxIsTerminalForSort(left);
    const rightTerminal = actionInboxIsTerminalForSort(right);
    if (leftTerminal !== rightTerminal) return leftTerminal ? 1 : -1;
    const leftTime = itemSortTimeMs(left);
    const rightTime = itemSortTimeMs(right);
    if (leftTime !== rightTime) return rightTime - leftTime;
    const leftRank = actionInboxPriorityRank(left);
    const rightRank = actionInboxPriorityRank(right);
    if (leftRank !== rightRank) return leftRank - rightRank;
    const leftDue = itemDateMs(left.dueAt || left.due_at || left.sourceRef?.dueAt || left.sourceRef?.due_at);
    const rightDue = itemDateMs(right.dueAt || right.due_at || right.sourceRef?.dueAt || right.sourceRef?.due_at);
    if (leftDue && rightDue && leftDue !== rightDue) return leftDue - rightDue;
    if (leftDue !== rightDue) return leftDue ? -1 : 1;
    const priorityOrder = { urgent: 0, high: 1, normal: 2 };
    const leftPriority = priorityOrder[normalizePriority(left.priority)] ?? 2;
    const rightPriority = priorityOrder[normalizePriority(right.priority)] ?? 2;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return clean(left.id, 160).localeCompare(clean(right.id, 160));
  });
}

function actionInboxIsTerminalForSort(item = {}) {
  return ["done", "dismissed", "archived"].includes(normalizeStatus(item.status, "open"));
}

function createActionInboxService(options = {}) {
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : defaultNowIso;
  const makeId = typeof options.makeId === "function" ? options.makeId : defaultMakeId;
  const compactText = typeof options.compactText === "function" ? options.compactText : clean;
  const defaultHiddenSourceTypes = Array.isArray(options.defaultHiddenSourceTypes)
    ? options.defaultHiddenSourceTypes.map((item) => clean(item, 80)).filter(Boolean)
    : ["chat"];

  function requireStore() {
    const store = getStore(options.store);
    if (!store || typeof store.upsertActionInboxItem !== "function") {
      throw new Error("action inbox service requires mobile sqlite store");
    }
    return store;
  }

  function appendEvent(store, item, eventType, input = {}) {
    if (!item?.id || typeof store.addActionInboxEvent !== "function") return null;
    const actor = actorFrom(input);
    return store.addActionInboxEvent({
      itemId: item.id,
      eventType,
      actorWorkspaceId: actor.actorWorkspaceId,
      actorPrincipalId: actor.actorPrincipalId,
      payload: objectValue(input.payload),
      createdAt: input.createdAt || nowIso(),
    });
  }

  function listItems(input = {}) {
    const store = requireStore();
    const workspaceId = clean(input.workspaceId || input.workspace_id || "owner", 120) || "owner";
    const sourceType = clean(input.sourceType || input.source_type, 80);
    const excludedSourceTypes = sourceType ? [] : defaultHiddenSourceTypes;
    const items = sortActionInboxItems(store.listActionInboxItems({
      workspaceId,
      status: clean(input.status || input.filterStatus, 40),
      sourceType,
      excludedSourceTypes,
      itemType: clean(input.itemType || input.item_type, 80),
      search: clean(input.search, 200),
      includeDone: Boolean(input.includeDone || input.include_done),
      limit: Math.max(1, Math.min(500, Number(input.limit || 100) || 100)),
    }));
    const counts = typeof store.actionInboxCounts === "function" ? store.actionInboxCounts(workspaceId, { excludedSourceTypes }) : { byStatus: {}, bySourceType: {} };
    return { ok: true, items, counts, source: { name: "action_inbox", storage: "sqlite" } };
  }

  function getItem(input = {}) {
    const store = requireStore();
    const item = store.getActionInboxItem(clean(input.itemId || input.id, 160));
    if (!item) return errorResult(404, "action_inbox_item_not_found");
    const events = typeof store.listActionInboxEvents === "function" ? store.listActionInboxEvents(item.id, { limit: input.eventLimit || 50 }) : [];
    return { ok: true, item, events, source: { name: "action_inbox", storage: "sqlite" } };
  }

  function upsertSourceItem(input = {}) {
    const store = requireStore();
    const workspaceId = clean(input.workspaceId || input.workspace_id || "owner", 120) || "owner";
    const sourceType = clean(input.sourceType || input.source_type || "manual", 80) || "manual";
    const sourceId = clean(input.sourceId || input.source_id, 160);
    const itemType = clean(input.itemType || input.item_type || "todo", 80) || "todo";
    const title = compactText(input.title || "", 180);
    const summary = compactText(input.summary || input.content || "", 800);
    if (!title && !summary) return errorResult(400, "action_inbox_item_requires_title_or_summary");
    const status = normalizeStatus(input.status, "open");
    const now = input.updatedAt || nowIso();
    const dedupeKey = dedupeKeyFor(Object.assign({}, input, { sourceType, sourceId, itemType }));
    const before = dedupeKey && typeof store.getActionInboxItemByDedupe === "function"
      ? store.getActionInboxItemByDedupe(workspaceId, dedupeKey)
      : null;
    const terminalBefore = ["done", "dismissed", "archived"].includes(String(before?.status || ""));
    const item = store.upsertActionInboxItem({
      id: before?.id || clean(input.id || input.itemId, 160) || makeId("ainb"),
      workspaceId,
      assigneeWorkspaceId: clean(input.assigneeWorkspaceId || input.assignee_workspace_id || workspaceId, 120) || workspaceId,
      sourceType,
      sourceId,
      sourceRef: objectValue(input.sourceRef || input.source_ref),
      itemType,
      status: terminalBefore && !input.reopen ? before.status : status,
      priority: normalizePriority(input.priority),
      title: title || before?.title || sourceId || itemType,
      summary: summary || before?.summary || "",
      actionLabel: clean(input.actionLabel || input.action_label, 80),
      deepLink: clean(input.deepLink || input.deep_link, 600),
      dedupeKey,
      dueAt: clean(input.dueAt || input.due_at, 80),
      availableAt: clean(input.availableAt || input.available_at, 80),
      completedAt: terminalBefore ? before.completedAt : clean(input.completedAt || input.completed_at, 80),
      dismissedAt: terminalBefore ? before.dismissedAt : clean(input.dismissedAt || input.dismissed_at, 80),
      lastEventAt: now,
      rawJson: objectValue(input.rawJson || input.raw_json),
      createdAt: before?.createdAt || input.createdAt || now,
      updatedAt: now,
    });
    const eventType = before ? "source_updated" : "source_created";
    const event = appendEvent(store, item, eventType, {
      actorWorkspaceId: input.actorWorkspaceId,
      actorPrincipalId: input.actorPrincipalId,
      payload: {
        sourceType,
        sourceId,
        itemType,
        status: item.status,
      },
      createdAt: now,
    });
    return { ok: true, item, event, source: { name: "action_inbox", storage: "sqlite" } };
  }

  function createManualItem(input = {}) {
    return upsertSourceItem(Object.assign({}, input, {
      sourceType: "manual",
      sourceId: input.sourceId || input.itemId || makeId("manual"),
      itemType: input.itemType || "todo",
      actionLabel: input.actionLabel || "\u5904\u7406",
      dedupeKey: input.dedupeKey || "",
      reopen: true,
    }));
  }

  function transitionItem(input = {}, status, eventType) {
    const store = requireStore();
    const itemId = clean(input.itemId || input.id, 160);
    const before = store.getActionInboxItem(itemId);
    if (!before) return errorResult(404, "action_inbox_item_not_found");
    const now = input.updatedAt || nowIso();
    const patch = {
      status,
      updatedAt: now,
      lastEventAt: now,
    };
    if (status === "done") patch.completedAt = now;
    if (status === "dismissed") patch.dismissedAt = now;
    if (input.availableAt || input.available_at) {
      patch.availableAt = clean(input.availableAt || input.available_at, 80);
    }
    const item = store.updateActionInboxItem(itemId, patch);
    const event = appendEvent(store, item, eventType, {
      actorWorkspaceId: input.actorWorkspaceId,
      actorPrincipalId: input.actorPrincipalId,
      auth: input.auth,
      payload: objectValue(input.payload || { reason: input.reason || "" }),
      createdAt: now,
    });
    return { ok: true, item, event, source: { name: "action_inbox", storage: "sqlite" } };
  }

  function completeItem(input = {}) {
    return transitionItem(input, "done", "completed");
  }

  function dismissItem(input = {}) {
    return transitionItem(input, "dismissed", "dismissed");
  }

  function snoozeItem(input = {}) {
    return transitionItem(input, "waiting", "snoozed");
  }

  return {
    completeItem,
    createManualItem,
    dismissItem,
    getItem,
    listItems,
    snoozeItem,
    upsertSourceItem,
  };
}

module.exports = {
  createActionInboxService,
  normalizeActionInboxPriority: normalizePriority,
  normalizeActionInboxStatus: normalizeStatus,
  sortActionInboxItems,
};
