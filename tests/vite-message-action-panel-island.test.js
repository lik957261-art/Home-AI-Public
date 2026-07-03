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
  await test("Vite config builds a development message action panel island", async () => {
    const configText = read("vite.config.js");
    assert.match(configText, /message-action-panel/);
    assert.match(configText, /\/vite-message-action-panel-preview\//);
    assert.match(configText, /src\/vite-islands\/message-action-panel\/main\.mjs/);
    assert.doesNotMatch(configText, /public\/index\.html/);
    assert.doesNotMatch(configText, /service-worker\.js/);
  });

  await test("preview page does not replace the primary PWA shell", async () => {
    const devPreview = read("src/vite-islands/message-action-panel/index.html");
    const builtPreview = read("public/vite-preview/message-action-panel.html");
    const indexHtml = read("public/index.html");
    const serviceWorker = read("public/service-worker.js");
    assert.match(devPreview, /\/src\/vite-islands\/message-action-panel\/main\.mjs/);
    assert.match(builtPreview, /\/vite-islands\/message-action-panel\/message-action-panel\.js/);
    assert.doesNotMatch(indexHtml, /vite-islands\/message-action-panel/);
    assert.doesNotMatch(indexHtml, /vite-preview\/message-action-panel/);
    assert.doesNotMatch(serviceWorker, /vite-islands\/message-action-panel/);
    assert.doesNotMatch(serviceWorker, /vite-preview\/message-action-panel/);
  });

  await test("source uses runtime facade and avoids unmanaged browser boundaries", async () => {
    const source = read("src/vite-islands/message-action-panel/main.mjs");
    assert.match(source, /createHomeAiRuntimeFacade/);
    assert.match(source, /executeWardrobeOutfitWearAction/);
    assert.match(source, /MESSAGE_ACTION_PANEL_PREVIEW_THREAD_ID/);
    assert.match(source, /import\.meta\.env\?\.DEV/);
    assert.match(source, /HomeAiRuntimeFacade/);
    assert.match(source, /runtime\.state/);
    assert.match(source, /runtime\.events/);
    assert.match(source, /runtime\.feedback/);
    assert.match(source, /HomeAIViteMessageActionPanelPreview/);
    assert.match(source, /buildMessageActionPanelViewModel/);
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\.state\b/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /sessionStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /HermesAppApiClient/);
    assert.doesNotMatch(source, /executeWardrobeOutfitWearMessageAction/);
  });

  await test("global audit allowlist names the preview hook explicitly", async () => {
    const auditText = read("scripts/vite-global-usage-audit.js");
    assert.match(auditText, /src\/vite-islands\/message-action-panel\/main\.mjs/);
    assert.match(auditText, /HomeAIViteMessageActionPanelPreview/);
  });

  await test("built artifact exists after npm run build:vite", async () => {
    assert.ok(
      exists("public/vite-islands/message-action-panel/message-action-panel.js"),
      "run npm run build:vite before this test",
    );
    const output = read("public/vite-islands/message-action-panel/message-action-panel.js");
    assert.match(output, /消息动作面板/);
    assert.match(output, /入库/);
    assert.match(output, /确认替换/);
    assert.match(output, /built read-only/);
    assert.match(output, /需重新生成/);
    assert.match(output, /HomeAIViteMessageActionPanelPreview/);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
