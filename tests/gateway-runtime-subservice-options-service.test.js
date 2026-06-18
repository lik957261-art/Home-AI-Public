"use strict";

const assert = require("node:assert/strict");
const {
  createGatewayRuntimeSubserviceOptionsService,
} = require("../adapters/gateway-runtime-subservice-options-service");

function makeDeps(overrides = {}) {
  const deps = {
    accessPolicyHardeningOptionsForGatewayRouting: () => "hardening",
    activeStreams: new Map(),
    addThreadEvent: () => "event",
    appendBounded: () => "append",
    apiTimeoutMs: 1000,
    assertRunConcurrencyCapacity: () => "capacity",
    broadcast: () => "broadcast",
    buildAccessPolicy: () => "policy",
    buildConversationHistory: () => "history",
    buildHermesInstructions: () => "instructions",
    buildPluginCapabilityContext: () => "capability",
    chooseGatewayRunTarget: () => "target",
    compactFullContent: () => "full",
    compactMessage: () => "message",
    dedupe: (items) => items,
    directoryTopicIndexService: { id: "directory-topic-index" },
    effectiveProjectForThread: () => "project",
    ensureGroupChatSharedArtifactCopies: () => "copies",
    enqueueExternalDeliveryForTerminalMessage: () => "delivery",
    findWorkspace: () => "workspace",
    gatewayConversationId: () => "conversation",
    gatewayPool: () => "pool",
    gatewaySkillRoutingForWorkspace: () => "skill-routing",
    gatewayUrlForRun: () => "url",
    groupChatDeliveryRootForThread: () => "delivery-root",
    groupChatTaskGroupId: "group",
    isOrdinaryToolSchemaElevationRequest: () => false,
    loadRequiredSkillPreloads: () => "skills",
    logger: { info() {} },
    makePublicTaskId: () => "public-id",
    maxMessageChars: 100,
    mergeAccessPolicyOverride: () => "merged",
    mkdirSync: () => "mkdir",
    modelFirstByteWarningMs: 2000,
    modelPermissionApprovalRequest: () => "approval",
    notifyTaskTerminal: () => "notify",
    nowIso: () => "2026-06-08T00:00:00.000Z",
    nowMs: () => 123,
    projectForTaskDirectoryAttachment: () => "attachment-project",
    registerArtifactsFromText: () => "artifacts",
    routeRunToolsets: () => "route",
    runExplicitWebSearchMaxCalls: 2,
    runLivenessCheckAfterMs: 3000,
    runLivenessCheckIntervalMs: 4000,
    runLivenessStaleAfterMs: 5000,
    runStartTimeoutMs: 6000,
    runWebSearchMaxCalls: 3,
    sanitizePolicy: () => "sanitize",
    saveState: () => "save",
    selectRunToolsetsWithModel: () => "select",
    singleGatewayRunner: () => "runner",
    singleWindowProjectId: "single-window",
    state: () => ({ threads: [] }),
    streamingSaveThrottleMs: 7000,
    stripPermissionApprovalMarkers: () => "strip",
    supplementGatewayUsage: () => "usage",
    taskDirectoryAttachmentForMessage: () => "attachment",
    threadSummary: () => "summary",
    topicContextCompactionService: { id: "topic" },
    toolSchemaEpoch: "epoch",
    windowsPathToWsl: () => "wsl",
  };
  return Object.assign(deps, overrides);
}

function testQueueOptionsMapRuntimeDepsAndController() {
  const deps = makeDeps();
  const service = createGatewayRuntimeSubserviceOptionsService(deps);
  const lifecycleService = { id: "lifecycle" };
  const startRunForThread = () => "start";
  const options = service.queueServiceOptions({ lifecycleService, startRunForThread });

  assert.equal(options.gatewayRunLifecycleService, lifecycleService);
  assert.equal(options.startHermesRun, startRunForThread);
  assert.equal(options.nowIso, deps.nowIso);
  assert.equal(options.saveState, deps.saveState);
  assert.equal(options.broadcast, deps.broadcast);
  assert.equal(options.compactMessage, deps.compactMessage);
  assert.equal(options.threadSummary, deps.threadSummary);
}

