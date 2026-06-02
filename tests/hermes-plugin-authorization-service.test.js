"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createHermesPluginAuthorizationService,
  normalizeState,
} = require("../adapters/hermes-plugin-authorization-service");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermes-plugin-auth-"));
}

function testGrantAndRevokeWorkspace() {
  const dir = tempDir();
  const service = createHermesPluginAuthorizationService({
    dataDir: dir,
    nowIso: () => "2026-05-30T12:00:00.000Z",
  });
  const grant = service.grantWorkspace({
    pluginId: "finance",
    workspaceId: "weixin_wuping",
    actor: "owner",
    provisioningStatus: "pending",
  });
  assert.equal(grant.ok, true);
  assert.equal(service.isWorkspaceAuthorized("finance", "weixin_wuping"), true);
  assert.deepEqual(service.authorizedWorkspaceIds("finance"), ["weixin_wuping"]);

  const next = createHermesPluginAuthorizationService({ dataDir: dir });
  assert.equal(next.isWorkspaceAuthorized("finance", "weixin_wuping"), true);
  assert.equal(next.revokeWorkspace({ pluginId: "finance", workspaceId: "weixin_wuping" }).ok, true);
  assert.equal(next.isWorkspaceAuthorized("finance", "weixin_wuping"), false);
}

function testGrantAndRevokeOwnerWorkspace() {
  const dir = tempDir();
  const service = createHermesPluginAuthorizationService({
    dataDir: dir,
    nowIso: () => "2026-06-02T12:00:00.000Z",
  });
  const grant = service.grantWorkspace({
    pluginId: "health",
    workspaceId: "owner",
    actor: "owner",
    provisioningStatus: "pending",
  });
  assert.equal(grant.ok, true);
  assert.equal(grant.record.workspaceId, "owner");
  assert.equal(service.isWorkspaceAuthorized("health", "owner"), true);
  assert.deepEqual(service.authorizedWorkspaceIds("health"), ["owner"]);
  const updated = service.updateProvisioningStatus({
    pluginId: "health",
    workspaceId: "owner",
    provisioningStatus: "active",
  });
  assert.equal(updated.ok, true);
  assert.equal(service.recordForWorkspace("health", "owner").provisioningStatus, "active");
  assert.equal(service.revokeWorkspace({ pluginId: "health", workspaceId: "owner" }).ok, true);
  assert.equal(service.isWorkspaceAuthorized("health", "owner"), false);
}

function testNormalizeKeepsOwnerAndSanitizesUnsafeIds() {
  const normalized = normalizeState({
    plugins: {
      "finance<script>": {
        records: {
          owner: { workspaceId: "owner", status: "authorized" },
          "../bad": { workspaceId: "../bad", status: "authorized" },
          weixin_wuping: { status: "authorized" },
        },
      },
    },
  });
  assert.deepEqual(Object.keys(normalized.plugins), ["financescript"]);
  assert.deepEqual(Object.keys(normalized.plugins.financescript.records), ["owner", "..bad", "weixin_wuping"]);
  assert.equal(normalized.plugins.financescript.records.owner.status, "authorized");
  assert.equal(normalized.plugins.financescript.records.weixin_wuping.status, "authorized");
}

function run() {
  testGrantAndRevokeWorkspace();
  testGrantAndRevokeOwnerWorkspace();
  testNormalizeKeepsOwnerAndSanitizesUnsafeIds();
}

run();
