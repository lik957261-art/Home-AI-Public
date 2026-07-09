"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-message-usage-ui.js"), "utf8");

function createHarness(fakeModel = null) {
  const calls = [];
  const context = {
    console,
    Promise,
    globalThis: null,
    window: {
      __homeAiImportMessageUsageModel(importPath) {
        calls.push(["import", importPath]);
        return Promise.resolve(fakeModel);
      },
    },
    state: {
      defaultModel: "Default Model",
      assistantLabel: "Home AI",
      defaultReasoningEffort: "medium",
    },
    escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/"/g, "&quot;");
    },
    displayArtifacts: (artifacts) => artifacts || [],
    artifactKind: (artifact) => artifact?.kind || "",
    artifactHref: (artifact) => artifact?.href || "#",
    artifactDisplayName: (artifact) => artifact?.name || "artifact",
    formatBytes: (value) => `${value || 0} B`,
    renderArtifactDirectoryButton: () => "<button data-dir>Dir</button>",
    reasoningEffortLabel: (value) => `reason:${value}`,
    __calls: calls,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.__messageUsageHarness = {
  MESSAGE_USAGE_MODEL_ESM_PATH,
  importMessageUsageModel,
  currentMessageUsageModel,
  iconForArtifact,
  iconForMime,
  uniqueUsageLabels,
  normalizeUsageModelCalls,
  usageModelLabel,
  usageProviderLabel,
  usageReasoningLabel,
  renderUsage,
  numericUsageValue,
  normalizeUsage,
  normalizeUsageApiCalls,
  normalizeUsageCost,
  numericCostValue,
  formatTokenCount,
  formatUsageValue,
  renderArtifacts,
};`, context, { filename: "app-message-usage-ui.js" });
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
  await test("classic message-usage adapter declares bounded ESM import path", () => {
    assert.match(source, /MESSAGE_USAGE_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/message-usage-model\/message-usage-model\.js/);
    assert.match(source, /__homeAiImportMessageUsageModel/);
    assert.match(source, /importMessageUsageModel/);
    assert.match(source, /currentMessageUsageModel/);
    assert.match(source, /usageDetailsViewPlan/);
    assert.match(source, /formatUsageValuePlan/);
  });

  await test("classic adapter consumes ESM model for pure usage plans", async () => {
    const modelCalls = [];
    const fakeModel = {
      artifactIconPlan(input) {
        modelCalls.push(["artifactIconPlan", input.artifactKind]);
        return "MODEL-ICON";
      },
      iconForMimePlan(mime) {
        modelCalls.push(["iconForMimePlan", mime]);
        return "MODEL-MIME";
      },
      uniqueUsageLabels(values) {
        modelCalls.push(["uniqueUsageLabels", values.length]);
        return ["model-label"];
      },
      normalizeUsageModelCalls() {
        modelCalls.push(["normalizeUsageModelCalls"]);
        return [{ model: "model-a", reasoningEffort: "high" }];
      },
      usageModelLabelPlan() {
        modelCalls.push(["usageModelLabelPlan"]);
        return { label: "Model Label" };
      },
      usageProviderLabelPlan() {
        modelCalls.push(["usageProviderLabelPlan"]);
        return { label: "Model Provider" };
      },
      usageReasoningLabelPlan() {
        modelCalls.push(["usageReasoningLabelPlan"]);
        return { tokens: ["xhigh"] };
      },
      usageDetailsViewPlan() {
        modelCalls.push(["usageDetailsViewPlan"]);
        return {
          visible: true,
          total: 1234,
          rows: [
            { label: "Model", value: "Model Label" },
            { label: "Reasoning", value: "xhigh" },
            { label: "Total", value: 1234 },
          ],
          apiCallRows: [
            { model: "api-model", reasoningEffort: "high", input: 10, cachedInput: 2, output: 3, total: 15 },
          ],
          reasoningTokens: ["xhigh"],
        };
      },
      numericUsageValue() {
        modelCalls.push(["numericUsageValue"]);
        return 99;
      },
      normalizeUsage() {
        modelCalls.push(["normalizeUsage"]);
        return { total: 99 };
      },
      normalizeUsageApiCalls() {
        modelCalls.push(["normalizeUsageApiCalls"]);
        return [];
      },
      normalizeUsageCost() {
        modelCalls.push(["normalizeUsageCost"]);
        return "Included";
      },
      numericCostValue() {
        modelCalls.push(["numericCostValue"]);
        return 0.5;
      },
      formatTokenCount(value) {
        modelCalls.push(["formatTokenCount", value]);
        return `fmt:${value}`;
      },
      formatUsageValuePlan(value) {
        modelCalls.push(["formatUsageValuePlan", value]);
        return typeof value === "string"
          ? { type: "text", text: value }
          : { type: "number", text: `num:${value}` };
      },
    };
    const context = createHarness(fakeModel);
    await context.__messageUsageHarness.importMessageUsageModel(context.window);
    assert.equal(context.__messageUsageHarness.MESSAGE_USAGE_MODEL_ESM_PATH, "/vite-islands/message-usage-model/message-usage-model.js");
    assert.ok(context.__calls.some((call) => call[0] === "import" && call[1] === "/vite-islands/message-usage-model/message-usage-model.js"));
    assert.equal(context.__messageUsageHarness.iconForArtifact({ kind: "pdf" }), "MODEL-ICON");
    assert.equal(context.__messageUsageHarness.iconForMime("image/png"), "MODEL-MIME");
    assert.deepEqual(Array.from(context.__messageUsageHarness.uniqueUsageLabels(["a", "b"])), ["model-label"]);
    assert.deepEqual(JSON.parse(JSON.stringify(context.__messageUsageHarness.normalizeUsageModelCalls({}))), [{ model: "model-a", reasoningEffort: "high" }]);
    assert.equal(context.__messageUsageHarness.usageModelLabel({}, {}, []), "Model Label");
    assert.equal(context.__messageUsageHarness.usageProviderLabel({}, {}), "Model Provider");
    assert.equal(context.__messageUsageHarness.usageReasoningLabel({}, {}, []), "reason:xhigh");
    const html = context.__messageUsageHarness.renderUsage({ total_tokens: 1 }, {});
    assert.match(html, /Usage: fmt:1234 tokens/);
    assert.match(html, /Model Label/);
    assert.match(html, /reason:xhigh/);
    assert.match(html, /api-model \/ high/);
    assert.equal(context.__messageUsageHarness.numericUsageValue("1"), 99);
    assert.deepEqual({ ...context.__messageUsageHarness.normalizeUsage({ total: 1 }) }, { total: 99 });
    assert.deepEqual(Array.from(context.__messageUsageHarness.normalizeUsageApiCalls({})), []);
    assert.equal(context.__messageUsageHarness.normalizeUsageCost({}), "Included");
    assert.equal(context.__messageUsageHarness.numericCostValue("1"), 0.5);
    assert.equal(context.__messageUsageHarness.formatTokenCount(2), "fmt:2");
    assert.equal(context.__messageUsageHarness.formatUsageValue("<x>"), "&lt;x>");
    assert.ok(modelCalls.some((call) => call[0] === "usageDetailsViewPlan"));
  });

  await test("classic adapter preserves legacy behavior before model load", () => {
    const context = createHarness(null);
    assert.equal(context.__messageUsageHarness.iconForArtifact({ kind: "markdown", mime: "text/markdown" }), "MD");
    assert.equal(context.__messageUsageHarness.iconForMime("audio/mpeg"), "AUD");
    assert.deepEqual(Array.from(context.__messageUsageHarness.uniqueUsageLabels([" gpt ", "gpt", ""])), ["gpt"]);
    const usage = {
      model: "gpt-5",
      provider: "openai",
      reasoning_effort: "high",
      input_tokens: 10,
      cached_input_tokens: 4,
      output_tokens: 2,
      total_tokens: 16,
      api_call_usage: [
        { model: "api-model", input_tokens: 1, cached_input_tokens: 2, output_tokens: 3 },
      ],
      api_calls: 1,
      cost_status: "included",
    };
    assert.equal(context.__messageUsageHarness.usageModelLabel(usage, {}, []), "gpt-5");
    assert.equal(context.__messageUsageHarness.usageProviderLabel(usage, {}), "openai");
    assert.equal(context.__messageUsageHarness.usageReasoningLabel(usage, {}, []), "reason:high");
    assert.deepEqual({ ...context.__messageUsageHarness.normalizeUsage(usage) }, {
      input: 10,
      output: 2,
      total: 16,
      cachedInput: 4,
      uncachedInput: 6,
      reasoningOutput: null,
    });
    const html = context.__messageUsageHarness.renderUsage(usage, {});
    assert.match(html, /Usage: 16 tokens/);
    assert.match(html, /gpt-5/);
    assert.match(html, /Included/);
    assert.match(html, /api-model/);
    assert.match(context.__messageUsageHarness.renderArtifacts([
      { kind: "pdf", href: "/a.pdf", name: "A", mime: "application/pdf", size: 12 },
    ]), /data-dir/);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
