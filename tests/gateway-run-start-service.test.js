"use strict";

const assert = require("node:assert/strict");
const {
  createGatewayRunStartService,
  policyThreadForRun,
  resolveActorWorkspaceId,
} = require("../adapters/gateway-run-start-service");

function makeHarness(overrides = {}) {
  const calls = {
    broadcasts: [],
    concurrency: [],
    events: [],
    gatewayRouting: [],
    hermesInstructions: [],
    mkdirs: [],
    removedRuns: [],
    saved: 0,
    streams: [],
  };
  const service = createGatewayRunStartService(Object.assign({
    singleWindowProjectId: "single-window-project",
    groupChatTaskGroupId: "group-chat",
    toolSchemaEpoch: "epoch-test",
    nowIso: () => "2026-05-15T01:02:03.000Z",
    nowMs: () => 1778806923000,
    addThreadEvent: (thread, event) => {
      thread.events = thread.events || [];
      thread.events.push(event);
      calls.events.push(event);
    },
    assertRunConcurrencyCapacity: (workspaceId) => calls.concurrency.push(workspaceId),
    accessPolicyHardeningOptionsForGatewayRouting: (routing) => ({
      allowMaintenanceTools: Boolean(routing.maintenance),
    }),
    taskDirectoryAttachmentForMessage: () => null,
    projectForTaskDirectoryAttachment: (_thread, attachment) => ({
      id: attachment.projectId,
      root: attachment.path,
      label: attachment.label,
    }),
    effectiveProjectForThread: (thread) => ({
      id: thread.projectId || "project-default",
      root: `/workspace/${thread.workspaceId || "owner"}`,
      workspaceId: thread.workspaceId || "owner",
    }),
    findWorkspace: (workspaceId) => ({
      id: workspaceId,
      policy: { principal_id: workspaceId, default_workspace: `/workspace/${workspaceId}` },
    }),
    buildAccessPolicy: (routePolicy, _user, project, hardeningOptions) => ({
      principal_id: routePolicy.principal_id || "unknown",
      allowed_roots: [project.root],
      allowed_toolsets: hardeningOptions.allowMaintenanceTools ? ["file", "terminal"] : ["file"],
      connector_profiles: { base: { type: "profile" } },
    }),
    sanitizePolicy: (policy, hardeningOptions) => Object.assign({ sanitized: true, hardeningOptions }, policy),
    mergeAccessPolicyOverride: (basePolicy, overridePolicy) => Object.assign({}, basePolicy, overridePolicy, {
      allowed_toolsets: [
        ...(basePolicy.allowed_toolsets || []),
        ...(overridePolicy.allowed_toolsets || []),
      ],
      connector_profiles: Object.assign(
        {},
        basePolicy.connector_profiles || {},
        overridePolicy.connector_profiles || {},
      ),
    }),
    groupChatDeliveryRootForThread: () => "",
    windowsPathToWsl: (value) => value.replace(/^C:\\/i, "/mnt/c/").replace(/\\/g, "/"),
    ensureGroupChatSharedArtifactCopies: () => [],
    mkdirSync: (target, options) => calls.mkdirs.push({ target, options }),
    gatewayConversationId: (thread, userMessage, policy) => `${thread.hermesSessionId}:${userMessage.id}:${(policy.allowed_toolsets || []).join(",")}`,
    buildConversationHistory: (thread, latestUserMessageId) => [{ threadId: thread.id, latestUserMessageId }],
    buildHermesInstructions: (thread, policy, project, latestText, taskDirectory, buildOptions) => {
      calls.hermesInstructions.push({ thread, policy, project, latestText, taskDirectory, buildOptions });
      return `instructions:${thread.workspaceId}:${project.id}`;
    },
    routeRunToolsets: ({ policy, userMessage, runOptions }) => {
      const text = String(userMessage?.content || "");
      if (/plain chat/i.test(text)) {
        return {
          policy: Object.assign({}, policy, {
            allowed_toolsets: ["web", "search", "browser", "x_search", "http", "clarify"],
            toolset_routing: { mode: "minimal", reason: "plain_chat_light_tools" },
          }),
          routing: { mode: "minimal", reason: "plain_chat_light_tools" },
        };
      }
      if (runOptions.searchSource === "x") {
        return {
          policy: Object.assign({}, policy, {
            allowed_toolsets: (policy.allowed_toolsets || []).filter((item) => ["x_search", "web", "search"].includes(item)),
            toolset_routing: { mode: "intent", reason: "matched_intent" },
          }),
          routing: { mode: "intent", reason: "matched_intent" },
        };
      }
      return { policy, routing: { mode: "compatible", reason: "test_default" } };
    },
    makePublicTaskId: () => "web_test_1",
    gatewaySkillRoutingForWorkspace: (workspaceId) => ({ skillWorkspaceId: workspaceId, requireSkillProfile: true }),
    chooseGatewayRunTarget: async (routing) => {
      calls.gatewayRouting.push(routing);
      return {
        apiBase: "http://worker.gateway",
        apiKey: "worker-key",
        name: "lowgw1",
        profile: "lowgw1",
        source: "worker_pool",
      };
    },
    addThreadActiveRun: (thread, runId) => {
      thread.activeRunIds = [...(thread.activeRunIds || []), runId];
      thread.activeRunId = runId;
    },
    removeThreadActiveRun: (thread, runId, idleStatus) => calls.removedRuns.push({ threadId: thread.id, runId, idleStatus }),
    saveState: () => { calls.saved += 1; },
    broadcast: (payload) => calls.broadcasts.push(payload),
    compactMessage: (message) => ({ id: message.id, status: message.status, runId: message.runId }),
    threadSummary: (thread) => ({ id: thread.id, status: thread.status, activeRunIds: thread.activeRunIds || [] }),
    streamResponse: (runId, threadId, messageId, body, options) => calls.streams.push({
      runId,
      threadId,
      messageId,
      body,
      options,
    }),
  }, overrides));
  return { calls, service };
}

function baseThread(overrides = {}) {
  return Object.assign({
    id: "thread_1",
    workspaceId: "workspace_a",
    projectId: "project_a",
    subprojectId: "",
    hermesSessionId: "session_1",
    singleWindow: false,
    status: "idle",
    messages: [],
  }, overrides);
}

function baseUserMessage(overrides = {}) {
  return Object.assign({
    id: "user_1",
    role: "user",
    content: "Do the task",
    senderWorkspaceId: "workspace_sender",
    taskGroupId: "task_group_1",
  }, overrides);
}

function baseAssistantMessage(overrides = {}) {
  return Object.assign({
    id: "assistant_1",
    role: "assistant",
    content: "",
    status: "queued",
    runOptions: { existing: true },
  }, overrides);
}

