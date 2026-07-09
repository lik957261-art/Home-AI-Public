"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-composer-render-scheduler-ui.js"), "utf8");

function createHarness(fakeModel = null, options = {}) {
  const calls = [];
  const frames = [];
  const conversation = {
    scrollHeight: options.scrollHeight ?? 900,
    scrollTop: options.scrollTop ?? 250,
  };
  const context = {
    console,
    Promise,
    globalThis: null,
    window: {
      __homeAiImportChatComposerRenderSchedulerModel(importPath) {
        context.importedPath = importPath;
        return Promise.resolve(fakeModel);
      },
    },
    state: {
      renderScheduled: Boolean(options.renderScheduled),
      shouldStickToBottom: false,
      preservedBottomOffset: 0,
    },
    $: (id) => (id === "conversation" ? conversation : null),
    currentThreadRouteSnapshot: () => {
      calls.push("snapshot");
      return { id: "route-1" };
    },
    conversationUserScrollProtectActive: () => {
      calls.push("protect");
      return Boolean(options.userScrollProtected);
    },
    shouldForceChatStickToBottom: () => {
      calls.push("force");
      return Boolean(options.forceStickToBottom);
    },
    isNearBottom: () => {
      calls.push("near");
      return options.nearBottom !== false;
    },
    currentThreadRouteMatches: (snapshot) => {
      calls.push(["matches", snapshot?.id || ""]);
      return options.routeMatches !== false;
    },
    renderCurrentThread: (renderOptions) => calls.push(["render", renderOptions]),
    requestAnimationFrame: (callback) => {
      frames.push(callback);
      calls.push("raf");
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-composer-render-scheduler-ui.js" });
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
  await test("classic render scheduler adapter declares bounded ESM import path", () => {
    assert.match(source, /CHAT_COMPOSER_RENDER_SCHEDULER_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/chat-composer-render-scheduler-model\/chat-composer-render-scheduler-model\.js/);
    assert.match(source, /__homeAiImportChatComposerRenderSchedulerModel/);
    assert.match(source, /currentChatComposerRenderSchedulerModel/);
    assert.match(source, /composerRenderSchedulePlan/);
    assert.match(source, /composerRenderFramePlan/);
  });

  await test("classic adapter consumes ESM model for scheduling and frame render", async () => {
    const modelCalls = [];
    const fakeModel = {
      composerRenderSchedulePlan(input) {
        modelCalls.push(["schedule", input.nearBottom, input.scrollHeight, input.scrollTop]);
        return {
          shouldSchedule: true,
          shouldStickToBottom: false,
          preservedBottomOffset: 321,
        };
      },
      composerRenderFramePlan(input) {
        modelCalls.push(["frame", input.routeMatches, input.shouldStickToBottom]);
        return {
          shouldRender: true,
          renderOptions: { stickToBottom: false, model: true },
        };
      },
    };
    const { calls, context, frames } = createHarness(fakeModel);
    await context.importChatComposerRenderSchedulerModel(context.window);

    context.scheduleRenderCurrentThread();

    assert.equal(context.importedPath, "/vite-islands/chat-composer-render-scheduler-model/chat-composer-render-scheduler-model.js");
    assert.equal(context.state.renderScheduled, true);
    assert.equal(context.state.shouldStickToBottom, false);
    assert.equal(context.state.preservedBottomOffset, 321);
    assert.equal(frames.length, 1);
    assert.equal(calls.some((entry) => Array.isArray(entry) && entry[0] === "render"), false);

    frames[0]();

    assert.equal(context.state.renderScheduled, false);
    assert.deepEqual(calls.find((entry) => Array.isArray(entry) && entry[0] === "render"), [
      "render",
      { stickToBottom: false, model: true },
    ]);
    assert.deepEqual(modelCalls, [
      ["schedule", true, 900, 250],
      ["frame", true, false],
    ]);
  });

  await test("classic adapter honors ESM frame plan that blocks stale route rendering", async () => {
    const fakeModel = {
      composerRenderSchedulePlan() {
        return {
          shouldSchedule: true,
          shouldStickToBottom: true,
          preservedBottomOffset: 100,
        };
      },
      composerRenderFramePlan() {
        return { shouldRender: false, renderOptions: null };
      },
    };
    const { calls, context, frames } = createHarness(fakeModel);
    await context.importChatComposerRenderSchedulerModel(context.window);

    context.scheduleRenderCurrentThread();
    frames[0]();

    assert.equal(context.state.renderScheduled, false);
    assert.equal(calls.some((entry) => Array.isArray(entry) && entry[0] === "render"), false);
  });

  await test("classic fallback remains usable without loaded ESM model", () => {
    const { calls, context, frames } = createHarness({}, {
      scrollHeight: 900,
      scrollTop: 250,
      nearBottom: true,
      routeMatches: true,
    });

    context.scheduleRenderCurrentThread();

    assert.equal(context.state.renderScheduled, true);
    assert.equal(context.state.shouldStickToBottom, true);
    assert.equal(context.state.preservedBottomOffset, 650);
    assert.equal(frames.length, 1);

    frames[0]();

    const renderCall = calls.find((entry) => Array.isArray(entry) && entry[0] === "render");
    assert.equal(renderCall[0], "render");
    assert.equal(renderCall[1].stickToBottom, true);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
