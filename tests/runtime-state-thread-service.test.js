"use strict";

const assert = require("node:assert/strict");

const { createRuntimeStateThreadService } = require("../adapters/runtime-state-thread-service");

function makeService(overrides = {}) {
  const state = overrides.state || {
    threads: [{
      id: "thread-1",
      workspaceId: "owner",
      messages: [{
        id: "msg-1",
        role: "user",
        artifacts: [{ id: "artifact-1" }],
        externalIngress: { source: "weixin", eventId: "wx-1" },
        runId: "run-1",
        gatewayUrl: "http://gateway",
      }],
    }],
    artifacts: [{ id: "artifact-1", threadId: "thread-1", messageId: "msg-1", path: "C:\\file.txt" }],
  };
  const saves = [];
  const service = createRuntimeStateThreadService(Object.assign({
    authenticateRequest: () => ({ ok: true, workspaceId: "owner" }),
    authCanAccessWorkspace: (auth, workspaceId) => Boolean(auth?.ok && (auth.workspaceId === workspaceId || auth.isOwner)),
    chatGroupMemberWorkspaceIds: (thread) => thread?.chatGroup?.memberWorkspaceIds || [],
    groupChatTaskGroupId: "group-chat",
    saveState: () => saves.push("save"),
    state: () => state,
  }, overrides.deps || {}));
  return { saves, service, state };
}

function testFindsThreadsArtifactsAndIngressEvents() {
  const { service } = makeService();
  assert.equal(service.findThreadForAuth({ ok: true, workspaceId: "owner" }, "thread-1").id, "thread-1");
  assert.equal(service.findArtifactReferenceById("artifact-1").message.id, "msg-1");
  assert.equal(service.findArtifactReference({ id: "artifact-1" }).thread.id, "thread-1");
  assert.equal(service.findExistingWeixinIngressEvent("wx-1").message.id, "msg-1");
  assert.equal(service.storedGatewayUrlForRun("run-1"), "http://gateway");
  assert.equal(service.buildUserMessageContent("hello", [{ id: "artifact-1" }]), "hello\n\nMEDIA:C:\\file.txt");
}

function testGroupChatArtifactAccess() {
  const { service, state } = makeService({
    state: {
      threads: [{
        id: "group",
        workspaceId: "owner",
        singleWindow: true,
        chatGroup: { memberWorkspaceIds: ["child"] },
        messages: [{ id: "m", taskGroupId: "group-chat", artifacts: [{ id: "a" }] }],
      }],
      artifacts: [{ id: "a", threadId: "group", messageId: "m", path: "C:\\shared.txt" }],
    },
  });
  assert.equal(service.threadAccessibleToAuth({ ok: true, workspaceId: "child" }, state.threads[0]), true);
  assert.equal(service.artifactAccessibleToAuth({ ok: true, workspaceId: "child" }, state.threads[0], state.artifacts[0]), true);
}

function testPrunesOldEmptyThreadsAndArtifacts() {
  const { saves, service, state } = makeService({
    state: {
      threads: [
        { id: "empty", workspaceId: "owner", createdAt: "2020-01-01T00:00:00.000Z", messages: [] },
        { id: "kept", workspaceId: "owner", createdAt: "2020-01-01T00:00:00.000Z", messages: [{ id: "m" }] },
      ],
      artifacts: [{ id: "b", threadId: "kept" }],
    },
  });
  assert.equal(service.pruneEmptyThreads(), 1);
  assert.deepEqual(state.threads.map((thread) => thread.id), ["kept"]);
  assert.deepEqual(state.artifacts.map((artifact) => artifact.id), ["b"]);
  assert.deepEqual(saves, ["save"]);
}

function run() {
  testFindsThreadsArtifactsAndIngressEvents();
  testGroupChatArtifactAccess();
  testPrunesOldEmptyThreadsAndArtifacts();
  console.log("runtime-state-thread-service tests passed");
}

run();