function testPureWorkspaceHelpers() {
  assert.equal(
    resolveActorWorkspaceId({ workspaceId: "thread_ws" }, { senderWorkspaceId: "sender_ws" }, {}),
    "sender_ws",
  );
  assert.equal(
    resolveActorWorkspaceId({ workspaceId: "thread_ws" }, { senderWorkspaceId: "sender_ws" }, { actorWorkspaceId: "owner" }),
    "owner",
  );
  assert.equal(resolveActorWorkspaceId({}, {}, {}), "owner");

  const same = { id: "thread", workspaceId: "owner", projectId: "current" };
  assert.equal(policyThreadForRun(same, "owner", "single-window-project"), same);
  assert.deepEqual(policyThreadForRun(same, "child", "single-window-project"), {
    id: "thread",
    workspaceId: "child",
    projectId: "single-window-project",
    subprojectId: "",
  });
}

async function testStartRunBuildsGatewayRequestAndMutatesStartState() {
  const { calls, service } = makeHarness();
  const thread = baseThread();
  const user = baseUserMessage();
  const assistant = baseAssistantMessage();

  const run = await service.startRunForThread(thread, user, assistant, {
    actorWorkspaceId: "owner",
    gatewayRouting: { maintenance: true },
    model: "gpt-test",
    provider: "openai-codex",
    reasoning_effort: "medium",
    reasoning: { effort: "medium" },
    instructions: "extra instruction",
    access_policy_context: {
      allowed_toolsets: ["http"],
      connector_profiles: { extra: { type: "profile" } },
    },
  });

  assert.deepEqual(calls.concurrency, ["owner"]);
  assert.deepEqual(calls.gatewayRouting[0], {
    maintenance: true,
    purpose: "user_run",
    workspaceId: "owner",
    taskGroupId: "task_group_1",
    model: "gpt-test",
    provider: "openai-codex",
    modelProvider: "openai-codex",
    reasoning_effort: "medium",
    skillWorkspaceId: "owner",
    requireSkillProfile: true,
  });
  assert.equal(assistant.actorWorkspaceId, "owner");
  assert.equal(assistant.runId, "web_test_1");
  assert.equal(assistant.status, "running");
  assert.equal(assistant.gatewayUrl, "http://worker.gateway");
  assert.equal(assistant.gatewayProfile, "lowgw1");
  assert.equal(assistant.model, "gpt-test");
  assert.equal(assistant.modelProvider, "openai-codex");
  assert.equal(assistant.reasoningEffort, "medium");
  assert.equal(assistant.runOptions.existing, true);
  assert.equal(assistant.runOptions.gatewayConversation, "session_1:user_1:file,terminal,http");
  assert.deepEqual(assistant.runOptions.toolsetRouting, { mode: "compatible", reason: "test_default" });
  assert.equal(assistant.runOptions.toolSchemaEpoch, "epoch-test");
  assert.equal(assistant.runOptions.access_policy_context.connector_profiles.extra.type, "profile");
  assert.equal(thread.status, "running");
  assert.deepEqual(thread.activeRunIds, ["web_test_1"]);
  assert.equal(calls.saved, 3);
  assert.equal(calls.events.length, 4);
  assert.deepEqual(calls.events.map((event) => event.event), [
    "run.request_preparing",
    "run.context_ready",
    "run.gateway_selected",
    "run.request_sent",
  ]);
  assert.equal(calls.events[0].runId, "web_test_1");
  assert.equal(calls.events[0].preview, "正在准备上下文和选择 Gateway");
  assert.equal(calls.events[1].preview, "上下文 1 条，约 0 字");
  assert.match(calls.events[2].preview, /lowgw1/);
  assert.match(calls.events[2].preview, /gpt-test/);
  assert.equal(calls.events[3].preview, "等待模型或工具返回");
  assert.deepEqual(calls.broadcasts.slice(0, 3).map((item) => item.type), ["message.updated", "run.event", "message.updated"]);
  assert.equal(calls.broadcasts[0].message.runId, "web_test_1");
  assert.equal(calls.broadcasts[0].message.status, "running");
  assert.deepEqual(calls.broadcasts.slice(1, 6).map((item) => item.type), ["run.event", "message.updated", "run.event", "run.event", "run.event"]);
  assert.equal(calls.streams.length, 1);
  assert.equal(calls.streams[0].runId, "web_test_1");
  assert.equal(calls.streams[0].body.input, "Do the task");
  assert.equal(calls.streams[0].body.stream, true);
  assert.equal(calls.streams[0].body.store, true);
  assert.deepEqual(calls.streams[0].body.conversation_history, [{ threadId: "thread_1", latestUserMessageId: "user_1" }]);
  assert.match(calls.streams[0].body.instructions, /instructions:owner:single-window-project/);
  assert.match(calls.streams[0].body.instructions, /extra instruction/);
  assert.equal(calls.streams[0].body.model, "gpt-test");
  assert.equal(calls.streams[0].body.provider, "openai-codex");
  assert.deepEqual(calls.streams[0].body.reasoning, { effort: "medium" });
  assert.deepEqual(calls.streams[0].body.enabled_toolsets, ["file", "terminal", "http"]);
  assert.deepEqual(calls.streams[0].options, {
    gatewayUrl: "http://worker.gateway",
    gatewayApiKey: "worker-key",
    gatewayName: "lowgw1",
    gatewayProfile: "lowgw1",
    gatewaySource: "worker_pool",
  });
  assert.deepEqual(run, {
    run_id: "web_test_1",
    status: "started",
    engine: "responses",
    gatewayUrl: "http://worker.gateway",
    gatewayName: "lowgw1",
    gatewayProfile: "lowgw1",
    gatewaySource: "worker_pool",
  });
}

async function testStartRunPublishesRunIdBeforeRequestBuild() {
  let sawPreparedState = false;
  const { calls, service } = makeHarness({
    buildHermesInstructions: (thread) => {
      sawPreparedState = thread.activeRunId === "web_test_1"
        && Array.isArray(thread.activeRunIds)
        && thread.activeRunIds.includes("web_test_1")
        && thread.status === "running";
      return "instructions-after-visible-run";
    },
  });
  const thread = baseThread();
  const assistant = baseAssistantMessage();

  await service.startRunForThread(thread, baseUserMessage(), assistant, {});

  assert.equal(sawPreparedState, true);
  assert.equal(calls.broadcasts[0].type, "message.updated");
  assert.deepEqual(calls.broadcasts[0].message, {
    id: "assistant_1",
    status: "running",
    runId: "web_test_1",
  });
  assert.ok(calls.broadcasts.find((item) => item.type === "run.event" && item.event?.event === "run.context_ready"));
}

