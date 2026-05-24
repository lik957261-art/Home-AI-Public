"use strict";

const assert = require("node:assert/strict");
const {
  buildCodexPrompt,
  createChatGptProCodexBridgeService,
  extractFinalAssistantText,
  isActiveThread,
} = require("../adapters/chatgpt-pro-codex-bridge-service");

async function testStartsCodexMobileThreadAndReturnsFinalAssistantText() {
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/api/threads/new-message")) {
      const body = JSON.parse(options.body);
      assert.equal(body.cwd, "C:\\Work");
      assert.equal(body.model, "gpt-5.5");
      assert.equal(body.effort, "medium");
      assert.equal(body.permissionMode, "full");
      assert.match(body.text, /must use the Chrome plugin \/ Chrome skill/);
      assert.match(body.text, /Do not impersonate ChatGPT Pro output/);
      return { ok: true, text: async () => JSON.stringify({ threadId: "thread_1" }) };
    }
    if (url.endsWith("/api/threads/thread_1")) {
      return {
        ok: true,
        text: async () => JSON.stringify({
          thread: {
            status: { type: "completed" },
            turns: [
              { items: [{ role: "assistant", text: "Completed: ChatGPT Pro generated the report. File: C:\\Report.docx" }] },
            ],
          },
        }),
      };
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const service = createChatGptProCodexBridgeService({
    fetch: fakeFetch,
    key: "test-key",
    baseUrl: "http://codex.local",
    workspace: "C:\\Work",
    pollIntervalMs: 1,
    timeoutMs: 1000,
  });
  const result = await service.generate({
    title: "Tesla FSD report",
    prompt: "Generate Word",
    output_format: "docx",
  });
  assert.equal(result.ok, true);
  assert.equal(result.threadId, "thread_1");
  assert.match(result.result_text, /C:\\Report\.docx/);
  assert.equal(calls[0].options.headers["x-codex-mobile-key"], "test-key");
}

function testPromptKeepsChatGptProBoundary() {
  const prompt = buildCodexPrompt({
    title: "A",
    prompt: "Generate a report",
    output_format: "docx",
    delivery_mode: "artifact",
  });
  assert.match(prompt, /ChatGPT Pro execution thread/);
  assert.match(prompt, /Do not fall back to another model/);
  assert.match(prompt, /create a locally openable \.docx file/);
  assert.match(prompt, /Answer in Chinese for parent-facing analysis/);
}

function testThreadStatusAndExtraction() {
  assert.equal(isActiveThread({ status: { type: "active" } }), true);
  assert.equal(isActiveThread({ status: { type: "completed" } }), false);
  const text = extractFinalAssistantText({
    thread: {
      turns: [
        { items: [{ role: "user", text: "user request should not be extracted" }] },
        { items: [{ type: "agentMessage", phase: "final_answer", text: "This is the final ChatGPT Pro result with enough length to be extracted." }] },
      ],
    },
  });
  assert.match(text, /final ChatGPT Pro result/);
  assert.doesNotMatch(text, /user request/);
}
async function main() {
  await testStartsCodexMobileThreadAndReturnsFinalAssistantText();
  testPromptKeepsChatGptProBoundary();
  testThreadStatusAndExtraction();
  console.log("chatgpt-pro-codex-bridge-service tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
