"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/navigation-shell/app-shell-model.mjs");

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
  const model = await loadModel();

  await test("app shell model stays browser-boundary free", () => {
    const source = read("src/vite-islands/navigation-shell/app-shell-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|globalThis|navigator|localStorage|sessionStorage|fetch|setTimeout|setInterval)\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.doesNotMatch(source, /\bstate\s*[\.\[]/);
    assert.match(source, /APP_SHELL_MODEL_VERSION/);
  });

  await test("plans shell ids, clamps, and config lists", () => {
    assert.equal(model.isSingleWindowConversationTaskGroupIdPlan({
      value: "single-window-group",
      singleWindowChatTaskGroupId: "single-window-chat",
      singleWindowGroupChatTaskGroupId: "single-window-group",
    }), true);
    assert.equal(model.isSingleWindowConversationTaskGroupIdPlan({
      value: "task",
      singleWindowChatTaskGroupId: "single-window-chat",
      singleWindowGroupChatTaskGroupId: "single-window-group",
    }), false);
    assert.equal(model.clamp01Plan(1.4), 1);
    assert.equal(model.clamp01Plan(-0.2), 0);
    assert.deepEqual(model.splitConfigListPlan("a,b，c;c；a\n d "), ["a", "b", "c", "d"]);
    assert.equal(model.joinConfigListPlan(["a", "b", "a"]), "a\nb");
  });

  await test("plans workspace defaults request and patch", () => {
    assert.deepEqual(model.workspaceDefaultsRequestPlan({ workspaceId: "  alice  " }), {
      username: "alice",
      shouldClear: false,
      params: [["username", "alice"]],
    });
    assert.deepEqual(model.workspaceDefaultsRequestPlan({
      workspaceId: "alice",
      labelValue: "Alice Media",
      labelManual: true,
    }), {
      username: "alice",
      shouldClear: false,
      params: [["username", "alice"], ["label", "Alice Media"]],
    });
    assert.deepEqual(model.workspaceDefaultsRequestPlan({ workspaceId: " " }), {
      username: "",
      shouldClear: true,
      params: [],
    });
    assert.deepEqual(model.workspaceDefaultsPatchPlan({
      username: "alice",
      defaults: {
        label: "",
        defaultWorkspace: "/Users/example/path",
        allowedRoots: ["/Users/example/path", "/Volumes/Media"],
        allowedToolsets: ["music", "movie"],
        workspaceId: "alice",
      },
    }), {
      label: "alice",
      root: "/Users/example/path",
      allowedRoots: "/Users/example/path",
      toolsets: "music, movie",
      hintText: "ID: alice",
    });
  });

  await test("plans message timestamps and elapsed labels", () => {
    assert.equal(model.formatElapsedDurationPlan("2026-07-06T10:00:00.000Z", "2026-07-06T10:01:05.000Z"), "1分5秒");
    assert.equal(model.messageDisplayTimestampPlan({
      role: "user",
      submittedAt: "2026-07-06T10:00:00.000Z",
      createdAt: "older",
    }), "2026-07-06T10:00:00.000Z");
    assert.equal(model.messageDisplayTimestampPlan({
      role: "assistant",
      completedAt: "2026-07-06T10:01:05.000Z",
    }), "2026-07-06T10:01:05.000Z");
    assert.match(model.messageDisplayTimeLabelPlan({
      role: "assistant",
      startedAt: "2026-07-06T10:00:00.000Z",
      completedAt: "2026-07-06T10:01:05.000Z",
    }), /耗时1分5秒$/);
    assert.equal(model.messageDisplayTimeLabelPlan({ role: "assistant", status: "running" }), "等待反馈");
    assert.equal(model.messageTimelineTimestampPlan({
      role: "assistant",
      updatedAt: "2026-07-06T10:02:00.000Z",
    }), "2026-07-06T10:02:00.000Z");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
