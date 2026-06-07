"use strict";

const {
  resolveActorWorkspaceId: defaultResolveActorWorkspaceId,
} = require("./gateway-run-request-builder-service");

function maybeCall(fn, fallback) {
  return typeof fn === "function" ? fn : fallback;
}

function createGatewayRunStartPreparationService(options = {}) {
  const appendRequiredSkillPreloadEvents = maybeCall(options.appendRequiredSkillPreloadEvents, () => {});
  const appendRunStartEvent = maybeCall(options.appendRunStartEvent, () => {});
  const applyAssistantRunOptions = maybeCall(options.applyAssistantRunOptions, () => {});
  const applyPreparingRunState = maybeCall(options.applyPreparingRunState, () => {});
  const applyWardrobeWorkflowGateMetadata = maybeCall(options.applyWardrobeWorkflowGateMetadata, () => {});
  const assertRunConcurrencyCapacity = maybeCall(options.assertRunConcurrencyCapacity, () => {});
  const broadcastMessageUpdated = maybeCall(options.broadcastMessageUpdated, () => {});
  const buildRunRequest = maybeCall(options.buildRunRequest, () => ({}));
  const completeWardrobeWorkflowGateFailure = maybeCall(options.completeWardrobeWorkflowGateFailure, () => null);
  const evaluateWardrobeGate = maybeCall(options.evaluateWardrobeGate, () => ({}));
  const makePublicTaskId = maybeCall(options.makePublicTaskId, () => `web_${Date.now()}`);
  const nowIso = maybeCall(options.nowIso, () => new Date().toISOString());
  const resolveActorWorkspaceId = maybeCall(options.resolveActorWorkspaceId, defaultResolveActorWorkspaceId);
  const saveState = maybeCall(options.saveState, () => {});

  function prepareRunStart(args = {}) {
    const effectiveRunOptions = args.runOptions || {};
    const actorWorkspaceId = resolveActorWorkspaceId(args.thread, args.userMessage, effectiveRunOptions);
    assertRunConcurrencyCapacity(actorWorkspaceId);
    args.assistantMessage.actorWorkspaceId = actorWorkspaceId;

    const taskId = makePublicTaskId("web");
    applyPreparingRunState(args.thread, args.assistantMessage, taskId, nowIso());
    saveState(undefined, { reason: "run-gateway-selected", skipSqliteRuntimeReplace: true });
    broadcastMessageUpdated(args.thread, args.assistantMessage);
    appendRunStartEvent(args.thread, args.assistantMessage, "run.request_preparing", "正在准备上下文和选择 Gateway");

    const request = buildRunRequest(args.thread, args.userMessage, args.assistantMessage, effectiveRunOptions);
    const wardrobeGate = evaluateWardrobeGate(request, args.userMessage, "pre_gateway");
    applyAssistantRunOptions(args.assistantMessage, request, effectiveRunOptions);
    applyWardrobeWorkflowGateMetadata(args.assistantMessage, wardrobeGate);
    appendRequiredSkillPreloadEvents(args.thread, args.assistantMessage, request);

    if (wardrobeGate.active && !wardrobeGate.ok) {
      return {
        actorWorkspaceId,
        effectiveRunOptions,
        request,
        taskId,
        wardrobeGate,
        terminalResult: completeWardrobeWorkflowGateFailure(args.thread, args.assistantMessage, taskId, wardrobeGate),
      };
    }
    return { actorWorkspaceId, effectiveRunOptions, request, taskId, wardrobeGate };
  }

  return Object.freeze({
    prepareRunStart,
  });
}

module.exports = {
  createGatewayRunStartPreparationService,
};
