"use strict";

const assert = require("node:assert/strict");
const { createWeixinIngressEventService } = require("../adapters/weixin-ingress-event-service");

function makeHarness(overrides = {}) {
  const threads = new Map();
  const broadcasts = [];
  const saves = [];
  const starts = [];
  const enqueued = [];
  const removed = [];
  let id = 0;
  const workspaces = new Set(["owner", "child"]);
  const provider = {
    normalizeInboundEvent(body) {
      return Object.assign({
        source: "weixin",
        eventId: `event-${++id}`,
        accountId: "wx",
        chatId: "chat",
        userId: "",
        principalId: "",
        workspaceId: "owner",
        senderLabel: "",
        text: "",
        attachments: [],
        timestamp: "2026-05-15T01:00:00.000Z",
      }, body);
    },
    isInboundHeartbeatEvent(event) {
      return String(event.text || "").trim() === "#" && !(event.attachments || []).length;
    },
    resolveWorkspaceId(event) {
      return event.workspaceId || "";
    },
    threadKey(event) {
      return `weixin:${event.accountId}:${event.chatId || event.userId}`;
    },
  };
  const service = createWeixinIngressEventService({
    weixinIngressProvider: provider,
    findWorkspace(workspaceId) {
      return workspaces.has(workspaceId) ? { id: workspaceId } : null;
    },
    findExistingIngressEvent: overrides.findExistingIngressEvent || (() => null),
    wakeOutboundForInbound(event, workspaceId) {
      return { count: workspaceId ? 1 : 0, deliveryIds: workspaceId ? [`wake-${event.eventId}`] : [] };
    },
    classifyMaintenanceIntent: overrides.classifyMaintenanceIntent || (() => null),
    ensureThreadForEvent(event, workspaceId) {
      if (!threads.has(workspaceId)) {
        threads.set(workspaceId, { id: `thread-${workspaceId}`, workspaceId, messages: [], activeRunIds: [], status: "idle" });
      }
      return threads.get(workspaceId);
    },
    taskGroupId: "chat",
    nowIso: () => "2026-05-15T01:00:00.000Z",
    makeId: (prefix) => `${prefix}-${++id}`,
    senderInfoForWorkspace: (workspaceId) => ({
      senderWorkspaceId: workspaceId,
      senderPrincipalId: `principal-${workspaceId}`,
      senderLabel: `sender-${workspaceId}`,
    }),
    normalizeExternalIngress: (value) => value,
    normalizeExternalDelivery: (value) => value,
    deliveryMatchesInboundEvent(delivery, event, workspaceId) {
      return workspaceId === event.workspaceId
        && delivery.accountId === event.accountId
        && (delivery.chatId || "") === (event.chatId || "");
    },
    attachmentContextWindowMs: 30_000,
    taskGroupHasRunningRun: overrides.taskGroupHasRunningRun || ((thread) => Boolean(thread.activeRunIds.length)),
    runConcurrencyError: overrides.runConcurrencyError || (() => null),
    saveState: () => saves.push("save"),
    broadcast: (payload) => broadcasts.push(payload),
    threadSummary: (thread) => ({ id: thread.id, status: thread.status, count: thread.messages.length }),
    compactThread: (thread) => ({ id: thread.id, status: thread.status, count: thread.messages.length }),
    compactMessage: (message) => ({ id: message.id, role: message.role, status: message.status, content: message.content }),
    startRunForThread: overrides.startRunForThread || ((thread, userMessage, assistantMessage, runOptions) => {
      starts.push({ thread, userMessage, assistantMessage, runOptions });
      assistantMessage.runId = "run-1";
      return Promise.resolve({ status: "started", responseId: "run-1" });
    }),
    userFacingRunError: overrides.userFacingRunError || ((err) => `friendly:${err.message}`),
    enqueueTerminalDelivery: (thread, message, status) => enqueued.push({ thread, message, status }),
    removeThreadActiveRun: (thread, runId, status) => removed.push({ thread, runId, status }),
  });
  return { broadcasts, enqueued, provider, removed, saves, service, starts, threads, workspaces };
}

async function testHeartbeatDuplicateAndUnmatchedDoNotStartRuns() {
  const duplicateThread = { id: "dup-thread", workspaceId: "owner", messages: [] };
  const duplicateMessage = { id: "dup-message", role: "user", status: "done", content: "old" };
  const { service, starts } = makeHarness({
    findExistingIngressEvent(eventId) {
      return eventId === "dup" ? { thread: duplicateThread, message: duplicateMessage } : null;
    },
  });

  const heartbeat = await service.start({ eventId: "hb", text: "#", workspaceId: "owner" });
  assert.equal(heartbeat.heartbeat, true);
  assert.equal(heartbeat.reason, "weixin_ingress_heartbeat");
  assert.equal(heartbeat.awakenedOutbound.count, 1);

  const duplicate = await service.start({ eventId: "dup", text: "again", workspaceId: "owner" });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.thread.id, "dup-thread");
  assert.equal(duplicate.message.id, "dup-message");

  const unmatched = await service.start({ eventId: "missing", text: "hello", workspaceId: "missing" });
  assert.deepEqual(unmatched, {
    ok: true,
    skipped: true,
    reason: "unmatched_workspace_route",
    eventId: "missing",
  });
  assert.equal(starts.length, 0);
}

