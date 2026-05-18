"use strict";

const assert = require("node:assert/strict");
const {
  KANBAN_CARD_API_ROUTE_SPECS,
  createKanbanCardApiRoutes,
} = require("../server-routes/kanban-card-api-routes");

function makeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = Object.assign({}, headers);
    },
    end(body = "") {
      this.body = body;
    },
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function parseBody(res) {
  try {
    return JSON.parse(res.body || "{}");
  } catch (_) {
    return null;
  }
}

function makeUrl(path) {
  return new URL(path, "http://localhost");
}

function makeRoutes(overrides = {}) {
  const calls = {
    access: [],
    add: [],
    annotate: [],
    batch: [],
    broadcast: [],
    cacheClear: [],
    cacheRead: [],
    cacheWrite: [],
    casePayload: [],
    caseShares: [],
    detail: [],
    documentExtract: [],
    documentSave: [],
    errors: [],
    file: [],
    filePreview: [],
    growthSubmit: [],
    list: [],
    mutate: [],
    outputResolve: [],
    plan: [],
    reconcile: [],
    shared: [],
    workspaceAccess: [],
  };
  const deps = Object.assign({
    annotateKanbanCardsForAuth(cards, auth) {
      calls.annotate.push({ cards, auth });
      return (cards || []).map((card) => Object.assign({ annotatedFor: auth?.principalId || "anon" }, card));
    },
    authenticateRequest(req) {
      return req.auth || { principalId: "principal-owner", workspaceId: "owner" };
    },
    boolParam(value) {
      return /^(1|true|yes|on)$/i.test(String(value || ""));
    },
    broadcast(payload) {
      calls.broadcast.push(payload);
    },
    clearKanbanCardListCache(workspaceId) {
      calls.cacheClear.push(workspaceId);
    },
    compactText(value, maxChars) {
      return String(value || "").slice(0, maxChars || 800);
    },
    createKanbanPlanCards(workspaceId, plan, options) {
      calls.batch.push({ workspaceId, plan, options });
      return Promise.resolve({ ok: true, created: [{ id: "batch-1" }] });
    },
    extractKanbanSourceDocumentText(upload) {
      calls.documentExtract.push(upload);
      return { text: "preview text", totalChars: 12, truncated: false };
    },
    findWorkspace(workspaceId) {
      if (workspaceId === "missing") return null;
      return { id: workspaceId, label: `Workspace ${workspaceId}` };
    },
    kanbanCaseSharesForActor(auth, workspaceId) {
      calls.caseShares.push({ auth, workspaceId });
      return [];
    },
    kanbanErrorResponse(res, result, fallbackStatus) {
      calls.errors.push({ result, fallbackStatus });
      sendJson(res, result?.status || fallbackStatus || 400, { error: result?.error || "Kanban failed", result });
    },
    kanbanSingleCardCasePayload(content, description, sourceText) {
      calls.casePayload.push({ content, description, sourceText });
      return { caseId: "single-case", caseSourceText: sourceText };
    },
    kanbanCardProvider: {
      listCards(payload) {
        calls.list.push(payload);
        return Promise.resolve({
          ok: true,
          data: [{ id: "card-1", title: "Provider card", status: "open", kanbanStatus: "todo", updatedAt: "2026-05-18T03:00:00.000Z" }],
          assignees: [{ id: "owner", label: "Owner" }],
          source: { name: "hermes_kanban" },
          board: "workspace-child",
          result: { ok: true, rawCount: 1 },
        });
      },
      addCard(payload) {
        calls.add.push(payload);
        return Promise.resolve({ ok: true, id: "card-new", content: payload.content });
      },
      cardDetail(payload) {
        calls.detail.push(payload);
        return Promise.resolve({ ok: true, id: payload.cardId, logs: ["tail"] });
      },
      mutateCard(payload) {
        calls.mutate.push(payload);
        return Promise.resolve({ ok: true, id: payload.cardId, action: payload.action });
      },
    },
    isOwnerAuth(auth) {
      return Boolean(auth?.isOwner);
    },
    learningGrowthKanbanTaskService: {
      shouldIncludeOwnerKanbanCards(input) {
        return Boolean(input.isOwner) && input.workspaceId === "owner";
      },
      listOwnerManagedKanbanCards(input) {
        calls.shared.push(Object.assign({ ownerGrowth: true }, input));
        return Promise.resolve({
          ok: true,
          cards: [{ id: "growth-1", workspaceId: "child", kanbanCaseTemplate: "learning-growth", status: "open", kanbanStatus: "todo", updatedAt: "2026-05-18T01:00:00.000Z" }],
        });
      },
    },
    learningGrowthSubmissionService: {
      submitTask(input) {
        calls.growthSubmit.push(input);
        return Promise.resolve({ ok: true, cardId: input.cardId, status: "submitted", result: { ok: true, id: input.cardId } });
      },
    },
    normalizeKanbanMaxParallel(value) {
      return Number(value || 2);
    },
    normalizeKanbanPlanReasoningEffort(value) {
      return value || "medium";
    },
    planKanbanMultiAgent(text, workspace, principal, options) {
      calls.plan.push({ text, workspace, principal, options });
      return Promise.resolve({ cards: [{ title: "Planned" }] });
    },
    publicKanbanCardDetail(workspaceId, result) {
      return { workspaceId, id: result.id, logCount: result.logs.length };
    },
    publicTodo(result) {
      return { id: result.id, title: result.content || "" };
    },
    readBody(req) {
      return Promise.resolve(req.body || {});
    },
    readKanbanCardListCache(args) {
      calls.cacheRead.push(args);
      return null;
    },
    requireWorkspaceAccess(req, res, workspaceId) {
      calls.workspaceAccess.push(workspaceId);
      if (workspaceId === "blocked") {
        sendJson(res, 403, { error: "Workspace access is not allowed" });
        return "";
      }
      return String(workspaceId || "owner");
    },
    resolveKanbanCardAccess(req, res, workspaceId, cardId, capability) {
      calls.access.push({ workspaceId, cardId, capability });
      if (workspaceId === "blocked") {
        sendJson(res, 403, { error: "Card access is not allowed" });
        return Promise.resolve(null);
      }
      return Promise.resolve({ workspaceId: String(workspaceId || "owner"), cardId, capability });
    },
    resolveKanbanOutputFile(workspaceId, path, auth) {
      calls.outputResolve.push({ workspaceId, path, auth });
      return { file: { path: `resolved:${workspaceId}:${path}` } };
    },
    saveKanbanSourceDocumentUpload(workspaceId, body) {
      const upload = { workspaceId, name: body.name || "doc.txt", mime: "text/plain", size: 12, kind: "text" };
      calls.documentSave.push({ workspaceId, body });
      return upload;
    },
    scheduleKanbanDependencyReconcile(workspaceId) {
      calls.reconcile.push(workspaceId);
      return { ok: true, workspaceId };
    },
    sendJson,
    sendResolvedFile(res, file, query) {
      calls.file.push({ file, path: query.get("path") });
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end("file");
    },
    sendResolvedFilePreview(res, file) {
      calls.filePreview.push(file);
      sendJson(res, 200, { preview: true, file });
    },
    sharedKanbanCardsForAuth(auth, workspaceId, listArgs) {
      calls.shared.push({ auth, workspaceId, listArgs });
      return Promise.resolve([{ id: "shared-1", shared: true, status: "open", kanbanStatus: "todo", updatedAt: "2026-05-18T02:00:00.000Z" }]);
    },
    todoAssigneeLabel(workspaceId, assignee) {
      return `${workspaceId}:${assignee || "unassigned"}`;
    },
    useKanbanTodoBackend() {
      return true;
    },
    verifyDirectTodoCreateResult(card) {
      return { ok: true, cardId: card.id };
    },
    workspacePrincipal(workspaceId) {
      return `principal-${workspaceId}`;
    },
    writeKanbanCardListCache(args, payload) {
      calls.cacheWrite.push({ args, payload });
    },
  }, overrides);
  return { routes: createKanbanCardApiRoutes(deps), calls };
}

