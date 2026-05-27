"use strict";

function asObject(value, fallback = {}) {
  return value && typeof value === "object" ? value : fallback;
}

function optionalFunction(value, fallback) {
  return typeof value === "function" ? value : fallback;
}

function errorMessage(err) {
  return err?.message || String(err);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function defaultPublicTodo(result) {
  return asObject(result);
}

function defaultVerifyDirectTodoCreateResult(todo) {
  return String(todo?.id || "").trim()
    ? { ok: true, error: "" }
    : { ok: false, error: "Todo created but no visible card id returned." };
}

function defaultCompactResponseThread(thread) {
  return thread;
}

function defaultBuildDirectTodoAddPayload(plan) {
  const intent = plan?.directAction?.intent;
  if (!intent) return null;
  return {
    workspaceId: plan.thread.workspaceId,
    assignee: intent.assignee,
    content: intent.content,
    dueTime: intent.dueTime,
    suppressExternalNotice: true,
    reminderLeadMinutes: null,
    recurrence: "none",
    recurrenceDays: "",
    recurrenceUntil: "",
    manualOnly: true,
  };
}

function createThreadDirectCreateExecutionService(options = {}) {
  const threadMessageCreateService = asObject(options.threadMessageCreateService || options.messageCreateService);
  const todoProvider = asObject(options.todoProvider);
  const kanbanCardProvider = asObject(options.kanbanCardProvider);
  const actionInboxService = asObject(options.actionInboxService);

  const addTodo = optionalFunction(options.addTodo, optionalFunction(todoProvider.addTodo, null));
  const addKanbanCard = optionalFunction(options.addKanbanCard, optionalFunction(kanbanCardProvider.addCard, null));
  const interpretKanbanNaturalLanguage = optionalFunction(options.interpretKanbanNaturalLanguage, null);

  if (!addTodo) throw new TypeError("thread direct create execution service requires todoProvider.addTodo");
  if (!addKanbanCard) throw new TypeError("thread direct create execution service requires kanbanCardProvider.addCard");
  if (!interpretKanbanNaturalLanguage) {
    throw new TypeError("thread direct create execution service requires interpretKanbanNaturalLanguage");
  }

  function helper(name, fallback) {
    const direct = optionalFunction(options[name], null);
    if (direct) return direct;
    const fromService = optionalFunction(threadMessageCreateService[name], null);
    if (fromService) return (...args) => fromService.apply(threadMessageCreateService, args);
    return fallback;
  }

  const applyTitleUpdate = helper("applyTitleUpdate", () => {});
  const buildDirectTodoAddPayload = helper("buildDirectTodoAddPayload", defaultBuildDirectTodoAddPayload);
  const buildDirectKanbanAddPayload = helper("buildDirectKanbanAddPayload", () => null);
  const compactMessage = helper("compactMessage", (message) => message);
  const directKanbanSuccessNotifications = helper("directKanbanSuccessNotifications", () => []);
  const directTodoSuccessNotification = helper("directTodoSuccessNotification", () => []);
  const findWorkspace = helper("findWorkspace", (workspaceId) => ({ id: workspaceId }));
  const formatDirectTodoCreateSuccessMessage = helper("formatDirectTodoCreateSuccessMessage", () => "");
  const nowIso = helper("nowIso", () => new Date().toISOString());
  const publicTodo = helper("publicTodo", defaultPublicTodo);
  const saveState = helper("saveState", () => {});
  const threadSummary = helper("threadSummary", (thread) => thread);
  const todoAssigneeLabel = helper("todoAssigneeLabel", (_workspaceId, principalId) => String(principalId || "owner"));
  const verifyDirectTodoCreateResult = helper("verifyDirectTodoCreateResult", defaultVerifyDirectTodoCreateResult);
  const workspaceIdForPrincipal = helper("workspaceIdForPrincipal", (principalId) => String(principalId || ""));
  const workspacePrincipal = helper("workspacePrincipal", (workspaceId) => String(workspaceId || "owner"));
  const broadcast = helper("broadcast", () => {});

  async function safeResult(operation) {
    try {
      return await operation();
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  }

  function normalizeCreatedResult(result, verificationFailureMessage) {
    let finalResult = result;
    let created = null;
    let verification = { ok: true, error: "" };
    if (finalResult?.ok) {
      created = publicTodo(finalResult);
      verification = verifyDirectTodoCreateResult(created);
      if (!verification.ok) {
        finalResult = {
          ...(finalResult && typeof finalResult === "object" ? finalResult : {}),
          ok: false,
          error: verification.error || verificationFailureMessage,
        };
        created = null;
      }
    }
    if (!finalResult?.ok) {
      verification = {
        ok: false,
        error: String(finalResult?.error || verification.error || ""),
      };
    }
    return { result: finalResult, created, verification };
  }

  function baseBroadcastPayloads(thread, plan) {
    return [
      { type: "thread.updated", thread: threadSummary(thread) },
      {
        type: "message.updated",
        threadId: thread.id,
        message: compactMessage(plan.userMessage),
        thread: threadSummary(thread),
      },
      {
        type: "message.updated",
        threadId: thread.id,
        message: compactMessage(plan.assistantMessage),
        thread: threadSummary(thread),
      },
    ];
  }

  function finalizeDirectCreate(thread, plan, result, optionsForFinalize = {}) {
    const finishedAt = nowIso();
    const ok = Boolean(result?.ok);
    const assistantMessage = plan.assistantMessage;
    assistantMessage.status = ok ? "done" : "failed";
    assistantMessage.content = ok ? optionsForFinalize.successContent() : optionsForFinalize.failureContent();
    assistantMessage.error = ok ? null : (result?.error || optionsForFinalize.fallbackError);
    assistantMessage.completedAt = ok ? finishedAt : "";
    assistantMessage.failedAt = ok ? "" : finishedAt;
    assistantMessage.updatedAt = finishedAt;

    applyTitleUpdate(thread, plan);
    if (!Array.isArray(thread.messages)) thread.messages = [];
    thread.messages.push(plan.userMessage, assistantMessage);
    thread.status = "idle";
    thread.updatedAt = finishedAt;
    saveState();

    const broadcastPayloads = baseBroadcastPayloads(thread, plan);
    for (const payload of broadcastPayloads) broadcast(payload);
    if (ok) {
      const successPayloads = toArray(optionsForFinalize.successNotifications());
      broadcastPayloads.push(...successPayloads);
      for (const payload of successPayloads) broadcast(payload);
    }

    return {
      assistantMessage,
      broadcastPayloads,
      finishedAt,
    };
  }

  function compactThreadForResponse(thread, plan, requestOptions = {}) {
    const compactResponseThread = optionalFunction(
      requestOptions.compactResponseThread,
      optionalFunction(options.compactResponseThread, defaultCompactResponseThread),
    );
    return compactResponseThread(thread, plan);
  }

  async function upsertDirectTodoInboxItem(result, createdTodo, plan) {
    if (!actionInboxService || typeof actionInboxService.upsertSourceItem !== "function") return null;
    const intent = plan?.directAction?.intent || {};
    const todo = createdTodo || publicTodo(result) || {};
    const todoId = String(todo.id || result?.id || result?.todoId || "").trim();
    const content = String(todo.content || todo.title || result?.content || intent.content || "").trim();
    if (!todoId && !content) return null;
    const assigneeWorkspaceId = workspaceIdForPrincipal(intent.assignee || "") || plan?.thread?.workspaceId || "owner";
    const dueAt = String(todo.dueAt || todo.due_at || todo.dueTime || todo.due_time || intent.dueTime || "").trim();
    const dueLocal = String(todo.dueLocal || todo.due_local || "").trim();
    try {
      const inboxResult = await Promise.resolve(actionInboxService.upsertSourceItem({
        workspaceId: assigneeWorkspaceId,
        assigneeWorkspaceId,
        sourceType: "manual",
        sourceId: todoId || `todo:${content.slice(0, 80)}`,
        itemType: "todo",
        status: "open",
        priority: "normal",
        title: content || todoId || "Todo",
        summary: dueLocal || dueAt ? `\u622a\u6b62\uff1a${dueLocal || dueAt}` : "",
        actionLabel: "\u5904\u7406",
        deepLink: todoId ? `/?view=todos&workspaceId=${encodeURIComponent(assigneeWorkspaceId)}&todoId=${encodeURIComponent(todoId)}` : "",
        sourceRef: {
          todoId,
          threadId: plan?.thread?.id || "",
          assigneeWorkspaceId,
          dueAt,
          dueLocal,
          directCreate: true,
        },
        dedupeKey: todoId ? `todo:${todoId}` : "",
        dueAt,
        reopen: true,
      }));
      if (inboxResult?.item?.id) {
        broadcast({ type: "actionInbox.updated", workspaceId: assigneeWorkspaceId, itemId: inboxResult.item.id });
      }
      return inboxResult?.ok ? inboxResult.item : null;
    } catch (_) {
      return null;
    }
  }

  async function executeDirectKanbanCreate(request = {}) {
    const thread = request.thread || request.plan?.thread;
    const plan = request.plan;
    let kanbanDraft = null;
    const providerResult = await safeResult(async () => {
      kanbanDraft = await interpretKanbanNaturalLanguage(
        plan.text,
        findWorkspace(thread.workspaceId),
        workspacePrincipal(thread.workspaceId),
      );
      return addKanbanCard(buildDirectKanbanAddPayload(plan, kanbanDraft));
    });
    const normalized = normalizeCreatedResult(providerResult, "Kanban creation verification failed.");
    const finalResult = normalized.result;
    const createdCard = normalized.created;

    const finalized = finalizeDirectCreate(thread, plan, finalResult, {
      fallbackError: "Kanban operation failed",
      failureContent: () => `\u65b0\u589e\u770b\u677f\u5361\u7247\u5931\u8d25\uff1a${finalResult?.error || "Kanban card operation failed"}`,
      successContent: () => formatDirectTodoCreateSuccessMessage({
        assigneeLabel: todoAssigneeLabel(thread.workspaceId, kanbanDraft?.assignee || ""),
        dueTime: kanbanDraft?.dueTime || "",
        content: kanbanDraft?.content || "",
      }, createdCard),
      successNotifications: () => directKanbanSuccessNotifications(plan, kanbanDraft || {}),
    });

    return {
      ok: Boolean(finalResult?.ok),
      status: finalResult?.ok ? 201 : 400,
      result: finalResult,
      verification: normalized.verification,
      card: finalResult?.ok ? createdCard : null,
      kanbanDraft,
      thread,
      assistantMessage: finalized.assistantMessage,
      broadcastPayloads: finalized.broadcastPayloads,
      response: {
        ok: Boolean(finalResult?.ok),
        card: finalResult?.ok ? createdCard : null,
        result: finalResult,
        verification: normalized.verification,
        thread: compactThreadForResponse(thread, plan, request),
      },
    };
  }

  async function executeDirectTodoCreate(request = {}) {
    const thread = request.thread || request.plan?.thread;
    const plan = request.plan;
    const providerResult = await safeResult(() => addTodo(buildDirectTodoAddPayload(plan)));
    const normalized = normalizeCreatedResult(providerResult, "Todo creation verification failed.");
    const finalResult = normalized.result;
    const createdTodo = normalized.created;
    const directTodoIntent = plan.directAction?.intent || {};

    const finalized = finalizeDirectCreate(thread, plan, finalResult, {
      fallbackError: "Todo operation failed",
      failureContent: () => `\u65b0\u589e\u5f85\u529e\u5931\u8d25\uff1a${finalResult?.error || "Todo operation failed"}`,
      successContent: () => `\u5df2\u65b0\u589e\u5f85\u529e\uff1a${directTodoIntent.assigneeLabel} | ${directTodoIntent.dueTime} | ${directTodoIntent.content}`,
      successNotifications: () => directTodoSuccessNotification(finalResult, plan),
    });
    const inboxItem = finalResult?.ok ? await upsertDirectTodoInboxItem(finalResult, createdTodo, plan) : null;

    return {
      ok: Boolean(finalResult?.ok),
      status: finalResult?.ok ? 201 : 400,
      result: finalResult,
      verification: normalized.verification,
      todo: finalResult?.ok ? createdTodo : null,
      inboxItem,
      thread,
      assistantMessage: finalized.assistantMessage,
      broadcastPayloads: finalized.broadcastPayloads,
      response: {
        ok: Boolean(finalResult?.ok),
        todo: finalResult?.ok ? createdTodo : null,
        inboxItem,
        result: finalResult,
        verification: normalized.verification,
        thread: compactThreadForResponse(thread, plan, request),
      },
    };
  }

  function executeDirectCreate(request = {}) {
    const nextAction = request.plan?.nextAction || "";
    if (nextAction === "direct-kanban-create") return executeDirectKanbanCreate(request);
    if (nextAction === "direct-todo-create") return executeDirectTodoCreate(request);
    return Promise.resolve({
      ok: false,
      status: 400,
      error: "Unsupported direct create action",
      response: { error: "Unsupported direct create action" },
    });
  }

  return Object.freeze({
    executeDirectCreate,
    executeDirectKanbanCreate,
    executeDirectTodoCreate,
  });
}

module.exports = {
  createThreadDirectCreateExecutionService,
};
