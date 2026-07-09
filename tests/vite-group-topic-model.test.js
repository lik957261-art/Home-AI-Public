"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/navigation-shell/group-topic-model.mjs",
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
  await test("group topic model stays browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/group-topic-model.mjs")
      .replaceAll("/api/single-window", "/api/single_window");
    assert.doesNotMatch(source, /\b(?:window|document|localStorage|sessionStorage|fetch)\b/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("plans group chat manager rows and save request", async () => {
    const model = await loadModel();
    const view = model.groupChatManagerViewPlan({
      open: true,
      selectedWorkspaceId: "owner",
      isOwner: true,
      thread: { workspaceId: "owner" },
      workspaces: [
        { id: "owner", label: "Owner" },
        { id: "child", label: "Child" },
      ],
      draftMemberIds: ["child"],
    });
    assert.equal(view.hidden, false);
    assert.equal(view.showSave, true);
    assert.deepEqual(view.rows.map((row) => [row.id, row.checked, row.disabled]), [
      ["owner", true, true],
      ["child", true, false],
    ]);

    const save = model.groupChatMemberSavePlan({
      threadId: "thread/1",
      ownerId: "owner",
      checkedIds: ["child", "owner", "child"],
    });
    assert.equal(save.path, "/api/threads/thread%2F1/group-chat");
    assert.deepEqual(save.body.memberWorkspaceIds, ["owner", "child"]);
    assert.equal(save.serializedBody, JSON.stringify({ enabled: true, memberWorkspaceIds: ["owner", "child"] }));
  });

  await test("plans thread and case-topic requests", async () => {
    const model = await loadModel();
    const query = model.threadListQueryPlan({
      workspaceId: "owner",
      projectId: "project",
      subprojectId: "sub",
      search: "receipt",
    });
    assert.deepEqual(query.entries, [
      ["workspaceId", "owner"],
      ["projectId", "project"],
      ["subprojectId", "sub"],
      ["search", "receipt"],
    ]);
    const refresh = model.caseTopicRefreshRequestPlan({ workspaceId: "child" });
    assert.equal(refresh.path, "/api/single-window");
    assert.equal(refresh.method, "POST");
    assert.equal(refresh.serializedBody, JSON.stringify({ workspaceId: "child", messageMode: "tasks" }));
  });

  await test("plans kanban topic card snapshot request and schedule", async () => {
    const model = await loadModel();
    const request = model.kanbanTopicCardSnapshotRequestPlan({
      kanbanTodoSource: true,
      caseTopicThreadCount: 2,
      workspaceId: "owner",
      boardCollectionPath: "/api/kanban/cards",
    });
    assert.equal(request.shouldRequest, true);
    assert.equal(request.boardCollectionPath, "/api/kanban/cards");
    assert.deepEqual(request.entries, [
      ["workspaceId", "owner"],
      ["limit", "500"],
      ["includeCompleted", "1"],
      ["scope", "mine"],
    ]);
    assert.equal(model.kanbanTopicCardSnapshotSchedulePlan({
      kanbanTodoSource: true,
      caseTopicThreadCount: 2,
      loading: false,
      nowMs: 2000,
      loadedAtMs: 0,
      viewMode: "tasks",
      currentTaskGroupId: "",
    }).shouldSchedule, true);
    assert.equal(model.kanbanTopicCardSnapshotSchedulePlan({
      kanbanTodoSource: true,
      caseTopicThreadCount: 2,
      loading: false,
      nowMs: 2000,
      loadedAtMs: 1900,
      maxAgeMs: 500,
    }).reason, "fresh_cache");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
