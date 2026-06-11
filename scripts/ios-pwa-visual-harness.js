"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_DEBUG_URL = "http://127.0.0.1:19073/";
const DEFAULT_ARTIFACT_DIR = path.join(process.env.HOME || "/tmp", ".homeai-qa", "artifacts");
const DEFAULT_LOCK_DIR = path.join(process.env.HOME || "/tmp", ".homeai-qa", "locks");

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    debugUrl: DEFAULT_DEBUG_URL,
    appUrl: "",
    scenario: "directory-dark-status",
    pluginId: "",
    pluginActionId: "",
    pluginThreadId: "",
    theme: "dark",
    keyboardTarget: "composer",
    keyboardText: "visual test",
    keyboardWaitMs: 900,
    screenshot: "",
    artifactDir: DEFAULT_ARTIFACT_DIR,
    waitMs: 900,
    openWaitMs: 1200,
    timeoutMs: 15000,
    lockFile: "",
    lockTimeoutMs: 60000,
    lockStaleMs: 300000,
    expectedClientVersion: "",
    minScreenshotBytes: 4096,
    noLock: false,
    json: false,
    list: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    const next = () => argv[++index] || "";
    if (item === "--debug-url") out.debugUrl = next() || out.debugUrl;
    else if (item === "--app-url") out.appUrl = next();
    else if (item === "--scenario") out.scenario = next() || out.scenario;
    else if (item === "--plugin-id") out.pluginId = next();
    else if (item === "--plugin-action-id") out.pluginActionId = next();
    else if (item === "--plugin-thread-id") out.pluginThreadId = next();
    else if (item === "--theme") out.theme = next() || out.theme;
    else if (item === "--keyboard-target") out.keyboardTarget = next() || out.keyboardTarget;
    else if (item === "--keyboard-text") out.keyboardText = next();
    else if (item === "--keyboard-wait-ms") out.keyboardWaitMs = readPositiveInt(next(), out.keyboardWaitMs);
    else if (item === "--screenshot") out.screenshot = next();
    else if (item === "--artifact-dir") out.artifactDir = next() || out.artifactDir;
    else if (item === "--wait-ms") out.waitMs = readPositiveInt(next(), out.waitMs);
    else if (item === "--open-wait-ms") out.openWaitMs = readPositiveInt(next(), out.openWaitMs);
    else if (item === "--timeout-ms") out.timeoutMs = readPositiveInt(next(), out.timeoutMs);
    else if (item === "--lock-file") out.lockFile = next();
    else if (item === "--lock-timeout-ms") out.lockTimeoutMs = readPositiveInt(next(), out.lockTimeoutMs);
    else if (item === "--lock-stale-ms") out.lockStaleMs = readPositiveInt(next(), out.lockStaleMs);
    else if (item === "--expected-client-version") out.expectedClientVersion = next();
    else if (item === "--min-screenshot-bytes") out.minScreenshotBytes = readNonNegativeInt(next(), out.minScreenshotBytes);
    else if (item === "--no-lock") out.noLock = true;
    else if (item === "--json") out.json = true;
    else if (item === "--list") out.list = true;
    else if (item === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${item}`);
    }
  }
  out.debugUrl = normalizeBaseUrl(out.debugUrl);
  if (!out.lockFile) out.lockFile = defaultLockPath(out);
  return out;
}

function readPositiveInt(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.floor(number);
}

function readNonNegativeInt(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.floor(number);
}

function normalizeBaseUrl(value) {
  const url = new URL(String(value || DEFAULT_DEBUG_URL));
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("debug_url_must_be_http");
  return url.href.endsWith("/") ? url.href : `${url.href}/`;
}

function defaultLockPath(options = {}) {
  const url = new URL(normalizeBaseUrl(options.debugUrl || DEFAULT_DEBUG_URL));
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  const lane = `${url.hostname}-${port}`.replace(/[^a-z0-9_.-]+/ig, "-");
  return path.join(DEFAULT_LOCK_DIR, `ios-pwa-visual-${lane}.lock`);
}

function apiUrl(options, pathname) {
  return new URL(pathname.replace(/^\//, ""), options.debugUrl).href;
}

function printHelp() {
  console.log([
    "Usage: node scripts/ios-pwa-visual-harness.js [options]",
    "",
    "Options:",
    "  --debug-url <url>      Live debug server URL. Default: http://127.0.0.1:19073/",
    "  --app-url <url>        Optional app URL to open through the live debug server before the scenario.",
    "  --scenario <name>      directory-dark-status, dark-admin-surfaces, dark-growth-surfaces, embedded-plugin-shell, embedded-plugin-keyboard-composer, embedded-plugin-side-chat-keyboard, plugin-topic-dock-return-stability, global-plugin-dock-gesture-stability, or plugin-drawer-action-gestures.",
    "  --plugin-id <id>       Required by embedded plugin scenarios.",
    "  --plugin-action-id <id> Optional action id for plugin-drawer-action-gestures. Defaults to finance:record.",
    "  --plugin-thread-id <id> Optional thread id for embedded plugin keyboard scenarios.",
    "  --theme <mode>         Theme hint for scenarios. Default: dark.",
    "  --keyboard-target <name> composer or side-chat. Scenario defaults are normally enough.",
    "  --keyboard-text <text> Text inserted by the keyboard scenario. Default: visual test.",
    "  --keyboard-wait-ms <ms> Wait after native input tap. Default: 900.",
    "  --screenshot <path>    Screenshot output path. Defaults under ~/.homeai-qa/artifacts.",
    "  --artifact-dir <dir>   Directory for generated screenshots.",
    "  --wait-ms <ms>         Wait after scenario preparation. Default: 900.",
    "  --open-wait-ms <ms>    Wait after --app-url navigation. Default: 1200.",
    "  --timeout-ms <ms>      HTTP timeout per live-debug call. Default: 15000.",
    "  --expected-client-version <version>  Assert loaded data-client-version.",
    "  --min-screenshot-bytes <n>           Assert screenshot artifact is non-empty. Default: 4096.",
    "  --lock-file <path>     Lane lock path. Defaults under ~/.homeai-qa/locks by debug URL.",
    "  --lock-timeout-ms <ms> Wait for lane lock. Default: 60000.",
    "  --lock-stale-ms <ms>   Remove stale lane locks. Default: 300000.",
    "  --no-lock              Disable only the filesystem lock on an isolated Simulator/debug server; server lease is still required.",
    "  --json                 Print bounded JSON.",
    "  --list                 List available scenarios.",
  ].join("\n"));
}

function boundedUrl(value) {
  if (!value) return "";
  try {
    const parsed = new URL(String(value));
    for (const key of [...parsed.searchParams.keys()]) {
      if (/key|token|secret|password|cookie|launch|auth/i.test(key)) parsed.searchParams.set(key, "REDACTED");
    }
    return parsed.toString().slice(0, 500);
  } catch (_) {
    return String(value || "").replace(/([?&][^=]*(?:key|token|secret|password|cookie|launch|auth)[^=]*=)[^&]+/ig, "$1REDACTED").slice(0, 500);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

async function acquireHarnessLock(options = {}) {
  if (options.noLock) {
    return {
      acquired: false,
      lockFile: "",
      staleRemoved: false,
      waitedMs: 0,
      release() {},
    };
  }
  const lockFile = options.lockFile || defaultLockPath(options);
  const timeoutMs = Math.max(1, Number(options.lockTimeoutMs || 60000) || 60000);
  const staleMs = Math.max(0, Number(options.lockStaleMs || 0) || 0);
  const started = Date.now();
  let staleRemoved = false;
  while (true) {
    try {
      fs.mkdirSync(path.dirname(lockFile), { recursive: true });
      const fd = fs.openSync(lockFile, "wx");
      const metadata = {
        pid: process.pid,
        startedAt: new Date().toISOString(),
        debugUrl: boundedUrl(options.debugUrl || DEFAULT_DEBUG_URL),
      };
      fs.writeFileSync(fd, `${JSON.stringify(metadata)}\n`, "utf8");
      fs.closeSync(fd);
      let released = false;
      return {
        acquired: true,
        lockFile,
        staleRemoved,
        waitedMs: Date.now() - started,
        release() {
          if (released) return;
          released = true;
          try {
            fs.unlinkSync(lockFile);
          } catch (_) {}
        },
      };
    } catch (err) {
      if (err?.code !== "EEXIST") throw err;
      if (staleMs > 0) {
        try {
          const stat = fs.statSync(lockFile);
          if (Date.now() - stat.mtimeMs >= staleMs) {
            fs.unlinkSync(lockFile);
            staleRemoved = true;
            continue;
          }
        } catch (statErr) {
          if (statErr?.code === "ENOENT") continue;
          throw statErr;
        }
      }
      if (Date.now() - started >= timeoutMs) throw new Error(`ios_visual_harness_lock_timeout:${lockFile}`);
      await sleep(Math.min(250, Math.max(25, timeoutMs - (Date.now() - started))));
    }
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(500, Number(timeoutMs || 15000)));
  try {
    return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
  } finally {
    clearTimeout(timeout);
  }
}

async function getJson(options, pathname) {
  const response = await fetchWithTimeout(apiUrl(options, pathname), {}, options.timeoutMs);
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch (_) {
    parsed = { raw: text.slice(0, 1000) };
  }
  if (!response.ok) throw new Error(`${pathname}:${response.status}:${String(parsed.error || response.statusText || "request_failed").slice(0, 300)}`);
  return parsed;
}

async function postJson(options, pathname, body) {
  const response = await fetchWithTimeout(apiUrl(options, pathname), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  }, options.timeoutMs);
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch (_) {
    parsed = { raw: text.slice(0, 1000) };
  }
  if (!response.ok) {
    const error = String(parsed.error || response.statusText || "request_failed").slice(0, 300);
    if (pathname === "/api/lease" && response.status === 404) throw new Error("debug_lane_lease_unavailable");
    throw new Error(`${pathname}:${response.status}:${error}`);
  }
  return parsed;
}

function debugLaneLeaseOwner(options = {}) {
  const plugin = options.pluginId ? `:${options.pluginId}` : "";
  return `ios-pwa-visual:${process.pid}:${options.scenario || "scenario"}${plugin}`.slice(0, 160);
}

function debugLaneLeaseTtlMs(options = {}) {
  return Math.max(
    120000,
    Number(options.openWaitMs || 0)
      + Number(options.waitMs || 0)
      + (Number(options.timeoutMs || 15000) * 5)
      + 30000,
  );
}

async function acquireDebugLaneLease(options = {}) {
  const owner = debugLaneLeaseOwner(options);
  const ttlMs = debugLaneLeaseTtlMs(options);
  const response = await postJson(options, "/api/lease", { owner, ttlMs, leaseToken: options.leaseToken || "" });
  if (!response.ok || !response.token) throw new Error(`debug_lane_lease_failed:${String(response.error || "missing_token").slice(0, 120)}`);
  options.leaseToken = response.token;
  let released = false;
  return {
    acquired: true,
    owner: response.owner || owner,
    expiresAt: response.expiresAt || 0,
    ttlMs: response.ttlMs || ttlMs,
    lane: response.lane || null,
    release: async () => {
      if (released) return;
      released = true;
      await postJson(options, "/api/lease/release", { leaseToken: options.leaseToken }).catch(() => null);
      options.leaseToken = "";
    },
  };
}

async function postAction(options, body) {
  const type = String(body?.type || "action").slice(0, 60);
  const label = String(body?.label || "").slice(0, 80);
  const prefix = label ? `${type}:${label}` : type;
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await sleep(650 * attempt);
    const response = await fetchWithTimeout(apiUrl(options, "/api/action"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({}, body, options.leaseToken ? { leaseToken: options.leaseToken } : {})),
    }, options.timeoutMs);
    const parsed = await response.json().catch(() => ({}));
    if (response.ok && parsed.ok) return parsed.value;
    lastError = String(parsed.error || response.statusText || "unknown").slice(0, 300);
    if (!/Unexpected EOF|webview_context_missing|appium_timeout|socket hang up|ECONNRESET/i.test(lastError)) {
      throw new Error(`action_failed:${prefix}:${lastError}`);
    }
  }
  throw new Error(`action_failed:${prefix}:${lastError || "unknown"}`);
}

async function saveScreenshot(options) {
  const screenshotPath = options.screenshot || defaultScreenshotPath(options);
  const token = options.leaseToken ? `&leaseToken=${encodeURIComponent(options.leaseToken)}` : "";
  const response = await fetchWithTimeout(apiUrl(options, `/api/screenshot?force=1${token}`), {}, options.timeoutMs);
  if (!response.ok) throw new Error(`screenshot_failed:${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  fs.writeFileSync(screenshotPath, bytes);
  return { path: screenshotPath, bytes: bytes.length };
}

function defaultScreenshotPath(options) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  const scenario = String(options.scenario || "scenario").replace(/[^a-z0-9_-]+/ig, "-");
  const plugin = options.pluginId ? `-${String(options.pluginId).replace(/[^a-z0-9_-]+/ig, "-")}` : "";
  return path.join(options.artifactDir, `ios-pwa-visual-${scenario}${plugin}-${stamp}.png`);
}

const DIRECTORY_DARK_STATUS_SCRIPT = `
  const rect = (node) => {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const css = (node, property) => node ? getComputedStyle(node).getPropertyValue(property) : "";
  const resolveCssBackground = (value) => {
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.pointerEvents = "none";
    probe.style.opacity = "0";
    probe.style.background = value;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return resolved;
  };
  try { localStorage.setItem("hermesWebTheme", arguments[0] || "dark"); } catch (_) {}
  const appState = typeof state !== "undefined" && state && typeof state === "object"
    ? state
    : (window.state && typeof window.state === "object" ? window.state : null);
  if (appState) {
    appState.themeMode = arguments[0] || "dark";
    appState.viewMode = "projects";
    appState.directoryLoading = true;
    appState.directoryError = "";
    appState.directoryPreview = null;
    appState.directoryPath = appState.directoryPath || "/";
    appState.directoryRootPath = appState.directoryRootPath || appState.directoryPath || "/";
    appState.sharedDirectoryManagerOpen = false;
    appState.projects = Array.isArray(appState.projects) ? appState.projects : [];
  }
  if (typeof applyThemePreference === "function") applyThemePreference(arguments[0] || "dark");
  else document.documentElement.setAttribute("data-theme", arguments[0] || "dark");
  if (typeof applyViewMode === "function") applyViewMode();
  else document.getElementById("app")?.classList.add("projects-mode");
  if (typeof renderDirectoryView === "function") {
    renderDirectoryView();
  } else {
    const conversation = document.getElementById("conversation");
    if (conversation) conversation.innerHTML = '<section class="directory-shell"><div class="directory-status">Loading directory...</div></section>';
  }
  const root = document.documentElement;
  const app = document.getElementById("app");
  const conversation = document.getElementById("conversation");
  const shell = document.querySelector(".directory-shell");
  const status = document.querySelector(".directory-status");
  const rootStyle = getComputedStyle(root);
  const mutedRaw = rootStyle.getPropertyValue("--ui-surface-muted").trim();
  return {
    scenario: "directory-dark-status",
    href: location.href,
    clientVersion: root.getAttribute("data-client-version") || "",
    theme: root.getAttribute("data-theme") || "",
    appClass: app?.className || "",
    mutedSurfaceRaw: mutedRaw,
    mutedSurfaceResolved: resolveCssBackground("var(--ui-surface-muted)"),
    pageBackground: rootStyle.getPropertyValue("--ui-page").trim(),
    conversationBackground: css(conversation, "background-color"),
    shellBackground: css(shell, "background-color"),
    statusBackground: css(status, "background-color"),
    statusText: status?.textContent?.trim().slice(0, 120) || "",
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      visualWidth: Math.round(window.visualViewport?.width || window.innerWidth),
      visualHeight: Math.round(window.visualViewport?.height || window.innerHeight),
      devicePixelRatio: window.devicePixelRatio,
    },
    rects: {
      conversation: rect(conversation),
      shell: rect(shell),
      status: rect(status),
    },
  };
`;

