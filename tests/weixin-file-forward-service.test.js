"use strict";

const assert = require("node:assert/strict");
const {
  createWeixinFileForwardService,
} = require("../adapters/weixin-file-forward-service");

function makeService(overrides = {}) {
  const calls = {
    access: [],
    artifact: [],
    browserFile: [],
    cronOutput: [],
    cronDeliverable: [],
    kanban: [],
    egress: [],
    materialize: [],
    bridge: [],
    save: 0,
    broadcast: [],
  };
  const state = {
    artifacts: [],
  };
  const thread = {
    id: "wx-thread",
    workspaceId: "child",
    projectId: "single-window",
    subprojectId: "",
    messages: [],
    activeRunIds: [],
  };
  const existingThread = {
    id: "existing-wx-thread",
    workspaceId: "child",
    projectId: "single-window",
    messages: [],
    activeRunIds: [],
    externalIngress: { source: "weixin" },
  };
  const fakeFs = {
    existsSync(filePath) {
      return String(filePath || "").startsWith("/virtual/");
    },
    statSync(filePath) {
      return {
        size: String(filePath || "").endsWith(".pdf") ? 321 : 123,
        isFile() {
          return String(filePath || "").startsWith("/virtual/");
        },
      };
    },
  };
  const deps = Object.assign({
    authCanAccessWorkspace(auth, workspaceId) {
      calls.access.push({ workspaceId });
      return Boolean(auth?.ok && (auth.workspaceId === "owner" || auth.workspaceId === workspaceId));
    },
    basename(filePath) {
      return String(filePath || "").split("/").pop() || "file";
    },
    broadcast(event) {
      calls.broadcast.push(event);
    },
    compactMessage(message) {
      return { id: message.id, deliveryId: message.externalDelivery?.deliveryId, artifacts: message.artifacts };
    },
    compactText(text, max) {
      return String(text || "").slice(0, max);
    },
    compactThread(value) {
      return { id: value.id, messageCount: value.messages.length };
    },
    deliveryId(threadId, messageId) {
      return `delivery:${threadId}:${messageId}`;
    },
    egressPolicyProvider: {
      decide(decision) {
        calls.egress.push(decision);
        return { allowed: true, reason: "policy-ok" };
      },
    },
    ensureWeixinSingleWindowThread(workspaceId, target) {
      thread.workspaceId = workspaceId;
      thread.target = target;
      return thread;
    },
    fileResultFromBridgeFileForForward(bridgeFile, workspaceId) {
      calls.bridge.push({ bridgeFile, workspaceId });
      return {
        file: {
          localPath: "/virtual/bridge-output.pdf",
          displayPath: "bridge-output.pdf",
          name: "bridge-output.pdf",
          mime: "application/pdf",
          size: 55,
        },
      };
    },
    findThreadForAuth(auth, threadId) {
      return threadId === existingThread.id ? existingThread : null;
    },
    fs: fakeFs,
    isOwnerAuth(auth) {
      return auth?.workspaceId === "owner";
    },
    isWeixinSingleWindowThread(value) {
      return value === existingThread;
    },
    makeId(prefix) {
      return `${prefix}-1`;
    },
    materializeWeixinForwardFile(file, workspaceId) {
      calls.materialize.push({ file, workspaceId });
      return file;
    },
    mimeFor(filePath) {
      return String(filePath || "").endsWith(".pdf") ? "application/pdf" : "text/plain";
    },
    normalizeExternalDelivery(delivery) {
      return Object.assign({ normalized: true }, delivery);
    },
    normalizeLocalPath(filePath) {
      return String(filePath || "");
    },
    nowIso() {
      return "2026-05-15T00:00:00.000Z";
    },
    publicWeixinOutboundDelivery(value, message) {
      return { deliveryId: message.externalDelivery.deliveryId, status: message.externalDelivery.status };
    },
    resolveArtifactForRequest(artifactId) {
      calls.artifact.push(artifactId);
      if (artifactId === "missing") return { status: 404, error: "Artifact not found" };
      return {
        artifact: {
          id: artifactId,
          localPath: `/virtual/${artifactId}.pdf`,
          displayPath: `${artifactId}.pdf`,
          name: `${artifactId}.pdf`,
          mime: "application/pdf",
          size: 99,
        },
        thread,
      };
    },
    resolveAuthorizedCronDeliverableFile(params) {
      calls.cronDeliverable.push(Object.fromEntries(params.entries()));
      return { file: { localPath: "/virtual/deliverable.pdf", name: "deliverable.pdf" } };
    },
    resolveAuthorizedCronOutputFile(params) {
      calls.cronOutput.push(Object.fromEntries(params.entries()));
      return { bridgeFile: { name: "output.pdf", bytes: 10 } };
    },
    resolveFileForBrowserRequest(params) {
      calls.browserFile.push(Object.fromEntries(params.entries()));
      return { file: { localPath: "/virtual/browser-file.txt", name: "browser-file.txt" } };
    },
    resolveKanbanOutputFile(workspaceId, filePath) {
      calls.kanban.push({ workspaceId, path: filePath });
      return { file: { localPath: "/virtual/kanban.pdf", name: "kanban.pdf" } };
    },
    resolveWeixinForwardTarget(body, auth, workspaceId) {
      return {
        accountId: "wx-account",
        chatId: "chat-id",
        userId: "user-id",
        workspaceId,
      };
    },
    safeFileName(value) {
      return String(value || "file").replace(/[^A-Za-z0-9_.-]/g, "_");
    },
    saveState() {
      calls.save += 1;
    },
    singleWindowChatTaskGroupId: "chat",
    state: () => state,
    threadSummary(value) {
      return { id: value.id, status: value.status };
    },
  }, overrides);
  return {
    calls,
    existingThread,
    service: createWeixinFileForwardService(deps),
    state,
    thread,
  };
}

