"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createEmailPluginProvisioningService,
  emailWorkspaceConfigPath,
  emailWorkspaceKeyPath,
  emailWorkspaceRegistrationUrl,
  findEmailOwnerKeyPath,
} = require("../adapters/email-plugin-provisioning-service");

async function testEmailWorkspaceRegistrationCreatesKeyAndConfig() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "email-provisioning-"));
  const ownerKeyPath = path.join(dir, "plugin-secrets", "email-owner-key.txt");
  fs.mkdirSync(path.dirname(ownerKeyPath), { recursive: true });
  fs.writeFileSync(ownerKeyPath, "email-owner-key\n", "utf8");
  const calls = [];
  const service = createEmailPluginProvisioningService({
    dataDir: dir,
    env: {},
    fetch(url, options = {}) {
      calls.push({ url, options, body: JSON.parse(options.body) });
      const workspaceRoot = JSON.parse(options.body).workspace_root;
      const configDir = path.join(workspaceRoot, ".hermes-email");
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify({ status: "active" }), "utf8");
      fs.writeFileSync(path.join(configDir, "access-key.txt"), "email-ws-secret\n", "utf8");
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true, workspace_id: "weixin_email", created: true }),
      });
    },
  });
  const result = await service.provisionWorkspace({
    workspaceId: "weixin_email",
    displayName: "Email User",
    emailManifestUrl: "http://127.0.0.1:5175/api/v1/hermes/plugin/manifest",
  });
  assert.equal(result.ok, true);
  assert.equal(result.keyCreated, true);
  assert.equal(result.configCreated, true);
  assert.equal(fs.existsSync(emailWorkspaceKeyPath({ dataDir: dir, workspaceId: "weixin_email" })), true);
  assert.equal(fs.existsSync(emailWorkspaceConfigPath({ dataDir: dir, workspaceId: "weixin_email" })), true);
  assert.equal(calls[0].url, "http://127.0.0.1:5175/api/v1/hermes/plugin/workspaces");
  assert.equal(calls[0].options.headers.Authorization, "Bearer email-owner-key");
  assert.equal(calls[0].body.workspace_root, path.join(dir, "drive", "users", "weixin_email"));
  assert.equal(JSON.stringify(result).includes("email-ws-secret"), false);
}

async function testEmailProvisioningFailsClosedWithoutOwnerKey() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "email-provisioning-missing-key-"));
  const service = createEmailPluginProvisioningService({
    dataDir: dir,
    env: {},
    fetch() {
      throw new Error("missing owner key should block before fetch");
    },
  });
  const result = await service.provisionWorkspace({
    workspaceId: "weixin_email",
    emailManifestUrl: "http://127.0.0.1:5175/api/v1/hermes/plugin/manifest",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "email_owner_key_missing");
}

function testHelpers() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "email-provisioning-helpers-"));
  const ownerKeyPath = path.join(dir, "plugin-secrets", "email-owner-key.txt");
  fs.mkdirSync(path.dirname(ownerKeyPath), { recursive: true });
  fs.writeFileSync(ownerKeyPath, "email-owner-key\n", "utf8");
  assert.equal(findEmailOwnerKeyPath({ dataDir: dir, env: {} }), ownerKeyPath);
  assert.equal(
    emailWorkspaceRegistrationUrl("http://127.0.0.1:5175/api/v1/hermes/plugin/manifest"),
    "http://127.0.0.1:5175/api/v1/hermes/plugin/workspaces",
  );
}

async function main() {
  testHelpers();
  await testEmailWorkspaceRegistrationCreatesKeyAndConfig();
  await testEmailProvisioningFailsClosedWithoutOwnerKey();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
