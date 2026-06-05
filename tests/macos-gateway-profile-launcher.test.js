"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(repoRoot, "scripts", "macos-launch-gateway-profile.sh"), "utf8");
const gatewayPoolDoc = fs.readFileSync(path.join(repoRoot, "docs", "MODULES", "gateway-pool.md"), "utf8");
const schedulingDoc = fs.readFileSync(path.join(repoRoot, "docs", "IMPLEMENTATION_NOTES", "gateway-elastic-worker-scheduling.md"), "utf8");
const testMatrix = fs.readFileSync(path.join(repoRoot, "docs", "TEST_MATRIX.md"), "utf8");

assert.match(script, /^#!\/usr\/bin\/env bash/);
assert.match(script, /set -euo pipefail/);
assert.match(script, /HERMES_MOBILE_GATEWAY_POOL_MANIFEST/);
assert.match(script, /--start-profiles\|-StartProfiles/);
assert.match(script, /--stop-profiles\|-StopProfiles/);
assert.match(script, /--start-replicas\|-StartReplicas/);
assert.match(script, /--stop-replicas\|-StopReplicas/);
assert.match(script, /--owner-maintenance-only\|-OwnerMaintenanceOnly/);
assert.match(script, /--no-stop-existing\|-NoStopExisting/);
assert.match(script, /--force-configure\|-ForceConfigure/);
assert.match(script, /--pool-key\|-PoolKey/);
assert.match(script, /--profile-template-key\|-ProfileTemplateKey/);
assert.match(script, /--tool-schema-epoch\|-ToolSchemaEpoch/);
assert.match(script, /workers\[key\] = row/);
assert.match(script, /security_level != "owner-maintenance"/);
assert.match(script, /"kickstart"/);
assert.match(script, /cmd\.append\("-k"\)/);
assert.match(script, /"kill", "SIGTERM"/);
assert.match(script, /safe_label = re\.compile/);
assert.doesNotMatch(script, /API[_-]?KEY/i);
assert.doesNotMatch(script, /access[_-]?key/i);
assert.doesNotMatch(script, /token/i);

assert.match(gatewayPoolDoc, /scripts\/macos-launch-gateway-profile\.sh/);
assert.match(gatewayPoolDoc, /StartReplicas/);
assert.match(gatewayPoolDoc, /OwnerMaintenanceOnly/);
assert.match(schedulingDoc, /scripts\/macos-launch-gateway-profile\.sh/);
assert.match(schedulingDoc, /metadata/);
assert.match(testMatrix, /macos-gateway-profile-launcher\.test\.js/);

console.log("macOS Gateway profile launcher harness passed");
