"use strict";

function defaultNowIso() {
  return new Date().toISOString();
}

function defaultMakeId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function clean(value, limit = 1000) {
  const text = String(value ?? "").trim();
  const max = Math.max(1, Number(limit || 1000) || 1000);
  return text.length > max ? text.slice(0, max) : text;
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function errorResult(status, error, details = {}) {
  return Object.assign({ ok: false, status, error }, details);
}

function normalizePriority(value) {
  const text = clean(value, 40).toLowerCase();
  return ["normal", "high", "urgent"].includes(text) ? text : "normal";
}

function normalizeIso(value) {
  const text = clean(value, 80);
  if (!text) return "";
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
}

function normalizeRecurrence(value) {
  if (!value) return { kind: "none" };
  if (typeof value === "string") {
    const kind = clean(value, 40).toLowerCase();
    return kind && kind !== "none" ? { kind } : { kind: "none" };
  }
  const recurrence = objectValue(value);
  const kind = clean(recurrence.kind || recurrence.type || "none", 40).toLowerCase() || "none";
  return Object.assign({}, recurrence, { kind });
}

function principalForWorkspace(workspacePrincipal, workspaceId) {
  return clean(workspacePrincipal(workspaceId), 160) || clean(workspaceId, 120) || "owner";
}

function appRoute(appRouteUrl, params) {
  if (typeof appRouteUrl === "function") return appRouteUrl(params);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    const text = clean(value, 300);
    if (text) query.set(key, text);
  }
  const serialized = query.toString();
  return serialized ? `/?${serialized}` : "/";
}

