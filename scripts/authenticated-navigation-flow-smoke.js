"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index >= 0 && index + 1 < process.argv.length) return process.argv[index + 1];
  return fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function normalizeBooleanEnv(value, defaultValue = true) {
  if (value === undefined || value === "") return defaultValue;
  return !/^(0|false|no)$/i.test(String(value).trim());
}

function normalizePositiveNumberEnv(value, defaultValue) {
  if (value === undefined || value === "") return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function parseViewport(value, fallback) {
  const text = String(value || "").trim().toLowerCase();
  const match = text.match(/^(\d{2,5})x(\d{2,5})$/);
  if (!match) return fallback;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return fallback;
  return { width, height };
}

function readSecretFile(filePath, label) {
  const value = fs.readFileSync(path.resolve(filePath), "utf8").trim();
  if (!value) throw new Error(`${label} file is empty`);
  return value;
}

function urlForCookie(rawUrl) {
  const parsed = new URL(rawUrl);
  return `${parsed.protocol}//${parsed.host}/`;
}

function safeUrlForOutput(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (/key|token|secret|password|cookie/i.test(key)) parsed.searchParams.set(key, "REDACTED");
    }
    return parsed.toString();
  } catch (_) {
    return rawUrl;
  }
}

function makeStep(id, label, action, expected = {}) {
  return { id, label, action, expected };
}

const FLOW_STEPS = Object.freeze([
  makeStep("chat", "chat", { selector: "#bottomChatMode" }, { activeNavId: "bottomChatMode", surface: "chat" }),
  makeStep("inbox", "inbox", { selector: "#bottomInboxMode" }, { activeNavId: "bottomInboxMode", surface: "inbox" }),
  makeStep("topics", "topics", { selector: "#bottomTasksMode" }, { activeNavId: "bottomTasksMode", surface: "topics" }),
  makeStep("plugin_or_topic", "plugin/topic", {
    selectors: [
      ".capability-plugin-icon-button",
      "#topicPluginDock .plugin-app-card",
      "[data-plugin-topic-open-topic]",
      "[data-plugin-topic-open-app]",
    ],
  }, { surface: "plugin_or_topic" }),
  makeStep("return", "return", { selector: "#bottomTasksMode" }, { activeNavId: "bottomTasksMode", surface: "topics" }),
]);

async function waitForAuthenticatedShell(page, timeout = 15000) {
  await page.waitForFunction(() => {
    const app = document.getElementById("app");
    const login = document.getElementById("login");
    const appStyle = app ? window.getComputedStyle(app) : null;
    const loginStyle = login ? window.getComputedStyle(login) : null;
    const appVisible = Boolean(app)
      && !app.classList.contains("hidden")
      && appStyle?.display !== "none"
      && app.getBoundingClientRect().width > 0
      && app.getBoundingClientRect().height > 0;
    const loginVisible = Boolean(login)
      && !login.classList.contains("hidden")
      && loginStyle?.display !== "none"
      && login.getBoundingClientRect().width > 0
      && login.getBoundingClientRect().height > 0;
    return appVisible && !loginVisible;
  }, { timeout });
}

async function clickStepTarget(page, action) {
  const selectors = Array.isArray(action.selectors) ? action.selectors : [action.selector].filter(Boolean);
  for (const selector of selectors) {
    const target = page.locator(selector).first();
    if (!(await target.count())) continue;
    if (!(await target.isVisible().catch(() => false))) continue;
    await target.click({ timeout: 5000 });
    return { ok: true, selector };
  }
  return { ok: false, selector: selectors.join(", ") };
}

