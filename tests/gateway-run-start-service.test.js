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
  assert.equal(assistant.runOptions.toolSchemaEpoch, "epoch-test");
  assert.equal(assistant.runOptions.access_policy_context.connector_profiles.extra.type, "profile");
  assert.equal(thread.status, "running");
  assert.deepEqual(thread.activeRunIds, ["web_test_1"]);
  assert.equal(calls.saved, 1);
  assert.equal(calls.broadcasts[0].type, "message.updated");
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
  const { calls, service } = makeHarness();
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
  assert.deepEqual(calls.streams[0].body.access_policy_context.allowed_toolsets, ["file", "x_search", "web", "search"]);
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
  testBuildRunRequestAddsGroupChatDeliveryRootsAndInstructionContext();
  await testStartRunPreservesSearchSourceRouting();
  await testStartRunUsesSelectedGatewayProviderFallback();
  await testConcurrencyErrorStopsBeforeGatewaySelection();
  testMarkStartFailedUsesInjectedHooks();
  console.log("gateway-run-start-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
