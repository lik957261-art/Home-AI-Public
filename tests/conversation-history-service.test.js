"use strict";

const assert = require("node:assert/strict");
const { createConversationHistoryService } = require("../adapters/conversation-history-service");

function service(options = {}) {
  return createConversationHistoryService({
    policyHasToolset(policy, toolset) {
      const allowed = Array.isArray(policy?.allowed_toolsets) ? policy.allowed_toolsets : [];
      return allowed.includes(toolset);
    },
    compactText(text, limit) {
      const value = String(text || "");
      return value.length > limit ? value.slice(0, limit) : value;
    },
    isSingleWindowConversationTaskGroupId(value) {
      return String(value || "").startsWith("chat");
    },
    maxHistoryMessages: 3,
    chatContextMaxMessages: 4,
    chatContextMaxChars: 80,
    maxApiTextChars: 200,
    ...options,
  });
}

{
  const history = service();
  assert.equal(history.isStaleHttpToolAvailabilityClaim("http_request is not available"), true);
  assert.equal(history.isStaleImageToolAvailabilityClaim("chatgpt_image_edit missing"), true);
  assert.equal(history.isStaleDocxToolAvailabilityClaim("DOCX parser unavailable"), true);
  assert.equal(history.isStaleAudioToolAvailabilityClaim("mp3 audio transcription unavailable"), true);
  assert.equal(history.isStaleAudioToolAvailabilityClaim("mp3 file uploaded successfully"), false);
}

{
  const history = service();
  const content = history.conversationHistoryContentForMessage(
    { role: "assistant", content: "http_request is not available" },
    { allowed_toolsets: ["http"] },
  );
  assert.match(content, /Stale assistant tool-availability claim omitted/);
  assert.match(content, /current run policy enables the `http` toolset/);
}

{
  const history = service();
  assert.equal(history.stripDirectoryAliasLinesForChatHistory("Directory aliases: abc\nKeep this"), "Keep this");
  assert.equal(history.stripDirectoryAliasLinesForChatHistory("- \u76ee\u5f55\u522b\u540d\uff1aabc\nKeep this"), "Keep this");
}

{
  const history = service();
  const thread = {
    singleWindow: true,
    messages: [
      { id: "m1", role: "user", taskGroupId: "chat-main", senderLabel: "A", content: "hello" },
      { id: "m2", role: "assistant", taskGroupId: "chat-main", content: "reply" },
      { id: "m3", role: "user", taskGroupId: "other", content: "other" },
      { id: "m4", role: "assistant", taskGroupId: "chat-main", status: "running", content: "skip" },
      { id: "m5", role: "user", taskGroupId: "chat-main", senderLabel: "B", content: "latest" },
    ],
  };
  const out = history.buildConversationHistory(thread, "m5", {});
  assert.deepEqual(out, [
    { role: "user", content: "A: hello" },
    { role: "assistant", content: "reply" },
  ]);
}

{
  const topicContextService = {
    readTopicContext() {
      return {
        summary: { summaryVersion: 2, objective: "Keep durable topic context.", currentState: "Summary exists.", sourceRefs: ["message:m1"] },
        workingState: { status: "active", activeTask: "Context assembly", currentStep: "Build layered history.", sourceRefs: ["message:m2"] },
        refs: [],
      };
    },
  };
  const history = service({ contextAssemblyMode: "layered", topicContextService, contextAssemblyNormalRecentMessages: 2 });
  const thread = {
    singleWindow: true,
    messages: [
      { id: "m1", role: "user", taskGroupId: "chat-main", senderLabel: "A", content: "first" },
      { id: "m2", role: "assistant", taskGroupId: "chat-main", content: "second" },
      { id: "m3", role: "user", taskGroupId: "chat-main", content: "latest" },
    ],
  };
  const out = history.buildConversationHistory(thread, "m3", {});
  assert.match(out[0].content, /Hermes topic summary/);
  assert.match(out[1].content, /Hermes working state/);
  assert.deepEqual(out.slice(-2), [
    { role: "user", content: "A: first" },
    { role: "assistant", content: "second" },
  ]);
  assert.equal(history.contextAssemblyDebug().summaryVersion, 2);
}

{
  const history = service();
  const thread = {
    singleWindow: false,
    messages: [
      { id: "m1", role: "user", content: "one" },
      { id: "m2", role: "assistant", content: "two" },
      { id: "m3", role: "user", content: "three" },
      { id: "m4", role: "assistant", content: "four" },
      { id: "m5", role: "user", content: "latest" },
    ],
  };
  assert.deepEqual(history.buildConversationHistory(thread, "m5", {}), [
    { role: "assistant", content: "two" },
    { role: "user", content: "three" },
    { role: "assistant", content: "four" },
  ]);
}

{
  const history = service({ chatContextMaxChars: 24 });
  const compact = history.compactConversationHistory([
    { role: "user", senderLabel: "A", content: "1234567890" },
    { role: "assistant", content: "abcdefghijklmnopqrstuvwxyz" },
  ], 2, 24, {});
  assert.equal(compact.length, 1);
  assert.match(compact[0].content, /Earlier chat content omitted|cdefghijklmnopqrstuvwxyz/);
}

{
  const history = service();
  assert.equal(history.deriveTitle(""), "New thread");
  assert.equal(history.deriveTitle("  short   title "), "short title");
  assert.equal(history.deriveTitle("x".repeat(50)), `${"x".repeat(42)}...`);
}

console.log("conversation-history-service tests passed");
