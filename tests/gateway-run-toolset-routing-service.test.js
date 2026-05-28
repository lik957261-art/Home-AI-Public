"use strict";

const assert = require("node:assert/strict");
const { createGatewayRunToolsetRoutingService } = require("../adapters/gateway-run-toolset-routing-service");

const allToolsets = [
  "web",
  "search",
  "browser",
  "x_search",
  "http",
  "file",
  "vision",
  "skills",
  "todo",
  "kanban",
  "cronjob",
  "memory",
  "session_search",
  "clarify",
  "wardrobe",
  "weather",
];

function createService() {
  return createGatewayRunToolsetRoutingService();
}

function policy() {
  return { allowed_toolsets: allToolsets.slice() };
}

function testPlainChatUsesMinimalToolsets() {
  const service = createService();
  const result = service.routePolicy({
    policy: policy(),
    userMessage: { content: "测试" },
    runOptions: {},
  });

  assert.deepEqual(result.policy.allowed_toolsets, allToolsets);
  assert.equal(result.routing.mode, "disabled");
  assert.equal(result.routing.reason, "toolset_pruning_disabled");
  assert.deepEqual(result.routing.suggested_toolsets, ["web", "search", "browser", "x_search", "http", "clarify"]);
  assert.equal(result.routing.suggested_mode, "minimal");
  assert.equal(result.routing.suggested_reason, "plain_chat_light_tools");
}

function testPlainChatWithoutTopicDirectoryDoesNotCrash() {
  const service = createService();
  const result = service.routePolicy({
    policy: policy(),
    userMessage: { content: "\u6d4b\u8bd5", taskGroupId: "chat" },
    taskDirectory: null,
    runOptions: {},
  });

  assert.equal(result.routing.suggested_mode, "minimal");
  assert.deepEqual(result.routing.suggested_toolsets, ["web", "search", "browser", "x_search", "http", "clarify"]);
}

function testExplicitXSearchKeepsOnlyXSearchWhenAllowed() {
  const service = createService();
  const result = service.routePolicy({
    policy: policy(),
    userMessage: { content: "去 X 上搜索一下这个账号最近说了什么" },
    runOptions: {},
  });

  assert.deepEqual(result.policy.allowed_toolsets, allToolsets);
  assert.equal(result.routing.mode, "disabled");
  assert.deepEqual(result.routing.suggested_toolsets, ["x_search"]);
  assert.equal(result.routing.suggested_mode, "intent");
}

function testSearchSourceOptionsAddXSearch() {
  const service = createService();
  const result = service.routePolicy({
    policy: policy(),
    userMessage: { content: "帮我看看" },
    runOptions: { searchSource: "x", sourceIntent: "x_search", sourceMode: "manual" },
  });

  assert.deepEqual(result.policy.allowed_toolsets, allToolsets);
  assert.equal(result.routing.reason, "toolset_pruning_disabled");
  assert.deepEqual(result.routing.suggested_toolsets, ["x_search"]);
  assert.equal(result.routing.suggested_reason, "matched_intent");
}

function testExplicitWebSearchKeepsBrowserCompanionWhenAllowed() {
  const service = createService();
  const result = service.routePolicy({
    policy: policy(),
    userMessage: { content: "search the web for current product details" },
    runOptions: {},
  });

  assert.deepEqual(result.policy.allowed_toolsets, allToolsets);
  assert.equal(result.routing.suggested_mode, "intent");
  assert.deepEqual(result.routing.suggested_toolsets, ["web", "search", "browser"]);
}

function testFileAndSkillIntentCanCombine() {
  const service = createService();
  const result = service.routePolicy({
    policy: policy(),
    userMessage: { content: "用界面 Skill 看一下这个文件的设计规则" },
    runOptions: {},
  });

  assert.deepEqual(result.policy.allowed_toolsets, allToolsets);
  assert.deepEqual(result.routing.suggested_toolsets, ["file", "skills"]);
}

function testWardrobeIngestionSuggestsWardrobeMcpAndInputTools() {
  const service = createService();
  const result = service.routePolicy({
    policy: policy(),
    userMessage: {
      content: "\u8fd9\u5f20 LP \u5546\u54c1\u7167\u9700\u8981\u5165\u5e93\u5230\u8863\u6a71",
      attachments: [{ id: "upload_1", type: "image/jpeg" }],
    },
    runOptions: {},
  });

  assert.deepEqual(result.policy.allowed_toolsets, allToolsets);
  assert.equal(result.routing.suggested_mode, "intent");
  assert.deepEqual(result.routing.suggested_toolsets, ["wardrobe", "vision", "file"]);
}

function testWardrobeBoundTopicDefaultsToWardrobeMcp() {
  const service = createService();
  const result = service.routePolicy({
    policy: policy(),
    userMessage: { content: "\u8fd9\u4e2a\u600e\u4e48\u5904\u7406\uff1f", taskGroupId: "wardrobe-topic" },
    taskDirectory: {
      projectId: "family-wardrobe",
      label: "Wardrobe / WuPing",
      path: "D:\\Wardrobe\\WuPing",
      root: "D:\\Wardrobe\\WuPing",
    },
    runOptions: {},
  });

  assert.deepEqual(result.policy.allowed_toolsets, allToolsets);
  assert.equal(result.routing.suggested_mode, "intent");
  assert.deepEqual(result.routing.suggested_toolsets, ["wardrobe", "vision", "file"]);
}

