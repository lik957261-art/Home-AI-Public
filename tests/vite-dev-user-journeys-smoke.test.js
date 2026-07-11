"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const repoRoot = path.resolve(__dirname, "..");

async function startViteServer() {
  const { createServer } = await import("vite");
  const vite = await createServer({
    configFile: path.join(repoRoot, "vite.config.js"),
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
    },
    logLevel: "silent",
  });
  await vite.listen();
  const address = vite.httpServer.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => vite.close(),
  };
}

function installPageGuards(page, routePath) {
  const consoleErrors = [];
  const pageErrors = [];
  const escapedRootRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message || String(error));
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      response.status() === 404
      && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/vite-shell/"))
    ) {
      escapedRootRequests.push({ path: url.pathname, routePath });
    }
  });
  return {
    assertClean() {
      assert.deepEqual(pageErrors, [], `${routePath} page errors`);
      assert.deepEqual(consoleErrors, [], `${routePath} console errors`);
      assert.deepEqual(escapedRootRequests, [], `${routePath} root-path asset escapes`);
    },
  };
}

async function expectText(page, selector, text, options = {}) {
  await page.waitForFunction(({ selector, text }) => {
    const node = document.querySelector(selector);
    return Boolean(node && node.innerText && node.innerText.includes(text));
  }, { selector, text }, { timeout: options.timeout || 10000 });
}

async function gotoPreview(page, baseUrl, routePath, selector) {
  const response = await page.goto(`${baseUrl}${routePath}`, {
    waitUntil: "domcontentloaded",
    timeout: 10000,
  });
  assert.ok(response, `${routePath} did not return a response`);
  assert.equal(response.status(), 200, `${routePath} returned non-200`);
  await page.waitForSelector(selector, { state: "visible", timeout: 10000 });
}

async function smokeChatComposerAndAttachments(page, baseUrl) {
  const routePath = "/vite-chat-runtime-preview/";
  const guards = installPageGuards(page, routePath);
  await gotoPreview(page, baseUrl, routePath, "[data-homeai-vite-chat-runtime]");
  const originalUrl = page.url();
  let mainFrameNavigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) mainFrameNavigations += 1;
  });

  await page.click('[data-cr-event="thread_terminal"]');
  await page.fill("[data-cr-composer-draft]", "Vite dev smoke Composer send");
  await page.click("[data-cr-composer-api-send]");
  await expectText(page, "[data-homeai-vite-chat-runtime]", "dev mock 已返回 thread/run readback");

  await page.setInputFiles("[data-cr-attachment-file-input]", [{
    name: "camera-smoke.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xd9]),
  }]);
  await page.click("[data-cr-attachment-upload-selected]");
  await expectText(page, "[data-homeai-vite-chat-runtime]", "dev mock 已上传 1 个文件");
  assert.equal(page.url(), originalUrl, "camera/file selection should not refresh the Vite chat preview");
  assert.equal(mainFrameNavigations, 0, "camera/file selection triggered an unexpected main-frame navigation");

  await page.setInputFiles("[data-cr-attachment-file-input]", [{
    name: "camera-smoke.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x01, 0x43, 0x00, 0xff, 0xd9]),
  }]);
  await page.click("[data-cr-attachment-upload-selected]");
  await expectText(page, "[data-homeai-vite-chat-runtime]", "dev mock 已上传 1 个文件");
  assert.equal(page.url(), originalUrl, "reselecting the same camera filename should not refresh the Vite chat preview");
  assert.equal(mainFrameNavigations, 0, "reselecting the same camera filename triggered an unexpected main-frame navigation");

  await page.click("[data-cr-attachment-add-server]");
  await expectText(page, "[data-homeai-vite-chat-runtime]", "dev mock 已附加服务器文件");
  await expectText(page, "[data-homeai-vite-chat-runtime]", "vite-runbook.pdf");

  await page.click("[data-cr-attachment-native-receive]");
  await expectText(page, "[data-homeai-vite-chat-runtime]", "native-note.md");
  await page.click("[data-cr-attachment-native-attach]");
  await expectText(page, "[data-homeai-vite-chat-runtime]", "native-photo.jpg");

  await page.click("[data-cr-thread-readback]");
  await expectText(page, "[data-homeai-vite-chat-runtime]", "read");
  await expectText(page, "[data-homeai-vite-chat-runtime]", "messages 2");
  guards.assertClean();
}

