"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const sharedDirectoryUi = fs.readFileSync(path.join(repoRoot, "public", "app-shared-directory-ui.js"), "utf8");
const platformStatusUi = fs.readFileSync(path.join(repoRoot, "public", "app-platform-status-ui.js"), "utf8");

function makeContext(overrides = {}) {
  const calls = [];
  const context = {
    console,
    state: {
      auth: { isOwner: true },
      selectedWorkspaceId: "gitlab",
      projects: [],
      ownerElevationOnceToken: "once-token",
      directoryLoading: false,
    },
    window: { confirm: () => true },
    showPushToast: (...args) => calls.push(["toast", ...args]),
    comparableDirectoryPath: (value) => String(value || ""),
    canDeleteDirectoryRootProject: () => false,
    ensureDirectoryThread: async () => "thread-1",
    shouldOfferOwnerElevation: (err) => Boolean(err?.elevationRequired && context.state.auth?.isOwner),
    openOwnerElevationApprovalDialog: async () => true,
    ownerElevationConfirmMessage: () => "approve?",
    ownerElevationActive: () => false,
    ownerElevationOnceActive: () => false,
    activateOwnerElevationOnce: async (options) => {
      calls.push(["once", options]);
      context.state.ownerElevationOnceToken = "once-token";
    },
    clearOwnerElevationOnce: () => calls.push(["clear-once"]),
    directoryActivePath: () => "/root",
    loadProjects: async () => calls.push(["load-projects"]),
    loadDirectoryView: async () => calls.push(["load-directory"]),
    escapeHtml: (value) => String(value || ""),
    $: () => ({
      addEventListener: () => {},
      classList: { add: () => {}, remove: () => {} },
      querySelector: () => null,
      querySelectorAll: () => [],
      setAttribute: () => {},
    }),
  };
  Object.assign(context, overrides);
  vm.createContext(context);
  vm.runInContext(sharedDirectoryUi, context);
  return { calls, context };
}

function directoryButton() {
  return {
    dataset: {
      deleteDirectoryPath: "/root/folder",
      deleteDirectoryName: "folder",
      deleteDirectoryType: "directory",
      deleteConfirmUntil: String(Date.now() + 5000),
    },
  };
}

function fileButton() {
  return {
    textContent: "删除",
    disabled: false,
    dataset: {
      deleteDirectoryPath: "/root/note.txt",
      deleteDirectoryName: "note.txt",
      deleteDirectoryType: "file",
    },
  };
}

function renameFileButton() {
  return {
    dataset: {
      renameDirectoryPath: "/root/note.txt",
      renameDirectoryName: "note.txt",
      renameDirectoryType: "file",
    },
  };
}

async function testFileDeleteShowsProgressAndCallsDeleteApi() {
  const { calls, context } = makeContext();
  const button = fileButton();
  let sawInlineProgress = false;
  context.api = async (targetPath, options) => {
    sawInlineProgress = button.disabled === true && button.textContent === "删除中...";
    calls.push(["api", targetPath, JSON.parse(options.body)]);
    return { ok: true };
  };

  await context.deleteDirectoryEntry(button);
  assert.equal(button.textContent, "再点删除");
  assert.equal(calls.some((item) => item[0] === "api"), false);
  assert.equal(calls.some((item) => item[0] === "toast" && /删除文件/.test(item[1])), false);

  await context.deleteDirectoryEntry(button);

  assert.equal(sawInlineProgress, true);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "删除");
  assert.equal(calls.some((item) => item[0] === "toast" && item[1] === "正在删除文件..."), true);
  assert.deepEqual(calls.find((item) => item[0] === "api"), ["api", "/api/directories/delete", {
    threadId: "thread-1",
    path: "/root/note.txt",
  }]);
  assert.equal(calls.some((item) => item[0] === "toast" && item[1] === "已删除" && item[2] === "success"), true);
}

async function testFileDeleteMissingPathShowsToastInsteadOfSilentReturn() {
  const { calls, context } = makeContext();
  context.api = async () => {
    throw new Error("api should not be called");
  };

  await assert.rejects(() => context.deleteDirectoryEntry({ dataset: { deleteDirectoryType: "file" } }), /缺少文件路径/);

  assert.equal(calls.some((item) => item[0] === "toast" && item[1] === "删除失败：缺少文件路径" && item[2] === "error"), true);
}

async function testFileRenameCallsRenameApi() {
  const { calls, context } = makeContext({
    window: {
      confirm: () => true,
      prompt: () => "renamed.txt",
    },
  });
  context.api = async (targetPath, options) => {
    calls.push(["api", targetPath, JSON.parse(options.body)]);
    return { ok: true };
  };

  await context.renameDirectoryEntry(renameFileButton());

  assert.equal(calls.some((item) => item[0] === "toast" && item[1] === "正在改名文件..."), true);
  assert.deepEqual(calls.find((item) => item[0] === "api"), ["api", "/api/directories/rename", {
    threadId: "thread-1",
    path: "/root/note.txt",
    name: "renamed.txt",
  }]);
  assert.equal(calls.some((item) => item[0] === "toast" && item[1] === "已改名" && item[2] === "success"), true);
}

