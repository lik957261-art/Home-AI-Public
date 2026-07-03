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
    "src/vite-islands/navigation-shell/task-topic-shell-model.mjs",
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
  await test("task/topic model remains a pure Vite module", async () => {
    const source = read("src/vite-islands/navigation-shell/task-topic-shell-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\.state\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
  });

  await test("directory topic helpers group eligible topics by route", async () => {
    const model = await loadModel();
    const groups = [
      {
        id: "topic_a",
        title: "A",
        updatedAt: "2026-07-02T10:00:00.000Z",
        directoryRoute: { workspaceId: "owner", projectId: "docs", root: "/Home AI/docs", label: "Home AI / docs" },
      },
      {
        id: "topic_b",
        title: "B",
        updatedAt: "2026-07-02T09:00:00.000Z",
        directoryRoute: { workspaceId: "owner", projectId: "docs", root: "/Home AI/docs", label: "Home AI / docs" },
      },
      {
        id: "plugin_topic",
        pluginTopic: true,
        directoryRoute: { workspaceId: "owner", projectId: "docs", root: "/Home AI/docs" },
      },
    ];
    const collections = model.directoryTopicCollectionsForGroups(groups);
    assert.equal(collections.length, 1);
    assert.equal(collections[0].label, "Home AI / docs");
    assert.deepEqual(collections[0].groups.map((group) => group.id), ["topic_a", "topic_b"]);
    assert.equal(collections[0].defaultGroup.id, "topic_a");
    assert.deepEqual([...model.directoryTopicCollectionGroupIds(collections)].sort(), ["topic_a", "topic_b"]);
  });

  await test("task/topic shell separates directory, regular, plugin, and shared rows", async () => {
    const model = await loadModel();
    const thread = {
      id: "thread_tasks",
      taskGroups: [
        {
          id: "regular",
          title: "普通话题",
          status: "open",
          updatedAt: "2026-07-02T08:00:00.000Z",
        },
        {
          id: "directory",
          title: "目录话题",
          status: "open",
          updatedAt: "2026-07-02T10:00:00.000Z",
          directoryRoute: { workspaceId: "owner", projectId: "docs", root: "/Home AI/docs", label: "Home AI / docs" },
        },
        {
          id: "hidden_case",
          title: "案例话题",
          kanbanCaseMode: "repair",
          updatedAt: "2026-07-02T12:00:00.000Z",
        },
      ],
      sharedTopicGroups: [
        {
          id: "shared",
          title: "共享话题",
          sharedTopic: true,
          sourceThreadId: "thread_source",
          updatedAt: "2026-07-02T07:00:00.000Z",
        },
      ],
      pluginTopicGroups: [
        {
          id: "plugin",
          pluginId: "wardrobe",
          pluginTopic: true,
          title: "衣橱",
          updatedAt: "2026-07-02T11:00:00.000Z",
        },
      ],
    };
    const shell = model.buildTaskTopicShellModel(thread, {
      directoryTopicCollectionsReadySignature: "",
    });
    assert.equal(shell.threadId, "thread_tasks");
    assert.equal(shell.sourceGroupCount, 3);
    assert.equal(shell.sharedGroupCount, 1);
    assert.equal(shell.pluginGroupCount, 1);
    assert.equal(shell.directoryCollectionCount, 1);
    assert.equal(shell.directoryTopicCount, 1);
    assert.equal(shell.regularGroupCount, 2);
    assert.deepEqual(shell.visibleRegularGroups.map((group) => group.id).sort(), ["regular", "shared"]);
    assert.equal(shell.pluginCards[0].pluginId, "wardrobe");
    assert.match(shell.renderSignature, /^[a-f0-9]{8}$/);
    assert.match(shell.directoryTopicSignature, /^thread_tasks::/);
    assert.equal(shell.directoryCollectionsReady, true);
    assert.equal(shell.shouldDeferDirectoryTopics, false);
  });

  await test("task/topic shell keeps not-ready indexed-free path observable", async () => {
    const model = await loadModel();
    const shell = model.buildTaskTopicShellModel(
      { id: "thread_empty", taskGroups: [] },
      {},
      { directoryTopicCollectionsReady: false },
    );
    assert.equal(shell.directoryCollectionsReady, true);
    assert.equal(shell.directoryCollectionCount, 0);
    assert.equal(shell.emptyStateText, "还没有话题。发送消息后会在这里形成话题。");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
