"use strict";

const ALLOWED_TASK_CARD_TYPES = new Set([
  "single_subject",
  "cross_subject",
  "project_card",
  "mistake_repair_card",
  "challenge_card",
  "review_card",
]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function createFlag(code, message, severity = "review") {
  return { code, message, severity };
}

function createLearningAiReliabilityGuardService(options = {}) {
  const maxMinutesPerDay = Number(options.maxMinutesPerDay || 60);

  function evaluatePlanDraft(input = {}) {
    const program = input.program || {};
    const draft = input.draft || {};
    const flags = [];
    const dailyPlans = asArray(draft.dailyPlans);
    const tasks = dailyPlans.flatMap((day) => asArray(day.tasks));
    const sourceBasisRefs = asArray(program.sourceBasisRefs).filter(Boolean);
    const curriculumRefs = asArray(program.curriculumRefs).filter(Boolean);

    if (!tasks.length) flags.push(createFlag("no_tasks", "Draft has no task cards.", "block"));
    if (!sourceBasisRefs.length) flags.push(createFlag("missing_source_basis", "Program has no evidence source references.", "block"));
    if (!curriculumRefs.length) flags.push(createFlag("missing_curriculum_refs", "Program has no curriculum reference layer.", "review"));
    if (Number(program.minutesPerDay || 0) > maxMinutesPerDay) {
      flags.push(createFlag("high_daily_load", `Daily learning load exceeds ${maxMinutesPerDay} minutes.`, "review"));
    }

    for (const task of tasks) {
      if (!ALLOWED_TASK_CARD_TYPES.has(cleanString(task.taskCardType))) {
        flags.push(createFlag("unsupported_task_card_type", `Unsupported task card type: ${cleanString(task.taskCardType)}`, "block"));
      }
      if (!asArray(task.sourceBasisRefs).length) flags.push(createFlag("task_missing_source_basis", `Task ${cleanString(task.taskId)} has no source basis.`, "block"));
      if (!asArray(task.curriculumRefs).length) flags.push(createFlag("task_missing_curriculum_refs", `Task ${cleanString(task.taskId)} has no curriculum references.`, "review"));
      if (Number(task.confidence || 0) < 0.6) flags.push(createFlag("low_task_confidence", `Task ${cleanString(task.taskId)} confidence is low.`, "review"));
    }

    const block = flags.some((flag) => flag.severity === "block");
    const review = block || flags.length > 0 || program.reviewPolicy?.parentReviewRequired !== false;
    return {
      ok: !block,
      publishBlocked: block,
      parentReviewRequired: review,
      guardLevel: "ai-draft-system-verify-parent-audit",
      riskFlags: flags,
      allowedActions: block ? ["revise", "parent_review"] : ["parent_review", "publish"],
      taskConfidence: tasks.length
        ? Math.round((tasks.reduce((sum, task) => sum + Number(task.confidence || 0), 0) / tasks.length) * 100) / 100
        : 0,
      evaluatedAt: new Date().toISOString(),
    };
  }

  return {
    evaluatePlanDraft,
  };
}

module.exports = {
  ALLOWED_TASK_CARD_TYPES,
  createLearningAiReliabilityGuardService,
};