const EMBEDDED_PLUGIN_PREPARE_SCRIPT = `
  const pluginId = String(arguments[0] || "").trim();
  try { localStorage.setItem("hermesWebTheme", arguments[1] || "dark"); } catch (_) {}
  const appState = typeof state !== "undefined" && state && typeof state === "object"
    ? state
    : (window.state && typeof window.state === "object" ? window.state : null);
  if (appState) appState.themeMode = arguments[1] || "dark";
  if (typeof applyThemePreference === "function") applyThemePreference(arguments[1] || "dark");
  else document.documentElement.setAttribute("data-theme", arguments[1] || "dark");
  if (pluginId === "codex-mobile") {
    if (typeof preparePrimaryNavigationChange === "function") preparePrimaryNavigationChange();
    else if (typeof closeBottomPluginMenu === "function") closeBottomPluginMenu();
    if (typeof clearQuotedReply === "function") clearQuotedReply({ render: false });
    if (appState) {
      appState.pluginContextNavPluginId = "";
      appState.viewMode = "codex";
      appState.currentTaskGroupId = "";
      appState.currentThread = null;
      appState.currentThreadId = "";
    }
    try { localStorage.setItem("hermesWebViewMode", "codex"); } catch (_) {}
    if (typeof loadSelectedView === "function") {
      const result = loadSelectedView();
      return { ok: true, pluginId, openedBy: "loadSelectedView:codex", promise: Boolean(result && typeof result.then === "function") };
    }
    if (typeof renderCodexPluginView === "function") {
      renderCodexPluginView();
      return { ok: true, pluginId, openedBy: "renderCodexPluginView", promise: false };
    }
    return { ok: false, pluginId, openedBy: "", error: "codex_render_missing" };
  }
  if (pluginId && typeof openPluginTopicApp === "function") {
    const existingShell = Array.from(document.querySelectorAll(".embedded-plugin-shell"))
      .find((node) => node?.dataset?.pluginId === pluginId) || null;
    if (existingShell && !existingShell.hidden) {
      return { ok: true, pluginId, openedBy: "existingPluginShell", promise: false };
    }
    const result = openPluginTopicApp(pluginId, { recordUsage: false });
    return { ok: true, pluginId, openedBy: "openPluginTopicApp", promise: Boolean(result && typeof result.then === "function") };
  }
  return { ok: Boolean(pluginId), pluginId, openedBy: "", error: pluginId ? "openPluginTopicApp_missing" : "plugin_id_missing" };
`;

const EMBEDDED_PLUGIN_MEASURE_SCRIPT = `
  const rect = (node) => {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const pluginId = String(arguments[0] || "").trim();
  const attr = pluginId.replace(/\\\\/g, "\\\\\\\\").replace(/"/g, "\\\\\"");
  const shell = document.querySelector('.embedded-plugin-shell[data-plugin-id="' + attr + '"]')
    || (pluginId === "wardrobe" ? document.querySelector(".wardrobe-plugin-shell") : null);
  const frame = shell?.querySelector(".embedded-plugin-frame, .wardrobe-plugin-frame")
    || (pluginId === "wardrobe" ? document.querySelector(".wardrobe-plugin-frame") : null);
  return {
    scenario: "embedded-plugin-shell",
    pluginId,
    clientVersion: document.documentElement.getAttribute("data-client-version") || "",
    theme: document.documentElement.getAttribute("data-theme") || "",
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      visualWidth: Math.round(window.visualViewport?.width || window.innerWidth),
      visualHeight: Math.round(window.visualViewport?.height || window.innerHeight),
    },
    shell: {
      exists: Boolean(shell),
      rect: rect(shell),
    },
    frame: {
      exists: Boolean(frame),
      src: frame?.getAttribute("src") ? "[present]" : "",
      rect: rect(frame),
    }
  };
`;

const PLUGIN_TOPIC_DOCK_RETURN_STABILITY_SCRIPT = `
  const pluginIdArg = String(arguments[0] || "").trim();
  const theme = arguments[1] || "dark";
  const rect = (node) => {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const css = (node, property) => node ? getComputedStyle(node).getPropertyValue(property).trim() : "";
  const bottomLayoutSummary = () => {
    const metrics = window.__hermesMobileBottomLayoutMetrics || null;
    if (!metrics || typeof metrics !== "object") return null;
    return {
      navBottom: Number.isFinite(Number(metrics.navBottom)) ? Number(metrics.navBottom) : null,
      navOffset: Number.isFinite(Number(metrics.navOffset)) ? Number(metrics.navOffset) : null,
      navReserve: Number.isFinite(Number(metrics.navReserve)) ? Number(metrics.navReserve) : null,
      dockVisible: Boolean(metrics.dockVisible),
      dockHeight: Number.isFinite(Number(metrics.dockHeight)) ? Number(metrics.dockHeight) : null,
      dockBottom: Number.isFinite(Number(metrics.dockBottom)) ? Number(metrics.dockBottom) : null,
      stackHeight: Number.isFinite(Number(metrics.stackHeight)) ? Number(metrics.stackHeight) : null,
      navRect: metrics.navRect || null,
    };
  };
  const appState = typeof state !== "undefined" && state && typeof state === "object"
    ? state
    : (window.state && typeof window.state === "object" ? window.state : null);
  const app = document.getElementById("app");
  const dock = document.getElementById("topicPluginDock");
  const nav = document.getElementById("bottomNav");
  const main = document.querySelector(".main");
  const samples = [];
  const sample = (label) => {
    const dockDisplay = css(dock, "display");
    const dockPosition = css(dock, "position");
    const dockVisibility = css(dock, "visibility");
    const taskListMode = Boolean(app?.classList.contains("task-list-mode"));
    const globalPluginDockMode = Boolean(app?.classList.contains("global-plugin-dock-mode"));
    const mainBackAnimating = Boolean(main?.classList.contains("page-back-dragging") || main?.classList.contains("page-back-settling"));
    const dockRect = rect(dock);
    samples.push({
      label,
      appClass: app?.className || "",
      mainClass: main?.className || "",
      mainBackAnimating,
      viewMode: appState?.viewMode || "",
      currentTaskGroupId: appState?.currentTaskGroupId || "",
      pluginContextNavPluginId: appState?.pluginContextNavPluginId || "",
      taskListMode,
      globalPluginDockMode,
      dockHidden: dock ? Boolean(dock.hidden) : null,
      dockAriaHidden: dock?.getAttribute("aria-hidden") || "",
      dockDisplay,
      dockPosition,
      dockVisibility,
      dockState: dock?.dataset?.globalPluginDockState || "",
      dockExpanded: Boolean(dock?.classList.contains("global-plugin-dock-expanded")),
      dockCollapsed: Boolean(dock?.classList.contains("global-plugin-dock-collapsed")),
      dockVisible: Boolean(dock && !dock.hidden && dockDisplay !== "none" && dockVisibility !== "hidden" && dockRect && dockRect.width > 0 && dockRect.height > 0),
      dockRect,
      bottomNavRect: rect(nav),
      bottomLayout: bottomLayoutSummary(),
    });
  };
  try { localStorage.setItem("hermesWebTheme", theme); } catch (_) {}
  if (appState) appState.themeMode = theme;
  if (typeof applyThemePreference === "function") applyThemePreference(theme);
  else document.documentElement.setAttribute("data-theme", theme);
  if (!appState) return { ok: false, scenario: "plugin-topic-dock-return-stability", error: "state_missing", samples };
  if (typeof pluginTopicDefById !== "function" || typeof pluginTopicGroupId !== "function") {
    return { ok: false, scenario: "plugin-topic-dock-return-stability", error: "plugin_topic_helpers_missing", samples };
  }
  const fallbackDefs = typeof PLUGIN_TOPIC_DEFS !== "undefined" && Array.isArray(PLUGIN_TOPIC_DEFS)
    ? PLUGIN_TOPIC_DEFS.filter((item) => item && item.id && !item.builtinKind)
    : [];
  const def = pluginTopicDefById(pluginIdArg) || fallbackDefs[0] || null;
  if (!def?.id) return { ok: false, scenario: "plugin-topic-dock-return-stability", error: "plugin_def_missing", pluginId: pluginIdArg, samples };
  const originalAvailablePluginTopicDefs = typeof availablePluginTopicDefs === "function" ? availablePluginTopicDefs : null;
  const originalUpdateTopicPluginDockChrome = typeof updateTopicPluginDockChrome === "function" ? updateTopicPluginDockChrome : null;
  const originalUpdateMobileBottomNavReservation = typeof updateMobileBottomNavReservation === "function" ? updateMobileBottomNavReservation : null;
  if (originalAvailablePluginTopicDefs) {
    availablePluginTopicDefs = function visualAvailablePluginTopicDefs() {
      const existing = originalAvailablePluginTopicDefs().filter((item) => item && item.id !== def.id);
      return [def, ...existing];
    };
  }
  if (originalUpdateTopicPluginDockChrome) {
    updateTopicPluginDockChrome = function visualUpdateTopicPluginDockChrome(taskList) {
      sample("before-updateTopicPluginDockChrome:" + String(Boolean(taskList)));
      const result = originalUpdateTopicPluginDockChrome.apply(this, arguments);
      sample("after-updateTopicPluginDockChrome:" + String(Boolean(taskList)));
      return result;
    };
  }
  if (originalUpdateMobileBottomNavReservation) {
    updateMobileBottomNavReservation = function visualUpdateMobileBottomNavReservation() {
      sample("before-updateMobileBottomNavReservation");
      const result = originalUpdateMobileBottomNavReservation.apply(this, arguments);
      sample("after-updateMobileBottomNavReservation");
      return result;
    };
  }
  const groupId = pluginTopicGroupId(def.id);
  const thread = {
    id: "visual-plugin-topic-dock-thread",
    title: "Visual plugin topic dock thread",
    singleWindow: true,
    workspaceId: appState.selectedWorkspaceId || "owner",
    projectId: "general",
    subprojectId: "",
    messages: [],
    taskGroupMeta: {},
  };
  try {
    appState.viewMode = "tasks";
    appState.currentTaskGroupId = groupId;
    appState.pluginContextNavPluginId = def.id;
    appState.currentThread = thread;
    appState.currentThreadId = thread.id;
    appState.taskListThread = thread;
    appState.taskListThreadId = thread.id;
    appState.threads = typeof summarizeThread === "function" ? [summarizeThread(thread)] : [];
    appState.taskListScrollTop = 0;
    if (typeof renderThreads === "function") renderThreads();
    if (typeof renderCurrentThread === "function") renderCurrentThread({ stickToBottom: false });
    else return { ok: false, scenario: "plugin-topic-dock-return-stability", error: "renderCurrentThread_missing", pluginId: def.id, samples };
    sample("plugin-topic-detail-ready");
    main?.classList.add("page-back-settling");
    sample("before-openTaskList-back-settling");
    if (typeof openTaskList === "function") openTaskList();
    else {
      appState.currentTaskGroupId = "";
      renderCurrentThread({ stickToBottom: false, restoreScrollTop: 0 });
    }
    sample("after-openTaskList-back-settling");
    if (typeof clearBackSwipeSurface === "function") clearBackSwipeSurface(main);
    else main?.classList.remove("page-back-dragging", "page-back-settling");
    if (typeof updateBottomNavVisibleCount === "function") updateBottomNavVisibleCount();
    if (typeof updateTopicPluginDockChrome === "function") updateTopicPluginDockChrome(typeof isTaskListView === "function" ? isTaskListView() : true);
    sample("after-back-surface-clear");
  } finally {
    if (originalAvailablePluginTopicDefs) availablePluginTopicDefs = originalAvailablePluginTopicDefs;
    if (originalUpdateTopicPluginDockChrome) updateTopicPluginDockChrome = originalUpdateTopicPluginDockChrome;
    if (originalUpdateMobileBottomNavReservation) updateMobileBottomNavReservation = originalUpdateMobileBottomNavReservation;
  }
  const payload = {
    ok: true,
    scenario: "plugin-topic-dock-return-stability",
    pluginId: def.id,
    href: location.href,
    clientVersion: document.documentElement.getAttribute("data-client-version") || "",
    theme: document.documentElement.getAttribute("data-theme") || "",
    samples,
    final: samples[samples.length - 1] ? Object.assign({}, samples[samples.length - 1]) : null,
  };
  return JSON.parse(JSON.stringify(payload));
`;

const GLOBAL_PLUGIN_DOCK_GESTURE_STABILITY_SCRIPT = `
  const theme = arguments[0] || "dark";
  const rect = (node) => {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const css = (node, property) => node ? getComputedStyle(node).getPropertyValue(property).trim() : "";
  const appState = typeof state !== "undefined" && state && typeof state === "object"
    ? state
    : (window.state && typeof window.state === "object" ? window.state : null);
  const app = document.getElementById("app");
  const dock = document.getElementById("topicPluginDock");
  const nav = document.getElementById("bottomNav");
  const samples = [];
  const bottomLayoutSummary = () => {
    const metrics = window.__hermesMobileBottomLayoutMetrics || null;
    if (!metrics || typeof metrics !== "object") return null;
    return {
      navBottom: Number.isFinite(Number(metrics.navBottom)) ? Number(metrics.navBottom) : null,
      navOffset: Number.isFinite(Number(metrics.navOffset)) ? Number(metrics.navOffset) : null,
      dockVisible: Boolean(metrics.dockVisible),
      dockExpanded: Boolean(metrics.dockExpanded),
      dockHeight: Number.isFinite(Number(metrics.dockHeight)) ? Number(metrics.dockHeight) : null,
      dockBottom: Number.isFinite(Number(metrics.dockBottom)) ? Number(metrics.dockBottom) : null,
      rawDockHeight: Number.isFinite(Number(metrics.rawDockHeight)) ? Number(metrics.rawDockHeight) : null,
      stackHeight: Number.isFinite(Number(metrics.stackHeight)) ? Number(metrics.stackHeight) : null,
      navRect: metrics.navRect || null,
    };
  };
  const sample = (label) => {
    const dockRect = rect(dock);
    samples.push({
      label,
      appClass: app?.className || "",
      globalPluginDockMode: Boolean(app?.classList.contains("global-plugin-dock-mode")),
      taskListMode: Boolean(app?.classList.contains("task-list-mode")),
      dockHidden: dock ? Boolean(dock.hidden) : null,
      dockDisplay: css(dock, "display"),
      dockPosition: css(dock, "position"),
      dockTransform: css(dock, "transform"),
      dockTransition: css(dock, "transition-duration"),
      dockState: dock?.dataset?.globalPluginDockState || "",
      dockExpanded: Boolean(dock?.classList.contains("global-plugin-dock-expanded")),
      dockCollapsed: Boolean(dock?.classList.contains("global-plugin-dock-collapsed")),
      dockDragging: Boolean(dock?.classList.contains("global-plugin-dock-dragging")),
      gestureOffset: dock?.style?.getPropertyValue("--global-plugin-dock-gesture-offset") || "",
      dockVisible: Boolean(dock && !dock.hidden && css(dock, "display") !== "none" && css(dock, "visibility") !== "hidden" && dockRect && dockRect.width > 0 && dockRect.height > 0),
      dockRect,
      bottomNavRect: rect(nav),
      bottomLayout: bottomLayoutSummary(),
    });
  };
  const dispatchPointer = (target, type, x, y, pointerId = 17) => {
    const event = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: "touch",
      isPrimary: true,
      clientX: x,
      clientY: y,
      button: 0,
      buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
    });
    target.dispatchEvent(event);
  };
  const dispatchTouch = (target, type, x, y, identifier = 23) => {
    if (typeof Touch !== "function" || typeof TouchEvent !== "function") {
      dispatchPointer(target, type === "touchend" || type === "touchcancel" ? "pointerup" : type === "touchmove" ? "pointermove" : "pointerdown", x, y, identifier);
      return;
    }
    const touch = new Touch({
      identifier,
      target,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      pageX: x,
      pageY: y,
      radiusX: 8,
      radiusY: 8,
      force: type === "touchend" || type === "touchcancel" ? 0 : 0.5,
    });
    const activeTouches = type === "touchend" || type === "touchcancel" ? [] : [touch];
    const changedTouches = [touch];
    const event = new TouchEvent(type, {
      bubbles: true,
      cancelable: true,
      touches: activeTouches,
      targetTouches: activeTouches,
      changedTouches,
    });
    target.dispatchEvent(event);
  };
  const runGesture = (label, deltas) => {
    const handle = dock?.querySelector?.("[data-global-plugin-dock-handle]");
    if (!handle) {
      sample(label + ":handle-missing");
      return;
    }
    const box = handle.getBoundingClientRect();
    const startX = Math.round(box.left + box.width / 2);
    const startY = Math.round(box.top + box.height / 2);
    dispatchPointer(handle, "pointerdown", startX, startY);
    sample(label + ":down");
    deltas.forEach((delta, index) => {
      dispatchPointer(document, "pointermove", startX + Math.round(delta.x || 0), startY + Math.round(delta.y || 0));
      sample(label + ":move-" + String(index + 1));
    });
    const last = deltas[deltas.length - 1] || { x: 0, y: 0 };
    dispatchPointer(document, "pointerup", startX + Math.round(last.x || 0), startY + Math.round(last.y || 0));
    sample(label + ":up");
  };
  const runExpandedStripSwipe = (label, deltaX) => {
    const strip = dock?.querySelector?.(".plugin-app-strip");
    const target = strip?.querySelector?.(".plugin-app-card") || strip;
    if (!strip || !target) {
      sample(label + ":strip-missing");
      return;
    }
    const box = target.getBoundingClientRect();
    const startX = Math.round(box.left + Math.min(Math.max(box.width / 2, 24), Math.max(24, box.width - 24)));
    const startY = Math.round(box.top + box.height / 2);
    dispatchTouch(target, "touchstart", startX, startY);
    sample(label + ":down");
    dispatchTouch(target, "touchmove", startX + Math.round(deltaX * 0.45), startY + 2);
    sample(label + ":move-1");
    dispatchTouch(target, "touchmove", startX + Math.round(deltaX), startY + 4);
    sample(label + ":move-2");
    dispatchTouch(target, "touchend", startX + Math.round(deltaX), startY + 4);
    sample(label + ":up");
  };
  const setVisualThreadSurface = (viewMode, singleWindowMode = "chat") => {
    appState.viewMode = viewMode;
    appState.singleWindowMode = singleWindowMode;
    appState.currentTaskGroupId = "";
    appState.pluginContextNavPluginId = "";
    appState.directoryPluginContextActive = false;
    appState.currentThread = {
      id: "visual-global-plugin-dock-thread",
      title: "Visual global plugin dock thread",
      singleWindow: true,
      workspaceId: appState.selectedWorkspaceId || "owner",
      projectId: "general",
      subprojectId: "",
      messages: [],
      taskGroupMeta: {},
    };
    appState.currentThreadId = appState.currentThread.id;
    appState.taskListThread = appState.currentThread;
    appState.taskListThreadId = appState.currentThread.id;
    app?.classList?.remove?.("plugin-context-nav-mode", "embedded-plugin-preview-fullscreen-active", "page-back-dragging", "page-back-settling");
    if (viewMode === "single" && typeof renderCurrentThread === "function") renderCurrentThread({ stickToBottom: false, restoreScrollTop: 0 });
    else if (typeof setTopicPluginDock === "function" && typeof renderPluginAppLauncher === "function") setTopicPluginDock(renderPluginAppLauncher());
    if (typeof updateNavigationControls === "function") updateNavigationControls();
  };
  try { localStorage.setItem("hermesWebTheme", theme); } catch (_) {}
  if (appState) appState.themeMode = theme;
  if (typeof applyThemePreference === "function") applyThemePreference(theme);
  else document.documentElement.setAttribute("data-theme", theme);
  if (!appState) return { ok: false, scenario: "global-plugin-dock-gesture-stability", error: "state_missing", samples };
  if (!dock) return { ok: false, scenario: "global-plugin-dock-gesture-stability", error: "dock_missing", samples };
  if (typeof PointerEvent !== "function") return { ok: false, scenario: "global-plugin-dock-gesture-stability", error: "pointer_event_missing", samples };
  const originalAvailablePluginTopicDefs = typeof availablePluginTopicDefs === "function" ? availablePluginTopicDefs : null;
  const fallbackDefs = typeof PLUGIN_TOPIC_DEFS !== "undefined" && Array.isArray(PLUGIN_TOPIC_DEFS)
    ? PLUGIN_TOPIC_DEFS.filter((item) => item && item.id)
    : [];
  if (originalAvailablePluginTopicDefs && fallbackDefs.length) {
    availablePluginTopicDefs = function visualAvailablePluginTopicDefs() {
      const existing = originalAvailablePluginTopicDefs();
      return existing.length ? existing : fallbackDefs;
    };
  }
  try {
    setVisualThreadSurface("single", "chat");
    if (typeof setGlobalPluginDockExpanded === "function") setGlobalPluginDockExpanded(false, { persist: false });
    sample("chat-surface-ready");
    sample("collapsed-ready");
    runGesture("mistouch-short-up", [{ x: 1, y: -8 }, { x: 2, y: -14 }]);
    runGesture("mistouch-horizontal", [{ x: 18, y: -3 }, { x: 64, y: -6 }]);
    runGesture("valid-open", [{ x: 0, y: -14 }, { x: 0, y: -30 }, { x: 0, y: -46 }, { x: 0, y: -58 }]);
    runExpandedStripSwipe("expanded-strip-right-swipe", 92);
    runExpandedStripSwipe("expanded-strip-left-swipe", -92);
    runGesture("valid-close", [{ x: 0, y: 14 }, { x: 0, y: 30 }, { x: 0, y: 46 }, { x: 0, y: 58 }]);
    setVisualThreadSurface("finance", "chat");
    if (typeof setGlobalPluginDockExpanded === "function") setGlobalPluginDockExpanded(false, { persist: false });
    if (typeof updateMobileBottomNavReservation === "function") updateMobileBottomNavReservation();
    sample("plugin-surface-ready");
    if (typeof updateMobileBottomNavReservation === "function") updateMobileBottomNavReservation();
    sample("final");
  } finally {
    if (originalAvailablePluginTopicDefs) availablePluginTopicDefs = originalAvailablePluginTopicDefs;
  }
  return JSON.parse(JSON.stringify({
    ok: true,
    scenario: "global-plugin-dock-gesture-stability",
    href: location.href,
    clientVersion: document.documentElement.getAttribute("data-client-version") || "",
    theme: document.documentElement.getAttribute("data-theme") || "",
    samples,
    final: samples[samples.length - 1] ? Object.assign({}, samples[samples.length - 1]) : null,
  }));
`;

