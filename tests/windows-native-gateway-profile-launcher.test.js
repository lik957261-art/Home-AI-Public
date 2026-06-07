"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "start-windows-native-gateway-profile.ps1");
const source = fs.readFileSync(scriptPath, "utf8");

assert.match(source, /param\(/, "launcher should be a parameterized PowerShell script");
assert.match(source, /\[Alias\("start-profiles"\)\]/, "launcher should accept service custom script start args");
assert.match(source, /\[Alias\("stop-profiles"\)\]/, "launcher should accept service custom script stop args");
assert.match(source, /\[Alias\("start-replicas"\)\]/, "launcher should accept owner maintenance replica start args");
assert.match(source, /\[Alias\("stop-replicas"\)\]/, "launcher should accept owner maintenance replica stop args");
assert.match(source, /native-runtime/, "launcher should use the isolated Windows native runtime root");
assert.match(source, /Convert-ProfileConfigText/, "launcher should convert WSL profile config into Windows-native config");
assert.match(source, /Ensure-NativeAuthFiles/, "launcher should materialize native auth files without WSL reparse links");
assert.doesNotMatch(source, /"auth\.json", "auth\.lock"/, "launcher must not hardlink WSL auth reparse points into native profiles");
assert.match(source, /\/mnt\/c\/ProgramData\/HermesMobile\/gateway-worker/, "launcher should rewrite WSL worker paths");
assert.match(source, /\/opt\/hermes-gateway-runtime\/venv\/bin\/python/, "launcher should rewrite WSL runtime Python paths");
assert.match(source, /http:\/\/172\\\.\(1\[6-9\]\|2\[0-9\]\|3\[0-1\]\)\\\./, "launcher should rewrite WSL host MCP URLs");
assert.match(source, /\$env:API_SERVER_KEY = \$apiKey/, "launcher should pass worker API key through process env");
assert.match(source, /Start-GatewayProcessDetached/, "launcher should start native Python through the detached helper");
assert.match(source, /System\.Diagnostics\.ProcessStartInfo/, "launcher should avoid inherited stdio handles from Node/PowerShell");
assert.match(source, /start",\s*[\r\n]+\s*'""',\s*[\r\n]+\s*"\/b"/, "launcher should use cmd start /b for detached workers");
assert.match(source, /Stop-GatewayPort -Port \$port/, "launcher should occupy the old profile port instead of dual-running");
assert.doesNotMatch(source, /wsl\.exe/i, "launcher must not invoke WSL");
assert.doesNotMatch(source, /\bbash\b/i, "launcher must not invoke bash");
for (const line of source.split(/\r?\n/)) {
  if (/ArgumentList/.test(line)) {
    assert.doesNotMatch(line, /API_SERVER_KEY|apiKey|\$apiKey/i, "launcher must not pass API keys on the command line");
  }
}

console.log("windows-native-gateway-profile-launcher tests passed");
