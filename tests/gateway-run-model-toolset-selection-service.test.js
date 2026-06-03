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
    runPolicy: { allowed_toolsets: ["file", "weather", "x_search", "web", "search", "http", "clarify"] },
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
    toolsetRouting: {
      suggested_toolsets: ["file", "weather"],
      suggested_reason: "matched_intent",
    },
  };
}

function testParsesJsonAndFiltersUnauthorizedToolsets() {
  const parsed = parseToolsetSelectionText(
    "```json\n{\"decision\":\"allowed\",\"toolsets\":[\"weather\",\"shell\",\"file\"],\"reason\":\"needs weather\"}\n```",
    ["file", "weather"],
  );

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.selectedToolsets, ["weather", "file"]);
  assert.deepEqual(parsed.rejectedToolsets, ["shell"]);
}

function testParsesPermissionDecisionBeforeToolsets() {
  const parsed = parseToolsetSelectionText(
    "{\"decision\":\"needs_elevation\",\"scope\":\"owner_high_privilege\",\"reason\":\"outside current workspace\"}",
    ["file", "weather"],
  );

  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, "permission_approval_required");
  assert.equal(parsed.elevationRequired, true);
  assert.equal(parsed.elevationScope, "owner_high_privilege");
  assert.equal(parsed.elevationReason, "outside current workspace");

  const marker = parseToolsetSelectionText(
    "HERMES_PERMISSION_APPROVAL_REQUIRED {\"scope\":\"owner_high_privilege\",\"reason\":\"needs owner\"}",
    ["file"],
  );
  assert.equal(marker.elevationRequired, true);
  assert.equal(marker.elevationReason, "needs owner");
}

function testParsesLastBalancedJsonWhenStreamRepeatsOutput() {
  const repeated = [
    "{\"decision\":\"allowed\",\"toolsets\":[\"weather\"],\"reason\":\"delta\"}",
    "{\"decision\":\"allowed\",\"toolsets\":[\"file\"],\"reason\":\"done\"}",
  ].join("");
  const parsed = parseToolsetSelectionText(repeated, ["file", "weather"]);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.selectedToolsets, ["file"]);
  assert.equal(parsed.reason, "done");
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
  assert.equal(body.model, "gpt-test");
  assert.equal(body.provider, "openai-codex");
  assert.equal(body.conversation, "conv_1:toolset-selection");
  assert.equal(body.tool_choice, "none");
  assert.equal(body.parallel_tool_calls, false);
  assert.deepEqual(body.access_policy_context.allowed_toolsets, []);
  assert.deepEqual(body.access_policy_context.authorized_toolsets, ["file", "weather"]);
  assert.match(body.instructions, /permission and toolset preflight/);
  assert.match(body.instructions, /hermes-mobile-permission-boundary-check/);
  assert.match(body.instructions, /Do not browse, search, call tools, or load skills/);
  assert.match(body.instructions, /"decision":"needs_elevation"/);
  assert.match(body.instructions, /do not select every authorized toolset merely because the task is ambiguous/i);
  assert.match(body.instructions, /use suggested_toolsets when it is non-empty/i);
  const summary = JSON.parse(body.instructions.split(/\n/).slice(-1)[0]);
  assert.deepEqual(summary.suggested_toolsets, ["file", "weather"]);
}

function testBuildsPermissionOnlyBodyWhenToolsetSelectionDisabled() {
  const body = buildSelectionBody({
    request: baseRequest(),
    allowedToolsets: ["file", "weather"],
    toolsetSelectionEnabled: false,
  });

  assert.match(body.instructions, /permission preflight/);
  assert.doesNotMatch(body.instructions, /choose the smallest execution toolset set/);
  assert.match(body.instructions, /Do not choose, omit, or optimize execution toolsets/);
  assert.equal(body.access_policy_context.toolset_selection_only, false);
  assert.equal(body.access_policy_context.permission_preflight_only, true);
  assert.equal(body.access_policy_context.toolset_routing.mode, "permission_preflight");
  assert.deepEqual(body.access_policy_context.authorized_toolsets, ["file", "weather"]);
}

function testSelectorModelOverrideUsesLightweightModel() {
  const body = buildSelectionBody({
    request: baseRequest(),
    allowedToolsets: ["file", "weather"],
    selectorModel: "gpt-selector-mini",
    selectorProvider: "openai-codex",
    selectorReasoningEffort: "minimal",
  });

  assert.equal(body.model, "gpt-selector-mini");
  assert.equal(body.provider, "openai-codex");
  assert.equal(body.reasoning_effort, "minimal");
}

