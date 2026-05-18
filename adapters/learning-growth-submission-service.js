"use strict";

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

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function createError(status, error) {
  return { ok: false, status, error };
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

function submissionStageForCard(card = {}, input = {}) {
  return growthSubmissionStageForCard(card, input);
}

function getProgramService(options = {}) {
  if (typeof options.getLearningProgramService === "function") return options.getLearningProgramService();
  return options.learningProgramService || null;
}

function publicEvaluation(evaluation = {}, settlement = null) {
  const sections = evaluation.feedbackSections || {};
  return {
    evaluationId: cleanString(evaluation.evaluationId),
    stage: cleanString(evaluation.stage),
    status: cleanString(evaluation.status),
    activityType: cleanString(evaluation.activityType),
    skillId: cleanString(evaluation.skillId),
    taskModelVersion: cleanString(evaluation.taskModelVersion),
    score: Number(evaluation.score || 0),
    maxScore: Number(evaluation.maxScore || 100),
    passed: Boolean(evaluation.passed),
    summary: cleanString(evaluation.summary),
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

function submissionKindForStage(card = {}, input = {}, stage = "draft") {
  const model = taskModelForSubmission(card, input);
  const contract = model.submissionContract || {};
  if (stage === "draft") return cleanString(contract.firstSubmissionKind) || "learner_attempt";
  return cleanString(contract.revisionSubmissionKind) || "learner_revision";
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
  const maxSubmissionChars = Math.max(1000, Number(options.maxSubmissionChars || 12000));
  if (!kanbanCardProvider || typeof kanbanCardProvider.listCards !== "function" || typeof kanbanCardProvider.mutateCard !== "function") {
    throw new Error("learning growth submission service requires kanbanCardProvider list/mutate");
  }

  async function loadGrowthCard(workspaceId, cardIdValue) {
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

  async function submitTask(input = {}) {
    const workspaceId = cleanString(input.workspaceId) || "owner";
    const cardIdValue = cleanString(input.cardId);
    const text = cleanString(input.text || input.submission || input.comment);
    if (!cardIdValue) return createError(400, "Growth card id is required");
    if (!text) return createError(400, "Learning task submission text is required");
    if (text.length > maxSubmissionChars) return createError(413, `Learning task submission is too long; keep it under ${maxSubmissionChars} characters`);
    const loaded = await loadGrowthCard(workspaceId, cardIdValue);
    if (!loaded.ok) return loaded;
    const stage = submissionStageForCard(loaded.card, input);
    const taskModel = taskModelForSubmission(loaded.card, input);
    const submissionKind = submissionKindForStage(loaded.card, input, stage);
    const mutated = await kanbanCardProvider.mutateCard({
      action: "comment",
      workspaceId,
      cardId: cardIdValue,
      comment: text,
      author: cleanString(input.author) || "learning-growth",
      learningGrowthSubmission: true,
      submissionKind,
    });
    if (!mutated?.ok) return createError(mutated?.status || 502, cleanString(mutated?.error || mutated?.result?.error || "Unable to submit learning task"));
    let evaluation = evaluationService.evaluate({
      card: loaded.card,
      cardId: cardIdValue,
      text,
      stage,
      learningTaskModel: taskModel,
      submissionKind,
    });
    if (aiFeedbackService && typeof aiFeedbackService.analyze === "function") {
      try {
        const aiFeedback = await aiFeedbackService.analyze({
          workspaceId,
          card: loaded.card,
          cardId: cardIdValue,
          text,
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
    let settlement = null;
    try {
      settlement = await settleViaProgramService(getProgramService(options), loaded.card, evaluation, { workspaceId, author: input.author });
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
    let report = null;
    try {
      report = reportService && typeof reportService.writeReport === "function"
        ? reportService.writeReport({ workspaceId, cardId: cardIdValue, card: loaded.card, evaluation, settlement })
        : null;
      if (report) evaluation.report = report;
    } catch (err) {
      evaluation.reportError = cleanString(err.message || err);
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
    const evaluationMutation = await kanbanCardProvider.mutateCard({
      action: "comment",
      workspaceId,
      cardId: cardIdValue,
      comment: evaluationText,
      author: "learning-growth-evaluator",
      learningGrowthEvaluation: publicEval,
    });
    if (!evaluationMutation?.ok) return createError(evaluationMutation?.status || 502, cleanString(evaluationMutation?.error || "Unable to persist learning task evaluation"));
    let completion = null;
    if (evaluation.passed) {
      completion = await kanbanCardProvider.mutateCard({
        action: "complete",
        workspaceId,
        cardId: cardIdValue,
        comment: readableCompletionComment(evaluation, publicEval),
        author: "learning-growth-evaluator",
      }).catch((err) => ({ ok: false, error: cleanString(err.message || err) }));
    }
    return {
      ok: true,
      cardId: cardIdValue,
      workspaceId,
      status: evaluation.status,
      evaluation: publicEval,
      reward: publicEval.reward,
      result: {
        ok: true,
        id: cleanString(mutated.id || mutated.cardId || cardIdValue) || cardIdValue,
        action: "comment",
        evaluation: publicEval,
        completed: Boolean(completion?.ok),
        materialized,
        progressSync,
      },
    };
  }

  return {
    submitTask,
  };
}

module.exports = {
  createLearningGrowthSubmissionService,
  evaluationComment,
  submissionStageForCard,
};
