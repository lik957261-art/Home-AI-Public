"use strict";

const {
  DEFAULT_MAX_CARD_COINS,
  DEFAULT_MIN_CARD_COINS,
} = require("./learning-card-reward-policy-service");
const {
  ENGLISH_TEMPLATE_PACK_VERSION,
  englishTaskModelContract,
  englishTemplateForSkill,
} = require("./learning-english-template-pack-service");
const {
  growthNextActionForTaskModel,
} = require("./learning-growth-task-interaction-state-service");

const TASK_MODEL_VERSION = "learning-task-model-v1";
const DEFAULT_FINAL_PASSING_SCORE = 80;

const TASK_CARD_TYPES = new Set([
  "single_subject",
  "cross_subject",
  "project_card",
  "mistake_repair_card",
  "challenge_card",
  "review_card",
  "practice_card",
]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return String(value).split(/[,\n;]+/);
}

function cleanList(value, limit = 12) {
  return asArray(value).map(cleanString).filter(Boolean).slice(0, limit);
}

function isLearningGrowthCard(input = {}) {
  return cleanString(input.kanbanCaseTemplate || input.kanban_case_template || input.caseTemplate || input.case_template).toLowerCase() === "learning-growth"
    || Boolean(cleanString(input.learningProgramId || input.learning_program_id || input.learningDraftId || input.learning_draft_id));
}

function isGenericStudyPlanItem(value) {
  const text = cleanString(value).toLowerCase();
  if (!text) return false;
  return text === "study output"
    || text === "ai feedback"
    || text === "targeted quiz"
    || text === "next study guidance"
    || text === "\u5b66\u4e60\u6210\u679c\u63d0\u4ea4"
    || text === "\u63d0\u4ea4\u5b66\u4e60\u6210\u679c"
    || text === "\u4eba\u5de5\u667a\u80fd\u53cd\u9988"
    || text === "\u9488\u5bf9\u6027\u6d4b\u9a8c"
    || text === "\u4e0b\u4e00\u6b65\u5b66\u4e60\u6307\u5bfc";
}

function learningGrowthSpecificList(value, owner = {}) {
  const items = cleanList(value, 12);
  if (!items.length) return undefined;
  if (isLearningGrowthCard(owner) && items.every(isGenericStudyPlanItem)) return undefined;
  return items;
}

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeTaskCardType(value, fallback = "single_subject") {
  const text = cleanString(value).toLowerCase();
  return TASK_CARD_TYPES.has(text) ? text : fallback;
}

const SKILL_ID_ALIASES = Object.freeze({
  reading: "english_reading_comprehension",
  english_reading: "english_reading_comprehension",
  english_reading_task: "english_reading_comprehension",
  comprehension: "english_reading_comprehension",
  listening: "english_listening_input",
  english_listening: "english_listening_input",
  speaking: "english_speaking_retell",
  oral: "english_speaking_retell",
  retell: "english_speaking_retell",
  english_speaking: "english_speaking_retell",
  pronunciation: "english_pronunciation_shadowing",
  english_pronunciation: "english_pronunciation_shadowing",
  english_pronunciation_accuracy: "english_pronunciation_shadowing",
  shadowing: "english_pronunciation_shadowing",
  writing: "english_short_writing",
  english_writing: "english_short_writing",
  writing_draft: "english_short_writing",
  writing_revision: "english_short_writing",
  rewrite: "english_rewrite_improvement",
  rewriting: "english_rewrite_improvement",
  revision: "english_rewrite_improvement",
  english_rewrite: "english_rewrite_improvement",
  english_rewriting: "english_rewrite_improvement",
  vocabulary: "english_vocabulary_active_use",
  english_vocabulary: "english_vocabulary_active_use",
  grammar: "english_grammar_in_expression",
  english_grammar: "english_grammar_in_expression",
  presentation: "english_presentation",
  english_presentation_project: "english_presentation",
  challenge: "english_weekly_challenge",
  weekly: "english_weekly_challenge",
  weekly_challenge: "english_weekly_challenge",
  english_weekly: "english_weekly_challenge",
});

function normalizeSkillId(value) {
  const raw = cleanString(value);
  if (!raw) return "";
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return SKILL_ID_ALIASES[normalized] || normalized;
}

function primarySkillId(input = {}) {
  const skills = cleanList(input.skillIds || input.skill_ids, 4);
  return normalizeSkillId(input.skillId || input.skill_id || skills[0] || "english_reading_comprehension")
    || "english_reading_comprehension";
}

