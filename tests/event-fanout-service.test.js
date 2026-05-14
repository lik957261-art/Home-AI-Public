"use strict";

const assert = require("node:assert/strict");
const {
  createEventFanoutService,
  payloadWorkspaceId,
  sseFrame,
} = require("../adapters/event-fanout-service");

function makeResponse(options = {}) {
  return {
    chunks: [],
    write(chunk) {
      if (options.throwOnWrite) throw new Error("write failed");
      this.chunks.push(String(chunk));
    },
  };
}

function makeClient(auth, options = {}) {
  return { auth, res: makeResponse(options) };
}

function makeService(threads = []) {
  const clients = new Set();
  const service = createEventFanoutService({
    clients,
    state: () => ({ threads }),
    isOwnerAuth: (auth) => Boolean(auth?.isOwner || auth?.role === "owner"),
    threadAccessibleToAuth(auth, thread) {
      if (auth.workspaceId === thread.workspaceId) return true;
      return Array.isArray(thread.groupMembers) && thread.groupMembers.includes(auth.workspaceId);
    },
    authCanAccessWorkspace(auth, workspaceId) {
      return auth.workspaceId === workspaceId || (auth.workspaceIds || []).includes(workspaceId);
    },
  });
  return { clients, service };
}

function lastPayload(client) {
  const chunk = client.res.chunks.at(-1);
  if (!chunk) return null;
  return JSON.parse(chunk.replace(/^data: /, "").trim());
}

function testFrameAndWorkspaceExtraction() {
  assert.equal(sseFrame({ type: "x" }), "data: {\"type\":\"x\"}\n\n");
  assert.equal(payloadWorkspaceId({ workspaceId: "a" }), "a");
  assert.equal(payloadWorkspaceId({ thread: { workspaceId: "b" } }), "b");
  assert.equal(payloadWorkspaceId({ message: { workspaceId: "c" } }), "c");
  assert.equal(payloadWorkspaceId({ todo: { workspaceId: "d" } }), "d");
  assert.equal(payloadWorkspaceId({}), "");
}

function testWorkspaceBroadcastIsolation() {
  const { service } = makeService();
  const owner = service.registerClient(makeClient({ isOwner: true, workspaceId: "owner" }));
  const workspaceA = service.registerClient(makeClient({ workspaceId: "a" }));
  const workspaceB = service.registerClient(makeClient({ workspaceId: "b" }));

  service.broadcast({ type: "todo.updated", todo: { workspaceId: "a" } });

  assert.equal(lastPayload(owner).type, "todo.updated");
  assert.equal(lastPayload(workspaceA).type, "todo.updated");
  assert.equal(lastPayload(workspaceB), null);
}

function testThreadVisibilityOverridesWorkspaceFallback() {
  const { service } = makeService([
    { id: "group-thread", workspaceId: "owner", groupMembers: ["a"] },
  ]);
  const workspaceA = service.registerClient(makeClient({ workspaceId: "a" }));
  const workspaceB = service.registerClient(makeClient({ workspaceId: "b" }));

  service.broadcast({ type: "message.updated", threadId: "group-thread", workspaceId: "b" });

  assert.equal(lastPayload(workspaceA).threadId, "group-thread");
  assert.equal(lastPayload(workspaceB), null);
}

function testMessageThreadIdBranch() {
  const { service } = makeService([
    { id: "thread-a", workspaceId: "a" },
  ]);
  const workspaceA = service.registerClient(makeClient({ workspaceId: "a" }));
  const workspaceB = service.registerClient(makeClient({ workspaceId: "b" }));

  service.broadcast({ type: "message.updated", message: { threadId: "thread-a", workspaceId: "b" } });

  assert.equal(lastPayload(workspaceA).message.threadId, "thread-a");
  assert.equal(lastPayload(workspaceB), null);
}

function testUnknownThreadFallsBackToWorkspaceOrBroadcast() {
  const { service } = makeService([]);
  const workspaceA = service.registerClient(makeClient({ workspaceId: "a" }));
  const workspaceB = service.registerClient(makeClient({ workspaceId: "b" }));

  service.broadcast({ type: "thread.updated", threadId: "missing", workspaceId: "a" });
  assert.equal(lastPayload(workspaceA).workspaceId, "a");
  assert.equal(lastPayload(workspaceB), null);

  service.broadcast({ type: "client.version" });
  assert.equal(lastPayload(workspaceA).type, "client.version");
  assert.equal(lastPayload(workspaceB).type, "client.version");
}

function testWriteFailureRemovesClient() {
  const { service } = makeService();
  const bad = service.registerClient(makeClient({ workspaceId: "a" }, { throwOnWrite: true }));
  const good = service.registerClient(makeClient({ workspaceId: "a" }));

  service.broadcast({ type: "todo.updated", workspaceId: "a" });

  assert.equal(service.clientCount(), 1);
  assert.deepEqual(service.listClients(), [good]);
  assert.equal(service.listClients().includes(bad), false);
  assert.equal(lastPayload(good).type, "todo.updated");
}

testFrameAndWorkspaceExtraction();
testWorkspaceBroadcastIsolation();
testThreadVisibilityOverridesWorkspaceFallback();
testMessageThreadIdBranch();
testUnknownThreadFallsBackToWorkspaceOrBroadcast();
testWriteFailureRemovesClient();

console.log("event fanout service tests passed");
