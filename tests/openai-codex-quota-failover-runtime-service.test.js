"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createOpenAiCodexQuotaFailoverRuntimeService,
  healthyGatewayWorkerResult,
  sharedAuthFile,
} = require("../adapters/openai-codex-quota-failover-runtime-service");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function authDoc() {
  return {
    version: 1,
    providers: {
      "openai-codex": {
        tokens: { access_token: "access-old", refresh_token: "refresh-old" },
      },
    },
    credential_pool: {
      "openai-codex": [
        { id: "homeai-previous", access_token: "access-old", refresh_token: "refresh-old" },
        { id: "homeai-default", access_token: "access-new", refresh_token: "refresh-new" },
      ],
    },
  };
}

function createHarness() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-quota-runtime-"));
  const sharedAuth = path.join(tmp, "shared-auth", "auth.json");
  const calls = { starts: [], stops: [] };
  writeJson(sharedAuth, authDoc());
  const workers = [
    { profile: "owner", provider: "openai-codex" },
    { profile: "wuping", provider: "openai-codex" },
  ];
  const gatewayPool = {
    load: () => ({ workers }),
    runnerFor: (worker) => ({
      request: async () => (worker.profile === "owner" ? { ok: true } : { ok: false }),
    }),
  };
  const service = createOpenAiCodexQuotaFailoverRuntimeService({
    fs,
    gatewayPool: () => gatewayPool,
    gatewayPoolElasticConfig: () => ({ HERMES_MOBILE_GATEWAY_WORKER_ROOT: tmp }),
    gatewayWorkerProfileLauncher: () => ({
      startWorkerProfile: async (worker, input) => calls.starts.push({ worker, input }),
      stopWorkerProfile: async (worker, input) => calls.stops.push({ worker, input }),
    }),
    nowIso: () => "2026-06-27T08:00:00.000Z",
    openAiCodexSharedAuthFile: sharedAuth,
    path,
    toolRoot: tmp,
  });
  return { calls, service, sharedAuth };
}

async function testRotatesSharedAuthFile() {
  const { service, sharedAuth } = createHarness();
  const result = service.rotateOpenAiCodexCredentialPoolAfterUsageLimit({ resetAt: 1782559255 });

  assert.equal(result.ok, true);
  assert.equal(result.rotated, true);
  assert.equal(result.previousProfileId, "homeai-previous");
  assert.equal(result.activeProfileId, "homeai-default");
  assert.equal(result.summary.active_profile_id, "homeai-default");
  assert.equal(JSON.stringify(result.summary).includes("access-new"), false);
  const saved = JSON.parse(fs.readFileSync(sharedAuth, "utf8"));
  assert.equal(saved.providers["openai-codex"].tokens.access_token, "access-new");
}

async function testRestartOnlyHealthyGatewayWorkers() {
  const { calls, service } = createHarness();
  const result = await service.restartRunningGatewayWorkers({ reason: "quota-rotation" });

  assert.equal(result.ok, true);
  assert.equal(result.scanned, 2);
  assert.equal(result.restartedCount, 1);
  assert.equal(calls.stops.length, 1);
  assert.equal(calls.starts.length, 1);
  assert.equal(calls.stops[0].worker.profile, "owner");
  assert.deepEqual(calls.starts[0].input, { reason: "quota-rotation" });
}

function testHelperContracts() {
  assert.equal(healthyGatewayWorkerResult({ ok: true }), true);
  assert.equal(healthyGatewayWorkerResult({ health: { status: "ok" } }), true);
  assert.equal(healthyGatewayWorkerResult({ ok: false }), false);
  assert.match(sharedAuthFile({
    gatewayWorkerRoot: "/tmp/gateway-worker",
  }, path, () => ({})), /shared-auth\/auth\.json$/);
}

async function run() {
  await testRotatesSharedAuthFile();
  await testRestartOnlyHealthyGatewayWorkers();
  testHelperContracts();
  console.log("openai codex quota failover runtime service tests passed");
}

run().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
