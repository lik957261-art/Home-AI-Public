"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const {
  executionOptions,
  parseArgs,
  renderText,
  serviceOptions,
} = require("../scripts/homeai-public-upgrade");

const REPO_ROOT = path.resolve(__dirname, "..");

function testParseArgsDefaultsToPlanOnly() {
  const args = parseArgs([]);
  assert.equal(args.execute, false);
  assert.equal(args.cloneMissingPlugins, false);
  assert.equal(args.updateHermesAgent, false);
  assert.equal(args.reason, "public-upgrade");
}

function testParseArgsSupportsUpgradeClosureFlags() {
  const args = parseArgs([
    "--root", "/tmp/homeai",
    "--app", "/tmp/homeai/app",
    "--plugin-root", "/tmp/homeai/plugins",
    "--runtime-root", "/tmp/homeai/runtime",
    "--manifest", "/tmp/homeai/app/config/public-plugin-sources.json",
    "--base", "http://127.0.0.1:8797",
    "--reason", "friend-upgrade",
    "--clone-missing-plugins",
    "--update-hermes-agent",
    "--hermes-agent-source", "/tmp/homeai/runtime/hermes-agent-official/source",
    "--hermes-agent-repository-url", "https://github.com/pentiumxp/hermes-agent-public.git",
    "--hermes-agent-ref", "main",
    "--install-dependencies",
    "--install-hermes-agent-dependencies",
    "--force-deploy",
    "--force-closure-validation",
    "--execute",
    "--json",
  ]);
  assert.equal(args.root, "/tmp/homeai");
  assert.equal(args.execute, true);
  assert.equal(args.cloneMissingPlugins, true);
  assert.equal(args.updateHermesAgent, true);
  assert.equal(args.installDependencies, true);
  assert.equal(args.installHermesAgentDependencies, true);
  assert.equal(args.forceDeploy, true);
  assert.equal(args.forceClosureValidation, true);
  assert.equal(args.hermesAgentRepositoryUrl, "https://github.com/pentiumxp/hermes-agent-public.git");
  assert.equal(serviceOptions(args).hermesAgentSource, "/tmp/homeai/runtime/hermes-agent-official/source");
  assert.equal(executionOptions(args).reason, "friend-upgrade");
}

function testRenderTextShowsBoundedPlan() {
  const text = renderText({
    ok: false,
    mode: "plan",
    root: "/tmp/homeai",
    actionCount: 2,
    blockerCount: 1,
    issueCount: 0,
    blockers: [{ code: "plugin_source_missing_requires_clone_missing_plugins", id: "movie" }],
    actions: [{ type: "clone-plugin-source", pluginId: "movie" }],
  });
  assert.match(text, /ok: false/);
  assert.match(text, /blockerCount: 1/);
  assert.match(text, /plugin_source_missing_requires_clone_missing_plugins:movie/);
  assert.match(text, /clone-plugin-source:movie/);
}

function testCliHelpMentionsHermesAgentAndExecute() {
  const output = execFileSync("node", ["scripts/homeai-public-upgrade.js", "--help"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.match(output, /--execute/);
  assert.match(output, /--update-hermes-agent/);
  assert.match(output, /--clone-missing-plugins/);
}

testParseArgsDefaultsToPlanOnly();
testParseArgsSupportsUpgradeClosureFlags();
testRenderTextShowsBoundedPlan();
testCliHelpMentionsHermesAgentAndExecute();

console.log("homeai public upgrade script tests passed");
