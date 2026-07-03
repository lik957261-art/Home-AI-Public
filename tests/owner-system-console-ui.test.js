"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-owner-system-console-ui.js"), "utf8");
const styles = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");

let apiCalls = [];
const localStorageCalls = [];
const surfaceEvents = [];
const viewModeCalls = [];
const sandbox = {
  state: {
    auth: { isOwner: false },
  },
  localStorage: {
    setItem(key, value) {
      localStorageCalls.push({ key, value });
    },
  },
  api(endpoint) {
    apiCalls.push(endpoint);
    return Promise.resolve({ ok: true });
  },
  escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  },
  formatTime(value) {
    if (String(value || "") === "2026-07-01T02:30:00.000Z") return "07/01 10:30";
    if (String(value || "") === "2026-07-01T02:31:00.000Z") return "07/01 10:31";
    return "";
  },
  module: { exports: {} },
  closeSettings() {
    surfaceEvents.push("closeSettings");
  },
  closeSidebar() {
    surfaceEvents.push("closeSidebar");
  },
  applyViewMode() {
    surfaceEvents.push("applyViewMode");
  },
  updateNavigationControls() {
    surfaceEvents.push("updateNavigationControls");
  },
};

vm.runInNewContext(`${source}
this.OwnerSystemConsoleUiTest = {
  openOwnerSystemConsole,
  openOwnerSystemConsoleSurface,
  renderOwnerSystemConsoleView,
  loadOwnerSystemConsole,
  loadOwnerSystemStatus,
  wireOwnerSystemConsoleView,
};`, sandbox);

const ui = sandbox.OwnerSystemConsoleUiTest;

assert.equal(typeof ui.openOwnerSystemConsole, "function");
assert.equal(typeof ui.openOwnerSystemConsoleSurface, "function");
assert.equal(typeof ui.renderOwnerSystemConsoleView, "function");
assert.equal(typeof ui.loadOwnerSystemConsole, "function");
assert.equal(typeof ui.loadOwnerSystemStatus, "function");
assert.equal(typeof ui.wireOwnerSystemConsoleView, "function");
assert.equal(typeof sandbox.module.exports.openOwnerSystemConsole, "function");
assert.equal(typeof sandbox.module.exports.openOwnerSystemConsoleSurface, "function");

assert.match(source, /\/api\/owner\/system-console/);
assert.match(source, /\/api\/owner\/system-console\/system-status/);
assert.match(source, /function ownerSystemConsoleRuntimeFacade\(\)/);
assert.match(source, /function ownerSystemConsoleApi\(endpoint, options = \{\}\)/);
assert.match(source, /function ownerSystemConsoleSetViewMode\(viewMode\)/);
assert.match(source, /HomeAiRuntimeFacade/);
assert.match(source, /route\.setViewMode\(normalized, \{ source: "classic-owner-system-console" \}\)/);
assert.match(source, /owner-system-console:load:success/);
assert.match(source, /data-owner-system-console/);
assert.match(source, /data-owner-system-console-refresh/);
assert.match(source, /data-owner-system-console-overview/);
assert.match(source, /data-owner-system-console-system-status/);
assert.doesNotMatch(source, /commandLine|rawLog/);
assert.doesNotMatch(source, /\blocalStorage\b/);

const unavailableHtml = ui.renderOwnerSystemConsoleView();
assert.match(unavailableHtml, /data-owner-system-console/);
assert.match(unavailableHtml, /data-owner-system-console-unavailable/);
assert.match(unavailableHtml, /仅 Owner 可见/);

