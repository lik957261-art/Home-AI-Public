"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/automation-controller/model.mjs");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  return import(`${pathToFileURL(modelPath).href}?test=${Date.now()}-${Math.random()}`);
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

  await test("automation controller model stays browser-global free", () => {
    const source = read("src/vite-islands/automation-controller/model.mjs");
    assert.doesNotMatch(source, /\b(?:window|document|globalThis|navigator|localStorage|sessionStorage|fetch|setTimeout|setInterval)\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.doesNotMatch(source, /\bstate\s*[\.\[]/);
    assert.match(source, /AUTOMATION_CONTROLLER_MODEL_VERSION/);
  });

  await test("request and cache key plans normalize volatile parameters", () => {
    const params = model.automationRequestParamsPlan({
      workspaceId: "family",
      detail: "summary",
      search: " weekly report ",
      routeTarget: true,
      selectedAutomationId: "job-1",
      refresh: true,
    });
    assert.equal(params.get("workspaceId"), "family");
    assert.equal(params.get("detail"), "summary");
    assert.equal(params.get("search"), "weekly report");
    assert.equal(params.get("automationId"), "job-1");
    assert.equal(params.get("refresh"), "1");
    assert.equal(model.automationRequestCacheKeyPlan(params), "workspaceId=family&includeDisabled=1&limit=200&detail=summary&search=weekly+report&automationId=job-1");
    assert.equal(model.automationSummaryCacheKeyPlan(params), "workspaceId=family&includeDisabled=1&limit=200&detail=summary&search=weekly+report&automationId=job-1");
    assert.equal(model.automationFullStorageKeyPlan({ params, clientVersion: "v1" }), "hermes:automation:full:v1:workspaceId=family&includeDisabled=1&limit=200&detail=full&search=weekly+report&automationId=job-1");
  });

  await test("full-cache state plan preserves route-target safety", () => {
    const cached = {
      data: [{ id: "job-1", name: "Weekly" }],
      source: { available: true },
      warning: "stale",
    };
    const hit = model.automationCachedFullStatePlan({
      cached,
      routeTargetPending: true,
      routeTargetId: "job-1",
      cacheKey: "cache",
      summaryCacheKey: "summary",
      nowMs: 1234,
    });
    assert.equal(hit.useCache, true);
    assert.equal(hit.automationSource.cached, true);
    assert.equal(hit.automationSource.warning, "stale");
    assert.equal(hit.automationLastLoadedAt, 1234);
    assert.deepEqual(hit.automations.map((job) => job.id), ["job-1"]);

    const miss = model.automationCachedFullStatePlan({
      cached,
      routeTargetPending: true,
      routeTargetId: "missing",
    });
    assert.equal(miss.useCache, false);
    assert.equal(miss.routeTargetMissing, true);
  });

  await test("merge plans preserve full detail without duplicating jobs", () => {
    assert.deepEqual(model.mergeAutomationJobsPlan(
      [{ id: "a", name: "A", old: true }, { id: "b", name: "B" }],
      [{ id: "a", latest: true }, { id: "c", name: "C" }],
    ), [
      { id: "a", name: "A", old: true, latest: true },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
    ]);
    assert.deepEqual(model.mergeAutomationJobsPlan(
      [{ id: "a", old: true }, { id: "b", old: true }],
      [{ id: "a", latest: true }],
      { replaceMissing: true },
    ), [{ id: "a", old: true, latest: true }]);
  });

  await test("push and status plans stay deterministic", () => {
    assert.equal(model.automationPushRefreshPlan({
      payload: { data: { messageType: "automation_run_completed", workspaceId: "family", automationId: "job-1" } },
    }, "family").shouldRefresh, true);
    assert.equal(model.automationPushRefreshPlan({
      payload: { data: { messageType: "automation_run_completed", workspaceId: "other", automationId: "job-1" } },
    }, "family").shouldRefresh, false);
    assert.equal(model.automationStatusLabelPlan({ status: "completed" }), "done");
    assert.equal(model.automationStatusTonePlan({ lastStatus: "failed" }), "error");
    assert.equal(model.automationStatusTextPlan({ status: "paused" }), "暂停");
    assert.equal(model.automationFailureHasNoFreshDeliverablePlan({
      lastStatus: "failed",
      lastRunAt: "2026-07-05T10:00:00Z",
    }, { updatedAt: "2026-07-05T09:00:00Z" }), true);
    assert.equal(model.automationFailureHasNoFreshDeliverablePlan({
      lastStatus: "failed",
      lastRunAt: "2026-07-05T10:00:00Z",
    }, { updatedAt: "2026-07-05T10:00:01Z" }), false);
  });

  await test("action plans build state patches and requests without side effects", () => {
    assert.deepEqual(model.automationCreateOpenStatePlan(), {
      selectedAutomationId: "",
      automationRouteTargetId: "",
      automationRouteTargetPending: false,
      automationEditOpen: false,
      automationEditJobId: "",
      automationOutputHistoryOpen: false,
      automationCreateOpen: true,
      automationCreateBusy: false,
      automationCreateDraftText: "",
      automationCreateProgressStep: "",
    });

    const createPlan = model.automationCreateRequestPlan({ text: "  daily report  ", workspaceId: "family" });
    assert.equal(createPlan.ok, true);
    assert.equal(createPlan.url, "/api/automations");
    assert.deepEqual(createPlan.request.body, { workspaceId: "family", text: "daily report" });
    assert.deepEqual(createPlan.busyPatch, {
      automationCreateBusy: true,
      automationCreateDraftText: "daily report",
      automationCreateProgressStep: "understanding",
    });
    assert.equal(model.automationCreateRequestPlan({ text: " " }).errorMessage, "请输入自动化任务描述");

    assert.deepEqual(model.automationCreateAcceptedStatePlan({ job: { id: "job-1" } }).acceptedPatch, {
      automationCreateOpen: false,
      automationCreateDraftText: "",
      automationCreateProgressStep: "",
      selectedAutomationId: "job-1",
      automationRouteTargetId: "",
      automationRouteTargetPending: false,
    });
    assert.deepEqual(model.automationCreateFinallyPlan({
      automationCreateOpen: true,
      viewMode: "automation",
    }), {
      finalPatch: {
        automationCreateBusy: false,
        automationCreateProgressStep: "",
      },
      shouldRender: true,
    });
  });

  await test("edit pause delete and update plans preserve classic action semantics", () => {
    assert.deepEqual(model.automationEditOpenStatePlan({ id: "job-2" }), {
      automationCreateOpen: false,
      automationEditOpen: true,
      automationEditJobId: "job-2",
    });
    assert.equal(model.automationEditOpenStatePlan(null), null);
    assert.equal(model.automationPauseActionPlan({ id: "job-1" }, "paused"), "resume");
    assert.equal(model.automationPauseActionPlan({ id: "job-1" }, "scheduled"), "pause");
    assert.deepEqual(model.automationSelectAfterActionPlan("job-1"), {
      selectedAutomationId: "job-1",
      automationRouteTargetId: "",
      automationRouteTargetPending: false,
    });
    assert.deepEqual(model.automationDeleteAcceptedStatePlan(), {
      selectedAutomationId: "",
      automationRouteTargetId: "",
      automationRouteTargetPending: false,
      automationEditOpen: false,
      automationEditJobId: "",
      automationOutputHistoryOpen: false,
    });

    const actionPlan = model.automationActionRequestPlan({
      jobId: "job/1",
      action: "update",
      workspaceId: "family",
      payload: { name: "A" },
    });
    assert.equal(actionPlan.ok, true);
    assert.equal(actionPlan.url, "/api/automations/job%2F1/update");
    assert.deepEqual(actionPlan.request.body, { workspaceId: "family", name: "A" });

    const manualRunPlan = model.automationManualTriggerRequestPlan({
      jobId: "plugin_daily_progress_rollup",
      workspaceId: "owner",
    });
    assert.equal(manualRunPlan.ok, true);
    assert.equal(manualRunPlan.url, "/api/automations/plugin_daily_progress_rollup/run");
    assert.deepEqual(manualRunPlan.request.body, { workspaceId: "owner", reason: "manual_ui" });

    const pendingPatch = model.automationManualTriggerStatePatchPlan({
      existing: { other: { status: "success" } },
      jobId: "plugin_daily_progress_rollup",
      status: "pending",
      nowIso: "2026-07-09T00:00:00.000Z",
    });
    assert.equal(pendingPatch.ok, true);
    assert.equal(pendingPatch.patch.automationManualTriggers.other.status, "success");
    assert.deepEqual(pendingPatch.patch.automationManualTriggers.plugin_daily_progress_rollup, {
      status: "pending",
      label: "正在请求手动触发",
      issueCode: "",
      runMode: "",
      updatedAt: "2026-07-09T00:00:00.000Z",
    });

    const successPatch = model.automationManualTriggerStatePatchPlan({
      jobId: "plugin_daily_progress_rollup",
      status: "success",
      result: { source: { runMode: "next_tick" } },
    });
    assert.equal(successPatch.entry.label, "已请求下次执行");
    assert.equal(successPatch.entry.runMode, "next_tick");

    const errorPatch = model.automationManualTriggerStatePatchPlan({
      jobId: "plugin_daily_progress_rollup",
      status: "error",
      error: { body: { code: "automation_backend_unavailable" } },
    });
    assert.equal(errorPatch.entry.issueCode, "automation_backend_unavailable");
    assert.equal(model.automationManualTriggerViewPlan(
      { id: "plugin_daily_progress_rollup" },
      errorPatch.entry,
    ).tone, "error");
    assert.deepEqual(model.automationManualTriggerViewPlan(
      { id: "plugin_daily_progress_rollup", status: "running" },
      {},
    ), {
      visible: true,
      busy: true,
      status: "running",
      tone: "info",
      label: "调度已接收，等待执行",
      issueCode: "",
    });

    const updatePlan = model.automationUpdateFormPlan({
      jobId: "job-1",
      name: " Name ",
      schedule: " hourly ",
      prompt: " work ",
    });
    assert.equal(updatePlan.ok, true);
    assert.deepEqual(updatePlan.payload, { name: "Name", schedule: "hourly", prompt: "work" });
    assert.equal(model.automationUpdateFormPlan({ jobId: "job-1" }).errorMessage, "请输入自动化名称");
    assert.deepEqual(model.automationUpdateAcceptedStatePlan({ job: { id: "job-3" } }, "job-1"), {
      automationEditOpen: false,
      automationEditJobId: "",
      selectedAutomationId: "job-3",
      automationRouteTargetId: "",
      automationRouteTargetPending: false,
    });
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
