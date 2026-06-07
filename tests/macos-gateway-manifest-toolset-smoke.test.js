"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const scriptText = fs.readFileSync(path.join(repoRoot, "scripts", "macos-gateway-manifest-toolset-smoke.js"), "utf8");
const testMatrix = fs.readFileSync(path.join(repoRoot, "docs", "TEST_MATRIX.md"), "utf8");
const gatewayPoolDoc = fs.readFileSync(path.join(repoRoot, "docs", "MODULES", "gateway-pool.md"), "utf8");

assert.match(scriptText, /gateway-pool-manifest-mac\.json/);
assert.match(scriptText, /manifest_missing_config_toolset/);
assert.match(scriptText, /required_candidate_missing_toolset/);
assert.doesNotMatch(scriptText, /apiKey|api_key|Authorization|Bearer/);

const {
  checkManifestToolsets,
  parseRequiredCandidate,
  parseTopLevelYamlList,
} = require("../scripts/macos-gateway-manifest-toolset-smoke");

function write(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, "utf8");
}

function writeJson(file, value) {
  write(file, `${JSON.stringify(value, null, 2)}\n`);
}

assert.deepEqual(parseTopLevelYamlList("toolsets:\n  - web\n  - wardrobe\nplatform_toolsets:\n  api_server: []", "toolsets"), ["web", "wardrobe"]);
assert.deepEqual(parseTopLevelYamlList("toolsets: [web, wardrobe, file]\n", "toolsets"), ["web", "wardrobe", "file"]);
assert.deepEqual(parseRequiredCandidate("owner:owner:openai-codex:user:wardrobe,file:min=2"), {
  workspaceId: "owner",
  skillWorkspaceId: "owner",
  provider: "openai-codex",
  securityLevel: "user",
  toolsets: ["wardrobe", "file"],
  minCandidates: 2,
  requireAll: true,
});

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-manifest-toolset-"));
try {
  const dataDir = path.join(tempRoot, "data");
  const profileDir = path.join(tempRoot, "gateway-worker", "telemetry", "profiles");
  const owner1Config = path.join(profileDir, "hm-owner-openai-1", "config.yaml");
  const owner2Config = path.join(profileDir, "hm-owner-openai-2", "config.yaml");
  write(owner1Config, [
    "model:",
    "  provider: openai-codex",
    "toolsets:",
    "  - web",
    "  - search",
    "  - wardrobe",
    "  - vision",
    "  - file",
    "  - skills",
    "  - weather",
    "platform_toolsets:",
    "  api_server:",
    "    - wardrobe",
  ].join("\n"));
  write(owner2Config, "toolsets: [web, search, wardrobe, vision, file, skills, weather]\n");
  writeJson(path.join(dataDir, "gateway-pool-manifest-mac.json"), {
    enabled: true,
    workers: [
      {
        profile: "hm-owner-openai-1",
        provider: "openai-codex",
        securityLevel: "user",
        allowedWorkspaceIds: ["owner"],
        skillWorkspaceIds: ["owner"],
        port: 18751,
        configPath: owner1Config,
        toolsets: ["web", "search", "vision", "file", "skills", "weather"],
      },
      {
        profile: "hm-owner-openai-2",
        provider: "openai-codex",
        securityLevel: "user",
        allowedWorkspaceIds: ["owner"],
        skillWorkspaceIds: ["owner"],
        port: 18752,
        configPath: owner2Config,
        toolsets: ["web", "search", "wardrobe", "vision", "file", "skills", "weather"],
      },
      {
        profile: "hm-wuping-openai-1",
        provider: "openai-codex",
        securityLevel: "user",
        allowedWorkspaceIds: ["weixin_wuping"],
        skillWorkspaceIds: ["weixin_wuping"],
        port: 18753,
        toolsets: ["web", "search", "wardrobe"],
      },
    ],
  });
  const stale = checkManifestToolsets({
    root: tempRoot,
    requiredCandidates: [{
      workspaceId: "owner",
      skillWorkspaceId: "owner",
      provider: "openai-codex",
      securityLevel: "user",
      toolsets: ["wardrobe", "vision", "file", "skills", "weather"],
      minCandidates: 2,
      requireAll: true,
    }],
  });
  assert.equal(stale.ok, false);
  assert.ok(stale.issues.includes("manifest_missing_config_toolset:hm-owner-openai-1:wardrobe"));
  assert.ok(stale.issues.includes("required_candidate_missing_toolset:hm-owner-openai-1:wardrobe"));
  assert.equal(stale.candidateChecks[0].candidateCount, 2);

  const manifestPath = path.join(dataDir, "gateway-pool-manifest-mac.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.workers[0].toolsets.push("wardrobe");
  writeJson(manifestPath, manifest);
  const fixed = checkManifestToolsets({
    root: tempRoot,
    requiredCandidates: [{
      workspaceId: "owner",
      skillWorkspaceId: "owner",
      provider: "openai-codex",
      securityLevel: "user",
      toolsets: ["wardrobe", "vision", "file", "skills", "weather"],
      minCandidates: 2,
      requireAll: true,
    }],
  });
  assert.equal(fixed.ok, true);
  assert.deepEqual(fixed.issues, []);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

assert.match(testMatrix, /macos-gateway-manifest-toolset-smoke/);
assert.match(gatewayPoolDoc, /manifest toolset projection/i);

console.log("macOS gateway manifest toolset smoke tests passed");
