"use strict";

const assert = require("node:assert/strict");
const {
  createThreadMessageCreateService,
  defaultSingleWindowChatTaskGroupId,
  normalizeSingleWindowMode,
} = require("../adapters/thread-message-create-service");

function makeHarness(overrides = {}) {
  let idCounter = 0;
  const calls = {
    broadcasts: [],
    concurrency: [],
    directTodoNotifications: [],
    gatewayRouting: [],
    learned: [],
    mentions: [],
    removedRuns: [],
    saved: 0,
    starts: [],
    dataContexts: [],
  };
  const service = createThreadMessageCreateService(Object.assign({
    groupChatTaskGroupId: "group-chat",
    validReasoningEfforts: new Set(["low", "medium", "high"]),
    nowIso: () => "2026-05-15T01:02:03.000Z",
    makeId: (prefix) => `${prefix}_${++idCounter}`,
    deriveTitle: (text) => `title:${text || "artifact"}`,
    sanitizeTaskGroupId: (value) => String(value || "").trim().replace(/[^a-z0-9_-]/gi, "").slice(0, 40),
    normalizeTaskGroupMeta: (value) => value || {},
    authCanAccessWorkspace: (auth, workspaceId) => Boolean(auth?.workspaces?.includes(workspaceId)),
    isOwnerAuth: (auth) => Boolean(auth?.owner),
    chatGroupMemberWorkspaceIds: (thread) => thread.memberWorkspaceIds || [],
    isKanbanCaseTopicThread: (thread) => Boolean(thread.caseTopicThread),
    kanbanCaseTopicPermissionsForTaskGroup: (thread, taskGroupId) => thread.caseTopicPermissions?.[taskGroupId] || null,
    senderInfoForWorkspace: (workspaceId) => ({
      senderWorkspaceId: workspaceId,
      senderPrincipalId: `principal:${workspaceId}`,
      senderLabel: `Sender ${workspaceId}`,
    }),
    gatewayRoutingForModelRun: (auth, text, body) => {
      calls.gatewayRouting.push({ auth, text, body });
      if (body.gatewayBlocked) {
        const err = new Error("blocked");
        err.status = 403;
        err.code = "blocked_by_policy";
        err.elevationRequired = true;
        err.elevationScope = "owner_high_privilege";
        throw err;
      }
      return { securityLevel: "user", maintenance: false, actorWorkspaceId: body.actorWorkspaceId };
    },
    buildUserMessageContent: (text, artifacts) => [
      String(text || "").trim(),
      ...(artifacts || []).map((artifact) => `MEDIA:${artifact.id || artifact.path || "artifact"}`),
    ].filter(Boolean).join("\n\n"),
    publicArtifactFromClient: (value) => value && value.id ? { id: value.id, name: value.name || "" } : null,
    resolveTaskDirectoryAttachment: (_thread, raw) => raw?.explicit ? { source: "explicit", path: raw.path || "explicit" } : null,
    taskDirectoryAttachmentForGroup: (_thread, taskGroupId) => taskGroupId === "task-1" ? { source: "group", path: "group-root" } : null,
    semanticTaskDirectoryAttachment: (_thread, text) => /semantic/i.test(text) ? { source: "semantic", path: "semantic-root" } : null,
    ownerElevationInstructions: (body) => body.elevationScope ? `elevation:${body.elevationScope}` : "",
    prepareChatDataContext: (payload) => {
      calls.dataContexts.push(payload);
      if (/各工作区讨论/.test(payload.text || "")) {
        return { ok: true, selected: true, instructions: "[HOME AI DATA CONTEXT]\nIncluded messages: 71" };
      }
      return { ok: true, selected: false, instructions: "" };
    },
    taskGroupHasRunningRun: (thread, taskGroupId) => Boolean(thread.runningTaskGroups?.includes(taskGroupId)),
    runConcurrencyError: (workspaceId) => {
      calls.concurrency.push(workspaceId);
      return overrides.concurrencyError || null;
    },
    runConcurrencySnapshot: () => ({ activeGlobal: 2 }),
    useKanbanTodoBackend: () => Boolean(overrides.useKanbanTodoBackend),
    detectDirectKanbanCreateRequest: (text) => /kanban/i.test(text),
    directTodoCreateEnabled: () => Boolean(overrides.directTodoCreateEnabled),
    detectDirectTodoCreateIntentForWeb: (text, workspaceId) => /todo/i.test(text)
      ? {
        assignee: `${workspaceId}-assignee`,
        assigneeLabel: "Assignee Label",
        dueTime: "2026-05-16 09:00",
        content: "direct todo",
      }
      : null,
    detectDirectTodoCreateIntent: () => null,
    todoAssigneeLabel: (_workspaceId, principalId) => `label:${principalId}`,
    kanbanSingleCardCasePayload: (content, description, sourceText) => ({
      casePayload: `${content || ""}|${description || ""}|${sourceText || ""}`,
    }),
    learnSentText: (payload) => {
      calls.learned.push(payload);
      if (overrides.learnSentTextThrows) throw new Error("learning failed");
    },
    workspaceIdForPrincipal: (principalId) => principalId ? `workspace:${principalId}` : "",
    workspacePrincipal: (workspaceId) => `principal-for:${workspaceId}`,
    notifyTodoCreated: (result, principal) => calls.directTodoNotifications.push({ result, principal }),
    saveState: () => { calls.saved += 1; },
    broadcast: (payload) => calls.broadcasts.push(payload),
    compactMessage: (message) => ({ id: message.id, status: message.status, taskGroupId: message.taskGroupId }),
    threadSummary: (thread) => ({ id: thread.id, status: thread.status, messageCount: (thread.messages || []).length }),
    notifyGroupChatMentions: (thread, message) => calls.mentions.push({ threadId: thread.id, messageId: message.id }),
    removeThreadActiveRun: (thread, runId, idleStatus) => calls.removedRuns.push({ threadId: thread.id, runId, idleStatus }),
    startRunForThread: async (thread, userMessage, assistantMessage, runOptions) => {
      calls.starts.push({ threadId: thread.id, userMessage, assistantMessage, runOptions });
      return { run_id: "run_started", status: "started", engine: "responses" };
    },
  }, overrides.serviceOptions || {}));
  return { calls, service };
}

