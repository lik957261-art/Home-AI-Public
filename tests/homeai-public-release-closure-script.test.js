"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const {
  closureOptions,
  parseArgs,
  renderText,
  serviceOptions,
} = require("../scripts/homeai-public-release-closure");

const REPO_ROOT = path.resolve(__dirname, "..");

function testParseDefaultsToPlanOnly() {
  const args = parseArgs([]);
  assert.equal(args.execute, false);
  assert.equal(args.syncPublicRepo, false);
  assert.equal(args.commitPublic, false);
  assert.equal(args.pushPublic, false);
  assert.equal(args.skipPrivacyScan, false);
}

function testParsePublicReleaseFlags() {
  const args = parseArgs([
    "--out", "/tmp/homeai-public-export",
    "--public-repo", "/tmp/Home-AI-Public",
    "--sync-public-repo",
    "--commit-public",
    "--push-public",
    "--commit-message", "Publish public release",
    "--allow-dirty",
    "--allow-public-repo-dirty",
    "--skip-privacy-scan",
    "--timeout-ms", "45000",
    "--execute",
    "--json",
  ]);
  assert.equal(args.outDir, "/tmp/homeai-public-export");
  assert.equal(args.publicRepoPath, "/tmp/Home-AI-Public");
  assert.equal(args.syncPublicRepo, true);
  assert.equal(args.commitPublic, true);
  assert.equal(args.pushPublic, true);
  assert.equal(args.commitMessage, "Publish public release");
  assert.equal(args.allowDirty, true);
  assert.equal(args.allowPublicRepoDirty, true);
  assert.equal(args.skipPrivacyScan, true);
  assert.equal(serviceOptions(args).timeoutMs, 45000);
  assert.equal(closureOptions(args).pushPublic, true);
}

function testRenderTextShowsBoundedPlanAndSteps() {
  const text = renderText({
    ok: false,
    mode: "plan",
    repoRoot: "/tmp/private",
    outDir: "/tmp/export",
    blockerCount: 1,
    issueCount: 1,
    blockers: [{ code: "public_repo_path_required" }],
    issues: [{ code: "public_release_source_check_failed:releaseScriptExists" }],
    actions: [{ type: "create-public-export" }],
    steps: [{ type: "validate-public-export", result: { ok: true } }],
  });
  assert.match(text, /ok: false/);
  assert.match(text, /public_repo_path_required/);
  assert.match(text, /public_release_source_check_failed:releaseScriptExists/);
  assert.match(text, /create-public-export/);
  assert.match(text, /validate-public-export: ok/);
}

function testCliHelpMentionsExplicitGates() {
  const output = execFileSync("node", ["scripts/homeai-public-release-closure.js", "--help"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.match(output, /--sync-public-repo/);
  assert.match(output, /--commit-public/);
  assert.match(output, /--push-public/);
  assert.match(output, /--skip-privacy-scan/);
}

testParseDefaultsToPlanOnly();
testParsePublicReleaseFlags();
testRenderTextShowsBoundedPlanAndSteps();
testCliHelpMentionsExplicitGates();

console.log("homeai public release closure script tests passed");
