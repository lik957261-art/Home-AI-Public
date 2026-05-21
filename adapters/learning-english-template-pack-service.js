"use strict";

const ENGLISH_TEMPLATE_PACK_VERSION = "english-template-pack-v1";
const DEFAULT_FINAL_PASSING_SCORE = 80;
const SPOKEN_REFLECTION_STEP = "learner_spoken_reflection";
const REWARD_SETTLEMENT_STEP = "reward_settlement";
const NEXT_TASK_FEEDBACK_STEP = "next_task_feedback";

function uniqueList(items = []) {
  const seen = new Set();
  const list = [];
  for (const item of Array.isArray(items) ? items : []) {
    const value = cleanString(item);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    list.push(value);
  }
  return list;
}

function canonicalInteractionStateMachine(steps = []) {
  const core = uniqueList(steps).filter((step) => ![
    "learner_reflects",
    SPOKEN_REFLECTION_STEP,
    REWARD_SETTLEMENT_STEP,
    NEXT_TASK_FEEDBACK_STEP,
  ].includes(step));
  return core.concat([SPOKEN_REFLECTION_STEP, REWARD_SETTLEMENT_STEP, NEXT_TASK_FEEDBACK_STEP]);
}

function finalPassingScore(template = {}) {
  const score = Number(template.finalPassingScore || template.final_passing_score || DEFAULT_FINAL_PASSING_SCORE);
  return Number.isFinite(score) ? Math.max(1, Math.min(100, Math.round(score))) : DEFAULT_FINAL_PASSING_SCORE;
}

function canonicalDeliverables(template = {}) {
  return uniqueList(template.deliverables)
    .filter((item) => !/^one-sentence reflection$/i.test(item))
    .concat(["spoken reflection", "final evaluation and reward settlement"]);
}

function canonicalAcceptance(template = {}) {
  return uniqueList(template.acceptance).concat([
    "final score follows the 80-point pass line",
    "spoken reflection is accepted before reward settlement",
  ]);
}

function canonicalEvidenceRequired(template = {}) {
  return uniqueList(template.evidenceRequired).concat([
    "spoken_reflection_summary",
    "reward_settlement_summary",
  ]);
}

function freezeTemplate(template) {
  return Object.freeze(Object.assign({}, template, {
    draftFeedback: template.draftFeedback !== false,
    finalPassingScore: finalPassingScore(template),
    requiresSpokenReflection: template.requiresSpokenReflection !== false,
    settlementAfterReflection: template.settlementAfterReflection !== false,
    skillIds: Object.freeze((template.skillIds || []).slice()),
    interactionStateMachine: Object.freeze(canonicalInteractionStateMachine(template.interactionStateMachine)),
    deliverables: Object.freeze(canonicalDeliverables(template)),
    acceptance: Object.freeze(canonicalAcceptance(template)),
    evidenceRequired: Object.freeze(canonicalEvidenceRequired(template)),
    rubricDimensions: Object.freeze((template.rubricDimensions || []).map((item) => Object.freeze(Object.assign({}, item)))),
    feedbackSchema: Object.freeze((template.feedbackSchema || []).slice()),
  }));
}

