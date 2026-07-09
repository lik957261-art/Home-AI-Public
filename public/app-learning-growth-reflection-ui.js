"use strict";

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HermesLearningGrowthReflectionUi = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const LEARNING_GROWTH_REFLECTION_MODEL_ESM_PATH = "/vite-islands/learning-growth-reflection-model/learning-growth-reflection-model.js";
  let learningGrowthReflectionModel = null;
  let learningGrowthReflectionModelPromise = null;

  function importLearningGrowthReflectionModel(rootRef = (typeof globalThis !== "undefined" ? globalThis : null)) {
    if (learningGrowthReflectionModel) return Promise.resolve(learningGrowthReflectionModel);
    if (!learningGrowthReflectionModelPromise) {
      const importer = typeof rootRef?.__homeAiImportLearningGrowthReflectionModel === "function"
        ? rootRef.__homeAiImportLearningGrowthReflectionModel
        : (path) => import(path);
      learningGrowthReflectionModelPromise = Promise.resolve()
        .then(() => importer(LEARNING_GROWTH_REFLECTION_MODEL_ESM_PATH))
        .then((model) => {
          learningGrowthReflectionModel = model || null;
          return learningGrowthReflectionModel;
        })
        .catch((error) => {
          learningGrowthReflectionModelPromise = null;
          throw error;
        });
    }
    return learningGrowthReflectionModelPromise;
  }

  function currentLearningGrowthReflectionModel() {
    return learningGrowthReflectionModel;
  }

  function learningGrowthReflectionModelFunction(name) {
    const model = currentLearningGrowthReflectionModel();
    return model && typeof model[name] === "function" ? model[name] : null;
  }

  if (typeof window !== "undefined") {
    importLearningGrowthReflectionModel().catch(() => null);
  }

  function renderFeedbackList(title, items) {
    if (typeof renderLearningGrowthFeedbackList === "function") return renderLearningGrowthFeedbackList(title, items);
    const modelFn = learningGrowthReflectionModelFunction("feedbackListPlan");
    const list = modelFn
      ? modelFn(items)
      : Array.isArray(items) ? items.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5) : [];
    return list.length ? `<div class="todo-learning-growth-feedback-list"><strong>${escapeHtml(title)}</strong><ul>${list.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : "";
  }

  function renderReflectionStatus(reflection = null) {
    const modelFn = learningGrowthReflectionModelFunction("reflectionStatusPlan");
    const plan = modelFn ? modelFn(reflection) : null;
    if (plan && !plan.visible) return "";
    if (!plan && (!reflection || typeof reflection !== "object")) return "";
    const audio = reflection?.audio && typeof reflection.audio === "object" ? reflection.audio : null;
    const status = plan ? plan.status : reflection.status || "";
    const title = plan ? plan.title : "\u8bed\u97f3\u590d\u76d8";
    const summary = plan ? plan.summary : reflection.summary || (reflection.status === "accepted" ? "\u590d\u76d8\u5df2\u901a\u8fc7\u3002" : "\u590d\u76d8\u9700\u8981\u91cd\u65b0\u8865\u5145\u3002");
    const scoreText = plan ? plan.scoreText : `\u590d\u76d8\u8bc4\u5206 ${Number(reflection.score || 0)}/${Number(reflection.maxScore || 100)}`;
    const audioDurationMs = plan ? plan.audioDurationMs : audio?.durationMs;
    return `<div class="todo-learning-growth-status todo-learning-growth-reflection-status" data-learning-growth-reflection-result="${escapeHtml(status)}">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(summary)}</p>
      <p class="todo-detail-muted">${escapeHtml(scoreText)}${audioDurationMs && typeof formatKanbanReadingRecordingDuration === "function" ? ` \u00b7 ${escapeHtml(formatKanbanReadingRecordingDuration(audioDurationMs))}` : ""}</p>
    </div>`;
  }

  function renderReflectionRecorder(todo, interactionState = {}, feedbackSections = {}) {
    const todoId = String(todo?.id || "");
    const recording = state.todoLearningGrowthReflectionRecorders?.[todoId] || {};
    const submitting = Boolean(state.todoLearningGrowthReflectionSubmitting?.[todoId]);
    const statusText = typeof learningGrowthReflectionRecordingStatusText === "function"
      ? learningGrowthReflectionRecordingStatusText(todoId)
      : "\u5f55\u97f3\u8bf4\u660e\u4eca\u5929\u7684\u9519\u8bef\u3001\u539f\u56e0\u548c\u4e0b\u6b21\u6539\u8fdb\u3002";
    const modelFn = learningGrowthReflectionModelFunction("reflectionRecorderPlan");
    const plan = modelFn ? modelFn({
      todo,
      interactionState,
      feedbackSections,
      recording,
      submitting,
      canComment: kanbanCan(todo, "canComment"),
      statusText,
    }) : null;
    const canSubmitReflection = plan ? plan.canSubmitReflection : Boolean(interactionState.canSubmitReflection) && kanbanCan(todo, "canComment");
    if (!canSubmitReflection) return "";
    const ready = plan ? plan.ready : recording.status === "ready" && recording.file;
    const recordingNow = plan ? plan.recordingNow : recording.status === "recording";
    const prompts = plan ? plan.prompts : Array.isArray(feedbackSections.reflectionPrompts) && feedbackSections.reflectionPrompts.length
      ? feedbackSections.reflectionPrompts
      : ["\u8bf4\u51fa\u8fd9\u6b21\u6700\u4e3b\u8981\u7684\u9519\u8bef\u3002", "\u8bf4\u660e\u4e3a\u4ec0\u4e48\u8981\u8fd9\u6837\u4fee\u6539\u3002", "\u8bf4\u51fa\u4e0b\u6b21\u4f60\u4f1a\u5148\u68c0\u67e5\u4ec0\u4e48\u3002"];
    const playbackUrl = plan ? plan.playbackUrl : recording.url;
    const playback = playbackUrl ? `<audio controls preload="metadata" src="${escapeHtml(playbackUrl)}"></audio>` : "";
    return `<form class="todo-learning-growth-reflection" data-learning-growth-reflection-form="${escapeHtml(todoId)}">
      <label class="todo-panel-label">${escapeHtml("\u6700\u7ec8\u8bed\u97f3\u590d\u76d8")}</label>
      <p class="todo-detail-muted">${escapeHtml("\u5148\u770b Markdown \u6279\u6539\u548c\u4fee\u6539\u70b9\uff0c\u518d\u7528\u5f55\u97f3\u8bf4\u660e\u9519\u8bef\u3001\u539f\u56e0\u548c\u4e0b\u6b21\u68c0\u67e5\u65b9\u6cd5\u3002\u590d\u76d8\u901a\u8fc7\u540e\u624d\u7ed3\u7b97\u5206\u6570\u548c\u91d1\u5e01\u3002")}</p>
      ${renderFeedbackList("\u590d\u76d8\u8981\u70b9", prompts)}
      <div class="todo-reading-recorder">
        <button type="button" class="todo-reading-record-button ${recordingNow ? "recording" : ""}" data-learning-growth-reflection-record-toggle="${escapeHtml(todoId)}" ${submitting ? "disabled" : ""}>${escapeHtml(plan?.recordButtonText || (recordingNow ? "\u505c\u6b62\u5f55\u97f3" : "\u5f00\u59cb\u5f55\u97f3"))}</button>
        <span data-learning-growth-reflection-status="${escapeHtml(todoId)}">${escapeHtml(plan?.statusText || statusText)}</span>
        ${ready ? `<button type="button" class="secondary-small" data-learning-growth-reflection-record-clear="${escapeHtml(todoId)}">\u91cd\u5f55</button>` : ""}
      </div>
      ${playback}
      <div class="todo-comment-actions">
        <button type="submit" data-submit-learning-growth-reflection="${escapeHtml(todoId)}" ${(plan?.submitDisabled ?? (!ready || submitting)) ? "disabled" : ""}>${escapeHtml(plan?.submitButtonText || (submitting ? "\u6b63\u5728\u63d0\u4ea4\u590d\u76d8..." : "\u63d0\u4ea4\u590d\u76d8"))}</button>
      </div>
    </form>`;
  }

  return {
    currentLearningGrowthReflectionModel,
    importLearningGrowthReflectionModel,
    renderReflectionRecorder,
    renderReflectionStatus,
  };
}));
