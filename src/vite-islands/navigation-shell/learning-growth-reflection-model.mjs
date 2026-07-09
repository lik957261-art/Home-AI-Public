export const LEARNING_GROWTH_REFLECTION_MODEL_VERSION = "20260706-learning-growth-reflection-model-v1";

export const DEFAULT_REFLECTION_PROMPTS = Object.freeze([
  "说出这次最主要的错误。",
  "说明为什么要这样修改。",
  "说出下次你会先检查什么。",
]);

export const DEFAULT_REFLECTION_STATUS_TEXT = "录音说明今天的错误、原因和下次改进。";

export function feedbackListPlan(items = [], limit = 5) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, Math.max(0, Number(limit) || 0));
}

export function reflectionStatusPlan(reflection = null) {
  if (!reflection || typeof reflection !== "object") {
    return { visible: false };
  }
  const audio = reflection.audio && typeof reflection.audio === "object" ? reflection.audio : null;
  const status = String(reflection.status || "");
  return {
    visible: true,
    status,
    title: "语音复盘",
    summary: reflection.summary || (status === "accepted" ? "复盘已通过。" : "复盘需要重新补充。"),
    scoreText: `复盘评分 ${Number(reflection.score || 0)}/${Number(reflection.maxScore || 100)}`,
    audioDurationMs: audio?.durationMs || 0,
  };
}

export function reflectionRecorderPlan({
  todo = {},
  interactionState = {},
  feedbackSections = {},
  recording = {},
  submitting = false,
  canComment = false,
  statusText = DEFAULT_REFLECTION_STATUS_TEXT,
} = {}) {
  const todoId = String(todo?.id || "");
  const canSubmitReflection = Boolean(interactionState.canSubmitReflection) && Boolean(canComment);
  if (!canSubmitReflection) {
    return { visible: false, todoId, canSubmitReflection: false };
  }
  const ready = recording.status === "ready" && Boolean(recording.file);
  const recordingNow = recording.status === "recording";
  const prompts = feedbackListPlan(
    Array.isArray(feedbackSections.reflectionPrompts) && feedbackSections.reflectionPrompts.length
      ? feedbackSections.reflectionPrompts
      : DEFAULT_REFLECTION_PROMPTS,
  );
  return {
    visible: true,
    todoId,
    canSubmitReflection: true,
    ready,
    recordingNow,
    submitting: Boolean(submitting),
    statusText: statusText || DEFAULT_REFLECTION_STATUS_TEXT,
    prompts,
    playbackUrl: recording.url || "",
    recordButtonText: recordingNow ? "停止录音" : "开始录音",
    showClearButton: ready,
    submitDisabled: !ready || Boolean(submitting),
    submitButtonText: submitting ? "正在提交复盘..." : "提交复盘",
  };
}
