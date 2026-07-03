"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

const PYTHON_COMPILE_FILES = [
  "cron_bridge.py",
  "directory_bridge.py",
  "skill_bridge.py",
  "todo_bridge.py",
  "scripts/migrate-workspace-roots.py",
  "gateway-plugins/hermes-mobile-weather/__init__.py",
  "gateway-plugins/hermes-mobile-http/__init__.py",
  "gateway-plugins/hermes-mobile-web/__init__.py",
  "gateway-plugins/hermes-mobile-image/__init__.py",
  "gateway-plugins/hermes-mobile-docx/__init__.py",
  "gateway-plugins/hermes-mobile-pptx/__init__.py",
  "gateway-plugins/hermes-mobile-pdf/__init__.py",
  "gateway-plugins/hermes-mobile-audio/__init__.py",
  "gateway-plugins/hermes-mobile-archive/__init__.py",
];

const NO_WARNING_TESTS = new Set([
  "tests/gateway-usage-telemetry-provider.test.js",
  "tests/mobile-sqlite-store.test.js",
  "tests/runtime-state-repository.test.js",
  "tests/json-to-sqlite-migration.test.js",
]);

const INSTALL_AND_DEPLOY_LANE_TESTS = new Set([
  "tests/deploy-upgrade-lane-closure-service.test.js",
  "tests/deploy-upgrade-lane-closure-smoke.test.js",
  "tests/gateway-pool-production-smoke-harness.test.js",
  "tests/home-ai-install-upgrade-canary-service.test.js",
  "tests/homeai-install-upgrade-canary-script.test.js",
  "tests/homeai-public-remote-deploy-smoke-script.test.js",
  "tests/homeai-public-upgrade-rehearsal-script.test.js",
  "tests/homeai-public-upgrade-script.test.js",
  "tests/install-growth-launchd-service.test.js",
  "tests/install-macos-production.test.js",
  "tests/install-moira-launchd-service.test.js",
  "tests/install-movie-launchd-service.test.js",
  "tests/install-music-launchd-service.test.js",
  "tests/local-asr-service-installer.test.js",
  "tests/macos-fresh-install-rehearsal.test.js",
  "tests/macos-install-operator-closure-checklist.test.js",
  "tests/macos-install-phase-coverage-audit.test.js",
  "tests/macos-install-verification-classification.test.js",
  "tests/macos-plugin-directory-production-smoke-harness.test.js",
  "tests/macos-production-deploy-script.test.js",
  "tests/macos-wardrobe-binding-production-smoke-harness.test.js",
  "tests/nas-deploy-harness.test.js",
  "tests/nas-static-deploy-harness.test.js",
  "tests/plugin-launchd-service-installers.test.js",
  "tests/production-status-smoke-harness.test.js",
  "tests/public-install-preflight.test.js",
  "tests/public-remote-deploy-smoke-service.test.js",
  "tests/public-upgrade-orchestrator-service.test.js",
  "tests/public-upgrade-rehearsal-service.test.js",
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
  return [...files]
    .filter((file) => fs.existsSync(path.join(REPO_ROOT, file)))
    .sort((a, b) => a.localeCompare(b));
}

function runSyntaxChecks() {
  const files = trackedAndUntracked("*.js");
  for (const file of files) {
    run(`node --check ${file}`, process.execPath, ["--check", file]);
  }
}

function selectNodeTestFiles(mode = "local") {
  const files = trackedAndUntracked("tests/*.test.js");
  if (mode === "all") return files;
  if (mode === "install-lane") return files.filter((file) => INSTALL_AND_DEPLOY_LANE_TESTS.has(file));
  return files.filter((file) => !INSTALL_AND_DEPLOY_LANE_TESTS.has(file));
}

function runNodeTests(mode = "local") {
  const files = selectNodeTestFiles(mode);
  if (mode === "local") {
    const skipped = trackedAndUntracked("tests/*.test.js").filter((file) => INSTALL_AND_DEPLOY_LANE_TESTS.has(file));
    console.log(`\n== local test gate skips ${skipped.length} install/deploy lane tests; run npm run test:install-lane for that lane ==`);
  }
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
  runNodeTests("local");
  run("security invariants", process.execPath, ["scripts/security-invariants-check.js"]);
  runPythonCompile();
  run("privacy scan", process.execPath, ["scripts/privacy-scan.js"]);
}

function runInstallAndDeployLaneGate() {
  runNodeTests("install-lane");
}

function runAllTestsGate() {
  runSyntaxChecks();
  runNodeTests("all");
  run("security invariants", process.execPath, ["scripts/security-invariants-check.js"]);
  runPythonCompile();
  run("privacy scan", process.execPath, ["scripts/privacy-scan.js"]);
}

function listNodeTests(mode = "local") {
  const files = selectNodeTestFiles(mode);
  console.log(JSON.stringify({
    mode,
    count: files.length,
    files,
  }, null, 2));
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
  if (mode === "--test-install-lane") {
    runInstallAndDeployLaneGate();
    return;
  }
  if (mode === "--test-all") {
    runAllTestsGate();
    return;
  }
  if (mode === "--list-tests") {
    listNodeTests("local");
    return;
  }
  if (mode === "--list-install-lane-tests") {
    listNodeTests("install-lane");
    return;
  }
  if (mode === "--list-all-tests") {
    listNodeTests("all");
    return;
  }
  throw new Error(`Unknown run-checks mode: ${mode}`);
}

main();