async function request(routes, method, path, options = {}) {
  const res = makeResponse();
  const auth = options.auth || { principalId: "principal-child", workspaceId: "child" };
  const result = await routes.handle(
    { method, url: path, headers: {}, body: options.body || {}, auth },
    res,
    makeUrl(path),
    Object.hasOwn(options, "auth") ? { auth: options.auth } : {},
  );
  return { result, res, body: parseBody(res) };
}

async function testRouteMetadataMatchingAndFallthrough() {
  assert.deepEqual(KANBAN_CARD_API_ROUTE_SPECS.map((route) => route.id), [
    "kanban-cards-list",
    "kanban-cards-create",
    "kanban-cards-output",
    "kanban-cards-output-preview",
    "kanban-card-detail",
    "kanban-card-document-preview",
    "kanban-card-plan",
    "kanban-card-batch",
    "kanban-card-action",
    "kanban-card-learning-growth-submission",
  ]);
  const { routes } = makeRoutes();
  assert.equal(routes.match({ method: "GET", path: "/api/kanban/cards" }).id, "kanban-cards-list");
  assert.equal(routes.match({ method: "POST", path: "/api/kanban/cards" }).id, "kanban-cards-create");
  assert.equal(routes.match({ method: "GET", path: "/api/kanban/cards/output" }).id, "kanban-cards-output");
  assert.equal(routes.match({ method: "GET", path: "/api/kanban/cards/output/preview" }).id, "kanban-cards-output-preview");
  assert.equal(routes.match({ method: "GET", path: "/api/kanban/cards/card%2F1/detail" }).id, "kanban-card-detail");
  assert.equal(routes.match({ method: "POST", path: "/api/kanban/cards/document-preview" }).id, "kanban-card-document-preview");
  assert.equal(routes.match({ method: "POST", path: "/api/kanban/cards/plan" }).id, "kanban-card-plan");
  assert.equal(routes.match({ method: "POST", path: "/api/kanban/cards/batch" }).id, "kanban-card-batch");
  assert.equal(routes.match({ method: "POST", path: "/api/kanban/cards/card%2F1/comment" }).id, "kanban-card-action");
  assert.equal(routes.match({ method: "POST", path: "/api/kanban/cards/card%2F1/learning-growth-submission" }).id, "kanban-card-learning-growth-submission");
  assert.equal(routes.match({ method: "GET", path: "/api/kanban/cards/card-1/comment" }), null);

  const summary = routes.summary({ public: true });
  assert.equal(summary.total, 10);
  assert.deepEqual(summary.byAuthMode, { "access-key": 10 });
  assert.equal(JSON.stringify(summary).includes("/api/kanban/cards"), false);

  const miss = await request(routes, "GET", "/api/status");
  assert.equal(miss.result.handled, false);
  assert.equal(miss.res.statusCode, 0);
}

