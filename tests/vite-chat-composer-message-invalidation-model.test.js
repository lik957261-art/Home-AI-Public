"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/composer-message-invalidation-model.mjs");

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

  await test("composer message invalidation model stays browser-global free", () => {
    const source = fs.readFileSync(modelPath, "utf8");
    assert.match(source, /CHAT_COMPOSER_MESSAGE_INVALIDATION_MODEL_VERSION/);
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bglobalThis\b/);
    assert.doesNotMatch(source, /\bdocument\./);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
  });

  await test("classifies terminal and active composer message statuses", () => {
    assert.equal(model.composerMessageTerminalStatusPlan({ status: "done" }), true);
    assert.equal(model.composerMessageTerminalStatusPlan({ status: " failed " }), true);
    assert.equal(model.composerMessageTerminalStatusPlan({ status: "running" }), false);
    assert.equal(model.composerMessageActiveStatusPlan({ status: "queued" }), true);
    assert.equal(model.composerMessageActiveStatusPlan({ status: "RUNNING" }), true);
    assert.equal(model.composerMessageActiveStatusPlan({ status: "cancelled" }), false);
  });

  await test("plans terminal receipt refresh without exposing content", () => {
    assert.deepEqual(model.composerTerminalReceiptRefreshPlan({
      terminal: true,
      hasRefreshFunction: true,
      stickToBottom: true,
      userScrollProtected: true,
      hasProtectedScrollReporter: true,
      hasSelfCheckScheduler: true,
      delayMs: -10,
      content: "private message body",
    }), {
      version: model.CHAT_COMPOSER_MESSAGE_INVALIDATION_MODEL_VERSION,
      shouldRefresh: true,
      refreshOptions: {
        stickToBottom: true,
        delayMs: 0,
      },
      shouldReportProtectedScrollBypass: true,
      shouldScheduleSelfCheck: true,
    });

    assert.deepEqual(model.composerTerminalReceiptRefreshPlan({
      terminal: false,
      hasRefreshFunction: true,
    }), {
      version: model.CHAT_COMPOSER_MESSAGE_INVALIDATION_MODEL_VERSION,
      shouldRefresh: false,
      refreshOptions: null,
      shouldReportProtectedScrollBypass: false,
      shouldScheduleSelfCheck: false,
    });
  });

  await test("plans patched versus scheduled message projection", () => {
    assert.deepEqual(model.composerMessageProjectionPlan({
      existingIndex: 1,
      messageRole: "assistant",
      terminal: false,
      active: true,
      streamRendered: true,
      runId: "",
      fallbackRunId: "run_fallback",
    }), {
      version: model.CHAT_COMPOSER_MESSAGE_INVALIDATION_MODEL_VERSION,
      result: "patched",
      shouldScheduleFullRender: false,
      shouldRequestTerminalReceiptRefresh: false,
      shouldScheduleRunProgress: true,
      runProgressRunId: "run_fallback",
    });

    assert.deepEqual(model.composerMessageProjectionPlan({
      existingIndex: -1,
      messageRole: "assistant",
      terminal: true,
      active: false,
      streamRendered: false,
      runId: "run_terminal",
    }), {
      version: model.CHAT_COMPOSER_MESSAGE_INVALIDATION_MODEL_VERSION,
      result: "scheduled",
      shouldScheduleFullRender: true,
      shouldRequestTerminalReceiptRefresh: true,
      shouldScheduleRunProgress: false,
      runProgressRunId: "",
    });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