function baseThread(overrides = {}) {
  return Object.assign({
    id: "thread-1",
    title: "Existing title",
    workspaceId: "owner",
    singleWindow: false,
    messages: [],
    status: "idle",
    activeRunIds: [],
  }, overrides);
}

function testPureDefaults() {
  assert.equal(normalizeSingleWindowMode("chat"), "chat");
  assert.equal(normalizeSingleWindowMode("task"), "task");
  assert.equal(normalizeSingleWindowMode(""), "task");
  assert.equal(defaultSingleWindowChatTaskGroupId("group-chat", "group-chat"), "group-chat");
  assert.equal(defaultSingleWindowChatTaskGroupId("task-1", "group-chat"), "chat");
}

function testValidationAndGatewayErrorShape() {
  const { service } = makeHarness();

  assert.deepEqual(service.prepareThreadMessageCreate({
    thread: null,
    body: { text: "hello" },
    auth: {},
  }), {
    ok: false,
    status: 404,
    error: "Thread not found",
    response: { error: "Thread not found" },
  });

  assert.equal(service.prepareThreadMessageCreate({
    thread: baseThread({ activeRunId: "run-1" }),
    body: { text: "hello" },
    auth: {},
  }).status, 409);

  assert.equal(service.prepareThreadMessageCreate({
    thread: baseThread(),
    body: { text: "   ", artifacts: [] },
    auth: {},
  }).status, 400);

  const blocked = service.prepareThreadMessageCreate({
    thread: baseThread(),
    body: { text: "restricted", gatewayBlocked: true },
    auth: {},
  });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.response.code, "blocked_by_policy");
  assert.equal(blocked.response.elevationRequired, true);
  assert.equal(blocked.response.elevationScope, "owner_high_privilege");
}

