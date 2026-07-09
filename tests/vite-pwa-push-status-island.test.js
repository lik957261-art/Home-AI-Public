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
  const url = pathToFileURL(path.join(repoRoot, "src/vite-islands/pwa-push-status/model.mjs")).href;
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
  await test("Vite config builds a development PWA Push Status island", async () => {
    const configText = read("vite.config.js");
    assert.match(configText, /pwa-push-status/);
    assert.match(configText, /\/vite-pwa-push-status-preview\//);
    assert.match(configText, /src\/vite-islands\/pwa-push-status\/main\.mjs/);
    assert.doesNotMatch(configText, /public\/index\.html/);
    assert.doesNotMatch(configText, /service-worker\.js/);
  });

  await test("preview page does not replace production PWA shell or service worker", async () => {
    const devPreview = read("src/vite-islands/pwa-push-status/index.html");
    const builtPreview = read("public/vite-preview/pwa-push-status.html");
    const indexHtml = read("public/index.html");
    const serviceWorker = read("public/service-worker.js");
    assert.match(devPreview, /\/src\/vite-islands\/pwa-push-status\/main\.mjs/);
    assert.match(builtPreview, /\/vite-islands\/pwa-push-status\/pwa-push-status\.js/);
    assert.doesNotMatch(indexHtml, /vite-islands\/pwa-push-status/);
    assert.doesNotMatch(serviceWorker, /vite-preview\/pwa-push-status/);
    assert.doesNotMatch(serviceWorker, /vite-islands\/pwa-push-status/);
  });

  await test("model preserves classic Web Push support and button semantics", async () => {
    const model = await loadModel();
    assert.equal(model.normalizePermission("bad"), "default");
    assert.equal(model.normalizeDisplayMode("standalone"), "standalone");
    assert.equal(model.compactClientVersion("20260704-1009"), "1009");

    const available = model.createPwaPushStatusState({
      secureContext: true,
      serviceWorker: true,
      pushManager: true,
      notification: true,
      permission: "default",
      serverEnabled: true,
      publicKey: "pk",
    });
    assert.equal(available.unavailableReason, "");
    assert.equal(available.button.action, "enable");
    assert.equal(available.button.text, "🔔");

    const subscribed = model.createPwaPushStatusState({
      permission: "granted",
      hasSubscription: true,
      attempted: 2,
      sent: 2,
      failed: 0,
    });
    assert.equal(subscribed.button.action, "renew");
    assert.equal(subscribed.button.tone, "enabled");
    assert.equal(subscribed.delivery.ok, true);
    assert.equal(subscribed.delivery.text, "PWA 测试通知已交给系统：2/2");

    const iosBrowser = model.createPwaPushStatusState({
      iosClient: true,
      standalone: false,
    });
    assert.equal(iosBrowser.button.action, "blocked");
    assert.equal(iosBrowser.unavailableReason, model.pwaWindowRequiredText());

    const denied = model.createPwaPushStatusState({ permission: "denied" });
    assert.equal(denied.button.tone, "warning");
    assert.match(denied.unavailableReason, /系统拒绝/);

    assert.equal(model.transitionPwaPushScenario(available, "server_missing").button.action, "blocked");

    const installPlan = model.pwaInstallButtonPlan({
      standalone: false,
      installed: false,
      promptAvailable: true,
      serviceWorkerReady: true,
    });
    assert.equal(installPlan.text, "安装应用");
    assert.equal(installPlan.disabled, false);
    assert.match(installPlan.requirementHint, /Service Worker 已就绪/);

    const installedPlan = model.pwaInstallButtonPlan({ standalone: true, installed: false });
    assert.equal(installedPlan.text, "已安装");
    assert.equal(installedPlan.disabled, true);

    const badgePlan = model.clientVersionBadgePlan({
      clientVersion: "20260704-vite-pwa-push-esm-v1009",
      serverClientVersion: "20260704-vite-pwa-push-esm-v1010",
      appUpdate: { updateAvailable: false },
    });
    assert.equal(badgePlan.text, "刷新");
    assert.equal(badgePlan.updateAvailable, true);
  });

  await test("source uses runtime facade feedback and never touches live push APIs", async () => {
    const source = read("src/vite-islands/pwa-push-status/main.mjs");
    assert.match(source, /createHomeAiRuntimeFacade/);
    assert.match(source, /runtime\.feedback/);
    assert.match(source, /runtime\.events/);
    assert.match(source, /HomeAIVitePwaPushStatusPreview/);
    assert.doesNotMatch(source, /Notification\.requestPermission/);
    assert.doesNotMatch(source, /serviceWorker\.register|pushManager\.subscribe|getSubscription/);
    assert.doesNotMatch(source, /localStorage|X-Hermes-Web-Key|\bfetch\(/);
  });

  await test("classic adapters import PWA Push ESM model for button/status planning only", async () => {
    const platformSource = read("public/app-platform-status-ui.js");
    const settingsSource = read("public/app-pwa-settings-push-ui.js");
    const pushSource = read("public/app-pwa-push-ui.js");
    assert.match(platformSource, /PWA_PUSH_STATUS_ESM_MODEL_PATH/);
    assert.match(platformSource, /\/vite-islands\/pwa-push-status-model\/pwa-push-status-model\.js/);
    assert.match(platformSource, /__homeAiImportPwaPushStatusModel/);
    assert.match(platformSource, /clientVersionBadgePlan/);
    assert.match(settingsSource, /pwaInstallButtonPlan/);
    assert.match(pushSource, /currentPwaPushCapabilities/);
    assert.match(pushSource, /pushButtonPlan/);
    assert.match(pushSource, /pushDeliverySummary/);
    assert.match(pushSource, /Notification\.requestPermission/);
    assert.match(pushSource, /pushManager\.subscribe/);
  });

  await test("built artifact exists after npm run build:vite", async () => {
    assert.ok(
      exists("public/vite-islands/pwa-push-status/pwa-push-status.js"),
      "run npm run build:vite before this test",
    );
    assert.ok(
      exists("public/vite-islands/pwa-push-status-model/pwa-push-status-model.js"),
      "run npm run build:vite before this test",
    );
    const output = read("public/vite-islands/pwa-push-status/pwa-push-status.js");
    assert.match(output, /PWA \/ Web Push/);
    assert.match(output, /HomeAIVitePwaPushStatusPreview/);
    assert.match(output, /pwa-push-status-model/);
    const modelOutput = read("public/vite-islands/pwa-push-status-model/pwa-push-status-model.js");
    assert.match(modelOutput, /clientVersionBadgePlan/);
    assert.match(modelOutput, /pwaInstallButtonPlan/);
    assert.match(modelOutput, /pushButtonPlan/);
    assert.match(modelOutput, /iOS 需要从 Safari 添加到主屏幕/);
    assert.doesNotMatch(modelOutput, /Notification\.requestPermission/);
    assert.doesNotMatch(modelOutput, /serviceWorker\.register|pushManager\.subscribe|getSubscription/);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
