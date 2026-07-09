"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  CURRENT_HOST_RESIDUAL_MAX,
  evaluateGrowthHostResidualBoundary,
} = require("../scripts/growth-host-residual-boundary-check");

const repoRoot = path.resolve(__dirname, "..");

function makeTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-growth-boundary-"));
  for (const dir of ["adapters", "server-routes", "public", "tests", "scripts", "docs/IMPLEMENTATION_NOTES", "docs/MODULES"]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  fs.writeFileSync(path.join(root, "docs/IMPLEMENTATION_NOTES/growth-pluginization-plan.md"), [
    "Home AI remains the owner of:",
    "Growth plugin becomes the owner of:",
    "The mature Growth implementation still lives in the Home AI host",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "docs/MODULES/growth-learning.md"), [
    "production default is",
    "growth_plugin_owned",
    "Growth plugin SQLite migration is now the production Growth read source",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "docs/ARCHITECTURE_BOUNDARY.md"), [
    "Growth Plugin Ownership Boundary",
    "Growth plugin owns learner programs",
    "node scripts/growth-host-residual-boundary-check.js --json",
  ].join("\n"));
  return root;
}

function touch(root, relativePath) {
  const absolute = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, "\"use strict\";\n");
}

function testCurrentRepositoryPassesBoundary() {
  const result = evaluateGrowthHostResidualBoundary({ root: repoRoot });
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.deepEqual(result.limits, CURRENT_HOST_RESIDUAL_MAX);
  assert.equal(result.counts.adapters <= result.limits.adapters, true);
  assert.equal(result.counts["server-routes"] <= result.limits["server-routes"], true);
  assert.equal(result.counts.public <= result.limits.public, true);
  assert.equal(result.counts.tests <= result.limits.tests, true);
  assert.equal(result.counts.scripts <= result.limits.scripts, true);
}

function testNewHostGrowthBusinessFilesFailClosed() {
  const root = makeTempRepo();
  touch(root, "adapters/learning-plan-new-host-business-service.js");
  const result = evaluateGrowthHostResidualBoundary({
    root,
    limits: {
      adapters: 0,
      "server-routes": 0,
      public: 0,
      tests: 0,
      scripts: 0,
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].code, "growth_host_residual_count_exceeded");
  assert.equal(result.issues[0].dir, "adapters");
}

function testVoiceLearningFilesDoNotCountAsGrowthResiduals() {
  const root = makeTempRepo();
  touch(root, "tests/vite-voice-learning-model.test.js");
  touch(root, "public/app-voice-learning-ui.js");
  const result = evaluateGrowthHostResidualBoundary({
    root,
    limits: {
      adapters: 0,
      "server-routes": 0,
      public: 0,
      tests: 0,
      scripts: 0,
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(result.counts.public, 0);
  assert.equal(result.counts.tests, 0);
}

function testMissingBoundaryDocsFailClosed() {
  const root = makeTempRepo();
  fs.writeFileSync(path.join(root, "docs/ARCHITECTURE_BOUNDARY.md"), "No boundary marker here.\n");
  const result = evaluateGrowthHostResidualBoundary({ root });
  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) => issue.code === "growth_host_boundary_doc_marker_missing"),
    true,
  );
}

function testCliJsonOutput() {
  const run = spawnSync(process.execPath, [
    "scripts/growth-host-residual-boundary-check.js",
    "--json",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const payload = JSON.parse(run.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.boundary.owner, "growth-plugin");
}

testCurrentRepositoryPassesBoundary();
testNewHostGrowthBusinessFilesFailClosed();
testVoiceLearningFilesDoNotCountAsGrowthResiduals();
testMissingBoundaryDocsFailClosed();
testCliJsonOutput();

console.log("growth-host-residual-boundary-check tests passed");
