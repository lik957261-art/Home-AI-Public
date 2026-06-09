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
    theme: "dark",
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
    else if (item === "--theme") out.theme = next() || out.theme;
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
    "  --scenario <name>      directory-dark-status or embedded-plugin-shell.",
    "  --plugin-id <id>       Required by embedded-plugin-shell.",
    "  --theme <mode>         Theme hint for scenarios. Default: dark.",
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
});

function listScenarios() {
  return Object.entries(SCENARIOS).map(([id, item]) => ({ id, description: item.description }));
}

async function runHarness(options) {
  const scenario = SCENARIOS[options.scenario];
  if (!scenario) throw new Error(`unknown_scenario:${options.scenario}`);
  if (options.scenario === "embedded-plugin-shell" && !options.pluginId) throw new Error("plugin_id_required");
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
    metrics: null,
    screenshot: null,
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
    report.prepare = await postAction(options, {
      type: "js",
      script: scenario.prepareScript,
      args: scenario.prepareArgs(options),
    });
    await sleep(options.waitMs);
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
  assertEmbeddedPluginShell,
  defaultLockPath,
  parseArgs,
  runHarness,
};
