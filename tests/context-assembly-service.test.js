"use strict";

const assert = require("node:assert/strict");
const { createContextAssemblyService } = require("../adapters/context-assembly-service");

function legacyBuildConversationHistory(thread, latestUserMessageId) {
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  const index = messages.findIndex((message) => message.id === latestUserMessageId);
  return messages
    .slice(0, index >= 0 ? index : messages.length)
    .filter((message) => (message.role === "user" || message.role === "assistant") && message.status !== "running")
    .filter((message) => String(message.content || "").trim())
    .slice(-10)
    .map((message) => ({ role: message.role, content: message.content }));
}

const topicContextService = {
  readTopicContext() {
    return {
      summary: {
        summaryVersion: 7,
        objective: "Keep topic state compact.",
        currentState: "Implementation is in progress.",
        sourceRefs: ["message:m1"],
      },
      workingState: {
        status: "active",
        activeTask: "Layered context",
        currentStep: "Write tests.",
        nextStep: "Run focused checks.",
        sourceRefs: ["message:m2"],
      },
      refs: [
        { refId: "message:m1", role: "user", preview: "Original request" },
        { refId: "message:m2", role: "assistant", preview: "Prior decision" },
      ],
    };
  },
};

{
  const service = createContextAssemblyService({
    mode: "layered",
    legacyBuildConversationHistory,
    topicContextService,
    compactText: (text, limit) => String(text || "").slice(0, limit),
    normalRecentMessages: 2,
  });
  const thread = {
    id: "thread_1",
    messages: [
      { id: "m1", role: "user", taskGroupId: "chat", content: "one" },
      { id: "m2", role: "assistant", taskGroupId: "chat", content: "two" },
      { id: "m3", role: "user", taskGroupId: "chat", content: "latest" },
    ],
  };
  const history = service.buildConversationHistory(thread, "m3", {});
  assert.match(history[0].content, /Hermes topic summary/);
  assert.match(history[1].content, /Hermes working state/);
  assert.deepEqual(history.slice(-2), [
    { role: "user", content: "one" },
    { role: "assistant", content: "two" },
  ]);
  assert.equal(service.lastAssemblyDebug().profile, "normal_chat");
  assert.equal(service.lastAssemblyDebug().summaryVersion, 7);
}

{
  const service = createContextAssemblyService({
    mode: "layered",
    legacyBuildConversationHistory,
    topicContextService,
    normalRecentMessages: 10,
    toolDenseRecentMessages: 2,
  });
  const thread = {
    id: "thread_1",
    messages: [
      { id: "m1", role: "user", taskGroupId: "chat", content: "one" },
      { id: "m2", role: "assistant", taskGroupId: "chat", content: "tool output json" },
      { id: "m3", role: "assistant", taskGroupId: "chat", content: "two" },
      { id: "m4", role: "user", taskGroupId: "chat", content: "latest asks about http_request" },
    ],
  };
  const history = service.buildConversationHistory(thread, "m4", {});
  assert.equal(service.lastAssemblyDebug().profile, "tool_dense");
  assert.equal(service.lastAssemblyDebug().recentMessageCount, 2);
  assert.deepEqual(history.slice(-2), [
    { role: "assistant", content: "tool output json" },
    { role: "assistant", content: "two" },
  ]);
}

{
  const service = createContextAssemblyService({
    mode: "legacy",
    legacyBuildConversationHistory,
  });
  const history = service.buildConversationHistory({ messages: [
    { id: "m1", role: "assistant", content: "old" },
    { id: "m2", role: "user", content: "latest" },
  ] }, "m2", {});
  assert.deepEqual(history, [{ role: "assistant", content: "old" }]);
  assert.equal(service.lastAssemblyDebug().fallbackUsed, true);
}

{
  const service = createContextAssemblyService({
    mode: "layered",
    legacyBuildConversationHistory,
    topicContextService: { readTopicContext: () => ({ summary: null, workingState: null, refs: [] }) },
  });
  const history = service.buildConversationHistory({ messages: [
    { id: "m1", role: "assistant", content: "legacy fallback" },
    { id: "m2", role: "user", content: "latest" },
  ] }, "m2", {});
  assert.deepEqual(history, [{ role: "assistant", content: "legacy fallback" }]);
  assert.equal(service.lastAssemblyDebug().fallbackUsed, true);
}

console.log("context-assembly-service tests passed");
