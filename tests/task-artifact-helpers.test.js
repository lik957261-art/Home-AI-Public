"use strict";

const assert = require("node:assert/strict");
const helpers = require("../public/app-task-artifact-helpers.js");

{
  const thread = {
    workspaceId: "owner",
    taskGroups: [{
      id: "old-dir",
      title: "Old directory",
      ownerWorkspaceId: "owner",
      updatedAt: "2026-06-01T10:00:00.000Z",
      directoryRoute: { label: "Archive", projectId: "archive", root: "/Archive", path: "/Archive" },
      messages: [{ id: "old-summary", role: "assistant", content: "Old receipt", taskGroupId: "old-dir" }],
    }],
    messages: [{
      id: "new-user",
      role: "user",
      content: "New request",
      taskGroupId: "new-dir",
      senderWorkspaceId: "owner",
      createdAt: "2026-06-02T10:00:00.000Z",
      directoryRoute: { label: "Current", projectId: "current", root: "/Current", path: "/Current" },
    }],
  };

  const groups = helpers.taskGroupsForThread(thread);
  const byId = new Map(groups.map((group) => [group.id, group]));
  assert.equal(byId.get("old-dir").title, "Old directory");
  assert.equal(byId.get("old-dir").messages[0].content, "Old receipt");
  assert.equal(byId.get("new-dir").directoryRoute.label, "Current");
  assert.equal(helpers.taskGroupOwnerWorkspaceId(byId.get("old-dir")), "owner");
}

{
  const thread = {
    workspaceId: "owner",
    taskGroupMeta: {
      "plugin:wardrobe": {
        lastReceiptTitle: "New persisted wardrobe receipt",
        lastMessageId: "new-plugin-assistant",
        updatedAt: "2026-06-02T10:00:00.000Z",
      },
    },
    messages: [{
      id: "old-plugin-assistant",
      role: "assistant",
      content: "Old paged wardrobe receipt",
      taskGroupId: "plugin:wardrobe",
      updatedAt: "2026-06-02T09:00:00.000Z",
      directoryRoute: { label: "Wardrobe Files", projectId: "wardrobe", root: "/Wardrobe", path: "/Wardrobe" },
    }],
  };

  const group = helpers.taskGroupsForThread(thread).find((item) => item.id === "plugin:wardrobe");
  assert.equal(group.pluginTopic, true);
  assert.equal(group.directoryRoute, null);
  assert.equal(group.lastReceiptTitle, "New persisted wardrobe receipt");
  assert.equal(group.lastMessageId, "new-plugin-assistant");
}

{
  assert.equal(
    helpers.receiptSummaryTitleFromText("这是长正文，不应作为概要。\n\n<!-- homeai-note\ntitle: 科技目录股票分析概要\ntags: tech\n-->", 96),
    "科技目录股票分析概要",
  );
}

{
  assert.equal(
    helpers.receiptSummaryTitleFromText("感。", 96),
    "",
    "receipt summary extraction must reject one-character fragments",
  );
}

{
  const thread = {
    workspaceId: "owner",
    taskGroupMeta: {
      analysis: {
        lastUserPromptTitle: "分析一下股票",
        lastMessageId: "stale-user-message",
        updatedAt: "2026-06-18T03:00:00.000Z",
      },
    },
    taskGroups: [{
      id: "analysis",
      title: "科技目录",
      lastReceiptTitle: "科技目录股票分析概要",
      lastMessageId: "latest-assistant-message",
      updatedAt: "2026-06-18T03:02:00.000Z",
      directoryRoute: { label: "科技", projectId: "tech", root: "/tech", path: "/tech" },
      messages: [{ id: "analysis:last-receipt", role: "assistant", content: "科技目录股票分析概要", taskGroupId: "analysis" }],
    }],
  };

  const group = helpers.taskGroupsForThread(thread).find((item) => item.id === "analysis");
  assert.equal(group.lastReceiptTitle, "科技目录股票分析概要");
  assert.equal(group.lastMessageId, "latest-assistant-message");
}

console.log("task-artifact-helpers tests passed");
