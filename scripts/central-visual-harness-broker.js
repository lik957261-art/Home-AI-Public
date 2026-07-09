"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_BASE_URL = "http://127.0.0.1:8797";
const DEFAULT_DEBUG_URL = "http://127.0.0.1:19073/";
const DEFAULT_VIEWPORT = "390x844";
const DEFAULT_WORKSPACE_ID = "owner";
const DEFAULT_EXECUTE_TIMEOUT_MS = 120000;
const PLUGIN_LOCAL_HARNESS = "plugin-local-compatible";
const DIRECTORY_TOPIC_COMPOSER_LONG_INPUT_SHRINK_SCENARIO = "directory-topic-composer-long-input-shrink";
const PLUGIN_LOCAL_SCRIPT_NAMES = Object.freeze(["visual:central-compatible", "visual:plugin"]);

const IOS_SCENARIOS = new Set([
  "dark-admin-surfaces",
  "dark-growth-surfaces",
  "directory-dark-status",
  "embedded-plugin-keyboard-composer",
  "embedded-plugin-side-chat-keyboard",
  "embedded-plugin-switch-stability",
  "global-plugin-dock-gesture-stability",
  "plugin-drawer-action-gestures",
  "plugin-topic-dock-return-stability",
  "voice-stop-hold-gesture",
]);

const EMBEDDED_PLUGIN_IOS_SCENARIOS = new Set([
  "embedded-plugin-shell",
  "embedded-plugin-keyboard-composer",
  "embedded-plugin-side-chat-keyboard",
  "embedded-plugin-switch-stability",
]);

const HARNESSES = Object.freeze({
  "browser-mobile": {
    name: "browser-mobile",
    script: "scripts/playwright-visual-smoke.js",
    requiresPlaywright: true,
    requiresDebugServer: false,
  },
  "authenticated-navigation": {
    name: "authenticated-navigation",
    script: "scripts/authenticated-navigation-flow-smoke.js",
    requiresPlaywright: true,
    requiresDebugServer: false,
    requiresAccessKeyPath: true,
  },
  "ios-pwa-visual": {
    name: "ios-pwa-visual",
    script: "scripts/ios-pwa-visual-harness.js",
    requiresPlaywright: false,
    requiresDebugServer: true,
  },
  "plugin-local-compatible": {
    name: PLUGIN_LOCAL_HARNESS,
    script: "",
    requiresPlaywright: false,
    requiresDebugServer: false,
    pluginLocal: true,
  },
});

const CENTRAL_SIGNOFF_SCENARIOS = new Set([
  "authenticated-navigation",
  "embedded-plugin-shell",
  "embedded-plugin-keyboard-composer",
  "embedded-plugin-side-chat-keyboard",
  "embedded-plugin-switch-stability",
  "ios-pwa-visual",
  "plugin-drawer-action-gestures",
]);

function printHelp() {
  console.log([
    "Usage: node scripts/central-visual-harness-broker.js [options]",
    "",
    "Default mode plans the selected central visual Harness and checks availability.",
    "Use --execute to run the selected central command.",
    "",
    "Options:",
    "  --surface <name>              embedded-plugin, mobile-viewport, browser-mobile, authenticated-navigation, ios-pwa-visual.",
    "  --scenario <name>             High-level scenario, for example embedded-plugin-shell or authenticated-navigation.",
    "  --harness <name>              Explicit harness: browser-mobile, authenticated-navigation, ios-pwa-visual.",
    "  --plugin-id <id>              Plugin id for embedded plugin scenarios.",
    "  --plugin-thread-id <id>       Thread/route id for plugin keyboard scenarios.",
    "  --plugin-action-id <id>       Action id for plugin drawer action scenarios.",
    "  --base-url <url>              Home AI app origin or URL. Default: http://127.0.0.1:8797.",
    "  --debug-url <url>             Home AI iOS PWA live-debug URL. Default: http://127.0.0.1:19073/.",
    "  --viewport <WxH>              Browser/mobile viewport. Default: 390x844.",
    "  --workspace-id <id>           Workspace id. Default: owner.",
    "  --access-key-path <file>      Access key file path. The broker never prints the raw path or key.",
    "  --delegate-local              Discover and wrap a central-compatible plugin-local visual harness.",
    "  --plugin-root <path>          Explicit plugin workspace root for --delegate-local. The raw path is redacted.",
    "  --verify-evidence <json-file> Validate central-compatible plugin-local visual evidence without executing.",
    "  --app-url <url>               Explicit app URL for iOS PWA visual Harness.",
    "  --view <name>                 Explicit browser visual-smoke view.",
    "  --screenshot <file>           Child screenshot artifact path; redacted from command preview when sensitive.",
    "  --screenshot-dir <dir>        Authenticated navigation screenshot directory.",
    "  --artifact-dir <dir>          iOS visual artifact directory.",
    "  --expected-client-version <v> Expected client version for iOS visual Harness.",
    "  --timeout-ms <ms>             Child process timeout. Default: 120000.",
    "  --ios / --pwa                 Prefer iOS PWA visual Harness for compatible scenarios.",
    "  --browser                     Prefer browser/mobile Playwright Harness.",
    "  --preflight-only              Plan/check preflight only; with --execute, run the child preflight when supported.",
    "  --execute                     Execute the selected central command.",
    "  --json                        Print JSON. The broker always uses bounded output.",
    "  --list                        List supported harnesses and scenario hints.",
  ].join("\n"));
}

function readPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const out = {
    surface: "",
    scenario: "",
    harness: "",
    pluginId: "",
    pluginThreadId: "",
    pluginActionId: "",
    baseUrl: env.HOMEAI_CENTRAL_VISUAL_BASE_URL || env.HERMES_VISUAL_SMOKE_URL || DEFAULT_BASE_URL,
    debugUrl: env.HOMEAI_CENTRAL_VISUAL_DEBUG_URL || DEFAULT_DEBUG_URL,
    viewport: env.HOMEAI_CENTRAL_VISUAL_VIEWPORT || DEFAULT_VIEWPORT,
    workspaceId: env.HOMEAI_CENTRAL_VISUAL_WORKSPACE_ID || DEFAULT_WORKSPACE_ID,
    accessKeyPath: env.HOMEAI_CENTRAL_VISUAL_ACCESS_KEY_PATH || env.HERMES_WEB_AUTH_KEY_PATH || "",
    appUrl: "",
    view: "",
    screenshot: "",
    screenshotDir: "",
    artifactDir: "",
    expectedClientVersion: "",
    delegateLocal: false,
    pluginRoot: "",
    verifyEvidence: "",
    timeoutMs: DEFAULT_EXECUTE_TIMEOUT_MS,
    ios: false,
    pwa: false,
    browser: false,
    noLock: false,
    preflightOnly: false,
    execute: false,
    json: false,
    list: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    const next = () => argv[++index] || "";
    if (item === "--surface") out.surface = next();
    else if (item === "--scenario") out.scenario = next();
    else if (item === "--harness" || item === "--mode") out.harness = next();
    else if (item === "--plugin-id") out.pluginId = next();
    else if (item === "--plugin-thread-id") out.pluginThreadId = next();
    else if (item === "--plugin-action-id") out.pluginActionId = next();
    else if (item === "--base-url" || item === "--url") out.baseUrl = next() || out.baseUrl;
    else if (item === "--debug-url") out.debugUrl = next() || out.debugUrl;
    else if (item === "--viewport") out.viewport = next() || out.viewport;
    else if (item === "--workspace-id") out.workspaceId = next() || out.workspaceId;
    else if (item === "--access-key-path") out.accessKeyPath = next();
    else if (item === "--app-url") out.appUrl = next();
    else if (item === "--view") out.view = next();
    else if (item === "--screenshot") out.screenshot = next();
    else if (item === "--screenshot-dir") out.screenshotDir = next();
    else if (item === "--artifact-dir") out.artifactDir = next();
    else if (item === "--expected-client-version") out.expectedClientVersion = next();
    else if (item === "--delegate-local") out.delegateLocal = true;
    else if (item === "--plugin-root") out.pluginRoot = next();
    else if (item === "--verify-evidence") out.verifyEvidence = next();
    else if (item === "--timeout-ms") out.timeoutMs = readPositiveInt(next(), out.timeoutMs);
    else if (item === "--ios") out.ios = true;
    else if (item === "--pwa") out.pwa = true;
    else if (item === "--browser" || item === "--playwright") out.browser = true;
    else if (item === "--no-lock") out.noLock = true;
    else if (item === "--preflight-only") out.preflightOnly = true;
    else if (item === "--execute") out.execute = true;
    else if (item === "--json") out.json = true;
    else if (item === "--list") out.list = true;
    else if (item === "--help") {
      out.help = true;
    } else {
      throw new Error(`Unknown argument: ${item}`);
    }
  }
  out.surface = normalizeToken(out.surface);
  out.scenario = normalizeToken(out.scenario);
  out.harness = normalizeHarnessName(out.harness);
  out.pluginId = normalizePluginId(out.pluginId);
  return out;
}

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase().replace(/_/g, "-");
}

