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
    if (typeof options.onSpawn === "function") {
      options.onSpawn({ command, args, spawnOptions, child, calls });
    }
    process.nextTick(() => {
      if (options.stdout) child.stdout.write(options.stdout);
      if (options.stderr) child.stderr.write(options.stderr);
      child.emit("close", options.code == null ? 0 : options.code);
    });
    return child;
  };
}

function writeFirstScheduledResult(launchRoot, payload = {}) {
  const pendingDir = path.join(launchRoot, "pending");
  const resultDir = path.join(launchRoot, "results");
  const file = fs.readdirSync(pendingDir).find((name) => name.endsWith(".json"));
  assert.ok(file, "scheduled launch request file should exist");
  const request = JSON.parse(fs.readFileSync(path.join(pendingDir, file), "utf8"));
  fs.mkdirSync(resultDir, { recursive: true });
  fs.writeFileSync(path.join(resultDir, `${request.requestId}.json`), JSON.stringify(Object.assign({
    ok: true,
    requestId: request.requestId,
    action: request.action,
    profiles: request.profiles,
  }, payload)), "utf8");
  return request;
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
  assert.deepEqual(calls[0].args.slice(-3), ["-StartReplicas", "lowgw5", "-NoStopExisting"]);
  assert.deepEqual(calls[1].args.slice(-2), ["-StopReplicas", "lowgw5"]);
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

  assert.deepEqual(calls[0].args.slice(-3), ["-OwnerMaintenanceOnly", "-StartReplicas", "officialclean1"]);
  assert.deepEqual(calls[1].args.slice(-3), ["-OwnerMaintenanceOnly", "-StopReplicas", "officialclean1"]);
  assert.equal(stop.ok, true);
  assert.equal(calls.length, 2);
  fs.rmSync(toolRoot, { recursive: true, force: true });
}

async function testScheduledOwnerMaintenanceLaunchRequestTargetsProfile() {
  const calls = [];
  const toolRoot = tempToolRoot();
  const launchRequestRoot = path.join(toolRoot, "elastic-requests");
  let capturedRequest = null;
  const service = createGatewayWorkerProfileLaunchService({
    toolRoot,
    launchRequestRoot,
    scheduledTaskName: "Hermes Mobile Gateway Pool",
    spawn: fakeSpawnFactory(calls, {
      onSpawn: ({ command }) => {
        if (command === "schtasks.exe") {
          capturedRequest = writeFirstScheduledResult(launchRequestRoot);
        }
      },
    }),
  });

  const result = await service.startWorkerProfile({ profile: "officialclean1", securityLevel: "owner-maintenance" }, { timeoutMs: 9000 });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(capturedRequest.action, "ownerMaintenance");
  assert.deepEqual(capturedRequest.profiles, ["officialclean1"]);
  assert.deepEqual(capturedRequest.replicas, ["officialclean1"]);
  assert.equal(capturedRequest.noStopExisting, true);
  fs.rmSync(toolRoot, { recursive: true, force: true });
}

async function testScheduledTaskLaunchRequest() {
  const calls = [];
  const toolRoot = tempToolRoot();
  const launchRequestRoot = path.join(toolRoot, "elastic-requests");
  let capturedRequest = null;
  const service = createGatewayWorkerProfileLaunchService({
    toolRoot,
    launchRequestRoot,
    scheduledTaskName: "Hermes Mobile Gateway Pool",
    spawn: fakeSpawnFactory(calls, {
      onSpawn: ({ command }) => {
        if (command === "schtasks.exe") {
          capturedRequest = writeFirstScheduledResult(launchRequestRoot);
        }
      },
    }),
  });

  const result = await service.startWorkerProfile({ profile: "lowgw6", securityLevel: "user" }, { timeoutMs: 9000 });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "schtasks.exe");
  assert.deepEqual(calls[0].args, ["/Run", "/TN", "Hermes Mobile Gateway Pool"]);
  assert.equal(capturedRequest.action, "start");
  assert.deepEqual(capturedRequest.profiles, ["lowgw6"]);
  assert.deepEqual(capturedRequest.replicas, ["lowgw6"]);
  assert.equal(capturedRequest.noStopExisting, true);
  fs.rmSync(toolRoot, { recursive: true, force: true });
}

