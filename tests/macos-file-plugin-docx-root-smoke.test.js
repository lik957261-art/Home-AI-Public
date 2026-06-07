"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { extractDocxTextFromBuffer } = require("../adapters/document-preview-service");
const {
  makeMinimalDocxBuffer,
  parseArgs,
  targetProfiles,
} = require("../scripts/macos-file-plugin-docx-root-smoke");

const repoRoot = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(repoRoot, "scripts", "macos-file-plugin-docx-root-smoke.js"), "utf8");
const deploymentDoc = fs.readFileSync(path.join(repoRoot, "docs", "MODULES", "deployment.md"), "utf8");
const runbook = fs.readFileSync(path.join(repoRoot, "docs", "RUNBOOKS", "macos-worker-filesystem-access.md"), "utf8");
const testMatrix = fs.readFileSync(path.join(repoRoot, "docs", "TEST_MATRIX.md"), "utf8");

assert.match(script, /macos-production-profile-audit/);
assert.match(script, /hermes-mobile-docx/);
assert.match(script, /docx_extract_text/);
assert.match(script, /HERMES_MOBILE_DOCX_ALLOWED_ROOTS/);
assert.match(script, /file_path_outside_allowed_roots/);
assert.match(script, /data\/uploads/);
assert.doesNotMatch(script, /Bearer|Authorization|apiKey|access-key/i);

const docx = makeMinimalDocxBuffer();
const extracted = extractDocxTextFromBuffer(docx);
assert.match(extracted.text, /Hermes DOCX smoke/);

const audit = {
  profileChecks: [
    { profile: "hm-owner-openai-1", provider: "openai-codex", securityLevel: "user" },
    { profile: "deepseekgw1", provider: "deepseek", securityLevel: "user" },
    { profile: "hm-owner-maintenance-1", provider: "openai-codex", securityLevel: "maintenance" },
  ],
};
assert.deepEqual(targetProfiles(audit).map((item) => item.profile), ["hm-owner-openai-1"]);
assert.deepEqual(targetProfiles(audit, ["deepseekgw1"]).map((item) => item.profile), ["deepseekgw1"]);
assert.deepEqual(parseArgs(["--root", "/x", "--profiles", "a,b", "--python", "/py", "--json", "--keep", "--no-strict"]), {
  root: "/x",
  profiles: ["a", "b"],
  python: "/py",
  keep: true,
  json: true,
  strict: false,
});

assert.match(deploymentDoc, /macos-file-plugin-docx-root-smoke\.js/);
assert.match(runbook, /macos-file-plugin-docx-root-smoke\.js/);
assert.match(testMatrix, /macos-file-plugin-docx-root-smoke\.test\.js/);

console.log("macOS file plugin DOCX root smoke tests passed");
