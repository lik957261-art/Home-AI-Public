"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const directoryAutomationUi = fs.readFileSync(path.join(repoRoot, "public", "app-directory-automation-ui.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");

function createHarness() {
  const calls = [];
  const sandbox = {
    console,
    __calls: calls,
    state: {
      viewMode: "projects",
      directoryLoading: false,
      directoryPath: "/workspace/li/health",
      directoryRootPath: "/workspace/li/health",
      directoryPreview: null,
      directoryError: "",
      directoryReturnRoute: { viewMode: "tasks", currentThreadId: "thread_1" },
      directoryPluginContextActive: true,
      sharedDirectoryManagerOpen: false,
      selectedProjectId: "",
      selectedSubprojectId: "",
      projects: [],
    },
    localStorage: {
      setItem() {},
    },
    window: {
      setTimeout(fn) {
        fn();
        return 1;
      },
    },
    document: {
      querySelector() {
        return null;
      },
    },
    requestAnimationFrame(fn) {
      fn();
    },
    $() {
      return null;
    },
    comparableDirectoryPath(value) {
      return String(value || "").trim().replaceAll("\\", "/").replace(/\/+$/g, "").toLowerCase();
    },
    pathMatchesDirectoryRoot(pathText, rootText) {
      const pathValue = sandbox.comparableDirectoryPath(pathText);
      const rootValue = sandbox.comparableDirectoryPath(rootText);
      return Boolean(pathValue && rootValue && (pathValue === rootValue || pathValue.startsWith(`${rootValue}/`)));
    },
    currentWorkspace() {
      return null;
    },
    currentProject() {
      return null;
    },
    currentSubproject() {
      return null;
    },
    currentDirectoryTarget() {
      return { id: "li-health", label: "Li health", root: "/workspace/li/health" };
    },
    renderDirectorySidebar() {},
    renderDirectoryView() {},
    setComposerEnabled() {},
    persistSelectedSubproject(value) {
      calls.push({ type: "persistSubproject", value });
    },
    syncDirectoryRouteFromPath(pathText) {
      calls.push({ type: "syncRoute", pathText });
    },
    restoreDirectoryReturnRoute() {
      calls.push({ type: "restore" });
      sandbox.state.directoryReturnRoute = null;
      sandbox.state.directoryPluginContextActive = false;
      return true;
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(`${directoryAutomationUi}
loadDirectoryView = async function loadDirectoryViewForHarness(options = {}) {
  __calls.push({ type: "loadDirectoryView", options, path: state.directoryPath, returnRoute: state.directoryReturnRoute });
  if (options.resetPath || !state.directoryPath) resetDirectoryPath();
};
globalThis.__directoryHarness = { navigateDirectoryUp };
`, sandbox);
  return {
    calls,
    state: sandbox.state,
    navigateDirectoryUp: (...args) => sandbox.__directoryHarness.navigateDirectoryUp(...args),
  };
}

(async () => {
  assert.match(stylesCss, /\.directory-shell \{[\s\S]*?min-height: 100%;[\s\S]*?background: var\(--ui-page\);/);
  assert.match(stylesCss, /\.projects-mode \.conversation \{[\s\S]*?background: var\(--ui-page\);/);
  const directoryStatusBlock = stylesCss.match(/\.directory-status \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(directoryStatusBlock, /background: var\(--ui-surface-muted\);/);
  assert.doesNotMatch(directoryStatusBlock, /background: rgba\(255, 255, 252, 0\.78\);/);

  const harness = createHarness();
  assert.equal(await harness.navigateDirectoryUp(), true);
  assert.equal(harness.state.directoryPath, "");
  assert.equal(harness.state.directoryRootPath, "");
  assert.equal(harness.state.directoryReturnRoute.viewMode, "tasks");
  assert.equal(harness.state.directoryPluginContextActive, true);
  assert.equal(harness.calls.some((item) => item.type === "restore"), false);
  assert.equal(harness.calls.some((item) => item.type === "loadDirectoryView"), true);

  assert.equal(await harness.navigateDirectoryUp(), true);
  assert.equal(harness.state.directoryReturnRoute, null);
  assert.equal(harness.state.directoryPluginContextActive, false);
  assert.equal(harness.calls.filter((item) => item.type === "restore").length, 1);

  console.log("directory plugin navigation UI tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
