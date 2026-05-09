"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");

async function request(baseUrl, route, options = {}) {
  const res = await fetch(`${baseUrl}${route}`, Object.assign({ headers: {} }, options));
  let body = null;
  try {
    body = await res.json();
  } catch (_) {}
  if (!res.ok) throw new Error(body?.error || `${res.status} ${res.statusText}`);
  return body;
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 15000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return await request(baseUrl, "/api/status", { headers: { "X-Hermes-Web-Key": "test-owner-key" } });
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError || new Error("server did not become ready");
}

function postJson(key, body) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hermes-Web-Key": key },
    body: JSON.stringify(body),
  };
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-mobile-single-window-split-"));
  const dataDir = path.join(tempDir, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const statePath = path.join(dataDir, "state.json");
  fs.writeFileSync(statePath, JSON.stringify({
    schemaVersion: 1,
    artifacts: [
      { id: "artifact_owner", threadId: "thread_group", messageId: "owner_assistant", name: "owner.pdf", path: "" },
      { id: "artifact_group", threadId: "thread_group", messageId: "group_user", name: "group.pdf", path: "" },
    ],
    pushSubscriptions: [],
    pushReceipts: [],
    pushDeliveries: [],
    automationPushMarks: {},
    threads: [{
      id: "thread_group",
      title: "Single Window",
      workspaceId: "owner",
      projectId: "single-window",
      singleWindow: true,
      hermesSessionId: "web_single_group",
      status: "idle",
      createdAt: "2026-05-08T10:00:00.000Z",
      updatedAt: "2026-05-08T10:04:00.000Z",
      chatGroup: {
        enabled: true,
        memberWorkspaceIds: ["owner", "weixin_example_user"],
        createdAt: "2026-05-08T10:00:00.000Z",
        updatedAt: "2026-05-08T10:00:00.000Z",
      },
      messages: [
        { id: "owner_user", role: "user", status: "done", taskGroupId: "chat", messageKind: "ai", senderWorkspaceId: "owner", actorWorkspaceId: "owner", content: "owner private", createdAt: "2026-05-08T10:01:00.000Z", updatedAt: "2026-05-08T10:01:00.000Z" },
        { id: "owner_assistant", role: "assistant", status: "done", taskGroupId: "chat", messageKind: "ai", senderWorkspaceId: "hermes", actorWorkspaceId: "owner", content: "owner reply", artifacts: [{ id: "artifact_owner", name: "owner.pdf" }], createdAt: "2026-05-08T10:01:01.000Z", updatedAt: "2026-05-08T10:01:01.000Z" },
        { id: "group_user", role: "user", status: "done", taskGroupId: "group-chat", messageKind: "plain", senderWorkspaceId: "owner", actorWorkspaceId: "owner", content: "shared group", artifacts: [{ id: "artifact_group", name: "group.pdf" }], createdAt: "2026-05-08T10:02:00.000Z", updatedAt: "2026-05-08T10:02:00.000Z" },
        { id: "example_user_user", role: "user", status: "done", taskGroupId: "task_example_user", messageKind: "ai", senderWorkspaceId: "weixin_example_user", actorWorkspaceId: "weixin_example_user", content: "example_user task", createdAt: "2026-05-08T10:03:00.000Z", updatedAt: "2026-05-08T10:03:00.000Z" },
        { id: "example_user_assistant", role: "assistant", status: "done", taskGroupId: "task_example_user", messageKind: "ai", senderWorkspaceId: "hermes", actorWorkspaceId: "weixin_example_user", content: "example_user reply", createdAt: "2026-05-08T10:03:01.000Z", updatedAt: "2026-05-08T10:03:01.000Z" },
      ],
      events: [],
    }],
  }, null, 2));

  const port = 19000 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = Object.assign({}, process.env, {
    HERMES_WEB_HOST: "127.0.0.1",
    HERMES_WEB_PORT: String(port),
    HERMES_WEB_DATA_DIR: dataDir,
    HERMES_WEB_KEY: "test-owner-key",
    HERMES_WEB_PUSH_ENABLED: "0",
    HERMES_WEB_GATEWAY_POOL_ENABLED: "0",
    HERMES_MOBILE_GATEWAY_USAGE_TELEMETRY_ENABLED: "0",
  });
  const child = spawn(process.execPath, ["server.js"], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "ignore", "pipe"],
  });
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(String(chunk)));

  try {
    await waitForServer(baseUrl);
    const privateResult = await request(baseUrl, "/api/single-window", postJson("test-owner-key", { workspaceId: "owner" }));
    const privateThread = privateResult.thread;
    assert.notEqual(privateThread.id, "thread_group");
    assert.equal(privateThread.chatGroup.enabled, false);
    assert.deepEqual(privateThread.messages.map((message) => message.id), ["owner_user", "owner_assistant"]);

    const groupResult = await request(baseUrl, "/api/single-window", postJson("test-owner-key", { workspaceId: "owner", groupChat: true }));
    const groupThread = groupResult.thread;
    assert.equal(groupThread.id, "thread_group");
    assert.equal(groupThread.chatGroup.enabled, true);
    assert.deepEqual(groupThread.messages.map((message) => message.id), ["group_user", "example_user_user", "example_user_assistant"]);

    const persisted = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const ownerArtifact = persisted.artifacts.find((artifact) => artifact.id === "artifact_owner");
    assert.equal(ownerArtifact.threadId, privateThread.id);
    const groupArtifact = persisted.artifacts.find((artifact) => artifact.id === "artifact_group");
    assert.equal(groupArtifact.threadId, "thread_group");
  } finally {
    await stopChild(child);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
