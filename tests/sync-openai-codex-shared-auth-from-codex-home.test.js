"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "sync-openai-codex-shared-auth-from-codex-home.js");
const { syncDoc } = require(scriptPath);

const now = "2026-06-21T00:00:00.000Z";
const source = {
  auth_mode: "chatgpt",
  tokens: {
    access_token: "access-token",
    refresh_token: "refresh-token",
    id_token: "id-token",
    account_id: "acct",
  },
  last_refresh: "2026-06-20T23:00:00.000Z",
};
const target = {
  active_provider: "xai-oauth",
  credential_pool: {
    "openai-codex": [{
      id: "existing",
      label: "Existing",
      auth_type: "chatgpt",
      priority: 10,
      source: "old",
      access_token: "old-access",
      refresh_token: "old-refresh",
      last_error_code: "refresh_token_reused",
      last_error_reason: "consumed",
      last_error_message: "stale",
      last_error_reset_at: 1,
      request_count: 12,
    }],
  },
  providers: {
    "openai-codex": {
      auth_mode: "chatgpt",
      tokens: {
        access_token: "old-access",
        refresh_token: "old-refresh",
      },
      last_refresh: "old",
    },
  },
  updated_at: "old",
  version: 1,
};

const result = syncDoc(JSON.parse(JSON.stringify(target)), source, {
  codexHome: "/Users/example/path",
  source: "profile-store",
  activeProfileId: "previous",
}, now);
assert.equal(result.summary.codexHome, "/Users/example/path");
assert.equal(result.doc.updated_at, now);
assert.equal(result.doc.providers["openai-codex"].tokens.access_token, "access-token");
assert.equal(result.doc.credential_pool["openai-codex"][0].access_token, "access-token");
assert.equal(result.doc.credential_pool["openai-codex"][0].refresh_token, "refresh-token");
assert.equal(result.doc.credential_pool["openai-codex"][0].id_token, "id-token");
assert.equal(result.doc.credential_pool["openai-codex"][0].account_id, "acct");
assert.equal(result.doc.credential_pool["openai-codex"][0].last_error_code, null);
assert.equal(result.doc.credential_pool["openai-codex"][0].last_error_message, null);
assert.equal(result.doc.credential_pool["openai-codex"][0].request_count, 12);

const root = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-codex-auth-sync-"));
const codexHome = path.join(root, ".codex-homes", "previous");
const runtimeRoot = path.join(root, ".codex-mobile-web");
const sharedRoot = path.join(root, "gateway-worker", "telemetry", "profiles", "shared-auth");
fs.mkdirSync(codexHome, { recursive: true });
fs.mkdirSync(runtimeRoot, { recursive: true });
fs.mkdirSync(sharedRoot, { recursive: true });
fs.writeFileSync(path.join(codexHome, "auth.json"), JSON.stringify(source, null, 2));
fs.writeFileSync(path.join(runtimeRoot, "codex-profiles.json"), JSON.stringify({
  activeProfileId: "previous",
  profiles: [{ id: "previous", codexHome }],
}, null, 2));
const sharedAuthFile = path.join(sharedRoot, "auth.json");
fs.writeFileSync(sharedAuthFile, JSON.stringify(target, null, 2));
fs.chmodSync(sharedAuthFile, 0o640);
const beforeStat = fs.statSync(sharedAuthFile);

const plan = spawnSync(process.execPath, [
  scriptPath,
  "--root",
  root,
  "--codex-home",
  codexHome,
  "--profile-file",
  path.join(runtimeRoot, "codex-profiles.json"),
  "--json",
], { cwd: repoRoot, encoding: "utf8" });
assert.equal(plan.status, 0, plan.stderr);
assert.equal(JSON.parse(plan.stdout).mode, "plan");
assert.equal(JSON.parse(fs.readFileSync(sharedAuthFile, "utf8")).providers["openai-codex"].tokens.access_token, "old-access");

const execute = spawnSync(process.execPath, [
  scriptPath,
  "--root",
  root,
  "--codex-home",
  codexHome,
  "--profile-file",
  path.join(runtimeRoot, "codex-profiles.json"),
  "--execute",
  "--json",
], { cwd: repoRoot, encoding: "utf8" });
assert.equal(execute.status, 0, execute.stderr);
const payload = JSON.parse(execute.stdout);
assert.equal(payload.updated, true);
assert.ok(payload.backupPath);
assert.equal(fs.existsSync(payload.backupPath), true);
assert.equal(JSON.parse(fs.readFileSync(sharedAuthFile, "utf8")).credential_pool["openai-codex"][0].access_token, "access-token");
const afterStat = fs.statSync(sharedAuthFile);
assert.equal(afterStat.mode & 0o777, 0o640);
assert.equal(afterStat.uid, beforeStat.uid);
assert.equal(afterStat.gid, beforeStat.gid);

console.log("sync openai codex shared auth from codex home tests passed");
