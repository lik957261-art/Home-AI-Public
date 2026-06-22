"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createPluginLaunchRecoveryService,
  defaultCodexMobileRecoveryScriptPath,
  isLocalOrPrivateManifestUrl,
  isSafeLaunchdLabel,
  isCodexMobileRecoveryTarget,
  recoverableManifestFailure,
  resolvePluginLaunchdLabel,
} = require("../adapters/plugin-launch-recovery-service");

function tempRecoveryScript() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-plugin-launch-recovery-"));
  const script = path.join(dir, "restart-codex-mobile-host-macos.sh");
  fs.writeFileSync(script, "#!/bin/sh\n", { mode: 0o755 });
  return script;
}

function testManifestUrlClassification() {
  assert.equal(isLocalOrPrivateManifestUrl("http://127.0.0.1:8787/api/v1/hermes/plugin/manifest"), true);
  assert.equal(isLocalOrPrivateManifestUrl("http://192.168.10.108:8787/api/v1/hermes/plugin/manifest"), true);
  assert.equal(isLocalOrPrivateManifestUrl("https://plugin.example.com/api/v1/hermes/plugin/manifest"), false);
  assert.equal(isLocalOrPrivateManifestUrl("file:///tmp/plugin.json"), false);
}

function testRecoverableFailures() {
  assert.equal(recoverableManifestFailure({ code: "plugin_manifest_error" }), true);
  assert.equal(recoverableManifestFailure({ code: "plugin_manifest_timeout" }), true);
  assert.equal(recoverableManifestFailure({ code: "plugin_manifest_fetch_failed", status: 503 }), true);
  assert.equal(recoverableManifestFailure({ code: "plugin_manifest_fetch_failed", status: 404 }), false);
  assert.equal(recoverableManifestFailure({ code: "plugin_workspace_not_authorized" }), false);
}

function testLaunchdLabelSafety() {
  assert.equal(isSafeLaunchdLabel("com.hermesmobile.plugin.codex-mobile"), true);
  assert.equal(isSafeLaunchdLabel("com.hermesmobile.listener"), false);
  assert.equal(isSafeLaunchdLabel("com.hermesmobile.plugin../codex"), false);
}

function testResolveLaunchdLabelFromPluginSources() {
  const label = resolvePluginLaunchdLabel({
    pluginId: "codex-mobile",
    manifestUrl: "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest",
  }, {
    pluginSources: [{
      id: "codex-mobile-web",
      launchdLabel: "com.hermesmobile.plugin.codex-mobile",
      manifestUrl: "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest",
    }],
  });
  assert.equal(label, "com.hermesmobile.plugin.codex-mobile");
  assert.equal(resolvePluginLaunchdLabel({ pluginId: "note" }, { pluginSources: [] }), "com.hermesmobile.plugin.note");
}

function testCodexMobileTargetDetection() {
  assert.equal(isCodexMobileRecoveryTarget("codex-mobile", ""), true);
  assert.equal(isCodexMobileRecoveryTarget("codex-mobile-web", ""), true);
  assert.equal(isCodexMobileRecoveryTarget("other", "com.hermesmobile.plugin.codex-mobile"), true);
  assert.equal(isCodexMobileRecoveryTarget("note", "com.hermesmobile.plugin.note"), false);
  assert.equal(
    defaultCodexMobileRecoveryScriptPath("/Users/example/path"),
    "/Users/example/path",
  );
}

async function testRecoveryUsesConfiguredCommand() {
  const calls = [];
  const service = createPluginLaunchRecoveryService({
    enabled: true,
    platform: "darwin",
    command: "/usr/local/bin/homeai-plugin-restart",
    pluginSources: [],
    cooldownMs: 0,
    retryDelayMs: 0,
    execFile(command, args, options, callback) {
      calls.push({ command, args, options });
      callback(null, "ok", "");
    },
  });
  const result = await service.recover({
    pluginId: "codex-mobile",
    manifestUrl: "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest",
    failure: { code: "plugin_manifest_error", warning: "connect ECONNREFUSED" },
  });
  assert.equal(result.attempted, true);
  assert.equal(result.restarted, true);
  assert.equal(result.method, "command");
  assert.equal(result.launchdLabel, "com.hermesmobile.plugin.codex-mobile");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "/usr/local/bin/homeai-plugin-restart");
  assert.deepEqual(calls[0].args.slice(0, 4), ["--plugin-id", "codex-mobile", "--launchd-label", "com.hermesmobile.plugin.codex-mobile"]);
}

