"use strict";

const assert = require("node:assert/strict");
const { createPluginCapabilityActivationService } = require("../adapters/plugin-capability-activation-service");

function createService() {
  return createPluginCapabilityActivationService({
    dedupe: (values) => Array.from(new Set((values || []).filter(Boolean))),
  });
}

function basePolicy(overrides = {}) {
  return Object.assign({
    allowed_toolsets: ["file", "web", "wardrobe", "vision", "skills", "finance", "note"],
    authorized_toolsets: ["file", "web", "wardrobe", "vision", "skills", "finance", "note"],
    toolset_routing: {
      mode: "disabled",
      reason: "toolset_pruning_disabled",
      selected_toolsets: ["file", "web", "wardrobe", "vision", "skills", "finance", "note"],
      suggested_toolsets: ["web"],
      suggested_mode: "minimal",
      suggested_reason: "plain_chat_light_tools",
    },
  }, overrides);
}

function catalogByPlugin(context) {
  return Object.fromEntries((context.catalog || []).map((entry) => [entry.pluginId, entry]));
}

function testOrdinaryChatKeepsAuthorizedPluginCatalogButDoesNotActivatePluginMcps() {
  const service = createService();
  const result = service.buildRunPluginCapabilityContext({
    policy: basePolicy(),
    userMessage: { content: "test" },
  });

  assert.deepEqual(result.policy.authorized_toolsets, ["file", "web", "wardrobe", "vision", "skills", "finance", "note"]);
  assert.deepEqual(result.policy.allowed_toolsets, ["file", "web", "vision", "skills"]);
  assert.deepEqual(result.context.activeSchemaSet.active_plugin_toolsets, []);
  assert.deepEqual(result.context.omittedPluginToolsets, ["wardrobe", "finance", "note"]);
  const catalog = catalogByPlugin(result.context);
  assert.equal(catalog.wardrobe.status, "catalog_only");
  assert.equal(catalog.finance.status, "catalog_only");
  assert.equal(catalog.note.status, "catalog_only");
}

function testPluginTopicForcesCurrentPluginAndLeavesOtherPluginsCatalogOnly() {
  const service = createService();
  const result = service.buildRunPluginCapabilityContext({
    policy: basePolicy(),
    userMessage: { content: "Style these items", taskGroupId: "plugin:wardrobe" },
    pluginTopicContext: {
      pluginId: "wardrobe",
      requiredToolsets: ["wardrobe", "vision", "file", "skills"],
      requiredSkills: ["productivity/wardrobe-style-operations"],
    },
    requiredPluginToolsets: ["wardrobe", "vision", "file", "skills"],
    requiredPluginSkills: ["productivity/wardrobe-style-operations"],
  });

  assert.deepEqual(result.policy.allowed_toolsets, ["file", "web", "wardrobe", "vision", "skills"]);
  assert.deepEqual(result.policy.required_toolsets, ["wardrobe", "vision", "file", "skills"]);
  assert.deepEqual(result.policy.required_skills, ["productivity/wardrobe-style-operations"]);
  assert.deepEqual(result.context.activeSchemaSet.active_plugin_toolsets, ["wardrobe"]);
  assert.deepEqual(result.context.omittedPluginToolsets, ["finance", "note"]);
  const catalog = catalogByPlugin(result.context);
  assert.equal(catalog.wardrobe.status, "active");
  assert.equal(catalog.finance.status, "catalog_only");
  assert.equal(catalog.note.status, "catalog_only");
}

function testLatestTextCanDeterministicallyActivateFinancePlugin() {
  const service = createService();
  const result = service.buildRunPluginCapabilityContext({
    policy: basePolicy(),
    userMessage: { content: "\u67e5\u4e00\u4e0b\u8fd9\u4e2a\u6708\u6d88\u8d39" },
  });

  assert.deepEqual(result.policy.allowed_toolsets, ["file", "web", "vision", "skills", "finance"]);
  assert.deepEqual(result.context.activeSchemaSet.active_plugin_toolsets, ["finance"]);
  assert.deepEqual(result.context.probeRequests.map((item) => item.pluginId), ["finance"]);
  assert.deepEqual(result.context.omittedPluginToolsets, ["wardrobe", "note"]);
  assert.equal(catalogByPlugin(result.context).finance.status, "active");
}