async function testListProviderSharedMergeAndMaintenance() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "GET", "/api/kanban/cards?workspaceId=child&scope=all&includeCompleted=1&assignee=ada&limit=7&search=math");
  assert.equal(got.result.handled, true);
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.workspaceAccess, ["child"]);
  assert.deepEqual(calls.caseShares.map((call) => call.workspaceId), ["child"]);
  assert.deepEqual(calls.cacheRead, [{
    workspaceId: "child",
    scope: "all",
    includeCompleted: true,
    assignee: "ada",
    limit: 7,
    search: "math",
  }]);
  assert.deepEqual(calls.reconcile, ["child"]);
  assert.deepEqual(calls.list, [calls.cacheRead[0]]);
  assert.deepEqual(calls.shared[0].listArgs, calls.cacheRead[0]);
  assert.deepEqual(got.body.data.map((card) => card.id), ["card-1", "shared-1"]);
  assert.equal(got.body.data[0].annotatedFor, "principal-child");
  assert.equal(got.body.sharedCases, 1);
  assert.deepEqual(got.body.maintenance, { ok: true, workspaceId: "child" });
  assert.equal(got.body.source.name, "hermes_kanban");
  assert.equal(calls.cacheWrite.length, 1);
}

async function testListCacheHitAnnotatesAndSchedulesMaintenance() {
  const cachedPayload = {
    data: [{ id: "cached-1" }],
    assignees: [],
    source: { name: "cache" },
    board: "workspace-child",
    result: { ok: true },
  };
  const { routes, calls } = makeRoutes({
    readKanbanCardListCache(args) {
      calls.cacheRead.push(args);
      return cachedPayload;
    },
  });
  const got = await request(routes, "GET", "/api/kanban/cards?workspaceId=child");
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.reconcile, ["child"]);
  assert.deepEqual(calls.list, []);
  assert.deepEqual(calls.shared, []);
  assert.deepEqual(calls.cacheWrite, []);
  assert.deepEqual(got.body.data, [{ annotatedFor: "principal-child", id: "cached-1" }]);
  assert.equal(got.body.source.name, "cache");
}

