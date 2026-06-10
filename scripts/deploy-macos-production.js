"use strict";

const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_DEV_ROOT = "/Users/hermes-dev/HermesMobileDev";
const DEFAULT_MAC_ROOT = "/Users/hermes-host/HermesMobile";
const DEFAULT_BASE_URL = "http://127.0.0.1:8797";
const PINNED_NODE = "runtime/node-current/bin/node";
const DEFAULT_PRODUCTION_OWNER = "hermes-host:staff";

const PLUGIN_TARGETS = new Set([
  "codex-mobile-web",
  "email",
  "finance",
  "growth",
  "healthy",
  "note",
  "wardrobe",
]);

const DEFAULT_RESTART_LABELS = {
  "home-ai": ["com.hermesmobile.listener"],
  "plugin:codex-mobile-web": ["com.hermesmobile.plugin.codex-mobile"],
  "plugin:growth": ["com.hermesmobile.plugin.growth"],
};

const PRODUCTION_OWNER_BY_TARGET = {
  "plugin:codex-mobile-web": "xuxin:staff",
};

const RSYNC_EXCLUDES = [
  ".git",
  ".git/",
  ".codex/",
  ".agent-context/",
  "AGENTS.md",
  ".deploy-backups/",
  "node_modules/",
  ".venv/",
  "logs/",
  "tmp/",
  "temp/",
  ".DS_Store",
  ".env",
  ".env.*",
  "*.log",
];

const PLUGIN_RSYNC_EXCLUDES = [
  "data/",
  "runtime/",
];

const SURFACES = new Set(["full", "static"]);

const HOME_AI_STATIC_SYNC_ROOTS = [
  "public/",
];

const HOME_AI_PROOF_FILES = [
  "package.json",
  "public/index.html",
  "public/service-worker.js",
  "public/directory-viewer.html",
  "scripts/deploy-macos-production.js",
  "scripts/production-status-smoke.js",
];

const HOME_AI_STATIC_PROOF_FILES = [
  "public/index.html",
  "public/service-worker.js",
  "public/directory-viewer.html",
];

