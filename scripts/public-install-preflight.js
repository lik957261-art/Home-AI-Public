"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const REPO_ROOT = path.resolve(__dirname, "..");

const REQUIRED_SOURCE_FILES = [
  "package.json",
  "config/public-plugin-sources.json",
  "docs/PUBLIC_INSTALLATION_CHECKLIST.md",
  "docs/MODULES/deployment.md",
  "scripts/install-macos-production.sh",
  "scripts/macos-first-start-preflight.js",
  "scripts/deploy-macos-production.js",
  "scripts/plugin-provisioning-coverage-audit.js",
  "scripts/production-self-diagnostics.js",
  "scripts/productization-check.js",
];

const REQUIRED_PLUGIN_IDS = [
  "codex-mobile-web",
  "email",
  "finance",
  "growth",
  "health",
  "note",
  "music",
  "wardrobe",
];

function parseArgs(argv = []) {
  const out = {
    repoRoot: REPO_ROOT,
    sourceOnly: false,
    markdown: false,
    json: false,
    pythonCommand: process.env.HOMEAI_PYTHON || process.env.PYTHON || "python3",
    gitCommand: process.env.HOMEAI_GIT || "git",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--repo-root") out.repoRoot = path.resolve(argv[++index] || out.repoRoot);
    else if (arg === "--python-command") out.pythonCommand = argv[++index] || out.pythonCommand;
    else if (arg === "--git-command") out.gitCommand = argv[++index] || out.gitCommand;
    else if (arg === "--source-only") out.sourceOnly = true;
    else if (arg === "--markdown") out.markdown = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--help") {
      process.stdout.write([
        "Usage: node scripts/public-install-preflight.js [--repo-root <path>] [--source-only] [--python-command <path>] [--git-command <path>] [--json|--markdown]",
        "  Checks public install/update prerequisites and repository install metadata.",
        "  Default mode includes host tool checks. Use --source-only for CI/source validation.",
        "  HOMEAI_PYTHON may point at a Python >=3.12 executable when system python3 is older.",
      ].join("\n") + "\n");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function safeReadJson(filePath, issues, code) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    issues.push({ code, path: filePath, detail: err?.message || String(err) });
    return null;
  }
}

function parseVersion(text) {
  const match = String(text || "").match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw: match[0],
  };
}

function versionAtLeast(version, minimum) {
  if (!version) return false;
  if (version.major !== minimum.major) return version.major > minimum.major;
  if (version.minor !== minimum.minor) return version.minor > minimum.minor;
  return version.patch >= minimum.patch;
}

function runVersionCommand(command, args = [], runner = spawnSync) {
  const result = runner(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  return {
    ok: result.status === 0,
    status: result.status == null ? 1 : result.status,
    output: output.slice(0, 200),
  };
}

function isHttpsGithubUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "https:" && parsed.hostname.toLowerCase() === "github.com";
  } catch {
    return false;
  }
}

function isLoopbackHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function checkSource(root, issues) {
  const repoRoot = path.resolve(root || REPO_ROOT);
  for (const relativePath of REQUIRED_SOURCE_FILES) {
    if (!fs.existsSync(path.join(repoRoot, relativePath))) {
      issues.push({ code: "required_source_file_missing", path: relativePath });
    }
  }

  const pkg = safeReadJson(path.join(repoRoot, "package.json"), issues, "package_json_unreadable");
  if (pkg) {
    if (pkg.private !== false) issues.push({ code: "package_not_public", path: "package.json" });
    if (!String(pkg?.engines?.node || "").includes(">=22")) {
      issues.push({ code: "package_node_engine_not_declared", path: "package.json" });
    }
    if (!pkg?.scripts?.["productization:check"]) {
      issues.push({ code: "productization_script_missing", path: "package.json" });
    }
    if (!pkg?.scripts?.["deploy:macos"]) {
      issues.push({ code: "macos_deploy_script_missing", path: "package.json" });
    }
  }

  const pluginManifestPath = path.join(repoRoot, "config", "public-plugin-sources.json");
  const manifest = safeReadJson(pluginManifestPath, issues, "public_plugin_sources_unreadable");
  if (manifest) {
    if (manifest.schemaVersion !== 1) {
      issues.push({ code: "public_plugin_sources_schema_version_invalid", path: "config/public-plugin-sources.json" });
    }
    if (!isHttpsGithubUrl(manifest?.homeAi?.repositoryUrl)) {
      issues.push({ code: "home_ai_repository_url_not_public_https_github", id: "home-ai" });
    }
    const plugins = Array.isArray(manifest.plugins) ? manifest.plugins : [];
    if (!Array.isArray(manifest.plugins)) {
      issues.push({ code: "public_plugin_sources_plugins_not_array", path: "config/public-plugin-sources.json" });
    }
    const ids = new Set(plugins.map((entry) => String(entry.id || "")));
    for (const id of REQUIRED_PLUGIN_IDS) {
      if (!ids.has(id)) issues.push({ code: "public_plugin_source_missing", id });
    }
    for (const plugin of plugins) {
      const id = String(plugin.id || "");
      if (!id) issues.push({ code: "public_plugin_source_id_missing" });
      if (!isHttpsGithubUrl(plugin.repositoryUrl)) {
        issues.push({ code: "public_plugin_repository_url_not_https_github", id });
      }
      if (!plugin.sourceDir) issues.push({ code: "public_plugin_source_dir_missing", id });
      if (!plugin.ref) issues.push({ code: "public_plugin_ref_missing", id });
      if (!plugin.launchdLabel) issues.push({ code: "public_plugin_launchd_label_missing", id });
      if (!isLoopbackHttpUrl(plugin.manifestUrl)) {
        issues.push({ code: "public_plugin_manifest_url_not_loopback", id });
      }
    }
  }
}

function checkHost(issues, options = {}) {
  const nodeVersion = parseVersion(process.version);
  if (!versionAtLeast(nodeVersion, { major: 22, minor: 0, patch: 0 })) {
    issues.push({ code: "node_version_too_old", found: process.version, required: ">=22.0.0" });
  }

  const runner = options.runner || spawnSync;
  const pythonCommand = options.pythonCommand || process.env.HOMEAI_PYTHON || process.env.PYTHON || "python3";
  const python = runVersionCommand(pythonCommand, ["--version"], runner);
  const pythonVersion = parseVersion(python.output);
  if (!python.ok || !versionAtLeast(pythonVersion, { major: 3, minor: 12, patch: 0 })) {
    issues.push({
      code: "python_version_too_old_or_missing",
      command: pythonCommand,
      found: python.output || `status=${python.status}`,
      required: ">=3.12.0",
    });
  }

  const gitCommand = options.gitCommand || process.env.HOMEAI_GIT || "git";
  const git = runVersionCommand(gitCommand, ["--version"], runner);
  if (!git.ok || !parseVersion(git.output)) {
    issues.push({ code: "git_missing_or_unreadable", command: gitCommand, found: git.output || `status=${git.status}` });
  }
}

function buildReport(options = {}) {
  const issues = [];
  const root = path.resolve(options.repoRoot || REPO_ROOT);
  checkSource(root, issues);
  if (!options.sourceOnly) {
    checkHost(issues, options);
  }
  return {
    ok: issues.length === 0,
    schemaVersion: 1,
    mode: options.sourceOnly ? "source-only" : "host-and-source",
    repoRoot: root,
    requiredSourceFileCount: REQUIRED_SOURCE_FILES.length,
    requiredPluginCount: REQUIRED_PLUGIN_IDS.length,
    issues,
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Public Install Preflight",
    "",
    `- ok: ${report.ok}`,
    `- mode: ${report.mode}`,
    `- requiredSourceFileCount: ${report.requiredSourceFileCount}`,
    `- requiredPluginCount: ${report.requiredPluginCount}`,
    "",
    "## Issues",
  ];
  if (report.issues.length === 0) {
    lines.push("");
    lines.push("- none");
  } else {
    lines.push("");
    for (const issue of report.issues) {
      const suffix = issue.id || issue.path || issue.found || "";
      lines.push(`- ${issue.code}${suffix ? `: ${suffix}` : ""}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = buildReport(args);
  if (args.markdown) process.stdout.write(renderMarkdown(report));
  else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  REQUIRED_PLUGIN_IDS,
  REQUIRED_SOURCE_FILES,
  buildReport,
  checkHost,
  checkSource,
  parseArgs,
  parseVersion,
  renderMarkdown,
  versionAtLeast,
};