async function testListSortsMergedCardsAfterProviderSharedAndGrowthMerge() {
  const providerCards = [
    { id: "done-old", status: "completed", kanbanStatus: "done", kanbanCompletedAt: "2026-05-18T08:00:00.000Z" },
    { id: "open-card", status: "open", kanbanStatus: "todo", updatedAt: "2026-05-18T01:00:00.000Z" },
    { id: "done-provider-new", status: "completed", kanbanStatus: "done", kanbanCompletedAt: "2026-05-18T12:00:00.000Z" },
  ];
  const provider = {
    listCards(payload) {
      provider.calls.push(payload);
      return Promise.resolve({
        ok: true,
        data: providerCards,
        assignees: [],
        source: { name: "hermes_kanban" },
        board: "workspace-child",
        result: { ok: true },
      });
    },
    addCard() {},
    cardDetail() {},
    mutateCard() {},
    calls: [],
  };
  const { routes } = makeRoutes({
    kanbanCardProvider: provider,
    sharedKanbanCardsForAuth() {
      return Promise.resolve([
        { id: "done-shared-middle", status: "completed", kanbanStatus: "done", kanbanCompletedAt: "2026-05-18T10:00:00.000Z" },
      ]);
    },
  });
  const got = await request(routes, "GET", "/api/kanban/cards?workspaceId=child&includeCompleted=1&fresh=1");
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(got.body.data.map((card) => card.id), [
    "open-card",
    "done-provider-new",
    "done-shared-middle",
    "done-old",
  ]);
}

async function testListCacheHitSortsCachedCardsBeforeSend() {
  const cachedPayload = {
    data: [
      { id: "done-old", status: "completed", kanbanStatus: "done", kanbanCompletedAt: "2026-05-18T08:00:00.000Z" },
      { id: "open-card", status: "open", kanbanStatus: "todo", updatedAt: "2026-05-18T01:00:00.000Z" },
      { id: "done-new", status: "completed", kanbanStatus: "done", kanbanCompletedAt: "2026-05-18T12:00:00.000Z" },
    ],
    assignees: [],
    source: { name: "cache" },
    board: "workspace-child",
    result: { ok: true },
  };
  const { routes } = makeRoutes({
    readKanbanCardListCache(args) {
      assert.equal(args.workspaceId, "child");
      return cachedPayload;
    },
  });
  const got = await request(routes, "GET", "/api/kanban/cards?workspaceId=child");
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(got.body.data.map((card) => card.id), ["open-card", "done-new", "done-old"]);
}

async function testListBypassesCacheForFreshFlagsAndSharedCases() {
  const fresh = makeRoutes({
    readKanbanCardListCache(args) {
      fresh.calls.cacheRead.push(args);
      return { data: [{ id: "should-not-read" }] };
    },
  });
  await request(fresh.routes, "GET", "/api/kanban/cards?workspaceId=child&fresh=1");
  assert.deepEqual(fresh.calls.cacheRead, []);
  assert.deepEqual(fresh.calls.list.map((call) => call.workspaceId), ["child"]);

  const sharedCase = makeRoutes({
    kanbanCaseSharesForActor(auth, workspaceId) {
      sharedCase.calls.caseShares.push({ auth, workspaceId });
      return [{ caseId: "shared-case" }];
    },
    readKanbanCardListCache(args) {
      sharedCase.calls.cacheRead.push(args);
      return { data: [{ id: "should-not-read" }] };
    },
  });
  await request(sharedCase.routes, "GET", "/api/kanban/cards?workspaceId=child&skipCache=0");
  assert.deepEqual(sharedCase.calls.cacheRead, []);
  assert.deepEqual(sharedCase.calls.cacheWrite, []);
  assert.deepEqual(sharedCase.calls.list.map((call) => call.workspaceId), ["child"]);
}

