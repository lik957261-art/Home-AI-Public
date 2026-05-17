"use strict";

const LEARNING_TEMPLATE_REGISTRY = Object.freeze([
  Object.freeze({
    id: "english-reading-comprehension-v1",
    domain: "english",
    skillIds: ["english_reading_comprehension"],
    taskCardType: "single_subject",
    interactionMode: "read_answer_explain_repair",
    outputContract: "learning_task_card_v1",
    skillPath: "skills/learning/english-reading-comprehension-v1",
  }),
  Object.freeze({
    id: "english-listening-input-v1",
    domain: "english",
    skillIds: ["english_listening_input"],
    taskCardType: "review_card",
    interactionMode: "listen_select_key_points_replay_repair",
    outputContract: "learning_task_card_v1",
    skillPath: "skills/learning/english-listening-input-v1",
  }),
  Object.freeze({
    id: "english-speaking-retell-v1",
    domain: "english",
    skillIds: ["english_speaking_retell"],
    taskCardType: "challenge_card",
    interactionMode: "listen_retell_hint_repair",
    outputContract: "learning_task_card_v1",
    skillPath: "skills/learning/english-speaking-retell-v1",
  }),
  Object.freeze({
    id: "english-shadowing-pronunciation-v1",
    domain: "english",
    skillIds: ["english_pronunciation_shadowing"],
    taskCardType: "review_card",
    interactionMode: "shadow_record_compare_repair",
    outputContract: "learning_task_card_v1",
    skillPath: "skills/learning/english-shadowing-pronunciation-v1",
  }),
  Object.freeze({
    id: "english-short-writing-v1",
    domain: "english",
    skillIds: ["english_short_writing", "english_grammar_in_expression"],
    taskCardType: "single_subject",
    interactionMode: "draft_feedback_rewrite_reflect",
    outputContract: "learning_task_card_v1",
    skillPath: "skills/learning/english-short-writing-v1",
  }),
  Object.freeze({
    id: "english-vocabulary-active-use-v1",
    domain: "english",
    skillIds: ["english_vocabulary_active_use"],
    taskCardType: "review_card",
    interactionMode: "use_words_context_sentence_repair",
    outputContract: "learning_task_card_v1",
    skillPath: "skills/learning/english-vocabulary-active-use-v1",
  }),
  Object.freeze({
    id: "english-grammar-expression-v1",
    domain: "english",
    skillIds: ["english_grammar_in_expression"],
    taskCardType: "mistake_repair_card",
    interactionMode: "notice_repair_restate_variant",
    outputContract: "learning_repair_card_v1",
    skillPath: "skills/learning/english-grammar-expression-v1",
  }),
  Object.freeze({
    id: "english-presentation-project-v1",
    domain: "english",
    skillIds: ["english_presentation"],
    taskCardType: "project_card",
    interactionMode: "outline_rehearse_present_reflect",
    outputContract: "learning_task_card_v1",
    skillPath: "skills/learning/english-presentation-project-v1",
  }),
  Object.freeze({
    id: "english-mistake-repair-v1",
    domain: "english",
    skillIds: [
      "english_reading_comprehension",
      "english_speaking_retell",
      "english_short_writing",
      "english_vocabulary_active_use",
      "english_grammar_in_expression",
    ],
    taskCardType: "mistake_repair_card",
    interactionMode: "explain_restate_variant_confirm",
    outputContract: "learning_repair_card_v1",
    skillPath: "skills/learning/english-mistake-repair-v1",
  }),
]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function createLearningTemplateRegistryService() {
  function listTemplates(input = {}) {
    const domain = cleanString(input.domain);
    if (!domain) return LEARNING_TEMPLATE_REGISTRY.slice();
    return LEARNING_TEMPLATE_REGISTRY.filter((template) => template.domain === domain);
  }

  function selectTemplatesForProgram(program = {}) {
    const domain = cleanString(program.domain) || "english";
    const focus = new Set(Array.isArray(program.focusAreas) ? program.focusAreas : []);
    const templates = listTemplates({ domain }).filter((template) => {
      if (!focus.size) return true;
      return template.skillIds.some((id) => focus.has(id));
    });
    if (domain === "english" && !templates.some((template) => template.id === "english-mistake-repair-v1")) {
      templates.push(LEARNING_TEMPLATE_REGISTRY.find((template) => template.id === "english-mistake-repair-v1"));
    }
    return templates.filter(Boolean);
  }

  return {
    listTemplates,
    selectTemplatesForProgram,
  };
}

module.exports = {
  LEARNING_TEMPLATE_REGISTRY,
  createLearningTemplateRegistryService,
};
