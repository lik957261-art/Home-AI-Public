"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { apply } = require("../scripts/macos-plugin-workspace-provisioning-apply");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_PLUGIN_IDS = ["email", "finance", "growth", "health", "moira", "note", "wardrobe"];

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "homeai-plugin-provisioning-apply-"));
}

function writeSecret(root, name, value) {
  const file = path.join(root, "data", "plugin-secrets", name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${value}\n`, { mode: 0o600 });
  return file;
}

function writePlan(root) {
  const file = path.join(root, "data", "plugin-workspace-provisioning-plan.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({
    schemaVersion: 1,
    generatedBy: "install-macos-production plan-plugin-workspace-provisioning",
    defaultBusinessPluginIds: DEFAULT_PLUGIN_IDS,
    createsPluginKeys: false,
    createsWorkspaceGrants: false,
    callsPluginBindEndpoints: false,
    workspaces: [{
      workspaceId: "owner",
      macUser: "hm-owner",
      driveName: "owner",
      plugins: DEFAULT_PLUGIN_IDS.map((pluginId) => ({ pluginId })),
    }],
  }, null, 2)}\n`);
}

function fakeFetchForRoot(root, calls) {
  return async function fakeFetch(url, options = {}) {
    const parsed = new URL(url);
    const body = JSON.parse(options.body || "{}");
    calls.push({
      port: parsed.port,
      pathname: parsed.pathname,
      authorizationPresent: Boolean(options.headers?.Authorization),
      body,
    });
    if (parsed.port === "5175" && parsed.pathname.endsWith("/workspaces")) {
      const workspaceRoot = String(body.workspace_root || "");
      const emailDir = path.join(workspaceRoot, ".hermes-email");
      fs.mkdirSync(emailDir, { recursive: true });
      fs.writeFileSync(path.join(emailDir, "access-key.txt"), "email-workspace-key\n", { mode: 0o600 });
      fs.writeFileSync(path.join(emailDir, "config.json"), `${JSON.stringify({
        schema_version: 1,
        api_base_url: "http://127.0.0.1:5175",
        workspace_id: body.workspace_id,
        hermes_workspace_id: body.workspace_id,
        access_key_file: "access-key.txt",
      }, null, 2)}\n`, { mode: 0o600 });
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, created: true, workspace_id: body.workspace_id }),
      };
    }
    if (parsed.pathname.endsWith("/users/bind")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: { user: { id: "finance-user" }, ledger: { id: "finance-ledger" }, created: true },
        }),
      };
    }
    if (parsed.pathname.endsWith("/workspaces")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          workspace_id: body.workspace_id,
          hermes_workspace_id: body.hermes_workspace_id || body.target_workspace_id || body.workspace_id,
          result: {
            workspace_id: body.workspace_id,
            owner: body.hermes_workspace_id || body.owner || "owner",
            created: true,
          },
        }),
      };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
}