function parseArgs(argv) {
  const out = {
    target: "",
    plugin: "",
    source: "",
    macRoot: process.env.HERMES_MOBILE_MAC_ROOT || DEFAULT_MAC_ROOT,
    devRoot: process.env.HERMES_MOBILE_DEV_ROOT || DEFAULT_DEV_ROOT,
    passwordFile: process.env.HOMEAI_MAC_SUDO_PASSWORD_FILE || "",
    baseUrl: process.env.HERMES_MOBILE_PRODUCTION_BASE || DEFAULT_BASE_URL,
    execute: false,
    json: false,
    healthUrl: "",
    restartMode: "auto",
    restartLabels: [],
    surface: "full",
    allowDirty: false,
    reason: "manual",
    timestamp: "",
    validationRetries: 12,
    validationDelayMs: 2000,
    syncOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target") out.target = argv[++index] || "";
    else if (arg === "--plugin") out.plugin = argv[++index] || "";
    else if (arg === "--source") out.source = argv[++index] || "";
    else if (arg === "--mac-root") out.macRoot = argv[++index] || out.macRoot;
    else if (arg === "--dev-root") out.devRoot = argv[++index] || out.devRoot;
    else if (arg === "--password-file") out.passwordFile = argv[++index] || "";
    else if (arg === "--base") out.baseUrl = argv[++index] || out.baseUrl;
    else if (arg === "--health-url") out.healthUrl = argv[++index] || "";
    else if (arg === "--restart") out.restartMode = argv[++index] || "auto";
    else if (arg === "--restart-label") out.restartLabels.push(argv[++index] || "");
    else if (arg === "--surface" || arg === "--changed-surface") out.surface = argv[++index] || out.surface;
    else if (arg === "--allow-dirty") out.allowDirty = true;
    else if (arg === "--reason") out.reason = argv[++index] || out.reason;
    else if (arg === "--timestamp") out.timestamp = argv[++index] || "";
    else if (arg === "--validation-retries") out.validationRetries = Number(argv[++index] || out.validationRetries);
    else if (arg === "--validation-delay-ms") out.validationDelayMs = Number(argv[++index] || out.validationDelayMs);
    else if (arg === "--sync-only") out.syncOnly = true;
    else if (arg === "--execute") out.execute = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      console.log([
        "Usage:",
        "  node scripts/deploy-macos-production.js --target home-ai [--execute]",
        "  node scripts/deploy-macos-production.js --plugin <plugin-id> [--execute]",
        "",
        "Default mode is plan-only. Add --execute to write production.",
        "",
        "Options:",
        "  --source <path>             Override development source path",
        "  --mac-root <path>           Production root, default /Users/hermes-host/HermesMobile",
        "  --dev-root <path>           Development root, default /Users/hermes-dev/HermesMobileDev",
        "  --password-file <path>      Private sudo password file; contents are never printed",
        "  --restart auto|none         Auto uses known labels for Home AI and Codex Mobile",
        "  --restart-label <label>     Additional system launchd label to kickstart",
        "  --surface full|static       Static Home AI sync copies only public/",
        "  --allow-dirty               Permit deploy-relevant dirty source files",
        "  --health-url <url>          Optional plugin health/version URL",
        "  --base <url>                Home AI production base for status smoke",
        "  --reason <slug>             Backup name slug",
        "  --validation-retries <n>    Retries for listener/health validation, default 12",
        "  --validation-delay-ms <n>   Delay between validation retries, default 2000",
        "  --sync-only                 Plugin first-install source sync only; no restart or runtime validation",
        "  --json                      Print bounded JSON",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (out.plugin && out.target) throw new Error("Use either --target or --plugin, not both.");
  if (out.plugin) out.target = `plugin:${out.plugin}`;
  if (!out.target) out.target = "home-ai";
  if (!SURFACES.has(out.surface)) throw new Error(`unsupported_deploy_surface:${out.surface}`);
  if (out.surface === "static" && out.target !== "home-ai") throw new Error("static_surface_requires_home_ai_target");
  if (out.syncOnly && !out.target.startsWith("plugin:")) throw new Error("sync_only_requires_plugin_target");
  if (out.syncOnly) {
    out.restartMode = "none";
    out.healthUrl = "";
  }
  out.restartLabels = out.restartLabels.filter(Boolean);
  if (!Number.isFinite(out.validationRetries) || out.validationRetries < 1) out.validationRetries = 1;
  if (!Number.isFinite(out.validationDelayMs) || out.validationDelayMs < 0) out.validationDelayMs = 0;
  return out;
}

function normalizePath(value) {
  return path.resolve(String(value || ""));
}

function posixJoin(...parts) {
  return path.posix.join(...parts.map((part) => String(part || "").replace(/\/+$/, "")));
}

function assertInside(child, parent, label) {
  const resolvedChild = normalizePath(child);
  const resolvedParent = normalizePath(parent);
  const rel = path.relative(resolvedParent, resolvedChild);
  if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) return;
  throw new Error(`${label}_outside_allowed_root`);
}

function sanitizeSlug(value) {
  const slug = String(value || "deploy").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "deploy";
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function sourceRef(source) {
  const git = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], {
    cwd: source,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
    cwd: source,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return {
    commit: git.status === 0 ? git.stdout.trim() : "",
    dirty: status.status === 0 ? Boolean(status.stdout.trim()) : null,
    dirtyFiles: status.status === 0
      ? status.stdout.trim().split(/\r?\n/).filter(Boolean).slice(0, 80)
      : [],
  };
}

function gitStatusEntries(source) {
  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
    cwd: source,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (status.status !== 0) return [];
  return status.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const rawPath = line.replace(/^[ MARCUD?!]{1,2}\s+/, "").trim();
    const relPath = rawPath.includes(" -> ") ? rawPath.split(" -> ").pop().trim() : rawPath;
    return { status: line.slice(0, 2), path: relPath };
  });
}

function rsyncExcludePatternApplies(pattern, relPath) {
  if (!pattern || !relPath) return false;
  if (pattern.endsWith("/")) return relPath === pattern.slice(0, -1) || relPath.startsWith(pattern);
  if (pattern.startsWith("*.")) return relPath.endsWith(pattern.slice(1));
  if (pattern.endsWith("*")) return relPath.startsWith(pattern.slice(0, -1));
  return relPath === pattern || relPath.startsWith(`${pattern}/`);
}

function isRsyncExcluded(relPath, excludes = RSYNC_EXCLUDES) {
  return excludes.some((pattern) => rsyncExcludePatternApplies(pattern, relPath));
}

function isDeploySurfaceIncluded(relPath, options) {
  if (options.surface === "static") return HOME_AI_STATIC_SYNC_ROOTS.some((root) => relPath.startsWith(root));
  return !isRsyncExcluded(relPath, rsyncExcludesForTarget(options));
}

function deployDirtyFiles(source, options) {
  return gitStatusEntries(source)
    .map((entry) => entry.path)
    .filter((relPath) => isDeploySurfaceIncluded(relPath, options))
    .slice(0, 120);
}

function ignoredDirtyFiles(source, options) {
  return gitStatusEntries(source)
    .map((entry) => entry.path)
    .filter((relPath) => !isDeploySurfaceIncluded(relPath, options))
    .slice(0, 120);
}

function defaultSource(options) {
  if (options.target === "home-ai") return posixJoin(options.devRoot, "app");
  const plugin = options.target.replace(/^plugin:/, "");
  return posixJoin(options.devRoot, "plugins", plugin);
}

function productionTarget(options) {
  if (options.target === "home-ai") return posixJoin(options.macRoot, "app");
  const plugin = options.target.replace(/^plugin:/, "");
  if (!PLUGIN_TARGETS.has(plugin)) throw new Error(`unsupported_plugin_target:${plugin}`);
  return posixJoin(options.macRoot, "plugins", plugin);
}

function productionOwnerForTarget(target) {
  return PRODUCTION_OWNER_BY_TARGET[target] || DEFAULT_PRODUCTION_OWNER;
}

function rsyncExcludesForTarget(options) {
  const excludes = [...RSYNC_EXCLUDES];
  if (String(options.target || "").startsWith("plugin:")) excludes.push(...PLUGIN_RSYNC_EXCLUDES);
  return [...new Set(excludes)];
}

function readTextIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (_err) {
    return "";
  }
}

