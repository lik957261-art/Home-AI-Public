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
    auditOwnerReadonlyKey: () => options.auditOwnerReadonlyKey || "",
    auditOwnerReadonlyKeyPath: () => path.join(tempDir, "audit-owner-readonly.key"),
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

function reqWithQueryKey(key) {
  return { headers: { host: "localhost" }, url: `/?key=${encodeURIComponent(key)}` };
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

function testWorkspaceKeyRotationDoesNotTouchPluginBindings() {
  const { provider, tempDir } = makeProvider({ envKey: "owner-key" });
  const pluginAuthPath = path.join(tempDir, "plugin-workspace-authorizations.json");
  const pluginConfigPath = path.join(tempDir, "drive", "users", "workspace_a", ".hermes-wardrobe", "config.json");
  const pluginKeyPath = path.join(tempDir, "drive", "users", "workspace_a", ".hermes-wardrobe", "access-key.txt");
  fs.mkdirSync(path.dirname(pluginConfigPath), { recursive: true });
  fs.writeFileSync(pluginAuthPath, JSON.stringify({
    version: 1,
    plugins: {
      wardrobe: {
        records: {
          workspace_a: {
            workspaceId: "workspace_a",
            status: "authorized",
            provisioningStatus: "active",
            provisioningError: "",
          },
        },
      },
    },
  }, null, 2), "utf8");
  fs.writeFileSync(pluginConfigPath, JSON.stringify({
    workspace_id: "wardrobe:workspace_a",
    hermes_workspace_id: "workspace_a",
    access_key_file: ".hermes-wardrobe/access-key.txt",
  }, null, 2), "utf8");
  fs.writeFileSync(pluginKeyPath, "wd_live_existing_plugin_key\n", "utf8");

  const before = {
    auth: fs.readFileSync(pluginAuthPath, "utf8"),
    config: fs.readFileSync(pluginConfigPath, "utf8"),
    key: fs.readFileSync(pluginKeyPath, "utf8"),
  };
  const rotated = provider.rotateWorkspaceAccessKey("workspace_a", { actor: "owner" });
  assert.match(rotated.key, /^hwk_/);
  assert.equal(fs.readFileSync(pluginAuthPath, "utf8"), before.auth);
  assert.equal(fs.readFileSync(pluginConfigPath, "utf8"), before.config);
  assert.equal(fs.readFileSync(pluginKeyPath, "utf8"), before.key);
}

function testWorkspaceAuthCanCarryAccessibleWorkspaceIds() {
  const { provider } = makeProvider({ envKey: "owner-key" });
  const workspace = provider.rotateWorkspaceAccessKey("workspace_a", { actor: "owner" });
  const originalFind = provider.authenticateRequest;
  const auth = originalFind(reqWithKey(workspace.key));
  auth.workspaceIds = ["workspace_a", "workspace_b"];
  auth.workspaces = ["workspace_a", "workspace_b"];
  assert.equal(provider.authCanAccessWorkspace(auth, "workspace_a"), true);
  assert.equal(provider.authCanAccessWorkspace(auth, "workspace_b"), true);
}

function testAuditOwnerReadonlyKeyHasOwnerVisibilityWithoutBeingGlobalOwnerKey() {
  const { provider, tempDir } = makeProvider({ envKey: "owner-key" });
  const auditKeyPath = path.join(tempDir, "audit-owner-readonly.key");
  fs.writeFileSync(auditKeyPath, "audit-readonly-key\n# rotated old key\n", "utf8");

  const auth = provider.authenticateRequest(reqWithKey("audit-readonly-key"));
  assert.equal(auth.ok, true);
  assert.equal(auth.isOwner, true);
  assert.equal(auth.role, "owner");
  assert.equal(auth.workspaceId, "owner");
  assert.equal(auth.principalId, "audit-owner-readonly");
  assert.equal(auth.keySource, "audit_owner_readonly");
  assert.equal(auth.auditReadOnly, true);
  assert.equal(provider.isOwnerAuth(auth), true);
  assert.equal(provider.isAuditReadOnlyAuth(auth), true);
  assert.equal(provider.authCanAccessWorkspace(auth, "owner"), true);
  assert.equal(provider.authCanAccessWorkspace(auth, "workspace_a"), true);
  assert.equal(provider.auditOwnerReadonlyKeySource(), "file");
  assert.equal(provider.auditOwnerReadonlyKeyDisplayPath(), "audit-owner-readonly.key");

  const ownerAuth = provider.authenticateRequest(reqWithKey("owner-key"));
  assert.equal(ownerAuth.keySource, "env");
  assert.equal(provider.isAuditReadOnlyAuth(ownerAuth), false);
}

function testQueryAccessKeyCanBeDisabled() {
  const { provider } = makeProvider({ envKey: "owner-key" });
  assert.equal(provider.authenticateRequest(reqWithQueryKey("owner-key")).ok, true);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-auth-query-"));
  const strict = createAuthProvider({
    disableAuth: () => false,
    envKey: () => "owner-key",
    authKeyPath: () => path.join(tempDir, "owner.key"),
    accessKeysPath: () => path.join(tempDir, "access-keys.json"),
    allowQueryAccessKey: () => false,
    ensureDataDir: () => {},
    findWorkspace: () => null,
  });
  assert.equal(strict.authenticateRequest(reqWithQueryKey("owner-key")).ok, false);
  assert.equal(strict.authenticateRequest(reqWithKey("owner-key")).ok, true);
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
testWorkspaceKeyRotationDoesNotTouchPluginBindings();
testWorkspaceAuthCanCarryAccessibleWorkspaceIds();
testAuditOwnerReadonlyKeyHasOwnerVisibilityWithoutBeingGlobalOwnerKey();
testQueryAccessKeyCanBeDisabled();
testGlobalRotationEnvGuardAndDisabledAuth();
console.log("auth-provider tests passed");
