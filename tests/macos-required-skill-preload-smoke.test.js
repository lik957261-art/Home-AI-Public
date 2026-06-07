"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const scriptText = fs.readFileSync(path.join(repoRoot, "scripts", "macos-required-skill-preload-smoke.js"), "utf8");
assert.match(scriptText, /productivity\/wardrobe-style-operations/);
assert.match(scriptText, /required_skill_preload_contains_sensitive_source/);
assert.doesNotMatch(scriptText, /secretMarkerIncluded/);

const { buildRequiredSkillPreloadSmoke } = require("../scripts/macos-required-skill-preload-smoke");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "homeai-required-skill-"));
try {
  const skillDir = path.join(tempRoot, "data", "skill-profiles", "owner-full", "skills", "productivity", "wardrobe-style-operations");
  fs.mkdirSync(path.join(skillDir, "references"), { recursive: true });
  fs.mkdirSync(path.join(skillDir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), "This rule may mention password/token as forbidden concepts.\n", "utf8");
  fs.writeFileSync(path.join(skillDir, "references", "wardrobe.md"), "# Wardrobe\nNo secrets should be loaded.\n", "utf8");
  const result = buildRequiredSkillPreloadSmoke({
    root: tempRoot,
    listenerUser: "",
    checks: [{
      workspaceId: "owner",
      pluginId: "wardrobe",
      skill: "productivity/wardrobe-style-operations",
      requireReferences: true,
      requireScripts: true,
    }],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.checks[0].preload.sensitiveSourceIncluded, false);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("macOS required skill preload smoke tests passed");
