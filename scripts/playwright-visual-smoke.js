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

function normalizeNumberEnv(value, defaultValue) {
  if (value === undefined || value === "") return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
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
  const resolved = path.resolve(filePath);
  const value = fs.readFileSync(resolved, "utf8").trim();
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

function viewModeSettings(view) {
  const normalized = String(view || "").trim().toLowerCase();
  if (!normalized) return {};
  if (["chat", "single-chat", "single"].includes(normalized)) {
    return { hermesWebViewMode: "single", hermesWebSingleWindowMode: "chat" };
  }
  if (["topics", "tasks", "topic"].includes(normalized)) {
    return { hermesWebViewMode: "tasks", hermesWebSingleWindowMode: "task" };
  }
  if (["capability", "capabilities", "ability", "abilities", "todos"].includes(normalized)) {
    return { hermesWebViewMode: "capabilities" };
  }
  if (["learning", "education"].includes(normalized)) {
    return { hermesWebViewMode: "growth" };
  }
  if (["inbox", "projects", "automation", "wardrobe", "finance", "email", "health", "note", "codex", "growth"].includes(normalized)) {
    return { hermesWebViewMode: normalized };
  }
  return {};
}

async function clickTargetView(page, view) {
  const normalized = String(view || "").trim().toLowerCase();
  const selectorByView = {
    chat: "#bottomChatMode",
    "single-chat": "#bottomChatMode",
    single: "#bottomChatMode",
    inbox: "#bottomInboxMode",
    topics: "#bottomTasksMode",
    topic: "#bottomTasksMode",
    tasks: "#bottomTasksMode",
    capability: "#bottomTodosMode",
    capabilities: "#bottomTodosMode",
    ability: "#bottomTodosMode",
    abilities: "#bottomTodosMode",
    projects: "#bottomProjectsMode",
    directory: "#bottomProjectsMode",
    todos: "#bottomTodosMode",
    wardrobe: "#bottomWardrobeMode",
    finance: "#bottomFinanceMode",
    email: "#bottomEmailMode",
    health: "#bottomHealthMode",
    note: "#bottomNoteMode",
    codex: "#bottomCodexMode",
    automation: "#bottomAutomationMode",
  };
  const selector = selectorByView[normalized];
  if (!selector) return false;
  const button = page.locator(selector).first();
  if (!(await button.count())) return false;
  if (!(await button.isVisible().catch(() => false))) return false;
  await button.click({ timeout: 5000 });
  await page.waitForTimeout(800);
  return true;
}

async function main() {
  const url = argValue("--url", process.env.HERMES_VISUAL_SMOKE_URL || "http://127.0.0.1:8797/?_hmv=visual-smoke");
  const screenshotPath = argValue("--screenshot", process.env.HERMES_VISUAL_SMOKE_SCREENSHOT
    || path.join(process.cwd(), "tmp", "visual-smoke.png"));
  const accessKeyPath = argValue("--access-key-path", process.env.HERMES_VISUAL_SMOKE_ACCESS_KEY_PATH || process.env.HERMES_WEB_AUTH_KEY_PATH || "");
  const workspaceId = argValue("--workspace-id", process.env.HERMES_VISUAL_SMOKE_WORKSPACE_ID || "");
  const view = argValue("--view", process.env.HERMES_VISUAL_SMOKE_VIEW || "");
  const openCapabilityMenu = argValue("--open-capability-menu", process.env.HERMES_VISUAL_SMOKE_OPEN_CAPABILITY_MENU || "");
  const waitForAuth = normalizeBooleanEnv(process.env.HERMES_VISUAL_SMOKE_WAIT_FOR_AUTH, Boolean(accessKeyPath))
    && !hasArg("--no-wait-for-auth");
  const strictLayout = normalizeBooleanEnv(process.env.HERMES_VISUAL_SMOKE_STRICT, true);
  const longTaskWarnMs = normalizeNumberEnv(argValue("--long-task-warn-ms", process.env.HERMES_VISUAL_SMOKE_LONG_TASK_WARN_MS || ""), 200);
  const failOnLongTask = normalizeBooleanEnv(process.env.HERMES_VISUAL_SMOKE_FAIL_ON_LONG_TASK, false);
  const viewportBase = parseViewport(argValue("--viewport", process.env.HERMES_VISUAL_SMOKE_VIEWPORT || ""), { width: 390, height: 844 });
  const viewport = {
    width: normalizePositiveNumberEnv(argValue("--viewport-width", process.env.HERMES_VISUAL_SMOKE_VIEWPORT_WIDTH || ""), viewportBase.width),
    height: normalizePositiveNumberEnv(argValue("--viewport-height", process.env.HERMES_VISUAL_SMOKE_VIEWPORT_HEIGHT || ""), viewportBase.height),
  };
  const isMobile = hasArg("--mobile")
    ? true
    : (hasArg("--desktop") ? false : normalizeBooleanEnv(process.env.HERMES_VISUAL_SMOKE_MOBILE, true));
  const hasTouch = hasArg("--no-touch")
    ? false
    : normalizeBooleanEnv(process.env.HERMES_VISUAL_SMOKE_TOUCH, isMobile);
  const deviceScaleFactor = normalizePositiveNumberEnv(argValue("--device-scale-factor", process.env.HERMES_VISUAL_SMOKE_DEVICE_SCALE_FACTOR || ""), isMobile ? 2 : 1);
  const accessKey = accessKeyPath ? readSecretFile(accessKeyPath, "access key") : "";
  const settings = viewModeSettings(view);
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport,
      isMobile,
      hasTouch,
      deviceScaleFactor,
    });
    if (accessKey) {
      await context.addCookies([{
        name: "hermes_web_key",
        value: accessKey,
        url: urlForCookie(url),
        sameSite: "Lax",
        secure: new URL(url).protocol === "https:",
      }]);
    }
    const page = await context.newPage();
    if (accessKey || workspaceId || Object.keys(settings).length) {
      await page.addInitScript(({ key, workspace, storageSettings }) => {
        if (key) localStorage.setItem("hermesWebKey", key);
        if (workspace) localStorage.setItem("hermesWebWorkspace", workspace);
        for (const [name, value] of Object.entries(storageSettings || {})) {
          if (value) localStorage.setItem(name, value);
        }
      }, {
        key: accessKey,
        workspace: workspaceId,
        storageSettings: settings,
      });
    }
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    if (waitForAuth) {
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
      }, { timeout: 15000 });
    } else {
      await page.waitForTimeout(800);
    }
    const viewClicked = await clickTargetView(page, view);
    let capabilityMenuOpened = false;
    let capabilityMenuGesture = "";
    if (openCapabilityMenu) {
      const pluginButton = page.locator([
        `[data-plugin-topic-open-app="${openCapabilityMenu}"].capability-plugin-icon-button`,
        `#topicPluginDock .plugin-app-card[data-plugin-topic-open-app="${openCapabilityMenu}"]`,
      ].join(", ")).first();
      if (await pluginButton.count()) {
        capabilityMenuGesture = "touch-longpress";
        await pluginButton.dispatchEvent("touchstart", { bubbles: true, cancelable: true });
        await page.waitForTimeout(550);
        await pluginButton.dispatchEvent("touchend", { bubbles: true, cancelable: true });
        await page.waitForTimeout(150);
        capabilityMenuOpened = await page.locator(`[data-plugin-topic-action-menu="${openCapabilityMenu}"]`).first().isVisible().catch(() => false);
      }
    }
    const clientVersion = await page.locator("html").getAttribute("data-client-version");
    const title = await page.title();
    const layout = await page.evaluate(({ expectAuthenticated, longTaskWarnMs, failOnLongTask }) => {
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

      function cssPxVar(name) {
        const raw = window.getComputedStyle(document.documentElement).getPropertyValue(name);
        const parsed = Number(String(raw || "").replace(/px\b/, "").trim());
        return Number.isFinite(parsed) ? parsed : 0;
      }

      function navigationTiming() {
        const entry = performance.getEntriesByType("navigation")[0];
        if (!entry) return null;
        return {
          startTime: round(entry.startTime),
          responseEnd: round(entry.responseEnd),
          domContentLoadedEventEnd: round(entry.domContentLoadedEventEnd),
          loadEventEnd: round(entry.loadEventEnd),
          duration: round(entry.duration),
          transferSize: Number(entry.transferSize || 0),
          encodedBodySize: Number(entry.encodedBodySize || 0),
          decodedBodySize: Number(entry.decodedBodySize || 0),
        };
      }

      function longTasks() {
        return performance.getEntriesByType("longtask")
          .map((entry) => ({
            startTime: round(entry.startTime),
            duration: round(entry.duration),
            name: String(entry.name || ""),
          }))
          .slice(-20);
      }

      function startupPerfSummary() {
        try {
          const raw = localStorage.getItem("hermesStartupPerfLast") || "";
          if (!raw) return null;
          const value = JSON.parse(raw);
          const stages = Array.isArray(value.stages)
            ? value.stages.slice(-30).map((stage) => ({
              name: String(stage.name || ""),
              durationMs: round(stage.durationMs || stage.duration || 0),
              atMs: round(stage.atMs || stage.at || 0),
            }))
            : [];
          return {
            totalMs: round(value.totalMs || value.total || 0),
            selectedWorkspaceId: String(value.selectedWorkspaceId || ""),
            viewMode: String(value.viewMode || ""),
            messageCount: Number(value.messageCount || 0),
            pageTotal: Number(value.pageTotal || 0),
            stages,
          };
        } catch (_) {
          return { parseError: true };
        }
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
        topBar: rect(".topbar"),
        main: rect("main"),
        conversation: rect("#conversation"),
        bottomNav: rect("#bottomNav"),
        composer: rect("#composer"),
        threadTitle: rect("#threadTitle"),
        chatScopeHeader: rect("#chatScopeHeader"),
        threadList: rect("#threadList"),
        topicPluginDock: rect("#topicPluginDock"),
        capabilityHub: rect(".capability-entry-hub"),
        capabilityQuickGrid: rect(".capability-quick-grid"),
        capabilityPluginGrid: rect(".capability-plugin-grid"),
        capabilityActionMenu: rect(".capability-action-menu:not([hidden])"),
        accessKeyOverlay: rect("#accessKeyOverlay"),
        bootSplash: rect("#bootSplash"),
      };
      const chrome = {
        mobileBottomNavVisualDrop: round(cssPxVar("--mobile-bottom-nav-visual-drop")),
        mobileBottomNavOffsetHeight: round(cssPxVar("--mobile-bottom-nav-offset-height")),
        mobileBottomNavReservedHeight: round(cssPxVar("--mobile-bottom-nav-reserved-height")),
        mobileBottomStackHeight: round(cssPxVar("--mobile-bottom-stack-height")),
        topicPluginDockHeight: round(cssPxVar("--topic-plugin-dock-height")),
        topicPluginDockReservedHeight: round(cssPxVar("--topic-plugin-dock-reserved-height")),
        conversationPaddingBottom: round(Number.parseFloat(window.getComputedStyle(document.querySelector("#conversation") || document.documentElement).paddingBottom) || 0),
      };
      const capability = {
        quickActionCount: document.querySelectorAll(".capability-quick-action").length,
        capabilityPluginIconCount: document.querySelectorAll(".capability-plugin-icon-button").length,
        dockPluginIconCount: document.querySelectorAll("#topicPluginDock .plugin-app-card").length,
        pluginIconCount: document.querySelectorAll(".capability-plugin-icon-button, #topicPluginDock .plugin-app-card").length,
        sourceBadgeCount: document.querySelectorAll(".capability-action-source").length,
        openMenuCount: document.querySelectorAll(".capability-action-menu:not([hidden])").length,
      };
      const navButtons = Array.from(document.querySelectorAll("#bottomNav .bottom-tab")).map((button) => {
        const box = button.getBoundingClientRect();
        const style = window.getComputedStyle(button);
        const visibleHeight = Math.max(0, Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0));
        return {
          id: button.id || "",
          hidden: Boolean(button.hidden),
          visible: !button.hidden
            && style.display !== "none"
            && style.visibility !== "hidden"
            && box.width > 0
            && box.height > 0,
          active: button.classList.contains("active"),
          width: round(box.width),
          height: round(box.height),
          visibleHeight: round(visibleHeight),
          left: round(box.left),
          top: round(box.top),
          label: button.getAttribute("aria-label") || button.textContent.trim(),
        };
      });
      const auth = {
        appVisible: Boolean(rects.app.visible),
        loginVisible: Boolean(rects.login.visible),
        visibleNavCount: navButtons.filter((item) => item.visible).length,
        activeNavIds: navButtons.filter((item) => item.active).map((item) => item.id),
      };
      const performanceInfo = {
        navigation: navigationTiming(),
        longTasks: longTasks(),
        startupPerfLast: startupPerfSummary(),
      };
      const maxLongTaskMs = performanceInfo.longTasks.reduce((max, entry) => Math.max(max, Number(entry.duration) || 0), 0);
      const failures = [];
      const warnings = [];

      if (expectAuthenticated && (!auth.appVisible || auth.loginVisible)) {
        failures.push({ code: "authenticated_shell_not_visible", auth });
      }

      if (viewport.scrollWidth > viewport.width + 2) {
        failures.push({
          code: "horizontal_overflow",
          viewportWidth: viewport.width,
          scrollWidth: viewport.scrollWidth,
        });
      }

      if (rects.bottomNav.visible) {
        const allowedBottomOverflow = Math.max(2, chrome.mobileBottomNavVisualDrop + 2);
        const visibleBottomNavHeight = Math.max(
          0,
          Math.min(rects.bottomNav.bottom, viewport.height) - Math.max(rects.bottomNav.top, 0)
        );
        if (rects.bottomNav.bottom > viewport.height + allowedBottomOverflow) {
          failures.push({ code: "bottom_nav_out_of_view", rect: rects.bottomNav, viewport, chrome });
        }
        if (visibleBottomNavHeight < 44) {
          failures.push({ code: "bottom_nav_visible_area_too_small", visibleBottomNavHeight: round(visibleBottomNavHeight), rect: rects.bottomNav, viewport, chrome });
        }
        for (const button of navButtons.filter((item) => item.visible)) {
          if (button.visibleHeight < 44) {
            failures.push({ code: "bottom_nav_button_visible_area_too_small", button, rect: rects.bottomNav, viewport, chrome });
          }
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

      if (rects.topicPluginDock.visible) {
        if (rects.bottomNav.visible && overlaps(rects.topicPluginDock, rects.bottomNav)) {
          failures.push({
            code: "topic_plugin_dock_bottom_nav_overlap",
            topicPluginDock: rects.topicPluginDock,
            bottomNav: rects.bottomNav,
          });
        }
        if (rects.conversation.visible && overlaps(rects.topicPluginDock, rects.conversation) && chrome.conversationPaddingBottom + 1 < chrome.mobileBottomStackHeight) {
          failures.push({
            code: "topic_plugin_dock_scroll_reserve_too_small",
            topicPluginDock: rects.topicPluginDock,
            conversation: rects.conversation,
            chrome,
          });
        }
      }

      if (rects.accessKeyOverlay.visible && rects.accessKeyOverlay.bottom > viewport.height + 2) {
        warnings.push({ code: "access_overlay_extends_below_viewport", rect: rects.accessKeyOverlay, viewport });
      }

      if (rects.capabilityHub.visible) {
        if (!capability.quickActionCount) failures.push({ code: "capability_quick_actions_missing", capability });
        if (!capability.pluginIconCount) failures.push({ code: "capability_plugin_icons_missing", capability });
        if (rects.capabilityHub.bottom > viewport.height + 4 && !rects.conversation.visible) {
          warnings.push({ code: "capability_hub_extends_without_scroll_surface", rect: rects.capabilityHub, viewport });
        }
        if (rects.capabilityActionMenu.visible && rects.bottomNav.visible && overlaps(rects.capabilityActionMenu, rects.bottomNav)) {
          failures.push({
            code: "capability_menu_bottom_nav_overlap",
            menu: rects.capabilityActionMenu,
            bottomNav: rects.bottomNav,
          });
        }
        if (rects.capabilityActionMenu.visible && rects.topicPluginDock.visible && overlaps(rects.capabilityActionMenu, rects.topicPluginDock)) {
          failures.push({
            code: "capability_menu_topic_plugin_dock_overlap",
            menu: rects.capabilityActionMenu,
            topicPluginDock: rects.topicPluginDock,
          });
        }
      }

      if (!Object.values(rects).some((entry) => entry?.visible)) {
        warnings.push({ code: "no_tracked_shell_surface_visible" });
      }

      if (maxLongTaskMs > longTaskWarnMs) {
        const payload = {
          code: "long_task_detected",
          thresholdMs: longTaskWarnMs,
          maxLongTaskMs: round(maxLongTaskMs),
          count: performanceInfo.longTasks.length,
        };
        if (failOnLongTask) failures.push(payload);
        else warnings.push(payload);
      }

      return {
        viewport,
        rects,
        chrome,
        capability,
        auth,
        navButtons,
        performance: performanceInfo,
        failures,
        warnings,
      };
    }, {
      expectAuthenticated: Boolean(waitForAuth || accessKey),
      longTaskWarnMs,
      failOnLongTask,
    });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    if (strictLayout && layout.failures.length > 0) {
      const error = new Error(`visual smoke layout failures: ${layout.failures.map((failure) => failure.code).join(", ")}`);
      error.layout = layout;
      throw error;
    }
    console.log(JSON.stringify({
      ok: true,
      url: safeUrlForOutput(url),
      title,
      clientVersion,
      screenshotPath,
      authenticatedInput: Boolean(accessKey),
      workspaceId,
      view,
      viewClicked,
      openCapabilityMenu,
      capabilityMenuOpened,
      capabilityMenuGesture,
      browserContext: {
        viewport,
        isMobile,
        hasTouch,
        deviceScaleFactor,
      },
      strictLayout,
      longTaskWarnMs,
      failOnLongTask,
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
