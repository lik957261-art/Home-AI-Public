"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createPluginRequiredSkillPreloadService,
  normalizeSkillPath,
  skillProfilesForWorkspace,
} = require("../adapters/plugin-required-skill-preload-service");

function writeSkill(root, profileId, skillPath, content) {
  const file = path.join(root, "skill-profiles", profileId, "skills", ...skillPath.split("/"), "SKILL.md");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
  return file;
}

function writeSkillReference(root, profileId, skillPath, relativePath, content) {
  const file = path.join(root, "skill-profiles", profileId, "skills", ...skillPath.split("/"), relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
  return file;
}

function testNormalizeSkillPathRejectsUnsafePaths() {
  assert.equal(normalizeSkillPath(" productivity\\wardrobe-style-operations "), "productivity/wardrobe-style-operations");
  assert.equal(normalizeSkillPath("../wardrobe-style-operations"), "");
  assert.equal(normalizeSkillPath("C:/secret/skill"), "");
}

function testSkillProfilesForWorkspace() {
  assert.deepEqual(skillProfilesForWorkspace("owner"), ["owner-full", "shared-global"]);
  assert.deepEqual(skillProfilesForWorkspace("workspace_a"), ["workspace_a", "shared-global"]);
}

function testOwnerPreloadReadsOwnerFullProfile() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-skill-preload-"));
  try {
    writeSkill(root, "owner-full", "productivity/wardrobe-style-operations", "owner wardrobe skill");
    const service = createPluginRequiredSkillPreloadService({ dataDirs: [root] });
    const [item] = service.preloadRequiredSkills({
      workspaceId: "owner",
      skills: ["productivity/wardrobe-style-operations"],
    });

    assert.equal(item.path, "productivity/wardrobe-style-operations");
    assert.equal(item.profileId, "owner-full");
    assert.equal(item.content, "owner wardrobe skill");
    assert.equal(item.loadedChars, "owner wardrobe skill".length);
    assert.equal(item.totalChars, "owner wardrobe skill".length);
    assert.equal(item.truncated, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testPreloadIncludesBoundedReferenceMarkdown() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-skill-preload-"));
  try {
    writeSkill(root, "owner-full", "productivity/wardrobe-style-operations", "owner wardrobe skill");
    writeSkillReference(
      root,
      "owner-full",
      "productivity/wardrobe-style-operations",
      path.join("references", "wardrobe-rules.md"),
      "rule: check weather and write markdown",
    );
    writeSkillReference(
      root,
      "owner-full",
      "productivity/wardrobe-style-operations",
      path.join("references", "access-key.txt"),
      "secret must not preload",
    );
    const service = createPluginRequiredSkillPreloadService({ dataDirs: [root] });
    const [item] = service.preloadRequiredSkills({
      workspaceId: "owner",
      skills: ["productivity/wardrobe-style-operations"],
    });

    assert.match(item.content, /owner wardrobe skill/);
    assert.match(item.content, /BEGIN REQUIRED SKILL REFERENCE: references\/wardrobe-rules\.md/);
    assert.match(item.content, /rule: check weather and write markdown/);
    assert.doesNotMatch(item.content, /secret must not preload/);
    assert.equal(item.loadedChars, item.content.length);
    assert.equal(item.totalChars, item.content.length);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testWorkspacePreloadPrefersWorkspaceProfileThenShared() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-skill-preload-"));
  try {
    writeSkill(root, "shared-global", "productivity/wardrobe-style-operations", "shared wardrobe skill");
    writeSkill(root, "workspace_a", "productivity/wardrobe-style-operations", "workspace wardrobe skill");
    const service = createPluginRequiredSkillPreloadService({ dataDirs: [root] });

    const [workspaceItem] = service.preloadRequiredSkills({
      workspaceId: "workspace_a",
      skills: ["productivity/wardrobe-style-operations"],
    });
    assert.equal(workspaceItem.profileId, "workspace_a");
    assert.equal(workspaceItem.content, "workspace wardrobe skill");

    const [sharedItem] = service.preloadRequiredSkills({
      workspaceId: "workspace_b",
      skills: ["productivity/wardrobe-style-operations"],
    });
    assert.equal(sharedItem.profileId, "shared-global");
    assert.equal(sharedItem.content, "shared wardrobe skill");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testMissingRequiredSkillReturnsMissingMetadata() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-skill-preload-"));
  try {
    const service = createPluginRequiredSkillPreloadService({ dataDirs: [root] });
    const [item] = service.preloadRequiredSkills({
      workspaceId: "owner",
      skills: ["productivity/wardrobe-style-operations"],
    });

    assert.equal(item.path, "productivity/wardrobe-style-operations");
    assert.equal(item.id, "wardrobe-style-operations");
    assert.equal(item.namespace, "productivity");
    assert.equal(item.missing, true);
    assert.equal(item.error, "required_skill_not_found");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testInvalidSkillPathIsIgnored() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-skill-preload-"));
  try {
    const service = createPluginRequiredSkillPreloadService({ dataDirs: [root] });
    assert.deepEqual(service.preloadRequiredSkills({ skills: ["../bad"] }), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

testNormalizeSkillPathRejectsUnsafePaths();
testSkillProfilesForWorkspace();
testOwnerPreloadReadsOwnerFullProfile();
testPreloadIncludesBoundedReferenceMarkdown();
testWorkspacePreloadPrefersWorkspaceProfileThenShared();
testMissingRequiredSkillReturnsMissingMetadata();
testInvalidSkillPathIsIgnored();

console.log("plugin-required-skill-preload-service tests passed");