async function testPluginTopicRequiresItsMcpToolsetForPolicyAndGatewayRouting() {
  const { calls, service } = makeHarness({
    buildAccessPolicy: (routePolicy, _user, project) => ({
      principal_id: routePolicy.principal_id || "unknown",
      allowed_roots: [project.root],
      allowed_toolsets: ["file", "web"],
      authorized_toolsets: ["file", "web"],
      connector_profiles: { base: { type: "profile" } },
    }),
  });

  await service.startRunForThread(
    baseThread({ workspaceId: "owner" }),
    baseUserMessage({
      senderWorkspaceId: "owner",
      taskGroupId: "plugin:finance",
      content: "列出账本",
    }),
    baseAssistantMessage(),
    { actorWorkspaceId: "owner", model: "gpt-test", provider: "openai-codex" },
  );

  assert.deepEqual(calls.gatewayRouting[0].requiredToolsets, ["finance"]);
  assert.deepEqual(calls.gatewayRouting[0].enabledToolsets, ["finance"]);
  assert.deepEqual(calls.streams[0].body.enabled_toolsets, ["file", "web", "finance"]);
  assert.deepEqual(calls.streams[0].body.access_policy_context.required_toolsets, ["finance"]);
  assert.deepEqual(calls.streams[0].body.access_policy_context.authorized_toolsets, ["file", "web", "finance"]);
}

async function testPluginTopicKeepsRequiredMcpWhenModelFirstNarrowsToolsets() {
  const { calls, service } = makeHarness({
    buildAccessPolicy: (routePolicy, _user, project) => ({
      principal_id: routePolicy.principal_id || "unknown",
      allowed_roots: [project.root],
      allowed_toolsets: ["file", "web", "finance"],
      authorized_toolsets: ["file", "web", "finance"],
      connector_profiles: { base: { type: "profile" } },
    }),
    selectRunToolsetsWithModel: async () => ({
      enabled: true,
      ok: true,
      reason: "model_selected_web",
      selectedToolsets: ["web"],
      authorizedToolsets: ["file", "web", "finance"],
      durationMs: 50,
    }),
  });

  await service.startRunForThread(
    baseThread({ workspaceId: "owner" }),
    baseUserMessage({ senderWorkspaceId: "owner", taskGroupId: "plugin:finance" }),
    baseAssistantMessage(),
    { actorWorkspaceId: "owner", model: "gpt-test", provider: "openai-codex" },
  );

  assert.deepEqual(calls.gatewayRouting[0].requiredToolsets, ["finance"]);
  assert.deepEqual(calls.streams[0].body.access_policy_context.allowed_toolsets, ["web", "finance"]);
  assert.deepEqual(calls.streams[0].body.access_policy_context.required_toolsets, ["finance"]);
  assert.deepEqual(calls.streams[0].body.enabled_toolsets, ["web", "finance"]);
}

function testBuildRunRequestAddsGroupChatDeliveryRootsAndInstructionContext() {
  const copies = [{ name: "shared.pdf", copyPathForModel: "/mnt/c/delivery/shared.pdf" }];
  const { calls, service } = makeHarness({
    groupChatDeliveryRootForThread: () => "C:\\delivery\\thread_1",
    ensureGroupChatSharedArtifactCopies: () => copies,
  });
  const thread = baseThread({ singleWindow: true });
  const user = baseUserMessage({ taskGroupId: "group-chat" });
  const assistant = baseAssistantMessage();

  const request = service.buildRunRequest(thread, user, assistant, {});

  assert.deepEqual(calls.mkdirs, [{
    target: "C:\\delivery\\thread_1",
    options: { recursive: true },
  }]);
  assert.deepEqual(request.groupChat.groupChatAttachmentCopies, copies);
  assert.equal(request.groupChat.groupChatDeliveryRoot, "C:\\delivery\\thread_1");
  assert.equal(request.groupChat.groupChatDeliveryRootForModel, "/mnt/c/delivery/thread_1");
  assert.deepEqual(request.runPolicy.allowed_roots, [
    "/workspace/workspace_sender",
    "/mnt/c/delivery/thread_1",
    "C:\\delivery\\thread_1",
  ]);
  assert.deepEqual(request.runPolicy.delivery_roots, [
    "/mnt/c/delivery/thread_1",
    "C:\\delivery\\thread_1",
  ]);
  assert.deepEqual(request.runPolicy.cache_roots, [
    "/mnt/c/delivery/thread_1",
    "C:\\delivery\\thread_1",
  ]);
  assert.equal(calls.hermesInstructions[0].buildOptions.groupChatDeliveryRoot, "/mnt/c/delivery/thread_1");
  assert.deepEqual(calls.hermesInstructions[0].buildOptions.groupChatAttachmentCopies, copies);
}

async function testStartRunPreservesSearchSourceRouting() {
  const { calls, service } = makeHarness({
    runExplicitWebSearchMaxCalls: 12,
    runWebSearchMaxCalls: 6,
  });
  const thread = baseThread();
  const user = baseUserMessage();
  const assistant = baseAssistantMessage();

  await service.startRunForThread(thread, user, assistant, {
    searchSource: "x",
    sourceIntent: "x_search",
    sourceMode: "manual",
    access_policy_context: { allowed_toolsets: ["x_search", "web", "search"] },
  });

  assert.equal(calls.gatewayRouting[0].searchSource, "x");
  assert.equal(calls.gatewayRouting[0].sourceIntent, "x_search");
  assert.equal(calls.gatewayRouting[0].sourceMode, "manual");
  assert.equal(assistant.runOptions.searchSource, "x");
  assert.equal(assistant.runOptions.sourceIntent, "x_search");
  assert.equal(assistant.runOptions.sourceMode, "manual");
  assert.deepEqual(calls.streams[0].body.access_policy_context.allowed_toolsets, ["x_search", "web", "search"]);
  assert.equal(calls.streams[0].options.webSearchMaxCalls, 12);
  assert.deepEqual(assistant.runOptions.toolsetRouting, { mode: "intent", reason: "matched_intent" });
}

async function testOrdinaryRunUsesDefaultWebSearchBudgetWhenConfigured() {
  const { calls, service } = makeHarness({
    runExplicitWebSearchMaxCalls: 12,
    runWebSearchMaxCalls: 6,
  });

  await service.startRunForThread(baseThread(), baseUserMessage(), baseAssistantMessage(), {});

  assert.equal(calls.streams[0].options.webSearchMaxCalls, 6);
}

