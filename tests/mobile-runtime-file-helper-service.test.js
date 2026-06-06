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
  fs.writeFileSync(invalidJson, "{", "utf8");
  fs.writeFileSync(validJson, JSON.stringify({ ok: true, value: 42 }), "utf8");

  const traces = [];
  const helper = createMobileRuntimeFileHelperService({
    fs,
    path,
    bootTrace: (label) => traces.push(label),
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
