"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-task-preview-helpers-ui.js"), "utf8");

assert.doesNotMatch(source, /X-Hermes-Web-Key/);
assert.doesNotMatch(source, /(?<![\w$.])fetch\s*\(/);
assert.doesNotMatch(source, /localStorage/);
assert.match(source, /预览接口未就绪/);
assert.match(source, /文件预览下载未就绪/);

const calls = { api: [], blob: [], absolute: [] };
const context = {
  console,
  URL,
  Blob,
  File,
  btoa,
  navigator: {},
  document: {
    body: {
      append() {},
    },
    createElement() {
      return {
        click() {},
        remove() {},
      };
    },
    querySelectorAll() {
      return [];
    },
    getElementById() {
      return null;
    },
  },
  location: {
    href: "http://127.0.0.1/tasks",
  },
  localStorage: {
    getItem() {
      throw new Error("preview helper should prefer runtime facade before localStorage");
    },
  },
  setTimeout,
  HomeAiRuntimeFacade: {
    state: {
      get(key) {
        return key === "selectedWorkspaceId" ? "workspace-from-runtime" : "";
      },
    },
    api(pathname, options = {}) {
      calls.api.push({ pathname, options });
      return Promise.resolve({ ok: true, text: "# Runtime" });
    },
    documentPreview: {
      absoluteUrl(value) {
        calls.absolute.push(value);
        return `runtime:${value}`;
      },
      fetchBlob(value) {
        calls.blob.push(value);
        return Promise.resolve({
          type: "text/markdown",
          size: 128,
          text: () => Promise.resolve("# Runtime Markdown"),
        });
      },
    },
  },
};

context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: "app-task-preview-helpers-ui.js" });

(async () => {
  const helpers = context.TaskDocumentPreviewHelpers;
  assert.equal(helpers.currentWorkspaceId(), "workspace-from-runtime");
  assert.equal(helpers.previewShareUrl("/api/files?artifactId=a1"), "runtime:/api/files?artifactId=a1");

  const body = await helpers.previewApi("/api/files/preview?artifactId=a1");
  assert.deepEqual(body, { ok: true, text: "# Runtime" });
  assert.equal(calls.api.length, 1);
  assert.equal(calls.api[0].pathname, "/api/files/preview?artifactId=a1");

  const blob = await helpers.fetchPreviewBlob("/api/files?artifactId=a1");
  assert.equal(blob.type, "text/markdown");
  const text = await helpers.fetchPreviewText("/api/files/preview?artifactId=a1");
  assert.equal(text, "# Runtime Markdown");
  assert.deepEqual(calls.blob, ["/api/files?artifactId=a1", "/api/files/preview?artifactId=a1"]);
  assert.deepEqual(calls.absolute, ["/api/files?artifactId=a1"]);
  console.log("task preview helpers runtime facade tests passed");
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