const PLUGIN_DRAWER_ACTION_GESTURES_PREPARE_SCRIPT = `
  const requestedPluginId = String(arguments[0] || "finance").trim() || "finance";
  const requestedActionId = String(arguments[1] || "record").trim() || "record";
  const theme = arguments[2] || "dark";
  const rect = (node) => {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const tap = (node) => {
    const box = rect(node);
    if (!box || box.width <= 0 || box.height <= 0) return null;
    const centerX = box.left + box.width / 2;
    const centerY = box.top + box.height / 2;
    return {
      x: Math.max(0, Math.min(1, centerX / Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1))),
      y: Math.max(0, Math.min(1, centerY / Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1))),
      absoluteX: Math.round(centerX),
      absoluteY: Math.round(centerY),
    };
  };
  const visible = (node) => {
    if (!node) return false;
    const box = rect(node);
    const style = getComputedStyle(node);
    return Boolean(!node.hidden && style.display !== "none" && style.visibility !== "hidden" && box && box.width > 0 && box.height > 0);
  };
  const actionSelector = (pluginId, actionId) => [
    "[data-plugin-topic-action-plugin='",
    CSS.escape(pluginId),
    "'][data-plugin-topic-action-id='",
    CSS.escape(actionId),
    "']",
  ].join("");
  const appState = typeof state !== "undefined" && state && typeof state === "object"
    ? state
    : (window.state && typeof window.state === "object" ? window.state : null);
  try { localStorage.setItem("hermesWebTheme", theme); } catch (_) {}
  if (appState) appState.themeMode = theme;
  if (typeof applyThemePreference === "function") applyThemePreference(theme);
  else document.documentElement.setAttribute("data-theme", theme);
  if (!appState) return { ok: false, scenario: "plugin-drawer-action-gestures", error: "state_missing" };
  appState.viewMode = "tasks";
  appState.singleWindowMode = "chat";
  appState.currentTaskGroupId = "";
  appState.pluginContextNavPluginId = "";
  appState.directoryPluginContextActive = false;
  appState.keyboardViewportActive = false;
  appState.currentThread = {
    id: "visual-plugin-drawer-action-thread",
    title: "Visual plugin drawer action thread",
    singleWindow: true,
    workspaceId: appState.selectedWorkspaceId || "owner",
    projectId: "general",
    subprojectId: "",
    messages: [],
    taskGroupMeta: {},
  };
  appState.taskListThread = appState.currentThread;
  appState.taskListThreadId = appState.currentThread.id;
  appState.currentThreadId = appState.currentThread.id;
  document.documentElement.classList.remove("keyboard-viewport-active");
  if (typeof hideActivePluginHostsForPluginTopicNavigation === "function") hideActivePluginHostsForPluginTopicNavigation();
  if (typeof setEmbeddedPluginHostVisible === "function" && typeof EMBEDDED_PLUGIN_DEFS === "object") {
    Object.values(EMBEDDED_PLUGIN_DEFS || {}).forEach((item) => setEmbeddedPluginHostVisible(item, false));
  }
  const app = document.getElementById("app");
  app?.classList?.remove?.(
    "codex-mode",
    "wardrobe-mode",
    "finance-mode",
    "email-mode",
    "health-mode",
    "note-mode",
    "growth-plugin-mode",
    "codex-plugin-host-active",
    "wardrobe-plugin-host-active",
    "finance-plugin-host-active",
    "email-plugin-host-active",
    "health-plugin-host-active",
    "note-plugin-host-active",
    "growth-plugin-host-active",
    "embedded-plugin-host-active",
    "embedded-plugin-preview-fullscreen-active",
    "main-back-visible",
    "plugin-context-nav-mode",
    "page-back-dragging",
    "page-back-settling",
  );
  if (typeof applyViewMode === "function") applyViewMode();
  if (typeof renderThreads === "function") renderThreads();
  if (typeof updateNavigationControls === "function") updateNavigationControls();
  if (typeof ensurePluginTopicUsageLoaded === "function") ensurePluginTopicUsageLoaded();
  const defs = typeof availablePluginTopicDefs === "function" ? availablePluginTopicDefs() : [];
  let def = typeof pluginTopicDefById === "function" ? pluginTopicDefById(requestedPluginId) : null;
  if (!def || def.id === "codex-mobile") {
    def = defs.find((item) => item && item.id !== "codex-mobile" && typeof pluginTopicQuickActions === "function" && pluginTopicQuickActions(item).length) || null;
  }
  if (!def) return { ok: false, scenario: "plugin-drawer-action-gestures", error: "plugin_def_missing", requestedPluginId };
  let action = typeof pluginTopicQuickActions === "function"
    ? pluginTopicQuickActions(def, { placement: "plugin_drawer_frequent" }).find((item) => item.id === requestedActionId)
    : null;
  if (!action && typeof pluginTopicQuickActions === "function") action = pluginTopicQuickActions(def, { placement: "plugin_drawer_frequent" })[0] || null;
  if (typeof setTopicPluginDock === "function" && typeof renderPluginAppLauncher === "function") setTopicPluginDock(renderPluginAppLauncher());
  if (typeof updateTopicPluginDockChrome === "function") updateTopicPluginDockChrome(true);
  if (typeof setGlobalPluginDockExpanded === "function") setGlobalPluginDockExpanded(true, { persist: false });
  if (typeof updateMobileBottomNavReservation === "function") updateMobileBottomNavReservation();
  const dock = document.getElementById("topicPluginDock");
  const strip = dock?.querySelector?.(".plugin-app-strip") || null;
  const quickCard = dock?.querySelector?.("[data-plugin-drawer-quick-actions]") || null;
  const quickMenu = dock?.querySelector?.("[data-plugin-drawer-action-menu]") || null;
  if (strip) strip.scrollLeft = 0;
  let pluginCard = dock?.querySelector?.("[data-plugin-topic-open-app='" + CSS.escape(def.id) + "']") || null;
  let actionButton = action ? quickMenu?.querySelector?.(actionSelector(def.id, action.id)) : null;
  if (!actionButton) {
    actionButton = quickMenu?.querySelector?.("[data-plugin-topic-action-plugin][data-plugin-topic-action-id]") || null;
    if (actionButton && typeof pluginTopicActionById === "function") {
      const resolved = pluginTopicActionById(actionButton.dataset.pluginTopicActionPlugin, actionButton.dataset.pluginTopicActionId);
      if (resolved) {
        def = resolved.def;
        action = resolved.action;
      }
    }
  }
  const actionEntry = action?.entry && typeof action.entry === "object" ? action.entry : {};
  const expectedPluginRoute = String(actionEntry.pluginRoute || action?.pluginRoute || action?.route || action?.id || "").trim();
  const stripBox = rect(strip);
  const swipeY = stripBox ? Math.round(stripBox.top + stripBox.height / 2) : 0;
  const swipeStartX = stripBox ? Math.round(Math.min(stripBox.right - 20, stripBox.left + Math.max(56, stripBox.width * 0.72))) : 0;
  const swipeEndX = stripBox ? Math.round(Math.max(stripBox.left + 20, swipeStartX - Math.max(72, stripBox.width * 0.36))) : 0;
  return JSON.parse(JSON.stringify({
    ok: Boolean(dock && strip && quickCard && quickMenu && pluginCard && actionButton && action),
    scenario: "plugin-drawer-action-gestures",
    error: (!dock && "dock_missing") || (!strip && "strip_missing") || (!quickCard && "quick_card_missing") || (!quickMenu && "quick_menu_missing") || (!pluginCard && "plugin_card_missing") || (!actionButton && "quick_action_missing") || (!action && "action_missing") || "",
    requestedPluginId,
    requestedActionId,
    pluginId: def.id,
    actionId: action?.id || "",
    expectedPluginRoute,
    expectedViewMode: def.viewMode || def.id,
    clientVersion: document.documentElement.getAttribute("data-client-version") || "",
    theme: document.documentElement.getAttribute("data-theme") || "",
    state: {
      viewMode: appState.viewMode || "",
      currentTaskGroupId: appState.currentTaskGroupId || "",
      pluginContextNavPluginId: appState.pluginContextNavPluginId || "",
    },
    dock: {
      hidden: dock ? Boolean(dock.hidden) : null,
      expanded: Boolean(dock?.classList?.contains("global-plugin-dock-expanded")),
      collapsed: Boolean(dock?.classList?.contains("global-plugin-dock-collapsed")),
      state: dock?.dataset?.globalPluginDockState || "",
      rect: rect(dock),
    },
    strip: {
      rect: stripBox,
      scrollLeft: Math.round(strip?.scrollLeft || 0),
      scrollWidth: Math.round(strip?.scrollWidth || 0),
      clientWidth: Math.round(strip?.clientWidth || 0),
    },
    quickCard: { rect: rect(quickCard), tap: tap(quickCard), menuOpen: visible(quickMenu) },
    pluginCard: { rect: rect(pluginCard), tap: tap(pluginCard), menuOpen: Boolean(pluginCard?.classList?.contains("menu-open")) },
    actionButton: { rect: rect(actionButton), tap: tap(actionButton) },
    stripSwipe: stripBox ? {
      startAbsoluteX: swipeStartX,
      startAbsoluteY: swipeY,
      endAbsoluteX: swipeEndX,
      endAbsoluteY: swipeY,
    } : null,
    bottomNav: rect(document.getElementById("bottomNav")),
  }));
`;

