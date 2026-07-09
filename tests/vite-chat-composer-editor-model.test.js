"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/composer-editor-model.mjs");

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

  await test("composer editor model stays browser-global free", () => {
    const source = fs.readFileSync(modelPath, "utf8");
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bdocument\s*\./);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /\bfetch\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
  });

  await test("normalizes text and reports request-size errors", () => {
    assert.equal(model.normalizeComposerText("hello\u00a0world"), "hello world");
    assert.equal(model.utf8ByteLengthForText("中文"), 6);
    assert.deepEqual(model.composerRequestSizeErrorPlan({
      text: "abcdef",
      serializedBody: "{}",
      maxTextChars: 5,
      maxBodyBytes: 100,
    }).reason, "text_char_limit");
    assert.deepEqual(model.composerRequestSizeErrorPlan({
      text: "ok",
      serializedBody: "中文中文",
      maxTextChars: 50,
      maxBodyBytes: 5,
    }).reason, "body_byte_limit");
    assert.equal(model.composerRequestSizeErrorPlan({
      text: "ok",
      serializedBody: "{}",
      maxTextChars: 50,
      maxBodyBytes: 50,
    }).error, "");
  });

  await test("plans successful-send clear, height, caret and paste behavior", () => {
    assert.equal(model.composerSuccessfulSendClearPlan({
      currentText: " sent\u00a0text ",
      sentText: "sent text",
    }).shouldClear, true);
    assert.equal(model.composerSuccessfulSendClearPlan({
      currentText: "new draft",
      sentText: "sent text",
    }).shouldClear, false);
    assert.deepEqual(model.composerEditorHeightPlan({ scrollHeight: 20 }), {
      version: model.CHAT_COMPOSER_EDITOR_MODEL_VERSION,
      resetHeight: "auto",
      height: "44px",
      heightPx: 44,
    });
    assert.equal(model.composerEditorHeightPlan({ scrollHeight: 240 }).height, "180px");
    assert.equal(model.composerCaretOffsetPlan({ selectionStart: 3, text: "abcdef" }).offset, 3);
    assert.equal(model.composerSetCaretOffsetPlan({ offset: -2 }).offset, 0);
    assert.deepEqual(model.composerPlainTextPastePlan({
      value: "hello world",
      text: "Home AI",
      selectionStart: 6,
      selectionEnd: 11,
    }), {
      version: model.CHAT_COMPOSER_EDITOR_MODEL_VERSION,
      text: "Home AI",
      selectionStart: 6,
      selectionEnd: 11,
      value: "hello Home AI",
      caretOffset: 13,
    });
  });

  await test("plans composition fallback and keydown actions", () => {
    assert.equal(model.composerSendAfterCompositionFallbackPlan({}).delayMs, 450);
    assert.equal(model.composerSendAfterCompositionFallbackPlan({ sendAfterComposition: true }).shouldSendWhenTimerFires, true);
    assert.deepEqual(model.composerKeydownActionPlan({
      key: "ArrowDown",
      mentionAvailable: true,
      groupMentionOpen: true,
    }).action, "mention_move");
    assert.equal(model.composerKeydownActionPlan({
      key: "Tab",
      mentionAvailable: true,
      groupMentionOpen: true,
    }).action, "mention_choose");
    assert.equal(model.composerKeydownActionPlan({
      key: "Enter",
      chatSearchMode: true,
    }).action, "chat_search");
    assert.equal(model.composerKeydownActionPlan({
      key: "Enter",
    }).action, "send_message");
    assert.equal(model.composerKeydownActionPlan({
      key: "Enter",
      isComposing: true,
    }).action, "none");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