async function testRecoveryFallsBackToLaunchctlAndCooldown() {
  let now = 1000;
  const calls = [];
  const service = createPluginLaunchRecoveryService({
    enabled: true,
    platform: "darwin",
    pluginSources: [],
    cooldownMs: 5000,
    retryDelayMs: 0,
    nowMs: () => now,
    launchctlPath: "/bin/launchctl",
    execFile(command, args, options, callback) {
      calls.push({ command, args, options });
      callback(null, "", "");
    },
  });
  const input = {
    pluginId: "note",
    manifestUrl: "http://127.0.0.1:4181/api/v1/hermes/plugin/manifest",
    failure: { code: "plugin_manifest_fetch_failed", status: 503 },
  };
  const first = await service.recover(input);
  assert.equal(first.attempted, true);
  assert.equal(first.method, "launchctl");
  assert.deepEqual(calls[0].args, ["kickstart", "-k", "system/com.hermesmobile.plugin.note"]);
  now = 2000;
  const second = await service.recover(input);
  assert.equal(second.attempted, false);
  assert.equal(second.reason, "plugin_recovery_cooldown");
  assert.equal(calls.length, 1);
}

async function testCodexMobileRecoveryUsesDedicatedHostScript() {
  const script = tempRecoveryScript();
  const calls = [];
  const service = createPluginLaunchRecoveryService({
    enabled: true,
    platform: "darwin",
    pluginSources: [],
    cooldownMs: 0,
    retryDelayMs: 0,
    codexMobileRecoveryScriptPath: script,
    env: {
      HOMEAI_CODEX_MOBILE_RECOVERY_RESTORE_TIMEOUT_MS: "65000",
    },
    execFile(command, args, options, callback) {
      calls.push({ command, args, options });
      callback(null, JSON.stringify({ ok: true }), "");
    },
  });
  const result = await service.recover({
    pluginId: "codex-mobile",
    manifestUrl: "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest",
    failure: { code: "plugin_manifest_fetch_failed", status: 0 },
  });
  assert.equal(result.attempted, true);
  assert.equal(result.restarted, true);
  assert.equal(result.method, "codex_mobile_host_script");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, script);
  assert.deepEqual(calls[0].args, ["--json"]);
  assert.equal(calls[0].options.cwd, path.dirname(script));
  assert.equal(calls[0].options.timeout, 65000);
}

async function testCodexMobileRecoveryFallsBackToLaunchctlWhenScriptMissing() {
  const calls = [];
  const service = createPluginLaunchRecoveryService({
    enabled: true,
    platform: "darwin",
    pluginSources: [],
    cooldownMs: 0,
    retryDelayMs: 0,
    codexMobileRecoveryScriptPath: path.join(os.tmpdir(), "missing-codex-mobile-recovery.sh"),
    launchctlPath: "/bin/launchctl",
    execFile(command, args, options, callback) {
      calls.push({ command, args, options });
      callback(null, "", "");
    },
  });
  const result = await service.recover({
    pluginId: "codex-mobile",
    manifestUrl: "http://127.0.0.1:8787/api/v1/hermes/plugin/manifest",
    failure: { code: "plugin_manifest_error" },
  });
  assert.equal(result.attempted, true);
  assert.equal(result.method, "launchctl");
  assert.equal(calls[0].command, "/bin/launchctl");
  assert.deepEqual(calls[0].args, ["kickstart", "-k", "system/com.hermesmobile.plugin.codex-mobile"]);
}

async function testRecoverySkipsExternalManifest() {
  const service = createPluginLaunchRecoveryService({
    enabled: true,
    platform: "darwin",
    pluginSources: [],
    execFile() {
      throw new Error("should not execute");
    },
  });
  const result = await service.recover({
    pluginId: "external",
    manifestUrl: "https://plugin.example.com/manifest",
    failure: { code: "plugin_manifest_error" },
  });
  assert.equal(result.attempted, false);
  assert.equal(result.reason, "manifest_url_not_local");
}

async function run() {
  testManifestUrlClassification();
  testRecoverableFailures();
  testLaunchdLabelSafety();
  testResolveLaunchdLabelFromPluginSources();
  testCodexMobileTargetDetection();
  await testRecoveryUsesConfiguredCommand();
  await testRecoveryFallsBackToLaunchctlAndCooldown();
  await testCodexMobileRecoveryUsesDedicatedHostScript();
  await testCodexMobileRecoveryFallsBackToLaunchctlWhenScriptMissing();
  await testRecoverySkipsExternalManifest();
  assert.ok(path.basename(__filename).endsWith(".test.js"));
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
