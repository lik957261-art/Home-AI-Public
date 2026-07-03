"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createThreadMessageCreateService } = require("../adapters/thread-message-create-service");
const { createThreadMessageRunRouteService } = require("../adapters/thread-message-run-route-service");
const { createThreadMessageRunApiRoutes } = require("../server-routes/thread-message-run-api-routes");
const { createThreadTaskApiRoutes } = require("../server-routes/thread-task-api-routes");

const repoRoot = path.resolve(__dirname, "..");
const TEST_OWNER_KEY = "dev-owner-key";
const TEST_THREAD_ID = "thread_vite_contract";

async function importFresh(relativePath) {
  const moduleUrl = pathToFileURL(path.join(repoRoot, relativePath)).href;
  return import(`${moduleUrl}?test=${Date.now()}-${Math.random()}`);
}

function makeJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Request failed",
    headers: { get: () => "application/json; charset=utf-8" },
    json: async () => payload,
  };
}

function makeMemoryStorage(initialValues = {}) {
  const values = new Map(Object.entries(initialValues).map(([key, value]) => [key, String(value)]));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function requestAccessKey(req) {
  const headers = req?.headers || {};
  return String(headers["X-Hermes-Web-Key"] || headers["x-hermes-web-key"] || "").trim();
}

function makeThread(overrides = {}) {
  return Object.assign({
    id: TEST_THREAD_ID,
    title: "Vite Composer Contract",
    workspaceId: "owner",
    singleWindow: true,
    status: "idle",
    activeRunId: "",
    activeRunIds: [],
    messages: [],
    taskGroupMeta: {},
  }, overrides);
}

function compactMessage(message = {}) {
  return {
    id: message.id || "",
    role: message.role || "",
    status: message.status || "",
    taskGroupId: message.taskGroupId || "",
    runId: message.runId || "",
    content: message.content || "",
    createdAt: message.createdAt || "",
  };
}

function compactThread(thread = {}) {
  return {
    id: thread.id || "",
    title: thread.title || "",
    workspaceId: thread.workspaceId || "",
    status: thread.status || "idle",
    activeRunId: thread.activeRunId || "",
    activeRunIds: Array.isArray(thread.activeRunIds) ? thread.activeRunIds.slice() : [],
    messages: (thread.messages || []).map(compactMessage),
  };
}

function makeMessageCreateService({ state, calls }) {
  let idCounter = 0;
  return createThreadMessageCreateService({
    groupChatTaskGroupId: "group-chat",
    validReasoningEfforts: new Set(["low", "medium", "high"]),
    nowIso: () => "2026-07-02T08:09:10.000Z",
    makeId: (prefix) => `${prefix}_${++idCounter}`,
    deriveTitle: (text) => `title:${String(text || "message").slice(0, 40)}`,
    sanitizeTaskGroupId: (value) => String(value || "").trim().replace(/[^a-z0-9:_-]/gi, "").slice(0, 80),
    normalizeTaskGroupMeta: (value) => (value && typeof value === "object" ? Object.assign({}, value) : {}),
    authCanAccessWorkspace: (auth, workspaceId) => Boolean(auth?.workspaces?.includes(workspaceId)),
    isOwnerAuth: (auth) => Boolean(auth?.owner),
    chatGroupMemberWorkspaceIds: (thread) => thread.memberWorkspaceIds || [],
    isKanbanCaseTopicThread: () => false,
    kanbanCaseTopicPermissionsForTaskGroup: () => null,
    senderInfoForWorkspace: (workspaceId) => ({
      senderWorkspaceId: workspaceId,
      senderPrincipalId: `principal:${workspaceId}`,
      senderLabel: `Workspace ${workspaceId}`,
    }),
    gatewayRoutingForModelRun: (_auth, _text, body) => ({ securityLevel: "owner", actorWorkspaceId: body.workspaceId || "owner" }),
    buildUserMessageContent: (text, artifacts) => [
      String(text || "").trim(),
      ...(artifacts || []).map((artifact) => `ARTIFACT:${artifact.id || artifact.name || "artifact"}`),
    ].filter(Boolean).join("\n\n"),
    publicArtifactFromClient: (value) => (value && typeof value === "object" ? { id: value.id || "", name: value.name || "" } : null),
    resolveTaskDirectoryAttachment: () => null,
    taskDirectoryAttachmentForGroup: () => null,
    semanticTaskDirectoryAttachment: () => null,
    ownerElevationInstructions: () => "",
    prepareChatDataContext: () => ({ ok: true, selected: false, instructions: "" }),
    taskGroupHasRunningRun: () => false,
    runConcurrencyError: () => null,
    runConcurrencySnapshot: () => ({ activeGlobal: 0 }),
    useKanbanTodoBackend: () => false,
    detectDirectKanbanCreateRequest: () => false,
    directTodoCreateEnabled: () => false,
    detectDirectTodoCreateIntentForWeb: () => null,
    detectDirectTodoCreateIntent: () => null,
    todoAssigneeLabel: (_workspaceId, principalId) => `label:${principalId}`,
    kanbanSingleCardCasePayload: () => ({}),
    learnSentText: () => {},
    workspaceIdForPrincipal: (principalId) => (principalId ? `workspace:${principalId}` : ""),
    workspacePrincipal: (workspaceId) => `principal:${workspaceId}`,
    notifyTodoCreated: () => {},
    saveState: (...args) => calls.saveState.push(args),
    broadcast: (event) => calls.broadcast.push(event),
    compactMessage,
    threadSummary: compactThread,
    notifyGroupChatMentions: () => {},
    removeThreadActiveRun: (thread, runId) => {
      thread.activeRunIds = (thread.activeRunIds || []).filter((value) => value !== runId);
      if (thread.activeRunId === runId) thread.activeRunId = thread.activeRunIds[thread.activeRunIds.length - 1] || "";
      thread.status = thread.activeRunIds.length ? "running" : "idle";
    },
    startRunForThread: async (thread, _userMessage, assistantMessage, runOptions) => {
      const runId = "run_vite_contract";
      assistantMessage.runId = runId;
      assistantMessage.status = "running";
      assistantMessage.updatedAt = "2026-07-02T08:09:11.000Z";
      thread.activeRunId = runId;
      thread.activeRunIds = [runId];
      thread.status = "running";
      state.runs.set(runId, { runId, threadId: thread.id, taskGroupId: runOptions?.taskGroupId || "" });
      calls.startRun.push({ threadId: thread.id, runId, runOptions });
      return { run_id: runId, status: "started", engine: "responses", taskGroupId: runOptions?.taskGroupId || "" };
    },
  });
}

function sendJson(res, status, payload) {
  res.status = status;
  res.payload = payload;
}

function makeBackendHarness(options = {}) {
  const state = {
    artifacts: [],
    runs: new Map(),
    threads: [makeThread()],
  };
  const calls = {
    addThreadEvent: [],
    broadcast: [],
    fetch: [],
    readBody: [],
    saveState: [],
    startRun: [],
    stopRunIds: [],
  };
  const messageCreateService = makeMessageCreateService({ state, calls });

  function authenticateRequest(req) {
    if (requestAccessKey(req) !== TEST_OWNER_KEY) {
      return { ok: false, owner: false, workspaceId: "", workspaces: [] };
    }
    return { ok: true, owner: true, workspaceId: "owner", workspaces: ["owner"] };
  }

  function findThreadForRequest(req, threadId) {
    if (!authenticateRequest(req).ok) return null;
    return state.threads.find((thread) => thread.id === threadId) || null;
  }

  const routeService = createThreadMessageRunRouteService({
    findThreadForRequest,
    readBody: async (req) => {
      calls.readBody.push(req.body);
      return req.body || {};
    },
    authenticateRequest,
    requireOwner: authenticateRequest,
    sendJson,
    attachUploadedArtifactsToMessage: () => {},
    nowIso: () => "2026-07-02T08:09:10.000Z",
    compactThread,
    compactThreadWithMessagePage: compactThread,
    threadMessageInitialLimit: 60,
    threadMessageCreateService: messageCreateService,
    threadDirectCreateExecutionService: {
      async executeDirectCreate() {
        throw new Error("direct create is outside vite composer contract test");
      },
      async executeModelTodoIntake() {
        return { ok: true, skipped: true };
      },
    },
    threadOwnerElevationRetryService: {
      async retryOwnerElevation() {
        throw new Error("owner elevation is outside vite composer contract test");
      },
    },
  });
  const messageRoutes = createThreadMessageRunApiRoutes({
    handleThreadMessageCreate: routeService.handleThreadMessageCreate,
    handleThreadMessageOwnerElevation: routeService.handleThreadMessageOwnerElevation,
  });
  const taskRoutes = createThreadTaskApiRoutes({
    broadcast: (event) => calls.broadcast.push(event),
    addThreadEvent: (thread, event) => {
      thread.events = Array.isArray(thread.events) ? thread.events : [];
      thread.events.push(event);
      calls.addThreadEvent.push(event);
    },
    compactThread,
    dedupe: (values) => [...new Set(values)],
    findThreadForRequest,
    isSingleWindowConversationTaskGroupId: (taskGroupId) => ["chat", "group-chat", "weixin-chat"].includes(String(taskGroupId || "")),
    normalizeTaskGroupMeta: (value) => (value && typeof value === "object" ? Object.assign({}, value) : {}),
    nowIso: () => "2026-07-02T08:09:12.000Z",
    readBody: async (req) => req.body || {},
    sanitizeTaskGroupId: (value) => String(value || "").trim(),
    sanitizeTaskTitle: (value) => String(value || "").trim(),
    saveState: (...args) => calls.saveState.push(args),
    sendJson,
    state: () => state,
    stopRunIds: async (runIds = []) => {
      const stopped = [];
      for (const runId of runIds) {
        if (!state.runs.has(runId)) continue;
        stopped.push(runId);
        state.runs.delete(runId);
      }
      for (const thread of state.threads) {
        thread.activeRunIds = (thread.activeRunIds || []).filter((runId) => !stopped.includes(runId));
        if (stopped.includes(thread.activeRunId)) thread.activeRunId = thread.activeRunIds[thread.activeRunIds.length - 1] || "";
        thread.status = thread.activeRunIds.length ? "running" : "idle";
        for (const message of thread.messages || []) {
          if (stopped.includes(message.runId) && ["queued", "running"].includes(message.status)) {
            message.status = "interrupted";
          }
        }
      }
      calls.stopRunIds.push(stopped);
      return stopped;
    },
  });

  async function fetchImpl(rawPath, fetchOptions = {}) {
    const url = new URL(String(rawPath || "/"), "http://127.0.0.1");
    const headers = fetchOptions.headers || {};
    const req = {
      method: fetchOptions.method || "GET",
      url: url.pathname,
      headers,
      body: fetchOptions.body ? JSON.parse(fetchOptions.body) : {},
    };
    calls.fetch.push({ url: rawPath, options: fetchOptions, req });
    const res = { status: 404, payload: { error: "Not found" } };
    let handled = await messageRoutes.handle(req, res, url, {});
    if (!handled?.handled) handled = await taskRoutes.handle(req, res, url, {});
    if (!handled?.handled) return makeJsonResponse(404, { error: "Not found" });
    return makeJsonResponse(res.status || 200, res.payload || {});
  }

  const storage = makeMemoryStorage(options.withoutAccessKey ? {} : { hermesWebKey: TEST_OWNER_KEY });
  return { calls, fetchImpl, state, storage };
}

async function main() {
  const runtime = await importFresh("src/vite-app/runtime/home-ai-runtime-facade.mjs");
  const composerClient = await importFresh("src/vite-islands/chat-runtime/composer-api-client.mjs");

  {
    const harness = makeBackendHarness();
    const facade = runtime.createHomeAiRuntimeFacade({
      root: {},
      storage: harness.storage,
      clientVersion: "vite-contract-test",
      fetchImpl: harness.fetchImpl,
    });

    const sent = await composerClient.sendComposerMessage({
      api: facade.api,
      threadId: TEST_THREAD_ID,
      body: {
        text: "开发环境 Composer 合同测试",
        workspaceId: "owner",
        notificationChannel: "web_push",
        singleWindowMode: "task",
        reasoning_effort: "medium",
      },
    });

    assert.equal(sent.run.run_id, "run_vite_contract");
    assert.equal(sent.thread.id, TEST_THREAD_ID);
    assert.equal(sent.thread.messages.length, 2);
    assert.deepEqual(sent.thread.messages.map((message) => message.role), ["user", "assistant"]);
    assert.equal(harness.state.threads[0].activeRunId, "run_vite_contract");
    assert.equal(harness.calls.startRun.length, 1);
    assert.equal(harness.calls.fetch[0].url, `/api/threads/${TEST_THREAD_ID}/messages`);
    assert.equal(harness.calls.fetch[0].options.headers["X-Hermes-Web-Key"], TEST_OWNER_KEY);
    assert.equal(harness.calls.fetch[0].options.headers["X-Hermes-Web-Client-Version"], "vite-contract-test");

    const interrupted = await composerClient.interruptComposerRun({
      api: facade.api,
      threadId: TEST_THREAD_ID,
    });

    assert.equal(interrupted.ok, true);
    assert.deepEqual(interrupted.runIds, ["run_vite_contract"]);
    assert.deepEqual(harness.calls.stopRunIds[0], ["run_vite_contract"]);
    assert.equal(harness.state.threads[0].activeRunId, "");
    assert.deepEqual(harness.state.threads[0].activeRunIds, []);
    assert.equal(harness.state.threads[0].status, "idle");
    assert.equal(harness.calls.fetch[1].url, `/api/threads/${TEST_THREAD_ID}/interrupt`);
  }

  {
    const harness = makeBackendHarness({ withoutAccessKey: true });
    const facade = runtime.createHomeAiRuntimeFacade({
      root: {},
      storage: harness.storage,
      clientVersion: "vite-contract-test",
      fetchImpl: harness.fetchImpl,
    });

    await assert.rejects(
      () => composerClient.sendComposerMessage({
        api: facade.api,
        threadId: TEST_THREAD_ID,
        body: { text: "missing auth should fail closed", workspaceId: "owner" },
      }),
      (error) => {
        assert.equal(error.status, 404);
        assert.equal(error.message, "Thread not found");
        return true;
      },
    );
    assert.equal(harness.state.threads[0].messages.length, 0);
  }

  console.log("vite chat composer backend contract tests passed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
