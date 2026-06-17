"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  sanitizePublicText,
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
  assert.equal(shouldExport("docs/LOW_GATEWAY_RUNTIME_INCIDENT_2026-05-12.zh-CN.md"), false);
  assert.equal(shouldExport("docs/AGENT_WINDOWS_PRODUCTION_DEPLOYMENT.zh-CN.md"), true);
}

function testReadmeTransform() {
  const input = "This repository is the internal productization checkout. It was split from a larger integration workspace so Hermes Mobile can be stabilized, tested, packaged, and exported safely.";
  const output = transformPublicReadme(input);
  assert.match(output, /public Home AI product source/);
  assert.doesNotMatch(output, /internal productization checkout/);
}

function testPublicTextSanitizer() {
  const input = [
    "C:\\Users\\private-user\\Documents\\Agent",
    ["/home", "private-user", "project"].join("/"),
    ["/mnt/c", "Users", "private-user", "Documents", "Agent"].join("/"),
    "/Users/example/path",
    "/home/hermes/runtime",
    "/home/example/path",
  ].join("\n");
  const output = sanitizePublicText(input);
  assert.doesNotMatch(output, /private-user/);
  assert.match(output, /C:\\Users\\example\\path/);
  assert.match(output, /\/home\/example\/path/);
  assert.match(output, /\/mnt\/example\/path/);
  assert.match(output, /\/Users\/example\/path/);
  assert.match(output, /\/home\/hermes\/runtime/);
}

function testCreatesCleanExport() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "home-ai-public-export-test-"));
  const outDir = path.join(tempRoot, "Home-AI-Public");
  try {
    const output = execFileSync(process.execPath, [
      "scripts/create-public-export.js",
      "--out",
      outDir,
      "--force",
      "--allow-dirty",
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
    assert.equal(fs.existsSync(path.join(outDir, "docs", "LOW_GATEWAY_RUNTIME_INCIDENT_2026-05-12.zh-CN.md")), false);
    assert.equal(fs.existsSync(path.join(outDir, "docs", "AGENT_WINDOWS_PRODUCTION_DEPLOYMENT.zh-CN.md")), true);
    const readme = fs.readFileSync(path.join(outDir, "README.md"), "utf8");
    assert.doesNotMatch(readme, /internal productization checkout/);
    const harnessDoc = fs.readFileSync(path.join(outDir, "docs", "IMPLEMENTATION_NOTES", "harness-required-matrix.md"), "utf8");
    assert.doesNotMatch(harnessDoc, /\/home\/(?!hermes\b|user\b|ubuntu\b|runner\b|example\b)[A-Za-z0-9._-]+/);
    const report = JSON.parse(fs.readFileSync(path.join(outDir, ".public-export-report.json"), "utf8"));
    assert.deepEqual(report.contentTransforms, [
      "public-readme",
      "private-user-path-redaction",
    ]);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

testPathFilters();
testReadmeTransform();
testPublicTextSanitizer();
testCreatesCleanExport();
console.log("public-export tests passed");