async function testResolveDirectInputs() {
  const { service, calls } = makeService();
  const auth = { ok: true, workspaceId: "child" };

  const byArtifact = await service.resolveWeixinForwardFile({ artifact_id: "artifact-a" }, auth);
  assert.equal(byArtifact.file.localPath, "/virtual/artifact-a.pdf");
  assert.deepEqual(calls.artifact, ["artifact-a"]);

  const byThreadPath = await service.resolveWeixinForwardFile({ threadId: "thread-1", path: "docs/a.txt" }, auth);
  assert.equal(byThreadPath.file.localPath, "/virtual/browser-file.txt");
  assert.deepEqual(calls.browserFile.at(-1), { threadId: "thread-1", path: "docs/a.txt" });

  const byInline = await service.resolveWeixinForwardFile({
    inlineFile: {
      filename: "notes.md",
      contentType: "text/markdown; charset=utf-8",
      contentBase64: Buffer.from("# Notes\n", "utf8").toString("base64"),
    },
  }, auth);
  assert.equal(byInline.bridgeFile.name, "notes.md");
  assert.equal(byInline.bridgeFile.mime, "text/markdown; charset=utf-8");

  const missing = await service.resolveWeixinForwardFile({}, auth);
  assert.deepEqual(missing, { status: 400, error: "Missing artifactId, sourceUrl, or threadId/path" });
}

async function testResolveSourceUrls() {
  const { service, calls } = makeService();
  const auth = { ok: true, workspaceId: "child" };

  assert.equal((await service.resolveFileFromSourceUrlForRequest("/api/artifacts/source-artifact", auth)).file.name, "source-artifact.pdf");
  assert.equal((await service.resolveFileFromSourceUrlForRequest("/api/files?threadId=t1&path=folder%2Fa.txt", auth)).file.name, "browser-file.txt");
  assert.equal((await service.resolveFileFromSourceUrlForRequest("/api/automations/output?workspaceId=child&jobId=j1", auth)).bridgeFile.name, "output.pdf");
  assert.equal((await service.resolveFileFromSourceUrlForRequest("/api/automations/deliverable/preview?workspaceId=child&path=x", auth)).file.name, "deliverable.pdf");
  assert.equal((await service.resolveFileFromSourceUrlForRequest("/api/kanban/cards/output/preview?workspaceId=child&path=card.pdf", auth)).file.name, "kanban.pdf");
  assert.equal((await service.resolveFileFromSourceUrlForRequest("::::", auth)).status, 400);

  assert.deepEqual(calls.cronOutput, [{ workspaceId: "child", jobId: "j1" }]);
  assert.deepEqual(calls.cronDeliverable, [{ workspaceId: "child", path: "x" }]);
  assert.deepEqual(calls.kanban, [{ workspaceId: "child", path: "card.pdf" }]);
}