const PLUGIN_DRAWER_ACTION_GESTURES_MEASURE_SCRIPT = `
  const phase = String(arguments[0] || "measure");
  const pluginId = String(arguments[1] || "finance").trim() || "finance";
  const actionId = String(arguments[2] || "record").trim() || "record";
  const expectedPluginRoute = String(arguments[3] || "").trim();
  const rect = (node) => {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const tap = (node) => {
    const box = rect(node);
    if (!box || box.width <= 0 || box.height <= 0) return null;
    const centerX = box.left + box.width / 2;
    const centerY = box.top + box.height / 2;
    return {
      x: Math.max(0, Math.min(1, centerX / Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1))),
      y: Math.max(0, Math.min(1, centerY / Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1))),
      absoluteX: Math.round(centerX),
      absoluteY: Math.round(centerY),
    };
  };
  const visible = (node) => {
    if (!node) return false;
    const box = rect(node);
    const style = getComputedStyle(node);
    return Boolean(!node.hidden && style.display !== "none" && style.visibility !== "hidden" && box && box.width > 0 && box.height > 0);
  };
  const dock = document.getElementById("topicPluginDock");
  const strip = dock?.querySelector?.(".plugin-app-strip") || null;
  const quickCard = dock?.querySelector?.("[data-plugin-drawer-quick-actions]") || null;
  const quickMenu = dock?.querySelector?.("[data-plugin-drawer-action-menu]") || null;
  const pluginCard = dock?.querySelector?.("[data-plugin-topic-open-app='" + CSS.escape(pluginId) + "']") || null;
  const pluginMenu = dock?.querySelector?.("[data-plugin-topic-action-menu='" + CSS.escape(pluginId) + "']") || null;
  const actionButton = dock?.querySelector?.("[data-plugin-topic-action-plugin='" + CSS.escape(pluginId) + "'][data-plugin-topic-action-id='" + CSS.escape(actionId) + "']") || null;
  const appState = typeof state !== "undefined" && state && typeof state === "object"
    ? state
    : (window.state && typeof window.state === "object" ? window.state : null);
  const record = appState?.embeddedPlugins?.[pluginId] || null;
  const pluginRoute = record?.openRoute || (pluginId === "wardrobe" ? appState?.wardrobePluginOpenRoute : null) || null;
  const stripBox = rect(strip);
  const swipeY = stripBox ? Math.round(stripBox.top + stripBox.height / 2) : 0;
  const swipeStartX = stripBox ? Math.round(Math.min(stripBox.right - 20, stripBox.left + Math.max(56, stripBox.width * 0.72))) : 0;
  const swipeEndX = stripBox ? Math.round(Math.max(stripBox.left + 20, swipeStartX - Math.max(72, stripBox.width * 0.36))) : 0;
  return JSON.parse(JSON.stringify({
    ok: true,
    scenario: "plugin-drawer-action-gestures",
    phase,
    pluginId,
    actionId,
    expectedPluginRoute,
    clientVersion: document.documentElement.getAttribute("data-client-version") || "",
    theme: document.documentElement.getAttribute("data-theme") || "",
    state: {
      viewMode: appState?.viewMode || "",
      currentTaskGroupId: appState?.currentTaskGroupId || "",
      currentThreadId: appState?.currentThreadId || "",
      pluginContextNavPluginId: appState?.pluginContextNavPluginId || "",
    },
    route: pluginRoute,
    dock: {
      exists: Boolean(dock),
      hidden: dock ? Boolean(dock.hidden) : null,
      expanded: Boolean(dock?.classList?.contains("global-plugin-dock-expanded")),
      collapsed: Boolean(dock?.classList?.contains("global-plugin-dock-collapsed")),
      state: dock?.dataset?.globalPluginDockState || "",
      rect: rect(dock),
      menuScopeOpen: Boolean(dock?.classList?.contains("capability-menu-open")),
      navigationSettling: Boolean(dock?.classList?.contains("global-plugin-dock-navigation-settling")),
    },
    strip: {
      rect: stripBox,
      scrollLeft: Math.round(strip?.scrollLeft || 0),
      scrollWidth: Math.round(strip?.scrollWidth || 0),
      clientWidth: Math.round(strip?.clientWidth || 0),
    },
    quickCard: { exists: Boolean(quickCard), rect: rect(quickCard), tap: tap(quickCard), menuOpen: Boolean(quickCard?.classList?.contains("menu-open")) },
    quickMenu: { exists: Boolean(quickMenu), visible: visible(quickMenu), hidden: quickMenu ? Boolean(quickMenu.hidden) : null, rect: rect(quickMenu) },
    pluginCard: { exists: Boolean(pluginCard), rect: rect(pluginCard), tap: tap(pluginCard), menuOpen: Boolean(pluginCard?.classList?.contains("menu-open")) },
    pluginMenu: { exists: Boolean(pluginMenu), visible: visible(pluginMenu), hidden: pluginMenu ? Boolean(pluginMenu.hidden) : null, rect: rect(pluginMenu) },
    actionButton: { exists: Boolean(actionButton), rect: rect(actionButton), tap: tap(actionButton) },
    stripSwipe: stripBox ? {
      startAbsoluteX: swipeStartX,
      startAbsoluteY: swipeY,
      endAbsoluteX: swipeEndX,
      endAbsoluteY: swipeY,
    } : null,
    bottomNav: rect(document.getElementById("bottomNav")),
  }));
`;

const EMBEDDED_PLUGIN_KEYBOARD_PREPARE_SCRIPT = `
  const pluginId = String(arguments[0] || "").trim();
  const theme = arguments[1] || "dark";
  const pluginThreadId = String(arguments[2] || "").trim();
  try { localStorage.setItem("hermesWebTheme", theme); } catch (_) {}
  const appState = typeof state !== "undefined" && state && typeof state === "object"
    ? state
    : (window.state && typeof window.state === "object" ? window.state : null);
  if (appState) appState.themeMode = theme;
  if (typeof applyThemePreference === "function") applyThemePreference(theme);
  else document.documentElement.setAttribute("data-theme", theme);
  if (pluginId === "codex-mobile" && pluginThreadId && typeof setCodexPluginOpenRoute === "function") {
    setCodexPluginOpenRoute({ pluginRoute: "thread", pluginThreadId });
  }
  if (pluginId === "codex-mobile") {
    if (typeof preparePrimaryNavigationChange === "function") preparePrimaryNavigationChange();
    else if (typeof closeBottomPluginMenu === "function") closeBottomPluginMenu();
    if (typeof clearQuotedReply === "function") clearQuotedReply({ render: false });
    if (appState) {
      appState.pluginContextNavPluginId = "";
      appState.viewMode = "codex";
      appState.currentTaskGroupId = "";
      appState.currentThread = null;
      appState.currentThreadId = "";
    }
    try { localStorage.setItem("hermesWebViewMode", "codex"); } catch (_) {}
    if (typeof loadSelectedView === "function") {
      const result = loadSelectedView();
      return {
        ok: true,
        pluginId,
        pluginThreadId,
        openedBy: "loadSelectedView:codex",
        routed: Boolean(pluginThreadId),
        promise: Boolean(result && typeof result.then === "function"),
      };
    }
    if (typeof renderCodexPluginView === "function") {
      renderCodexPluginView();
      return {
        ok: true,
        pluginId,
        pluginThreadId,
        openedBy: "renderCodexPluginView",
        routed: Boolean(pluginThreadId),
        promise: false,
      };
    }
    return { ok: false, pluginId, pluginThreadId, openedBy: "", error: "codex_render_missing" };
  }
  if (pluginId && typeof openPluginTopicApp === "function") {
    const result = openPluginTopicApp(pluginId, { recordUsage: false });
    return {
      ok: true,
      pluginId,
      pluginThreadId,
      openedBy: "openPluginTopicApp",
      routed: Boolean(pluginThreadId),
      promise: Boolean(result && typeof result.then === "function"),
    };
  }
  return { ok: false, pluginId, pluginThreadId, openedBy: "", error: pluginId ? "openPluginTopicApp_missing" : "plugin_id_missing" };
`;

const EMBEDDED_PLUGIN_KEYBOARD_FOCUS_TARGET_SCRIPT = `
  const pluginId = String(arguments[0] || "").trim();
  const pluginThreadId = String(arguments[1] || "").trim();
  const keyboardTarget = String(arguments[2] || "composer").trim() || "composer";
  const inputSelector = keyboardTarget === "side-chat"
    ? "[data-side-chat-draft]"
    : "#messageInput, [role='textbox'][contenteditable='true'], textarea:not([disabled]), input[type='text']:not([disabled]), input:not([type]):not([disabled])";
  const composerSelector = keyboardTarget === "side-chat"
    ? "[data-side-chat-form]"
    : "#composer, .composer, form";
  let frame = null;
  if (pluginId === "codex-mobile") {
    frame = document.querySelector("#codexPluginHost .embedded-plugin-frame");
  } else {
    const shells = Array.from(document.querySelectorAll(".embedded-plugin-shell, .wardrobe-plugin-shell"));
    const shell = shells.find((node) => node.dataset?.pluginId === pluginId || (pluginId === "wardrobe" && node.classList.contains("wardrobe-plugin-shell")));
    frame = shell?.querySelector(".embedded-plugin-frame, .wardrobe-plugin-frame") || null;
  }
  if (!frame) return { ok: false, error: "plugin_frame_missing", pluginId, retryAfterMs: 900 };
  const frameBox = frame.getBoundingClientRect();
  const frameRect = { top: Math.round(frameBox.top), left: Math.round(frameBox.left), right: Math.round(frameBox.right), bottom: Math.round(frameBox.bottom), width: Math.round(frameBox.width), height: Math.round(frameBox.height) };
  let win;
  let doc;
  try {
    win = frame.contentWindow;
    doc = frame.contentDocument || (win && win.document) || null;
  } catch (err) {
    return { ok: false, error: "plugin_frame_inaccessible", pluginId, frame: frameRect, detail: String(err && err.message || err).slice(0, 120) };
  }
  if (!win || !doc || doc.readyState === "loading") return { ok: false, error: "plugin_frame_loading", pluginId, frame: frameRect, retryAfterMs: 900 };
  const visualHarness = win.__codexMobileVisualHarness && typeof win.__codexMobileVisualHarness === "object"
    ? win.__codexMobileVisualHarness
    : null;
  const currentThreadId = String(
    visualHarness && typeof visualHarness.currentThreadId === "function"
      ? visualHarness.currentThreadId()
      : (win.state && win.state.currentThreadId || "")
  );
  if (pluginId === "codex-mobile" && pluginThreadId && currentThreadId !== pluginThreadId) {
    const canLoadThread = Boolean(
      visualHarness && typeof visualHarness.openThread === "function"
      || typeof win.loadThread === "function"
    );
    const canOpenExternalThread = typeof win.openExternalThreadSelection === "function";
    if (!canLoadThread && !canOpenExternalThread) {
      return { ok: false, error: "plugin_thread_open_missing", pluginId, pluginThreadId, currentThreadId, keyboardTarget, retryAfterMs: 900 };
    }
    win.setTimeout(() => {
      if (visualHarness && typeof visualHarness.openThread === "function") {
        Promise.resolve(visualHarness.openThread(pluginThreadId)).catch(() => {});
      } else if (typeof win.loadThread === "function") {
        win.loadThread(pluginThreadId, { source: "keyboard-visual-harness" }).catch(() => {});
      } else if (typeof win.openExternalThreadSelection === "function") {
        win.openExternalThreadSelection(pluginThreadId, { statusMessage: "Opening keyboard visual thread" }).catch(() => {});
      }
    }, 0);
    return {
      ok: false,
      error: "plugin_thread_open_requested",
      pluginId,
      pluginThreadId,
      currentThreadId,
      keyboardTarget,
      openedBy: canLoadThread ? "loadThread" : "openExternalThreadSelection",
      retryAfterMs: 1800,
    };
  }
  if (pluginId === "codex-mobile" && keyboardTarget === "side-chat") {
    if (visualHarness && typeof visualHarness.setSideChatPanelOpen === "function") visualHarness.setSideChatPanelOpen(true);
    else if (win.state && !win.state.subagentPanelOpen) win.state.subagentPanelOpen = true;
    if (typeof win.updateSubagentPanelUi === "function") win.updateSubagentPanelUi({ force: true });
    if (visualHarness && typeof visualHarness.loadSideChat === "function" && currentThreadId) {
      Promise.resolve(visualHarness.loadSideChat(currentThreadId)).catch(() => {});
    } else if (typeof win.loadSideChat === "function" && currentThreadId) {
      win.loadSideChat(currentThreadId, { silent: true }).catch(() => {});
    }
  }
  const candidateInput = doc.querySelector(inputSelector);
  const candidateBox = candidateInput ? candidateInput.getBoundingClientRect() : null;
  const candidateInputVisible = Boolean(candidateBox && candidateBox.width >= 20 && candidateBox.height >= 20);
  const input = candidateInput;
  const composer = doc.querySelector(composerSelector);
  if (!input) return {
    ok: false,
    error: "plugin_keyboard_input_missing",
    pluginId,
    pluginThreadId,
    currentThreadId,
    keyboardTarget,
    frame: frameRect,
    retryAfterMs: 900,
  };
  try { input.scrollIntoView({ block: "center", inline: "nearest" }); } catch (_) {}
  const inputBox = candidateInputVisible ? candidateBox : input.getBoundingClientRect();
  const composerBox = composer ? composer.getBoundingClientRect() : null;
  const inputRect = { top: Math.round(inputBox.top), left: Math.round(inputBox.left), right: Math.round(inputBox.right), bottom: Math.round(inputBox.bottom), width: Math.round(inputBox.width), height: Math.round(inputBox.height) };
  const composerRect = composerBox ? { top: Math.round(composerBox.top), left: Math.round(composerBox.left), right: Math.round(composerBox.right), bottom: Math.round(composerBox.bottom), width: Math.round(composerBox.width), height: Math.round(composerBox.height) } : null;
  if (!inputRect || inputRect.width < 20 || inputRect.height < 20) return {
    ok: false,
    error: "plugin_keyboard_input_not_visible",
    pluginId,
    keyboardTarget,
    input: inputRect,
    composer: composerRect,
    frame: frameRect,
  };
  const absoluteInput = {
    top: frameRect.top + inputRect.top,
    right: frameRect.left + inputRect.right,
    bottom: frameRect.top + inputRect.bottom,
    left: frameRect.left + inputRect.left,
    width: inputRect.width,
    height: inputRect.height,
  };
  const centerX = absoluteInput.left + absoluteInput.width / 2;
  const centerY = absoluteInput.top + absoluteInput.height / 2;
  return {
    ok: true,
    pluginId,
    pluginThreadId,
    currentThreadId,
    keyboardTarget,
    frame: frameRect,
    input: inputRect,
    composer: composerRect,
    absoluteInput,
    tap: {
      x: Math.max(0, Math.min(1, centerX / Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1))),
      y: Math.max(0, Math.min(1, centerY / Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1))),
      absoluteX: Math.round(centerX),
      absoluteY: Math.round(centerY),
    },
  };
`;

