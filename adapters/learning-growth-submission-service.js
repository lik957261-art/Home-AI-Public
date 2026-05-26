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
  const reflectionRequired = evaluationAcceptsReflection(evaluation);
  return {
    evaluationId: cleanString(evaluation.evaluationId),
    stage: cleanString(evaluation.stage),
    status: cleanString(evaluation.status),
    activityType: cleanString(evaluation.activityType),
    skillId: cleanString(evaluation.skillId),
    taskModelVersion: cleanString(evaluation.taskModelVersion),
    score: Number(evaluation.score || 0),
    maxScore: Number(evaluation.maxScore || 100),
    completionDecision: cleanString(evaluation.completionDecision),
    remainingWeaknesses: asArray(evaluation.remainingWeaknesses).map(cleanString).filter(Boolean),
    completionPolicy: evaluation.completionPolicy && typeof evaluation.completionPolicy === "object"
      ? {
        mode: cleanString(evaluation.completionPolicy.mode),
        attemptNo: Number(evaluation.completionPolicy.attemptNo || 0) || 0,
        seriousSubmission: evaluation.completionPolicy.seriousSubmission !== false,
        threeSeriousSubmissionsComplete: Boolean(evaluation.completionPolicy.threeSeriousSubmissionsComplete),
      }
      : null,
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

function evaluationScoreReachedPassLine(evaluation = {}) {
  const score = Number(evaluation.score);
  const passLine = Number(evaluation.finalPassingScore || evaluation.passingScore || 80) || 80;
  return Number.isFinite(score) && score >= passLine;
}

function evaluationAcceptsReflection(evaluation = {}) {
  const status = cleanString(evaluation.status).toLowerCase();
  const nextStep = cleanString(evaluation.nextStep || evaluation.reflectionGate?.nextStep).toLowerCase();
  if (status === "reflection_required" || nextStep === "spoken_reflection_required" || Boolean(evaluation.reflectionPolicy?.required)) {
    return true;
  }
  if (status !== "draft_feedback" && nextStep !== "rewrite_and_reflect") return false;
  return evaluationScoreReachedPassLine(evaluation);
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
  const audioPath = cleanString(audio.path);
  const url = cleanString(audio.url || audio.href) || (audioPath ? `/api/files?path=${encodeURIComponent(audioPath)}` : "");
  const contentBasis = cleanString(input.dataBase64 || input.data_base64 || input.audioDataBase64);
  const digestBasis = contentBasis || [name, mime, size, durationMs, cleanString(audio.path)].join("|");
  return {
    kind: "audio",
    name,
    mime,
    size,
    durationMs,
    digest: digestText(digestBasis).slice(0, 24),
    url,
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

function comparableSubmissionText(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

function tokenSet(value) {
  return new Set(comparableSubmissionText(value).split(/\s+/).filter(Boolean));
}

function jaccardSimilarity(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size && !b.size) return 1;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / Math.max(1, a.size + b.size - intersection);
}

function textChangeStats(previousText = "", nextText = "") {
  const previous = comparableSubmissionText(previousText);
  const next = comparableSubmissionText(nextText);
  const previousChars = previous.replace(/\s+/g, "").length;
  const nextChars = next.replace(/\s+/g, "").length;
  const charDelta = Math.abs(nextChars - previousChars);
  const ratio = charDelta / Math.max(1, previousChars);
  return {
    previousChars,
    nextChars,
    charDelta,
    ratio,
    similarity: jaccardSimilarity(previous, next),
  };
}

function activeSubmissionRecords(programService, taskCardId, limit = 8) {
  if (!programService || typeof programService.listTaskSubmissions !== "function" || !taskCardId) return [];
  return asArray(programService.listTaskSubmissions({ taskCardId, limit }))
    .filter((item) => cleanString(item.status).toLowerCase() !== "withdrawn" && !cleanString(item.withdrawnAt));
}

function submissionAttemptPolicy(input = {}) {
  const records = asArray(input.records);
  const latest = records[0] || null;
  const nowMs = Number(input.nowMs || Date.now());
  const minIntervalMs = Math.max(0, Number(input.minIntervalMs ?? 5 * 60 * 1000));
  const minChangedChars = Math.max(0, Number(input.minChangedChars ?? 80));
  const maxSimilarity = Math.max(0, Math.min(1, Number(input.maxSimilarity ?? 0.92)));
  const attemptNo = records.length + 1;
  const policy = {
    mode: "card_completion",
    attemptNo,
    previousAttempts: records.length,
    minIntervalMs,
    seriousSubmission: true,
    threeSeriousSubmissionsComplete: attemptNo >= 3,
    canSubmit: true,
    reason: "",
  };
  if (!latest) return policy;
  const latestAtMs = parseTimeMs(latest.submittedAt || latest.createdAt);
  const elapsedMs = latestAtMs ? Math.max(0, nowMs - latestAtMs) : 0;
  if (minIntervalMs && latestAtMs && elapsedMs < minIntervalMs) {
    return Object.assign(policy, {
      canSubmit: false,
      seriousSubmission: false,
      reason: "submission_cooldown",
      retryAfterMs: minIntervalMs - elapsedMs,
    });
  }
  if (cleanString(latest.displayText)) {
    const change = textChangeStats(latest.displayText, input.text);
    policy.change = change;
    if (change.nextChars >= 120 && change.charDelta < minChangedChars && change.similarity >= maxSimilarity) {
      return Object.assign(policy, {
        canSubmit: false,
        seriousSubmission: false,
        reason: "submission_too_similar",
      });
    }
  }
  return policy;
}

function threeSeriousAttemptCompletion(evaluation = {}) {
  if (!evaluation || typeof evaluation !== "object") return false;
  const policy = evaluation && typeof evaluation.completionPolicy === "object" ? evaluation.completionPolicy : {};
  const decision = cleanString(evaluation.completionDecision).toLowerCase();
  return decision === "complete_current_card"
    && policy.threeSeriousSubmissionsComplete === true
    && Number(policy.attemptNo || 0) >= 3
    && policy.seriousSubmission !== false;
}

function forceThreeSeriousAttemptReflectionPass(evaluation = {}, priorEvaluation = {}, reflection = null) {
  const previousWeaknesses = asArray(priorEvaluation.remainingWeaknesses).length
    ? asArray(priorEvaluation.remainingWeaknesses)
    : asArray(priorEvaluation.revisionRequirements);
  const reward = Object.assign({}, priorEvaluation.reward || {}, evaluation.reward || {}, {
    eligible: Number(evaluation.reward?.coinAmount ?? priorEvaluation.reward?.coinAmount ?? 0) > 0,
    status: "",
    reason: "Three serious attempts completed; spoken reflection was recorded.",
  });
  return Object.assign({}, evaluation, {
    status: "completed",
    passed: true,
    nextStep: "completed",
    completionDecision: cleanString(priorEvaluation.completionDecision) || "complete_current_card",
    completionPolicy: priorEvaluation.completionPolicy || evaluation.completionPolicy || null,
    remainingWeaknesses: previousWeaknesses.map(cleanString).filter(Boolean),
    revisionRequirements: previousWeaknesses.length ? previousWeaknesses : asArray(evaluation.revisionRequirements),
    reward,
    reflection,
  });
}

function submissionPolicyError(policy = {}) {
  if (policy.reason === "submission_cooldown") {
    const minutes = Math.max(1, Math.ceil(Number(policy.retryAfterMs || 0) / 60000));
    return `提交间隔太短，请先按批改意见认真修改，约 ${minutes} 分钟后再提交。`;
  }
  if (policy.reason === "submission_too_similar") {
    return "这次修改和上一次几乎一样，请先补充实质订正、解释或新推理，再提交。";
  }
  return "这次提交暂时不能进入批改，请先补充认真订正后再提交。";
}

function evaluationComment(evaluation = {}, settlement = null) {
  return readableEvaluationComment(evaluation, settlement);
}

function manualPassEvaluationForTask(card = {}, input = {}) {
  const model = taskModelForSubmission(card, input);
  const latestEvaluation = input.latestEvaluation || {};
  const score = Number(input.score ?? latestEvaluation.score ?? 80) || 80;
  const at = new Date().toISOString();
  const taskCardId = cleanString(input.taskCardId || resolveTaskCardId(card) || cardId(card));
  const evaluationId = cleanString(input.evaluationId)
    || `lgte_manual_${digestText([taskCardId, cleanString(input.author || "owner"), at].join("|")).slice(0, 18)}`;
  const remainingWeaknesses = asArray(latestEvaluation.remainingWeaknesses || latestEvaluation.revisionRequirements)
    .map(cleanString)
    .filter(Boolean)
    .slice(0, 6);
  return {
    evaluationId,
    submissionDigest: cleanString(latestEvaluation.submissionDigest),
    stage: "final",
    status: "completed",
    activityType: cleanString(model.activityType || latestEvaluation.activityType || "task"),
    skillId: cleanString(model.skillId || latestEvaluation.skillId),
    taskModelVersion: cleanString(model.version || latestEvaluation.taskModelVersion),
    score,
    maxScore: Number(latestEvaluation.maxScore || 100) || 100,
    passed: true,
    completionDecision: "owner_manual_pass",
    remainingWeaknesses,
    completionPolicy: {
      mode: "owner_manual_pass",
      attemptNo: Number(input.attemptNo || 0) || 0,
      seriousSubmission: true,
      threeSeriousSubmissionsComplete: false,
    },
    confidence: 1,
    summary: cleanString(input.reason) || "Owner manually completed this Growth card after reviewing the learner's effort and current feedback.",
    revisionRequirements: remainingWeaknesses,
    feedbackSections: {
      strengths: ["Owner reviewed the card and accepted the current learning effort."],
      focusAreas: remainingWeaknesses,
      criterionFeedback: [],
      rewriteChecklist: [],
      reflectionPrompts: [],
      sentenceFeedback: [],
      finalConclusion: cleanString(input.reason) || "Owner manual pass.",
      nextPractice: remainingWeaknesses.length
        ? `Carry forward: ${remainingWeaknesses.slice(0, 2).join(" ")}`
        : "Continue with the next Growth card.",
      parentNote: "Owner manual pass; use remaining weaknesses for future similar tasks.",
    },
    nextStep: "completed",
    verificationMethod: "owner_manual_pass",
    feedbackMethod: "owner_manual_pass",
    aiFeedbackStatus: "owner_manual_pass",
    evidenceRefs: ["owner-manual-pass:v1", `task:${taskCardId}`],
    reward: {
      eligible: true,
      coinAmount: 0,
      minCoinAmount: 0,
      maxCoinAmount: 0,
      status: "pending",
      reason: "owner_manual_pass",
    },
    evaluatedAt: at,
  };
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
    status: evaluation.status,
    score: evaluation.score,
    passed: evaluation.passed,
    confidence: evaluation.confidence,
    verificationMethod: evaluation.verificationMethod,
    evidenceRefs: evaluation.evidenceRefs,
    sourceBasisRefs: asArray(task.sourceBasisRefs),
    summary: evaluation.summary,
    revisionRequirements: evaluation.revisionRequirements,
    feedbackSections: evaluation.feedbackSections,
    feedbackMethod: evaluation.feedbackMethod,
    aiFeedbackStatus: evaluation.aiFeedbackStatus,
    nextStep: evaluation.nextStep,
    completionDecision: evaluation.completionDecision,
    completionPolicy: evaluation.completionPolicy,
    remainingWeaknesses: evaluation.remainingWeaknesses,
    finalPassingScore: evaluation.finalPassingScore,
    passingScore: evaluation.passingScore,
    reflectionPolicy: evaluation.reflectionPolicy,
    rewardPolicy: evaluation.rewardPolicy,
    reward: evaluation.reward,
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
  const masteryProfileService = options.masteryProfileService || null;
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
  const minResubmitIntervalMs = Math.max(0, Number(options.minResubmitIntervalMs ?? 5 * 60 * 1000));
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const scheduleBackgroundTask = typeof options.scheduleBackgroundTask === "function"
    ? options.scheduleBackgroundTask
    : ((task, delayMs = 0) => {
      const timer = setTimeout(task, Math.max(0, Number(delayMs || 0) || 0));
      if (timer && typeof timer.unref === "function") timer.unref();
      return timer;
    });
  const notifyEvaluationComplete = typeof options.notifyEvaluationComplete === "function"
    ? options.notifyEvaluationComplete
    : null;
  const notifyTaskComplete = typeof options.notifyTaskComplete === "function"
    ? options.notifyTaskComplete
    : null;
  const queueLeaseMs = Math.max(60_000, Number(options.queueLeaseMs || 20 * 60 * 1000));
  const queueRetryDelayMs = Math.max(10_000, Number(options.queueRetryDelayMs || 60_000));
  const queueMaxAttempts = Math.max(1, Number(options.queueMaxAttempts || 5));
  const queueWorkerId = cleanString(options.queueWorkerId) || `learning-growth-${process.pid || "worker"}`;
  const activeQueueJobs = new Set();
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

  function queueStore() {
    const programService = getProgramService(options);
    return programService && typeof programService.saveGrowthEvaluationJob === "function" ? programService : null;
  }

  function enqueueEvaluationJob(prepared = {}) {
    const store = queueStore();
    const submissionId = cleanString(prepared.nativeSubmission?.record?.submissionId);
    const taskCardId = cleanString(prepared.nativeTask?.taskCardId || prepared.taskCardId);
    if (!store || !submissionId || !taskCardId) return null;
    return store.saveGrowthEvaluationJob({
      jobId: `lgjob_${submissionId}`,
      submissionId,
      taskCardId,
      learnerId: prepared.nativeTask?.learnerId || prepared.workspaceId,
      workspaceId: prepared.workspaceId,
      status: "pending",
      availableAt: new Date(now()).toISOString(),
      raw: {
        source: "learning_growth_async_submission",
        cardId: prepared.cardIdValue,
        kanbanCardId: prepared.loaded?.kanbanCardId || "",
        submissionKind: prepared.submissionKind,
        stage: prepared.stage,
      },
    });
  }

  function notifyJobComplete(payload = {}) {
    if (!notifyEvaluationComplete) return Promise.resolve(null);
    return Promise.resolve(notifyEvaluationComplete(payload)).catch(() => null);
  }

  function completionNoticePayload(input = {}) {
    const task = input.nativeTask || {};
    const loaded = input.loaded || {};
    const evaluation = input.publicEval || publicEvaluation(input.evaluation || {}, input.settlement || null);
    const reflection = input.reflection || null;
    const nextTask = input.nextTask || null;
    return {
      workspaceId: input.workspaceId || loaded.workspaceId || "owner",
      cardId: input.cardId || input.cardIdValue || loaded.cardIdValue || "",
      taskCardId: cleanString(task.taskCardId || loaded.taskCardId || input.taskCardId),
      learnerId: cleanString(task.learnerId || cardField(loaded.card, "learnerId", "studentId") || input.workspaceId),
      taskTitle: cleanString(task.title || loaded.card?.title || task.taskCardId || loaded.taskCardId || input.taskCardId),
      evaluation: {
        evaluationId: cleanString(evaluation.evaluationId),
        status: cleanString(evaluation.status),
        score: Number(evaluation.score || 0),
        maxScore: Number(evaluation.maxScore || 100),
        completionDecision: cleanString(evaluation.completionDecision),
      },
      reward: evaluation.reward ? {
        status: cleanString(evaluation.reward.status),
        coinAmount: Number(evaluation.reward.coinAmount || 0),
      } : null,
      reflection: reflection ? {
        reflectionId: cleanString(reflection.reflectionId || reflection.id),
        status: cleanString(reflection.status),
      } : null,
      nextTask: nextTask ? {
        status: cleanString(nextTask.status),
        taskCardId: cleanString(nextTask.taskCardId),
      } : null,
      completion: {
        ok: true,
        source: cleanString(input.source),
      },
    };
  }

  function notifyTaskCompletion(payload = {}) {
    if (!notifyTaskComplete) return Promise.resolve(null);
    return Promise.resolve(notifyTaskComplete(payload)).catch(() => null);
  }

  async function preparedFromQueuedSubmission(job = {}) {
    const programService = getProgramService(options);
    if (!programService || typeof programService.getTaskSubmission !== "function") {
      return createError(503, "Learning program service is not available for queued Growth evaluation");
    }
    const submission = programService.getTaskSubmission(job.submissionId);
    if (!submission?.submissionId) return createError(404, "Queued Growth submission was not found");
    const text = cleanString(submission.displayText || submission.text || submission.response);
    if (!text) return createError(409, "Queued Growth submission has no persisted display text");
    const task = programService.getTaskCard(submission.taskCardId);
    if (!task?.taskCardId) return createError(404, "Queued Growth task card was not found");
    const loaded = await loadGrowthWorkItem(submission.workspaceId, {
      taskCardId: submission.taskCardId,
      cardId: submission.kanbanCardId,
      workspaceId: submission.workspaceId,
    });
    if (!loaded.ok) return loaded;
    const stage = cleanString(submission.stage) || submissionStageForCard(loaded.card, {});
    const taskModel = taskModelForSubmission(loaded.card, {});
    const submissionKind = cleanString(submission.submissionKind) || submissionKindForStage(loaded.card, {}, stage);
    const guard = resolveSubmissionGuard(taskModel, stage);
    return {
      ok: true,
      input: {
        workspaceId: submission.workspaceId,
        taskCardId: submission.taskCardId,
        cardId: submission.kanbanCardId || loaded.cardIdValue,
        author: "learning-growth-queue",
      },
      workspaceId: submission.workspaceId,
      loaded,
      cardIdValue: loaded.cardIdValue,
      stage,
      taskModel,
      text,
      submissionAudio: submission.audio || null,
      guard,
      submissionKind,
      programService,
      nativeTask: loaded.nativeTask || task,
      attemptPolicy: {
        attemptNo: Number(submission.attemptNo || 1) || 1,
        canSubmit: true,
        seriousSubmission: true,
        reason: "queued_submission",
      },
      submissionRecordService: submissionRecords(),
      nativeSubmission: { record: submission },
    };
  }

  async function processEvaluationJob(job = {}) {
    const store = queueStore();
    if (!store || !job?.jobId) return null;
    if (activeQueueJobs.has(job.jobId)) return null;
    const leaseUntil = new Date(now() + queueLeaseMs).toISOString();
    const claimed = store.claimGrowthEvaluationJob(job.jobId, {
      leaseOwner: queueWorkerId,
      leaseUntil,
      nowIso: new Date(now()).toISOString(),
    });
    if (!claimed) return null;
    activeQueueJobs.add(job.jobId);
    try {
      const prepared = await preparedFromQueuedSubmission(claimed);
      if (!prepared.ok) throw Object.assign(new Error(prepared.error || "Queued Growth evaluation could not be prepared"), { status: prepared.status });
      const result = await completePreparedSubmission(prepared);
      if (!result?.ok) throw Object.assign(new Error(result?.error || "Queued Growth evaluation failed"), { status: result?.status });
      store.completeGrowthEvaluationJob(claimed.jobId, { completedAt: new Date(now()).toISOString() });
      await notifyJobComplete({
        taskCardId: claimed.taskCardId,
        submissionId: claimed.submissionId,
        workspaceId: claimed.workspaceId,
        cardId: result.cardId || prepared.cardIdValue,
        evaluation: result.evaluation || null,
        result,
      });
      return result;
    } catch (err) {
      const attemptCount = Number(claimed.attemptCount || 0);
      const terminal = attemptCount >= queueMaxAttempts;
      const delay = terminal ? 0 : queueRetryDelayMs * Math.max(1, attemptCount);
      const failed = store.failGrowthEvaluationJob(claimed.jobId, {
        status: terminal ? "failed" : "retry",
        error: cleanString(err.message || err),
        availableAt: new Date(now() + delay).toISOString(),
        nowIso: new Date(now()).toISOString(),
      });
      if (terminal) {
        await notifyJobComplete({
          taskCardId: claimed.taskCardId,
          submissionId: claimed.submissionId,
          workspaceId: claimed.workspaceId,
          cardId: claimed.taskCardId,
          error: cleanString(err.message || err),
        });
      }
      return { ok: false, status: Number(err?.status || 502) || 502, error: cleanString(err.message || err), job: failed };
    } finally {
      activeQueueJobs.delete(job.jobId);
    }
  }

  async function processEvaluationQueue(input = {}) {
    const store = queueStore();
    if (!store || typeof store.listGrowthEvaluationJobs !== "function") return { ok: true, available: false, processed: 0 };
    const nowText = new Date(now()).toISOString();
    const jobs = store.listGrowthEvaluationJobs({
      status: ["pending", "retry", "processing"],
      availableBefore: nowText,
      limit: input.limit || 10,
    }).filter((job) => job.status !== "processing" || !job.leaseUntil || job.leaseUntil <= nowText);
    let processed = 0;
    const results = [];
    for (const job of jobs) {
      const result = await processEvaluationJob(job);
      if (result) {
        processed += 1;
        results.push({ jobId: job.jobId, ok: result.ok !== false, status: result.status || "" });
      }
    }
    return { ok: true, processed, results };
  }

  function nextEvaluationQueueDelayMs() {
    const store = queueStore();
    if (!store || typeof store.listGrowthEvaluationJobs !== "function") return null;
    const nowMs = now();
    const jobs = store.listGrowthEvaluationJobs({
      status: ["pending", "retry", "processing"],
      limit: 50,
    });
    let nextDelay = null;
    for (const job of jobs) {
      let targetMs = Date.parse(job.availableAt || "");
      if (job.status === "processing" && job.leaseUntil) {
        const leaseMs = Date.parse(job.leaseUntil);
        if (Number.isFinite(leaseMs) && leaseMs > nowMs) targetMs = leaseMs;
      }
      const delay = Math.max(0, Number.isFinite(targetMs) ? targetMs - nowMs : 0);
      nextDelay = nextDelay === null ? delay : Math.min(nextDelay, delay);
    }
    return nextDelay;
  }

  async function runScheduledEvaluationQueue() {
    await processEvaluationQueue();
    const nextDelay = nextEvaluationQueueDelayMs();
    if (nextDelay !== null) {
      scheduleEvaluationQueue(nextDelay);
    }
  }

  function scheduleEvaluationQueue(delayMs = 0) {
    scheduleBackgroundTask(() => runScheduledEvaluationQueue().catch(() => null), Math.max(0, Number(delayMs || 0) || 0));
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
        card: mergeNativeTaskCard(withNativeTaskState(programService, task), kanbanCard, Object.assign({}, input, { workspaceId })),
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
      card: nativeTask ? mergeNativeTaskCard(withNativeTaskState(programService, nativeTask), loaded.card, input) : loaded.card,
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

  function withNativeTaskState(programService, task = {}) {
    const taskCardId = cleanString(task.taskCardId);
    if (!taskCardId || !programService) return task;
    const latestEvaluation = typeof programService.listEvaluations === "function"
      ? programService.listEvaluations({ taskCardId, limit: 1 })[0]
      : null;
    const latestSubmission = typeof programService.listTaskSubmissions === "function"
      ? programService.listTaskSubmissions({ taskCardId, limit: 1 })[0]
      : null;
    return Object.assign({}, task, {
      latestSubmission: latestSubmission || task.latestSubmission || null,
      latestEvaluation: latestEvaluation || task.latestEvaluation || null,
      learningGrowthSubmissionStatus: cleanString(latestSubmission?.status || task.learningGrowthSubmissionStatus),
      learningGrowthSubmissionAt: cleanString(latestSubmission?.submittedAt || task.learningGrowthSubmissionAt),
      learningGrowthSubmissionKind: cleanString(latestSubmission?.submissionKind || task.learningGrowthSubmissionKind),
      learningGrowthEvaluationId: cleanString(latestEvaluation?.evaluationId || task.learningGrowthEvaluationId),
      learningGrowthEvaluationStatus: cleanString(latestEvaluation?.status || task.learningGrowthEvaluationStatus),
      learningGrowthNextStep: cleanString(latestEvaluation?.nextStep || task.learningGrowthNextStep),
      learningGrowthScore: latestEvaluation ? Number(latestEvaluation.score || 0) : task.learningGrowthScore,
    });
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
        completedEvaluation: input.evaluation,
        completedReflection: input.reflection,
        masteryChanges: input.masteryChanges,
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

  function recordMasteryEvidence(input = {}) {
    if (!masteryProfileService || typeof masteryProfileService.recordTaskEvidence !== "function") return null;
    const taskCard = input.task || input.nativeTask || null;
    if (!taskCard?.taskCardId) return null;
    try {
      return masteryProfileService.recordTaskEvidence({
        taskCard,
        evaluation: input.evaluation,
        reflection: input.reflection,
        learnerId: input.learnerId || taskCard.learnerId || input.workspaceId,
        workspaceId: input.workspaceId || taskCard.workspaceId,
        author: input.author,
      });
    } catch (err) {
      return {
        ok: false,
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

  async function prepareTaskSubmission(input = {}) {
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
    const priorSubmissions = activeSubmissionRecords(programService, nativeTask?.taskCardId || loaded.taskCardId, 8);
    const attemptPolicy = submissionAttemptPolicy({
      records: priorSubmissions,
      text,
      nowMs: now(),
      minIntervalMs: minResubmitIntervalMs,
    });
    if (!attemptPolicy.canSubmit) {
      return createError(attemptPolicy.reason === "submission_cooldown" ? 429 : 409, submissionPolicyError(attemptPolicy), {
        submissionPolicy: attemptPolicy,
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
          attemptNo: attemptPolicy.attemptNo,
          status: "submitted",
          text,
          structuredResponses: input.structuredAnswers,
          stats: submissionStats(text),
          summary: submissionAudio
            ? `${activityLabel(taskModel.activityType)} audio submission received and transcribed.`
            : `${activityLabel(taskModel.activityType)} task submission received.`,
          audio: submissionAudio,
        });
        if (submissionAudio && nativeSubmission?.record?.audio?.url) submissionAudio.url = nativeSubmission.record.audio.url;
      } catch (err) {
        nativeSubmission = { error: cleanString(err.message || err) };
      }
    }
    return {
      ok: true,
      input,
      workspaceId,
      loaded,
      cardIdValue,
      stage,
      taskModel,
      text,
      submissionAudio,
      guard,
      submissionKind,
      programService,
      nativeTask,
      attemptPolicy,
      submissionRecordService,
      nativeSubmission,
    };
  }

  async function completePreparedSubmission(prepared = {}) {
    const {
      input = {},
      workspaceId,
      loaded,
      cardIdValue,
      stage,
      taskModel,
      text,
      submissionAudio,
      guard,
      submissionKind,
      programService,
      nativeTask,
      attemptPolicy,
      submissionRecordService,
      nativeSubmission,
    } = prepared;
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
        attemptNo: attemptPolicy.attemptNo,
        completionPolicy: attemptPolicy,
        previousEvaluation: latestNativeEvaluation(nativeTask?.taskCardId || loaded.taskCardId),
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
          evaluation,
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
    const masteryChanges = recordMasteryEvidence({
      task: nativeTask,
      evaluation,
      workspaceId,
      learnerId: cardField(loaded.card, "learnerId", "studentId") || workspaceId,
      author: input.author,
    });
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
          evaluation,
          masteryChanges,
        });
        await notifyTaskCompletion(completionNoticePayload({
          source: "evaluation",
          workspaceId,
          loaded,
          nativeTask,
          cardIdValue,
          evaluation,
          publicEval,
          settlement,
          nextTask,
        }));
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

  async function submitTask(input = {}) {
    const prepared = await prepareTaskSubmission(input);
    if (!prepared.ok) return prepared;
    return completePreparedSubmission(prepared);
  }

  async function submitTaskAsync(input = {}) {
    const prepared = await prepareTaskSubmission(input);
    if (!prepared.ok) return prepared;
    if (!prepared.nativeSubmission?.record?.submissionId) {
      return createError(503, "Growth task submission could not be recorded before evaluation");
    }
    const submissionId = prepared.nativeSubmission.record.submissionId;
    const taskCardId = prepared.nativeTask?.taskCardId || prepared.taskCardId || "";
    const queued = enqueueEvaluationJob(prepared);
    if (!queued?.jobId) return createError(503, "Growth task evaluation job could not be queued");
    scheduleEvaluationQueue();
    return {
      ok: true,
      status: "accepted",
      async: true,
      taskCardId,
      cardId: prepared.cardIdValue,
      workspaceId: prepared.workspaceId,
      evaluationJob: {
        jobId: queued.jobId,
        status: queued.status,
      },
      submissionGuard: prepared.guard,
      result: {
        ok: true,
        action: "accepted",
        nativeSubmission: {
          submissionId,
          status: prepared.nativeSubmission.record.status,
        },
      },
    };
  }

  async function manualPassTask(input = {}) {
    const workspaceId = cleanString(input.workspaceId) || "owner";
    const loaded = await loadGrowthWorkItem(workspaceId, input);
    if (!loaded.ok) return loaded;
    const programService = getProgramService(options);
    const nativeTask = loaded.nativeTask || resolveProgramTaskCard(programService, loaded.card);
    if (!programService || !nativeTask?.taskCardId) {
      return createError(503, "Growth manual pass requires a native learning task record");
    }
    const priorSubmissions = activeSubmissionRecords(programService, nativeTask.taskCardId, 12);
    const latestEvaluation = latestNativeEvaluation(nativeTask.taskCardId);
    const evaluation = manualPassEvaluationForTask(loaded.card, {
      taskCardId: nativeTask.taskCardId,
      author: input.author,
      reason: input.reason,
      score: input.score,
      latestEvaluation,
      attemptNo: priorSubmissions.length,
    });
    const submissionRecordService = submissionRecords();
    let nativeEvaluation = null;
    try {
      nativeEvaluation = submissionRecordService?.recordEvaluation?.({
        task: nativeTask,
        evaluation,
        status: "completed",
        summary: evaluation.summary,
        author: cleanString(input.author) || "owner",
      });
    } catch (err) {
      return createError(Number(err?.status || 502) || 502, cleanString(err?.message || err || "Unable to record manual pass evaluation"));
    }
    const recordedEvaluation = nativeEvaluation?.evaluation || evaluation;
    let settlement = null;
    try {
      settlement = programService.settleEvaluationReward(recordedEvaluation.evaluationId, {
        principalId: cleanString(input.author) || "owner",
        reason: "owner_manual_pass",
      });
    } catch (err) {
      settlement = { status: "settlement_error", error: cleanString(err.message || err) };
    }
    const publicEval = publicEvaluation(Object.assign({}, evaluation, recordedEvaluation), settlement);
    const evaluationText = evaluationComment(Object.assign({}, evaluation, recordedEvaluation), settlement);
    const evaluationMutation = await projectKanbanComment(loaded, {
      action: "comment",
      workspaceId,
      comment: evaluationText,
      author: "learning-growth-owner",
      learningGrowthEvaluation: publicEval,
    });
    if (!evaluationMutation?.ok) {
      return createError(evaluationMutation?.status || 502, cleanString(evaluationMutation?.error || "Unable to persist manual pass evaluation"));
    }
    const completion = await projectKanbanComment(loaded, {
      action: "complete",
      workspaceId,
      comment: readableCompletionComment(Object.assign({}, evaluation, recordedEvaluation), publicEval),
      author: "learning-growth-owner",
    });
    const masteryChanges = completion?.ok
      ? recordMasteryEvidence({
        task: nativeTask,
        evaluation: recordedEvaluation,
        workspaceId,
        learnerId: cardField(loaded.card, "learnerId", "studentId") || workspaceId,
        author: input.author,
      })
      : null;
    const nextTask = completion?.ok
      ? await prepareNextSequenceTask({
        taskCardId: nativeTask.taskCardId,
        task: nativeTask,
        workspaceId,
        learnerId: cardField(loaded.card, "learnerId", "studentId") || workspaceId,
        author: input.author,
        evaluation: recordedEvaluation,
        masteryChanges,
      })
      : null;
    if (completion?.ok) {
      await notifyTaskCompletion(completionNoticePayload({
        source: "manual_pass",
        workspaceId,
        loaded,
        nativeTask,
        cardIdValue: loaded.cardIdValue,
        evaluation: recordedEvaluation,
        publicEval,
        settlement,
        nextTask,
      }));
    }
    return {
      ok: true,
      status: publicEval.status,
      cardId: loaded.cardIdValue,
      taskCardId: nativeTask.taskCardId,
      workspaceId,
      evaluation: publicEval,
      reward: publicEval.reward,
      rewardSettlement: settlement,
      nextTask,
      result: {
        ok: true,
        completed: Boolean(completion?.ok),
        nativeEvaluation: recordedEvaluation?.evaluationId
          ? { evaluationId: recordedEvaluation.evaluationId, status: recordedEvaluation.status }
          : null,
        nextTask,
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
    const cardEvaluationState = {
      status,
      nextStep,
      score: Number(cardField(loaded.card, "learningGrowthScore", "learning_growth_score") || priorEvaluation?.score || 0),
      finalPassingScore: Number(cardField(loaded.card, "learningGrowthFinalPassingScore", "learning_growth_final_passing_score") || priorEvaluation?.finalPassingScore || priorEvaluation?.passingScore || 80),
      passingScore: Number(cardField(loaded.card, "learningGrowthFinalPassingScore", "learning_growth_final_passing_score") || priorEvaluation?.finalPassingScore || priorEvaluation?.passingScore || 80),
    };
    if (!evaluationAcceptsReflection(cardEvaluationState) && !evaluationAcceptsReflection(priorEvaluation || {})) {
      return createError(409, "Growth card is not waiting for spoken reflection");
    }
    const forceReflectionPass = threeSeriousAttemptCompletion(priorEvaluation);
    const reflectionResult = await reflectionService.submitReflection(Object.assign({}, input, {
      workspaceId,
      cardId: cardIdValue,
      card: loaded.card,
      acceptRegardlessOfScore: forceReflectionPass,
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
        completionDecision: cleanString(priorEvaluation.completionDecision) || evaluation.completionDecision,
        completionPolicy: priorEvaluation.completionPolicy || evaluation.completionPolicy || null,
        remainingWeaknesses: asArray(priorEvaluation.remainingWeaknesses).length ? priorEvaluation.remainingWeaknesses : evaluation.remainingWeaknesses,
        rewardPolicy: priorEvaluation.rewardPolicy || evaluation.rewardPolicy || null,
        reflectionPolicy: priorEvaluation.reflectionPolicy || evaluation.reflectionPolicy || null,
        reward: Object.assign({}, priorEvaluation.reward || {}, evaluation.reward || {}),
        report: priorEvaluation.report || evaluation.report,
      });
    }
    if (forceReflectionPass) {
      evaluation = forceThreeSeriousAttemptReflectionPass(evaluation, priorEvaluation, reflection);
    }
    if (reflection.status === "accepted" || forceReflectionPass) {
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
    if ((reflection.status === "accepted" || forceReflectionPass) && evaluation.passed) {
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
    if ((reflection.status === "accepted" || forceReflectionPass) && evaluation.passed) {
      completion = await projectKanbanComment(loaded, {
        action: "complete",
        workspaceId,
        comment: readableCompletionComment(evaluation, publicEval),
        author: "learning-growth-evaluator",
      });
      if (completion?.ok) {
        const masteryChanges = recordMasteryEvidence({
          task: nativeTask,
          evaluation,
          reflection,
          workspaceId,
          learnerId: cardField(loaded.card, "learnerId", "studentId") || workspaceId,
          author: input.author,
        });
        nextTask = await prepareNextSequenceTask({
          taskCardId: nativeTask?.taskCardId || loaded.taskCardId,
          task: nativeTask,
          workspaceId,
          learnerId: cardField(loaded.card, "learnerId", "studentId") || workspaceId,
          author: input.author,
          evaluation,
          reflection,
          masteryChanges,
        });
        await notifyTaskCompletion(completionNoticePayload({
          source: "reflection",
          workspaceId,
          loaded,
          nativeTask,
          cardIdValue,
          evaluation,
          publicEval,
          settlement,
          reflection,
          nextTask,
        }));
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
    manualPassTask,
    processEvaluationJob,
    processEvaluationQueue,
    scheduleEvaluationQueue,
    submitReflection,
    submitTaskAsync,
    submitTask,
    withdrawSubmission,
  };
}

module.exports = {
  createLearningGrowthSubmissionService,
  evaluationComment,
  resolveSubmissionGuard,
  submissionAttemptPolicy,
  submissionStageForCard,
  submissionTextStats,
  validateSubmissionText,
};
