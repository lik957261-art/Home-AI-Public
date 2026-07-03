"use strict";

const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createMobileSqliteStore } = require("../adapters/mobile-sqlite-store");
const {
  buildReport,
  parseArgs,
} = require("../scripts/macos-web-push-production-audit");

const REPO_ROOT = path.resolve(__dirname, "..");

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-web-push-audit-"));
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  fs.writeFileSync(path.join(root, "data", "web-push-vapid.json"), JSON.stringify({
    publicKey: "public",
    privateKey: "private",
    subject: "mailto:test@example.invalid",
  }, null, 2), { mode: 0o600 });
  fs.chmodSync(path.join(root, "data", "web-push-vapid.json"), 0o600);
  return root;
}

function subscription(id, origin, extra = {}) {
  return Object.assign({
    id,
    subscription: { endpoint: `https://push.example.test/${id}`, keys: { p256dh: "p", auth: "a" } },
    principalIds: ["owner"],
    workspaceIds: ["owner"],
    clientContext: {
      displayMode: "standalone",
      standalone: true,
      origin,
      platform: "MacIntel",
      userAgent: "Mozilla/5.0",
    },
    lastSuccessAt: "2026-06-21T00:00:00.000Z",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:00:00.000Z",
  }, extra);
}

function writeSqliteState(root, state) {
  const store = createMobileSqliteStore({ dbPath: path.join(root, "data", "hermes-mobile.sqlite3") });
  try {
    store.replaceRuntimeState(state);
  } finally {
    store.close();
  }
}

function testSqliteAuditPassesWithMatchingExternalSubscription() {
  const root = makeRoot();
  writeSqliteState(root, {
    pushSubscriptions: [
      subscription("prod", "https://prod.example.test/app"),
      subscription("dev", "https://dev.example.test"),
      subscription("legacy", "", {
        clientContext: { displayMode: "standalone", standalone: true },
      }),
    ],
    pushDeliveries: [{
      id: "pushdel_recent",
      sentAt: new Date().toISOString(),
      sent: 1,
      failed: 0,
      attempted: 1,
      title: "Done",
    }],
  });
  const report = buildReport({
    root,
    publicOrigin: "https://prod.example.test/hermes",
    requirePublicOrigin: true,
    requireActiveExternalSubscription: true,
    requireRecentSuccessHours: 24,
  });
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.stateSource, "sqlite");
  assert.equal(report.vapid.configured, true);
  assert.equal(report.subscriptions.total, 3);
  assert.equal(report.subscriptions.matchingOrigin, 1);
  assert.equal(report.subscriptions.mismatchedOrigin, 1);
  assert.equal(report.subscriptions.missingOrigin, 1);
  assert.equal(report.deliveries.recentSuccess, 1);
}

function testStateJsonFallbackAndIosStandaloneClassification() {
  const root = makeRoot();
  fs.writeFileSync(path.join(root, "data", "state.json"), JSON.stringify({
    pushSubscriptions: [
      subscription("iphone-ok", "https://prod.example.test", {
        deviceLabel: "iPhone",
        clientContext: {
          displayMode: "standalone",
          standalone: true,
          origin: "https://prod.example.test",
          userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)",
        },
      }),
      subscription("iphone-browser", "https://prod.example.test", {
        deviceLabel: "iPhone",
        clientContext: {
          displayMode: "browser",
          standalone: false,
          origin: "https://prod.example.test",
          userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)",
        },
      }),
    ],
    pushDeliveries: [],
  }, null, 2));
  const report = buildReport({ root, publicOrigin: "https://prod.example.test" });
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.stateSource, "state-json");
  assert.equal(report.subscriptions.iosStandalone, 1);
  assert.equal(report.subscriptions.iosNonStandalone, 1);
  assert.equal(report.subscriptions.skipReasons.ios_pwa_standalone_required, 1);
}

function testStrictExternalSubscriptionFailsWhenOnlyStaleSubscriptionsExist() {
  const root = makeRoot();
  fs.writeFileSync(path.join(root, "data", "state.json"), JSON.stringify({
    pushSubscriptions: [
      subscription("dev", "https://dev.example.test"),
      subscription("legacy", ""),
    ],
  }, null, 2));
  const report = buildReport({
    root,
    publicOrigin: "https://prod.example.test",
    requireActiveExternalSubscription: true,
  });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.code === "web_push_active_external_subscription_missing"));
}

function testVapidModeAndPublicOriginChecks() {
  const root = makeRoot();
  fs.chmodSync(path.join(root, "data", "web-push-vapid.json"), 0o644);
  fs.writeFileSync(path.join(root, "data", "state.json"), JSON.stringify({ pushSubscriptions: [] }));
  const report = buildReport({
    root,
    publicOrigin: "http://prod.example.test",
    requirePublicOrigin: true,
  });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.code === "web_push_vapid_mode_too_open"));
  assert.ok(report.issues.some((issue) => issue.code === "web_push_public_origin_not_https"));
}