const SKILL_MODELS = {
  english_reading_comprehension: {
    title: "Reading comprehension and explanation",
    activityType: "reading",
    taskCardType: "single_subject",
    interactionStateMachine: ["receive_task", "ai_explains_goal", "learner_attempt", "ai_hint", "learner_revision", "ai_evaluation", "mistake_explanation", "learner_restates_reason", "variant_repair", "reward_settlement", "next_task_feedback"],
    learnerInstruction: "Complete the assigned English comprehension task inside the Growth task flow. Answer, revise after hints, and finish the repair step.",
    deliverables: ["learner answer", "AI hint", "revision", "repair step"],
    acceptance: ["answer submitted", "AI feedback generated", "revision completed", "evaluation recorded"],
    evidenceRequired: ["answer_summary", "revision_summary", "evaluation_summary"],
    firstSubmissionKind: "reading_answer",
    revisionSubmissionKind: "reading_revision",
  },
  english_listening_input: {
    title: "Listening key points and replay",
    activityType: "listening",
    taskCardType: "review_card",
    interactionStateMachine: ["receive_task", "ai_sets_listening_goal", "learner_listens", "learner_key_points", "ai_replays_gap", "learner_retries", "ai_evaluation", "next_task_feedback"],
    learnerInstruction: "Listen to the assigned short input inside the Growth task flow. Write 3-5 key points in English, then retry the missed part after AI replay guidance.",
    deliverables: ["key-point notes", "gap replay feedback", "retry answer"],
    acceptance: ["key points submitted", "missed part retried", "evaluation recorded"],
    evidenceRequired: ["key_points_summary", "retry_summary", "evaluation_summary"],
    firstSubmissionKind: "listening_key_points",
    revisionSubmissionKind: "listening_retry",
  },
  english_speaking_retell: {
    title: "Oral retell and follow-up",
    activityType: "speaking",
    taskCardType: "single_subject",
    interactionStateMachine: ["receive_task", "ai_explains_goal", "learner_retells", "ai_hint", "learner_retries_retell", "ai_evaluation", "mistake_explanation", "next_task_feedback"],
    learnerInstruction: "Retell the assigned short material inside the Growth task flow. First give the main idea, then two details, then retry after AI hints.",
    deliverables: ["retell attempt", "AI hint record", "retry retell"],
    acceptance: ["retell attempt submitted", "retry after hint completed", "evaluation recorded"],
    evidenceRequired: ["retell_summary", "retry_summary", "evaluation_summary"],
    firstSubmissionKind: "speaking_retell",
    revisionSubmissionKind: "speaking_retry",
  },
  english_pronunciation_shadowing: {
    title: "Shadowing and pronunciation repair",
    activityType: "pronunciation",
    taskCardType: "review_card",
    interactionStateMachine: ["receive_task", "ai_models_pronunciation", "learner_shadows", "ai_marks_pronunciation_gap", "learner_repeats", "ai_evaluation", "next_task_feedback"],
    learnerInstruction: "Shadow the assigned sentence group inside the Growth task flow. Repeat after AI marks pronunciation gaps, then submit the repaired attempt.",
    deliverables: ["shadowing attempt", "pronunciation gap feedback", "repaired repeat"],
    acceptance: ["shadowing attempt submitted", "pronunciation repair completed", "evaluation recorded"],
    evidenceRequired: ["shadowing_summary", "repair_summary", "evaluation_summary"],
    firstSubmissionKind: "pronunciation_shadowing",
    revisionSubmissionKind: "pronunciation_repair",
  },
  english_short_writing: {
    title: "Short writing with rewrite",
    activityType: "writing",
    taskCardType: "single_subject",
    interactionStateMachine: ["receive_task", "ai_explains_goal", "learner_drafts", "ai_feedback", "learner_rewrites", "ai_evaluation", "learner_reflects", "reward_settlement", "next_task_feedback"],
    learnerInstruction: "Write a first draft of 6-8 English sentences. Topic: one real school or daily-life moment from this week. Requirements: include one clear opinion, one reason, one concrete example, and at least three active vocabulary words. Submit the first draft in the Growth task flow, then rewrite it after AI feedback. Do not submit only a completion note; the answer must be the actual English draft.",
    deliverables: ["first English draft", "AI feedback", "rewritten draft", "one-sentence reflection"],
    acceptance: ["first draft contains 6-8 English sentences", "draft includes opinion, reason, example, and three active vocabulary words", "rewrite responds to AI feedback", "final evaluation and reward settlement are recorded"],
    evidenceRequired: ["draft_summary", "feedback_report", "rewrite_summary", "reflection_summary", "evaluation_summary"],
    firstSubmissionKind: "writing_draft",
    revisionSubmissionKind: "writing_revision",
    draftFeedback: true,
  },
  english_vocabulary_active_use: {
    title: "Active vocabulary use",
    activityType: "vocabulary",
    taskCardType: "review_card",
    interactionStateMachine: ["receive_task", "ai_sets_word_context", "learner_uses_words", "ai_feedback", "learner_repairs_sentence", "ai_evaluation", "next_task_feedback"],
    learnerInstruction: "Write 5 original English sentences using the target vocabulary in a school or daily-life context. Each sentence should be specific enough for AI feedback and later correction. After feedback, repair at least two sentences.",
    deliverables: ["original vocabulary sentences", "AI feedback", "repaired sentences"],
    acceptance: ["5 original sentences submitted", "at least 2 sentences repaired after feedback", "evaluation recorded"],
    evidenceRequired: ["sentence_summary", "repair_summary", "evaluation_summary"],
    firstSubmissionKind: "vocabulary_sentences",
    revisionSubmissionKind: "vocabulary_repair",
  },
  english_grammar_in_expression: {
    title: "Grammar in expression repair",
    activityType: "grammar",
    taskCardType: "mistake_repair_card",
    interactionStateMachine: ["receive_task", "ai_spots_pattern", "learner_repairs_expression", "ai_explains_rule", "learner_variant_repair", "ai_evaluation", "next_task_feedback"],
    learnerInstruction: "Repair the target grammar pattern in short English expressions. Write 4 corrected sentences, explain the pattern in one simple sentence, then complete one variant repair.",
    deliverables: ["grammar repair answers", "rule explanation", "variant repair"],
    acceptance: ["4 corrected sentences submitted", "pattern explanation submitted", "variant repair completed"],
    evidenceRequired: ["repair_summary", "rule_summary", "variant_summary", "evaluation_summary"],
    firstSubmissionKind: "grammar_repair",
    revisionSubmissionKind: "grammar_variant_repair",
  },
  english_presentation: {
    title: "Presentation outline and rehearsal",
    activityType: "presentation",
    taskCardType: "project_card",
    interactionStateMachine: ["receive_task", "ai_sets_project_goal", "learner_outlines", "ai_feedback", "learner_rehearses", "ai_evaluation", "learner_reflects", "reward_settlement", "next_task_feedback"],
    learnerInstruction: "Prepare a short English presentation outline with opening, two main points, and closing. Rehearse it inside the Growth task flow and improve after AI feedback.",
    deliverables: ["presentation outline", "rehearsal attempt", "feedback-based repair"],
    acceptance: ["outline submitted", "rehearsal completed", "feedback repair completed"],
    evidenceRequired: ["outline_summary", "rehearsal_summary", "repair_summary", "evaluation_summary"],
    firstSubmissionKind: "presentation_outline",
    revisionSubmissionKind: "presentation_repair",
  },
};

