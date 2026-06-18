"use strict";

const assert = require("node:assert/strict");
const {
  applySignalsToMeta,
  latestTopicSignals,
} = require("../scripts/backfill-topic-receipt-title-meta");

const thread = {
  id: "thread-topic",
  workspaceId: "owner",
  taskGroupMeta: {
    "plugin:wardrobe": {
      title: "Wardrobe",
      lastReceiptTitle: "old receipt",
      updatedAt: "2026-06-18T00:00:00.000Z",
    },
  },
  messages: [
    { id: "u1", role: "user", taskGroupId: "plugin:wardrobe", content: "first prompt", createdAt: "2026-06-18T00:01:00.000Z" },
    { id: "a1", role: "assistant", taskGroupId: "plugin:wardrobe", content: "old receipt", completedAt: "2026-06-18T00:02:00.000Z" },
    { id: "u2", role: "user", taskGroupId: "plugin:wardrobe", content: "latest prompt", createdAt: "2026-06-18T00:03:00.000Z" },
    { id: "a2", role: "assistant", taskGroupId: "plugin:wardrobe", content: "latest receipt", completedAt: "2026-06-18T00:04:00.000Z" },
    { id: "chat-a", role: "assistant", taskGroupId: "chat", content: "ignore chat", completedAt: "2026-06-18T00:05:00.000Z" },
  ],
};

const signals = latestTopicSignals(thread).groups;
assert.equal(signals.get("plugin:wardrobe").lastReceiptTitle, "latest receipt");
assert.equal(signals.get("plugin:wardrobe").lastUserPromptTitle, "latest prompt");
assert.equal(signals.has("chat"), false);

const changed = applySignalsToMeta(thread, signals);
assert.equal(changed, 1);
assert.equal(thread.taskGroupMeta["plugin:wardrobe"].lastReceiptTitle, "latest receipt");
assert.equal(thread.taskGroupMeta["plugin:wardrobe"].lastUserPromptTitle, "latest prompt");
assert.equal(thread.taskGroupMeta["plugin:wardrobe"].lastMessageId, "a2");
assert.equal(thread.taskGroupMeta["plugin:wardrobe"].pluginTopic, true);

console.log("backfill-topic-receipt-title-meta tests passed");
