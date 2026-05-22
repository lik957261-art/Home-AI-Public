"use strict";

const assert = require("node:assert/strict");
const { createTopicContextCompactionService } = require("../adapters/topic-context-compaction-service");

function memoryStore() {
  const summaries = new Map();
  const states = new Map();
  const refs = new Map();
  const key = (topicId, taskGroupId) => `${topicId}::${taskGroupId}`;
  return {
    getTopicContextSummary(topicId, taskGroupId) {
      return summaries.get(key(topicId, taskGroupId)) || null;
    },
    upsertTopicContextSummary(input) {
      summaries.set(key(input.topicId, input.taskGroupId), input.summary);
      return input.summary;
    },
    getTopicWorkingState(topicId, taskGroupId) {
      return states.get(key(topicId, taskGroupId)) || null;
    },
    upsertTopicWorkingState(input) {
      states.set(key(input.topicId, input.taskGroupId), input.state);
      return input.state;
    },
    listTopicContextRefs(args) {
      return refs.get(key(args.topicId, args.taskGroupId)) || [];
    },
    replaceTopicContextRefs(input) {
      refs.set(key(input.topicId, input.taskGroupId), input.refs);
      return input.refs;
    },
  };
}

{
  const store = memoryStore();
  const service = createTopicContextCompactionService({
    store,
    nowIso: () => "2026-05-22T13:00:00.000Z",
  });
  const thread = {
    id: "thread_1",
    workspaceId: "owner",
    title: "Topic title",
    messages: [
      { id: "m1", role: "user", taskGroupId: "chat", content: "User asks for a durable context design.", createdAt: "2026-05-22T12:00:00.000Z" },
      { id: "m2", role: "assistant", taskGroupId: "chat", content: "Assistant proposes layered summary and refs.", createdAt: "2026-05-22T12:01:00.000Z" },
      { id: "m3", role: "assistant", taskGroupId: "chat", status: "running", content: "skip running" },
    ],
  };
  const result = service.compactTaskGroup(thread, "chat", { reason: "test" });
  assert.equal(result.changed, true);
  assert.equal(result.summary.summaryVersion, 1);
  assert.equal(result.summary.lastCompactedMessageId, "m2");
  assert.equal(result.workingState.status, "active");
  assert.equal(result.refs.length, 2);
  assert.equal(store.getTopicContextSummary("thread_1", "chat").currentState, "Assistant proposes layered summary and refs.");
}

{
  const store = memoryStore();
  const service = createTopicContextCompactionService({ store, nowIso: () => "2026-05-22T13:00:00.000Z" });
  const thread = {
    id: "thread_1",
    messages: [
      { id: "m1", role: "user", taskGroupId: "chat", content: "First request" },
      { id: "m2", role: "assistant", taskGroupId: "chat", content: "First answer" },
    ],
  };
  assert.equal(service.compactTaskGroup(thread, "chat").changed, true);
  assert.equal(service.compactTaskGroup(thread, "chat").changed, false);
  assert.equal(service.compactTaskGroup(thread, "chat").reason, "already_compacted");
}

console.log("topic-context-compaction-service tests passed");
