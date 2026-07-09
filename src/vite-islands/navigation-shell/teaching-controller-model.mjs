"use strict";

export const TEACHING_CONTROLLER_MODEL_VERSION = "20260706-teaching-controller-model-v1";

const VALID_STEPS = Object.freeze(["lesson", "guided_practice", "quick_check"]);

export function teachingStepPlan(step = "") {
  const value = String(step || "").trim();
  return VALID_STEPS.includes(value) ? value : "";
}

export function teachingDraftPatchPlan({
  taskCardId = "",
  field = "",
  value = "",
} = {}) {
  const id = String(taskCardId || "").trim();
  const key = String(field || "").trim();
  if (!id || !key) return { ok: false };
  return {
    ok: true,
    taskCardId: id,
    field: key,
    value: String(value || ""),
  };
}

export function selectedTeachingTaskPlan({
  taskCardId = "",
  selectedTaskCardId = "",
  overview = {},
} = {}) {
  const id = String(taskCardId || selectedTaskCardId || "").trim();
  if (!id) return null;
  const programs = overview?.programs || {};
  const lists = [programs.taskCards, programs.executableTasks, overview?.board?.cards];
  for (const list of lists) {
    const found = Array.isArray(list)
      ? list.find((task) => String(task?.taskCardId || task?.id || "") === id)
      : null;
    if (found) return found;
  }
  return null;
}

export function teachingCheckSubmitPlan(draft = {}) {
  const quickCheckText = String(draft?.quickCheckText || "").trim();
  const guidedPracticeText = String(draft?.guidedPracticeText || "").trim();
  if (!quickCheckText && !guidedPracticeText) {
    return {
      ok: false,
      errorMessage: "先写一句跟做或检查内容。",
    };
  }
  return {
    ok: true,
    requestBody: {
      guidedPracticeText,
      quickCheckText,
      summary: quickCheckText || guidedPracticeText,
    },
    nextStep: "quick_check",
    successMessage: "学习卡已完成",
  };
}

export function experienceSignalPlan({
  taskCardId = "",
  signalType = "",
  busy = false,
  submitted = false,
  latestSignalType = "",
} = {}) {
  const id = String(taskCardId || "").trim();
  const type = String(signalType || "").trim();
  if (!id || !type) return { ok: false, reason: "missing_input" };
  if (busy) return { ok: false, reason: "busy" };
  if (submitted) return { ok: false, reason: "submitted" };
  if (latestSignalType) return { ok: false, reason: "latest_signal_exists" };
  return {
    ok: true,
    taskCardId: id,
    signalType: type,
    requestBody: { signalType: type },
    successMessage: "学习反馈已记录",
  };
}

export function stageAssessmentChallengeRequestPlan({
  sourceTaskCardId = "",
  source = {},
  workspaceId = "",
  learnerId = "",
} = {}) {
  const id = String(sourceTaskCardId || "manual").trim() || "manual";
  const title = `${String(source?.title || "Stage assessment").trim()} - 能力挑战`;
  return {
    activationId: id,
    requestBody: {
      workspaceId,
      learnerId,
      programId: source?.programId || "",
      domain: source?.domain || "english",
      skillIds: source?.skillIds || source?.taskModel?.skillIds || [],
      capabilityClusterId: source?.capabilityClusterId || "",
      title,
      reason: "executor_ready",
    },
    successMessage: "能力测验已生成",
  };
}
