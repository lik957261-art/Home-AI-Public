"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createGatewayProfileTemplateIdentityService,
} = require("../adapters/gateway-profile-template-identity-service");

function writeProfile(root, profile, sidecar = null) {
  const dir = path.join(root, profile);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.yaml"), [
    "model:",
    "  default: gpt-5.5",
    "  provider: openai-codex",
    "toolsets:",
    "  - web",
    "  - search",
    "platform_toolsets:",
    "  api_server:",
    "    - web",
    "    - search",
    "plugins:",
    "  enabled: []",
    "",
  ].join("\n"), "utf8");
  if (sidecar) {
    fs.writeFileSync(path.join(dir, "materialized-identity.json"), `${JSON.stringify(sidecar)}\n`, "utf8");
  }
}

function testManifestIdentityWhenNoSidecarExists() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-template-identity-"));
  writeProfile(root, "lowgw14");
  const service = createGatewayProfileTemplateIdentityService({ profilesRoot: root, toolSchemaEpoch: "epoch-1" });
  const identity = service.identityForWorker({
    profile: "lowgw14",
    provider: "openai-codex",
    securityLevel: "user",
    allowedWorkspaceIds: ["weixin_test_1"],
    skillWorkspaceIds: ["weixin_test_1"],
  });
  assert.equal(identity.templateKey, "weixin_test_1|user|openai-codex");
  assert.equal(identity.capabilityStatus, "ok");
  assert.equal(identity.toolSchemaEpoch, "epoch-1");
  assert.match(identity.capabilityHash, /^[a-f0-9]{16}$/);
}

function testMaterializedSidecarOverridesManifestWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-template-identity-"));
  writeProfile(root, "lowgw14", {
    profile: "lowgw14",
    workspaceId: "xuyan",
    permissionTier: "user",
    provider: "openai-codex",
  });
  const service = createGatewayProfileTemplateIdentityService({ profilesRoot: root });
  const identity = service.identityForWorker({
    profile: "lowgw14",
    provider: "openai-codex",
    securityLevel: "user",
    allowedWorkspaceIds: ["weixin_test_1"],
    skillWorkspaceIds: ["weixin_test_1"],
  });
  assert.equal(identity.templateKey, "xuyan|user|openai-codex");
  assert.equal(identity.capabilityStatus, "ok");
}

function testMaterializedSidecarCanOverrideProviderAndTier() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-template-identity-"));
  writeProfile(root, "deepseekgw5", {
    profile: "deepseekgw5",
    workspaceId: "owner",
    permissionTier: "owner-maintenance",
    provider: "deepseek",
  });
  const service = createGatewayProfileTemplateIdentityService({ profilesRoot: root });
  const identity = service.identityForWorker({
    profile: "deepseekgw5",
    provider: "openai-codex",
    securityLevel: "user",
    allowedWorkspaceIds: ["weixin_test_1"],
    skillWorkspaceIds: ["weixin_test_1"],
  });
  assert.equal(identity.templateKey, "owner|owner-maintenance|deepseek");
  assert.equal(identity.capabilityStatus, "ok");
}

testManifestIdentityWhenNoSidecarExists();
testMaterializedSidecarOverridesManifestWorkspace();
testMaterializedSidecarCanOverrideProviderAndTier();

console.log("gateway-profile-template-identity-service tests passed");