async function testScheduledTaskLaunchRequestCarriesTemplateMetadata() {
  const calls = [];
  const toolRoot = tempToolRoot();
  const launchRequestRoot = path.join(toolRoot, "elastic-requests");
  let capturedRequest = null;
  const service = createGatewayWorkerProfileLaunchService({
    toolRoot,
    launchRequestRoot,
    scheduledTaskName: "Hermes Mobile Gateway Pool",
    spawn: fakeSpawnFactory(calls, {
      onSpawn: ({ command }) => {
        if (command === "schtasks.exe") {
          capturedRequest = writeFirstScheduledResult(launchRequestRoot);
        }
      },
    }),
  });

  await service.startWorkerProfile({
    profile: "lowgw10",
    securityLevel: "user",
    provider: "openai-codex",
    allowedWorkspaceIds: ["owner"],
    skillWorkspaceIds: ["owner"],
    capabilityHash: "89b53f15d7138024",
    apiKey: "secret-value-that-must-not-leak",
  }, {
    timeoutMs: 9000,
    hints: {
      workspaceId: "owner",
      securityLevel: "user",
      provider: "openai-codex",
      toolSchemaEpoch: "epoch-20260604",
    },
  });

  assert.equal(capturedRequest.poolKey, "owner|user|openai-codex");
  assert.equal(capturedRequest.profileTemplateKey, "owner|user|openai-codex");
  assert.equal(capturedRequest.templateKey, "owner|user|openai-codex");
  assert.equal(capturedRequest.replicaId, "lowgw10");
  assert.deepEqual(capturedRequest.replicas, ["lowgw10"]);
  assert.equal(capturedRequest.profileAlias, "lowgw10");
  assert.equal(capturedRequest.workspaceId, "owner");
  assert.equal(capturedRequest.permissionTier, "user");
  assert.equal(capturedRequest.provider, "openai-codex");
  assert.equal(capturedRequest.capabilityHash, "89b53f15d7138024");
  assert.equal(capturedRequest.toolSchemaEpoch, "epoch-20260604");
  assert.equal(JSON.stringify(capturedRequest).includes("secret-value"), false);
  fs.rmSync(toolRoot, { recursive: true, force: true });
}

async function testDirectLaunchCarriesTemplateMetadataToPowerShell() {
  const calls = [];
  const toolRoot = tempToolRoot();
  const service = createGatewayWorkerProfileLaunchService({
    toolRoot,
    spawn: fakeSpawnFactory(calls),
  });

  await service.startWorkerProfile({
    profile: "lowgw10",
    securityLevel: "user",
    provider: "openai-codex",
    allowedWorkspaceIds: ["owner"],
    skillWorkspaceIds: ["owner"],
  }, {
    timeoutMs: 9000,
    hints: {
      workspaceId: "owner",
      securityLevel: "user",
      provider: "openai-codex",
    },
  });

  const startIndex = calls[0].args.indexOf("-StartReplicas");
  assert.notEqual(startIndex, -1);
  assert.deepEqual(calls[0].args.slice(startIndex), [
    "-StartReplicas", "lowgw10",
    "-NoStopExisting",
    "-ForceConfigure",
    "-PoolKey", "owner|user|openai-codex",
    "-ProfileTemplateKey", "owner|user|openai-codex",
    "-TemplateKey", "owner|user|openai-codex",
    "-ReplicaId", "lowgw10",
    "-ProfileAlias", "lowgw10",
    "-WorkspaceId", "owner",
    "-PermissionTier", "user",
    "-Provider", "openai-codex",
  ]);
  fs.rmSync(toolRoot, { recursive: true, force: true });
}

