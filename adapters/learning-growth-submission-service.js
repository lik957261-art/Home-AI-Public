"use strict";

const crypto = require("node:crypto");

const {
  isLearningGrowthKanbanCard,
} = require("./learning-growth-kanban-task-service");
const {
  activityLabel,
  createLearningGrowthTaskEvaluationService,
} = require("./learning-growth-task-evaluation-service");
const {
  createLearningGrowthTaskReportService,
} = require("./learning-growth-task-report-service");
const {
  applyAiTaskFeedback,
} = require("./learning-growth-task-feedback-service");
const { stableTaskCardId } = require("./learning-task-card-service");
const {
  inferLearningTaskModelFromCard,
} = require("./learning-task-model-service");
const {
  createLearningGrowthProgressSyncService,
} = require("./learning-growth-progress-sync-service");
const {
  growthSubmissionStageForCard,
} = require("./learning-growth-task-interaction-state-service");
const {
  createLearningGrowthReflectionService,
} = require("./learning-growth-reflection-service");
const {
  createLearningGrowthSubmissionRecordService,
  submissionStats,
} = require("./learning-growth-submission-record-service");

function cleanString(value) {
  return String(value ?? "").trim();
}

function digestText(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function createError(status, error, extra = null) {
  return Object.assign({ ok: false, status, error }, extra && typeof extra === "object" ? extra : {});
}

function cardId(card = {}) {
  return cleanString(card.id || card.todo_id || card.todoId);
}

function cardField(card = {}, ...keys) {
  for (const key of keys) {
    const value = cleanString(card[key]);
    if (value) return value;
  }
  return "";
}

function shouldReusePendingSubmission(card = {}, text = "", submissionKind = "") {
  const existingText = cardField(card, "learningGrowthSubmissionText", "learning_growth_submission_text");
  if (!existingText || existingText !== cleanString(text)) return false;
  const submissionStatus = cardField(card, "learningGrowthSubmissionStatus", "learning_growth_submission_status").toLowerCase();
  const evaluationStatus = cardField(card, "learningGrowthEvaluationStatus", "learning_growth_evaluation_status").toLowerCase();
  const existingKind = cardField(card, "learningGrowthSubmissionKind", "learning_growth_submission_kind").toLowerCase();
  if (submissionStatus !== "submitted") return false;
  if (evaluationStatus && evaluationStatus !== "pending") return false;
  return !existingKind || !submissionKind || existingKind === cleanString(submissionKind).toLowerCase();
}

function resolveTaskCardId(card = {}) {
  const explicit = cardField(card, "learningTaskCardId", "learning_task_card_id");
  if (explicit) return explicit;
  const draftId = cardField(card, "learningDraftId", "learning_draft_id");
  const caseCardId = cardField(card, "kanbanCaseCardId", "kanban_case_card_id");
  return draftId && caseCardId ? stableTaskCardId(draftId, caseCardId) : "";
}

function resolveProgramTaskCard(programService, card = {}) {
  if (!programService) return null;
  const explicit = resolveTaskCardId(card);
  if (explicit && typeof programService.getTaskCard === "function") {
    const task = programService.getTaskCard(explicit);
    if (task) return task;
  }
  const kanbanCardId = cardId(card);
  const workspaceId = cardField(card, "workspaceId", "workspace_id");
  const filters = {
    workspaceId,
    learnerId: cardField(card, "learnerId", "studentId") || workspaceId,
    programId: cardField(card, "learningProgramId", "learning_program_id"),
    draftId: cardField(card, "learningDraftId", "learning_draft_id"),
  };
  if (kanbanCardId && typeof programService.getTaskCardForKanbanCard === "function") {
    const task = programService.getTaskCardForKanbanCard(kanbanCardId, filters);
    if (task) return task;
  }
  if (kanbanCardId && typeof programService.listTaskCards === "function") {
    const candidates = programService.listTaskCards(Object.assign({}, filters, { limit: 100 }));
    const task = asArray(candidates).find((item) => item.kanbanCardId === kanbanCardId);
    if (task) return task;
  }
  return null;
}

function taskCardToGrowthCard(task = {}, input = {}) {
  const taskCardId = cleanString(task.taskCardId || input.taskCardId);
  const kanbanCardId = cleanString(task.kanbanCardId || input.cardId);
  const id = kanbanCardId || taskCardId;
  return Object.assign({}, task, {
    id,
    todoId: id,
    todo_id: id,
    workspaceId: cleanString(task.workspaceId || input.workspaceId) || "owner",
    learnerId: cleanString(task.learnerId || input.learnerId || input.studentId || task.workspaceId),
    kanbanCaseTemplate: "learning-growth",
    kanbanCaseId: cleanString(task.draftId || task.programId || "learning-growth"),
    kanbanCaseCardId: taskCardId,
    learningTaskCardId: taskCardId,
    learningProgramId: cleanString(task.programId),
    learningDraftId: cleanString(task.draftId),
    learningTaskModel: task.taskModel && typeof task.taskModel === "object" ? task.taskModel : {},
    kanbanCaseCardGoal: cleanString(task.summary || task.title),
    content: cleanString(task.title || task.summary || taskCardId),
    title: cleanString(task.title || taskCardId),
    status: cleanString(task.status || "published"),
    kanbanStatus: cleanString(task.status || "published"),
  });
}

function mergeNativeTaskCard(task = {}, kanbanCard = null, input = {}) {
  const base = taskCardToGrowthCard(task, input);
  if (!kanbanCard || typeof kanbanCard !== "object") return base;
  return Object.assign({}, base, kanbanCard, {
    learningTaskCardId: cleanString(task.taskCardId || base.learningTaskCardId),
    learningProgramId: cleanString(task.programId || kanbanCard.learningProgramId || kanbanCard.learning_program_id || base.learningProgramId),
    learningDraftId: cleanString(task.draftId || kanbanCard.learningDraftId || kanbanCard.learning_draft_id || base.learningDraftId),
    learningTaskModel: task.taskModel && typeof task.taskModel === "object" ? task.taskModel : (kanbanCard.learningTaskModel || base.learningTaskModel),
  });
}

function submissionStageForCard(card = {}, input = {}) {
  return growthSubmissionStageForCard(card, input);
}

function getProgramService(options = {}) {
  if (typeof options.getLearningProgramService === "function") return options.getLearningProgramService();
  return options.learningProgramService || null;
}

function getSubmissionRecordService(options = {}) {
  if (options.submissionRecordService) return options.submissionRecordService;
  const learningProgramService = getProgramService(options);
  if (!learningProgramService) return null;
  return createLearningGrowthSubmissionRecordService({ learningProgramService });
}

function publicEvaluation(evaluation = {}, settlement = null) {
  const sections = evaluation.feedbackSections || {};
  const finalPassingScore = Number(evaluation.finalPassingScore || evaluation.passingScore || 80) || 80;
  const reflectionRequired = cleanString(evaluation.status) === "reflection_required"
    || cleanString(evaluation.nextStep) === "spoken_reflection_required"
    || Boolean(evaluation.reflectionPolicy?.required);
  return {
    evaluationId: cleanString(evaluation.evaluationId),
    stage: cleanString(evaluation.stage),
    status: cleanString(evaluation.status),
    activityType: cleanString(evaluation.activityType),
    skillId: cleanString(evaluation.skillId),
    taskModelVersion: cleanString(evaluation.taskModelVersion),
    score: Number(evaluation.score || 0),
    maxScore: Number(evaluation.maxScore || 100),
    finalPassingScore,
    passingScore: finalPassingScore,
    finalStage: cleanString(evaluation.finalStage || "final"),
    reflectionGateEnabled: Boolean(evaluation.reflectionGateEnabled ?? evaluation.reflectionPolicy?.required ?? true),
    settlementAfterReflection: Boolean(evaluation.settlementAfterReflection ?? evaluation.reflectionPolicy?.required ?? true),
    settlementBlockedByReflection: reflectionRequired,
    passed: Boolean(evaluation.passed),
    summary: cleanString(evaluation.summary),
    evidenceRefs: asArray(evaluation.evidenceRefs).map(cleanString).filter(Boolean),
    revisionRequirements: asArray(evaluation.revisionRequirements).map(cleanString).filter(Boolean),
    feedbackSections: {
      strengths: asArray(sections.strengths).map(cleanString).filter(Boolean),
      focusAreas: asArray(sections.focusAreas).map(cleanString).filter(Boolean),
      criterionFeedback: asArray(sections.criterionFeedback).map((item) => ({
        dimension: cleanString(item?.dimension),
        observation: cleanString(item?.observation),
        action: cleanString(item?.action),
      })).filter((item) => item.dimension || item.observation || item.action),
      rewriteChecklist: asArray(sections.rewriteChecklist).map(cleanString).filter(Boolean),
      reflectionPrompts: asArray(sections.reflectionPrompts).map(cleanString).filter(Boolean),
      sentenceFeedback: asArray(sections.sentenceFeedback).map((item) => ({
        evidence: cleanString(item?.evidence),
        issue: cleanString(item?.issue),
        whyItMatters: cleanString(item?.whyItMatters),
        fix: cleanString(item?.fix),
        example: cleanString(item?.example),
      })).filter((item) => item.issue || item.fix || item.example),
      finalConclusion: cleanString(sections.finalConclusion),
      nextPractice: cleanString(sections.nextPractice),
      parentNote: cleanString(sections.parentNote),
    },
    feedbackMethod: cleanString(evaluation.feedbackMethod || evaluation.verificationMethod),
    aiFeedbackStatus: cleanString(evaluation.aiFeedbackStatus),
    nextStep: cleanString(evaluation.nextStep),
    evaluatedAt: cleanString(evaluation.evaluatedAt),
    reflectionPolicy: evaluation.reflectionPolicy && typeof evaluation.reflectionPolicy === "object"
      ? {
        required: Boolean(evaluation.reflectionPolicy.required),
        mode: cleanString(evaluation.reflectionPolicy.mode),
        reflectionWeight: Number(evaluation.reflectionPolicy.reflectionWeight || 0) || 0,
        taskWeight: Number(evaluation.reflectionPolicy.taskWeight || 0) || 0,
      }
      : null,
    report: evaluation.report && typeof evaluation.report === "object" ? {
      path: cleanString(evaluation.report.path),
      name: cleanString(evaluation.report.name),
      mime: cleanString(evaluation.report.mime),
      size: Number(evaluation.report.size || 0) || 0,
    } : null,
    reward: {
      eligible: Boolean(evaluation.reward?.eligible),
      coinAmount: Number(evaluation.reward?.coinAmount || 0),
      minCoinAmount: Number(evaluation.reward?.minCoinAmount || 0),
      maxCoinAmount: Number(evaluation.reward?.maxCoinAmount || 0),
      breakdown: evaluation.reward?.breakdown && typeof evaluation.reward.breakdown === "object"
        ? {
          baseCoins: Number(evaluation.reward.breakdown.baseCoins || 0),
          accuracyCoins: Number(evaluation.reward.breakdown.accuracyCoins || 0),
          timelinessCoins: Number(evaluation.reward.breakdown.timelinessCoins || 0),
          interactionCoins: Number(evaluation.reward.breakdown.interactionCoins || 0),
          score: Number(evaluation.reward.breakdown.score || 0),
          timelinessStatus: cleanString(evaluation.reward.breakdown.timelinessStatus),
          interactionStatus: cleanString(evaluation.reward.breakdown.interactionStatus),
          interactionIndicators: asArray(evaluation.reward.breakdown.interactionIndicators).map(cleanString).filter(Boolean),
        }
        : null,
      status: cleanString(settlement?.status || evaluation.reward?.status || (evaluation.reward?.eligible ? "pending" : "not_eligible")),
      entryId: cleanString(settlement?.ledgerEntry?.entryId || settlement?.entry?.entryId || ""),
      reason: cleanString(settlement?.reason || evaluation.reward?.reason || ""),
    },
    reflection: evaluation.reflection && typeof evaluation.reflection === "object"
      ? {
        status: cleanString(evaluation.reflection.status),
        mode: cleanString(evaluation.reflection.mode),
        score: Number(evaluation.reflection.score || 0) || 0,
        maxScore: Number(evaluation.reflection.maxScore || 100) || 100,
        summary: cleanString(evaluation.reflection.summary),
        transcriptDigest: cleanString(evaluation.reflection.transcriptDigest),
        evidenceRefs: asArray(evaluation.reflection.evidenceRefs).map(cleanString).filter(Boolean),
        evaluationMethod: cleanString(evaluation.reflection.evaluationMethod),
        audio: evaluation.reflection.audio && typeof evaluation.reflection.audio === "object"
          ? {
            kind: cleanString(evaluation.reflection.audio.kind),
            name: cleanString(evaluation.reflection.audio.name),
            mime: cleanString(evaluation.reflection.audio.mime),
            size: Number(evaluation.reflection.audio.size || 0) || 0,
            durationMs: Number(evaluation.reflection.audio.durationMs || 0) || 0,
            digest: cleanString(evaluation.reflection.audio.digest),
          }
          : null,
        submittedAt: cleanString(evaluation.reflection.submittedAt),
      }
      : null,
  };
}

function readableEvaluationComment(evaluation = {}, settlement = null) {
  const label = activityLabel(evaluation.activityType);
  const heading = cleanString(evaluation.activityType) === "writing" ? "AI \u5199\u4f5c\u6279\u6539" : `AI ${label} \u53cd\u9988`;
  const rewardStatus = cleanString(settlement?.status || evaluation.reward?.status || "");
  const rewardLine = evaluation.reward?.eligible
    ? `\u91d1\u5e01\u7ed3\u7b97\uff1a${rewardStatus === "settled" ? "\u5df2\u7ed3\u7b97" : "\u5f85\u590d\u6838\u6216\u7a0d\u540e\u91cd\u8bd5"}\uff0c${Number(evaluation.reward.coinAmount || 0)} \u91d1\u5e01\u3002`
    : "\u91d1\u5e01\u7ed3\u7b97\uff1a\u672a\u901a\u8fc7\u524d\u4e0d\u53d1\u653e\u91d1\u5e01\u3002";
  const requirements = asArray(evaluation.revisionRequirements)
    .map(cleanString)
    .filter(Boolean)
    .slice(0, 5)
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");
  return [
    `${heading}\uff1a${cleanString(evaluation.summary)}`,
    `\u8bc4\u5206\uff1a${Number(evaluation.score || 0)}/${Number(evaluation.maxScore || 100)}`,
    rewardLine,
    requirements ? `\u4fee\u6539\u8981\u6c42\uff1a\n${requirements}` : "\u4fee\u6539\u8981\u6c42\uff1a\u672c\u6b21\u5df2\u8fbe\u5230\u901a\u8fc7\u7ebf\uff0c\u4e0b\u4e00\u6b65\u7ee7\u7eed\u5b8c\u6210\u540e\u7eed\u4efb\u52a1\u3002",
  ].filter(Boolean).join("\n\n");
}

function readableCompletionComment(evaluation = {}, publicEval = {}) {
  const reward = publicEval.reward || {};
  const rewardText = reward.status === "settled"
    ? `\u5df2\u7ed3\u7b97 ${Number(reward.coinAmount || 0)} \u91d1\u5e01\u3002`
    : "\u91d1\u5e01\u5f85\u590d\u6838\u6216\u7a0d\u540e\u91cd\u8bd5\u3002";
  const reportText = publicEval.report?.name
    ? `\u004d\u0061\u0072\u006b\u0064\u006f\u0077\u006e \u4ea4\u4ed8\u62a5\u544a\u5df2\u751f\u6210\uff1a${publicEval.report.name}\u3002`
    : "\u004d\u0061\u0072\u006b\u0064\u006f\u0077\u006e \u4ea4\u4ed8\u62a5\u544a\u672a\u751f\u6210\uff0c\u8bf7\u5237\u65b0\u8fc7\u7a0b\u6216\u8054\u7cfb\u5bb6\u957f\u590d\u6838\u3002";
  return `\u6700\u7ec8\u7ed3\u8bba\uff1a${cleanString(evaluation.summary)} ${reportText} ${rewardText}`.trim();
}

function taskModelForSubmission(card = {}, input = {}) {
  return inferLearningTaskModelFromCard(card, input);
}

function hasAudioSubmissionInput(input = {}) {
  return Boolean(cleanString(input.dataBase64 || input.data_base64 || input.audioDataBase64));
}

function requiresAudioSubmission(taskModel = {}, input = {}) {
  if (input.allowTextFallback === true) return false;
  const activityType = cleanString(taskModel.activityType).toLowerCase();
  const skillId = cleanString(taskModel.skillId).toLowerCase();
  return activityType === "speaking"
    || activityType === "pronunciation"
    || skillId === "english_speaking_retell"
    || skillId === "english_pronunciation_shadowing";
}

function publicSubmissionAudioEvidence(audio = {}, input = {}) {
  const name = cleanString(audio.name || input.filename || input.name || "growth-speaking-audio");
  const mime = cleanString(audio.mime || audio.type || input.type || input.mime || input.mimeType || "audio/webm");
  const size = Number(audio.size || input.size || 0) || 0;
  const durationMs = Number(input.durationMs || input.duration_ms || audio.durationMs || 0) || 0;
  const contentBasis = cleanString(input.dataBase64 || input.data_base64 || input.audioDataBase64);
  const digestBasis = contentBasis || [name, mime, size, durationMs, cleanString(audio.path)].join("|");
  return {
    kind: "audio",
    name,
    mime,
    size,
    durationMs,
    digest: digestText(digestBasis).slice(0, 24),
  };
}

function submissionKindForStage(card = {}, input = {}, stage = "draft") {
  const model = taskModelForSubmission(card, input);
  const contract = model.submissionContract || {};
  if (stage === "draft") return cleanString(contract.firstSubmissionKind) || "learner_attempt";
  return cleanString(contract.revisionSubmissionKind) || "learner_revision";
}

const DEFAULT_SUBMISSION_GUARDS = Object.freeze({
  default: Object.freeze({ minWords: 40, minChars: 200 }),
  writing: Object.freeze({ minWords: 80, minChars: 300 }),
  rewriting: Object.freeze({ minWords: 70, minChars: 380 }),
  vocabulary: Object.freeze({ minWords: 40, minChars: 220 }),
  grammar: Object.freeze({ minWords: 35, minChars: 180 }),
  reading: Object.freeze({ minWords: 50, minChars: 250 }),
  listening: Object.freeze({ minWords: 35, minChars: 180 }),
  speaking: Object.freeze({ minWords: 45, minChars: 220 }),
  pronunciation: Object.freeze({ minWords: 20, minChars: 100 }),
  presentation: Object.freeze({ minWords: 60, minChars: 320 }),
  weekly_challenge: Object.freeze({ minWords: 80, minChars: 450 }),
});

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function submissionTextStats(text) {
  const value = cleanString(text);
  const words = value.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) || [];
  return {
    words: words.length,
    chars: value.replace(/\s+/g, "").length,
  };
}

