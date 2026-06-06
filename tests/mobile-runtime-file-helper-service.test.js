"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createMobileRuntimeFileHelperService,
} = require("../adapters/mobile-runtime-file-helper-service");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "hm-runtime-file-helper-"));
try {
  const invalidJson = path.join(root, "invalid.json");
  const validJson = path.join(root, "valid.json");
  const storePath = path.join(root, "store", "state.json");
  fs.writeFileSync(invalidJson, "{", "utf8");
  fs.writeFileSync(validJson, JSON.stringify({ ok: true, value: 42 }), "utf8");

  const traces = [];
  let ensureDataDirCalls = 0;
  const helper = createMobileRuntimeFileHelperService({
    fs,
    path,
    bootTrace: (label) => traces.push(label),
    ensureDataDir: () => {
      ensureDataDirCalls += 1;
    },
    documentPreviewService: {
      extractDocxText(filePath) {
        return { text: `docx:${path.basename(filePath)}` };
      },
      textFilePreview(filePath) {
        return { text: `file:${path.basename(filePath)}` };
      },
      textBufferPreview(buffer) {
        return { text: buffer.toString("utf8") };
      },
    },
    httpRuntimeService: {
      contentDisposition(disposition, filename) {
        return `${disposition}:${filename}`;
      },
      mimeFor(file) {
        return `mime:${path.extname(file)}`;
      },
      serveStatic(req, res) {
        res.served = req.url;
      },
    },
    isUncPath: (value) => String(value || "").startsWith("//unc"),
    nowMs: () => 123456,
    processId: 777,
  });

  assert.equal(helper.mimeFor("a.md"), "mime:.md");
  assert.equal(helper.contentDisposition("inline", "a.md"), "inline:a.md");
  assert.deepEqual(helper.extractDocxText("a.docx"), { text: "docx:a.docx" });
  assert.deepEqual(helper.textFilePreview("a.txt"), { text: "file:a.txt" });
  assert.deepEqual(helper.textBufferPreview(Buffer.from("hello")), { text: "hello" });
  const response = {};
  helper.serveStatic({ url: "/app.js" }, response);
  assert.equal(response.served, "/app.js");

  const found = helper.readJsonFirst([
    path.join(root, "missing.json"),
    invalidJson,
    validJson,
  ], { fallback: true });
  assert.deepEqual(found, { data: { ok: true, value: 42 }, path: validJson });
  assert.equal(traces.some((label) => label.includes("readJsonFirst parsed valid.json")), true);

  const fallback = helper.readJsonFirst([path.join(root, "missing-again.json")], { fallback: true });
  assert.deepEqual(fallback, { data: { fallback: true }, path: "" });

  assert.deepEqual(helper.readJsonStore(path.join(root, "missing-store.json"), { fallback: true }), { fallback: true });
  assert.deepEqual(helper.readJsonStore(invalidJson, { invalidFallback: true }), { invalidFallback: true });
  assert.deepEqual(helper.readJsonStore(validJson, { fallback: true }), { ok: true, value: 42 });
  helper.writeJsonStore(storePath, { nested: { value: 7 } });
  assert.equal(
    fs.readFileSync(storePath, "utf8"),
    "{\n  \"nested\": {\n    \"value\": 7\n  }\n}\n",
  );
  assert.equal(fs.existsSync(`${storePath}.777.123456.tmp`), false);
  assert.equal(ensureDataDirCalls, 4);

  assert.throws(
    () => createMobileRuntimeFileHelperService({ documentPreviewService: {} }),
    /requires httpRuntimeService/,
  );
  assert.throws(
    () => createMobileRuntimeFileHelperService({ httpRuntimeService: {} }),
    /requires documentPreviewService/,
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("mobile runtime file helper service tests passed");
