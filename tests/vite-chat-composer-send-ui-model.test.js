"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/composer-send-ui-model.mjs");

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

  await test("composer send UI model stays browser-global free", () => {
    const source = fs.readFileSync(modelPath, "utf8");
    assert.match(source, /CHAT_COMPOSER_SEND_UI_MODEL_VERSION/);
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bglobalThis\b/);
    assert.doesNotMatch(source, /\bdocument\./);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
  });

  await test("plans send-result route and task group transitions", () => {
    const thread = { messages: [{ role: "assistant" }, { role: "user", taskGroupId: "task-a" }] };
    assert.equal(model.latestUserTaskGroupId(thread), "task-a");
    assert.equal(model.createdTaskGroupIdFromSendResult({ run: { taskGroupId: "task-b" } }, thread), "task-b");
    assert.equal(model.sendResultRoutePlan({
      routeStillCurrent: false,
      expectedThreadId: "thread-2",
      currentThreadId: "thread-1",
    }).stale, true);
    assert.deepEqual(model.sendResultTaskGroupPlan({
      createsNewTask: true,
      consumedPendingDirectory: true,
      createdTaskGroupId: "task-new",
      viewMode: "tasks",
      currentTaskGroupId: "",
    }), {
      version: model.CHAT_COMPOSER_SEND_UI_MODEL_VERSION,
      nextCurrentTaskGroupId: "task-new",
      clearPendingTaskDirectory: true,
      clearTaskDirectoryFilter: true,
      refreshRequest: null,
    });
    assert.deepEqual(model.sendResultTaskGroupPlan({
      createsNewTask: true,
      consumedPendingDirectory: true,
      createdTaskGroupId: "",
      viewMode: "tasks",
      currentTaskGroupId: "",
    }).refreshRequest, { stickToBottom: true, delayMs: 220 });
  });

  await test("plans Owner elevation availability and messages", () => {
    assert.equal(model.ownerElevationErrorPlan({ elevationRequired: true, isOwner: true }).offer, true);
    assert.equal(model.ownerElevationMessagePlan({
      elevationRequired: true,
      isOwner: true,
      selectedWorkspaceId: "owner",
      status: "failed",
      currentThreadId: "thread-1",
      messageId: "message-1",
    }).offer, true);
    assert.equal(model.ownerElevationMessagePlan({
      elevationRequired: true,
      isOwner: true,
      selectedWorkspaceId: "owner",
      status: "running",
      currentThreadId: "thread-1",
      messageId: "message-1",
    }).offer, false);
    assert.match(model.ownerElevationConfirmMessagePlan({ elevationScope: "shared_skill_write" }).message, /共享或系统级 Skill/);
    assert.equal(model.ownerElevationComposerAvailablePlan({
      chatSearchMode: false,
      isOwner: true,
      selectedWorkspaceId: "owner",
      viewMode: "tasks",
    }).available, true);
  });

  await test("plans mention token, filtering, insertion, and elevation tag cleanup", () => {
    assert.deepEqual(model.ownerElevationOnceTagInfo("请 #高权限本次 运行"), { present: true });
    assert.equal(model.stripOwnerElevationOnceTags("请 #高权限本次 运行"), "请 运行");
    assert.deepEqual(model.activeGroupMentionTokenPlan({
      composerMentionAvailable: true,
      ownerElevationAvailable: true,
      text: "hello @ow",
      caret: 9,
    }), {
      start: 6,
      end: 9,
      query: "ow",
      trigger: "@",
    });
    const filtered = model.mentionOptionsForQueryPlan({
      query: "own",
      members: [
        { label: "Owner", workspaceId: "owner", mentionText: "@Owner" },
        { label: "Child", workspaceId: "child", mentionText: "@Child" },
      ],
    });
    assert.deepEqual(filtered.options.map((item) => item.workspaceId), ["owner"]);
    assert.deepEqual(model.chooseGroupMentionTextPlan({
      text: "hello @ow please",
      token: { start: 6, end: 9 },
      member: { label: "Owner", mentionText: "@Owner" },
    }), {
      version: model.CHAT_COMPOSER_SEND_UI_MODEL_VERSION,
      text: "hello @Owner  please",
      caret: 13,
      insertion: "@Owner ",
    });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