async function testCustomProfileLaunchScriptForNasHybrid() {
  const calls = [];
  const toolRoot = tempToolRoot();
  const script = path.join(toolRoot, "start-nas-gateway-pool.sh");
  fs.writeFileSync(script, "#!/bin/sh\n", "utf8");
  const service = createGatewayWorkerProfileLaunchService({
    toolRoot,
    elasticConfig: {
      HERMES_MOBILE_GATEWAY_PROFILE_LAUNCH_SCRIPT: script,
    },
    spawn: fakeSpawnFactory(calls),
  });

  await service.startWorkerProfile({ profile: "nasgw7", securityLevel: "user" }, { timeoutMs: 9000 });
  await service.stopWorkerProfile({ profile: "nasgw7", securityLevel: "user" }, { timeoutMs: 8000 });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].command, script);
  assert.deepEqual(calls[0].args, ["--start-profiles", "nasgw7", "--no-stop-existing"]);
  assert.deepEqual(calls[1].args, ["--stop-profiles", "nasgw7"]);
  assert.equal(calls[0].spawnOptions.cwd, toolRoot);
  fs.rmSync(toolRoot, { recursive: true, force: true });
}

async function testScheduledTaskFailureDiagnosticsAreBounded() {
  const calls = [];
  const toolRoot = tempToolRoot();
  const launchRequestRoot = path.join(toolRoot, "elastic-requests");
  const service = createGatewayWorkerProfileLaunchService({
    toolRoot,
    launchRequestRoot,
    scheduledTaskName: "Hermes Mobile Gateway Pool",
    spawn: fakeSpawnFactory(calls, {
      onSpawn: ({ command }) => {
        if (command === "schtasks.exe") {
          writeFirstScheduledResult(launchRequestRoot, {
            ok: false,
            code: "gateway_elastic_request_failed",
            message: "failed with Bearer abcdefghijklmnopqrstuvwxyz0123456789",
            stderr: "workspace_key abcdefghijklmnopqrstuvwxyz",
          });
        }
      },
    }),
  });

  await assert.rejects(() => service.startWorkerProfile({ profile: "lowgw7" }, { timeoutMs: 9000 }), (err) => {
    assert.equal(err.code, "gateway_elastic_request_failed");
    assert.equal(JSON.stringify(err.details).includes("abcdefghijklmnopqrstuvwxyz0123456789"), false);
    assert.match(err.message, /Bearer/);
    return true;
  });
  fs.rmSync(toolRoot, { recursive: true, force: true });
}

async function testFailureDiagnosticsAreBounded() {
  const calls = [];
  const toolRoot = tempToolRoot();
  const rawSecret = "Bearer abcdefghijklmnopqrstuvwxyz0123456789";
  const service = createGatewayWorkerProfileLaunchService({
    toolRoot,
    spawn: fakeSpawnFactory(calls, {
      code: 1,
      stderr: `failed with ${rawSecret} and workspace_key abcdefghijklmnopqrstuvwxyz`,
      stdout: "selected profile lowgw7 failed after API_KEY abcdefghijklmnopqrstuvwxyz",
    }),
  });

  await assert.rejects(() => service.startWorkerProfile({ profile: "lowgw7" }), (err) => {
    assert.equal(err.code, "gateway_pool_script_failed");
    assert.equal(JSON.stringify(err.details).includes("abcdefghijklmnopqrstuvwxyz0123456789"), false);
    assert.match(err.details.stderr, /Bearer \[redacted\]/);
    assert.match(err.details.stderr, /workspace_key \[redacted\]/);
    assert.match(err.details.stdout, /API_key \[redacted\]/i);
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
  await testScheduledOwnerMaintenanceLaunchRequestTargetsProfile();
  await testScheduledTaskLaunchRequest();
  await testScheduledTaskLaunchRequestCarriesTemplateMetadata();
  await testDirectLaunchCarriesTemplateMetadataToPowerShell();
  await testCustomProfileLaunchScriptForNasHybrid();
  await testScheduledTaskFailureDiagnosticsAreBounded();
  await testFailureDiagnosticsAreBounded();
  await testMissingProfileAndMissingScriptFailClosed();
  testHelpersSanitizePublicState();
  console.log("gateway-worker-profile-launch-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
