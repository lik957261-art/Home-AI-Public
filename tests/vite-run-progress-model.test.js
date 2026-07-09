"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/run-progress-model.mjs");

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
  await test("run-progress model stays browser-boundary free", () => {
    const source = fs.readFileSync(modelPath, "utf8");
    assert.doesNotMatch(source, /\b(?:Window|window|document|localStorage|sessionStorage|fetch|setTimeout|setInterval|globalThis)\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("plans run ids, message selection, and timestamps", async () => {
    const model = await loadModel();
    const thread = {
      id: "thread-1",
      activeRunId: "run-active",
      activeRunIds: ["run-active"],
      messages: [
        { id: "done", role: "assistant", status: "done", runId: "old-run" },
        { id: "active", role: "assistant", status: "running", taskId: "task-1", responseRunId: "run-active", startedAt: "2026-07-05T00:00:00.000Z" },
      ],
      events: [
        { runId: "run-active", event: "run.request_sent", timestamp: "2026-07-05T00:00:01.000Z" },
      ],
    };
    assert.deepEqual(model.messageOwnRunIdsPlan(thread.messages[1]).ids, ["run-active", "task-1"]);
    assert.deepEqual(model.threadActiveRunIdsPlan(thread).ids, ["run-active"]);
    assert.equal(model.messageForRunProgressPlan({ thread, runId: "run-active" }).message.id, "active");
    assert.equal(model.messageForRunProgressPlan({ thread, runId: "missing" }).message, null);
    assert.equal(model.runProgressStartMsPlan({ thread, runIds: ["run-active"], events: thread.events }).startMs, 1783209600000);
    assert.equal(model.runProgressTimestampMsPlan("2026-07-05T00:00:01.000Z").timestampMs, 1783209601000);
  });

  await test("plans operation compaction and event labels", async () => {
    const model = await loadModel();
    const events = [
      { runId: "run-1", event: "run.toolset_selection_started", timestamp: "2026-07-05T00:00:00.000Z" },
      { runId: "run-1", event: "run.permission_preflight_fallback", timestamp: "2026-07-05T00:00:10.000Z" },
      { runId: "run-1", event: "response.output_item.added", tool: "function_call", timestamp: "2026-07-05T00:00:11.000Z", preview: JSON.stringify({ name: "search_files", callId: "call-1" }) },
      { runId: "run-1", event: "response.output_item.done", tool: "function_call_output", timestamp: "2026-07-05T00:00:13.000Z", preview: JSON.stringify({ callId: "call-1" }) },
      { runId: "run-1", event: "run.liveness_warning", timestamp: "2026-07-05T00:00:14.000Z", preview: "hidden" },
    ];
    const named = model.runProgressEventsWithFunctionNamesPlan(events).events;
    const compacted = model.runProgressCompactOperationEventsPlan(model.runProgressCompactPreflightEventsPlan(named).events).events;
    assert.deepEqual(compacted.map((event) => event.event), ["run.permission_preflight_fallback", "response.output_item.added", "run.liveness_warning"]);
    const operation = compacted[1];
    assert.equal(operation.operationName, "search_files");
    assert.equal(operation.operationStatus, "done");
    assert.equal(model.runEventTitlePlan(operation).title, "Function search_files");
    assert.equal(model.runEventStatusLabelPlan({ event: operation, startMs: 1783209600000, nowMs: 1783209614000 }).label, "完成 · 2秒");
    assert.equal(model.runProgressDisplayEventsPlan({ events: compacted, startMs: 1783209600000, nowMs: 1783209614000 }).events.length, 2);
  });

  await test("plans compact-after-output panel projection", async () => {
    const model = await loadModel();
    const thread = {
      id: "thread-output",
      messages: [
        { id: "m1", role: "assistant", status: "running", runId: "run-output", startedAt: "2026-07-05T00:00:00.000Z" },
      ],
      events: [
        { runId: "run-output", event: "run.request_sent", timestamp: "2026-07-05T00:00:01.000Z" },
        { runId: "run-output", event: "run.model_output_started", timestamp: "2026-07-05T00:00:02.000Z" },
        { runId: "run-output", event: "run.stream_closed_without_terminal", timestamp: "2026-07-05T00:00:03.000Z" },
      ],
    };
    const plan = model.runProgressPanelPlan({
      thread,
      runIds: ["run-output"],
      nowMs: 1783209604000,
    });
    assert.equal(plan.compactAfterOutput, true);
    assert.deepEqual(plan.events.map((event) => event.event), ["run.model_output_started", "run.stream_closed_without_terminal"]);
    assert.equal(plan.lastEventMs, 1783209603000);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
