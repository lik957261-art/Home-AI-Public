"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-composer-streaming-message-ui.js"), "utf8");

function createElementHarness() {
  const content = {
    className: "text-content",
    textContent: "",
    outerHTML: "<div class=\"text-content\">old</div>",
  };
  const body = {
    querySelector(selector) {
      return selector === ".text-content" ? content : null;
    },
  };
  const classes = new Set();
  const article = {
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
    querySelector(selector) {
      return selector === ".message-body" ? body : null;
    },
  };
  const conversation = {
    scrollTop: 10,
    scrollHeight: 800,
    clientHeight: 320,
  };
  return { article, body, content, conversation };
}

function createHarness(fakeModel = {}) {
  const elements = createElementHarness();
  const timers = new Map();
  let nextTimerId = 0;
  const context = {
    console,
    Promise,
    Date: Object.assign(function DateShim(...args) {
      return args.length ? new Date(...args) : new Date("2026-07-04T10:00:00.000Z");
    }, Date, {
      now: () => 1000,
    }),
    requestAnimationFrame(fn) {
      context.animationFrames.push(fn);
      fn();
    },
    animationFrames: [],
    timerCalls: [],
    globalThis: null,
    window: {
      setTimeout(fn, delay) {
        const id = ++nextTimerId;
        timers.set(id, { fn, delay });
        context.timerCalls.push({ id, delay });
        return id;
      },
      __homeAiImportChatComposerStreamingMessageModel(importPath) {
        context.importedPath = importPath;
        return Promise.resolve(fakeModel);
      },
    },
    state: {
      currentThread: {
        id: "thread_stream",
        messages: [{
          id: "assistant_stream",
          role: "assistant",
          status: "running",
          content: "hello",
        }],
      },
      streamingMessageRenderScheduled: new Set(),
      streamingMessageRenderLastAt: new Map(),
      conversationPinnedToBottom: false,
    },
    ACTIVE_MESSAGE_RICH_RENDER_LIMIT: 100,
    messageElementById(id) {
      return id === "assistant_stream" ? elements.article : null;
    },
    isChatSearchMode: () => false,
    currentChatSearchQuery: () => "",
    conversationReadAnchorActive: () => false,
    conversationUserScrollProtectActive: () => false,
    shouldKeepRunProgressPinnedToBottom: () => true,
    shouldForceChatStickToBottom: () => false,
    isNearBottom: () => true,
    runProgressScrollMetrics: () => ({ bottomOffset: 0 }),
    renderText(contentValue) {
      context.renderedText = contentValue;
      return `<div class="text-content">${contentValue}</div>`;
    },
    hydrateInlineMarkdownImages() {
      context.hydrated = true;
    },
    updateRunProgressPromptReserveClass() {
      context.reserveUpdated = true;
    },
    stickRunProgressToConversationBottom() {
      context.stuckToBottom = true;
    },
    isSingleWindowChatView: () => true,
    scheduleConversationBottomStick() {
      context.bottomStickScheduled = true;
    },
    scheduleMessageScrollButtonVisibility() {
      context.scrollButtonScheduled = true;
    },
    scheduleMessageScrollButtonVisibilitySettle(_article, delays) {
      context.scrollButtonSettle = delays;
    },
    scheduleRenderCurrentThread() {
      context.fullRenderScheduled = true;
    },
    $(id) {
      return id === "conversation" ? elements.conversation : null;
    },
    elements,
    timers,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-composer-streaming-message-ui.js" });
  return context;
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
  await test("classic streaming adapter declares bounded ESM import path", () => {
    assert.match(source, /CHAT_COMPOSER_STREAMING_MESSAGE_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-composer-streaming-message-model\/chat-composer-streaming-message-model\.js/);
    assert.match(source, /__homeAiImportChatComposerStreamingMessageModel/);
    assert.match(source, /currentChatComposerStreamingMessageModel/);
    assert.match(source, /appendStreamingDeltaPlan/);
    assert.match(source, /streamingMessageRenderDelayPlan/);
  });

  await test("classic adapter consumes ESM model for delta and render planning", async () => {
    const calls = [];
    const fakeModel = {
      appendStreamingMessageBoundedPlan(input) {
        calls.push(["bounded", input.delta]);
        return { content: "bounded-content" };
      },
      appendStreamingDeltaPlan(input) {
        calls.push(["delta", input.threadId, input.messageId]);
        return {
          shouldApply: true,
          content: `planned:${input.delta}`,
          firstFeedbackAt: "2026-07-04T10:00:00.000Z",
          updatedAt: "2026-07-04T10:00:01.000Z",
        };
      },
      streamingMessageRenderDelayPlan(input) {
        calls.push(["delay", input.contentLength, input.lastRenderedAtMs, input.nowMs]);
        return { delayMs: 0 };
      },
      streamingMessageRenderEligibilityPlan(input) {
        calls.push(["eligibility", input.message?.id]);
        return { shouldRender: true, active: true };
      },
      streamingMessageStickToBottomPlan(input) {
        calls.push(["stick", input.keepPinned, input.userScrollProtected]);
        return { shouldStick: true };
      },
    };
    const context = createHarness(fakeModel);
    await context.importChatComposerStreamingMessageModel(context.window);

    assert.equal(context.appendStreamingMessageBounded("a", "b"), "bounded-content");
    context.appendDelta("thread_stream", "assistant_stream", " next");

    const message = context.state.currentThread.messages[0];
    assert.equal(message.content, "planned: next");
    assert.equal(message.firstFeedbackAt, "2026-07-04T10:00:00.000Z");
    assert.equal(message.updatedAt, "2026-07-04T10:00:01.000Z");
    assert.equal(context.renderedText, "planned: next");
    assert.equal(context.stuckToBottom, true);
    assert.equal(context.bottomStickScheduled, true);
    assert.deepEqual(calls.map((entry) => entry[0]), ["bounded", "delta", "delay", "eligibility", "stick"]);
  });

  await test("classic fallback remains usable without loaded ESM model", () => {
    const context = createHarness({});
    context.chatComposerStreamingMessageModel = null;
    context.chatComposerStreamingMessageModelPromise = null;

    assert.equal(context.appendStreamingMessageBounded("A", "B"), "AB");
    context.appendDelta("thread_stream", "assistant_stream", " world", {
      updatedAt: "2026-07-04T10:00:02.000Z",
    });

    const message = context.state.currentThread.messages[0];
    assert.equal(message.content, "hello world");
    assert.equal(message.firstFeedbackAt, "2026-07-04T10:00:02.000Z");
    assert.equal(message.updatedAt, "2026-07-04T10:00:02.000Z");
    assert.equal(context.renderedText, "hello world");
    assert.equal(context.elements.article.classList.contains("streaming-active"), true);
    assert.equal(context.state.conversationPinnedToBottom, true);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