async function testOwnerListIncludesManagedLearningGrowthCardsWithoutCache() {
  const ownerAuth = { principalId: "owner", workspaceId: "owner", isOwner: true };
  const { routes, calls } = makeRoutes({
    readKanbanCardListCache(args) {
      calls.cacheRead.push(args);
      return { data: [{ id: "should-not-read" }] };
    },
  });
  const got = await request(routes, "GET", "/api/kanban/cards?workspaceId=owner&limit=20&fresh=0", { auth: ownerAuth });
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.cacheRead, []);
  assert.deepEqual(calls.cacheWrite, []);
  assert.equal(calls.list[0].workspaceId, "owner");
  assert.deepEqual(got.body.data.map((card) => card.id), ["card-1", "shared-1", "growth-1"]);
  assert.equal(got.body.ownerManagedGrowthCards, 1);
  const ownerGrowthCall = calls.shared.find((call) => call.ownerGrowth);
  assert.equal(ownerGrowthCall.workspaceId, "owner");
  assert.equal(ownerGrowthCall.isOwner, true);
  assert.equal(ownerGrowthCall.listArgs.limit, 20);
}

async function testListTargetBypassesCacheAndForwardsTargetId() {
  const { routes, calls } = makeRoutes({
    readKanbanCardListCache(args) {
      calls.cacheRead.push(args);
      return { data: [{ id: "should-not-read" }] };
    },
  });
  const got = await request(routes, "GET", "/api/kanban/cards?workspaceId=child&includeCompleted=1&targetId=card-old");
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.cacheRead, []);
  assert.equal(calls.list.length, 1);
  assert.equal(calls.list[0].targetId, "card-old");
  assert.equal(calls.list[0].includeCompleted, true);
  assert.deepEqual(calls.cacheWrite, []);
}

async function testLearningGrowthSubmissionUsesCommentCapabilityAndService() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "POST", "/api/kanban/cards/t_growth/learning-growth-submission?workspaceId=query-workspace", {
    body: { workspaceId: "child", text: "draft", author: "learner" },
  });
  assert.equal(got.res.statusCode, 200);
  assert.deepEqual(calls.access.at(-1), { workspaceId: "child", cardId: "t_growth", capability: "comment" });
  assert.deepEqual(calls.growthSubmit, [{
    workspaceId: "child",
    cardId: "t_growth",
    text: "draft",
    author: "learner",
  }]);
  assert.deepEqual(calls.cacheClear, ["child"]);
  assert.deepEqual(calls.broadcast.slice(-2), [
    { type: "kanban.updated", workspaceId: "child", cardId: "t_growth", action: "learning-growth-submission" },
    { type: "todos.updated", workspaceId: "child", todoId: "t_growth", action: "learning-growth-submission" },
  ]);
  assert.equal(got.body.status, "submitted");
}

async function testLearningGrowthSubmissionKeepsLegacyWritingServiceFallback() {
  const { routes, calls } = makeRoutes({
    learningGrowthSubmissionService: null,
    learningGrowthWritingSubmissionService: {
      submitWriting(input) {
        calls.growthSubmit.push(Object.assign({ legacy: true }, input));
        return Promise.resolve({ ok: true, cardId: input.cardId, status: "submitted", result: { ok: true, id: input.cardId } });
      },
    },
  });
  const got = await request(routes, "POST", "/api/kanban/cards/t_growth/learning-growth-submission?workspaceId=child", {
    body: { text: "draft" },
  });
  assert.equal(got.res.statusCode, 200);
  assert.equal(calls.growthSubmit.at(-1).legacy, true);
  assert.equal(calls.growthSubmit.at(-1).cardId, "t_growth");
}

async function testOutputRoutesAlwaysUseResolverWithAuthenticatedContext() {
  const auth = { principalId: "principal-output", workspaceId: "child" };
  const { routes, calls } = makeRoutes();
  const output = await request(routes, "GET", "/api/kanban/cards/output?workspaceId=child&path=reports%2Fa.md", { auth });
  assert.equal(output.res.statusCode, 200);
  assert.equal(output.res.body, "file");
  assert.deepEqual(calls.outputResolve, [{ workspaceId: "child", path: "reports/a.md", auth }]);
  assert.equal(calls.file[0].file.path, "resolved:child:reports/a.md");

  const preview = await request(routes, "GET", "/api/kanban/cards/output/preview?workspaceId=child&path=reports%2Fb.md", { auth });
  assert.equal(preview.res.statusCode, 200);
  assert.equal(calls.outputResolve.length, 2);
  assert.deepEqual(calls.filePreview[0], { path: "resolved:child:reports/b.md" });

  const missing = makeRoutes({
    resolveKanbanOutputFile(workspaceId, path, resolvedAuth) {
      missing.calls.outputResolve.push({ workspaceId, path, auth: resolvedAuth });
      return { status: 404, error: "Hidden" };
    },
  });
  const denied = await request(missing.routes, "GET", "/api/kanban/cards/output?workspaceId=child&path=private.md", { auth });
  assert.equal(denied.res.statusCode, 404);
  assert.deepEqual(denied.body, { error: "Hidden" });
  assert.deepEqual(missing.calls.file, []);
  assert.deepEqual(missing.calls.filePreview, []);
}

