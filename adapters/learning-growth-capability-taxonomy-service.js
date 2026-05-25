"use strict";

const TAXONOMY_VERSION = "20260525-evergreen-capability-v1";

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function node(input) {
  const skillId = cleanString(input.skillId);
  const parts = skillId.split(".");
  const domain = cleanString(input.domain || parts[0]);
  const strand = cleanString(input.strand || parts[1] || "");
  return Object.freeze(Object.assign({
    taxonomyVersion: TAXONOMY_VERSION,
    domain,
    strand,
    skillId,
    parentSkillId: cleanString(input.parentSkillId || (parts.length > 2 ? parts.slice(0, 2).join(".") : "")),
    nodeLevel: cleanString(input.nodeLevel || (parts.length > 3 ? "micro_skill" : "skill")),
    displayName: cleanString(input.displayName || skillId),
    summary: cleanString(input.summary || ""),
    evidenceSignals: asArray(input.evidenceSignals).map(cleanString).filter(Boolean),
    supportedStrategies: asArray(input.supportedStrategies).map(cleanString).filter(Boolean),
    supportedTemplates: asArray(input.supportedTemplates).map(cleanString).filter(Boolean),
    externalReferences: asArray(input.externalReferences),
  }, input));
}

const NODES = Object.freeze([
  node({
    skillId: "english.reading.evidence_based_answering",
    displayName: "Evidence-based reading answers",
    summary: "Uses text evidence to answer comprehension or analysis questions.",
    evidenceSignals: ["evaluation.dimensionScores.evidence", "evaluation.remainingWeaknesses"],
    supportedStrategies: ["repair", "stabilize", "transfer", "stretch", "review"],
    supportedTemplates: ["english-reading-comprehension-v1", "weekly-integrated-challenge-v1"],
    externalReferences: [{ framework: "CEFR", aspect: "reading" }, { framework: "Cambridge_AS_A_Level", subject: "English Language" }],
  }),
  node({
    skillId: "english.reading.inference",
    displayName: "Reading inference",
    summary: "Infers meaning, motive, or implication beyond literal recall.",
    evidenceSignals: ["evaluation.dimensionScores.inference", "evaluation.remainingWeaknesses"],
    supportedStrategies: ["repair", "stabilize", "transfer", "stretch"],
    supportedTemplates: ["english-reading-comprehension-v1", "weekly-integrated-challenge-v1"],
    externalReferences: [{ framework: "PISA", aspect: "integrate and interpret" }],
  }),
  node({
    skillId: "english.speaking.retell_structure",
    displayName: "Retell structure",
    summary: "Organizes a spoken retell with clear beginning, main events, and conclusion.",
    evidenceSignals: ["evaluation.dimensionScores.organization", "evaluation.dimensionScores.coherence", "reflection.selfCorrectionSummary"],
    supportedStrategies: ["repair", "stabilize", "transfer", "stretch", "review"],
    supportedTemplates: ["english-speaking-retell-v1", "weekly-integrated-challenge-v1"],
    externalReferences: [{ framework: "CEFR", aspect: "spoken production" }, { framework: "ACTFL", mode: "presentational" }],
  }),
  node({
    skillId: "english.speaking.transition_and_cohesion",
    displayName: "Spoken transitions and cohesion",
    summary: "Uses linking words and cohesive phrases to make spoken output easy to follow.",
    evidenceSignals: ["evaluation.dimensionScores.coherence", "evaluation.remainingWeaknesses"],
    supportedStrategies: ["repair", "stabilize", "transfer"],
    supportedTemplates: ["english-speaking-retell-v1", "english-presentation-project-v1"],
    externalReferences: [{ framework: "CEFR", aspect: "coherence" }],
  }),
  node({
    skillId: "english.writing.claim_reason_example",
    displayName: "Claim, reason, example writing",
    summary: "Builds a paragraph or short essay with a clear opinion, reason, and concrete example.",
    evidenceSignals: ["evaluation.dimensionScores.idea", "evaluation.dimensionScores.organization", "evaluation.revisionRequirements"],
    supportedStrategies: ["repair", "stabilize", "transfer", "stretch"],
    supportedTemplates: ["english-short-writing-v1", "english-rewrite-improvement-v1", "weekly-integrated-challenge-v1"],
    externalReferences: [{ framework: "Cambridge_AS_A_Level", subject: "English Language", aspect: "effective writing" }],
  }),
  node({
    skillId: "english.writing.sentence_control",
    displayName: "Sentence control",
    summary: "Controls grammar, punctuation, sentence variety, and clarity in written English.",
    evidenceSignals: ["evaluation.dimensionScores.languageControl", "evaluation.dimensionScores.grammar", "evaluation.remainingWeaknesses"],
    supportedStrategies: ["repair", "stabilize", "review"],
    supportedTemplates: ["english-short-writing-v1", "english-rewrite-improvement-v1"],
    externalReferences: [{ framework: "CEFR", aspect: "written production" }],
  }),
  node({
    skillId: "math.practice.quantitative_reasoning",
    displayName: "Quantitative reasoning",
    summary: "Chooses and explains mathematical relationships instead of only applying a memorized procedure.",
    evidenceSignals: ["evaluation.dimensionScores.reasoning", "evaluation.remainingWeaknesses"],
    supportedStrategies: ["repair", "stabilize", "transfer", "stretch"],
    supportedTemplates: ["math-practice-v1", "weekly-integrated-challenge-v1"],
    externalReferences: [{ framework: "PISA", aspect: "formulate and reason" }],
  }),
  node({
    skillId: "science.practices.explanation_from_evidence",
    displayName: "Scientific explanation from evidence",
    summary: "Connects observations or data to a scientific claim with a clear explanation.",
    evidenceSignals: ["evaluation.dimensionScores.evidence", "evaluation.dimensionScores.explanation"],
    supportedStrategies: ["repair", "stabilize", "transfer", "stretch"],
    supportedTemplates: ["science-explanation-v1", "weekly-integrated-challenge-v1"],
    externalReferences: [{ framework: "Cambridge_International", subject: "Science" }, { framework: "NGSS", practice: "constructing explanations" }],
  }),
  node({
    skillId: "computer_science.programming.testing_and_debugging",
    displayName: "Testing and debugging",
    summary: "Uses small tests, error messages, and reasoning to find and fix program defects.",
    evidenceSignals: ["evaluation.dimensionScores.debugging", "evaluation.remainingWeaknesses"],
    supportedStrategies: ["repair", "stabilize", "transfer"],
    supportedTemplates: ["programming-python-practice-v1", "computer-science-project-v1"],
    externalReferences: [{ framework: "CSTA", strand: "algorithms and programming" }, { framework: "AP_CS", aspect: "program development" }],
  }),
  node({
    skillId: "computer_science.computational_thinking.abstraction",
    displayName: "Computational abstraction",
    summary: "Identifies patterns and designs simpler representations or reusable steps.",
    evidenceSignals: ["evaluation.dimensionScores.abstraction", "evaluation.dimensionScores.design"],
    supportedStrategies: ["stabilize", "transfer", "stretch"],
    supportedTemplates: ["programming-python-practice-v1", "computer-science-project-v1"],
    externalReferences: [{ framework: "CSTA", strand: "computing systems and algorithms" }],
  }),
  node({
    skillId: "learning_habit.metacognition.error_awareness",
    displayName: "Error awareness",
    summary: "Can name what went wrong and choose a concrete next repair move.",
    evidenceSignals: ["reflection.errorAwareness", "reflection.selfCorrectionSummary"],
    supportedStrategies: ["repair", "reflect", "review"],
    supportedTemplates: ["all-growth-tasks"],
    externalReferences: [{ framework: "OECD", aspect: "metacognition" }],
  }),
]);