async function testApplyProvisionsOwnerPluginBindingsWithoutRawSecrets() {
  const root = tempRoot();
  writePlan(root);
  writeSecret(root, "wardrobe-registration-access-key.txt", "wardrobe-registration-secret");
  writeSecret(root, "growth-owner-key.txt", "growth-owner-secret");
  writeSecret(root, "health-owner-key.txt", "health-owner-secret");
  writeSecret(root, "note-owner-key.txt", "note-owner-secret");
  writeSecret(root, "email-owner-key.txt", "email-owner-secret");
  const calls = [];
  const report = await apply({
    root,
    appSource: REPO_ROOT,
    workspaceMap: "owner:hm-owner:owner",
    skipGatewayRefresh: true,
    retryDelayMs: 0,
    fetch: fakeFetchForRoot(root, calls),
  });

  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.createsPluginKeys, true);
  assert.equal(report.createsWorkspaceGrants, true);
  assert.equal(report.callsPluginBindEndpoints, true);
  assert.equal(report.activeCount, DEFAULT_PLUGIN_IDS.length);
  assert.equal(report.failedCount, 0);
  assert.equal(report.workspaces[0].workspaceId, "owner");
  assert.deepEqual(report.workspaces[0].plugins.map((plugin) => plugin.pluginId).sort(), DEFAULT_PLUGIN_IDS);
  assert.deepEqual(report.workspaces[0].plugins.map((plugin) => plugin.status), DEFAULT_PLUGIN_IDS.map(() => "active"));
  assert.equal(fs.existsSync(path.join(root, "data", "plugin-workspace-provisioning-apply.json")), true);

  for (const pluginId of DEFAULT_PLUGIN_IDS) {
    const dir = path.join(root, "data", "drive", "users", "owner", `.hermes-${pluginId}`);
    assert.equal(fs.existsSync(path.join(dir, "access-key.txt")), true, pluginId);
    assert.equal(fs.existsSync(path.join(dir, "config.json")), true, pluginId);
  }
  const wardrobeConfig = JSON.parse(fs.readFileSync(path.join(root, "data", "drive", "users", "owner", ".hermes-wardrobe", "config.json"), "utf8"));
  assert.equal(wardrobeConfig.workspace_id, "wardrobe:owner");
  assert.equal(wardrobeConfig.hermes_workspace_id, "owner");
  const moiraConfig = JSON.parse(fs.readFileSync(path.join(root, "data", "drive", "users", "owner", ".hermes-moira", "config.json"), "utf8"));
  assert.equal(moiraConfig.workspace_id, "owner");

  const authorizationStore = JSON.parse(fs.readFileSync(path.join(root, "data", "plugin-workspace-authorizations.json"), "utf8"));
  for (const pluginId of DEFAULT_PLUGIN_IDS) {
    assert.equal(authorizationStore.plugins[pluginId].records.owner.provisioningStatus, "active", pluginId);
  }

  const serialized = JSON.stringify(report);
  for (const secret of ["wardrobe-registration-secret", "growth-owner-secret", "health-owner-secret", "note-owner-secret", "email-owner-secret"]) {
    assert.equal(serialized.includes(secret), false, secret);
  }
  assert.equal(calls.some((call) => call.port === "5175"), true);
  assert.equal(calls.some((call) => call.port === "8791"), true);
  assert.equal(calls.some((call) => call.port === "8765"), true);
  assert.equal(report.actions.some((action) => action.action === "prepare-email-workspace-binding"), true);
  assert.equal(report.actions.some((action) => action.action === "finalize-email-workspace-binding"), true);
}

async function testApplyRetriesTransientPluginFetchFailure() {
  const root = tempRoot();
  writePlan(root);
  writeSecret(root, "wardrobe-registration-access-key.txt", "wardrobe-registration-secret");
  writeSecret(root, "growth-owner-key.txt", "growth-owner-secret");
  writeSecret(root, "health-owner-key.txt", "health-owner-secret");
  writeSecret(root, "note-owner-key.txt", "note-owner-secret");
  writeSecret(root, "email-owner-key.txt", "email-owner-secret");
  const calls = [];
  let growthAttempts = 0;
  const fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.port === "4881" && parsed.pathname.endsWith("/workspaces")) {
      growthAttempts += 1;
      if (growthAttempts === 1) throw new Error("fetch failed");
    }
    return fakeFetchForRoot(root, calls)(url, options);
  };
  const report = await apply({
    root,
    appSource: REPO_ROOT,
    workspaceMap: "owner:hm-owner:owner",
    skipGatewayRefresh: true,
    retryCount: 2,
    retryDelayMs: 0,
    fetch,
  });
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.equal(growthAttempts, 2);
  assert.equal(report.actions.some((action) => action.action === "retry-plugin-workspace-provisioning" && action.pluginId === "growth"), true);
}

Promise.resolve()
  .then(testApplyProvisionsOwnerPluginBindingsWithoutRawSecrets)
  .then(testApplyRetriesTransientPluginFetchFailure)
  .then(() => {
    console.log("macos plugin workspace provisioning apply tests passed");
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