function normalizePluginId(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeHarnessName(value) {
  const normalized = normalizeToken(value);
  if (!normalized) return "";
  if (["browser", "browser-mobile", "mobile", "mobile-viewport", "playwright", "playwright-mobile"].includes(normalized)) return "browser-mobile";
  if (["auth", "authenticated", "authenticated-navigation", "navigation", "nav-flow"].includes(normalized)) return "authenticated-navigation";
  if (["ios", "pwa", "ios-pwa", "ios-pwa-visual", "native", "native-pwa"].includes(normalized)) return "ios-pwa-visual";
  if (["plugin-local", "plugin-local-compatible", "delegate-local", "local-compatible"].includes(normalized)) return PLUGIN_LOCAL_HARNESS;
  return normalized;
}

function selectHarness(options = {}) {
  if (options.delegateLocal || options.verifyEvidence) return PLUGIN_LOCAL_HARNESS;
  if (options.harness) return HARNESSES[options.harness]?.name || options.harness;
  if (options.browser) return "browser-mobile";
  if (options.ios || options.pwa) return "ios-pwa-visual";
  const surface = normalizeToken(options.surface);
  const scenario = normalizeToken(options.scenario);
  if (["authenticated-navigation", "navigation", "nav-flow"].includes(surface) || scenario === "authenticated-navigation") {
    return "authenticated-navigation";
  }
  if (["ios-pwa-visual", "ios", "pwa", "native", "native-shell"].includes(surface)) return "ios-pwa-visual";
  if (IOS_SCENARIOS.has(scenario)) return "ios-pwa-visual";
  return "browser-mobile";
}

function defaultScenarioFor(options = {}, selectedHarness = selectHarness(options)) {
  const scenario = normalizeToken(options.scenario);
  if (scenario && !["browser-mobile", "mobile-viewport", "playwright-mobile"].includes(scenario)) return scenario;
  if (selectedHarness === "authenticated-navigation") return "authenticated-navigation";
  if (selectedHarness === "ios-pwa-visual") {
    if (normalizeToken(options.surface) === "embedded-plugin" || options.pluginId) return "embedded-plugin-shell";
    return "directory-dark-status";
  }
  return scenario || "browser-mobile";
}

function pluginView(pluginId) {
  const normalized = normalizePluginId(pluginId);
  if (normalized === "codex-mobile") return "codex";
  if (normalized === "healthy") return "health";
  return normalized;
}

function normalizeBaseUrl(value) {
  const url = new URL(String(value || DEFAULT_BASE_URL));
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("base_url_must_be_http");
  return url.toString();
}

function normalizeDebugUrl(value) {
  const url = new URL(String(value || DEFAULT_DEBUG_URL));
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("debug_url_must_be_http");
  return url.href.endsWith("/") ? url.href : `${url.href}/`;
}

function appendBrokerMarker(rawUrl) {
  const url = new URL(normalizeBaseUrl(rawUrl));
  if (!url.searchParams.has("_hmv")) url.searchParams.set("_hmv", "central-visual-broker");
  return url.toString();
}

function pathLabel(value) {
  if (!value) return "";
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function originLabel(value) {
  try {
    const url = new URL(String(value || DEFAULT_BASE_URL));
    return `${url.protocol}//${url.host}`;
  } catch (_) {
    return "";
  }
}

function redactArgv(argv = []) {
  const sensitive = new Set([
    "--access-key-path",
    "--plugin-root",
    "--verify-evidence",
    "--screenshot",
    "--screenshot-dir",
    "--artifact-dir",
  ]);
  const redacted = [];
  for (let index = 0; index < argv.length; index += 1) {
    const item = String(argv[index]);
    redacted.push(redactValue(item));
    if (sensitive.has(item) && index + 1 < argv.length) {
      redacted.push(`<${item.slice(2)}:redacted>`);
      index += 1;
    }
  }
  return redacted;
}

function redactValue(value) {
  const text = String(value || "");
  return text.replace(/([?&][^=]*(?:key|token|secret|password|cookie|launch|auth)[^=]*=)[^&\s]+/ig, "$1REDACTED");
}

function hasCentralScript(repoRoot, harness) {
  const config = HARNESSES[harness];
  if (config?.pluginLocal) return true;
  return Boolean(config && fs.existsSync(path.join(repoRoot, config.script)));
}

function isPlaywrightAvailable(repoRoot) {
  try {
    require.resolve("playwright", { paths: [repoRoot] });
    return true;
  } catch (_) {
    return false;
  }
}

async function probeDebugServer(debugUrl, fetchImpl = global.fetch, timeoutMs = 1500) {
  const normalized = normalizeDebugUrl(debugUrl);
  if (typeof fetchImpl !== "function") {
    return { ok: false, required: true, code: "fetch_unavailable" };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(250, Number(timeoutMs || 1500)));
  try {
    const response = await fetchImpl(normalized, { method: "GET", signal: controller.signal });
    return { ok: Boolean(response && response.status < 500), required: true, statusCode: response?.status || 0 };
  } catch (err) {
    return { ok: false, required: true, code: err?.name === "AbortError" ? "debug_server_timeout" : "debug_server_unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

function pluginWorkspaceRoot(repoRoot) {
  return path.resolve(repoRoot, "..", "plugins");
}

function resolvePluginRootCandidate(root) {
  return root ? path.resolve(String(root)) : "";
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function pluginLocalCandidates(options = {}, repoRoot = process.cwd()) {
  const candidates = [];
  const add = (root, explicit = false) => {
    const resolved = resolvePluginRootCandidate(root);
    if (!resolved || candidates.some((item) => item.root === resolved)) return;
    candidates.push({ root: resolved, explicit });
  };
  add(options.pluginRoot, true);
  if (options.pluginId) add(path.join(pluginWorkspaceRoot(repoRoot), options.pluginId), false);
  return candidates;
}

function discoverPluginLocalHarness(options = {}, repoRoot = process.cwd(), deps = {}) {
  const issues = [];
  if (!options.pluginId) issues.push({ code: "plugin_id_required", selectedHarness: PLUGIN_LOCAL_HARNESS });
  const candidates = pluginLocalCandidates(options, repoRoot);
  if (!candidates.length) issues.push({ code: "plugin_visual_harness_missing", selectedHarness: PLUGIN_LOCAL_HARNESS });
  const readPackage = deps.readPackageJson || readJsonFile;
  for (const candidate of candidates) {
    const packagePath = path.join(candidate.root, "package.json");
    if (!fs.existsSync(packagePath)) continue;
    let pkg = null;
    try {
      pkg = readPackage(packagePath);
    } catch (_) {
      issues.push({ code: "plugin_visual_harness_unavailable", reason: "package_json_unreadable" });
      continue;
    }
    const scripts = pkg && typeof pkg.scripts === "object" ? pkg.scripts : {};
    const scriptName = PLUGIN_LOCAL_SCRIPT_NAMES.find((name) => typeof scripts[name] === "string" && scripts[name].trim());
    if (!scriptName) continue;
    return {
      ok: true,
      root: candidate.root,
      rootExplicit: candidate.explicit,
      packagePath,
      scriptName,
      issues,
    };
  }
  return {
    ok: false,
    root: candidates[0]?.root || "",
    rootExplicit: Boolean(candidates[0]?.explicit),
    scriptName: "",
    issues: issues.concat({ code: "plugin_visual_harness_missing", selectedHarness: PLUGIN_LOCAL_HARNESS }),
  };
}

function buildPluginLocalCommand(options = {}, discovery = {}) {
  if (!discovery.ok) return { argv: [], executable: "npm", cwd: discovery.root || "", selectedHarness: PLUGIN_LOCAL_HARNESS };
  const scenario = defaultScenarioFor(options, PLUGIN_LOCAL_HARNESS);
  const argv = [
    "run",
    discovery.scriptName,
    "--",
    "--scenario",
    scenario,
    "--plugin-id",
    options.pluginId,
    "--base-url",
    options.baseUrl || DEFAULT_BASE_URL,
    "--workspace-id",
    options.workspaceId || DEFAULT_WORKSPACE_ID,
    "--viewport",
    options.viewport || DEFAULT_VIEWPORT,
    "--surface",
    options.surface || "embedded-plugin",
    "--json",
  ];
  if (options.accessKeyPath) argv.push("--access-key-path", options.accessKeyPath);
  return {
    argv,
    executable: "npm",
    cwd: discovery.root,
    script: discovery.scriptName,
    selectedHarness: PLUGIN_LOCAL_HARNESS,
    scenario,
  };
}

function requiresCentralSignoff(options = {}, scenario = defaultScenarioFor(options, selectHarness(options))) {
  const surface = normalizeToken(options.surface);
  if (options.ios || options.pwa) return true;
  if (["authenticated-navigation", "ios-pwa-visual", "native", "native-shell"].includes(surface)) return true;
  if (CENTRAL_SIGNOFF_SCENARIOS.has(normalizeToken(scenario))) return true;
  return false;
}

function boundedString(value, max = 160) {
  return String(value || "").slice(0, max);
}

function hasPrivacyMarker(payload) {
  const text = JSON.stringify(payload || {});
  return /(access[-_ ]?key|cookie|launch[-_ ]?token|bearer\s+|password|secret|-----BEGIN|localStorage|endpointBody|rawMessage)/i.test(text);
}

function normalizeCheckItems(payload) {
  const checks = Array.isArray(payload?.assertions) ? payload.assertions : payload?.checks;
  return Array.isArray(checks) ? checks : [];
}

function validatePluginEvidence(payload, options = {}) {
  const issues = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, status: "plugin_visual_evidence_invalid", issues: [{ code: "plugin_visual_evidence_invalid", reason: "json_object_required" }] };
  }
  const pluginId = normalizePluginId(payload.pluginId);
  const scenario = normalizeToken(payload.scenario);
  const rawChecks = Array.isArray(payload?.assertions) ? payload.assertions : payload?.checks;
  const checks = normalizeCheckItems(payload);
  if (typeof payload.ok !== "boolean") issues.push({ code: "plugin_visual_evidence_invalid", field: "ok" });
  if (!payload.status || typeof payload.status !== "string") issues.push({ code: "plugin_visual_evidence_invalid", field: "status" });
  if (payload.schemaVersion === undefined || payload.schemaVersion === null) issues.push({ code: "plugin_visual_evidence_invalid", field: "schemaVersion" });
  if (!pluginId) issues.push({ code: "plugin_visual_evidence_invalid", field: "pluginId" });
  if (options.pluginId && pluginId !== normalizePluginId(options.pluginId)) issues.push({ code: "plugin_visual_evidence_invalid", field: "pluginId", expected: normalizePluginId(options.pluginId) });
  if (!scenario) issues.push({ code: "plugin_visual_evidence_invalid", field: "scenario" });
  const expectedScenario = normalizeToken(defaultScenarioFor(options, PLUGIN_LOCAL_HARNESS));
  if (expectedScenario && scenario && scenario !== expectedScenario) issues.push({ code: "plugin_visual_evidence_invalid", field: "scenario", expected: expectedScenario });
  if (!payload.surface || typeof payload.surface !== "string") issues.push({ code: "plugin_visual_evidence_invalid", field: "surface" });
  if (!payload.harnessKind || typeof payload.harnessKind !== "string") issues.push({ code: "plugin_visual_evidence_invalid", field: "harnessKind" });
  if (!payload.mode || typeof payload.mode !== "string") issues.push({ code: "plugin_visual_evidence_invalid", field: "mode" });
  if (!payload.viewport) issues.push({ code: "plugin_visual_evidence_invalid", field: "viewport" });
  if (!payload.baseUrlOrigin && !payload.originLabel) issues.push({ code: "plugin_visual_evidence_invalid", field: "baseUrlOrigin" });
  if (!Array.isArray(rawChecks)) issues.push({ code: "plugin_visual_evidence_invalid", field: "assertions" });
  if (hasPrivacyMarker(payload)) issues.push({ code: "plugin_visual_evidence_invalid", field: "privacy_marker" });
  const failed = checks.filter((item) => item && item.pass === false);
  const passed = checks.filter((item) => item && item.pass === true);
  const issueCodes = collectCodes(payload.issueCodes || payload.issues || payload.failures).concat(collectCodes(failed));
  const evidence = {
    ok: payload.ok === true,
    status: boundedString(payload.status, 120),
    schemaVersion: boundedString(payload.schemaVersion, 40),
    pluginId,
    scenario,
    surface: boundedString(payload.surface, 80),
    harnessKind: boundedString(payload.harnessKind, 80),
    mode: boundedString(payload.mode, 80),
    viewport: typeof payload.viewport === "string" ? boundedString(payload.viewport, 40) : boundedString(JSON.stringify(payload.viewport), 80),
    baseUrlOrigin: boundedString(payload.baseUrlOrigin || payload.originLabel, 120),
    assertionCount: checks.length,
    passedCount: passed.length,
    failedCount: failed.length,
    issueCodes: [...new Set(issueCodes)].slice(0, 20),
    screenshotPresent: Boolean(payload.screenshotPresent || payload.screenshot),
    artifactCount: Number.isFinite(Number(payload.artifactCount)) ? Math.max(0, Math.min(999, Number(payload.artifactCount))) : 0,
    clientVersion: boundedString(payload.clientVersion, 120),
  };
  return {
    ok: issues.length === 0,
    status: issues.length ? "plugin_visual_evidence_invalid" : (evidence.ok ? "plugin_visual_evidence_accepted" : "plugin_visual_evidence_failed"),
    evidence,
    issues,
  };
}

function summarizePluginLocalChildOutput(stdout, stderr, options = {}) {
  const payload = extractJsonObject(stdout) || extractJsonObject(stderr) || null;
  const validation = validatePluginEvidence(payload, options);
  return Object.assign({
    jsonDetected: Boolean(payload),
    stdoutBytes: Buffer.byteLength(String(stdout || ""), "utf8"),
    stderrBytes: Buffer.byteLength(String(stderr || ""), "utf8"),
  }, validation);
}

function buildChildCommand(options = {}, selectedHarness = selectHarness(options), repoRoot = process.cwd()) {
  const harness = HARNESSES[selectedHarness];
  if (!harness) return { argv: [], script: "", selectedHarness };
  const scenario = defaultScenarioFor(options, selectedHarness);
  const argv = [path.join(repoRoot, harness.script)];
  if (selectedHarness === "browser-mobile") {
    argv.push("--url", appendBrokerMarker(options.baseUrl));
    argv.push("--scenario", scenario);
    argv.push("--viewport", options.viewport || DEFAULT_VIEWPORT);
    argv.push("--workspace-id", options.workspaceId || DEFAULT_WORKSPACE_ID);
    const view = options.view || (options.pluginId ? pluginView(options.pluginId) : "");
    if (view) argv.push("--view", view);
    if (options.accessKeyPath) argv.push("--access-key-path", options.accessKeyPath);
    if (options.screenshot) argv.push("--screenshot", options.screenshot);
    argv.push("--json");
    return { argv, script: harness.script, selectedHarness, scenario };
  }
  if (selectedHarness === "authenticated-navigation") {
    argv.push("--url", appendBrokerMarker(options.baseUrl));
    argv.push("--viewport", options.viewport || DEFAULT_VIEWPORT);
    argv.push("--workspace-id", options.workspaceId || DEFAULT_WORKSPACE_ID);
    if (options.accessKeyPath) argv.push("--access-key-path", options.accessKeyPath);
    if (options.screenshotDir) argv.push("--screenshot-dir", options.screenshotDir);
    argv.push("--json");
    return { argv, script: harness.script, selectedHarness, scenario };
  }
  if (selectedHarness === "ios-pwa-visual") {
    argv.push("--debug-url", normalizeDebugUrl(options.debugUrl));
    argv.push("--scenario", scenario);
    const appUrl = options.appUrl || options.baseUrl || "";
    if (appUrl) argv.push("--app-url", appendBrokerMarker(appUrl));
    if (options.pluginId) argv.push("--plugin-id", options.pluginId);
    if (options.pluginThreadId) argv.push("--plugin-thread-id", options.pluginThreadId);
    if (options.pluginActionId) argv.push("--plugin-action-id", options.pluginActionId);
    if (options.expectedClientVersion) argv.push("--expected-client-version", options.expectedClientVersion);
    if (options.screenshot) argv.push("--screenshot", options.screenshot);
    if (options.artifactDir) argv.push("--artifact-dir", options.artifactDir);
    if (options.timeoutMs) argv.push("--timeout-ms", String(options.timeoutMs));
    if (options.noLock) argv.push("--no-lock");
    if (options.preflightOnly) argv.push("--preflight-only");
    argv.push("--json");
    return { argv, script: harness.script, selectedHarness, scenario };
  }
  return { argv, script: harness.script, selectedHarness, scenario };
}

async function buildPlan(options = {}, deps = {}) {
  const repoRoot = deps.repoRoot || path.resolve(__dirname, "..");
  const selectedHarness = selectHarness(options);
  const harness = HARNESSES[selectedHarness];
  const scenario = defaultScenarioFor(options, selectedHarness);
  const issues = [];
  let command = null;
  let pluginDiscovery = null;
  let pluginEvidence = null;
  const centralSignoffRequired = selectedHarness === PLUGIN_LOCAL_HARNESS && requiresCentralSignoff(options, scenario);
  if (selectedHarness === PLUGIN_LOCAL_HARNESS && options.verifyEvidence) {
    try {
      const payload = JSON.parse(fs.readFileSync(options.verifyEvidence, "utf8"));
      pluginEvidence = validatePluginEvidence(payload, options);
      issues.push(...pluginEvidence.issues);
    } catch (_) {
      pluginEvidence = { ok: false, status: "plugin_visual_evidence_invalid", issues: [{ code: "plugin_visual_evidence_invalid", reason: "json_unreadable" }] };
      issues.push(...pluginEvidence.issues);
    }
  } else if (selectedHarness === PLUGIN_LOCAL_HARNESS) {
    pluginDiscovery = discoverPluginLocalHarness(options, repoRoot, deps);
    issues.push(...pluginDiscovery.issues);
    command = buildPluginLocalCommand(options, pluginDiscovery);
  }
  if (!harness) {
    issues.push({ code: "unsupported_harness", selectedHarness });
  }
  const scriptExists = harness ? hasCentralScript(repoRoot, selectedHarness) : false;
  if (harness && !scriptExists) issues.push({ code: "central_script_missing", selectedHarness });
  const playwrightAvailable = harness?.requiresPlaywright ? isPlaywrightAvailable(repoRoot) : null;
  if (harness?.requiresPlaywright && !playwrightAvailable) issues.push({ code: "playwright_unavailable", selectedHarness });
  let debugServer = { required: Boolean(harness?.requiresDebugServer), ok: null };
  if (harness?.requiresDebugServer) {
    debugServer = await probeDebugServer(options.debugUrl || DEFAULT_DEBUG_URL, deps.fetchImpl, deps.debugProbeTimeoutMs);
    if (!debugServer.ok) issues.push({ code: debugServer.code || "debug_server_unavailable", selectedHarness });
  }
  if (harness?.requiresAccessKeyPath && !options.accessKeyPath) {
    issues.push({ code: "access_key_path_required", selectedHarness });
  }
  if (selectedHarness === "ios-pwa-visual" && EMBEDDED_PLUGIN_IOS_SCENARIOS.has(scenario) && !options.pluginId) {
    issues.push({ code: "plugin_id_required", selectedHarness, scenario });
  }
  if (!command) command = buildChildCommand(options, selectedHarness, repoRoot);
  const invalid = issues.some((issue) => /unsupported|access_key_path_required|plugin_id_required|plugin_visual_evidence_invalid/.test(issue.code));
  const unavailable = issues.some((issue) => /central_script_missing|playwright_unavailable|debug_server|plugin_visual_harness_missing|plugin_visual_harness_unavailable/.test(issue.code));
  const mode = options.verifyEvidence ? "verify-evidence" : (options.preflightOnly ? "preflight" : (options.execute ? "execute" : "plan"));
  const status = issues.length
    ? (pluginEvidence?.status || (invalid ? "invalid_request" : (unavailable ? "blocked_central_visual_harness_unavailable" : "blocked")))
    : (mode === "execute" ? "ready_to_execute" : "preflight_passed");
  const commandPreview = selectedHarness === PLUGIN_LOCAL_HARNESS && command.executable === "npm"
    ? ["npm", ...redactArgv(command.argv), "cwd:<plugin-root:redacted>"]
    : ["node", ...redactArgv(command.argv)];
  const plan = {
    ok: issues.length === 0,
    status,
    surface: options.surface || "",
    scenario,
    pluginId: options.pluginId || "",
    mode,
    selectedHarness,
    centralRoot: repoRoot,
    playwrightAvailable,
    requiresDebugServer: Boolean(harness?.requiresDebugServer),
    debugServer,
    accessKeyPathProvided: Boolean(options.accessKeyPath),
    accessKeyPathLabel: pathLabel(options.accessKeyPath),
    pluginRootProvided: Boolean(options.pluginRoot),
    pluginRootLabel: pathLabel(pluginDiscovery?.root || options.pluginRoot),
    verifyEvidenceProvided: Boolean(options.verifyEvidence),
    verifyEvidenceLabel: pathLabel(options.verifyEvidence),
    pluginHarnessScript: pluginDiscovery?.scriptName || "",
    centralSignoffRequired,
    localEvidenceRole: selectedHarness === PLUGIN_LOCAL_HARNESS && centralSignoffRequired ? "supplemental" : "candidate-signoff",
    baseUrlOrigin: originLabel(options.baseUrl),
    commandPreview,
    evidence: pluginEvidence?.evidence || null,
    issues,
  };
  Object.defineProperty(plan, "_command", {
    value: command,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return plan;
}

function extractJsonObject(text) {
  const input = String(text || "").trim();
  if (!input) return null;
  const first = input.indexOf("{");
  const last = input.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try {
    return JSON.parse(input.slice(first, last + 1));
  } catch (_) {
    return null;
  }
}

function collectCodes(items) {
  if (!Array.isArray(items)) return [];
  return [...new Set(items.map((item) => String(item?.code || item?.name || item || "").slice(0, 120)).filter(Boolean))].slice(0, 20);
}

function summarizeChildOutput(stdout, stderr) {
  const payload = extractJsonObject(stdout) || extractJsonObject(stderr) || null;
  const layoutFailures = collectCodes(payload?.layout?.failures);
  const failures = collectCodes(payload?.failures).concat(layoutFailures);
  const assertionFailures = collectCodes((payload?.assertions || []).filter((item) => item && item.pass === false));
  return {
    jsonDetected: Boolean(payload),
    ok: payload?.ok === true,
    status: String(payload?.status || ""),
    errorCode: String(payload?.error || payload?.code || "").slice(0, 160),
    scenario: String(payload?.scenario || "").slice(0, 120),
    pluginId: String(payload?.pluginId || "").slice(0, 120),
    clientVersion: String(payload?.clientVersion || payload?.metrics?.clientVersion || "").slice(0, 120),
    failureCodes: [...new Set(failures.concat(assertionFailures))].slice(0, 20),
    warningCodes: collectCodes(payload?.warnings),
    assertionCount: Array.isArray(payload?.assertions) ? payload.assertions.length : 0,
    screenshotPresent: Boolean(payload?.screenshotPath || payload?.screenshot?.path),
    stdoutBytes: Buffer.byteLength(String(stdout || ""), "utf8"),
    stderrBytes: Buffer.byteLength(String(stderr || ""), "utf8"),
  };
}

async function runBroker(options = {}, deps = {}) {
  const plan = await buildPlan(options, deps);
  if (options.verifyEvidence || !options.execute || options.preflightOnly || !plan.ok) {
    const out = Object.assign({}, plan);
    delete out._command;
    return out;
  }
  const spawn = deps.spawnSync || spawnSync;
  const result = spawn(plan._command.executable || process.execPath, plan._command.argv, {
    cwd: plan._command.cwd || deps.repoRoot || path.resolve(__dirname, ".."),
    encoding: "utf8",
    timeout: options.timeoutMs || DEFAULT_EXECUTE_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
    env: process.env,
  });
  const child = plan.selectedHarness === PLUGIN_LOCAL_HARNESS
    ? summarizePluginLocalChildOutput(result.stdout, result.stderr, options)
    : summarizeChildOutput(result.stdout, result.stderr);
  const childAccepted = plan.selectedHarness === PLUGIN_LOCAL_HARNESS ? child.ok === true : result.status === 0;
  const out = Object.assign({}, plan, {
    ok: result.status === 0 && childAccepted,
    status: result.status === 0 ? (childAccepted ? "executed" : child.status || "plugin_visual_evidence_invalid") : "failed",
    exitCode: typeof result.status === "number" ? result.status : null,
    signal: result.signal || "",
    child,
  });
  if (result.error) {
    out.ok = false;
    out.status = result.error.code === "ETIMEDOUT" ? "failed_timeout" : "failed";
    out.issues = out.issues.concat({ code: out.status, message: String(result.error.message || "").slice(0, 200) });
  }
  delete out._command;
  return out;
}

function listSupported() {
  return {
    ok: true,
    harnesses: Object.keys(HARNESSES),
    scenarios: {
      browserMobile: ["browser-mobile", "mobile-viewport", DIRECTORY_TOPIC_COMPOSER_LONG_INPUT_SHRINK_SCENARIO],
      authenticatedNavigation: ["authenticated-navigation"],
      iosPwaVisual: ["embedded-plugin-shell", ...Array.from(IOS_SCENARIOS).sort()],
      pluginLocalCompatible: ["embedded-plugin-shell", "browser-mobile"],
    },
    pluginLocalScripts: PLUGIN_LOCAL_SCRIPT_NAMES,
    defaultViewport: DEFAULT_VIEWPORT,
    defaultBaseUrl: DEFAULT_BASE_URL,
    defaultDebugUrl: DEFAULT_DEBUG_URL,
  };
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    return;
  }
  const payload = options.list ? listSupported() : await runBroker(options);
  console.log(JSON.stringify(payload, null, 2));
  if (!payload.ok && (options.execute || options.preflightOnly)) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(JSON.stringify({ ok: false, status: "failed", error: String(err?.message || err).slice(0, 300) }, null, 2));
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_DEBUG_URL,
  DEFAULT_VIEWPORT,
  HARNESSES,
  PLUGIN_LOCAL_HARNESS,
  appendBrokerMarker,
  buildChildCommand,
  discoverPluginLocalHarness,
  buildPlan,
  listSupported,
  normalizeHarnessName,
  parseArgs,
  pathLabel,
  redactArgv,
  runBroker,
  selectHarness,
  summarizeChildOutput,
  validatePluginEvidence,
};
