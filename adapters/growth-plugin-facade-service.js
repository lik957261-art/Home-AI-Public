"use strict";

function cleanString(value, limit = 1000) {
  const text = String(value ?? "").trim();
  const max = Math.max(1, Number(limit || 1000) || 1000);
  return text.length > max ? text.slice(0, max) : text;
}

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function boundedSubmission(submission) {
  if (!submission) return null;
  return {
    submissionId: cleanString(submission.submissionId || submission.id),
    taskCardId: cleanString(submission.taskCardId),
    status: cleanString(submission.status),
    submissionKind: cleanString(submission.submissionKind || submission.kind),
    submittedAt: cleanString(submission.submittedAt || submission.createdAt),
    submissionCount: numberValue(submission.submissionCount),
    totalSubmissionCount: numberValue(submission.totalSubmissionCount),
  };
}

function boundedEvaluation(evaluation) {
  if (!evaluation) return null;
  return {
    evaluationId: cleanString(evaluation.evaluationId || evaluation.id),
    taskCardId: cleanString(evaluation.taskCardId),
    status: cleanString(evaluation.status),
    score: numberValue(evaluation.score),
    maxScore: numberValue(evaluation.maxScore || evaluation.max_score || 100),
    passed: Boolean(evaluation.passed),
    summary: cleanString(evaluation.summary, 700),
    nextStep: cleanString(evaluation.nextStep || evaluation.next_step, 240),
    evaluatedAt: cleanString(evaluation.evaluatedAt || evaluation.createdAt),
    evaluationCount: numberValue(evaluation.evaluationCount),
    totalEvaluationCount: numberValue(evaluation.totalEvaluationCount),
  };
}

function boundedReflection(reflection) {
  if (!reflection) return null;
  return {
    reflectionId: cleanString(reflection.reflectionId || reflection.id),
    taskCardId: cleanString(reflection.taskCardId),
    status: cleanString(reflection.status),
    mode: cleanString(reflection.mode),
    score: numberValue(reflection.score),
    summary: cleanString(reflection.summary, 700),
    submittedAt: cleanString(reflection.submittedAt || reflection.createdAt),
  };
}

function boundedCard(card = {}) {
  return {
    taskCardId: cleanString(card.taskCardId),
    todoId: cleanString(card.todoId),
    source: cleanString(card.source),
    workspaceId: cleanString(card.workspaceId),
    programId: cleanString(card.programId),
    draftId: cleanString(card.draftId),
    sequenceGroupId: cleanString(card.sequenceGroupId),
    sequenceMode: cleanString(card.sequenceMode),
    sequenceIndex: numberValue(card.sequenceIndex),
    title: cleanString(card.title, 180),
    instructionPreview: cleanString(card.instructionPreview, 260),
    domain: cleanString(card.domain),
    activityType: cleanString(card.activityType),
    cardRole: cleanString(card.cardRole),
    capabilityClusterId: cleanString(card.capabilityClusterId),
    expectedDurationMinutes: card.expectedDurationMinutes || null,
    stageAssessmentCycleId: cleanString(card.stageAssessmentCycleId),
    activationState: cleanString(card.activationState),
    plannedDate: cleanString(card.plannedDate),
    openedAt: cleanString(card.openedAt),
    generatedAt: cleanString(card.generatedAt),
    plannedMinutes: numberValue(card.plannedMinutes),
    status: cleanString(card.status),
    completedAt: cleanString(card.completedAt),
    nextCompletionAllowedAt: cleanString(card.nextCompletionAllowedAt),
    nextAction: cleanString(card.nextAction),
    laneId: cleanString(card.laneId),
    submissionCount: numberValue(card.submissionCount),
    evaluationCount: numberValue(card.evaluationCount),
    latestSubmission: boundedSubmission(card.latestSubmission),
    latestEvaluation: boundedEvaluation(card.latestEvaluation),
    latestReflection: boundedReflection(card.latestReflection),
    artifactCount: numberValue(card.artifactCount),
    artifactPreview: arrayValue(card.artifactPreview).slice(0, 3).map((artifact) => ({
      artifactId: cleanString(artifact.artifactId),
      artifactType: cleanString(artifact.artifactType),
      title: cleanString(artifact.title, 160),
      name: cleanString(artifact.name, 160),
      mime: cleanString(artifact.mime, 120),
      size: numberValue(artifact.size),
      status: cleanString(artifact.status),
    })),
    rewardState: cleanString(card.rewardState),
    rewardCapCoins: numberValue(card.rewardCapCoins),
    primaryAction: cleanString(card.primaryAction),
    actions: card.actions && typeof card.actions === "object" ? {
      canSubmit: Boolean(card.actions.canSubmit),
      canWithdraw: Boolean(card.actions.canWithdraw),
      canReflect: Boolean(card.actions.canReflect),
      canOpenArtifacts: Boolean(card.actions.canOpenArtifacts),
      primaryAction: cleanString(card.actions.primaryAction),
    } : null,
  };
}

function boundedBoard(board = {}) {
  const cards = arrayValue(board.cards).map(boundedCard);
  const visibleIds = new Set(cards.map((card) => card.taskCardId).filter(Boolean));
  return {
    learner: board.learner || null,
    role: cleanString(board.role) || "executor",
    summary: board.summary || null,
    lanes: arrayValue(board.lanes).map((lane) => ({
      id: cleanString(lane.id),
      title: cleanString(lane.title, 120),
      count: numberValue(lane.count),
      cards: arrayValue(lane.cards).map(cleanString).filter((id) => visibleIds.has(id)),
    })),
    cards,
    coins: board.coins ? {
      balances: board.coins.balances || null,
      growth: board.coins.growth || null,
    } : null,
    guidanceWindow: board.guidanceWindow || null,
    ownerPanel: board.ownerPanel || null,
  };
}

function createGrowthPluginFacadeService(options = {}) {
  const learningGrowthService = options.learningGrowthService || null;
  const learningGrowthBoardService = options.learningGrowthBoardService || null;
  if (!learningGrowthService || typeof learningGrowthService.overview !== "function") {
    throw new Error("growth plugin facade requires learningGrowthService.overview");
  }
  if (!learningGrowthBoardService || typeof learningGrowthBoardService.board !== "function") {
    throw new Error("growth plugin facade requires learningGrowthBoardService.board");
  }

  function board(input = {}) {
    const projection = learningGrowthBoardService.board(input);
    return {
      facadeVersion: 1,
      pluginId: "growth",
      dataOwner: "home-ai",
      migrationStage: "host_facade",
      learner: projection.learner || projection.board?.learner || null,
      board: boundedBoard(projection.board || {}),
    };
  }

  return {
    status(input = {}) {
      const overview = learningGrowthService.overview(input);
      return {
        facadeVersion: 1,
        pluginId: "growth",
        dataOwner: "home-ai",
        pluginDataOwner: "not_migrated",
        migrationStage: "host_facade",
        learner: overview.learner || null,
        module: overview.module || null,
        operationalReadiness: overview.operationalReadiness || null,
        launchOperations: overview.launchOperations || null,
      };
    },

    board,

    card(input = {}) {
      const taskCardId = cleanString(input.taskCardId);
      const projected = board(input);
      const card = arrayValue(projected.board.cards).find((item) => item.taskCardId === taskCardId) || null;
      return Object.assign({}, projected, { card });
    },
  };
}

module.exports = {
  boundedBoard,
  boundedCard,
  createGrowthPluginFacadeService,
};