async function testStartRunProjectsGatewaySchedulerEventsBeforeSelection() {
  const thread = baseThread();
  const { calls, service } = makeHarness({
    chooseGatewayRunTarget: async (routing, context = {}) => {
      calls.gatewayRouting.push(routing);
      assert.equal(context.runId, "web_test_1");
      assert.equal(thread.activeRunId, "web_test_1");
      assert.deepEqual(thread.activeRunIds, ["web_test_1"]);
      context.onEvent({
        event: "run.gateway_worker_starting",
        reason: "worker_starting",
        profileId: "lowgw5",
        provider: "openai-codex",
        workspaceId: "workspace_sender",
        permissionTier: "user",
        state: "starting",
        queueDepth: 0,
        timestampMs: 1_778_806_923_000,
        secret: "must-not-render",
      });
      context.onEvent({
        event: "run.gateway_worker_started",
        reason: "worker_started",
        profileId: "lowgw5",
        provider: "openai-codex",
        workspaceId: "workspace_sender",
        permissionTier: "user",
        state: "busy",
        queueDepth: 0,
        lastStartDurationMs: 2100,
      });
      return {
        apiBase: "http://worker.gateway",
        apiKey: "worker-key",
        name: "lowgw5",
        profile: "lowgw5",
        source: "worker_pool",
      };
    },
  });

  await service.startRunForThread(thread, baseUserMessage(), baseAssistantMessage(), {});

  assert.deepEqual(calls.events.map((event) => event.event).slice(0, 5), [
    "run.request_preparing",
    "run.gateway_worker_starting",
    "run.gateway_worker_started",
    "run.context_ready",
    "run.gateway_selected",
  ]);
  const starting = JSON.parse(calls.events[1].preview);
  assert.equal(starting.reason, "worker_starting");
  assert.equal(starting.profileId, "lowgw5");
  assert.equal(starting.workspaceId, "workspace_sender");
  assert.equal(JSON.stringify(calls.events).includes("must-not-render"), false);
  assert.equal(JSON.stringify(calls.events).includes("worker-key"), false);
  assert.equal(calls.broadcasts[0].type, "message.updated");
  assert.equal(calls.broadcasts[0].message.runId, "web_test_1");
  assert.deepEqual(calls.broadcasts[0].thread.activeRunIds, ["web_test_1"]);
  assert.equal(calls.broadcasts[1].type, "run.event");
  assert.deepEqual(calls.broadcasts[1].thread.activeRunIds, ["web_test_1"]);
}

async function testStartRunUsesModelFirstSelectionBeforeExecution() {
  const { calls, service } = makeHarness({
    buildAccessPolicy: (routePolicy, _user, project) => ({
      principal_id: routePolicy.principal_id || "unknown",
      allowed_roots: [project.root],
      allowed_toolsets: ["file", "weather", "x_search", "web"],
      connector_profiles: { base: { type: "profile" } },
    }),
    selectRunToolsetsWithModel: async ({ request, gatewayTarget }) => {
      assert.deepEqual(request.runPolicy.allowed_toolsets, ["file", "weather", "x_search", "web"]);
      assert.equal(gatewayTarget.profile, "lowgw1");
      return {
        enabled: true,
        ok: true,
        reason: "wardrobe_weather",
        selectedToolsets: ["weather", "file"],
        authorizedToolsets: ["file", "weather", "x_search", "web"],
        durationMs: 120,
      };
    },
  });
  const assistant = baseAssistantMessage();

  await service.startRunForThread(baseThread(), baseUserMessage(), assistant, {});

  assert.deepEqual(calls.streams[0].body.access_policy_context.allowed_toolsets, ["weather", "file"]);
  assert.equal(calls.streams[0].body.access_policy_context.toolset_routing.mode, "model_first");
  assert.deepEqual(calls.streams[0].body.access_policy_context.toolset_routing.selected_toolsets, ["weather", "file"]);
  assert.match(calls.streams[0].body.instructions, /HERMES_TOOLSET_ESCALATION_REQUIRED/);
  assert.match(calls.streams[0].body.instructions, /Omitted authorized toolsets: x_search, web/);
  assert.equal(assistant.runOptions.toolsetRouting.mode, "model_first");
  assert.deepEqual(assistant.runOptions.access_policy_context.allowed_toolsets, ["weather", "file"]);
  assert.deepEqual(calls.events.map((event) => event.event), [
    "run.request_preparing",
    "run.context_ready",
    "run.gateway_selected",
    "run.toolset_selection_started",
    "run.toolset_selection_done",
    "run.request_sent",
  ]);
  assert.deepEqual(JSON.parse(calls.events[4].preview).selected_toolsets, ["weather", "file"]);
}

async function testModelFirstRoutingMetadataSurvivesPolicySanitizer() {
  const { calls, service } = makeHarness({
    buildAccessPolicy: (routePolicy, _user, project) => ({
      principal_id: routePolicy.principal_id || "unknown",
      allowed_roots: [project.root],
      allowed_toolsets: ["file", "weather", "x_search", "web"],
      connector_profiles: { base: { type: "profile" } },
    }),
    sanitizePolicy: (policy) => {
      const copy = Object.assign({}, policy);
      delete copy.toolset_routing;
      return copy;
    },
    selectRunToolsetsWithModel: async () => ({
      enabled: true,
      ok: true,
      reason: "wardrobe_weather",
      selectedToolsets: ["weather", "file"],
      authorizedToolsets: ["file", "weather", "x_search", "web"],
      durationMs: 120,
    }),
  });
  const assistant = baseAssistantMessage();

  await service.startRunForThread(baseThread(), baseUserMessage(), assistant, {});

  assert.equal(calls.streams[0].body.access_policy_context.toolset_routing.mode, "model_first");
  assert.deepEqual(calls.streams[0].body.access_policy_context.toolset_routing.selected_toolsets, ["weather", "file"]);
  assert.equal(assistant.runOptions.toolsetRouting.mode, "model_first");
  assert.deepEqual(assistant.runOptions.toolsetRouting.selected_toolsets, ["weather", "file"]);
}

async function testStartRunSkipsSelectorForForcedToolsetEscalationRetry() {
  let selectorCalls = 0;
  const { calls, service } = makeHarness({
    buildAccessPolicy: (routePolicy, _user, project) => ({
      principal_id: routePolicy.principal_id || "unknown",
      allowed_roots: [project.root],
      allowed_toolsets: ["wardrobe", "file", "web", "search", "browser", "vision"],
    }),
    selectRunToolsetsWithModel: async () => {
      selectorCalls += 1;
      return {
        enabled: true,
        ok: true,
        reason: "should_not_run",
        selectedToolsets: ["wardrobe", "file"],
        authorizedToolsets: ["wardrobe", "file", "web", "search", "browser", "vision", "skills"],
        durationMs: 1,
      };
    },
  });
  const assistant = baseAssistantMessage();

  await service.startRunForThread(baseThread(), baseUserMessage(), assistant, {
    skipModelFirstToolsetSelection: true,
    modelFirstToolsetSelection: {
      skipSelector: true,
      reason: "toolset_escalation_retry",
      selectedToolsets: ["wardrobe", "file", "web", "search", "browser"],
      authorizedToolsets: ["wardrobe", "file", "web", "search", "browser", "vision", "skills"],
      durationMs: 0,
      routing: {
        mode: "model_first",
        reason: "toolset_escalation_retry",
        selected_toolsets: ["wardrobe", "file", "web", "search", "browser"],
        omitted_authorized_toolsets: ["vision", "skills"],
        authorized_toolset_count: 7,
        duration_ms: 0,
      },
    },
  });

  assert.equal(selectorCalls, 0);
  assert.deepEqual(calls.streams[0].body.access_policy_context.allowed_toolsets, ["wardrobe", "file", "web", "search", "browser"]);
  assert.deepEqual(calls.streams[0].body.access_policy_context.toolset_routing.selected_toolsets, ["wardrobe", "file", "web", "search", "browser"]);
  assert.match(calls.streams[0].body.instructions, /Enabled toolsets: wardrobe, file, web, search, browser/);
  assert.match(calls.streams[0].body.instructions, /Omitted authorized toolsets: vision, skills/);
  assert.deepEqual(calls.events.map((event) => event.event), [
    "run.request_preparing",
    "run.context_ready",
    "run.gateway_selected",
    "run.toolset_selection_done",
    "run.request_sent",
  ]);
  assert.deepEqual(JSON.parse(calls.events[3].preview).selected_toolsets, ["wardrobe", "file", "web", "search", "browser"]);
}

