"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadRenderer() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/navigation-shell/task-topic-root-renderer.mjs",
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
  await test("task/topic root renderer stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/navigation-shell/task-topic-root-renderer.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
  });

  await test("summary rows expose bounded task/topic root evidence", async () => {
    const renderer = await loadRenderer();
    const rows = renderer.taskTopicRootSummaryRows({
      renderSignature: "abcd1234",
      directoryTopicSignature: "thread::docs",
      directoryCollectionCount: 2,
      regularGroupCount: 3,
      pluginGroupCount: 4,
      shouldDeferDirectoryTopics: true,
    }, {
      source: "state.taskListThread",
      cacheSignature: "thread_root:6:2026-07-02T12:00:00.000Z",
    });
    assert.deepEqual(rows, [
      ["Render signature", "abcd1234"],
      ["Directory signature", "thread::docs"],
      ["数据来源", "任务根缓存"],
      ["目录集合", "2"],
      ["常规话题", "3"],
      ["插件话题", "4"],
      ["延迟重绘", "需要"],
      ["缓存签名", "thread_root:6:2026-07-02T12:00:00.000Z"],
    ]);
  });

  await test("renderer escapes labels and renders all task/topic sections", async () => {
    const renderer = await loadRenderer();
    const html = renderer.renderTaskTopicRootHtml({
      renderSignature: "sig<1>",
      directoryTopicSignature: "dir&sig",
      directoryCollectionCount: 1,
      regularGroupCount: 1,
      pluginGroupCount: 1,
      directoryCollections: [
        { label: "Docs <Owner>", topicCount: 2 },
      ],
      visibleRegularGroups: [
        { title: "普通 & 话题", status: "open" },
      ],
      pluginCards: [
        { title: "衣橱", pluginId: "wardrobe" },
      ],
      emptyStateText: "还没有话题",
    }, {
      source: "state.taskListThread",
    }, {
      directoryCollections: [
        { label: "Docs <Owner>", topicCount: 2, action: { actionId: "directory_topic:topic_docs", enabled: true, classicFallbackHref: "/?view=tasks&taskGroupId=topic_docs" } },
      ],
      visibleRegularGroups: [
        { title: "普通 & 话题", status: "open", action: { actionId: "regular_topic:topic_regular", enabled: true, classicFallbackHref: "/?view=tasks&taskGroupId=topic_regular" } },
      ],
      pluginCards: [
        { title: "衣橱", pluginId: "wardrobe", action: { actionId: "plugin_topic:plugin:wardrobe", enabled: true, classicFallbackHref: "/?view=tasks&pluginId=wardrobe" } },
      ],
    });
    assert.match(html, /话题根模型/);
    assert.match(html, /目录话题/);
    assert.match(html, /普通话题/);
    assert.match(html, /插件话题/);
    assert.match(html, /sig&lt;1&gt;/);
    assert.match(html, /dir&amp;sig/);
    assert.match(html, /Docs &lt;Owner&gt;/);
    assert.match(html, /普通 &amp; 话题/);
    assert.match(html, /wardrobe/);
    assert.match(html, /任务根缓存/);
    assert.match(html, /data-vns-topic-action="directory_topic:topic_docs"/);
    assert.match(html, /data-vns-topic-href="\/\?view=tasks&amp;taskGroupId=topic_regular"/);
    assert.doesNotMatch(html, /Docs <Owner>/);
  });

  await test("renderer keeps empty states explicit", async () => {
    const renderer = await loadRenderer();
    const html = renderer.renderTaskTopicRootHtml({
      directoryCollections: [],
      visibleRegularGroups: [],
      pluginCards: [],
      emptyStateText: "这个目录下还没有话题。",
    });
    assert.match(html, /没有目录话题/);
    assert.match(html, /这个目录下还没有话题。/);
    assert.match(html, /没有插件话题/);
  });

  await test("selected topic detail renderer escapes bounded previews", async () => {
    const renderer = await loadRenderer();
    const html = renderer.renderSelectedTopicDetailHtml({
      selectedTaskGroupId: "topic_<docs>",
      messageMode: "tasks",
      totalMessageCount: 7,
      loadedMessageCount: 2,
      hasMoreBefore: true,
      source: "vite_dev_preview_mock",
      previewMessages: [
        {
          role: "user",
          status: "sent",
          textPreview: "查看 <Vite> & 话题",
          attachmentCount: 1,
          artifactCount: 0,
          toolCallCount: 0,
        },
        {
          role: "assistant",
          status: "completed",
          textPreview: "已读回任务话题。",
          attachmentCount: 0,
          artifactCount: 1,
          toolCallCount: 1,
        },
      ],
    });
    assert.match(html, /选中话题读回/);
    assert.match(html, /topic_&lt;docs&gt;/);
    assert.match(html, /消息数/);
    assert.match(html, /已加载/);
    assert.match(html, /更多历史/);
    assert.match(html, /有/);
    assert.match(html, /用户/);
    assert.match(html, /助手/);
    assert.match(html, /附件 1 · 产物 0/);
    assert.match(html, /产物 1 · 工具 1/);
    assert.match(html, /查看 &lt;Vite&gt; &amp; 话题/);
    assert.doesNotMatch(html, /查看 <Vite>/);
  });

  await test("selected topic detail renderer keeps root empty state explicit", async () => {
    const renderer = await loadRenderer();
    const html = renderer.renderSelectedTopicDetailHtml({
      selectedTaskGroupId: "",
      messageMode: "tasks",
      totalMessageCount: 0,
      loadedMessageCount: 0,
      hasMoreBefore: false,
      source: "thread_read_api",
      previewMessages: [],
      emptyText: "当前为话题根读回，选择一个话题后显示消息摘要。",
    });
    assert.match(html, /话题根/);
    assert.match(html, /当前为话题根读回/);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