function isKnownEnglishSkillId(value) {
  const id = cleanString(value);
  return Boolean(SKILL_MODELS[id] || englishTemplateForSkill(id));
}

function taskTypeOverride(skillId, dayIndex, fallback) {
  if (skillId === "english_speaking_retell" && dayIndex % 3 === 2) return "challenge_card";
  if (skillId === "english_short_writing" && dayIndex % 2 === 1) return "project_card";
  return fallback;
}

function stepRole(step) {
  if (/^receive_task$/.test(step)) return "receive";
  if (/^ai_/.test(step) || step.includes("feedback") || step.includes("hint") || step.includes("explain")) return "ai_guidance";
  if (step.includes("evaluation")) return "evaluation";
  if (step.includes("reward")) return "reward";
  if (step.includes("next_task")) return "handoff";
  return "learner_action";
}

function interactionPhases(steps) {
  return cleanList(steps, 20).map((step, index) => ({
    index,
    step,
    role: stepRole(step),
    requiredEvidence: stepRole(step) === "learner_action",
  }));
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.round(parsed));
}

function normalizeRewardPolicy(input = {}) {
  const raw = input.rewardPolicy || input.reward_policy || {};
  const minCoins = positiveInt(input.minCoins ?? input.min_coins ?? raw.minCoins ?? raw.min_coins, DEFAULT_MIN_CARD_COINS);
  const maxCoins = Math.max(minCoins, positiveInt(input.maxCoins ?? input.max_coins ?? raw.maxCoins ?? raw.max_coins, DEFAULT_MAX_CARD_COINS));
  const basis = cleanString(input.rewardBasis || input.reward_basis || raw.basis || raw.rewardBasis)
    || "verified_pass_score_timeliness_interaction";
  const summary = cleanString(input.rewardSummary || input.reward_summary || raw.summary || raw.ruleSummary)
    || `Verified pass earns ${minCoins}-${maxCoins} coins; score, timeliness, and interaction evidence can raise the award.`;
  return {
    eligibleAfterVerifiedPass: raw.eligibleAfterVerifiedPass !== undefined ? Boolean(raw.eligibleAfterVerifiedPass) : true,
    serviceOwned: raw.serviceOwned !== undefined ? Boolean(raw.serviceOwned) : true,
    minCoins,
    maxCoins,
    basis,
    summary,
  };
}

