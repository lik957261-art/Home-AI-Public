#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_HOST_ALIAS = "github.com-homeai-ssa";
const DEFAULT_OWNER = "pentiumxp";
const DEFAULT_REPO = "git@github.com-homeai-ssa:pentiumxp/Home-AI.git";
const CONFIG_BEGIN = "# >>> Home AI GitHub SSA >>>";
const CONFIG_END = "# <<< Home AI GitHub SSA <<<";
const REPO_COMPONENT_OVERRIDES = new Map([
  ["codex mobile", "CodexMobile"],
  ["codex mobile web", "CodexMobileWeb"],
  ["home ai", "HomeAI"],
  ["moira", "Moira"],
]);

function expandHome(input = "") {
  if (!input) return input;
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

function defaultKeyPath() {
  return process.env.HOMEAI_GITHUB_SSA_KEY_PATH
    || path.join(os.homedir(), ".ssh", "homeai_github_ssa_ed25519");
}

function defaultConfigPath() {
  return process.env.HOMEAI_GITHUB_SSA_SSH_CONFIG
    || path.join(os.homedir(), ".ssh", "config");
}

function parseArgs(argv) {
  const out = {
    command: argv[0] || "status",
    execute: false,
    json: false,
    keyPath: defaultKeyPath(),
    configPath: defaultConfigPath(),
    hostAlias: process.env.HOMEAI_GITHUB_SSA_HOST_ALIAS || DEFAULT_HOST_ALIAS,
    comment: "",
    repo: DEFAULT_REPO,
    owner: process.env.HOMEAI_GITHUB_SSA_OWNER || DEFAULT_OWNER,
    plugin: "",
    timeoutMs: 15000,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--execute") out.execute = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--key-path") out.keyPath = argv[++index] || out.keyPath;
    else if (arg === "--config-path") out.configPath = argv[++index] || out.configPath;
    else if (arg === "--host-alias") out.hostAlias = argv[++index] || out.hostAlias;
    else if (arg === "--comment") out.comment = argv[++index] || "";
    else if (arg === "--repo") out.repo = argv[++index] || out.repo;
    else if (arg === "--owner") out.owner = argv[++index] || out.owner;
    else if (arg === "--plugin") out.plugin = argv[++index] || out.plugin;
    else if (arg === "--timeout-ms") out.timeoutMs = Number(argv[++index] || out.timeoutMs);
    else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown_argument:${arg}`);
    }
  }
  out.keyPath = path.resolve(expandHome(out.keyPath));
  out.configPath = path.resolve(expandHome(out.configPath));
  if (!out.comment) out.comment = `homeai-github-ssa@${os.hostname()}`;
  if (!out.timeoutMs || out.timeoutMs < 1000) out.timeoutMs = 15000;
  return out;
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/github-shared-source-account.js status [--json]",
    "  node scripts/github-shared-source-account.js init [--execute] [--json]",
    "  node scripts/github-shared-source-account.js print-public-key [--json]",
    "  node scripts/github-shared-source-account.js smoke --repo <ssh-url> [--json]",
    "  node scripts/github-shared-source-account.js repo-name --plugin <plugin-id> [--json]",
    "",
    "Defaults:",
    `  key path:   ${defaultKeyPath()}`,
    `  ssh config: ${defaultConfigPath()}`,
    `  host alias: ${process.env.HOMEAI_GITHUB_SSA_HOST_ALIAS || DEFAULT_HOST_ALIAS}`,
    `  owner:      ${process.env.HOMEAI_GITHUB_SSA_OWNER || DEFAULT_OWNER}`,
  ].join("\n"));
}

function fileMode(filePath) {
  try {
    return `0${(fs.statSync(filePath).mode & 0o777).toString(8)}`;
  } catch (_err) {
    return "";
  }
}

function pathForSshConfig(filePath) {
  const home = os.homedir();
  if (filePath === home) return "~";
  if (filePath.startsWith(`${home}${path.sep}`)) return `~/${path.relative(home, filePath)}`;
  return filePath;
}

function sshConfigBlock(options) {
  return [
    CONFIG_BEGIN,
    `Host ${options.hostAlias}`,
    "    HostName github.com",
    "    User git",
    `    IdentityFile ${pathForSshConfig(options.keyPath)}`,
    "    IdentitiesOnly yes",
    "    AddKeysToAgent yes",
    CONFIG_END,
    "",
  ].join("\n");
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (_err) {
    return "";
  }
}

function upsertSshConfig(options) {
  const block = sshConfigBlock(options);
  const existing = readText(options.configPath);
  const escapedBegin = CONFIG_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = CONFIG_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escapedBegin}[\\s\\S]*?${escapedEnd}\\n?`, "m");
  const next = re.test(existing)
    ? existing.replace(re, block)
    : `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${block}`;
  if (next === existing) return { changed: false, backupPath: "" };
  fs.mkdirSync(path.dirname(options.configPath), { recursive: true });
  let backupPath = "";
  if (fs.existsSync(options.configPath)) {
    backupPath = `${options.configPath}.bak-${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15)}Z`;
    fs.copyFileSync(options.configPath, backupPath);
  }
  fs.writeFileSync(options.configPath, next, { mode: 0o600 });
  fs.chmodSync(options.configPath, 0o600);
  return { changed: true, backupPath };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    encoding: "utf8",
    timeout: options.timeoutMs || 15000,
  });
  return {
    status: result.status,
    signal: result.signal || "",
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : "",
  };
}

