"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-shared-directory-ui.js"), "utf8");

function createHarness(fakeModel = null) {
  const calls = [];
  const context = {
    console,
    Promise,
    Date,
    globalThis: null,
    window: fakeModel ? {
      __homeAiImportSharedDirectoryModel(importPath) {
        calls.push(["import", importPath]);
        return Promise.resolve(fakeModel);
      },
    } : undefined,
    document: {
      querySelectorAll() {
        return [];
      },
    },
    state: {
      sharedDirectoriesLoading: false,
      sharedDirectoriesError: "",
      sharedDirectories: [{
        id: "share-a",
        label: "Docs",
        createdByLabel: "Owner",
        permission: "read_only",
        permissionLabel: "Child · read",
        targetWorkspaceIds: ["child"],
        targetLabels: ["Child"],
        scope: "selected_workspaces",
        canManage: true,
        canUnshare: true,
      }],
      sharedDirectoryAccessId: "share-a",
      workspaces: [{ id: "owner", label: "Owner" }, { id: "child", label: "Child" }],
      directoryLoading: false,
      directoryError: "",
      directoryPreview: {
        entries: [{ type: "file", name: "report.pdf", path: "/root/report.pdf", mime: "application/pdf" }],
      },
      serverFileAttachmentPickerOpen: false,
      selectedWorkspaceId: "owner",
      projects: [{ id: "docs", label: "Docs", root: "/root", source: "workspace-directory" }],
      ownerElevationOnceToken: "once-token",
    },
    escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },
    currentSearchText() {
      return "";
    },
    directoryActivePath() {
      return "/root";
    },
    renderDirectoryProjectEntries() {
      return "<div>projects</div>";
    },
    directorySearchMatches() {
      return true;
    },
    directoryEntryKind(entry) {
      return entry.type === "directory" ? "dir" : "pdf";
    },
    directoryEntryMeta() {
      return "planned meta";
    },
    directoryEntryHref() {
      return "/preview/report.pdf";
    },
    directoryEntryDocumentAttrs(entry) {
      return ` data-task-document-name="${context.escapeHtml(entry.name || "item")}"`;
    },
    comparableDirectoryPath(value) {
      return String(value || "").replace(/\/+$/g, "").toLowerCase();
    },
    canDeleteDirectoryRootProject(project) {
      return project?.source === "workspace-directory";
    },
    directoryRootProjectLabel(project) {
      return project?.label || project?.id || "Project";
    },
    ensureDirectoryThread: async () => "thread-1",
    loadProjects: async () => calls.push(["load-projects"]),
    loadDirectoryView: async () => calls.push(["load-directory"]),
    showPushToast: (...args) => calls.push(["toast", ...args]),
    openAppPromptDialog: async () => "renamed.pdf",
    openAppConfirmDialog: async () => true,
    isShareableRootProject: () => true,
    shouldOfferOwnerElevation: () => false,
    __calls: calls,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.__sharedDirectoryHarness = {
  SHARED_DIRECTORY_MODEL_ESM_PATH,
  importSharedDirectoryModel,
  currentSharedDirectoryModel,
  renderSharedDirectoryManager,
  renderDirectoryEntryMenu,
  renderDirectoryEntries,
  deleteDirectoryEntry,
  renameDirectoryEntry,
  shareRootDirectoryProject,
  toggleSharedDirectoryAccess,
  toggleShareTargetControls,
  updateSharedDirectoryAccess,
  unshareDirectory,
};`, context, { filename: "app-shared-directory-ui.js" });
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
  await test("classic shared directory adapter declares bounded ESM import path", () => {
    assert.match(source, /SHARED_DIRECTORY_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/shared-directory-model\/shared-directory-model\.js/);
    assert.match(source, /__homeAiImportSharedDirectoryModel/);
    assert.match(source, /importSharedDirectoryModel/);
    assert.match(source, /currentSharedDirectoryModel/);
    assert.match(source, /sharedDirectoryManagerViewPlan/);
    assert.match(source, /directoryEntryRowPlan|directoryEntriesViewPlan/);
  });

  await test("classic adapter consumes ESM manager and entry plans while escaping locally", async () => {
    const fakeModel = {
      sharedDirectoryManagerViewPlan() {
        return {
          state: "ready",
          title: "Shared <Dirs>",
          subtitle: "Sub <text>",
          closeLabel: "Done",
          rows: [{
            id: `share-"a"`,
            label: `Docs <unsafe>`,
            createdByLabel: "Owner",
            permissionLabel: "Child",
            targetLabels: ["Child"],
            canManage: true,
            canUnshare: true,
            permissionActionLabel: "权限",
            unshareActionLabel: "取消共享",
            controls: {
              visible: true,
              id: `share-"a"`,
              permission: "read_only",
              allWorkspaces: false,
              targetsHidden: false,
              workspaceChoices: [{ id: "child", label: "Child", checked: true }],
            },
          }],
        };
      },
      directoryEntriesViewPlan() {
        return {
          state: "ready",
          rows: [{
            entry: { name: "report.pdf" },
            kind: "pdf",
            name: `report"<.pdf`,
            path: "/root/report.pdf",
            meta: "planned meta",
            mainKind: "document-link",
            href: "/preview/report.pdf",
            documentAttrs: " data-task-document-name=\"report.pdf\"",
            selectingServerFile: false,
            menu: {
              visible: true,
              buttonLabel: "更多操作",
              actions: [{ kind: "rename", label: "改名", path: "/root/report.pdf", name: "report.pdf", type: "file" }],
            },
          }],
        };
      },
    };
    const harness = createHarness(fakeModel);
    await harness.__sharedDirectoryHarness.importSharedDirectoryModel(harness.window);
    assert.equal(harness.__sharedDirectoryHarness.currentSharedDirectoryModel(), fakeModel);
    assert.deepEqual(harness.__calls[0], ["import", "/vite-islands/shared-directory-model/shared-directory-model.js"]);
    const manager = harness.__sharedDirectoryHarness.renderSharedDirectoryManager();
    assert.match(manager, /Shared &lt;Dirs&gt;/);
    assert.match(manager, /Docs &lt;unsafe&gt;/);
    assert.match(manager, /data-save-share-directory-id="share-&quot;a&quot;"/);
    const entries = harness.__sharedDirectoryHarness.renderDirectoryEntries();
    assert.match(entries, /report&quot;&lt;\.pdf/);
    assert.match(entries, /data-rename-directory-path="\/root\/report\.pdf"/);
  });

  await test("classic adapter keeps fallback behavior without ESM", () => {
    const harness = createHarness();
    const manager = harness.__sharedDirectoryHarness.renderSharedDirectoryManager();
    assert.match(manager, /共享目录/);
    assert.match(manager, /data-share-permission/);
    const menu = harness.__sharedDirectoryHarness.renderDirectoryEntryMenu({ type: "directory", name: "folder", path: "/root/folder" });
    assert.match(menu, /data-start-directory-task-path="\/root\/folder"/);
    assert.match(menu, /data-rename-directory-path="\/root\/folder"/);
    const entries = harness.__sharedDirectoryHarness.renderDirectoryEntries();
    assert.match(entries, /data-task-document-name="report\.pdf"/);
  });

  await test("classic adapter consumes ESM request plans without moving API execution", async () => {
    const fakeModel = {
      deleteDirectoryEntryPlan({ armedUntil }) {
        if (!armedUntil) return { ok: true, action: "arm", confirmUntil: Date.now() + 5000, confirmLabel: "confirm", message: "confirm delete" };
        return { ok: true, action: "delete", progressText: "model deleting", buttonText: "model busy", restoreText: "删除", successText: "done" };
      },
      directoryDeleteRequestPlan(input) {
        return { threadId: input.threadId, path: input.path, planned: true };
      },
      renameDirectoryPromptPlan() {
        return { title: "rename", inputLabel: "name", defaultValue: "report.pdf", confirmLabel: "save", progressText: "renaming" };
      },
      directoryRenameRequestPlan(input) {
        return { threadId: input.threadId, path: input.path, name: input.nextName, planned: true };
      },
      shareRootDirectoryProjectPlan() {
        return { title: "share", message: "share it", confirmLabel: "share", requestPath: "/root", requestName: "Docs" };
      },
      sharedDirectoryAccessTogglePlan() {
        return { nextEditingId: "model-id" };
      },
      sharedDirectoryTargetsVisibilityPlan() {
        return { hidden: true };
      },
      sharedDirectoryAccessUpdateRequestPlan() {
        return { workspaceId: "owner", id: "share-a", permission: "read_only", scope: "selected_workspaces", targetWorkspaceIds: ["child"], planned: true };
      },
      unshareDirectoryRequestPlan() {
        return { workspaceId: "owner", id: "share-a", planned: true };
      },
    };
    const harness = createHarness(fakeModel);
    await harness.__sharedDirectoryHarness.importSharedDirectoryModel(harness.window);
    harness.api = async (targetPath, options) => {
      harness.__calls.push(["api", targetPath, JSON.parse(options.body)]);
      return { ok: true };
    };

    const deleteButton = {
      textContent: "删除",
      disabled: false,
      dataset: { deleteDirectoryPath: "/root/report.pdf", deleteDirectoryName: "report.pdf", deleteDirectoryType: "file" },
      setAttribute(key, value) {
        this[key] = value;
      },
    };
    await harness.__sharedDirectoryHarness.deleteDirectoryEntry(deleteButton);
    assert.equal(deleteButton.textContent, "confirm");
    deleteButton.dataset.deleteConfirmUntil = String(Date.now() + 1000);
    await harness.__sharedDirectoryHarness.deleteDirectoryEntry(deleteButton);
    assert.deepEqual(harness.__calls.find((call) => call[0] === "api" && call[1] === "/api/directories/delete")?.[2], {
      threadId: "thread-1",
      path: "/root/report.pdf",
      planned: true,
    });

    await harness.__sharedDirectoryHarness.renameDirectoryEntry({
      disabled: false,
      dataset: { renameDirectoryPath: "/root/report.pdf", renameDirectoryName: "report.pdf", renameDirectoryType: "file" },
    });
    assert.deepEqual(harness.__calls.find((call) => call[0] === "api" && call[1] === "/api/directories/rename")?.[2], {
      threadId: "thread-1",
      path: "/root/report.pdf",
      name: "renamed.pdf",
      planned: true,
    });

    await harness.__sharedDirectoryHarness.shareRootDirectoryProject({ dataset: { shareRootProject: "docs" } });
    assert.deepEqual(harness.__calls.find((call) => call[0] === "api" && call[1] === "/api/directories/share")?.[2], {
      threadId: "thread-1",
      path: "/root",
      name: "Docs",
    });

    harness.__sharedDirectoryHarness.toggleSharedDirectoryAccess({ dataset: { editShareDirectoryId: "share-a" } });
    assert.equal(harness.state.sharedDirectoryAccessId, "model-id");

    const targets = { hidden: false };
    harness.__sharedDirectoryHarness.toggleShareTargetControls({
      checked: true,
      closest() {
        return { querySelector: () => targets };
      },
    });
    assert.equal(targets.hidden, true);

    await harness.__sharedDirectoryHarness.updateSharedDirectoryAccess({
      dataset: { saveShareDirectoryId: "share-a" },
      closest() {
        return {
          querySelector(selector) {
            if (selector === "[data-share-all]") return { checked: false };
            if (selector === "[data-share-permission]") return { value: "read_only" };
            return null;
          },
          querySelectorAll() {
            return [{ value: "child" }];
          },
        };
      },
    });
    assert.equal(harness.__calls.some((call) => call[0] === "api" && call[1] === "/api/directories/share/update" && call[2].planned), true);

    await harness.__sharedDirectoryHarness.unshareDirectory({ dataset: { unshareDirectoryId: "share-a" } });
    assert.equal(harness.__calls.some((call) => call[0] === "api" && call[1] === "/api/directories/unshare" && call[2].planned), true);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
