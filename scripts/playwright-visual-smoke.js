"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

function normalizeBooleanEnv(value, defaultValue = true) {
  if (value === undefined || value === "") return defaultValue;
  return !/^(0|false|no)$/i.test(String(value).trim());
}

async function main() {
  const url = process.env.HERMES_VISUAL_SMOKE_URL || "http://127.0.0.1:8797/?_hmv=visual-smoke";
  const screenshotPath = process.env.HERMES_VISUAL_SMOKE_SCREENSHOT
    || path.join(process.cwd(), "tmp", "visual-smoke.png");
  const strictLayout = normalizeBooleanEnv(process.env.HERMES_VISUAL_SMOKE_STRICT, true);
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
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
    const layout = await page.evaluate(() => {
      function round(value) {
        return Math.round(Number(value || 0) * 100) / 100;
      }

      function rect(selector) {
        const el = document.querySelector(selector);
        if (!el) return { present: false, visible: false };
        const style = window.getComputedStyle(el);
        const box = el.getBoundingClientRect();
        const visible = !el.hidden
          && style.display !== "none"
          && style.visibility !== "hidden"
          && Number(style.opacity || "1") !== 0
          && box.width > 0
          && box.height > 0;
        return {
          present: true,
          visible,
          selector,
          x: round(box.x),
          y: round(box.y),
          width: round(box.width),
          height: round(box.height),
          top: round(box.top),
          right: round(box.right),
          bottom: round(box.bottom),
          left: round(box.left),
          position: style.position,
          display: style.display,
          visibility: style.visibility,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
        };
      }

      function overlaps(a, b) {
        if (!a?.visible || !b?.visible) return false;
        return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      }

      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        visualViewportWidth: round(window.visualViewport?.width || window.innerWidth),
        visualViewportHeight: round(window.visualViewport?.height || window.innerHeight),
      };
      const rects = {
        app: rect("#app"),
        topBar: rect(".top-bar"),
        main: rect("main"),
        conversation: rect("#conversation"),
        bottomNav: rect("#bottomNav"),
        composer: rect("#composer"),
        accessKeyOverlay: rect("#accessKeyOverlay"),
        bootSplash: rect("#bootSplash"),
      };
      const failures = [];
      const warnings = [];

      if (viewport.scrollWidth > viewport.width + 2) {
        failures.push({
          code: "horizontal_overflow",
          viewportWidth: viewport.width,
          scrollWidth: viewport.scrollWidth,
        });
      }

      if (rects.bottomNav.visible) {
        if (rects.bottomNav.bottom > viewport.height + 2) {
          failures.push({ code: "bottom_nav_out_of_view", rect: rects.bottomNav, viewport });
        }
        if (rects.bottomNav.height > 120) {
          failures.push({ code: "bottom_nav_too_tall", rect: rects.bottomNav });
        }
      }

      if (rects.composer.visible && rects.bottomNav.visible && overlaps(rects.composer, rects.bottomNav)) {
        failures.push({
          code: "composer_bottom_nav_overlap",
          composer: rects.composer,
          bottomNav: rects.bottomNav,
        });
      }

      if (rects.topBar.visible && rects.bottomNav.visible && overlaps(rects.topBar, rects.bottomNav)) {
        failures.push({
          code: "top_bar_bottom_nav_overlap",
          topBar: rects.topBar,
          bottomNav: rects.bottomNav,
        });
      }

      if (rects.accessKeyOverlay.visible && rects.accessKeyOverlay.bottom > viewport.height + 2) {
        warnings.push({ code: "access_overlay_extends_below_viewport", rect: rects.accessKeyOverlay, viewport });
      }

      if (!Object.values(rects).some((entry) => entry?.visible)) {
        warnings.push({ code: "no_tracked_shell_surface_visible" });
      }

      return {
        viewport,
        rects,
        failures,
        warnings,
      };
    });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    if (strictLayout && layout.failures.length > 0) {
      const error = new Error(`visual smoke layout failures: ${layout.failures.map((failure) => failure.code).join(", ")}`);
      error.layout = layout;
      throw error;
    }
    console.log(JSON.stringify({
      ok: true,
      url,
      title,
      clientVersion,
      screenshotPath,
      strictLayout,
      layout,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  if (err?.layout) {
    console.error(JSON.stringify({ layout: err.layout }, null, 2));
  }
  process.exit(1);
});
