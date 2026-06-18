"use strict";

const assert = require("node:assert/strict");
const {
  canonicalDirectoryRoute,
  createDirectoryTopicIndexService,
} = require("../adapters/directory-topic-index-service");

const service = createDirectoryTopicIndexService({
  isConversationTaskGroupId: (value) => ["chat", "group-chat"].includes(String(value || "")),
});

{
  const route = {
    projectId: "health",
    label: "健康",
    root: "/Users/example/path",
    path: "/Users/example/path",
    ownerWorkspaceId: "owner",
  };
  assert.equal(service.routeKey(route), "owner|health||/users/owner/健康");
}

{
  const thread = {
    id: "thread-1",
    workspaceId: "owner",
    createdAt: "2026-06-18T00:00:00.000Z",
    updatedAt: "2026-06-18T01:00:00.000Z",
    taskGroupMeta: {
      old: {
        ownerWorkspaceId: "owner",
        directoryRoute: { projectId: "health", label: "健康", root: "/health", path: "/health", ownerWorkspaceId: "owner" },
        title: "睡眠日志",
        lastReceiptTitle: "睡眠趋势摘要",
        updatedAt: "2026-06-18T00:30:00.000Z",
      },
      newer: {
        ownerWorkspaceId: "owner",
        directoryRoute: { projectId: "health", label: "健康", root: "/health", path: "/health", ownerWorkspaceId: "owner" },
        title: "运动总结",
        lastReceiptTitle: "周运动总结",
        updatedAt: "2026-06-18T00:40:00.000Z",
      },
      other: {
        ownerWorkspaceId: "owner",
        directoryRoute: { projectId: "finance", label: "财务", root: "/finance", path: "/finance", ownerWorkspaceId: "owner" },
        title: "发票",
        updatedAt: "2026-06-18T00:20:00.000Z",
      },
      chat: {
        ownerWorkspaceId: "owner",
        directoryRoute: { projectId: "chat", label: "聊天", root: "/chat", path: "/chat", ownerWorkspaceId: "owner" },
        updatedAt: "2026-06-18T00:50:00.000Z",
      },
      "plugin:health": {
        ownerWorkspaceId: "owner",
        directoryRoute: { projectId: "plugin-health", label: "健康插件资料", root: "/plugins/health", path: "/plugins/health", ownerWorkspaceId: "owner" },
        updatedAt: "2026-06-18T00:55:00.000Z",
      },
      case_growth: {
        ownerWorkspaceId: "owner",
        directoryRoute: { projectId: "growth", label: "成长", root: "/growth", path: "/growth", ownerWorkspaceId: "owner" },
        updatedAt: "2026-06-18T00:56:00.000Z",
      },
    },
  };
  const collections = service.listCollections(thread, { topicsPerDirectory: 1 });
  assert.equal(collections.length, 2);
  assert.equal(collections[0].label, "健康");
  assert.equal(collections[0].topicCount, 2);
  assert.equal(collections[0].groups.length, 1);
  assert.equal(collections[0].groups[0].id, "newer");
  assert.equal(collections[0].hasMoreTopics, true);
  assert.equal(collections[1].groups[0].id, "other");
  assert.equal(collections.some((collection) => collection.groups.some((group) => group.id === "plugin:health")), false);
  assert.equal(collections.some((collection) => collection.groups.some((group) => group.id === "case_growth")), false);
}

{
  const thread = { id: "thread-2", workspaceId: "owner", taskGroupMeta: {} };
  const message = {
    id: "m1",
    role: "user",
    content: "请分析睡眠日志并给出建议",
    taskGroupId: "sleep",
    createdAt: "2026-06-18T02:00:00.000Z",
    directoryRoute: { projectId: "health", label: "健康", root: "/health", path: "/health", ownerWorkspaceId: "owner" },
  };
  const result = service.upsertThreadTopicIndex(thread, {
    taskGroupId: "sleep",
    directoryRoute: message.directoryRoute,
    actorWorkspaceId: "owner",
    message,
  });
  assert.equal(result.ownerWorkspaceId, "owner");
  assert.equal(result.lastUserPromptTitle, "请分析睡眠日志并给出建议");
  assert.equal(result.title, "请分析睡眠日志并给出建议");
  assert.equal(thread.taskGroupMeta.sleep.directoryRouteKey, "owner|health||/health");
}

{
  const thread = {
    id: "thread-3",
    workspaceId: "owner",
    taskGroupMeta: {},
    messages: [{
      id: "m2",
      role: "assistant",
      content: "这是睡眠日志的摘要",
      taskGroupId: "sleep",
      completedAt: "2026-06-18T03:00:00.000Z",
      directoryRoute: { projectId: "health", label: "健康", root: "/health", path: "/health", ownerWorkspaceId: "owner" },
    }],
  };
  const repaired = service.repairThreadIndexFromMessages(thread);
  assert.equal(repaired.scanned, 1);
  assert.equal(repaired.updated, 1);
  assert.equal(thread.taskGroupMeta.sleep.lastReceiptTitle, "这是睡眠日志的摘要");
}

