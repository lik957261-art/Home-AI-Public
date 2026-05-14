"use strict";

const assert = require("node:assert/strict");
const { createWeixinOutboundDeliveryService } = require("../adapters/weixin-outbound-delivery-service");

function normalizeExternalDelivery(value) {
  if (!value || typeof value !== "object") return null;
  return {
    source: value.source || "",
    status: value.status || "pending",
    deliveryId: value.deliveryId || "",
    accountId: value.accountId || "",
    chatId: value.chatId || "",
    userId: value.userId || "",
    eventId: value.eventId || "",
    workspaceId: value.workspaceId || "",
    threadId: value.threadId || "",
    messageId: value.messageId || "",
    taskGroupId: value.taskGroupId || "",
    taskId: value.taskId || "",
    content: value.content || "",
    artifacts: Array.isArray(value.artifacts) ? value.artifacts : [],
    terminalStatus: value.terminalStatus || "",
    providerMessageId: value.providerMessageId || "",
    error: value.error || "",
    rawStatus: value.rawStatus || "",
    acknowledgedAt: value.acknowledgedAt || "",
    queuedAt: value.queuedAt || "",
    updatedAt: value.updatedAt || "",
    retryCount: Number(value.retryCount || 0) || 0,
    nextRetryAt: value.nextRetryAt || "",
    lastAttemptAt: value.lastAttemptAt || "",
    retryAfterInbound: Boolean(value.retryAfterInbound),
    retryExhausted: Boolean(value.retryExhausted),
    retryWakeAt: value.retryWakeAt || "",
    retryWakeEventId: value.retryWakeEventId || "",
    failedAt: value.failedAt || "",
    sentAt: value.sentAt || "",
  };
}

function createFixture(overrides = {}) {
  const thread = {
    id: "thread_1",
    workspaceId: "owner",
    updatedAt: "old",
    messages: [
      {
        id: "msg_1",
        role: "assistant",
        content: "Final reply",
        status: "done",
        updatedAt: "old",
        taskGroupId: "chat",
        artifacts: [{ name: "report.md", localPath: "C:/report.md" }],
        externalDelivery: {
          source: "weixin",
          status: "waiting",
          accountId: "acct",
          chatId: "chat",
          eventId: "evt",
          workspaceId: "owner",
        },
      },
    ],
  };
  const calls = { save: 0, broadcast: [], egress: [] };
  const state = { threads: [thread] };
  const service = createWeixinOutboundDeliveryService(Object.assign({
    state: () => state,
    nowIso: () => "2026-05-15T00:00:00.000Z",
    normalizeExternalDelivery,
    deliveryId: (threadId, messageId) => `delivery:${threadId}:${messageId}`,
    compactText: (text, limit = 1000) => String(text || "").slice(0, limit),
    maxMessageChars: 20,
    retryLimit: 3,
    retryBaseMs: 1000,
    retryMaxMs: 5000,
    egressDecide: (payload) => {
      calls.egress.push(payload);
      return overrides.egressDecision || { allowed: true };
    },
    isStaleHttpToolAvailabilityClaim: (text) => /stale-http/.test(text),
    isStaleImageToolAvailabilityClaim: (text) => /stale-image/.test(text),
    saveState: () => { calls.save += 1; },
    broadcast: (event) => calls.broadcast.push(event),
    threadSummary: (item) => ({ id: item.id, workspaceId: item.workspaceId }),
    compactMessage: (item) => ({ id: item.id, status: item.status, externalDelivery: item.externalDelivery }),
  }, overrides));
  return { service, state, thread, message: thread.messages[0], calls };
}

function testEnqueueCreatesPendingDelivery() {
  const { service, thread, message, calls } = createFixture();
  const delivery = service.enqueueForTerminalMessage(thread, message, "done");

  assert.equal(delivery.status, "pending");
  assert.equal(delivery.deliveryId, "delivery:thread_1:msg_1");
  assert.equal(delivery.content, "Final reply");
  assert.equal(delivery.artifacts.length, 1);
  assert.equal(calls.egress[0].operation, "origin_reply");
  assert.equal(calls.egress[0].sendsFileContent, true);
  assert.equal(service.publicDelivery(thread, message).retryCount, 0);
}

function testEnqueueSkipsInternalFailuresAndDeniedEgress() {
  let fixture = createFixture();
  fixture.message.error = "Run failed";
  assert.equal(serviceStatus(fixture.service.enqueueForTerminalMessage(fixture.thread, fixture.message, "failed")), "skipped");
  assert.match(fixture.message.externalDelivery.error, /Run failed/);

  fixture = createFixture();
  fixture.message.content = "stale-http";
  assert.equal(serviceStatus(fixture.service.enqueueForTerminalMessage(fixture.thread, fixture.message, "done")), "skipped");
  assert.equal(fixture.message.externalDelivery.error, "internal_tool_schema_failure_not_external_delivered");

  fixture = createFixture({ egressDecision: { allowed: false, reason: "egress_denied" } });
  assert.equal(serviceStatus(fixture.service.enqueueForTerminalMessage(fixture.thread, fixture.message, "done")), "skipped");
  assert.equal(fixture.message.externalDelivery.error, "egress_denied");
}

