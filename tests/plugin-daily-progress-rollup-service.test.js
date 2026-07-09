"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createPluginDailyProgressRollupService,
  runIdForDate,
} = require("../adapters/plugin-daily-progress-rollup-service");

function tempStateFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-rollup-"));
  return path.join(dir, "rollup.json");
}

function pluginTargets() {
  return {
    music: {
      label: "Music",
      targetWorkspace: "/plugins/music",
      targetThreadId: "thread-music",
    },
    finance: {
      label: "Finance",
      targetWorkspace: "/plugins/finance",
      targetThreadTitle: "Finance",
    },
    unresolved: {
      label: "Unresolved",
      targetWorkspace: "",
    },
  };
}

function assertChineseOwnerReport(markdown) {
  assert.equal(markdown.includes("# 工作区日报 - 2026-07-08"), true);
  assert.equal(markdown.includes("## 执行摘要"), true);
  assert.equal(markdown.includes("## 全局状态概览"), true);
  assert.equal(markdown.includes("## 关键成果分析"), true);
  assert.equal(markdown.includes("## 风险与阻塞分析"), true);
  assert.equal(markdown.includes("## 系统性问题"), true);
  assert.equal(markdown.includes("## 明日优先级建议"), true);
  assert.equal(markdown.includes("## 各工作区详析"), true);
  assert.equal(markdown.includes("## 数据完整性说明"), true);
  assert.equal(markdown.includes("## 隐私边界"), true);
  assert.equal(markdown.includes("Plugin Daily Progress Rollup"), false);
  assert.equal(markdown.includes("none_reported_yet"), false);
  assert.equal(markdown.includes("selected="), false);
  assert.equal(markdown.includes("Metadata-only report"), false);
  assert.equal(markdown.includes("工作区日报收集中"), false);
}

async function testTriggerDoesNotGenerateOwnerReportBeforeReturns() {
  const service = createPluginDailyProgressRollupService({
    stateFile: tempStateFile(),
    pluginTargets: pluginTargets(),
    nowIso: () => "2026-07-08T12:00:00.000Z",
  });
  const result = await service.trigger({ date: "2026-07-08", triggerSource: "manual", dryRun: true });
  assert.equal(result.ok, true);
  assert.equal(result.run.runId, runIdForDate("2026-07-08"));
  assert.equal(result.run.jobId, "plugin_daily_progress_rollup");
  assert.equal(result.run.jobName, "插件每日进展汇总");
  assert.equal(result.run.cadence, "30 23 * * *");
  assert.equal(result.run.counts.selected >= 3, true);
  assert.equal(result.run.status, "collecting");
  assert.equal(result.run.counts.pending > 0, true);
  assert.equal(result.run.counts.dispatched, result.run.counts.pending);
  assert.equal(result.run.report, null);
}

async function testDuplicateTriggerSuppressesExistingCards() {
  const stateFile = tempStateFile();
  const sent = [];
  const service = createPluginDailyProgressRollupService({
    stateFile,
    pluginTargets: {
      music: pluginTargets().music,
    },
    nowIso: () => "2026-07-08T12:00:00.000Z",
    taskCardService: {
      async sendTaskCard(card) {
        sent.push(card);
        return { cardIds: [`card-${sent.length}`], targetThreadId: card.targetThreadId, targetThread: { title: "Music", cwd: "/plugins/music" } };
      },
    },
  });
  const first = await service.trigger({ date: "2026-07-08", triggerSource: "manual" });
  const second = await service.trigger({ date: "2026-07-08", triggerSource: "manual" });
  assert.equal(first.run.plugins.find((item) => item.pluginId === "music").taskCardId, "card-1");
  assert.equal(second.duplicateSuppressed, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].title, "插件日报分析 - Music - 2026-07-08");
  assert.equal(sent[0].summary.includes("中文日报分析"), true);
  assert.equal(sent[0].reasoningEffort, "xhigh");
  assert.equal(sent[0].body.includes("今日核心进展"), true);
  assert.equal(sent[0].body.includes("对用户或产品的实际影响"), true);
  assert.equal(sent[0].body.includes("today completed work"), false);
  assert.equal(sent[0].body.includes("raw logs"), false);
}

