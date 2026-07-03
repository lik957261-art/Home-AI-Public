"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadRouteSyncModel() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/navigation-shell/route-sync-model.mjs",
  )).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
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
  await test("navigation route sync model stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/route-sync-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
    assert.match(source, /URLSearchParams/);
  });

  await test("route sync parses bounded task topic query params into app state", async () => {
    const model = await loadRouteSyncModel();
    const result = model.navigationRoutePatchFromCurrentRoute({
      search: "?view=topic&singleWindowMode=task&workspaceId=owner&threadId=thread_root&taskGroupId=topic_docs&pluginId=wardrobe&launchToken=secret",
    });
    assert.equal(result.hasRoute, true);
    assert.deepEqual(result.routePatch, {
      viewMode: "tasks",
      singleWindowMode: "task",
      selectedWorkspaceId: "owner",
      workspaceId: "owner",
      currentThreadId: "thread_root",
      threadId: "thread_root",
      currentTaskGroupId: "topic_docs",
      taskGroupId: "topic_docs",
      pluginContextNavPluginId: "wardrobe",
      pluginId: "wardrobe",
    });
  });

  await test("route sync builds stable Vite preview URLs without unsafe params", async () => {
    const model = await loadRouteSyncModel();
    assert.equal(
      model.navigationPreviewUrlForPatch({
        viewMode: "tasks",
        singleWindowMode: "task",
        workspaceId: "owner",
        threadId: "thread_root",
        taskGroupId: "../topic_docs",
        pluginId: "wardrobe",
        launchToken: "secret",
      }, {
        pathname: "/vite-navigation-shell-preview/",
      }),
      "/vite-navigation-shell-preview/?view=tasks&singleWindowMode=task&workspaceId=owner&threadId=thread_root&taskGroupId=topic_docs&pluginId=wardrobe",
    );
  });

  await test("route sync clears stale task detail state for non-task routes", async () => {
    const model = await loadRouteSyncModel();
    const result = model.navigationRoutePatchFromCurrentRoute({
      search: "?view=chat&workspaceId=owner&threadId=thread_root",
    });
    assert.equal(result.hasRoute, true);
    assert.equal(result.routePatch.viewMode, "chat");
    assert.equal(result.routePatch.currentTaskGroupId, "");
    assert.equal(result.routePatch.taskGroupId, "");
    assert.equal(result.routePatch.pluginContextNavPluginId, "");
    assert.equal(result.routePatch.pluginId, "");
  });

  await test("route sync chooses task-list root thread for task root URL state", async () => {
    const model = await loadRouteSyncModel();
    const patch = model.routePatchFromState({
      viewMode: "tasks",
      singleWindowMode: "task",
      selectedWorkspaceId: "owner",
      currentThreadId: "thread_detail",
      taskListThreadId: "thread_root",
      currentTaskGroupId: "",
    });
    assert.equal(patch.threadId, "thread_root");
    assert.equal(patch.taskGroupId, undefined);
    assert.equal(model.previewRouteSummary(patch).view, "tasks");
    assert.equal(model.previewRouteSummary(patch).threadId, "thread_root");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
