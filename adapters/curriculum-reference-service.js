"use strict";

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

const DEFAULT_CURRICULUM_REFERENCES = Object.freeze([
  {
    referenceId: "cefr-a2-b1-english-growth",
    domain: "english",
    title: "CEFR A2-B1 English growth bridge",
    stage: "upper-primary-bridge",
    summary: "Reference track for balanced reading, listening, speaking, and short writing growth.",
    focusAreas: [
      "english_reading_comprehension",
      "english_listening_input",
      "english_speaking_retell",
      "english_short_writing",
      "english_vocabulary_active_use",
      "english_grammar_in_expression",
    ],
    tags: ["cefr", "english", "a2", "b1", "growth"],
  },
  {
    referenceId: "cambridge-young-learners-ket-bridge",
    domain: "english",
    title: "Cambridge young learners to KET style bridge",
    stage: "upper-primary-bridge",
    summary: "Reference style for public task formats, short reading passages, listening prompts, and speaking responses without copying proprietary questions.",
    focusAreas: [
      "english_reading_comprehension",
      "english_listening_input",
      "english_speaking_retell",
      "english_pronunciation_shadowing",
    ],
    tags: ["cambridge-style", "english", "speaking", "listening"],
  },
  {
    referenceId: "ccss-grade4-5-reading-writing",
    domain: "english",
    title: "Grade 4-5 reading and writing reference skills",
    stage: "grade4-5",
    summary: "Reference layer for main idea, evidence, retelling, grammar in expression, vocabulary use, and paragraph writing.",
    focusAreas: [
      "english_reading_comprehension",
      "english_short_writing",
      "english_vocabulary_active_use",
      "english_grammar_in_expression",
      "english_presentation",
    ],
    tags: ["reading", "writing", "evidence", "paragraph"],
  },
  {
    referenceId: "amc8-foundation-spiral",
    domain: "math",
    title: "AMC8 foundation spiral reference",
    stage: "middle-school-prep",
    summary: "Reference layer for arithmetic, ratios, counting, geometry, and word-problem reasoning in public contest style without copied problems.",
    focusAreas: ["math_reasoning", "math_word_problem", "math_geometry", "math_counting"],
    tags: ["amc8", "math", "contest-style"],
  },
  {
    referenceId: "python-beginner-project-assessment",
    domain: "programming",
    title: "Python beginner project and assessment reference",
    stage: "beginner",
    summary: "Reference layer for variables, branching, loops, functions, debugging, and small project explanation.",
    focusAreas: ["python_syntax", "python_control_flow", "python_debugging", "python_project_explanation"],
    tags: ["python", "programming", "project"],
  },
]);

function withDefaults(reference = {}) {
  return Object.assign({
    sourceType: "public_reference",
    copyrightPolicy: "reference_only_no_copied_questions",
  }, reference);
}

function focusMatchScore(reference, focusAreas) {
  const focus = new Set(asArray(focusAreas));
  if (!focus.size) return 1;
  let score = 0;
  for (const item of asArray(reference.focusAreas)) {
    if (focus.has(item)) score += 2;
  }
  return score;
}

function createCurriculumReferenceService(options = {}) {
  const repository = options.repository || null;
  let seeded = false;

  function ensureSeeded() {
    if (!repository || seeded) return;
    for (const reference of DEFAULT_CURRICULUM_REFERENCES) {
      repository.upsertCurriculumReference(withDefaults(reference));
    }
    seeded = true;
  }

  function listReferences(filters = {}) {
    ensureSeeded();
    const domain = cleanString(filters.domain);
    const refs = repository && typeof repository.listCurriculumReferences === "function"
      ? repository.listCurriculumReferences({ domain, limit: filters.limit || 100 })
      : DEFAULT_CURRICULUM_REFERENCES.map(withDefaults).filter((item) => !domain || item.domain === domain);
    return refs;
  }

  function selectReferences(input = {}) {
    const refs = listReferences({ domain: input.domain, limit: 100 })
      .map((reference) => Object.assign({}, reference, { score: focusMatchScore(reference, input.focusAreas) }))
      .sort((a, b) => b.score - a.score || String(a.referenceId).localeCompare(String(b.referenceId)));
    return refs.slice(0, Math.max(1, Math.min(10, Number(input.limit || 5) || 5)));
  }

  function referenceIds(input = {}) {
    return selectReferences(input).map((reference) => reference.referenceId).filter(Boolean);
  }

  return {
    defaultReferences: () => DEFAULT_CURRICULUM_REFERENCES.map(withDefaults),
    ensureSeeded,
    listReferences,
    referenceIds,
    selectReferences,
  };
}

module.exports = {
  DEFAULT_CURRICULUM_REFERENCES,
  createCurriculumReferenceService,
};
