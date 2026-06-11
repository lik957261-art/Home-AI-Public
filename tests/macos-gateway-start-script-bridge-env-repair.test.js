"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  ensureBridgeAssignments,
  repairGatewayStartScripts,
} = require("../scripts/macos-gateway-start-script-bridge-env-repair");

function writeFixture(root, label, scriptName, scriptText) {
  const launchDaemons = path.join(root, "LaunchDaemons");
  const scripts = path.join(root, "scripts");
  fs.mkdirSync(launchDaemons, { recursive: true });
  fs.mkdirSync(scripts, { recursive: true });
  const scriptPath = path.join(scripts, scriptName);
  fs.writeFileSync(scriptPath, scriptText, "utf8");
  fs.writeFileSync(path.join(launchDaemons, `${label}.plist`), [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<plist version="1.0">',
    '<dict>',
    '<key>ProgramArguments</key>',
    '<array>',
    `<string>${scriptPath}</string>`,
    '</array>',
    '</dict>',
    '</plist>',
  ].join("\n"), "utf8");
  return { launchDaemons, scriptPath };
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-gateway-bridge-repair-"));
try {
  const productionRoot = path.join(tempRoot, "HermesMobile");
  const missingInjectionScript = [
    "#!/usr/bin/env bash",
    "ROOT=\"/Users/hermes-host/HermesMobile\"",
    'MOBILE_BRIDGE_HOST_URL="${HERMES_MOBILE_BRIDGE_HOST_URL:-${HERMES_WEB_BRIDGE_HOST_URL:-http://127.0.0.1:8798}}"',
    'MOBILE_BRIDGE_HOST_KEY_PATH="${HERMES_MOBILE_BRIDGE_HOST_KEY_PATH:-${HERMES_WEB_BRIDGE_HOST_KEY_PATH:-$ROOT/data/secrets/bridge-host.secret}}"',
    "exec env \\",
    "  HOME=\"/Users/hm-owner\" \\",
    "  PYTHONPATH=\"$ROOT/gateway-worker/runtime-overrides:$ROOT/runtime/hermes-agent-official/source\" \\",
    "  API_SERVER_KEY=\"$API_KEY\" \\",
    "  \"$ROOT/runtime/hermes-agent-official/venv/bin/python\" -m hermes_cli.main gateway run --replace --accept-hooks",
    "",
  ].join("\n");
  const fixture = writeFixture(
    tempRoot,
    "com.hermesmobile.gateway.hm-owner.openai.1",
    "start-hm-owner-openai-1.sh",
    missingInjectionScript,
  );

  const patched = ensureBridgeAssignments(missingInjectionScript, productionRoot);
  assert.equal(patched.changed, true);
  assert.match(patched.text, /HERMES_MOBILE_BRIDGE_HOST_URL="\$MOBILE_BRIDGE_HOST_URL"/);
  assert.match(patched.text, /HERMES_WEB_BRIDGE_HOST_KEY_PATH="\$MOBILE_BRIDGE_HOST_KEY_PATH"/);
  assert.match(patched.text, /HERMES_MOBILE_BRIDGE_HOST_KEY_PATH="\$MOBILE_BRIDGE_HOST_KEY_PATH" \\\n\s*HERMES_WEB_BRIDGE_HOST_KEY_PATH/);

  const dryRun = repairGatewayStartScripts({
    root: productionRoot,
    launchDaemonsDir: fixture.launchDaemons,
  });
  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.scanned, 1);
  assert.equal(dryRun.changed, 1);
  assert.equal(dryRun.written, 0);
  assert.doesNotMatch(fs.readFileSync(fixture.scriptPath, "utf8"), /HERMES_MOBILE_BRIDGE_HOST_URL="\$MOBILE_BRIDGE_HOST_URL"/);

  const execute = repairGatewayStartScripts({
    root: productionRoot,
    launchDaemonsDir: fixture.launchDaemons,
    execute: true,
  });
  assert.equal(execute.ok, true);
  assert.equal(execute.changed, 1);
  assert.equal(execute.written, 1);
  const written = fs.readFileSync(fixture.scriptPath, "utf8");
  assert.match(written, /HERMES_MOBILE_BRIDGE_HOST_URL="\$MOBILE_BRIDGE_HOST_URL"/);
  assert.match(written, /HERMES_WEB_BRIDGE_HOST_URL="\$MOBILE_BRIDGE_HOST_URL"/);
  assert.match(written, /HERMES_MOBILE_BRIDGE_HOST_KEY_PATH="\$MOBILE_BRIDGE_HOST_KEY_PATH"/);
  assert.match(written, /HERMES_WEB_BRIDGE_HOST_KEY_PATH="\$MOBILE_BRIDGE_HOST_KEY_PATH"/);

  const idempotent = repairGatewayStartScripts({
    root: productionRoot,
    launchDaemonsDir: fixture.launchDaemons,
    execute: true,
  });
  assert.equal(idempotent.ok, true);
  assert.equal(idempotent.changed, 0);
  assert.equal(idempotent.written, 0);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("macOS Gateway start-script bridge env repair tests passed");
