"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const service = require("../adapters/weixin-markdown-forward-service");

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermes-weixin-md-forward-"));
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function makeOptions(root, overrides = {}) {
  return Object.assign({
    dataDir: path.join(root, "data"),
    env: {},
    makeId: () => "id",
    nowIso: () => "2026-05-15T00:00:00.000Z",
    normalizeLocalPath: (rawPath) => String(rawPath || ""),
    renderHtml(title, sourcePath, markdown) {
      assert.equal(title, "Report");
      assert.ok(sourcePath);
      assert.match(markdown, /heading/i);
      return "<!doctype html><main><h1>Report</h1></main>";
    },
    safeFileName(value) {
      return path.basename(String(value || "upload.bin")).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "upload.bin";
    },
  }, overrides);
}

function testMarkdownDetectionAndBrowserCandidates() {
  assert.equal(service.isMarkdownForwardFile({ name: "notes.md" }), true);
  assert.equal(service.isMarkdownForwardFile({ name: "notes.markdown" }), true);
  assert.equal(service.isMarkdownForwardFile({ mime: "text/markdown" }), true);
  assert.equal(service.isMarkdownForwardFile({ name: "notes.txt", mime: "text/plain" }), false);

  const candidates = service.chromiumExecutableCandidates({
    HERMES_MOBILE_WEIXIN_MARKDOWN_PDF_BROWSER: "mobile-browser",
    HERMES_WEB_WEIXIN_MARKDOWN_PDF_BROWSER: "web-browser",
  });
  assert.equal(candidates[0], "mobile-browser");
  assert.equal(candidates[1], "web-browser");
}

function testFindFirstExistingFileAndDirectory() {
  const root = tempRoot();
  const existing = path.join(root, "browser.exe");
  fs.writeFileSync(existing, "");
  assert.equal(service.findFirstExistingFile([path.join(root, "missing.exe"), existing]), existing);

  const dir = service.weixinMarkdownForwardDir("workspace:id", {
    dataDir: path.join(root, "data"),
    safeFileName: (value) => String(value).replace(/[:]/g, "_"),
  });
  assert.equal(fs.existsSync(dir), true);
  assert.equal(path.basename(path.dirname(dir)), "workspace_id");
}

function testRenderPdfUsesStubbedBrowserAndHtmlRenderer() {
  const root = tempRoot();
  const source = path.join(root, "Report.md");
  const browser = path.join(root, "browser.exe");
  writeFile(source, "# heading\n\nbody");
  fs.writeFileSync(browser, "");
  const calls = [];

  const pdfPath = service.renderMarkdownForwardPdf(source, "owner", "Report.md", makeOptions(root, {
    env: { HERMES_MOBILE_WEIXIN_MARKDOWN_PDF_BROWSER: browser },
    spawnSync(command, args, opts) {
      calls.push({ command, args, opts });
      assert.equal(command, browser);
      assert.equal(opts.stdio, "ignore");
      const pdfArg = args.find((arg) => String(arg).startsWith("--print-to-pdf="));
      const outPath = pdfArg.slice("--print-to-pdf=".length);
      fs.writeFileSync(outPath, Buffer.alloc(600, 1));
      return { status: 0 };
    },
  }));

  assert.equal(path.extname(pdfPath), ".pdf");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.some((arg) => String(arg).startsWith("file:///")), true);
}

function testMaterializePrefersPdfAndReturnsPublicMetadata() {
  const root = tempRoot();
  const source = path.join(root, "Report.md");
  const browser = path.join(root, "browser.exe");
  writeFile(source, "# heading");
  fs.writeFileSync(browser, "");

  const result = service.materializeWeixinForwardFile({
    localPath: source,
    name: "Report.md",
    mime: "text/markdown",
    size: 9,
  }, "owner", makeOptions(root, {
    env: { HERMES_WEB_WEIXIN_MARKDOWN_PDF_BROWSER: browser },
    mimeFor: () => "application/pdf",
    spawnSync(_command, args) {
      const pdfArg = args.find((arg) => String(arg).startsWith("--print-to-pdf="));
      fs.writeFileSync(pdfArg.slice("--print-to-pdf=".length), Buffer.alloc(700, 2));
      return { status: 0 };
    },
  }));

  assert.equal(result.name, "Report.pdf");
  assert.equal(result.mime, "application/pdf");
  assert.equal(result.updatedAt, "2026-05-15T00:00:00.000Z");
  assert.equal(result.sourceMarkdownPath, source);
  assert.notEqual(result.localPath, source);
}

function testMaterializeFallsBackToTextWhenPdfFails() {
  const root = tempRoot();
  const source = path.join(root, "Report.md");
  writeFile(source, "# heading\n\nfallback");

  const result = service.materializeWeixinForwardFile({
    localPath: source,
    name: "Report.md",
    mime: "text/markdown",
  }, "owner", makeOptions(root, {
    mimeFor: () => "text/plain; charset=utf-8",
    spawnSync() {
      return { status: 1 };
    },
  }));

  assert.equal(result.name, "Report.txt");
  assert.equal(result.mime, "text/plain; charset=utf-8");
  assert.equal(fs.readFileSync(result.localPath, "utf8"), "# heading\n\nfallback");
}

function testOversizedAndNonMarkdownFilesAreNotMaterialized() {
  const root = tempRoot();
  const source = path.join(root, "large.md");
  writeFile(source, "x".repeat(2048));
  const markdownFile = { localPath: source, name: "large.md", mime: "text/markdown" };
  const textFile = { localPath: source, name: "plain.txt", mime: "text/plain" };

  assert.equal(service.materializeWeixinForwardFile(markdownFile, "owner", makeOptions(root, {
    maxBytes: 4,
    spawnSync() {
      throw new Error("browser should not be called");
    },
  })) === markdownFile, true);
  assert.equal(service.materializeWeixinForwardFile(textFile, "owner", makeOptions(root)) === textFile, true);
}

testMarkdownDetectionAndBrowserCandidates();
testFindFirstExistingFileAndDirectory();
testRenderPdfUsesStubbedBrowserAndHtmlRenderer();
testMaterializePrefersPdfAndReturnsPublicMetadata();
testMaterializeFallsBackToTextWhenPdfFails();
testOversizedAndNonMarkdownFilesAreNotMaterialized();

console.log("weixin markdown forward service tests passed");
