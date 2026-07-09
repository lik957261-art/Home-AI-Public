"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/composer-streaming-message-model.mjs");

async function loadModel() {
  return import(pathToFileURL(modelPath).href);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

(async () => {
  const model = await loadModel();

  await test("streaming message model stays browser-global free", () => {
    const source = fs.readFileSync(modelPath, "utf8");
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bdocument\s*\./);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /\bfetch\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
  });

  await test("bounded append preserves tail and metadata", () => {
    const plan = model.appendStreamingMessageBoundedPlan({
      current: "A".repeat(900),
      delta: "B".repeat(900),
      maxChars: 1000,
    });
    assert.equal(plan.truncated, true);
    assert.equal(plan.totalLength, 1800);
    assert.match(plan.content, /^\[live content truncated: 1800 chars total\]/);
    assert.equal(plan.content.endsWith("B".repeat(750)), true);
    assert.equal(model.appendStreamingMessageBoundedPlan({
      current: "hello",
      delta: " world",
      maxChars: 1000,
    }).content, "hello world");
  });

  await test("eligibility and stick planning preserve classic guards", () => {
    assert.equal(model.streamingMessageRenderEligibilityPlan({
      message: { id: "m1", role: "assistant", status: "running" },
    }).shouldRender, true);
    assert.equal(model.streamingMessageRenderEligibilityPlan({
      message: { id: "m1", role: "user" },
    }).reason, "not_assistant");
    assert.equal(model.streamingMessageRenderEligibilityPlan({
      message: { id: "m1", role: "assistant" },
      chatSearchMode: true,
      chatSearchQuery: "quota",
    }).reason, "chat_search_active");
    assert.equal(model.streamingMessageActivePlan({ status: "queued" }).active, true);
    assert.deepEqual(model.streamingMessageStickToBottomPlan({
      readAnchorActive: false,
      userScrollProtected: false,
      keepPinned: true,
    }), {
      version: model.CHAT_COMPOSER_STREAMING_MESSAGE_MODEL_VERSION,
      shouldStick: true,
      blockedByReadAnchor: false,
      blockedByUserScroll: false,
    });
    assert.equal(model.streamingMessageStickToBottomPlan({
      userScrollProtected: true,
      keepPinned: true,
    }).shouldStick, false);
  });

  await test("render delay planning preserves throttle and rich-render delay", () => {
    assert.equal(model.streamingMessageRenderDelayPlan({
      contentLength: 100,
      activeMessageRichRenderLimit: 1000,
      nowMs: 1000,
      lastRenderedAtMs: 950,
    }).delayMs, 40);
    assert.equal(model.streamingMessageRenderDelayPlan({
      contentLength: 2000,
      activeMessageRichRenderLimit: 1000,
      nowMs: 1000,
      lastRenderedAtMs: 950,
    }).delayMs, 130);
    assert.equal(model.streamingMessageRenderDelayPlan({
      contentLength: 2000,
      activeMessageRichRenderLimit: 1000,
      nowMs: 1200,
      lastRenderedAtMs: 950,
    }).delayMs, 0);
  });

  await test("delta planning scopes writes to the active thread and target message", () => {
    const thread = {
      id: "thread_1",
      messages: [{ id: "m1", content: "hello", role: "assistant" }],
    };
    const plan = model.appendStreamingDeltaPlan({
      thread,
      threadId: "thread_1",
      messageId: "m1",
      delta: " world",
      payload: { updatedAt: "2026-07-04T10:00:00.000Z" },
    });
    assert.equal(plan.shouldApply, true);
    assert.equal(plan.content, "hello world");
    assert.equal(plan.firstFeedbackAt, "2026-07-04T10:00:00.000Z");
    assert.equal(model.appendStreamingDeltaPlan({
      thread,
      threadId: "other",
      messageId: "m1",
      delta: "ignored",
    }).reason, "thread_scope_mismatch");
    assert.equal(model.appendStreamingDeltaPlan({
      thread,
      threadId: "thread_1",
      messageId: "missing",
      delta: "ignored",
    }).reason, "message_not_found");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