async function testPermissionPreflightIsSkippedWhenToolsetSelectionDisabled() {
  const calls = [];
  const service = createGatewayRunModelToolsetSelectionService({
    toolsetSelectionEnabled: false,
    nowMs: (() => {
      let value = 2000;
      return () => {
        value += 20;
        return value;
      };
    })(),
    gatewayPool: {
      runnerFor() {
        return {
          async streamResponses(body, options) {
            calls.push({ body, options });
            options.onEvent({ event: "response.output_text.delta", delta: "{\"decision\":\"allowed\",\"reason\":\"inside current workspace\"}" });
          },
        };
      },
    },
  });

  const result = await service.selectToolsetsForRun({
    request: baseRequest(),
    gatewayTarget: { apiBase: "http://worker", apiKey: "key" },
  });

  assert.equal(result.enabled, false);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "permission_preflight_disabled");
  assert.equal(result.toolsetSelectionDisabled, true);
  assert.deepEqual(result.selectedToolsets, ["file", "weather", "x_search", "web", "search", "http", "clarify"]);
  assert.deepEqual(result.authorizedToolsets, ["file", "weather", "x_search", "web", "search", "http", "clarify"]);
  assert.equal(calls.length, 0);
}

async function testPermissionPreflightDisabledDoesNotUseSeparateTimeout() {
  const calls = [];
  const service = createGatewayRunModelToolsetSelectionService({
    toolsetSelectionEnabled: false,
    permissionPreflightTimeoutMs: 3500,
    timeoutMs: 45000,
    gatewayPool: {
      runnerFor() {
        return {
          async streamResponses(body, options) {
            calls.push({ body, options });
            options.onEvent({ event: "response.output_text.delta", delta: "{\"decision\":\"allowed\"}" });
          },
        };
      },
    },
  });

  await service.selectToolsetsForRun({
    request: baseRequest(),
    gatewayTarget: { apiBase: "http://worker", apiKey: "key" },
  });

  assert.equal(calls.length, 0);
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
  assert.deepEqual(result.authorizedToolsets, ["file", "weather", "x_search", "web", "search", "http", "clarify"]);
  assert.equal(calls[1].options.gatewayUrl, "http://worker");
  assert.equal(calls[1].options.timeoutMs, 30000);
  assert.equal(calls[1].body.model, "gpt-5.4-mini");
  assert.equal(calls[1].body.provider, "openai-codex");
  assert.deepEqual(calls[1].body.access_policy_context.allowed_toolsets, []);
}

