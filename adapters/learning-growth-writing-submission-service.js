"use strict";

const {
  isLearningGrowthKanbanCard,
} = require("./learning-growth-kanban-task-service");
const {
  createLearningGrowthWritingEvaluationService,
} = require("./learning-growth-writing-evaluation-service");
const {
  createLearningGrowthWritingReportService,
} = require("./learning-growth-writing-report-service");
const { stableTaskCardId } = require("./learning-task-card-service");

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

function learningGrowthEvaluationStatus(card = {}) {
  return cardField(card, "learningGrowthEvaluationStatus", "learning_growth_evaluation_status").toLowerCase();
}

function submissionStageForCard(card = {}, input = {}) {
  const explicit = cleanString(input.stage || input.submissionStage || input.submissionKind).toLowerCase();
  if (["final", "rewrite", "revision", "resubmission"].includes(explicit)) return "final";
  if (["draft", "first_draft", "initial"].includes(explicit)) return "draft";
  const status = learningGrowthEvaluationStatus(card);
  if (["draft_feedback", "needs_revision", "review_required", "pending_review"].includes(status)) return "final";
  return "draft";
}

function getProgramService(options = {}) {
  if (typeof options.getLearningProgramService === "function") return options.getLearningProgramService();
  return options.learningProgramService || null;
}

function publicEvaluation(evaluation = {}, settlement = null) {
  return {
    evaluationId: cleanString(evaluation.evaluationId),
    stage: cleanString(evaluation.stage),
    status: cleanString(evaluation.status),
    score: Number(evaluation.score || 0),
    maxScore: Number(evaluation.maxScore || 100),
    passed: Boolean(evaluation.passed),
    summary: cleanString(evaluation.summary),
    revisionRequirements: asArray(evaluation.revisionRequirements).map(cleanString).filter(Boolean),
    feedbackSections: {
      strengths: asArray(evaluation.feedbackSections?.strengths).map(cleanString).filter(Boolean),
      focusAreas: asArray(evaluation.feedbackSections?.focusAreas).map(cleanString).filter(Boolean),
      rewriteChecklist: asArray(evaluation.feedbackSections?.rewriteChecklist).map(cleanString).filter(Boolean),
      reflectionPrompts: asArray(evaluation.feedbackSections?.reflectionPrompts).map(cleanString).filter(Boolean),
    },
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
      status: cleanString(settlement?.status || evaluation.reward?.status || (evaluation.reward?.eligible ? "pending" : "not_eligible")),
      entryId: cleanString(settlement?.ledgerEntry?.entryId || settlement?.entry?.entryId || ""),
      reason: cleanString(settlement?.reason || evaluation.reward?.reason || ""),
    },
  };
}

function evaluationComment(evaluation = {}, settlement = null) {
  const rewardStatus = cleanString(settlement?.status || evaluation.reward?.status || "");
  const rewardLine = evaluation.reward?.eligible
    ? `金币结算：${rewardStatus === "settled" ? "已结算" : "待复核或稍后重试"}，${Number(evaluation.reward.coinAmount || 0)} 金币。`
    : "金币结算：未通过前不发放金币。";
  const requirements = asArray(evaluation.revisionRequirements)
    .map(cleanString)
    .filter(Boolean)
    .slice(0, 5)
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");
  return [
    `AI 写作批改：${evaluation.summary}`,
    `评分：${Number(evaluation.score || 0)}/${Number(evaluation.maxScore || 100)}`,
    rewardLine,
    requirements ? `修改要求：\n${requirements}` : "修改要求：本次已达到通过线，下一步继续完成后续任务。",
  ].filter(Boolean).join("\n\n");
}

