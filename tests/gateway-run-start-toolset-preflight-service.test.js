"use strict";

const assert = require("node:assert/strict");
const {
  createGatewayRunStartToolsetPreflightService,
} = require("../adapters/gateway-run-start-toolset-preflight-service");

function makeRequest(toolsets = ["file"]) {
  return {
    runPolicy: {
      allowed_toolsets: toolsets,
      authorized_toolsets: ["file", "weather", "web"],
    },
    body: {
      access_policy_context: {},
      enabled_toolsets: toolsets,
      instructions: "base",
    },
  };
}

function makeHarness(overrides = {}) {
  const calls = {
    assistantOptions: [],
    events: [],
    gates: [],
    permission: [],
    restored: [],
    selections: [],
  };
  const service = createGatewayRunStartToolsetPreflightService(Object.assign({
    appendRunStartEvent: (_thread, _assistant, event, preview) => calls.events.push({ event, preview }),
    appendToolsetEscalationInstructions: (request, selection, selectedToolsets) => {
      calls.selections.push({ reason: selection.reason, selectedToolsets });
      request.body.instructions = `${request.body.instructions}\nselected:${selectedToolsets.join(",")}`;
      return request;
    },
    applyAssistantRunOptions: (_assistant, request, runOptions) => calls.assistantOptions.push({
      enabledToolsets: request.body.enabled_toolsets,
      selected: runOptions.modelFirstToolsetSelection?.selectedToolsets || [],
    }),
    applyWardrobeWorkflowGateMetadata: (_assistant, gate) => calls.gates.push(gate),
    buildRunRequest: (_thread, _user, _assistant, runOptions) => makeRequest(runOptions.modelFirstToolsetSelection?.selectedToolsets || []),
    completeModelPermissionRequest: (args) => {
      calls.permission.push(args.selection);
      return { status: "needs_elevation", scope: args.selection.elevationScope };
    },
    evaluateWardrobeGate: (_request, _user, stage) => ({ ok: true, stage }),
    preflightResultEventName: (_selection, ok) => (ok ? "run.toolset_selection_done" : "run.toolset_selection_failed"),
    restoreAuthorizedToolsetsForSelectionFallback: (request, selection) => {
      calls.restored.push(selection.reason);
      request.body.enabled_toolsets = selection.authorizedToolsets || selection.authorized_toolsets || [];
      return request;
    },
    toolsetSelectionFallbackPreview: (selection) => JSON.stringify({ reason: selection.reason }),
    toolsetSelectionPreview: (selection, selectedToolsets) => JSON.stringify({ reason: selection.reason, selected_toolsets: selectedToolsets }),
    toolsetSelectionRouting: (_selection, selectedToolsets) => ({ mode: "selected", selected_toolsets: selectedToolsets }),
  }, overrides));
  return { calls, service };
}

async function testForcedSelectionMutatesRequestAndProjectsEvent() {
  const { calls, service } = makeHarness();
  const request = makeRequest(["file"]);

  const result = await service.applyModelFirstToolsetPreflight({
    request,
    effectiveRunOptions: {
      skipModelFirstToolsetSelection: true,
      modelFirstToolsetSelection: {
        reason: "manual",
        selectedToolsets: ["file"],
        authorizedToolsets: ["file", "web"],
      },
    },
    thread: {},
    assistantMessage: {},
    userMessage: {},
    gatewayTarget: {},
  });

  assert.equal(result.request, request);
  assert.deepEqual(request.toolsetRouting, { mode: "selected", selected_toolsets: ["file"] });
  assert.deepEqual(request.body.enabled_toolsets, ["file"]);
  assert.deepEqual(calls.events, [{
    event: "run.toolset_selection_done",
    preview: JSON.stringify({ reason: "manual", selected_toolsets: ["file"] }),
  }]);
  assert.deepEqual(calls.gates, [{ ok: true, stage: "forced_toolset_selection" }]);
  assert.deepEqual(calls.assistantOptions[0].selected, ["file"]);
}

async function testModelSelectionSuccessRebuildsRequestWithRouting() {
  const { calls, service } = makeHarness({
    selectRunToolsetsWithModel: async () => ({
      enabled: true,
      ok: true,
      reason: "selector_ok",
      selectedToolsets: ["weather"],
      authorizedToolsets: ["weather", "file"],
    }),
  });

  const result = await service.applyModelFirstToolsetPreflight({
    request: makeRequest(["file", "weather"]),
    effectiveRunOptions: {},
    thread: {},
    assistantMessage: {},
    userMessage: {},
    gatewayTarget: {},
    taskId: "task_1",
  });

  assert.deepEqual(result.request.body.enabled_toolsets, ["weather"]);
  assert.deepEqual(result.request.toolsetRouting, { mode: "selected", selected_toolsets: ["weather"] });
  assert.equal(calls.events[0].event, "run.toolset_selection_started");
  assert.equal(calls.events[1].event, "run.toolset_selection_done");
  assert.deepEqual(calls.gates, [{ ok: true, stage: "after_toolset_selection" }]);
  assert.deepEqual(calls.assistantOptions[0].selected, ["weather"]);
}

async function testSelectorFailureRestoresAuthorizedToolsets() {
  const { calls, service } = makeHarness({
    selectRunToolsetsWithModel: async () => {
      throw new Error("selector failed");
    },
  });
  const request = makeRequest(["file"]);

  const result = await service.applyModelFirstToolsetPreflight({
    request,
    effectiveRunOptions: {},
    thread: {},
    assistantMessage: {},
    userMessage: {},
    gatewayTarget: {},
  });

  assert.equal(result.request, request);
  assert.deepEqual(request.body.enabled_toolsets, []);
  assert.deepEqual(calls.restored, ["selector_exception"]);
  assert.equal(calls.events[1].event, "run.toolset_selection_failed");
  assert.match(calls.events[1].preview, /selector_exception/);
  assert.deepEqual(calls.gates, [{ ok: true, stage: "after_toolset_fallback" }]);
}

async function testPermissionElevationReturnsTerminalResult() {
  const { calls, service } = makeHarness({
    selectRunToolsetsWithModel: async () => ({
      enabled: true,
      elevationRequired: true,
      elevationScope: "owner_high_privilege",
      reason: "permission_approval_required",
    }),
  });

  const result = await service.applyModelFirstToolsetPreflight({
    request: makeRequest(["file"]),
    effectiveRunOptions: {},
    thread: {},
    assistantMessage: {},
    userMessage: {},
    gatewayTarget: { name: "lowgw" },
    gatewayUrl: "http://gateway",
    taskId: "task_1",
  });

  assert.deepEqual(result.terminalResult, {
    status: "needs_elevation",
    scope: "owner_high_privilege",
  });
  assert.equal(calls.permission.length, 1);
  assert.equal(calls.events[0].event, "run.toolset_selection_started");
}

Promise.resolve()
  .then(testForcedSelectionMutatesRequestAndProjectsEvent)
  .then(testModelSelectionSuccessRebuildsRequestWithRouting)
  .then(testSelectorFailureRestoresAuthorizedToolsets)
  .then(testPermissionElevationReturnsTerminalResult)
  .then(() => console.log("gateway run-start toolset preflight service tests passed"));
