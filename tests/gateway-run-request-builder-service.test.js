"use strict";

const assert = require("node:assert/strict");
const {
  createGatewayRunRequestBuilderService,
  policyThreadForRun,
  resolveActorWorkspaceId,
} = require("../adapters/gateway-run-request-builder-service");

function createBuilder(overrides = {}) {
  const calls = { mkdirs: [], preloadPayloads: [] };
  const service = createGatewayRunRequestBuilderService(Object.assign({
    singleWindowProjectId: "single-window-project",
    groupChatTaskGroupId: "group-chat",
    toolSchemaEpoch: "epoch-test",
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
    groupChatDeliveryRootForThread: () => "C:\\Hermes\\group",
    windowsPathToWsl: (value) => value.replace(/^C:\\/i, "/mnt/c/").replace(/\\/g, "/"),
    ensureGroupChatSharedArtifactCopies: () => [{ file: "receipt.md" }],
    mkdirSync: (target, options) => calls.mkdirs.push({ target, options }),
    gatewayConversationId: (thread, userMessage, policy) => `${thread.hermesSessionId}:${userMessage.id}:${(policy.allowed_toolsets || []).join(",")}`,
    buildConversationHistory: (thread, latestUserMessageId) => [{ threadId: thread.id, latestUserMessageId }],
    buildHermesInstructions: (thread, policy, project, latestText, taskDirectory, buildOptions) => JSON.stringify({
      workspaceId: thread.workspaceId,
      toolsets: policy.allowed_toolsets,
      projectId: project.id,
      latestText,
      taskDirectory,
      pluginTopicContext: buildOptions.pluginTopicContext,
      pluginCapabilityContext: buildOptions.pluginCapabilityContext,
      requiredSkillPreloads: buildOptions.requiredSkillPreloads,
      groupChatDeliveryRoot: buildOptions.groupChatDeliveryRoot,
    }),
    loadRequiredSkillPreloads: (payload) => {
      calls.preloadPayloads.push(payload);
      throw new Error("profile unreadable");
    },
    buildPluginCapabilityContext: ({ policy, requiredPluginToolsets }) => ({
      policy: Object.assign({}, policy, {
        active_schema_set: { active_toolsets: requiredPluginToolsets },
      }),
      context: {
        activeSchemaSet: { active_toolsets: requiredPluginToolsets },
        catalog: { count: requiredPluginToolsets.length },
        probeRequests: requiredPluginToolsets.map((toolset) => ({ pluginId: "wardrobe", toolset })),
      },
      routing: { mode: "plugin", reason: "required_plugin_toolsets" },
    }),
    routeRunToolsets: ({ policy }) => ({
      policy: Object.assign({}, policy, {
        allowed_toolsets: [...(policy.allowed_toolsets || []), "vision"],
      }),
      routing: { mode: "compatible", reason: "test" },
    }),
    gatewaySkillRoutingForWorkspace: (workspaceId) => ({ skillWorkspaceId: workspaceId }),
  }, overrides));
  return { calls, service };
}

function baseThread(overrides = {}) {
  return Object.assign({
    id: "thread_1",
    workspaceId: "workspace_a",
    projectId: "project_a",
    hermesSessionId: "session_1",
    singleWindow: false,
  }, overrides);
}

function baseUser(overrides = {}) {
  return Object.assign({
    id: "user_1",
    content: "test",
    senderWorkspaceId: "workspace_sender",
    taskGroupId: "plugin:wardrobe",
  }, overrides);
}

function testWorkspaceHelpersStayStable() {
  assert.equal(resolveActorWorkspaceId({ workspaceId: "thread_ws" }, { senderWorkspaceId: "sender_ws" }, {}), "sender_ws");
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

function testBuildRunRequestAddsPluginRequirementsAndRouting() {
  const { calls, service } = createBuilder();
  const request = service.buildRunRequest(baseThread(), baseUser(), { id: "assistant_1" }, {
    actorWorkspaceId: "owner",
    gatewayRouting: { maintenance: true },
    model: "gpt-test",
    provider: "openai-codex",
    reasoning_effort: "medium",
    instructions: "extra instruction",
    access_policy_context: { allowed_toolsets: ["http"] },
  });

  assert.equal(request.actorWorkspaceId, "owner");
  assert.deepEqual(request.pluginTopicContext.requiredToolsets, ["wardrobe", "vision", "file", "skills"]);
  assert.deepEqual(request.requiredSkillPreloads, [{
    path: "productivity/wardrobe-style-operations",
    id: "wardrobe-style-operations",
    missing: true,
    error: "profile unreadable",
  }]);
  assert.deepEqual(calls.preloadPayloads[0].skills, ["productivity/wardrobe-style-operations"]);
  for (const toolset of ["wardrobe", "vision", "file", "skills"]) {
    assert.ok(request.body.enabled_toolsets.includes(toolset), `missing ${toolset}`);
  }
  assert.equal(request.body.model, "gpt-test");
  assert.equal(request.body.provider, "openai-codex");
  assert.equal(request.body.reasoning_effort, "medium");
  assert.match(request.body.instructions, /Latest-message override/);
  assert.match(request.body.instructions, /extra instruction/);
  assert.deepEqual(request.gatewayRouting.requiredToolsets, ["wardrobe", "vision", "file", "skills"]);
  assert.deepEqual(request.gatewayRouting.requiredSkills, ["productivity/wardrobe-style-operations"]);
  assert.equal(request.gatewayRouting.skillWorkspaceId, "owner");
  assert.deepEqual(request.toolsetRouting, { mode: "plugin", reason: "required_plugin_toolsets" });
}

function testBuildGroupChatRunContextMergesDeliveryRoots() {
  const { calls, service } = createBuilder();
  const context = service.buildGroupChatRunContext(
    baseThread({ singleWindow: true }),
    baseUser({ taskGroupId: "group-chat" }),
    { allowed_roots: ["/workspace/a"], delivery_roots: [], cache_roots: [] },
  );

  assert.equal(context.groupChatDeliveryRoot, "C:\\Hermes\\group");
  assert.equal(context.groupChatDeliveryRootForModel, "/mnt/c/Hermes/group");
  assert.deepEqual(context.groupChatAttachmentCopies, [{ file: "receipt.md" }]);
  assert.deepEqual(context.policy.allowed_roots, ["/workspace/a", "/mnt/c/Hermes/group", "C:\\Hermes\\group"]);
  assert.deepEqual(calls.mkdirs, [{ target: "C:\\Hermes\\group", options: { recursive: true } }]);
}

testWorkspaceHelpersStayStable();
testBuildRunRequestAddsPluginRequirementsAndRouting();
testBuildGroupChatRunContextMergesDeliveryRoots();

console.log("gateway run request builder service tests passed");
