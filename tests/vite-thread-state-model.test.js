"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/thread-state-model.mjs");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

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
  await test("thread-state model stays browser-boundary free", () => {
    const source = read("src/vite-islands/chat-runtime/thread-state-model.mjs");
    assert.doesNotMatch(source, /\b(?:Window|document|localStorage|sessionStorage|fetch)\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("plans single-window modes, freshness, and cache keys", async () => {
    const model = await loadModel();
    const state = {
      singleWindowRequestSeq: 7,
      selectedWorkspaceId: "owner",
      viewMode: "single",
      singleWindowMode: "chat",
      groupChatOpen: true,
      currentTaskGroupId: "",
    };
    const request = {
      seq: 7,
      workspaceId: "owner",
      viewMode: "single",
      singleWindowMode: "chat",
      messageMode: "chat",
      groupChat: true,
    };
    assert.equal(model.currentSingleWindowMessageModePlan({ state }).messageMode, "chat");
    assert.equal(model.singleWindowRequestStillCurrentPlan({ state, request }).stillCurrent, true);
    assert.equal(model.singleWindowRequestStillCurrentPlan({
      state: Object.assign({}, state, { groupChatOpen: false }),
      request,
    }).reason, "chat_scope_mismatch");
    assert.equal(model.singleWindowSurfaceCacheKeyPlan({ state, request }).key, "single:owner:chat:group");
    assert.equal(model.currentMainConversationSurfaceCacheKeyPlan({ state }).key, "single:owner:chat:group");
    assert.deepEqual(model.mainConversationSurfaceRequestPlan({ state }).request, Object.assign({ taskGroupId: "" }, request));
  });

  await test("plans API body and render-skip decisions without side effects", async () => {
    const model = await loadModel();
    const request = model.singleWindowRequestPlan({
      state: {
        singleWindowRequestSeq: 4,
        selectedWorkspaceId: "owner",
        viewMode: "tasks",
        singleWindowMode: "task",
        currentTaskGroupId: "",
      },
      options: {},
      messageMode: "tasks",
    }).request;
    assert.deepEqual(request, {
      seq: 5,
      workspaceId: "owner",
      viewMode: "tasks",
      singleWindowMode: "task",
      taskGroupId: "",
      messageMode: "tasks",
      groupChat: false,
    });
    assert.deepEqual(model.singleWindowRequestBodyPlan({
      request,
      taskMessageLimit: 80,
      taskDetailMessageLimit: 30,
      chatMessageLimit: 40,
    }).body, {
      workspaceId: "owner",
      groupChat: false,
      messageMode: "tasks",
      taskGroupId: "",
      messageLimit: 80,
    });
    const renderPlan = model.singleWindowRefreshRenderPlan({
      messageMode: "tasks",
      currentTaskGroupId: "",
      beforeRefreshSignature: "same",
      afterRefreshSignature: "same",
      hasRenderedTaskRoot: true,
      preserveTaskListScroll: true,
      currentScrollTop: 42,
    });
    assert.equal(renderPlan.skipUnchangedTaskRender, true);
    assert.equal(renderPlan.restoreTaskListScrollTop, 42);
  });

  await test("plans shell and bounded localStorage values while classic remains executor", async () => {
    const model = await loadModel();
    assert.deepEqual(model.singleWindowPendingShellPlan({
      state: { viewMode: "single", singleWindowMode: "chat" },
      options: { reason: "cache_miss" },
    }), {
      version: model.THREAD_STATE_MODEL_VERSION,
      applies: true,
      resetRecoveryAttempts: true,
      reason: "cache_miss",
      shouldScheduleRecovery: true,
    });
    assert.deepEqual(model.singleWindowErrorShellPlan({
      state: { viewMode: "single", singleWindowMode: "chat" },
      error: { code: "timeout" },
    }), {
      version: model.THREAD_STATE_MODEL_VERSION,
      applies: true,
      status: "timeout",
      statusSuffix: " (timeout)",
    });
    assert.deepEqual(model.groupChatOpenStoragePlan(true), {
      version: model.THREAD_STATE_MODEL_VERSION,
      key: "hermesWebGroupChatOpen",
      value: "1",
    });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