function buildLearningTaskModel(input = {}) {
  const skillId = primarySkillId(input);
  const base = englishTaskModelContract(skillId) || SKILL_MODELS[skillId] || SKILL_MODELS.english_reading_comprehension;
  const minutes = clampInt(input.plannedMinutes || input.minutes, 5, 120, 15);
  const dayIndex = Math.max(0, Number(input.dayIndex || input.day_index || 0) || 0);
  const taskCardType = normalizeTaskCardType(
    input.taskCardType || input.task_card_type || taskTypeOverride(skillId, dayIndex, base.taskCardType),
    normalizeTaskCardType(base.taskCardType),
  );
  const interactionStateMachine = cleanList(input.interactionStateMachine || input.interaction_state_machine || base.interactionStateMachine, 20);
  const learnerInstruction = cleanString(input.learnerInstruction || input.learner_instruction || input.instruction || base.learnerInstruction);
  const finalPassingScore = clampInt(input.finalPassingScore || input.final_passing_score || base.finalPassingScore, 1, 100, DEFAULT_FINAL_PASSING_SCORE);
  const requiresSpokenReflection = input.requiresSpokenReflection === undefined
    ? base.requiresSpokenReflection !== false
    : Boolean(input.requiresSpokenReflection);
  const settlementAfterReflection = input.settlementAfterReflection === undefined
    ? base.settlementAfterReflection !== false
    : Boolean(input.settlementAfterReflection);
  const completeAfterStep = interactionStateMachine.includes("reward_settlement")
    ? "reward_settlement"
    : (interactionStateMachine.includes("learner_spoken_reflection") ? "learner_spoken_reflection" : "ai_evaluation");
  return {
    version: TASK_MODEL_VERSION,
    templatePackVersion: ENGLISH_TEMPLATE_PACK_VERSION,
    templateId: cleanString(input.templateId || input.template_id || base.id),
    domain: cleanString(input.domain) || "english",
    skillId,
    title: cleanString(input.title || base.title),
    activityType: cleanString(input.activityType || input.activity_type || base.activityType) || "practice",
    taskCardType,
    plannedMinutes: minutes,
    interactionStateMachine,
    phases: interactionPhases(interactionStateMachine),
    learnerInstruction,
    deliverables: cleanList(input.deliverables || base.deliverables, 8),
    acceptance: cleanList(input.acceptance || base.acceptance, 8),
    submissionContract: {
      firstSubmissionKind: cleanString(input.firstSubmissionKind || input.first_submission_kind || base.firstSubmissionKind) || "learner_attempt",
      revisionSubmissionKind: cleanString(input.revisionSubmissionKind || input.revision_submission_kind || base.revisionSubmissionKind) || "learner_revision",
      firstSubmissionRequired: true,
      revisionRequiredAfterFeedback: input.revisionRequiredAfterFeedback === undefined
        ? base.draftFeedback !== false
        : Boolean(input.revisionRequiredAfterFeedback),
      rawAnswerStorage: "kanban-comment-only",
      privacyLevel: "summary_only",
    },
    evaluationContract: {
      requiresStructuredFeedback: true,
      requiresMarkdownReport: input.requiresMarkdownReport === undefined ? true : Boolean(input.requiresMarkdownReport),
      requiresEvidenceRefs: true,
      finalPassingScore,
      passingScore: finalPassingScore,
      finalStage: "final",
      requiresSpokenReflection,
      settlementAfterReflection,
      verifier: cleanString(input.verifier || "learning-evaluation-verifier"),
    },
    feedbackContract: {
      schema: ["strengths", "focusAreas", "whyItMatters", "fix", "example", "rewriteChecklist", "reflectionItems", "nextPractice"],
      learnerActionRequired: true,
      scoreOnlyFeedbackAllowed: false,
    },
    rubricDimensions: Array.isArray(input.rubricDimensions || base.rubricDimensions)
      ? (input.rubricDimensions || base.rubricDimensions).map((item) => ({
        id: cleanString(item?.id),
        label: cleanString(item?.label),
        weight: Number(item?.weight || 0) || 0,
      })).filter((item) => item.id || item.label)
      : [],
    evidenceContract: {
      required: cleanList(input.evidenceRequired || input.evidence_required || base.evidenceRequired, 12),
      forbiddenInLogs: ["raw_answer", "full_transcript", "question_text", "answer_key"],
    },
    completionPolicy: {
      firstSubmissionCompletesTask: false,
      completeAfterStep,
      requiresFinalEvaluation: true,
      finalPassingScore,
      requiresSpokenReflection,
      settlementAfterReflection,
      reflectionStep: requiresSpokenReflection ? "learner_spoken_reflection" : "",
    },
    rewardPolicy: normalizeRewardPolicy(input),
  };
}