function extractClientVersionFromSource(source) {
  const html = readTextIfExists(path.join(source, "public", "index.html"));
  return html.match(/data-client-version="([^"]+)"/)?.[1] || "";
}

function proofFilesForPlan(source, options) {
  if (options.target !== "home-ai") return [];
  const candidates = options.surface === "static" ? HOME_AI_STATIC_PROOF_FILES : HOME_AI_PROOF_FILES;
  return candidates.filter((relPath) => fs.existsSync(path.join(source, relPath)));
}

function restartLabels(options) {
  const labels = new Set(options.restartLabels || []);
  if (options.restartMode !== "none") {
    for (const label of DEFAULT_RESTART_LABELS[options.target] || []) labels.add(label);
  }
  return Array.from(labels).sort();
}

function buildPlan(options) {
  const source = normalizePath(options.source || defaultSource(options));
  const target = productionTarget(options);
  assertInside(source, options.devRoot, "source");
  assertInside(target, options.macRoot, "production_target");
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    throw new Error(`source_directory_missing:${source}`);
  }
  const planTimestamp = options.timestamp || timestamp();
  const reason = sanitizeSlug(options.reason);
  const targetSlug = sanitizeSlug(options.target.replace(":", "-"));
  const backupPath = posixJoin(options.macRoot, "backups", "deploy", `${planTimestamp}-${targetSlug}-${reason}`);
  const labels = restartLabels(options);
  const relevantDirtyFiles = deployDirtyFiles(source, options);
  const ignoredDirty = ignoredDirtyFiles(source, options);
  const expectedVersion = extractClientVersionFromSource(source);
  const proofFiles = proofFilesForPlan(source, options);
  const rsyncExcludes = rsyncExcludesForTarget(options);
  const productionOwner = productionOwnerForTarget(options.target);
  const validation = [];
  if (options.target === "home-ai") {
    const command = [
      posixJoin(options.macRoot, PINNED_NODE),
      posixJoin(target, "scripts", "production-status-smoke.js"),
      "--access-key-file",
      posixJoin(options.macRoot, "data", "secrets", "owner-web-key.secret"),
      "--base",
      options.baseUrl,
      "--json",
    ];
    if (expectedVersion) command.push("--expected-version", expectedVersion);
    validation.push({
      type: "home-ai-status-smoke",
      command,
    });
  }
  if (proofFiles.length) {
    validation.push({
      type: "production-file-hashes",
      files: proofFiles,
    });
  }
  for (const label of labels) {
    validation.push({ type: "launchd-print", command: ["/bin/launchctl", "print", `system/${label}`] });
  }
  if (options.healthUrl) {
    validation.push({ type: "health-url", command: ["/usr/bin/curl", "-fsS", "--max-time", "10", options.healthUrl] });
  }
  return {
    schemaVersion: 1,
    mode: options.execute ? "execute" : "plan",
    target: options.target,
    sourcePath: source,
    productionPath: target,
    macRoot: normalizePath(options.macRoot),
    productionOwner,
    surface: options.surface,
    allowDirty: Boolean(options.allowDirty),
    syncOnly: Boolean(options.syncOnly),
    sourceRef: sourceRef(source),
    deployDirtyFiles: relevantDirtyFiles,
    ignoredDirtyFiles: ignoredDirty,
    expectedClientVersion: expectedVersion,
    backupPath,
    restartLabels: labels,
    rsyncExcludes,
    sync: options.surface === "static"
      ? HOME_AI_STATIC_SYNC_ROOTS.map((root) => ({ source: `${root}`, target: `${root}` }))
      : [{ source: "./", target: "./" }],
    proofFiles,
    validation,
    runtimeValidationSkipped: Boolean(options.syncOnly),
    rollback: {
      restoreCommand: ["/usr/bin/rsync", "-a", "--delete", `${backupPath}/`, `${target}/`],
      restartLabels: labels,
    },
  };
}

