"use strict";

const { createApiRouteRegistry } = require("../adapters/api-route-registry");
const { compareKanbanRowsForList } = require("../adapters/kanban-card-order-service");

const KANBAN_CARD_API_ROUTE_SPECS = Object.freeze([
  {
    id: "kanban-cards-list",
    method: "GET",
    path: "/api/kanban/cards",
    group: "kanban",
    moduleKey: "kanban",
    handlerKey: "listCards",
    summary: "List current workspace Kanban cards.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["kanban", "card"],
    tags: ["kanban", "list"],
  },
  {
    id: "kanban-cards-create",
    method: "POST",
    path: "/api/kanban/cards",
    group: "kanban",
    moduleKey: "kanban",
    handlerKey: "createCard",
    summary: "Create one Kanban card.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["kanban", "card"],
    tags: ["kanban", "create"],
  },
  {
    id: "kanban-cards-output",
    method: "GET",
    path: "/api/kanban/cards/output",
    group: "kanban",
    moduleKey: "kanban",
    handlerKey: "output",
    summary: "Read an authorized Kanban card output file.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["kanban", "file"],
    tags: ["kanban", "output"],
  },
  {
    id: "kanban-cards-output-preview",
    method: "GET",
    path: "/api/kanban/cards/output/preview",
    group: "kanban",
    moduleKey: "kanban",
    handlerKey: "outputPreview",
    summary: "Preview an authorized Kanban card output file.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["kanban", "file"],
    tags: ["kanban", "output", "preview"],
  },
  {
    id: "kanban-card-detail",
    method: "GET",
    pathRegex: /^\/api\/kanban\/cards\/[^/]+\/detail$/,
    group: "kanban",
    moduleKey: "kanban",
    handlerKey: "detail",
    summary: "Read authorized Kanban card detail.",
    riskLevel: "low",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["kanban", "card"],
    tags: ["kanban", "detail"],
  },
  {
    id: "kanban-card-document-preview",
    method: "POST",
    path: "/api/kanban/cards/document-preview",
    group: "kanban",
    moduleKey: "kanban-planning",
    handlerKey: "documentPreview",
    summary: "Preview uploaded source document text for Kanban planning.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["kanban", "file"],
    tags: ["kanban", "document", "preview"],
  },
  {
    id: "kanban-card-plan",
    method: "POST",
    path: "/api/kanban/cards/plan",
    group: "kanban",
    moduleKey: "kanban-planning",
    handlerKey: "plan",
    summary: "Plan multiple Kanban cards from one request.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["kanban", "plan"],
    tags: ["kanban", "plan"],
  },
  {
    id: "kanban-card-batch",
    method: "POST",
    path: "/api/kanban/cards/batch",
    group: "kanban",
    moduleKey: "kanban-planning",
    handlerKey: "batch",
    summary: "Create multiple planned Kanban cards.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["kanban", "plan"],
    tags: ["kanban", "batch"],
  },
  {
    id: "kanban-card-action",
    method: "POST",
    pathRegex: /^\/api\/kanban\/cards\/[^/]+\/(?:complete|cancel|postpone|delete|block|unblock|comment|revise)$/,
    group: "kanban",
    moduleKey: "kanban",
    handlerKey: "mutateCard",
    summary: "Mutate one authorized Kanban card.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["kanban", "card"],
    tags: ["kanban", "mutate"],
  },
  {
    id: "kanban-card-learning-growth-submission",
    method: "POST",
    pathRegex: /^\/api\/kanban\/cards\/[^/]+\/learning-growth-submission$/,
    group: "kanban",
    moduleKey: "kanban",
    handlerKey: "submitLearningGrowthTask",
    summary: "Submit one authorized Growth learning task answer.",
    riskLevel: "medium",
    authMode: "access-key",
    authRequired: true,
    workspaceScoped: true,
    resourceTypes: ["kanban", "card", "learning"],
    tags: ["kanban", "learning-growth", "submit"],
  },
]);

function requireFunctions(deps, names) {
  for (const name of names) {
    if (typeof deps[name] !== "function") throw new Error(`kanban card api routes require ${name}`);
  }
}

function cardPathMatch(pathname, suffixRegex) {
  return String(pathname || "").match(new RegExp(`^/api/kanban/cards/([^/]+)/${suffixRegex}$`));
}

