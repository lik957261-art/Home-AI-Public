"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "github-shared-source-account.js");
const helper = require(scriptPath);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-github-ssa-"));
const keyPath = path.join(tempRoot, "homeai_github_ssa_ed25519");
const configPath = path.join(tempRoot, "ssh_config");
const hostAlias = "github.com-homeai-ssa-test";
const opensshPrivateKeyRe = new RegExp(["BEGIN OPENSSH", "PRIVATE KEY"].join(" "));

function run(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

{
  const parsed = helper.parseArgs([
    "status",
    "--key-path",
    keyPath,
    "--config-path",
    configPath,
    "--host-alias",
    hostAlias,
    "--json",
  ]);
  assert.equal(parsed.command, "status");
  assert.equal(parsed.keyPath, keyPath);
  assert.equal(parsed.configPath, configPath);
  assert.equal(parsed.hostAlias, hostAlias);
}

{
  assert.equal(helper.repoComponentForPlugin("music"), "Music");
  assert.equal(helper.repoComponentForPlugin("movie"), "Movie");
  assert.equal(helper.repoComponentForPlugin("codex-mobile-web"), "CodexMobileWeb");
  const repo = helper.repoNameForPlugin({
    plugin: "music",
    owner: "pentiumxp",
    hostAlias: "github.com-homeai-ssa",
  });
  assert.equal(repo.repoName, "HomeAI-Music");
  assert.equal(repo.repoSlug, "pentiumxp/HomeAI-Music");
  assert.equal(repo.sshUrl, "git@github.com:pentiumxp/HomeAI-Music.git");
  assert.equal(repo.ssaSshUrl, "git@github.com-homeai-ssa:pentiumxp/HomeAI-Music.git");
  assert.equal(repo.visibility, "private");
}

{
  const statusRun = run([
    "status",
    "--key-path",
    keyPath,
    "--config-path",
    configPath,
    "--host-alias",
    hostAlias,
    "--json",
  ]);
  assert.equal(statusRun.status, 0, statusRun.stderr);
  const status = JSON.parse(statusRun.stdout);
  assert.equal(status.privateKeyExists, false);
  assert.equal(status.publicKeyExists, false);
  assert.equal(status.sshConfigConfigured, false);
}

{
  const initRun = run([
    "init",
    "--execute",
    "--key-path",
    keyPath,
    "--config-path",
    configPath,
    "--host-alias",
    hostAlias,
    "--comment",
    "homeai-github-ssa-test",
    "--json",
  ]);
  assert.equal(initRun.status, 0, initRun.stderr);
  assert.doesNotMatch(initRun.stdout, opensshPrivateKeyRe);
  const initialized = JSON.parse(initRun.stdout);
  assert.equal(initialized.privateKeyExists, true);
  assert.equal(initialized.publicKeyExists, true);
  assert.equal(initialized.privateKeyMode, "0600");
  assert.equal(initialized.publicKeyMode, "0644");
  assert.equal(initialized.sshConfigConfigured, true);
  assert.match(initialized.fingerprint, /SHA256:/);
  assert.equal(fs.existsSync(keyPath), true);
  assert.equal(fs.existsSync(`${keyPath}.pub`), true);
  const config = fs.readFileSync(configPath, "utf8");
  assert.match(config, new RegExp(`Host ${hostAlias}`));
  assert.match(config, /HostName github\.com/);
  assert.match(config, new RegExp(`IdentityFile ${keyPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
}

{
  const printRun = run([
    "print-public-key",
    "--key-path",
    keyPath,
  ]);
  assert.equal(printRun.status, 0, printRun.stderr);
  assert.match(printRun.stdout.trim(), /^ssh-ed25519 /);
  assert.doesNotMatch(printRun.stdout, opensshPrivateKeyRe);
}

{
  const smokeRun = run([
    "smoke",
    "--key-path",
    keyPath,
    "--config-path",
    configPath,
    "--host-alias",
    hostAlias,
    "--repo",
    "git@github.com-homeai-ssa-test:pentiumxp/Home-AI.git",
    "--timeout-ms",
    "1000",
    "--json",
  ]);
  assert.equal(smokeRun.status, 0, smokeRun.stderr);
  const smoke = JSON.parse(smokeRun.stdout);
  assert.equal(smoke.repo, "git@github.com-homeai-ssa-test:pentiumxp/Home-AI.git");
  assert.equal(smoke.hostAlias, hostAlias);
  assert.equal(typeof smoke.classification, "string");
  assert.doesNotMatch(JSON.stringify(smoke), opensshPrivateKeyRe);
}

{
  const repoNameRun = run([
    "repo-name",
    "--plugin",
    "movie",
    "--owner",
    "pentiumxp",
    "--json",
  ]);
  assert.equal(repoNameRun.status, 0, repoNameRun.stderr);
  const repoName = JSON.parse(repoNameRun.stdout);
  assert.equal(repoName.repoName, "HomeAI-Movie");
  assert.equal(repoName.ssaSshUrl, "git@github.com-homeai-ssa:pentiumxp/HomeAI-Movie.git");
}

assert.equal(helper.sanitizeOutput("github_pat_abc123 ghp_abc123"), "[redacted-github-token] [redacted-github-token]");

console.log("github shared source account script tests passed");
