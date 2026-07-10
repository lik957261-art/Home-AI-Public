"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const repoRoot = path.resolve(__dirname, "..");

const PREVIEW_ROUTES = Object.freeze([
  {
    path: "/vite-app-preview/",
    selector: "[data-homeai-vite-app-preview]",
    expectedText: "Home AI Vite 应用预览",
  },
  {
    path: "/vite-owner-system-console-preview/",
    selector: "[data-homeai-vite-owner-console]",
    expectedText: "系统控制台",
  },
  {
    path: "/vite-ai-ops-feedback-preview/",
    selector: "[data-homeai-vite-aiops-feedback]",
    expectedText: "AI Ops 反馈菜单",
  },
  {
    path: "/vite-voice-input-status-preview/",
    selector: "[data-homeai-vite-voice-status]",
    expectedText: "等待长按",
  },
  {
    path: "/vite-document-preview-preview/",
    selector: "[data-homeai-vite-document-preview]",
    expectedText: "文件预览",
  },
  {
    path: "/vite-navigation-shell-preview/",
    selector: "[data-homeai-vite-navigation-shell]",
    expectedText: "Vite island 开发预览",
  },
  {
    path: "/vite-message-action-panel-preview/",
    selector: "[data-homeai-vite-message-action-panel]",
    expectedText: "入库",
  },
  {
    path: "/vite-plugin-host-preview/",
    selector: "[data-vite-plugin-host-root]",
    expectedText: "Plugin Host",
  },
  {
    path: "/vite-chat-runtime-preview/",
    selector: "[data-homeai-vite-chat-runtime]",
    expectedText: "Composer ESM",
  },
]);

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

async function launchChromium() {
  const executablePath = String(process.env.HOMEAI_PLAYWRIGHT_CHROMIUM_EXECUTABLE || "").trim();
  if (executablePath) return chromium.launch({ headless: true, executablePath });
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (!/Executable doesn't exist/i.test(String(error?.message || error))) throw error;
    return chromium.launch({ headless: true, channel: "chrome" });
  }
}

async function smokeRoute(page, baseUrl, route) {
  const consoleErrors = [];
  const pageErrors = [];
  const onConsole = (message) => {
    if (message.type() !== "error") return;
    const location = message.location();
    const source = location.url ? ` (${location.url}:${location.lineNumber || 0})` : "";
    consoleErrors.push(`${message.text()}${source}`);
  };
  const onPageError = (error) => {
    pageErrors.push(error.message || String(error));
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  try {
    const response = await page.goto(`${baseUrl}${route.path}`, {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });
    assert.ok(response, `${route.path} did not return a response`);
    assert.equal(response.status(), 200, `${route.path} returned non-200`);
    await page.waitForSelector(route.selector, {
      state: "visible",
      timeout: 10000,
    });
    await page.waitForFunction(({ selector, expectedText }) => {
      const node = document.querySelector(selector);
      return Boolean(node && node.innerText && node.innerText.includes(expectedText));
    }, {
      selector: route.selector,
      expectedText: route.expectedText,
    }, { timeout: 10000 });
    const metrics = await page.evaluate(() => ({
      bodyTextLength: document.body.innerText.trim().length,
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assert.ok(metrics.bodyTextLength > 20, `${route.path} rendered too little text`);
    assert.ok(
      metrics.scrollWidth <= metrics.innerWidth + 1,
      `${route.path} has horizontal overflow ${metrics.scrollWidth}/${metrics.innerWidth}`,
    );
    assert.deepEqual(pageErrors, [], `${route.path} page errors`);
    assert.deepEqual(consoleErrors, [], `${route.path} console errors`);
    return metrics;
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }
}

(async () => {
  let viteServer = null;
  let browser = null;
  try {
    viteServer = await startViteServer();
    browser = await launchChromium();
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const results = [];
    for (const route of PREVIEW_ROUTES) {
      const metrics = await smokeRoute(page, viteServer.baseUrl, route);
      results.push({
        path: route.path,
        bodyTextLength: metrics.bodyTextLength,
        viewport: `${metrics.innerWidth}/${metrics.scrollWidth}`,
      });
    }
    await page.close();
    console.log(JSON.stringify({
      ok: true,
      routeCount: results.length,
      routes: results,
    }, null, 2));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (viteServer) await viteServer.close();
  }
})();
