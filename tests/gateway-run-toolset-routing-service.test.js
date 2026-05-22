"use strict";

const assert = require("node:assert/strict");
const { createGatewayRunToolsetRoutingService } = require("../adapters/gateway-run-toolset-routing-service");

const allToolsets = [
  "web",
  "search",
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

  assert.deepEqual(result.policy.allowed_toolsets, ["web", "search", "x_search", "http", "clarify"]);
  assert.equal(result.routing.mode, "minimal");
  assert.equal(result.routing.reason, "plain_chat_light_tools");
}

function testExplicitXSearchKeepsOnlyXSearchWhenAllowed() {
  const service = createService();
  const result = service.routePolicy({
    policy: policy(),
    userMessage: { content: "去 X 上搜索一下这个账号最近说了什么" },
    runOptions: {},
  });

  assert.deepEqual(result.policy.allowed_toolsets, ["x_search"]);
  assert.equal(result.routing.mode, "intent");
}

function testSearchSourceOptionsAddXSearch() {
  const service = createService();
  const result = service.routePolicy({
    policy: policy(),
    userMessage: { content: "帮我看看" },
    runOptions: { searchSource: "x", sourceIntent: "x_search", sourceMode: "manual" },
  });

  assert.deepEqual(result.policy.allowed_toolsets, ["x_search"]);
  assert.equal(result.routing.reason, "matched_intent");
}

function testFileAndSkillIntentCanCombine() {
  const service = createService();
  const result = service.routePolicy({
    policy: policy(),
    userMessage: { content: "用界面 Skill 看一下这个文件的设计规则" },
    runOptions: {},
  });

  assert.deepEqual(result.policy.allowed_toolsets, ["file", "skills"]);
}

function testAmbiguousRequestFailsOpenToBaseToolsets() {
  const service = createService();
  const result = service.routePolicy({
    policy: policy(),
    userMessage: { content: "你觉得这个方案是否合理，风险在哪里？" },
    runOptions: {},
  });

  assert.deepEqual(result.policy.allowed_toolsets, allToolsets);
  assert.equal(result.routing.mode, "compatible");
  assert.equal(result.routing.reason, "ambiguous_fail_open");
}

function testNeverGrantsToolsetsNotAlreadyAllowed() {
  const service = createService();
  const result = service.routePolicy({
    policy: { allowed_toolsets: ["web", "search"] },
    userMessage: { content: "去 X 上搜索一下" },
    runOptions: {},
  });

  assert.deepEqual(result.policy.allowed_toolsets, []);
}

testPlainChatUsesMinimalToolsets();
testExplicitXSearchKeepsOnlyXSearchWhenAllowed();
testSearchSourceOptionsAddXSearch();
testFileAndSkillIntentCanCombine();
testAmbiguousRequestFailsOpenToBaseToolsets();
testNeverGrantsToolsetsNotAlreadyAllowed();

console.log("gateway-run-toolset-routing-service tests passed");
