"use strict";

const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const path = require("node:path");

const {
  parseArgs,
  renderText,
} = require("../scripts/homeai-public-remote-deploy-smoke");

const REPO_ROOT = path.resolve(__dirname, "..");

function testParseArgs() {
  const parsed = parseArgs([
    "--execute",
    "--ssh-target",
    "macbook-air",
    "--identity-file",
    "/tmp/key",
    "--ssh-config",
    "/tmp/config",
    "--port",
    "2222",
    "--ssh-option",
    "-vv",
    "--remote-root",
    "/tmp/homeai-public-remote-deploy-smoke-test",
    "--run-guided-install",
    "--json",
  ]);
  assert.equal(parsed.execute, true);
  assert.equal(parsed.json, true);
  assert.equal(parsed.sshTarget, "macbook-air");
  assert.equal(parsed.identityFile, "/tmp/key");
  assert.equal(parsed.sshConfig, "/tmp/config");
  assert.equal(parsed.port, "2222");
  assert.deepEqual(parsed.sshOptions, ["-vv"]);
  assert.equal(parsed.runGuidedInstall, true);
}

function testPlanCli() {
  const output = execFileSync(process.execPath, [
    "scripts/homeai-public-remote-deploy-smoke.js",
    "--remote-root",
    "/tmp/homeai-public-remote-deploy-smoke-cli",
    "--json",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.mode, "plan");
  assert.equal(parsed.remoteRoot, "/tmp/homeai-public-remote-deploy-smoke-cli");
  assert.ok(parsed.actions.some((action) => action.type === "public-upgrade-rehearsal"));
}

function testExecuteRequiresTarget() {
  const result = spawnSync(process.execPath, [
    "scripts/homeai-public-remote-deploy-smoke.js",
    "--execute",
    "--json",
  ], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.blockers.some((blocker) => blocker.code === "ssh_target_required"), true);
}

function testRenderText() {
  const text = renderText({
    ok: true,
    mode: "plan",
    sshTarget: "macbook-air",
    remoteRoot: "/tmp/homeai-public-remote-deploy-smoke-x",
    actionCount: 1,
    actions: [{ type: "remote-system-probe" }],
  });
  assert.match(text, /ok: true/);
  assert.match(text, /remote-system-probe/);
}

testParseArgs();
testPlanCli();
testExecuteRequiresTarget();
testRenderText();

console.log("homeai public remote deploy smoke script tests passed");
