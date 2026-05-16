"use strict";

const ENGLISH_SKILL_TAXONOMY = Object.freeze([
  Object.freeze({
    id: "english_reading_comprehension",
    domain: "english",
    label: "English reading comprehension",
    taskTypes: ["single_subject", "review_card", "mistake_repair_card"],
    curriculumRefs: ["cefr-a2-b1-reading", "cambridge-primary-reading", "school-english-reading"],
  }),
  Object.freeze({
    id: "english_listening_input",
    domain: "english",
    label: "English listening input",
    taskTypes: ["single_subject", "review_card"],
    curriculumRefs: ["cefr-a2-listening", "cambridge-primary-listening"],
  }),
  Object.freeze({
    id: "english_speaking_retell",
    domain: "english",
    label: "English speaking retell",
    taskTypes: ["single_subject", "challenge_card", "mistake_repair_card"],
    curriculumRefs: ["cefr-a2-b1-speaking", "cambridge-primary-speaking"],
  }),
  Object.freeze({
    id: "english_pronunciation_shadowing",
    domain: "english",
    label: "Pronunciation and shadowing",
    taskTypes: ["single_subject", "review_card"],
    curriculumRefs: ["cefr-a2-pronunciation", "phonics-fluency-rhythm"],
  }),
  Object.freeze({
    id: "english_short_writing",
    domain: "english",
    label: "Short writing",
    taskTypes: ["single_subject", "project_card", "mistake_repair_card"],
    curriculumRefs: ["cefr-a2-b1-writing", "cambridge-primary-writing"],
  }),
  Object.freeze({
    id: "english_vocabulary_active_use",
    domain: "english",
    label: "Active vocabulary use",
    taskTypes: ["single_subject", "review_card", "mistake_repair_card"],
    curriculumRefs: ["cefr-a2-vocabulary", "school-english-core-words"],
  }),
  Object.freeze({
    id: "english_grammar_in_expression",
    domain: "english",
    label: "Grammar in expression",
    taskTypes: ["single_subject", "mistake_repair_card"],
    curriculumRefs: ["cefr-a2-b1-grammar", "school-grammar-usage"],
  }),
  Object.freeze({
    id: "english_presentation",
    domain: "english",
    label: "Presentation and project output",
    taskTypes: ["project_card", "cross_subject", "challenge_card"],
    curriculumRefs: ["cefr-b1-spoken-production", "project-based-learning-output"],
  }),
]);

const ALIASES = Object.freeze({
  reading: "english_reading_comprehension",
  read: "english_reading_comprehension",
  "english-reading": "english_reading_comprehension",
  listening: "english_listening_input",
  listen: "english_listening_input",
  oral: "english_speaking_retell",
  speaking: "english_speaking_retell",
  speech: "english_speaking_retell",
  retell: "english_speaking_retell",
  pronunciation: "english_pronunciation_shadowing",
  shadowing: "english_pronunciation_shadowing",
  writing: "english_short_writing",
  write: "english_short_writing",
  vocabulary: "english_vocabulary_active_use",
  vocab: "english_vocabulary_active_use",
  grammar: "english_grammar_in_expression",
  presentation: "english_presentation",
  project: "english_presentation",
  "\u9605\u8bfb": "english_reading_comprehension",
  "\u542c\u529b": "english_listening_input",
  "\u53e3\u8bed": "english_speaking_retell",
  "\u590d\u8ff0": "english_speaking_retell",
  "\u53d1\u97f3": "english_pronunciation_shadowing",
  "\u5199\u4f5c": "english_short_writing",
  "\u8bcd\u6c47": "english_vocabulary_active_use",
  "\u8bed\u6cd5": "english_grammar_in_expression",
  "\u6f14\u8bb2": "english_presentation",
  python: "python_foundation",
  coding: "python_foundation",
  programming: "python_foundation",
  amc8: "amc8_reasoning",
  math: "amc8_reasoning",
});

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeSkillId(value) {
  const text = cleanString(value);
  if (!text) return "";
  const key = text.toLowerCase().replace(/[\s_]+/g, "-");
  return ALIASES[key] || ALIASES[text] || text;
}

function uniqueStrings(values) {
  return [...new Set((values || []).map(cleanString).filter(Boolean))];
}

function normalizeDomain(value) {
  const text = cleanString(value).toLowerCase();
  if (/python|coding|program/.test(text)) return "programming";
  if (/amc8|math/.test(text)) return "math";
  return "english";
}

function createLearningSkillTaxonomyService() {
  const skillById = new Map(ENGLISH_SKILL_TAXONOMY.map((skill) => [skill.id, skill]));

  function listSkills(input = {}) {
    const domain = cleanString(input.domain);
    if (!domain) return ENGLISH_SKILL_TAXONOMY.slice();
    const normalized = normalizeDomain(domain);
    return ENGLISH_SKILL_TAXONOMY.filter((skill) => skill.domain === normalized);
  }

  function normalizeFocusAreas(values = [], options = {}) {
    const domain = normalizeDomain(options.domain || "english");
    const raw = Array.isArray(values) ? values : String(values || "").split(/[,\n;；、]+/);
    const ids = uniqueStrings(raw.map(normalizeSkillId));
    if (ids.length) return ids;
    if (domain === "english") {
      return [
        "english_reading_comprehension",
        "english_speaking_retell",
        "english_short_writing",
        "english_vocabulary_active_use",
      ];
    }
    return [];
  }

  function defaultCurriculumRefs(domain, focusAreas = []) {
    const normalized = normalizeDomain(domain || "english");
    const refs = [];
    if (normalized === "english") {
      refs.push("cefr-a2-b1-growth-track", "cambridge-primary-english-reference", "school-english-current-grade");
    }
    for (const id of normalizeFocusAreas(focusAreas, { domain: normalized })) {
      const skill = skillById.get(id);
      if (skill) refs.push(...skill.curriculumRefs);
    }
    return uniqueStrings(refs);
  }

  function skillSummary(ids = []) {
    const focus = normalizeFocusAreas(ids, { domain: "english" });
    return focus.map((id) => {
      const skill = skillById.get(id);
      return skill ? { id: skill.id, label: skill.label, domain: skill.domain } : { id, label: id, domain: "" };
    });
  }

  return {
    defaultCurriculumRefs,
    listSkills,
    normalizeDomain,
    normalizeFocusAreas,
    skillSummary,
  };
}

module.exports = {
  ENGLISH_SKILL_TAXONOMY,
  createLearningSkillTaxonomyService,
  normalizeSkillId,
};
