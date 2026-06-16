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
    },
  };
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
  await testDirectoryDeleteUsesOwnerOnceTokenOutsideOwnerWorkspace();
  await testDirectoryDeleteStillUsesOnceTokenWhenTimedElevationLooksActive();
  await testElevatedRetryFailureShowsToast();
  await testDirectoryThreadFailureShowsToast();
  testOnceTokenHelperKeepsOwnerWorkspaceDefault();
  console.log("directory delete UI tests passed");
})();
