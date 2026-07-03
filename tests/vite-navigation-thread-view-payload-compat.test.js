"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createThreadViewService } = require("../adapters/thread-view-service");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadViteModules() {
  const stamp = `${Date.now()}-${Math.random()}`;
  const dataSourceUrl = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/navigation-shell/task-topic-data-source.mjs",
  )).href;
  const selectedViewUrl = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/navigation-shell/task-topic-selected-view-model.mjs",
  )).href;
  const [dataSource, selectedView] = await Promise.all([
    import(`${dataSourceUrl}?test=${stamp}`),
    import(`${selectedViewUrl}?test=${stamp}`),
  ]);
  return { dataSource, selectedView };
}

function makeThread() {
  const base = "2026-07-02T09:00:00.000Z";
  return {
    id: "thread_vite_real_payload",
    title: "Vite real payload fixture",
    workspaceId: "owner",
    projectId: "single-window",
    subprojectId: "",
    singleWindow: true,
    hermesSessionId: "session_vite_real_payload",
    status: "idle",
    activeRunIds: [],
    createdAt: base,
    updatedAt: "2026-07-02T09:05:00.000Z",
    taskGroupMeta: {
      topic_docs: { title: "Vite docs", updatedAt: "2026-07-02T09:04:00.000Z" },
      topic_other: { title: "Other", updatedAt: "2026-07-02T09:03:00.000Z" },
    },
    messages: [
      {
        id: "chat_user",
        role: "user",
        taskGroupId: "chat",
        content: "classic chat message must not enter task payload",
        createdAt: base,
      },
      {
        id: "topic_docs_1",
        role: "user",
        taskGroupId: "topic_docs",
        content: "第一条 Vite 文档话题消息",
        createdAt: "2026-07-02T09:01:00.000Z",
      },
      {
        id: "topic_docs_2",
        role: "assistant",
        taskGroupId: "topic_docs",
        content: "第二条 Vite 文档话题消息",
        status: "done",
        artifacts: [{ id: "artifact_docs_2", name: "docs.md" }],
        createdAt: "2026-07-02T09:02:00.000Z",
      },
      {
        id: "topic_other_1",
        role: "assistant",
        taskGroupId: "topic_other",
        content: "不应进入选中话题详情",
        createdAt: "2026-07-02T09:03:00.000Z",
      },
      {
        id: "topic_docs_3",
        role: "assistant",
        taskGroupId: "topic_docs",
        content: "第三条 Vite 文档话题消息",
        status: "running",
        toolCalls: [{ id: "tool_docs_3" }],
        createdAt: "2026-07-02T09:04:00.000Z",
      },
      {
        id: "group_chat_user",
        role: "user",
        taskGroupId: "group-chat",
        content: "group chat message must not enter task payload",
        createdAt: "2026-07-02T09:05:00.000Z",
      },
    ],
    events: [],
  };
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
  await test("compat test stays tied to real thread-view service and pure Vite modules", async () => {
    const source = read("tests/vite-navigation-thread-view-payload-compat.test.js");
    assert.match(source, /createThreadViewService/);
    assert.match(source, /compactThreadWithMessagePage/);
    assert.equal(source.includes(["X", "Hermes", "Web", "Key"].join("-")), false);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.equal(source.includes(["local", "Storage"].join("")), false);
  });

  await test("selected topic preview accepts compactThreadWithMessagePage payload", async () => {
    const service = createThreadViewService({ threadMessageInitialLimit: 30 });
    const { dataSource, selectedView } = await loadViteModules();
    const thread = service.compactThreadWithMessagePage(makeThread(), {
      mode: "tasks",
      taskGroupId: "topic_docs",
      limit: 2,
    });

    assert.deepEqual(thread.messages.map((message) => message.id), ["topic_docs_2", "topic_docs_3"]);
    assert.equal(thread.messagesPage.mode, "tasks");
    assert.equal(thread.messagesPage.taskGroupId, "topic_docs");
    assert.equal(thread.messagesPage.total, 3);
    assert.equal(thread.messagesPage.loaded, 2);
    assert.equal(thread.messagesPage.hasMoreBefore, true);
    assert.equal(thread.messagesPage.oldestMessageId, "topic_docs_2");
    assert.equal(thread.messagesPage.newestMessageId, "topic_docs_3");

    const normalized = dataSource.normalizeThreadReadPayload({ thread, source: "thread_view_service_fixture" }, {
      taskGroupId: "topic_docs",
    });
    assert.equal(normalized.ok, true);
    assert.equal(normalized.messageCount, 3);
    assert.equal(normalized.totalMessageCount, 3);
    assert.equal(normalized.loadedMessageCount, 2);
    assert.equal(normalized.hasMoreBefore, true);

    const view = selectedView.buildSelectedTopicViewModel(thread, {
      taskTopicReadTaskGroupId: normalized.selectedTaskGroupId,
      taskTopicReadMessageMode: normalized.messageMode,
      taskTopicReadLoadedMessageCount: normalized.loadedMessageCount,
      taskTopicReadTotalMessageCount: normalized.totalMessageCount,
      taskTopicReadHasMoreBefore: normalized.hasMoreBefore,
      taskTopicReadOldestMessageId: normalized.oldestMessageId,
      taskTopicReadNewestMessageId: normalized.newestMessageId,
      taskTopicReadSource: normalized.source,
    });

    assert.equal(view.status, "selected");
    assert.equal(view.selectedTaskGroupId, "topic_docs");
    assert.equal(view.totalMessageCount, 3);
    assert.equal(view.loadedMessageCount, 2);
    assert.equal(view.hasMoreBefore, true);
    assert.deepEqual(view.previewMessages.map((message) => message.id), ["topic_docs_2", "topic_docs_3"]);
    assert.equal(view.previewMessages[0].artifactCount, 1);
    assert.ok(view.previewMessages.every((message) => !/不应进入|chat message/.test(message.textPreview)));
  });

  await test("root task payload keeps message previews hidden until a topic is selected", async () => {
    const service = createThreadViewService({ threadMessageInitialLimit: 30 });
    const { dataSource, selectedView } = await loadViteModules();
    const thread = service.compactThreadWithMessagePage(makeThread(), {
      mode: "tasks",
      limit: 4,
    });

    assert.deepEqual(thread.messages.map((message) => message.id), [
      "topic_docs_1",
      "topic_docs_2",
      "topic_other_1",
      "topic_docs_3",
    ]);
    assert.equal(thread.messagesPage.taskGroupId, "");
    assert.equal(thread.messagesPage.total, 4);
    assert.equal(thread.messagesPage.loaded, 4);

    const normalized = dataSource.normalizeThreadReadPayload({ thread }, {});
    const view = selectedView.buildSelectedTopicViewModel(thread, {
      taskTopicReadMessageMode: normalized.messageMode,
      taskTopicReadLoadedMessageCount: normalized.loadedMessageCount,
      taskTopicReadTotalMessageCount: normalized.totalMessageCount,
    });
    assert.equal(view.status, "root");
    assert.equal(view.totalMessageCount, 4);
    assert.equal(view.loadedMessageCount, 4);
    assert.equal(view.previewMessages.length, 0);
    assert.match(view.emptyText, /选择一个话题/);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
