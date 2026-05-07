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
  runNpm(["test"]);
  startupCheck();
  run("Whitespace diff check", "git", ["diff", "--check"]);
  console.log("\nProductization check passed.");
}

main();
