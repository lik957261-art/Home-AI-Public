"use strict";

const TASK_MODEL_VERSION = "learning-task-model-v1";

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

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeTaskCardType(value, fallback = "single_subject") {
  const text = cleanString(value).toLowerCase();
  return TASK_CARD_TYPES.has(text) ? text : fallback;
}

function primarySkillId(input = {}) {
  const skills = cleanList(input.skillIds || input.skill_ids, 4);
  return cleanString(input.skillId || input.skill_id || skills[0] || "english_reading_comprehension");
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

function buildLearningTaskModel(input = {}) {
  const skillId = primarySkillId(input);
  const base = SKILL_MODELS[skillId] || SKILL_MODELS.english_reading_comprehension;
  const minutes = clampInt(input.plannedMinutes || input.minutes, 5, 120, 15);
  const dayIndex = Math.max(0, Number(input.dayIndex || input.day_index || 0) || 0);
  const taskCardType = normalizeTaskCardType(
    input.taskCardType || input.task_card_type || taskTypeOverride(skillId, dayIndex, base.taskCardType),
    normalizeTaskCardType(base.taskCardType),
  );
  const interactionStateMachine = cleanList(input.interactionStateMachine || input.interaction_state_machine || base.interactionStateMachine, 20);
  const learnerInstruction = cleanString(input.learnerInstruction || input.learner_instruction || input.instruction || base.learnerInstruction);
  return {
    version: TASK_MODEL_VERSION,
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
      revisionRequiredAfterFeedback: Boolean(base.draftFeedback || input.revisionRequiredAfterFeedback),
      rawAnswerStorage: "kanban-comment-only",
      privacyLevel: "summary_only",
    },
    evaluationContract: {
      requiresStructuredFeedback: true,
      requiresMarkdownReport: Boolean(base.draftFeedback || input.requiresMarkdownReport),
      requiresEvidenceRefs: true,
      verifier: cleanString(input.verifier || "learning-evaluation-verifier"),
    },
    evidenceContract: {
      required: cleanList(input.evidenceRequired || input.evidence_required || base.evidenceRequired, 12),
      forbiddenInLogs: ["raw_answer", "full_transcript", "question_text", "answer_key"],
    },
    completionPolicy: {
      firstSubmissionCompletesTask: false,
      completeAfterStep: interactionStateMachine.includes("reward_settlement") ? "reward_settlement" : "ai_evaluation",
      requiresFinalEvaluation: true,
    },
    rewardPolicy: {
      eligibleAfterVerifiedPass: true,
      serviceOwned: true,
    },
  };
}

function learningTaskModelSummary(model = {}) {
  const safe = model && typeof model === "object" ? model : {};
  return {
    version: cleanString(safe.version || TASK_MODEL_VERSION),
    skillId: cleanString(safe.skillId),
    activityType: cleanString(safe.activityType),
    taskCardType: normalizeTaskCardType(safe.taskCardType),
    interactionStateMachine: cleanList(safe.interactionStateMachine, 20),
    submissionContract: {
      firstSubmissionKind: cleanString(safe.submissionContract?.firstSubmissionKind),
      revisionSubmissionKind: cleanString(safe.submissionContract?.revisionSubmissionKind),
      revisionRequiredAfterFeedback: Boolean(safe.submissionContract?.revisionRequiredAfterFeedback),
    },
    completionPolicy: {
      firstSubmissionCompletesTask: Boolean(safe.completionPolicy?.firstSubmissionCompletesTask),
      completeAfterStep: cleanString(safe.completionPolicy?.completeAfterStep),
      requiresFinalEvaluation: Boolean(safe.completionPolicy?.requiresFinalEvaluation),
    },
  };
}

function nextActionForTaskModel(model = {}, state = {}) {
  const status = cleanString(state.evaluationStatus || state.status).toLowerCase();
  const nextStep = cleanString(state.nextStep);
  if (status === "completed" || nextStep === "completed") return "review_feedback";
  if (nextStep === "rewrite_and_reflect" || status === "draft_feedback") return "submit_revision_and_reflection";
  if (nextStep === "revise_and_resubmit" || status === "needs_revision") return "submit_revision";
  if (status === "pending") return "wait_for_feedback";
  const summary = learningTaskModelSummary(model);
  return summary.submissionContract.firstSubmissionKind ? "submit_first_attempt" : "start_task";
}

module.exports = {
  TASK_CARD_TYPES,
  TASK_MODEL_VERSION,
  buildLearningTaskModel,
  learningTaskModelSummary,
  nextActionForTaskModel,
  normalizeTaskCardType,
};
