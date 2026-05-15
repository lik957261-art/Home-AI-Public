"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const serverJs = fs.readFileSync(path.join(repoRoot, "server.js"), "utf8");

assert.match(serverJs, /const RUN_LIVENESS_STALE_AFTER_MS = Number\(process\.env\.HERMES_WEB_RUN_LIVENESS_STALE_AFTER_MS \|\| "0"\);/);
assert.match(serverJs, /createGatewayRunLifecycleService/);
assert.match(serverJs, /gatewayRunLifecycleService\.livenessDecisionAfterCheck\({/);
assert.match(serverJs, /staleAfterMs: RUN_LIVENESS_STALE_AFTER_MS/);
assert.match(serverJs, /stream\.livenessMisses = decision\.livenessMisses;/);
assert.match(serverJs, /if \(decision\.shouldAbort\)/);
assert.match(serverJs, /keeping the active stream open because long-running Gateway tools can be absent from \/v1\/runs/);
assert.doesNotMatch(serverJs, /if \(err\.status === 404\) {\s*abortActiveStreamAsFailed\(publicRunId, `Hermes Gateway no longer has run/);

console.log("run liveness tests passed");