async function testUncertainAllToolsetsSelectionNarrowsToSuggestedToolsets() {
  const request = baseRequest();
  request.body.input = "测试";
  request.toolsetRouting = {
    suggested_toolsets: ["clarify"],
    suggested_reason: "plain_chat_light_tools",
  };
  const service = createGatewayRunModelToolsetSelectionService({
    gatewayPool: {
      runnerFor() {
        return {
          async streamResponses(_body, options) {
            options.onEvent({
              event: "response.output_text.delta",
              delta: JSON.stringify({
                decision: "allowed",
                toolsets: ["file", "weather", "x_search", "web", "search", "http", "clarify"],
                reason: "具体工具需求不明确，选择全部已授权工具集",
              }),
            });
          },
        };
      },
    },
  });

  const result = await service.selectToolsetsForRun({
    request,
    gatewayTarget: { apiBase: "http://worker" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.selectionConstrained, true);
  assert.deepEqual(result.selectedToolsets, ["clarify"]);
  assert.match(result.reason, /narrowed_to_suggested_toolsets/);
}

async function testPlainProbeClarifySelectionExpandsToSuggestedToolsets() {
  const request = baseRequest();
  request.body.input = "测试";
  request.toolsetRouting = {
    suggested_toolsets: ["web", "search", "x_search", "http", "clarify"],
    suggested_reason: "plain_chat_light_tools",
  };
  const service = createGatewayRunModelToolsetSelectionService({
    gatewayPool: {
      runnerFor() {
        return {
          async streamResponses(_body, options) {
            options.onEvent({
              event: "response.output_text.delta",
              delta: JSON.stringify({
                decision: "allowed",
                toolsets: ["clarify"],
                reason: "plain test message",
              }),
            });
          },
        };
      },
    },
  });

  const result = await service.selectToolsetsForRun({
    request,
    gatewayTarget: { apiBase: "http://worker" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.selectionConstrained, true);
  assert.deepEqual(result.selectedToolsets, ["web", "search", "x_search", "http", "clarify"]);
  assert.match(result.reason, /expanded_to_suggested_toolsets/);
}

async function testWardrobeClarifySelectionExpandsToSuggestedMcpStack() {
  const request = baseRequest();
  request.runPolicy.allowed_toolsets = ["wardrobe", "vision", "file", "skills", "clarify", "web"];
  request.body.input = "\u68c0\u67e5\u5f53\u524d\u4f1a\u8bdd\u662f\u5426\u5df2\u7ecf\u6302\u51fa\u8863\u6a71 MCP";
  request.toolsetRouting = {
    suggested_toolsets: ["wardrobe", "vision", "file", "skills"],
    suggested_reason: "matched_intent",
  };
  const service = createGatewayRunModelToolsetSelectionService({
    gatewayPool: {
      runnerFor() {
        return {
          async streamResponses(_body, options) {
            options.onEvent({
              event: "response.output_text.delta",
              delta: JSON.stringify({
                decision: "allowed",
                toolsets: ["clarify"],
                reason: "diagnostic question",
              }),
            });
          },
        };
      },
    },
  });

  const result = await service.selectToolsetsForRun({
    request,
    gatewayTarget: { apiBase: "http://worker" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.selectionConstrained, true);
  assert.deepEqual(result.selectedToolsets, ["wardrobe", "vision", "file", "skills"]);
  assert.match(result.reason, /expanded_to_suggested_wardrobe_toolsets/);
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
  assert.deepEqual(result.selectedToolsets, ["file", "weather", "x_search", "web", "search", "http", "clarify"]);
  assert.match(result.error, /timeout/);
}

async function testSelectorFallbackUsesAuthorizedToolsetsWhenAllowedWasSuggested() {
  const request = baseRequest();
  request.runPolicy = {
    allowed_toolsets: ["wardrobe", "vision", "file", "skills"],
    authorized_toolsets: ["wardrobe", "vision", "file", "skills", "weather", "web", "search", "browser"],
  };
  request.toolsetRouting = {
    suggested_toolsets: ["wardrobe", "vision", "file", "skills", "weather"],
    suggested_reason: "wardrobe_weather",
  };
  const service = createGatewayRunModelToolsetSelectionService({
    gatewayPool: {
      runnerFor() {
        return {
          async streamResponses(_body, options) {
            options.onEvent({ event: "response.output_text.delta", delta: "not json" });
          },
        };
      },
    },
  });

  const result = await service.selectToolsetsForRun({
    request,
    gatewayTarget: { apiBase: "http://worker" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_json");
  assert.deepEqual(result.authorizedToolsets, ["wardrobe", "vision", "file", "skills", "weather", "web", "search", "browser"]);
  assert.deepEqual(result.selectedToolsets, []);
}

async function testSelectorErrorStopsKnownSelectorRun() {
  const calls = [];
  const service = createGatewayRunModelToolsetSelectionService({
    stopTimeoutMs: 750,
    gatewayPool: {
      runnerFor() {
        return {
          async streamResponses(_body, options) {
            options.onEvent({ event: "response.created", response: { id: "resp_selector_1" } });
            throw new Error("selector aborted");
          },
          stopRun(runId, options) {
            calls.push({ runId, options });
            return Promise.resolve({ ok: true });
          },
        };
      },
    },
  });

  const result = await service.selectToolsetsForRun({
    request: baseRequest(),
    gatewayTarget: { apiBase: "http://worker", apiKey: "secret" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "selector_error");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].runId, "resp_selector_1");
  assert.equal(calls[0].options.apiBase, "http://worker");
  assert.equal(calls[0].options.timeoutMs, 750);
}

assert.deepEqual(buildCapabilityCatalog(["file"])[0], {
  id: "file",
  summary: "Read permitted workspace files and document attachments.",
});
assert.deepEqual(buildCapabilityCatalog(["wardrobe"])[0], {
  id: "wardrobe",
  summary: "Read, write, and verify the current workspace wardrobe database through the Wardrobe MCP.",
});
testParsesJsonAndFiltersUnauthorizedToolsets();
testParsesPermissionDecisionBeforeToolsets();
testParsesLastBalancedJsonWhenStreamRepeatsOutput();
testInvalidSelectionFallsBack();
testBuildsCompactSelectorBodyWithoutCallableToolsets();
testBuildsPermissionOnlyBodyWhenToolsetSelectionDisabled();
testSelectorModelOverrideUsesLightweightModel();
testStreamsSelectorAndReturnsAuthorizedSelection()
  .then(testPermissionPreflightIsSkippedWhenToolsetSelectionDisabled)
  .then(testPermissionPreflightDisabledDoesNotUseSeparateTimeout)
  .then(testUncertainAllToolsetsSelectionNarrowsToSuggestedToolsets)
  .then(testPlainProbeClarifySelectionExpandsToSuggestedToolsets)
  .then(testWardrobeClarifySelectionExpandsToSuggestedMcpStack)
  .then(testSelectorErrorsReturnFullFallbackMetadata)
  .then(testSelectorFallbackUsesAuthorizedToolsetsWhenAllowedWasSuggested)
  .then(testSelectorErrorStopsKnownSelectorRun)
  .then(() => console.log("gateway-run-model-toolset-selection-service tests passed"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
