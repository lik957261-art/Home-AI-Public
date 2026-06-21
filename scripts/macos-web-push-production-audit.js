"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createMobileSqliteStore } = require("../adapters/mobile-sqlite-store");
const {
  createWebPushDeliveryNormalizationService,
  normalizeWebPushOrigin,
} = require("../adapters/web-push-delivery-normalization-service");

const DEFAULT_ROOT = "/Users/example/path";

function parseArgs(argv = []) {
  const out = {
    root: process.env.HERMES_MOBILE_ROOT || DEFAULT_ROOT,
    dataDir: "",
    dbPath: "",
    statePath: "",
    vapidPath: "",
    publicOrigin: process.env.HERMES_MOBILE_PUBLIC_ORIGIN
      || process.env.HERMES_WEB_PUBLIC_ORIGIN
      || process.env.HERMES_PUBLIC_ORIGIN
      || process.env.PUBLIC_ORIGIN
      || "",
    requirePublicOrigin: false,
    requireActiveExternalSubscription: false,
    requireRecentSuccessHours: 0,
    sourceCheck: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") out.root = argv[++index] || out.root;
    else if (arg === "--data-dir") out.dataDir = argv[++index] || out.dataDir;
    else if (arg === "--db-path") out.dbPath = argv[++index] || out.dbPath;
    else if (arg === "--state-path") out.statePath = argv[++index] || out.statePath;
    else if (arg === "--vapid-path") out.vapidPath = argv[++index] || out.vapidPath;
    else if (arg === "--public-origin") out.publicOrigin = argv[++index] || out.publicOrigin;
    else if (arg === "--require-public-origin") out.requirePublicOrigin = true;
    else if (arg === "--require-active-external-subscription") out.requireActiveExternalSubscription = true;
    else if (arg === "--require-recent-success-hours") {
      out.requireRecentSuccessHours = Math.max(0, Number(argv[++index] || 0) || 0);
    } else if (arg === "--source-check") {
      out.sourceCheck = true;
    } else if (arg === "--json") out.json = true;
    else if (arg === "--markdown") {
      // Output mode is selected in main; accept this flag during parse.
    }
    else if (arg === "--help") {
      process.stdout.write([
        "Usage: node scripts/macos-web-push-production-audit.js [--root <mac-root>] [--public-origin <origin>] [--json]",
        "  Read-only Web Push production state audit. It does not send notifications.",
        "  Use --require-active-external-subscription after a real device re-registration smoke.",
        "  Use --source-check to run the strict production-audit path against a temporary fixture.",
      ].join("\n") + "\n");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  out.root = path.resolve(out.root || DEFAULT_ROOT);
  out.dataDir = path.resolve(out.dataDir || path.join(out.root, "data"));
  out.dbPath = path.resolve(out.dbPath || path.join(out.dataDir, "hermes-mobile.sqlite3"));
  out.statePath = path.resolve(out.statePath || path.join(out.dataDir, "state.json"));
  out.vapidPath = path.resolve(out.vapidPath || path.join(out.dataDir, "web-push-vapid.json"));
  out.publicOrigin = normalizeWebPushOrigin(out.publicOrigin);
  return out;
}

function writeSourceCheckFixture(root) {
  const dataDir = path.join(root, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const vapidPath = path.join(dataDir, "web-push-vapid.json");
  fs.writeFileSync(vapidPath, JSON.stringify({
    publicKey: "source-check-public-key",
    privateKey: "source-check-private-key",
    subject: "mailto:source-check@example.invalid",
  }, null, 2), { mode: 0o600 });
  fs.chmodSync(vapidPath, 0o600);
  const store = createMobileSqliteStore({ dbPath: path.join(dataDir, "hermes-mobile.sqlite3") });
  try {
    store.replaceRuntimeState({
      pushSubscriptions: [{
        id: "source-check-subscription",
        subscription: {
          endpoint: "https://push.example.invalid/source-check",
          keys: { p256dh: "source-check-p256dh", auth: "source-check-auth" },
        },
        principalIds: ["owner"],
        workspaceIds: ["owner"],
        clientContext: {
          displayMode: "standalone",
          standalone: true,
          origin: "https://source-check.example.invalid",
          platform: "MacIntel",
          userAgent: "Mozilla/5.0",
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastSuccessAt: new Date().toISOString(),
      }],
      pushDeliveries: [{
        id: "source-check-delivery",
        sentAt: new Date().toISOString(),
        sent: 1,
        failed: 0,
        attempted: 1,
        title: "Source check",
      }],
    });
  } finally {
    store.close();
  }
}

function buildSourceCheckReport() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-web-push-source-check-"));
  try {
    writeSourceCheckFixture(root);
    const report = buildReport({
      root,
      publicOrigin: "https://source-check.example.invalid",
      requirePublicOrigin: true,
      requireActiveExternalSubscription: true,
      requireRecentSuccessHours: 24,
    });
    return {
      ...report,
      sourceCheck: true,
      root: "<temporary-source-check-root>",
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function pathStatus(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return { exists: true, file: stat.isFile(), directory: stat.isDirectory(), mode: stat.mode & 0o777, bytes: stat.size };
  } catch (err) {
    return { exists: false, error: err?.code || "error" };
  }
}

function modeOctal(mode) {
  return `0${(Number(mode || 0) & 0o777).toString(8).padStart(3, "0")}`;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    return { __error: err?.code || err?.name || "json_error" };
  }
}

function loadState(options, issues) {
  const dbStatus = pathStatus(options.dbPath);
  if (dbStatus.exists && dbStatus.file) {
    let store = null;
    try {
      store = createMobileSqliteStore({ dbPath: options.dbPath });
      return {
        source: "sqlite",
        path: "<root>/data/hermes-mobile.sqlite3",
        state: store.exportRuntimeState(),
      };
    } catch (err) {
      issues.push({ code: "web_push_sqlite_state_unreadable", detail: String(err?.code || err?.name || err?.message || err).slice(0, 160) });
    } finally {
      try {
        store?.close?.();
      } catch (_) {}
    }
  }
  const stateStatus = pathStatus(options.statePath);
  if (stateStatus.exists && stateStatus.file) {
    const parsed = readJson(options.statePath);
    if (parsed && !parsed.__error && typeof parsed === "object") {
      return { source: "state-json", path: "<root>/data/state.json", state: parsed };
    }
    issues.push({ code: "web_push_state_json_invalid", path: "<root>/data/state.json" });
  } else if (!dbStatus.exists) {
    issues.push({ code: "web_push_runtime_state_missing", paths: ["<root>/data/hermes-mobile.sqlite3", "<root>/data/state.json"] });
  }
  return { source: "none", path: "", state: {} };
}

function vapidStatus(options, issues) {
  const status = pathStatus(options.vapidPath);
  if (!status.exists) {
    issues.push({ code: "web_push_vapid_file_missing", path: "<root>/data/web-push-vapid.json" });
    return { exists: false, configured: false, source: "<root>/data/web-push-vapid.json" };
  }
  if (!status.file) {
    issues.push({ code: "web_push_vapid_path_not_file", path: "<root>/data/web-push-vapid.json" });
    return { exists: true, configured: false, source: "<root>/data/web-push-vapid.json" };
  }
  const parsed = readJson(options.vapidPath);
  const configured = Boolean(parsed?.publicKey && parsed?.privateKey);
  if (!configured) issues.push({ code: "web_push_vapid_keys_missing", path: "<root>/data/web-push-vapid.json" });
  if ((status.mode & 0o077) !== 0) {
    issues.push({ code: "web_push_vapid_mode_too_open", path: "<root>/data/web-push-vapid.json", mode: modeOctal(status.mode) });
  }
  return {
    exists: true,
    configured,
    source: "<root>/data/web-push-vapid.json",
    mode: modeOctal(status.mode),
    bytes: status.bytes,
    publicKeyPresent: Boolean(parsed?.publicKey),
    privateKeyPresent: Boolean(parsed?.privateKey),
    subjectPresent: Boolean(parsed?.subject),
  };
}

function isIosLike(item = {}, context = {}) {
  const value = [
    item.deviceLabel,
    item.platform,
    item.userAgent,
    context.platform,
    context.userAgent,
  ].map((part) => String(part || "")).join(" ");
  return /iPad|iPhone|iPod/i.test(value)
    || (/Macintosh/i.test(value) && /Mobile\/\S+.*Safari/i.test(value));
}

function summarizeSubscriptions(state, options) {
  const service = createWebPushDeliveryNormalizationService({
    deploymentOrigin: () => options.publicOrigin,
  });
  const subscriptions = Array.isArray(state.pushSubscriptions) ? state.pushSubscriptions : [];
  const summary = {
    total: subscriptions.length,
    active: 0,
    disabled: 0,
    matchingOrigin: 0,
    missingOrigin: 0,
    mismatchedOrigin: 0,
    iosStandalone: 0,
    iosNonStandalone: 0,
    skippedByPolicy: 0,
    skipReasons: {},
    workspaceIds: [],
    principalIds: [],
  };
  const workspaceIds = new Set();
  const principalIds = new Set();
  for (const item of subscriptions) {
    const context = service.normalizePushClientContext(item);
    const disabled = Boolean(item?.disabledAt || item?.disabled || item?.disabled_at);
    if (disabled) {
      summary.disabled += 1;
    } else {
      summary.active += 1;
    }
    for (const workspaceId of Array.isArray(item?.workspaceIds) ? item.workspaceIds : []) {
      if (workspaceId) workspaceIds.add(String(workspaceId));
    }
    for (const principalId of Array.isArray(item?.principalIds) ? item.principalIds : []) {
      if (principalId) principalIds.add(String(principalId));
    }
    if (isIosLike(item, context)) {
      if (context.standalone || context.displayMode === "standalone" || context.displayMode === "fullscreen") summary.iosStandalone += 1;
      else summary.iosNonStandalone += 1;
    }
    if (options.publicOrigin) {
      if (!context.origin) summary.missingOrigin += 1;
      else if (context.origin === options.publicOrigin) summary.matchingOrigin += 1;
      else summary.mismatchedOrigin += 1;
    }
    const skipReason = service.pushSubscriptionSkipReason(item);
    if (skipReason) {
      summary.skippedByPolicy += 1;
      summary.skipReasons[skipReason] = (summary.skipReasons[skipReason] || 0) + 1;
    }
  }
  summary.workspaceIds = [...workspaceIds].sort();
  summary.principalIds = [...principalIds].sort();
  return summary;
}

function summarizeDeliveries(state, options, issues) {
  const deliveries = Array.isArray(state.pushDeliveries) ? state.pushDeliveries : [];
  const recentSinceMs = options.requireRecentSuccessHours > 0
    ? Date.now() - (options.requireRecentSuccessHours * 60 * 60 * 1000)
    : 0;
  let sent = 0;
  let failed = 0;
  let attempted = 0;
  let recentSuccess = 0;
  let latestSentAt = "";
  for (const item of deliveries) {
    const itemSent = Number(item?.sent || 0);
    const itemFailed = Number(item?.failed || 0);
    const itemAttempted = Number(item?.attempted || itemSent + itemFailed || 0);
    sent += itemSent;
    failed += itemFailed;
    attempted += itemAttempted;
    const sentAt = String(item?.sentAt || item?.createdAt || "");
    if (sentAt && (!latestSentAt || sentAt > latestSentAt)) latestSentAt = sentAt;
    const parsed = Date.parse(sentAt);
    if (itemSent > 0 && recentSinceMs && Number.isFinite(parsed) && parsed >= recentSinceMs) recentSuccess += 1;
  }
  if (options.requireRecentSuccessHours > 0 && recentSuccess === 0) {
    issues.push({ code: "web_push_recent_success_missing", hours: options.requireRecentSuccessHours });
  }
  return {
    total: deliveries.length,
    attempted,
    sent,
    failed,
    latestSentAt,
    recentSuccess,
  };
}

function buildReport(options = {}) {
  const normalized = parseArgs([
    "--root", options.root || DEFAULT_ROOT,
    ...(options.dataDir ? ["--data-dir", options.dataDir] : []),
    ...(options.dbPath ? ["--db-path", options.dbPath] : []),
    ...(options.statePath ? ["--state-path", options.statePath] : []),
    ...(options.vapidPath ? ["--vapid-path", options.vapidPath] : []),
    ...(options.publicOrigin ? ["--public-origin", options.publicOrigin] : []),
    ...(options.requirePublicOrigin ? ["--require-public-origin"] : []),
    ...(options.requireActiveExternalSubscription ? ["--require-active-external-subscription"] : []),
    ...(options.requireRecentSuccessHours ? ["--require-recent-success-hours", String(options.requireRecentSuccessHours)] : []),
  ]);
  const issues = [];
  const publicOrigin = normalized.publicOrigin;
  if (normalized.requirePublicOrigin && !publicOrigin) {
    issues.push({ code: "web_push_public_origin_missing" });
  }
  if (publicOrigin && !publicOrigin.startsWith("https://") && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(publicOrigin)) {
    issues.push({ code: "web_push_public_origin_not_https", publicOrigin });
  }
  const vapid = vapidStatus(normalized, issues);
  const loaded = loadState(normalized, issues);
  const subscriptions = summarizeSubscriptions(loaded.state, normalized);
  const deliveries = summarizeDeliveries(loaded.state, normalized, issues);
  if (normalized.requireActiveExternalSubscription && (!publicOrigin || subscriptions.matchingOrigin < 1)) {
    issues.push({ code: "web_push_active_external_subscription_missing", publicOrigin: publicOrigin || "<missing>" });
  }
  return {
    ok: issues.length === 0,
    schemaVersion: 1,
    root: normalized.root,
    stateSource: loaded.source,
    publicOrigin,
    requirePublicOrigin: normalized.requirePublicOrigin,
    requireActiveExternalSubscription: normalized.requireActiveExternalSubscription,
    requireRecentSuccessHours: normalized.requireRecentSuccessHours,
    vapid,
    subscriptions,
    deliveries,
    issues,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = options.sourceCheck ? buildSourceCheckReport() : buildReport(options);
  if (options.json || !process.argv.includes("--markdown")) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log("# macOS Web Push Production Audit");
    console.log("");
    console.log(`- ok: ${report.ok}`);
    console.log(`- stateSource: ${report.stateSource}`);
    console.log(`- publicOrigin: ${report.publicOrigin || "<missing>"}`);
    console.log(`- active subscriptions: ${report.subscriptions.active}`);
    console.log(`- matching origin: ${report.subscriptions.matchingOrigin}`);
    console.log(`- delivery sent total: ${report.deliveries.sent}`);
    if (report.issues.length > 0) {
      console.log("");
      console.log("## Issues");
      for (const issue of report.issues) console.log(`- ${issue.code}: ${JSON.stringify(issue)}`);
    }
  }
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      schemaVersion: 1,
      issues: [{ code: "web_push_audit_failed", detail: String(err?.message || err).slice(0, 240) }],
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildReport,
  parseArgs,
};
