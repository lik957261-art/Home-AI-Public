"use strict";

const assert = require("node:assert/strict");
const {
  gatewayRunCapacityReasonLabel,
  gatewayRunFailureCodeLabel,
  gatewayRunUserFacingError,
  redactGatewayRunErrorText,
} = require("../adapters/gateway-run-error-message-service");

function testCapacityReasonsBecomeUserFacingMessages() {
  const err = new Error("Gateway worker queue timed out for workspace_capacity.");
  err.code = "gateway_elastic_queue_timeout";
  err.details = { reason: "workspace_capacity", workspaceId: "owner", queueDepth: 2 };

  const message = gatewayRunUserFacingError(err);

  assert.match(message, /工作区的 AI 执行通道已满/);
  assert.doesNotMatch(message, /workspace_capacity/);
  assert.equal(gatewayRunCapacityReasonLabel("global_capacity"), "全局通道已满");
  assert.equal(gatewayRunCapacityReasonLabel("workspace_capacity"), "工作区通道已满");
  assert.equal(gatewayRunCapacityReasonLabel("profile_affinity"), "匹配通道暂不可用");
}

function testWorkerStartFailureKeepsDiagnosticsOutOfUserMessage() {
  const err = new Error("Gateway worker failed to start.");
  err.code = "gateway_elastic_worker_start_failed";
  err.details = {
    reason: "worker_start_failed",
    failureCode: "port_busy",
    diagnostic: "port 18751 busy; secret=/Users/example/path",
  };

  const message = gatewayRunUserFacingError(err);

  assert.match(message, /AI 执行通道启动失败/);
  assert.match(message, /Gateway Profile/);
  assert.doesNotMatch(message, /18751/);
  assert.doesNotMatch(message, /secret/);
  assert.equal(gatewayRunFailureCodeLabel("port_busy"), "端口被占用");
}

function testInvalidApiKeyIsSpecific() {
  const message = gatewayRunUserFacingError(new Error("Invalid API key provided"));
  assert.match(message, /API Key 无效或已过期/);
}

function testDefaultRedaction() {
  const raw = "failed with api_key=sk-example12345678901234567890 at /tmp/openai-secret/token.txt";
  const redacted = redactGatewayRunErrorText(raw);
  assert.doesNotMatch(redacted, /sk-example/);
  assert.doesNotMatch(redacted, /openai-secret/);
  assert.match(redacted, /\[redacted/);
}

function testGenericRunFailedIsActionable() {
  const message = gatewayRunUserFacingError("run failed");
  assert.match(message, /模型通道失败/);
  assert.match(message, /Gateway Profile/);
  assert.doesNotMatch(message, /^run failed$/i);
}

testCapacityReasonsBecomeUserFacingMessages();
testWorkerStartFailureKeepsDiagnosticsOutOfUserMessage();
testInvalidApiKeyIsSpecific();
testDefaultRedaction();
testGenericRunFailedIsActionable();

console.log("gateway-run-error-message-service tests passed");
