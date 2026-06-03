"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createNotePluginProvisioningService,
  canonicalNoteWorkspaceId,
  noteWorkspaceConfigPath,
  noteWorkspaceKeyPath,
  noteWorkspaceRegistrationUrl,
  findNoteOwnerKeyPath,
  sha256,
} = require("../adapters/note-plugin-provisioning-service");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermes-note-provision-"));
}

async function testCreatesWorkspaceKeyRegistersHashAndWritesConfig() {
  const dataDir = tempDir();
  const ownerKeyPath = path.join(dataDir, "plugin-secrets", "note-owner-key.txt");
  fs.mkdirSync(path.dirname(ownerKeyPath), { recursive: true });
  fs.writeFileSync(ownerKeyPath, "note-registration-test-key\n", "utf8");
  const calls = [];
  const service = createNotePluginProvisioningService({
    dataDir,
    env: {},
    fetch(url, options = {}) {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          ok: true,
          workspace_id: "note:weixin_note",
          hermes_workspace_id: "weixin_note",
        }),
      });
    },
  });
  const result = await service.provisionWorkspace({
    workspaceId: "weixin_note",
    displayName: "Note User",
    noteManifestUrl: "http://127.0.0.1:4181/api/v1/hermes/plugin/manifest",
  });
  assert.equal(result.ok, true);
  assert.equal(result.keyCreated, true);
  assert.equal(result.configCreated, true);
  assert.equal(result.noteWorkspaceId, "note:weixin_note");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:4181/api/v1/hermes/plugin/workspaces");
  assert.equal(calls[0].options.headers.Authorization, "Bearer note-registration-test-key");
  assert.equal(calls[0].body.owner, "hermes");
  assert.equal(calls[0].body.workspace_id, "note:weixin_note");
  assert.equal(calls[0].body.target_workspace_id, "weixin_note");
  assert.equal(calls[0].body.hermes_workspace_id, "weixin_note");
  assert.deepEqual(calls[0].body.scopes, ["notes:read", "notes:write", "notes:search"]);
  assert.match(calls[0].body.access_key_hash, /^[a-f0-9]{64}$/);

  const keyPath = noteWorkspaceKeyPath({ dataDir, workspaceId: "weixin_note" });
  const rawKey = fs.readFileSync(keyPath, "utf8").trim();
  assert.match(rawKey, /^hnt_/);
  assert.equal(calls[0].body.access_key_hash, sha256(rawKey));
  assert.equal(JSON.stringify(calls[0].body).includes(rawKey), false);

  const configPath = noteWorkspaceConfigPath({ dataDir, workspaceId: "weixin_note" });
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(config.api_base_url, "http://127.0.0.1:4181");
  assert.equal(config.workspace_id, "note:weixin_note");
  assert.equal(config.hermes_workspace_id, "weixin_note");
  assert.equal(config.access_key_file, "access-key.txt");
  assert.equal(config.display_name, "Note User");
  assert.equal(JSON.stringify(config).includes(rawKey), false);
  assert.equal(JSON.stringify(result).includes(rawKey), false);
  assert.equal(JSON.stringify(result).includes("note-registration-test-key"), false);
}