const NODE_BY_ID = new Map(NODES.map((item) => [item.skillId, item]));

const LEGACY_SKILL_ALIASES = Object.freeze({
  english_speaking_retell: "english.speaking.retell_structure",
  english_retell_structure: "english.speaking.retell_structure",
  english_transition_cohesion: "english.speaking.transition_and_cohesion",
  english_short_writing: "english.writing.claim_reason_example",
  english_writing: "english.writing.claim_reason_example",
  english_grammar_in_expression: "english.writing.sentence_control",
  english_sentence_control: "english.writing.sentence_control",
  reading_comprehension: "english.reading.evidence_based_answering",
  english_reading: "english.reading.evidence_based_answering",
  science_explanation: "science.practices.explanation_from_evidence",
  python_debugging: "computer_science.programming.testing_and_debugging",
  programming_debugging: "computer_science.programming.testing_and_debugging",
});

function normalizeSkillId(value) {
  const text = cleanString(value).replace(/-/g, "_");
  if (!text) return "";
  if (NODE_BY_ID.has(text)) return text;
  if (LEGACY_SKILL_ALIASES[text]) return LEGACY_SKILL_ALIASES[text];
  const dotted = text.replace(/_/g, ".");
  if (NODE_BY_ID.has(dotted)) return dotted;
  return "";
}

function createLearningGrowthCapabilityTaxonomyService() {
  function getNode(skillId) {
    const id = normalizeSkillId(skillId);
    return id ? NODE_BY_ID.get(id) || null : null;
  }

  function assertKnownSkill(skillId) {
    const found = getNode(skillId);
    if (!found) {
      const err = new Error(`Unknown learning growth capability skill: ${cleanString(skillId)}`);
      err.code = "unknown_capability_skill";
      throw err;
    }
    return found;
  }

  function listNodes(filters = {}) {
    const domain = cleanString(filters.domain);
    const strand = cleanString(filters.strand);
    return NODES.filter((item) => (
      (!domain || item.domain === domain)
      && (!strand || item.strand === strand)
    ));
  }

  function supportedTemplates(skillId) {
    return asArray(getNode(skillId)?.supportedTemplates);
  }

  return {
    TAXONOMY_VERSION,
    assertKnownSkill,
    getNode,
    listNodes,
    normalizeSkillId,
    supportedTemplates,
  };
}

module.exports = {
  TAXONOMY_VERSION,
  createLearningGrowthCapabilityTaxonomyService,
};
