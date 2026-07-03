"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

async function loadModel() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/navigation-shell/model.mjs",
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
  await test("Vite config builds a development navigation shell island", async () => {
    const configText = read("vite.config.js");
    assert.match(configText, /navigation-shell/);
    assert.match(configText, /\/vite-navigation-shell-preview\//);
    assert.match(configText, /src\/vite-islands\/navigation-shell\/main\.mjs/);
    assert.doesNotMatch(configText, /public\/index\.html/);
    assert.doesNotMatch(configText, /service-worker\.js/);
  });

  await test("preview page does not replace the primary PWA shell", async () => {
    const devPreview = read("src/vite-islands/navigation-shell/index.html");
    const builtPreview = read("public/vite-preview/navigation-shell.html");
    const indexHtml = read("public/index.html");
    const serviceWorker = read("public/service-worker.js");
    assert.match(devPreview, /\/src\/vite-islands\/navigation-shell\/main\.mjs/);
    assert.match(builtPreview, /\/vite-islands\/navigation-shell\/navigation-shell\.js/);
    assert.doesNotMatch(indexHtml, /vite-islands\/navigation-shell/);
    assert.doesNotMatch(indexHtml, /vite-preview\/navigation-shell/);
    assert.doesNotMatch(serviceWorker, /vite-islands\/navigation-shell/);
    assert.doesNotMatch(serviceWorker, /vite-preview\/navigation-shell/);
  });

  await test("source uses runtime facade and avoids unmanaged browser boundaries", async () => {
    const source = read("src/vite-islands/navigation-shell/main.mjs");
    const modelSource = read("src/vite-islands/navigation-shell/model.mjs");
    assert.match(source, /createHomeAiRuntimeFacade/);
    assert.match(source, /HomeAiRuntimeFacade/);
    assert.match(source, /runtime\.state/);
    assert.match(source, /runtime\.route/);
    assert.match(source, /task-topic-root-renderer\.mjs/);
    assert.match(source, /task-topic-action-model\.mjs/);
    assert.match(source, /task-topic-data-source\.mjs/);
    assert.match(source, /task-topic-cache-reconciliation-model\.mjs/);
    assert.match(source, /task-topic-selected-view-model\.mjs/);
    assert.match(source, /route-sync-model\.mjs/);
    assert.match(source, /navigation-shell-preview:route-synced/);
    assert.match(source, /navigation-shell-preview:task-topic-root-read/);
    assert.match(source, /loadTaskTopicRootThread/);
    assert.match(source, /buildTaskTopicReadStatePatch/);
    assert.match(source, /popstate/);
    assert.match(modelSource, /task-topic-shell-model\.mjs/);
    assert.match(modelSource, /task-topic-compatibility-adapter\.mjs/);
    assert.match(modelSource, /task-topic-action-model\.mjs/);
    assert.match(source, /HomeAIViteNavigationShellPreview/);
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\.state\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /HermesAppApiClient/);
  });

  await test("model normalizes navigation aliases and safe route params", async () => {
    const model = await loadModel();
    assert.equal(model.normalizeViewMode("topic"), "tasks");
    assert.equal(model.normalizeViewMode("projects"), "directories");
    assert.equal(model.normalizeViewMode("single"), "chat");
    assert.equal(model.normalizeViewMode("growth"), "growth");
    assert.equal(model.normalizeSingleWindowMode("topic"), "task");
    assert.deepEqual(
      model.safeRouteParams({
        workspaceId: "owner",
        threadId: "thread_123",
        launchToken: "secret",
        pluginId: "wardrobe",
        topicId: "../../bad",
      }),
      {
        workspaceId: "owner",
        threadId: "thread_123",
        pluginId: "wardrobe",
        topicId: "bad",
      },
    );
  });

  await test("model creates classic fallback and cache status without DOM access", async () => {
    const model = await loadModel();
    assert.equal(
      model.classicFallbackHref({
        viewMode: "tasks",
        singleWindowMode: "task",
        workspaceId: "owner",
        taskGroupId: "tg_123",
      }),
      "/?view=tasks&singleWindowMode=task&workspaceId=owner&taskGroupId=tg_123",
    );
    const viewModel = model.buildNavigationShellViewModel({
      viewMode: "topics",
      singleWindowMode: "task",
      selectedWorkspaceId: "owner",
      taskListRootCache: { signature: "task-list-root" },
      topicRootCache: { signature: "topic-root" },
      auth: { isOwner: true },
      currentThread: {
        id: "thread_detail",
        singleWindow: true,
        messagesPage: { mode: "tasks", taskGroupId: "topic_detail" },
        taskGroups: [{ id: "topic_detail", title: "Detail" }],
      },
      taskListThread: {
        id: "thread_root",
        singleWindow: true,
        taskGroups: [{ id: "topic_root", title: "Root" }],
      },
    });
    assert.equal(viewModel.viewMode, "tasks");
    assert.equal(viewModel.surface, "topics");
    assert.equal(viewModel.productionDefaultShell, "classic");
    assert.equal(viewModel.migrationStatus, "development_preview");
    assert.equal(viewModel.cache.status, "available");
    assert.equal(viewModel.cache.cacheCount, 2);
    assert.equal(viewModel.taskTopicCompatibility.source, "state.taskListThread");
    assert.equal(viewModel.taskTopicCompatibility.threadId, "thread_root");
    assert.equal(viewModel.taskTopicShell.threadId, "thread_root");
    assert.equal(viewModel.taskTopicActions.visibleRegularGroups[0].action.routePatch.currentTaskGroupId, "topic_root");
    assert.ok(viewModel.tabs.some((tab) => tab.label === "系统控制台" && tab.disabled === false));
  });

  await test("non-Owner model disables Owner-only console tab", async () => {
    const model = await loadModel();
    const viewModel = model.buildNavigationShellViewModel({
      viewMode: "system-console",
      auth: { isOwner: false },
    });
    const ownerTab = viewModel.tabs.find((tab) => tab.viewMode === "system-console");
    assert.equal(ownerTab.disabled, true);
    assert.equal(ownerTab.href, "");
  });

  await test("built artifact exists after npm run build:vite", async () => {
    assert.ok(
      exists("public/vite-islands/navigation-shell/navigation-shell.js"),
      "run npm run build:vite before this test",
    );
    const output = read("public/vite-islands/navigation-shell/navigation-shell.js");
    assert.match(output, /导航 Shell 预览/);
    assert.match(output, /话题根模型/);
    assert.match(output, /Render signature/);
    assert.match(output, /任务根缓存/);
    assert.match(output, /data-vns-topic-action/);
    assert.match(output, /route-synced/);
    assert.match(output, /task-topic-root-read/);
    assert.match(output, /线程只读 API/);
    assert.match(output, /Vite dev mock/);
    assert.match(output, /选中话题/);
    assert.match(output, /选中话题读回/);
    assert.match(output, /消息摘要/);
    assert.match(output, /消息数/);
    assert.match(output, /已加载/);
    assert.match(output, /更多历史/);
    assert.match(output, /taskTopicSelectedThread/);
    assert.match(output, /classic shell/);
    assert.match(output, /HomeAIViteNavigationShellPreview/);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