async function settleViaProgramService(programService, card, evaluation, input = {}) {
  if (!programService || typeof programService.recordEvaluation !== "function" || typeof programService.settleEvaluationReward !== "function") {
    return null;
  }
  const taskCardId = resolveTaskCardId(card);
  if (!taskCardId || typeof programService.getTaskCard !== "function") return null;
  const task = programService.getTaskCard(taskCardId);
  if (!task) return null;
  const existing = typeof programService.listInteractionSessions === "function"
    ? programService.listInteractionSessions({ taskCardId, limit: 1 })[0]
    : null;
  const session = existing || (typeof programService.startTaskSession === "function"
    ? programService.startTaskSession(taskCardId, {
      actor: cleanString(input.author) || "executor",
      summary: `Growth writing submitted for ${task.title || task.taskCardId}.`,
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
      skillId: "english_short_writing",
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
    reason: "Growth writing passed.",
  });
  return Object.assign({ evaluation: recorded }, settlement);
}

function settleViaCoinService(learningCoinService, card, evaluation, input = {}) {
  if (!evaluation.passed || !evaluation.reward?.eligible) return { status: "not_eligible" };
  if (!learningCoinService || typeof learningCoinService.grantCoins !== "function") return { status: "coin_service_unavailable" };
  const workspaceId = cleanString(input.workspaceId) || cardField(card, "workspaceId", "workspace_id") || "owner";
  const studentId = workspaceId;
  const result = learningCoinService.grantCoins({
    studentId,
    workspaceId,
    coinAmount: Number(evaluation.reward.coinAmount || 0),
    reason: "Growth writing passed.",
    sourceType: "learning-growth-writing-evaluation",
    sourceId: evaluation.evaluationId,
    idempotencyKey: `learning-growth:writing:${workspaceId}:${cardId(card)}:reward`,
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

function createLearningGrowthWritingSubmissionService(options = {}) {
  const kanbanCardProvider = options.kanbanCardProvider || null;
  const evaluationService = options.evaluationService || createLearningGrowthWritingEvaluationService();
  const reportService = options.reportService || createLearningGrowthWritingReportService({
    artifactService: options.artifactService,
  });
  const learningCoinService = options.learningCoinService || null;
  const maxSubmissionChars = Math.max(1000, Number(options.maxSubmissionChars || 12000));
  if (!kanbanCardProvider || typeof kanbanCardProvider.listCards !== "function" || typeof kanbanCardProvider.mutateCard !== "function") {
    throw new Error("learning growth writing submission service requires kanbanCardProvider list/mutate");
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

  async function submitWriting(input = {}) {
    const workspaceId = cleanString(input.workspaceId) || "owner";
    const cardIdValue = cleanString(input.cardId);
    const text = cleanString(input.text || input.submission || input.comment);
    if (!cardIdValue) return createError(400, "Growth card id is required");
    if (!text) return createError(400, "Writing submission text is required");
    if (text.length > maxSubmissionChars) return createError(413, `Writing submission is too long; keep it under ${maxSubmissionChars} characters`);
    const loaded = await loadGrowthCard(workspaceId, cardIdValue);
    if (!loaded.ok) return loaded;
    const stage = submissionStageForCard(loaded.card, input);
    const mutated = await kanbanCardProvider.mutateCard({
      action: "comment",
      workspaceId,
      cardId: cardIdValue,
      comment: text,
      author: cleanString(input.author) || "learning-growth",
      learningGrowthSubmission: true,
      submissionKind: stage === "draft" ? "writing_draft" : "writing_revision",
    });
    if (!mutated?.ok) return createError(mutated?.status || 502, cleanString(mutated?.error || mutated?.result?.error || "Unable to submit writing"));
    const evaluation = evaluationService.evaluate({
      card: loaded.card,
      cardId: cardIdValue,
      text,
      stage,
    });
    let report = null;
    try {
      report = reportService && typeof reportService.writeReport === "function"
        ? reportService.writeReport({ workspaceId, cardId: cardIdValue, card: loaded.card, evaluation })
        : null;
      if (report) evaluation.report = report;
    } catch (err) {
      evaluation.reportError = cleanString(err.message || err);
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
    const publicEval = publicEvaluation(evaluation, settlement);
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
    if (!evaluationMutation?.ok) return createError(evaluationMutation?.status || 502, cleanString(evaluationMutation?.error || "Unable to persist writing evaluation"));
    let completion = null;
    if (evaluation.passed) {
      completion = await kanbanCardProvider.mutateCard({
        action: "complete",
        workspaceId,
        cardId: cardIdValue,
        comment: `${evaluation.summary} ${publicEval.reward.status === "settled" ? `已结算 ${publicEval.reward.coinAmount} 金币。` : "金币待复核或稍后重试。"}`,
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
      },
    };
  }

  return {
    submitWriting,
  };
}

module.exports = {
  createLearningGrowthWritingSubmissionService,
  evaluationComment,
  submissionStageForCard,
};