async function testStartRunCanExecuteWardrobeMcpSelection() {
  const { calls, service } = makeHarness({
    buildAccessPolicy: (routePolicy, _user, project) => ({
      principal_id: routePolicy.principal_id || "unknown",
      allowed_roots: [project.root],
      allowed_toolsets: ["wardrobe", "vision", "file", "http", "skills"],
    }),
    selectRunToolsetsWithModel: async ({ request }) => {
      assert.ok(request.runPolicy.allowed_toolsets.includes("wardrobe"));
      return {
        enabled: true,
        ok: true,
        reason: "wardrobe MCP handles writeback and readback verification",
        selectedToolsets: ["wardrobe", "vision", "file"],
        authorizedToolsets: ["wardrobe", "vision", "file", "http", "skills"],
        durationMs: 1000,
      };
    },
  });

  await service.startRunForThread(
    baseThread(),
    baseUserMessage({ content: "\u8fd9\u5f20 LP \u5546\u54c1\u7167\u9700\u8981\u5165\u5e93\u5230\u8863\u6a71" }),
    baseAssistantMessage(),
    {},
  );

  assert.deepEqual(calls.streams[0].body.access_policy_context.allowed_toolsets, ["wardrobe", "vision", "file"]);
  assert.deepEqual(calls.streams[0].body.enabled_toolsets, ["wardrobe", "vision", "file"]);
  assert.match(calls.streams[0].body.instructions, /Enabled toolsets: wardrobe, vision, file/);
  assert.match(calls.streams[0].body.instructions, /Omitted authorized toolsets: http/);
  assert.deepEqual(JSON.parse(calls.events[4].preview).selected_toolsets, ["wardrobe", "vision", "file"]);
}

async function testPermissionPreflightKeepsFullAuthorizedToolsetsWhenSelectionDisabled() {
  const { calls, service } = makeHarness({
    buildAccessPolicy: (routePolicy, _user, project) => ({
      principal_id: routePolicy.principal_id || "unknown",
      allowed_roots: [project.root],
      allowed_toolsets: ["wardrobe", "vision", "file", "http", "skills"],
    }),
    routeRunToolsets: ({ policy }) => ({
      policy: Object.assign({}, policy, {
        authorized_toolsets: ["wardrobe", "vision", "file", "http", "skills"],
        allowed_toolsets: ["wardrobe", "vision", "file", "http", "skills"],
        toolset_routing: {
          mode: "disabled",
          reason: "toolset_pruning_disabled",
          execution_mode: "full_authorized",
          selected_toolsets: ["wardrobe", "vision", "file", "http", "skills"],
          omitted_authorized_toolsets: [],
          suggested_toolsets: ["wardrobe", "vision", "file", "skills"],
          suggested_mode: "intent",
          suggested_reason: "matched_intent",
        },
      }),
      routing: {
        mode: "disabled",
        reason: "toolset_pruning_disabled",
        execution_mode: "full_authorized",
        selected_toolsets: ["wardrobe", "vision", "file", "http", "skills"],
        omitted_authorized_toolsets: [],
        suggested_toolsets: ["wardrobe", "vision", "file", "skills"],
      },
    }),
    selectRunToolsetsWithModel: async ({ request }) => ({
      enabled: true,
      ok: true,
      mode: "permission_preflight",
      toolsetSelectionDisabled: true,
      reason: "permission allowed; full authorized toolsets retained",
      selectedToolsets: request.runPolicy.allowed_toolsets,
      authorizedToolsets: request.runPolicy.authorized_toolsets || request.runPolicy.allowed_toolsets,
      durationMs: 800,
    }),
  });

  await service.startRunForThread(
    baseThread(),
    baseUserMessage({ content: "\u628a\u4eca\u5929\u7a7f\u642d\u5199\u5165\u8863\u6a71" }),
    baseAssistantMessage(),
    {},
  );

  assert.deepEqual(calls.streams[0].body.enabled_toolsets, ["wardrobe", "vision", "file", "http", "skills"]);
  assert.deepEqual(calls.streams[0].body.access_policy_context.allowed_toolsets, ["wardrobe", "vision", "file", "http", "skills"]);
  assert.equal(calls.streams[0].body.access_policy_context.toolset_routing.mode, "permission_preflight");
  assert.equal(calls.streams[0].body.access_policy_context.toolset_routing.toolset_selection_disabled, true);
  assert.deepEqual(calls.streams[0].body.access_policy_context.toolset_routing.omitted_authorized_toolsets, []);
  assert.doesNotMatch(calls.streams[0].body.instructions, /Omitted authorized toolsets: http/);
  assert.deepEqual(calls.events.map((event) => event.event), [
    "run.request_preparing",
    "run.context_ready",
    "run.gateway_selected",
    "run.toolset_selection_started",
    "run.permission_preflight_done",
    "run.request_sent",
  ]);
}

