"use strict";

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
    "Complete this task in the Fanfan Growth flow before marking it done.",
  ].filter(Boolean).join("\n\n");
}

function learningGrowthKanbanCards(program = {}, draft = {}) {
  const timeOfDay = normalizeTime(program.timeOfDay || "19:30");
  const cards = [];
  for (const [dayOffset, day] of asArray(draft.dailyPlans).entries()) {
    const date = cleanString(day.date) || cleanString(draft.weekStart) || cleanString(program.startDate);
    for (const [taskOffset, task] of asArray(day.tasks).entries()) {
      const clientId = cleanString(task.taskId) || `growth-day-${dayOffset + 1}-task-${taskOffset + 1}`;
      const title = cleanString(task.title) || `Growth task ${cards.length + 1}`;
      const description = taskCardDescription(task);
      cards.push({
        clientId,
        title,
        day: Number(day.dayIndex || dayOffset + 1) || dayOffset + 1,
        dueTime: date ? `${date} ${addMinutesToTime(timeOfDay, taskOffset * 5)}` : "",
        description,
        deliverables: asArray(task.deliverables).map(cleanString).filter(Boolean),
        acceptance: asArray(task.acceptance).map(cleanString).filter(Boolean),
        caseTemplate: "learning-growth",
      });
    }
  }
  return cards;
}

function createLearningProgramPublishService(options = {}) {
  const createKanbanStudyPlanCards = options.createKanbanStudyPlanCards;
  if (typeof createKanbanStudyPlanCards !== "function") {
    throw new Error("learning program publish service requires createKanbanStudyPlanCards");
  }

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
      compactTaskSummary(draft),
    ].filter(Boolean).join("\n");
    const cards = learningGrowthKanbanCards(program, draft);
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
    return {
      ok: Boolean(result?.ok),
      source: "learning-program",
      workspaceId,
      learnerId,
      kanbanResult: result,
    };
  }

  return {
    publish,
  };
}

module.exports = {
  createLearningProgramPublishService,
};
