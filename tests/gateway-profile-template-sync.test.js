"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { analyzeProfileTemplateSync } = require("../scripts/verify-gateway-profile-template-sync");

function writeConfig(root, profile, extra = {}) {
  const dir = path.join(root, profile);
  fs.mkdirSync(dir, { recursive: true });
  const toolsets = ["web", "file", ...(extra.toolsets || [])];
  const apiToolsets = ["web", "file", ...(extra.apiToolsets || extra.toolsets || [])];
  const mcpServers = extra.mcpServers || [];
  const plugins = extra.plugins || [];
  const mcpBlock = mcpServers.length
    ? `mcp_servers:\n${mcpServers.map((name) => `  ${name}:\n    command: python\n    enabled: true`).join("\n")}\n`
    : "";
  const pluginBlock = plugins.length
    ? `plugins:\n  enabled:\n${plugins.map((name) => `    - ${name}`).join("\n")}\n`
    : "plugins:\n  enabled: []\n";
  fs.writeFileSync(path.join(dir, "config.yaml"), [
    "model:",
    `  default: ${extra.modelDefault || "gpt-5.5"}`,
    `  provider: ${extra.provider || "openai-codex"}`,
    "toolsets:",
    ...toolsets.map((item) => `  - ${item}`),
    "platform_toolsets:",
    "  api_server:",
    ...apiToolsets.map((item) => `    - ${item}`),
    pluginBlock.trimEnd(),
    mcpBlock.trimEnd(),
    "",
  ].filter((line) => line !== "").join("\n"));
}

function ownerWorker(profile, overrides = {}) {
  return Object.assign({
    name: profile,
    profile,
    enabled: true,
    provider: "openai-codex",
    securityLevel: "user",
    allowedWorkspaceIds: ["owner"],
    skillWorkspaceIds: ["owner"],
  }, overrides);
}

function withFixture(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gateway-template-sync-"));
  try {
    return callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testSameTemplatePasses() {
  withFixture((root) => {
    writeConfig(root, "lowgw1", { toolsets: ["wardrobe", "finance"], mcpServers: ["wardrobe", "finance"], plugins: ["hermes-mobile-web"] });
    writeConfig(root, "lowgw2", { toolsets: ["wardrobe", "finance"], mcpServers: ["wardrobe", "finance"], plugins: ["hermes-mobile-web"] });
    const result = analyzeProfileTemplateSync({
      manifest: { workers: [ownerWorker("lowgw1"), ownerWorker("lowgw2")] },
      profilesRoot: root,
      requireConfig: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.checkedProfiles, 2);
    assert.equal(result.checkedGroups, 1);
  });
}

function testSameTemplateDriftFails() {
  withFixture((root) => {
    writeConfig(root, "lowgw1", { toolsets: ["wardrobe", "finance"], mcpServers: ["wardrobe", "finance"] });
    writeConfig(root, "lowgw2", { toolsets: ["wardrobe"], mcpServers: ["wardrobe"] });
    const result = analyzeProfileTemplateSync({
      manifest: { workers: [ownerWorker("lowgw1"), ownerWorker("lowgw2")] },
      profilesRoot: root,
      requireConfig: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.issues[0].code, "profile_template_drift");
    assert.equal(result.issues[0].templateKey, "owner|user|openai-codex");
    assert.deepEqual(result.issues[0].profiles.map((item) => item.profile), ["lowgw1", "lowgw2"]);
  });
}

function testDifferentWorkspaceOrTierDoesNotDrift() {
  withFixture((root) => {
    writeConfig(root, "lowgw1", { toolsets: ["wardrobe"], mcpServers: ["wardrobe"] });
    writeConfig(root, "lowgw8", { toolsets: ["finance"], mcpServers: ["finance"] });
    writeConfig(root, "officialclean1", { toolsets: ["terminal"], mcpServers: [] });
    const result = analyzeProfileTemplateSync({
      manifest: {
        workers: [
          ownerWorker("lowgw1"),
          ownerWorker("lowgw8", { allowedWorkspaceIds: ["weixin_wuping"], skillWorkspaceIds: ["weixin_wuping"] }),
          ownerWorker("officialclean1", { securityLevel: "owner-maintenance", allowMaintenance: true }),
        ],
      },
      profilesRoot: root,
      requireConfig: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.checkedProfiles, 3);
    assert.equal(result.checkedGroups, 3);
  });
}

testSameTemplatePasses();
testSameTemplateDriftFails();
testDifferentWorkspaceOrTierDoesNotDrift();

console.log("gateway profile template sync tests passed");
