"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/chat-runtime/message-usage-model.mjs");

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
  await test("message-usage model stays browser-boundary free", () => {
    const source = read("src/vite-islands/chat-runtime/message-usage-model.mjs");
    assert.doesNotMatch(source, /\b(?:Window|window|document|localStorage|sessionStorage|fetch|setTimeout|setInterval|globalThis)\b/);
    assert.doesNotMatch(source, /\bapi\s*\(/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("normalizes token and cost usage", async () => {
    const model = await loadModel();
    assert.equal(model.numericUsageValue(undefined, "12"), 12);
    assert.equal(model.numericUsageValue("bad"), null);
    assert.equal(model.numericCostValue("", "0.001"), 0.001);
    assert.deepEqual(model.uniqueUsageLabels([" gpt ", "gpt", "", "grok"]), ["gpt", "grok"]);
    const usage = model.normalizeUsage({
      input_tokens: 100,
      output_tokens: 40,
      reasoning_tokens: 10,
      cache_read_tokens: 25,
      total_tokens: 175,
    });
    assert.equal(usage.input, 100);
    assert.equal(usage.cachedInput, 25);
    assert.equal(usage.uncachedInput, 75);
    assert.equal(usage.output, 40);
    assert.equal(usage.reasoningOutput, 10);
    assert.equal(usage.total, 175);
    assert.equal(model.normalizeUsageCost({ cost_status: "included", api_cost_usd: 2 }), "Included");
    assert.equal(model.normalizeUsageCost({ api_cost_usd: 0.00042 }), "$0.000420");
  });

  await test("normalizes model and api call rows", async () => {
    const model = await loadModel();
    const usage = {
      api_call_model_routes: [
        { model: "gpt-5", reasoning_effort: "high" },
        { model_name: "grok", reasoningEffort: "medium" },
      ],
      api_call_usage: [
        { input_tokens: 10, cached_input_tokens: 3, output_tokens: 4 },
        { prompt: 1, completion: 2, total: 5 },
      ],
    };
    assert.deepEqual(model.normalizeUsageModelCalls(usage), [
      { model: "gpt-5", reasoningEffort: "high" },
      { model: "grok", reasoningEffort: "medium" },
    ]);
    assert.deepEqual(model.normalizeUsageApiCalls(usage), [
      { model: "gpt-5", reasoningEffort: "high", input: 10, cachedInput: 3, output: 4, total: 17 },
      { model: "grok", reasoningEffort: "medium", input: 1, cachedInput: 0, output: 2, total: 5 },
    ]);
  });

  await test("plans usage labels, rows, and detail view", async () => {
    const model = await loadModel();
    const usage = {
      model: "gpt-5",
      provider: "openai",
      reasoning_effort: "high",
      input_tokens: 10,
      output_tokens: 2,
      total_tokens: 12,
      api_calls: 1,
    };
    assert.equal(model.usageModelLabelPlan({ usage, defaultModelLabel: "Default" }).label, "gpt-5");
    assert.equal(model.usageProviderLabelPlan({ usage }).label, "openai");
    assert.deepEqual(model.usageReasoningLabelPlan({ usage }).tokens, ["high"]);
    const detail = model.usageDetailsViewPlan({
      usage,
      message: {},
      defaultModelLabel: "Default",
      defaultReasoningEffort: "medium",
    });
    assert.equal(detail.visible, true);
    assert.equal(detail.total, 12);
    assert.equal(detail.titleTokenCount, "12");
    assert.deepEqual(detail.rows.map((row) => [row.label, row.value]), [
      ["Model", "gpt-5"],
      ["Provider", "openai"],
      ["Reasoning", "high"],
      ["Cached input", "Not reported"],
      ["Input total", 10],
      ["Output", 2],
      ["API calls", 1],
      ["Total", 12],
    ]);
    assert.equal(model.usageDetailsViewPlan({ usage: {} }).visible, false);
  });

  await test("plans display values and artifact icons without owning artifact rendering", async () => {
    const model = await loadModel();
    assert.deepEqual(model.formatUsageValuePlan("Included"), {
      version: model.MESSAGE_USAGE_MODEL_VERSION,
      type: "text",
      text: "Included",
    });
    assert.equal(model.formatTokenCount(1200), "1,200");
    assert.equal(model.iconForMimePlan("image/png"), "IMG");
    assert.equal(model.artifactIconPlan({ artifactKind: "markdown", mime: "text/markdown" }), "MD");
    assert.equal(model.artifactIconPlan({ artifactKind: "unknown", mime: "application/pdf" }), "PDF");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
