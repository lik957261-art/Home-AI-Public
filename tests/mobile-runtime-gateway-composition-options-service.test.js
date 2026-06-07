"use strict";

const assert = require("node:assert/strict");
const {
  createMobileRuntimeGatewayCompositionOptionsService,
} = require("../adapters/mobile-runtime-gateway-composition-options-service");

function createService(overrides = {}) {
  const calls = [];
  const service = createMobileRuntimeGatewayCompositionOptionsService({
    constants: () => Object.assign({
      apiTimeoutMs: 1000,
      contextCompactionEnabled: true,
      gatewayModelPreflightEnabled: true,
      groupChatTaskGroupId: "group-chat",
      maxMessageChars: 999,
      modelFirstByteWarningMs: 2000,
      runExplicitWebSearchMaxCalls: 2,
      runLivenessCheckAfterMs: 3000,
      runLivenessCheckIntervalMs: 4000,
      runLivenessStaleAfterMs: 5000,
      runStartTimeoutMs: 6000,
      runWebSearchMaxCalls: 3,
      singleWindowProjectId: "single-window",
      streamingSaveThrottleMs: 7000,
      toolSchemaEpoch: "epoch-1",
    }, overrides.constants || {}),
    delegates: () => Object.assign({
      accessPolicyHardeningOptionsForGatewayRouting: () => "hardening",
      addThreadEvent: () => "event",
      appendBounded: () => "append",
      assertRunConcurrencyCapacity: () => "capacity",
      buildAccessPolicy: () => "policy",
      buildConversationHistory: () => "history",
      buildHermesInstructions: () => "instructions",
      broadcast: () => "broadcast",
      chooseGatewayRunTarget: () => "target",
      compactFullContent: () => "full",
      compactMessage: () => "message",
      dedupe: (items) => [...new Set(items)],
      effectiveProjectForThread: () => "project",
      ensureGroupChatSharedArtifactCopies: () => "copies",
      enqueueExternalDeliveryForTerminalMessage: () => "delivery",
      findWorkspace: () => "workspace",
      gatewayConversationId: () => "conversation",
      gatewayPool: () => "pool",
      gatewaySkillRoutingForWorkspace: () => "skill-routing",
      groupChatDeliveryRootForThread: () => "delivery-root",
      isOrdinaryToolSchemaElevationRequest: () => false,
      makePublicTaskId: () => "public-task",
      mergeAccessPolicyOverride: () => "merge-policy",
      modelPermissionApprovalRequest: () => "approval",
      nowIso: () => "2026-06-08T00:00:00.000Z",
      nowMs: () => 123,
      registerArtifactsFromText: () => "artifacts",
      releaseGatewayRunTarget: () => "release",
      replaceGatewayRunTarget: () => "replace",
      sanitizePolicy: () => "sanitize",
      saveState: () => "save",
      singleGatewayRunner: () => "runner",
      stripPermissionApprovalMarkers: () => "strip",
      supplementGatewayUsage: () => "usage",
      threadSummary: () => "summary",
      windowsPathToWsl: () => "wsl",
    }, overrides.delegates || {}),
    runtime: () => Object.assign({
      activeStreams: new Map([["run-1", {}]]),
      fs: {
        mkdirSync: (...args) => calls.push(["mkdir", ...args]),
      },
      logger: { info() {} },
      state: () => ({ threads: [] }),
    }, overrides.runtime || {}),
    services: () => Object.assign({
      gatewayRunModelToolsetSelectionService: {
        selectToolsetsForRun: (...args) => ({ selected: args }),
      },
      gatewayRunToolsetRoutingService: {
        routePolicy: (...args) => ({ routed: args }),
      },
      getRuntimeStateThreadService: () => ({
        storedGatewayUrlForRun: (...args) => ({ gatewayUrl: args }),
      }),
      getSemanticDirectoryAttachmentService: () => ({
        projectForTaskDirectoryAttachment: (...args) => ({ project: args }),
        taskDirectoryAttachmentForMessage: (...args) => ({ attachment: args }),
      }),
      pluginCapabilityActivationService: {
        buildRunPluginCapabilityContext: (...args) => ({ capability: args }),
      },
      pluginRequiredSkillPreloadService: {
        preloadRequiredSkills: (...args) => ({ preloads: args }),
      },
      topicContextCompactionService: { id: "topic-context" },
      webPushDeliveryService: {
        notifyTaskTerminal: (...args) => ({ notification: args }),
      },
    }, overrides.services || {}),
  });
  return { calls, service };
}

