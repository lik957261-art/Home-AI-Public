"use strict";

const assert = require("node:assert/strict");
const {
  TAXONOMY_VERSION,
  createLearningGrowthCapabilityTaxonomyService,
} = require("../adapters/learning-growth-capability-taxonomy-service");

function testListsInternationalCapabilityDomains() {
  const service = createLearningGrowthCapabilityTaxonomyService();
  const domains = new Set(service.listNodes().map((node) => node.domain));
  assert.equal(TAXONOMY_VERSION, "20260525-evergreen-capability-v2");
  assert.ok(domains.has("english"));
  assert.ok(domains.has("math"));
  assert.ok(domains.has("science"));
  assert.ok(domains.has("computer_science"));
  assert.ok(domains.has("learning_habit"));
}

function testNormalizesLegacyGrowthSkillIds() {
  const service = createLearningGrowthCapabilityTaxonomyService();
  assert.equal(service.normalizeSkillId("english_grammar_in_expression"), "english.writing.sentence_control");
  assert.equal(service.normalizeSkillId("python_debugging"), "computer_science.programming.testing_and_debugging");
  assert.equal(service.normalizeSkillId("english_reading_comprehension"), "english.reading.evidence_based_answering");
  assert.equal(service.normalizeSkillId("math_ratio_proportional_reasoning"), "math.number.ratio_proportional_reasoning");
  assert.equal(service.normalizeSkillId("math_number_theory"), "math.number.number_theory");
  assert.equal(service.normalizeSkillId("math_probability_counting"), "math.probability.counting");
  assert.equal(service.normalizeSkillId("math_multi_step_explanation"), "math.reasoning.multi_step_explanation");
  assert.equal(service.normalizeSkillId("python_foundation"), "computer_science.programming.python_foundation");
  assert.equal(service.getNode("english_short_writing").strand, "writing");
}

function testUnknownSkillsFailClosed() {
  const service = createLearningGrowthCapabilityTaxonomyService();
  assert.equal(service.normalizeSkillId("freeform-made-up-skill"), "");
  assert.throws(
    () => service.assertKnownSkill("freeform-made-up-skill"),
    /Unknown learning growth capability skill/,
  );
}

function testNodesCarryReferenceOnlyExternalFrameworks() {
  const service = createLearningGrowthCapabilityTaxonomyService();
  const node = service.assertKnownSkill("computer_science.programming.testing_and_debugging");
  assert.equal(node.taxonomyVersion, TAXONOMY_VERSION);
  assert.equal(node.domain, "computer_science");
  assert.equal(node.strand, "programming");
  assert.ok(node.externalReferences.some((ref) => ref.framework === "CSTA"));
  assert.ok(node.supportedTemplates.includes("programming-python-practice-v1"));
}

testListsInternationalCapabilityDomains();
testNormalizesLegacyGrowthSkillIds();
testUnknownSkillsFailClosed();
testNodesCarryReferenceOnlyExternalFrameworks();

console.log("learning growth capability taxonomy service tests passed");