async function testDetailAndActionAccessCapabilities() {
  const { routes, calls } = makeRoutes();
  const detail = await request(routes, "GET", "/api/kanban/cards/card%2F1/detail?workspaceId=child&logTail=9");
  assert.equal(detail.res.statusCode, 200);
  assert.deepEqual(calls.access[0], { workspaceId: "child", cardId: "card/1", capability: "view" });
  assert.deepEqual(calls.detail, [{ workspaceId: "child", cardId: "card/1", logTail: 9 }]);

  const cases = [
    ["comment", "comment"],
    ["revise", "revise"],
    ["delete", "delete"],
    ["cancel", "delete"],
    ["complete", "manage"],
    ["postpone", "manage"],
    ["block", "manage"],
    ["unblock", "manage"],
  ];
  for (const [action, capability] of cases) {
    await request(routes, "POST", `/api/kanban/cards/card%2F${action}/${action}?workspaceId=query-workspace`, {
      body: { workspaceId: "body-workspace", text: "note", title: "updated" },
    });
    assert.equal(calls.access.at(-1).workspaceId, "body-workspace");
    assert.equal(calls.access.at(-1).cardId, `card/${action}`);
    assert.equal(calls.access.at(-1).capability, capability);
    assert.equal(calls.mutate.at(-1).action, action);
    assert.equal(calls.mutate.at(-1).workspaceId, "body-workspace");
  }
}