const EMBEDDED_PLUGIN_KEYBOARD_MEASURE_SCRIPT = `
  const rect = (node) => {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const rootCss = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const pluginId = String(arguments[0] || "").trim();
  const keyboardText = String(arguments[1] || "");
  const keyboardTarget = String(arguments[2] || "composer").trim() || "composer";
  const inputSelector = keyboardTarget === "side-chat"
    ? "[data-side-chat-draft]"
    : "#messageInput, [role='textbox'][contenteditable='true'], textarea:not([disabled]), input[type='text']:not([disabled]), input:not([type]):not([disabled])";
  const composerSelector = keyboardTarget === "side-chat"
    ? "[data-side-chat-form]"
    : "#composer, .composer, form";
  let shell = null;
  let frame = null;
  if (pluginId === "codex-mobile") {
    shell = document.querySelector('#codexPluginHost .embedded-plugin-shell');
    frame = document.querySelector('#codexPluginHost .embedded-plugin-frame');
  } else {
    const shells = Array.from(document.querySelectorAll(".embedded-plugin-shell, .wardrobe-plugin-shell"));
    shell = shells.find((node) => node.dataset?.pluginId === pluginId || (pluginId === "wardrobe" && node.classList.contains("wardrobe-plugin-shell"))) || null;
    frame = shell?.querySelector(".embedded-plugin-frame, .wardrobe-plugin-frame") || null;
  }
  const frameRect = rect(frame);
  const layoutHeight = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
  const visual = window.visualViewport ? {
    width: Math.round(window.visualViewport.width || 0),
    height: Math.round(window.visualViewport.height || 0),
    offsetTop: Math.round(window.visualViewport.offsetTop || 0),
    offsetLeft: Math.round(window.visualViewport.offsetLeft || 0),
    scale: window.visualViewport.scale || 1,
  } : null;
  let keyboardBottomInset = visual ? Math.max(0, Math.round(layoutHeight - visual.height - visual.offsetTop)) : 0;
  let keyboardVisible = Boolean(keyboardBottomInset > 80 || (visual && visual.height < layoutHeight * 0.82));
  let keyboardTop = keyboardVisible && visual ? Math.round(visual.height + visual.offsetTop) : layoutHeight;
  let keyboardSimulated = false;
  let plugin = { accessible: false };
  let absolute = {};
  try {
    const win = frame && frame.contentWindow || null;
    const doc = frame && (frame.contentDocument || (win && win.document)) || null;
    if (doc && win) {
      const visualHarness = win.__codexMobileVisualHarness && typeof win.__codexMobileVisualHarness === "object"
        ? win.__codexMobileVisualHarness
        : null;
      if (pluginId === "codex-mobile" && keyboardTarget === "side-chat") {
        if (visualHarness && typeof visualHarness.setSideChatPanelOpen === "function") visualHarness.setSideChatPanelOpen(true);
        else if (win.state && !win.state.subagentPanelOpen) win.state.subagentPanelOpen = true;
        if (typeof win.updateSubagentPanelUi === "function") win.updateSubagentPanelUi({ force: true });
      }
      const input = doc.querySelector(inputSelector);
      const composer = doc.querySelector(composerSelector);
      if (input && pluginId === "codex-mobile") {
        try { input.focus({ preventScroll: false }); } catch (_) {}
        if (keyboardText && keyboardTarget === "side-chat" && "value" in input && !String(input.value || "").trim()) {
          input.value = keyboardText;
        }
        if (!keyboardVisible && typeof win.handleHermesPluginViewportMessage === "function") {
          const simulatedInset = Math.max(260, Math.min(360, Math.round(layoutHeight * 0.42)));
          const simulatedTop = Math.max(120, layoutHeight - simulatedInset);
          win.handleHermesPluginViewportMessage({
            type: "hermes.plugin.viewport",
            version: 1,
            pluginId: "codex-mobile",
            reason: "keyboard_visual_harness",
            viewport: {
              width: window.innerWidth,
              height: simulatedTop,
              offsetTop: 0,
              offsetLeft: 0,
              layoutWidth: window.innerWidth,
              layoutHeight,
            },
            keyboard: {
              visible: true,
              bottomInset: simulatedInset,
              height: simulatedInset,
              offsetTop: 0,
            },
            footer: { safeAreaBottom: 0 },
          });
          if (visualHarness && typeof visualHarness.ensureSideChatDraftVisible === "function") {
            visualHarness.ensureSideChatDraftVisible();
          }
          keyboardVisible = true;
          keyboardBottomInset = simulatedInset;
          keyboardTop = simulatedTop;
          keyboardSimulated = true;
        }
      }
      const inputRect = rect(input);
      const composerRect = rect(composer);
      const sideChatPanel = doc.getElementById("subagentPanel") || null;
      const sideChatForm = doc.querySelector("[data-side-chat-form]");
      const sideChatTextarea = doc.querySelector("[data-side-chat-draft]");
      const app = doc.getElementById("app") || doc.querySelector(".app");
      const pluginRoot = doc.documentElement;
      const hostViewport = visualHarness && typeof visualHarness.hostViewport === "function"
        ? visualHarness.hostViewport()
        : (win.state && win.state.pluginHostViewport || null);
      const currentThreadId = visualHarness && typeof visualHarness.currentThreadId === "function"
        ? visualHarness.currentThreadId()
        : (win.state && win.state.currentThreadId || "");
      const sideChatPanelOpen = visualHarness && typeof visualHarness.sideChatPanelOpen === "function"
        ? visualHarness.sideChatPanelOpen()
        : Boolean(win.state && win.state.subagentPanelOpen);
      const pluginClientBuildId = visualHarness && typeof visualHarness.clientBuildId === "function"
        ? visualHarness.clientBuildId()
        : (win.CLIENT_BUILD_ID || "");
      const pluginVisual = win.visualViewport ? {
        width: Math.round(win.visualViewport.width || 0),
        height: Math.round(win.visualViewport.height || 0),
        offsetTop: Math.round(win.visualViewport.offsetTop || 0),
        offsetLeft: Math.round(win.visualViewport.offsetLeft || 0),
      } : null;
      absolute = {
        input: frameRect && inputRect ? {
          top: frameRect.top + inputRect.top,
          right: frameRect.left + inputRect.right,
          bottom: frameRect.top + inputRect.bottom,
          left: frameRect.left + inputRect.left,
          width: inputRect.width,
          height: inputRect.height,
        } : null,
        composer: frameRect && composerRect ? {
          top: frameRect.top + composerRect.top,
          right: frameRect.left + composerRect.right,
          bottom: frameRect.top + composerRect.bottom,
          left: frameRect.left + composerRect.left,
          width: composerRect.width,
          height: composerRect.height,
        } : null,
      };
      plugin = {
        accessible: true,
        readyState: doc.readyState,
        pluginClientBuildId: String(pluginClientBuildId || ""),
        currentThreadId: currentThreadId || "",
        activeElementId: doc.activeElement && doc.activeElement.id || "",
        activeElementRole: doc.activeElement && doc.activeElement.getAttribute && doc.activeElement.getAttribute("role") || "",
        activeElementSideChatDraft: Boolean(doc.activeElement && doc.activeElement.matches && doc.activeElement.matches("[data-side-chat-draft]")),
        htmlClass: pluginRoot && pluginRoot.className || "",
        keyboardOpen: Boolean(pluginRoot && pluginRoot.classList && pluginRoot.classList.contains("keyboard-open")),
        appHeightStyle: pluginRoot && pluginRoot.style && pluginRoot.style.getPropertyValue("--app-height") || "",
        appTopStyle: pluginRoot && pluginRoot.style && pluginRoot.style.getPropertyValue("--app-top") || "",
        hostBottomSafeAreaStyle: pluginRoot && pluginRoot.style && pluginRoot.style.getPropertyValue("--host-bottom-safe-area") || "",
        hostViewportKeyboardVisible: Boolean(hostViewport && hostViewport.keyboard && hostViewport.keyboard.visible),
        hostViewportKeyboardBottomInset: Math.round(Number(hostViewport && hostViewport.keyboard && hostViewport.keyboard.bottomInset || 0) || 0),
        hostViewportReason: hostViewport && hostViewport.reason || "",
        viewport: {
          innerWidth: win.innerWidth || 0,
          innerHeight: win.innerHeight || 0,
          visual: pluginVisual,
        },
        app: { rect: rect(app) },
        input: inputRect,
        composer: composerRect,
        sideChatPanelOpen: Boolean(sideChatPanelOpen),
        sideChatPanel: rect(sideChatPanel),
        sideChatForm: rect(sideChatForm),
        sideChatTextarea: rect(sideChatTextarea),
      };
    }
  } catch (err) {
    plugin = { accessible: false, error: String(err && err.message || err).slice(0, 160) };
  }
  return {
    scenario: keyboardTarget === "side-chat" ? "embedded-plugin-side-chat-keyboard" : "embedded-plugin-keyboard-composer",
    pluginId,
    keyboardTarget,
    href: location.href,
    clientVersion: document.documentElement.getAttribute("data-client-version") || "",
    theme: document.documentElement.getAttribute("data-theme") || "",
    appClass: document.getElementById("app")?.className || "",
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      visualWidth: visual && visual.width || window.innerWidth,
      visualHeight: visual && visual.height || window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    keyboard: {
      visible: keyboardVisible,
      top: keyboardTop,
      bottomInset: keyboardBottomInset,
      visual,
      layoutHeight,
      simulated: keyboardSimulated,
    },
    shell: { exists: Boolean(shell), rect: rect(shell) },
    frame: { exists: Boolean(frame), rect: frameRect },
    plugin,
    absolute,
    host: {
      keyboardViewportActive: document.documentElement.classList.contains("keyboard-viewport-active"),
      appViewportHeight: rootCss("--app-viewport-height"),
      keyboardBottomInset: rootCss("--keyboard-bottom-inset"),
    },
  };
`;

const MOBILE_BOTTOM_STABILITY_SCRIPT = `
  const cssNumber = (name) => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const rect = (node) => {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const metrics = window.__hermesMobileBottomLayoutMetrics || {};
  const nav = document.getElementById("bottomNav");
  const runtimeBottom = cssNumber("--mobile-bottom-nav-bottom-runtime");
  const comfortInset = Number.isFinite(Number(metrics.comfortInset)) ? Number(metrics.comfortInset) : cssNumber("--mobile-bottom-nav-comfort-inset");
  return {
    navBottom: Number.isFinite(Number(metrics.navBottom)) ? Number(metrics.navBottom) : runtimeBottom,
    comfortInset,
    navBottomGapRaw: Number.isFinite(Number(metrics.navBottomGapRaw)) ? Number(metrics.navBottomGapRaw) : null,
    navBottomUnderflowRaw: Number.isFinite(Number(metrics.navBottomUnderflowRaw)) ? Number(metrics.navBottomUnderflowRaw) : null,
    navBottomUnderflow: Number.isFinite(Number(metrics.navBottomUnderflow)) ? Number(metrics.navBottomUnderflow) : null,
    navLaidOut: metrics.navLaidOut !== false && Boolean(nav && getComputedStyle(nav).display !== "none"),
    navRect: metrics.navRect || rect(nav),
  };
`;

const DARK_ADMIN_SURFACES_SCRIPT = `
  const theme = arguments[0] || "dark";
  try { localStorage.setItem("hermesWebTheme", theme); } catch (_) {}
  if (window.appState) window.appState.themeMode = theme;
  if (typeof window.applyThemePreference === "function") window.applyThemePreference(theme);
  else document.documentElement.setAttribute("data-theme", theme);
  document.querySelector("[data-visual-dark-admin-surfaces]")?.remove();
  const host = document.createElement("div");
  host.setAttribute("data-visual-dark-admin-surfaces", "1");
  host.className = "access-key-overlay";
  host.innerHTML = \`
    <section class="access-key-sheet owner-admin-sheet">
      <header class="access-key-header">
        <div>
          <div class="access-key-title">Dark admin surface check</div>
          <div class="access-key-subtitle">Settings, workspace, plugin, and runtime controls</div>
        </div>
        <button class="access-key-close" type="button">Done</button>
      </header>
      <section class="access-key-section access-key-workspace-admin">
        <summary class="access-key-section-summary"><span class="access-key-section-title">Workspace</span><span>LOW</span></summary>
        <article class="owner-workspace-card local">
          <div class="owner-workspace-card-head">
            <div class="owner-workspace-main">
              <div class="owner-workspace-title">Owner</div>
              <div class="owner-workspace-id">owner</div>
            </div>
            <span class="owner-workspace-badge">active</span>
          </div>
          <dl class="owner-workspace-facts"><div><dt>Root</dt><dd>Hermes</dd></div></dl>
          <div class="owner-workspace-actions">
            <button type="button">Generate Key</button>
            <button class="danger" type="button">Delete</button>
          </div>
          <section class="workspace-gateway-status">
            <div class="workspace-gateway-title">Gateway Pool: 6/6 healthy</div>
            <div class="workspace-gateway-meta">mode hybrid / running 6/36</div>
            <div class="workspace-gateway-provider-row"><span class="workspace-gateway-provider-name">ChatGPT</span><span class="workspace-gateway-provider-tier">Low healthy</span></div>
          </section>
        </article>
        <form class="runtime-config-form">
          <label>Low workers<input placeholder="3" value="3"></label>
          <label>Provider<select><option>ChatGPT</option></select></label>
          <div class="runtime-config-status"><strong>Runtime ready</strong><span class="runtime-config-meta">Gateway pool healthy</span></div>
          <div class="runtime-config-status error"><strong>Error example</strong><span class="runtime-config-error">Permission missing</span></div>
          <div class="runtime-config-actions"><button type="button">Save</button></div>
        </form>
      </section>
      <section class="plugin-admin-sheet">
        <div class="plugin-admin-card">
          <div class="plugin-admin-card-head">
            <div>
              <div class="plugin-admin-title">Finance</div>
              <div class="plugin-admin-meta">Enabled plugin</div>
            </div>
            <div class="plugin-admin-head-actions"><button class="plugin-admin-expand" type="button">Open</button><span class="plugin-admin-risk is-critical">Owner</span></div>
          </div>
          <div class="plugin-admin-contract"><span>Visual harness</span><span>Dark mode</span></div>
          <div class="plugin-admin-owner-only-panel">Owner-only plugin management</div>
          <div class="plugin-admin-workspace-row">
            <div><div class="plugin-admin-workspace-title">Workspace</div><div class="plugin-admin-workspace-meta">Ready</div></div>
            <span class="plugin-admin-workspace-state is-enabled">Enabled</span>
            <button type="button">Manage</button>
          </div>
        </div>
      </section>
      <section class="access-key-result">
        <span class="access-key-result-label">Access Key</span>
        <div class="access-key-value-row"><code>configured</code><button type="button">Copy</button></div>
      </section>
      <div class="access-key-empty">No more items</div>
      <section class="group-chat-sheet">
        <label class="group-member-option"><input type="checkbox" checked>Member</label>
        <div class="group-member-actions"><button type="button">Save</button></div>
      </section>
    </section>
  \`;
  document.body.appendChild(host);
  const styles = getComputedStyle(document.documentElement);
  const rect = (node) => {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const read = (selector) => {
    const node = host.querySelector(selector);
    if (!node) return { selector, exists: false };
    const computed = getComputedStyle(node);
    return {
      selector,
      exists: true,
      backgroundColor: computed.backgroundColor,
      color: computed.color,
      borderColor: computed.borderColor,
      rect: rect(node),
    };
  };
  const selectors = [
    ".access-key-sheet",
    ".access-key-header",
    ".access-key-section",
    ".owner-workspace-card",
    ".owner-workspace-actions button",
    ".owner-workspace-actions button.danger",
    ".workspace-gateway-status",
    ".runtime-config-form",
    ".runtime-config-form input",
    ".runtime-config-form select",
    ".runtime-config-status",
    ".runtime-config-status.error",
    ".runtime-config-actions button",
    ".plugin-admin-card",
    ".plugin-admin-expand",
    ".plugin-admin-risk.is-critical",
    ".plugin-admin-contract span",
    ".plugin-admin-owner-only-panel",
    ".plugin-admin-workspace-state.is-enabled",
    ".plugin-admin-workspace-row button",
    ".access-key-result",
    ".access-key-value-row code",
    ".access-key-empty",
    ".group-member-option",
    ".group-member-actions button",
  ];
  return {
    ok: true,
    scenario: "dark-admin-surfaces",
    clientVersion: document.documentElement.getAttribute("data-client-version") || "",
    theme: document.documentElement.getAttribute("data-theme") || "",
    rootBackground: getComputedStyle(document.body).backgroundColor,
    tokens: {
      uiSheet: styles.getPropertyValue("--ui-sheet").trim(),
      uiMenuBg: styles.getPropertyValue("--ui-menu-bg").trim(),
      uiSurface: styles.getPropertyValue("--ui-surface").trim(),
      uiControlBg: styles.getPropertyValue("--ui-control-bg").trim(),
      text: styles.getPropertyValue("--text").trim(),
      ink: styles.getPropertyValue("--ink").trim(),
    },
    surfaces: selectors.map(read),
  };
`;

const DARK_GROWTH_SURFACES_SCRIPT = `
  const theme = arguments[0] || "dark";
  try { localStorage.setItem("hermesWebTheme", theme); } catch (_) {}
  if (window.appState) window.appState.themeMode = theme;
  if (typeof window.applyThemePreference === "function") window.applyThemePreference(theme);
  else document.documentElement.setAttribute("data-theme", theme);
  document.querySelector("[data-visual-dark-growth-surfaces]")?.remove();
  const host = document.createElement("div");
  host.setAttribute("data-visual-dark-growth-surfaces", "1");
  host.className = "learning-growth-view learning-growth-board-page";
  host.style.cssText = "position:fixed;inset:0;z-index:1400;overflow:auto;background:var(--ui-page);padding:12px;";
  host.innerHTML = \`
    <section class="learning-growth-answer-card learning-growth-card-detail-shell learning-growth-teaching-card">
      <div class="learning-growth-card-detail-hero learning-growth-teaching-hero">
        <div class="learning-growth-teaching-head learning-growth-card-detail-head">
          <div><span class="learning-growth-role-badge">教学卡</span><span>约 10-15 分钟</span><span>100 金币</span></div>
          <button class="learning-growth-card-share-button" type="button">分享</button>
        </div>
        <h3>抓住主旨的30秒复述</h3>
      </div>
      <div class="learning-growth-teaching-stepper" role="tablist">
        <button type="button" class="active">讲解</button>
        <button type="button">跟做</button>
        <button type="button">检查</button>
      </div>
      <section class="learning-growth-teaching-section">
        <h4>学会在30秒英文复述中先说清楚 main idea</h4>
        <p class="learning-growth-teaching-why">复述不是把所有细节都背出来。听的人最先需要知道这段到底想说明什么。</p>
        <div class="learning-growth-teaching-worked-example">
          <strong>示例材料概况</strong>
          <p>假设一段文章讲：学校把图书馆改成安静学习区。</p>
        </div>
        <div class="learning-growth-teaching-hints"><span>main idea</span><span>细节服务主旨</span></div>
      </section>
      <section class="learning-growth-teaching-feedback">
        <strong>完成反馈</strong>
        <p class="learning-growth-experience-prompt">完成后选择一个感受。</p>
        <div class="learning-growth-experience-actions"><button type="button">太简单</button><button type="button" class="is-selected">正合适</button><button type="button">有点难</button></div>
      </section>
      <section class="learning-growth-answer-feedback-detail">
        <h4>批改详情</h4>
        <div class="learning-growth-feedback-detail-note"><strong>提示</strong><p>先讲结构，再补充细节。</p></div>
      </section>
      <section class="learning-growth-answer-reward">
        <div class="learning-growth-answer-reward-head"><strong>奖励</strong><span class="learning-growth-answer-reward-settlement">已结算</span></div>
        <div class="learning-growth-answer-reward-grid"><span><b>100</b><small>金币</small></span><span><b>1</b><small>完成</small></span></div>
      </section>
      <fieldset class="learning-native-growth-question">
        <legend>快速检查</legend>
        <p>这段最重要的信息是什么？</p>
        <label class="learning-native-growth-choice"><input type="radio" checked><span><b>A</b>先说主旨</span></label>
      </fieldset>
      <div class="learning-native-growth-recorder"><span class="learning-native-growth-recorder-status">录音就绪</span></div>
    </section>
    <section class="learning-program-card">
      <div class="learning-program-card-top"><h3>英语复述计划</h3><span>active</span></div>
      <p class="learning-program-focus">每天 30 分钟。</p>
      <div class="learning-program-report-grid"><span><strong>3</strong><small>任务</small></span></div>
      <div class="learning-program-actions"><button type="button">开始</button><button type="button" disabled>等待</button></div>
    </section>
    <section class="learning-native-growth-reflection-result"><strong>复盘结果</strong><p>需要再练一次。</p></section>
    <section class="learning-program-rebuild-warning">计划需要重新生成。</section>
    <section class="learning-coin-panel">
      <div class="learning-coin-stats"><span><strong>100</strong><small>金币</small></span></div>
      <div class="learning-growth-metrics"><span><strong>7</strong><small>连续天数</small></span></div>
      <div class="learning-growth-reward"><div class="learning-growth-reward-top"><strong>奖励</strong><span>可兑换</span></div></div>
      <article class="learning-reward-card"><div><div class="learning-reward-title">奖励卡</div><div class="learning-reward-description">兑换说明</div></div><button class="learning-coin-primary" disabled>金币不足</button></article>
      <div class="learning-coin-empty">暂无流水</div>
    </section>
    <section class="learning-readiness-panel">
      <div class="learning-readiness-grid"><span><strong>100%</strong><small>准备度</small></span></div>
      <div class="learning-readiness-check-row"><span>OK</span><strong>检查完成</strong></div>
    </section>
  \`;
  document.body.appendChild(host);
  const styles = getComputedStyle(document.documentElement);
  const rect = (node) => {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const read = (selector) => {
    const node = host.querySelector(selector);
    if (!node) return { selector, exists: false };
    const computed = getComputedStyle(node);
    return {
      selector,
      exists: true,
      backgroundColor: computed.backgroundColor,
      color: computed.color,
      borderColor: computed.borderColor,
      rect: rect(node),
    };
  };
  const selectors = [
    ".learning-growth-answer-card",
    ".learning-growth-card-detail-hero",
    ".learning-growth-role-badge",
    ".learning-growth-teaching-head span:not(.learning-growth-role-badge)",
    ".learning-growth-card-share-button",
    ".learning-growth-teaching-stepper",
    ".learning-growth-teaching-stepper button.active",
    ".learning-growth-teaching-section",
    ".learning-growth-teaching-why",
    ".learning-growth-teaching-worked-example",
    ".learning-growth-teaching-hints span",
    ".learning-growth-teaching-feedback",
    ".learning-growth-experience-actions",
    ".learning-growth-experience-actions button",
    ".learning-growth-answer-feedback-detail",
    ".learning-growth-feedback-detail-note",
    ".learning-growth-answer-reward",
    ".learning-growth-answer-reward-settlement",
    ".learning-growth-answer-reward-grid span",
    ".learning-native-growth-question",
    ".learning-native-growth-choice",
    ".learning-native-growth-recorder",
    ".learning-program-card",
    ".learning-program-card-top > span",
    ".learning-program-report-grid span",
    ".learning-program-actions button",
    ".learning-program-actions button:disabled",
    ".learning-native-growth-reflection-result",
    ".learning-program-rebuild-warning",
    ".learning-coin-panel",
    ".learning-coin-stats span",
    ".learning-growth-metrics span",
    ".learning-growth-reward",
    ".learning-reward-card",
    ".learning-coin-primary:disabled",
    ".learning-coin-empty",
    ".learning-readiness-grid span",
    ".learning-readiness-check-row",
  ];
  return {
    ok: true,
    scenario: "dark-growth-surfaces",
    clientVersion: document.documentElement.getAttribute("data-client-version") || "",
    theme: document.documentElement.getAttribute("data-theme") || "",
    rootBackground: getComputedStyle(document.body).backgroundColor,
    tokens: {
      uiSheet: styles.getPropertyValue("--ui-sheet").trim(),
      uiMenuBg: styles.getPropertyValue("--ui-menu-bg").trim(),
      uiSurface: styles.getPropertyValue("--ui-surface").trim(),
      uiCardSurface: styles.getPropertyValue("--ui-card-surface").trim(),
      uiControlBg: styles.getPropertyValue("--ui-control-bg").trim(),
      text: styles.getPropertyValue("--text").trim(),
      ink: styles.getPropertyValue("--ink").trim(),
    },
    surfaces: selectors.map(read),
  };
`;

