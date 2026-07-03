"use strict";

const assert = require("assert");
const helpers = require("../public/app-task-artifact-helpers.js");

function message(id, role, extra = {}) {
  return Object.assign({
    id,
    role,
    content: "",
    createdAt: `2026-05-14T00:00:0${id}Z`,
  }, extra);
}

{
  const thread = {
    workspaceId: "owner",
    taskGroupMeta: {
      task_a: { title: "A", updatedAt: "2026-05-14T00:00:10Z" },
      task_b: { title: "B", updatedAt: "2026-05-14T00:00:20Z" },
      shared: { title: "Shared", sharedTopic: true, updatedAt: "2026-05-14T00:00:30Z" },
    },
    messages: [
      message("1", "user", { taskGroupId: "chat", actorWorkspaceId: "owner" }),
      message("2", "user", { taskGroupId: "task_a", actorWorkspaceId: "owner" }),
      message("3", "assistant", { taskGroupId: "task_a", status: "done" }),
      message("4", "user", { taskGroupId: "task_b", actorWorkspaceId: "child" }),
      message("5", "user", { taskGroupId: "shared", actorWorkspaceId: "child" }),
    ],
  };
  const groups = helpers.taskListGroupsForThread(thread, {
    selectedWorkspaceId: "owner",
    isConversationTaskGroupId: (id) => id === "chat" || id === "group-chat",
  });
  assert.deepStrictEqual(groups.map((group) => group.id), ["shared", "task_a"]);
  assert.equal(groups[0].sharedTopic, true);
}

{
  const thread = {
    workspaceId: "fallback",
    messages: [
      message("1", "user", { taskGroupId: "owned-by-actor", actorWorkspaceId: "actor" }),
      message("2", "user", { taskGroupId: "owned-by-sender", senderWorkspaceId: "sender" }),
      message("3", "assistant", { taskGroupId: "owned-by-thread" }),
    ],
  };
  assert.equal(helpers.messageOwnerWorkspaceId(thread.messages[0], ""), "actor");
  assert.equal(helpers.messageOwnerWorkspaceId(thread.messages[1], ""), "sender");
  assert.deepStrictEqual(
    helpers.taskListGroupsForThread(thread, { selectedWorkspaceId: "sender" }).map((group) => group.id),
    ["owned-by-sender"],
  );
}

{
  const group = {
    messages: [
      message("1", "assistant", {
        artifacts: [
          { id: "doc", name: "report.pdf", mime: "application/pdf" },
          { id: "notes", name: "notes.txt", mime: "text/plain" },
        ],
      }),
      message("2", "assistant", {
        artifacts: [
          { id: "doc", name: "report.md", mime: "text/markdown" },
          { id: "word", name: "report.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
          { id: "slides", name: "briefing.pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
          { id: "data", name: "data.json", mime: "application/json" },
        ],
      }),
    ],
  };
  assert.deepStrictEqual(helpers.taskArtifacts(group).map((artifact) => artifact.name), [
    "notes.txt",
    "report.md",
    "report.docx",
    "briefing.pptx",
    "data.json",
  ]);
  assert.equal(helpers.latestTaskListDocument(group).name, "report.md");
  assert.deepStrictEqual(helpers.displayArtifacts(helpers.taskArtifacts(group)).map((artifact) => artifact.name), [
    "report.md",
    "data.json",
    "notes.txt",
    "briefing.pptx",
  ]);
  assert.equal(helpers.artifactKind({ name: "briefing.pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }), "presentation");
  assert.equal(helpers.isTaskListPrimaryDocument({ name: "briefing.pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }), true);
  assert.equal(helpers.artifactDisplayName({ id: "a1", name: "raw.md", displayName: "Readable Report" }), "Readable Report");
}

{
  const group = {
    messages: [
      message("1", "assistant", {
        content: [
          "Used Skill: productivity/write-summary",
          "技能：reports/build-report",
          "See `.hermes/skills/productivity/write-summary/SKILL.md`",
          "Fallback path tools/search-files/SKILL.md",
        ].join("\n"),
      }),
    ],
  };
  assert.deepStrictEqual(helpers.taskSkills(group).map((skill) => skill.path), [
    "reports/build-report",
    "tools/search-files",
    "productivity/write-summary",
  ]);
  assert.deepStrictEqual(helpers.skillEntryFromText(".hermes/skills/a/b/SKILL.md"), {
    id: "b",
    label: "b",
    path: "a/b",
    namespace: "a",
  });
  assert.deepStrictEqual(
    helpers.skillEntryFromText("/mnt/c/ProgramData/HermesMobile/data/skill-profiles/owner-full/skills/productivity/wardrobe-style-operations/SKILL.md"),
    {
      id: "wardrobe-style-operations",
      label: "wardrobe-style-operations",
      path: "productivity/wardrobe-style-operations",
      namespace: "productivity",
    },
  );
  assert.deepStrictEqual(
    helpers.skillEntryFromText("mnt/c/ProgramData/HermesMobile/data/skill-profiles/owner-full/skills/productivity/wardrobe-style-operations"),
    {
      id: "wardrobe-style-operations",
      label: "wardrobe-style-operations",
      path: "productivity/wardrobe-style-operations",
      namespace: "productivity",
    },
  );
}

{
  const group = {
    messages: [
      message("1", "assistant", {
        content: "共享 Skill: /mnt/c/ProgramData/HermesMobile/data/skill-profiles/owner-full/skills/productivity/wardrobe-style-operations/SKILL.md",
      }),
    ],
  };
  assert.deepStrictEqual(helpers.taskSkills(group).map((skill) => skill.path), [
    "productivity/wardrobe-style-operations",
  ]);
}

{
  const rewritten = helpers.compactDisplayText([
    "Task ID: web_123456789",
    "MEDIA: C:/private/photo.png",
    "**Open** C:/Users/example/Documents/project/file.md",
  ].join("\n"), 80, {
    rewriteDirectoryPathsForDisplay: (text) => text.replace("C:/Users/example/Documents", "[workspace]"),
  });
  assert.equal(rewritten, "Open [workspace]/project/file.md");
  assert.equal(helpers.compactDisplayText("abcdefghijklmnopqrstuvwxyz", 8), "abcdefg...");
}

{
  assert.equal(
    helpers.compactTopicTitle("帮我看一下，NAS 上面的工具集为什么没有搜索功能", 12),
    "NAS 上面的工具集为什",
  );
  assert.equal(
    helpers.taskShortTitle({
      messages: [message("1", "user", { content: "现在讨论一个问题啊，目录绑定话题应该怎么显示" })],
    }),
    "目录绑定话题应该怎么显示",
  );
  assert.equal(
    helpers.taskShortTitle({
      title: "小龙虾做法",
      messages: [message("1", "user", { content: "这是很长的第一条消息" })],
    }),
    "小龙虾做法",
  );
}

console.log("app-task-artifact-helpers tests passed");
