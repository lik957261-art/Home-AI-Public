"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function cleanString(value) {
  return String(value ?? "").trim();
}

function cleanList(value) {
  if (Array.isArray(value)) return value.map(cleanString).filter(Boolean);
  if (typeof value === "string") return value.split(/[,;\s]+/).map(cleanString).filter(Boolean);
  return [];
}

function dedupeSorted(values = []) {
  return Array.from(new Set(cleanList(values))).sort();
}

function normalizeSecurityLevel(value) {
  const text = cleanString(value).toLowerCase().replaceAll("_", "-");
  if (["owner", "owner-maintenance", "maintenance", "admin", "high", "high-privilege"].includes(text)) {
    return "owner-maintenance";
  }
  return "user";
}

function normalizeProvider(value) {
  return cleanString(value) || "openai-codex";
}

function normalizeWorkspaceId(value) {
  const text = cleanString(value).toLowerCase();
  if (!text || text === "*" || text === "all") return "";
  return text.replace(/^workspace:/, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function workerWorkspaceId(worker = {}) {
  const candidates = [
    ...cleanList(worker.skillWorkspaceIds || worker.skill_workspace_ids || worker.skillWorkspaceId || worker.skill_workspace_id),
    ...cleanList(worker.allowedWorkspaceIds || worker.allowed_workspace_ids || worker.workspaceIds || worker.workspace_ids),
  ].map(normalizeWorkspaceId).filter(Boolean);
  const unique = dedupeSorted(candidates);
  if (unique.length === 1) return unique[0];
  if (unique.includes("owner")) return "owner";
  return unique.join("+") || "owner";
}

function templateKeyForWorker(worker = {}, capabilities = {}) {
  return [
    workerWorkspaceId(worker),
    normalizeSecurityLevel(worker.securityLevel || worker.security_level),
    normalizeProvider(worker.provider || capabilities.modelProvider),
  ].join("|");
}

function sectionLines(lines, topLevelName) {
  const out = [];
  let inSection = false;
  for (const line of lines) {
    if (new RegExp(`^${topLevelName}:\\s*$`).test(line)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    if (/^\S.*:\s*$/.test(line)) break;
    out.push(line);
  }
  return out;
}

function yamlListUnderTop(lines, topLevelName) {
  return sectionLines(lines, topLevelName)
    .map((line) => line.match(/^\s*-\s*([A-Za-z0-9_.:-]+)\s*$/))
    .filter(Boolean)
    .map((match) => match[1]);
}

function modelFields(lines) {
  const fields = {};
  for (const line of sectionLines(lines, "model")) {
    const match = line.match(/^\s{2}([A-Za-z0-9_.:-]+):\s*(.+?)\s*$/);
    if (match) fields[match[1]] = match[2];
  }
  return fields;
}

function apiServerToolsets(lines) {
  const out = [];
  let inPlatform = false;
  let inApiServer = false;
  for (const line of lines) {
    if (/^platform_toolsets:\s*$/.test(line)) {
      inPlatform = true;
      inApiServer = false;
      continue;
    }
    if (!inPlatform) continue;
    if (/^\S.*:\s*$/.test(line)) break;
    if (/^\s{2}api_server:\s*$/.test(line)) {
      inApiServer = true;
      continue;
    }
    if (!inApiServer) continue;
    if (/^\s{2}\S.*:\s*$/.test(line)) break;
    const match = line.match(/^\s{4}-\s*([A-Za-z0-9_.:-]+)\s*$/);
    if (match) out.push(match[1]);
  }
  return out;
}

function mcpServerNames(lines) {
  const out = [];
  let inSection = false;
  for (const line of lines) {
    if (/^mcp_servers:\s*$/.test(line)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    if (/^\S.*:\s*$/.test(line)) break;
    const match = line.match(/^\s{2}([A-Za-z0-9_.:-]+):\s*$/);
    if (match) out.push(match[1]);
  }
  return out;
}

function pluginNames(lines) {
  const out = [];
  let inPlugins = false;
  let inEnabled = false;
  for (const line of lines) {
    if (/^plugins:\s*$/.test(line)) {
      inPlugins = true;
      inEnabled = false;
      continue;
    }
    if (!inPlugins) continue;
    if (/^\S.*:\s*$/.test(line)) break;
    if (/^\s{2}enabled:\s*$/.test(line)) {
      inEnabled = true;
      continue;
    }
    if (/^\s{2}enabled:\s*\[\]\s*$/.test(line)) break;
    if (!inEnabled) continue;
    if (/^\s{2}\S.*:\s*$/.test(line)) break;
    const match = line.match(/^\s{4}-\s*([A-Za-z0-9_.:-]+)\s*$/);
    if (match) out.push(match[1]);
  }
  return out;
}

function readCapabilities(configPath) {
  const text = fs.readFileSync(configPath, "utf8");
  const lines = text.split(/\r?\n/);
  const model = modelFields(lines);
  return {
    modelDefault: cleanString(model.default),
    modelProvider: normalizeProvider(model.provider),
    toolsets: dedupeSorted(yamlListUnderTop(lines, "toolsets")),
    apiServerToolsets: dedupeSorted(apiServerToolsets(lines)),
    mcpServers: dedupeSorted(mcpServerNames(lines)),
    plugins: dedupeSorted(pluginNames(lines)),
  };
}

function capabilityFingerprint(capabilities = {}) {
  const publicShape = {
    modelDefault: cleanString(capabilities.modelDefault),
    modelProvider: normalizeProvider(capabilities.modelProvider),
    toolsets: dedupeSorted(capabilities.toolsets),
    apiServerToolsets: dedupeSorted(capabilities.apiServerToolsets),
    mcpServers: dedupeSorted(capabilities.mcpServers),
    plugins: dedupeSorted(capabilities.plugins),
  };
  const hash = crypto.createHash("sha256").update(JSON.stringify(publicShape)).digest("hex").slice(0, 16);
  return { hash, publicShape };
}

function configPathForWorker(worker = {}, profilesRoot = "") {
  const profile = cleanString(worker.profile || worker.name);
  if (profilesRoot && profile) return path.join(profilesRoot, profile, "config.yaml");
  const candidates = [
    worker.configPath,
    worker.config_path,
    worker.profileConfigPath,
    worker.profile_config_path,
  ].map(cleanString).filter(Boolean);
  if (candidates.length) return candidates[0];
  for (const rawPath of [
    worker.telemetryStateDbPath,
    worker.telemetry_state_db_path,
    worker.telemetryResponseStoreDbPath,
    worker.telemetry_response_store_db_path,
  ]) {
    const value = cleanString(rawPath);
    if (value) return path.join(path.dirname(value), "config.yaml");
  }
  return "";
}

function loadManifest(manifestPath) {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function profileSetFromValue(value) {
  const items = cleanList(value);
  return items.length ? new Set(items) : null;
}

function analyzeProfileTemplateSync(options = {}) {
  const manifest = options.manifest || loadManifest(options.manifestPath);
  const profilesRoot = cleanString(options.profilesRoot);
  const selectedProfiles = profileSetFromValue(options.profiles);
  const requireConfig = Boolean(options.requireConfig);
  const groups = new Map();
  const issues = [];

  for (const worker of manifest.workers || []) {
    if (!worker || worker.enabled === false) continue;
    const profile = cleanString(worker.profile || worker.name);
    if (!profile) continue;
    if (selectedProfiles && !selectedProfiles.has(profile)) continue;
    const securityLevel = normalizeSecurityLevel(worker.securityLevel || worker.security_level);
    if (!["user", "owner-maintenance"].includes(securityLevel)) continue;
    const configPath = configPathForWorker(worker, profilesRoot);
    if (!configPath || !fs.existsSync(configPath)) {
      if (requireConfig) {
        issues.push({ code: "profile_config_missing", profile, templateKey: templateKeyForWorker(worker), configPath: configPath || "" });
      }
      continue;
    }
    let capabilities;
    try {
      capabilities = readCapabilities(configPath);
    } catch (err) {
      issues.push({ code: "profile_config_unreadable", profile, message: cleanString(err?.message || err).slice(0, 160) });
      continue;
    }
    const templateKey = templateKeyForWorker(worker, capabilities);
    const fingerprint = capabilityFingerprint(capabilities);
    const entry = {
      profile,
      templateKey,
      configPath,
      hash: fingerprint.hash,
      capabilities: fingerprint.publicShape,
    };
    if (!groups.has(templateKey)) groups.set(templateKey, []);
    groups.get(templateKey).push(entry);
  }

  const groupSummaries = [];
  for (const [templateKey, entries] of groups) {
    const hashes = dedupeSorted(entries.map((entry) => entry.hash));
    groupSummaries.push({
      templateKey,
      profiles: entries.map((entry) => entry.profile).sort(),
      hashes,
    });
    if (hashes.length <= 1) continue;
    issues.push({
      code: "profile_template_drift",
      templateKey,
      profiles: entries.map((entry) => ({
        profile: entry.profile,
        hash: entry.hash,
        toolsets: entry.capabilities.toolsets,
        apiServerToolsets: entry.capabilities.apiServerToolsets,
        mcpServers: entry.capabilities.mcpServers,
        plugins: entry.capabilities.plugins,
      })).sort((a, b) => a.profile.localeCompare(b.profile)),
    });
  }

  return {
    ok: issues.length === 0,
    checkedGroups: groupSummaries.length,
    checkedProfiles: Array.from(groups.values()).reduce((sum, entries) => sum + entries.length, 0),
    groups: groupSummaries.sort((a, b) => a.templateKey.localeCompare(b.templateKey)),
    issues,
  };
}

function parseArgs(argv = []) {
  const out = {
    manifestPath: process.env.HERMES_GATEWAY_POOL_MANIFEST_PATH || "C:/ProgramData/HermesMobile/data/gateway-pool-manifest.json",
    profilesRoot: process.env.HERMES_GATEWAY_PROFILES_ROOT || "C:/ProgramData/HermesMobile/gateway-worker/telemetry/profiles",
    profiles: "",
    requireConfig: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--manifest") out.manifestPath = argv[++index] || out.manifestPath;
    else if (arg === "--profiles-root") out.profilesRoot = argv[++index] || out.profilesRoot;
    else if (arg === "--profiles") out.profiles = argv[++index] || "";
    else if (arg === "--require-config") out.requireConfig = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/verify-gateway-profile-template-sync.js [options]",
        "  --manifest <path>       Gateway pool manifest path",
        "  --profiles-root <path>  Directory containing <profile>/config.yaml",
        "  --profiles <csv>        Optional profile filter",
        "  --require-config        Treat missing selected configs as failures",
        "  --json                  Print JSON result",
      ].join("\n"));
      process.exit(0);
    }
  }
  return out;
}

function printHuman(result) {
  if (result.ok) {
    console.log(`Gateway profile templates are synchronized (${result.checkedProfiles} profiles, ${result.checkedGroups} groups).`);
    return;
  }
  console.error(`Gateway profile template sync failed (${result.issues.length} issue(s)).`);
  for (const issue of result.issues) {
    if (issue.code === "profile_template_drift") {
      console.error(`- ${issue.code}: ${issue.templateKey}`);
      for (const profile of issue.profiles || []) {
        console.error(`  ${profile.profile}: ${profile.hash} toolsets=${profile.toolsets.join(",")} mcp=${profile.mcpServers.join(",")}`);
      }
    } else {
      console.error(`- ${issue.code}: ${issue.profile || issue.templateKey || ""}`);
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = analyzeProfileTemplateSync(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printHuman(result);
  if (!result.ok) process.exit(1);
}

if (require.main === module) main();

module.exports = {
  analyzeProfileTemplateSync,
  capabilityFingerprint,
  configPathForWorker,
  readCapabilities,
  templateKeyForWorker,
};
