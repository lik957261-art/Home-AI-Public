"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_ROOT = "/Users/hermes-host/HermesMobile";
const DEFAULT_REQUIRED_CANDIDATE = Object.freeze({
  workspaceId: "owner",
  skillWorkspaceId: "owner",
  provider: "openai-codex",
  securityLevel: "user",
  toolsets: ["wardrobe", "vision", "file", "skills", "weather"],
  minCandidates: 1,
  requireAll: true,
});
const DEFAULT_ORDINARY_USER_TOOLSETS = Object.freeze([
  "web",
  "search",
  "x_search",
  "http",
  "weather",
  "browser",
  "file",
  "vision",
  "video",
  "image_gen",
  "messaging",
  "tts",
  "skills",
  "todo",
  "kanban",
  "cronjob",
  "memory",
  "session_search",
  "clarify",
]);

function parseArgs(argv) {
  const out = {
    root: process.env.HERMES_MOBILE_ROOT || DEFAULT_ROOT,
    manifest: "",
    requiredCandidates: [],
    json: false,
    strict: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") out.root = argv[++index] || out.root;
    else if (arg === "--manifest") out.manifest = argv[++index] || out.manifest;
    else if (arg === "--require-candidate") out.requiredCandidates.push(parseRequiredCandidate(argv[++index] || ""));
    else if (arg === "--no-default-requirements") out.requiredCandidates = [];
    else if (arg === "--no-strict") out.strict = false;
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/macos-gateway-manifest-toolset-smoke.js [options]",
        "  --root <dir>              Mac production root, default /Users/hermes-host/HermesMobile",
        "  --manifest <file>         Manifest path, default <root>/data/gateway-pool-manifest-mac.json",
        "  --require-candidate <spec> workspace:skillWorkspace:provider:security:toolset,toolset[:min=N][:any]",
        "  --no-default-requirements Skip default Owner wardrobe candidate check",
        "  --no-strict               Do not exit non-zero on failed checks",
        "  --json                    Print bounded JSON metadata",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  out.root = String(out.root || DEFAULT_ROOT).replace(/\/+$/, "");
  out.manifest = out.manifest || path.join(out.root, "data", "gateway-pool-manifest-mac.json");
  if (!out.requiredCandidates.length) out.requiredCandidates = [Object.assign({}, DEFAULT_REQUIRED_CANDIDATE)];
  return out;
}

function clean(value) {
  return String(value || "").trim();
}

function cleanLower(value) {
  return clean(value).toLowerCase();
}

function cleanList(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  if (typeof value === "string") return value.split(",").map(clean).filter(Boolean);
  return [];
}

function dedupe(values) {
  const out = [];
  for (const item of values || []) {
    const text = clean(item);
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

function compactPath(root, value) {
  const text = clean(value).replace(/\\/g, "/");
  const rootText = clean(root || DEFAULT_ROOT).replace(/\\/g, "/").replace(/\/+$/, "");
  return rootText ? text.replace(rootText, "<root>") : text;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function scalarFromYaml(value) {
  const trimmed = clean(value).replace(/^["']|["']$/g, "");
  return trimmed.replace(/\s+#.*$/, "").trim();
}

function parseInlineList(value) {
  const text = clean(value);
  if (!text.startsWith("[") || !text.endsWith("]")) return null;
  return text.slice(1, -1).split(",").map(scalarFromYaml).filter(Boolean);
}

function parseTopLevelYamlList(source, key) {
  const lines = String(source || "").split(/\r?\n/);
  const out = [];
  let inBlock = false;
  for (const line of lines) {
    if (!inBlock) {
      const match = line.match(new RegExp(`^${key}:\\s*(.*)$`));
      if (!match) continue;
      const inline = parseInlineList(match[1]);
      if (inline) return dedupe(inline);
      if (scalarFromYaml(match[1])) return [scalarFromYaml(match[1])];
      inBlock = true;
      continue;
    }
    if (/^[^\s#][^:]*:/.test(line)) break;
    const item = line.match(/^\s*-\s*(.+)$/);
    if (item) out.push(scalarFromYaml(item[1]));
  }
  return dedupe(out);
}

function readConfigToolsets(configPath) {
  if (!configPath || !fs.existsSync(configPath)) return { exists: false, toolsets: [] };
  try {
    const content = fs.readFileSync(configPath, "utf8");
    return { exists: true, toolsets: parseTopLevelYamlList(content, "toolsets"), error: "" };
  } catch (err) {
    return { exists: true, toolsets: [], error: err && err.code ? err.code : "read_failed" };
  }
}

function normalizeWorker(worker = {}, index = 0) {
  const port = Number(worker.port || 0);
  const url = clean(worker.url || worker.gatewayUrl || worker.gateway_url || worker.apiBase || worker.api_base);
  const profile = clean(worker.profile);
  const name = clean(worker.name || profile || `worker${index + 1}`);
  return {
    name,
    profile,
    provider: cleanLower(worker.provider),
    securityLevel: normalizeSecurityLevel(worker.securityLevel || worker.security_level || worker.level),
    apiBase: url || (port ? `http://127.0.0.1:${port}` : ""),
    allowedWorkspaceIds: cleanList(worker.allowedWorkspaceIds || worker.allowed_workspace_ids || worker.workspaceIds || worker.workspace_ids),
    skillWorkspaceIds: cleanList(worker.skillWorkspaceIds || worker.skill_workspace_ids || worker.skillWorkspaces || worker.skill_workspaces || worker.skillWorkspaceId || worker.skill_workspace_id),
    toolsets: dedupe(cleanList(worker.toolsets || worker.enabledToolsets || worker.enabled_toolsets || worker.allowedToolsets || worker.allowed_toolsets)),
    configPath: clean(worker.configPath || worker.config_path),
    enabled: worker.enabled !== false,
  };
}

function normalizeSecurityLevel(value) {
  const text = cleanLower(value);
  if (!text) return "unspecified";
  if (["user", "low", "low-permission", "low-privilege", "ordinary"].includes(text)) return "user";
  if (["owner-maintenance", "maintenance", "admin", "high", "high-permission"].includes(text)) return "owner-maintenance";
  return text;
}

function parseRequiredCandidate(value) {
  const parts = String(value || "").split(":").map(clean);
  if (parts.length < 5) throw new Error("required_candidate_requires_workspace_skill_provider_security_toolsets");
  const flags = parts.slice(5).map(cleanLower);
  const minFlag = flags.find((flag) => flag.startsWith("min="));
  return {
    workspaceId: parts[0],
    skillWorkspaceId: parts[1],
    provider: parts[2],
    securityLevel: parts[3],
    toolsets: cleanList(parts[4]),
    minCandidates: minFlag ? Math.max(1, Number(minFlag.slice(4)) || 1) : 1,
    requireAll: !flags.includes("any"),
  };
}

function workerMatchesRequirement(worker, requirement) {
  if (!worker.enabled) return false;
  if (requirement.provider && worker.provider !== cleanLower(requirement.provider)) return false;
  if (normalizeSecurityLevel(requirement.securityLevel || "user") !== worker.securityLevel) return false;
  const workspaceId = clean(requirement.workspaceId);
  if (workspaceId && worker.allowedWorkspaceIds.length && !worker.allowedWorkspaceIds.includes("*") && !worker.allowedWorkspaceIds.includes(workspaceId)) return false;
  const skillWorkspaceId = clean(requirement.skillWorkspaceId || requirement.workspaceId);
  if (skillWorkspaceId && worker.skillWorkspaceIds.length && !worker.skillWorkspaceIds.includes("*") && !worker.skillWorkspaceIds.includes(skillWorkspaceId)) return false;
  return true;
}

function missingFrom(required, available) {
  const set = new Set(cleanList(available));
  return cleanList(required).filter((item) => !set.has(item));
}

function concreteWorkspaceIds(worker) {
  return dedupe([
    ...cleanList(worker.allowedWorkspaceIds),
    ...cleanList(worker.skillWorkspaceIds),
  ]).filter((item) => item !== "*" && cleanLower(item) !== "all");
}

function isOrdinaryWorkspaceUserWorker(worker) {
  return worker.enabled && worker.securityLevel === "user" && concreteWorkspaceIds(worker).length > 0;
}

function checkManifestToolsets(options = {}) {
  const explicitManifest = Object.prototype.hasOwnProperty.call(options, "manifest") && clean(options.manifest);
  const normalized = Object.assign(parseArgs([]), options || {});
  normalized.root = clean(normalized.root || DEFAULT_ROOT).replace(/\/+$/, "");
  normalized.manifest = explicitManifest
    ? clean(options.manifest)
    : path.join(normalized.root, "data", "gateway-pool-manifest-mac.json");
  if (!Array.isArray(normalized.requiredCandidates) || !normalized.requiredCandidates.length) {
    normalized.requiredCandidates = [Object.assign({}, DEFAULT_REQUIRED_CANDIDATE)];
  }
  const manifest = readJson(normalized.manifest);
  const workers = (Array.isArray(manifest.workers) ? manifest.workers : [])
    .map(normalizeWorker)
    .filter((worker) => worker.enabled);
  const issues = [];
  const configChecks = [];
  for (const worker of workers) {
    const config = readConfigToolsets(worker.configPath);
    if (!config.exists && worker.configPath) {
      issues.push(`config_path_missing:${worker.profile || worker.name}`);
    }
    if (config.error) {
      issues.push(`config_path_unreadable:${worker.profile || worker.name}:${config.error}`);
    }
    const missingConfigToolsets = missingFrom(config.toolsets, worker.toolsets);
    for (const toolset of missingConfigToolsets) {
      issues.push(`manifest_missing_config_toolset:${worker.profile || worker.name}:${toolset}`);
    }
    if (isOrdinaryWorkspaceUserWorker(worker)) {
      for (const toolset of missingFrom(DEFAULT_ORDINARY_USER_TOOLSETS, worker.toolsets)) {
        issues.push(`ordinary_user_missing_default_toolset:${worker.profile || worker.name}:${toolset}`);
      }
    }
    configChecks.push({
      profile: worker.profile || worker.name,
      configPath: compactPath(normalized.root, worker.configPath),
      configExists: config.exists,
      configReadError: config.error || "",
      configToolsets: config.toolsets,
      manifestToolsets: worker.toolsets,
      missingConfigToolsets,
    });
  }
  const candidateChecks = normalized.requiredCandidates.map((requirement) => {
    const candidates = workers.filter((worker) => workerMatchesRequirement(worker, requirement));
    if (candidates.length < requirement.minCandidates) {
      issues.push(`required_candidate_absent:${requirement.workspaceId}:${requirement.provider}:${requirement.securityLevel}`);
    }
    const candidateReports = candidates.map((worker) => {
      const missingToolsets = missingFrom(requirement.toolsets, worker.toolsets);
      if (missingToolsets.length && requirement.requireAll) {
        for (const toolset of missingToolsets) issues.push(`required_candidate_missing_toolset:${worker.profile || worker.name}:${toolset}`);
      }
      return {
        profile: worker.profile || worker.name,
        provider: worker.provider,
        securityLevel: worker.securityLevel,
        allowedWorkspaceIds: worker.allowedWorkspaceIds,
        skillWorkspaceIds: worker.skillWorkspaceIds,
        manifestToolsets: worker.toolsets,
        missingToolsets,
      };
    });
    return {
      workspaceId: requirement.workspaceId,
      skillWorkspaceId: requirement.skillWorkspaceId || requirement.workspaceId,
      provider: requirement.provider,
      securityLevel: normalizeSecurityLevel(requirement.securityLevel || "user"),
      requiredToolsets: requirement.toolsets,
      minCandidates: requirement.minCandidates,
      requireAll: requirement.requireAll,
      candidateCount: candidates.length,
      candidates: candidateReports,
    };
  });
  const uniqueIssues = [...new Set(issues)];
  return {
    ok: uniqueIssues.length === 0,
    manifest: compactPath(normalized.root, normalized.manifest),
    workerCount: workers.length,
    configCheckCount: configChecks.length,
    candidateCheckCount: candidateChecks.length,
    configChecks,
    candidateChecks,
    issues: uniqueIssues,
  };
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  const result = checkManifestToolsets(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`macos_gateway_manifest_toolset_smoke ok=${result.ok} workers=${result.workerCount} issues=${result.issues.length}`);
    for (const issue of result.issues) console.log(`issue ${issue}`);
  }
  if (options.strict && !result.ok) process.exit(1);
}

module.exports = {
  checkManifestToolsets,
  parseArgs,
  parseRequiredCandidate,
  parseTopLevelYamlList,
  normalizeWorker,
};
