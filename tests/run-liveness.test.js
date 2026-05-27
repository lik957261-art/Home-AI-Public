"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const serverJs = fs.readFileSync(path.join(repoRoot, "mobile-server-runtime.js"), "utf8");
const runtimeEnvironmentJs = fs.readFileSync(path.join(repoRoot, "adapters", "mobile-runtime-environment-service.js"), "utf8");
const gatewayRuntimeCompositionJs = fs.readFileSync(path.join(repoRoot, "adapters", "gateway-runtime-composition-service.js"), "utf8");
const streamServiceJs = fs.readFileSync(path.join(repoRoot, "adapters", "gateway-run-stream-service.js"), "utf8");

assert.match(runtimeEnvironmentJs, /const RUN_LIVENESS_STALE_AFTER_MS = Number\(env\.HERMES_WEB_RUN_LIVENESS_STALE_AFTER_MS \|\| "600000"\);/);
assert.match(runtimeEnvironmentJs, /const RUN_MODEL_FIRST_BYTE_WARNING_MS = Number\(env\.HERMES_MOBILE_RUN_MODEL_FIRST_BYTE_WARNING_MS \|\| env\.HERMES_WEB_RUN_MODEL_FIRST_BYTE_WARNING_MS \|\| "45000"\);/);
assert.match(gatewayRuntimeCompositionJs, /createGatewayRunLifecycleService/);
assert.match(gatewayRuntimeCompositionJs, /createGatewayRunStreamService/);
assert.match(gatewayRuntimeCompositionJs, /livenessDecisionAfterCheck: lifecycleService\.livenessDecisionAfterCheck/);
assert.match(serverJs, /runLivenessStaleAfterMs: RUN_LIVENESS_STALE_AFTER_MS/);
assert.match(serverJs, /modelFirstByteWarningMs: RUN_MODEL_FIRST_BYTE_WARNING_MS/);
assert.match(streamServiceJs, /const \{ livenessDecisionAfterCheck \} = require\("\.\/gateway-run-lifecycle-service"\);/);
assert.match(streamServiceJs, /const decision = livenessDecision\({/);
assert.match(streamServiceJs, /staleAfterMs: configuredForStream\(stream, "runLivenessStaleAfterMs", 0\)/);
assert.match(streamServiceJs, /stream\.livenessMisses = decision\.livenessMisses;/);
assert.match(streamServiceJs, /if \(decision\.shouldAbort\)/);
assert.match(streamServiceJs, /run\.model_first_byte_retrying/);
assert.match(streamServiceJs, /run\.model_stream_started/);
assert.match(streamServiceJs, /run\.model_output_started/);
assert.match(streamServiceJs, /hermes_mobile_synthetic: true/);
assert.match(streamServiceJs, /keeping the active stream open because long-running Gateway tools can be absent from \/v1\/runs/);
assert.doesNotMatch(serverJs, /if \(err\.status === 404\) {\s*abortActiveStreamAsFailed\(publicRunId, `Hermes Gateway no longer has run/);

console.log("run liveness tests passed");
