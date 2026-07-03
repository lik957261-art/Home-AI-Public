"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadServerFileClient() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/chat-runtime/attachment-server-file-client.mjs",
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
  await test("server-file client stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/chat-runtime/attachment-server-file-client.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
    assert.doesNotMatch(source, /FileReader/);
    assert.doesNotMatch(source, /dataBase64/);
    assert.doesNotMatch(source, /EventSource/);
  });

  await test("server-file client calls runtime API with classic attachment route shape", async () => {
    const client = await loadServerFileClient();
    const calls = [];
    const result = await client.attachServerFileToComposer({
      threadId: "thread/server",
      workspaceId: "owner",
      entry: {
        path: "/系统分享/HomeAI/report.pdf",
        name: "report.pdf",
      },
      api: async (url, options) => {
        calls.push({ url, options });
        return {
          ok: true,
          source: "test_api",
          artifact: {
            id: "artifact_server_file",
            name: "report.pdf",
            filename: "report.pdf",
            type: "application/pdf",
            size: 8192,
            workspaceId: "owner",
          },
        };
      },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/threads/thread%2Fserver/server-file-attachments");
    assert.equal(calls[0].options.method, "POST");
    const body = JSON.parse(calls[0].options.body);
    assert.deepEqual(body, {
      path: "/系统分享/HomeAI/report.pdf",
      filename: "report.pdf",
      workspaceId: "owner",
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, "test_api");
    assert.equal(result.artifact.id, "artifact_server_file");
    assert.equal(result.artifact.source, "server_file");
    assert.equal(result.artifact.name, "report.pdf");
    assert.equal(result.request.hasPath, true);
  });

  await test("server-file client rejects invalid input before API call", async () => {
    const client = await loadServerFileClient();
    let called = false;
    await assert.rejects(
      () => client.attachServerFileToComposer({
        threadId: "thread_1",
        entry: { name: "missing-path.pdf" },
        api: async () => {
          called = true;
        },
      }),
      /path_missing/,
    );
    assert.equal(called, false);
  });

  await test("server-file client surfaces backend rejection without fallback", async () => {
    const client = await loadServerFileClient();
    await assert.rejects(
      () => client.attachServerFileToComposer({
        threadId: "thread_1",
        entry: { path: "remote/file.pdf", name: "file.pdf" },
        api: async () => {
          const error = new Error("Remote server files are not attachable yet");
          error.status = 400;
          throw error;
        },
      }),
      /Remote server files are not attachable yet/,
    );
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
