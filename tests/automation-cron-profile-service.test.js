"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createAutomationCronProfileService,
  findMatchingWorker,
  safeProfileId,
} = require("../adapters/automation-cron-profile-service");

function writeManifest(filePath, manifest) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2));
}

function testResolverSelectsOwnerEmailProfile() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "automation-cron-profile-"));
  const manifestPath = path.join(tempRoot, "gateway-pool-manifest-mac.json");
  writeManifest(manifestPath, {
    workers: [
      {
        profile: "hm-owner-openai-1",
        enabled: true,
        provider: "openai-codex",
        securityLevel: "user",
        allowedWorkspaceIds: ["owner"],
        toolsets: ["email", "file", "skills", "cronjob_mobile"],
      },
      {
        profile: "hm-wuping-openai-1",
        enabled: true,
        provider: "openai-codex",
        securityLevel: "user",
        allowedWorkspaceIds: ["weixin_wuping"],
        toolsets: ["email", "file", "skills", "cronjob_mobile"],
      },
    ],
  });
  const service = createAutomationCronProfileService({ manifestPaths: [manifestPath] });
  assert.equal(service.resolveProfile({
    workspaceId: "owner",
    job: { enabled_toolsets: ["email", "file", "skills"] },
  }), "hm-owner-openai-1");
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function testPreferredProfileWinsWhenSafe() {
  const selected = findMatchingWorker([
    { profile: "hm-owner-openai-1", provider: "openai-codex", securityLevel: "user", allowedWorkspaceIds: ["owner"] },
  ], { workspaceId: "owner" });
  assert.equal(selected.profile, "hm-owner-openai-1");

  const service = createAutomationCronProfileService({ manifestPaths: [] });
  assert.equal(service.resolveProfile({ profile: "hm-owner-openai-2" }), "hm-owner-openai-2");
  assert.equal(service.resolveProfile({ profile: "../bad-profile" }), "");
  assert.equal(safeProfileId("hm-owner-openai-1"), "hm-owner-openai-1");
  assert.equal(safeProfileId("../bad-profile"), "");
}

function testProviderAndToolsetsMustMatch() {
  const workers = [
    {
      profile: "hm-owner-openai-1",
      provider: "openai-codex",
      securityLevel: "user",
      allowedWorkspaceIds: ["owner"],
      toolsets: ["file", "skills", "cronjob_mobile"],
    },
    {
      profile: "hm-owner-deepseek-1",
      provider: "deepseek",
      securityLevel: "user",
      allowedWorkspaceIds: ["owner"],
      toolsets: ["email", "file", "skills", "cronjob_mobile"],
    },
    {
      profile: "officialclean1",
      provider: "openai-codex",
      securityLevel: "owner-maintenance",
      allowedWorkspaceIds: ["owner"],
      toolsets: ["email", "file", "skills", "cronjob_mobile"],
    },
  ];
  assert.equal(findMatchingWorker(workers, {
    workspaceId: "owner",
    provider: "deepseek",
    enabledToolsets: ["email", "file"],
  }).profile, "hm-owner-deepseek-1");
  assert.equal(findMatchingWorker(workers, {
    workspaceId: "owner",
    provider: "openai-codex",
    enabledToolsets: ["email"],
  }), null);
}

function testMissingManifestReturnsEmptyProfile() {
  const service = createAutomationCronProfileService({
    manifestPaths: [path.join(os.tmpdir(), "missing-gateway-pool-manifest.json")],
  });
  assert.equal(service.resolveProfile({
    workspaceId: "owner",
    job: { enabledToolsets: ["email"] },
  }), "");
}

testResolverSelectsOwnerEmailProfile();
testPreferredProfileWinsWhenSafe();
testProviderAndToolsetsMustMatch();
testMissingManifestReturnsEmptyProfile();
console.log("automation cron profile service tests passed");
