"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadUploadClient() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/chat-runtime/attachment-upload-client.mjs",
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
  await test("upload client stays pure and browser-boundary free", async () => {
    const source = read("src/vite-islands/chat-runtime/attachment-upload-client.mjs");
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /document\./);
    assert.doesNotMatch(source, /FileReader/);
    assert.doesNotMatch(source, /EventSource/);
  });

  await test("data URL reader output is converted to upload request body", async () => {
    const client = await loadUploadClient();
    const calls = [];
    const result = await client.uploadComposerFile({
      threadId: "thread/a",
      workspaceId: "owner",
      file: { name: "fixture.md", type: "text/markdown", size: 5 },
      readFileAsDataUrl: async () => "data:text/markdown;base64,SGVsbG8=",
      api: async (url, options) => {
        calls.push({ url, options });
        return {
          ok: true,
          source: "test_api",
          artifact: {
            id: "artifact_1",
            name: "fixture.md",
            mime: "text/markdown",
            size: 5,
          },
        };
      },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/threads/thread%2Fa/uploads");
    const body = JSON.parse(calls[0].options.body);
    assert.deepEqual(body, {
      filename: "fixture.md",
      type: "text/markdown",
      dataBase64: "SGVsbG8=",
      workspaceId: "owner",
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, "test_api");
    assert.equal(result.request.dataBase64Length, 8);
    assert.equal(result.artifact.id, "artifact_1");
    assert.equal(result.artifact.source, "system_upload");
  });

  await test("upload client rejects missing reader before API call", async () => {
    const client = await loadUploadClient();
    let called = false;
    await assert.rejects(
      () => client.uploadComposerFile({
        threadId: "thread_1",
        file: { name: "fixture.md", type: "text/markdown" },
        api: async () => {
          called = true;
        },
      }),
      /attachment_upload_requires_file_reader/,
    );
    assert.equal(called, false);
  });

  await test("pre-encoded dataBase64 can upload without reader", async () => {
    const client = await loadUploadClient();
    const result = await client.uploadComposerFile({
      threadId: "thread_1",
      file: {
        name: "encoded.txt",
        type: "text/plain",
        dataBase64: "ZW5jb2RlZA==",
      },
      api: async () => ({
        ok: true,
        artifact: { id: "artifact_encoded", name: "encoded.txt", type: "text/plain" },
      }),
    });
    assert.equal(result.artifact.id, "artifact_encoded");
    assert.equal(result.request.filename, "encoded.txt");
  });

  await test("multi-file upload runs sequentially and reports bounded progress", async () => {
    const client = await loadUploadClient();
    const progress = [];
    const urls = [];
    const result = await client.uploadComposerFiles({
      threadId: "thread_1",
      files: [
        { name: "a.txt", type: "text/plain", dataBase64: "YQ==" },
        { name: "b.txt", type: "text/plain", dataBase64: "Yg==" },
      ],
      onProgress: (event) => progress.push(event),
      api: async (url, options) => {
        urls.push(url);
        const body = JSON.parse(options.body);
        return {
          ok: true,
          artifact: {
            id: `artifact_${body.filename}`,
            name: body.filename,
            type: body.type,
          },
        };
      },
    });
    assert.deepEqual(urls, ["/api/threads/thread_1/uploads", "/api/threads/thread_1/uploads"]);
    assert.equal(result.count, 2);
    assert.deepEqual(result.artifacts.map((artifact) => artifact.id), ["artifact_a.txt", "artifact_b.txt"]);
    assert.deepEqual(progress.map((event) => event.status), ["uploading", "uploading", "done"]);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
