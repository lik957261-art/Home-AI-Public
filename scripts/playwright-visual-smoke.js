"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const DIRECTORY_TOPIC_COMPOSER_LONG_INPUT_SHRINK_SCENARIO = "directory-topic-composer-long-input-shrink";

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
    return { hermesWebViewMode: "tasks", hermesWebSingleWindowMode: "task" };
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
    capability: "#bottomTasksMode",
    capabilities: "#bottomTasksMode",
    ability: "#bottomTasksMode",
    abilities: "#bottomTasksMode",
    projects: "#bottomProjectsMode",
    directory: "#bottomProjectsMode",
    todos: "#bottomTasksMode",
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

function scenarioToken(value) {
  return String(value || "").trim().toLowerCase().replace(/_/g, "-");
}

async function measureDirectoryTopicComposer(page) {
  return page.evaluate(() => {
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
        top: round(box.top),
        right: round(box.right),
        bottom: round(box.bottom),
        left: round(box.left),
        width: round(box.width),
        height: round(box.height),
        overflowY: style.overflowY,
        maxHeight: style.maxHeight,
      };
    }
    function overlaps(a, b) {
      if (!a?.visible || !b?.visible) return false;
      return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    }
    const input = document.querySelector("#messageInput");
    const editor = rect("#messageInput");
    const composer = rect("#composer");
    const bottomNav = rect("#bottomNav");
    return {
      editor,
      composer,
      bottomNav,
      composerBottomNavOverlap: overlaps(composer, bottomNav),
      valueLength: Number(input?.value?.length || 0),
      scrollHeight: round(input?.scrollHeight || 0),
      inlineHeight: String(input?.style?.height || ""),
      appClass: String(document.querySelector("#app")?.className || "").slice(0, 240),
    };
  });
}

function assertScenario(name, pass, code, details = {}) {
  return {
    name,
    pass: Boolean(pass),
    code: pass ? "" : code,
    details,
  };
}

