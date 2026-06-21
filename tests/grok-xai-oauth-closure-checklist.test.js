"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const {
  CLOSURE_ITEMS,
  REQUIRED_REFERENCES,
  buildChecklist,
} = require("../scripts/grok-xai-oauth-closure-checklist");

const REPO_ROOT = path.resolve(__dirname, "..");

function testChecklistShape() {
  const report = buildChecklist();
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.profile, "grokgw1");
  assert.equal(report.provider, "xai-oauth");
  assert.equal(report.model, "grok-4.3");
  assert.equal(report.itemCount, CLOSURE_ITEMS.length);
  assert.equal(report.itemCount, 5);
  assert.deepEqual(report.checkedReferences, REQUIRED_REFERENCES.map((entry) => entry.file));
}

function testClosureCommandsCoverRequiredProofs() {
  const report = buildChecklist();
  const commands = report.items.map((item) => item.command).join("\n");
  assert.match(commands, /macos-grok-xai-reauth\.sh/);
  assert.match(commands, /grok-auth-metadata-smoke\.js/);
  assert.match(commands, /--require-access-token/);
  assert.match(commands, /macos-production-profile-audit\.js/);
  assert.match(commands, /gateway-pool-production-smoke\.js/);
  assert.match(commands, /--provider xai-oauth/);
  assert.match(commands, /--expected-profile grokgw1/);
  assert.match(commands, /bridge-host-grok-proxy\.test\.js/);
}

function testPlaceholderReplacementDoesNotReadSecrets() {
  const report = buildChecklist({
    root: "/prod/root",
    app: "/prod/root/app",
    profileAuthFile: "/restricted/profile-auth.json",
    sharedAuthFile: "/restricted/shared-auth.json",
    keyFile: "/restricted/key.secret",
  });
  const commands = report.items.map((item) => item.command).join("\n");
  assert.match(commands, /\/prod\/root\/app\/scripts\/grok-auth-metadata-smoke\.js/);
  assert.match(commands, /--profile-auth-file \/restricted\/profile-auth\.json/);
  assert.match(commands, /--shared-auth-file \/restricted\/shared-auth\.json/);
  assert.match(commands, /--key-file \/restricted\/key\.secret/);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /access_token["']?\s*:/);
  assert.doesNotMatch(serialized, /refresh_token["']?\s*:/);
  assert.doesNotMatch(serialized, /secret-access-token|secret-refresh-token|code=[A-Za-z0-9._-]+/);
}

function testEveryItemHasEvidenceAndRiskBoundary() {
  const report = buildChecklist();
  for (const item of report.items) {
    assert.ok(item.evidenceRequired.length > 0, item.id);
    assert.ok(item.riskBoundary.length > 0, item.id);
    assert.ok(item.command.length > 0, item.id);
  }
}

function testCliJsonAndMarkdown() {
  const jsonOutput = execFileSync("node", ["scripts/grok-xai-oauth-closure-checklist.js"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const parsed = JSON.parse(jsonOutput);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.itemCount, 5);

  const markdown = execFileSync("node", ["scripts/grok-xai-oauth-closure-checklist.js", "--markdown"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.match(markdown, /Grok\/xAI OAuth Closure Checklist/);
  assert.match(markdown, /gateway-pool-production-smoke\.js/);
  assert.match(markdown, /grokgw1/);
  assert.match(markdown, /xai-oauth/);
}

testChecklistShape();
testClosureCommandsCoverRequiredProofs();
testPlaceholderReplacementDoesNotReadSecrets();
testEveryItemHasEvidenceAndRiskBoundary();
testCliJsonAndMarkdown();

console.log("grok xai oauth closure checklist tests passed");
