"use strict";

const assert = require("node:assert/strict");
const {
  evaluateWardrobeOutfitWorkflowGate,
  textLooksWardrobeOutfitWorkflow,
  validateWardrobeOutfitWorkflowCompletion,
} = require("../adapters/wardrobe-outfit-workflow-gate-service");

const loadedSkill = {
  path: "productivity/wardrobe-style-operations",
  content: "complete skill bundle",
  loadedChars: 21,
  totalChars: 21,
};

function request(overrides = {}) {
  return Object.assign({
    body: {
      input: "\u91cd\u65b0\u914d\u4e00\u5957\u8863\u670d",
      enabled_toolsets: ["wardrobe", "vision", "file", "skills", "weather"],
    },
    runPolicy: {
      allowed_toolsets: ["wardrobe", "vision", "file", "skills", "weather"],
    },
    pluginTopicContext: { pluginId: "wardrobe" },
    requiredSkillPreloads: [loadedSkill],
  }, overrides);
}

function testOutfitTextDetection() {
  assert.equal(textLooksWardrobeOutfitWorkflow("\u4eca\u5929\u7a7f\u4ec0\u4e48"), true);
  assert.equal(textLooksWardrobeOutfitWorkflow("Style these items"), true);
  assert.equal(textLooksWardrobeOutfitWorkflow("list wardrobe inventory"), false);
  assert.equal(textLooksWardrobeOutfitWorkflow("\u7b2c\u4e00\u6b21\u914d\u8863\u670d\u5931\u8d25\u4e86\uff0c\u4e3a\u4ec0\u4e48\u82b1\u4e86 9 \u5206\u949f\uff1f"), false);
  assert.equal(textLooksWardrobeOutfitWorkflow("\u521a\u624d\u90a3\u5957\u5931\u8d25\u4e86\uff0c\u8bf7\u91cd\u65b0\u914d\u4e00\u5957"), true);
}

function testGatePassesWhenSkillAndToolsetsAreReady() {
  const gate = evaluateWardrobeOutfitWorkflowGate({
    request: request(),
    userMessage: { content: "\u91cd\u65b0\u914d\u4e00\u5957\u8863\u670d", taskGroupId: "plugin:wardrobe" },
    stage: "pre_stream",
  });

  assert.equal(gate.active, true);
  assert.equal(gate.ok, true);
  assert.equal(gate.workflow, "wardrobe_outfit");
  assert.deepEqual(gate.requiredToolsets, ["wardrobe", "vision", "file", "skills", "weather"]);
  assert.equal(gate.runOptionsMetadata.completionGate.enabled, false);
  assert.equal(gate.runOptionsMetadata.completionGate.advisory, true);
  assert.match(gate.instructionBlock, /Wardrobe outfit workflow guidance/);
  assert.match(gate.instructionBlock, /still answer/);
}

function testGateFailsWhenRequiredSkillPreloadFailed() {
  const gate = evaluateWardrobeOutfitWorkflowGate({
    request: request({
      requiredSkillPreloads: [{
        path: "productivity/wardrobe-style-operations",
        missing: true,
        error: "required_skill_not_found",
      }],
    }),
    userMessage: { content: "\u91cd\u65b0\u914d\u4e00\u5957\u8863\u670d", taskGroupId: "plugin:wardrobe" },
  });

  assert.equal(gate.ok, false);
  assert.equal(gate.reason, "required_skill_missing");
  assert.deepEqual(gate.missingSkills, ["productivity/wardrobe-style-operations"]);
  assert.match(gate.message, /productivity\/wardrobe-style-operations/);
}

function testGateFailsWhenWeatherIsMissingForOutfit() {
  const gate = evaluateWardrobeOutfitWorkflowGate({
    request: request({
      body: { input: "\u91cd\u65b0\u914d\u4e00\u5957\u8863\u670d", enabled_toolsets: ["wardrobe", "vision", "file", "skills"] },
      runPolicy: { allowed_toolsets: ["wardrobe", "vision", "file", "skills"] },
    }),
    userMessage: { content: "\u91cd\u65b0\u914d\u4e00\u5957\u8863\u670d", taskGroupId: "plugin:wardrobe" },
  });

  assert.equal(gate.ok, false);
  assert.equal(gate.reason, "toolset_missing");
  assert.deepEqual(gate.missingToolsets, ["weather"]);
}

function testNonOutfitWardrobePluginDoesNotRequireWeather() {
  const gate = evaluateWardrobeOutfitWorkflowGate({
    request: request({
      body: { input: "\u5217\u51fa\u8863\u6a71\u5355\u54c1\u72b6\u6001", enabled_toolsets: ["wardrobe", "vision", "file", "skills"] },
      runPolicy: { allowed_toolsets: ["wardrobe", "vision", "file", "skills"] },
    }),
    userMessage: { content: "\u5217\u51fa\u8863\u6a71\u5355\u54c1\u72b6\u6001", taskGroupId: "plugin:wardrobe" },
  });

  assert.equal(gate.ok, true);
  assert.equal(gate.workflow, "wardrobe_plugin");
  assert.equal(gate.completionGate.enabled, false);
}

function testCompletionGateIsAdvisoryForMissingEvidence() {
  const result = validateWardrobeOutfitWorkflowCompletion({
    message: {
      runOptions: {
        wardrobeOutfitWorkflowGate: {
          active: true,
          requiredSkillPath: "productivity/wardrobe-style-operations",
          completionGate: {
            enabled: true,
            requireWeatherCall: true,
            requireWardrobeMcpCall: true,
            requireMarkdownReceipt: true,
            requireWatchItem: true,
          },
        },
      },
    },
    output: "\u642d\u914d\u5efa\u8bae\uff1a\u767d\u886c\u886b\u3002",
    loadedSkills: [{ path: "productivity/wardrobe-style-operations" }],
    loadedTools: [{ name: "mcp_wardrobe_wardrobe_search_items" }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.advisory, true);
  assert.equal(result.hardGateDisabled, true);
  assert.deepEqual(result.missing, ["weather_call", "markdown_receipt", "watch_item"]);
}

function testCompletionGatePassesWithWeatherMcpMarkdownAndWatch() {
  const result = validateWardrobeOutfitWorkflowCompletion({
    message: {
      runOptions: {
        wardrobeOutfitWorkflowGate: {
          active: true,
          requiredSkillPath: "productivity/wardrobe-style-operations",
          completionGate: {
            enabled: true,
            requireWeatherCall: true,
            requireWardrobeMcpCall: true,
            requireMarkdownReceipt: true,
            requireWatchItem: true,
          },
        },
      },
    },
    output: "\u5305\u542b\u8155\u8868\u3002\nMEDIA:/tmp/outfit.md",
    loadedSkills: [{ path: "productivity/wardrobe-style-operations" }],
    loadedTools: [
      { name: "weather" },
      { name: "mcp_wardrobe_wardrobe_search_items" },
      { name: "write_file" },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
}

testOutfitTextDetection();
testGatePassesWhenSkillAndToolsetsAreReady();
testGateFailsWhenRequiredSkillPreloadFailed();
testGateFailsWhenWeatherIsMissingForOutfit();
testNonOutfitWardrobePluginDoesNotRequireWeather();
testCompletionGateIsAdvisoryForMissingEvidence();
testCompletionGatePassesWithWeatherMcpMarkdownAndWatch();

console.log("wardrobe outfit workflow gate service tests passed");
