"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-composer-viewport-ui.js"), "utf8");

function createHarness(fakeModel = null, options = {}) {
  const calls = [];
  const frames = [];
  const conversation = {};
  const context = {
    console,
    Promise,
    Date: { now: () => options.nowMs ?? 1000 },
    globalThis: null,
    window: {
      __homeAiImportChatComposerViewportModel(importPath) {
        context.importedPath = importPath;
        return Promise.resolve(fakeModel);
      },
    },
    state: {
      forceChatStickToBottomUntil: 0,
      conversationViewportBottomFollowUntil: 0,
      conversationViewportSettleUntil: 0,
      suppressChatAutoBottomUntil: 999,
      suppressConversationPinUntil: 0,
      conversationPinnedToBottom: false,
    },
    $: (id) => (id === "conversation" ? conversation : null),
    conversationReadAnchorActive: (target) => {
      calls.push(["readAnchor", target === conversation]);
      return Boolean(options.readAnchorActive);
    },
    conversationUserScrollProtectActive: () => {
      calls.push("userScroll");
      return Boolean(options.userScrollProtected);
    },
    shouldForceChatStickToBottom: () => {
      calls.push("force");
      return Boolean(options.forceStickToBottom);
    },
    isNearBottom: (threshold) => {
      calls.push(["near", threshold]);
      return Boolean(options.nearBottom);
    },
    conversationViewportRefreshApplies: () => {
      calls.push("applies");
      return options.applies !== false;
    },
    scrollConversationToBottom: () => calls.push("scrollBottom"),
    requestAnimationFrame: (callback) => {
      frames.push(callback);
      calls.push("raf");
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-composer-viewport-ui.js" });
  return { calls, context, frames };
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
  await test("classic composer viewport adapter declares bounded ESM import path", () => {
    assert.match(source, /CHAT_COMPOSER_VIEWPORT_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-composer-viewport-model\/chat-composer-viewport-model\.js/);
    assert.match(source, /__homeAiImportChatComposerViewportModel/);
    assert.match(source, /currentChatComposerViewportModel/);
    assert.match(source, /composerTerminalReceiptStickToBottomPlan/);
    assert.match(source, /composerSendViewportLockPlan/);
  });

  await test("classic adapter consumes ESM model for terminal receipt stick planning", async () => {
    const modelCalls = [];
    const fakeModel = {
      composerTerminalReceiptStickToBottomPlan(input) {
        modelCalls.push(["terminal", input.readAnchorActive, input.userScrollProtected, input.forceStickToBottom, input.nearBottom]);
        return { stickToBottom: true };
      },
    };
    const { calls, context } = createHarness(fakeModel, {
      readAnchorActive: false,
      userScrollProtected: false,
      forceStickToBottom: false,
      nearBottom: false,
    });
    await context.importChatComposerViewportModel(context.window);

    assert.equal(context.composerTerminalReceiptStickToBottom(), true);
    assert.equal(context.importedPath, "/vite-islands/chat-composer-viewport-model/chat-composer-viewport-model.js");
    assert.deepEqual(modelCalls, [["terminal", false, false, false, false]]);
    assert.deepEqual(calls, [["readAnchor", true], "userScroll", "force", ["near", 220]]);
  });

  await test("classic adapter consumes ESM model for send viewport lock", async () => {
    const modelCalls = [];
    const fakeModel = {
      composerSendViewportLockPlan(input) {
        modelCalls.push(["lock", input.applies, input.nowMs]);
        return {
          shouldLock: true,
          forceChatStickToBottomUntil: 2222,
          conversationViewportBottomFollowUntil: 3333,
          conversationViewportSettleUntil: 4444,
          suppressChatAutoBottomUntil: 0,
          suppressConversationPinUntil: 5555,
          conversationPinnedToBottom: true,
        };
      },
    };
    const { calls, context, frames } = createHarness(fakeModel, { applies: true, nowMs: 1234 });
    await context.importChatComposerViewportModel(context.window);

    context.lockComposerSendToBottom();

    assert.deepEqual(modelCalls, [["lock", true, 1234]]);
    assert.equal(context.state.forceChatStickToBottomUntil, 2222);
    assert.equal(context.state.conversationViewportBottomFollowUntil, 3333);
    assert.equal(context.state.conversationViewportSettleUntil, 4444);
    assert.equal(context.state.suppressChatAutoBottomUntil, 0);
    assert.equal(context.state.suppressConversationPinUntil, 5555);
    assert.equal(context.state.conversationPinnedToBottom, true);
    assert.equal(frames.length, 1);

    frames[0]();
    assert.equal(frames.length, 2);
    frames[1]();
    assert.deepEqual(calls.filter((entry) => entry === "scrollBottom"), ["scrollBottom", "scrollBottom"]);
  });

  await test("classic adapter skips send viewport lock when plan does not apply", async () => {
    const fakeModel = {
      composerSendViewportLockPlan() {
        return {
          shouldLock: false,
          forceChatStickToBottomUntil: 0,
          conversationViewportBottomFollowUntil: 0,
          conversationViewportSettleUntil: 0,
          suppressChatAutoBottomUntil: 0,
          suppressConversationPinUntil: 0,
          conversationPinnedToBottom: false,
        };
      },
    };
    const { calls, context, frames } = createHarness(fakeModel, { applies: false });
    await context.importChatComposerViewportModel(context.window);

    context.lockComposerSendToBottom();

    assert.equal(context.state.forceChatStickToBottomUntil, 0);
    assert.equal(context.state.suppressChatAutoBottomUntil, 999);
    assert.equal(frames.length, 0);
    assert.equal(calls.includes("scrollBottom"), false);
  });

  await test("classic fallback preserves viewport behavior without loaded ESM model", () => {
    const { calls, context, frames } = createHarness({}, {
      readAnchorActive: false,
      userScrollProtected: false,
      forceStickToBottom: false,
      nearBottom: true,
      applies: true,
      nowMs: 1000,
    });

    assert.equal(context.composerTerminalReceiptStickToBottom(), true);
    context.lockComposerSendToBottom();

    assert.equal(context.state.forceChatStickToBottomUntil, 13000);
    assert.equal(context.state.conversationViewportBottomFollowUntil, 6000);
    assert.equal(context.state.conversationViewportSettleUntil, 1900);
    assert.equal(context.state.suppressChatAutoBottomUntil, 0);
    assert.equal(context.state.suppressConversationPinUntil, 1700);
    assert.equal(context.state.conversationPinnedToBottom, true);
    assert.equal(frames.length, 1);
    frames[0]();
    frames[1]();
    assert.deepEqual(calls.filter((entry) => entry === "scrollBottom"), ["scrollBottom", "scrollBottom"]);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
