"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { run } = require("../scripts/link-skill-profile-store");

function writeFile(filePath, text, mtime) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
  if (mtime) fs.utimesSync(filePath, mtime, mtime);
}

function real(filePath) {
  return fs.realpathSync(filePath);
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermes-skill-store-"));
}

function testLinksProfilesToSharedStore() {
  const root = makeTempDir();
  try {
    const shared = path.join(root, "shared", "owner-full", "skills");
    const backup = path.join(root, "backup");
    const profileA = path.join(root, "profiles", "owner-a", "skills");
    const profileB = path.join(root, "profiles", "owner-b", "skills");
    const oldTime = new Date("2026-01-01T00:00:00Z");
    const newTime = new Date("2026-01-02T00:00:00Z");

    writeFile(path.join(profileA, "productivity", "daily", "SKILL.md"), "old daily", oldTime);
    writeFile(path.join(profileA, ".usage.json"), "ignored", newTime);
    writeFile(path.join(profileB, "productivity", "wardrobe", "SKILL.md"), "wardrobe", oldTime);
    writeFile(path.join(profileB, "productivity", "daily", "SKILL.md"), "new daily", newTime);

    const result = run({ shared, profiles: [profileA, profileB], backup, apply: true });

    assert.equal(result.ok, true);
    assert.equal(result.applied, true);
    assert.equal(real(profileA), real(shared));
    assert.equal(real(profileB), real(shared));
    assert.equal(fs.readFileSync(path.join(shared, "productivity", "daily", "SKILL.md"), "utf8"), "new daily");
    assert.equal(fs.readFileSync(path.join(shared, "productivity", "wardrobe", "SKILL.md"), "utf8"), "wardrobe");
    assert.equal(fs.existsSync(path.join(shared, ".usage.json")), false);
    assert.equal(fs.existsSync(path.join(backup, "owner-a", "skills", "productivity", "daily", "SKILL.md")), true);
    assert.equal(fs.existsSync(path.join(backup, "owner-b", "skills", "productivity", "wardrobe", "SKILL.md")), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testDryRunDoesNotModifyProfiles() {
  const root = makeTempDir();
  try {
    const shared = path.join(root, "shared", "owner-full", "skills");
    const profile = path.join(root, "profiles", "owner", "skills");
    writeFile(path.join(profile, "custom", "SKILL.md"), "custom");

    const result = run({ shared, profiles: [profile], backup: path.join(root, "backup"), apply: false });

    assert.equal(result.applied, false);
    assert.equal(fs.existsSync(shared), false);
    assert.equal(fs.existsSync(path.join(profile, "custom", "SKILL.md")), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testRefusesNonSkillsPath() {
  const root = makeTempDir();
  try {
    assert.throws(
      () => run({ shared: path.join(root, "shared"), profiles: [path.join(root, "profile")], apply: true }),
      /non-skills path/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

testLinksProfilesToSharedStore();
testDryRunDoesNotModifyProfiles();
testRefusesNonSkillsPath();
console.log("link-skill-profile-store tests passed");
