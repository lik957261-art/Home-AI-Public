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
    "  --scenario <name>      directory-dark-status, embedded-plugin-shell, embedded-plugin-keyboard-composer, embedded-plugin-side-chat-keyboard, or plugin-topic-dock-return-stability.",
    "  --plugin-id <id>       Required by embedded plugin scenarios.",
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
  const response = await fetchWithTimeout(apiUrl(options, "/api/action"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.assign({}, body, options.leaseToken ? { leaseToken: options.leaseToken } : {})),
  }, options.timeoutMs);
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok || !parsed.ok) throw new Error(`action_failed:${String(parsed.error || response.statusText || "unknown").slice(0, 300)}`);
  return parsed.value;
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
  const css = (node, property) => node ? getComputedStyle(node).getPropertyValue(property) : "";
  const pluginId = String(arguments[0] || "").trim();
  const attr = pluginId.replace(/\\\\/g, "\\\\\\\\").replace(/"/g, "\\\\\"");
  const shell = document.querySelector('.embedded-plugin-shell[data-plugin-id="' + attr + '"]')
    || (pluginId === "wardrobe" ? document.querySelector(".wardrobe-plugin-shell") : null);
  const frame = shell?.querySelector(".embedded-plugin-frame, .wardrobe-plugin-frame")
    || (pluginId === "wardrobe" ? document.querySelector(".wardrobe-plugin-frame") : null);
  const host = shell?.closest(".embedded-plugin-host, #wardrobePluginHost") || null;
  const bottomNav = document.getElementById("bottomNav");
  const app = document.getElementById("app");
  return {
    scenario: "embedded-plugin-shell",
    pluginId,
    href: location.href,
    clientVersion: document.documentElement.getAttribute("data-client-version") || "",
    theme: document.documentElement.getAttribute("data-theme") || "",
    appClass: app?.className || "",
    viewMode: (typeof state !== "undefined" && state?.viewMode) || window.state?.viewMode || "",
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      visualWidth: Math.round(window.visualViewport?.width || window.innerWidth),
      visualHeight: Math.round(window.visualViewport?.height || window.innerHeight),
      devicePixelRatio: window.devicePixelRatio,
    },
    shell: {
      exists: Boolean(shell),
      className: shell?.className || "",
      background: css(shell, "background-color"),
      rect: rect(shell),
    },
    host: {
      exists: Boolean(host),
      hidden: host ? host.hidden : null,
      className: host?.className || "",
      rect: rect(host),
    },
    frame: {
      exists: Boolean(frame),
      className: frame?.className || "",
      src: frame?.getAttribute("src") ? "[present]" : "",
      rect: rect(frame),
    },
    bottomNav: rect(bottomNav),
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
  const samples = [];
  const sample = (label) => {
    const dockDisplay = css(dock, "display");
    const dockPosition = css(dock, "position");
    const dockVisibility = css(dock, "visibility");
    const taskListMode = Boolean(app?.classList.contains("task-list-mode"));
    const dockRect = rect(dock);
    samples.push({
      label,
      appClass: app?.className || "",
      viewMode: appState?.viewMode || "",
      currentTaskGroupId: appState?.currentTaskGroupId || "",
      pluginContextNavPluginId: appState?.pluginContextNavPluginId || "",
      taskListMode,
      dockHidden: dock ? Boolean(dock.hidden) : null,
      dockAriaHidden: dock?.getAttribute("aria-hidden") || "",
      dockDisplay,
      dockPosition,
      dockVisibility,
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
    if (typeof openTaskList === "function") openTaskList();
    else {
      appState.currentTaskGroupId = "";
      renderCurrentThread({ stickToBottom: false, restoreScrollTop: 0 });
    }
    sample("after-openTaskList-return");
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
  const currentThreadId = String(win.state && win.state.currentThreadId || "");
  if (pluginId === "codex-mobile" && pluginThreadId && currentThreadId !== pluginThreadId) {
    const canLoadThread = typeof win.loadThread === "function";
    const canOpenExternalThread = typeof win.openExternalThreadSelection === "function";
    if (!canLoadThread && !canOpenExternalThread) {
      return { ok: false, error: "plugin_thread_open_missing", pluginId, pluginThreadId, currentThreadId, keyboardTarget, retryAfterMs: 900 };
    }
    win.setTimeout(() => {
      if (typeof win.loadThread === "function") {
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
    if (win.state && !win.state.subagentPanelOpen) win.state.subagentPanelOpen = true;
    if (typeof win.updateSubagentPanelUi === "function") win.updateSubagentPanelUi({ force: true });
    if (typeof win.loadSideChat === "function" && currentThreadId) {
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
      if (pluginId === "codex-mobile" && keyboardTarget === "side-chat") {
        if (win.state && !win.state.subagentPanelOpen) win.state.subagentPanelOpen = true;
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
      const hostViewport = win.state && win.state.pluginHostViewport || null;
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
        currentThreadId: win.state && win.state.currentThreadId || "",
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
        sideChatPanelOpen: Boolean(win.state && win.state.subagentPanelOpen),
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
  const visibleOutsideTaskList = samples.filter((sample) => sample?.dockVisible && !sample?.taskListMode);
  const unhiddenOutsideTaskList = samples.filter((sample) => sample && sample.dockHidden === false && !sample.taskListMode);
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
    assertion("dock_never_visible_outside_task_list_mode", visibleOutsideTaskList.length === 0, {
      samples: visibleOutsideTaskList.map((sample) => ({ label: sample.label, appClass: sample.appClass, dockRect: sample.dockRect })).slice(0, 8),
    }),
    assertion("dock_stays_hidden_until_task_list_mode", unhiddenOutsideTaskList.length === 0, {
      samples: unhiddenOutsideTaskList.map((sample) => ({ label: sample.label, appClass: sample.appClass, dockDisplay: sample.dockDisplay })).slice(0, 8),
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
      await postAction(options, { type: "open", url: options.appUrl });
      await sleep(options.openWaitMs);
    }
    report.deepState = await getJson(options, `/api/deep-state?leaseToken=${encodeURIComponent(options.leaseToken || "")}`).catch((err) => ({ ok: false, error: String(err.message || err).slice(0, 300) }));
    report.mobileBottomStability = await sampleMobileBottomStability(options).catch((err) => ({ ok: false, error: String(err.message || err).slice(0, 300), samples: [] }));
    report.prepare = await postAction(options, {
      type: "js",
      script: scenario.prepareScript,
      args: scenario.prepareArgs(options),
    });
    await sleep(options.waitMs);
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
    report.metrics = scenario.measureScript ? await postAction(options, {
      type: "js",
      script: scenario.measureScript,
      args: scenario.measureArgs(options),
    }) : report.prepare;
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

async function sampleMobileBottomStability(options = {}) {
  const count = 6;
  const intervalMs = 120;
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    samples.push(await postAction(options, { type: "js", script: MOBILE_BOTTOM_STABILITY_SCRIPT, args: [] }));
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
  assertDirectoryDarkStatus,
  assertEmbeddedPluginKeyboardComposer,
  assertEmbeddedPluginShell,
  assertPluginTopicDockReturnStability,
  defaultLockPath,
  parseArgs,
  runHarness,
  sampleMobileBottomStability,
};
