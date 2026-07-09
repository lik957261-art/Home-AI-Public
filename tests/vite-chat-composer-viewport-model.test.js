"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/composer-viewport-model.mjs");

async function loadModel() {
  return import(`${pathToFileURL(modelPath).href}?test=${Date.now()}-${Math.random()}`);
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

  await test("composer viewport model stays browser-global free", () => {
    const source = fs.readFileSync(modelPath, "utf8");
    assert.match(source, /CHAT_COMPOSER_VIEWPORT_MODEL_VERSION/);
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bglobalThis\b/);
    assert.doesNotMatch(source, /\bdocument\./);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
  });

  await test("plans terminal receipt bottom-stick without overriding protected scroll", () => {
    assert.deepEqual(model.composerTerminalReceiptStickToBottomPlan({
      readAnchorActive: true,
      userScrollProtected: false,
      forceStickToBottom: true,
      nearBottom: true,
    }), {
      version: model.CHAT_COMPOSER_VIEWPORT_MODEL_VERSION,
      stickToBottom: false,
      blockedByReadAnchor: true,
      blockedByUserScroll: false,
    });

    assert.deepEqual(model.composerTerminalReceiptStickToBottomPlan({
      readAnchorActive: false,
      userScrollProtected: true,
      forceStickToBottom: true,
      nearBottom: true,
    }), {
      version: model.CHAT_COMPOSER_VIEWPORT_MODEL_VERSION,
      stickToBottom: false,
      blockedByReadAnchor: false,
      blockedByUserScroll: true,
    });

    assert.equal(model.composerTerminalReceiptStickToBottomPlan({
      readAnchorActive: false,
      userScrollProtected: false,
      forceStickToBottom: false,
      nearBottom: true,
    }).stickToBottom, true);

    assert.equal(model.composerTerminalReceiptStickToBottomPlan({
      readAnchorActive: false,
      userScrollProtected: false,
      forceStickToBottom: true,
      nearBottom: false,
    }).stickToBottom, true);

    assert.equal(model.composerTerminalReceiptStickToBottomPlan({
      readAnchorActive: false,
      userScrollProtected: false,
      forceStickToBottom: false,
      nearBottom: false,
    }).stickToBottom, false);
  });

  await test("plans send-time viewport lock windows", () => {
    assert.deepEqual(model.composerSendViewportLockPlan({
      applies: true,
      nowMs: 1000,
    }), {
      version: model.CHAT_COMPOSER_VIEWPORT_MODEL_VERSION,
      shouldLock: true,
      forceChatStickToBottomUntil: 13000,
      conversationViewportBottomFollowUntil: 6000,
      conversationViewportSettleUntil: 1900,
      suppressChatAutoBottomUntil: 0,
      suppressConversationPinUntil: 1700,
      conversationPinnedToBottom: true,
    });

    assert.deepEqual(model.composerSendViewportLockPlan({
      applies: false,
      nowMs: 1000,
    }), {
      version: model.CHAT_COMPOSER_VIEWPORT_MODEL_VERSION,
      shouldLock: false,
      forceChatStickToBottomUntil: 0,
      conversationViewportBottomFollowUntil: 0,
      conversationViewportSettleUntil: 0,
      suppressChatAutoBottomUntil: 0,
      suppressConversationPinUntil: 0,
      conversationPinnedToBottom: false,
    });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
