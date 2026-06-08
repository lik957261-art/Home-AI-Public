"use strict";

const assert = require("node:assert/strict");
const { createGatewayRunResponseCreatedService } = require("../adapters/gateway-run-response-created-service");

function makeHarness(overrides = {}) {
  const thread = {
    id: "thread_1",
    activeRunId: "public_run",
    activeRunIds: ["public_run"],
  };
  const message = {
    id: "message_1",
    runId: "public_run",
    status: "running",
  };
  const activeStreams = new Map([[
    "public_run",
    {
      threadId: thread.id,
      messageId: message.id,
      realRunId: "",
    },
  ]]);
  const calls = {
    broadcasts: [],
    replaced: [],
    saved: 0,
  };
  const service = createGatewayRunResponseCreatedService(Object.assign({
    activeStreams,
    broadcastMessageUpdated: (targetThread, targetMessage) => calls.broadcasts.push({
      threadId: targetThread.id,
      messageId: targetMessage.id,
      runId: targetMessage.runId,
      responseRunId: targetMessage.responseRunId,
      originalRunId: targetMessage.originalRunId,
    }),
    replaceThreadActiveRun: (targetThread, oldRunId, newRunId) => {
      calls.replaced.push({ threadId: targetThread.id, oldRunId, newRunId });
      targetThread.activeRunId = newRunId;
      targetThread.activeRunIds = (targetThread.activeRunIds || []).map((item) => (
        item === oldRunId ? newRunId : item
      ));
    },
    saveState: () => { calls.saved += 1; },
  }, overrides));
  return { activeStreams, calls, message, service, thread };
}

function testAliasesPublicRunToResponseRun() {
  const { activeStreams, calls, message, service, thread } = makeHarness();
  const result = service.markResponseCreated({
    thread,
    message,
    runId: "public_run",
    responseRunId: "real_response",
  });

  assert.deepEqual(result, {
    action: "response_created",
    runId: "public_run",
    responseRunId: "real_response",
  });
  assert.equal(message.runId, "real_response");
  assert.equal(message.originalRunId, "public_run");
  assert.equal(message.responseRunId, "real_response");
  assert.equal(thread.activeRunId, "real_response");
  assert.deepEqual(thread.activeRunIds, ["real_response"]);
  assert.equal(activeStreams.get("real_response"), activeStreams.get("public_run"));
  assert.equal(activeStreams.get("public_run").realRunId, "real_response");
  assert.equal(calls.saved, 1);
  assert.deepEqual(calls.replaced, [{
    threadId: "thread_1",
    oldRunId: "public_run",
    newRunId: "real_response",
  }]);
  assert.equal(calls.broadcasts.length, 1);
  assert.equal(calls.broadcasts[0].runId, "real_response");
}

function testNoAliasStillPersistsAndBroadcasts() {
  const { activeStreams, calls, message, service, thread } = makeHarness();
  const result = service.markResponseCreated({
    thread,
    message,
    runId: "public_run",
    responseRunId: "public_run",
  });

  assert.equal(result.action, "response_created");
  assert.equal(message.runId, "public_run");
  assert.equal(message.originalRunId, undefined);
  assert.equal(message.responseRunId, undefined);
  assert.equal(activeStreams.has("public_run"), true);
  assert.deepEqual(calls.replaced, []);
  assert.equal(calls.saved, 1);
  assert.equal(calls.broadcasts.length, 1);
}

function testPreservesExistingOriginalRunId() {
  const { calls, message, service, thread } = makeHarness();
  message.originalRunId = "first_public_run";
  const result = service.markResponseCreated({
    thread,
    message,
    runId: "retry_public_run",
    responseRunId: "real_response",
    stream: {
      threadId: thread.id,
      messageId: message.id,
    },
  });

  assert.equal(result.action, "response_created");
  assert.equal(message.originalRunId, "first_public_run");
  assert.equal(message.runId, "real_response");
  assert.equal(message.responseRunId, "real_response");
  assert.deepEqual(calls.replaced, [{
    threadId: "thread_1",
    oldRunId: "retry_public_run",
    newRunId: "real_response",
  }]);
}

testAliasesPublicRunToResponseRun();
testNoAliasStillPersistsAndBroadcasts();
testPreservesExistingOriginalRunId();
