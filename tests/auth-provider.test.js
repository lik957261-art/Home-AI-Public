"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createAuthProvider } = require("../adapters/auth-provider");

function makeProvider(options = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-auth-provider-"));
  const workspaces = [
    { id: "owner", role: "admin", label: "Owner" },
    { id: "workspace_a", role: "user", label: "Workspace A", policy: { principal_id: "principal_a" } },
    { id: "workspace_b", role: "user", label: "Workspace B", policy: { principal_id: "principal_b" } },
  ];
  const provider = createAuthProvider({
    disableAuth: () => Boolean(options.disableAuth),
    envKey: () => options.envKey || "",
    authKeyPath: () => path.join(tempDir, "owner.key"),
    accessKeysPath: () => path.join(tempDir, "access-keys.json"),
    allowMemoryKey: () => Boolean(options.allowMemoryKey),
    nowIso: () => "2026-05-07T00:00:00.000Z",
    ensureDataDir: () => fs.mkdirSync(tempDir, { recursive: true }),
    findWorkspace: (workspaceId) => workspaces.find((item) => item.id === workspaceId) || null,
    workspacePrincipal: (workspaceId) => workspaces.find((item) => item.id === workspaceId)?.policy?.principal_id || workspaceId || "owner",
    listWorkspaces: () => workspaces,
  });
  return { provider, tempDir };
}

function reqWithKey(key) {
  return { headers: { host: "localhost", "x-hermes-web-key": key }, url: "/" };
}

function testFirstRunOwnerSetupAndOwnerAuth() {
  const { provider, tempDir } = makeProvider();
  assert.equal(provider.ownerSetupStatus().setupRequired, true);

  const result = provider.createInitialOwnerKey();
  assert.match(result.key, /^hwk_/);
  assert.equal(fs.existsSync(path.join(tempDir, "owner.key")), true);
  assert.equal(provider.ownerSetupStatus().setupRequired, false);

  const auth = provider.authenticateRequest(reqWithKey(result.key));
  assert.equal(auth.ok, true);
  assert.equal(auth.isOwner, true);
  assert.equal(provider.isOwnerAuth(auth), true);
}

function testWorkspaceKeyRotationAndScopedAuth() {
  const { provider } = makeProvider({ envKey: "owner-key" });
  const rotated = provider.rotateWorkspaceAccessKey("workspace_a", { actor: "owner" });
  assert.match(rotated.key, /^hwk_/);
  assert.equal(rotated.record.hasKey, true);

  const workspaceAuth = provider.authenticateRequest(reqWithKey(rotated.key));
  assert.equal(workspaceAuth.ok, true);
  assert.equal(workspaceAuth.isOwner, false);
  assert.equal(workspaceAuth.workspaceId, "workspace_a");
  assert.equal(workspaceAuth.principalId, "principal_a");
  assert.equal(provider.authCanAccessWorkspace(workspaceAuth, "workspace_a"), true);
  assert.equal(provider.authCanAccessWorkspace(workspaceAuth, "workspace_b"), false);

  const ownerStatus = provider.listWorkspaceAccessKeyStatuses(
    provider.authenticateRequest(reqWithKey("owner-key")),
    { workspaceId: "workspace_a" },
  );
  assert.equal(ownerStatus.length, 1);
  assert.equal(ownerStatus[0].hasKey, true);
  const ownerAllStatus = provider.listWorkspaceAccessKeyStatuses(
    provider.authenticateRequest(reqWithKey("owner-key")),
  );
  assert.deepEqual(ownerAllStatus.map((item) => item.workspaceId), ["workspace_a", "workspace_b"]);

  const workspaceStatus = provider.listWorkspaceAccessKeyStatuses(workspaceAuth);
  assert.equal(workspaceStatus.length, 1);
  assert.equal(workspaceStatus[0].workspaceId, "workspace_a");

  const revoked = provider.revokeWorkspaceAccessKey("workspace_a");
  assert.equal(revoked.revoked, true);
  assert.equal(provider.authenticateRequest(reqWithKey(rotated.key)).ok, false);
}

function testGlobalRotationEnvGuardAndDisabledAuth() {
  const envProvider = makeProvider({ envKey: "owner-key" }).provider;
  assert.throws(() => envProvider.rotateGlobalAccessKey(), /HERMES_WEB_KEY/);
  assert.equal(envProvider.rotateGlobalAccessKey({ dryRun: true }).auth.canPersist, false);

  const disabledProvider = makeProvider({ disableAuth: true }).provider;
  const auth = disabledProvider.authenticateRequest(reqWithKey(""));
  assert.equal(auth.ok, true);
  assert.equal(auth.isOwner, true);
  assert.equal(auth.keySource, "disabled");
}

testFirstRunOwnerSetupAndOwnerAuth();
testWorkspaceKeyRotationAndScopedAuth();
testGlobalRotationEnvGuardAndDisabledAuth();
console.log("auth-provider tests passed");
