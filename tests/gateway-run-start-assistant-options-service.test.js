"use strict";

const assert = require("node:assert/strict");
const {
  createGatewayRunStartAssistantOptionsService,
} = require("../adapters/gateway-run-start-assistant-options-service");

function testApplyAssistantRunOptionsProjectsRequestMetadata() {
  const service = createGatewayRunStartAssistantOptionsService({ toolSchemaEpoch: "epoch-test" });
  const assistant = {
    id: "assistant_1",
    runOptions: { existing: true },
    loadedSkills: [{ path: "existing/skill", id: "skill", label: "skill", namespace: "existing" }],
  };

  service.applyAssistantRunOptions(assistant, {
    runPolicy: { allowed_toolsets: ["file", "web"] },
    body: { conversation: "conversation_1" },
    requiredSkillPreloads: [{
      path: "productivity/wardrobe-style-operations",
      namespace: "productivity",
      profileId: "owner-full",
      loadedChars: 120,
      totalChars: 180,
      truncated: true,
    }],
    pluginCapabilityContext: {
      activeSchemaSet: { active_toolsets: ["wardrobe"] },
      catalog: [{ pluginId: "wardrobe", capabilityId: "style" }],
      probeResults: [{ toolset: "wardrobe", available: true }],
    },
    toolsetRouting: { mode: "model_first", reason: "selected" },
  }, {
    searchSource: " x_search ",
    sourceIntent: " web ",
    sourceMode: " live ",
  });

  assert.equal(assistant.runOptions.existing, true);
  assert.deepEqual(assistant.runOptions.access_policy_context, { allowed_toolsets: ["file", "web"] });
  assert.equal(assistant.runOptions.gatewayConversation, "conversation_1");
  assert.equal(assistant.runOptions.toolSchemaEpoch, "epoch-test");
  assert.deepEqual(assistant.runOptions.requiredSkillPreloads, [{
    path: "productivity/wardrobe-style-operations",
    id: "wardrobe-style-operations",
    namespace: "productivity",
    profileId: "owner-full",
    loadedChars: 120,
    totalChars: 180,
    truncated: true,
    missing: false,
    error: "",
    source: "required_preload",
  }]);
  assert.deepEqual(assistant.loadedSkills.map((item) => item.path), [
    "existing/skill",
    "productivity/wardrobe-style-operations",
  ]);
  assert.deepEqual(assistant.runOptions.activeSchemaSet, { active_toolsets: ["wardrobe"] });
  assert.deepEqual(assistant.runOptions.pluginCapabilityCatalog, [{ pluginId: "wardrobe", capabilityId: "style" }]);
  assert.deepEqual(assistant.runOptions.pluginCapabilityProbeResults, [{ toolset: "wardrobe", available: true }]);
  assert.deepEqual(assistant.runOptions.toolsetRouting, { mode: "model_first", reason: "selected" });
  assert.equal(assistant.runOptions.searchSource, "x_search");
  assert.equal(assistant.runOptions.sourceIntent, "web");
  assert.equal(assistant.runOptions.sourceMode, "live");
}

function testApplyAssistantRunOptionsKeepsMissingSkillOutOfLoadedSkills() {
  const service = createGatewayRunStartAssistantOptionsService({ toolSchemaEpoch: "epoch-test" });
  const assistant = { id: "assistant_1" };

  service.applyAssistantRunOptions(assistant, {
    runPolicy: {},
    body: { conversation: "conversation_1" },
    requiredSkillPreloads: [{
      path: "productivity/missing-skill",
      missing: true,
      error: "cannot read",
    }],
  });

  assert.deepEqual(assistant.runOptions.requiredSkillPreloads, [{
    path: "productivity/missing-skill",
    id: "missing-skill",
    namespace: "",
    profileId: "",
    loadedChars: 0,
    totalChars: 0,
    truncated: false,
    missing: true,
    error: "cannot read",
    source: "required_preload",
  }]);
  assert.deepEqual(assistant.loadedSkills, []);
}

function testApplyWardrobeWorkflowGateMetadataOnlyForActiveGate() {
  const service = createGatewayRunStartAssistantOptionsService({ toolSchemaEpoch: "epoch-test" });
  const assistant = { id: "assistant_1", runOptions: { existing: true } };

  service.applyWardrobeWorkflowGateMetadata(assistant, { active: false, runOptionsMetadata: { ok: false } });
  assert.deepEqual(assistant.runOptions, { existing: true });

  service.applyWardrobeWorkflowGateMetadata(assistant, {
    active: true,
    runOptionsMetadata: { ok: true, workflow: "outfit" },
  });

  assert.deepEqual(assistant.runOptions, {
    existing: true,
    wardrobeOutfitWorkflowGate: { ok: true, workflow: "outfit" },
  });
}

testApplyAssistantRunOptionsProjectsRequestMetadata();
testApplyAssistantRunOptionsKeepsMissingSkillOutOfLoadedSkills();
testApplyWardrobeWorkflowGateMetadataOnlyForActiveGate();

console.log("gateway run-start assistant options service tests passed");