const ENGLISH_TEMPLATE_PACK = Object.freeze([
  freezeTemplate({
    id: "english-reading-comprehension-v1",
    skillId: "english_reading_comprehension",
    domain: "english",
    title: "Reading comprehension and explanation",
    activityType: "reading",
    taskCardType: "single_subject",
    interactionMode: "read_answer_explain_repair",
    outputContract: "learning_task_card_v1",
    skillPath: "skills/study-templates/english-reading-comprehension/SKILL.md",
    interactionStateMachine: ["receive_task", "ai_explains_goal", "learner_attempt", "ai_hint", "learner_revision", "ai_evaluation", "mistake_explanation", "learner_restates_reason", "variant_repair", "reward_settlement", "next_task_feedback"],
    learnerInstruction: "Read the assigned material or summary. Answer the comprehension task, revise after feedback, restate the reason for one mistake, and complete one variant repair.",
    deliverables: ["comprehension answer", "AI hint record", "revised answer", "mistake reason", "variant repair"],
    acceptance: ["answer addresses the reading goal", "revision responds to AI feedback", "mistake reason is restated", "variant repair is completed", "final evaluation is recorded"],
    evidenceRequired: ["answer_summary", "revision_summary", "mistake_reason_summary", "variant_summary", "evaluation_summary"],
    firstSubmissionKind: "reading_answer",
    revisionSubmissionKind: "reading_revision",
    rubricDimensions: [
      { id: "main_idea", label: "Main idea", weight: 25 },
      { id: "evidence", label: "Text evidence", weight: 25 },
      { id: "reasoning", label: "Reasoning and inference", weight: 25 },
      { id: "repair", label: "Revision and repair", weight: 25 },
    ],
  }),
  freezeTemplate({
    id: "english-listening-input-v1",
    skillId: "english_listening_input",
    domain: "english",
    title: "Listening key points and replay",
    activityType: "listening",
    taskCardType: "review_card",
    interactionMode: "listen_select_key_points_replay_repair",
    outputContract: "learning_task_card_v1",
    skillPath: "skills/study-templates/english-listening-input/SKILL.md",
    interactionStateMachine: ["receive_task", "ai_sets_listening_goal", "learner_listens", "learner_key_points", "ai_replays_gap", "learner_retries", "ai_evaluation", "next_task_feedback"],
    learnerInstruction: "Listen to the assigned short input. Write 3-5 English key points, identify the missed part after AI feedback, then retry that part.",
    deliverables: ["key-point notes", "gap feedback", "retry answer"],
    acceptance: ["3-5 key points are submitted", "missed part is retried", "evaluation is recorded"],
    evidenceRequired: ["key_points_summary", "gap_summary", "retry_summary", "evaluation_summary"],
    firstSubmissionKind: "listening_key_points",
    revisionSubmissionKind: "listening_retry",
    rubricDimensions: [
      { id: "key_points", label: "Key points", weight: 35 },
      { id: "detail_accuracy", label: "Detail accuracy", weight: 25 },
      { id: "gap_repair", label: "Gap repair", weight: 25 },
      { id: "clarity", label: "English clarity", weight: 15 },
    ],
  }),
  freezeTemplate({
    id: "english-speaking-retell-v1",
    skillId: "english_speaking_retell",
    domain: "english",
    title: "Oral retell and follow-up",
    activityType: "speaking",
    taskCardType: "single_subject",
    interactionMode: "listen_retell_hint_repair",
    outputContract: "learning_task_card_v1",
    skillPath: "skills/study-templates/english-speaking-retell/SKILL.md",
    interactionStateMachine: ["receive_task", "ai_explains_goal", "learner_retells", "ai_hint", "learner_retries_retell", "ai_evaluation", "mistake_explanation", "next_task_feedback"],
    learnerInstruction: "Retell the assigned material. Give the main idea, two details, and one ending sentence. Retry after AI hints.",
    deliverables: ["retell attempt", "AI hint record", "retry retell"],
    acceptance: ["main idea is present", "two details are included", "retry after hint is completed", "evaluation is recorded"],
    evidenceRequired: ["retell_summary", "hint_summary", "retry_summary", "evaluation_summary"],
    firstSubmissionKind: "speaking_retell",
    revisionSubmissionKind: "speaking_retry",
    rubricDimensions: [
      { id: "content_order", label: "Content order", weight: 30 },
      { id: "detail_support", label: "Detail support", weight: 25 },
      { id: "fluency", label: "Fluency", weight: 25 },
      { id: "repair", label: "Retry repair", weight: 20 },
    ],
  }),
  freezeTemplate({
    id: "english-shadowing-pronunciation-v1",
    skillId: "english_pronunciation_shadowing",
    domain: "english",
    title: "Shadowing and pronunciation repair",
    activityType: "pronunciation",
    taskCardType: "review_card",
    interactionMode: "shadow_record_compare_repair",
    outputContract: "learning_task_card_v1",
    skillPath: "skills/study-templates/english-shadowing-pronunciation/SKILL.md",
    interactionStateMachine: ["receive_task", "ai_models_pronunciation", "learner_shadows", "ai_marks_pronunciation_gap", "learner_repeats", "ai_evaluation", "next_task_feedback"],
    learnerInstruction: "Shadow the assigned sentence group. Repeat after AI marks pronunciation, rhythm, or stress gaps, then submit the repaired attempt.",
    deliverables: ["shadowing attempt", "pronunciation gap feedback", "repaired repeat"],
    acceptance: ["shadowing attempt is submitted", "pronunciation repair is completed", "evaluation is recorded"],
    evidenceRequired: ["shadowing_summary", "pronunciation_gap_summary", "repair_summary", "evaluation_summary"],
    firstSubmissionKind: "pronunciation_shadowing",
    revisionSubmissionKind: "pronunciation_repair",
    rubricDimensions: [
      { id: "pronunciation", label: "Pronunciation", weight: 35 },
      { id: "rhythm", label: "Rhythm and stress", weight: 25 },
      { id: "fluency", label: "Fluency", weight: 20 },
      { id: "repair", label: "Repair attempt", weight: 20 },
    ],
  }),
  freezeTemplate({
    id: "english-short-writing-v1",
    skillId: "english_short_writing",
    domain: "english",
    title: "Short writing with rewrite",
    activityType: "writing",
    taskCardType: "single_subject",
    interactionMode: "draft_feedback_rewrite_reflect",
    outputContract: "learning_task_card_v1",
    skillPath: "skills/study-templates/english-short-writing/SKILL.md",
    interactionStateMachine: ["receive_task", "ai_explains_goal", "learner_drafts", "ai_feedback", "learner_rewrites", "ai_evaluation", "learner_reflects", "reward_settlement", "next_task_feedback"],
    learnerInstruction: "Write a first draft of 6-8 English sentences. Include one clear opinion, one reason, one concrete example, and at least three active vocabulary words. Rewrite after AI feedback.",
    deliverables: ["first English draft", "AI feedback", "rewritten draft", "one-sentence reflection"],
    acceptance: ["first draft contains 6-8 English sentences", "draft includes opinion, reason, example, and three active vocabulary words", "rewrite responds to AI feedback", "final evaluation and reward settlement are recorded"],
    evidenceRequired: ["draft_summary", "feedback_report", "rewrite_summary", "reflection_summary", "evaluation_summary"],
    firstSubmissionKind: "writing_draft",
    revisionSubmissionKind: "writing_revision",
    draftFeedback: true,
    requiresMarkdownReport: true,
    rubricDimensions: [
      { id: "task_fit", label: "Task fit", weight: 25 },
      { id: "structure", label: "Structure", weight: 25 },
      { id: "language_accuracy", label: "Language accuracy", weight: 25 },
      { id: "rewrite_quality", label: "Rewrite quality", weight: 25 },
    ],
  }),
  freezeTemplate({
    id: "english-rewrite-improvement-v1",
    skillId: "english_rewrite_improvement",
    domain: "english",
    title: "Rewrite improvement",
    activityType: "rewriting",
    taskCardType: "mistake_repair_card",
    interactionMode: "compare_rewrite_explain_variant",
    outputContract: "learning_repair_card_v1",
    skillPath: "skills/study-templates/english-rewrite-improvement/SKILL.md",
    interactionStateMachine: ["receive_task", "ai_selects_rewrite_target", "learner_rewrites", "ai_compares_versions", "learner_explains_change", "variant_repair", "ai_evaluation", "next_task_feedback"],
    learnerInstruction: "Rewrite the target sentence or short paragraph. Explain what changed and why, then complete one variant repair.",
    deliverables: ["rewritten text", "change explanation", "variant repair"],
    acceptance: ["rewrite improves clarity or accuracy", "change explanation is submitted", "variant repair is completed", "evaluation is recorded"],
    evidenceRequired: ["rewrite_summary", "change_reason_summary", "variant_summary", "evaluation_summary"],
    firstSubmissionKind: "rewrite_improvement",
    revisionSubmissionKind: "rewrite_variant_repair",
    rubricDimensions: [
      { id: "clarity", label: "Clarity", weight: 30 },
      { id: "accuracy", label: "Accuracy", weight: 25 },
      { id: "explanation", label: "Change explanation", weight: 25 },
      { id: "variant_transfer", label: "Variant transfer", weight: 20 },
    ],
  }),
  freezeTemplate({
    id: "english-vocabulary-active-use-v1",
    skillId: "english_vocabulary_active_use",
    domain: "english",
    title: "Active vocabulary use",
    activityType: "vocabulary",
    taskCardType: "review_card",
    interactionMode: "use_words_context_sentence_repair",
    outputContract: "learning_task_card_v1",
    skillPath: "skills/study-templates/english-vocabulary-active-use/SKILL.md",
    interactionStateMachine: ["receive_task", "ai_sets_word_context", "learner_uses_words", "ai_feedback", "learner_repairs_sentence", "ai_evaluation", "next_task_feedback"],
    learnerInstruction: "Write 5 original English sentences using target vocabulary in school or daily-life contexts. Repair at least two sentences after feedback.",
    deliverables: ["original vocabulary sentences", "AI feedback", "repaired sentences"],
    acceptance: ["5 original sentences are submitted", "at least 2 sentences are repaired after feedback", "evaluation is recorded"],
    evidenceRequired: ["sentence_summary", "repair_summary", "evaluation_summary"],
    firstSubmissionKind: "vocabulary_sentences",
    revisionSubmissionKind: "vocabulary_repair",
    rubricDimensions: [
      { id: "word_meaning", label: "Word meaning", weight: 30 },
      { id: "context_fit", label: "Context fit", weight: 25 },
      { id: "sentence_accuracy", label: "Sentence accuracy", weight: 25 },
      { id: "repair", label: "Repair quality", weight: 20 },
    ],
  }),
  freezeTemplate({
    id: "english-grammar-expression-v1",
    skillId: "english_grammar_in_expression",
    domain: "english",
    title: "Grammar in expression repair",
    activityType: "grammar",
    taskCardType: "mistake_repair_card",
    interactionMode: "notice_repair_restate_variant",
    outputContract: "learning_repair_card_v1",
    skillPath: "skills/study-templates/english-grammar-expression/SKILL.md",
    interactionStateMachine: ["receive_task", "ai_spots_pattern", "learner_repairs_expression", "ai_explains_rule", "learner_variant_repair", "ai_evaluation", "next_task_feedback"],
    learnerInstruction: "Repair the target grammar pattern in short English expressions. Write 4 corrected sentences, explain the pattern in one simple sentence, then complete one variant repair.",
    deliverables: ["grammar repair answers", "rule explanation", "variant repair"],
    acceptance: ["4 corrected sentences are submitted", "pattern explanation is submitted", "variant repair is completed"],
    evidenceRequired: ["repair_summary", "rule_summary", "variant_summary", "evaluation_summary"],
    firstSubmissionKind: "grammar_repair",
    revisionSubmissionKind: "grammar_variant_repair",
    rubricDimensions: [
      { id: "pattern_accuracy", label: "Pattern accuracy", weight: 35 },
      { id: "explanation", label: "Rule explanation", weight: 25 },
      { id: "variant_transfer", label: "Variant transfer", weight: 25 },
      { id: "clarity", label: "Expression clarity", weight: 15 },
    ],
  }),
  freezeTemplate({
    id: "english-presentation-project-v1",
    skillId: "english_presentation",
    domain: "english",
    title: "Presentation outline and rehearsal",
    activityType: "presentation",
    taskCardType: "project_card",
    interactionMode: "outline_rehearse_present_reflect",
    outputContract: "learning_task_card_v1",
    skillPath: "skills/study-templates/english-presentation-project/SKILL.md",
    interactionStateMachine: ["receive_task", "ai_sets_project_goal", "learner_outlines", "ai_feedback", "learner_rehearses", "ai_evaluation", "learner_reflects", "reward_settlement", "next_task_feedback"],
    learnerInstruction: "Prepare a short English presentation outline with opening, two main points, and closing. Rehearse and improve it after AI feedback.",
    deliverables: ["presentation outline", "rehearsal attempt", "feedback-based repair"],
    acceptance: ["outline is submitted", "rehearsal is completed", "feedback repair is completed"],
    evidenceRequired: ["outline_summary", "rehearsal_summary", "repair_summary", "evaluation_summary"],
    firstSubmissionKind: "presentation_outline",
    revisionSubmissionKind: "presentation_repair",
    rubricDimensions: [
      { id: "organization", label: "Organization", weight: 30 },
      { id: "content", label: "Content", weight: 25 },
      { id: "spoken_delivery", label: "Spoken delivery", weight: 25 },
      { id: "reflection", label: "Reflection", weight: 20 },
    ],
  }),
  freezeTemplate({
    id: "english-weekly-challenge-v1",
    skillId: "english_weekly_challenge",
    domain: "english",
    title: "Weekly integrated English challenge",
    activityType: "weekly_challenge",
    taskCardType: "challenge_card",
    interactionMode: "integrate_read_write_speak_reflect",
    outputContract: "learning_task_card_v1",
    skillPath: "skills/study-templates/english-weekly-challenge/SKILL.md",
    interactionStateMachine: ["receive_task", "ai_reviews_week_signals", "learner_integrated_attempt", "ai_feedback", "learner_repair", "ai_evaluation", "learner_reflects", "reward_settlement", "next_task_feedback"],
    learnerInstruction: "Complete one integrated weekly challenge using this week's reading, vocabulary, and expression repairs. Submit a short answer, one improved sentence, and one reflection.",
    deliverables: ["integrated answer", "improved sentence", "one-sentence reflection"],
    acceptance: ["integrated answer uses this week's focus", "one sentence is improved", "reflection is submitted", "final evaluation is recorded"],
    evidenceRequired: ["weekly_signal_summary", "integrated_answer_summary", "repair_summary", "reflection_summary", "evaluation_summary"],
    firstSubmissionKind: "weekly_challenge_attempt",
    revisionSubmissionKind: "weekly_challenge_repair",
    rubricDimensions: [
      { id: "integration", label: "Integrated use", weight: 30 },
      { id: "accuracy", label: "Accuracy", weight: 25 },
      { id: "repair_transfer", label: "Repair transfer", weight: 25 },
      { id: "reflection", label: "Reflection", weight: 20 },
    ],
  }),
]);

