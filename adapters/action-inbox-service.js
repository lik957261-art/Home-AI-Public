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
  if (["open", "waiting", "done", "dismissed", "archived", "overdue"].includes(text)) return text;
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

function itemSourceRef(item = {}) {
  return objectValue(item.sourceRef || item.source_ref);
}

function mergeObjectPreservingNonEmpty(existing = {}, incoming = {}) {
  const out = Object.assign({}, objectValue(existing));
  for (const [key, value] of Object.entries(objectValue(incoming))) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (!Object.keys(value).length && out[key] && typeof out[key] === "object") continue;
      out[key] = mergeObjectPreservingNonEmpty(objectValue(out[key]), value);
      continue;
    }
    if (value === "" || value == null) {
      if (!(key in out)) out[key] = value;
      continue;
    }
    out[key] = value;
  }
  return out;
}

function rawJsonForMerge(item = {}) {
  const source = objectValue(item);
  const raw = Object.assign({}, objectValue(source.rawJson || source.raw_json));
  if (source.pluginConversationActionBridge && typeof source.pluginConversationActionBridge === "object") {
    raw.pluginConversationActionBridge = source.pluginConversationActionBridge;
  }
  return raw;
}

function isAuditAutomationItem(item = {}) {
  const sourceType = clean(item.sourceType || item.source_type, 80).toLowerCase();
  if (sourceType !== "automation") return false;
  const sourceRef = itemSourceRef(item);
  const kind = clean(sourceRef.kind || sourceRef.auditKind || sourceRef.audit_kind, 120).toLowerCase();
  if (["plugin_workspace_audit", "visual_polish_audit_run", "visual_audit", "system_health_audit"].includes(kind)) return true;
  const sourceId = clean(item.sourceId || item.source_id || sourceRef.automationId || sourceRef.jobId, 160).toLowerCase();
  return sourceId.startsWith("homeai_visual_") || sourceId.startsWith("visual_audit_");
}

function isManualAuditItem(item = {}) {
  const sourceRef = itemSourceRef(item);
  const trigger = clean(sourceRef.triggerMode || sourceRef.trigger_mode || sourceRef.trigger || "", 80).toLowerCase();
  return ["manual", "one_shot", "one-shot", "user"].includes(trigger);
}

function isHighSignalAuditItem(item = {}) {
  const itemType = clean(item.itemType || item.item_type, 80).toLowerCase();
  const priority = normalizePriority(item.priority);
  const sourceRef = itemSourceRef(item);
  const severity = clean(sourceRef.severity || item.severity || "", 40).toLowerCase();
  if (itemType === "error") return true;
  if (["urgent", "high"].includes(priority)) return true;
  return ["critical", "high", "urgent"].includes(severity);
}

function actionInboxItemVisibleByDefault(item = {}) {
  if (!isAuditAutomationItem(item)) return true;
  if (isManualAuditItem(item)) return true;
  return isHighSignalAuditItem(item);
}

function actionInboxFilteredCounts(items = []) {
  const counts = { byStatus: {}, bySourceType: {}, byItemType: {} };
  for (const item of items) {
    const status = normalizeStatus(item.status, "open");
    const sourceType = clean(item.sourceType || item.source_type, 80) || "unknown";
    const itemType = clean(item.itemType || item.item_type, 80) || "unknown";
    counts.byStatus[status] = (counts.byStatus[status] || 0) + 1;
    counts.bySourceType[sourceType] = (counts.bySourceType[sourceType] || 0) + 1;
    counts.byItemType[itemType] = (counts.byItemType[itemType] || 0) + 1;
  }
  return counts;
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
    const includeSystemAudit = Boolean(input.includeSystemAudit || input.include_system_audit);
    const excludedSourceTypes = sourceType ? [] : defaultHiddenSourceTypes;
    const itemType = clean(input.itemType || input.item_type, 80);
    const excludedItemTypes = Array.isArray(input.excludedItemTypes || input.excluded_item_types)
      ? (input.excludedItemTypes || input.excluded_item_types).map((item) => clean(item, 80)).filter(Boolean)
      : [];
    const limit = Math.max(1, Math.min(500, Number(input.limit || 100) || 100));
    const rawItems = sortActionInboxItems(store.listActionInboxItems({
      workspaceId,
      status: clean(input.status || input.filterStatus, 40),
      sourceType,
      excludedSourceTypes,
      itemType,
      excludedItemTypes: itemType ? [] : excludedItemTypes,
      search: clean(input.search, 200),
      includeDone: Boolean(input.includeDone || input.include_done),
      limit: includeSystemAudit || sourceType ? limit : 500,
    }));
    const items = (includeSystemAudit || sourceType ? rawItems : rawItems.filter(actionInboxItemVisibleByDefault)).slice(0, limit);
    const counts = includeSystemAudit || sourceType
      ? (typeof store.actionInboxCounts === "function" ? store.actionInboxCounts(workspaceId, {
      excludedSourceTypes,
      excludedItemTypes: itemType ? [] : excludedItemTypes,
    }) : { byStatus: {}, bySourceType: {}, byItemType: {} })
      : actionInboxFilteredCounts(items);
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
    const sourceRef = mergeObjectPreservingNonEmpty(before?.sourceRef || before?.source_ref, input.sourceRef || input.source_ref);
    const rawJson = mergeObjectPreservingNonEmpty(rawJsonForMerge(before), input.rawJson || input.raw_json);
    const item = store.upsertActionInboxItem({
      id: before?.id || clean(input.id || input.itemId, 160) || makeId("ainb"),
      workspaceId,
      assigneeWorkspaceId: clean(input.assigneeWorkspaceId || input.assignee_workspace_id || workspaceId, 120) || workspaceId,
      sourceType,
      sourceId,
      sourceRef,
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
      rawJson,
      createdAt: before?.createdAt || input.createdAt || now,
      updatedAt: now,
    });
    const eventType = before ? "source_updated" : "source_created";
    const reopened = Boolean(before && terminalBefore && input.reopen && item.status !== before.status);
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
    return {
      ok: true,
      item,
      event,
      created: !before,
      updated: Boolean(before),
      reopened,
      source: { name: "action_inbox", storage: "sqlite" },
    };
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

  function activateDueItems(input = {}) {
    const store = requireStore();
    if (typeof store.listDueActionInboxItems !== "function") {
      return errorResult(503, "action_inbox_due_query_unavailable");
    }
    const now = input.now || nowIso();
    const rows = store.listDueActionInboxItems({
      status: "waiting",
      itemType: clean(input.itemType || input.item_type, 80),
      sourceType: clean(input.sourceType || input.source_type, 80),
      availableBefore: now,
      limit: input.limit || 100,
    });
    const items = [];
    const events = [];
    for (const row of rows) {
      const item = store.updateActionInboxItem(row.id, {
        status: "open",
        updatedAt: now,
        lastEventAt: now,
      });
      if (item) {
        items.push(item);
        events.push(appendEvent(store, item, "reminder_due", {
          actorWorkspaceId: input.actorWorkspaceId || "system",
          actorPrincipalId: input.actorPrincipalId || "system",
          payload: { availableAt: row.availableAt || row.available_at || "" },
          createdAt: now,
        }));
      }
    }
    return { ok: true, items, events, activatedCount: items.length, source: { name: "action_inbox", storage: "sqlite" } };
  }

  return {
    activateDueItems,
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
  actionInboxItemVisibleByDefault,
  createActionInboxService,
  normalizeActionInboxPriority: normalizePriority,
  normalizeActionInboxStatus: normalizeStatus,
  sortActionInboxItems,
};