async function collectEvidence(page, step, startedAt, previous = null, options = {}) {
  return page.evaluate(({ stepData, started, previousSurface, longTaskWarnMs }) => {
    function round(value) {
      return Math.round(Number(value || 0) * 100) / 100;
    }

    function rect(selector) {
      const el = document.querySelector(selector);
      if (!el) return { present: false, visible: false, selector };
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
      };
    }

    function visibleAny(selectors) {
      return selectors.some((selector) => rect(selector).visible);
    }

    function overlaps(a, b) {
      if (!a?.visible || !b?.visible) return false;
      return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    }

    function longTaskSummary() {
      const entries = performance.getEntriesByType("longtask").map((entry) => ({
        startTime: round(entry.startTime),
        duration: round(entry.duration),
        name: String(entry.name || ""),
      }));
      const maxDurationMs = entries.reduce((max, entry) => Math.max(max, Number(entry.duration) || 0), 0);
      return {
        count: entries.length,
        maxDurationMs: round(maxDurationMs),
        thresholdMs: longTaskWarnMs,
        recent: entries.slice(-10),
      };
    }

    function layoutStabilitySummary() {
      const shifts = performance.getEntriesByType("layout-shift").map((entry) => ({
        startTime: round(entry.startTime),
        value: round(entry.value),
        hadRecentInput: Boolean(entry.hadRecentInput),
      }));
      return {
        count: shifts.length,
        cumulative: round(shifts.reduce((sum, entry) => sum + (entry.hadRecentInput ? 0 : Number(entry.value) || 0), 0)),
        recent: shifts.slice(-10),
      };
    }

    function navigationTiming() {
      const entry = performance.getEntriesByType("navigation")[0];
      if (!entry) return null;
      return {
        responseEnd: round(entry.responseEnd),
        domContentLoadedEventEnd: round(entry.domContentLoadedEventEnd),
        loadEventEnd: round(entry.loadEventEnd),
        duration: round(entry.duration),
      };
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
      login: rect("#login"),
      bottomNav: rect("#bottomNav"),
      composer: rect("#composer"),
      conversation: rect("#conversation"),
      threadList: rect("#threadList"),
      actionInbox: rect("#actionInboxView, .action-inbox-view"),
      topicHub: rect(".capability-entry-hub"),
      topicPluginDock: rect("#topicPluginDock"),
      pluginFrame: rect("#embeddedPluginFrame, iframe[data-plugin-frame], .embedded-plugin-frame"),
      capabilityActionMenu: rect(".capability-action-menu:not([hidden])"),
    };
    const navButtons = Array.from(document.querySelectorAll("#bottomNav .bottom-tab")).map((button) => {
      const box = button.getBoundingClientRect();
      const style = window.getComputedStyle(button);
      return {
        id: button.id || "",
        label: button.getAttribute("aria-label") || button.textContent.trim(),
        active: button.classList.contains("active"),
        hidden: Boolean(button.hidden),
        visible: !button.hidden && style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0,
        bounds: {
          left: round(box.left),
          top: round(box.top),
          right: round(box.right),
          bottom: round(box.bottom),
          width: round(box.width),
          height: round(box.height),
        },
      };
    });
    const surfaces = {
      chat: visibleAny(["#conversation", ".message-list", "[data-chat-surface]"]),
      inbox: visibleAny(["#actionInboxView", ".action-inbox-view", ".action-inbox-list", "[data-action-inbox-list]"]),
      topics: visibleAny([".capability-entry-hub", "#topicPluginDock", ".capability-quick-grid", ".capability-plugin-grid"]),
      plugin_or_topic: visibleAny(["#embeddedPluginFrame", "iframe[data-plugin-frame]", ".embedded-plugin-frame", ".plugin-topic-chat", ".plugin-topic-context"]),
    };
    const activeNav = navButtons.filter((item) => item.active).map((item) => item.id);
    const failures = [];
    const warnings = [];
    const staleSurfaceWarnings = [];
    if (!rects.app.visible || rects.login.visible) failures.push({ code: "authenticated_shell_not_visible" });
    if (viewport.scrollWidth > viewport.width + 2) failures.push({ code: "horizontal_overflow", viewport });
    if (rects.bottomNav.visible && rects.bottomNav.bottom > viewport.height + 2) failures.push({ code: "bottom_nav_out_of_view", bottomNav: rects.bottomNav, viewport });
    if (rects.composer.visible && rects.bottomNav.visible && overlaps(rects.composer, rects.bottomNav)) {
      failures.push({ code: "composer_bottom_nav_overlap", composer: rects.composer, bottomNav: rects.bottomNav });
    }
    if (stepData.expected.activeNavId && !activeNav.includes(stepData.expected.activeNavId)) {
      failures.push({ code: "active_nav_mismatch", expected: stepData.expected.activeNavId, activeNav });
    }
    if (stepData.expected.surface && !surfaces[stepData.expected.surface]) {
      const pluginFallback = stepData.expected.surface === "plugin_or_topic" && surfaces.topics;
      if (pluginFallback) warnings.push({ code: "plugin_topic_entry_returned_to_topics" });
      else failures.push({ code: "expected_surface_not_visible", surface: stepData.expected.surface, surfaces });
    }
    if (previousSurface && previousSurface !== stepData.expected.surface && surfaces[previousSurface]) {
      staleSurfaceWarnings.push({
        code: "stale_cached_surface_visible_after_switch",
        previousSurface,
        currentSurface: stepData.expected.surface || "",
      });
    }
    const longTasks = longTaskSummary();
    if (longTasks.maxDurationMs > longTaskWarnMs) warnings.push({ code: "long_task_detected", summary: longTasks });
    return {
      id: stepData.id,
      label: stepData.label,
      currentView: {
        activeNav,
        localStorageViewMode: localStorage.getItem("hermesWebViewMode") || "",
        localStorageSingleWindowMode: localStorage.getItem("hermesWebSingleWindowMode") || "",
        bodyClassName: document.body?.className || "",
      },
      activeNav,
      surfaces,
      surfaceVisible: Boolean(stepData.expected.surface && surfaces[stepData.expected.surface]),
      bottomNavBounds: rects.bottomNav,
      composerBounds: rects.composer,
      composerNavOverlap: overlaps(rects.composer, rects.bottomNav),
      viewportMetrics: viewport,
      horizontalOverflow: viewport.scrollWidth > viewport.width + 2,
      longTaskSummary: longTasks,
      layoutStability: layoutStabilitySummary(),
      navigationTiming: navigationTiming(),
      tabSwitchTimingMs: round(performance.now() - started),
      navButtons,
      rects,
      failures,
      warnings,
      staleSurfaceWarnings,
    };
  }, {
    stepData: step,
    started: startedAt,
    previousSurface: previous?.expected?.surface || "",
    longTaskWarnMs: options.longTaskWarnMs,
  });
}

