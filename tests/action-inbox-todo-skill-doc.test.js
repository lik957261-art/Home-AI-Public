"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const skillPath = path.join(repoRoot, "skills", "productivity", "home-ai-todo-intake", "SKILL.md");
const skillText = fs.readFileSync(skillPath, "utf8");

assert.match(skillText, /name:\s*home-ai-todo-intake/);
assert.match(skillText, /model drafts only/i);
assert.match(skillText, /must not directly create, complete, delete, or schedule Todo records/i);
assert.match(skillText, /Do not use keyword-only guessing/i);
assert.match(skillText, /Home AI host services validate/i);

for (const field of [
  "title",
  "assigneeWorkspaceId",
  "creatorWorkspaceId",
  "dueAt",
  "remindAt",
  "priority",
  "recurrence",
  "needsConfirmation",
  "missingFields",
  "confidence",
  "sourceText",
]) {
  assert.match(skillText, new RegExp(`"${field}"`), `Skill output shape must include ${field}`);
}

assert.match(skillText, /recurrence\.kind="none"/);
assert.match(skillText, /host will route recurrence to Automation/);
assert.match(skillText, /needsConfirmation=true/);
assert.match(skillText, /Do not invent workspace ids/);
assert.match(skillText, /Do not include secrets, raw private content, long chat excerpts, push\s+endpoints, or database paths/);

console.log("action inbox todo skill doc tests passed");
