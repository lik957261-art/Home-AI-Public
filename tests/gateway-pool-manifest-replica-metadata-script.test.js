"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { main } = require("../scripts/normalize-gateway-pool-manifest-replica-metadata");

function captureStdout(fn) {
  const original = console.log;
  const lines = [];
  console.log = (line) => lines.push(String(line));
  try {
    const code = fn();
    return { code, output: lines.join("\n") };
  } finally {
    console.log = original;
  }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-manifest-replica-"));
try {
  const manifestPath = path.join(root, "gateway-pool-manifest.json");
  const backupPath = path.join(root, "gateway-pool-manifest.backup.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    enabled: true,
    workers: [{
      name: "lowgw5",
      profile: "lowgw5",
      port: 18755,
      api_key: "secret-value-that-must-not-print",
      provider: "openai-codex",
      securityLevel: "user",
      allowedWorkspaceIds: ["weixin_test_1"],
      skillWorkspaceIds: ["weixin_test_1"],
    }],
  }, null, 2)}\n`, "utf8");

  const dryRun = captureStdout(() => main(["node", "script", "--manifest", manifestPath]));
  assert.equal(dryRun.code, 0);
  assert.equal(JSON.parse(dryRun.output).updatedWorkerCount, 1);
  assert.equal(JSON.parse(dryRun.output).wrote, false);
  assert.equal(fs.existsSync(backupPath), false);
  assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(manifestPath, "utf8"))).includes("profileTemplateKey"), false);
  assert.equal(dryRun.output.includes("secret-value"), false);

  const writeRun = captureStdout(() => main(["node", "script", "--manifest", manifestPath, "--write", "--backup", backupPath]));
  assert.equal(writeRun.code, 0);
  assert.equal(JSON.parse(writeRun.output).wrote, true);
  assert.equal(fs.existsSync(backupPath), true);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.workers[0].replicaId, "lowgw5");
  assert.equal(manifest.workers[0].profileAlias, "lowgw5");
  assert.equal(manifest.workers[0].profileTemplateKey, "weixin_test_1|user|openai-codex");
  assert.equal(manifest.workers[0].poolKey, "weixin_test_1|user|openai-codex");
  assert.equal(writeRun.output.includes("secret-value"), false);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("gateway pool manifest replica metadata script tests passed");
