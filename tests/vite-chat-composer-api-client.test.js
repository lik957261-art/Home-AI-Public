"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadApiClient() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/chat-runtime/composer-api-client.mjs",
  )).href;
  return import(`${url}?test=${Date.now()}-${Math.random()}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

(async () => {
  await test("composer API client stays pure and uses injected runtime API only", async () => {
    const source = read("src/vite-islands/chat-runtime/composer-api-client.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
    assert.doesNotMatch(source, /EventSource/);
  });

  await test("composer send request matches classic thread message endpoint", async () => {
    const client = await loadApiClient();
    const request = client.buildComposerSendRequest({
      threadId: "thread 1",
      body: {
        text: "继续",
        workspaceId: "owner",
        notificationChannel: "web_push",
        taskGroupId: "task_1",
        singleWindowMode: "task",
        messageLimit: 30,
        reasoning_effort: "medium",
      },
    });

    assert.equal(request.ok, true);
    assert.equal(request.method, "POST");
    assert.equal(request.path, "/api/threads/thread%201/messages");
    assert.equal(request.timeoutMs, 30000);
    assert.equal(request.body.text, "继续");
    assert.equal(request.body.taskGroupId, "task_1");
    assert.equal(request.body.reasoning_effort, "medium");
  });

  await test("composer interrupt request matches classic thread interrupt endpoint", async () => {
    const client = await loadApiClient();
    const request = client.buildComposerInterruptRequest({
      threadId: "thread/1",
      taskGroupId: "task_1",
    });

    assert.equal(request.ok, true);
    assert.equal(request.method, "POST");
    assert.equal(request.path, "/api/threads/thread%2F1/interrupt");
    assert.deepEqual(request.body, { taskGroupId: "task_1" });
  });

  await test("composer API calls use the injected facade API and JSON body", async () => {
    const client = await loadApiClient();
    const calls = [];
    const api = async (pathName, options) => {
      calls.push({ pathName, options });
      return { ok: true, pathName };
    };

    await client.sendComposerMessage({
      api,
      threadId: "thread_1",
      body: { text: "发送", workspaceId: "owner" },
    });
    await client.interruptComposerRun({
      api,
      threadId: "thread_1",
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].pathName, "/api/threads/thread_1/messages");
    assert.equal(calls[0].options.method, "POST");
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      text: "发送",
      artifacts: [],
      workspaceId: "owner",
      notificationChannel: "web_push",
    });
    assert.equal(calls[1].pathName, "/api/threads/thread_1/interrupt");
    assert.deepEqual(JSON.parse(calls[1].options.body), {});
  });

  await test("composer API client rejects missing thread or empty body before API call", async () => {
    const client = await loadApiClient();
    const empty = client.buildComposerSendRequest({ threadId: "thread_1", body: { text: "  " } });
    assert.equal(empty.ok, false);
    assert.equal(empty.code, "message_body_empty");

    await assert.rejects(
      () => client.sendComposerMessage({ api: async () => ({ ok: true }), body: { text: "hello" } }),
      /thread_id_missing/,
    );
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