function assertExecutablePlan(plan, options) {
  if (!options.execute) return;
  if (plan.target.startsWith("plugin:") && !plan.restartLabels.length && !options.healthUrl && !options.syncOnly) {
    throw new Error("plugin_execute_requires_restart_label_or_health_url");
  }
  if (plan.deployDirtyFiles.length && !options.allowDirty) {
    throw new Error(`deploy_source_dirty_requires_allow_dirty:${plan.deployDirtyFiles.join(",")}`);
  }
}

function readPassword(passwordFile) {
  if (!passwordFile) return "";
  return fs.readFileSync(passwordFile, "utf8").split(/\r?\n/).find((line) => line.trim()) || "";
}

function runSudo(command, args, password, input) {
  const sudoArgs = password
    ? ["-S", "-p", "", command, ...args]
    : ["-n", command, ...args];
  const result = spawnSync("/usr/bin/sudo", sudoArgs, {
    input: password ? `${password}\n${input || ""}` : (input || ""),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const err = new Error(`sudo_command_failed:${path.basename(command)}`);
    err.status = result.status;
    err.stderr = String(result.stderr || "").slice(0, 1200);
    throw err;
  }
  return result;
}

function sleepMs(ms) {
  if (!ms) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function shouldRetryValidation(type) {
  return type === "home-ai-status-smoke" || type === "health-url";
}

function runValidation(check, password, options) {
  const [command, ...args] = check.command;
  const maxAttempts = shouldRetryValidation(check.type) ? options.validationRetries : 1;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = runSudo(command, args, password);
      return {
        type: check.type,
        status: result.status,
        attempt,
        stdout: String(result.stdout || "").slice(0, 1600),
      };
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) sleepMs(options.validationDelayMs);
    }
  }
  throw lastError;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sudoSha256File(filePath, password) {
  const result = runSudo("/usr/bin/shasum", ["-a", "256", filePath], password);
  return String(result.stdout || "").trim().split(/\s+/)[0] || "";
}

