"use strict";

const { execFileSync } = require("node:child_process");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

const PYTHON_COMPILE_FILES = [
  "cron_bridge.py",
  "directory_bridge.py",
  "skill_bridge.py",
  "todo_bridge.py",
  "scripts/weixin-ingress-sidecar.py",
  "scripts/weixin-mobile-ingress-bridge.py",
  "scripts/migrate-workspace-roots.py",
  "gateway-plugins/hermes-mobile-weather/__init__.py",
  "gateway-plugins/hermes-mobile-http/__init__.py",
  "gateway-plugins/hermes-mobile-web/__init__.py",
  "gateway-plugins/hermes-mobile-image/__init__.py",
  "gateway-plugins/hermes-mobile-docx/__init__.py",
  "gateway-plugins/hermes-mobile-audio/__init__.py",
];

const NO_WARNING_TESTS = new Set([
  "tests/gateway-usage-telemetry-provider.test.js",
  "tests/mobile-sqlite-store.test.js",
  "tests/runtime-state-repository.test.js",
  "tests/json-to-sqlite-migration.test.js",
]);

function run(label, command, args, options = {}) {
  console.log(`\n== ${label} ==`);
  execFileSync(command, args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: options.env || process.env,
  });
}

function gitFiles(args) {
  const out = execFileSync("git", args, { cwd: REPO_ROOT });
  return out.toString("utf8").split("\0").filter(Boolean);
}

function trackedAndUntracked(pathspec) {
  const files = new Set([
    ...gitFiles(["ls-files", "-z", "--", pathspec]),
    ...gitFiles(["ls-files", "--others", "--exclude-standard", "-z", "--", pathspec]),
  ]);
  return [...files].sort((a, b) => a.localeCompare(b));
}

function runSyntaxChecks() {
  const files = trackedAndUntracked("*.js");
  for (const file of files) {
    run(`node --check ${file}`, process.execPath, ["--check", file]);
  }
}

function runNodeTests() {
  const files = trackedAndUntracked("tests/*.test.js");
  for (const file of files) {
    const args = NO_WARNING_TESTS.has(file)
      ? ["--no-warnings", file]
      : [file];
    run(`node ${args.join(" ")}`, process.execPath, args);
  }
}

function runPythonCompile() {
  run("python -m py_compile", "python", ["-m", "py_compile", ...PYTHON_COMPILE_FILES]);
}

function runFullTestGate() {
  runSyntaxChecks();
  runNodeTests();
  run("security invariants", process.execPath, ["scripts/security-invariants-check.js"]);
  runPythonCompile();
  run("privacy scan", process.execPath, ["scripts/privacy-scan.js"]);
}

function main() {
  const mode = process.argv[2] || "--test";
  if (mode === "--check" || mode === "--syntax") {
    runSyntaxChecks();
    return;
  }
  if (mode === "--test") {
    runFullTestGate();
    return;
  }
  throw new Error(`Unknown run-checks mode: ${mode}`);
}

main();