function testForcedEscalationRetryActivatesSelectedPluginToolset() {
  const service = createService();
  const result = service.buildRunPluginCapabilityContext({
    policy: basePolicy({
      allowed_toolsets: ["finance"],
      authorized_toolsets: ["file", "web", "wardrobe", "vision", "skills", "finance", "note"],
    }),
    userMessage: { content: "retry" },
    runOptions: {
      modelFirstToolsetSelection: {
        selectedToolsets: ["finance"],
      },
    },
  });

  assert.deepEqual(result.policy.allowed_toolsets, ["finance"]);
  assert.deepEqual(result.context.activeSchemaSet.active_plugin_toolsets, ["finance"]);
  assert.deepEqual(result.context.omittedPluginToolsets, ["wardrobe", "note"]);
}

function testFailedProbeResultRemovesOptionalPluginFromActiveSchema() {
  const service = createService();
  const result = service.buildRunPluginCapabilityContext({
    policy: basePolicy(),
    userMessage: { content: "\u67e5\u4e00\u4e0b\u8fd9\u4e2a\u6708\u6d88\u8d39" },
    runOptions: {
      pluginCapabilityProbeResults: [{
        pluginId: "finance",
        toolset: "finance",
        ok: false,
        diagnostic: "gateway_worker_missing_toolset",
        evidence: "gateway_worker_manifest_toolsets",
      }],
    },
  });

  assert.deepEqual(result.policy.allowed_toolsets, ["file", "web", "vision", "skills"]);
  assert.deepEqual(result.context.activeSchemaSet.active_plugin_toolsets, []);
  assert.deepEqual(result.context.activeSchemaSet.unavailable_plugin_ids, ["finance"]);
  assert.deepEqual(result.context.probeRequests, []);
  const catalog = catalogByPlugin(result.context);
  assert.equal(catalog.finance.status, "unavailable");
  assert.equal(catalog.finance.availability, "unavailable");
  assert.equal(catalog.finance.diagnostic, "gateway_worker_missing_toolset");
}

function testSuccessfulProbeResultKeepsOptionalPluginActiveWithEvidence() {
  const service = createService();
  const result = service.buildRunPluginCapabilityContext({
    policy: basePolicy(),
    userMessage: { content: "\u67e5\u4e00\u4e0b\u8fd9\u4e2a\u6708\u6d88\u8d39" },
    runOptions: {
      pluginCapabilityProbeResults: [{
        pluginId: "finance",
        toolset: "finance",
        ok: true,
        diagnostic: "gateway_worker_declares_toolset",
        evidence: "gateway_worker_manifest_toolsets",
      }],
    },
  });

  assert.deepEqual(result.policy.allowed_toolsets, ["file", "web", "vision", "skills", "finance"]);
  assert.deepEqual(result.context.activeSchemaSet.active_plugin_toolsets, ["finance"]);
  assert.deepEqual(result.context.probeRequests, []);
  const catalog = catalogByPlugin(result.context);
  assert.equal(catalog.finance.status, "active");
  assert.equal(catalog.finance.activationEvidence, "gateway_worker_manifest_toolsets");
}

testOrdinaryChatKeepsAuthorizedPluginCatalogButDoesNotActivatePluginMcps();
testPluginTopicForcesCurrentPluginAndLeavesOtherPluginsCatalogOnly();
testLatestTextCanDeterministicallyActivateFinancePlugin();
testForcedEscalationRetryActivatesSelectedPluginToolset();
testFailedProbeResultRemovesOptionalPluginFromActiveSchema();
testSuccessfulProbeResultKeepsOptionalPluginActiveWithEvidence();

console.log("plugin capability activation service tests passed");
