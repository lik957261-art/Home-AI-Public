"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createPluginRequiredSkillPreloadService } = require("../adapters/plugin-required-skill-preload-service");

const DEFAULT_ROOT = "/Users/hermes-host/HermesMobile";
const SENSITIVE_PATH_RE = /(?:^|[/\\])(?:access-key|workspace-key|api-key|key|token|secret|credential|password|cookie)[^/\\]*(?:$|[/\\])/i;
const DEFAULT_CHECKS = Object.freeze([
  {
    workspaceId: "owner",
    pluginId: "wardrobe",
    skill: "productivity/wardrobe-style-operations",
    requireReferences: true,
    requireScripts: true,
  },
]);

function parseArgs(argv) {
  const out = {
    root: process.env.HERMES_MOBILE_ROOT || DEFAULT_ROOT,
    app: "",
    node: "",
    listenerUser: process.env.HERMES_MOBILE_LISTENER_USER || "hermes-host",
    checks: [],
    json: false,
    strict: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") out.root = argv[++index] || out.root;
    else if (arg === "--app") out.app = argv[++index] || out.app;
    else if (arg === "--node") out.node = argv[++index] || out.node;
    else if (arg === "--listener-user") out.listenerUser = argv[++index] || out.listenerUser;
    else if (arg === "--check") out.checks.push(parseCheckArg(argv[++index] || ""));
    else if (arg === "--no-strict") out.strict = false;
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/macos-required-skill-preload-smoke.js [options]",
        "  --root <dir>           Mac production root, default /Users/hermes-host/HermesMobile",
        "  --app <dir>            Live app path, default <root>/app",
        "  --node <file>          Pinned Node path, default <root>/runtime/node-current/bin/node",
        "  --listener-user <user> Listener user that must read required Skill bundles, default hermes-host",
        "  --check <spec>         workspace:plugin:skill[:refs][:scripts]; may be repeated",
        "  --no-strict            Do not exit non-zero on failed checks",
        "  --json                 Print bounded JSON metadata",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  out.root = String(out.root || DEFAULT_ROOT).replace(/\/+$/, "");
  out.app = out.app || path.join(out.root, "app");
  out.node = out.node || path.join(out.root, "runtime", "node-current", "bin", "node");
  out.checks = out.checks.filter(Boolean);
  if (!out.checks.length) out.checks = DEFAULT_CHECKS.map((item) => Object.assign({}, item));
  return out;
}

function parseCheckArg(value) {
  const parts = String(value || "").split(":").map((item) => item.trim()).filter(Boolean);
  if (parts.length < 3) throw new Error("required_skill_preload_check_requires_workspace_plugin_skill");
  const flags = new Set(parts.slice(3).map((item) => item.toLowerCase()));
  return {
    workspaceId: parts[0],
    pluginId: parts[1],
    skill: parts[2],
    requireReferences: flags.has("refs") || flags.has("references"),
    requireScripts: flags.has("scripts"),
  };
}

function compactPath(root, value) {
  const text = String(value || "");
  if (!text) return "";
  return text.split(String(root || DEFAULT_ROOT)).join("<HERMES_MOBILE_ROOT>").replace(/\\/g, "/");
}

function compactError(root, value) {
  return compactPath(root, String(value || "").trim())
    .split(/\r?\n/)
    .slice(-8)
    .join("\n")
    .slice(0, 1200);
}

function exists(file) {
  try {
    return fs.existsSync(file);
  } catch (_) {
    return false;
  }
}

function workspaceProfileId(workspaceId) {
  return String(workspaceId || "").trim() === "owner" ? "owner-full" : String(workspaceId || "").trim();
}

function skillSegments(skill) {
  return String(skill || "").split("/").map((item) => item.trim()).filter(Boolean);
}

function skillPaths(dataDir, workspaceId, skill) {
  const profileId = workspaceProfileId(workspaceId);
  const root = path.join(dataDir, "skill-profiles", profileId, "skills");
  const segments = skillSegments(skill);
  const dir = path.join(root, ...segments);
  return {
    profileId,
    root,
    dir,
    skillFile: path.join(dir, "SKILL.md"),
    referencesDir: path.join(dir, "references"),
    scriptsDir: path.join(dir, "scripts"),
    traversalPaths: [
      path.join(dataDir, "skill-profiles"),
      path.join(dataDir, "skill-profiles", profileId),
      root,
      ...segments.slice(0, -1).map((_, index) => path.join(root, ...segments.slice(0, index + 1))),
      dir,
    ],
  };
}

function sudoTestAsUser(user, flag, targetPath, options = {}) {
  if (typeof options.listenerProbe === "function") {
    return Boolean(options.listenerProbe({ user, flag, targetPath }));
  }
  if (process.platform === "darwin" && user) {
    const result = spawnSync("/usr/bin/sudo", ["-n", "-u", user, "/bin/test", flag, targetPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return result.status === 0;
  }
  try {
    const mode = flag === "-r" ? fs.constants.R_OK : fs.constants.X_OK;
    fs.accessSync(targetPath, mode);
    return true;
  } catch (_) {
    return false;
  }
}

function runPreloadInCurrentProcess(options, check) {
  const dataDir = path.join(options.root, "data");
  const service = createPluginRequiredSkillPreloadService({
    dataDirs: [dataDir],
    maxSkillChars: options.maxSkillChars || 80000,
    maxTotalChars: options.maxTotalChars || 120000,
  });
  const [item] = service.preloadRequiredSkills({
    workspaceId: check.workspaceId,
    skills: [check.skill],
  });
  return preloadSummary(item);
}

function runPreloadAsListener(options, check) {
  if (typeof options.preloadProbe === "function") return options.preloadProbe(options, check);
  if (process.platform !== "darwin" || !options.listenerUser) {
    return runPreloadInCurrentProcess(options, check);
  }
  const payload = {
    app: options.app,
    dataDir: path.join(options.root, "data"),
    workspaceId: check.workspaceId,
    skill: check.skill,
    maxSkillChars: options.maxSkillChars || 80000,
    maxTotalChars: options.maxTotalChars || 120000,
  };
  const code = `
const payload = ${JSON.stringify(payload)};
const { createPluginRequiredSkillPreloadService } = require(payload.app + "/adapters/plugin-required-skill-preload-service");
const service = createPluginRequiredSkillPreloadService({ dataDirs: [payload.dataDir], maxSkillChars: payload.maxSkillChars, maxTotalChars: payload.maxTotalChars });
const [item] = service.preloadRequiredSkills({ workspaceId: payload.workspaceId, skills: [payload.skill] });
const content = String(item && item.content || "");
const sources = Array.isArray(item && item.sources) ? item.sources : [];
console.log(JSON.stringify({
  path: item && item.path || payload.skill,
  profileId: item && item.profileId || "",
  missing: Boolean(item && item.missing),
  error: item && item.error || "",
  loadedChars: item && item.loadedChars || 0,
  totalChars: item && item.totalChars || 0,
  truncated: Boolean(item && item.truncated),
  referenceIncluded: /BEGIN REQUIRED SKILL REFERENCE/.test(content),
  sensitiveSourceIncluded: sources.some((source) => /(?:^|[/\\\\])(?:access-key|workspace-key|api-key|key|token|secret|credential|password|cookie)[^/\\\\]*(?:$|[/\\\\])/i.test(String(source && source.path || source || "")))
}));
`;
  const result = spawnSync("/usr/bin/sudo", ["-n", "-u", options.listenerUser, options.node, "-e", code], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    return {
      missing: true,
      error: "listener_preload_command_failed",
      commandStatus: result.status,
      stderr: compactError(options.root, result.stderr),
    };
  }
  try {
    return JSON.parse(String(result.stdout || "{}"));
  } catch (err) {
    return {
      missing: true,
      error: "listener_preload_non_json",
      stderr: compactError(options.root, result.stdout || err.message),
    };
  }
}

function preloadSummary(item = {}) {
  const content = String(item?.content || "");
  const sources = Array.isArray(item?.sources) ? item.sources : [];
  return {
    path: item?.path || "",
    profileId: item?.profileId || "",
    missing: Boolean(item?.missing),
    error: item?.error || "",
    loadedChars: item?.loadedChars || 0,
    totalChars: item?.totalChars || 0,
    truncated: Boolean(item?.truncated),
    referenceIncluded: /BEGIN REQUIRED SKILL REFERENCE/.test(content),
    sensitiveSourceIncluded: sources.some((source) => SENSITIVE_PATH_RE.test(String(source?.path || source || ""))),
  };
}

function checkRequiredSkill(options, check) {
  const dataDir = path.join(options.root, "data");
  const paths = skillPaths(dataDir, check.workspaceId, check.skill);
  const traversal = paths.traversalPaths.map((targetPath) => ({
    path: compactPath(options.root, targetPath),
    exists: exists(targetPath),
    listenerCanTraverse: sudoTestAsUser(options.listenerUser, "-x", targetPath, options),
  }));
  const listenerCanReadSkillFile = sudoTestAsUser(options.listenerUser, "-r", paths.skillFile, options);
  const preload = runPreloadAsListener(options, check);
  const issues = [];
  if (!exists(paths.dir)) issues.push("required_skill_dir_missing");
  if (!exists(paths.skillFile)) issues.push("required_skill_file_missing");
  if (check.requireReferences && !exists(paths.referencesDir)) issues.push("required_skill_references_missing");
  if (check.requireScripts && !exists(paths.scriptsDir)) issues.push("required_skill_scripts_missing");
  for (const item of traversal) {
    if (!item.exists) issues.push("required_skill_parent_missing");
    else if (!item.listenerCanTraverse) issues.push("required_skill_parent_untraversable_by_listener");
  }
  if (!listenerCanReadSkillFile) issues.push("required_skill_unreadable_by_listener");
  if (preload.missing) issues.push("required_skill_preload_missing");
  if (preload.error) issues.push(`required_skill_preload_error:${preload.error}`);
  if (check.requireReferences && !preload.referenceIncluded) issues.push("required_skill_reference_not_preloaded");
  if (preload.sensitiveSourceIncluded) issues.push("required_skill_preload_contains_sensitive_source");
  const uniqueIssues = [...new Set(issues)];
  return {
    ok: uniqueIssues.length === 0,
    workspaceId: check.workspaceId,
    pluginId: check.pluginId,
    skill: check.skill,
    profileId: paths.profileId,
    skillDir: compactPath(options.root, paths.dir),
    skillFile: compactPath(options.root, paths.skillFile),
    exists: exists(paths.dir),
    skillFileExists: exists(paths.skillFile),
    referencesExists: exists(paths.referencesDir),
    scriptsExists: exists(paths.scriptsDir),
    listenerUser: options.listenerUser,
    listenerCanReadSkillFile,
    traversal,
    preload,
    issues: uniqueIssues,
  };
}

function buildRequiredSkillPreloadSmoke(rawOptions = {}) {
  const options = Object.assign(parseArgs([]), rawOptions || {});
  options.root = String(options.root || DEFAULT_ROOT).replace(/\/+$/, "");
  options.app = options.app || path.join(options.root, "app");
  options.node = options.node || path.join(options.root, "runtime", "node-current", "bin", "node");
  options.checks = Array.isArray(options.checks) && options.checks.length
    ? options.checks
    : DEFAULT_CHECKS.map((item) => Object.assign({}, item));
  const checks = options.checks.map((check) => checkRequiredSkill(options, check));
  return {
    ok: checks.every((check) => check.ok),
    root: compactPath(options.root, options.root),
    listenerUser: options.listenerUser,
    checkCount: checks.length,
    checks,
    issues: checks.flatMap((check) => check.issues.map((issue) => `${check.workspaceId}:${check.pluginId}:${check.skill}:${issue}`)),
  };
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  const result = buildRequiredSkillPreloadSmoke(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`macos_required_skill_preload_smoke ok=${result.ok} checks=${result.checkCount} issues=${result.issues.length}`);
    for (const issue of result.issues) console.log(`issue ${issue}`);
  }
  if (options.strict && !result.ok) process.exit(1);
}

module.exports = {
  buildRequiredSkillPreloadSmoke,
  checkRequiredSkill,
  parseArgs,
  parseCheckArg,
  skillPaths,
};
