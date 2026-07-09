"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-directory-automation-ui.js"), "utf8");

function createHarness(fakeModel = null) {
  const calls = [];
  const context = {
    console,
    Promise,
    globalThis: null,
    window: fakeModel ? {
      __homeAiImportDirectoryAutomationModel(importPath) {
        calls.push(["import", importPath]);
        return Promise.resolve(fakeModel);
      },
      setTimeout(fn) {
        fn();
        return 1;
      },
    } : {
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
    localStorage: {
      setItem(key, value) {
        calls.push(["localStorage.setItem", key, value]);
      },
    },
    state: {
      displayConfig: { ownerRootFallbackLabel: "Owner" },
      directoryPath: "/workspace/health/labs",
      directoryRootPath: "/workspace/health",
      directoryPreview: null,
      projects: [
        {
          id: "health",
          label: "Health",
          root: "/workspace/health",
          source: "workspace-directory",
          children: [{ id: "labs", label: "Labs", root: "/workspace/health/labs" }],
        },
      ],
      taskDirectoryFilter: { projectId: "health", subprojectId: "labs" },
      selectedProjectId: "health",
      selectedSubprojectId: "labs",
      sharedDirectoryManagerOpen: false,
    },
    $(id) {
      if (id === "threadSearch") return { value: "" };
      return null;
    },
    currentProject() {
      return context.state.projects[0];
    },
    currentSubproject() {
      return context.state.projects[0].children[0];
    },
    currentWorkspace() {
      return { id: "owner", label: "Owner", defaultWorkspace: "/workspace" };
    },
    directoryAliasKey(value) {
      return String(value || "").toLowerCase();
    },
    comparableDirectoryPath(value) {
      return String(value || "").replaceAll("\\", "/").replace(/\/+$/g, "").toLowerCase();
    },
    pathMatchesDirectoryRoot(pathText, rootText) {
      const pathValue = context.comparableDirectoryPath(pathText);
      const rootValue = context.comparableDirectoryPath(rootText);
      return Boolean(pathValue && rootValue && (pathValue === rootValue || pathValue.startsWith(`${rootValue}/`)));
    },
    ownerDriveRootIndexForParts() {
      return -1;
    },
    directoryRouteDisplayPath(_route, fallback) {
      return fallback;
    },
    logicalDirectoryDisplayPath(pathText, label) {
      return `${label}: ${pathText}`;
    },
    relativeDisplayTailForDirectory(pathText, rootText) {
      const pathValue = String(pathText || "").replaceAll("\\", "/").replace(/\/+$/g, "");
      const rootValue = String(rootText || "").replaceAll("\\", "/").replace(/\/+$/g, "");
      return pathValue === rootValue ? "" : pathValue.slice(rootValue.length + 1);
    },
    artifactKind({ mime }) {
      return mime === "application/pdf" ? "pdf" : "file";
    },
    artifactHref({ name }) {
      return `/files/${name}`;
    },
    formatBytes(value) {
      return `${value} B`;
    },
    formatTime(value) {
      return value || "";
    },
    isMobileLayout() {
      return false;
    },
    prefersReducedMotion() {
      return false;
    },
    escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },
    __calls: calls,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.__directoryAutomationHarness = {
  DIRECTORY_AUTOMATION_MODEL_ESM_PATH,
  importDirectoryAutomationModel,
  currentDirectoryAutomationModel,
  directoryRouteOptions,
  directoryActivePath,
  parentDirectoryPath,
  directoryAttachmentForFilter,
  directoryBreadcrumbItems,
  directoryEntryKind,
  directoryEntryHref,
  directoryEntryDocumentAttrs,
  directoryEntryMeta,
  isShareableRootProject,
  canDeleteDirectoryRootProject,
};`, context, { filename: "app-directory-automation-ui.js" });
  return context;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
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
  await test("classic directory automation adapter declares bounded ESM import path", () => {
    assert.match(source, /DIRECTORY_AUTOMATION_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/directory-automation-model\/directory-automation-model\.js/);
    assert.match(source, /__homeAiImportDirectoryAutomationModel/);
    assert.match(source, /importDirectoryAutomationModel/);
    assert.match(source, /currentDirectoryAutomationModel/);
    assert.match(source, /directoryAttachmentForFilterPlan/);
  });

  await test("classic adapter consumes ESM route and breadcrumb plans", async () => {
    const fakeModel = {
      directoryRouteOptionsPlan() {
        return [{ id: "model-child", label: "Model Child" }];
      },
      directoryBreadcrumbItemsPlan() {
        return [{ label: "目录", path: "" }, { label: "Model", path: "/model" }];
      },
    };
    const harness = createHarness(fakeModel);
    await harness.__directoryAutomationHarness.importDirectoryAutomationModel(harness.window);
    assert.equal(harness.__directoryAutomationHarness.currentDirectoryAutomationModel(), fakeModel);
    assert.deepEqual(harness.__calls[0], ["import", "/vite-islands/directory-automation-model/directory-automation-model.js"]);
    assert.deepEqual(plain(harness.__directoryAutomationHarness.directoryRouteOptions()), [{ id: "model-child", label: "Model Child" }]);
    assert.deepEqual(plain(harness.__directoryAutomationHarness.directoryBreadcrumbItems()), [{ label: "目录", path: "" }, { label: "Model", path: "/model" }]);
  });

  await test("classic adapter keeps fallback behavior without ESM", () => {
    const harness = createHarness();
    assert.deepEqual(plain(harness.__directoryAutomationHarness.directoryRouteOptions()), [{ id: "labs", label: "Labs" }]);
    assert.equal(harness.__directoryAutomationHarness.directoryActivePath(), "/workspace/health/labs");
    assert.equal(harness.__directoryAutomationHarness.parentDirectoryPath("/workspace/health/labs/report.pdf"), "/workspace/health/labs");
    assert.deepEqual(plain(harness.__directoryAutomationHarness.directoryAttachmentForFilter()), {
      projectId: "health",
      subprojectId: "labs",
      label: "Health / Labs",
      path: "/workspace/health/labs",
      root: "/workspace/health/labs",
    });
  });

  await test("classic adapter uses ESM entry plans while keeping HTML escaping local", async () => {
    const fakeModel = {
      directoryEntryKindPlan() {
        return "pdf";
      },
      directoryEntryHrefPlan() {
        return "/planned/report.pdf";
      },
      directoryEntryDocumentAttrsPlan() {
        return { enabled: true, name: `bad"<name>.pdf`, mime: "application/pdf" };
      },
      directoryEntryMetaPlan() {
        return "planned meta";
      },
      isShareableRootProjectPlan() {
        return true;
      },
      canDeleteDirectoryRootProjectPlan() {
        return true;
      },
    };
    const harness = createHarness(fakeModel);
    await harness.__directoryAutomationHarness.importDirectoryAutomationModel(harness.window);
    const entry = { type: "file", name: "report.pdf", mime: "application/pdf" };
    assert.equal(harness.__directoryAutomationHarness.directoryEntryKind(entry), "pdf");
    assert.equal(harness.__directoryAutomationHarness.directoryEntryHref(entry), "/planned/report.pdf");
    assert.match(harness.__directoryAutomationHarness.directoryEntryDocumentAttrs(entry), /bad&quot;&lt;name&gt;\.pdf/);
    assert.equal(harness.__directoryAutomationHarness.directoryEntryMeta(entry), "planned meta");
    assert.equal(harness.__directoryAutomationHarness.isShareableRootProject({}), true);
    assert.equal(harness.__directoryAutomationHarness.canDeleteDirectoryRootProject({}), true);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
