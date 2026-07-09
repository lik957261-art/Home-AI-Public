"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-run-progress-ui.js"), "utf8");

function createHarness(fakeModel = null) {
  const calls = [];
  const context = {
    console,
    Date,
    Promise,
    globalThis: null,
    document: {},
    window: {
      __homeAiImportRunProgressModel(importPath) {
        calls.push(["import", importPath]);
        return Promise.resolve(fakeModel);
      },
      clearInterval() {},
      clearTimeout() {},
      setInterval() { return 1; },
      setTimeout(fn) { fn(); return 1; },
    },
    state: {
      runProgressRenderLastAt: new Map(),
      runProgressRenderScheduled: new Set(),
      runProgressTicker: 0,
    },
    escapeHtml(value) {
      return String(value ?? "");
    },
    requestAnimationFrame(fn) { fn(); },
    $() { return null; },
    __calls: calls,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.__runProgressHarness = {
  RUN_PROGRESS_MODEL_ESM_PATH,
  importRunProgressModel,
  currentRunProgressModel,
  boundedRunEventPreview,
  normalizeRunEvent,
  messageOwnRunIds,
  threadActiveRunIds,
  messageRunProgressIds,
  runProgressCompactPreflightEvents,
  runEventTitle,
  runGatewayWorkerPreviewLabel,
  renderMessageRunProgress,
  messageForRunProgress,
};`, context, { filename: "app-run-progress-ui.js" });
  return context;
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
  await test("classic run-progress adapter declares bounded ESM import path", () => {
    assert.match(source, /RUN_PROGRESS_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/run-progress-model\/run-progress-model\.js/);
    assert.match(source, /__homeAiImportRunProgressModel/);
    assert.match(source, /importRunProgressModel/);
    assert.match(source, /currentRunProgressModel/);
    assert.match(source, /runProgressPanelPlan/);
    assert.match(source, /messageForRunProgressPlan/);
  });

  await test("classic adapter consumes ESM model for pure run projections", async () => {
    const modelCalls = [];
    const fakeModel = {
      boundedRunEventPreviewPlan(value) {
        modelCalls.push(["boundedRunEventPreviewPlan", value]);
        return { preview: "model-preview" };
      },
      normalizeRunEventPlan(input) {
        modelCalls.push(["normalizeRunEventPlan", input.fallbackRunId]);
        return { event: { event: "model.event", timestamp: 1, runId: "model-run", tool: null, preview: "model-normalized", duration: null, error: false } };
      },
      messageOwnRunIdsPlan(message) {
        modelCalls.push(["messageOwnRunIdsPlan", message.id]);
        return { ids: ["model-own"] };
      },
      threadActiveRunIdsPlan() {
        modelCalls.push(["threadActiveRunIdsPlan"]);
        return { ids: ["model-active"] };
      },
      messageRunProgressIdsPlan(input) {
        modelCalls.push(["messageRunProgressIdsPlan", input.extraRunIds?.[0] || ""]);
        return { ids: ["model-run-id"] };
      },
      runProgressCompactPreflightEventsPlan(events) {
        modelCalls.push(["runProgressCompactPreflightEventsPlan", events.length]);
        return { events: [{ event: "model.compacted" }] };
      },
      runEventTitlePlan(event) {
        modelCalls.push(["runEventTitlePlan", event.event]);
        return { title: "Model title" };
      },
      runGatewayWorkerPreviewLabelPlan() {
        modelCalls.push(["runGatewayWorkerPreviewLabelPlan"]);
        return { label: "Model gateway" };
      },
      messageForRunProgressPlan() {
        modelCalls.push(["messageForRunProgressPlan"]);
        return { message: { id: "model-message" } };
      },
    };
    const context = createHarness(fakeModel);
    await context.__runProgressHarness.importRunProgressModel(context.window);
    assert.equal(context.__runProgressHarness.boundedRunEventPreview("classic"), "model-preview");
    assert.equal(context.__runProgressHarness.normalizeRunEvent({}, "fallback").event, "model.event");
    assert.deepEqual(context.__runProgressHarness.messageOwnRunIds({ id: "m1" }), ["model-own"]);
    assert.deepEqual(context.__runProgressHarness.threadActiveRunIds({}), ["model-active"]);
    assert.deepEqual(context.__runProgressHarness.messageRunProgressIds({ id: "t1" }, { id: "m1" }, { extraRunIds: ["extra"] }), ["model-run-id"]);
    assert.deepEqual(context.__runProgressHarness.runProgressCompactPreflightEvents([{}]), [{ event: "model.compacted" }]);
    assert.equal(context.__runProgressHarness.runEventTitle({ event: "run.request_sent" }), "Model title");
    assert.equal(context.__runProgressHarness.runGatewayWorkerPreviewLabel({ event: "run.gateway_worker_queued" }), "Model gateway");
    assert.equal(context.__runProgressHarness.messageForRunProgress({}, "run")?.id, "model-message");
    assert.ok(modelCalls.some((call) => call[0] === "messageRunProgressIdsPlan"));
    assert.ok(context.__calls.some((call) => call[0] === "import" && call[1] === "/vite-islands/run-progress-model/run-progress-model.js"));
  });

  await test("classic adapter preserves legacy rendering before model load", () => {
    const context = createHarness(null);
    const thread = {
      id: "thread-1",
      activeRunId: "run-1",
      activeRunIds: ["run-1"],
      messages: [
        { id: "m1", role: "assistant", status: "running", runId: "run-1", startedAt: "2026-07-05T00:00:00.000Z" },
      ],
      events: [
        { runId: "run-1", event: "run.request_sent", timestamp: "2026-07-05T00:00:01.000Z" },
        { runId: "run-1", event: "response.output_item.added", tool: "function_call", timestamp: "2026-07-05T00:00:02.000Z", preview: JSON.stringify({ name: "search_files" }) },
      ],
    };
    assert.equal(JSON.stringify(context.__runProgressHarness.messageOwnRunIds(thread.messages[0])), JSON.stringify(["run-1"]));
    assert.equal(context.__runProgressHarness.messageForRunProgress(thread, "run-1")?.id, "m1");
    const html = context.__runProgressHarness.renderMessageRunProgress(thread, thread.messages[0]);
    assert.match(html, /run-progress-panel inline/);
    assert.match(html, /Function search_files/);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