function testStartOptionsMapGatewayStartDepsAndControllers() {
  const deps = makeDeps();
  const service = createGatewayRuntimeSubserviceOptionsService(deps);
  const controllers = {
    addThreadActiveRun: () => "add",
    removeThreadActiveRun: () => "remove",
    streamResponse: () => "stream",
  };
  const options = service.startServiceOptions(controllers);

  assert.equal(options.addThreadActiveRun, controllers.addThreadActiveRun);
  assert.equal(options.removeThreadActiveRun, controllers.removeThreadActiveRun);
  assert.equal(options.streamResponse, controllers.streamResponse);
  assert.equal(options.buildPluginCapabilityContext, deps.buildPluginCapabilityContext);
  assert.equal(options.loadRequiredSkillPreloads, deps.loadRequiredSkillPreloads);
  assert.equal(options.routeRunToolsets, deps.routeRunToolsets);
  assert.equal(options.selectRunToolsetsWithModel, deps.selectRunToolsetsWithModel);
  assert.equal(options.ensureGroupChatSharedArtifactCopies, deps.ensureGroupChatSharedArtifactCopies);
}

function testStreamOptionsMapRuntimeDepsControllersAndFallback() {
  const deps = makeDeps({ gatewayUrlForRun: undefined });
  const service = createGatewayRuntimeSubserviceOptionsService(deps);
  const lifecycleService = { livenessDecisionAfterCheck: () => "liveness" };
  const controllers = {
    applyHermesRunEvent: () => "event",
    lifecycleService,
    markRunCancelled: () => "cancel",
    markRunFailed: () => "fail",
  };
  const options = service.streamServiceOptions(controllers);

  assert.equal(options.livenessDecisionAfterCheck, lifecycleService.livenessDecisionAfterCheck);
  assert.equal(options.onHermesRunEvent, controllers.applyHermesRunEvent);
  assert.equal(options.markRunCancelled, controllers.markRunCancelled);
  assert.equal(options.markRunFailed, controllers.markRunFailed);
  assert.equal(options.gatewayPool, deps.gatewayPool);
  assert.equal(options.webSearchMaxCalls, deps.runWebSearchMaxCalls);
  assert.throws(() => options.gatewayUrlForRun(), /Missing gateway runtime dependency: gatewayUrlForRun/);
}

function testEventOptionsMapGatewayEventDepsAndControllers() {
  const deps = makeDeps();
  const service = createGatewayRuntimeSubserviceOptionsService(deps);
  const controllers = {
    removeThreadActiveRun: () => "remove",
    replaceThreadActiveRun: () => "replace",
    scheduleNextQueuedRunForTaskGroup: () => "schedule",
    startRunForThread: () => "start",
  };
  const options = service.eventServiceOptions(controllers);

  assert.equal(options.removeThreadActiveRun, controllers.removeThreadActiveRun);
  assert.equal(options.replaceThreadActiveRun, controllers.replaceThreadActiveRun);
  assert.equal(options.scheduleNextQueuedRunForTaskGroup, controllers.scheduleNextQueuedRunForTaskGroup);
  assert.equal(options.startToolsetEscalationRun, controllers.startRunForThread);
  assert.equal(options.notifyTaskTerminal, deps.notifyTaskTerminal);
  assert.equal(options.registerArtifactsFromText, deps.registerArtifactsFromText);
  assert.equal(options.topicContextCompactionService, deps.topicContextCompactionService);
  assert.equal(options.directoryTopicIndexService, deps.directoryTopicIndexService);
}

testQueueOptionsMapRuntimeDepsAndController();
testStartOptionsMapGatewayStartDepsAndControllers();
testStreamOptionsMapRuntimeDepsControllersAndFallback();
testEventOptionsMapGatewayEventDepsAndControllers();

console.log("gateway runtime subservice options service tests passed");