function publicKeyPath(keyPath) {
  return `${keyPath}.pub`;
}

function fingerprintForPublicKey(pubPath) {
  if (!fs.existsSync(pubPath)) return "";
  const result = run("/usr/bin/ssh-keygen", ["-lf", pubPath], { timeoutMs: 5000 });
  if (result.status !== 0) return "";
  return result.stdout.trim();
}

function sanitizeOutput(value) {
  const opensshPrivateKeyPattern = new RegExp([
    "-----BEGIN OPENSSH",
    "PRIVATE KEY-----[\\s\\S]*?-----END OPENSSH",
    "PRIVATE KEY-----",
  ].join(" "), "g");
  return String(value || "")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "[redacted-github-token]")
    .replace(/gh[pousr]_[A-Za-z0-9_]+/g, "[redacted-github-token]")
    .replace(opensshPrivateKeyPattern, "[redacted-private-key]")
    .slice(0, 2000);
}

function sshConfigHasAlias(configPath, hostAlias) {
  const config = readText(configPath);
  return new RegExp(`(^|\\n)Host\\s+${hostAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|\\n)`).test(config);
}

function buildStatus(options) {
  const pubPath = publicKeyPath(options.keyPath);
  return {
    ok: true,
    keyPath: options.keyPath,
    publicKeyPath: pubPath,
    privateKeyExists: fs.existsSync(options.keyPath),
    publicKeyExists: fs.existsSync(pubPath),
    privateKeyMode: fileMode(options.keyPath),
    publicKeyMode: fileMode(pubPath),
    sshConfigPath: options.configPath,
    sshConfigMode: fileMode(options.configPath),
    hostAlias: options.hostAlias,
    sshConfigConfigured: sshConfigHasAlias(options.configPath, options.hostAlias),
    fingerprint: fingerprintForPublicKey(pubPath),
  };
}

function ensurePublicKey(options) {
  const pubPath = publicKeyPath(options.keyPath);
  if (fs.existsSync(pubPath)) return false;
  const result = run("/usr/bin/ssh-keygen", ["-y", "-f", options.keyPath], { timeoutMs: 5000 });
  if (result.status !== 0) {
    throw new Error(`public_key_derive_failed:${sanitizeOutput(result.stderr || result.error)}`);
  }
  fs.writeFileSync(pubPath, result.stdout, { mode: 0o644 });
  fs.chmodSync(pubPath, 0o644);
  return true;
}

function init(options) {
  const plan = {
    ok: true,
    execute: Boolean(options.execute),
    keyPath: options.keyPath,
    publicKeyPath: publicKeyPath(options.keyPath),
    sshConfigPath: options.configPath,
    hostAlias: options.hostAlias,
    willGenerateKey: !fs.existsSync(options.keyPath),
    willInstallSshAlias: true,
  };
  if (!options.execute) return plan;
  fs.mkdirSync(path.dirname(options.keyPath), { recursive: true });
  let generatedKey = false;
  if (!fs.existsSync(options.keyPath)) {
    const result = run("/usr/bin/ssh-keygen", [
      "-t",
      "ed25519",
      "-f",
      options.keyPath,
      "-N",
      "",
      "-C",
      options.comment,
    ], { timeoutMs: 15000 });
    if (result.status !== 0) {
      throw new Error(`ssh_keygen_failed:${sanitizeOutput(result.stderr || result.error)}`);
    }
    generatedKey = true;
  }
  fs.chmodSync(options.keyPath, 0o600);
  const derivedPublicKey = ensurePublicKey(options);
  fs.chmodSync(publicKeyPath(options.keyPath), 0o644);
  const configResult = upsertSshConfig(options);
  return Object.assign(buildStatus(options), {
    generatedKey,
    derivedPublicKey,
    sshConfigChanged: configResult.changed,
    sshConfigBackupPath: configResult.backupPath,
  });
}