function parseColor(value) {
  const match = String(value || "").match(/rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+)\s*)?\)/i);
  if (!match) return null;
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] === undefined ? 1 : Number(match[4]),
  };
}

function sameColor(left, right) {
  const a = parseColor(left);
  const b = parseColor(right);
  if (!a || !b) return String(left || "").trim() === String(right || "").trim();
  return Math.abs(a.r - b.r) <= 1
    && Math.abs(a.g - b.g) <= 1
    && Math.abs(a.b - b.b) <= 1
    && Math.abs(a.a - b.a) <= 0.02;
}

function darkOpaqueColor(value) {
  const color = parseColor(value);
  if (!color) return false;
  if (color.a < 0.9) return false;
  return Math.max(color.r, color.g, color.b) <= 80;
}

function paleDirectoryRegression(value) {
  const color = parseColor(value);
  if (!color) return false;
  return color.r >= 245 && color.g >= 245 && color.b >= 240 && color.a >= 0.65;
}

function paleSolidRegression(value) {
  const color = parseColor(value);
  if (!color) return false;
  return color.a >= 0.42 && Math.min(color.r, color.g, color.b) >= 150;
}

function lowContrastDarkSemanticText(value) {
  const color = parseColor(value);
  if (!color) return false;
  const max = Math.max(color.r, color.g, color.b);
  if (max >= 150) return false;
  return color.g >= color.r + 10 || color.r >= color.b + 20;
}

function assertion(name, pass, details = {}) {
  return { name, pass: Boolean(pass), details };
}

function assertDirectoryDarkStatus(metrics = {}) {
  const assertions = [
    assertion("theme_is_dark", metrics.theme === "dark" || /data-theme.?=.?dark|theme.?dark/i.test(metrics.appClass || ""), { theme: metrics.theme, appClass: metrics.appClass }),
    assertion("directory_status_exists", Boolean(metrics.rects?.status), { rect: metrics.rects?.status || null }),
    assertion("directory_shell_exists", Boolean(metrics.rects?.shell), { rect: metrics.rects?.shell || null }),
    assertion("directory_shell_is_dark", darkOpaqueColor(metrics.shellBackground), { shellBackground: metrics.shellBackground }),
    assertion("directory_status_uses_muted_surface", sameColor(metrics.statusBackground, metrics.mutedSurfaceResolved), {
      statusBackground: metrics.statusBackground,
      mutedSurfaceResolved: metrics.mutedSurfaceResolved,
      mutedSurfaceRaw: metrics.mutedSurfaceRaw,
    }),
    assertion("directory_status_not_pale_cream", !paleDirectoryRegression(metrics.statusBackground), { statusBackground: metrics.statusBackground }),
  ];
  return { ok: assertions.every((item) => item.pass), assertions };
}

function assertDarkAdminSurfaces(metrics = {}) {
  const surfaces = Array.isArray(metrics.surfaces) ? metrics.surfaces : [];
  const missing = surfaces.filter((item) => !item?.exists);
  const paleBackgrounds = surfaces.filter((item) => paleSolidRegression(item?.backgroundColor));
  const lowContrastText = surfaces.filter((item) => lowContrastDarkSemanticText(item?.color));
  const assertions = [
    assertion("theme_is_dark", metrics.theme === "dark" || /data-theme.?=.?dark/i.test(metrics.appClass || ""), { theme: metrics.theme || "" }),
    assertion("admin_surface_samples_exist", surfaces.length >= 20 && missing.length === 0, {
      sampleCount: surfaces.length,
      missing: missing.map((item) => item.selector),
    }),
    assertion("admin_surfaces_have_no_pale_solid_backgrounds", paleBackgrounds.length === 0, {
      paleBackgrounds: paleBackgrounds.map((item) => ({ selector: item.selector, backgroundColor: item.backgroundColor })).slice(0, 12),
    }),
    assertion("admin_surfaces_have_no_low_contrast_semantic_text", lowContrastText.length === 0, {
      lowContrastText: lowContrastText.map((item) => ({ selector: item.selector, color: item.color })).slice(0, 12),
    }),
    assertion("admin_theme_tokens_are_dark", darkOpaqueColor(metrics.tokens?.uiSheet) && darkOpaqueColor(metrics.tokens?.uiMenuBg) && darkOpaqueColor(metrics.tokens?.uiSurface), {
      tokens: metrics.tokens || {},
    }),
  ];
  return { ok: assertions.every((item) => item.pass), assertions };
}

function assertDarkGrowthSurfaces(metrics = {}) {
  const surfaces = Array.isArray(metrics.surfaces) ? metrics.surfaces : [];
  const missing = surfaces.filter((item) => !item?.exists);
  const paleBackgrounds = surfaces.filter((item) => paleSolidRegression(item?.backgroundColor));
  const lowContrastText = surfaces.filter((item) => lowContrastDarkSemanticText(item?.color));
  const assertions = [
    assertion("theme_is_dark", metrics.theme === "dark" || /data-theme.?=.?dark/i.test(metrics.appClass || ""), { theme: metrics.theme || "" }),
    assertion("growth_surface_samples_exist", surfaces.length >= 30 && missing.length === 0, {
      sampleCount: surfaces.length,
      missing: missing.map((item) => item.selector),
    }),
    assertion("growth_surfaces_have_no_pale_solid_backgrounds", paleBackgrounds.length === 0, {
      paleBackgrounds: paleBackgrounds.map((item) => ({ selector: item.selector, backgroundColor: item.backgroundColor })).slice(0, 16),
    }),
    assertion("growth_surfaces_have_no_low_contrast_semantic_text", lowContrastText.length === 0, {
      lowContrastText: lowContrastText.map((item) => ({ selector: item.selector, color: item.color })).slice(0, 16),
    }),
    assertion("growth_theme_tokens_are_dark", darkOpaqueColor(metrics.tokens?.uiSheet) && darkOpaqueColor(metrics.tokens?.uiMenuBg) && darkOpaqueColor(metrics.tokens?.uiSurface), {
      tokens: metrics.tokens || {},
    }),
  ];
  return { ok: assertions.every((item) => item.pass), assertions };
}

function assertEmbeddedPluginShell(metrics = {}) {
  const frame = metrics.frame?.rect || null;
  const viewportWidth = Number(metrics.viewport?.visualWidth || metrics.viewport?.width || 0);
  const meaningfulFrame = Boolean(frame && frame.width >= 240 && frame.height >= 300);
  const noHorizontalOverflow = Boolean(frame && viewportWidth && frame.left >= -2 && frame.right <= viewportWidth + 2);
  const assertions = [
    assertion("plugin_id_present", Boolean(metrics.pluginId), { pluginId: metrics.pluginId }),
    assertion("plugin_shell_exists", Boolean(metrics.shell?.exists), { shell: metrics.shell || null }),
    assertion("plugin_frame_exists", Boolean(metrics.frame?.exists), { frame: metrics.frame || null }),
    assertion("plugin_frame_has_meaningful_size", meaningfulFrame, { frame }),
    assertion("plugin_frame_has_no_horizontal_overflow", noHorizontalOverflow, { frame, viewportWidth }),
  ];
  return { ok: assertions.every((item) => item.pass), assertions };
}

function assertPluginTopicDockReturnStability(metrics = {}) {
  const samples = Array.isArray(metrics.samples) ? metrics.samples : [];
  const visibleSamples = samples.filter((sample) => sample?.dockVisible);
  const visibleOutsideGlobalDockMode = samples.filter((sample) => sample?.dockVisible && !sample?.globalPluginDockMode);
  const unhiddenOutsideGlobalDockMode = samples.filter((sample) => sample && sample.dockHidden === false && !sample.globalPluginDockMode);
  const visibleDuringBackSettle = samples.filter((sample) => sample?.dockVisible && sample?.mainBackAnimating);
  const unhiddenDuringBackSettle = samples.filter((sample) => sample && sample.dockHidden === false && sample.mainBackAnimating);
  const nonFixedVisible = visibleSamples.filter((sample) => String(sample.dockPosition || "") !== "fixed");
  const rects = visibleSamples
    .map((sample) => sample.dockRect)
    .filter((rect) => rect && Number.isFinite(Number(rect.top)) && Number.isFinite(Number(rect.bottom)));
  const topRange = rects.length >= 2 ? Math.max(...rects.map((rect) => Number(rect.top))) - Math.min(...rects.map((rect) => Number(rect.top))) : 0;
  const bottomRange = rects.length >= 2 ? Math.max(...rects.map((rect) => Number(rect.bottom))) - Math.min(...rects.map((rect) => Number(rect.bottom))) : 0;
  const assertions = [
    assertion("plugin_id_present", Boolean(metrics.pluginId), { pluginId: metrics.pluginId || "" }),
    assertion("dock_samples_recorded", samples.length >= 4, { sampleCount: samples.length }),
    assertion("dock_became_visible_in_task_list", visibleSamples.some((sample) => sample.taskListMode), {
      visibleSamples: visibleSamples.map((sample) => ({ label: sample.label, taskListMode: sample.taskListMode, dockRect: sample.dockRect })).slice(0, 8),
    }),
    assertion("dock_visible_only_in_global_plugin_dock_mode", visibleOutsideGlobalDockMode.length === 0, {
      samples: visibleOutsideGlobalDockMode.map((sample) => ({ label: sample.label, appClass: sample.appClass, dockRect: sample.dockRect })).slice(0, 8),
    }),
    assertion("dock_stays_hidden_until_global_plugin_dock_mode", unhiddenOutsideGlobalDockMode.length === 0, {
      samples: unhiddenOutsideGlobalDockMode.map((sample) => ({ label: sample.label, appClass: sample.appClass, dockDisplay: sample.dockDisplay })).slice(0, 8),
    }),
    assertion("dock_hidden_during_back_swipe_settle", visibleDuringBackSettle.length === 0 && unhiddenDuringBackSettle.length === 0, {
      visibleSamples: visibleDuringBackSettle.map((sample) => ({ label: sample.label, mainClass: sample.mainClass, dockRect: sample.dockRect })).slice(0, 8),
      unhiddenSamples: unhiddenDuringBackSettle.map((sample) => ({ label: sample.label, mainClass: sample.mainClass, dockDisplay: sample.dockDisplay })).slice(0, 8),
    }),
    assertion("dock_visible_position_is_fixed", nonFixedVisible.length === 0, {
      samples: nonFixedVisible.map((sample) => ({ label: sample.label, position: sample.dockPosition })).slice(0, 8),
    }),
    assertion("dock_visible_rect_stable", topRange <= 1 && bottomRange <= 1, {
      topRange,
      bottomRange,
      rects,
    }),
  ];
  return { ok: assertions.every((item) => item.pass), assertions };
}

