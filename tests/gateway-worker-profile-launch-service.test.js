"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const {
  createGatewayWorkerProfileLaunchService,
  publicArgs,
  sanitizeProcessText,
} = require("../adapters/gateway-worker-profile-launch-service");

function tempToolRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-gateway-launch-"));
  const scripts = path.join(dir, "scripts");
  fs.mkdirSync(scripts, { recursive: true });
  fs.writeFileSync(path.join(scripts, "start-gateway-pool.ps1"), "# test\n", "utf8");
  return dir;
}

function fakeSpawnFactory(calls, options = {}) {
  return (command, args, spawnOptions) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => { child.killed = true; };
    calls.push({ command, args, spawnOptions, child });
    process.nextTick(() => {
      if (options.stdout) child.stdout.write(options.stdout);
      if (options.stderr) child.stderr.write(options.stderr);
      child.emit("close", options.code == null ? 0 : options.code);
    });
    return child;
  };
}

async function testStartsAndStopsSpecificProfilesHidden() {
  const calls = [];
  const toolRoot = tempToolRoot();
  const service = createGatewayWorkerProfileLaunchService({
    toolRoot,
    spawn: fakeSpawnFactory(calls),
  });

  await service.startWorkerProfile({ profile: "lowgw5", securityLevel: "user" }, { timeoutMs: 9000 });
  await service.stopWorkerProfile({ profile: "lowgw5", securityLevel: "user" }, { timeoutMs: 8000 });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].command, "powershell.exe");
  assert.deepEqual(calls[0].args.slice(0, 7), [
    "-NoProfile",
    "-WindowStyle", "Hidden",
    "-ExecutionPolicy", "Bypass",
    "-File", path.join(toolRoot, "scripts", "start-gateway-pool.ps1"),
  ]);
  assert.deepEqual(calls[0].args.slice(-3), ["-StartProfiles", "lowgw5", "-NoStopExisting"]);
  assert.deepEqual(calls[1].args.slice(-2), ["-StopProfiles", "lowgw5"]);
  assert.equal(calls[0].spawnOptions.cwd, toolRoot);
  assert.equal(calls[0].spawnOptions.windowsHide, true);
  fs.rmSync(toolRoot, { recursive: true, force: true });
}

async function testOwnerMaintenanceStartAndStopPolicy() {
  const calls = [];
  const toolRoot = tempToolRoot();
  const service = createGatewayWorkerProfileLaunchService({
    toolRoot,
    spawn: fakeSpawnFactory(calls),
  });

  await service.startWorkerProfile({ profile: "officialclean1", securityLevel: "owner-maintenance" });
  const stop = await service.stopWorkerProfile({ profile: "officialclean1", securityLevel: "owner-maintenance" });

  assert.deepEqual(calls[0].args.slice(-1), ["-OwnerMaintenanceOnly"]);
  assert.deepEqual(stop, { ok: true, skipped: true, reason: "owner_maintenance_not_idle_reaped" });
  assert.equal(calls.length, 1);
  fs.rmSync(toolRoot, { recursive: true, force: true });
}

async function testFailureDiagnosticsAreBounded() {
  const calls = [];
  const toolRoot = tempToolRoot();
  const rawSecret = "Bearer abcdefghijklmnopqrstuvwxyz0123456789";
  const service = createGatewayWorkerProfileLaunchService({
    toolRoot,
    spawn: fakeSpawnFactory(calls, { code: 1, stderr: `failed with ${rawSecret} and workspace_key abcdefghijklmnopqrstuvwxyz` }),
  });

  await assert.rejects(() => service.startWorkerProfile({ profile: "lowgw7" }), (err) => {
    assert.equal(err.code, "gateway_pool_script_failed");
    assert.equal(JSON.stringify(err.details).includes("abcdefghijklmnopqrstuvwxyz0123456789"), false);
    assert.match(err.details.stderr, /Bearer \[redacted\]/);
    assert.match(err.details.stderr, /workspace_key \[redacted\]/);
    return true;
  });
  fs.rmSync(toolRoot, { recursive: true, force: true });
}

async function testMissingProfileAndMissingScriptFailClosed() {
  const service = createGatewayWorkerProfileLaunchService({ toolRoot: tempToolRoot() });
  await assert.rejects(() => service.startWorkerProfile({}), { code: "profile_missing" });
  fs.rmSync(path.dirname(service.gatewayPoolScriptPath()), { recursive: true, force: true });
  assert.throws(() => service.runGatewayPoolScript([]), { code: "gateway_pool_script_missing" });
}

function testHelpersSanitizePublicState() {
  assert.deepEqual(publicArgs(["-ApiKey", "secret-value", "-StartProfiles", "lowgw1"]), ["-ApiKey", "[redacted]", "-StartProfiles", "lowgw1"]);
  assert.equal(sanitizeProcessText("Bearer abcdefghijklmnopqrstuvwxyz0123456789"), "Bearer [redacted]");
}

(async () => {
  await testStartsAndStopsSpecificProfilesHidden();
  await testOwnerMaintenanceStartAndStopPolicy();
  await testFailureDiagnosticsAreBounded();
  await testMissingProfileAndMissingScriptFailClosed();
  testHelpersSanitizePublicState();
  console.log("gateway-worker-profile-launch-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
