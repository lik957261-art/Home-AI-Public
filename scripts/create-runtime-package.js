"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

const EXCLUDED_EXACT = new Set([
  ".env",
  "AGENTS.md",
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

function parseArgs(argv) {
  const out = {
    outDir: path.resolve("C:/ProgramData/HermesMobile/app"),
    force: false,
    allowDirty: false,
    windowsWorkerAccount: process.env.HERMES_MOBILE_RUNTIME_WORKER_ACCOUNT || "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") out.outDir = path.resolve(argv[++index] || out.outDir);
    else if (arg === "--force") out.force = true;
    else if (arg === "--allow-dirty") out.allowDirty = true;
    else if (arg === "--windows-worker-account") out.windowsWorkerAccount = argv[++index] || "";
    else if (arg === "--help") {
      console.log([
        "Usage: node scripts/create-runtime-package.js [--out <dir>] [--force] [--allow-dirty] [--windows-worker-account <name>]",
        "",
        "Creates a private runtime package from tracked and untracked source files.",
        "Runtime state, ignored files, node_modules, workspace data, logs, uploads, and secrets are not copied.",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/");
}

function sourceFiles() {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
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

function shouldPackage(relativePath) {
  const normalized = normalizePath(relativePath);
  if (EXCLUDED_EXACT.has(normalized)) return false;
  if (normalized.startsWith(".env.") && normalized !== ".env.example") return false;
  return !EXCLUDED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function assertSafeOutputDir(outDir) {
  const resolved = path.resolve(outDir);
  const forbidden = new Set([
    path.parse(resolved).root,
    os.homedir(),
    REPO_ROOT,
  ].map((item) => path.resolve(item)));
  if (forbidden.has(resolved)) throw new Error(`Refusing unsafe runtime package directory: ${resolved}`);
  if (!normalizePath(resolved).toLowerCase().includes("/hermesmobile/")) {
    throw new Error(`Runtime package directory must be under a HermesMobile path: ${resolved}`);
  }
}

function resetOutputDir(outDir, force) {
  assertSafeOutputDir(outDir);
  if (fs.existsSync(outDir)) {
    const existing = fs.readdirSync(outDir);
    if (existing.length && !force) throw new Error(`Output directory is not empty: ${outDir}. Use --force.`);
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });
}

function copyFile(relativePath, outDir) {
  const source = path.join(REPO_ROOT, relativePath);
  const target = path.join(outDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function sourceCommit() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

function currentWindowsAccount() {
  const domain = process.env.USERDOMAIN || "";
  const user = process.env.USERNAME || "";
  if (!user) return "";
  return domain ? `${domain}\\${user}` : user;
}

function isElevatedWindowsProcess() {
  if (process.platform !== "win32") return false;
  try {
    execFileSync("net", ["session"], { stdio: "ignore" });
    return true;
  } catch (_) {
    return false;
  }
}

function maybeApplyWindowsRuntimeAcl(outDir, workerAccount) {
  if (process.platform !== "win32" || !workerAccount) return false;
  if (!isElevatedWindowsProcess()) {
    console.warn("warning: runtime ACL repair skipped; rerun from an elevated shell or use scripts/prepare-process-isolation.ps1.");
    return false;
  }
  const currentUser = currentWindowsAccount();
  if (!currentUser) throw new Error("Cannot determine current Windows account for runtime ACL.");
  try {
    execFileSync("icacls", [outDir, "/inheritance:r", "/T"], { stdio: "ignore" });
    execFileSync("icacls", [
      outDir,
      "/grant:r",
      `${currentUser}:(OI)(CI)F`,
      "SYSTEM:(OI)(CI)F",
      "BUILTIN\\Administrators:(OI)(CI)F",
      `${workerAccount}:(OI)(CI)RX`,
      "/T",
    ], { stdio: "ignore" });
    return true;
  } catch (error) {
    console.warn(`warning: runtime ACL repair skipped; run scripts/prepare-process-isolation.ps1 from an elevated shell. status=${error.status || "unknown"}`);
    return false;
  }
}

function createRuntimePackage(options) {
  const outDir = path.resolve(options.outDir);
  const status = workingTreeStatus();
  if (status && !options.allowDirty) {
    throw new Error([
      "Refusing runtime package from a dirty source tree.",
      "Use --allow-dirty for an operator-reviewed local deployment package.",
      status.split(/\r?\n/).slice(0, 16).join("\n"),
    ].join("\n"));
  }
  resetOutputDir(outDir, options.force);
  const files = sourceFiles().filter(shouldPackage);
  for (const file of files) copyFile(file, outDir);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceCommit: sourceCommit(),
    sourceDirty: Boolean(status),
    sourceDirtyAllowed: Boolean(options.allowDirty),
    fileCount: files.length,
    windowsRuntimeAclApplied: maybeApplyWindowsRuntimeAcl(outDir, options.windowsWorkerAccount),
  };
  fs.writeFileSync(path.join(outDir, ".runtime-package-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { outDir, report };
}

function main() {
  const result = createRuntimePackage(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify({
    ok: true,
    outDir: result.outDir,
    fileCount: result.report.fileCount,
    sourceCommit: result.report.sourceCommit,
    sourceDirty: result.report.sourceDirty,
  }, null, 2));
}

if (require.main === module) main();

module.exports = {
  createRuntimePackage,
  shouldPackage,
};
