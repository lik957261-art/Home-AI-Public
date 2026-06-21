"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createCodexMobileRecoveryService, defaultScriptPath } = require("../adapters/codex-mobile-recovery-service");

function tempScript() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-codex-mobile-recovery-"));
  const script = path.join(dir, "restart-codex-mobile-host-macos.sh");
  fs.writeFileSync(script, "#!/bin/sh\n", { mode: 0o755 });
  return script;
}

function createExecFile(handler) {
  const calls = [];
  return {
    calls,
    execFile(command, args, options, callback) {
      calls.push({ command, args, options });
      const result = handler(command, args, options) || {};
      if (result.error) {
        callback(result.error, result.stdout || "", result.stderr || "");
        return;
      }
      callback(null, result.stdout || "", result.stderr || "");
    },
  };
}

function response(status = 200) {
  return { ok: status >= 200 && status < 300, status };
}

async function testDefaultScriptPathUsesSiblingPluginRoot() {
  assert.equal(
    defaultScriptPath("/Users/example/path"),
    "/Users/example/path",
  );
}

async function testStatusRecoverableWhenListenerMissing() {
  const script = tempScript();
  const exec = createExecFile((command, args) => {
    if (command.endsWith("lsof")) {
      const err = new Error("not found");
      err.code = 1;
      return { error: err, stderr: "" };
    }
    if (command.endsWith("launchctl")) {
      return { stdout: "type = LaunchDaemon\nstate = waiting\n" };
    }
    throw new Error(`unexpected command ${command} ${args.join(" ")}`);
  });
  const service = createCodexMobileRecoveryService({
    scriptPath: script,
    execFile: exec.execFile,
    fetch: async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:8787");
    },
  });

  const status = await service.status();

  assert.equal(status.available, false);
  assert.equal(status.recoverable, true);
  assert.equal(status.reason, "listener_missing_or_launchd_stopped");
  assert.equal(status.listener.present, false);
}

async function testStatusDoesNotTreat401AsRecoverable() {
  const script = tempScript();
  const exec = createExecFile((command) => {
    if (command.endsWith("lsof")) return { stdout: "node 123 xuxin 10u IPv4 TCP 127.0.0.1:8787 (LISTEN)\n" };
    if (command.endsWith("launchctl")) return { stdout: "type = LaunchDaemon\nstate = running\n" };
    throw new Error(`unexpected command ${command}`);
  });
  const service = createCodexMobileRecoveryService({
    scriptPath: script,
    execFile: exec.execFile,
    fetch: async () => response(401),
  });

  const status = await service.status();

  assert.equal(status.available, false);
  assert.equal(status.recoverable, false);
  assert.equal(status.reason, "auth_or_key_required");
}

async function testListPlanAndRestoreUseHostScript() {
  const script = tempScript();
  const exec = createExecFile((command, args) => {
    if (command.endsWith("lsof")) {
      const err = new Error("not found");
      err.code = 1;
      return { error: err };
    }
    if (command.endsWith("launchctl")) return { stdout: "type = LaunchDaemon\nstate = waiting\n" };
    if (command === script && args.includes("--list-homes")) {
      return { stdout: JSON.stringify({ ok: true, activeProfileId: "previous", profiles: [{ id: "previous", label: "Previous", codexHome: "/Users/example/path", active: true, exists: true, auth: { status: "loggedIn", label: "user@example.test" } }] }) };
    }
    if (command === script && args.includes("--dry-run")) {
      return { stdout: JSON.stringify({ ok: true, serviceLabel: "com.hermesmobile.plugin.codex-mobile", profileId: "previous", codexHome: "/Users/example/path", port: 8787, url: "http://127.0.0.1:8787/api/public-config", dryRun: true }) };
    }
    if (command === script && args.includes("--max-wait-seconds")) {
      return { stdout: JSON.stringify({ ok: true, serviceLabel: "com.hermesmobile.plugin.codex-mobile", profileId: "previous", codexHome: "/Users/example/path", port: 8787, url: "http://127.0.0.1:8787/api/public-config" }) };
    }
    throw new Error(`unexpected command ${command} ${args.join(" ")}`);
  });
  const service = createCodexMobileRecoveryService({
    scriptPath: script,
    execFile: exec.execFile,
    fetch: async () => {
      throw new Error("connection refused");
    },
  });

  const homes = await service.listHomes();
  const plan = await service.plan({ profileId: "previous" });
  const restore = await service.restore({ profileId: "previous" });

  assert.equal(homes.profiles[0].id, "previous");
  assert.equal(plan.dryRun, true);
  assert.equal(restore.recovery.profileId, "previous");
  assert.ok(exec.calls.some((call) => call.command === script && call.args.join(" ").includes("--profile-id previous --max-wait-seconds")));
}

async function testRestoreRefusesHealthyListenerWithoutForce() {
  const script = tempScript();
  const exec = createExecFile((command) => {
    if (command.endsWith("lsof")) return { stdout: "node 123 xuxin 10u IPv4 TCP 127.0.0.1:8787 (LISTEN)\n" };
    if (command.endsWith("launchctl")) return { stdout: "type = LaunchDaemon\nstate = running\n" };
    if (command === script) return { stdout: "{}" };
    throw new Error(`unexpected command ${command}`);
  });
  const service = createCodexMobileRecoveryService({
    scriptPath: script,
    execFile: exec.execFile,
    fetch: async () => response(200),
  });

  await assert.rejects(
    () => service.restore({ profileId: "previous" }),
    (err) => err.code === "codex_mobile_recovery_not_needed" && err.status === 409,
  );
}

async function run() {
  await testDefaultScriptPathUsesSiblingPluginRoot();
  await testStatusRecoverableWhenListenerMissing();
  await testStatusDoesNotTreat401AsRecoverable();
  await testListPlanAndRestoreUseHostScript();
  await testRestoreRefusesHealthyListenerWithoutForce();
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