function testBuildsGatewayRuntimeCompositionOptions() {
  const { calls, service } = createService();
  const options = service.gatewayRuntimeCompositionOptions();

  assert.equal(options.apiTimeoutMs, 1000);
  assert.equal(options.groupChatTaskGroupId, "group-chat");
  assert.equal(options.singleWindowProjectId, "single-window");
  assert.deepEqual(options.buildPluginCapabilityContext("wardrobe"), { capability: ["wardrobe"] });
  assert.deepEqual(options.loadRequiredSkillPreloads("thread-1"), { preloads: ["thread-1"] });
  assert.deepEqual(options.gatewayUrlForRun("run-1"), { gatewayUrl: ["run-1"] });
  assert.deepEqual(options.projectForTaskDirectoryAttachment("msg-1"), { project: ["msg-1"] });
  assert.deepEqual(options.taskDirectoryAttachmentForMessage("msg-2"), { attachment: ["msg-2"] });
  assert.deepEqual(options.routeRunToolsets("policy"), { routed: ["policy"] });
  assert.deepEqual(options.notifyTaskTerminal("run-1"), { notification: ["run-1"] });
  assert.deepEqual(options.selectRunToolsetsWithModel("run-1"), { selected: ["run-1"] });
  assert.deepEqual(options.topicContextCompactionService, { id: "topic-context" });

  options.mkdirSync("C:/tmp", { recursive: true });
  assert.deepEqual(calls, [["mkdir", "C:/tmp", { recursive: true }]]);
}

function testSelectorAndCompactionCanBeDisabled() {
  const { service } = createService({
    constants: {
      contextCompactionEnabled: false,
      gatewayModelPreflightEnabled: false,
    },
  });
  const options = service.gatewayRuntimeCompositionOptions();

  assert.equal(options.selectRunToolsetsWithModel, null);
  assert.equal(options.topicContextCompactionService, null);
}

function testReadsStableConstantsFromRuntimeEnv() {
  const { service } = createService({
    constants: {
      apiTimeoutMs: undefined,
      contextCompactionEnabled: undefined,
      groupChatTaskGroupId: undefined,
      maxMessageChars: undefined,
      modelFirstByteWarningMs: undefined,
      runExplicitWebSearchMaxCalls: undefined,
      runLivenessCheckAfterMs: undefined,
      runLivenessCheckIntervalMs: undefined,
      runLivenessStaleAfterMs: undefined,
      runStartTimeoutMs: undefined,
      runWebSearchMaxCalls: undefined,
      singleWindowProjectId: undefined,
      streamingSaveThrottleMs: undefined,
      runtimeEnv: {
        CONTEXT_COMPACTION_ENABLED: false,
        HERMES_API_TIMEOUT_MS: 11,
        MAX_MESSAGE_CHARS: 22,
        RUN_EXPLICIT_WEB_SEARCH_MAX_CALLS: 33,
        RUN_LIVENESS_CHECK_AFTER_MS: 44,
        RUN_LIVENESS_CHECK_INTERVAL_MS: 55,
        RUN_LIVENESS_STALE_AFTER_MS: 66,
        RUN_MODEL_FIRST_BYTE_WARNING_MS: 77,
        RUN_START_TIMEOUT_MS: 88,
        RUN_STREAMING_SAVE_THROTTLE_MS: 99,
        RUN_WEB_SEARCH_MAX_CALLS: 111,
        SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID: "group-from-env",
        SINGLE_WINDOW_PROJECT_ID: "project-from-env",
      },
    },
  });
  const options = service.gatewayRuntimeCompositionOptions();

  assert.equal(options.apiTimeoutMs, 11);
  assert.equal(options.maxMessageChars, 22);
  assert.equal(options.runExplicitWebSearchMaxCalls, 33);
  assert.equal(options.runLivenessCheckAfterMs, 44);
  assert.equal(options.runLivenessCheckIntervalMs, 55);
  assert.equal(options.runLivenessStaleAfterMs, 66);
  assert.equal(options.modelFirstByteWarningMs, 77);
  assert.equal(options.runStartTimeoutMs, 88);
  assert.equal(options.streamingSaveThrottleMs, 99);
  assert.equal(options.runWebSearchMaxCalls, 111);
  assert.equal(options.groupChatTaskGroupId, "group-from-env");
  assert.equal(options.singleWindowProjectId, "project-from-env");
  assert.equal(options.topicContextCompactionService, null);
}

function testMissingDependenciesFailClosed() {
  const { service } = createService({
    services: {
      webPushDeliveryService: null,
    },
  });

  assert.throws(
    () => service.gatewayRuntimeCompositionOptions(),
    /requires webPushDeliveryService/,
  );
}

testBuildsGatewayRuntimeCompositionOptions();
testSelectorAndCompactionCanBeDisabled();
testReadsStableConstantsFromRuntimeEnv();
testMissingDependenciesFailClosed();

console.log("mobile runtime gateway composition options service tests passed");
