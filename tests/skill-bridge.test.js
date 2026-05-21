"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function runSkillBridge(root, skill, extraEnv = {}) {
  const result = spawnSync(process.env.PYTHON || "python3", [path.join(__dirname, "..", "skill_bridge.py")], {
    input: JSON.stringify({ skill }),
    encoding: "utf8",
    env: Object.assign({}, process.env, {
      HERMES_WEB_SKILLS_ROOT: root,
    }, extraEnv),
  });
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout.trim());
}

function writeSkill(root, skillPath, body = "# Demo\n") {
  const dir = path.join(root, ...skillPath.split("/"));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), body, "utf8");
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-mobile-skill-bridge-"));
try {
  writeSkill(tempRoot, "productivity/demo-skill");
  const bare = runSkillBridge(tempRoot, "demo-skill");
  assert.equal(bare.ok, true);
  assert.equal(bare.skill.id, "demo-skill");
  assert.equal(bare.skill.namespace, "productivity");
  assert.equal(bare.skill.path, "productivity/demo-skill");

  const full = runSkillBridge(tempRoot, "productivity/demo-skill");
  assert.equal(full.ok, true);
  assert.equal(full.skill.path, "productivity/demo-skill");

  const sharedAbsolute = runSkillBridge(tempRoot, "/mnt/c/ProgramData/HermesMobile/data/skill-profiles/owner-full/skills/productivity/demo-skill/SKILL.md");
  assert.equal(sharedAbsolute.ok, true);
  assert.equal(sharedAbsolute.skill.path, "productivity/demo-skill");

  const sharedMissingSlash = runSkillBridge(tempRoot, "mnt/c/ProgramData/HermesMobile/data/skill-profiles/owner-full/skills/productivity/demo-skill");
  assert.equal(sharedMissingSlash.ok, true);
  assert.equal(sharedMissingSlash.skill.path, "productivity/demo-skill");

  writeSkill(tempRoot, "productivity/utf8-skill", "# Espanol\n\nnino: niño\n");
  const utf8Skill = runSkillBridge(tempRoot, "utf8-skill", { PYTHONIOENCODING: "gbk" });
  assert.equal(utf8Skill.ok, true);
  assert.equal(utf8Skill.skill.path, "productivity/utf8-skill");
  assert.ok(utf8Skill.skill.content.includes("niño"));

  writeSkill(tempRoot, ".archive/old/demo-skill");
  const archiveIgnored = runSkillBridge(tempRoot, "demo-skill");
  assert.equal(archiveIgnored.ok, true);
  assert.equal(archiveIgnored.skill.path, "productivity/demo-skill");

  writeSkill(tempRoot, ".archive/old/archived-only");
  const archivedOnly = runSkillBridge(tempRoot, "archived-only");
  assert.equal(archivedOnly.ok, false);
  assert.equal(archivedOnly.skill, "archived-only");

  writeSkill(tempRoot, "writing/demo-skill");
  const ambiguous = runSkillBridge(tempRoot, "demo-skill");
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.status, 409);
  assert.equal(ambiguous.error, "Skill path is ambiguous");
  assert.deepEqual(ambiguous.matches, ["productivity/demo-skill", "writing/demo-skill"]);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("skill-bridge tests passed");
