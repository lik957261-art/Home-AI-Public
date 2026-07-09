"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createPluginDailyProgressRollupApiRoutes } = require("../server-routes/plugin-daily-progress-rollup-api-routes");
const { createPluginDailyProgressRollupService } = require("../adapters/plugin-daily-progress-rollup-service");

function createRes() {
  return {
    statusCode: 0,
    body: null,
  };
}

function makeRoutes(service, body = {}) {
  const calls = [];
  return {
    calls,
    routes: createPluginDailyProgressRollupApiRoutes({
      pluginDailyProgressRollupService: service,
      readBody: async () => body,
      requireOwner: () => ({ ok: true, workspaceId: "owner" }),
      sendJson(res, status, payload) {
        res.statusCode = status;
        res.body = payload;
        calls.push({ status, payload });
      },
    }),
  };
}

async function testStatusRoute() {
  const service = {
    status(input) {
      return { ok: true, input, job: { id: "plugin_daily_progress_rollup" } };
    },
    trigger() {},
    recordReturn() {},
    finalize() {},
  };
  const { routes } = makeRoutes(service);
  const res = createRes();
  const result = await routes.handle({ method: "GET" }, res, new URL("http://h/api/owner/plugin-daily-progress-rollup/status?date=2026-07-08"));
  assert.equal(result.handled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.input.date, "2026-07-08");
}

async function testManualTriggerRoute() {
  const service = {
    status() {},
    async trigger(input) {
      return { ok: true, input };
    },
    recordReturn() {},
    finalize() {},
  };
  const { routes } = makeRoutes(service, { date: "2026-07-08" });
  const res = createRes();
  await routes.handle({ method: "POST" }, res, new URL("http://h/api/owner/plugin-daily-progress-rollup/trigger"));
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.input.triggerSource, "manual");
}

async function testManualTriggerRoutePreservesDailyAnalysisReasoningEffort() {
  const sent = [];
  const service = createPluginDailyProgressRollupService({
    stateFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "homeai-rollup-api-")), "rollup.json"),
    pluginTargets: {
      finance: {
        label: "Finance",
        targetWorkspace: "/plugins/finance",
        targetThreadTitle: "Finance",
      },
    },
    nowIso: () => "2026-07-08T12:00:00.000Z",
    taskCardService: {
      async sendTaskCard(card) {
        sent.push(card);
        return { cardIds: ["card-finance"], targetThreadId: "thread-finance", targetThread: { title: "Finance", cwd: "/plugins/finance" } };
      },
    },
  });
  const { routes } = makeRoutes(service, { date: "2026-07-08" });
  const res = createRes();
  await routes.handle({ method: "POST" }, res, new URL("http://h/api/owner/plugin-daily-progress-rollup/trigger"));
  assert.equal(res.statusCode, 202);
  assert.equal(sent[0].reasoningEffort, "xhigh");
  assert.equal(sent[0].title, "插件日报分析 - Finance - 2026-07-08");
  assert.equal(sent[0].body.includes("## 请按这些中文小节返回"), true);
  assert.equal(res.body.run.status, "collecting");
  assert.equal(res.body.run.report, null);
}

async function testReturnAndFinalizeRoutes() {
  const service = {
    status() {},
    trigger() {},
    recordReturn(input) {
      return { ok: true, input };
    },
    finalize(input) {
      return { ok: true, input };
    },
  };
  const { routes } = makeRoutes(service, { status: "no_activity" });
  const returnRes = createRes();
  await routes.handle({ method: "POST" }, returnRes, new URL("http://h/api/owner/plugin-daily-progress-rollup/runs/run-1/plugins/music/return"));
  assert.equal(returnRes.statusCode, 200);
  assert.equal(returnRes.body.input.runId, "run-1");
  assert.equal(returnRes.body.input.pluginId, "music");
  const finalizeRes = createRes();
  await routes.handle({ method: "POST" }, finalizeRes, new URL("http://h/api/owner/plugin-daily-progress-rollup/runs/run-1/finalize"));
  assert.equal(finalizeRes.statusCode, 200);
  assert.equal(finalizeRes.body.input.runId, "run-1");
}

async function run() {
  await testStatusRoute();
  await testManualTriggerRoute();
  await testManualTriggerRoutePreservesDailyAnalysisReasoningEffort();
  await testReturnAndFinalizeRoutes();
  console.log("plugin daily progress rollup api route tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