function testPlannerParagraphIsAcceptedAndOversizeTextIsRejected() {
  const plannerText = "我们继续完善凡凡成长系统，我的总目标是基于以前凡凡清洗出来的学习数据，包含学校的数据、私教的数据。根据我们的目标，比如说大学的目标还有各科的目标，这些东西的话，以清洗的数据为准，我也可以来录入。有了这些基础数据之后，后边的这一系列的能力提升，我希望 AI 全面地出方案、出内容，并且以下发任务的形式，通过 Hermes 某表接入、推送、引导凡凡去完成、互动评价、给出激励，形成一个完全以 AI 为核心的学习系统。";
  {
    const { service } = makeHarness({ serviceOptions: { maxUserMessageChars: 1000 } });
    const plan = service.prepareThreadMessageCreate({
      thread: baseThread(),
      body: { text: plannerText },
      auth: {},
    });

    assert.equal(plan.ok, true);
    assert.equal(plan.text, plannerText);
    assert.equal(plan.nextAction, "start-run");
  }

  {
    const { service } = makeHarness({ serviceOptions: { maxUserMessageChars: 10 } });
    const result = service.prepareThreadMessageCreate({
      thread: baseThread(),
      body: { text: "this message is too long" },
      auth: {},
    });

    assert.equal(result.status, 413);
    assert.equal(result.response.code, "message_text_too_large");
    assert.equal(result.response.maxChars, 10);
  }
}

