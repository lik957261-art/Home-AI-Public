"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  launchdState,
  parseArgs,
  restartRunningGatewayLaunchDaemons,
  sanitizedChildArgs,
} = require("../scripts/homeai-openai-codex-auth-pool");

const scriptPath = path.join(__dirname, "..", "scripts", "homeai-openai-codex-auth-pool.js");
const source = fs.readFileSync(scriptPath, "utf8");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function testScriptIsHomeAiOwnedNotCodexActiveProfileOwned() {
  assert.match(source, /Home AI's own OpenAI-Codex shared-auth credential pool/);
  assert.match(source, /--import-codex-home/);
  assert.doesNotMatch(source, /resolveCodexMobileProfileRuntime|activeProfileId|codex-mobile/);
  assert.deepEqual(sanitizedChildArgs(["--password-file", "/secret", "--json"]), ["--json", "--privileged-child"]);
  assert.equal(parseArgs(["--root", "/tmp/homeai", "--profile-id", "homeai-default"]).root, "/tmp/homeai");
}

function testLaunchdRestartOnlyKickstartsRunningGatewayLabels() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-gateway-launchd-"));
  fs.writeFileSync(path.join(tmp, "com.hermesmobile.gateway.owner.plist"), "");
  fs.writeFileSync(path.join(tmp, "com.hermesmobile.other.plist"), "");
  const calls = [];
  const result = restartRunningGatewayLaunchDaemons({
    launchDaemonsDir: tmp,
    spawnSync: (command, args) => {
      calls.push([command, ...args]);
      if (args[0] === "print") return { status: 0, stdout: "state = running\n" };
      if (args[0] === "kickstart") return { status: 0, stdout: "" };
      return { status: 1, stdout: "" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.scanned, 1);
  assert.equal(result.restartedCount, 1);
  assert.deepEqual(calls, [
    ["/bin/launchctl", "print", "system/com.hermesmobile.gateway.owner"],
    ["/bin/launchctl", "kickstart", "-k", "system/com.hermesmobile.gateway.owner"],
  ]);
  assert.equal(launchdState("state = waiting\n"), "waiting");
}

function testImportExecutesAgainstExplicitHomeAiSharedAuthFile() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-auth-pool-"));
  const sharedAuthFile = path.join(tmp, "shared-auth", "auth.json");
  const backupDir = path.join(tmp, "backups");
  const codexHome = path.join(tmp, "codex-default");
  writeJson(sharedAuthFile, {
    version: 1,
    providers: {
      "openai-codex": {
        auth_mode: "chatgpt",
        tokens: { access_token: "access-previous", refresh_token: "refresh-previous" },
      },
    },
    credential_pool: {
      "openai-codex": [{
        id: "homeai-previous",
        access_token: "access-previous",
        refresh_token: "refresh-previous",
      }],
    },
  });
  writeJson(path.join(codexHome, "auth.json"), {
    auth_mode: "chatgpt",
    tokens: {
      access_token: "access-default",
      refresh_token: "refresh-default",
      account_id: "account-default",
    },
    last_refresh: "2026-06-27T01:02:03.000Z",
  });

  const result = spawnSync(process.execPath, [
    scriptPath,
    "--shared-auth-file", sharedAuthFile,
    "--backup-dir", backupDir,
    "--import-codex-home", codexHome,
    "--profile-id", "homeai-default",
    "--label", "Home AI Default",
    "--make-active",
    "--execute",
    "--privileged-child",
    "--json",
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.changed, true);
  assert.equal(payload.imported, true);
  assert.equal(payload.summary.active_profile_id, "homeai-default");
  assert.equal(JSON.stringify(payload).includes("access-default"), false);
  const saved = JSON.parse(fs.readFileSync(sharedAuthFile, "utf8"));
  assert.equal(saved.providers["openai-codex"].tokens.access_token, "access-default");
}

testScriptIsHomeAiOwnedNotCodexActiveProfileOwned();
testLaunchdRestartOnlyKickstartsRunningGatewayLabels();
testImportExecutesAgainstExplicitHomeAiSharedAuthFile();

console.log("homeai openai-codex auth pool script tests passed");