function testEntryMenuIncludesRenameForFilesAndDirectories() {
  const { context } = makeContext();
  const fileMenu = context.renderDirectoryEntryMenu({ name: "note.txt", path: "/root/note.txt", type: "file" });
  const dirMenu = context.renderDirectoryEntryMenu({ name: "folder", path: "/root/folder", type: "directory" });

  assert.match(fileMenu, /data-rename-directory-path="\/root\/note\.txt"/);
  assert.match(fileMenu, /data-delete-directory-path="\/root\/note\.txt"/);
  assert.doesNotMatch(fileMenu, /data-start-directory-task-path/);
  assert.match(dirMenu, /data-rename-directory-path="\/root\/folder"/);
  assert.match(dirMenu, /data-start-directory-task-path="\/root\/folder"/);
}

async function testDirectoryDeleteUsesOwnerOnceTokenOutsideOwnerWorkspace() {
  const { calls, context } = makeContext();
  let apiCalls = 0;
  context.api = async (_path, options) => {
    apiCalls += 1;
    const body = JSON.parse(options.body);
    calls.push(["api", apiCalls, body]);
    if (apiCalls === 1) {
      const err = new Error("Owner high-privilege approval is required to delete a non-empty directory.");
      err.elevationRequired = true;
      err.elevationScope = "owner_high_privilege";
      err.elevationReason = "Non-empty directory delete requested.";
      throw err;
    }
    assert.equal(body.ownerElevationOnceToken, "once-token");
    return { ok: true };
  };

  await context.deleteDirectoryEntry(directoryButton());

  const onceOptions = calls.find((item) => item[0] === "once")?.[1] || {};
  assert.equal(onceOptions.confirm, false);
  assert.equal(onceOptions.requireOwnerWorkspace, false);
  assert.equal(calls.some((item) => item[0] === "api" && item[1] === 2 && item[2].ownerElevationOnceToken === "once-token"), true);
  assert.equal(calls.some((item) => item[0] === "toast" && item[1] === "正在删除目录..."), true);
  assert.equal(calls.some((item) => item[0] === "toast" && item[1] === "已删除" && item[2] === "success"), true);
}

async function testDirectoryDeleteStillUsesOnceTokenWhenTimedElevationLooksActive() {
  const { calls, context } = makeContext({
    ownerElevationActive: () => true,
  });
  let apiCalls = 0;
  context.api = async (_path, options) => {
    apiCalls += 1;
    const body = JSON.parse(options.body);
    calls.push(["api", apiCalls, body]);
    if (apiCalls === 1) {
      const err = new Error("owner_high_privilege_required");
      err.elevationRequired = true;
      err.elevationScope = "owner_high_privilege";
      throw err;
    }
    assert.equal(body.ownerElevationOnceToken, "once-token");
    return { ok: true };
  };

  await context.deleteDirectoryEntry(directoryButton());

  assert.equal(calls.some((item) => item[0] === "once" && item[1]?.requireOwnerWorkspace === false), true);
  assert.equal(calls.some((item) => item[0] === "api" && item[1] === 2 && item[2].ownerElevationOnceToken === "once-token"), true);
}

async function testElevatedRetryFailureShowsToast() {
  const { calls, context } = makeContext();
  let apiCalls = 0;
  context.api = async () => {
    apiCalls += 1;
    const err = new Error(apiCalls === 1 ? "owner_high_privilege_required" : "recursive delete failed");
    err.elevationRequired = apiCalls === 1;
    err.elevationScope = "owner_high_privilege";
    throw err;
  };

  await assert.rejects(() => context.deleteDirectoryEntry(directoryButton()), /recursive delete failed/);

  assert.equal(calls.some((item) => item[0] === "toast" && item[1] === "recursive delete failed" && item[2] === "error"), true);
}

async function testDirectoryThreadFailureShowsToast() {
  const { calls, context } = makeContext({
    ensureDirectoryThread: async () => {
      throw new Error("Directory thread is unavailable.");
    },
  });
  context.api = async () => {
    throw new Error("api should not be called");
  };

  await assert.rejects(() => context.deleteDirectoryEntry(directoryButton()), /Directory thread is unavailable/);

  assert.equal(calls.some((item) => item[0] === "toast" && item[1] === "正在删除目录..."), true);
  assert.equal(calls.some((item) => item[0] === "toast" && item[1] === "Directory thread is unavailable." && item[2] === "error"), true);
}

function testOnceTokenHelperKeepsOwnerWorkspaceDefault() {
  assert.match(platformStatusUi, /options\.requireOwnerWorkspace !== false && state\.selectedWorkspaceId !== "owner"/);
}

(async () => {
  await testFileDeleteShowsProgressAndCallsDeleteApi();
  await testFileDeleteMissingPathShowsToastInsteadOfSilentReturn();
  await testFileRenameCallsRenameApi();
  testEntryMenuIncludesRenameForFilesAndDirectories();
  await testDirectoryDeleteUsesOwnerOnceTokenOutsideOwnerWorkspace();
  await testDirectoryDeleteStillUsesOnceTokenWhenTimedElevationLooksActive();
  await testElevatedRetryFailureShowsToast();
  await testDirectoryThreadFailureShowsToast();
  testOnceTokenHelperKeepsOwnerWorkspaceDefault();
  console.log("directory delete UI tests passed");
})();