async function testPermissionPreflightFallbackRestoresFullAuthorizedToolsets() {
  const { calls, service } = makeHarness({
    buildAccessPolicy: (routePolicy, _user, project) => ({
      principal_id: routePolicy.principal_id || "unknown",
      allowed_roots: [project.root],
      allowed_toolsets: ["wardrobe", "vision", "file", "skills", "weather", "web"],
    }),
    routeRunToolsets: ({ policy }) => ({
      policy: Object.assign({}, policy, {
        allowed_toolsets: ["wardrobe", "vision", "file", "skills"],
        authorized_toolsets: ["wardrobe", "vision", "file", "skills", "weather", "web"],
        toolset_routing: {
          mode: "disabled",
          reason: "toolset_pruning_disabled",
          execution_mode: "deterministic_suggested",
          selected_toolsets: ["wardrobe", "vision", "file", "skills"],
          suggested_toolsets: ["wardrobe", "vision", "file", "skills", "weather"],
        },
      }),
      routing: { mode: "disabled", reason: "toolset_pruning_disabled" },
    }),
    selectRunToolsetsWithModel: async ({ request }) => ({
      enabled: true,
      ok: false,
      mode: "permission_preflight",
      toolsetSelectionDisabled: true,
      reason: "selector_error",
      selectedToolsets: request.runPolicy.allowed_toolsets,
      authorizedToolsets: request.runPolicy.authorized_toolsets || request.runPolicy.allowed_toolsets,
      durationMs: 8000,
    }),
  });

  await service.startRunForThread(
    baseThread(),
    baseUserMessage({ content: "\u7ee7\u7eed\u67e5\u770b\u8863\u6a71\u8bdd\u9898" }),
    baseAssistantMessage(),
    {},
  );

  assert.deepEqual(calls.streams[0].body.enabled_toolsets, ["wardrobe", "vision", "file", "skills", "weather", "web"]);
  assert.deepEqual(calls.streams[0].body.access_policy_context.allowed_toolsets, ["wardrobe", "vision", "file", "skills", "weather", "web"]);
  assert.deepEqual(calls.events.map((event) => event.event), [
    "run.request_preparing",
    "run.context_ready",
    "run.gateway_selected",
    "run.toolset_selection_started",
    "run.permission_preflight_fallback",
    "run.request_sent",
  ]);
  assert.equal(JSON.parse(calls.events[4].preview).reason, "selector_error");
}

async function testWardrobeSelectionKeepsVisionCompanionWhenSelectorNarrows() {
  const { calls, service } = makeHarness({
    buildAccessPolicy: (routePolicy, _user, project) => ({
      principal_id: routePolicy.principal_id || "unknown",
      allowed_roots: [project.root],
      allowed_toolsets: ["wardrobe", "vision", "file", "http", "skills"],
    }),
    routeRunToolsets: ({ policy }) => ({
      policy: Object.assign({}, policy, {
        allowed_toolsets: ["wardrobe", "vision", "file", "http", "skills"],
        toolset_routing: {
          mode: "disabled",
          reason: "toolset_pruning_disabled",
          suggested_toolsets: ["wardrobe", "vision", "file", "skills"],
          suggested_mode: "intent",
          suggested_reason: "wardrobe_bound_directory",
        },
      }),
      routing: {
        mode: "disabled",
        reason: "toolset_pruning_disabled",
        suggested_toolsets: ["wardrobe", "vision", "file", "skills"],
      },
    }),
    selectRunToolsetsWithModel: async () => ({
      enabled: true,
      ok: true,
      reason: "read wardrobe records first",
        selectedToolsets: ["wardrobe", "file"],
        authorizedToolsets: ["wardrobe", "vision", "file", "http", "skills"],
        durationMs: 9000,
      }),
  });

  await service.startRunForThread(
    baseThread(),
    baseUserMessage({ content: "核对这批衣橱鞋子的颜色和主图" }),
    baseAssistantMessage(),
    {},
  );

  assert.deepEqual(calls.streams[0].body.access_policy_context.allowed_toolsets, ["wardrobe", "vision", "file", "skills"]);
  assert.deepEqual(calls.streams[0].body.enabled_toolsets, ["wardrobe", "vision", "file", "skills"]);
  assert.deepEqual(calls.streams[0].body.access_policy_context.toolset_routing.selected_toolsets, ["wardrobe", "vision", "file", "skills"]);
  assert.match(calls.streams[0].body.instructions, /Enabled toolsets: wardrobe, vision, file, skills/);
  assert.doesNotMatch(calls.streams[0].body.instructions, /Omitted authorized toolsets: vision/);
  assert.deepEqual(JSON.parse(calls.events[4].preview).selected_toolsets, ["wardrobe", "vision", "file", "skills"]);
}

async function testWardrobeSelectionKeepsFileWhenSelectorChoosesVisionOnly() {
  const { calls, service } = makeHarness({
    buildAccessPolicy: (routePolicy, _user, project) => ({
      principal_id: routePolicy.principal_id || "unknown",
      allowed_roots: [project.root],
      allowed_toolsets: ["wardrobe", "vision", "file", "http", "skills"],
    }),
    routeRunToolsets: ({ policy }) => ({
      policy: Object.assign({}, policy, {
        allowed_toolsets: ["wardrobe", "vision", "file", "http", "skills"],
        toolset_routing: {
          mode: "disabled",
          reason: "toolset_pruning_disabled",
          suggested_toolsets: ["wardrobe", "vision", "file", "skills"],
          suggested_mode: "intent",
          suggested_reason: "wardrobe_bound_directory",
        },
      }),
      routing: {
        mode: "disabled",
        reason: "toolset_pruning_disabled",
        suggested_toolsets: ["wardrobe", "vision", "file", "skills"],
      },
    }),
    selectRunToolsetsWithModel: async () => ({
      enabled: true,
      ok: true,
      reason: "inspect image first",
      selectedToolsets: ["vision"],
        authorizedToolsets: ["wardrobe", "vision", "file", "http", "skills"],
        durationMs: 7000,
      }),
  });

  await service.startRunForThread(
    baseThread(),
    baseUserMessage({ content: "看一下这张衣橱图片并生成 MD 回执" }),
    baseAssistantMessage(),
    {},
  );

  assert.deepEqual(calls.streams[0].body.access_policy_context.allowed_toolsets, ["wardrobe", "vision", "file", "skills"]);
  assert.deepEqual(calls.streams[0].body.enabled_toolsets, ["wardrobe", "vision", "file", "skills"]);
  assert.deepEqual(calls.streams[0].body.access_policy_context.toolset_routing.selected_toolsets, ["wardrobe", "vision", "file", "skills"]);
  assert.match(calls.streams[0].body.instructions, /Enabled toolsets: wardrobe, vision, file, skills/);
  assert.deepEqual(JSON.parse(calls.events[4].preview).selected_toolsets, ["wardrobe", "vision", "file", "skills"]);
}

