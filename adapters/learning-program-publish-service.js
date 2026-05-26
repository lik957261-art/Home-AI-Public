"use strict";

const { stableTaskCardId } = require("./learning-task-card-service");
const {
  LEARNING_GROWTH_CARD_CREATION_SKILL_ID,
} = require("./learning-plan-decomposition-service");

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function normalizeTime(value) {
  const text = cleanString(value);
  const match = text.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return "19:30";
  const hour = Math.max(0, Math.min(23, Number(match[1]) || 0));
  const minute = Math.max(0, Math.min(59, Number(match[2]) || 0));
  return `${pad2(hour)}:${pad2(minute)}`;
}

function addMinutesToTime(timeOfDay, offsetMinutes = 0) {
  const [hour, minute] = normalizeTime(timeOfDay).split(":").map((part) => Number(part) || 0);
  const total = Math.max(0, Math.min((23 * 60) + 59, (hour * 60) + minute + Math.max(0, Number(offsetMinutes) || 0)));
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

function plannedDateTime(date, timeOfDay) {
  const day = cleanString(date);
  const time = normalizeTime(timeOfDay);
  return day ? `${day} ${time}` : "";
}

function compactTaskSummary(draft = {}) {
  return asArray(draft.dailyPlans).map((day) => {
    const titles = asArray(day.tasks).slice(0, 4).map((task) => cleanString(task.title || task.taskId)).filter(Boolean);
    return `${day.date}: ${titles.join(" / ")}`;
  }).filter(Boolean).join("\n");
}

function taskInstruction(task = {}) {
  return cleanString(task.learnerInstruction || task.instruction || task.learnerPrompt || task.prompt || task.taskPrompt || task.instructions || task.summary || "");
}

function taskCardDescription(task = {}) {
  const instruction = taskInstruction(task);
  const flow = asArray(task.interactionStateMachine).slice(0, 8).map(cleanString).filter(Boolean).join(" -> ");
  return [
    instruction ? `Task instruction:\n${instruction}` : "",
    Number(task.plannedMinutes) ? `Planned time: ${Number(task.plannedMinutes)} minutes.` : "",
    flow ? `Interaction flow: ${flow}.` : "",
  ].filter(Boolean).join("\n\n");
}

function stripFutureGeneratedInstruction(task = {}, sequenceIndex = 0) {
  const taskModel = task.taskModel && typeof task.taskModel === "object"
    ? Object.assign({}, task.taskModel)
    : task.taskModel;
  if (taskModel && typeof taskModel === "object") {
    delete taskModel.learnerInstruction;
    delete taskModel.instruction;
    delete taskModel.jitGeneration;
    delete taskModel.teachingFlow;
  }
  const stripped = Object.assign({}, task, {
    sequenceIndex,
    learningGrowthJitPending: true,
    learningGrowthSequenceVisibility: "locked_future",
    taskModel,
  });
  delete stripped.learnerInstruction;
  delete stripped.instruction;
  delete stripped.learnerPrompt;
  delete stripped.prompt;
  delete stripped.taskPrompt;
  delete stripped.instructions;
  delete stripped.teachingFlow;
  return stripped;
}

async function prepareDraftForCardCreation(program = {}, draft = {}, options = {}) {
  const jitTaskService = options.jitTaskService || null;
  if (!jitTaskService || typeof jitTaskService.prepareTaskForCard !== "function") return draft;
  const recentLearningState = options.recentLearningState || null;
  const prepareOnlyCurrent = options.prepareOnlyCurrent !== false;
  let sequenceIndex = 0;
  const dailyPlans = [];
  for (const day of asArray(draft.dailyPlans)) {
    const tasks = [];
    for (const task of asArray(day.tasks)) {
      sequenceIndex += 1;
      if (prepareOnlyCurrent && sequenceIndex > 1) {
        tasks.push(stripFutureGeneratedInstruction(task, sequenceIndex));
        continue;
      }
      tasks.push(await jitTaskService.prepareTaskForCard({
        program,
        draft,
        day,
        task,
        sequenceIndex,
        recentLearningState,
      }));
    }
    dailyPlans.push(Object.assign({}, day, { tasks }));
  }
  return Object.assign({}, draft, { dailyPlans });
}

async function learningGrowthKanbanCards(program = {}, draft = {}, options = {}) {
  const timeOfDay = normalizeTime(program.timeOfDay || "19:30");
  const preparedDraft = await prepareDraftForCardCreation(program, draft, options);
  const cards = [];
  for (const [dayOffset, day] of asArray(preparedDraft.dailyPlans).entries()) {
    const date = cleanString(day.date) || cleanString(draft.weekStart) || cleanString(program.startDate);
    for (const [taskOffset, task] of asArray(day.tasks).entries()) {
      const clientId = cleanString(task.taskId) || `growth-day-${dayOffset + 1}-task-${taskOffset + 1}`;
      const title = cleanString(task.title) || `Growth task ${cards.length + 1}`;
      const description = taskCardDescription(task);
      const plannedTime = addMinutesToTime(timeOfDay, taskOffset * 5);
      const scheduledAt = plannedDateTime(date, plannedTime);
      const previousCard = cards[cards.length - 1] || null;
      const dependsOn = previousCard ? [previousCard.clientId] : [];
      cards.push({
        clientId,
        sequenceIndex: cards.length + 1,
        dependsOn,
        caseDependsOn: dependsOn,
        kanbanCaseDependsOn: dependsOn,
        learningProgramId: cleanString(program.programId),
        learningDraftId: cleanString(preparedDraft.draftId),
        learningTaskCardId: cleanString(preparedDraft.draftId) ? stableTaskCardId(preparedDraft.draftId, clientId) : "",
        sequenceGroupId: cleanString(task.sequenceGroupId),
        sequenceMode: cleanString(task.sequenceMode || task.learningGrowthSequenceMode),
        learningGrowthJitPending: Boolean(task.learningGrowthJitPending),
        learningGrowthSequenceVisibility: cleanString(task.learningGrowthSequenceVisibility),
        skillIds: asArray(task.skillIds).map(cleanString).filter(Boolean),
        templateId: cleanString(task.templateId),
        taskCardType: cleanString(task.taskCardType),
        interactionStateMachine: asArray(task.interactionStateMachine).map(cleanString).filter(Boolean),
        taskModel: task.taskModel && typeof task.taskModel === "object" ? task.taskModel : null,
        cardCreationSkillId: cleanString(task.cardCreationSkillId) || LEARNING_GROWTH_CARD_CREATION_SKILL_ID,
        title,
        day: Number(day.dayIndex || dayOffset + 1) || dayOffset + 1,
        plannedDate: date,
        plannedTime,
        dueTime: scheduledAt,
        releaseAt: scheduledAt,
        openAt: scheduledAt,
        availableAt: scheduledAt,
        scheduledAt,
        description,
        deliverables: asArray(task.deliverables).map(cleanString).filter(Boolean),
        acceptance: asArray(task.acceptance).map(cleanString).filter(Boolean),
        caseTemplate: "learning-growth",
      });
    }
  }
  return { cards, draft: preparedDraft };
}

function createLearningProgramPublishService(options = {}) {
  const createKanbanStudyPlanCards = options.createKanbanStudyPlanCards;
  if (typeof createKanbanStudyPlanCards !== "function") {
    throw new Error("learning program publish service requires createKanbanStudyPlanCards");
  }
  const directoryMaterializationService = options.directoryMaterializationService || null;
  const jitTaskService = options.jitTaskService || null;

  async function publish(input = {}) {
    const program = input.program || {};
    const draft = input.draft || {};
    const reliability = draft.reliability || {};
    if (reliability.publishBlocked) {
      const err = new Error("Draft is blocked by reliability guard");
      err.status = 409;
      throw err;
    }
    const workspaceId = cleanString(program.workspaceId) || "owner";
    const learnerId = cleanString(program.learnerId) || workspaceId;
    const sourceText = [
      `Learning program: ${cleanString(program.title) || program.programId}`,
      `Goal: ${cleanString(program.goalSummary)}`,
      `Scope: ${asArray(program.focusAreas).join(", ")}`,
      `Week: ${draft.weekStart || ""} to ${draft.weekEnd || ""}`,
      `Card creation skill: study-templates/${LEARNING_GROWTH_CARD_CREATION_SKILL_ID}`,
      compactTaskSummary(draft),
    ].filter(Boolean).join("\n");
    const recentLearningState = jitTaskService && typeof jitTaskService.recentLearningState === "function"
      ? jitTaskService.recentLearningState({ program, draft, workspaceId, learnerId })
      : null;
    const prepared = await learningGrowthKanbanCards(program, draft, { jitTaskService, recentLearningState });
    const cards = prepared.cards;
    const result = await createKanbanStudyPlanCards(workspaceId, {
      workspaceId,
      studyTemplate: "learning-growth",
      caseTemplate: "learning-growth",
      title: cleanString(program.title) || "Fanfan learning growth plan",
      learnerName: cleanString(program.learnerName) || "\u51e1\u51e1",
      subject: program.domain === "english" ? "English Growth" : cleanString(program.domain) || "Learning Growth",
      activity: "AI-guided daily learning tasks with explanation, revision, repair, and reward settlement.",
      submissionLabel: "answer, short writing, reflection, or oral response inside Fanfan Growth",
      sourceText,
      sessions: cards.length || asArray(draft.dailyPlans).length || Number(program.daysPerWeek || 5),
      cards,
      startDate: program.startDate || draft.weekStart || "",
      timeOfDay: program.timeOfDay || "19:30",
      performerWorkspaceIds: [learnerId],
      viewerWorkspaceIds: [learnerId],
      managerWorkspaceIds: ["owner"],
      source: "learning-program",
      learningProgramId: program.programId,
      learningDraftId: draft.draftId,
      learningTaskCount: draft.taskCount,
    });
    let materialized = null;
    if (directoryMaterializationService && typeof directoryMaterializationService.materializeProgram === "function") {
      try {
        materialized = directoryMaterializationService.materializeProgram({
          workspaceId,
          learnerId,
          program,
          draft,
          kanbanResult: result,
        });
      } catch (err) {
        materialized = { ok: false, error: cleanString(err.message || err) };
      }
    }
    return {
      ok: Boolean(result?.ok),
      source: "learning-program",
      workspaceId,
      learnerId,
      kanbanResult: result,
      materialized,
      draft: prepared.draft,
    };
  }

  return {
    publish,
  };
}

module.exports = {
  createLearningProgramPublishService,
  learningGrowthKanbanCards,
  prepareDraftForCardCreation,
  stripFutureGeneratedInstruction,
};
