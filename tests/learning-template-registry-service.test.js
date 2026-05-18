"use strict";

const assert = require("node:assert/strict");
const {
  LEARNING_TEMPLATE_REGISTRY,
  createLearningTemplateRegistryService,
} = require("../adapters/learning-template-registry-service");

function testRegistryUsesEnglishTemplatePack() {
  const ids = LEARNING_TEMPLATE_REGISTRY.map((template) => template.id);
  assert.ok(ids.includes("english-short-writing-v1"));
  assert.ok(ids.includes("english-rewrite-improvement-v1"));
  assert.ok(ids.includes("english-weekly-challenge-v1"));
  assert.ok(ids.includes("english-mistake-repair-v1"));
  assert.ok(LEARNING_TEMPLATE_REGISTRY.every((template) => template.skillPath.includes("skills/study-templates/")));
  assert.ok(LEARNING_TEMPLATE_REGISTRY.every((template) => template.templatePackVersion === "english-template-pack-v1"));
}

function testSelectTemplatesForProgramHonorsFocusAreas() {
  const service = createLearningTemplateRegistryService();
  const templates = service.selectTemplatesForProgram({
    domain: "english",
    focusAreas: ["english_short_writing", "english_weekly_challenge"],
  });
  const ids = templates.map((template) => template.id);
  assert.ok(ids.includes("english-short-writing-v1"));
  assert.ok(ids.includes("english-weekly-challenge-v1"));
  assert.ok(ids.includes("english-mistake-repair-v1"));
  assert.equal(ids.includes("english-listening-input-v1"), false);
}

testRegistryUsesEnglishTemplatePack();
testSelectTemplatesForProgramHonorsFocusAreas();
console.log("learning template registry service tests passed");
