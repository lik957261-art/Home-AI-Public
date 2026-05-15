"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const serverJs = fs.readFileSync(path.join(repoRoot, "mobile-server-runtime.js"), "utf8");
const streamServiceJs = fs.readFileSync(path.join(repoRoot, "adapters", "gateway-run-stream-service.js"), "utf8");

assert.match(serverJs, /const RUN_LIVENESS_STALE_AFTER_MS = Number\(process\.env\.HERMES_WEB_RUN_LIVENESS_STALE_AFTER_MS \|\| "0"\);/);
assert.match(serverJs, /createGatewayRunLifecycleService/);
assert.match(serverJs, /createGatewayRunStreamService/);
assert.match(serverJs, /livenessDecisionAfterCheck: gatewayRunLifecycleService\.livenessDecisionAfterCheck/);
assert.match(serverJs, /runLivenessStaleAfterMs: RUN_LIVENESS_STALE_AFTER_MS/);
assert.match(streamServiceJs, /const \{ livenessDecisionAfterCheck \} = require\("\.\/gateway-run-lifecycle-service"\);/);
assert.match(streamServiceJs, /const decision = livenessDecision\({/);
assert.match(streamServiceJs, /staleAfterMs: configured\("runLivenessStaleAfterMs", 0\)/);
assert.match(streamServiceJs, /stream\.livenessMisses = decision\.livenessMisses;/);
assert.match(streamServiceJs, /if \(decision\.shouldAbort\)/);
assert.match(streamServiceJs, /keeping the active stream open because long-running Gateway tools can be absent from \/v1\/runs/);
assert.doesNotMatch(serverJs, /if \(err\.status === 404\) {\s*abortActiveStreamAsFailed\(publicRunId, `Hermes Gateway no longer has run/);

console.log("run liveness tests passed");