function serviceStatus(delivery) {
  return delivery && delivery.status;
}

function testAckSentAndFailedRetryStates() {
  const fixture = createFixture();
  const { service, thread, message, calls } = fixture;
  service.enqueueForTerminalMessage(thread, message, "done");
  const sent = service.ackDelivery("delivery:thread_1:msg_1", {
    status: "sent",
    providerMessageId: "wx_1",
    acknowledgedAt: "2026-05-15T00:01:00.000Z",
  });
  assert.equal(sent.status, "sent");
  assert.equal(message.externalDelivery.providerMessageId, "wx_1");
  assert.equal(message.externalDelivery.error, "");
  assert.equal(calls.save, 1);
  assert.equal(calls.broadcast.length, 2);

  const failedFixture = createFixture();
  failedFixture.service.enqueueForTerminalMessage(failedFixture.thread, failedFixture.message, "done");
  const failed = failedFixture.service.ackDelivery("delivery:thread_1:msg_1", {
    status: "failed",
    error: "network",
    acknowledgedAt: "2026-05-15T00:00:00.000Z",
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.retryCount, 1);
  assert.equal(failed.nextRetryAt, "2026-05-15T00:00:01.000Z");
  assert.equal(failedFixture.service.pendingDeliveries({ status: "retryable", limit: 10 }).length, 0);
}

function testRetMinusTwoWaitsForInboundWake() {
  const { service, thread, message, calls } = createFixture();
  service.enqueueForTerminalMessage(thread, message, "done");
  const waiting = service.ackDelivery("delivery:thread_1:msg_1", {
    status: "failed",
    error: "send failed ret=-2",
    acknowledgedAt: "2026-05-15T00:00:00.000Z",
  });
  assert.equal(waiting.status, "waiting_inbound");
  assert.equal(waiting.retryAfterInbound, true);
  assert.equal(waiting.nextRetryAt, "");
  assert.equal(service.isInboundWakeRequiredFailure({ rawStatus: "ret = -2" }), true);
  assert.equal(service.pendingDeliveries({ status: "pending" }).length, 0);

  const noMatch = service.wakeForInboundEvent({ accountId: "acct", chatId: "other", eventId: "wake_0" }, "owner");
  assert.equal(noMatch.count, 0);

  const woke = service.wakeForInboundEvent({ accountId: "acct", chatId: "chat", eventId: "wake_1" }, "owner");
  assert.equal(woke.count, 1);
  assert.deepEqual(woke.deliveryIds, ["delivery:thread_1:msg_1"]);
  assert.equal(message.externalDelivery.status, "pending");
  assert.equal(message.externalDelivery.retryAfterInbound, false);
  assert.equal(message.externalDelivery.retryWakeEventId, "wake_1");
  assert.equal(calls.save, 2);
}

function testPendingDeliveryFiltersAndRetryExhaustion() {
  const { service, thread, message } = createFixture();
  service.enqueueForTerminalMessage(thread, message, "done");
  assert.equal(service.pendingDeliveries({ accountId: "acct" }).length, 1);
  assert.equal(service.pendingDeliveries({ accountId: "other" }).length, 0);

  service.ackDelivery("delivery:thread_1:msg_1", {
    status: "failed",
    error: "attempt 1",
    acknowledgedAt: "2026-05-15T00:00:00.000Z",
  });
  assert.equal(service.isDeliveryRetryable(message.externalDelivery, Date.parse("2026-05-15T00:00:01.000Z")), true);
  service.ackDelivery("delivery:thread_1:msg_1", {
    status: "failed",
    error: "attempt 2",
    acknowledgedAt: "2026-05-15T00:00:02.000Z",
  });
  service.ackDelivery("delivery:thread_1:msg_1", {
    status: "failed",
    error: "attempt 3",
    acknowledgedAt: "2026-05-15T00:00:04.000Z",
  });
  assert.equal(message.externalDelivery.retryExhausted, true);
  assert.equal(message.externalDelivery.nextRetryAt, "");
}

testEnqueueCreatesPendingDelivery();
testEnqueueSkipsInternalFailuresAndDeniedEgress();
testAckSentAndFailedRetryStates();
testRetMinusTwoWaitsForInboundWake();
testPendingDeliveryFiltersAndRetryExhaustion();

console.log("weixin-outbound-delivery-service tests passed");
