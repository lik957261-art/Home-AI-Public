"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const {
  TEMPLATE_SKILL_REGISTRY,
  loadTemplateSkill,
  stripSkillFrontmatter,
  templateSkillInstruction,
  templateSkillPath,
} = require("../adapters/study-template-skill-service");

function testRegistryDefinesCurrentStudyTemplateSkills() {
  assert.deepEqual(Object.keys(TEMPLATE_SKILL_REGISTRY).sort(), [
    "general-assessment",
    "programming-assessment",
    "reading-analysis",
  ]);
  assert.equal(TEMPLATE_SKILL_REGISTRY["programming-assessment"].template, "programming");
}

function testSkillPathAndLoading() {
  const filePath = templateSkillPath("programming-assessment");
  assert.equal(path.basename(filePath), "SKILL.md");
  const loaded = loadTemplateSkill("programming-assessment");
  assert.equal(loaded.ok, true);
  assert.match(loaded.text, /Programming Assessment Template/);
  assert.match(loaded.text, /## Delivery Report Rules/);
  assert.doesNotMatch(loaded.text, /^---/);
}

function testInstructionFormattingAndFrontmatterStripping() {
  assert.equal(stripSkillFrontmatter("---\nname: demo\n---\n# Body\n").trim(), "# Body");
  const instruction = templateSkillInstruction("programming-assessment", { maxChars: 2000 });
  assert.match(instruction, /^Skill: study-templates\/programming-assessment/);
  assert.match(instruction, /错题清单/);
  assert.equal(templateSkillInstruction("missing-template"), "");
}

function run() {
  testRegistryDefinesCurrentStudyTemplateSkills();
  testSkillPathAndLoading();
  testInstructionFormattingAndFrontmatterStripping();
  console.log("study template skill service tests passed");
}

run();