function resolveSubmissionGuard(taskModel = {}, stage = "draft") {
  const activityType = cleanString(taskModel.activityType).toLowerCase();
  const base = DEFAULT_SUBMISSION_GUARDS[activityType] || DEFAULT_SUBMISSION_GUARDS.default;
  const contract = taskModel && typeof taskModel === "object" ? taskModel.submissionContract || {} : {};
  const configuredWords = contract.minSubmissionWords ?? contract.minimumWords ?? contract.minWords;
  const configuredChars = contract.minSubmissionChars ?? contract.minimumChars ?? contract.minChars;
  const firstPass = normalizeSubmissionStageForGuard(stage) === "draft";
  const multiplier = firstPass ? 1 : 0.6;
  return {
    activityType: activityType || "default",
    stage: firstPass ? "draft" : "final",
    minWords: positiveInt(configuredWords, Math.max(25, Math.round(base.minWords * multiplier))),
    minChars: positiveInt(configuredChars, Math.max(120, Math.round(base.minChars * multiplier))),
  };
}

function normalizeSubmissionStageForGuard(stage) {
  return cleanString(stage).toLowerCase() === "final" ? "final" : "draft";
}

function validateSubmissionText(text, guard = {}) {
  const stats = submissionTextStats(text);
  const minWords = positiveInt(guard.minWords, 0);
  const minChars = positiveInt(guard.minChars, 0);
  const failures = [];
  if (minWords && stats.words < minWords) failures.push(`at least ${minWords} English words`);
  if (minChars && stats.chars < minChars) failures.push(`at least ${minChars} non-space characters`);
  if (!failures.length) return { ok: true, stats, guard };
  return {
    ok: false,
    stats,
    guard,
    error: `Learning task submission is too short; write ${failures.join(" and ")} before submitting.`,
  };
}

