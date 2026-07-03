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

test("Vite config includes a full app preview entry without replacing public index", () => {
  const configText = read("vite.config.js");
  assert.match(configText, /home-ai-app-preview/);
  assert.match(configText, /src\/vite-app\/main\.mjs/);
  assert.match(configText, /\/vite-app-preview\//);
  assert.doesNotMatch(configText, /public\/index\.html/);
  assert.doesNotMatch(configText, /service-worker\.js/);
});

test("dev and built preview pages use Vite module entries only", () => {
  const devHtml = read("src/vite-app/index.html");
  const builtHtml = read("public/vite-preview/home-ai-app.html");
  const indexHtml = read("public/index.html");
  const serviceWorker = read("public/service-worker.js");
  assert.match(devHtml, /\/src\/vite-app\/main\.mjs/);
  assert.match(builtHtml, /\/vite-islands\/home-ai-app-preview\/home-ai-app-preview\.js/);
  assert.doesNotMatch(devHtml, /app-wire-start-ui\.js/);
  assert.doesNotMatch(builtHtml, /app-wire-start-ui\.js/);
  assert.doesNotMatch(indexHtml, /vite-preview\/ai-ops-feedback/);
  assert.doesNotMatch(indexHtml, /vite-preview\/home-ai-app/);
  assert.doesNotMatch(indexHtml, /home-ai-app-preview/);
  assert.doesNotMatch(serviceWorker, /vite-preview\/ai-ops-feedback/);
  assert.doesNotMatch(serviceWorker, /vite-preview\/home-ai-app/);
  assert.doesNotMatch(serviceWorker, /home-ai-app-preview/);
});

test("preview source documents fallback and avoids classic shell globals", () => {
  const source = read("src/vite-app/main.mjs");
  assert.match(source, /CLASSIC_FALLBACK_PATH/);
  assert.match(source, /AI_OPS_FEEDBACK_PREVIEW_PATH/);
  assert.match(source, /VOICE_INPUT_STATUS_PREVIEW_PATH/);
  assert.match(source, /NAVIGATION_SHELL_PREVIEW_PATH/);
  assert.match(source, /DOCUMENT_PREVIEW_PATH/);
  assert.match(source, /PLUGIN_HOST_PREVIEW_PATH/);
  assert.match(source, /productionDefaultShell:\s*"classic"/);
  assert.match(source, /createHomeAiRuntimeFacade/);
  assert.match(source, /HomeAiRuntimeFacade/);
  assert.match(source, /simulateError/);
  assert.doesNotMatch(source, /\bstate\./);
  assert.doesNotMatch(source, /window\.state/);
  assert.doesNotMatch(source, /HermesAppApiClient/);
});

test("built app preview artifact exists after npm run build:vite", () => {
  assert.ok(
    exists("public/vite-islands/home-ai-app-preview/home-ai-app-preview.js"),
    "run npm run build:vite before this test",
  );
  const output = read("public/vite-islands/home-ai-app-preview/home-ai-app-preview.js");
  assert.match(output, /Home AI/);
  assert.match(output, /Vite/);
  assert.match(output, /Runtime facade/);
  assert.match(output, /反馈菜单预览/);
  assert.match(output, /语音状态预览/);
  assert.match(output, /导航 Shell 预览/);
  assert.match(output, /文件预览策略/);
  assert.match(output, /Plugin Host 预览/);
  assert.match(output, /classic shell/);
});

if (process.exitCode) process.exit(process.exitCode);
