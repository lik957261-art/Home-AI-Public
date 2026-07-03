"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

async function loadModel() {
  const url = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/ai-ops-feedback/model.mjs",
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
  await test("Vite config builds a development AI Ops feedback island", async () => {
    const configText = read("vite.config.js");
    assert.match(configText, /ai-ops-feedback/);
    assert.match(configText, /\/vite-ai-ops-feedback-preview\//);
    assert.match(configText, /src\/vite-islands\/ai-ops-feedback\/main\.mjs/);
    assert.doesNotMatch(configText, /public\/index\.html/);
    assert.doesNotMatch(configText, /service-worker\.js/);
  });

  await test("preview page does not replace the primary PWA shell", async () => {
    const devPreview = read("src/vite-islands/ai-ops-feedback/index.html");
    const builtPreview = read("public/vite-preview/ai-ops-feedback.html");
    const indexHtml = read("public/index.html");
    const serviceWorker = read("public/service-worker.js");
    assert.match(devPreview, /\/src\/vite-islands\/ai-ops-feedback\/main\.mjs/);
    assert.match(builtPreview, /\/vite-islands\/ai-ops-feedback\/ai-ops-feedback\.js/);
    assert.doesNotMatch(indexHtml, /vite-islands\/ai-ops-feedback/);
    assert.doesNotMatch(serviceWorker, /vite-preview\/ai-ops-feedback/);
    assert.doesNotMatch(serviceWorker, /vite-islands\/ai-ops-feedback/);
  });

  await test("source uses runtime facade and avoids classic shell globals", async () => {
    const source = read("src/vite-islands/ai-ops-feedback/main.mjs");
    assert.match(source, /createHomeAiRuntimeFacade/);
    assert.match(source, /HomeAiRuntimeFacade/);
    assert.match(source, /runtime\.api/);
    assert.match(source, /runtime\.events/);
    assert.match(source, /runtime\.state/);
    assert.match(source, /HomeAIViteAiOpsFeedbackPreview/);
    assert.doesNotMatch(source, /\b(?:window|globalThis|browserRoot)\.state\b/);
    assert.doesNotMatch(source, /window\.state/);
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
    assert.doesNotMatch(source, /\bfetch\(/);
    assert.doesNotMatch(source, /HermesAppApiClient/);
  });

  await test("model builds bounded payloads and strips unsafe route params", async () => {
    const model = await loadModel();
    const payload = model.buildFeedbackPayload({
      category: "visual_mismatch",
      note: `x`.repeat(320),
      route: {
        pathname: "/plugins/music",
        search: "?pluginId=music&workspaceId=owner&launch=secret&token=hidden&pluginRoute=now",
      },
      state: {
        selectedWorkspaceId: "owner",
        viewMode: "plugin-music",
        singleWindowMode: "plugin",
        pluginContextNavPluginId: "music",
        auth: { isOwner: true },
      },
      native: { isNativeShell: true, isIosShell: true },
      capabilities: { ownerSystemConsole: true },
    });
    assert.equal(payload.source_surface, "vite-ai-ops-feedback-preview");
    assert.equal(payload.plugin_id, "music");
    assert.equal(payload.category, "visual_mismatch");
    assert.equal(payload.diagnostic_type, "user_report_visual_mismatch");
    assert.equal(payload.summary.length, model.MAX_NOTE_LENGTH);
    assert.equal(payload.route, "/plugins/music?pluginId=music&workspaceId=owner&pluginRoute=now");
    assert.equal(payload.context.owner_console_available, true);
    assert.equal(payload.context.native_shell, true);
    assert.equal(payload.context.ios_shell, true);
    assert.equal(payload.frontend_state.viteIsland, "ai-ops-feedback");
    assert.doesNotMatch(JSON.stringify(payload), /launch=secret|token=hidden/);
  });

  await test("model exposes bounded Owner console availability labels", async () => {
    const model = await loadModel();
    assert.equal(
      model.ownerConsoleLabel({ auth: { isOwner: true } }, { ownerSystemConsole: true }),
      "系统控制台",
    );
    assert.equal(
      model.ownerConsoleLabel({ auth: { isOwner: false } }, { ownerSystemConsole: true }),
      "仅 Owner 可用",
    );
    assert.equal(
      model.ownerConsoleLabel({ auth: { isOwner: true } }, { ownerSystemConsole: false }),
      "系统控制台未就绪",
    );
  });

  await test("built artifact exists after npm run build:vite", async () => {
    assert.ok(
      exists("public/vite-islands/ai-ops-feedback/ai-ops-feedback.js"),
      "run npm run build:vite before this test",
    );
    const output = read("public/vite-islands/ai-ops-feedback/ai-ops-feedback.js");
    assert.match(output, /AI Ops/);
    assert.match(output, /反馈菜单/);
    assert.match(output, /系统控制台/);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