async function testWardrobeSelectionKeepsMcpStackWhenSelectorChoosesClarifyOnly() {
  const { calls, service } = makeHarness({
    buildAccessPolicy: (routePolicy, _user, project) => ({
      principal_id: routePolicy.principal_id || "unknown",
      allowed_roots: [project.root],
      allowed_toolsets: ["wardrobe", "vision", "file", "skills", "clarify", "http"],
      connector_profiles: { base: { type: "profile" } },
    }),
    routeRunToolsets: ({ policy }) => ({
      policy: Object.assign({}, policy, {
        allowed_toolsets: ["wardrobe", "vision", "file", "skills", "clarify", "http"],
        toolset_routing: {
          mode: "disabled",
          reason: "toolset_pruning_disabled",
          suggested_toolsets: ["wardrobe", "vision", "file", "skills"],
          suggested_mode: "intent",
          suggested_reason: "matched_intent",
        },
      }),
      routing: {
        mode: "disabled",
        reason: "toolset_pruning_disabled",
        suggested_toolsets: ["wardrobe", "vision", "file", "skills"],
      },
    }),
    selectRunToolsetsWithModel: async () => ({
      enabled: true,
      ok: true,
      reason: "diagnostic question",
      selectedToolsets: ["clarify"],
      authorizedToolsets: ["wardrobe", "vision", "file", "skills", "clarify", "http"],
      durationMs: 1200,
    }),
  });

  await service.startRunForThread(
    baseThread(),
    baseUserMessage({ content: "\u68c0\u67e5\u5f53\u524d\u4f1a\u8bdd\u662f\u5426\u5df2\u7ecf\u6302\u51fa\u8863\u6a71 MCP" }),
    baseAssistantMessage(),
    {},
  );

  assert.deepEqual(calls.streams[0].body.access_policy_context.allowed_toolsets, ["wardrobe", "vision", "file", "skills"]);
  assert.deepEqual(calls.streams[0].body.enabled_toolsets, ["wardrobe", "vision", "file", "skills"]);
  assert.deepEqual(calls.streams[0].body.access_policy_context.toolset_routing.selected_toolsets, ["wardrobe", "vision", "file", "skills"]);
  assert.match(calls.streams[0].body.instructions, /Enabled toolsets: wardrobe, vision, file, skills/);
  assert.doesNotMatch(calls.streams[0].body.instructions, /Enabled toolsets: clarify/);
  assert.deepEqual(JSON.parse(calls.events[4].preview).selected_toolsets, ["wardrobe", "vision", "file", "skills"]);
}

async function testWebSelectionKeepsBrowserCompanionWhenSelectorNarrows() {
  const { calls, service } = makeHarness({
    buildAccessPolicy: (routePolicy, _user, project) => ({
      principal_id: routePolicy.principal_id || "unknown",
      allowed_roots: [project.root],
      allowed_toolsets: ["web", "search", "browser", "file"],
    }),
    routeRunToolsets: ({ policy }) => ({
      policy: Object.assign({}, policy, {
        allowed_toolsets: ["web", "search", "browser", "file"],
        toolset_routing: {
          mode: "disabled",
          reason: "toolset_pruning_disabled",
          suggested_toolsets: ["web", "search", "browser"],
          suggested_mode: "intent",
          suggested_reason: "matched_intent",
        },
      }),
      routing: {
        mode: "disabled",
        reason: "toolset_pruning_disabled",
        suggested_toolsets: ["web", "search", "browser"],
      },
    }),
    selectRunToolsetsWithModel: async () => ({
      enabled: true,
      ok: true,
      reason: "search first",
      selectedToolsets: ["web", "search"],
      authorizedToolsets: ["web", "search", "browser", "file"],
      durationMs: 3000,
    }),
  });

  await service.startRunForThread(
    baseThread(),
    baseUserMessage({ content: "search the web for current product details" }),
    baseAssistantMessage(),
    {},
  );

  assert.deepEqual(calls.streams[0].body.access_policy_context.allowed_toolsets, ["web", "search", "browser"]);
  assert.deepEqual(calls.streams[0].body.access_policy_context.toolset_routing.selected_toolsets, ["web", "search", "browser"]);
  assert.match(calls.streams[0].body.instructions, /Enabled toolsets: web, search, browser/);
  assert.doesNotMatch(calls.streams[0].body.instructions, /Omitted authorized toolsets: browser/);
  assert.deepEqual(JSON.parse(calls.events[4].preview).selected_toolsets, ["web", "search", "browser"]);
}

async function testStartRunFallsBackWhenModelFirstSelectionFails() {
  const { calls, service } = makeHarness({
    buildAccessPolicy: (routePolicy, _user, project) => ({
      principal_id: routePolicy.principal_id || "unknown",
      allowed_roots: [project.root],
      allowed_toolsets: ["file", "weather", "x_search", "web"],
      connector_profiles: { base: { type: "profile" } },
    }),
    routeRunToolsets: ({ policy }) => ({
      policy: Object.assign({}, policy, {
        authorized_toolsets: ["file", "weather", "x_search", "web"],
        allowed_toolsets: ["file", "weather"],
        toolset_routing: {
          mode: "disabled",
          reason: "toolset_pruning_disabled",
          execution_mode: "deterministic_suggested",
          selected_toolsets: ["file", "weather"],
          suggested_toolsets: ["file", "weather"],
        },
      }),
      routing: { mode: "disabled", reason: "toolset_pruning_disabled" },
    }),
    selectRunToolsetsWithModel: async () => ({
      enabled: true,
      ok: false,
      reason: "selector_error",
      selectedToolsets: [],
      authorizedToolsets: ["file", "weather", "x_search", "web"],
      durationMs: 15000,
    }),
  });

  await service.startRunForThread(baseThread(), baseUserMessage(), baseAssistantMessage(), {});

  assert.deepEqual(calls.streams[0].body.access_policy_context.allowed_toolsets, ["file", "weather", "x_search", "web"]);
  assert.deepEqual(calls.streams[0].body.enabled_toolsets, ["file", "weather", "x_search", "web"]);
  assert.deepEqual(calls.events.map((event) => event.event), [
    "run.request_preparing",
    "run.context_ready",
    "run.gateway_selected",
    "run.toolset_selection_started",
    "run.toolset_selection_failed",
    "run.request_sent",
  ]);
  assert.equal(JSON.parse(calls.events[4].preview).reason, "selector_error");
}

async function testStartRunStopsBeforeExecutionWhenModelPermissionRequiresElevation() {
  const { calls, service } = makeHarness({
    buildAccessPolicy: (routePolicy, _user, project) => ({
      principal_id: routePolicy.principal_id || "unknown",
      access_mode: "restricted",
      allowed_roots: [project.root],
      allowed_toolsets: ["file", "weather", "x_search", "web"],
    }),
    selectRunToolsetsWithModel: async () => ({
      enabled: true,
      ok: false,
      reason: "permission_approval_required",
      elevationRequired: true,
      elevationScope: "owner_high_privilege",
      elevationReason: "outside current workspace",
      elevationSource: "model_toolset_permission_selector",
      durationMs: 3000,
    }),
  });
  const assistant = baseAssistantMessage();

  const result = await service.startRunForThread(baseThread(), baseUserMessage(), assistant, {});

  assert.equal(result.status, "needs_elevation");
  assert.equal(calls.streams.length, 0);
  assert.equal(assistant.status, "done");
  assert.equal(assistant.elevationRequired, true);
  assert.equal(assistant.elevationScope, "owner_high_privilege");
  assert.match(assistant.content, /Owner 授权/);
  assert.ok(calls.events.some((event) => event.event === "run.permission_required"));
}

