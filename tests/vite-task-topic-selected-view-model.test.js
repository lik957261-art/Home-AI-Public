"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadSelectedViewModel() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/navigation-shell/task-topic-selected-view-model.mjs",
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
  await test("selected topic view model stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/task-topic-selected-view-model.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
  });

  await test("root readback remains explicit until a topic is selected", async () => {
    const model = await loadSelectedViewModel();
    const view = model.buildSelectedTopicViewModel({
      id: "thread_root",
      messagesPage: { mode: "tasks", total: 2, loaded: 2 },
      messages: [
        { id: "msg_a", role: "user", taskGroupId: "topic_a", content: "不应显示" },
        { id: "msg_b", role: "assistant", taskGroupId: "topic_b", content: "也不应显示" },
      ],
    }, {
      taskTopicReadSource: "vite_dev_preview_mock",
    });
    assert.equal(view.status, "root");
    assert.equal(view.selectedTaskGroupId, "");
    assert.equal(view.messageMode, "tasks");
    assert.equal(view.messageCount, 2);
    assert.equal(view.totalMessageCount, 2);
    assert.equal(view.loadedMessageCount, 2);
    assert.equal(view.source, "vite_dev_preview_mock");
    assert.equal(view.previewMessages.length, 0);
    assert.match(view.emptyText, /选择一个话题/);
  });

  await test("selected topic readback builds bounded message previews", async () => {
    const model = await loadSelectedViewModel();
    const longText = "A".repeat(220);
    const view = model.buildSelectedTopicViewModel({
      id: "thread_root",
      messagesPage: {
        mode: "tasks",
        taskGroupId: "topic_docs",
        total: 7,
        loaded: 4,
        hasMoreBefore: true,
        oldestMessageId: "msg_user",
        newestMessageId: "msg_scoped_without_group",
      },
      messages: [
          {
            id: "msg_user",
            role: "user",
            status: "sent",
            taskGroupId: "topic_docs",
            content: [{ type: "text", text: longText }],
            attachments: [{}],
          },
          {
            id: "msg_assistant",
            role: "assistant",
            status: "completed",
            taskGroupId: "topic_docs",
            content: "已读回任务话题的开发预览状态。",
            artifacts: [{ id: "artifact_1" }],
            toolCalls: [{ id: "tool_1" }],
          },
          {
            id: "msg_other",
            role: "assistant",
            status: "completed",
            taskGroupId: "topic_other",
            content: "不应显示",
          },
          {
            id: "msg_scoped_without_group",
            role: "system",
            status: "metadata",
            content: "线程接口已经按 topic_docs scoped。",
          },
        ],
    }, {
      taskTopicReadSource: "thread_read_api",
    });
    assert.equal(view.status, "selected");
    assert.equal(view.selectedTaskGroupId, "topic_docs");
    assert.equal(view.messageCount, 7);
    assert.equal(view.totalMessageCount, 7);
    assert.equal(view.loadedMessageCount, 4);
    assert.equal(view.hasMoreBefore, true);
    assert.equal(view.oldestMessageId, "msg_user");
    assert.equal(view.newestMessageId, "msg_scoped_without_group");
    assert.equal(view.previewMessages.length, 3);
    assert.equal(view.previewMessages[0].role, "user");
    assert.equal(view.previewMessages[0].attachmentCount, 1);
    assert.equal(view.previewMessages[0].textPreview.length, model.TEXT_PREVIEW_LIMIT);
    assert.equal(view.previewMessages[1].artifactCount, 1);
    assert.equal(view.previewMessages[1].toolCallCount, 1);
    assert.equal(view.previewMessages[2].role, "system");
    assert.ok(view.previewMessages.every((message) => message.textPreview !== "不应显示"));
  });

  await test("selected topic messages accept alternate page item arrays", async () => {
    const model = await loadSelectedViewModel();
    const fromPageMessages = model.selectedTopicMessages({
      messagesPage: {
        mode: "tasks",
        taskGroupId: "topic_docs",
        messages: [{ id: "msg_1", role: "assistant", content: "from messagesPage.messages" }],
      },
    }, "topic_docs");
    assert.equal(fromPageMessages.length, 1);
    assert.equal(fromPageMessages[0].textPreview, "from messagesPage.messages");

    const fromPageData = model.selectedTopicMessages({
      messagesPage: {
        mode: "tasks",
        taskGroupId: "topic_docs",
        data: [{ id: "msg_2", role: "assistant", content: "from messagesPage.data" }],
      },
    }, "topic_docs");
    assert.equal(fromPageData[0].textPreview, "from messagesPage.data");
  });

  await test("message preview tolerates structured or empty message content", async () => {
    const model = await loadSelectedViewModel();
    assert.deepEqual(
      model.messagePreview({
        id: "msg_1",
        role: "unknown-role",
        content: { text: "结构化消息", extra: "ignored" },
      }),
      {
        id: "msg_1",
        role: "unknown-role",
        status: "",
        textPreview: "结构化消息",
        artifactCount: 0,
        attachmentCount: 0,
        toolCallCount: 0,
        taskGroupId: "",
      },
    );
    assert.equal(model.messagePreview({}).textPreview, "(无文本预览)");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
