"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

const EXCLUDED_EXACT = new Set([
  ".env",
  "AGENTS.md",
  "docs/LOW_GATEWAY_RUNTIME_INCIDENT_2026-05-12.zh-CN.md",
]);

const EXCLUDED_PREFIXES = [
  ".agent-context/",
  "workspace/",
  "logs/",
  "outbox/",
  "uploads/",
  "tmp/",
  "temp/",
  "node_modules/",
  "__pycache__/",
];

const PUBLIC_TEXT_EXTENSIONS = new Set([
  "",
  ".css",
  ".example",
  ".gitattributes",
  ".gitignore",
  ".html",
  ".js",
  ".json",
  ".md",
  ".ps1",
  ".py",
  ".sh",
  ".vbs",
  ".yml",
  ".yaml",
]);

const PRIVATE_PATH_REPLACEMENTS = [
  {
    pattern: /[A-Z]:\\Users\\(?!Public\\|Default\\|Default User\\)[^\\\s"']+/gi,
    replacement: "C:\\Users\\example\\path",
  },
  {
    pattern: /\/mnt\/[a-z]\/Users\/[^\s"'`<>)]*/gi,
    replacement: "/mnt/example/path",
  },
  {
    pattern: /\/home\/(?!hermes\b|user\b|ubuntu\b|runner\b|example\b)[A-Za-z0-9._-]+(?:\/[^\s"'`<>)]*)?/gi,
    replacement: "/home/example/path",
  },
  {
    pattern: /\/Users\/(?!Shared\b|example\b)[A-Za-z0-9._-]+(?:\/[^\s"'`<>)]*)?/g,
    replacement: "/Users/example/path",
  },
];

function parseArgs(argv) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const out = {
    outDir: path.join(REPO_ROOT, "workspace", "public-export", `Home-AI-Public-${stamp}`),
    force: false,
    skipPrivacyScan: false,
    allowDirty: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") out.outDir = path.resolve(argv[++index] || out.outDir);
    else if (arg === "--force") out.force = true;
    else if (arg === "--skip-privacy-scan") out.skipPrivacyScan = true;
    else if (arg === "--allow-dirty") out.allowDirty = true;
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/create-public-export.js [--out <dir>] [--force] [--allow-dirty]",
        "",
        "Creates a clean public-export directory from tracked source files only.",
        "Runtime state, ignored files, node_modules, workspace data, secrets, and Agent context are not copied.",
        "By default, the repository must be clean so the export matches the reported source commit.",
      ].join("\n"));
      process.exit(0);
    }
  }
  return out;
}

function trackedFiles() {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return output.split("\0").filter(Boolean).sort();
}

function workingTreeStatus() {
  return execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  }).trim();
}

function assertCleanSource(allowDirty) {
  const status = workingTreeStatus();
  if (!status || allowDirty) return status;
  const preview = status.split(/\r?\n/).slice(0, 12).join("\n");
  throw new Error([
    "Refusing public export from a dirty source tree.",
    "Commit, stash, or remove pending changes first so .public-export-report.json sourceCommit is exact.",
    "Use --allow-dirty only for local smoke tests.",
    preview,
  ].filter(Boolean).join("\n"));
}

function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/");
}

function shouldExport(relativePath) {
  const normalized = normalizePath(relativePath);
  if (EXCLUDED_EXACT.has(normalized)) return false;
  if (normalized.startsWith(".env.") && normalized !== ".env.example") return false;
  return !EXCLUDED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function isPublicTextFile(relativePath) {
  return PUBLIC_TEXT_EXTENSIONS.has(path.extname(relativePath));
}

function safeResetOutputDir(outDir, force) {
  const resolved = path.resolve(outDir);
  const basename = path.basename(resolved);
  if (!force && fs.existsSync(resolved) && fs.readdirSync(resolved).length) {
    throw new Error(`Output directory already exists and is not empty: ${resolved}. Use --force to replace it.`);
  }
  const forbidden = new Set([
    path.parse(resolved).root,
    os.homedir(),
    REPO_ROOT,
  ].map((item) => path.resolve(item)));
  if (forbidden.has(resolved) || !basename.toLowerCase().includes("home-ai")) {
    throw new Error(`Refusing to reset unsafe export directory: ${resolved}`);
  }
  if (fs.existsSync(resolved)) fs.rmSync(resolved, { recursive: true, force: true });
  fs.mkdirSync(resolved, { recursive: true });
}

function transformPublicReadme(text) {
  return String(text || "")
    .replace(/This repository is the .*? productization checkout\.[^\n]+/s, "This repository contains the public Home AI product source. Keep deployment-specific secrets, runtime data, and adapter configuration outside the source checkout.")
    .replace(/See \[docs\/ADAPTER_BOUNDARY\.md\]\(docs\/ADAPTER_BOUNDARY\.md\) for the current .*? adapter extraction map\./, "See [docs/ADAPTER_BOUNDARY.md](docs/ADAPTER_BOUNDARY.md) for the adapter extraction map.")
    .replace(/The public repository should be created from a privacy-scanned export of this .*? repository, not from .*?\./, "Public releases should be created from this privacy-scanned export workflow, not from deployment runtime directories.");
}

function sanitizePublicText(text) {
  let output = String(text || "");
  for (const rule of PRIVATE_PATH_REPLACEMENTS) output = output.replace(rule.pattern, rule.replacement);
  return output;
}

function copyFile(relativePath, outDir) {
  const source = path.join(REPO_ROOT, relativePath);
  const target = path.join(outDir, relativePath);
  const sourceMode = fs.statSync(source).mode & 0o777;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (isPublicTextFile(relativePath)) {
    let text = fs.readFileSync(source, "utf8");
    if (normalizePath(relativePath) === "README.md") text = transformPublicReadme(text);
    fs.writeFileSync(target, sanitizePublicText(text), "utf8");
    fs.chmodSync(target, sourceMode);
    return;
  }
  fs.copyFileSync(source, target);
  fs.chmodSync(target, sourceMode);
}

function sourceCommit() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

function runPrivacyScan(outDir) {
  execFileSync(process.execPath, [path.join(REPO_ROOT, "scripts", "privacy-scan.js"), "--root", outDir, "--all-files"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
}

function createExport(options) {
  const outDir = path.resolve(options.outDir);
  const sourceStatus = assertCleanSource(options.allowDirty);
  safeResetOutputDir(outDir, options.force);
  const files = trackedFiles().filter(shouldExport);
  for (const file of files) copyFile(file, outDir);

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceCommit: sourceCommit(),
    sourceDirty: Boolean(sourceStatus),
    sourceDirtyAllowed: Boolean(options.allowDirty),
    fileCount: files.length,
    excludes: {
      exact: [...EXCLUDED_EXACT].sort(),
      prefixes: [...EXCLUDED_PREFIXES].sort(),
    },
    contentTransforms: [
      "public-readme",
      "private-user-path-redaction",
    ],
  };
  fs.writeFileSync(path.join(outDir, ".public-export-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (!options.skipPrivacyScan) runPrivacyScan(outDir);
  return { outDir, report };
}

function main() {
  const result = createExport(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify({
    ok: true,
    outDir: result.outDir,
    fileCount: result.report.fileCount,
    sourceCommit: result.report.sourceCommit,
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  createExport,
  sanitizePublicText,
  shouldExport,
  transformPublicReadme,
};
