"use strict";

const assert = require("node:assert/strict");

const {
  createKanbanCaseTopicDeliveryService,
} = require("../adapters/kanban-case-topic-delivery-service");

function makeService(state, calls = {}) {
  return createKanbanCaseTopicDeliveryService({
    state: () => state,
    saveState: (nextState, options) => {
      calls.saved = { nextState, options };
    },
    broadcast: (payload) => {
      calls.broadcast = payload;
    },
    nowIso: () => "2026-05-18T14:30:00.000Z",
    threadSummary: (thread) => ({ id: thread.id, updatedAt: thread.updatedAt }),
  });
}

function testSyncCompletedCardCreatesTopicMessage() {
  const state = {
    threads: [{
      id: "thread-topic",
      workspaceId: "learner",
      messages: [],
      taskGroupMeta: {
        case_case_a: { title: "Case A" },
      },
    }],
  };
  const calls = {};
  const service = makeService(state, calls);
  const result = service.syncCompletedCard({
    id: "card-1",
    workspaceId: "learner",
    content: "Short writing card",
    status: "completed",
    kanbanStatus: "done",
    topicThreadId: "thread-topic",
    topicTaskGroupId: "case_case_a",
    kanbanOutputs: [{
      id: "out-1",
      name: "report.md",
      mime: "text/markdown",
      url: "/api/kanban/cards/output?path=report.md",
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.delivered, true);
  assert.equal(result.artifactCount, 1);
  assert.equal(state.threads[0].messages.length, 1);
  assert.equal(state.threads[0].messages[0].taskGroupId, "case_case_a");
  assert.equal(state.threads[0].messages[0].source, "kanban-case-topic-delivery");
  assert.equal(state.threads[0].messages[0].kanbanCardId, "card-1");
  assert.equal(state.threads[0].messages[0].artifacts[0].name, "report.md");
  assert.match(state.threads[0].messages[0].content, /\u5b66\u4e60\u5361\u7247\u5df2\u5b8c\u6210/);
  assert.deepEqual(calls.saved.options, { reason: "kanban-case-topic-delivery", forceBackup: true });
  assert.deepEqual(calls.broadcast, {
    type: "thread.updated",
    thread: { id: "thread-topic", updatedAt: "2026-05-18T14:30:00.000Z" },
  });
}

function testSyncCompletedCardIsIdempotentAndUpdatesArtifacts() {
  const state = {
    threads: [{
      id: "thread-topic",
      workspaceId: "learner",
      messages: [],
      taskGroupMeta: {
        case_case_a: { title: "Case A" },
      },
    }],
  };
  const service = makeService(state);
  const first = service.syncCompletedCard({
    id: "card-1",
    content: "Card",
    status: "completed",
    topicThreadId: "thread-topic",
    topicTaskGroupId: "case_case_a",
  });
  const second = service.syncCompletedCard({
    id: "card-1",
    content: "Card",
    status: "completed",
    topicThreadId: "thread-topic",
    topicTaskGroupId: "case_case_a",
    outputs: [{ name: "updated.md", url: "/output" }],
  });

  assert.equal(first.delivered, true);
  assert.equal(second.updatedExisting, true);
  assert.equal(state.threads[0].messages.length, 1);
  assert.equal(state.threads[0].messages[0].artifacts[0].name, "updated.md");
}

function testSyncCardArtifactsCreatesNonCompletedTopicMessage() {
  const state = {
    threads: [{
      id: "thread-topic",
      workspaceId: "learner",
      messages: [],
      taskGroupMeta: {
        case_case_a: { title: "Case A" },
      },
    }],
  };
  const service = makeService(state);
  const result = service.syncCardArtifacts({
    id: "card-1",
    content: "Reading card",
    status: "open",
    topicThreadId: "thread-topic",
    topicTaskGroupId: "case_case_a",
    outputs: [{ name: "transcript.md", url: "/output" }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.delivered, true);
  assert.equal(result.artifactCount, 1);
  assert.equal(state.threads[0].messages.length, 1);
  assert.equal(state.threads[0].messages[0].source, "kanban-case-topic-delivery");
  assert.equal(state.threads[0].messages[0].artifacts[0].name, "transcript.md");
  assert.match(state.threads[0].messages[0].content, /\u5b66\u4e60\u5361\u7247\u4ea4\u4ed8\u5df2\u66f4\u65b0/);
}

function testIncompleteOrUnboundCardsAreSkipped() {
  const state = { threads: [] };
  const service = makeService(state);
  assert.equal(service.syncCompletedCard({ id: "card-1", status: "open" }).reason, "not_completed");
  assert.equal(service.syncCompletedCard({ id: "card-1", status: "completed" }).reason, "missing_topic_binding");
  assert.equal(service.syncCardArtifacts({ id: "card-1", status: "open", topicThreadId: "thread", topicTaskGroupId: "group" }).reason, "missing_outputs");
}

testSyncCompletedCardCreatesTopicMessage();
testSyncCompletedCardIsIdempotentAndUpdatesArtifacts();
testSyncCardArtifactsCreatesNonCompletedTopicMessage();
testIncompleteOrUnboundCardsAreSkipped();
console.log("kanban-case-topic-delivery-service tests passed");
