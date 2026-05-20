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
    assert.equal(template.draftFeedback, true);
    assert.equal(template.finalPassingScore, 80);
    assert.equal(template.requiresSpokenReflection, true);
    assert.equal(template.settlementAfterReflection, true);
    assert.ok(template.interactionStateMachine.includes("ai_evaluation"));
    assert.ok(template.interactionStateMachine.includes("learner_spoken_reflection"));
    assert.ok(template.interactionStateMachine.includes("reward_settlement"));
    assert.ok(template.interactionStateMachine.includes("next_task_feedback"));
    assert.ok(template.interactionStateMachine.indexOf("learner_spoken_reflection") < template.interactionStateMachine.indexOf("reward_settlement"));
    assert.ok(template.interactionStateMachine.indexOf("reward_settlement") < template.interactionStateMachine.indexOf("next_task_feedback"));
    assert.ok(template.deliverables.length >= 3);
    assert.ok(template.deliverables.includes("spoken reflection"));
    assert.ok(template.deliverables.includes("final evaluation and reward settlement"));
    assert.ok(template.acceptance.length >= 3);
    assert.ok(template.acceptance.includes("final score follows the 80-point pass line"));
    assert.ok(template.acceptance.includes("spoken reflection is accepted before reward settlement"));
    assert.ok(template.evidenceRequired.includes("spoken_reflection_summary"));
    assert.ok(template.evidenceRequired.includes("reward_settlement_summary"));
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
  assert.ok(entries.every((item) => item.draftFeedback === true));
  assert.ok(entries.every((item) => item.finalPassingScore === 80));
  assert.ok(entries.every((item) => item.requiresSpokenReflection === true));
  assert.ok(entries.every((item) => item.settlementAfterReflection === true));
  assert.ok(entries.every((item) => item.interactionStateMachine.includes("learner_spoken_reflection")));
}

function testTaskModelContractIsPrivacySafe() {
  const writing = englishTaskModelContract("english_short_writing");
  assert.equal(writing.id, "english-short-writing-v1");
  assert.equal(writing.draftFeedback, true);
  assert.equal(writing.requiresMarkdownReport, true);
  assert.ok(writing.evidenceRequired.includes("rewrite_summary"));
  assert.ok(writing.interactionStateMachine.includes("learner_spoken_reflection"));
  assert.equal(writing.interactionStateMachine.includes("learner_reflects"), false);
  assert.doesNotMatch(JSON.stringify(listEnglishTemplatePack()), /rawAnswer|fullTranscript|questionText|answerKey|apiKey|localPath/);
}

testEnglishTemplatePackCoversOperationalEnglishSkills();
testRegistryEntriesAreSkillBacked();
testTaskModelContractIsPrivacySafe();
console.log("learning english template pack service tests passed");
