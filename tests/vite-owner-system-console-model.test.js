"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

async function loadModel() {
  const moduleUrl = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/owner-system-console/model.mjs",
  )).href;
  return import(`${moduleUrl}?test=${Date.now()}-${Math.random()}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

(async () => {
  const model = await loadModel();

  await test("Owner console model renders bounded Chinese MVP UI", () => {
    const html = model.renderOwnerConsoleHtml({
      console: {
        ok: true,
        overallStatus: "healthy",
        consoleVersion: "owner-console-v1",
        generatedAt: "2026-07-02T08:00:00.000Z",
        policy: { readOnlyMvp: true },
        dimensions: [
          { category: "availability", label: "可用性", status: "ok", summary: "监听正常" },
          { category: "accuracy", label: "准确性", status: "warning", summary: "诊断待确认" },
          { category: "autonomy", label: "自主性", status: "degraded", summary: "需要 Owner 审批" },
        ],
        criticalSignals: [
          { category: "gateway", label: "Gateway", status: "warning", severity: "H2", summary: "队列压力上升", recommendedAction: "观察" },
        ],
      },
    }, {
      systemStatus: {
        overallStatus: "warning",
        collectedAt: "2026-07-02T08:00:00.000Z",
        cpu: { overallPercent: 42, coreCount: 10, loadPerCore: { oneMinute: 0.8 }, status: "ok" },
        memory: { percentUsed: 61, usedBytes: 6 * 1024 ** 3, totalBytes: 10 * 1024 ** 3, status: "ok" },
        disks: [{ percentUsed: 72, freeBytes: 128 * 1024 ** 3, status: "ok" }],
        host: { uptimeSeconds: 7200 },
        signals: [
          { category: "gateway", label: "Gateway worker", status: "ok", summary: "运行中", lastCheckedAt: "2026-07-02T08:00:00.000Z" },
        ],
      },
    });

    assert.match(html, /Home AI 系统控制台/);
    assert.match(html, /只读 Owner 视图/);
    assert.match(html, /可用性/);
    assert.match(html, /准确性/);
    assert.match(html, /自主性/);
    assert.match(html, /关键服务与 Runtime/);
    assert.match(html, /近期需要关注/);
    assert.match(html, /Gateway worker/);
    assert.match(html, /42%/);
    assert.match(html, /61%/);
    assert.match(html, /72%/);
  });

  await test("Owner console model escapes signal content", () => {
    const html = model.renderOwnerConsoleHtml({
      console: {
        overallStatus: "ok",
        dimensions: [
          { category: "availability", label: "<script>alert(1)</script>", status: "ok", summary: "safe" },
        ],
      },
    }, {});

    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });

  await test("Owner console model renders bounded non-owner error", () => {
    const normalized = model.normalizeOwnerConsoleError({ status: 403, code: "forbidden" });
    assert.deepEqual(normalized, {
      message: "需要 Owner 权限或重新登录。",
      status: 403,
      code: "forbidden",
    });
    const errorHtml = model.renderErrorHtml({ status: 403, code: "forbidden" });
    assert.match(errorHtml, /Home AI 系统控制台/);
    assert.match(errorHtml, /需要 Owner 权限或重新登录/);
    assert.doesNotMatch(errorHtml, /undefined/);
  });

  await test("Owner console model normalizes status labels", () => {
    assert.equal(model.normalizeStatus("healthy"), "ok");
    assert.equal(model.statusLabel("healthy"), "正常");
    assert.equal(model.statusLabel("blocked"), "阻断");
    assert.equal(model.statusLabel("not_collected"), "未采集");
  });

  await test("Owner console model renders classic-compatible Owner surface", () => {
    const html = model.renderClassicOwnerSystemConsoleView({
      isOwner: true,
      tab: "overview",
      model: {
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
              { sliceKey: "note_repair", dispatchStatus: "failed", failureCode: "target_thread_not_visible" },
            ],
          },
          autonomousDeliveryLoop: {
            status: "warning",
            counts: { open: 3, waitingReturn: 1, blocked: 0, duplicateSuppressed: 2, verifiedClosed: 4 },
            items: [
              { caseId: "delivery_1", status: "running", attentionSliceKey: "home_ai_worker", blockedReason: "/Users/example/path" },
            ],
          },
          loopEngineeringStatus: {
            status: "blocked",
            counts: { open: 1, waitingReturn: 1, blocked: 1, verifiedClosed: 2 },
            items: [
              { loopId: "loop_home_ai_1", status: "blocked", nextRoute: "codex_at_loop_status_unreachable" },
            ],
          },
          qualityProgram: {
            status: "warning",
            progressPercent: 90,
            workstreams: [
              { id: "fresh_install_upgrade_canary", title: "Fresh Install and Upgrade Canary", status: "warning", progressPercent: 75 },
            ],
            gaps: [
              {
                requirementId: "clean_target_live_canary",
                status: "partial",
                gap: "Run or wire a clean-target canary readback when a target is available.",
              },
            ],
          },
        },
      },
    });

    assert.match(html, /data-owner-system-console/);
    assert.match(html, /data-owner-system-console-status-section="quality-program"/);
    assert.match(html, /data-owner-system-console-status-section="delivery-dispatch"/);
    assert.match(html, /data-owner-system-console-status-section="delivery-loop"/);
    assert.match(html, /data-owner-system-console-status-section="loop-engineering"/);
    assert.match(html, /全新安装与升级 Canary/);
    assert.match(html, /目标线程不可见/);
    assert.match(html, /Codex Mobile Loop 状态不可达/);
    assert.doesNotMatch(html, /Fresh Install and Upgrade Canary/);
    assert.doesNotMatch(html, /must-not-leak/);
  });

  await test("Owner console model renders classic-compatible system status tab", () => {
    const html = model.renderClassicOwnerSystemConsoleView({
      isOwner: true,
      tab: "system-status",
      model: {
        activeTab: "system-status",
        systemStatus: {
          cpu: { usagePercent: 44, status: "ok" },
          memory: { usedBytes: 2147483648, totalBytes: 4294967296, status: "warning" },
          disk: { usedPercent: 88, status: "warning", thresholdPercent: 85 },
          uptime: { seconds: 93600 },
          codexMobile: {
            available: true,
            status: "warning",
            totalCpuPercent: 29,
            totalRssBytes: 4 * 1024 ** 3,
            logs: {
              available: true,
              totalSizeBytes: 900 * 1024 ** 2,
              growthAvailable: true,
              growthBytesPerSecond: 3500,
            },
            processes: [
              { label: "Codex app-server", status: "warning", cpuPercent: 29, rssBytes: 4 * 1024 ** 3, elapsed: "28:25" },
            ],
          },
          services: [
            { name: "listener", status: "running", critical: true, summary: "已上报" },
          ],
          signals: [
            { label: "磁盘", severity: "warning", summary: "高于阈值" },
          ],
        },
      },
    });

    assert.match(html, /data-owner-system-console-system-status/);
    assert.match(html, /data-owner-system-console-status-section="system-resources"/);
    assert.match(html, /data-owner-system-console-status-section="codex-mobile-runtime"/);
    assert.match(html, /data-owner-system-console-status-section="services"/);
    assert.match(html, /owner-system-console-service-table/);
    assert.match(html, /Codex Mobile Runtime/);
    assert.match(html, /Codex app-server/);
    assert.match(html, /RSS 4GB/);
    assert.match(html, /日志 900MB/);
    assert.match(html, /listener/);
    assert.doesNotMatch(html, /\/Users\//);
    assert.doesNotMatch(html, /secret/);
  });
})().finally(() => {
  if (process.exitCode) process.exit(process.exitCode);
});