function actionCapability(action) {
  if (action === "comment") return "comment";
  if (action === "revise") return "revise";
  if (action === "delete" || action === "cancel") return "delete";
  return "manage";
}

function dedupeCardsById(cards = []) {
  const seen = new Set();
  const result = [];
  for (const card of Array.isArray(cards) ? cards : []) {
    const id = String(card?.id || card?.todo_id || card?.todoId || "").trim();
    const key = id || JSON.stringify(card || {});
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(card);
  }
  return result;
}

function sortKanbanCardsForList(cards = []) {
  return Array.isArray(cards) ? cards.slice().sort(compareKanbanRowsForList) : [];
}

function createKanbanCardApiRoutes(deps = {}) {
  requireFunctions(deps, [
    "annotateKanbanCardsForAuth",
    "authenticateRequest",
    "boolParam",
    "broadcast",
    "clearKanbanCardListCache",
    "compactText",
    "createKanbanPlanCards",
    "extractKanbanSourceDocumentText",
    "findWorkspace",
    "kanbanCaseSharesForActor",
    "kanbanErrorResponse",
    "kanbanSingleCardCasePayload",
    "normalizeKanbanMaxParallel",
    "normalizeKanbanPlanReasoningEffort",
    "planKanbanMultiAgent",
    "publicKanbanCardDetail",
    "publicTodo",
    "readBody",
    "readKanbanCardListCache",
    "requireWorkspaceAccess",
    "resolveKanbanCardAccess",
    "resolveKanbanOutputFile",
    "saveKanbanSourceDocumentUpload",
    "scheduleKanbanDependencyReconcile",
    "sendJson",
    "sendResolvedFile",
    "sendResolvedFilePreview",
    "sharedKanbanCardsForAuth",
    "todoAssigneeLabel",
    "useKanbanTodoBackend",
    "verifyDirectTodoCreateResult",
    "workspacePrincipal",
    "writeKanbanCardListCache",
  ]);
  if (!deps.kanbanCardProvider || typeof deps.kanbanCardProvider.listCards !== "function" || typeof deps.kanbanCardProvider.addCard !== "function" || typeof deps.kanbanCardProvider.cardDetail !== "function" || typeof deps.kanbanCardProvider.mutateCard !== "function") {
    throw new Error("kanban card api routes require kanbanCardProvider list/add/detail/mutate");
  }
  const learningGrowthSubmissionService = deps.learningGrowthSubmissionService || deps.learningGrowthWritingSubmissionService || null;
  if (!learningGrowthSubmissionService || (typeof learningGrowthSubmissionService.submitTask !== "function" && typeof learningGrowthSubmissionService.submitWriting !== "function")) {
    throw new Error("kanban card api routes require learningGrowthSubmissionService.submitTask");
  }

  const sourceDocumentMaxBytes = Math.max(1, Number(deps.sourceDocumentMaxBytes || 20 * 1024 * 1024));
  const registry = createApiRouteRegistry(KANBAN_CARD_API_ROUTE_SPECS);

  function requireKanbanEnabled(res) {
    if (deps.useKanbanTodoBackend()) return true;
    deps.sendJson(res, 409, { error: "Kanban backend is not enabled" });
    return false;
  }

  function normalizeNotificationAssignee(workspaceId, ...candidates) {
    if (typeof deps.normalizeKanbanNotificationAssignee === "function") {
      return deps.normalizeKanbanNotificationAssignee(workspaceId, ...candidates);
    }
    return candidates.map((item) => String(item || "").trim()).find(Boolean) || "";
  }

  function hasExplicitCasePayload(body = {}) {
    return Boolean(
      body.caseId
      || body.case_id
      || body.caseMode
      || body.case_mode
      || body.caseTemplate
      || body.case_template
      || body.caseCardGoal
      || body.case_card_goal
      || body.learningProgramId
      || body.learning_program_id
      || body.learningDraftId
      || body.learning_draft_id
      || body.learningTaskCardId
      || body.learning_task_card_id
    );
  }

  async function handleList(req, res, url) {
    if (!requireKanbanEnabled(res)) return;
    const workspaceId = deps.requireWorkspaceAccess(req, res, url.searchParams.get("workspaceId") || "owner");
    if (!workspaceId) return;
    const targetId = String(url.searchParams.get("targetId") || url.searchParams.get("target_id") || "").trim();
    const listArgs = {
      workspaceId,
      scope: url.searchParams.get("scope") || "mine",
      includeCompleted: deps.boolParam(url.searchParams.get("includeCompleted")),
      assignee: url.searchParams.get("assignee") || "",
      limit: Number(url.searchParams.get("limit") || "120"),
      search: url.searchParams.get("search") || "",
    };
    if (targetId) listArgs.targetId = targetId;
    const auth = deps.authenticateRequest(req);
    const isOwner = typeof deps.isOwnerAuth === "function" ? deps.isOwnerAuth(auth) : false;
    const includeOwnerGrowth = Boolean(
      deps.learningGrowthKanbanTaskService
      && typeof deps.learningGrowthKanbanTaskService.shouldIncludeOwnerKanbanCards === "function"
      && deps.learningGrowthKanbanTaskService.shouldIncludeOwnerKanbanCards({ auth, isOwner, workspaceId, listArgs }),
    );
    const sharedCases = deps.kanbanCaseSharesForActor(auth, workspaceId);
    const bypassCache = deps.boolParam(url.searchParams.get("fresh"))
      || deps.boolParam(url.searchParams.get("skipCache"))
      || deps.boolParam(url.searchParams.get("noCache"))
      || Boolean(targetId)
      || includeOwnerGrowth;
    if (!bypassCache && !sharedCases.length) {
      const cached = deps.readKanbanCardListCache(listArgs);
      if (cached) {
        deps.scheduleKanbanDependencyReconcile(workspaceId);
        deps.sendJson(res, 200, Object.assign({}, cached, {
          data: sortKanbanCardsForList(deps.annotateKanbanCardsForAuth(cached.data, auth)),
        }));
        return;
      }
    }
    const maintenance = deps.scheduleKanbanDependencyReconcile(workspaceId);
    const result = await deps.kanbanCardProvider.listCards(listArgs);
    if (!result.ok) {
      deps.kanbanErrorResponse(res, result.result || result);
      return;
    }
    const sharedData = await deps.sharedKanbanCardsForAuth(auth, workspaceId, listArgs);
    let ownerGrowthData = [];
    if (includeOwnerGrowth && typeof deps.learningGrowthKanbanTaskService.listOwnerManagedKanbanCards === "function") {
      const ownerGrowth = await deps.learningGrowthKanbanTaskService.listOwnerManagedKanbanCards({ auth, isOwner, workspaceId, listArgs });
      ownerGrowthData = deps.annotateKanbanCardsForAuth(ownerGrowth.cards || [], auth);
    }
    const data = sortKanbanCardsForList(dedupeCardsById(deps.annotateKanbanCardsForAuth(result.data, auth).concat(sharedData, ownerGrowthData)));
    const payload = {
      data,
      assignees: result.assignees,
      source: result.source,
      board: result.board,
      result: result.result,
      maintenance,
      sharedCases: sharedData.length,
      ownerManagedGrowthCards: ownerGrowthData.length,
    };
    if (!sharedCases.length && !targetId && !includeOwnerGrowth) deps.writeKanbanCardListCache(listArgs, payload);
    deps.sendJson(res, 200, payload);
  }

  async function sendOutput(req, res, url, preview = false) {
    const workspaceId = String(url.searchParams.get("workspaceId") || "owner").trim() || "owner";
    if (!deps.findWorkspace(workspaceId)) {
      deps.sendJson(res, 400, { error: "Unknown workspace" });
      return;
    }
    const resolved = deps.resolveKanbanOutputFile(workspaceId, url.searchParams.get("path") || "", deps.authenticateRequest(req));
    if (!resolved.file) {
      deps.sendJson(res, resolved.status || 404, { error: resolved.error || "Kanban output not found" });
      return;
    }
    if (preview) deps.sendResolvedFilePreview(res, resolved.file);
    else deps.sendResolvedFile(res, resolved.file, url.searchParams);
  }

  async function handleDetail(req, res, url) {
    if (!requireKanbanEnabled(res)) return;
    const match = cardPathMatch(url.pathname, "detail");
    const cardId = decodeURIComponent(match?.[1] || "");
    const access = await deps.resolveKanbanCardAccess(req, res, url.searchParams.get("workspaceId") || "owner", cardId, "view");
    if (!access) return;
    const workspaceId = access.workspaceId;
    const result = await deps.kanbanCardProvider.cardDetail({
      workspaceId,
      cardId,
      logTail: Number(url.searchParams.get("logTail") || "12000"),
    });
    if (!result.ok) {
      deps.kanbanErrorResponse(res, result.result || result);
      return;
    }
    deps.sendJson(res, 200, {
      ok: true,
      detail: deps.publicKanbanCardDetail(workspaceId, result),
      result,
    });
  }

  async function handleDocumentPreview(req, res) {
    if (!requireKanbanEnabled(res)) return;
    const body = await deps.readBody(req, Math.ceil(sourceDocumentMaxBytes * 1.4) + 8192)
      .catch((err) => ({ __error: err }));
    if (body.__error) {
      deps.sendJson(res, 413, { ok: false, error: body.__error.message || "Document upload is too large" });
      return;
    }
    const workspaceId = deps.requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    try {
      const upload = deps.saveKanbanSourceDocumentUpload(workspaceId, body);
      const preview = deps.extractKanbanSourceDocumentText(upload);
      deps.sendJson(res, 200, {
        ok: true,
        document: {
          name: upload.name,
          mime: upload.mime,
          size: upload.size,
          kind: upload.kind,
        },
        text: preview.text,
        totalChars: preview.totalChars,
        truncated: preview.truncated,
      });
    } catch (err) {
      deps.sendJson(res, err.status || 400, { ok: false, error: deps.compactText(err.message || String(err), 800) });
    }
  }

  async function handlePlan(req, res) {
    if (!requireKanbanEnabled(res)) return;
    const body = await deps.readBody(req);
    const workspaceId = deps.requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    const text = String(body.text || body.content || body.prompt || "").trim();
    if (!text) {
      deps.sendJson(res, 400, { error: "Kanban plan text is required" });
      return;
    }
    try {
      const maxParallel = deps.normalizeKanbanMaxParallel(body.maxParallel ?? body.max_parallel);
      const reasoningEffort = deps.normalizeKanbanPlanReasoningEffort(body.reasoning_effort || body.reasoningEffort || body.reasoning);
      const plan = await deps.planKanbanMultiAgent(text, deps.findWorkspace(workspaceId), deps.workspacePrincipal(workspaceId), {
        maxParallel,
        reasoningEffort,
      });
      deps.sendJson(res, 200, { ok: true, plan, maxParallel, reasoningEffort });
    } catch (err) {
      deps.sendJson(res, 502, { ok: false, error: deps.compactText(err.message || String(err), 800) });
    }
  }

  async function handleBatch(req, res) {
    if (!requireKanbanEnabled(res)) return;
    const body = await deps.readBody(req);
    const workspaceId = deps.requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    try {
      const result = await deps.createKanbanPlanCards(workspaceId, body.plan || { cards: body.cards || [], sourceText: body.text || "" }, {
        assignee: normalizeNotificationAssignee(workspaceId, body.assignee || ""),
        sourceText: body.text || "",
        maxParallel: body.maxParallel ?? body.max_parallel ?? body.plan?.maxParallel ?? body.plan?.max_parallel,
        reasoningEffort: body.reasoning_effort || body.reasoningEffort || body.plan?.reasoningEffort || body.plan?.reasoning_effort,
      });
      if (!result.ok) {
        deps.kanbanErrorResponse(res, result, 502);
        return;
      }
      deps.clearKanbanCardListCache(workspaceId);
      deps.broadcast({ type: "kanban.updated", workspaceId, action: "batch-add" });
      deps.broadcast({ type: "todos.updated", workspaceId, action: "batch-add" });
      deps.sendJson(res, 201, result);
    } catch (err) {
      deps.sendJson(res, 500, { ok: false, error: deps.compactText(err.message || String(err), 800) });
    }
  }

  async function handleCreate(req, res) {
    if (!requireKanbanEnabled(res)) return;
    const body = await deps.readBody(req);
    const workspaceId = deps.requireWorkspaceAccess(req, res, body.workspaceId || "owner");
    if (!workspaceId) return;
    const requestedContent = body.content || body.title || "";
    const reminderIntent = typeof deps.detectDirectTodoCreateIntentForWeb === "function"
      ? deps.detectDirectTodoCreateIntentForWeb(requestedContent, workspaceId)
      : null;
    const content = reminderIntent?.content || requestedContent;
    const explicitCase = hasExplicitCasePayload(body);
    const assignee = normalizeNotificationAssignee(workspaceId, body.assignee || reminderIntent?.assignee || "");
    const result = await deps.kanbanCardProvider.addCard({
      workspaceId,
      assignee,
      assigneeLabel: deps.todoAssigneeLabel(workspaceId, assignee),
      content,
      description: body.description || "",
      dueTime: body.dueTime || body.due_time || reminderIntent?.dueTime || "",
      reminderLeadMinutes: body.reminderLeadMinutes ?? body.reminder_lead_minutes ?? null,
      reason: body.reason || "",
      idempotencyKey: body.idempotencyKey || body.idempotency_key || "",
      manualOnly: body.manualOnly ?? body.manual_only ?? (reminderIntent ? true : null),
      autoDispatch: body.autoDispatch ?? body.auto_dispatch ?? null,
      kanbanAssignee: body.kanbanAssignee || body.kanban_assignee || "",
      ...(explicitCase ? {
        caseId: body.caseId || body.case_id || "",
        caseMode: body.caseMode || body.case_mode || "",
        caseTemplate: body.caseTemplate || body.case_template || "",
        caseSourceText: body.caseSourceText || body.case_source_text || "",
        caseSummary: body.caseSummary || body.case_summary || "",
        caseCardId: body.caseCardId || body.case_card_id || "",
        caseCardIndex: body.caseCardIndex ?? body.case_card_index ?? 0,
        caseCardCount: body.caseCardCount ?? body.case_card_count ?? 0,
        caseDependsOn: body.caseDependsOn || body.case_depends_on || [],
        caseDeliverables: body.caseDeliverables || body.case_deliverables || [],
        caseAcceptance: body.caseAcceptance || body.case_acceptance || [],
        caseCardGoal: body.caseCardGoal || body.case_card_goal || "",
        caseCreationSkillId: body.caseCreationSkillId || body.case_creation_skill_id || "",
        learningProgramId: body.learningProgramId || body.learning_program_id || "",
        learningDraftId: body.learningDraftId || body.learning_draft_id || "",
        learningTaskCardId: body.learningTaskCardId || body.learning_task_card_id || "",
      } : deps.kanbanSingleCardCasePayload(content, body.description || "", body.sourceText || body.source_text || requestedContent)),
    });
    if (!result?.ok) {
      deps.kanbanErrorResponse(res, result);
      return;
    }
    const card = deps.publicTodo(result);
    const verification = deps.verifyDirectTodoCreateResult(card);
    if (!verification.ok) {
      deps.kanbanErrorResponse(res, { ok: false, error: verification.error, result }, 502);
      return;
    }
    deps.clearKanbanCardListCache(workspaceId);
    deps.broadcast({ type: "kanban.updated", workspaceId, cardId: card.id, action: "add" });
    deps.broadcast({ type: "todos.updated", workspaceId, todoId: card.id, action: "add" });
    deps.sendJson(res, 201, { card, result, verification });
  }

  async function syncCompletedCardToTopic(workspaceId, cardId, auth, card = null) {
    const service = deps.kanbanCaseTopicDeliveryService;
    if (!service || typeof service.syncCompletedCard !== "function") return null;
    try {
      let target = card;
      if (!target || !String(target.topicThreadId || target.topic_thread_id || "").trim()) {
        const listed = await deps.kanbanCardProvider.listCards({
          workspaceId,
          targetId: cardId,
          includeCompleted: true,
          limit: 1,
          scope: "mine",
        });
        target = (listed?.data || []).find((item) => String(item?.id || "") === String(cardId)) || target;
      }
      if (!target) return null;
      const annotated = deps.annotateKanbanCardsForAuth([target], auth)[0] || target;
      return service.syncCompletedCard(annotated);
    } catch (_) {
      return null;
    }
  }

  async function handleAction(req, res, url) {
    if (!requireKanbanEnabled(res)) return;
    const match = cardPathMatch(url.pathname, "(complete|cancel|postpone|delete|block|unblock|comment|revise)");
    const body = await deps.readBody(req).catch(() => ({}));
    const action = match?.[2] || "";
    const cardId = decodeURIComponent(match?.[1] || "");
    const access = await deps.resolveKanbanCardAccess(
      req,
      res,
      body.workspaceId || url.searchParams.get("workspaceId") || "owner",
      cardId,
      actionCapability(action),
    );
    if (!access) return;
    const workspaceId = access.workspaceId;
    const result = await deps.kanbanCardProvider.mutateCard({
      action,
      workspaceId,
      cardId,
      assignee: body.assignee || "",
      dueTime: body.dueTime || body.due_time || "",
      reason: body.reason || "",
      comment: body.comment || body.text || "",
      content: body.content || body.title || "",
      description: body.description || "",
      author: body.author || "",
    });
    if (!result?.ok) {
      deps.kanbanErrorResponse(res, result);
      return;
    }
    const resultCardId = String(result.id || cardId);
    if (action === "complete") await syncCompletedCardToTopic(workspaceId, resultCardId, access.auth, result);
    deps.clearKanbanCardListCache(workspaceId);
    deps.broadcast({ type: "kanban.updated", workspaceId, cardId: resultCardId, action });
    deps.broadcast({ type: "todos.updated", workspaceId, todoId: resultCardId, action });
    deps.sendJson(res, 200, { ok: true, result });
  }

  async function handleLearningGrowthSubmission(req, res, url) {
    if (!requireKanbanEnabled(res)) return;
    const match = cardPathMatch(url.pathname, "learning-growth-submission");
    const body = await deps.readBody(req).catch(() => ({}));
    const cardId = decodeURIComponent(match?.[1] || "");
    const access = await deps.resolveKanbanCardAccess(
      req,
      res,
      body.workspaceId || url.searchParams.get("workspaceId") || "owner",
      cardId,
      "comment",
    );
    if (!access) return;
    const workspaceId = access.workspaceId;
    const submitLearningTask = typeof learningGrowthSubmissionService.submitTask === "function"
      ? learningGrowthSubmissionService.submitTask
      : learningGrowthSubmissionService.submitWriting;
    const result = await submitLearningTask({
      workspaceId,
      cardId,
      text: body.text || body.submission || body.comment || "",
      author: body.author || "",
    });
    if (!result?.ok) {
      deps.kanbanErrorResponse(res, result);
      return;
    }
    deps.clearKanbanCardListCache(workspaceId);
    deps.broadcast({ type: "kanban.updated", workspaceId, cardId, action: "learning-growth-submission" });
    deps.broadcast({ type: "todos.updated", workspaceId, todoId: cardId, action: "learning-growth-submission" });
    if (result?.result?.completed) {
      await syncCompletedCardToTopic(workspaceId, cardId, access.auth);
      deps.scheduleKanbanDependencyReconcile(workspaceId);
    }
    deps.sendJson(res, 200, {
      ok: true,
      cardId,
      status: result.status || "submitted",
      evaluation: result.evaluation || null,
      reward: result.reward || null,
      result: result.result || { ok: true },
    });
  }

  async function handle(req, res, url, context = {}) {
    const route = registry.match({
      method: req.method || "GET",
      path: url?.pathname || req.url || "/",
    });
    if (!route) return { handled: false };

    if (route.id === "kanban-cards-list") await handleList(req, res, url);
    else if (route.id === "kanban-cards-create") await handleCreate(req, res);
    else if (route.id === "kanban-cards-output") await sendOutput(req, res, url, false);
    else if (route.id === "kanban-cards-output-preview") await sendOutput(req, res, url, true);
    else if (route.id === "kanban-card-detail") await handleDetail(req, res, url);
    else if (route.id === "kanban-card-document-preview") await handleDocumentPreview(req, res);
    else if (route.id === "kanban-card-plan") await handlePlan(req, res);
    else if (route.id === "kanban-card-batch") await handleBatch(req, res);
    else if (route.id === "kanban-card-action") await handleAction(req, res, url);
    else if (route.id === "kanban-card-learning-growth-submission") await handleLearningGrowthSubmission(req, res, url);
    else return { handled: false };

    return { handled: true, route, auth: context.auth };
  }

  return {
    handle,
    list(options) {
      return registry.list(options);
    },
    match(request) {
      return registry.match(request);
    },
    summary(options) {
      return registry.summary(options);
    },
  };
}

module.exports = {
  KANBAN_CARD_API_ROUTE_SPECS,
  createKanbanCardApiRoutes,
};