function createActionInboxTodoService(options = {}) {
  const actionInboxService = options.actionInboxService;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : defaultNowIso;
  const makeId = typeof options.makeId === "function" ? options.makeId : defaultMakeId;
  const compactText = typeof options.compactText === "function" ? options.compactText : clean;
  const workspacePrincipal = typeof options.workspacePrincipal === "function" ? options.workspacePrincipal : ((workspaceId) => clean(workspaceId, 120) || "owner");
  const appRouteUrl = typeof options.appRouteUrl === "function" ? options.appRouteUrl : null;
  const sendPushNotification = typeof options.sendPushNotification === "function" ? options.sendPushNotification : (async () => null);

  function requireActionInbox() {
    if (!actionInboxService || typeof actionInboxService.upsertSourceItem !== "function") {
      throw new Error("action inbox todo service requires actionInboxService.upsertSourceItem");
    }
    return actionInboxService;
  }

  function normalizeDraft(input = {}) {
    const draft = objectValue(input.draft).title || objectValue(input.draft).assigneeWorkspaceId
      ? Object.assign({}, input.draft, input)
      : Object.assign({}, input);
    const title = compactText(draft.title || draft.content || draft.text || "", 180);
    const assigneeWorkspaceId = clean(draft.assigneeWorkspaceId || draft.assignee_workspace_id || draft.workspaceId || draft.workspace_id || "", 120);
    const creatorWorkspaceId = clean(draft.creatorWorkspaceId || draft.creator_workspace_id || draft.workspaceId || draft.workspace_id || "owner", 120) || "owner";
    const dueAt = normalizeIso(draft.dueAt || draft.due_at || draft.dueTime || draft.due_time);
    const remindAt = normalizeIso(draft.remindAt || draft.remind_at || draft.availableAt || draft.available_at);
    const recurrence = normalizeRecurrence(draft.recurrence || draft.recurrenceRule || draft.recurrence_rule);
    const confidence = Number(draft.confidence ?? draft.modelConfidence ?? 1);
    const missingFields = [];
    if (!title) missingFields.push("title");
    if (!assigneeWorkspaceId) missingFields.push("assigneeWorkspaceId");
    if ((draft.dueAt || draft.due_at || draft.dueTime || draft.due_time) && !dueAt) missingFields.push("dueAt");
    if ((draft.remindAt || draft.remind_at || draft.availableAt || draft.available_at) && !remindAt) missingFields.push("remindAt");
    if (input.text && !objectValue(input.draft).title && !input.title) missingFields.push("modelStructuredDraft");
    const needsConfirmation = Boolean(missingFields.length || confidence < 0.75 || draft.needsConfirmation || draft.needs_confirmation);
    return {
      ok: true,
      draft: {
        title,
        summary: compactText(draft.summary || draft.description || "", 800),
        assigneeWorkspaceId,
        creatorWorkspaceId,
        dueAt,
        remindAt,
        priority: normalizePriority(draft.priority),
        recurrence,
        confidence: Number.isFinite(confidence) ? confidence : 1,
        needsConfirmation,
        missingFields,
        sourceText: compactText(draft.sourceText || input.text || "", 500),
      },
    };
  }

  function validateDraft(input = {}) {
    const normalized = normalizeDraft(input).draft;
    if (normalized.recurrence.kind && normalized.recurrence.kind !== "none") {
      return {
        ok: true,
        draft: normalized,
        needsConfirmation: true,
        missingFields: normalized.missingFields,
        unsupported: "recurrence_requires_automation",
      };
    }
    return { ok: true, draft: normalized, needsConfirmation: normalized.needsConfirmation, missingFields: normalized.missingFields };
  }

  async function sendTodoPush(input = {}) {
    const workspaceId = clean(input.workspaceId, 120);
    if (!workspaceId) return null;
    const principalId = principalForWorkspace(workspacePrincipal, workspaceId);
    return sendPushNotification({
      title: clean(input.title || "待办提醒", 120),
      body: clean(input.body || "", 400),
      tag: clean(input.tag || `home-ai-todo-${input.itemId || makeId("todo")}`, 160),
      data: Object.assign({
        viewMode: "inbox",
        workspaceId,
        inboxItemId: clean(input.itemId, 160),
        messageType: clean(input.messageType || "todo", 80),
        url: appRoute(appRouteUrl, { view: "inbox", workspaceId, inboxItemId: input.itemId || "" }),
      }, objectValue(input.data)),
    }, { principalIds: [principalId] });
  }

  async function createTodo(input = {}) {
    const service = requireActionInbox();
    const checked = validateDraft(input);
    const draft = checked.draft;
    if (checked.unsupported) return errorResult(400, checked.unsupported, checked);
    if (draft.missingFields.length) return errorResult(400, "todo_draft_missing_required_fields", checked);
    if (draft.needsConfirmation && !input.confirmed) return errorResult(409, "todo_draft_confirmation_required", checked);
    const now = nowIso();
    const waiting = Boolean(draft.remindAt && Date.parse(draft.remindAt) > Date.parse(now));
    const sourceId = clean(input.sourceId || input.source_id || makeId("todo"), 160);
    const item = service.upsertSourceItem({
      workspaceId: draft.assigneeWorkspaceId,
      assigneeWorkspaceId: draft.assigneeWorkspaceId,
      sourceType: "manual",
      sourceId,
      itemType: "todo",
      status: waiting ? "waiting" : "open",
      priority: draft.priority,
      title: draft.title,
      summary: draft.summary || (draft.dueAt ? `截止：${draft.dueAt}` : ""),
      actionLabel: "完成",
      deepLink: appRoute(appRouteUrl, { view: "inbox", workspaceId: draft.assigneeWorkspaceId }),
      sourceRef: {
        creatorWorkspaceId: draft.creatorWorkspaceId,
        assigneeWorkspaceId: draft.assigneeWorkspaceId,
        dueAt: draft.dueAt,
        remindAt: draft.remindAt,
        recurrence: draft.recurrence,
        naturalLanguageSource: Boolean(draft.sourceText),
      },
      rawJson: {
        sourceText: draft.sourceText,
        modelConfidence: draft.confidence,
      },
      dueAt: draft.dueAt,
      availableAt: draft.remindAt,
      dedupeKey: clean(input.dedupeKey || input.dedupe_key, 240),
      actorWorkspaceId: draft.creatorWorkspaceId,
      actorPrincipalId: input.actorPrincipalId || input.actor_principal_id || principalForWorkspace(workspacePrincipal, draft.creatorWorkspaceId),
      reopen: true,
      createdAt: now,
      updatedAt: now,
    });
    if (!item?.ok) return item;
    await sendTodoPush({
      workspaceId: draft.assigneeWorkspaceId,
      itemId: item.item.id,
      title: waiting ? "新增提醒" : "新增待办",
      body: draft.title,
      tag: `home-ai-todo-${item.item.id}-created`,
      messageType: waiting ? "todo_reminder_scheduled" : "todo_created",
    });
    return { ok: true, item: item.item, draft, push: { attempted: true } };
  }

  async function activateDueReminders(input = {}) {
    const service = requireActionInbox();
    if (typeof service.activateDueItems !== "function") return errorResult(503, "action_inbox_due_activation_unavailable");
    const result = service.activateDueItems({
      now: input.now || nowIso(),
      itemType: "todo",
      sourceType: "manual",
      limit: input.limit || 100,
      actorWorkspaceId: input.actorWorkspaceId || "system",
      actorPrincipalId: input.actorPrincipalId || "system",
    });
    if (!result?.ok) return result;
    const pushes = [];
    for (const item of result.items || []) {
      pushes.push(await sendTodoPush({
        workspaceId: item.assigneeWorkspaceId || item.workspaceId,
        itemId: item.id,
        title: "待办提醒",
        body: item.title,
        tag: `home-ai-todo-${item.id}-reminder`,
        messageType: "todo_reminder_due",
      }));
    }
    return Object.assign({}, result, { pushes });
  }

  async function completeTodoItem(input = {}) {
    const service = requireActionInbox();
    if (typeof service.completeItem !== "function") return errorResult(503, "action_inbox_complete_unavailable");
    const result = service.completeItem(input);
    if (!result?.ok) return result;
    const item = result.item || {};
    const sourceRef = objectValue(item.sourceRef);
    const creatorWorkspaceId = clean(sourceRef.creatorWorkspaceId, 120);
    const assigneeWorkspaceId = clean(item.assigneeWorkspaceId || item.workspaceId, 120);
    if (creatorWorkspaceId && creatorWorkspaceId !== assigneeWorkspaceId) {
      const receipt = service.upsertSourceItem({
        workspaceId: creatorWorkspaceId,
        assigneeWorkspaceId: creatorWorkspaceId,
        sourceType: "manual",
        sourceId: `completion:${item.id}`,
        itemType: "info",
        status: "open",
        priority: "normal",
        title: "待办已完成",
        summary: item.title,
        actionLabel: "查看",
        sourceRef: {
          completedTodoItemId: item.id,
          assigneeWorkspaceId,
          creatorWorkspaceId,
          completedAt: result.item.completedAt,
        },
        dedupeKey: `todo-completion:${item.id}`,
        actorWorkspaceId: assigneeWorkspaceId,
        actorPrincipalId: input.actorPrincipalId || input.actor_principal_id || principalForWorkspace(workspacePrincipal, assigneeWorkspaceId),
        reopen: true,
      });
      if (receipt?.ok) {
        await sendTodoPush({
          workspaceId: creatorWorkspaceId,
          itemId: receipt.item.id,
          title: "待办已完成",
          body: item.title,
          tag: `home-ai-todo-${item.id}-completed`,
          messageType: "todo_completed_receipt",
        });
      }
    }
    return result;
  }

  return {
    activateDueReminders,
    completeTodoItem,
    createTodo,
    validateDraft,
  };
}

module.exports = {
  createActionInboxTodoService,
};
