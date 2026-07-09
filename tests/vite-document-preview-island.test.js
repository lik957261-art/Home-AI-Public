"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
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
  await test("Vite config builds a development document preview island", async () => {
    const configText = read("vite.config.js");
    assert.match(configText, /document-preview/);
    assert.match(configText, /\/vite-document-preview-preview\//);
    assert.match(configText, /src\/vite-islands\/document-preview\/main\.mjs/);
    assert.doesNotMatch(configText, /public\/index\.html/);
    assert.doesNotMatch(configText, /service-worker\.js/);
  });

  await test("preview page does not replace the primary PWA shell", async () => {
    const devPreview = read("src/vite-islands/document-preview/index.html");
    const builtPreview = read("public/vite-preview/document-preview.html");
    const indexHtml = read("public/index.html");
    const serviceWorker = read("public/service-worker.js");
    assert.match(devPreview, /\/src\/vite-islands\/document-preview\/main\.mjs/);
    assert.match(builtPreview, /\/vite-islands\/document-preview\/document-preview\.js/);
    assert.doesNotMatch(indexHtml, /vite-islands\/document-preview/);
    assert.doesNotMatch(indexHtml, /vite-preview\/document-preview/);
    assert.doesNotMatch(serviceWorker, /vite-islands\/document-preview/);
    assert.doesNotMatch(serviceWorker, /vite-preview\/document-preview/);
  });

  await test("source uses runtime facade and avoids unmanaged browser boundaries", async () => {
    const source = read("src/vite-islands/document-preview/main.mjs");
    assert.match(source, /createHomeAiRuntimeFacade/);
    assert.match(source, /buildPreviewLinkViewModel/);
    assert.match(source, /HomeAIViteDocumentPreviewPreview/);
    assert.match(source, /runtime\.state/);
    assert.match(source, /runtime\.events/);
    assert.match(source, /文件预览策略/);
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\.state\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /HermesAppApiClient/);
  });

  await test("global audit allowlist names the preview hook explicitly", async () => {
    const auditText = read("scripts/vite-global-usage-audit.js");
    assert.match(auditText, /src\/vite-islands\/document-preview\/main\.mjs/);
    assert.match(auditText, /HomeAIViteDocumentPreviewPreview/);
  });

  await test("app preview host links to the document preview without production references", async () => {
    const appSource = read("src/vite-app/main.mjs");
    const appTest = read("tests/vite-app-preview-host.test.js");
    assert.match(appSource, /DOCUMENT_PREVIEW_PATH/);
    assert.match(appSource, /文件预览策略/);
    assert.match(appTest, /DOCUMENT_PREVIEW_PATH|document-preview/);
  });

  await test("built artifact exists after npm run build:vite", async () => {
    assert.ok(
      exists("public/vite-islands/document-preview/document-preview.js"),
      "run npm run build:vite before this test",
    );
    const output = read("public/vite-islands/document-preview/document-preview.js");
    assert.match(output, /文件预览策略/);
    assert.match(output, /Markdown/);
    assert.match(output, /PPTX/);
    assert.match(output, /presentationml\.presentation/);
    assert.match(output, /HomeAIViteDocumentPreviewPreview/);
    const modelOutput = read("public/vite-islands/document-preview-model/document-preview-model.js");
    assert.match(modelOutput, /powerpoint/);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
