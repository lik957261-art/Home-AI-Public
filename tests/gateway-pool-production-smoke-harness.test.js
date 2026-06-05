"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(repoRoot, "scripts", "gateway-pool-production-smoke.js"), "utf8");
const testMatrix = fs.readFileSync(path.join(repoRoot, "docs", "TEST_MATRIX.md"), "utf8");

assert.match(script, /--model <model>/);
assert.match(script, /--provider <id>/);
assert.match(script, /--maintenance/);
assert.match(script, /--expected-profile <p>/);
assert.match(script, /\/api\/owner-elevation\/once/);
assert.match(script, /ownerElevationOnceToken/);
assert.match(script, /maintenanceMode = true/);
assert.match(script, /messageBody\.model = options\.model/);
assert.match(script, /messageBody\.provider = options\.provider/);
assert.match(script, /headers\["X-Hermes-Web-Key"\]/);
assert.match(script, /crypto\.randomBytes\(4\)\.toString\("hex"\)/);
assert.doesNotMatch(script, /X-Hermes-Access-Key/);
assert.doesNotMatch(script, /console\.log\(\s*options\.key/);
assert.doesNotMatch(script, /console\.error\(\s*options\.key/);
assert.doesNotMatch(script, /console\.log\(\s*ownerElevationOnceToken/);
assert.doesNotMatch(script, /console\.error\(\s*ownerElevationOnceToken/);
assert.match(testMatrix, /gateway-pool-production-smoke-harness\.test\.js/);
assert.match(testMatrix, /gateway-pool-production-smoke\.js --key-file <file> --model deepseek-chat --provider deepseek/);

console.log("gateway pool production smoke harness passed");