function textCandidates(input = {}) {
  return [
    input.skillId,
    input.skill_id,
    ...(asArray(input.skillIds || input.skill_ids)),
    ...(asArray(input.kanbanSkills || input.kanban_skills)),
    input.kanbanCaseCreationSkillId,
    input.kanban_case_creation_skill_id,
    input.learningGrowthSubmissionKind,
    input.learning_growth_submission_kind,
    input.submissionKind,
    input.submission_kind,
    input.title,
    input.content,
    input.kanbanCaseCardGoal,
    input.kanban_case_card_goal,
    input.description,
  ].map(cleanString).filter(Boolean);
}

function inferSkillIdFromText(input = {}) {
  for (const candidate of textCandidates(input)) {
    const direct = cleanString(candidate).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const normalized = normalizeSkillId(candidate);
    if (direct === normalized && isKnownEnglishSkillId(normalized)) return normalized;
  }
  const haystack = textCandidates(input).join(" ").toLowerCase();
  if (!haystack) return "english_reading_comprehension";
  if (/\b(write|writing|draft|essay|paragraph|composition)\b|写作|作文/.test(haystack)) return "english_short_writing";
  if (/\b(rewrite|rewriting|revision|revise|improve sentence)\b|改写/.test(haystack)) return "english_rewrite_improvement";
  if (/\b(listen|listening|audio|key points?)\b|听力/.test(haystack)) return "english_listening_input";
  if (/\b(speak|speaking|oral|retell|retelling)\b|口语|复述/.test(haystack)) return "english_speaking_retell";
  if (/\b(pronunciation|shadow|shadowing)\b|发音|跟读/.test(haystack)) return "english_pronunciation_shadowing";
  if (/\b(vocab|vocabulary|word use)\b|词汇/.test(haystack)) return "english_vocabulary_active_use";
  if (/\b(grammar|sentence repair)\b|语法/.test(haystack)) return "english_grammar_in_expression";
  if (/\b(presentation|speech|outline)\b|演讲|展示/.test(haystack)) return "english_presentation";
  if (/\b(weekly challenge|integrated challenge|weekly review)\b/.test(haystack)) return "english_weekly_challenge";
  for (const candidate of textCandidates(input)) {
    const normalized = normalizeSkillId(candidate);
    if (isKnownEnglishSkillId(normalized)) return normalized;
  }
  return "english_reading_comprehension";
}

function inferLearningTaskModelFromCard(card = {}, input = {}) {
  const existing = card.learningTaskModel || card.learning_task_model || input.learningTaskModel || input.learning_task_model;
  if (existing && typeof existing === "object" && cleanString(existing.skillId)) return existing;
  const merged = Object.assign({}, card, input);
  const skillId = inferSkillIdFromText(merged);
  return buildLearningTaskModel({
    domain: cleanString(card.domain || input.domain) || "english",
    skillId,
    skillIds: [skillId],
    title: cleanString(card.title || card.content || input.title || input.content),
    plannedMinutes: card.plannedMinutes || card.planned_minutes || input.plannedMinutes || input.planned_minutes,
    dayIndex: card.dayIndex || card.day_index || card.kanbanCaseCardIndex || card.kanban_case_card_index,
    taskCardType: card.taskCardType || card.task_card_type,
    learnerInstruction: card.learnerInstruction || card.learner_instruction || card.kanbanCaseCardGoal || card.kanban_case_card_goal,
    deliverables: learningGrowthSpecificList(card.kanbanCaseDeliverables || card.kanban_case_deliverables, merged),
    acceptance: learningGrowthSpecificList(card.kanbanCaseAcceptance || card.kanban_case_acceptance, merged),
  });
}

