"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createFinancePluginProvisioningService,
  financeBindUrl,
  financeWorkspaceKeyPath,
} = require("../adapters/finance-plugin-provisioning-service");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermes-finance-provision-"));
}

async function testCreatesWorkspaceKeyAndBindsWithDisplayName() {
  const dataDir = tempDir();
  const calls = [];
  const service = createFinancePluginProvisioningService({
    dataDir,
    fetch(url, options) {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          ok: true,
          result: {
            user: { id: "user_test_1" },
            ledger: { id: "ledger_test_1" },
            created: true,
          },
        }),
      });
    },
  });
  const result = await service.provisionWorkspace({
    workspaceId: "weixin_test_2",
    displayName: "测试账号",
    financeManifestUrl: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest",
  });
  assert.equal(result.ok, true);
  assert.equal(result.keyCreated, true);
  assert.equal(result.financeUserId, "user_test_1");
  assert.equal(result.ledgerId, "ledger_test_1");
  const keyPath = financeWorkspaceKeyPath({ dataDir, workspaceId: "weixin_test_2" });
  assert.equal(fs.existsSync(keyPath), true);
  const rawKey = fs.readFileSync(keyPath, "utf8").trim();
  assert.match(rawKey, /^hfin_/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8791/api/v1/hermes/plugin/users/bind");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json; charset=utf-8");
  assert.deepEqual(calls[0].body, {
    target_workspace_id: "weixin_test_2",
    display_name: "测试账号",
    role: "owner",
    admin_workspace_id: "owner",
  });
  assert.equal(JSON.stringify(result).includes(rawKey), false);
  assert.equal(calls[0].options.body.includes(rawKey), false);
}

async function testBindFailureDoesNotExposeWorkspaceKey() {
  const dataDir = tempDir();
  const service = createFinancePluginProvisioningService({
    dataDir,
    fetch() {
      return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
    },
  });
  const result = await service.provisionWorkspace({
    workspaceId: "weixin_bind_fail",
    displayName: "Bind Fail",
    financeManifestUrl: "http://127.0.0.1:8791/api/v1/hermes/plugin/manifest",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "finance_bind_failed_503");
  const rawKey = fs.readFileSync(financeWorkspaceKeyPath({ dataDir, workspaceId: "weixin_bind_fail" }), "utf8").trim();
  assert.equal(JSON.stringify(result).includes(rawKey), false);
}

function testBindUrlFromManifestOrigin() {
  assert.equal(
    financeBindUrl("http://127.0.0.1:8791/api/v1/hermes/plugin/manifest"),
    "http://127.0.0.1:8791/api/v1/hermes/plugin/users/bind",
  );
}

(async () => {
  await testCreatesWorkspaceKeyAndBindsWithDisplayName();
  await testBindFailureDoesNotExposeWorkspaceKey();
  testBindUrlFromManifestOrigin();
  console.log("finance-plugin-provisioning-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
