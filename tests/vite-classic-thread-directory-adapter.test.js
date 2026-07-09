"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-thread-directory-ui.js"), "utf8");

function createElement() {
  return {
    innerHTML: "",
    dataset: {},
    listeners: [],
    attributes: {},
    hidden: true,
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener(type, handler) {
      this.listeners.push([type, handler]);
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
}

function createHarness(fakeModel = null) {
  const calls = [];
  const toolbar = createElement();
  const context = {
    console,
    Promise,
    globalThis: null,
    window: {
      __homeAiImportThreadDirectoryModel(importPath) {
        calls.push(["import", importPath]);
        return Promise.resolve(fakeModel);
      },
    },
    state: {
      projects: [
        {
          id: "docs",
          label: "Docs",
          root: "/Docs",
          children: [{ id: "api", label: "API", root: "/Docs/API" }],
        },
      ],
      taskDirectoryFilter: null,
      pendingTaskDirectory: "old",
      pendingTaskReasoningEffort: "high",
      pendingTaskReasoningExplicit: true,
      viewMode: "single",
      currentTaskGroupId: "topic-1",
    },
    localStorage: {
      setItem(key, value) {
        calls.push(["localStorage.setItem", key, value]);
      },
    },
    $: (id) => (id === "taskDetailToolbar" ? toolbar : null),
    escapeHtml: (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
    extractDirectoryAliases: () => ({ aliases: [{ label: "Extracted", path: "/Extracted" }] }),
    extractMediaDirectoryAliases: () => [{ label: "Media", path: "/Media", referenceKind: "media" }],
    directoryAliasKey: (value) => String(value || "").toLowerCase(),
    comparableDirectoryPath: (value) => String(value || "").toLowerCase(),
    isGenericDefaultDirectoryAlias: () => false,
    isGenericCurrentBoundDirectoryAlias: () => false,
    explicitDirectoryRouteForContext: () => null,
    semanticDirectoryRouteForMessage: () => null,
    resolveDirectoryProjectRoute: (alias) => ({ projectId: alias.projectId || "docs", subprojectId: alias.subprojectId || "", root: alias.path || "/Docs" }),
    coalesceDirectoryAliasItems: (items) => items,
    uniqueDirectoryAliasItems: (items) => items,
    isOperationalTaskDirectoryAlias: () => false,
    isContextAnchorDirectoryRoute: (route) => route?.subprojectId === "api",
    directoryRouteDisplayPath: (_route, fallback) => fallback,
    projectDisplayLabel: (project) => project?.label || project?.id || "",
    directoryAttachmentFromRoute: (projectId, subprojectId, _path, label) => ({ projectId, subprojectId, label }),
    closeTopMoreMenu: () => calls.push(["closeTopMoreMenu"]),
    isMobileLayout: () => true,
    closeSidebar: () => calls.push(["closeSidebar"]),
    renderThreads: () => calls.push(["renderThreads"]),
    renderCurrentThread: (options) => calls.push(["renderCurrentThread", options]),
    renderDirectoryAliases: (aliases) => aliases.map((alias) => alias.label || alias.path).join(","),
    renameTaskGroup: () => Promise.resolve(),
    deleteTaskGroup: () => Promise.resolve(),
    showError: (error) => calls.push(["showError", error?.message || error]),
    wireDirectoryProjectLinks: (root) => calls.push(["wireDirectoryProjectLinks", root === toolbar]),
    __calls: calls,
    __toolbar: toolbar,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.__threadDirectoryHarness = {
  THREAD_DIRECTORY_MODEL_ESM_PATH,
  importThreadDirectoryModel,
  currentThreadDirectoryModel,
  messageDirectoryAliases,
  messageExtractedDirectoryAliases,
  uniqueAliases,
  taskDirectoryRouteMatchesFilter,
  taskDirectoryFilterLabel,
  setTaskDirectoryFilter,
  clearTaskDirectoryFilter,
  renderTaskDirectoryFilterBanner,
  renderTaskDirectoryBadges,
  renderTaskDetailToolbar,
};`, context, { filename: "app-thread-directory-ui.js" });
  return context;
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
  await test("classic thread-directory adapter declares bounded ESM import path", () => {
    assert.match(source, /THREAD_DIRECTORY_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/thread-directory-model\/thread-directory-model\.js/);
    assert.match(source, /__homeAiImportThreadDirectoryModel/);
    assert.match(source, /importThreadDirectoryModel/);
    assert.match(source, /currentThreadDirectoryModel/);
    assert.match(source, /messageDirectoryAliasesPlan/);
    assert.match(source, /setTaskDirectoryFilterPlan/);
    assert.match(source, /taskDetailToolbarViewPlan/);
  });

  await test("classic adapter consumes ESM model for alias and filter plans", async () => {
    const modelCalls = [];
    const fakeModel = {
      messageDirectoryAliasesPlan(message) {
        modelCalls.push(["messageDirectoryAliasesPlan", message.id]);
        return { aliases: [{ label: "Model", path: "/Model", source: "bound" }] };
      },
      taskDirectoryRouteMatchesFilterPlan(input) {
        modelCalls.push(["taskDirectoryRouteMatchesFilterPlan", input.route.projectId, input.filter.projectId]);
        return { matches: false };
      },
    };
    const context = createHarness(fakeModel);
    await context.__threadDirectoryHarness.importThreadDirectoryModel(context.window);
    assert.deepEqual(context.__threadDirectoryHarness.messageDirectoryAliases({ id: "message-1" }), [
      { label: "Model", path: "/Model", source: "bound" },
    ]);
    assert.equal(context.__threadDirectoryHarness.taskDirectoryRouteMatchesFilter(
      { projectId: "docs", subprojectId: "" },
      { projectId: "other", subprojectId: "" },
    ), false);
    assert.deepEqual(modelCalls, [
      ["messageDirectoryAliasesPlan", "message-1"],
      ["taskDirectoryRouteMatchesFilterPlan", "docs", "other"],
    ]);
  });

  await test("classic adapter applies model mutation plans but owns state and DOM work", async () => {
    const fakeModel = {
      setTaskDirectoryFilterPlan(input) {
        return {
          ok: true,
          patch: {
            taskDirectoryFilter: {
              projectId: input.projectId,
              subprojectId: input.subprojectId,
              label: "Model Label",
              directory: input.directory,
            },
            viewMode: "tasks",
            currentTaskGroupId: "",
          },
          storage: { key: "hermesWebViewMode", value: "tasks" },
          closeTopMoreMenu: true,
          closeSidebarWhenMobile: true,
          renderCurrentThreadOptions: { stickToBottom: true },
        };
      },
      clearTaskDirectoryFilterPlan() {
        return { closeTopMoreMenu: true, render: false };
      },
      taskDirectoryFilterBannerViewPlan(input) {
        return { visible: input.active, label: `Banner ${input.label}` };
      },
      taskDirectoryFilterLabelPlan(input) {
        return { label: input.displayPath || input.filter.projectId };
      },
    };
    const context = createHarness(fakeModel);
    await context.__threadDirectoryHarness.importThreadDirectoryModel(context.window);
    context.__threadDirectoryHarness.setTaskDirectoryFilter("docs", "api", "");
    assert.equal(context.state.taskDirectoryFilter.label, "Model Label");
    assert.equal(context.state.viewMode, "tasks");
    assert.deepEqual(context.__calls.map((call) => call[0]), [
      "import",
      "localStorage.setItem",
      "closeTopMoreMenu",
      "closeSidebar",
      "renderThreads",
      "renderCurrentThread",
    ]);
    assert.match(context.__threadDirectoryHarness.renderTaskDirectoryFilterBanner(), /Banner Model Label/);
    context.__threadDirectoryHarness.clearTaskDirectoryFilter();
    assert.equal(context.state.taskDirectoryFilter, null);
    assert.equal(context.__calls.filter((call) => call[0] === "renderThreads").length, 1);
  });

  await test("classic adapter preserves legacy behavior before model load", () => {
    const context = createHarness(null);
    const aliases = context.__threadDirectoryHarness.messageDirectoryAliases({
      directoryAliases: [{ label: "Docs", path: "/Docs" }],
    });
    assert.equal(JSON.stringify(aliases), JSON.stringify([{ label: "Docs", path: "/Docs", projectId: "", subprojectId: "", source: "bound" }]));
    context.__threadDirectoryHarness.setTaskDirectoryFilter("docs", "api", "Docs / API");
    assert.equal(context.state.taskDirectoryFilter.label, "Docs / API");
    assert.ok(context.__calls.some((call) => call[0] === "renderCurrentThread"));
    assert.equal(context.__threadDirectoryHarness.renderTaskDirectoryBadges({
      id: "topic-1",
      messages: [{ id: "message-1", directoryAliases: [{ label: "Docs", path: "/Docs" }] }],
    }), '<div class="task-card-directories">Docs</div>');
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