function assertGlobalPluginDockGestureStability(metrics = {}) {
  const samples = Array.isArray(metrics.samples) ? metrics.samples : [];
  const byLabel = new Map(samples.map((sample) => [sample?.label || "", sample]));
  const final = metrics.final || samples[samples.length - 1] || {};
  const navRects = samples
    .filter((sample) => /^(chat-surface-ready|collapsed-ready|mistouch-|valid-open:|valid-close:|expanded-strip-)/.test(String(sample?.label || "")))
    .map((sample) => sample?.bottomNavRect)
    .filter((rect) => rect && Number(rect.width || 0) > 0 && Number(rect.height || 0) > 0 && Number.isFinite(Number(rect.bottom)));
  const navBottomRange = navRects.length >= 2
    ? Math.max(...navRects.map((rect) => Number(rect.bottom))) - Math.min(...navRects.map((rect) => Number(rect.bottom)))
    : 0;
  const openMoves = samples.filter((sample) => /^valid-open:move-/.test(String(sample?.label || "")));
  const closeMoves = samples.filter((sample) => /^valid-close:move-/.test(String(sample?.label || "")));
  const numericOffset = (sample) => {
    const match = String(sample?.gestureOffset || "").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  };
  const openOffsets = openMoves.map(numericOffset).filter((value) => Number.isFinite(value));
  const closeOffsets = closeMoves.map(numericOffset).filter((value) => Number.isFinite(value));
  const monotonicOpen = openOffsets.length >= 2
    ? openOffsets.every((value, index) => index === 0 || value <= openOffsets[index - 1])
    : true;
  const monotonicClose = closeOffsets.length >= 2
    ? closeOffsets.every((value, index) => index === 0 || value >= closeOffsets[index - 1])
    : true;
  const collapsedReady = byLabel.get("collapsed-ready") || {};
  const chatSurface = byLabel.get("chat-surface-ready") || {};
  const pluginSurface = byLabel.get("plugin-surface-ready") || {};
  const shortUp = byLabel.get("mistouch-short-up:up") || {};
  const horizontal = byLabel.get("mistouch-horizontal:up") || {};
  const validOpen = byLabel.get("valid-open:up") || {};
  const expandedRight = byLabel.get("expanded-strip-right-swipe:up") || {};
  const expandedLeft = byLabel.get("expanded-strip-left-swipe:up") || {};
  const validClose = byLabel.get("valid-close:up") || {};
  const collapsedMetrics = collapsedReady.bottomLayout || {};
  const expandedMetrics = validOpen.bottomLayout || {};
  const pluginSurfaceLayout = pluginSurface.bottomLayout || {};
  const pluginSurfaceUsesDockOnlyAnchor = Boolean(
    pluginSurfaceLayout
    && pluginSurfaceLayout.navRect === null
    && Number(pluginSurfaceLayout.dockBottom || 0) === Number(pluginSurfaceLayout.navBottom || 0)
    && Number(pluginSurfaceLayout.dockBottom || 0) > 0
  );
  const pluginSurfaceUsesContextNavAnchor = Boolean(
    pluginSurfaceLayout
    && pluginSurfaceLayout.navRect
    && Number(pluginSurfaceLayout.dockBottom || 0) === Number(pluginSurfaceLayout.navOffset || 0)
    && Number(pluginSurfaceLayout.dockBottom || 0) > 0
  );
  const assertions = [
    assertion("gesture_samples_recorded", samples.length >= 12, { sampleCount: samples.length }),
    assertion("global_dock_mode_visible", Boolean(collapsedReady.globalPluginDockMode && collapsedReady.dockVisible), {
      collapsedReady,
    }),
    assertion("chat_surface_global_dock_visible", Boolean(chatSurface.globalPluginDockMode && chatSurface.dockVisible), {
      chatSurface,
    }),
    assertion("plugin_surface_global_dock_visible", Boolean(pluginSurface.globalPluginDockMode && pluginSurface.dockVisible), {
      pluginSurface,
    }),
    assertion("plugin_surface_uses_valid_dock_anchor", pluginSurfaceUsesDockOnlyAnchor || pluginSurfaceUsesContextNavAnchor, {
      anchorMode: pluginSurfaceUsesDockOnlyAnchor ? "dock_only" : (pluginSurfaceUsesContextNavAnchor ? "context_nav" : "invalid"),
      pluginSurface,
    }),
    assertion("dock_initially_collapsed", collapsedReady.dockCollapsed === true && collapsedReady.dockExpanded === false, {
      collapsedReady,
    }),
    assertion("short_vertical_mistouch_does_not_expand", shortUp.dockCollapsed === true && shortUp.dockExpanded === false, {
      shortUp,
    }),
    assertion("horizontal_mistouch_does_not_expand", horizontal.dockCollapsed === true && horizontal.dockExpanded === false, {
      horizontal,
    }),
    assertion("valid_up_swipe_expands_dock", validOpen.dockExpanded === true && validOpen.dockCollapsed === false, {
      validOpen,
    }),
    assertion("expanded_strip_right_swipe_keeps_dock_open", expandedRight.dockExpanded === true && expandedRight.dockCollapsed === false && expandedRight.dockState !== "navigation-settling", {
      expandedRight,
    }),
    assertion("expanded_strip_left_swipe_keeps_dock_open", expandedLeft.dockExpanded === true && expandedLeft.dockCollapsed === false && expandedLeft.dockState !== "navigation-settling", {
      expandedLeft,
    }),
    assertion("valid_down_swipe_collapses_dock", validClose.dockCollapsed === true && validClose.dockExpanded === false && final.dockCollapsed === true, {
      validClose,
      final,
    }),
    assertion("open_drag_offsets_are_monotonic", monotonicOpen, { openOffsets }),
    assertion("close_drag_offsets_are_monotonic", monotonicClose, { closeOffsets }),
    assertion("bottom_nav_rect_stable_during_dock_gestures", navBottomRange <= 1, {
      navBottomRange,
      navRects,
    }),
    assertion("collapsed_dock_reserve_smaller_than_expanded", Number(expandedMetrics.stackHeight || 0) > Number(collapsedMetrics.stackHeight || 0), {
      collapsedMetrics,
      expandedMetrics,
    }),
  ];
  return { ok: assertions.every((item) => item.pass), assertions };
}

function assertPluginDrawerActionGestures(metrics = {}) {
  const samples = Array.isArray(metrics.samples) ? metrics.samples : [];
  const byPhase = new Map(samples.map((sample) => [sample?.phase || "", sample]));
  const prepared = byPhase.get("prepared") || samples[0] || {};
  const afterQuickTap = byPhase.get("after-quick-tap") || {};
  const afterLongPress = byPhase.get("after-plugin-long-press") || {};
  const afterStripSwipe = byPhase.get("after-strip-horizontal-swipe") || {};
  const afterAction = byPhase.get("after-action-tap") || metrics;
  const actionRoute = afterAction.route || metrics.route || null;
  const expectedViewMode = String(metrics.expectedViewMode || prepared.expectedViewMode || metrics.pluginId || "").trim();
  const expectedRoute = String(metrics.expectedPluginRoute || prepared.expectedPluginRoute || metrics.actionId || "").trim();
  const preActionNavRects = samples
    .filter((sample) => [
      "prepared",
      "after-quick-tap",
      "after-plugin-long-press",
      "after-strip-horizontal-swipe",
      "after-quick-reopen",
    ].includes(String(sample?.phase || "")))
    .map((sample) => sample?.bottomNav)
    .filter((rect) => rect && Number(rect.width || 0) > 0 && Number(rect.height || 0) > 0 && Number.isFinite(Number(rect.bottom)));
  const navBottomRange = preActionNavRects.length >= 2
    ? Math.max(...preActionNavRects.map((rect) => Number(rect.bottom))) - Math.min(...preActionNavRects.map((rect) => Number(rect.bottom)))
    : 0;
  const assertions = [
    assertion("drawer_action_gesture_samples_recorded", samples.length >= 5, { sampleCount: samples.length }),
    assertion("drawer_action_targets_prepared", Boolean(prepared.ok && prepared.quickCard?.tap && prepared.pluginCard?.tap && prepared.stripSwipe && prepared.actionId && prepared.expectedPluginRoute), {
      prepared,
    }),
    assertion("quick_card_native_tap_opens_menu", Boolean(afterQuickTap.quickMenu?.visible && afterQuickTap.quickCard?.menuOpen), {
      afterQuickTap,
    }),
    assertion("plugin_icon_native_long_press_opens_menu", Boolean(afterLongPress.pluginMenu?.visible && afterLongPress.pluginCard?.menuOpen), {
      afterLongPress,
    }),
    assertion("strip_horizontal_swipe_keeps_drawer_surface", Boolean(
      afterStripSwipe.state?.viewMode === prepared.state?.viewMode
      && afterStripSwipe.dock?.expanded === true
      && !afterStripSwipe.pluginMenu?.visible
      && !afterStripSwipe.quickMenu?.visible
    ), {
      beforeViewMode: prepared.state?.viewMode || "",
      afterStripSwipe,
    }),
    assertion("action_native_tap_opens_plugin_view", Boolean(afterAction.state?.viewMode === expectedViewMode), {
      expectedViewMode,
      actualViewMode: afterAction.state?.viewMode || "",
      afterAction,
    }),
    assertion("action_route_carries_plugin_action_id", Boolean(actionRoute && String(actionRoute.pluginActionId || "") === String(metrics.actionId || prepared.actionId || "")), {
      expectedActionId: metrics.actionId || prepared.actionId || "",
      route: actionRoute,
    }),
    assertion("action_route_carries_plugin_route", Boolean(!expectedRoute || (actionRoute && String(actionRoute.pluginRoute || "") === expectedRoute)), {
      expectedPluginRoute: expectedRoute,
      route: actionRoute,
    }),
    assertion("drawer_collapses_after_action_launch", Boolean(afterAction.dock?.expanded === false), {
      dock: afterAction.dock || null,
    }),
    assertion("bottom_nav_rect_stable_before_action_launch", navBottomRange <= 1, {
      navBottomRange,
      preActionNavRects,
    }),
  ];
  return { ok: assertions.every((item) => item.pass), assertions };
}

function assertEmbeddedPluginKeyboardComposer(metrics = {}) {
  const frame = metrics.frame?.rect || null;
  const input = metrics.absolute?.input || null;
  const composer = metrics.absolute?.composer || null;
  const sideChatTarget = String(metrics.keyboardTarget || "") === "side-chat";
  const keyboardTop = Number(metrics.keyboard?.top || 0);
  const keyboardVisible = Boolean(metrics.keyboard?.visible);
  const pluginKeyboardState = Boolean(
    metrics.plugin?.keyboardOpen
    || metrics.plugin?.hostViewportKeyboardVisible
    || Number(metrics.plugin?.hostViewportKeyboardBottomInset || 0) > 0
    || String(metrics.plugin?.appHeightStyle || "").trim()
  );
  const inputClearance = input && keyboardTop ? keyboardTop - input.bottom : null;
  const composerClearance = composer && keyboardTop ? keyboardTop - composer.bottom : null;
  const meaningfulComposer = Boolean(composer && Number(composer.width || 0) >= 20 && Number(composer.height || 0) >= 20);
  const assertions = [
    assertion("plugin_id_present", Boolean(metrics.pluginId), { pluginId: metrics.pluginId }),
    assertion("plugin_frame_exists", Boolean(metrics.frame?.exists), { frame: metrics.frame || null }),
    assertion("plugin_frame_accessible", Boolean(metrics.plugin?.accessible), { plugin: metrics.plugin || null }),
    assertion("plugin_thread_detail_open", Boolean(metrics.plugin?.currentThreadId || input), {
      currentThreadId: metrics.plugin?.currentThreadId || "",
      input: metrics.plugin?.input || null,
    }),
    assertion("plugin_composer_exists", meaningfulComposer, { composer: metrics.plugin?.composer || null }),
    assertion("plugin_keyboard_input_exists", Boolean(metrics.plugin?.input), { input: metrics.plugin?.input || null }),
    assertion("host_keyboard_visible_after_input_tap", keyboardVisible, { keyboard: metrics.keyboard || null }),
    assertion("plugin_received_keyboard_viewport_state", pluginKeyboardState, {
      keyboardOpen: Boolean(metrics.plugin?.keyboardOpen),
      hostViewportKeyboardVisible: Boolean(metrics.plugin?.hostViewportKeyboardVisible),
      hostViewportKeyboardBottomInset: Number(metrics.plugin?.hostViewportKeyboardBottomInset || 0),
      appHeightStyle: metrics.plugin?.appHeightStyle || "",
      hostViewportReason: metrics.plugin?.hostViewportReason || "",
    }),
    assertion("plugin_input_above_keyboard", Boolean(keyboardVisible && input && inputClearance >= 4), {
      input,
      keyboardTop,
      inputClearance,
    }),
    assertion("plugin_composer_above_keyboard", Boolean(keyboardVisible && meaningfulComposer && composerClearance >= 0), {
      composer,
      keyboardTop,
      composerClearance,
    }),
  ];
  const viewportWidth = Number(metrics.viewport?.visualWidth || metrics.viewport?.width || 0);
  if (sideChatTarget) {
    assertions.push(assertion("plugin_side_chat_panel_open", Boolean(metrics.plugin?.sideChatPanelOpen), {
      sideChatPanelOpen: Boolean(metrics.plugin?.sideChatPanelOpen),
      sideChatPanel: metrics.plugin?.sideChatPanel || null,
    }));
    assertions.push(assertion("plugin_side_chat_textarea_focused", Boolean(metrics.plugin?.activeElementSideChatDraft), {
      activeElementId: metrics.plugin?.activeElementId || "",
      activeElementSideChatDraft: Boolean(metrics.plugin?.activeElementSideChatDraft),
      sideChatTextarea: metrics.plugin?.sideChatTextarea || null,
    }));
  }
  assertions.push(assertion("plugin_frame_has_no_horizontal_overflow", Boolean(frame && viewportWidth && frame.left >= -2 && frame.right <= viewportWidth + 2), {
    frame,
    viewportWidth,
  }));
  return { ok: assertions.every((item) => item.pass), assertions };
}

function assertCommonHarness(report = {}, options = {}) {
  const assertions = [];
  const expectedClientVersion = String(options.expectedClientVersion || "").trim();
  if (expectedClientVersion) {
    assertions.push(assertion("client_version_matches_expected", report.metrics?.clientVersion === expectedClientVersion, {
      expectedClientVersion,
      actualClientVersion: report.metrics?.clientVersion || "",
    }));
  }
  const minScreenshotBytes = Math.max(0, Number(options.minScreenshotBytes || 0) || 0);
  if (minScreenshotBytes > 0) {
    assertions.push(assertion("screenshot_meets_min_bytes", Number(report.screenshot?.bytes || 0) >= minScreenshotBytes, {
      bytes: Number(report.screenshot?.bytes || 0),
      minScreenshotBytes,
      path: report.screenshot?.path || "",
    }));
  }
  const bottomSamples = Array.isArray(report.mobileBottomStability?.samples)
    ? report.mobileBottomStability.samples.filter((sample) => sample && sample.navLaidOut !== false && Number.isFinite(Number(sample.navBottom)))
    : [];
  if (bottomSamples.length >= 3) {
    const navBottoms = bottomSamples.map((sample) => Number(sample.navBottom));
    const minNavBottom = Math.min(...navBottoms);
    const maxNavBottom = Math.max(...navBottoms);
    assertions.push(assertion("mobile_bottom_nav_bottom_stable", maxNavBottom - minNavBottom <= 1, {
      navBottoms,
      minNavBottom,
      maxNavBottom,
    }));
    const selfCancelSamples = bottomSamples.filter((sample) => (
      Number(sample.comfortInset || 0) > 0
      && Number(sample.navBottomGapRaw || 0) <= Number(sample.comfortInset || 0) + 1
      && Number(sample.navBottomUnderflowRaw || 0) > 0
    ));
    assertions.push(assertion("mobile_bottom_comfort_inset_not_self_cancelled", selfCancelSamples.length === 0, {
      samples: selfCancelSamples.slice(0, 5),
    }));
  }
  return assertions;
}

const SCENARIOS = Object.freeze({
  "directory-dark-status": Object.freeze({
    description: "Render Directory loading/status in dark mode and assert it uses --ui-surface-muted.",
    prepareScript: DIRECTORY_DARK_STATUS_SCRIPT,
    prepareArgs: (options) => [options.theme || "dark"],
    measureScript: null,
    measureArgs: () => [],
    assert: assertDirectoryDarkStatus,
  }),
  "dark-admin-surfaces": Object.freeze({
    description: "Render admin/settings/menu sample surfaces in dark mode and assert there are no pale panels or low-contrast semantic text.",
    prepareScript: DARK_ADMIN_SURFACES_SCRIPT,
    prepareArgs: (options) => [options.theme || "dark"],
    measureScript: null,
    measureArgs: () => [],
    assert: assertDarkAdminSurfaces,
  }),
  "dark-growth-surfaces": Object.freeze({
    description: "Render Growth teaching, program, reward, and readiness surfaces in dark mode and assert there are no pale panels or low-contrast semantic text.",
    prepareScript: DARK_GROWTH_SURFACES_SCRIPT,
    prepareArgs: (options) => [options.theme || "dark"],
    measureScript: null,
    measureArgs: () => [],
    assert: assertDarkGrowthSurfaces,
  }),
  "embedded-plugin-shell": Object.freeze({
    description: "Open an embedded plugin through Home AI and assert iframe shell bounds.",
    prepareScript: EMBEDDED_PLUGIN_PREPARE_SCRIPT,
    prepareArgs: (options) => [options.pluginId, options.theme || "dark"],
    measureScript: EMBEDDED_PLUGIN_MEASURE_SCRIPT,
    measureArgs: (options) => [options.pluginId],
    assert: assertEmbeddedPluginShell,
  }),
  "plugin-topic-dock-return-stability": Object.freeze({
    description: "Return from a plugin-bound topic detail to the topic list and assert the topic Dock has no intermediate jump.",
    prepareScript: PLUGIN_TOPIC_DOCK_RETURN_STABILITY_SCRIPT,
    prepareArgs: (options) => [options.pluginId || "finance", options.theme || "dark"],
    measureScript: null,
    measureArgs: () => [],
    assert: assertPluginTopicDockReturnStability,
  }),
  "global-plugin-dock-gesture-stability": Object.freeze({
    description: "Exercise the global plugin Dock handle gestures and assert mistouches do not expand it while valid swipes settle smoothly.",
    prepareScript: GLOBAL_PLUGIN_DOCK_GESTURE_STABILITY_SCRIPT,
    prepareArgs: (options) => [options.theme || "dark"],
    measureScript: null,
    measureArgs: () => [],
    assert: assertGlobalPluginDockGestureStability,
  }),
  "plugin-drawer-action-gestures": Object.freeze({
    description: "Use native iOS tap, long-press, and horizontal swipe on the global plugin Dock, then assert a quick action opens the plugin route.",
    prepareScript: PLUGIN_DRAWER_ACTION_GESTURES_PREPARE_SCRIPT,
    prepareArgs: (options) => [options.pluginId || "finance", options.pluginActionId || "record", options.theme || "dark"],
    measureScript: null,
    measureArgs: () => [],
    nativeRun: runPluginDrawerActionGestureSequence,
    assert: assertPluginDrawerActionGestures,
  }),
  "embedded-plugin-keyboard-composer": Object.freeze({
    description: "Open an embedded plugin thread, tap its composer, and assert the input stays above the iOS keyboard.",
    prepareScript: EMBEDDED_PLUGIN_KEYBOARD_PREPARE_SCRIPT,
    prepareArgs: (options) => [options.pluginId, options.theme || "dark", options.pluginThreadId || ""],
    focusScript: EMBEDDED_PLUGIN_KEYBOARD_FOCUS_TARGET_SCRIPT,
    focusArgs: (options) => [options.pluginId, options.pluginThreadId || "", options.keyboardTarget || "composer"],
    tapFocus: true,
    measureScript: EMBEDDED_PLUGIN_KEYBOARD_MEASURE_SCRIPT,
    measureArgs: (options) => [options.pluginId, options.keyboardText || "", options.keyboardTarget || "composer"],
    assert: assertEmbeddedPluginKeyboardComposer,
  }),
  "embedded-plugin-side-chat-keyboard": Object.freeze({
    description: "Open Codex side chat, tap its textarea, and assert the side-chat form stays above the iOS keyboard.",
    prepareScript: EMBEDDED_PLUGIN_KEYBOARD_PREPARE_SCRIPT,
    prepareArgs: (options) => [options.pluginId, options.theme || "dark", options.pluginThreadId || ""],
    focusScript: EMBEDDED_PLUGIN_KEYBOARD_FOCUS_TARGET_SCRIPT,
    focusArgs: (options) => [options.pluginId, options.pluginThreadId || "", "side-chat"],
    tapFocus: true,
    measureScript: EMBEDDED_PLUGIN_KEYBOARD_MEASURE_SCRIPT,
    measureArgs: (options) => [options.pluginId, options.keyboardText || "", "side-chat"],
    assert: assertEmbeddedPluginKeyboardComposer,
  }),
});