{
  const thread = {
    id: "thread-note-title",
    workspaceId: "owner",
    taskGroupMeta: {},
    messages: [{
      id: "m-note-title",
      role: "assistant",
      content: "这是比较长的正文开头，不应该作为目录话题概要。\n\n<!-- homeai-note\ntitle: 睡眠日志趋势分析\ntags: 健康,睡眠\n-->",
      taskGroupId: "sleep",
      completedAt: "2026-06-18T03:30:00.000Z",
      directoryRoute: { projectId: "health", label: "健康", root: "/health", path: "/health", ownerWorkspaceId: "owner" },
    }],
  };
  service.repairThreadIndexFromMessages(thread);
  assert.equal(thread.taskGroupMeta.sleep.lastReceiptTitle, "睡眠日志趋势分析");
}

{
  const thread = {
    id: "thread-4",
    workspaceId: "owner",
    taskGroupMeta: {},
    messages: [
      {
        id: "newer",
        role: "assistant",
        content: "最新目录回执",
        taskGroupId: "sleep",
        completedAt: "2026-06-18T04:00:00.000Z",
        directoryRoute: { projectId: "health", label: "健康", root: "/health", path: "/health", ownerWorkspaceId: "owner" },
      },
      {
        id: "older",
        role: "assistant",
        content: "旧目录回执",
        taskGroupId: "sleep",
        completedAt: "2026-06-18T03:00:00.000Z",
        directoryRoute: { projectId: "health", label: "健康", root: "/health", path: "/health", ownerWorkspaceId: "owner" },
      },
    ],
  };
  service.repairThreadIndexFromMessages(thread);
  assert.equal(thread.taskGroupMeta.sleep.lastReceiptTitle, "最新目录回执");
  assert.equal(thread.taskGroupMeta.sleep.lastReceiptAt, "2026-06-18T04:00:00.000Z");
  assert.equal(thread.taskGroupMeta.sleep.lastMessageId, "newer");
}

{
  const route = canonicalDirectoryRoute({
    projectId: "health",
    subprojectId: "",
    label: "健康",
    root: "/health",
    path: "/health",
    ownerWorkspaceId: "owner",
  });
  assert.deepEqual(route, {
    label: "健康",
    root: "/health",
    path: "/health",
    projectId: "health",
    ownerWorkspaceId: "owner",
  });
}

{
  const thread = {
    id: "thread-existing-route-final",
    workspaceId: "owner",
    taskGroupMeta: {
      analysis: {
        ownerWorkspaceId: "owner",
        directoryRoute: { label: "科技", root: "/tech", path: "/tech", projectId: "tech", ownerWorkspaceId: "owner" },
        directoryRouteKey: "owner|tech||/tech",
        lastUserPromptTitle: "分析一下股票",
        lastUserPromptAt: "2026-06-18T03:00:00.000Z",
        lastMessageId: "m-user",
        updatedAt: "2026-06-18T03:00:00.000Z",
      },
    },
    messages: [{
      id: "m-final-no-route",
      role: "assistant",
      content: "这是一段很长的股票分析正文。\n\n<!-- homeai-note\ntitle: 科技目录股票分析概要\n-->",
      taskGroupId: "analysis",
      completedAt: "2026-06-18T03:02:00.000Z",
    }],
  };
  const repaired = service.repairThreadIndexFromMessages(thread);
  assert.equal(repaired.updated, 1);
  assert.equal(thread.taskGroupMeta.analysis.lastMessageId, "m-final-no-route");
  assert.equal(thread.taskGroupMeta.analysis.lastReceiptTitle, "科技目录股票分析概要");
  const collections = service.listCollections(thread);
  assert.equal(collections[0].groups[0].lastReceiptTitle, "科技目录股票分析概要");
  assert.equal(collections[0].groups[0].lastMessageId, "m-final-no-route");
}

{
  const thread = {
    id: "thread-idempotent",
    workspaceId: "owner",
    taskGroupMeta: {
      sleep: {
        ownerWorkspaceId: "owner",
        directoryRoute: { label: "健康", root: "/health", path: "/health", projectId: "health", ownerWorkspaceId: "owner" },
        directoryRouteKey: "owner|health||/health",
        title: "",
        lastReceiptTitle: "睡眠日志趋势分析",
        lastReceiptAt: "2026-06-18T04:00:00.000Z",
        lastMessageId: "m-final",
        messageCount: 0,
        createdAt: "2026-06-18T04:00:00.000Z",
        updatedAt: "2026-06-18T04:00:00.000Z",
      },
    },
    messages: [{
      id: "m-final",
      role: "assistant",
      content: "正文不应该覆盖概要\n<!-- homeai-note\ntitle: 睡眠日志趋势分析\n-->",
      taskGroupId: "sleep",
      completedAt: "2026-06-18T04:00:00.000Z",
      directoryRoute: { projectId: "health", subprojectId: "", label: "健康", root: "/health", path: "/health", ownerWorkspaceId: "owner" },
    }],
  };
  const repaired = service.repairThreadIndexFromMessages(thread);
  assert.equal(repaired.updated, 0);
  assert.equal(Object.hasOwn(thread.taskGroupMeta.sleep.directoryRoute, "subprojectId"), false);
  const collections = service.listCollections(thread);
  assert.equal(collections[0].groups[0].lastMessageId, "m-final");
  assert.equal(collections[0].groups[0].lastReceiptTitle, "睡眠日志趋势分析");
  assert.equal(collections[0].groups[0].messages.at(-1).id, "sleep:last-receipt");
}

console.log("directory-topic-index-service tests passed");
