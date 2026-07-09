"use strict";

export const KANBAN_STUDY_ACTIONS_MODEL_VERSION = "20260706-kanban-study-actions-model-v1";

function text(value) {
  return String(value ?? "").trim();
}

function labelsOf(labels = {}) {
  return {
    recording: labels.recording || "录音",
    analysis: labels.analysis || "分析",
    quiz: labels.quiz || "考卷",
  };
}

export function readingSubmissionFeedbackPlan(stage, labels = {}, errorMessage = "") {
  const item = labelsOf(labels);
  if (stage === "uploading") {
    return {
      feedback: { kind: "info", message: `正在上传${item.recording}。` },
      toast: { message: `${item.recording}已开始上传，正在${item.analysis}`, tone: "" },
    };
  }
  if (stage === "transcribing") {
    return {
      feedback: { kind: "info", message: `${item.recording}已上传，正在转写语音、生成${item.analysis}和${item.quiz}。` },
      toast: null,
    };
  }
  if (stage === "processing") {
    return {
      feedback: { kind: "info", message: `已收到${item.recording}，正在后台转写语音、生成${item.analysis}和${item.quiz}。` },
      toast: { message: `${item.recording}已保存，后台正在处理。`, tone: "success" },
    };
  }
  if (stage === "generated") {
    return {
      feedback: { kind: "success", message: `${item.analysis}和${item.quiz}已生成；请完成 10 题，全对后卡片完成。` },
      toast: { message: `${item.analysis}和${item.quiz}已生成；10 题全对后完成卡片。`, tone: "success" },
    };
  }
  return {
    feedback: { kind: "error", message: errorMessage || `${item.recording}提交失败，请重试。` },
    toast: null,
  };
}

export function readingSubmissionRequestBodyPlan({ workspaceId = "", file = {}, dataBase64 = "", notes = "" } = {}) {
  return {
    workspaceId,
    filename: file?.name || "reading-audio.m4a",
    type: file?.type || "audio/mp4",
    dataBase64,
    notes,
  };
}

export function readingQuizCompletionPlan(result = {}, fallbackTodoId = "") {
  const canonicalId = text(result.canonicalCardId || fallbackTodoId) || fallbackTodoId;
  const completed = text(result.status).toLowerCase() === "completed"
    || (Array.isArray(result.attempts) && result.attempts.some((attempt) => attempt?.passed));
  return { canonicalId, completed };
}

export function wrongAnswerIndex(results = []) {
  return Array.isArray(results) ? results.findIndex((item) => !item?.correct) : -1;
}

export function readingQuizSubmitResultPlan(result = {}, todoId = "", todos = []) {
  const canonicalId = text(result.canonicalCardId || todoId) || todoId;
  const passed = Boolean(result.passed);
  const selectedTodoId = passed && Array.isArray(todos) && todos.some((todo) => todo?.id === canonicalId)
    ? canonicalId
    : todoId;
  return {
    canonicalId,
    passed,
    selectedTodoId,
    wrongIndex: wrongAnswerIndex(result.results),
    toast: passed
      ? { message: "考卷 10/10，全对，阅读卡片已完成。", tone: "success" }
      : { message: `考卷 ${result.correctCount || 0}/${result.total || 10}，请订正后再提交。`, tone: "error" },
  };
}

export function assessmentRequirementText(value = "") {
  return text(value);
}

export function assessmentExamStatePlan(result = {}) {
  return {
    exam: result.exam,
    status: result.status || "",
    attempts: result.attempts || [],
    result: result.result || null,
  };
}

export function assessmentSubmitResultPlan(result = {}) {
  const passed = Boolean(result.passed);
  return {
    passed,
    wrongIndex: wrongAnswerIndex(result.results),
    toast: passed
      ? { message: `考试通过：${result.score || 0}/100`, tone: "success" }
      : { message: `考试 ${result.score || 0}/100，未达通过线，请重考。`, tone: "error" },
  };
}
