"use strict";

const assert = require("node:assert/strict");
const { createLearningSkillTaxonomyService } = require("../adapters/learning-skill-taxonomy-service");

function testEnglishDefaultsUseGrade7LanguageLevelRefs() {
  const service = createLearningSkillTaxonomyService();
  const refs = service.defaultCurriculumRefs("english", [
    "english_reading_comprehension",
    "english_short_writing",
    "english_speaking_retell",
  ]);
  assert.ok(refs.includes("cefr-b1-grade7-english-growth"));
  assert.ok(refs.includes("language-level-5_5-6-growth-track"));
  assert.ok(refs.includes("school-english-grade7-current"));
  assert.ok(refs.includes("school-english-grade7-writing"));
  assert.equal(refs.some((ref) => /primary|grade4|grade5/i.test(ref)), false);
}

testEnglishDefaultsUseGrade7LanguageLevelRefs();

console.log("learning skill taxonomy service tests passed");