async function testRepliedStaleCardDoesNotBlockRetryDispatch() {
  const stateFile = tempStateFile();
  const sent = [];
  const service = createPluginDailyProgressRollupService({
    stateFile,
    pluginTargets: {
      music: pluginTargets().music,
    },
    nowIso: () => "2026-07-08T12:00:00.000Z",
    taskCardService: {
      async sendTaskCard(card) {
        sent.push(card);
        if (sent.length === 1) {
          const err = new Error("task card already replied");
          err.code = "task_card_not_pending:replied";
          throw err;
        }
        return { cardIds: [`card-${sent.length}`], targetThreadId: card.targetThreadId, targetThread: { title: "Music", cwd: "/plugins/music" } };
      },
    },
  });
  const first = await service.trigger({ date: "2026-07-08", triggerSource: "manual" });
  const firstMusic = first.run.plugins.find((item) => item.pluginId === "music");
  assert.equal(firstMusic.status, "dispatch_failed");
  assert.equal(firstMusic.issueCode, "task_card_not_pending:replied");
  assert.equal(firstMusic.dispatchAttempt, 1);

  const second = await service.trigger({ date: "2026-07-08", triggerSource: "manual" });
  const secondMusic = second.run.plugins.find((item) => item.pluginId === "music");
  assert.equal(secondMusic.status, "dispatched");
  assert.equal(secondMusic.taskCardId, "card-2");
  assert.equal(secondMusic.dispatchAttempt, 2);
  assert.match(secondMusic.requestId, /:attempt2$/);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].reasoningEffort, "xhigh");
  assert.equal(sent[1].reasoningEffort, "xhigh");
}

async function testReturnedReportSuppressesRetryDispatch() {
  const stateFile = tempStateFile();
  const sent = [];
  const service = createPluginDailyProgressRollupService({
    stateFile,
    pluginTargets: {
      music: pluginTargets().music,
    },
    nowIso: () => "2026-07-08T12:00:00.000Z",
    taskCardService: {
      async sendTaskCard(card) {
        sent.push(card);
        return { cardIds: [`card-${sent.length}`], targetThreadId: card.targetThreadId, targetThread: { title: "Music", cwd: "/plugins/music" } };
      },
    },
  });
  await service.trigger({ date: "2026-07-08", triggerSource: "manual" });
  service.recordReturn({ date: "2026-07-08", pluginId: "music", status: "returned", completedWork: ["daily report returned"] });
  const second = await service.trigger({ date: "2026-07-08", triggerSource: "manual" });
  const music = second.run.plugins.find((item) => item.pluginId === "music");
  assert.equal(second.duplicateSuppressed, true);
  assert.equal(music.duplicateSuppressedReason, "report_already_returned");
  assert.equal(sent.length, 1);
}

async function testThreadTitleResolutionAvoidsArchivedTargetId() {
  const sent = [];
  const service = createPluginDailyProgressRollupService({
    stateFile: tempStateFile(),
    pluginTargets: {
      music: {
        label: "Music",
        targetWorkspace: "/plugins/music",
        targetThreadId: "archived-thread-id",
        targetThreadTitle: "Music",
      },
    },
    nowIso: () => "2026-07-08T12:00:00.000Z",
    taskCardService: {
      async sendTaskCard(card) {
        sent.push(card);
        assert.equal(card.targetThreadId, "");
        assert.equal(card.targetThreadTitle, "Music");
        assert.equal(card.reasoningEffort, "xhigh");
        return { cardIds: ["card-current"], targetThreadId: "current-thread-id", targetThread: { title: "Music", cwd: "/plugins/music" } };
      },
    },
  });
  const result = await service.trigger({ date: "2026-07-08", triggerSource: "manual" });
  const music = result.run.plugins.find((item) => item.pluginId === "music");
  assert.equal(music.status, "dispatched");
  assert.equal(music.targetThreadId, "current-thread-id");
  assert.equal(sent.length, 1);
}

async function testArchivedIdOnlyTargetIsBoundedUnresolved() {
  const service = createPluginDailyProgressRollupService({
    stateFile: tempStateFile(),
    pluginTargets: {
      music: pluginTargets().music,
    },
    nowIso: () => "2026-07-08T12:00:00.000Z",
    taskCardService: {
      async sendTaskCard() {
        const err = new Error("target archived");
        err.code = "target_thread_archived";
        throw err;
      },
    },
  });
  const result = await service.trigger({ date: "2026-07-08", triggerSource: "manual" });
  const music = result.run.plugins.find((item) => item.pluginId === "music");
  assert.equal(music.status, "target_unresolved");
  assert.equal(music.issueCode, "target_thread_archived");
  assert.equal(result.run.counts.target_unresolved >= 1, true);
  assert.equal(result.run.report.markdownPreview.includes("问题代码：`target_thread_archived`"), true);
}