function testSingleWindowGroupChatPlainMessageCommit() {
  const { calls, service } = makeHarness();
  const thread = baseThread({
    title: "New thread",
    singleWindow: true,
    memberWorkspaceIds: ["owner", "child"],
    activeRunIds: ["run-existing"],
  });

  const plan = service.prepareThreadMessageCreate({
    thread,
    body: {
      text: "hello group",
      artifacts: [{ id: "artifact-1", name: "a.txt" }],
      singleWindowMode: "chat",
      taskGroupId: "group-chat",
      messageKind: "plain",
      workspaceId: "child",
      reasoning_effort: "high",
    },
    auth: { owner: true, workspaces: ["child"] },
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.nextAction, "plain-message");
  assert.equal(plan.taskGroupId, "group-chat");
  assert.equal(plan.actorWorkspaceId, "child");
  assert.equal(plan.messageKind, "plain");
  assert.equal(plan.reasoningEffort, "high");
  assert.equal(plan.userMessage.content, "hello group\n\nMEDIA:artifact-1");
  assert.deepEqual(plan.userMessage.artifacts, [{ id: "artifact-1", name: "a.txt" }]);
  assert.deepEqual(plan.responseDescriptor, {
    type: "message-page",
    options: {
      mode: "chat",
      taskGroupId: "group-chat",
      groupChat: true,
      limit: undefined,
    },
  });

  const committed = service.commitPlainMessage(thread, plan);
  assert.equal(committed.status, 201);
  assert.equal(thread.title, "title:hello group");
  assert.equal(thread.status, "running");
  assert.equal(thread.messages.length, 1);
  assert.equal(calls.saved, 1);
  assert.deepEqual(calls.broadcasts.map((item) => item.type), ["thread.updated", "message.updated"]);
  assert.deepEqual(calls.mentions, [{ threadId: "thread-1", messageId: "msg_1" }]);
}

function testTaskGroupAndCaseTopicValidation() {
  const { service } = makeHarness();
  const quotedThread = baseThread({
    singleWindow: true,
    messages: [{ id: "quoted-1", taskGroupId: "task-a" }],
  });
  const mismatch = service.prepareThreadMessageCreate({
    thread: quotedThread,
    body: { text: "follow up", replyToMessageId: "quoted-1", taskGroupId: "task-b" },
    auth: {},
  });
  assert.equal(mismatch.status, 400);
  assert.equal(mismatch.error, "Quoted message does not belong to the requested task group");

  const caseThread = baseThread({
    singleWindow: true,
    caseTopicThread: true,
    taskGroupMeta: { "study-1": { sharedTopic: true } },
    caseTopicPermissions: { "study-1": { canSubmitStudy: false, canManage: false } },
    memberWorkspaceIds: ["owner", "child"],
  });
  const readOnly = service.prepareThreadMessageCreate({
    thread: caseThread,
    body: { text: "submit", taskGroupId: "study-1" },
    auth: { workspaceId: "child" },
  });
  assert.equal(readOnly.status, 403);
  assert.equal(readOnly.error, "This shared learning topic is read-only for the current workspace");
}

function testDirectoryAttachmentPrecedence() {
  const { service } = makeHarness();
  const thread = baseThread({ singleWindow: true });

  const explicit = service.prepareThreadMessageCreate({
    thread,
    body: { text: "use directory", directory: { explicit: true, path: "explicit-root" } },
    auth: {},
  });
  assert.equal(explicit.directoryAttachment.source, "explicit");

  const group = service.prepareThreadMessageCreate({
    thread,
    body: { text: "use existing group", taskGroupId: "task-1" },
    auth: {},
  });
  assert.equal(group.directoryAttachment.source, "group");

  const semantic = service.prepareThreadMessageCreate({
    thread,
    body: { text: "semantic project please" },
    auth: {},
  });
  assert.equal(semantic.directoryAttachment.source, "semantic");

  const chat = service.prepareThreadMessageCreate({
    thread,
    body: { text: "semantic project please", singleWindowMode: "chat" },
    auth: {},
  });
  assert.equal(chat.directoryAttachment, null);
}

function testDirectCreateRoutingAndPayloads() {
  {
    const { calls, service } = makeHarness({ useKanbanTodoBackend: true });
    const plan = service.prepareThreadMessageCreate({
      thread: baseThread(),
      body: { text: "create kanban card" },
      auth: {},
    });
    assert.equal(plan.nextAction, "direct-kanban-create");
    assert.equal(plan.directAction.type, "kanban");
    assert.deepEqual(service.buildDirectKanbanAddPayload(plan, {
      assignee: "owner",
      content: "card",
      description: "details",
      dueTime: "soon",
      reason: "test",
    }), {
      workspaceId: "owner",
      assignee: "owner",
      assigneeLabel: "label:owner",
      content: "card",
      description: "details",
      dueTime: "soon",
      reason: "test",
      casePayload: "card|details|create kanban card",
    });
    assert.deepEqual(calls.concurrency, []);
    assert.equal(calls.gatewayRouting.length, 1);
  }

  {
    const { service } = makeHarness({ directTodoCreateEnabled: true });
    const plan = service.prepareThreadMessageCreate({
      thread: baseThread({ workspaceId: "team" }),
      body: { text: "create todo tomorrow" },
      auth: {},
    });
    assert.equal(plan.nextAction, "direct-todo-create");
    assert.equal(plan.directAction.type, "todo");
    assert.deepEqual(service.buildDirectTodoAddPayload(plan), {
      workspaceId: "team",
      assignee: "team-assignee",
      content: "direct todo",
      dueTime: "2026-05-16 09:00",
      suppressExternalNotice: true,
      reminderLeadMinutes: null,
      recurrence: "none",
      recurrenceDays: "",
      recurrenceUntil: "",
      manualOnly: true,
    });
  }
}

async function testRunOptionsAndDispatchHooks() {
  const { calls, service } = makeHarness();
  const thread = baseThread({
    singleWindow: true,
    messages: [{ id: "quoted-1", taskGroupId: "task-1" }],
  });
  const plan = service.prepareThreadMessageCreate({
    thread,
    body: {
      text: "continue this task",
      taskGroupId: "task-1",
      replyToMessageId: "quoted-1",
      instructions: "extra",
      elevationScope: "owner_high_privilege",
      reasoning_effort: "medium",
      model: "gpt-test",
      provider: "openai-codex",
      reasoning: { effort: "medium" },
      access_policy_context: { allowed_toolsets: ["file"] },
    },
    auth: {},
  });

  assert.equal(plan.nextAction, "start-run");
  assert.equal(plan.runOptions.reasoning_effort, "medium");
  assert.equal(plan.runOptions.model, "gpt-test");
  assert.equal(plan.runOptions.provider, "openai-codex");
  assert.equal(plan.runOptions.gatewayRouting.provider, "openai-codex");
  assert.deepEqual(plan.runOptions.reasoning, { effort: "medium" });
  assert.deepEqual(plan.runOptions.access_policy_context, { allowed_toolsets: ["file"] });
  assert.match(plan.runOptions.instructions, /extra/);
  assert.match(plan.runOptions.instructions, /elevation:owner_high_privilege/);
  assert.match(plan.runOptions.instructions, /explicit Web quote\/reply/);
  assert.equal(plan.assistantMessage.runOptions, plan.runOptions);

  const result = await service.commitRunMessageAndDispatch(thread, plan);
  assert.equal(result.status, 202);
  assert.deepEqual(result.run, { run_id: "run_started", status: "started", engine: "responses" });
  assert.equal(thread.messages.length, 3);
  assert.equal(thread.status, "queued");
  assert.equal(calls.saved, 1);
  assert.deepEqual(calls.broadcasts.map((item) => item.type), ["thread.updated", "message.updated", "message.updated"]);
  assert.equal(calls.starts.length, 1);
  assert.equal(calls.starts[0].runOptions, plan.runOptions);
}

async function testDispatchFormatsGatewayCapacityFailure() {
  const err = new Error("Gateway worker queue timed out for workspace_capacity.");
  err.status = 503;
  err.code = "gateway_elastic_queue_timeout";
  err.details = { reason: "workspace_capacity", queueDepth: 2 };
  const { service } = makeHarness({
    serviceOptions: {
      startRunForThread: async () => { throw err; },
    },
  });
  const thread = baseThread();
  const plan = service.prepareThreadMessageCreate({
    thread,
    body: { text: "start run" },
    auth: {},
  });

  const result = await service.commitRunMessageAndDispatch(thread, plan);

  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.match(result.error, /工作区的 AI 执行通道已满/);
  assert.equal(plan.assistantMessage.error, result.error);
  assert.doesNotMatch(plan.assistantMessage.error, /workspace_capacity/);
}

function testGrokModelRouteRequiresXaiGatewayProvider() {
  const { calls, service } = makeHarness();
  const plan = service.prepareThreadMessageCreate({
    thread: baseThread(),
    body: {
      text: "@Grok identify your model",
      model: "grok-4.3",
      provider: "xai-oauth",
    },
    auth: { owner: true, workspaces: ["owner"] },
  });

  assert.equal(plan.nextAction, "start-run");
  assert.equal(plan.runOptions.model, "grok-4.3");
  assert.equal(plan.runOptions.provider, "xai-oauth");
  assert.equal(plan.runOptions.gatewayRouting.provider, "xai-oauth");
  assert.deepEqual(plan.runOptions.gatewayRouting.preferred_worker_profiles, ["grokgw1"]);
  assert.equal(calls.gatewayRouting[0].body.provider, "xai-oauth");
}

function testNaturalLanguageGrokRouteOverridesDefaultChatGptModel() {
  const { calls, service } = makeHarness();
  const plan = service.prepareThreadMessageCreate({
    thread: baseThread(),
    body: {
      text: "请使用 Grok 回答这个问题",
      model: "gpt-5.5",
      provider: "openai-codex",
    },
    auth: { owner: true, workspaces: ["owner"] },
  });

  assert.equal(plan.nextAction, "start-run");
  assert.equal(plan.runOptions.model, "grok-4.3");
  assert.equal(plan.runOptions.provider, "xai-oauth");
  assert.equal(plan.runOptions.gatewayRouting.provider, "xai-oauth");
  assert.deepEqual(plan.runOptions.gatewayRouting.preferred_worker_profiles, ["grokgw1"]);
  assert.equal(calls.gatewayRouting[0].body.model, "grok-4.3");
  assert.equal(calls.gatewayRouting[0].body.provider, "xai-oauth");
}

function testChatDataContextIsInjectedOnlyForMatchingRequests() {
  const { calls, service } = makeHarness();
  const plan = service.prepareThreadMessageCreate({
    thread: baseThread(),
    body: { text: "帮我总结昨天各工作区讨论内容和待办" },
    auth: { owner: true, workspaces: ["owner"] },
  });
  assert.equal(plan.nextAction, "start-run");
  assert.match(plan.runOptions.instructions, /\[HOME AI DATA CONTEXT\]/);
  assert.equal(calls.dataContexts[0].actorWorkspaceId, "owner");

  const normal = service.prepareThreadMessageCreate({
    thread: baseThread(),
    body: { text: "帮我写一句普通回复" },
    auth: { owner: true, workspaces: ["owner"] },
  });
  assert.equal(normal.nextAction, "start-run");
  assert.doesNotMatch(normal.runOptions.instructions, /\[HOME AI DATA CONTEXT\]/);
}

function testDeepSeekOwnerMaintenanceRouteUsesHighPermissionProfile() {
  const { service } = makeHarness({
    serviceOptions: {
      gatewayRoutingForModelRun: () => ({
        securityLevel: "owner-maintenance",
        maintenance: true,
        maintenanceCategory: "owner_high_privilege",
      }),
    },
  });
  const plan = service.prepareThreadMessageCreate({
    thread: baseThread(),
    body: {
      text: "run elevated DeepSeek maintenance",
      model: "deepseek-chat",
      provider: "deepseek",
    },
    auth: { owner: true, workspaces: ["owner"] },
  });

  assert.equal(plan.nextAction, "start-run");
  assert.equal(plan.runOptions.provider, "deepseek");
  assert.equal(plan.runOptions.gatewayRouting.securityLevel, "owner-maintenance");
  assert.equal(plan.runOptions.gatewayRouting.maintenance, true);
  assert.deepEqual(plan.runOptions.gatewayRouting.preferred_worker_profiles, ["deepseekmaint1"]);
}

function testSearchSourceRunOptions() {
  const { calls, service } = makeHarness();
  const plan = service.prepareThreadMessageCreate({
    thread: baseThread(),
    body: {
      text: "\u8bf7\u67e5 X \u4e0a\u7684\u6700\u65b0\u8ba8\u8bba",
      search_source: "x",
    },
    auth: {},
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.searchSource.source, "x");
  assert.equal(plan.searchSource.sourceIntent, "x_search");
  assert.equal(plan.userMessage.searchSource, "x");
  assert.equal(plan.userMessage.sourceIntent, "x_search");
  assert.equal(plan.userMessage.sourceMode, "manual");
  assert.equal(plan.assistantMessage.searchSource, "x");
  assert.equal(plan.assistantMessage.sourceIntent, "x_search");
  assert.equal(plan.assistantMessage.sourceMode, "manual");
  assert.deepEqual(plan.runOptions.access_policy_context, {
    allowed_toolsets: ["x_search", "web", "search"],
  });
  assert.equal(plan.runOptions.searchSource, "x");
  assert.equal(plan.runOptions.sourceIntent, "x_search");
  assert.equal(plan.runOptions.sourceMode, "manual");
  assert.match(plan.runOptions.instructions, /Source selected.*X search/);
  assert.equal(plan.runOptions.provider || "", "");
  assert.equal(plan.runOptions.gatewayRouting.provider || "", "");
  assert.equal(calls.gatewayRouting[0].body.searchSource, "x");
  assert.equal(calls.gatewayRouting[0].body.sourceIntent, "x_search");
  assert.equal(calls.gatewayRouting[0].body.sourceMode, "manual");

  const natural = service.prepareThreadMessageCreate({
    thread: baseThread(),
    body: {
      text: "\u8bf7\u5728 X \u4e0a\u641c\u6700\u65b0\u8ba8\u8bba",
      model: "gpt-5.5",
      provider: "openai-codex",
    },
    auth: {},
  });
  assert.equal(natural.ok, true);
  assert.equal(natural.searchSource.source, "x");
  assert.equal(natural.searchSource.sourceMode, "auto");
  assert.equal(natural.runOptions.model, "gpt-5.5");
  assert.equal(natural.runOptions.provider, "openai-codex");
  assert.equal(natural.runOptions.gatewayRouting.provider, "openai-codex");
  assert.match(natural.runOptions.instructions, /Hermes Mobile proxy/);
}

async function testQueuedChatRunSkipsConcurrencyAndStart() {
  const { calls, service } = makeHarness();
  const thread = baseThread({
    singleWindow: true,
    activeRunIds: ["run-active"],
    memberWorkspaceIds: ["owner"],
    runningTaskGroups: ["group-chat"],
  });
  const plan = service.prepareThreadMessageCreate({
    thread,
    body: { text: "continue chat", singleWindowMode: "chat", taskGroupId: "group-chat" },
    auth: { owner: true, workspaces: ["owner"] },
  });
  assert.equal(plan.nextAction, "queue-run");
  assert.equal(plan.queueBehindActiveChatRun, true);
  assert.deepEqual(calls.concurrency, []);

  const result = await service.commitRunMessageAndDispatch(thread, plan);
  assert.equal(result.status, 202);
  assert.deepEqual(result.run, { status: "queued", taskGroupId: "group-chat", engine: "responses" });
  assert.equal(calls.starts.length, 0);
  assert.equal(thread.status, "running");
}

async function testServerSideSentTextLearningAfterMessageCommit() {
  const { calls, service } = makeHarness();
  const thread = baseThread({ workspaceId: "owner", singleWindow: true });
  const plan = service.prepareThreadMessageCreate({
    thread,
    body: { text: "Home AI Codex Mobile", singleWindowMode: "chat", taskGroupId: "chat-main" },
    auth: { owner: true, workspaces: ["owner"] },
  });
  assert.equal(plan.ok, true);
  const result = await service.commitRunMessageAndDispatch(thread, plan);
  assert.equal(result.status, 202);
  assert.equal(calls.learned.length, 1);
  assert.equal(calls.learned[0].text, "Home AI Codex Mobile");
  assert.equal(calls.learned[0].workspaceId, "owner");
  assert.equal(calls.learned[0].surfaceType, "topic_chat");
  assert.equal(calls.learned[0].threadId, thread.id);

  const failing = makeHarness({ learnSentTextThrows: true });
  const plainThread = baseThread({ workspaceId: "owner", singleWindow: true, memberWorkspaceIds: ["owner"] });
  const plainPlan = failing.service.prepareThreadMessageCreate({
    thread: plainThread,
    body: { text: "plain text still sends", singleWindowMode: "chat", taskGroupId: "group-chat", messageKind: "plain" },
    auth: { owner: true, workspaces: ["owner"] },
  });
  assert.equal(plainPlan.nextAction, "plain-message");
  const committed = failing.service.commitPlainMessage(plainThread, plainPlan);
  assert.equal(committed.status, 201);
  assert.equal(failing.calls.learned.length, 1);
  assert.equal(plainThread.messages.length, 1);
}

function testConcurrencyErrorBeforeStateMutation() {
  const { service } = makeHarness({
    concurrencyError: {
      status: 429,
      message: "busy",
      code: "run_limit",
    },
  });
  const thread = baseThread({ workspaceId: "busy-ws" });
  const result = service.prepareThreadMessageCreate({
    thread,
    body: { text: "start run" },
    auth: {},
  });
  assert.equal(result.status, 429);
  assert.equal(result.response.code, "run_limit");
  assert.deepEqual(result.response.concurrency, { activeGlobal: 2 });
  assert.equal(thread.messages.length, 0);
}

(async () => {
  testPureDefaults();
  testValidationAndGatewayErrorShape();
  testPlannerParagraphIsAcceptedAndOversizeTextIsRejected();
  testSingleWindowGroupChatPlainMessageCommit();
  testTaskGroupAndCaseTopicValidation();
  testDirectoryAttachmentPrecedence();
  testDirectCreateRoutingAndPayloads();
  await testRunOptionsAndDispatchHooks();
  await testDispatchFormatsGatewayCapacityFailure();
  testGrokModelRouteRequiresXaiGatewayProvider();
  testNaturalLanguageGrokRouteOverridesDefaultChatGptModel();
  testDeepSeekOwnerMaintenanceRouteUsesHighPermissionProfile();
  testSearchSourceRunOptions();
  testChatDataContextIsInjectedOnlyForMatchingRequests();
  await testQueuedChatRunSkipsConcurrencyAndStart();
  await testServerSideSentTextLearningAfterMessageCommit();
  testConcurrencyErrorBeforeStateMutation();
  console.log("thread-message-create-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
