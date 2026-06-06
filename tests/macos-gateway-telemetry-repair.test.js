"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  osUserForWorker,
  repair,
  telemetryPathsForWorker,
} = require("../scripts/macos-gateway-telemetry-repair");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

assert.equal(osUserForWorker({ osUser: "hm-owner" }), "hm-owner");
assert.equal(osUserForWorker({ launchdLabel: "com.hermesmobile.gateway.hm-wuping.openai.1" }), "hm-wuping");
assert.equal(osUserForWorker({ allowedWorkspaceIds: ["user-a87aaa61"] }), "hm-xulu");

const paths = telemetryPathsForWorker({
  profile: "hm-owner-openai-1",
  osUser: "hm-owner",
});
assert.equal(paths.profileDir, "/Users/hm-owner/HermesWorkspace/.hermes-gateway/profiles/hm-owner-openai-1");
assert.equal(paths.stateDbPath.endsWith("/state.db"), true);
assert.equal(paths.responseStoreDbPath.endsWith("/response_store.db"), true);

const root = fs.mkdtempSync(path.join(os.tmpdir(), "hm-macos-telemetry-repair-"));
try {
  const manifestPath = path.join(root, "data", "gateway-pool-manifest-mac.json");
  writeJson(manifestPath, {
    workers: [
      {
        profile: "hm-owner-openai-1",
        osUser: "hm-owner",
        port: 18751,
        allowedWorkspaceIds: ["owner"],
      },
      {
        profile: "hm-wuping-openai-1",
        launchdLabel: "com.hermesmobile.gateway.hm-wuping.openai.1",
        port: 18752,
        allowedWorkspaceIds: ["weixin_wuping"],
      },
    ],
  });
  const dryRun = repair({
    root,
    manifest: manifestPath,
    listenerUser: "",
    write: false,
    grantListenerRead: false,
  });
  assert.equal(dryRun.changed, true);
  assert.equal(dryRun.wrote, false);
  const stillRaw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(stillRaw.workers[0].telemetryStateDbPath, undefined);

  const written = repair({
    root,
    manifest: manifestPath,
    listenerUser: "",
    write: true,
    grantListenerRead: false,
  });
  assert.equal(written.changed, true);
  assert.equal(written.wrote, true);
  assert.ok(written.backup.includes("gateway-pool-manifest-mac.json"));
  const updated = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(updated.workers[0].telemetryStateDbPath, "/Users/hm-owner/HermesWorkspace/.hermes-gateway/profiles/hm-owner-openai-1/state.db");
  assert.equal(updated.workers[1].telemetryResponseStoreDbPath, "/Users/hm-wuping/HermesWorkspace/.hermes-gateway/profiles/hm-wuping-openai-1/response_store.db");
  assert.ok(written.warnings.includes("telemetry_state_db_missing:hm-owner-openai-1"));
  assert.equal(written.ok, true);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("macOS Gateway telemetry repair tests passed");
