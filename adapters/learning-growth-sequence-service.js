"use strict";

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
  const draftId = cleanString(task.draftId || task.learningDraftId || task.learning_draft_id);
  if (draftId) return `draft:${draftId}`;
  const programId = cleanString(task.programId || task.learningProgramId || task.learning_program_id);
  if (programId) return `program:${programId}`;
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
  const learnerId = cleanString(currentTask.learnerId || currentTask.studentId);
  const workspaceId = cleanString(currentTask.workspaceId);
  const filters = { limit: 300 };
  if (draftId) filters.draftId = draftId;
  if (!draftId && programId) filters.programId = programId;
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
  return sorted.slice(startIndex).find((task) => !taskCompleted(task)) || null;
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
    error: cleanString(result.error),
  };
}

function createLearningGrowthSequenceService(options = {}) {
  const getLearningProgramService = typeof options.getLearningProgramService === "function"
    ? options.getLearningProgramService
    : () => options.learningProgramService || null;
  const getJitTaskService = typeof options.getJitTaskService === "function"
    ? options.getJitTaskService
    : () => options.jitTaskService || null;
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();

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
    const candidates = listSequenceCandidates(programService, currentTask);
    const nextTask = findNextSequenceTask(candidates.concat([currentTask]), currentTask);
    if (!nextTask) {
      return publicNextTaskResult({ ok: true, status: "no_next_task", previousTaskCardId });
    }
    const jitTaskService = getJitTaskService();
    if (!jitTaskService || typeof jitTaskService.prepareTaskForCard !== "function") {
      return publicNextTaskResult({ ok: false, status: "jit_unavailable", previousTaskCardId, taskCardId: nextTask.taskCardId, error: "Growth JIT task service is unavailable" });
    }
    try {
      const program = typeof programService.getProgram === "function" && currentTask.programId
        ? (programService.getProgram(currentTask.programId) || {})
        : {};
      const draft = typeof programService.repository?.getPlanDraft === "function" && currentTask.draftId
        ? (programService.repository.getPlanDraft(currentTask.draftId) || {})
        : {};
      const sequenceIndex = sequenceIndexForTask(nextTask);
      const recentLearningState = typeof jitTaskService.recentLearningState === "function"
        ? jitTaskService.recentLearningState({
          program,
          draft,
          workspaceId: cleanString(input.workspaceId || currentTask.workspaceId || program.workspaceId),
          learnerId: cleanString(input.learnerId || currentTask.learnerId || program.learnerId || currentTask.workspaceId),
          completedTask: currentTask,
        })
        : null;
      const prepared = await jitTaskService.prepareTaskForCard({
        program,
        draft,
        task: nextTask,
        workspaceId: cleanString(input.workspaceId || nextTask.workspaceId || currentTask.workspaceId || program.workspaceId),
        learnerId: cleanString(input.learnerId || nextTask.learnerId || currentTask.learnerId || program.learnerId || nextTask.workspaceId),
        sequenceIndex,
        recentLearningState,
      });
      const generatedAt = nowIso();
      const updated = Object.assign({}, nextTask, prepared, {
        status: cleanString(nextTask.status) || "published",
        learningGrowthGeneratedAfterTaskCardId: previousTaskCardId,
        learningGrowthGeneratedAfterCompletionAt: generatedAt,
        learningGrowthSequenceVisibility: "current",
      });
      const saved = typeof programService.repository?.upsertTaskCard === "function"
        ? programService.repository.upsertTaskCard(updated)
        : updated;
      return publicNextTaskResult({
        ok: true,
        status: "next_task_prepared",
        previousTaskCardId,
        taskCardId: saved.taskCardId || nextTask.taskCardId,
        sequenceIndex,
        modelStatus: saved.learningGrowthJitGeneration?.modelStatus || saved.taskModel?.jitGeneration?.modelStatus,
        generatedAt,
      });
    } catch (err) {
      return publicNextTaskResult({
        ok: false,
        status: "next_task_prepare_failed",
        previousTaskCardId,
        taskCardId: nextTask.taskCardId,
        error: cleanString(err.message || err, 240),
      });
    }
  }

  return {
    prepareNextAfterCompletion,
  };
}

module.exports = {
  createLearningGrowthSequenceService,
  findNextSequenceTask,
  publicNextTaskResult,
  sequenceGroupForTask,
  sequenceIndexForTask,
  sortSequenceTasks,
};
