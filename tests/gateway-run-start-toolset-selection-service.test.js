"use strict";

const assert = require("node:assert/strict");
const {
  createGatewayRunStartToolsetSelectionService,
} = require("../adapters/gateway-run-start-toolset-selection-service");

function testRestoreAuthorizedToolsetsUsesSelectionActiveToolsets() {
  const service = createGatewayRunStartToolsetSelectionService();
  const request = {
    runPolicy: {
      allowed_toolsets: ["file"],
      authorized_toolsets: ["file", "weather", "web"],
      active_schema_set: {
        active_toolsets: ["file"],
        omitted_plugin_toolsets: ["weather", "finance"],
      },
    },
    body: {
      access_policy_context: {
        allowed_toolsets: ["file"],
        authorized_toolsets: ["file", "weather", "web"],
      },
      enabled_toolsets: ["file"],
    },
  };

  const result = service.restoreAuthorizedToolsetsForSelectionFallback(request, {
    activeToolsets: ["file", "weather", "file"],
    authorizedToolsets: ["file", "weather", "web"],
  });

  assert.equal(result, request);
  assert.deepEqual(request.runPolicy.allowed_toolsets, ["file", "weather"]);
  assert.deepEqual(request.runPolicy.authorized_toolsets, ["file", "weather", "web"]);
  assert.deepEqual(request.runPolicy.active_schema_set.active_toolsets, ["file", "weather"]);
  assert.deepEqual(request.runPolicy.active_schema_set.omitted_plugin_toolsets, ["finance"]);
  assert.deepEqual(request.body.access_policy_context.allowed_toolsets, ["file", "weather"]);
  assert.deepEqual(request.body.access_policy_context.authorized_toolsets, ["file", "weather", "web"]);
  assert.deepEqual(request.body.enabled_toolsets, ["file", "weather"]);
}

function testRestoreAuthorizedToolsetsFallsBackToAuthorizedWhenNoActiveSet() {
  const service = createGatewayRunStartToolsetSelectionService();
  const request = {
    runPolicy: {},
    body: { access_policy_context: {} },
  };

  service.restoreAuthorizedToolsetsForSelectionFallback(request, {
    authorized_toolsets: ["file", "web", "file"],
  });

  assert.deepEqual(request.runPolicy.allowed_toolsets, ["file", "web"]);
  assert.deepEqual(request.runPolicy.authorized_toolsets, ["file", "web"]);
  assert.deepEqual(request.body.access_policy_context.allowed_toolsets, ["file", "web"]);
  assert.deepEqual(request.body.enabled_toolsets, ["file", "web"]);
}

function testRestoreAuthorizedToolsetsLeavesRequestWithoutCandidatesUntouched() {
  const service = createGatewayRunStartToolsetSelectionService();
  const request = { runPolicy: {}, body: { instructions: "base" } };

  const result = service.restoreAuthorizedToolsetsForSelectionFallback(request, {});

  assert.equal(result, request);
  assert.deepEqual(request, { runPolicy: {}, body: { instructions: "base" } });
}

function testAppendToolsetEscalationInstructionsListsOmittedAuthorizedToolsets() {
  const service = createGatewayRunStartToolsetSelectionService();
  const request = { body: { instructions: "Base instructions." } };

  const result = service.appendToolsetEscalationInstructions(request, {
    authorizedToolsets: ["file", "weather", "web", "file"],
  }, ["weather"]);

  assert.equal(result, request);
  assert.match(request.body.instructions, /Base instructions\./);
  assert.match(request.body.instructions, /Enabled toolsets: weather/);
  assert.match(request.body.instructions, /Omitted authorized toolsets: file, web/);
  assert.match(request.body.instructions, /HERMES_TOOLSET_ESCALATION_REQUIRED/);
}

function testAppendToolsetEscalationInstructionsSkipsWithoutOmittedToolsets() {
  const service = createGatewayRunStartToolsetSelectionService();
  const request = { body: { instructions: "Base instructions." } };

  service.appendToolsetEscalationInstructions(request, {
    authorizedToolsets: ["file", "weather"],
  }, ["file", "weather"]);

  assert.equal(request.body.instructions, "Base instructions.");
}

testRestoreAuthorizedToolsetsUsesSelectionActiveToolsets();
testRestoreAuthorizedToolsetsFallsBackToAuthorizedWhenNoActiveSet();
testRestoreAuthorizedToolsetsLeavesRequestWithoutCandidatesUntouched();
testAppendToolsetEscalationInstructionsListsOmittedAuthorizedToolsets();
testAppendToolsetEscalationInstructionsSkipsWithoutOmittedToolsets();

console.log("gateway run-start toolset selection service tests passed");
