"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/composer-render-scheduler-model.mjs");

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

  await test("composer render scheduler model stays browser-global free", () => {
    const source = fs.readFileSync(modelPath, "utf8");
    assert.match(source, /CHAT_COMPOSER_RENDER_SCHEDULER_MODEL_VERSION/);
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bglobalThis\b/);
    assert.doesNotMatch(source, /\bdocument\./);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
  });

  await test("plans render scheduling and scroll preservation", () => {
    assert.deepEqual(model.composerRenderSchedulePlan({
      renderScheduled: true,
      hasConversation: true,
      userScrollProtected: false,
      forceStickToBottom: true,
      nearBottom: true,
      scrollHeight: 900,
      scrollTop: 300,
    }), {
      version: model.CHAT_COMPOSER_RENDER_SCHEDULER_MODEL_VERSION,
      shouldSchedule: false,
      shouldStickToBottom: false,
      preservedBottomOffset: 0,
    });

    assert.equal(model.composerRenderSchedulePlan({
      renderScheduled: false,
      hasConversation: false,
    }).shouldSchedule, false);

    assert.deepEqual(model.composerRenderSchedulePlan({
      renderScheduled: false,
      hasConversation: true,
      userScrollProtected: false,
      forceStickToBottom: false,
      nearBottom: true,
      scrollHeight: 900,
      scrollTop: 300,
    }), {
      version: model.CHAT_COMPOSER_RENDER_SCHEDULER_MODEL_VERSION,
      shouldSchedule: true,
      shouldStickToBottom: true,
      preservedBottomOffset: 600,
    });

    assert.deepEqual(model.composerRenderSchedulePlan({
      renderScheduled: false,
      hasConversation: true,
      userScrollProtected: true,
      forceStickToBottom: true,
      nearBottom: true,
      scrollHeight: 900,
      scrollTop: 300,
    }), {
      version: model.CHAT_COMPOSER_RENDER_SCHEDULER_MODEL_VERSION,
      shouldSchedule: true,
      shouldStickToBottom: false,
      preservedBottomOffset: 600,
    });
  });

  await test("plans render frame route guards", () => {
    assert.deepEqual(model.composerRenderFramePlan({
      routeMatches: true,
      shouldStickToBottom: true,
    }), {
      version: model.CHAT_COMPOSER_RENDER_SCHEDULER_MODEL_VERSION,
      shouldRender: true,
      renderOptions: { stickToBottom: true },
    });

    assert.deepEqual(model.composerRenderFramePlan({
      routeMatches: false,
      shouldStickToBottom: true,
    }), {
      version: model.CHAT_COMPOSER_RENDER_SCHEDULER_MODEL_VERSION,
      shouldRender: false,
      renderOptions: null,
    });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