const MISTAKE_REPAIR_TEMPLATE = freezeTemplate({
  id: "english-mistake-repair-v1",
  skillId: "english_mistake_repair",
  domain: "english",
  title: "English mistake repair",
  activityType: "mistake_repair",
  taskCardType: "mistake_repair_card",
  interactionMode: "explain_restate_variant_confirm",
  outputContract: "learning_repair_card_v1",
  skillPath: "skills/study-templates/english-mistake-repair/SKILL.md",
  skillIds: [
    "english_reading_comprehension",
    "english_speaking_retell",
    "english_short_writing",
    "english_vocabulary_active_use",
    "english_grammar_in_expression",
    "english_rewrite_improvement",
  ],
  interactionStateMachine: ["receive_task", "ai_explains_mistake", "learner_restates_reason", "variant_repair", "ai_evaluation", "next_task_feedback"],
  learnerInstruction: "Review one prior mistake, restate why it was wrong, then complete one variant repair.",
  deliverables: ["mistake reason", "variant repair", "AI confirmation"],
  acceptance: ["mistake reason is restated", "variant repair is completed", "evaluation is recorded"],
  evidenceRequired: ["mistake_reason_summary", "variant_summary", "evaluation_summary"],
  firstSubmissionKind: "mistake_reason",
  revisionSubmissionKind: "variant_repair",
  rubricDimensions: [
    { id: "reason", label: "Mistake reason", weight: 35 },
    { id: "repair", label: "Repair accuracy", weight: 35 },
    { id: "transfer", label: "Transfer", weight: 30 },
  ],
});