async function testOwnerProvisioningWritesCanonicalConfig() {
  const dataDir = tempDir();
  const ownerKeyPath = path.join(dataDir, "plugin-secrets", "note-owner-key.txt");
  fs.mkdirSync(path.dirname(ownerKeyPath), { recursive: true });
  fs.writeFileSync(ownerKeyPath, "note-registration-test-key\n", "utf8");
  const calls = [];
  const service = createNotePluginProvisioningService({
    dataDir,
    env: {},
    fetch(url, options = {}) {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          ok: true,
          workspace_id: "note:owner",
          hermes_workspace_id: "owner",
        }),
      });
    },
  });
  const result = await service.provisionWorkspace({
    workspaceId: "owner",
    displayName: "Owner",
    noteManifestUrl: "http://127.0.0.1:4181/api/v1/hermes/plugin/manifest",
  });
  assert.equal(result.ok, true);
  assert.equal(result.noteWorkspaceId, "note:owner");
  assert.equal(calls[0].body.workspace_id, "note:owner");
  assert.equal(calls[0].body.target_workspace_id, "owner");
  assert.equal(calls[0].body.hermes_workspace_id, "owner");
  const rawKey = fs.readFileSync(noteWorkspaceKeyPath({ dataDir, workspaceId: "owner" }), "utf8").trim();
  assert.equal(calls[0].body.access_key_hash, sha256(rawKey));
  const config = JSON.parse(fs.readFileSync(noteWorkspaceConfigPath({ dataDir, workspaceId: "owner" }), "utf8"));
  assert.equal(config.workspace_id, "note:owner");
  assert.equal(config.hermes_workspace_id, "owner");
  assert.equal(config.api_base_url, "http://127.0.0.1:4181");
  assert.equal(JSON.stringify(config).includes(rawKey), false);
}

async function testProvisioningCanUseNoteRegistrationKeyEnvAlias() {
  const dataDir = tempDir();
  const calls = [];
  const service = createNotePluginProvisioningService({
    dataDir,
    env: { NOTE_REGISTRATION_KEY: "note-registration-env-key" },
    fetch(url, options = {}) {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true, workspace_id: "note:weixin_note" }),
      });
    },
  });
  const result = await service.provisionWorkspace({
    workspaceId: "weixin_note",
    noteManifestUrl: "http://127.0.0.1:4181/api/v1/hermes/plugin/manifest",
  });
  assert.equal(result.ok, true);
  assert.equal(calls[0].options.headers.Authorization, "Bearer note-registration-env-key");
  assert.equal(calls[0].body.workspace_id, "note:weixin_note");
  assert.equal(JSON.stringify(result).includes("note-registration-env-key"), false);
}

async function testProvisioningFailsClosedWithoutOwnerKey() {
  const dataDir = tempDir();
  let fetchCalled = false;
  const service = createNotePluginProvisioningService({
    dataDir,
    env: {},
    fetch() {
      fetchCalled = true;
      throw new Error("fetch must not run without note registration key");
    },
  });
  const result = await service.provisionWorkspace({
    workspaceId: "weixin_note",
    noteManifestUrl: "http://127.0.0.1:4181/api/v1/hermes/plugin/manifest",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "note_owner_key_missing");
  assert.equal(fetchCalled, false);
  assert.equal(fs.existsSync(noteWorkspaceKeyPath({ dataDir, workspaceId: "weixin_note" })), false);
}

function testHelpers() {
  const dataDir = tempDir();
  const ownerKeyPath = path.join(dataDir, "plugin-secrets", "note-owner-key.txt");
  fs.mkdirSync(path.dirname(ownerKeyPath), { recursive: true });
  fs.writeFileSync(ownerKeyPath, "note-registration-test-key\n", "utf8");
  assert.equal(findNoteOwnerKeyPath({ dataDir, env: {} }), ownerKeyPath);
  assert.equal(findNoteOwnerKeyPath({ dataDir, env: { NOTE_REGISTRATION_KEY_PATH: ownerKeyPath } }), ownerKeyPath);
  assert.equal(
    noteWorkspaceRegistrationUrl("http://127.0.0.1:4181/api/v1/hermes/plugin/manifest"),
    "http://127.0.0.1:4181/api/v1/hermes/plugin/workspaces",
  );
  assert.equal(canonicalNoteWorkspaceId("owner"), "note:owner");
  assert.equal(canonicalNoteWorkspaceId("note:owner"), "note:owner");
}

(async () => {
  testHelpers();
  await testCreatesWorkspaceKeyRegistersHashAndWritesConfig();
  await testOwnerProvisioningWritesCanonicalConfig();
  await testProvisioningCanUseNoteRegistrationKeyEnvAlias();
  await testProvisioningFailsClosedWithoutOwnerKey();
  console.log("note-plugin-provisioning-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