async function smokeCodexIframeAndPluginHost(page, baseUrl) {
  const routePath = "/vite-plugin-host-preview/";
  const guards = installPageGuards(page, routePath);
  await gotoPreview(page, baseUrl, routePath, "[data-vite-plugin-host-root]");
  await page.click('[data-plugin-id="codex-mobile"]');
  await page.click("[data-refresh-manifest]");
  await expectText(page, "[data-vite-plugin-host-root]", "Codex Mobile");
  await expectText(page, "[data-vite-plugin-host-root]", "Manifest 已读取");
  const frameEvidence = await page.evaluate(() => {
    const iframe = document.querySelector("iframe[data-plugin-id='codex-mobile']");
    return {
      iframePresent: Boolean(iframe),
      intendedSrc: iframe?.getAttribute("data-intended-src") || "",
      iframeTitle: iframe?.getAttribute("title") || "",
    };
  });
  assert.equal(frameEvidence.iframePresent, true, "Codex iframe should render in plugin host preview");
  assert.match(frameEvidence.intendedSrc, /\/plugins\/codex-mobile\//);
  assert.equal(frameEvidence.iframeTitle, "Codex Mobile");
  guards.assertClean();
}

async function smokeOwnerConsole(page, baseUrl) {
  const routePath = "/vite-owner-system-console-preview/";
  const guards = installPageGuards(page, routePath);
  await gotoPreview(page, baseUrl, routePath, "[data-homeai-vite-owner-console]");
  await expectText(page, "[data-homeai-vite-owner-console]", "系统控制台");
  await page.click("[data-osc-refresh]");
  await expectText(page, "[data-homeai-vite-owner-console]", "Home AI Listener");
  guards.assertClean();
}

async function smokeDocumentPreview(page, baseUrl) {
  const routePath = "/vite-document-preview-preview/";
  const guards = installPageGuards(page, routePath);
  await gotoPreview(page, baseUrl, routePath, "[data-homeai-vite-document-preview]");
  await page.click('[data-vdp-fixture="presentation"]');
  await expectText(page, "[data-homeai-vite-document-preview]", "deck.pptx");
  await expectText(page, "[data-homeai-vite-document-preview]", "presentation");
  await page.click('[data-vdp-fixture="pdf"]');
  await page.click('[data-vdp-native-shell="ios"]');
  await page.click("[data-vdp-toggle-open-in]");
  await expectText(page, "[data-homeai-vite-document-preview]", "brief.pdf");
  await expectText(page, "[data-homeai-vite-document-preview]", "Native URL");
  guards.assertClean();
}

async function smokeVoicePendingCancel(page, baseUrl) {
  const routePath = "/vite-voice-input-status-preview/";
  const guards = installPageGuards(page, routePath);
  await gotoPreview(page, baseUrl, routePath, "[data-homeai-vite-voice-status]");
  await page.click('[data-vis-action="begin"]');
  await expectText(page, "[data-homeai-vite-voice-status]", "等待长按");
  await page.click("[data-vis-cancel]");
  await expectText(page, "[data-homeai-vite-voice-status]", "已取消");
  await page.click('[data-vis-action="begin"]');
  await page.click('[data-vis-action="expire"]');
  await expectText(page, "[data-homeai-vite-voice-status]", "pending");
  await expectText(page, "[data-homeai-vite-voice-status]", "已取消");
  guards.assertClean();
}

(async () => {
  let viteServer = null;
  let browser = null;
  try {
    viteServer = await startViteServer();
    browser = await chromium.launch({ headless: true, channel: "chromium" });
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });

    await smokeChatComposerAndAttachments(page, viteServer.baseUrl);
    await smokeCodexIframeAndPluginHost(page, viteServer.baseUrl);
    await smokeOwnerConsole(page, viteServer.baseUrl);
    await smokeDocumentPreview(page, viteServer.baseUrl);
    await smokeVoicePendingCancel(page, viteServer.baseUrl);
    await page.close();

    console.log(JSON.stringify({
      ok: true,
      smokeVersion: "20260704-vite-dev-user-journeys-smoke-v1",
      sourceOnly: true,
      productionWrites: false,
      deployExecuted: false,
      journeyCount: 5,
      journeys: [
        "composer_attachment_camera_no_refresh",
        "codex_plugin_iframe",
        "owner_system_console",
        "document_preview_pdf_pptx",
        "voice_pending_cancel",
      ],
    }, null, 2));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (viteServer) await viteServer.close();
  }
})();