function cleanString(value) {
  return String(value ?? "").trim();
}

function cloneTemplate(template) {
  return JSON.parse(JSON.stringify(template));
}

function allTemplates() {
  return ENGLISH_TEMPLATE_PACK.concat([MISTAKE_REPAIR_TEMPLATE]);
}

function englishTemplateForSkill(skillId) {
  const id = cleanString(skillId);
  return allTemplates().find((template) => template.skillId === id || (template.skillIds || []).includes(id)) || null;
}

function englishTemplateForId(templateId) {
  const id = cleanString(templateId);
  return allTemplates().find((template) => template.id === id) || null;
}

function listEnglishTemplatePack(input = {}) {
  const includeSupport = input.includeSupport !== false;
  const list = includeSupport ? allTemplates() : ENGLISH_TEMPLATE_PACK;
  return list.map(cloneTemplate);
}

function englishTemplateRegistryEntries() {
  return allTemplates().map((template) => Object.freeze({
    id: template.id,
    domain: template.domain,
    title: template.title,
    skillIds: Object.freeze((template.skillIds && template.skillIds.length ? template.skillIds : [template.skillId]).slice()),
    activityType: template.activityType,
    taskCardType: template.taskCardType,
    interactionMode: template.interactionMode,
    outputContract: template.outputContract,
    skillPath: template.skillPath,
    draftFeedback: Boolean(template.draftFeedback),
    finalPassingScore: Number(template.finalPassingScore || DEFAULT_FINAL_PASSING_SCORE),
    requiresSpokenReflection: Boolean(template.requiresSpokenReflection),
    settlementAfterReflection: Boolean(template.settlementAfterReflection),
    interactionStateMachine: Object.freeze((template.interactionStateMachine || []).slice()),
    templatePackVersion: ENGLISH_TEMPLATE_PACK_VERSION,
  }));
}

function englishTaskModelContract(skillId) {
  const template = englishTemplateForSkill(skillId) || englishTemplateForSkill("english_reading_comprehension");
  return cloneTemplate(template);
}

function englishTemplatePackSummary() {
  return {
    version: ENGLISH_TEMPLATE_PACK_VERSION,
    templateCount: ENGLISH_TEMPLATE_PACK.length,
    skillIds: ENGLISH_TEMPLATE_PACK.map((template) => template.skillId),
    supportTemplateIds: [MISTAKE_REPAIR_TEMPLATE.id],
  };
}

module.exports = {
  DEFAULT_FINAL_PASSING_SCORE,
  ENGLISH_TEMPLATE_PACK,
  ENGLISH_TEMPLATE_PACK_VERSION,
  MISTAKE_REPAIR_TEMPLATE,
  englishTaskModelContract,
  englishTemplateForId,
  englishTemplateForSkill,
  englishTemplatePackSummary,
  englishTemplateRegistryEntries,
  listEnglishTemplatePack,
};
