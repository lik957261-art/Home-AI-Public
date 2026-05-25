"use strict";

const crypto = require("node:crypto");
const {
  storageTitleForEvergreenClone,
} = require("./learning-growth-title-service");
const {
  createLearningGrowthNextCardStrategyService,
} = require("./learning-growth-next-card-strategy-service");

function cleanString(value, limit = 1000) {
  const text = String(value ?? "").trim();
  const max = Math.max(1, Number(limit || 1000) || 1000);
  return text.length > max ? text.slice(0, max) : text;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTimeMs(value) {
  const text = cleanString(value);
  if (!text) return 0;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function addHoursIso(value, hours) {
  const baseMs = parseTimeMs(value) || Date.now();
  const interval = Math.max(0, Number(hours || 0) || 0) * 60 * 60 * 1000;
  return new Date(baseMs + interval).toISOString();
}

function sequenceIndexForTask(task = {}, fallbackIndex = 0) {
  const values = [
    task.sequenceIndex,
    task.learningGrowthJitGeneration?.sequenceIndex,
    task.taskModel?.jitGeneration?.sequenceIndex,
    task.nativeState?.sequenceIndex,
    task.kanbanCaseCardIndex,
    task.caseCardIndex,
  ];
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return Math.max(1, Number(fallbackIndex || 0) + 1);
}

function sequenceGroupForTask(task = {}) {
  const explicit = cleanString(task.sequenceGroupId || task.sequence_group_id);
  if (explicit) return explicit;
  const programId = cleanString(task.programId || task.learningProgramId || task.learning_program_id);
  if (programId) return `program:${programId}`;
  const draftId = cleanString(task.draftId || task.learningDraftId || task.learning_draft_id);
  if (draftId) return `draft:${draftId}`;
  const taskCardId = cleanString(task.taskCardId || task.id);
  return taskCardId ? `task:${taskCardId}` : "task:unknown";
}

function taskCompleted(task = {}) {
  const status = cleanString(task.status || task.executionStatus).toLowerCase();
  return ["completed", "done", "closed", "archived"].includes(status);
}

function sortSequenceTasks(tasks = []) {
  return asArray(tasks)
    .map((task, index) => Object.assign({ _sequenceOrder: index }, task))
    .sort((a, b) => {
      const ai = sequenceIndexForTask(a, a._sequenceOrder);
      const bi = sequenceIndexForTask(b, b._sequenceOrder);
      if (ai !== bi) return ai - bi;
      const ad = cleanString(a.plannedDate || a.dueLocal || a.dueAt);
      const bd = cleanString(b.plannedDate || b.dueLocal || b.dueAt);
      if (ad !== bd) return ad < bd ? -1 : 1;
      return a._sequenceOrder - b._sequenceOrder;
    })
    .map(({ _sequenceOrder, ...task }) => task);
}

function listSequenceCandidates(programService, currentTask = {}) {
  if (!programService || typeof programService.listTaskCards !== "function") return [];
  const draftId = cleanString(currentTask.draftId || currentTask.learningDraftId || currentTask.learning_draft_id);
  const programId = cleanString(currentTask.programId || currentTask.learningProgramId || currentTask.learning_program_id);
  const explicitGroup = cleanString(currentTask.sequenceGroupId || currentTask.sequence_group_id);
  const learnerId = cleanString(currentTask.learnerId || currentTask.studentId);
  const workspaceId = cleanString(currentTask.workspaceId);
  const filters = { limit: 300 };
  if ((explicitGroup || programId) && programId) filters.programId = programId;
  if (!filters.programId && draftId) filters.draftId = draftId;
  if (learnerId) filters.learnerId = learnerId;
  if (workspaceId) filters.workspaceId = workspaceId;
  const groupId = sequenceGroupForTask(currentTask);
  return asArray(programService.listTaskCards(filters))
    .filter((task) => sequenceGroupForTask(task) === groupId);
}

function findNextSequenceTask(tasks = [], currentTask = {}) {
  const currentId = cleanString(currentTask.taskCardId || currentTask.id);
  const sorted = sortSequenceTasks(tasks);
  const currentIndex = sorted.findIndex((task) => cleanString(task.taskCardId || task.id) === currentId);
  const startIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
  return sorted.slice(startIndex).find((task) => cleanString(task.taskCardId || task.id) !== currentId && !taskCompleted(task)) || null;
}

function latestSequenceIndex(tasks = []) {
  return sortSequenceTasks(tasks).reduce((max, task, index) => Math.max(max, sequenceIndexForTask(task, index)), 0);
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === "object" && !Array.isArray(value)) || {};
}

function perpetualPolicyForTask(task = {}, program = {}, draft = {}) {
  const policy = firstObject(
    task.learningGrowthPerpetual,
    task.learningGrowthSequencePolicy,
    task.sequencePolicy,
    task.taskModel?.learningGrowthPerpetual,
    task.taskModel?.sequencePolicy,
    draft.learningGrowthPerpetual,
    draft.learningGrowthSequencePolicy,
    program.learningGrowthPerpetual,
    program.learningGrowthSequencePolicy,
  );
  const mode = cleanString(
    task.sequenceMode
      || task.learningGrowthSequenceMode
      || policy.mode
      || task.taskModel?.sequenceMode
      || task.taskModel?.learningGrowthSequenceMode,
  ).toLowerCase();
  const enabled = policy.enabled === true
    || policy.perpetual === true
    || task.perpetual === true
    || task.learningGrowthPerpetual === true
    || mode === "evergreen_jit"
    || mode === "perpetual"
    || mode === "continuous";
  if (!enabled) return { enabled: false, minIntervalHours: 0, mode };
  const minIntervalHours = Math.max(1, Math.min(168, Number(policy.minIntervalHours || policy.cadenceHours || task.minIntervalHours || 24) || 24));
  return {
    enabled: true,
    minIntervalHours,
    mode: mode || "evergreen_jit",
  };
}

function completionPolicyLearningSource(evaluation = {}) {
  if (!evaluation || typeof evaluation !== "object") return null;
  const score = numberValue(evaluation.score);
  const policy = evaluation.completionPolicy && typeof evaluation.completionPolicy === "object" ? evaluation.completionPolicy : {};
  const threeAttemptCompletion = cleanString(evaluation.completionDecision).toLowerCase() === "complete_current_card"
    && policy.threeSeriousSubmissionsComplete === true
    && numberValue(policy.attemptNo) >= 3;
  if (score >= 70 && !threeAttemptCompletion) return null;
  const weaknesses = asArray(evaluation.remainingWeaknesses).length
    ? asArray(evaluation.remainingWeaknesses)
    : asArray(evaluation.revisionRequirements);
  return {
    sourceRef: `evaluation:${cleanString(evaluation.evaluationId || "latest")}:completion-policy`,
    sourceType: "completion_policy_feedback",
    title: "Recent Growth completion policy feedback",
    summary: cleanString([
      `Previous card completed with low score ${score || 0}/100.`,
      threeAttemptCompletion ? "It needed three serious attempts, so lower the next difficulty and focus on repair." : "",
      weaknesses.slice(0, 3).map(cleanString).filter(Boolean).join(" "),
    ].filter(Boolean).join(" "), 220),
    tags: ["low score", "repair", "difficulty-down"],
  };
}

function withCompletionPolicyLearningState(state = null, evaluation = {}) {
  const source = completionPolicyLearningSource(evaluation);
  if (!source) return state;
  const base = state && typeof state === "object" ? state : {};
  return Object.assign({}, base, {
    sources: [source].concat(asArray(base.sources)).slice(0, 80),
  });
}

function evergreenTaskCardId(groupId, sequenceIndex, previousTaskCardId) {
  const digest = crypto
    .createHash("sha256")
    .update(`${cleanString(groupId)}:${Number(sequenceIndex || 0)}:${cleanString(previousTaskCardId)}`)
    .digest("hex")
    .slice(0, 16);
  return `ltask_${digest}`;
}

function cloneEvergreenTask(input = {}) {
  const currentTask = input.currentTask || {};
  const groupId = cleanString(input.groupId) || sequenceGroupForTask(currentTask);
  const sequenceIndex = Math.max(1, Number(input.sequenceIndex || 0) || 1);
  const previousTaskCardId = cleanString(input.previousTaskCardId || currentTask.taskCardId || currentTask.id);
  const completedAt = cleanString(input.completedAt);
  const availableAt = cleanString(input.availableAt);
  const taskModel = currentTask.taskModel && typeof currentTask.taskModel === "object"
    ? Object.assign({}, currentTask.taskModel)
    : {};
  delete taskModel.learnerInstruction;
  delete taskModel.instruction;
  delete taskModel.jitGeneration;
  return Object.assign({}, currentTask, {
    taskCardId: evergreenTaskCardId(groupId, sequenceIndex, previousTaskCardId),
    id: undefined,
    kanbanCardId: "",
    todoId: "",
    status: "published",
    sequenceGroupId: groupId,
    sequenceIndex,
    sequenceMode: "evergreen_jit",
    title: storageTitleForEvergreenClone(currentTask, sequenceIndex) || `Learning task ${sequenceIndex}`,
    plannedDate: availableAt.slice(0, 10),
    learnerInstruction: "",
    instruction: "",
    summary: cleanString(currentTask.summary || currentTask.title, 360),
    taskModel,
    completionPolicy: {
      scope: "learner_sequence",
      minIntervalHours: Math.max(1, Number(input.minIntervalHours || 24) || 24),
    },
    generatedAfterTaskCardId: previousTaskCardId,
    generatedAfterCompletionAt: completedAt,
    generatedAt: cleanString(input.generatedAt),
    availableAt,
    unlockAt: availableAt,
    nextCompletionAllowedAt: availableAt,
    learningGrowthUnlockAt: availableAt,
    learningGrowthSequenceVisibility: "current",
    learningGrowthGeneratedAfterTaskCardId: previousTaskCardId,
    learningGrowthGeneratedAfterCompletionAt: completedAt,
  });
}

function completionGateForTask(task = {}, options = {}) {
  const nowMs = parseTimeMs(options.nowIso || options.now || new Date().toISOString()) || Date.now();
  const unlockAt = cleanString(
    task.nextCompletionAllowedAt
      || task.learningGrowthUnlockAt
      || task.unlockAt
      || task.availableAt
      || task.notBefore,
  );
  const unlockMs = parseTimeMs(unlockAt);
  if (unlockMs && unlockMs > nowMs) {
    return {
      ok: false,
      status: "completion_window_locked",
      nextCompletionAllowedAt: unlockAt,
      retryAfterSeconds: Math.max(1, Math.ceil((unlockMs - nowMs) / 1000)),
    };
  }
  return { ok: true, status: "open" };
}

function publicNextTaskResult(result = {}) {
  return {
    ok: result.ok !== false,
    status: cleanString(result.status),
    previousTaskCardId: cleanString(result.previousTaskCardId),
    taskCardId: cleanString(result.taskCardId),
    sequenceIndex: numberValue(result.sequenceIndex),
    modelStatus: cleanString(result.modelStatus),
    generatedAt: cleanString(result.generatedAt),
    nextCompletionAllowedAt: cleanString(result.nextCompletionAllowedAt),
    decisionReportArtifactId: cleanString(result.decisionReportArtifactId),
    trajectoryId: cleanString(result.trajectoryId),
    nextCardStrategy: result.nextCardStrategy && typeof result.nextCardStrategy === "object" ? {
      strategy: cleanString(result.nextCardStrategy.strategy),
      difficultyBand: cleanString(result.nextCardStrategy.difficultyBand),
      gradeReference: cleanString(result.nextCardStrategy.gradeReference),
      targetSkillIds: asArray(result.nextCardStrategy.targetSkillIds).map(cleanString).filter(Boolean).slice(0, 12),
      supportSkillIds: asArray(result.nextCardStrategy.supportSkillIds).map(cleanString).filter(Boolean).slice(0, 12),
      reason: cleanString(result.nextCardStrategy.reason, 360),
    } : null,
    error: cleanString(result.error),
  };
}

function withDeliverableDirectory(card = {}, reportDirectoryForCard = null) {
  const existing = cleanString(card.deliverableDirectoryPath || card.artifactDirectoryPath || card.reportDirectoryPath, 2000);
  if (existing) {
    return Object.assign({}, card, {
      deliverableDirectoryPath: existing,
      artifactDirectoryPath: existing,
      reportDirectoryPath: existing,
    });
  }
  if (typeof reportDirectoryForCard !== "function") return card;
  const taskCardId = cleanString(card.taskCardId || card.id);
  if (!taskCardId) return card;
  const directoryPath = cleanString(reportDirectoryForCard(card.workspaceId, taskCardId, card), 2000);
  if (!directoryPath) return card;
  return Object.assign({}, card, {
    deliverableDirectoryPath: directoryPath,
    artifactDirectoryPath: directoryPath,
    reportDirectoryPath: directoryPath,
  });
}

function createLearningGrowthSequenceService(options = {}) {
  const getLearningProgramService = typeof options.getLearningProgramService === "function"
    ? options.getLearningProgramService
    : () => options.learningProgramService || null;
  const getJitTaskService = typeof options.getJitTaskService === "function"
    ? options.getJitTaskService
    : () => options.jitTaskService || null;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const decisionReportService = options.decisionReportService || null;
  const reportDirectoryForCard = typeof options.reportDirectoryForCard === "function" ? options.reportDirectoryForCard : null;
  const masteryProfileService = options.masteryProfileService || null;
  const nextCardStrategyService = options.nextCardStrategyService || createLearningGrowthNextCardStrategyService();

  async function prepareNextAfterCompletion(input = {}) {
    const programService = getLearningProgramService();
    if (!programService || typeof programService.getTaskCard !== "function") {
      return publicNextTaskResult({ ok: false, status: "program_service_unavailable", error: "Learning program service is unavailable" });
    }
    const currentTask = input.task || programService.getTaskCard(cleanString(input.taskCardId));
    const previousTaskCardId = cleanString(currentTask?.taskCardId || input.taskCardId);
    if (!currentTask || !previousTaskCardId) {
      return publicNextTaskResult({ ok: false, status: "task_not_found", previousTaskCardId, error: "Completed task was not found" });
    }
    let nextTask = null;
    try {
      const program = typeof programService.getProgram === "function" && currentTask.programId
        ? (programService.getProgram(currentTask.programId) || {})
        : {};
      const draft = typeof programService.repository?.getPlanDraft === "function" && currentTask.draftId
        ? (programService.repository.getPlanDraft(currentTask.draftId) || {})
        : {};
      const completedAt = cleanString(input.completedAt) || nowIso();
      const candidates = listSequenceCandidates(programService, currentTask);
      const groupId = sequenceGroupForTask(currentTask);
      const completedPolicy = perpetualPolicyForTask(currentTask, program, draft);
      const nextCompletionAllowedAt = completedPolicy.enabled ? addHoursIso(completedAt, completedPolicy.minIntervalHours) : "";
      if (typeof programService.repository?.upsertTaskCard === "function") {
        programService.repository.upsertTaskCard(Object.assign({}, currentTask, {
          status: "completed",
          completedAt,
          nextCompletionAllowedAt,
          sequenceGroupId: groupId,
        }));
      }
      nextTask = findNextSequenceTask(candidates.concat([Object.assign({}, currentTask, { status: "completed" })]), currentTask);
      let createdEvergreen = false;
      if (!nextTask) {
        if (!completedPolicy.enabled) {
          return publicNextTaskResult({ ok: true, status: "no_next_task", previousTaskCardId, generatedAt: completedAt });
        }
        createdEvergreen = true;
        nextTask = cloneEvergreenTask({
          currentTask,
          groupId,
          sequenceIndex: latestSequenceIndex(candidates.concat([currentTask])) + 1,
          previousTaskCardId,
          completedAt,
          generatedAt: completedAt,
          availableAt: nextCompletionAllowedAt,
          minIntervalHours: completedPolicy.minIntervalHours,
        });
      }
      const jitTaskService = getJitTaskService();
      if (!jitTaskService || typeof jitTaskService.prepareTaskForCard !== "function") {
        return publicNextTaskResult({ ok: false, status: "jit_unavailable", previousTaskCardId, taskCardId: nextTask.taskCardId, error: "Growth JIT task service is unavailable" });
      }
      const sequenceIndex = sequenceIndexForTask(nextTask);
      const baseRecentLearningState = typeof jitTaskService.recentLearningState === "function"
        ? jitTaskService.recentLearningState({
          program,
          draft,
          workspaceId: cleanString(input.workspaceId || currentTask.workspaceId || program.workspaceId),
          learnerId: cleanString(input.learnerId || currentTask.learnerId || program.learnerId || currentTask.workspaceId),
          completedTask: currentTask,
        })
        : null;
      const recentLearningState = withCompletionPolicyLearningState(baseRecentLearningState, input.completedEvaluation);
      const learnerId = cleanString(input.learnerId || nextTask.learnerId || currentTask.learnerId || program.learnerId || nextTask.workspaceId);
      const workspaceId = cleanString(input.workspaceId || nextTask.workspaceId || currentTask.workspaceId || program.workspaceId);
      const masteryProjection = masteryProfileService && typeof masteryProfileService.projectForNextCard === "function"
        ? masteryProfileService.projectForNextCard({
          learnerId,
          workspaceId,
          sequenceGroupId: groupId,
          domain: cleanString(currentTask.domain || program.domain),
          recentLimit: 8,
        })
        : null;
      const nextCardStrategy = nextCardStrategyService && typeof nextCardStrategyService.recommendNextCardStrategy === "function"
        ? nextCardStrategyService.recommendNextCardStrategy({
          learnerId,
          workspaceId,
          sequenceGroupId: groupId,
          currentTask,
          latestEvaluation: input.completedEvaluation || {},
          latestReflection: input.completedReflection || {},
          masteryProfile: masteryProjection || {},
          recentTrajectory: masteryProjection?.recentTrajectory || [],
        })
        : null;
      const strategyLearningState = Object.assign({}, recentLearningState || {}, {
        masteryProfile: masteryProjection || null,
        nextCardStrategy: nextCardStrategy || null,
        recentTrajectory: masteryProjection?.recentTrajectory || [],
      });
      const prepared = await jitTaskService.prepareTaskForCard({
        program,
        draft,
        task: nextTask,
        workspaceId,
        learnerId,
        sequenceIndex,
        recentLearningState: strategyLearningState,
      });
      const generatedAt = nowIso();
      const updated = withDeliverableDirectory(Object.assign({}, nextTask, prepared, {
        status: cleanString(nextTask.status) || "published",
        sequenceGroupId: groupId,
        learningGrowthGeneratedAfterTaskCardId: previousTaskCardId,
        learningGrowthGeneratedAfterCompletionAt: completedAt,
        learningGrowthSequenceVisibility: "current",
        generatedAfterTaskCardId: previousTaskCardId,
        generatedAfterCompletionAt: completedAt,
        generatedAt,
        nextCompletionAllowedAt: cleanString(nextTask.nextCompletionAllowedAt),
        learningGrowthSequenceDecision: nextCardStrategy || null,
        generatedFromMasteryProfileVersion: masteryProjection?.taxonomyVersion || "",
      }), reportDirectoryForCard);
      const saved = typeof programService.repository?.upsertTaskCard === "function"
        ? programService.repository.upsertTaskCard(updated)
        : updated;
      let trajectory = null;
      if (typeof programService.repository?.upsertCardTrajectory === "function" && nextCardStrategy) {
        trajectory = programService.repository.upsertCardTrajectory({
          learnerId,
          workspaceId,
          sequenceGroupId: groupId,
          taskCardId: previousTaskCardId,
          sequenceIndex: sequenceIndexForTask(currentTask),
          nextTaskCardId: saved.taskCardId || nextTask.taskCardId,
          nextSequenceIndex: sequenceIndex,
          strategy: nextCardStrategy.strategy,
          difficultyBand: nextCardStrategy.difficultyBand,
          gradeReference: nextCardStrategy.gradeReference,
          targetSkillIds: nextCardStrategy.targetSkillIds,
          supportSkillIds: nextCardStrategy.supportSkillIds,
          performanceSummary: nextCardStrategy.reason,
          recommendation: {
            strategy: nextCardStrategy.strategy,
            difficultyAdjustment: nextCardStrategy.difficultyAdjustment,
            allowAboveGrade: nextCardStrategy.allowAboveGrade,
            supportLevel: nextCardStrategy.supportLevel,
            transferLevel: nextCardStrategy.transferLevel,
          },
          masteryChanges: input.masteryChanges || null,
          sourceBasisRefs: nextCardStrategy.evidenceBasis?.sourceRefs || [],
          raw: {
            source: "learning_growth_sequence_service",
            createdEvergreen,
            evidenceBasis: nextCardStrategy.evidenceBasis || null,
          },
        });
      }
      let decisionReport = null;
      if (decisionReportService && typeof decisionReportService.writeReport === "function") {
        decisionReport = decisionReportService.writeReport({
          program,
          draft,
          task: saved,
          previousTaskCardId,
          sequenceGroupId: groupId,
          workspaceId: cleanString(input.workspaceId || saved.workspaceId || currentTask.workspaceId || program.workspaceId),
        });
        if (decisionReport && typeof programService.repository?.saveTaskArtifact === "function") {
          programService.repository.saveTaskArtifact({
            artifactId: decisionReport.artifactId,
            taskCardId: saved.taskCardId || nextTask.taskCardId,
            sessionId: "",
            evaluationId: "",
            submissionId: "",
            reflectionId: "",
            programId: saved.programId || program.programId || "",
            learnerId: saved.learnerId || program.learnerId || saved.workspaceId || "",
            workspaceId: saved.workspaceId || program.workspaceId || "",
            artifactType: "jit_decision_report",
            title: decisionReport.title || "AI JIT decision report",
            name: decisionReport.name,
            mime: decisionReport.mime,
            size: Number(decisionReport.size || 0) || 0,
            refDigest: crypto.createHash("sha256").update(cleanString(decisionReport.path || decisionReport.name)).digest("hex"),
            refName: decisionReport.name,
            status: "generated",
            summary: decisionReport.summary || "AI JIT decision report generated.",
            createdAt: decisionReport.createdAt || generatedAt,
            raw: {
              source: "learning_growth_jit_decision_report",
              name: decisionReport.name,
              mime: decisionReport.mime,
              size: Number(decisionReport.size || 0) || 0,
            },
          });
        }
      }
      return publicNextTaskResult({
        ok: true,
        status: createdEvergreen ? "next_task_created" : "next_task_prepared",
        previousTaskCardId,
        taskCardId: saved.taskCardId || nextTask.taskCardId,
        sequenceIndex,
        modelStatus: saved.learningGrowthJitGeneration?.modelStatus || saved.taskModel?.jitGeneration?.modelStatus,
        generatedAt,
        nextCompletionAllowedAt: saved.nextCompletionAllowedAt,
        decisionReportArtifactId: decisionReport?.artifactId,
        trajectoryId: trajectory?.trajectoryId,
        nextCardStrategy,
      });
    } catch (err) {
      return publicNextTaskResult({
        ok: false,
        status: "next_task_prepare_failed",
        previousTaskCardId,
        taskCardId: nextTask?.taskCardId,
        error: cleanString(err.message || err, 240),
      });
    }
  }

  return {
    completionGateForTask,
    prepareNextAfterCompletion,
  };
}

module.exports = {
  cloneEvergreenTask,
  completionGateForTask,
  createLearningGrowthSequenceService,
  findNextSequenceTask,
  perpetualPolicyForTask,
  publicNextTaskResult,
  sequenceGroupForTask,
  sequenceIndexForTask,
  sortSequenceTasks,
};