function printPublicKey(options) {
  const pubPath = publicKeyPath(options.keyPath);
  if (!fs.existsSync(pubPath)) {
    throw new Error(`public_key_missing:${pubPath}`);
  }
  const publicKey = fs.readFileSync(pubPath, "utf8").trim();
  if (options.json) {
    return {
      ok: true,
      publicKeyPath: pubPath,
      fingerprint: fingerprintForPublicKey(pubPath),
      publicKey,
    };
  }
  return publicKey;
}

function smoke(options) {
  const env = Object.assign({}, process.env, {
    GIT_SSH_COMMAND: `ssh -F ${options.configPath} -o BatchMode=yes -o IdentitiesOnly=yes`,
  });
  const result = run("git", ["ls-remote", options.repo, "HEAD"], {
    env,
    timeoutMs: options.timeoutMs,
  });
  const ok = result.status === 0;
  return {
    ok,
    status: result.status,
    signal: result.signal,
    repo: options.repo,
    hostAlias: options.hostAlias,
    fingerprint: fingerprintForPublicKey(publicKeyPath(options.keyPath)),
    stdout: ok ? result.stdout.trim().slice(0, 240) : "",
    stderr: ok ? "" : sanitizeOutput(result.stderr || result.error),
    classification: ok ? "github_ssa_smoke_passed" : classifySmokeFailure(result.stderr || result.error),
  };
}

function titleCaseWord(word) {
  const upper = word.toUpperCase();
  if (["AI", "API", "MCP", "NAS", "PWA", "SSA", "UI"].includes(upper)) return upper;
  return `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`;
}

function repoComponentForPlugin(plugin) {
  const normalized = String(plugin || "")
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) throw new Error("plugin_required");
  const key = normalized.toLowerCase();
  if (REPO_COMPONENT_OVERRIDES.has(key)) return REPO_COMPONENT_OVERRIDES.get(key);
  return normalized.split(" ").map(titleCaseWord).join("");
}

function repoNameForPlugin(options) {
  const component = repoComponentForPlugin(options.plugin);
  const repoName = `HomeAI-${component}`;
  const owner = options.owner || DEFAULT_OWNER;
  const repoSlug = `${owner}/${repoName}`;
  return {
    ok: true,
    plugin: options.plugin,
    owner,
    repoName,
    repoSlug,
    sshUrl: `git@github.com:${repoSlug}.git`,
    ssaSshUrl: `git@${options.hostAlias}:${repoSlug}.git`,
    visibility: "private",
  };
}

function classifySmokeFailure(stderr) {
  const text = String(stderr || "");
  if (/Permission denied \(publickey\)/i.test(text)) return "github_ssa_public_key_unregistered";
  if (/Repository not found|not appear to be a git repository|Could not read from remote repository/i.test(text)) {
    return "github_ssa_repo_access_denied";
  }
  if (/Could not resolve hostname|Name or service not known/i.test(text)) return "github_ssa_remote_not_adopted";
  return "github_ssa_smoke_failed";
}

function printResult(result, json) {
  if (json || typeof result !== "string") console.log(JSON.stringify(result, null, 2));
  else console.log(result);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "status") return printResult(buildStatus(options), options.json);
  if (options.command === "init") return printResult(init(options), options.json);
  if (options.command === "print-public-key") return printResult(printPublicKey(options), options.json);
  if (options.command === "smoke") return printResult(smoke(options), options.json);
  if (options.command === "repo-name") return printResult(repoNameForPlugin(options), options.json);
  throw new Error(`unknown_command:${options.command}`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }, null, 2));
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_HOST_ALIAS,
  DEFAULT_REPO,
  CONFIG_BEGIN,
  CONFIG_END,
  parseArgs,
  buildStatus,
  init,
  smoke,
  repoComponentForPlugin,
  repoNameForPlugin,
  sanitizeOutput,
  sshConfigBlock,
};