async function testCreateMapsBodyCasePayloadCacheBroadcastAndVerification() {
  const { routes, calls } = makeRoutes();
  const got = await request(routes, "POST", "/api/kanban/cards", {
    body: {
      workspaceId: "child",
      assignee: "ada",
      title: "Build route tests",
      description: "Focused coverage",
      due_time: "2026-06-01T09:00:00Z",
      reminder_lead_minutes: 30,
      reason: "manual request",
      idempotency_key: "idem-1",
      source_text: "source document",
    },
  });
  assert.equal(got.res.statusCode, 201);
  assert.deepEqual(calls.workspaceAccess, ["child"]);
  assert.deepEqual(calls.casePayload, [{
    content: "Build route tests",
    description: "Focused coverage",
    sourceText: "source document",
  }]);
  assert.deepEqual(calls.add[0], {
    workspaceId: "child",
    assignee: "ada",
    assigneeLabel: "child:ada",
    content: "Build route tests",
    description: "Focused coverage",
    dueTime: "2026-06-01T09:00:00Z",
    reminderLeadMinutes: 30,
    reason: "manual request",
    idempotencyKey: "idem-1",
    manualOnly: null,
    autoDispatch: null,
    kanbanAssignee: "",
    caseId: "single-case",
    caseSourceText: "source document",
  });
  assert.deepEqual(calls.cacheClear, ["child"]);
  assert.deepEqual(calls.broadcast, [
    { type: "kanban.updated", workspaceId: "child", cardId: "card-new", action: "add" },
    { type: "todos.updated", workspaceId: "child", todoId: "card-new", action: "add" },
  ]);
  assert.deepEqual(got.body.card, { id: "card-new", title: "Build route tests" });
  assert.deepEqual(got.body.verification, { ok: true, cardId: "card-new" });

  const explicit = makeRoutes();
  await request(explicit.routes, "POST", "/api/kanban/cards", {
    body: {
      workspaceId: "child",
      content: "Explicit case",
      case_id: "case-1",
      case_mode: "batch",
      case_template: "template-a",
      case_source_text: "source",
      case_summary: "summary",
      case_card_id: "case-card-1",
      case_card_index: 2,
      case_card_count: 4,
      case_depends_on: ["a"],
      case_deliverables: ["doc"],
      case_acceptance: ["done"],
      case_card_goal: "goal",
    },
  });
  assert.deepEqual(explicit.calls.casePayload, []);
  assert.equal(explicit.calls.add[0].caseId, "case-1");
  assert.equal(explicit.calls.add[0].caseMode, "batch");
  assert.equal(explicit.calls.add[0].caseCardIndex, 2);
  assert.deepEqual(explicit.calls.add[0].caseDependsOn, ["a"]);

  const growthWithoutCaseId = makeRoutes();
  await request(growthWithoutCaseId.routes, "POST", "/api/kanban/cards", {
    body: {
      workspaceId: "child",
      content: "Growth writing task",
      case_mode: "study-plan",
      case_template: "learning-growth",
      case_card_goal: "Task instruction:\nWrite a first draft.",
      case_creation_skill_id: "learning-growth-card-creation",
      learning_program_id: "program-1",
      learning_draft_id: "draft-1",
      learning_task_card_id: "task-1",
    },
  });
  assert.deepEqual(growthWithoutCaseId.calls.casePayload, []);
  assert.equal(growthWithoutCaseId.calls.add[0].caseId, "");
  assert.equal(growthWithoutCaseId.calls.add[0].caseMode, "study-plan");
  assert.equal(growthWithoutCaseId.calls.add[0].caseTemplate, "learning-growth");
  assert.equal(growthWithoutCaseId.calls.add[0].caseCardGoal, "Task instruction:\nWrite a first draft.");
  assert.equal(growthWithoutCaseId.calls.add[0].caseCreationSkillId, "learning-growth-card-creation");
  assert.equal(growthWithoutCaseId.calls.add[0].learningProgramId, "program-1");
  assert.equal(growthWithoutCaseId.calls.add[0].learningDraftId, "draft-1");
  assert.equal(growthWithoutCaseId.calls.add[0].learningTaskCardId, "task-1");

  const reminder = makeRoutes({
    detectDirectTodoCreateIntentForWeb(text, workspaceId) {
      assert.equal(text, "\u660e\u5929\u65e9\u4e0a\u63d0\u9192\u6211 10 \u70b9\u5403\u836f\u3002");
      assert.equal(workspaceId, "child");
      return {
        assignee: "principal-child",
        assigneeLabel: "principal-child",
        dueTime: "2026-05-16 10:00",
        content: "\u5403\u836f",
      };
    },
  });
  await request(reminder.routes, "POST", "/api/kanban/cards", {
    body: {
      workspaceId: "child",
      content: "\u660e\u5929\u65e9\u4e0a\u63d0\u9192\u6211 10 \u70b9\u5403\u836f\u3002",
    },
  });
  assert.equal(reminder.calls.add[0].content, "\u5403\u836f");
  assert.equal(reminder.calls.add[0].dueTime, "2026-05-16 10:00");
  assert.equal(reminder.calls.add[0].manualOnly, true);
  assert.equal(reminder.calls.add[0].caseMode, undefined);
  assert.equal(reminder.calls.casePayload[0].content, "\u5403\u836f");
}

async function testPlanningAndDocumentRoutesUseWorkspaceScopedFakes() {
  const { routes, calls } = makeRoutes();
  const document = await request(routes, "POST", "/api/kanban/cards/document-preview", {
    body: { workspaceId: "child", name: "notes.txt", content: "hello" },
  });
  assert.equal(document.res.statusCode, 200);
  assert.deepEqual(calls.documentSave[0], {
    workspaceId: "child",
    body: { workspaceId: "child", name: "notes.txt", content: "hello" },
  });
  assert.equal(document.body.text, "preview text");

  const plan = await request(routes, "POST", "/api/kanban/cards/plan", {
    body: { workspaceId: "child", text: "make a plan", max_parallel: 3, reasoning_effort: "high" },
  });
  assert.equal(plan.res.statusCode, 200);
  assert.deepEqual(calls.plan[0], {
    text: "make a plan",
    workspace: { id: "child", label: "Workspace child" },
    principal: "principal-child",
    options: { maxParallel: 3, reasoningEffort: "high" },
  });

  const batch = await request(routes, "POST", "/api/kanban/cards/batch", {
    body: { workspaceId: "child", cards: [{ title: "A" }], text: "source", assignee: "ada" },
  });
  assert.equal(batch.res.statusCode, 201);
  assert.deepEqual(calls.batch[0], {
    workspaceId: "child",
    plan: { cards: [{ title: "A" }], sourceText: "source" },
    options: {
      assignee: "ada",
      sourceText: "source",
      maxParallel: undefined,
      reasoningEffort: undefined,
    },
  });
  assert.deepEqual(calls.cacheClear, ["child"]);
  assert.deepEqual(calls.broadcast.slice(-2), [
    { type: "kanban.updated", workspaceId: "child", action: "batch-add" },
    { type: "todos.updated", workspaceId: "child", action: "batch-add" },
  ]);
}