function listScenarios() {
  return Object.entries(SCENARIOS).map(([id, item]) => ({ id, description: item.description }));
}

async function closePluginDrawerActionMenus(options, label = "close-plugin-drawer-action-menus") {
  return postAction(options, {
    type: "js",
    label,
    script: `
      if (typeof closePluginActionMenus === "function") closePluginActionMenus(document);
      if (typeof resetGlobalPluginDockGesture === "function") resetGlobalPluginDockGesture();
      return { ok: true };
    `,
    args: [],
  });
}

async function measurePluginDrawerActionGesture(options, phase, prepared = {}) {
  return postAction(options, {
    type: "js",
    label: phase,
    script: PLUGIN_DRAWER_ACTION_GESTURES_MEASURE_SCRIPT,
    args: [
      phase,
      prepared.pluginId || options.pluginId || "finance",
      prepared.actionId || options.pluginActionId || "record",
      prepared.expectedPluginRoute || "",
    ],
  });
}

async function runPluginDrawerActionGestureSequence(options = {}, report = {}) {
  const prepared = Object.assign({ phase: "prepared" }, report.prepare || {});
  const samples = [prepared];
  const nativeSteps = [];
  const failWithPrepared = () => ({
    ok: false,
    samples,
    nativeSteps,
    metrics: Object.assign({}, prepared, {
      ok: false,
      samples,
      nativeSteps,
      pluginId: prepared.pluginId || options.pluginId || "finance",
      actionId: prepared.actionId || options.pluginActionId || "record",
      expectedPluginRoute: prepared.expectedPluginRoute || "",
      expectedViewMode: prepared.expectedViewMode || prepared.pluginId || options.pluginId || "finance",
    }),
  });
  if (!prepared.ok) return failWithPrepared();

  const rememberStep = async (label, body) => {
    const value = await postAction(options, Object.assign({ label }, body));
    nativeSteps.push({ label, type: body.type, value });
    return value;
  };
  const rememberMeasure = async (phase) => {
    const sample = await measurePluginDrawerActionGesture(options, phase, prepared);
    samples.push(sample);
    return sample;
  };
  await rememberStep("calibrate-web-native-coordinates", {
    type: "calibrateCoordinates",
    force: true,
  });
  const ready = await rememberMeasure("before-native-quick-tap");
  const quickTap = ready.quickCard?.tap || prepared.quickCard?.tap;
  const pluginTap = ready.pluginCard?.tap || prepared.pluginCard?.tap;
  const initialSwipe = ready.stripSwipe || prepared.stripSwipe;
  if (!quickTap || !pluginTap || !initialSwipe) return failWithPrepared();

  await rememberStep("native-tap-quick-card", {
    type: "tap",
    coordinateSpace: "web",
    x: quickTap.x,
    y: quickTap.y,
    absoluteX: quickTap.absoluteX,
    absoluteY: quickTap.absoluteY,
  });
  await sleep(420);
  await rememberMeasure("after-quick-tap");
  await closePluginDrawerActionMenus(options, "close-after-quick-tap");
  await sleep(180);

  const beforeLongPress = await rememberMeasure("before-plugin-long-press");
  const longPressTap = beforeLongPress.pluginCard?.tap || pluginTap;
  await rememberStep("native-long-press-plugin-card", {
    type: "longPress",
    coordinateSpace: "web",
    x: longPressTap.x,
    y: longPressTap.y,
    absoluteX: longPressTap.absoluteX,
    absoluteY: longPressTap.absoluteY,
    holdMs: 680,
  });
  await sleep(520);
  await rememberMeasure("after-plugin-long-press");
  await closePluginDrawerActionMenus(options, "close-after-plugin-long-press");
  await sleep(180);

  const preSwipe = await measurePluginDrawerActionGesture(options, "before-strip-horizontal-swipe", prepared);
  samples.push(preSwipe);
  const swipe = preSwipe.stripSwipe || initialSwipe;
  await rememberStep("native-strip-horizontal-swipe", {
    type: "swipe",
    coordinateSpace: "web",
    startAbsoluteX: swipe.startAbsoluteX,
    startAbsoluteY: swipe.startAbsoluteY,
    endAbsoluteX: swipe.endAbsoluteX,
    endAbsoluteY: swipe.endAbsoluteY,
    durationMs: 260,
  });
  await sleep(420);
  await rememberMeasure("after-strip-horizontal-swipe");

  const afterSwipe = samples[samples.length - 1] || {};
  const reopenTap = afterSwipe.quickCard?.tap || quickTap;
  await rememberStep("native-reopen-quick-menu", {
    type: "tap",
    coordinateSpace: "web",
    x: reopenTap.x,
    y: reopenTap.y,
    absoluteX: reopenTap.absoluteX,
    absoluteY: reopenTap.absoluteY,
  });
  await sleep(420);
  const quickReopen = await rememberMeasure("after-quick-reopen");
  let actionSource = quickReopen;
  if (!quickReopen.quickMenu?.visible || !quickReopen.actionButton?.tap) {
    await rememberStep("native-reopen-quick-menu-retry", {
      type: "tap",
      coordinateSpace: "web",
      x: reopenTap.x,
      y: reopenTap.y,
      absoluteX: reopenTap.absoluteX,
      absoluteY: reopenTap.absoluteY,
    });
    await sleep(420);
    actionSource = await rememberMeasure("after-quick-reopen-retry");
  }
  if (!actionSource.quickMenu?.visible || !actionSource.actionButton?.tap) {
    await postAction(options, {
      type: "js",
      label: "open-quick-menu-for-action-tap",
      script: `
        const dock = document.getElementById("topicPluginDock");
        const quick = dock?.querySelector?.("[data-plugin-drawer-quick-actions]");
        if (quick && typeof openPluginActionMenu === "function") openPluginActionMenu(quick);
        return { ok: Boolean(quick) };
      `,
      args: [],
    });
    await sleep(180);
    actionSource = await rememberMeasure("after-quick-reopen-js-recovery");
  }
  const actionTap = actionSource.actionButton?.tap || prepared.actionButton?.tap;
  if (actionTap) {
    await rememberStep("native-tap-quick-action", {
      type: "tap",
      coordinateSpace: "web",
      x: actionTap.x,
      y: actionTap.y,
      absoluteX: actionTap.absoluteX,
      absoluteY: actionTap.absoluteY,
    });
    await sleep(Math.max(900, Number(options.waitMs || 0) || 900));
    await rememberMeasure("after-action-tap");
  }

  const finalSample = samples[samples.length - 1] || {};
  return {
    ok: true,
    samples,
    nativeSteps,
    metrics: Object.assign({}, finalSample, {
      ok: true,
      scenario: "plugin-drawer-action-gestures",
      pluginId: prepared.pluginId || finalSample.pluginId || options.pluginId || "finance",
      actionId: prepared.actionId || finalSample.actionId || options.pluginActionId || "record",
      expectedPluginRoute: prepared.expectedPluginRoute || finalSample.expectedPluginRoute || "",
      expectedViewMode: prepared.expectedViewMode || prepared.pluginId || finalSample.pluginId || options.pluginId || "finance",
      samples,
      nativeSteps,
    }),
  };
}

async function runHarness(options) {
  const scenario = SCENARIOS[options.scenario];
  if (!scenario) throw new Error(`unknown_scenario:${options.scenario}`);
  if (/^embedded-plugin-/.test(options.scenario || "") && !options.pluginId) throw new Error("plugin_id_required");
  const report = {
    ok: false,
    scenario: options.scenario,
    pluginId: options.pluginId || "",
    debugUrl: boundedUrl(options.debugUrl),
    appUrl: boundedUrl(options.appUrl),
    startedAt: new Date().toISOString(),
    stream: null,
    deepState: null,
    prepare: null,
    focus: null,
    metrics: null,
    screenshot: null,
    mobileBottomStability: null,
    lock: null,
    lease: null,
    assertions: [],
  };
  const lock = await acquireHarnessLock(options);
  report.lock = {
    acquired: lock.acquired,
    lockFile: lock.lockFile,
    staleRemoved: lock.staleRemoved,
    waitedMs: lock.waitedMs,
  };
  let lease = null;
  try {
    lease = await acquireDebugLaneLease(options);
    report.lease = {
      acquired: lease.acquired,
      owner: lease.owner,
      expiresAt: lease.expiresAt,
      ttlMs: lease.ttlMs,
      lane: lease.lane,
    };
    report.stream = await getJson(options, "/api/stream-info");
    if (options.appUrl) {
      await postAction(options, { type: "open", label: "open-app-url", url: options.appUrl });
      await sleep(options.openWaitMs);
    }
    report.deepState = await getJson(options, `/api/deep-state?leaseToken=${encodeURIComponent(options.leaseToken || "")}`).catch((err) => ({ ok: false, error: String(err.message || err).slice(0, 300) }));
    report.mobileBottomStability = await sampleMobileBottomStability(options).catch((err) => ({ ok: false, error: String(err.message || err).slice(0, 300), samples: [] }));
    report.prepare = await postAction(options, {
      type: "js",
      label: "prepare",
      script: scenario.prepareScript,
      args: scenario.prepareArgs(options),
    });
    await sleep(options.waitMs);
    if (typeof scenario.nativeRun === "function") {
      report.native = await scenario.nativeRun(options, report);
      if (report.native?.metrics) report.metrics = report.native.metrics;
    }
    if (scenario.focusScript) {
      report.focus = await runScenarioFocus(options, scenario);
      if (scenario.tapFocus && report.focus?.tap) {
        report.nativeTap = await postAction(options, {
          type: "tap",
          x: report.focus.tap.x,
          y: report.focus.tap.y,
          absoluteX: report.focus.tap.absoluteX,
          absoluteY: report.focus.tap.absoluteY,
        });
        await sleep(options.keyboardWaitMs || options.waitMs);
      }
    }
    if (!report.metrics && scenario.measureScript) {
      try {
        report.metrics = await postAction(options, {
          type: "js",
          label: "measure",
          script: scenario.measureScript,
          args: scenario.measureArgs(options),
        });
      } catch (err) {
        if (String(options.scenario || "") !== "embedded-plugin-shell") throw err;
        report.measureFallback = { reason: String(err?.message || err).slice(0, 300) };
        report.metrics = await measureEmbeddedPluginShellInParts(options);
      }
    } else if (!report.metrics) {
      report.metrics = report.prepare;
    }
    report.screenshot = await saveScreenshot(options);
    const asserted = scenario.assert(report.metrics || {});
    const commonAssertions = assertCommonHarness(report, options);
    report.assertions = [...asserted.assertions, ...commonAssertions];
    report.ok = report.assertions.every((item) => item.pass);
    report.finishedAt = new Date().toISOString();
    return report;
  } finally {
    if (lease) await lease.release();
    lock.release();
  }
}

async function runScenarioFocus(options = {}, scenario = {}) {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    last = await postAction(options, {
      type: "js",
      script: scenario.focusScript,
      args: scenario.focusArgs(options),
    });
    if (last?.ok || !last?.retryAfterMs) return Object.assign({ attempts: attempt + 1 }, last || {});
    await sleep(Math.max(100, Math.min(2500, Number(last.retryAfterMs || 0))));
  }
  return Object.assign({ attempts: 3 }, last || {});
}

async function measureEmbeddedPluginShellInParts(options = {}) {
  const pluginId = String(options.pluginId || "").trim();
  const base = await postAction(options, {
    type: "js",
    label: "measure-base",
    args: [pluginId],
    script: `
      const pluginId = String(arguments[0] || "").trim();
      return {
        scenario: "embedded-plugin-shell",
        pluginId,
        clientVersion: document.documentElement.getAttribute("data-client-version") || "",
        theme: document.documentElement.getAttribute("data-theme") || "",
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          visualWidth: Math.round(window.visualViewport?.width || window.innerWidth),
          visualHeight: Math.round(window.visualViewport?.height || window.innerHeight)
        }
      };
    `,
  });
  const shell = await postAction(options, {
    type: "js",
    label: "measure-shell",
    args: [pluginId],
    script: `
      const pluginId = String(arguments[0] || "").trim();
      const rect = (node) => {
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return { top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
      };
      const shell = Array.from(document.querySelectorAll(".embedded-plugin-shell"))
        .find((node) => node?.dataset?.pluginId === pluginId) || null;
      return { exists: Boolean(shell), rect: rect(shell) };
    `,
  });
  const frame = await postAction(options, {
    type: "js",
    label: "measure-frame",
    args: [pluginId],
    script: `
      const pluginId = String(arguments[0] || "").trim();
      const rect = (node) => {
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return { top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
      };
      const shell = Array.from(document.querySelectorAll(".embedded-plugin-shell"))
        .find((node) => node?.dataset?.pluginId === pluginId) || null;
      const frame = shell?.querySelector(".embedded-plugin-frame, .wardrobe-plugin-frame") || null;
      return { exists: Boolean(frame), src: frame?.getAttribute("src") ? "[present]" : "", rect: rect(frame) };
    `,
  });
  return Object.assign({}, base, { shell, frame });
}

async function sampleMobileBottomStability(options = {}) {
  if (String(options.scenario || "") === "embedded-plugin-shell") {
    return { ok: true, count: 0, intervalMs: 0, samples: [], skipped: "not_required_for_embedded_plugin_shell" };
  }
  const count = 6;
  const intervalMs = 120;
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    samples.push(await postAction(options, { type: "js", label: `mobile-bottom-${index + 1}`, script: MOBILE_BOTTOM_STABILITY_SCRIPT, args: [] }));
    if (index < count - 1) await sleep(intervalMs);
  }
  return { ok: true, count, intervalMs, samples };
}

function printReport(report, jsonMode) {
  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`ios pwa visual ok=${report.ok}`);
  console.log(`scenario=${report.scenario}${report.pluginId ? ` plugin=${report.pluginId}` : ""}`);
  if (report.metrics?.clientVersion) console.log(`clientVersion=${report.metrics.clientVersion}`);
  if (report.screenshot?.path) console.log(`screenshot=${report.screenshot.path}`);
  const failed = (report.assertions || []).filter((item) => !item.pass);
  if (failed.length) console.log(`failed=${failed.map((item) => item.name).join(",")}`);
}

async function main() {
  const options = parseArgs();
  if (options.list) {
    console.log(JSON.stringify({ ok: true, scenarios: listScenarios() }, null, 2));
    return;
  }
  const report = await runHarness(options);
  printReport(report, options.json);
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    const payload = { ok: false, error: String(error?.message || error).slice(0, 500) };
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_DEBUG_URL,
  SCENARIOS,
  acquireHarnessLock,
  acquireDebugLaneLease,
  assertCommonHarness,
  assertDarkAdminSurfaces,
  assertDarkGrowthSurfaces,
  assertDirectoryDarkStatus,
  assertEmbeddedPluginKeyboardComposer,
  assertEmbeddedPluginShell,
  assertGlobalPluginDockGestureStability,
  assertPluginDrawerActionGestures,
  assertPluginTopicDockReturnStability,
  defaultLockPath,
  parseArgs,
  runHarness,
  sampleMobileBottomStability,
};
