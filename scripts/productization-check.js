"use strict";

const { execFileSync } = require("node:child_process");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

function run(label, command, args) {
  console.log(`\n== ${label} ==`);
  execFileSync(command, args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: process.env,
  });
}

function runNpm(args) {
  if (process.platform === "win32") {
    run("Tests and privacy scan", "cmd.exe", ["/d", "/s", "/c", `npm.cmd ${args.join(" ")}`]);
    return;
  }
  run("Tests and privacy scan", "npm", args);
}

function startupCheck() {
  if (process.platform === "win32") {
    run("Startup check", "powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      ".\\start-hermes-web.ps1",
      "-CheckOnly",
    ]);
    return;
  }
  run("Startup check", "bash", ["./start-hermes-web.sh", "-CheckOnly"]);
}

function main() {
  run("Engineering governance check", "node", ["scripts/engineering-governance-check.js"]);
  run("Fallback governance check", "node", ["scripts/fallback-governance-check.js", "--json"]);
  run("Public install preflight source check", "node", ["scripts/public-install-preflight.js", "--source-only", "--json"]);
  run("Plugin provisioning coverage audit", "node", ["scripts/plugin-provisioning-coverage-audit.js"]);
  run("macOS install phase coverage audit", "node", ["scripts/macos-install-phase-coverage-audit.js"]);
  run("macOS fresh install rehearsal", "node", ["scripts/macos-fresh-install-rehearsal.js"]);
  run("macOS first-start preflight source check", "node", ["scripts/macos-first-start-preflight.js", "--source-only", "--json"]);
  run("macOS install verification classification", "node", ["scripts/macos-install-verification-classification.js"]);
  run("macOS install operator closure checklist", "node", ["scripts/macos-install-operator-closure-checklist.js"]);
  run("Grok xAI OAuth closure checklist", "node", ["scripts/grok-xai-oauth-closure-checklist.js"]);
  run("Windows development task boundary checklist", "node", ["scripts/windows-dev-services-boundary-checklist.js"]);
  run("macOS workspace file broker boundary checklist", "node", ["scripts/macos-workspace-file-broker-boundary-checklist.js"]);
  run("Codex Mobile recovery service test", "node", ["tests/codex-mobile-recovery-service.test.js"]);
  run("Codex Mobile recovery API route test", "node", ["tests/codex-mobile-recovery-api-routes.test.js"]);
  run("macOS Web Push production audit source check", "node", ["scripts/macos-web-push-production-audit.js", "--source-check", "--json"]);
  run("Production self-diagnostics inventory", "node", ["scripts/production-self-diagnostics.js"]);
  run("Production self-diagnostics coverage audit", "node", ["scripts/production-self-diagnostics-coverage-audit.js"]);
  run("Productization acceptance matrix docs verification", "node", ["scripts/productization-acceptance-matrix.js", "--verify-docs"]);
  runNpm(["test"]);
  startupCheck();
  run("Whitespace diff check", "git", ["diff", "--check"]);
  run("Staged whitespace diff check", "git", ["diff", "--cached", "--check"]);
  console.log("\nProductization check passed.");
}

main();