async function testCreateAndBatchClampNotificationAssignee() {
  const { routes, calls } = makeRoutes({
    normalizeKanbanNotificationAssignee(workspaceId, requested) {
      calls.shared.push({ workspaceId, requested });
      return requested === "allowed-child" ? requested : `principal-${workspaceId}`;
    },
  });

  const created = await request(routes, "POST", "/api/kanban/cards", {
    body: { workspaceId: "child", title: "Direct", assignee: "other-workspace" },
  });
  assert.equal(created.res.statusCode, 201);
  assert.equal(calls.add[0].assignee, "principal-child");
  assert.equal(calls.add[0].assigneeLabel, "child:principal-child");

  const batch = await request(routes, "POST", "/api/kanban/cards/batch", {
    body: { workspaceId: "child", cards: [{ title: "A", assignee: "other-workspace" }], text: "source", assignee: "other-workspace" },
  });
  assert.equal(batch.res.statusCode, 201);
  assert.equal(calls.batch[0].options.assignee, "principal-child");
}

function testDependencyValidation() {
  assert.throws(
    () => createKanbanCardApiRoutes({}),
    /kanban card api routes require annotateKanbanCardsForAuth/,
  );
  assert.throws(
    () => createKanbanCardApiRoutes({
      annotateKanbanCardsForAuth() {},
      authenticateRequest() {},
      boolParam() {},
      broadcast() {},
      clearKanbanCardListCache() {},
      compactText() {},
      createKanbanPlanCards() {},
      extractKanbanSourceDocumentText() {},
      findWorkspace() {},
      kanbanCaseSharesForActor() {},
      kanbanErrorResponse() {},
      kanbanSingleCardCasePayload() {},
      normalizeKanbanMaxParallel() {},
      normalizeKanbanPlanReasoningEffort() {},
      planKanbanMultiAgent() {},
      publicKanbanCardDetail() {},
      publicTodo() {},
      readBody() {},
      readKanbanCardListCache() {},
      requireWorkspaceAccess() {},
      resolveKanbanCardAccess() {},
      resolveKanbanOutputFile() {},
      saveKanbanSourceDocumentUpload() {},
      scheduleKanbanDependencyReconcile() {},
      sendJson() {},
      sendResolvedFile() {},
      sendResolvedFilePreview() {},
      sharedKanbanCardsForAuth() {},
      todoAssigneeLabel() {},
      useKanbanTodoBackend() {},
      verifyDirectTodoCreateResult() {},
      workspacePrincipal() {},
      writeKanbanCardListCache() {},
      kanbanCardProvider: {},
    }),
    /kanban card api routes require kanbanCardProvider list\/add\/detail\/mutate/,
  );
}

(async () => {
  await testRouteMetadataMatchingAndFallthrough();
  await testListProviderSharedMergeAndMaintenance();
  await testListCacheHitAnnotatesAndSchedulesMaintenance();
  await testListSortsMergedCardsAfterProviderSharedAndGrowthMerge();
  await testListCacheHitSortsCachedCardsBeforeSend();
  await testListBypassesCacheForFreshFlagsAndSharedCases();
  await testOwnerListIncludesManagedLearningGrowthCardsWithoutCache();
  await testListTargetBypassesCacheAndForwardsTargetId();
  await testLearningGrowthSubmissionUsesCommentCapabilityAndService();
  await testLearningGrowthSubmissionKeepsLegacyWritingServiceFallback();
  await testOutputRoutesAlwaysUseResolverWithAuthenticatedContext();
  await testDetailAndActionAccessCapabilities();
  await testCreateMapsBodyCasePayloadCacheBroadcastAndVerification();
  await testPlanningAndDocumentRoutesUseWorkspaceScopedFakes();
  await testCreateAndBatchClampNotificationAssignee();
  testDependencyValidation();
  console.log("kanban card api routes tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