function runFileHashValidation(plan, password) {
  const rows = [];
  for (const relPath of plan.proofFiles || []) {
    const sourcePath = path.join(plan.sourcePath, relPath);
    const productionPath = path.join(plan.productionPath, relPath);
    const sourceHash = sha256File(sourcePath);
    const productionHash = sudoSha256File(productionPath, password);
    if (sourceHash !== productionHash) {
      const err = new Error(`production_file_hash_mismatch:${relPath}`);
      err.stderr = `source=${sourceHash} production=${productionHash}`;
      throw err;
    }
    rows.push({ path: relPath, sha256: sourceHash.slice(0, 16) });
  }
  return {
    type: "production-file-hashes",
    status: 0,
    fileCount: rows.length,
    files: rows,
  };
}

function executePlan(plan, options) {
  const password = readPassword(options.passwordFile);
  if (options.passwordFile && !password) throw new Error("sudo_password_file_empty");

  runSudo("/bin/mkdir", ["-p", plan.backupPath, plan.productionPath], password);
  runSudo("/usr/bin/rsync", ["-a", "--delete", `${plan.productionPath}/`, `${plan.backupPath}/`], password);

  if (plan.surface === "static") {
    for (const item of plan.sync) {
      const source = path.join(plan.sourcePath, item.source);
      const target = path.join(plan.productionPath, item.target);
      runSudo("/bin/mkdir", ["-p", target], password);
      runSudo("/usr/bin/rsync", ["-a", "--delete", `${source}/`, `${target}/`], password);
    }
  } else {
    const rsyncArgs = ["-a", "--delete"];
    for (const item of plan.rsyncExcludes) rsyncArgs.push("--exclude", item);
    rsyncArgs.push(`${plan.sourcePath}/`, `${plan.productionPath}/`);
    runSudo("/usr/bin/rsync", rsyncArgs, password);
  }

  if (plan.productionOwner) {
    runSudo("/usr/sbin/chown", ["-R", plan.productionOwner, plan.productionPath], password);
  }

  for (const label of plan.restartLabels) {
    runSudo("/bin/launchctl", ["kickstart", "-k", `system/${label}`], password);
  }

  const validations = [];
  for (const check of plan.validation) {
    if (check.type === "production-file-hashes") validations.push(runFileHashValidation(plan, password));
    else validations.push(runValidation(check, password, options));
  }
  return validations;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = buildPlan(options);
  assertExecutablePlan(plan, options);
  let result = { ok: true, plan };
  if (options.execute) {
    result = Object.assign(result, { validationResults: executePlan(plan, options) });
  }
  if (options.json || !options.execute) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`deployed ${plan.target} backup=${plan.backupPath}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    const payload = { ok: false, error: err?.message || String(err) };
    if (err?.stderr) payload.stderr = err.stderr;
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_DEV_ROOT,
  DEFAULT_MAC_ROOT,
  PLUGIN_TARGETS,
  RSYNC_EXCLUDES,
  parseArgs,
  buildPlan,
  assertExecutablePlan,
  runValidation,
  deployDirtyFiles,
  isDeploySurfaceIncluded,
};