function testUnreadablePrivateKeyFileCanUseRuntimeStatus() {
  const root = makeRoot();
  const dataDir = path.join(root, "data");
  fs.writeFileSync(path.join(dataDir, "hermes-mobile.sqlite3"), "not-a-sqlite-db", "utf8");
  fs.writeFileSync(path.join(dataDir, "state.json"), JSON.stringify({
    pushSubscriptions: [subscription("prod", "https://prod.example.test")],
    pushDeliveries: [{
      id: "pushdel_state",
      sentAt: new Date().toISOString(),
      sent: 1,
      failed: 0,
      attempted: 1,
    }],
  }, null, 2));
  fs.chmodSync(path.join(dataDir, "web-push-vapid.json"), 0o000);
  try {
    const report = buildReport({
      root,
      publicOrigin: "https://prod.example.test",
      runtimePushStatus: {
        checked: true,
        ok: true,
        source: "runtime-config",
        status: 200,
        enabled: true,
        publicKeyPresent: true,
        subscriptionCount: 1,
      },
    });
    assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
    assert.equal(report.vapid.configured, true);
    assert.equal(report.vapid.fileReadable, false);
    assert.equal(report.vapid.runtimeConfigured, true);
    assert.equal(report.runtimePushStatus.publicKeyPresent, true);
    assert.equal(report.runtimePushStatus.privateKeyExposed, false);
    assert.equal(report.stateSource, "state-json");
    assert.equal(report.stateFallbackIssues[0]?.code, "web_push_sqlite_state_unreadable");
    assert.equal(report.subscriptions.matchingOrigin, 1);
  } finally {
    fs.chmodSync(path.join(dataDir, "web-push-vapid.json"), 0o600);
  }
}

function testCliJsonAndMarkdownAreBounded() {
  const root = makeRoot();
  fs.writeFileSync(path.join(root, "data", "state.json"), JSON.stringify({
    pushSubscriptions: [subscription("prod", "https://prod.example.test")],
  }, null, 2));
  const json = execFileSync("node", [
    "scripts/macos-web-push-production-audit.js",
    "--root",
    root,
    "--public-origin",
    "https://prod.example.test",
    "--require-active-external-subscription",
    "--json",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const parsed = JSON.parse(json);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.doesNotMatch(json, /https:\/\/push\.example\.test/);
  assert.doesNotMatch(json, /"privateKey"\s*:/);
  assert.doesNotMatch(json, /"private"\s*,?/);

  const markdown = execFileSync("node", [
    "scripts/macos-web-push-production-audit.js",
    "--root",
    root,
    "--public-origin",
    "https://prod.example.test",
    "--markdown",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.match(markdown, /macOS Web Push Production Audit/);
  assert.match(markdown, /matching origin: 1/);
}

function testSourceCheckRunsStrictProductionAuditPath() {
  const parsedArgs = parseArgs(["--source-check", "--json"]);
  assert.equal(parsedArgs.sourceCheck, true);

  const output = execFileSync("node", [
    "scripts/macos-web-push-production-audit.js",
    "--source-check",
    "--json",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.sourceCheck, true);
  assert.equal(parsed.requirePublicOrigin, true);
  assert.equal(parsed.requireActiveExternalSubscription, true);
  assert.equal(parsed.requireRecentSuccessHours, 24);
  assert.equal(parsed.root, "<temporary-source-check-root>");
  assert.equal(parsed.publicOrigin, "https://source-check.example.invalid");
  assert.equal(parsed.subscriptions.matchingOrigin, 1);
  assert.equal(parsed.deliveries.recentSuccess, 1);
  assert.doesNotMatch(output, /push\.example\.invalid/);
  assert.doesNotMatch(output, /source-check-private-key/);
}

function testCliFailureIsBounded() {
  const result = spawnSync("node", [
    "scripts/macos-web-push-production-audit.js",
    "--root",
    "/tmp/homeai-web-push-missing-root",
    "--require-public-origin",
    "--require-active-external-subscription",
    "--json",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.issues.some((issue) => issue.code === "web_push_public_origin_missing"));
  assert.ok(parsed.issues.some((issue) => issue.code === "web_push_runtime_state_missing"));
}

testSqliteAuditPassesWithMatchingExternalSubscription();
testStateJsonFallbackAndIosStandaloneClassification();
testStrictExternalSubscriptionFailsWhenOnlyStaleSubscriptionsExist();
testVapidModeAndPublicOriginChecks();
testUnreadablePrivateKeyFileCanUseRuntimeStatus();
testCliJsonAndMarkdownAreBounded();
testSourceCheckRunsStrictProductionAuditPath();
testCliFailureIsBounded();

console.log("macos web push production audit tests passed");
