"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const {
  parseArgs,
  rehearsalOptions,
  renderText,
  serviceOptions,
} = require("../scripts/homeai-public-upgrade-rehearsal");

const REPO_ROOT = path.resolve(__dirname, "..");

function testParseDefaultsToPlanOnly() {
  const args = parseArgs([]);
  assert.equal(args.execute, false);
  assert.equal(args.keepTemp, false);
  assert.equal(args.reason, "public-upgrade-rehearsal");
  assert.match(args.publicRepoUrl, /Home-AI-Public/);
}

function testParseRehearsalFlags() {
  const args = parseArgs([
    "--repo", "https://github.com/pentiumxp/Home-AI-Public.git",
    "--root", "/tmp/Home-AI-Public-upgrade-rehearsal-cli",
    "--hermes-agent-repository-url", "https://github.com/pentiumxp/hermes-agent-public.git",
    "--hermes-agent-ref", "main",
    "--base", "http://127.0.0.1:8797",
    "--reason", "friend-upgrade-rehearsal",
    "--timeout-ms", "45000",
    "--keep-temp",
    "--execute",
    "--json",
  ]);
  assert.equal(args.execute, true);
  assert.equal(args.keepTemp, true);
  assert.equal(args.rehearsalRoot, "/tmp/Home-AI-Public-upgrade-rehearsal-cli");
  assert.equal(args.hermesAgentRepositoryUrl, "https://github.com/pentiumxp/hermes-agent-public.git");
  assert.equal(serviceOptions(args).timeoutMs, 45000);
  assert.equal(rehearsalOptions(args).reason, "friend-upgrade-rehearsal");
}

function testRenderTextShowsActionsAndSteps() {
  const text = renderText({
    ok: true,
    mode: "execute",
    publicRepoUrl: "https://github.com/pentiumxp/Home-AI-Public.git",
    paths: { rehearsalRoot: "/tmp/Home-AI-Public-upgrade-rehearsal" },
    actionCount: 2,
    stepCount: 2,
    tempRemoved: true,
    actions: [{ type: "clone-public-home-ai" }],
    steps: [
      { type: "public-source-preflight", result: { ok: true } },
      { type: "validate-operator-clone-gate-plan", detail: { ok: true } },
    ],
  });
  assert.match(text, /ok: true/);
  assert.match(text, /tempRemoved: true/);
  assert.match(text, /clone-public-home-ai/);
  assert.match(text, /validate-operator-clone-gate-plan: ok/);
}

function testCliHelpMentionsExecuteAndKeepTemp() {
  const output = execFileSync("node", ["scripts/homeai-public-upgrade-rehearsal.js", "--help"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.match(output, /--execute/);
  assert.match(output, /--keep-temp/);
  assert.match(output, /--repo/);
}

testParseDefaultsToPlanOnly();
testParseRehearsalFlags();
testRenderTextShowsActionsAndSteps();
testCliHelpMentionsExecuteAndKeepTemp();

console.log("homeai public upgrade rehearsal script tests passed");