async function main() {
  const url = argValue("--url", process.env.HERMES_NAV_FLOW_URL || "http://127.0.0.1:8797/?_hmv=nav-flow");
  const accessKeyPath = argValue("--access-key-path", process.env.HERMES_NAV_FLOW_ACCESS_KEY_PATH || process.env.HERMES_WEB_AUTH_KEY_PATH || "");
  const workspaceId = argValue("--workspace-id", process.env.HERMES_NAV_FLOW_WORKSPACE_ID || "owner");
  const screenshotDir = argValue("--screenshot-dir", process.env.HERMES_NAV_FLOW_SCREENSHOT_DIR || "");
  const longTaskWarnMs = normalizePositiveNumberEnv(argValue("--long-task-warn-ms", process.env.HERMES_NAV_FLOW_LONG_TASK_WARN_MS || ""), 200);
  const viewportBase = parseViewport(argValue("--viewport", process.env.HERMES_NAV_FLOW_VIEWPORT || ""), { width: 390, height: 844 });
  const viewport = {
    width: normalizePositiveNumberEnv(argValue("--viewport-width", process.env.HERMES_NAV_FLOW_VIEWPORT_WIDTH || ""), viewportBase.width),
    height: normalizePositiveNumberEnv(argValue("--viewport-height", process.env.HERMES_NAV_FLOW_VIEWPORT_HEIGHT || ""), viewportBase.height),
  };
  const isMobile = hasArg("--desktop") ? false : normalizeBooleanEnv(process.env.HERMES_NAV_FLOW_MOBILE, true);
  const hasTouch = hasArg("--no-touch") ? false : normalizeBooleanEnv(process.env.HERMES_NAV_FLOW_TOUCH, isMobile);
  if (!accessKeyPath) throw new Error("--access-key-path or HERMES_NAV_FLOW_ACCESS_KEY_PATH is required");
  const accessKey = readSecretFile(accessKeyPath, "access key");
  if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const result = {
    ok: false,
    origin: safeUrlForOutput(url),
    authenticatedInput: Boolean(accessKey),
    workspaceId,
    viewport,
    steps: [],
    failures: [],
    warnings: [],
  };
  try {
    const context = await browser.newContext({
      viewport,
      isMobile,
      hasTouch,
      deviceScaleFactor: isMobile ? 2 : 1,
    });
    await context.addCookies([{
      name: "hermes_web_key",
      value: accessKey,
      url: urlForCookie(url),
      sameSite: "Lax",
      secure: new URL(url).protocol === "https:",
    }]);
    const page = await context.newPage();
    await page.addInitScript(({ key, workspace }) => {
      localStorage.setItem("hermesWebKey", key);
      localStorage.setItem("hermesWebWorkspace", workspace);
      localStorage.setItem("hermesWebViewMode", "single");
      localStorage.setItem("hermesWebSingleWindowMode", "chat");
    }, { key: accessKey, workspace: workspaceId });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await waitForAuthenticatedShell(page);

    let previous = null;
    for (const step of FLOW_STEPS) {
      const startedAt = await page.evaluate(() => performance.now());
      const clicked = await clickStepTarget(page, step.action);
      if (!clicked.ok) {
        result.failures.push({ step: step.id, code: "step_target_not_found", selector: clicked.selector });
        continue;
      }
      await page.waitForTimeout(step.id === "plugin_or_topic" ? 1200 : 800);
      const evidence = await collectEvidence(page, step, startedAt, previous, { longTaskWarnMs });
      evidence.actionSelector = clicked.selector;
      result.steps.push(evidence);
      result.failures.push(...evidence.failures.map((item) => Object.assign({ step: step.id }, item)));
      result.warnings.push(...evidence.warnings.map((item) => Object.assign({ step: step.id }, item)));
      result.warnings.push(...evidence.staleSurfaceWarnings.map((item) => Object.assign({ step: step.id }, item)));
      if (screenshotDir) {
        const screenshot = path.join(screenshotDir, `${String(result.steps.length).padStart(2, "0")}-${step.id}.png`);
        await page.screenshot({ path: screenshot, fullPage: false });
        evidence.screenshot = screenshot;
      }
      previous = step;
    }
    result.ok = result.failures.length === 0;
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(result, null, hasArg("--json") ? 2 : 2));
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || String(err));
    process.exit(1);
  });
}

module.exports = {
  FLOW_STEPS,
  collectEvidence,
  parseViewport,
  safeUrlForOutput,
};