async function testAttachmentOnlyWaitsThenNextTextConsumesAndStartsRun() {
  const { broadcasts, saves, service, starts, threads } = makeHarness();
  const media = await service.start({
    eventId: "media-1",
    workspaceId: "child",
    accountId: "wx",
    chatId: "chat",
    attachments: [{ path: "/tmp/image.png", name: "image.png" }],
  });
  assert.equal(media.awaitingInstruction, true);
  assert.equal(media.run.status, "waiting_instruction");
  const thread = threads.get("child");
  assert.equal(thread.messages.length, 1);
  assert.equal(thread.messages[0].awaitingInstruction, true);
  assert.equal(thread.messages[0].externalIngress.status, "waiting_instruction");

  const text = await service.start({
    eventId: "text-1",
    workspaceId: "child",
    accountId: "wx",
    chatId: "chat",
    text: "please edit this image",
  });
  assert.equal(text.run.status, "started");
  assert.equal(starts.length, 1);
  assert.match(starts[0].runOptions.instructions, /\/tmp\/image\.png/);
  assert.equal(thread.messages[0].externalIngress.status, "consumed_by_instruction");
  assert.equal(thread.messages.length, 3);
  assert.equal(saves.length, 2);
  assert.ok(broadcasts.some((payload) => payload.type === "message.updated"));
}

async function testMaintenanceIntentDoesNotPreemptModelRunAndConcurrencyFailure() {
  const maintenance = makeHarness({
    classifyMaintenanceIntent: () => ({ message: "needs owner", category: "owner_high_privilege" }),
  });
  const started = await maintenance.service.start({ eventId: "m1", workspaceId: "owner", text: "restart system" });
  assert.equal(started.run.status, "started");
  assert.equal(maintenance.starts.length, 1);

  const concurrency = makeHarness({
    runConcurrencyError: () => {
      const err = new Error("busy");
      err.status = 429;
      return err;
    },
  });
  await assert.rejects(
    () => concurrency.service.start({ eventId: "busy", workspaceId: "owner", text: "hello" }),
    (err) => err.status === 429,
  );
}

async function testQueueBehindActiveRunAndStartFailure() {
  const queuedHarness = makeHarness();
  queuedHarness.threads.set("owner", { id: "thread-owner", workspaceId: "owner", messages: [], activeRunIds: ["run-active"], status: "running" });
  const queued = await queuedHarness.service.start({ eventId: "queued", workspaceId: "owner", text: "next" });
  assert.equal(queued.run.status, "queued");
  assert.equal(queuedHarness.starts.length, 0);

  const failureHarness = makeHarness({
    startRunForThread: () => {
      throw new Error("gateway broke");
    },
  });
  const failed = await failureHarness.service.start({ eventId: "fail", workspaceId: "owner", text: "run" });
  assert.equal(failed.ok, false);
  assert.equal(failed.run.status, "failed");
  assert.equal(failed.error, "friendly:gateway broke");
  assert.equal(failureHarness.enqueued.length, 1);
  assert.equal(failureHarness.removed.length, 1);
}

async function testStartFailureUsesSanitizedUserFacingError() {
  const failureHarness = makeHarness({
    startRunForThread: () => {
      throw new Error("Authorization: Bearer raw-token-value-1234567890 path C:\\secrets\\auth-token.json");
    },
    userFacingRunError: () => "Hermes run failed before producing a reply.",
  });
  const failed = await failureHarness.service.start({ eventId: "safe-fail", workspaceId: "owner", text: "run" });
  assert.equal(failed.error, "Hermes run failed before producing a reply.");
  assert.equal(failureHarness.enqueued[0].message.error, "Hermes run failed before producing a reply.");
  assert.doesNotMatch(JSON.stringify(failed), /raw-token-value|auth-token\.json/);
}

async function run() {
  await testHeartbeatDuplicateAndUnmatchedDoNotStartRuns();
  await testAttachmentOnlyWaitsThenNextTextConsumesAndStartsRun();
  await testMaintenanceIntentDoesNotPreemptModelRunAndConcurrencyFailure();
  await testQueueBehindActiveRunAndStartFailure();
  await testStartFailureUsesSanitizedUserFacingError();
  console.log("weixin ingress event service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