async function runDirectoryTopicComposerLongInputShrinkScenario(page) {
  const longInput = Array.from({ length: 26 }, (_, index) => `visual-smoke-${index + 1}`).join(" ");
  const shortInput = "short visual smoke";
  await page.evaluate(() => {
    const app = document.getElementById("app");
    const composer = document.getElementById("composer");
    const conversation = document.getElementById("conversation");
    const input = document.getElementById("messageInput");
    const dock = document.getElementById("topicPluginDock");
    if (app) {
      app.classList.add("main-back-visible", "plugin-context-nav-mode", "plugin-topic-detail-mode");
      app.classList.remove(
        "task-list-mode",
        "capability-mode",
        "embedded-plugin-host-active",
        "wardrobe-plugin-host-active",
        "reading-fullscreen-mode",
        "global-plugin-dock-mode",
        "global-plugin-dock-expanded-mode",
        "global-plugin-dock-collapsed-mode",
      );
    }
    if (dock) {
      dock.hidden = true;
      dock.setAttribute("aria-hidden", "true");
      dock.style.display = "none";
    }
    document.documentElement.style.removeProperty("--topic-plugin-dock-bottom-runtime");
    document.documentElement.style.removeProperty("--topic-plugin-dock-reserved-height-runtime");
    document.documentElement.style.removeProperty("--mobile-bottom-stack-height-runtime");
    if (typeof window.updateMobileBottomNavReservation === "function") {
      window.updateMobileBottomNavReservation();
    }
    if (typeof window.configureComposer === "function") {
      window.configureComposer({ enabled: true, placeholder: "Reply in this topic..." });
    }
    if (composer) {
      composer.hidden = false;
      composer.setAttribute("aria-hidden", "false");
      composer.style.display = "";
    }
    if (input) {
      input.disabled = false;
      input.dataset.disabled = "";
      input.setAttribute("aria-disabled", "false");
      input.placeholder = input.placeholder || "Reply in this topic...";
      input.dataset.placeholder = input.dataset.placeholder || "Reply in this topic...";
    }
    if (conversation && !conversation.querySelector("[data-visual-smoke-directory-topic]")) {
      const marker = document.createElement("div");
      marker.dataset.visualSmokeDirectoryTopic = "true";
      marker.className = "message assistant";
      marker.textContent = "visual smoke directory topic shell";
      conversation.appendChild(marker);
    }
  });
  const input = page.locator("#messageInput").first();
  await input.waitFor({ state: "visible", timeout: 5000 });
  await input.fill("");
  await input.focus();
  await page.waitForTimeout(120);
  const before = await measureDirectoryTopicComposer(page);
  await input.fill(longInput);
  await page.waitForTimeout(180);
  const long = await measureDirectoryTopicComposer(page);
  await input.fill(shortInput);
  await page.waitForTimeout(180);
  const short = await measureDirectoryTopicComposer(page);
  await input.fill("");
  await page.waitForTimeout(180);
  const cleared = await measureDirectoryTopicComposer(page);
  await input.blur();
  await page.waitForTimeout(120);
  const blurred = await measureDirectoryTopicComposer(page);
  const compactCeiling = Math.max(56, before.editor.height + 10);
  const maxLongEditorHeight = 128;
  const assertions = [
    assertScenario("directory_topic_composer_visible", before.editor.visible && before.composer.visible, "directory_topic_composer_not_visible", {
      beforeEditorHeight: before.editor.height,
      beforeComposerHeight: before.composer.height,
    }),
    assertScenario("long_input_editor_bounded", long.editor.height <= maxLongEditorHeight, "directory_topic_composer_long_editor_too_tall", {
      longEditorHeight: long.editor.height,
      maxLongEditorHeight,
    }),
    assertScenario("long_input_expands_editor", long.editor.height > before.editor.height + 8, "directory_topic_composer_long_input_did_not_expand", {
      beforeEditorHeight: before.editor.height,
      longEditorHeight: long.editor.height,
    }),
    assertScenario("short_input_shrinks_editor", short.editor.height <= compactCeiling, "directory_topic_composer_short_input_stale_height", {
      shortEditorHeight: short.editor.height,
      compactCeiling,
    }),
    assertScenario("clear_input_shrinks_editor", cleared.editor.height <= compactCeiling, "directory_topic_composer_clear_input_stale_height", {
      clearedEditorHeight: cleared.editor.height,
      compactCeiling,
    }),
    assertScenario("blur_keeps_editor_compact", blurred.editor.height <= compactCeiling, "directory_topic_composer_blur_stale_height", {
      blurredEditorHeight: blurred.editor.height,
      compactCeiling,
    }),
    assertScenario("composer_bottom_nav_not_overlapping", !long.composerBottomNavOverlap && !cleared.composerBottomNavOverlap, "directory_topic_composer_bottom_nav_overlap", {
      longOverlap: long.composerBottomNavOverlap,
      clearedOverlap: cleared.composerBottomNavOverlap,
    }),
    assertScenario("composer_shell_bounded_after_clear", cleared.composer.height <= Math.max(76, before.composer.height + 18), "directory_topic_composer_shell_stale_height", {
      beforeComposerHeight: before.composer.height,
      clearedComposerHeight: cleared.composer.height,
    }),
  ];
  return {
    name: DIRECTORY_TOPIC_COMPOSER_LONG_INPUT_SHRINK_SCENARIO,
    ok: assertions.every((item) => item.pass),
    metrics: {
      before,
      longInput: long,
      shortInput: short,
      clearedInput: cleared,
      blurredInput: blurred,
    },
    assertions,
  };
}