async function testReturnIngestionAndFinalizeGenerateOverallReport() {
  const service = createPluginDailyProgressRollupService({
    stateFile: tempStateFile(),
    pluginTargets: {
      music: pluginTargets().music,
      finance: pluginTargets().finance,
    },
    nowIso: () => "2026-07-08T12:00:00.000Z",
  });
  await service.trigger({ date: "2026-07-08", dryRun: true });
  const returned = service.recordReturn({
    date: "2026-07-08",
    pluginId: "music",
    status: "returned",
    completedWork: ["修复日报派卡补派逻辑，并补充回归测试"],
    productImpact: "Owner 可以看到真实的日报派发状态，避免旧卡阻塞导致报告空转。",
    validation: "focused service/API tests passed",
    deployReadback: "部署读回待 Home AI Deploy lane 返回",
    blockers: ["生产部署读回仍待确认"],
    risks: ["若目标线程再次归档，日报覆盖率会下降"],
    repeatedIssues: ["线程生命周期和部署读回是重复治理风险"],
    ownerApprovalsNeeded: ["确认是否立即部署日报质量修复"],
    centralHelpRequested: ["需要部署 lane 返回 canonical trigger 结果"],
    nextFocus: "优先完成生产部署与 2026-07-08 手动触发读回。",
    rawLogs: "should redact",
  });
  assert.equal(returned.run.counts.returned, 1);
  assert.equal(returned.run.status, "collecting");
  assert.equal(returned.run.report, null);
  const finalized = service.finalize({ date: "2026-07-08" });
  assert.equal(finalized.run.status, "report_ready");
  assert.equal(finalized.run.counts.missing_report >= 1, true);
  assertChineseOwnerReport(finalized.run.report.markdownPreview);
  assert.equal(finalized.run.report.markdownPreview.includes("Owner 可以看到真实的日报派发状态"), true);
  assert.equal(finalized.run.report.markdownPreview.includes("线程生命周期和部署读回是重复治理风险"), true);
  assert.equal(finalized.run.report.markdownPreview.includes("需要部署 lane 返回 canonical trigger 结果"), true);
  assert.equal(finalized.run.report.markdownPreview.includes("数据完整性限制"), true);
}

async function testFinalReportGeneratedAfterAllReturns() {
  const service = createPluginDailyProgressRollupService({
    stateFile: tempStateFile(),
    pluginTargets: {
      music: pluginTargets().music,
      finance: pluginTargets().finance,
    },
    nowIso: () => "2026-07-08T12:00:00.000Z",
  });
  await service.trigger({ date: "2026-07-08", dryRun: true });
  const first = service.recordReturn({
    date: "2026-07-08",
    pluginId: "music",
    status: "returned",
    completedWork: ["完成 Music 日报分析"],
  });
  assert.equal(first.run.status, "collecting");
  assert.equal(first.run.report, null);
  const second = service.recordReturn({
    date: "2026-07-08",
    pluginId: "finance",
    status: "returned",
    completedWork: ["完成 Finance 日报分析"],
    productImpact: "Owner 可以阅读完整财务插件进展。",
  });
  assert.equal(second.run.status, "report_ready");
  assert.equal(second.run.counts.pending, 0);
  assertChineseOwnerReport(second.run.report.markdownPreview);
  assert.equal(second.run.report.final, true);
}

async function testNoActivityCountsSeparately() {
  const service = createPluginDailyProgressRollupService({
    stateFile: tempStateFile(),
    pluginTargets: {
      finance: pluginTargets().finance,
    },
    nowIso: () => "2026-07-08T12:00:00.000Z",
  });
  await service.trigger({ date: "2026-07-08", dryRun: true });
  const result = service.recordReturn({
    date: "2026-07-08",
    pluginId: "finance",
    status: "no_activity",
    summary: "今天无活动，当前没有新增风险。",
  });
  assert.equal(result.run.counts.returned, 1);
  assert.equal(result.run.counts.no_activity, 1);
}

async function run() {
  await testTriggerDoesNotGenerateOwnerReportBeforeReturns();
  await testDuplicateTriggerSuppressesExistingCards();
  await testRepliedStaleCardDoesNotBlockRetryDispatch();
  await testReturnedReportSuppressesRetryDispatch();
  await testThreadTitleResolutionAvoidsArchivedTargetId();
  await testArchivedIdOnlyTargetIsBoundedUnresolved();
  await testReturnIngestionAndFinalizeGenerateOverallReport();
  await testFinalReportGeneratedAfterAllReturns();
  await testNoActivityCountsSeparately();
  console.log("plugin daily progress rollup service tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
