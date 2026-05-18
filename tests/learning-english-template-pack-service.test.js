"use strict";

const assert = require("node:assert/strict");
const {
  ENGLISH_TEMPLATE_PACK_VERSION,
  englishTaskModelContract,
  englishTemplateForSkill,
  englishTemplatePackSummary,
  englishTemplateRegistryEntries,
  listEnglishTemplatePack,
} = require("../adapters/learning-english-template-pack-service");

function testEnglishTemplatePackCoversOperationalEnglishSkills() {
  const summary = englishTemplatePackSummary();
  assert.equal(summary.version, ENGLISH_TEMPLATE_PACK_VERSION);
  assert.equal(summary.templateCount, 10);
  for (const skillId of [
    "english_reading_comprehension",
    "english_listening_input",
    "english_speaking_retell",
    "english_pronunciation_shadowing",
    "english_short_writing",
    "english_rewrite_improvement",
    "english_vocabulary_active_use",
    "english_grammar_in_expression",
    "english_presentation",
    "english_weekly_challenge",
  ]) {
    const template = englishTemplateForSkill(skillId);
    assert.ok(template, `missing template for ${skillId}`);
    assert.equal(template.skillId, skillId);
    assert.ok(template.skillPath.startsWith("skills/study-templates/"));
    assert.ok(template.interactionStateMachine.length >= 5);
    assert.ok(template.deliverables.length >= 3);
    assert.ok(template.acceptance.length >= 3);
    assert.ok(template.rubricDimensions.length >= 3);
  }
}

function testRegistryEntriesAreSkillBacked() {
  const entries = englishTemplateRegistryEntries();
  assert.ok(entries.some((item) => item.id === "english-weekly-challenge-v1"));
  assert.ok(entries.some((item) => item.id === "english-mistake-repair-v1"));
  assert.ok(entries.every((item) => item.templatePackVersion === ENGLISH_TEMPLATE_PACK_VERSION));
  assert.ok(entries.every((item) => item.skillPath.includes("skills/study-templates/")));
  assert.ok(entries.every((item) => Array.isArray(item.skillIds) && item.skillIds.length >= 1));
}

function testTaskModelContractIsPrivacySafe() {
  const writing = englishTaskModelContract("english_short_writing");
  assert.equal(writing.id, "english-short-writing-v1");
  assert.equal(writing.draftFeedback, true);
  assert.equal(writing.requiresMarkdownReport, true);
  assert.ok(writing.evidenceRequired.includes("rewrite_summary"));
  assert.doesNotMatch(JSON.stringify(listEnglishTemplatePack()), /rawAnswer|fullTranscript|questionText|answerKey|apiKey|localPath/);
}

testEnglishTemplatePackCoversOperationalEnglishSkills();
testRegistryEntriesAreSkillBacked();
testTaskModelContractIsPrivacySafe();
console.log("learning english template pack service tests passed");