function testRetryUsesRecentToolsetEscalationContext() {
  const service = createService();
  const result = service.routePolicy({
    policy: policy(),
    thread: {
      messages: [
        { id: "user_1", role: "user", content: "Need outfit for event based on weather and wardrobe" },
        {
          id: "assistant_1",
          role: "assistant",
          content: "Need additional toolsets: weather, wardrobe",
          toolsetEscalationRequired: true,
          toolsetEscalationToolsets: ["weather", "wardrobe"],
          toolsetEscalationReason: "needs current weather and closet state",
        },
        { id: "user_2", role: "user", content: "\u91cd\u8bd5" },
      ],
    },
    userMessage: { id: "user_2", content: "\u91cd\u8bd5" },
    runOptions: {},
  });

  assert.equal(result.routing.suggested_mode, "intent");
  assert.deepEqual(result.routing.suggested_toolsets, ["weather", "wardrobe"]);
}

function testRetryUsesRecentTaskTextWhenNoEscalationMetadataExists() {
  const service = createService();
  const result = service.routePolicy({
    policy: policy(),
    thread: {
      messages: [
        { id: "user_1", role: "user", content: "Need event outfit with weather and wardrobe status" },
        { id: "assistant_1", role: "assistant", content: "Current run only has file, cannot make a reliable outfit recommendation." },
        { id: "user_2", role: "user", content: "\u91cd\u8bd5" },
      ],
    },
    userMessage: { id: "user_2", content: "\u91cd\u8bd5" },
    runOptions: {},
  });

  assert.equal(result.routing.suggested_mode, "intent");
  assert.deepEqual(result.routing.suggested_toolsets, ["wardrobe", "vision", "file", "weather"]);
}

function testRetryUsesSameTaskGroupContextBeyondGlobalTail() {
  const service = createService();
  const thread = {
    messages: [
      { id: "task_user_1", role: "user", taskGroupId: "wardrobe-task", content: "Need Vacheron event outfit from wardrobe and forecast weather" },
      ...Array.from({ length: 10 }, (_value, index) => ({
        id: `chat_${index}`,
        role: index % 2 ? "assistant" : "user",
        taskGroupId: "chat",
        content: "unrelated status",
      })),
      { id: "task_user_2", role: "user", taskGroupId: "wardrobe-task", content: "\u91cd\u8bd5" },
    ],
  };
  const result = service.routePolicy({
    policy: policy(),
    thread,
    userMessage: thread.messages[thread.messages.length - 1],
    runOptions: {},
  });

  assert.equal(result.routing.suggested_mode, "intent");
  assert.deepEqual(result.routing.suggested_toolsets, ["wardrobe", "vision", "file", "weather"]);
}

function testAmbiguousRequestFailsOpenToBaseToolsets() {
  const service = createService();
  const result = service.routePolicy({
    policy: policy(),
    userMessage: { content: "你觉得这个方案是否合理，风险在哪里？" },
    runOptions: {},
  });

  assert.deepEqual(result.policy.allowed_toolsets, allToolsets);
  assert.equal(result.routing.mode, "disabled");
  assert.equal(result.routing.reason, "toolset_pruning_disabled");
  assert.equal(result.routing.suggested_mode, "compatible");
  assert.equal(result.routing.suggested_reason, "ambiguous_fail_open");
}

function testNeverGrantsToolsetsNotAlreadyAllowed() {
  const service = createService();
  const result = service.routePolicy({
    policy: { allowed_toolsets: ["web", "search"] },
    userMessage: { content: "去 X 上搜索一下" },
    runOptions: {},
  });

  assert.deepEqual(result.policy.allowed_toolsets, ["web", "search"]);
  assert.deepEqual(result.routing.suggested_toolsets, []);
}

function testCommonWebCompanionHonorsAllowedPolicyBoundary() {
  const service = createService();
  const result = service.routePolicy({
    policy: { allowed_toolsets: ["web", "search"] },
    userMessage: { content: "search the web for current product details" },
    runOptions: {},
  });

  assert.deepEqual(result.policy.allowed_toolsets, ["web", "search"]);
  assert.deepEqual(result.routing.suggested_toolsets, ["web", "search"]);
}

testPlainChatUsesMinimalToolsets();
testPlainChatWithoutTopicDirectoryDoesNotCrash();
testExplicitXSearchKeepsOnlyXSearchWhenAllowed();
testSearchSourceOptionsAddXSearch();
testExplicitWebSearchKeepsBrowserCompanionWhenAllowed();
testFileAndSkillIntentCanCombine();
testWardrobeIngestionSuggestsWardrobeMcpAndInputTools();
testWardrobeBoundTopicDefaultsToWardrobeMcp();
testRetryUsesRecentToolsetEscalationContext();
testRetryUsesRecentTaskTextWhenNoEscalationMetadataExists();
testRetryUsesSameTaskGroupContextBeyondGlobalTail();
testAmbiguousRequestFailsOpenToBaseToolsets();
testNeverGrantsToolsetsNotAlreadyAllowed();
testCommonWebCompanionHonorsAllowedPolicyBoundary();

console.log("gateway-run-toolset-routing-service tests passed");
