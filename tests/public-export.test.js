"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  shouldExport,
  transformPublicReadme,
} = require("../scripts/create-public-export");

const REPO_ROOT = path.resolve(__dirname, "..");

function testPathFilters() {
  assert.equal(shouldExport("README.md"), true);
  assert.equal(shouldExport(".env.example"), true);
  assert.equal(shouldExport(".env"), false);
  assert.equal(shouldExport(".env.local"), false);
  assert.equal(shouldExport("workspace/hermes-web/state.json"), false);
  assert.equal(shouldExport("node_modules/pkg/index.js"), false);
  assert.equal(shouldExport("AGENTS.md"), false);
  assert.equal(shouldExport(".agent-context/HANDOFF.md"), false);
}

function testReadmeTransform() {
  const input = "This repository is the private productization checkout. It was split from the larger internal workspace so Hermes Mobile can be stabilized, tested, packaged, and later exported to a clean public repository.";
  const output = transformPublicReadme(input);
  assert.match(output, /Hermes Mobile product source/);
  assert.doesNotMatch(output, /private productization checkout/);
}

function testCreatesCleanExport() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-mobile-public-export-test-"));
  const outDir = path.join(tempRoot, "hermes-mobile-public");
  try {
    const output = execFileSync(process.execPath, [
      "scripts/create-public-export.js",
      "--out",
      outDir,
      "--force",
    ], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const parsed = JSON.parse(output.slice(output.indexOf("{")));
    assert.equal(parsed.ok, true);
    assert.ok(fs.existsSync(path.join(outDir, "README.md")));
    assert.ok(fs.existsSync(path.join(outDir, "server.js")));
    assert.ok(fs.existsSync(path.join(outDir, "scripts", "privacy-scan.js")));
    assert.ok(fs.existsSync(path.join(outDir, ".public-export-report.json")));
    assert.equal(fs.existsSync(path.join(outDir, "workspace")), false);
    assert.equal(fs.existsSync(path.join(outDir, ".agent-context")), false);
    assert.equal(fs.existsSync(path.join(outDir, "AGENTS.md")), false);
    const readme = fs.readFileSync(path.join(outDir, "README.md"), "utf8");
    assert.doesNotMatch(readme, /private productization checkout/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

testPathFilters();
testReadmeTransform();
testCreatesCleanExport();
console.log("public-export tests passed");