function testBuildRunRequestRoutesPlainChatToMinimalToolsBeforeInstructions() {
  const { calls, service } = makeHarness();
  const request = service.buildRunRequest(
    baseThread(),
    baseUserMessage({ content: "plain chat" }),
    baseAssistantMessage(),
    {},
  );

  assert.deepEqual(request.runPolicy.allowed_toolsets, ["web", "search", "browser", "x_search", "http", "clarify"]);
  assert.deepEqual(request.toolsetRouting, { mode: "minimal", reason: "plain_chat_light_tools" });
  assert.deepEqual(calls.hermesInstructions[0].policy.allowed_toolsets, ["web", "search", "browser", "x_search", "http", "clarify"]);
  assert.equal(request.body.access_policy_context.toolset_routing.mode, "minimal");
}

function testBuildRunRequestOverridesPlainProbeHistoryToolIntent() {
  const { service } = makeHarness();
  const request = service.buildRunRequest(
    baseThread(),
    baseUserMessage({ content: "test" }),
    baseAssistantMessage(),
    {},
  );

  assert.match(request.body.instructions, /Latest-message override/);
  assert.match(request.body.instructions, /Do not infer a previous tool\/search intent/);
}

async function testStartRunUsesSelectedGatewayProviderFallback() {
  const { service } = makeHarness({
    chooseGatewayRunTarget: async () => ({
      apiBase: "http://worker.gateway",
      apiKey: "worker-key",
      name: "lowgw1",
      profile: "lowgw1",
      provider: "openai-codex",
      source: "worker_pool",
    }),
  });
  const assistant = baseAssistantMessage();

  await service.startRunForThread(baseThread(), baseUserMessage(), assistant, {});

  assert.equal(assistant.modelProvider, "openai-codex");
}

async function testChatGptProRunExtendsStreamWaits() {
  const { calls, service } = makeHarness();

  await service.startRunForThread(baseThread(), baseUserMessage(), baseAssistantMessage(), {
    requiredTool: "chatgpt_pro_generate",
    elevationScope: "chatgpt_pro_generate",
  });

  assert.equal(calls.streams.length, 1);
  assert.equal(calls.streams[0].options.runStartTimeoutMs, 30 * 60 * 1000);
  assert.equal(calls.streams[0].options.runLivenessCheckAfterMs, 30 * 60 * 1000);
  assert.equal(calls.streams[0].options.runLivenessStaleAfterMs, 0);
  assert.equal(calls.streams[0].options.modelFirstByteWarningMs, 30 * 60 * 1000);
}

async function testDeepSeekProviderFiltersForRealDeepSeekWorker() {
  const { calls, service } = makeHarness();
  const assistant = baseAssistantMessage();

  await service.startRunForThread(baseThread(), baseUserMessage(), assistant, {
    model: "deepseek-chat",
    provider: "deepseek",
  });

  assert.equal(calls.gatewayRouting[0].model, "deepseek-chat");
  assert.equal(calls.gatewayRouting[0].provider, "deepseek");
  assert.equal(calls.gatewayRouting[0].modelProvider, "deepseek");
  assert.equal(calls.streams[0].body.provider, "deepseek");
  assert.equal(assistant.modelProvider, "deepseek");
}

async function testConcurrencyErrorStopsBeforeGatewaySelection() {
  const err = new Error("limit");
  err.status = 429;
  const { calls, service } = makeHarness({
    assertRunConcurrencyCapacity: () => { throw err; },
  });

  await assert.rejects(
    () => service.startRunForThread(baseThread(), baseUserMessage(), baseAssistantMessage(), {}),
    /limit/,
  );
  assert.deepEqual(calls.gatewayRouting, []);
  assert.deepEqual(calls.streams, []);
}

function testMarkStartFailedUsesInjectedHooks() {
  const { calls, service } = makeHarness();
  const thread = baseThread({ status: "running" });
  const assistant = baseAssistantMessage({ runId: "web_failed_1", status: "running" });

  const result = service.markStartFailed(thread, assistant, new Error("gateway down"));

  assert.deepEqual(result, {
    status: "failed",
    runId: "web_failed_1",
    failedAt: "2026-05-15T01:02:03.000Z",
    error: "gateway down",
  });
  assert.equal(assistant.status, "failed");
  assert.equal(assistant.failedAt, "2026-05-15T01:02:03.000Z");
  assert.deepEqual(calls.removedRuns, [{ threadId: "thread_1", runId: "web_failed_1", idleStatus: "failed" }]);
  assert.equal(calls.saved, 1);
  assert.equal(calls.broadcasts[0].type, "run.failed");
}

(async () => {
  testPureWorkspaceHelpers();
  await testStartRunBuildsGatewayRequestAndMutatesStartState();
  await testStartRunPublishesRunIdBeforeRequestBuild();
  await testPluginTopicRequiresItsMcpToolsetForPolicyAndGatewayRouting();
  await testPluginTopicKeepsRequiredMcpWhenModelFirstNarrowsToolsets();
  testBuildRunRequestAddsGroupChatDeliveryRootsAndInstructionContext();
  await testStartRunPreservesSearchSourceRouting();
  await testOrdinaryRunUsesDefaultWebSearchBudgetWhenConfigured();
  await testStartRunProjectsGatewaySchedulerEventsBeforeSelection();
  await testStartRunUsesModelFirstSelectionBeforeExecution();
  await testModelFirstRoutingMetadataSurvivesPolicySanitizer();
  await testStartRunSkipsSelectorForForcedToolsetEscalationRetry();
  await testStartRunCanExecuteWardrobeMcpSelection();
  await testPermissionPreflightKeepsFullAuthorizedToolsetsWhenSelectionDisabled();
  await testPermissionPreflightFallbackRestoresFullAuthorizedToolsets();
  await testWardrobeSelectionKeepsVisionCompanionWhenSelectorNarrows();
  await testWardrobeSelectionKeepsFileWhenSelectorChoosesVisionOnly();
  await testWardrobeSelectionKeepsMcpStackWhenSelectorChoosesClarifyOnly();
  await testWebSelectionKeepsBrowserCompanionWhenSelectorNarrows();
  await testStartRunFallsBackWhenModelFirstSelectionFails();
  await testStartRunStopsBeforeExecutionWhenModelPermissionRequiresElevation();
  testBuildRunRequestRoutesPlainChatToMinimalToolsBeforeInstructions();
  testBuildRunRequestOverridesPlainProbeHistoryToolIntent();
  await testStartRunUsesSelectedGatewayProviderFallback();
  await testDeepSeekProviderFiltersForRealDeepSeekWorker();
  await testChatGptProRunExtendsStreamWaits();
  await testConcurrencyErrorStopsBeforeGatewaySelection();
  testMarkStartFailedUsesInjectedHooks();
  console.log("gateway-run-start-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
