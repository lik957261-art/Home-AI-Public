"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

const HOST_PROVISIONED_PUBLIC_PLUGINS = Object.freeze([
  "email",
  "finance",
  "growth",
  "health",
  "note",
  "wardrobe",
]);

const HOST_PROVISIONED_LOCAL_PLUGINS = Object.freeze([
  "moira",
]);

const SPECIAL_PUBLIC_PLUGINS = Object.freeze([
  "codex-mobile-web",
  "music",
  "movie",
]);

const PLUGIN_FILE_STEMS = Object.freeze({
  "codex-mobile-web": "codex-mobile",
  email: "email",
  finance: "finance",
  growth: "growth",
  health: "health",
  moira: "moira",
  movie: "movie",
  music: "music",
  note: "note",
  wardrobe: "wardrobe",
});

function clean(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function readJson(filePath, issues, code) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    issues.push({ code, path: path.relative(REPO_ROOT, filePath), detail: clean(err?.message || err, 500) });
    return null;
  }
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(REPO_ROOT, relativePath));
}

function pascalPluginId(pluginId) {
  return String(pluginId || "")
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join("");
}

function provisioningFileStem(pluginId) {
  return PLUGIN_FILE_STEMS[pluginId] || pluginId;
}

function expectedProvisioningFiles(pluginId) {
  const stem = provisioningFileStem(pluginId);
  return {
    adapter: `adapters/${stem}-plugin-provisioning-service.js`,
    test: `tests/${stem}-plugin-provisioning-service.test.js`,
  };
}

function publicPluginRows(manifest) {
  return Array.isArray(manifest?.plugins) ? manifest.plugins : [];
}

function buildReport(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || REPO_ROOT);
  const issues = [];
  const manifestPath = path.join(repoRoot, "config", "public-plugin-sources.json");
  const manifest = readJson(manifestPath, issues, "public_plugin_sources_unreadable");
  const pluginRows = publicPluginRows(manifest);
  const publicIds = new Set(pluginRows.map((row) => clean(row.id, 120)).filter(Boolean));
  const publicDefaultIds = new Set(pluginRows.filter((row) => row.publicDefault === true).map((row) => clean(row.id, 120)).filter(Boolean));
  const specialIds = new Set(pluginRows.filter((row) => row.special === true).map((row) => clean(row.id, 120)).filter(Boolean));
  const hermesPluginServicePath = path.join(repoRoot, "adapters", "hermes-plugin-service.js");
  const hermesPluginService = fs.existsSync(hermesPluginServicePath)
    ? fs.readFileSync(hermesPluginServicePath, "utf8")
    : "";

  if (!hermesPluginService) {
    issues.push({ code: "hermes_plugin_service_missing", path: "adapters/hermes-plugin-service.js" });
  }

  const provisionedPublic = [];
  const provisionedLocal = [];
  const specialPublic = [];

  for (const pluginId of HOST_PROVISIONED_PUBLIC_PLUGINS) {
    const files = expectedProvisioningFiles(pluginId);
    const pascal = pascalPluginId(pluginId);
    const row = { pluginId, publicManifest: publicIds.has(pluginId), publicDefault: publicDefaultIds.has(pluginId), files };
    provisionedPublic.push(row);
    if (!publicIds.has(pluginId)) issues.push({ code: "host_provisioned_public_plugin_missing_manifest", pluginId });
    if (!publicDefaultIds.has(pluginId)) issues.push({ code: "host_provisioned_public_plugin_not_public_default", pluginId });
    if (!fileExists(files.adapter)) issues.push({ code: "plugin_provisioning_adapter_missing", pluginId, path: files.adapter });
    if (!fileExists(files.test)) issues.push({ code: "plugin_provisioning_test_missing", pluginId, path: files.test });
    if (hermesPluginService && !hermesPluginService.includes(`create${pascal}PluginProvisioningService`)) {
      issues.push({ code: "plugin_provisioning_not_wired", pluginId, path: "adapters/hermes-plugin-service.js" });
    }
  }

  for (const pluginId of HOST_PROVISIONED_LOCAL_PLUGINS) {
    const files = expectedProvisioningFiles(pluginId);
    const pascal = pascalPluginId(pluginId);
    provisionedLocal.push({ pluginId, publicManifest: publicIds.has(pluginId), files });
    if (!fileExists(files.adapter)) issues.push({ code: "local_plugin_provisioning_adapter_missing", pluginId, path: files.adapter });
    if (!fileExists(files.test)) issues.push({ code: "local_plugin_provisioning_test_missing", pluginId, path: files.test });
    if (hermesPluginService && !hermesPluginService.includes(`create${pascal}PluginProvisioningService`)) {
      issues.push({ code: "local_plugin_provisioning_not_wired", pluginId, path: "adapters/hermes-plugin-service.js" });
    }
  }

  for (const pluginId of publicDefaultIds) {
    if (!HOST_PROVISIONED_PUBLIC_PLUGINS.includes(pluginId)) {
      issues.push({ code: "public_default_plugin_missing_host_provisioning_contract", pluginId });
    }
  }

  for (const pluginId of SPECIAL_PUBLIC_PLUGINS) {
    const manifestRow = pluginRows.find((row) => clean(row.id, 120) === pluginId) || {};
    specialPublic.push({
      pluginId,
      publicManifest: publicIds.has(pluginId),
      special: manifestRow.special === true,
      publicDefault: manifestRow.publicDefault === true,
    });
    if (!publicIds.has(pluginId)) issues.push({ code: "special_public_plugin_missing_manifest", pluginId });
    if (!specialIds.has(pluginId)) issues.push({ code: "special_public_plugin_not_marked_special", pluginId });
    if (publicDefaultIds.has(pluginId)) issues.push({ code: "special_public_plugin_must_not_be_public_default", pluginId });
  }

  return {
    ok: issues.length === 0,
    schemaVersion: 1,
    publicManifestPath: "config/public-plugin-sources.json",
    publicPluginCount: publicIds.size,
    hostProvisionedPublicCount: HOST_PROVISIONED_PUBLIC_PLUGINS.length,
    hostProvisionedLocalCount: HOST_PROVISIONED_LOCAL_PLUGINS.length,
    specialPublicCount: SPECIAL_PUBLIC_PLUGINS.length,
    provisionedPublic,
    provisionedLocal,
    specialPublic,
    issues,
  };
}

function main() {
  const report = buildReport();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  HOST_PROVISIONED_LOCAL_PLUGINS,
  HOST_PROVISIONED_PUBLIC_PLUGINS,
  SPECIAL_PUBLIC_PLUGINS,
  buildReport,
  expectedProvisioningFiles,
};
