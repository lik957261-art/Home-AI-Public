"use strict";

const assert = require("node:assert/strict");
const {
  pluginTopicContextForTaskGroup,
  pluginToolsetsForTaskGroup,
  policyAuthorizesPluginTopic,
  resolvePluginTopicRunRequirements,
} = require("../adapters/plugin-topic-run-requirements-service");

function testKnownPluginTopicContexts() {
  assert.deepEqual(pluginToolsetsForTaskGroup("plugin:health"), ["health"]);
  assert.deepEqual(pluginToolsetsForTaskGroup("plugin:wardrobe"), ["wardrobe", "vision", "file", "skills"]);
  assert.equal(pluginTopicContextForTaskGroup("general"), null);
}

function testAuthorizedPluginTopicPreservesRequirements() {
  const context = pluginTopicContextForTaskGroup("plugin:wardrobe");
  const result = resolvePluginTopicRunRequirements({
    allowed_toolsets: ["file", "web"],
    authorized_toolsets: ["wardrobe", "vision", "skills"],
  }, context);

  assert.equal(policyAuthorizesPluginTopic({ authorized_toolsets: ["wardrobe"] }, context), true);
  assert.equal(result.authorized, true);
  assert.deepEqual(result.requiredToolsets, ["wardrobe", "vision", "file", "skills"]);
  assert.deepEqual(result.requiredSkills, ["productivity/wardrobe-style-operations"]);
  assert.deepEqual(result.context.requiredToolsets, result.requiredToolsets);
}

function testUnauthorizedPluginTopicCannotSelfAuthorizeMcp() {
  const context = pluginTopicContextForTaskGroup("plugin:health");
  const result = resolvePluginTopicRunRequirements({ allowed_toolsets: ["file"] }, context);

  assert.equal(policyAuthorizesPluginTopic({ allowed_toolsets: ["file"] }, context), false);
  assert.equal(result.authorized, false);
  assert.deepEqual(result.requiredToolsets, []);
  assert.deepEqual(result.requiredSkills, []);
  assert.equal(result.context.pluginId, "health");
  assert.deepEqual(result.context.requiredToolsets, []);
}

testKnownPluginTopicContexts();
testAuthorizedPluginTopicPreservesRequirements();
testUnauthorizedPluginTopicCannotSelfAuthorizeMcp();

console.log("plugin-topic-run-requirements-service tests passed");
