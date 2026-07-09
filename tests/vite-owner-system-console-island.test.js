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

test("package exposes a dev-only Vite build path", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["build:vite"], "vite build");
  assert.match(pkg.scripts["dev:vite"], /^vite\b/);
  assert.ok(pkg.devDependencies.vite, "vite devDependency is required");
  assert.equal(pkg.scripts.start, "node server.js", "default production start stays unchanged");
});

test("Vite config builds an isolated Owner console island", () => {
  const configText = read("vite.config.js");
  assert.match(configText, /publicDir:\s*false/);
  assert.match(configText, /outDir:\s*"public\/vite-islands"/);
  assert.match(configText, /emptyOutDir:\s*false/);
  assert.match(configText, /owner-system-console/);
  assert.match(configText, /\/vite-owner-system-console-preview\//);
  assert.match(configText, /home-ai-dev-preview-api-mocks/);
  assert.match(configText, /viteDevPreviewApiMockResponse/);
  assert.doesNotMatch(configText, /public\/index\.html/);
  assert.doesNotMatch(configText, /service-worker\.js/);
});

test("Owner console island keeps pure rendering in a model module", () => {
  const source = read("src/vite-islands/owner-system-console/main.mjs");
  const model = read("src/vite-islands/owner-system-console/model.mjs");
  assert.match(source, /from "\.\/model\.mjs"/);
  assert.match(model, /function renderOwnerConsoleHtml/);
  assert.match(model, /function renderClassicOwnerSystemConsoleView/);
  assert.match(model, /function normalizeOwnerConsoleError/);
  assert.match(model, /需要 Owner 权限或重新登录/);
  assert.match(model, /Home AI 系统控制台/);
  assert.doesNotMatch(model, /document\.querySelector/);
  assert.doesNotMatch(model, /window\./);
  assert.doesNotMatch(model, /\bfetch\(/);
});

test("preview page does not replace the primary PWA shell", () => {
  const devPreview = read("src/vite-islands/owner-system-console/index.html");
  const preview = read("public/vite-preview/owner-system-console.html");
  const index = read("public/index.html");
  const serviceWorker = read("public/service-worker.js");
  assert.match(devPreview, /\/src\/vite-islands\/owner-system-console\/main\.mjs/);
  assert.match(preview, /\/vite-islands\/owner-system-console\/owner-system-console\.js/);
  assert.doesNotMatch(preview, /app-wire-start-ui\.js/);
  assert.doesNotMatch(index, /vite-islands\/owner-system-console/);
  assert.doesNotMatch(serviceWorker, /vite-preview\/owner-system-console/);
  assert.doesNotMatch(serviceWorker, /vite-islands\/owner-system-console/);
});

test("island source uses Owner APIs without shell globals", () => {
  const source = read("src/vite-islands/owner-system-console/main.mjs");
  assert.match(source, /\/api\/owner\/system-console/);
  assert.match(source, /createHomeAiRuntimeFacade/);
  assert.match(source, /renderOwnerConsoleHtml/);
  assert.match(source, /ownerConsoleError/);
  assert.match(source, /HomeAiRuntimeFacade/);
  assert.match(source, /runtime\.api/);
  assert.match(source, /owner-system-console:load:success/);
  assert.doesNotMatch(source, /\bstate\./);
  assert.doesNotMatch(source, /window\.state/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  assert.doesNotMatch(source, /\bfetch\(/);
  assert.doesNotMatch(source, /HermesAppApiClient/);
});

test("built artifact exists after npm run build:vite", () => {
  assert.ok(
    exists("public/vite-islands/.vite/manifest.json"),
    "run npm run build:vite before this test",
  );
  assert.ok(
    exists("public/vite-islands/owner-system-console/owner-system-console.js"),
    "run npm run build:vite before this test",
  );
  assert.ok(
    exists("public/vite-islands/owner-system-console-model/owner-system-console-model.js"),
    "run npm run build:vite before this test",
  );
  const output = read("public/vite-islands/owner-system-console/owner-system-console.js");
  assert.match(output, /owner-system-console-model/);
  assert.match(output, /renderOwnerConsoleHtml/);
  const modelOutput = read("public/vite-islands/owner-system-console-model/owner-system-console-model.js");
  assert.match(modelOutput, /Home AI/);
  assert.match(modelOutput, /系统控制台/);
  assert.match(modelOutput, /renderClassicOwnerSystemConsoleView/);
  assert.match(modelOutput, /交付闭环/);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
