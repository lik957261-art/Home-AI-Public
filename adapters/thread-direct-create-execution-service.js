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

function resolveService(value) {
  return typeof value === "function" ? value() : value;
}

function actionInboxTodoPayloadFromDraft(draft = {}, plan, helpers = {}) {
  const thread = plan?.thread || {};
  const workspaceId = String(thread.workspaceId || draft.creatorWorkspaceId || "owner").trim() || "owner";
  return {
    creatorWorkspaceId: draft.creatorWorkspaceId || workspaceId,
    assigneeWorkspaceId: draft.assigneeWorkspaceId || workspaceId,
    title: draft.title || "",
    summary: draft.summary || "",
    dueAt: draft.dueAt || "",
    remindAt: draft.remindAt || "",
    priority: draft.priority || "normal",
    recurrence: draft.recurrence || { kind: "none" },
    confidence: draft.confidence,
    sourceText: draft.sourceText || plan?.text || "",
    confirmed: !draft.needsConfirmation,
    actorPrincipalId: helpers.workspacePrincipal(workspaceId),
  };
}

function publicActionInboxTodo(result) {
  const item = result?.item || result?.todo || {};
  return {
    id: item.id || result?.id || "",
    content: item.title || item.summary || result?.content || "",
    title: item.title || item.summary || "",
    source: "action_inbox",
    workspaceId: item.workspaceId || "",
    dueAt: item.dueAt || item.sourceRef?.dueAt || "",
    status: item.status || "",
  };
}

function directTodoSuccessContent(draft = {}, todo = {}) {
  const assignee = String(draft.assigneeDisplayName || draft.assigneeWorkspaceId || todo.workspaceId || "owner").trim() || "owner";
  const dueAt = String(draft.dueAt || todo.dueAt || "").trim();
  const title = String(draft.title || todo.title || todo.content || "todo").trim() || "todo";
  return `\u5df2\u65b0\u589e\u5f85\u529e\uff1a${assignee} | ${dueAt || "\u65e0\u622a\u6b62\u65f6\u95f4"} | ${title}`;
}

function createThreadDirectCreateExecutionService(options = {}) {
  const threadMessageCreateService = asObject(options.threadMessageCreateService || options.messageCreateService);
  const kanbanCardProvider = asObject(options.kanbanCardProvider);
  const actionInboxTodoServiceRef = options.actionInboxTodoService;

  const addKanbanCard = optionalFunction(options.addKanbanCard, optionalFunction(kanbanCardProvider.addCard, null));
  const interpretKanbanNaturalLanguage = optionalFunction(options.interpretKanbanNaturalLanguage, null);
  const interpretTodoNaturalLanguage = optionalFunction(options.interpretTodoNaturalLanguage, null);

  if (!addKanbanCard) throw new TypeError("thread direct create execution service requires kanbanCardProvider.addCard");
  if (!interpretKanbanNaturalLanguage) {
    throw new TypeError("thread direct create execution service requires interpretKanbanNaturalLanguage");
  }
  if (!interpretTodoNaturalLanguage) {
    throw new TypeError("thread direct create execution service requires interpretTodoNaturalLanguage");
  }

  function helper(name, fallback) {
    const direct = optionalFunction(options[name], null);
    if (direct) return direct;
    const fromService = optionalFunction(threadMessageCreateService[name], null);
    if (fromService) return (...args) => fromService.apply(threadMessageCreateService, args);
    return fallback;
  }

  const applyTitleUpdate = helper("applyTitleUpdate", () => {});
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

  function actionInboxTodoService() {
    return asObject(resolveService(actionInboxTodoServiceRef));
  }

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
    const todoService = actionInboxTodoService();
    let todoDraft = null;
    const providerResult = await safeResult(() => {
      if (!todoService || typeof todoService.createTodo !== "function") {
        return { ok: false, error: "action_inbox_todo_service_unavailable" };
      }
      return Promise.resolve(interpretTodoNaturalLanguage(
        plan.text,
        findWorkspace(thread.workspaceId),
        workspacePrincipal(thread.workspaceId),
      )).then((draft) => {
        todoDraft = draft;
        return todoService.createTodo(actionInboxTodoPayloadFromDraft(draft, plan, { workspacePrincipal }));
      });
    });
    let finalResult = providerResult;
    let createdTodo = finalResult?.ok ? publicActionInboxTodo(finalResult) : null;
    let verification = finalResult?.ok
      ? verifyDirectTodoCreateResult(createdTodo)
      : { ok: false, error: String(finalResult?.error || "") };
    if (finalResult?.ok && !verification.ok) {
      finalResult = {
        ...(finalResult && typeof finalResult === "object" ? finalResult : {}),
        ok: false,
        error: verification.error || "Todo creation verification failed.",
      };
      createdTodo = null;
    }
    if (!finalResult?.ok) {
      verification = {
        ok: false,
        error: String(finalResult?.error || verification.error || ""),
      };
    }
    const finalized = finalizeDirectCreate(thread, plan, finalResult, {
      fallbackError: "Todo operation failed",
      failureContent: () => `\u65b0\u589e\u5f85\u529e\u5931\u8d25\uff1a${finalResult?.error || "Todo operation failed"}`,
      successContent: () => directTodoSuccessContent(todoDraft, createdTodo || finalResult?.item || {}),
      successNotifications: () => directTodoSuccessNotification(finalResult, plan),
    });
    const inboxItem = finalResult?.ok ? finalResult.item || null : null;

    return {
      ok: Boolean(finalResult?.ok),
      status: finalResult?.ok ? 201 : 400,
      result: finalResult,
      verification,
      todo: finalResult?.ok ? createdTodo : null,
      inboxItem,
      todoDraft,
      thread,
      assistantMessage: finalized.assistantMessage,
      broadcastPayloads: finalized.broadcastPayloads,
      response: {
        ok: Boolean(finalResult?.ok),
        todo: finalResult?.ok ? createdTodo : null,
        inboxItem,
        todoDraft,
        result: finalResult,
        verification,
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