(async () => {
  apiCalls = [];
  await ui.loadOwnerSystemConsole({ render: false });
  await ui.loadOwnerSystemStatus({ render: false });
  assert.deepEqual(apiCalls, [], "non-owner gate must not call owner system console APIs");

  sandbox.state.auth.isOwner = true;
  const facadeCalls = [];
  const facadeEvents = [];
  const facadeStates = [];
  sandbox.HomeAiRuntimeFacade = {
    api(endpoint) {
      facadeCalls.push(endpoint);
      if (endpoint.endsWith("/system-status")) {
        return Promise.resolve({
          systemStatus: {
            cpu: { usagePercent: 44, status: "ok" },
            services: [{ name: "listener", status: "running", critical: true }],
          },
        });
      }
      return Promise.resolve({
        console: {
          overallStatus: "ok",
          generatedAt: "2026-07-01T02:30:00.000Z",
          dimensions: [{ id: "availability", status: "ok", score: 1 }],
        },
      });
    },
    events: {
      emit(type, detail) {
        facadeEvents.push({ type, detail });
      },
    },
    state: {
      set(patch) {
        facadeStates.push(patch);
      },
    },
  };
  apiCalls = [];
  assert.equal((await ui.loadOwnerSystemConsole({ render: false })).overallStatus, "ok");
  assert.equal((await ui.loadOwnerSystemStatus({ render: false })).cpu.usagePercent, 44);
  assert.deepEqual(apiCalls, [], "facade API should replace direct classic api when available");
  assert.deepEqual(facadeCalls, [
    "/api/owner/system-console",
    "/api/owner/system-console/system-status",
  ]);
  assert.ok(facadeEvents.some((event) => event.type === "owner-system-console:load:success" && event.detail.endpoint === "overview"));
  assert.ok(facadeEvents.some((event) => event.type === "owner-system-console:load:success" && event.detail.endpoint === "system-status"));
  assert.ok(facadeStates.some((patch) => patch.ownerSystemConsoleStatus === "ready"));

  delete sandbox.HomeAiRuntimeFacade;
  sandbox.state.ownerSystemConsole = {
    activeTab: "overview",
    console: {
      overallStatus: "degraded",
      generatedAt: "2026-07-01T02:30:00.000Z",
      dimensions: [
        { id: "availability", label: "可用性", status: "ok", score: 0.98 },
        { id: "accuracy", label: "准确性", status: "warning", score: 0.81 },
        { id: "autonomy", label: "自主性", status: "critical", score: 0.52 },
      ],
      systemStatus: {
        cpu: { usagePercent: 42, status: "ok" },
        memory: { usedBytes: 2147483648, totalBytes: 4294967296, status: "warning" },
        disk: { usedPercent: 88, status: "warning", thresholdPercent: 85 },
      },
      autonomousDeliveryControl: {
        status: "degraded",
        counts: { failed: 1, deferredConflict: 2, dispatching: 0, sent: 1 },
        items: [
          {
            sliceKey: "note_repair",
            dispatchStatus: "failed",
            failureCode: "target_thread_not_visible",
            targetWorkspacePath: "/Users/example/path",
          },
        ],
      },
      qualityProgram: {
        status: "warning",
        progressPercent: 90,
        workstreams: [
          { id: "runtime_slo_diagnostic_closure", title: "Runtime SLO and Diagnostic Closure", status: "ok", progressPercent: 100 },
          { id: "fresh_install_upgrade_canary", title: "Fresh Install and Upgrade Canary", status: "warning", progressPercent: 75 },
        ],
        gaps: [
          {
            workstreamId: "fresh_install_upgrade_canary",
            requirementId: "clean_target_live_canary",
            status: "partial",
            gap: "Run or wire a clean-target canary readback when a target is available.",
          },
        ],
      },
      criticalSignals: [
        { title: "磁盘接近阈值", severity: "warning", summary: "保留空间不足" },
      ],
    },
    systemStatus: {
      cpu: { usagePercent: 44, status: "ok" },
      memory: { usedBytes: 2147483648, totalBytes: 4294967296, status: "warning" },
      disk: { usedPercent: 88, status: "warning", thresholdPercent: 85 },
      uptime: { seconds: 93600 },
      collectedAt: "2026-07-01T02:31:00.000Z",
      services: [
        { name: "listener", status: "running", critical: true, summary: "已上报" },
        { name: "gateway", status: "degraded", critical: true, summary: "容量受限" },
      ],
      signals: [
        { label: "磁盘", severity: "warning", summary: "高于阈值" },
      ],
    },
  };

  const overviewHtml = ui.renderOwnerSystemConsoleView();
  assert.match(overviewHtml, /data-owner-system-console/);
  assert.match(overviewHtml, /data-owner-system-console-refresh/);
  assert.match(overviewHtml, /data-owner-system-console-overview/);
  assert.match(overviewHtml, /data-owner-system-console-status-section="dimensions"/);
  assert.match(overviewHtml, /data-owner-system-console-status-section="overview-resources"/);
  assert.match(overviewHtml, /data-owner-system-console-status-section="quality-program"/);
  assert.match(overviewHtml, /data-owner-system-console-status-section="delivery-dispatch"/);
  assert.match(overviewHtml, /data-owner-system-console-status-section="critical-signals"/);
  assert.match(overviewHtml, /data-owner-system-console-metric="cpu"/);
  assert.match(overviewHtml, /data-owner-system-console-metric="memory"/);
  assert.match(overviewHtml, /data-owner-system-console-metric="disk"/);
  assert.match(overviewHtml, /可用性/);
  assert.match(overviewHtml, /3A 目标/);
  assert.match(overviewHtml, /90%/);
  assert.match(overviewHtml, /全新安装与升级 Canary/);
  assert.match(overviewHtml, /clean-target Canary/);
  assert.match(overviewHtml, /目标可用后运行或接入 clean-target Canary 回读。/);
  assert.doesNotMatch(overviewHtml, /Fresh Install and Upgrade Canary/);
  assert.match(overviewHtml, /交付调度/);
  assert.match(overviewHtml, /失败 1 \/ 冲突 2 \/ 进行中 1/);
  assert.match(overviewHtml, /目标线程不可见/);
  assert.doesNotMatch(overviewHtml, /must-not-leak/);
  assert.match(overviewHtml, /07\/01 10:30/);

  const statusHtml = ui.renderOwnerSystemConsoleView({ tab: "system-status" });
  assert.match(statusHtml, /data-owner-system-console-system-status/);
  assert.match(statusHtml, /data-owner-system-console-status-section="system-resources"/);
  assert.match(statusHtml, /data-owner-system-console-status-section="services"/);
  assert.match(statusHtml, /data-owner-system-console-status-section="resource-warnings"/);
  assert.match(statusHtml, /data-owner-system-console-resource-warnings/);
  assert.match(statusHtml, /owner-system-console-service-table/);
  assert.match(statusHtml, /listener/);
  assert.match(statusHtml, /gateway/);

  sandbox.HomeAiRuntimeFacade = {
    route: {
      setViewMode(viewMode, detail) {
        viewModeCalls.push({ viewMode, detail });
        return viewMode;
      },
    },
  };
  await ui.openOwnerSystemConsoleSurface({ render: false });
  assert.equal(sandbox.state.viewMode, "system-console");
  assert.equal(viewModeCalls.at(-1).viewMode, "system-console");
  assert.equal(viewModeCalls.at(-1).detail.source, "classic-owner-system-console");
  assert.deepEqual(localStorageCalls, [], "Owner Console must not own direct view-mode storage");
  assert.deepEqual(surfaceEvents.slice(-4), [
    "closeSettings",
    "closeSidebar",
    "applyViewMode",
    "updateNavigationControls",
  ]);

  assert.match(styles, /\.owner-system-console \{/);
  assert.match(styles, /\.owner-system-console-head \{/);
  assert.match(styles, /\.owner-system-console-metric-grid \{/);
  assert.match(styles, /\.owner-system-console-quality-summary \{/);
  assert.match(styles, /\.owner-system-console-service-table \{/);
  assert.match(styles, /@media \(max-width: 560px\) \{[\s\S]*?\.owner-system-console-head \{/);

  console.log("owner system console ui tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