function parseTimeMs(value) {
  if (!value) return 0;
  if (typeof value === "number") return value > 10_000_000_000 ? value : value * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function evaluationComment(evaluation = {}, settlement = null) {
  return readableEvaluationComment(evaluation, settlement);
}

async function settleViaProgramService(programService, card, evaluation, input = {}) {
  if (!programService || typeof programService.recordEvaluation !== "function" || typeof programService.settleEvaluationReward !== "function") {
    return null;
  }
  const task = resolveProgramTaskCard(programService, card);
  if (!task) return null;
  const taskCardId = task.taskCardId;
  if (!taskCardId) return null;
  const existing = typeof programService.listInteractionSessions === "function"
    ? programService.listInteractionSessions({ taskCardId, limit: 1 })[0]
    : null;
  const session = existing || (typeof programService.startTaskSession === "function"
    ? programService.startTaskSession(taskCardId, {
      actor: cleanString(input.author) || "executor",
      summary: `Growth task submitted for ${task.title || task.taskCardId}.`,
    })
    : null);
  if (!session?.sessionId) return null;
  const recorded = programService.recordEvaluation(session.sessionId, {
    evaluationId: evaluation.evaluationId,
    score: evaluation.score,
    passed: evaluation.passed,
    confidence: evaluation.confidence,
    verificationMethod: evaluation.verificationMethod,
    evidenceRefs: evaluation.evidenceRefs,
    sourceBasisRefs: asArray(task.sourceBasisRefs),
    summary: evaluation.summary,
    skillResults: [{
      skillId: cleanString(evaluation.skillId) || cleanString(evaluation.activityType) || "learning_growth_task",
      status: evaluation.passed ? "passed" : "needs_revision",
      score: evaluation.score,
      confidence: evaluation.confidence,
      summary: evaluation.summary,
    }],
  });
  if (!evaluation.passed) return { status: "not_eligible", evaluation: recorded };
  const settlement = programService.settleEvaluationReward(recorded.evaluationId, {
    principalId: cleanString(input.author) || "learning-growth",
    coinAmount: Number(evaluation.reward?.coinAmount || 0),
    reason: "Growth learning task passed.",
  });
  return Object.assign({ evaluation: recorded }, settlement);
}

function settleViaCoinService(learningCoinService, card, evaluation, input = {}) {
  if (!evaluation.passed || !evaluation.reward?.eligible) return { status: "not_eligible" };
  if (!learningCoinService || typeof learningCoinService.grantCoins !== "function") return { status: "coin_service_unavailable" };
  const workspaceId = cleanString(input.workspaceId) || cardField(card, "workspaceId", "workspace_id") || "owner";
  const studentId = workspaceId;
  const activityType = cleanString(evaluation.activityType) || "task";
  const sourceType = activityType === "writing" ? "learning-growth-writing-evaluation" : "learning-growth-task-evaluation";
  const idempotencyScope = activityType === "writing" ? "writing" : `task:${activityType}`;
  const result = learningCoinService.grantCoins({
    studentId,
    workspaceId,
    coinAmount: Number(evaluation.reward.coinAmount || 0),
    reason: "Growth learning task passed.",
    sourceType,
    sourceId: evaluation.evaluationId,
    idempotencyKey: `learning-growth:${idempotencyScope}:${workspaceId}:${cardId(card)}:reward`,
    createdByPrincipalId: cleanString(input.author) || "learning-growth",
    metadata: {
      cardId: cardId(card),
      score: Number(evaluation.score || 0),
      evaluationId: evaluation.evaluationId,
      submissionDigest: evaluation.submissionDigest,
    },
  });
  return Object.assign({ status: "settled" }, result);
}

function evaluationFromCard(card = {}, reflection = null, reflectionService = null) {
  const score = Number(card.learningGrowthScore ?? card.learning_growth_score ?? 0) || 0;
  const reflectionScore = Number(reflection?.score || 0) || 0;
  const finalScore = reflection && reflectionService && typeof reflectionService.compositeScore === "function"
    ? reflectionService.compositeScore(score, reflectionScore)
    : score;
  const reportPath = cardField(card, "learningGrowthReportPath", "learning_growth_report_path");
  const reportName = cardField(card, "learningGrowthReportName", "learning_growth_report_name");
  const rewardCoins = Number(card.learningGrowthRewardCoins ?? card.learning_growth_reward_coins ?? 0) || 0;
  return {
    evaluationId: cardField(card, "learningGrowthEvaluationId", "learning_growth_evaluation_id") || `growth-eval-${cardId(card) || "card"}`,
    stage: "final",
    status: reflection?.status === "accepted" ? "completed" : "reflection_required",
    activityType: taskModelForSubmission(card).activityType || "task",
    skillId: taskModelForSubmission(card).skillId || "",
    taskModelVersion: taskModelForSubmission(card).version || "",
    score: finalScore,
    maxScore: Number(card.learningGrowthMaxScore ?? card.learning_growth_max_score ?? 100) || 100,
    finalPassingScore: Number(card.learningGrowthFinalPassingScore ?? card.learning_growth_final_passing_score ?? 80) || 80,
    passingScore: Number(card.learningGrowthFinalPassingScore ?? card.learning_growth_final_passing_score ?? 80) || 80,
    finalStage: "final",
    reflectionGateEnabled: true,
    settlementAfterReflection: true,
    passed: reflection?.status === "accepted",
    summary: reflection?.status === "accepted"
      ? cleanString(cardField(card, "learningGrowthFeedbackSummary", "learning_growth_feedback_summary") || "Growth task completed after spoken reflection.")
      : "Spoken reflection needs another attempt before final settlement.",
    revisionRequirements: asArray(card.learningGrowthRevisionRequirements || card.learning_growth_revision_requirements).map(cleanString).filter(Boolean),
    feedbackSections: {
      strengths: asArray(card.learningGrowthStrengths || card.learning_growth_strengths).map(cleanString).filter(Boolean),
      focusAreas: asArray(card.learningGrowthFocusAreas || card.learning_growth_focus_areas).map(cleanString).filter(Boolean),
      rewriteChecklist: asArray(card.learningGrowthRewriteChecklist || card.learning_growth_rewrite_checklist).map(cleanString).filter(Boolean),
      reflectionPrompts: asArray(card.learningGrowthReflectionPrompts || card.learning_growth_reflection_prompts).map(cleanString).filter(Boolean),
      sentenceFeedback: asArray(card.learningGrowthSentenceFeedback || card.learning_growth_sentence_feedback),
      finalConclusion: reflection?.status === "accepted"
        ? "Spoken reflection accepted; final score includes reflection evidence."
        : cleanString(cardField(card, "learningGrowthFinalConclusion", "learning_growth_final_conclusion")),
      nextPractice: cleanString(cardField(card, "learningGrowthNextPractice", "learning_growth_next_practice")),
      parentNote: cleanString(cardField(card, "learningGrowthParentNote", "learning_growth_parent_note")),
    },
    feedbackMethod: cleanString(cardField(card, "learningGrowthFeedbackMethod", "learning_growth_feedback_method")),
    aiFeedbackStatus: cleanString(cardField(card, "learningGrowthAiFeedbackStatus", "learning_growth_ai_feedback_status")),
    nextStep: reflection?.status === "accepted" ? "completed" : "spoken_reflection_required",
    evaluatedAt: cleanString(cardField(card, "learningGrowthEvaluationAt", "learning_growth_evaluation_at")) || new Date().toISOString(),
    report: reportPath ? {
      path: reportPath,
      name: reportName || reportPath.split(/[\\/]/).pop(),
      mime: "text/markdown; charset=utf-8",
      size: 0,
    } : null,
    reward: {
      eligible: reflection?.status === "accepted" && rewardCoins > 0,
      coinAmount: rewardCoins,
      minCoinAmount: 0,
      maxCoinAmount: Number(card.learningGrowthRewardCoins ?? card.learning_growth_reward_coins ?? rewardCoins) || rewardCoins,
      status: reflection?.status === "accepted" ? "" : "reflection_required",
      reason: reflection?.status === "accepted" ? "Spoken reflection accepted." : "Spoken reflection retry is required.",
    },
    reflection,
  };
}

function readableReflectionComment(reflection = {}, evaluation = {}) {
  const accepted = reflection.status === "accepted";
  return [
    accepted ? "Growth spoken reflection accepted." : "Growth spoken reflection needs another attempt.",
    `Reflection score: ${Number(reflection.score || 0)}/${Number(reflection.maxScore || 100)}.`,
    reflection.summary ? `Reflection summary: ${reflection.summary}` : "",
    accepted ? "Final scoring and reward settlement can continue." : "Please record again and explain the mistake, reason, and next practice plan.",
    evaluation.report?.path ? `MEDIA: ${evaluation.report.path}` : "",
  ].filter(Boolean).join("\n\n");
}

function createLearningGrowthSubmissionService(options = {}) {
  const kanbanCardProvider = options.kanbanCardProvider || null;
  const evaluationService = options.evaluationService || createLearningGrowthTaskEvaluationService();
  const directoryMaterializationService = options.directoryMaterializationService || null;
  const reportService = options.reportService || createLearningGrowthTaskReportService({
    artifactService: options.artifactService,
    reportDirectory: typeof directoryMaterializationService?.reportDirectoryForCard === "function"
      ? (workspaceId, cardIdValue, card) => directoryMaterializationService.reportDirectoryForCard(workspaceId, cardIdValue, card)
      : undefined,
  });
  const learningCoinService = options.learningCoinService || null;
  const aiFeedbackService = options.aiFeedbackService || null;
  const progressSyncService = options.progressSyncService || createLearningGrowthProgressSyncService();
  const sequenceService = options.sequenceService || null;
  const saveSubmissionAudioUpload = typeof options.saveSubmissionAudioUpload === "function"
    ? options.saveSubmissionAudioUpload
    : (typeof options.saveAudioUpload === "function" ? options.saveAudioUpload : null);
  const transcribeSubmissionAudio = typeof options.transcribeSubmissionAudio === "function"
    ? options.transcribeSubmissionAudio
    : (typeof options.transcribeAudio === "function" ? options.transcribeAudio : null);
  const reflectionService = options.reflectionService || createLearningGrowthReflectionService({
    nowIso: options.nowIso,
    saveAudioUpload: options.saveReflectionAudioUpload,
    transcribeAudio: options.transcribeReflectionAudio,
  });
  const maxSubmissionChars = Math.max(1000, Number(options.maxSubmissionChars || 12000));
  const withdrawWindowMs = Math.max(60_000, Number(options.withdrawWindowMs || 5 * 60 * 1000));
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const hasKanbanProvider = Boolean(kanbanCardProvider
    && typeof kanbanCardProvider.listCards === "function"
    && typeof kanbanCardProvider.mutateCard === "function");
  if (!hasKanbanProvider && !getProgramService(options)) {
    throw new Error("learning growth submission service requires a learningProgramService or kanbanCardProvider");
  }
  let cachedSubmissionRecordService = null;
  function submissionRecords() {
    if (options.submissionRecordService) return options.submissionRecordService;
    if (cachedSubmissionRecordService) return cachedSubmissionRecordService;
    cachedSubmissionRecordService = getSubmissionRecordService(options);
    return cachedSubmissionRecordService;
  }

  async function loadGrowthCard(workspaceId, cardIdValue) {
    if (!hasKanbanProvider) return createError(503, "Growth Kanban compatibility provider is not available");
    const listed = await kanbanCardProvider.listCards({
      workspaceId,
      scope: "mine",
      includeCompleted: true,
      limit: 1,
      search: "",
      targetId: cardIdValue,
    });
    if (!listed?.ok) return createError(502, cleanString(listed?.error || listed?.result?.error || "Unable to read Growth card"));
    const card = asArray(listed.data).find((item) => cardId(item) === cardIdValue) || null;
    if (!card) return createError(404, "Growth card was not found");
    if (!isLearningGrowthKanbanCard(card)) return createError(409, "Card is not a Growth learning task");
    return { ok: true, card };
  }

  async function loadGrowthWorkItem(workspaceId, input = {}) {
    const programService = getProgramService(options);
    const taskCardId = cleanString(input.taskCardId);
    if (taskCardId && programService && typeof programService.getTaskCard === "function") {
      const task = programService.getTaskCard(taskCardId);
      if (!task) return createError(404, "Growth learning task was not found");
      const kanbanCardId = cleanString(task.kanbanCardId || input.cardId);
      let kanbanCard = null;
      let kanbanLoadError = null;
      if (kanbanCardId && hasKanbanProvider) {
        const loaded = await loadGrowthCard(workspaceId || task.workspaceId, kanbanCardId);
        if (loaded.ok) kanbanCard = loaded.card;
        else kanbanLoadError = { status: loaded.status, error: loaded.error };
      }
      return {
        ok: true,
        card: mergeNativeTaskCard(task, kanbanCard, Object.assign({}, input, { workspaceId })),
        nativeTask: task,
        taskCardId,
        cardIdValue: kanbanCardId || taskCardId,
        kanbanCardId,
        kanbanLoadError,
        nativeSource: true,
      };
    }
    const cardIdValue = cleanString(input.cardId);
    if (!cardIdValue) return createError(400, "Growth card id or learning task id is required");
    const loaded = await loadGrowthCard(workspaceId, cardIdValue);
    if (!loaded.ok) return loaded;
    const nativeTask = resolveProgramTaskCard(programService, loaded.card);
    return {
      ok: true,
      card: nativeTask ? mergeNativeTaskCard(nativeTask, loaded.card, input) : loaded.card,
      nativeTask,
      taskCardId: nativeTask?.taskCardId || resolveTaskCardId(loaded.card),
      cardIdValue,
      kanbanCardId: cardIdValue,
      nativeSource: Boolean(nativeTask),
    };
  }

  async function projectKanbanComment(loaded = {}, input = {}) {
    const kanbanCardId = cleanString(loaded.kanbanCardId);
    if (!kanbanCardId || !hasKanbanProvider) return { ok: true, skipped: true };
    const result = await kanbanCardProvider.mutateCard(Object.assign({}, input, {
      workspaceId: input.workspaceId,
      cardId: kanbanCardId,
    })).catch((err) => ({ ok: false, error: cleanString(err.message || err) }));
    if (result?.ok) return result;
    if (loaded.nativeTask) {
      return { ok: true, skipped: false, projectionFailed: true, error: cleanString(result?.error || result?.result?.error || "Kanban projection failed") };
    }
    return result;
  }

  function latestNativeEvaluation(taskCardId) {
    const programService = getProgramService(options);
    if (!taskCardId || !programService || typeof programService.listEvaluations !== "function") return null;
    return programService.listEvaluations({ taskCardId, limit: 1 })[0] || null;
  }

  function completionWindowGate(task) {
    if (!task || !sequenceService || typeof sequenceService.completionGateForTask !== "function") return { ok: true };
    return sequenceService.completionGateForTask(task, { nowIso: new Date(now()).toISOString() });
  }

  async function prepareNextSequenceTask(input = {}) {
    if (!sequenceService || typeof sequenceService.prepareNextAfterCompletion !== "function") return null;
    try {
      return await sequenceService.prepareNextAfterCompletion({
        taskCardId: input.taskCardId,
        task: input.task,
        workspaceId: input.workspaceId,
        learnerId: input.learnerId,
        author: input.author,
      });
    } catch (err) {
      return {
        ok: false,
        status: "next_task_prepare_failed",
        previousTaskCardId: cleanString(input.taskCardId),
        error: cleanString(err.message || err),
      };
    }
  }

  async function resolveAudioSubmissionText(workspaceId, cardIdValue, input = {}, card = {}, resolveOptions = {}) {
    const dataBase64 = cleanString(input.dataBase64 || input.data_base64 || input.audioDataBase64);
    if (!dataBase64) return { ok: true, text: cleanString(input.text || input.submission || input.comment), audio: null };
    const requireServerTranscription = Boolean(resolveOptions.requireServerTranscription);
    if (!saveSubmissionAudioUpload) {
      return createError(503, "Growth speaking submission audio upload is not available");
    }
    let audio;
    try {
      audio = saveSubmissionAudioUpload(workspaceId, cardIdValue, {
        filename: input.filename || "growth-speaking-audio.webm",
        type: input.type || input.mime || input.mimeType || "audio/webm",
        dataBase64,
      }, card);
    } catch (err) {
      return createError(Number(err?.status || 400) || 400, cleanString(err?.message || err || "Unable to save Growth speaking audio"));
    }
    if (requireServerTranscription && !cleanString(audio?.path)) {
      return createError(502, "Growth speaking audio was saved without a transcribable path");
    }
    if (requireServerTranscription && !transcribeSubmissionAudio) {
      return createError(503, "Growth speaking audio transcription is not available");
    }
    let transcript = requireServerTranscription ? "" : cleanString(input.transcript || input.text || input.submission || input.comment);
    if (audio?.path && transcribeSubmissionAudio) {
      try {
        const transcription = await transcribeSubmissionAudio(audio.path);
        transcript = cleanString(transcription?.text || transcript);
      } catch (err) {
        return createError(Number(err?.status || 502) || 502, cleanString(err?.message || err || "Unable to transcribe Growth speaking audio"));
      }
    }
    if (!transcript) return createError(502, "Growth speaking audio transcription is empty");
    return {
      ok: true,
      text: transcript,
      audio: publicSubmissionAudioEvidence(audio, input),
    };
  }

  async function submitTask(input = {}) {
    const workspaceId = cleanString(input.workspaceId) || "owner";
    const initialText = cleanString(input.text || input.submission || input.comment);
    const hasAudioInput = hasAudioSubmissionInput(input);
    if (!hasAudioInput && !initialText) return createError(400, "Learning task submission text is required");
    if (!hasAudioInput && initialText.length > maxSubmissionChars) return createError(413, `Learning task submission is too long; keep it under ${maxSubmissionChars} characters`);
    const loaded = await loadGrowthWorkItem(workspaceId, input);
    if (!loaded.ok) return loaded;
    const cardIdValue = loaded.cardIdValue;
    const stage = submissionStageForCard(loaded.card, input);
    const taskModel = taskModelForSubmission(loaded.card, input);
    const needsAudio = requiresAudioSubmission(taskModel, input);
    if (needsAudio && !hasAudioInput) return createError(400, "Growth speaking retell audio is required");
    const resolvedSubmission = await resolveAudioSubmissionText(workspaceId, cardIdValue, input, loaded.card, {
      requireServerTranscription: needsAudio,
    });
    if (!resolvedSubmission.ok) return resolvedSubmission;
    const text = cleanString(resolvedSubmission.text);
    const submissionAudio = resolvedSubmission.audio || null;
    if (!text) return createError(400, needsAudio ? "Growth speaking retell audio transcript is required" : "Learning task submission text is required");
    if (text.length > maxSubmissionChars) return createError(413, `Learning task submission is too long; keep it under ${maxSubmissionChars} characters`);
    const guard = resolveSubmissionGuard(taskModel, stage);
    const validation = validateSubmissionText(text, guard);
    if (!validation.ok) {
      return createError(400, validation.error, {
        submissionGuard: guard,
        submissionStats: validation.stats,
      });
    }
    const submissionKind = submissionKindForStage(loaded.card, input, stage);
    const programService = getProgramService(options);
    const nativeTask = loaded.nativeTask || resolveProgramTaskCard(programService, loaded.card);
    const gate = completionWindowGate(nativeTask);
    if (!gate.ok) {
      return createError(409, "This Growth sequence can only complete one card in the configured time window", {
        completionGate: gate,
      });
    }
    const submissionRecordService = submissionRecords();
    let nativeSubmission = null;
    if (submissionRecordService && nativeTask) {
      try {
        nativeSubmission = submissionRecordService.recordSubmission({
          task: nativeTask,
          workspaceId,
          author: input.author,
          kanbanCardId: loaded.kanbanCardId,
          kanbanCommentRef: "",
          stage,
          submissionKind,
          status: "submitted",
          text,
          stats: submissionStats(text),
          summary: submissionAudio
            ? `${activityLabel(taskModel.activityType)} audio submission received and transcribed.`
            : `${activityLabel(taskModel.activityType)} task submission received.`,
          audio: submissionAudio,
        });
      } catch (err) {
        nativeSubmission = { error: cleanString(err.message || err) };
      }
    }
    const mutated = shouldReusePendingSubmission(loaded.card, text, submissionKind)
      ? { ok: true, id: loaded.kanbanCardId || cardIdValue, action: "comment", reusedLearningGrowthSubmission: true }
      : await projectKanbanComment(loaded, {
        action: "comment",
        workspaceId,
        comment: text,
        author: cleanString(input.author) || "learning-growth",
        learningGrowthSubmission: true,
        submissionKind,
      });
    if (!mutated?.ok) return createError(mutated?.status || 502, cleanString(mutated?.error || mutated?.result?.error || "Unable to submit learning task"));
    let evaluation;
    try {
      evaluation = await evaluationService.evaluate({
        card: loaded.card,
        cardId: cardIdValue,
        text,
        submissionAudio,
        stage,
        learningTaskModel: taskModel,
        submissionKind,
        workspaceId,
      });
    } catch (err) {
      return createError(Number(err?.status || 502) || 502, cleanString(err?.message || err || "Growth task model evaluation failed"));
    }
    if (aiFeedbackService && typeof aiFeedbackService.analyze === "function") {
      try {
        const aiFeedback = await aiFeedbackService.analyze({
          workspaceId,
          card: loaded.card,
          cardId: cardIdValue,
          text,
          submissionAudio,
          stage,
          evaluation,
        });
        if (aiFeedback?.ok && aiFeedback.feedback) {
          evaluation = applyAiTaskFeedback(evaluation, aiFeedback.feedback);
        } else {
          evaluation.aiFeedbackStatus = cleanString(aiFeedback?.status || "unavailable");
        }
      } catch (err) {
        evaluation.aiFeedbackStatus = "error";
        evaluation.aiFeedbackError = cleanString(err.message || err);
      }
    } else {
      evaluation.aiFeedbackStatus = "unavailable";
    }
    const reflectionRequired = reflectionService
      && typeof reflectionService.requiresReflection === "function"
      && reflectionService.requiresReflection({ card: loaded.card, evaluation, stage });
    if (submissionAudio) {
      const evidenceRefs = asArray(evaluation.evidenceRefs).map(cleanString).filter(Boolean);
      evaluation.evidenceRefs = Array.from(new Set([...evidenceRefs, `audio:${submissionAudio.digest}`]));
    }
    if (reflectionRequired && typeof reflectionService.markReflectionRequired === "function") {
      evaluation = reflectionService.markReflectionRequired(evaluation);
    }
    let settlement = null;
    if (reflectionRequired) {
      settlement = { status: "reflection_required", reason: "Spoken reflection is required before final settlement." };
    } else {
      try {
        settlement = await settleViaProgramService(programService, loaded.card, evaluation, { workspaceId, author: input.author });
      } catch (err) {
        settlement = { status: "program_settlement_error", error: cleanString(err.message || err) };
      }
      if (!settlement || settlement.status === "not_eligible") {
        try {
          settlement = settlement || settleViaCoinService(learningCoinService, loaded.card, evaluation, { workspaceId, author: input.author });
        } catch (err) {
          settlement = { status: "coin_settlement_error", error: cleanString(err.message || err) };
        }
      }
    }
    let report = null;
    try {
      report = reportService && typeof reportService.writeReport === "function"
        ? reportService.writeReport({ workspaceId, cardId: cardIdValue, card: loaded.card, evaluation, settlement })
        : null;
      if (report) evaluation.report = report;
      if (report && submissionRecordService && nativeTask && typeof submissionRecordService.recordArtifact === "function") {
        submissionRecordService.recordArtifact({
          task: nativeTask,
          session: nativeSubmission?.session,
          submissionId: nativeSubmission?.record?.submissionId,
          evaluationId: cleanString(evaluation.evaluationId),
          artifact: report,
          artifactType: "feedback_report",
          status: "generated",
          summary: `${activityLabel(taskModel.activityType)} feedback report generated.`,
        });
      }
    } catch (err) {
      evaluation.reportError = cleanString(err.message || err);
    }
    let nativeEvaluation = null;
    if (reflectionRequired && submissionRecordService && nativeTask) {
      try {
        nativeEvaluation = submissionRecordService.recordEvaluation({
          task: nativeTask,
          session: nativeSubmission?.session,
          evaluation,
          status: "reflection_required",
          summary: evaluation.summary,
          author: input.author,
        });
        if (nativeSubmission?.session?.sessionId) {
          submissionRecordService.advanceSession({
            sessionId: nativeSubmission.session.sessionId,
            status: "active",
            step: "spoken_reflection_required",
            summary: "AI feedback passed the score line; spoken reflection is required before settlement.",
          });
        }
      } catch (err) {
        nativeEvaluation = { error: cleanString(err.message || err) };
      }
    }
    const publicEval = publicEvaluation(evaluation, settlement);
    let materialized = null;
    if (directoryMaterializationService && (typeof directoryMaterializationService.materializeTaskEvaluation === "function" || typeof directoryMaterializationService.materializeWritingEvaluation === "function")) {
      try {
        const materialize = typeof directoryMaterializationService.materializeTaskEvaluation === "function"
          ? directoryMaterializationService.materializeTaskEvaluation
          : directoryMaterializationService.materializeWritingEvaluation;
        materialized = materialize({
          workspaceId,
          cardId: cardIdValue,
          card: loaded.card,
          evaluation,
          report,
        });
      } catch (err) {
        evaluation.directoryMaterializationError = cleanString(err.message || err);
      }
    }
    let progressSync = null;
    if (materialized && progressSyncService && typeof progressSyncService.syncAfterMaterialization === "function") {
      try {
        progressSync = progressSyncService.syncAfterMaterialization({
          programService: getProgramService(options),
          workspaceId,
          learnerId: cardField(loaded.card, "learnerId", "studentId") || workspaceId,
          programId: cardField(loaded.card, "learningProgramId", "learning_program_id"),
          card: loaded.card,
          cardId: cardIdValue,
          evaluation,
          report,
          materialized,
        });
      } catch (err) {
        progressSync = {
          ok: false,
          errors: [{ step: "progress_sync", message: cleanString(err.message || err) }],
        };
      }
    }
    const evaluationText = [
      evaluationComment(evaluation, settlement),
      report?.path ? `MEDIA: ${report.path}` : "",
    ].filter(Boolean).join("\n\n");
    const evaluationMutation = await projectKanbanComment(loaded, {
      action: "comment",
      workspaceId,
      comment: evaluationText,
      author: "learning-growth-evaluator",
      learningGrowthEvaluation: publicEval,
    });
    if (!evaluationMutation?.ok) return createError(evaluationMutation?.status || 502, cleanString(evaluationMutation?.error || "Unable to persist learning task evaluation"));
    let completion = null;
    let nextTask = null;
    if (evaluation.passed && !reflectionRequired) {
      completion = await projectKanbanComment(loaded, {
        action: "complete",
        workspaceId,
        comment: readableCompletionComment(evaluation, publicEval),
        author: "learning-growth-evaluator",
      });
      if (completion?.ok) {
        nextTask = await prepareNextSequenceTask({
          taskCardId: nativeTask?.taskCardId || loaded.taskCardId,
          task: nativeTask,
          workspaceId,
          learnerId: cardField(loaded.card, "learnerId", "studentId") || workspaceId,
          author: input.author,
        });
      }
    }
    return {
      ok: true,
      cardId: cardIdValue,
      workspaceId,
      status: publicEval.status,
      submissionGuard: guard,
      submissionAudio,
      evaluation: publicEval,
      reward: publicEval.reward,
      nextTask,
      result: {
        ok: true,
        id: cleanString(mutated.id || mutated.cardId || cardIdValue) || cardIdValue,
        action: "comment",
        evaluation: publicEval,
        completed: Boolean(completion?.ok),
        materialized,
        submissionAudio,
        nativeSubmission: nativeSubmission?.record ? { submissionId: nativeSubmission.record.submissionId, status: nativeSubmission.record.status } : null,
        nativeEvaluation: nativeEvaluation?.evaluation ? { evaluationId: nativeEvaluation.evaluation.evaluationId, status: nativeEvaluation.evaluation.status } : null,
        nextTask,
        progressSync,
      },
    };
  }

  async function submitReflection(input = {}) {
    const workspaceId = cleanString(input.workspaceId) || "owner";
    const loaded = await loadGrowthWorkItem(workspaceId, input);
    if (!loaded.ok) return loaded;
    const cardIdValue = loaded.cardIdValue;
    const priorEvaluation = latestNativeEvaluation(loaded.taskCardId);
    const status = cardField(loaded.card, "learningGrowthEvaluationStatus", "learning_growth_evaluation_status").toLowerCase();
    const nextStep = cardField(loaded.card, "learningGrowthNextStep", "learning_growth_next_step").toLowerCase();
    const nativeStatus = cleanString(priorEvaluation?.status).toLowerCase();
    const nativeNextStep = cleanString(priorEvaluation?.nextStep || priorEvaluation?.reflectionGate?.nextStep).toLowerCase();
    if (status !== "reflection_required" && nextStep !== "spoken_reflection_required" && nativeStatus !== "reflection_required" && nativeNextStep !== "spoken_reflection_required") {
      return createError(409, "Growth card is not waiting for spoken reflection");
    }
    const reflectionResult = await reflectionService.submitReflection(Object.assign({}, input, {
      workspaceId,
      cardId: cardIdValue,
      card: loaded.card,
    }));
    if (!reflectionResult?.ok) return reflectionResult;
    const reflection = reflectionResult.reflection;
    let evaluation = evaluationFromCard(loaded.card, reflection, reflectionService);
    if (priorEvaluation) {
      evaluation = Object.assign({}, evaluation, {
        evaluationId: cleanString(priorEvaluation.evaluationId) || evaluation.evaluationId,
        activityType: cleanString(priorEvaluation.activityType) || evaluation.activityType,
        skillId: cleanString(priorEvaluation.skillId) || evaluation.skillId,
        score: Number(priorEvaluation.score || evaluation.score || 0),
        maxScore: Number(priorEvaluation.maxScore || evaluation.maxScore || 100),
        finalPassingScore: Number(priorEvaluation.finalPassingScore || priorEvaluation.passingScore || evaluation.finalPassingScore || 80),
        passingScore: Number(priorEvaluation.finalPassingScore || priorEvaluation.passingScore || evaluation.passingScore || 80),
        summary: cleanString(priorEvaluation.summary) || evaluation.summary,
        revisionRequirements: asArray(priorEvaluation.revisionRequirements).length ? priorEvaluation.revisionRequirements : evaluation.revisionRequirements,
        feedbackSections: Object.assign({}, evaluation.feedbackSections || {}, priorEvaluation.feedbackSections || {}),
        report: priorEvaluation.report || evaluation.report,
      });
    }
    if (reflection.status === "accepted") {
      evaluation = Object.assign({}, evaluation, {
        confidence: Number(evaluation.confidence || 0.82),
        verificationMethod: cleanString(evaluation.verificationMethod || evaluation.feedbackMethod) || "model_assisted_growth_task_evaluation",
        evidenceRefs: asArray(evaluation.evidenceRefs).length ? evaluation.evidenceRefs : asArray(reflection.evidenceRefs),
      });
    }
    const programService = getProgramService(options);
    const nativeTask = loaded.nativeTask || resolveProgramTaskCard(programService, loaded.card);
    const submissionRecordService = submissionRecords();
    let nativeReflection = null;
    if (submissionRecordService && nativeTask) {
      try {
        nativeReflection = submissionRecordService.recordReflection({
          task: nativeTask,
          evaluationId: cleanString(evaluation.evaluationId),
          reflection,
          author: input.author,
        });
      } catch (err) {
        nativeReflection = { error: cleanString(err.message || err) };
      }
    }
    let settlement = null;
    if (reflection.status === "accepted" && evaluation.passed) {
      try {
        settlement = await settleViaProgramService(programService, loaded.card, evaluation, { workspaceId, author: input.author });
      } catch (err) {
        settlement = { status: "program_settlement_error", error: cleanString(err.message || err) };
      }
      if (!settlement || settlement.status === "not_eligible") {
        try {
          settlement = settlement || settleViaCoinService(learningCoinService, loaded.card, evaluation, { workspaceId, author: input.author });
        } catch (err) {
          settlement = { status: "coin_settlement_error", error: cleanString(err.message || err) };
        }
      }
    } else {
      settlement = { status: "reflection_retry_required", reason: "Spoken reflection needs another attempt." };
    }
    const publicEval = publicEvaluation(evaluation, settlement);
    const reflectionMutation = await projectKanbanComment(loaded, {
      action: "comment",
      workspaceId,
      comment: readableReflectionComment(reflection, evaluation),
      author: cleanString(input.author) || "learning-growth-reflection",
      learningGrowthEvaluation: publicEval,
    });
    if (!reflectionMutation?.ok) return createError(reflectionMutation?.status || 502, cleanString(reflectionMutation?.error || "Unable to persist Growth reflection"));
    let completion = null;
    let nextTask = null;
    if (reflection.status === "accepted" && evaluation.passed) {
      completion = await projectKanbanComment(loaded, {
        action: "complete",
        workspaceId,
        comment: readableCompletionComment(evaluation, publicEval),
        author: "learning-growth-evaluator",
      });
      if (completion?.ok) {
        nextTask = await prepareNextSequenceTask({
          taskCardId: nativeTask?.taskCardId || loaded.taskCardId,
          task: nativeTask,
          workspaceId,
          learnerId: cardField(loaded.card, "learnerId", "studentId") || workspaceId,
          author: input.author,
        });
      }
    }
    return {
      ok: true,
      cardId: cardIdValue,
      workspaceId,
      status: publicEval.status,
      reflection,
      evaluation: publicEval,
      reward: publicEval.reward,
      nextTask,
      result: {
        ok: true,
        action: "learning-growth-reflection",
        completed: Boolean(completion?.ok),
        nativeReflection: nativeReflection?.record ? { reflectionId: nativeReflection.record.reflectionId, status: nativeReflection.record.status } : null,
        nextTask,
      },
    };
  }

  async function withdrawSubmission(input = {}) {
    const workspaceId = cleanString(input.workspaceId) || "owner";
    const loaded = await loadGrowthWorkItem(workspaceId, input);
    if (!loaded.ok) return loaded;
    const cardIdValue = loaded.cardIdValue;
    const programService = getProgramService(options);
    const nativeTask = loaded.nativeTask || resolveProgramTaskCard(programService, loaded.card);
    const latestSubmission = nativeTask && typeof programService?.listTaskSubmissions === "function"
      ? programService.listTaskSubmissions({ taskCardId: nativeTask.taskCardId, limit: 1 })[0]
      : null;
    const submittedAt = cardField(loaded.card, "learningGrowthSubmissionAt", "learning_growth_submission_at") || cleanString(latestSubmission?.submittedAt);
    const submittedMs = parseTimeMs(submittedAt);
    if (!submittedMs) return createError(409, "No Growth submission is available to withdraw");
    const currentMs = now();
    if (currentMs - submittedMs > withdrawWindowMs) {
      return createError(409, "Growth submission withdrawal window has expired", {
        withdrawWindowMs,
        submittedAt,
      });
    }
    const rewardStatus = cardField(loaded.card, "learningGrowthRewardStatus", "learning_growth_reward_status").toLowerCase();
    const entryId = cardField(loaded.card, "learningGrowthRewardEntryId", "learning_growth_reward_entry_id");
    const kanbanStatus = cardField(loaded.card, "kanbanStatus", "kanban_status", "status").toLowerCase();
    const completed = ["done", "completed", "archived", "cancelled", "canceled"].includes(kanbanStatus);
    if (completed || rewardStatus === "settled" || entryId) {
      return createError(409, "Growth submission can no longer be withdrawn after completion or reward settlement");
    }
    const result = await projectKanbanComment(loaded, {
      action: "clear_learning_growth_submission",
      workspaceId,
      author: cleanString(input.author) || "learning-growth",
      reason: cleanString(input.reason) || "Withdraw Growth learning task submission.",
    });
    if (!result?.ok) return createError(result?.status || 502, cleanString(result?.error || result?.result?.error || "Unable to withdraw learning task submission"));
    const submissionRecordService = submissionRecords();
    if (submissionRecordService && nativeTask) {
      try {
        submissionRecordService.markSubmissionWithdrawn({
          task: nativeTask,
          withdrawnAt: new Date(now()).toISOString(),
          summary: "Growth task submission withdrawn by executor.",
        });
      } catch (_) {
        // Kanban remains the compatibility source during Step 2b; native withdrawal mirror is best-effort.
      }
    }
    return {
      ok: true,
      cardId: cardIdValue,
      workspaceId,
      status: "withdrawn",
      result,
      withdrawWindowMs,
    };
  }

  return {
    submitReflection,
    submitTask,
    withdrawSubmission,
  };
}

module.exports = {
  createLearningGrowthSubmissionService,
  evaluationComment,
  resolveSubmissionGuard,
  submissionStageForCard,
  submissionTextStats,
  validateSubmissionText,
};