function learningTaskModelSummary(model = {}) {
  const safe = model && typeof model === "object" ? model : {};
  return {
    version: cleanString(safe.version || TASK_MODEL_VERSION),
    templatePackVersion: cleanString(safe.templatePackVersion || ENGLISH_TEMPLATE_PACK_VERSION),
    templateId: cleanString(safe.templateId),
    skillId: cleanString(safe.skillId),
    activityType: cleanString(safe.activityType),
    taskCardType: normalizeTaskCardType(safe.taskCardType),
    interactionStateMachine: cleanList(safe.interactionStateMachine, 20),
    learnerInstruction: cleanString(safe.learnerInstruction),
    deliverables: cleanList(safe.deliverables, 8),
    acceptance: cleanList(safe.acceptance, 8),
    submissionContract: {
      firstSubmissionKind: cleanString(safe.submissionContract?.firstSubmissionKind),
      revisionSubmissionKind: cleanString(safe.submissionContract?.revisionSubmissionKind),
      revisionRequiredAfterFeedback: Boolean(safe.submissionContract?.revisionRequiredAfterFeedback),
    },
    evaluationContract: {
      finalPassingScore: clampInt(safe.evaluationContract?.finalPassingScore || safe.evaluationContract?.passingScore, 1, 100, DEFAULT_FINAL_PASSING_SCORE),
      passingScore: clampInt(safe.evaluationContract?.passingScore || safe.evaluationContract?.finalPassingScore, 1, 100, DEFAULT_FINAL_PASSING_SCORE),
      finalStage: cleanString(safe.evaluationContract?.finalStage || "final"),
      requiresSpokenReflection: safe.evaluationContract?.requiresSpokenReflection === undefined ? true : Boolean(safe.evaluationContract?.requiresSpokenReflection),
      settlementAfterReflection: safe.evaluationContract?.settlementAfterReflection === undefined ? true : Boolean(safe.evaluationContract?.settlementAfterReflection),
    },
    completionPolicy: {
      firstSubmissionCompletesTask: Boolean(safe.completionPolicy?.firstSubmissionCompletesTask),
      completeAfterStep: cleanString(safe.completionPolicy?.completeAfterStep),
      requiresFinalEvaluation: Boolean(safe.completionPolicy?.requiresFinalEvaluation),
      finalPassingScore: clampInt(safe.completionPolicy?.finalPassingScore, 1, 100, DEFAULT_FINAL_PASSING_SCORE),
      requiresSpokenReflection: safe.completionPolicy?.requiresSpokenReflection === undefined ? true : Boolean(safe.completionPolicy?.requiresSpokenReflection),
      settlementAfterReflection: safe.completionPolicy?.settlementAfterReflection === undefined ? true : Boolean(safe.completionPolicy?.settlementAfterReflection),
      reflectionStep: cleanString(safe.completionPolicy?.reflectionStep),
    },
    feedbackContract: {
      scoreOnlyFeedbackAllowed: Boolean(safe.feedbackContract?.scoreOnlyFeedbackAllowed),
      learnerActionRequired: Boolean(safe.feedbackContract?.learnerActionRequired),
    },
    rubricDimensions: Array.isArray(safe.rubricDimensions)
      ? safe.rubricDimensions.map((item) => ({
        id: cleanString(item?.id),
        weight: Number(item?.weight || 0) || 0,
      })).filter((item) => item.id)
      : [],
    rewardPolicy: normalizeRewardPolicy(safe),
  };
}

function nextActionForTaskModel(model = {}, state = {}) {
  return growthNextActionForTaskModel(learningTaskModelSummary(model), state);
}

module.exports = {
  TASK_CARD_TYPES,
  TASK_MODEL_VERSION,
  buildLearningTaskModel,
  inferLearningTaskModelFromCard,
  inferSkillIdFromText,
  learningTaskModelSummary,
  nextActionForTaskModel,
  normalizeTaskCardType,
  normalizeRewardPolicy,
};
