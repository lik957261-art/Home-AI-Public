"use strict";

const assert = require("node:assert/strict");
const { taskGroupsForThread } = require("../scripts/backfill-topic-context-compaction");

{
  const groups = taskGroupsForThread({
    messages: [
      { role: "user", taskGroupId: "chat", content: "hello" },
      { role: "assistant", taskGroupId: "chat", content: "reply" },
      { role: "assistant", taskGroupId: "task-a", content: "done" },
      { role: "assistant", taskGroupId: "task-a", status: "running", content: "skip" },
      { role: "system", taskGroupId: "task-a", content: "skip" },
      { role: "user", content: "fallback chat" },
    ],
  });
  assert.deepEqual(groups, [
    { taskGroupId: "chat", messageCount: 3 },
    { taskGroupId: "task-a", messageCount: 1 },
  ]);
}

console.log("backfill-topic-context-compaction tests passed");
