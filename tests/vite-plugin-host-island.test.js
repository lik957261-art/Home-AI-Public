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

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

test("Vite config builds a development plugin host island", () => {
  const configText = read("vite.config.js");
  assert.match(configText, /plugin-host/);
  assert.match(configText, /\/vite-plugin-host-preview\//);
  assert.match(configText, /src\/vite-islands\/plugin-host\/main\.mjs/);
  assert.doesNotMatch(configText, /public\/index\.html/);
  assert.doesNotMatch(configText, /service-worker\.js/);
});

test("preview page does not replace the primary PWA shell", () => {
  const devPreview = read("src/vite-islands/plugin-host/index.html");
  const builtPreview = read("public/vite-preview/plugin-host.html");
  const indexHtml = read("public/index.html");
  const serviceWorker = read("public/service-worker.js");
  assert.match(devPreview, /\/src\/vite-islands\/plugin-host\/main\.mjs/);
  assert.match(builtPreview, /\/vite-islands\/plugin-host\/plugin-host\.js/);
  assert.doesNotMatch(indexHtml, /vite-islands\/plugin-host/);
  assert.doesNotMatch(indexHtml, /vite-preview\/plugin-host/);
  assert.doesNotMatch(serviceWorker, /vite-islands\/plugin-host/);
  assert.doesNotMatch(serviceWorker, /vite-preview\/plugin-host/);
});

test("source uses runtime facade and avoids unmanaged browser auth boundaries", () => {
  const source = read("src/vite-islands/plugin-host/main.mjs");
  assert.match(source, /createHomeAiRuntimeFacade/);
  assert.match(source, /HomeAiRuntimeFacade/);
  assert.match(source, /HomeAIVitePluginHostPreview/);
  assert.match(source, /runtime\.api/);
  assert.match(source, /runtime\.state/);
  assert.match(source, /runtime\.events/);
  assert.match(source, /buildPluginHostViewModel/);
  assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\.state\b/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /sessionStorage/);
  assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  assert.doesNotMatch(source, /\bfetch\(/);
  assert.doesNotMatch(source, /HermesAppApiClient/);
});

test("global audit allowlist names the preview hook explicitly", () => {
  const auditText = read("scripts/vite-global-usage-audit.js");
  assert.match(auditText, /src\/vite-islands\/plugin-host\/main\.mjs/);
  assert.match(auditText, /HomeAIVitePluginHostPreview/);
});

test("built artifact exists after npm run build:vite", () => {
  assert.ok(
    exists("public/vite-islands/plugin-host/plugin-host.js"),
    "run npm run build:vite before this test",
  );
  const output = read("public/vite-islands/plugin-host/plugin-host.js");
  assert.match(output, /Plugin Host/);
  assert.match(output, /刷新 manifest/);
  assert.match(output, /Launch token/);
  assert.match(output, /HomeAIVitePluginHostPreview/);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
