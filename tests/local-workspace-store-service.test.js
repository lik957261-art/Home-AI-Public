"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLocalWorkspaceStoreService } = require("../adapters/local-workspace-store-service");

function withTempStore(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-local-workspace-"));
  try {
    return fn({
      root,
      storagePath: path.join(root, "workspaces.json"),
      ownerDefaultWorkspace: path.join(root, "drive", "owner"),
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function createService(context, overrides = {}) {
  const calls = {
    ensureDataDir: 0,
    invalidate: 0,
    clearDynamic: [],
    deleteKey: [],
  };
  const protectedRoots = new Set((overrides.protectedRoots || []).map((item) => path.resolve(item)));
  const blockedAllowedRoots = new Set((overrides.blockedAllowedRoots || []).map((item) => path.resolve(item)));
  const service = createLocalWorkspaceStoreService(Object.assign({
    storagePath: context.storagePath,
    ownerDefaultWorkspace: context.ownerDefaultWorkspace,
    nowIso: () => "2026-05-15T06:30:00.000Z",
    ensureDataDir: () => {
      calls.ensureDataDir += 1;
      fs.mkdirSync(path.dirname(context.storagePath), { recursive: true });
    },
    findWorkspace: () => null,
    deleteWorkspaceAccessKey: (workspaceId) => calls.deleteKey.push(workspaceId),
    invalidateCatalogCache: () => { calls.invalidate += 1; },
    clearDynamicProjectCache: (workspaceId) => calls.clearDynamic.push(workspaceId),
    rootConflictsWithProtected: (value) => protectedRoots.has(path.resolve(String(value || ""))),
    filterRoots: (roots) => (roots || []).filter((root) => !blockedAllowedRoots.has(path.resolve(root))),
  }, overrides));
  return { service, calls };
}

function testDefaultsAndSlugRules() {
  withTempStore((context) => {
    const { service } = createService(context);

    assert.equal(service.workspaceIdSlug(" Fan Fan!! "), "fan-fan");
    assert.equal(service.workspaceIdFromUsername("凡凡").startsWith("user-"), true);
    assert.equal(service.safeWorkspaceFolderName('A<>:"/\\|?* B. '), "A B");
    assert.equal(service.defaultWorkspaceLabel("凡凡", "fallback"), "凡凡");

    const defaults = service.localWorkspaceDefaults({ username: "Stephen", label: "Stephen Plan" });
    assert.equal(defaults.workspaceId, "stephen");
    assert.equal(defaults.label, "Stephen Plan");
    assert.equal(defaults.defaultWorkspace, path.join(context.ownerDefaultWorkspace, "Stephen Plan"));
    assert.deepEqual(defaults.allowedRoots, [defaults.defaultWorkspace]);
  });
}

function testDriveRootDefaultsUseCanonicalWorkspaceUsersRoot() {
  withTempStore((context) => {
    const driveRoot = path.join(context.root, "drive");
    const canonicalContext = Object.assign({}, context, { ownerDefaultWorkspace: driveRoot });
    const { service } = createService(canonicalContext);

    const defaults = service.localWorkspaceDefaults({ workspaceId: "stephen", label: "Stephen Plan" });
    assert.equal(defaults.defaultWorkspace, path.join(driveRoot, "users", "stephen"));
    assert.deepEqual(defaults.allowedRoots, [defaults.defaultWorkspace]);

    const explicitRoot = path.join(context.root, "custom", "stephen");
    const explicit = service.localWorkspaceDefaults({ workspaceId: "stephen", defaultWorkspace: explicitRoot });
    assert.equal(explicit.defaultWorkspace, explicitRoot);

    const legacyRoot = path.join(driveRoot, "徐建中");
    const migrated = service.localWorkspaceDefaults(
      { workspaceId: "xjz", label: "徐建中" },
      { label: "徐建中", defaultWorkspace: legacyRoot, allowedRoots: [legacyRoot] },
    );
    assert.equal(migrated.defaultWorkspace, path.join(driveRoot, "users", "xjz"));
    assert.deepEqual(migrated.allowedRoots, [migrated.defaultWorkspace]);

    const customRoot = path.join(context.root, "manually-selected-root");
    const preserved = service.localWorkspaceDefaults(
      { workspaceId: "xjz", label: "徐建中" },
      { label: "徐建中", defaultWorkspace: customRoot, allowedRoots: [customRoot] },
    );
    assert.equal(preserved.defaultWorkspace, customRoot);
    assert.deepEqual(preserved.allowedRoots, [customRoot]);
  });
}

function testSecurityBoundaryFiltering() {
  withTempStore((context) => {
    const protectedRoot = path.join(context.root, "protected");
    const { service } = createService(context, { protectedRoots: [protectedRoot] });
    assert.throws(
      () => service.localWorkspaceDefaults({ workspaceId: "child", defaultWorkspace: protectedRoot }),
      /Workspace root is blocked/,
    );
  });

  withTempStore((context) => {
    const blockedRoot = path.join(context.root, "blocked");
    const { service } = createService(context, { blockedAllowedRoots: [blockedRoot] });
    assert.throws(
      () => service.localWorkspaceDefaults({ workspaceId: "child", allowedRoots: [blockedRoot] }),
      /Workspace allowed roots are blocked/,
    );
  });
}

function testNormalizeStoreDedupesAndKeepsPolicyData() {
  withTempStore((context) => {
    const blockedRoot = path.join(context.root, "blocked");
    const { service } = createService(context, { protectedRoots: [blockedRoot] });
    const store = service.normalizeLocalWorkspaceStore({
      workspaces: [
        { id: "owner", label: "Owner" },
        {
          id: "child",
          label: "Child",
          defaultWorkspace: path.join(context.root, "child"),
          allowedToolsets: "file,web",
          connectorProfiles: { google: { profile: "child" } },
          accountType: "media",
          allowedOwnerSpecialPlugins: ["music", "finance", "movie"],
        },
        { id: "child", label: "Duplicate", defaultWorkspace: path.join(context.root, "dup") },
        { id: "blocked", defaultWorkspace: blockedRoot },
      ],
    });

    assert.equal(store.schemaVersion, 1);
    assert.equal(store.workspaces.length, 1);
    assert.equal(store.workspaces[0].id, "child");
    assert.deepEqual(store.workspaces[0].allowedToolsets, ["file", "web"]);
    assert.deepEqual(Object.keys(store.workspaces[0].connectorProfiles), ["google"]);
    assert.equal(store.workspaces[0].accountType, "media");
    assert.deepEqual(store.workspaces[0].allowedOwnerSpecialPlugins, ["music", "movie"]);
  });
}

function testUpsertAndDeletePersistAndInvalidate() {
  withTempStore((context) => {
    const existingExternal = { id: "external", source: "external-route-map" };
    const { service, calls } = createService(context, {
      findWorkspace: (workspaceId) => (workspaceId === "external" ? existingExternal : null),
    });

    assert.throws(
      () => service.upsertLocalWorkspace({ workspaceId: "owner" }),
      /Owner workspace already exists/,
    );
    assert.throws(
      () => service.upsertLocalWorkspace({ workspaceId: "external" }),
      /already managed by the external workspace provider/,
    );

    const created = service.upsertLocalWorkspace({ workspaceId: "child", label: "Child", accountType: "media" }, "owner");
    assert.equal(created.id, "child");
    assert.equal(created.createdBy, "owner");
    assert.equal(created.accountType, "media");
    assert.deepEqual(created.allowedOwnerSpecialPlugins, ["music", "movie"]);
    assert.equal(calls.invalidate, 1);
    assert.deepEqual(calls.clearDynamic, ["child"]);
    assert.equal(service.localWorkspaceRecords().length, 1);

    const updated = service.upsertLocalWorkspace({ workspaceId: "child", label: "Child Updated", allowedToolsets: ["file"] }, "other");
    assert.equal(updated.createdBy, "owner");
    assert.equal(updated.label, "Child Updated");
    assert.deepEqual(updated.allowedToolsets, ["file"]);

    assert.deepEqual(service.deleteLocalWorkspace("child"), { id: "child" });
    assert.deepEqual(calls.deleteKey, ["child"]);
    assert.deepEqual(service.localWorkspaceRecords(), []);
    assert.throws(
      () => service.deleteLocalWorkspace("missing"),
      /Local workspace not found/,
    );
    assert.throws(
      () => service.deleteLocalWorkspace("owner"),
      /Invalid workspace/,
    );
    assert.throws(
      () => service.deleteLocalWorkspace("external"),
      /managed by the external workspace provider/,
    );
  });
}

testDefaultsAndSlugRules();
testDriveRootDefaultsUseCanonicalWorkspaceUsersRoot();
testSecurityBoundaryFiltering();
testNormalizeStoreDedupesAndKeepsPolicyData();
testUpsertAndDeletePersistAndInvalidate();

console.log("local-workspace-store-service tests passed");
