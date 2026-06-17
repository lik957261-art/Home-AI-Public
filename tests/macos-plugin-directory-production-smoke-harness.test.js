"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const script = read("scripts/macos-plugin-directory-production-smoke.js");
const runbook = read("docs/RUNBOOKS/macos-production-closure-validation.md");
const deploymentDoc = read("docs/MODULES/deployment.md");
const pluginTopicsDoc = read("docs/MODULES/plugin-topics.md");

assert.match(script, /X-Hermes-Web-Key/);
assert.match(script, /\/api\/workspaces/);
assert.match(script, /\/api\/projects\?workspaceId=/);
assert.match(script, /\/api\/single-window/);
assert.match(script, /\/api\/directories\/create/);
assert.match(script, /\/api\/directories\/preview/);
assert.match(script, /PLUGIN_FOLDERS/);
assert.match(script, /\$WINDOWS_WSL_DRIFT/);
assert.match(script, /\$WINDOWS_DRIFT/);
assert.match(script, /\$DRIVE/);
assert.doesNotMatch(script, /console\.log\(.*accessKeyFile/);
assert.doesNotMatch(script, /console\.error\(.*accessKeyFile/);
assert.doesNotMatch(script, /console\.log\(.*key/);

assert.match(runbook, /macos-plugin-directory-production-smoke\.js/);
assert.match(deploymentDoc, /macos-plugin-directory-production-smoke\.js/);
assert.match(pluginTopicsDoc, /macos-plugin-directory-production-smoke\.js/);

const {
  AUTH_HEADER,
  PLUGIN_FOLDERS,
  compactError,
  compactPath,
  parseArgs,
} = require("../scripts/macos-plugin-directory-production-smoke");

const parsed = parseArgs([]);
assert.equal(parsed.root, "/Users/example/path");
assert.equal(parsed.base, "http://127.0.0.1:8797");
assert.ok(parsed.accessKeyFile.endsWith("/data/secrets/owner-web-key.secret"));
assert.equal(AUTH_HEADER, "X-Hermes-Web-Key");
assert.deepEqual(PLUGIN_FOLDERS, ["衣橱", "记账", "邮箱", "健康", "笔记"]);

assert.equal(
  compactPath("/Users/example/path", parsed.root),
  "$DRIVE/users/owner/Hermes-徐欣",
);
assert.equal(
  compactPath("/mnt/c/ProgramData/HermesMobile/data/drive/users/owner/Hermes-徐欣", parsed.root),
  "$WINDOWS_WSL_DRIFT/users/owner/Hermes-徐欣",
);
assert.equal(
  compactPath("C:\\ProgramData\\HermesMobile\\data\\drive\\users\\owner\\Hermes-徐欣", parsed.root),
  "$WINDOWS_DRIFT/users/owner/Hermes-徐欣",
);

const compacted = compactError(
  "EACCES: permission denied, mkdir '/Users/example/path'",
  parsed.root,
);
assert.match(compacted, /\$DRIVE\/users\/owner\/Hermes-徐欣\/Eileen\/插件/);
assert.doesNotMatch(compacted, /\/Users\/hermes-host\/HermesMobile\/data\/drive/);

console.log("macOS plugin directory production smoke harness tests passed");
