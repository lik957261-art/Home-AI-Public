"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const {
  HOST_PROVISIONED_LOCAL_PLUGINS,
  HOST_PROVISIONED_PUBLIC_PLUGINS,
  SPECIAL_PUBLIC_PLUGINS,
  buildReport,
  expectedProvisioningFiles,
} = require("../scripts/plugin-provisioning-coverage-audit");

const REPO_ROOT = path.resolve(__dirname, "..");

function testReportPassesForCurrentPluginContract() {
  const report = buildReport();
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.hostProvisionedPublicCount, HOST_PROVISIONED_PUBLIC_PLUGINS.length);
  assert.equal(report.hostProvisionedLocalCount, HOST_PROVISIONED_LOCAL_PLUGINS.length);
  assert.equal(report.specialPublicCount, SPECIAL_PUBLIC_PLUGINS.length);
  for (const pluginId of ["email", "finance", "growth", "health", "moira", "note", "wardrobe"]) {
    const row = report.provisionedPublic.find((item) => item.pluginId === pluginId);
    assert.ok(row, `missing ${pluginId}`);
    assert.equal(row.publicManifest, true);
    assert.equal(row.publicDefault, true);
    assert.deepEqual(row.files, expectedProvisioningFiles(pluginId));
  }
  assert.equal(report.provisionedLocal.length, 0);
  for (const pluginId of ["codex-mobile-web", "music", "movie"]) {
    const row = report.specialPublic.find((item) => item.pluginId === pluginId);
    assert.ok(row, `missing special ${pluginId}`);
    assert.equal(row.publicManifest, true);
    assert.equal(row.special, true);
    assert.equal(row.publicDefault, false);
  }
}

function testCliJson() {
  const output = execFileSync("node", ["scripts/plugin-provisioning-coverage-audit.js"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues, null, 2));
  assert.equal(parsed.issues.length, 0);
  assert.equal(parsed.publicManifestPath, "config/public-plugin-sources.json");
}

testReportPassesForCurrentPluginContract();
testCliJson();

console.log("plugin provisioning coverage audit tests passed");
