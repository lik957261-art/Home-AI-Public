"use strict";

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function compactTaskSummary(draft = {}) {
  return asArray(draft.dailyPlans).map((day) => {
    const titles = asArray(day.tasks).slice(0, 4).map((task) => cleanString(task.title || task.taskId)).filter(Boolean);
    return `${day.date}: ${titles.join(" / ")}`;
  }).filter(Boolean).join("\n");
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
    const result = await createKanbanStudyPlanCards(workspaceId, {
      workspaceId,
      studyTemplate: "study",
      title: cleanString(program.title) || "Fanfan learning growth plan",
      learnerName: cleanString(program.learnerName) || "\u51e1\u51e1",
      subject: program.domain === "english" ? "English Growth" : cleanString(program.domain) || "Learning Growth",
      activity: "AI-guided daily learning tasks with explanation, revision, repair, and reward settlement.",
      submissionLabel: "recording, short writing, answers, reflection",
      sourceText,
      sessions: asArray(draft.dailyPlans).length || Number(program.daysPerWeek || 5),
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
