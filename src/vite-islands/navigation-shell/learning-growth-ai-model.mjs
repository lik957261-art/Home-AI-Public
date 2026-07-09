export const LEARNING_GROWTH_AI_MODEL_VERSION = "20260706-learning-growth-ai-model-v1";

export const AI_PROGRESS_MESSAGES = Object.freeze([
  "正在整理学习记录和近期任务状态...",
  "正在请模型分析特点、优势和剩余薄弱点...",
  "正在把模型建议校验到已注册的 Growth 任务模板...",
  "模型分析仍在进行，这一步可能需要几分钟。",
]);

export const AI_PROGRESS_DELAYS_MS = Object.freeze([14000, 45000, 110000]);

export function learningAiLearnerBodyPlan(workspaceId, learnerId) {
  const normalizedWorkspaceId = String(workspaceId || "weixin_stephen").trim() || "weixin_stephen";
  const normalizedLearnerId = String(learnerId || normalizedWorkspaceId).trim() || normalizedWorkspaceId;
  return {
    workspaceId: normalizedWorkspaceId,
    learnerId: normalizedLearnerId,
    studentId: normalizedLearnerId,
  };
}

export function learningAiScopeKey(body = {}, domain = "english") {
  return `${body.workspaceId || ""}:${body.learnerId || ""}:${domain || "english"}`;
}

export function learningAiRecommendationRequestBody(body = {}, options = {}) {
  return Object.assign({}, body, {
    domain: options.domain || "english",
    limit: Number.isFinite(Number(options.limit)) ? Number(options.limit) : 180,
    reasoningEffort: options.reasoningEffort || "medium",
  });
}

export function learningAiLatestParams(body = {}, domain = "english") {
  return {
    workspaceId: body.workspaceId || "",
    learnerId: body.learnerId || "",
    studentId: body.studentId || "",
    domain: domain || "english",
  };
}

export function friendlyLearningAiError(err) {
  const message = String(err?.message || err || "").trim();
  if (/no supported task series|failed validation|unsupported template|skill does not match/i.test(message)) {
    return "模型已返回分析，但没有给出可通过注册模板校验的任务系列。本次不会使用降级推荐，请重新生成。";
  }
  if (/invalid json|parse/i.test(message)) {
    return "模型返回的结果不是可校验的 JSON。本次不会使用降级推荐，请重新生成。";
  }
  if (/timeout|timed out|abort/i.test(message)) {
    return "模型分析超时。本次没有生成 AI 推荐，请稍后重试。";
  }
  if (/502|503|model/i.test(message)) {
    return "模型分析失败。本次不会使用降级推荐，请重新生成。";
  }
  return message || "模型分析失败。";
}

export function learningAiProgressPlan(messages = AI_PROGRESS_MESSAGES, delays = AI_PROGRESS_DELAYS_MS) {
  const normalizedMessages = Array.isArray(messages) && messages.length ? messages.map((item) => String(item || "")) : [...AI_PROGRESS_MESSAGES];
  const normalizedDelays = Array.isArray(delays) && delays.length ? delays : AI_PROGRESS_DELAYS_MS;
  return {
    initialMessage: normalizedMessages[0] || "",
    timers: normalizedDelays.map((delay, index) => ({
      delay: Number(delay) || 0,
      message: normalizedMessages[index + 1] || normalizedMessages[normalizedMessages.length - 1] || "",
    })),
  };
}

export function latestLearningAiSummaryPlan(latest) {
  return latest?.modelStatus === "not_generated" ? null : latest;
}

export function findLearningAiRecommendation(summary = {}, recommendationId = "") {
  const targetId = String(recommendationId || "");
  return (Array.isArray(summary?.recommendedSeries) ? summary.recommendedSeries : [])
    .find((item) => String(item?.recommendationId || item?.id || "") === targetId) || null;
}

export function learningAiDraftRequestBody(body = {}, recommendation = null) {
  return Object.assign({}, body, { recommendation });
}

export function learningAiDraftCreatingId(recommendation = null) {
  return recommendation?.recommendationId || recommendation?.id || "";
}
