"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  ensureBridgeAssignments,
  ensureFileRootDefinitions,
  gatewayWorkspaceStartScripts,
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
    "ROOT=\"/Users/example/path\"",
    'MOBILE_BRIDGE_HOST_URL="${HERMES_MOBILE_BRIDGE_HOST_URL:-${HERMES_WEB_BRIDGE_HOST_URL:-http://127.0.0.1:8798}}"',
    'MOBILE_BRIDGE_HOST_KEY_PATH="${HERMES_MOBILE_BRIDGE_HOST_KEY_PATH:-${HERMES_WEB_BRIDGE_HOST_KEY_PATH:-$ROOT/data/secrets/bridge-host.secret}}"',
    "exec env \\",
    "  HOME=\"/Users/example/path\" \\",
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
  const usersRoot = path.join(tempRoot, "Users");
  const orphanGatewayDir = path.join(usersRoot, "hm-codex-disposable", "HermesWorkspace", ".hermes-gateway");
  fs.mkdirSync(orphanGatewayDir, { recursive: true });
  const orphanScriptPath = path.join(orphanGatewayDir, "start-lowgw1.sh");
  fs.writeFileSync(orphanScriptPath, missingInjectionScript, "utf8");
  assert.deepEqual(gatewayWorkspaceStartScripts(usersRoot).map((item) => item.startScriptPath), [orphanScriptPath]);

  const patched = ensureBridgeAssignments(missingInjectionScript, productionRoot);
  assert.equal(patched.changed, true);
  assert.match(patched.text, /FILE_PLUGIN_ALLOWED_ROOTS="\$ROOT\/data\/drive,\$ROOT\/data\/uploads,\$ROOT\/data\/artifacts"/);
  assert.match(patched.text, /export HERMES_MOBILE_PPTX_ALLOWED_ROOTS="\$FILE_PLUGIN_ALLOWED_ROOTS"/);
  assert.match(patched.text, /export HERMES_MOBILE_PPTX_OUTPUT_ROOTS="\$FILE_PLUGIN_ALLOWED_ROOTS"/);
  assert.match(patched.text, /export HERMES_MOBILE_PDF_ALLOWED_ROOTS="\$FILE_PLUGIN_ALLOWED_ROOTS"/);
  assert.match(patched.text, /export HERMES_MOBILE_ARCHIVE_ALLOWED_ROOTS="\$FILE_PLUGIN_ALLOWED_ROOTS"/);
  assert.match(patched.text, /export HERMES_MOBILE_HTTP_CREDENTIAL_ROOTS="\$ROOT\/data\/drive\/users"/);
  assert.match(patched.text, /HERMES_MOBILE_BRIDGE_HOST_URL="\$MOBILE_BRIDGE_HOST_URL"/);
  assert.match(patched.text, /HERMES_WEB_BRIDGE_HOST_KEY_PATH="\$MOBILE_BRIDGE_HOST_KEY_PATH"/);
  assert.match(patched.text, /HERMES_MOBILE_BRIDGE_HOST_KEY_PATH="\$MOBILE_BRIDGE_HOST_KEY_PATH" \\\n\s*HERMES_WEB_BRIDGE_HOST_KEY_PATH/);

  const wrongCredentialRoot = [
    "#!/usr/bin/env bash",
    "ROOT=\"/Users/example/path\"",
    "FILE_PLUGIN_ALLOWED_ROOTS=\"$ROOT/data/drive,$ROOT/data/uploads,$ROOT/data/artifacts\"",
    "export HERMES_MOBILE_HTTP_CREDENTIAL_ROOTS=\"$ROOT/data/secrets\"",
    "exec env \\",
    "  PYTHONPATH=\"$ROOT/runtime\" \\",
    "  \"$ROOT/runtime/hermes-agent-official/venv/bin/python\" -m hermes_cli.main gateway run",
  ].join("\n");
  const fileRootPatched = ensureFileRootDefinitions(wrongCredentialRoot, productionRoot);
  assert.equal(fileRootPatched.changed, true);
  assert.doesNotMatch(fileRootPatched.text, /HERMES_MOBILE_HTTP_CREDENTIAL_ROOTS="\$ROOT\/data\/secrets"/);
  assert.match(fileRootPatched.text, /export HERMES_MOBILE_HTTP_CREDENTIAL_ROOTS="\$ROOT\/data\/drive\/users"/);

  const dryRun = repairGatewayStartScripts({
    root: productionRoot,
    launchDaemonsDir: fixture.launchDaemons,
    usersRoot,
  });
  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.scanned, 2);
  assert.equal(dryRun.changed, 2);
  assert.equal(dryRun.written, 0);
  assert.doesNotMatch(fs.readFileSync(fixture.scriptPath, "utf8"), /HERMES_MOBILE_BRIDGE_HOST_URL="\$MOBILE_BRIDGE_HOST_URL"/);
  assert.doesNotMatch(fs.readFileSync(orphanScriptPath, "utf8"), /HERMES_MOBILE_PDF_ALLOWED_ROOTS="\$FILE_PLUGIN_ALLOWED_ROOTS"/);

  const execute = repairGatewayStartScripts({
    root: productionRoot,
    launchDaemonsDir: fixture.launchDaemons,
    usersRoot,
    execute: true,
  });
  assert.equal(execute.ok, true);
  assert.equal(execute.changed, 2);
  assert.equal(execute.written, 2);
  const written = fs.readFileSync(fixture.scriptPath, "utf8");
  assert.match(written, /export HERMES_MOBILE_PPTX_ALLOWED_ROOTS="\$FILE_PLUGIN_ALLOWED_ROOTS"/);
  assert.match(written, /export HERMES_MOBILE_PPTX_OUTPUT_ROOTS="\$FILE_PLUGIN_ALLOWED_ROOTS"/);
  assert.match(written, /export HERMES_MOBILE_PDF_ALLOWED_ROOTS="\$FILE_PLUGIN_ALLOWED_ROOTS"/);
  assert.match(written, /export HERMES_MOBILE_ARCHIVE_ALLOWED_ROOTS="\$FILE_PLUGIN_ALLOWED_ROOTS"/);
  assert.match(written, /export HERMES_MOBILE_HTTP_CREDENTIAL_ROOTS="\$ROOT\/data\/drive\/users"/);
  assert.match(written, /HERMES_MOBILE_BRIDGE_HOST_URL="\$MOBILE_BRIDGE_HOST_URL"/);
  assert.match(written, /HERMES_WEB_BRIDGE_HOST_URL="\$MOBILE_BRIDGE_HOST_URL"/);
  assert.match(written, /HERMES_MOBILE_BRIDGE_HOST_KEY_PATH="\$MOBILE_BRIDGE_HOST_KEY_PATH"/);
  assert.match(written, /HERMES_WEB_BRIDGE_HOST_KEY_PATH="\$MOBILE_BRIDGE_HOST_KEY_PATH"/);
  const orphanWritten = fs.readFileSync(orphanScriptPath, "utf8");
  assert.match(orphanWritten, /export HERMES_MOBILE_PPTX_ALLOWED_ROOTS="\$FILE_PLUGIN_ALLOWED_ROOTS"/);
  assert.match(orphanWritten, /export HERMES_MOBILE_PPTX_OUTPUT_ROOTS="\$FILE_PLUGIN_ALLOWED_ROOTS"/);
  assert.match(orphanWritten, /export HERMES_MOBILE_PDF_ALLOWED_ROOTS="\$FILE_PLUGIN_ALLOWED_ROOTS"/);
  assert.match(orphanWritten, /export HERMES_MOBILE_ARCHIVE_ALLOWED_ROOTS="\$FILE_PLUGIN_ALLOWED_ROOTS"/);

  const idempotent = repairGatewayStartScripts({
    root: productionRoot,
    launchDaemonsDir: fixture.launchDaemons,
    usersRoot,
    execute: true,
  });
  assert.equal(idempotent.ok, true);
  assert.equal(idempotent.changed, 0);
  assert.equal(idempotent.written, 0);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("macOS Gateway start-script bridge env repair tests passed");