function testPublicArtifactRegistersWithoutRealFilesystem() {
  const { service, state, thread } = makeService();
  const message = { id: "msg-1" };

  const artifact = service.publicArtifactForWeixinForward({
    localPath: "/virtual/report.pdf",
    displayPath: "report.pdf",
    name: "report.pdf",
    mime: "application/pdf",
  }, thread, message);

  assert.equal(artifact.id, "artifact-1");
  assert.equal(artifact.url, "/api/artifacts/artifact-1");
  assert.equal(state.artifacts.length, 1);
  assert.equal(service.publicArtifactForWeixinForward({ localPath: "/not-visible/report.pdf" }, thread, message), null);
}

async function testCreateDeliveryFromArtifact() {
  const { service, calls, thread } = makeService();
  const auth = { ok: true, workspaceId: "child" };
  const result = await service.createWeixinFileForwardDelivery(auth, {
    workspaceId: "child",
    artifactId: "artifact-a",
    caption: "caption text",
  });

  assert.equal(result.ok, true);
  assert.equal(result.delivery.deliveryId, "delivery:wx-thread:msg-1");
  assert.equal(thread.messages.length, 1);
  assert.equal(thread.messages[0].externalDelivery.terminalStatus, "manual_forward");
  assert.equal(calls.save, 1);
  assert.equal(calls.broadcast.length, 2);
  assert.deepEqual(calls.materialize.map((item) => item.workspaceId), ["child"]);
  assert.equal(calls.egress[0].operation, "manual_forward");
  assert.equal(calls.egress[0].explicitUserApproved, true);
  assert.equal(calls.egress[0].sendsFileContent, true);
  assert.deepEqual(calls.egress[0].contentKinds, ["artifact"]);
  assert.equal(calls.egress[0].targetId, "wx-account:chat-id:user-id");
}

async function testCreateDeliveryFromBridgeFileAndRequestedThread() {
  const { service, calls, existingThread } = makeService();
  const auth = { ok: true, workspaceId: "child" };
  const result = await service.createWeixinFileForwardDelivery(auth, {
    workspaceId: "child",
    sourceUrl: "/api/automations/output?workspaceId=child&jobId=j1",
    threadId: "existing-wx-thread",
  });

  assert.equal(result.thread.id, "existing-wx-thread");
  assert.equal(existingThread.messages.length, 1);
  assert.equal(calls.bridge.length, 1);
  assert.equal(calls.materialize[0].file.localPath, "/virtual/bridge-output.pdf");
}

async function testCreateDeliveryFromInlineMarkdownFile() {
  const { service, calls, thread } = makeService();
  const auth = { ok: true, workspaceId: "child" };
  const result = await service.createWeixinFileForwardDelivery(auth, {
    workspaceId: "child",
    inlineFile: {
      filename: "notes.md",
      contentType: "text/markdown; charset=utf-8",
      contentBase64: Buffer.from("# Notes\n", "utf8").toString("base64"),
    },
  });

  assert.equal(result.ok, true);
  assert.equal(thread.messages.length, 1);
  assert.equal(calls.bridge.length, 1);
  assert.equal(calls.bridge[0].bridgeFile.name, "notes.md");
  assert.equal(calls.materialize[0].file.localPath, "/virtual/bridge-output.pdf");
}

async function testAccessAndEgressFailuresUseGenericMessages() {
  const deniedAccess = makeService().service.createWeixinFileForwardDelivery(
    { ok: true, workspaceId: "child" },
    { workspaceId: "blocked", artifactId: "artifact-a" },
  );
  await assert.rejects(deniedAccess, /Workspace access is not allowed/);

  const { service } = makeService({
    egressPolicyProvider: {
      decide() {
        return { allowed: false, reason: "" };
      },
    },
  });
  await assert.rejects(
    service.createWeixinFileForwardDelivery({ ok: true, workspaceId: "child" }, { workspaceId: "child", artifactId: "artifact-a" }),
    (err) => err.status === 403 && err.code === "weixin_forward_egress_denied" && err.message === "Weixin file forwarding is not allowed",
  );
}

async function run() {
  await testResolveDirectInputs();
  await testResolveSourceUrls();
  testPublicArtifactRegistersWithoutRealFilesystem();
  await testCreateDeliveryFromArtifact();
  await testCreateDeliveryFromBridgeFileAndRequestedThread();
  await testCreateDeliveryFromInlineMarkdownFile();
  await testAccessAndEgressFailuresUseGenericMessages();
  console.log("weixin file forward service tests passed");
}

run().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exitCode = 1;
});
