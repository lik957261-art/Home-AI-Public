"use strict";

const path = require("node:path");
const { chromium } = require("playwright");

async function main() {
  const url = process.env.HERMES_VISUAL_SMOKE_URL || "http://127.0.0.1:8797/?_hmv=visual-smoke";
  const screenshotPath = process.env.HERMES_VISUAL_SMOKE_SCREENSHOT
    || path.join(process.cwd(), "tmp", "visual-smoke.png");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(800);
    const clientVersion = await page.locator("html").getAttribute("data-client-version");
    const title = await page.title();
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(JSON.stringify({
      ok: true,
      url,
      title,
      clientVersion,
      screenshotPath,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
