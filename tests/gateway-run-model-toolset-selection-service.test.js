"use strict";

const assert = require("node:assert/strict");
const {
  buildCapabilityCatalog,
  buildSelectionBody,
  createGatewayRunModelToolsetSelectionService,
  parseToolsetSelectionText,
} = require("../adapters/gateway-run-model-toolset-selection-service");

function baseRequest() {
  return {
    runPolicy: { allowed_toolsets: ["file", "weather", "x_search", "web"] },
    body: {
      input: "Update wardrobe weather tags",
      conversation: "conv_1",
      model: "gpt-test",
      provider: "openai-codex",
    },
    gatewayRouting: {
      searchSource: "",
      sourceIntent: "",
      sourceMode: "",
    },
  };
}

function testParsesJsonAndFiltersUnauthorizedToolsets() {
  const parsed = parseToolsetSelectionText(
    "```json\n{\"toolsets\":[\"weather\",\"shell\",\"file\"],\"reason\":\"needs weather\"}\n```",
    ["file", "weather"],
  );

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.selectedToolsets, ["weather", "file"]);
  assert.deepEqual(parsed.rejectedToolsets, ["shell"]);
}

function testInvalidSelectionFallsBack() {
  assert.deepEqual(
    parseToolsetSelectionText("not json", ["file"]),
    { ok: false, reason: "invalid_json", selectedToolsets: [], rejectedToolsets: [] },
  );
  assert.deepEqual(
    parseToolsetSelectionText("{\"toolsets\":[\"shell\"]}", ["file"]),
    { ok: false, reason: "no_authorized_toolsets_selected", selectedToolsets: [], rejectedToolsets: ["shell"] },
  );
}

function testBuildsCompactSelectorBodyWithoutCallableToolsets() {
  const body = buildSelectionBody({ request: baseRequest(), allowedToolsets: ["file", "weather"] });

  assert.equal(body.store, false);
  assert.equal(body.stream, true);
  assert.equal(body.conversation, "conv_1:toolset-selection");
  assert.deepEqual(body.access_policy_context.allowed_toolsets, []);
  assert.deepEqual(body.access_policy_context.authorized_toolsets, ["file", "weather"]);
  assert.match(body.instructions, /Return only compact JSON/);
  assert.match(body.instructions, /If uncertain, select every authorized toolset/);
}

async function testStreamsSelectorAndReturnsAuthorizedSelection() {
  const calls = [];
  const service = createGatewayRunModelToolsetSelectionService({
    nowMs: (() => {
      let value = 1000;
      return () => {
        value += 50;
        return value;
      };
    })(),
    gatewayPool: {
      runnerFor(target) {
        calls.push({ target });
        return {
          async streamResponses(body, options) {
            calls.push({ body, options });
            options.onEvent({ event: "response.output_text.delta", delta: "{\"toolsets\":[\"weather\"" });
            options.onEvent({ event: "response.output_text.delta", delta: ",\"file\"],\"reason\":\"wardrobe weather\"}" });
          },
        };
      },
    },
  });

  const result = await service.selectToolsetsForRun({
    request: baseRequest(),
    gatewayTarget: { apiBase: "http://worker", apiKey: "secret", profile: "lowgw1" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "model_first");
  assert.deepEqual(result.selectedToolsets, ["weather", "file"]);
  assert.deepEqual(result.authorizedToolsets, ["file", "weather", "x_search", "web"]);
  assert.equal(calls[1].options.gatewayUrl, "http://worker");
  assert.equal(calls[1].options.timeoutMs, 15000);
  assert.deepEqual(calls[1].body.access_policy_context.allowed_toolsets, []);
}

async function testSelectorErrorsReturnFullFallbackMetadata() {
  const service = createGatewayRunModelToolsetSelectionService({
    gatewayPool: {
      runnerFor() {
        return {
          async streamResponses() {
            throw new Error("timeout");
          },
        };
      },
    },
  });

  const result = await service.selectToolsetsForRun({
    request: baseRequest(),
    gatewayTarget: { apiBase: "http://worker" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "selector_error");
  assert.deepEqual(result.selectedToolsets, ["file", "weather", "x_search", "web"]);
  assert.match(result.error, /timeout/);
}

assert.deepEqual(buildCapabilityCatalog(["file"])[0], {
  id: "file",
  summary: "Read permitted workspace files and document attachments.",
});
testParsesJsonAndFiltersUnauthorizedToolsets();
testInvalidSelectionFallsBack();
testBuildsCompactSelectorBodyWithoutCallableToolsets();
testStreamsSelectorAndReturnsAuthorizedSelection()
  .then(testSelectorErrorsReturnFullFallbackMetadata)
  .then(() => console.log("gateway-run-model-toolset-selection-service tests passed"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
