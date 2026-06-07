"use strict";

const assert = require("node:assert/strict");
const { createMobileRuntimeGatewayContextFacadeService } = require("../adapters/mobile-runtime-gateway-context-facade-service");

function createDeps(overrides = {}) {
  const calls = [];
  const conversationHistoryService = {
    buildConversationHistory: (...args) => (calls.push(["buildConversationHistory", args]), [{ role: "user", content: "x" }]),
    compactConversationHistory: (...args) => (calls.push(["compactConversationHistory", args]), [{ role: "assistant", content: "y" }]),
    conversationHistoryContentForMessage: (...args) => (calls.push(["conversationHistoryContentForMessage", args]), "content"),
    deriveTitle: (...args) => (calls.push(["deriveTitle", args]), "title"),
    isStaleAudioToolAvailabilityClaim: (text) => /audio/i.test(text),
    isStaleDocxToolAvailabilityClaim: (text) => /docx/i.test(text),
    isStaleHttpToolAvailabilityClaim: (text) => /http/i.test(text),
    isStaleImageToolAvailabilityClaim: (text) => /image/i.test(text),
    isToolUnavailableClaimText: (text) => /missing/i.test(text),
    stripDirectoryAliasLinesForChatHistory: (text) => String(text || "").replace(/^Directory:.*/m, "").trim(),
  };
  const gatewayRunInstructionService = {
    buildHermesInstructions: (...args) => (calls.push(["buildHermesInstructions", args]), "instructions"),
    callableFunctionHintsForToolsets: (toolsets) => toolsets.map((toolset) => `hint:${toolset}`),
    currentToolSchemaOverrideInstructions: () => "override",
    formatAccessPolicyInstructionSummary: () => "policy-summary",
    gatewayConversationId: () => "conversation-id",
    policyHasToolset: (policy, toolset) => (policy.allowed_toolsets || []).includes(toolset),
  };
  const runtimeCompositionService = {
    extractCompletedOutput: () => "done",
    findRunTarget: () => ({ runId: "run_1" }),
    gatewayTargetForRun: () => ({ profile: "owner-low", name: "Owner Low", apiBase: "http://gateway" }),
  };
  const gatewayUsageTelemetry = () => ({
    supplementUsage(usage, target) {
      calls.push(["supplementUsage", usage, target]);
      return Object.assign({}, usage, { target });
    },
  });
  const deps = Object.assign({
    conversationHistoryService,
    gatewayRunInstructionService,
    getGatewayRuntimeCompositionService: () => runtimeCompositionService,
    gatewayUsageTelemetry,
  }, overrides);
  return { calls, deps };
}

function testDelegatesInstructionAndHistory() {
  const { calls, deps } = createDeps();
  const service = createMobileRuntimeGatewayContextFacadeService(deps);
  assert.deepEqual(service.buildConversationHistory({ id: "thread" }, "m1"), [{ role: "user", content: "x" }]);
  assert.equal(service.buildHermesInstructions({}, {}, null), "instructions");
  assert.deepEqual(service.callableFunctionHintsForToolsets(["file"]), ["hint:file"]);
  assert.equal(service.currentToolSchemaOverrideInstructions({}), "override");
  assert.equal(service.formatAccessPolicyInstructionSummary({}), "policy-summary");
  assert.equal(service.gatewayConversationId({}, {}, {}), "conversation-id");
  assert.deepEqual(calls.map((item) => item[0]).slice(0, 2), ["buildConversationHistory", "buildHermesInstructions"]);
}

function testOrdinaryToolSchemaElevationRequest() {
  const { deps } = createDeps();
  const service = createMobileRuntimeGatewayContextFacadeService(deps);
  assert.equal(service.isOrdinaryToolSchemaElevationRequest(
    { elevationRequired: true, elevationScope: "owner_high_privilege" },
    "image tool missing",
    { runOptions: { access_policy_context: { allowed_toolsets: ["image_gen"] } } },
  ), true);
  assert.equal(service.isOrdinaryToolSchemaElevationRequest(
    { elevationRequired: true, elevationScope: "owner_high_privilege" },
    "image tool missing",
    { runOptions: { access_policy_context: { allowed_toolsets: ["file"] } } },
  ), false);
  assert.equal(service.isOrdinaryToolSchemaElevationRequest({ elevationRequired: true, elevationScope: "shell" }, "image tool missing", {}), false);
}

function testSupplementGatewayUsage() {
  const { calls, deps } = createDeps();
  const service = createMobileRuntimeGatewayContextFacadeService(deps);
  const result = service.supplementGatewayUsage({ input_tokens: 1 }, "run_1", { runId: "resp_1" });
  assert.equal(result.target.responseId, "resp_1");
  assert.equal(result.target.runId, "run_1");
  assert.equal(result.target.gatewayName, "Owner Low");
  assert.equal(calls.at(-1)[0], "supplementUsage");
}

function testRequiredDependencyGuard() {
  assert.throws(
    () => createMobileRuntimeGatewayContextFacadeService(createDeps({ gatewayUsageTelemetry: null }).deps),
    /requires gatewayUsageTelemetry/,
  );
}

testDelegatesInstructionAndHistory();
testOrdinaryToolSchemaElevationRequest();
testSupplementGatewayUsage();
testRequiredDependencyGuard();
console.log("mobile-runtime-gateway-context-facade-service tests passed");