async function main() {
  const url = argValue("--url", process.env.HERMES_VISUAL_SMOKE_URL || "http://127.0.0.1:8797/?_hmv=visual-smoke");
  const scenario = scenarioToken(argValue("--scenario", process.env.HERMES_VISUAL_SMOKE_SCENARIO || ""));
  const screenshotPath = argValue("--screenshot", process.env.HERMES_VISUAL_SMOKE_SCREENSHOT
    || path.join(process.cwd(), "tmp", "visual-smoke.png"));
  const accessKeyPath = argValue("--access-key-path", process.env.HERMES_VISUAL_SMOKE_ACCESS_KEY_PATH || process.env.HERMES_WEB_AUTH_KEY_PATH || "");
  const workspaceId = argValue("--workspace-id", process.env.HERMES_VISUAL_SMOKE_WORKSPACE_ID || "");
  const view = argValue("--view", process.env.HERMES_VISUAL_SMOKE_VIEW || "");
  const openPluginDrawerMenu = argValue(
    "--open-plugin-drawer-menu",
    process.env.HERMES_VISUAL_SMOKE_OPEN_PLUGIN_DRAWER_MENU
      || argValue("--open-capability-menu", process.env.HERMES_VISUAL_SMOKE_OPEN_CAPABILITY_MENU || "")
  );
  const openPluginDrawerQuickMenu = ["frequent", "quick", "common", "__frequent", "__quick"].includes(String(openPluginDrawerMenu || "").trim().toLowerCase());
  const openCapabilityMenu = openPluginDrawerMenu;
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
    let scenarioResult = null;
    if (scenario === DIRECTORY_TOPIC_COMPOSER_LONG_INPUT_SHRINK_SCENARIO) {
      scenarioResult = await runDirectoryTopicComposerLongInputShrinkScenario(page);
    }
    let pluginDrawerMenuOpened = false;
    let pluginDrawerMenuGesture = "";
    if (openPluginDrawerMenu) {
      await page.evaluate(() => {
        if (typeof window.setGlobalPluginDockExpanded === "function") {
          window.setGlobalPluginDockExpanded(true, { persist: false });
        }
      }).catch(() => undefined);
      await page.waitForTimeout(180);
      const pluginButton = page.locator(openPluginDrawerQuickMenu
        ? "#topicPluginDock .plugin-drawer-quick-card"
        : `#topicPluginDock .plugin-app-card[data-plugin-topic-open-app="${openPluginDrawerMenu}"]`
      ).first();
      if (await pluginButton.count()) {
        if (openPluginDrawerQuickMenu) {
          pluginDrawerMenuGesture = "click";
          await pluginButton.click({ timeout: 5000 });
        } else {
          pluginDrawerMenuGesture = "contextmenu";
          await pluginButton.dispatchEvent("contextmenu", { bubbles: true, cancelable: true });
        }
        await page.waitForTimeout(150);
        const targetMenuOpened = openPluginDrawerQuickMenu
          ? await page.locator("#topicPluginDock [data-plugin-drawer-action-menu]").first().isVisible().catch(() => false)
          : await page.locator(`[data-plugin-topic-action-menu="${openPluginDrawerMenu}"]`).first().isVisible().catch(() => false);
        const visibleDockMenuOpened = await page.locator("#topicPluginDock .capability-action-menu:not([hidden])").first().isVisible().catch(() => false);
        pluginDrawerMenuOpened = Boolean(targetMenuOpened || visibleDockMenuOpened);
      }
    }
    const clientVersion = await page.locator("html").getAttribute("data-client-version");
    const title = await page.title();
    const layout = await page.evaluate(({ expectAuthenticated, longTaskWarnMs, failOnLongTask, openPluginDrawerMenu, openPluginDrawerQuickMenu, pluginDrawerMenuOpened }) => {
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

      function verticalOverlapPx(a, b) {
        if (!a?.visible || !b?.visible) return 0;
        return Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
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
        pluginDrawerQuickCard: rect("#topicPluginDock .plugin-drawer-quick-card"),
        pluginDrawerActionMenu: rect("#topicPluginDock .capability-action-menu:not([hidden])"),
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
        topicPluginDockNavOverlap: round(cssPxVar("--topic-plugin-dock-nav-overlap")),
        conversationPaddingBottom: round(Number.parseFloat(window.getComputedStyle(document.querySelector("#conversation") || document.documentElement).paddingBottom) || 0),
      };
      const capability = {
        quickActionCount: document.querySelectorAll(".capability-quick-action").length,
        capabilityPluginIconCount: document.querySelectorAll(".capability-plugin-icon-button").length,
        dockPluginIconCount: document.querySelectorAll("#topicPluginDock .plugin-app-card").length,
        pluginDrawerQuickCardCount: document.querySelectorAll("#topicPluginDock .plugin-drawer-quick-card").length,
        pluginDrawerQuickActionCount: document.querySelectorAll("#topicPluginDock [data-plugin-drawer-action-menu]:not([hidden]) [data-plugin-topic-action-plugin][data-plugin-topic-action-id]").length,
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
        if (!capability.pluginDrawerQuickCardCount) failures.push({ code: "plugin_drawer_quick_card_missing", capability });
        if (openPluginDrawerMenu && !pluginDrawerMenuOpened) {
          failures.push({ code: "plugin_drawer_menu_not_opened", openPluginDrawerMenu, capability });
        }
        if (openPluginDrawerQuickMenu && pluginDrawerMenuOpened && !capability.pluginDrawerQuickActionCount) {
          failures.push({ code: "plugin_drawer_quick_actions_missing", capability });
        }
        const topicDockBottomNavOverlapY = verticalOverlapPx(rects.topicPluginDock, rects.bottomNav);
        const topicDockBottomNavOverlapTolerance = Math.max(1, chrome.topicPluginDockNavOverlap || 0) + 1;
        if (rects.bottomNav.visible && topicDockBottomNavOverlapY > topicDockBottomNavOverlapTolerance) {
          failures.push({
            code: "topic_plugin_dock_bottom_nav_overlap",
            overlapPx: round(topicDockBottomNavOverlapY),
            tolerancePx: round(topicDockBottomNavOverlapTolerance),
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
        if (rects.pluginDrawerActionMenu.visible && rects.bottomNav.visible && overlaps(rects.pluginDrawerActionMenu, rects.bottomNav)) {
          failures.push({
            code: "plugin_drawer_menu_bottom_nav_overlap",
            menu: rects.pluginDrawerActionMenu,
            bottomNav: rects.bottomNav,
          });
        }
      }

      if (rects.accessKeyOverlay.visible && rects.accessKeyOverlay.bottom > viewport.height + 2) {
        warnings.push({ code: "access_overlay_extends_below_viewport", rect: rects.accessKeyOverlay, viewport });
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
      openPluginDrawerMenu,
      openPluginDrawerQuickMenu,
      pluginDrawerMenuOpened,
    });
    if (scenarioResult) {
      layout.scenario = scenarioResult;
      for (const assertion of scenarioResult.assertions.filter((item) => !item.pass)) {
        layout.failures.push({
          code: assertion.code || assertion.name || "visual_scenario_assertion_failed",
          scenario,
          assertion: assertion.name,
          details: assertion.details || {},
        });
      }
    }
    await page.screenshot({ path: screenshotPath, fullPage: true });
    if (strictLayout && layout.failures.length > 0) {
      const error = new Error(`visual smoke layout failures: ${layout.failures.map((failure) => failure.code).join(", ")}`);
      error.layout = layout;
      throw error;
    }
    console.log(JSON.stringify({
      ok: true,
      scenario,
      assertions: scenarioResult?.assertions || [],
      url: safeUrlForOutput(url),
      title,
      clientVersion,
      screenshotPath,
      authenticatedInput: Boolean(accessKey),
      workspaceId,
      view,
      viewClicked,
      openCapabilityMenu,
      openPluginDrawerMenu,
      capabilityMenuOpened: pluginDrawerMenuOpened,
      capabilityMenuGesture: pluginDrawerMenuGesture,
      pluginDrawerMenuOpened,
      pluginDrawerMenuGesture,
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
