"use strict";

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HermesLearningGrowthReflectionUi = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function renderFeedbackList(title, items) {
    if (typeof renderLearningGrowthFeedbackList === "function") return renderLearningGrowthFeedbackList(title, items);
    const list = Array.isArray(items) ? items.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5) : [];
    return list.length ? `<div class="todo-learning-growth-feedback-list"><strong>${escapeHtml(title)}</strong><ul>${list.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : "";
  }

  function renderReflectionStatus(reflection = null) {
    if (!reflection || typeof reflection !== "object") return "";
    const audio = reflection.audio && typeof reflection.audio === "object" ? reflection.audio : null;
    return `<div class="todo-learning-growth-status todo-learning-growth-reflection-status" data-learning-growth-reflection-result="${escapeHtml(reflection.status || "")}">
      <strong>${escapeHtml("\u8bed\u97f3\u590d\u76d8")}</strong>
      <p>${escapeHtml(reflection.summary || (reflection.status === "accepted" ? "\u590d\u76d8\u5df2\u901a\u8fc7\u3002" : "\u590d\u76d8\u9700\u8981\u91cd\u65b0\u8865\u5145\u3002"))}</p>
      <p class="todo-detail-muted">${escapeHtml(`\u590d\u76d8\u8bc4\u5206 ${Number(reflection.score || 0)}/${Number(reflection.maxScore || 100)}`)}${audio?.durationMs && typeof formatKanbanReadingRecordingDuration === "function" ? ` \u00b7 ${escapeHtml(formatKanbanReadingRecordingDuration(audio.durationMs))}` : ""}</p>
    </div>`;
  }

  function renderReflectionRecorder(todo, interactionState = {}, feedbackSections = {}) {
    const todoId = String(todo?.id || "");
    const canSubmitReflection = Boolean(interactionState.canSubmitReflection) && kanbanCan(todo, "canComment");
    if (!canSubmitReflection) return "";
    const recording = state.todoLearningGrowthReflectionRecorders?.[todoId] || {};
    const submitting = Boolean(state.todoLearningGrowthReflectionSubmitting?.[todoId]);
    const ready = recording.status === "ready" && recording.file;
    const recordingNow = recording.status === "recording";
    const statusText = typeof learningGrowthReflectionRecordingStatusText === "function"
      ? learningGrowthReflectionRecordingStatusText(todoId)
      : "\u5f55\u97f3\u8bf4\u660e\u4eca\u5929\u7684\u9519\u8bef\u3001\u539f\u56e0\u548c\u4e0b\u6b21\u6539\u8fdb\u3002";
    const prompts = Array.isArray(feedbackSections.reflectionPrompts) && feedbackSections.reflectionPrompts.length
      ? feedbackSections.reflectionPrompts
      : ["\u8bf4\u51fa\u8fd9\u6b21\u6700\u4e3b\u8981\u7684\u9519\u8bef\u3002", "\u8bf4\u660e\u4e3a\u4ec0\u4e48\u8981\u8fd9\u6837\u4fee\u6539\u3002", "\u8bf4\u51fa\u4e0b\u6b21\u4f60\u4f1a\u5148\u68c0\u67e5\u4ec0\u4e48\u3002"];
    const playback = recording.url ? `<audio controls preload="metadata" src="${escapeHtml(recording.url)}"></audio>` : "";
    return `<form class="todo-learning-growth-reflection" data-learning-growth-reflection-form="${escapeHtml(todoId)}">
      <label class="todo-panel-label">${escapeHtml("\u6700\u7ec8\u8bed\u97f3\u590d\u76d8")}</label>
      <p class="todo-detail-muted">${escapeHtml("\u5148\u770b Markdown \u6279\u6539\u548c\u4fee\u6539\u70b9\uff0c\u518d\u7528\u5f55\u97f3\u8bf4\u660e\u9519\u8bef\u3001\u539f\u56e0\u548c\u4e0b\u6b21\u68c0\u67e5\u65b9\u6cd5\u3002\u590d\u76d8\u901a\u8fc7\u540e\u624d\u7ed3\u7b97\u5206\u6570\u548c\u91d1\u5e01\u3002")}</p>
      ${renderFeedbackList("\u590d\u76d8\u8981\u70b9", prompts)}
      <div class="todo-reading-recorder">
        <button type="button" class="todo-reading-record-button ${recordingNow ? "recording" : ""}" data-learning-growth-reflection-record-toggle="${escapeHtml(todoId)}" ${submitting ? "disabled" : ""}>${escapeHtml(recordingNow ? "\u505c\u6b62\u5f55\u97f3" : "\u5f00\u59cb\u5f55\u97f3")}</button>
        <span data-learning-growth-reflection-status="${escapeHtml(todoId)}">${escapeHtml(statusText)}</span>
        ${ready ? `<button type="button" class="secondary-small" data-learning-growth-reflection-record-clear="${escapeHtml(todoId)}">\u91cd\u5f55</button>` : ""}
      </div>
      ${playback}
      <div class="todo-comment-actions">
        <button type="submit" data-submit-learning-growth-reflection="${escapeHtml(todoId)}" ${(!ready || submitting) ? "disabled" : ""}>${escapeHtml(submitting ? "\u6b63\u5728\u63d0\u4ea4\u590d\u76d8..." : "\u63d0\u4ea4\u590d\u76d8")}</button>
      </div>
    </form>`;
  }

  return {
    renderReflectionRecorder,
    renderReflectionStatus,
  };
}));
