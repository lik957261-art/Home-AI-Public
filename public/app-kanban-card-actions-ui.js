"use strict";

async function createTodoFromForm(root) {
  const content = root.querySelector("#todoContent")?.value?.trim() || "";
  const dueValue = root.querySelector("#todoDue")?.value || "";
  const kanban = isKanbanTodoSource();
  if (!content) throw new Error("Kanban card content is required");
  if (!kanban && !dueValue) throw new Error("Todo due time is required");
  const dueTime = dueValue.replace("T", " ");
  await api(boardCollectionApiPath(), {
    method: "POST",
    body: JSON.stringify({
      workspaceId: state.selectedWorkspaceId,
      assignee: root.querySelector("#todoAssignee")?.value || defaultTodoAssignee(),
      content,
      dueTime,
      recurrence: root.querySelector("#todoRecurrence")?.value || "none",
      recurrenceDays: root.querySelector("#todoRecurrenceDays")?.value || "",
    }),
  });
  clearTodoListCache();
  state.todoCreateOpen = false;
  if (kanban) {
    state.todoKanbanStatus = "todo";
    localStorage.setItem("hermesTodoKanbanStatus", "todo");
  }
  await loadTodos();
}

async function completeTodo(todoId, comment = "") {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canManage")) throw new Error("No permission to manage this card");
  const commentText = String(comment || state.todoCommentDrafts?.[todoId] || "").trim();
  await api(boardActionApiPath(todoId, "complete"), {
    method: "POST",
    body: kanbanCardActionBody(todoId, commentText ? { comment: commentText } : {}),
  });
  clearTodoListCache(kanbanCardWorkspaceId(todoId));
  delete state.todoCommentDrafts[todoId];
  state.selectedTodoId = "";
  await loadTodos();
}

async function cancelTodo(todoId) {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canManage")) throw new Error("No permission to cancel this card");
  if (!window.confirm(`取消看板卡片 ${todoId}？`)) return;
  await api(boardActionApiPath(todoId, "cancel"), {
    method: "POST",
    body: kanbanCardActionBody(todoId),
  });
  clearTodoListCache(kanbanCardWorkspaceId(todoId));
  state.selectedTodoId = "";
  await loadTodos();
}

async function archiveKanbanStoryCase(caseKey) {
  const key = String(caseKey || "").trim();
  if (!key) return;
  const group = kanbanActiveStoryCases(state.todos).find((item) => kanbanStoryCaseKey(item) === key);
  const items = kanbanStoryCaseArchiveItems(group);
  if (!group || !items.length) throw new Error("No completed story cards can be archived.");
  if (!window.confirm(`归档故事：${group.title || key}？`)) return;
  for (const item of items) {
    await api(boardActionApiPath(item.todo.id, "cancel"), {
      method: "POST",
      body: kanbanCardActionBody(item.todo),
    });
  }
  clearTodoListCache();
  state.selectedTodoId = "";
  state.todoKanbanStatus = "archived";
  localStorage.setItem("hermesTodoKanbanStatus", "archived");
  state.kanbanStoryExpanded = Object.assign({}, state.kanbanStoryExpanded || {}, { [key]: false });
  showPushToast(`已归档 ${items.length} 张卡片`, "success");
  await loadTodos({ skipCache: true, freshServer: true });
}

async function deleteKanbanStoryCase(caseKey) {
  const key = String(caseKey || "").trim();
  if (!key) return false;
  const group = kanbanStoryCases(state.todos).find((item) => kanbanStoryCaseKey(item) === key);
  const items = kanbanStoryCaseDeleteItems(group);
  if (!group || !items.length) throw new Error("No deletable cards in this story.");
  const title = group.title || key;
  if (!window.confirm(`\u5220\u9664\u6545\u4e8b\uff1a${title}\n\u5c06\u4e00\u6b21\u5220\u9664 ${items.length} \u5f20\u770b\u677f\u5361\u7247\uff0c\u4e0d\u53ef\u901a\u8fc7\u5355\u5361\u5165\u53e3\u64a4\u9500\u3002`)) return false;
  let boundTopic = kanbanBoundTopicForStoryGroup(group);
  if (!boundTopic) {
    await refreshCaseTopicThreadsForWorkspace().catch(() => []);
    boundTopic = kanbanBoundTopicForStoryGroup(group);
  }
  for (const item of items) {
    await api(boardActionApiPath(item.todo.id, "delete"), {
      method: "POST",
      body: kanbanCardActionBody(item.todo),
    });
  }
  let topicCleanupError = "";
  if (boundTopic?.threadId && boundTopic?.taskGroupId) {
    try {
      await api(`/api/threads/${encodeURIComponent(boundTopic.threadId)}/tasks/${encodeURIComponent(boundTopic.taskGroupId)}`, {
        method: "DELETE",
      });
      state.caseTopicThreads = (state.caseTopicThreads || []).map((thread) => {
        if (thread.id !== boundTopic.threadId) return thread;
        const taskGroupMeta = Object.assign({}, thread.taskGroupMeta || {});
        delete taskGroupMeta[boundTopic.taskGroupId];
        const messages = (thread.messages || []).filter((message) => message.taskGroupId !== boundTopic.taskGroupId);
        return Object.assign({}, thread, { taskGroupMeta, messages });
      });
    } catch (err) {
      topicCleanupError = err.message || String(err);
    }
  }
  clearTodoListCache();
  closeTopMoreMenu();
  state.selectedTodoId = "";
  state.kanbanStoryExpanded = Object.assign({}, state.kanbanStoryExpanded || {}, { [key]: false });
  showPushToast(
    topicCleanupError
      ? `已删除 ${items.length} 张故事卡片；绑定话题清理失败：${compactDisplayText(topicCleanupError, 80)}`
      : `已删除 ${items.length} 张故事卡片${boundTopic ? "，并清理绑定话题" : ""}`,
    topicCleanupError ? "error" : "success",
  );
  await loadTodos({ skipCache: true, freshServer: true, includeCompleted: true });
  return true;
}

async function blockTodo(todoId) {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canManage")) throw new Error("No permission to block this card");
  await api(boardActionApiPath(todoId, "block"), {
    method: "POST",
    body: kanbanCardActionBody(todoId, {
      reason: "Blocked from Home AI Kanban view.",
    }),
  });
  clearTodoListCache(kanbanCardWorkspaceId(todoId));
  await loadTodos();
  state.selectedTodoId = todoId;
  renderTodos();
}

async function unblockTodo(todoId) {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canManage")) throw new Error("No permission to unblock this card");
  await api(boardActionApiPath(todoId, "unblock"), {
    method: "POST",
    body: kanbanCardActionBody(todoId),
  });
  clearTodoListCache(kanbanCardWorkspaceId(todoId));
  await loadTodos();
  state.selectedTodoId = todoId;
  renderTodos();
}

async function commentTodo(todoId, comment) {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canComment")) throw new Error("No permission to comment on this card");
  const text = String(comment || "").trim();
  if (!text) throw new Error("请先填写评论内容");
  await api(boardActionApiPath(todoId, "comment"), {
    method: "POST",
    body: kanbanCardActionBody(todoId, {
      comment: text,
    }),
  });
  clearTodoListCache(kanbanCardWorkspaceId(todoId));
  await loadTodos();
  state.selectedTodoId = todoId;
  delete state.todoCommentDrafts[todoId];
  showPushToast("评论已添加", "success");
  renderTodos();
}

const LEARNING_GROWTH_SUBMISSION_PROGRESS_STEPS = Object.freeze([
  { at: 0, title: "\u4fdd\u5b58\u4f5c\u7b54", preview: "\u5199\u5165\u770b\u677f\u63d0\u4ea4\u8bb0\u5f55" },
  { at: 2, title: "\u8c03\u7528\u6a21\u578b\u6279\u6539", preview: "learning-growth-task-evaluation" },
  { at: 8, title: "\u7b49\u5f85\u6a21\u578b JSON \u8bc4\u4f30", preview: "\u6821\u9a8c\u5206\u6570\u3001\u4fee\u6539\u5efa\u8bae\u548c\u4e0b\u4e00\u6b65" },
  { at: 16, title: "\u751f\u6210 Markdown \u56de\u6267", preview: "\u5199\u5165\u62a5\u544a\u3001\u53cd\u9988\u548c\u9644\u4ef6" },
  { at: 30, title: "\u5237\u65b0\u5361\u7247\u72b6\u6001", preview: "\u540c\u6b65\u5b66\u4e60\u8fdb\u5ea6\u548c\u5956\u52b1\u95e8\u7981" },
]);

function learningGrowthProgressText(seconds) {
  if (typeof runProgressDurationText === "function") return runProgressDurationText(seconds, { allowZero: true });
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes ? `${minutes}\u5206${rest}\u79d2` : `${rest}\u79d2`;
}

function renderLearningGrowthSubmissionProgressPanel(todoId) {
  const progress = state.todoLearningGrowthSubmissionProgress?.[todoId];
  if (!progress?.startAt) return "";
  const elapsed = Math.max(0, Math.floor((Date.now() - progress.startAt) / 1000));
  let activeIndex = 0;
  LEARNING_GROWTH_SUBMISSION_PROGRESS_STEPS.forEach((step, index) => { if (elapsed >= step.at) activeIndex = index; });
  const rows = LEARNING_GROWTH_SUBMISSION_PROGRESS_STEPS.map((step, index) => {
    const status = index < activeIndex ? " done" : (index === activeIndex ? " active" : " pending");
    return `<div class="run-progress-row${status}">
      <span class="run-progress-dot" aria-hidden="true"></span>
      <span class="run-progress-main">${escapeHtml(step.title)}</span>
      <span class="run-progress-time">${escapeHtml(learningGrowthProgressText(step.at))}</span>
      <span class="run-progress-preview">${escapeHtml(step.preview)}</span>
    </div>`;
  }).join("");
  return `<aside class="run-progress-panel inline todo-learning-growth-submit-progress" aria-live="polite">
    <div class="run-progress-head">
      <strong>${escapeHtml("AI \u6279\u6539\u4e2d")}</strong>
      <span data-run-progress-elapsed="${escapeHtml(String(progress.startAt))}">${escapeHtml(learningGrowthProgressText(elapsed))}</span>
      <code>${escapeHtml(String(todoId || "").slice(-8) || "growth")}</code>
    </div>
    <div class="run-progress-rows">${rows}</div>
  </aside>`;
}

function updateLearningGrowthSubmissionProgress(todoId) {
  const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(todoId) : String(todoId).replace(/"/g, '\\"');
  const node = document.querySelector(`[data-learning-growth-submission-progress="${escaped}"]`);
  if (node) node.innerHTML = renderLearningGrowthSubmissionProgressPanel(todoId);
  if (typeof syncRunProgressTicker === "function") syncRunProgressTicker(document);
}

function beginLearningGrowthSubmissionProgress(todoId) {
  state.todoLearningGrowthSubmissionProgress = state.todoLearningGrowthSubmissionProgress || {};
  state.todoLearningGrowthSubmissionProgressTimers = state.todoLearningGrowthSubmissionProgressTimers || {};
  if (state.todoLearningGrowthSubmissionProgressTimers[todoId] && typeof window !== "undefined") window.clearInterval(state.todoLearningGrowthSubmissionProgressTimers[todoId]);
  state.todoLearningGrowthSubmissionProgress[todoId] = { startAt: Date.now() };
  updateLearningGrowthSubmissionProgress(todoId);
  if (typeof window !== "undefined") state.todoLearningGrowthSubmissionProgressTimers[todoId] = window.setInterval(() => updateLearningGrowthSubmissionProgress(todoId), 1000);
}

function finishLearningGrowthSubmissionProgress(todoId) {
  const timer = state.todoLearningGrowthSubmissionProgressTimers?.[todoId];
  if (timer && typeof window !== "undefined") window.clearInterval(timer);
  if (state.todoLearningGrowthSubmissionProgressTimers) delete state.todoLearningGrowthSubmissionProgressTimers[todoId];
  if (state.todoLearningGrowthSubmissionProgress) delete state.todoLearningGrowthSubmissionProgress[todoId];
  updateLearningGrowthSubmissionProgress(todoId);
}

function setLearningGrowthSubmissionFeedback(todoId, feedback = {}, options = {}) {
  state.todoLearningGrowthSubmissionFeedback = state.todoLearningGrowthSubmissionFeedback || {};
  state.todoLearningGrowthSubmissionFeedback[todoId] = feedback;
  const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(todoId) : String(todoId).replace(/"/g, '\\"');
  const node = document.querySelector(`[data-learning-growth-submission-feedback="${escaped}"]`);
  if (!node) {
    if (options.renderFallback) renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    return;
  }
  node.textContent = feedback.message || "";
  node.classList.toggle("todo-detail-error", feedback.kind === "error");
  const form = node.closest("[data-learning-growth-kanban-card]")?.querySelector("[data-learning-growth-submission-form]");
  form?.querySelectorAll("textarea, button").forEach((item) => { item.disabled = Boolean(options.disabled); });
}

async function submitLearningGrowthTask(todoId, text) {
  if (!todoId) return;
  const restoreScrollTop = $("conversation")?.scrollTop || 0;
  function failBeforeSubmit(message) {
    const textValue = message || "\u6210\u957f\u4efb\u52a1\u63d0\u4ea4\u5931\u8d25";
    setLearningGrowthSubmissionFeedback(todoId, { kind: "error", message: textValue }, { renderFallback: true });
    throw new Error(textValue);
  }
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canComment")) failBeforeSubmit("No permission to submit this Growth task");
  if (state.todoLearningGrowthSubmissionSubmitting?.[todoId]) return;
  const submission = String(text || state.todoLearningGrowthSubmissionDrafts?.[todoId] || "").trim();
  if (!submission) failBeforeSubmit("\u8bf7\u5148\u5199\u4e0b\u672c\u6b21\u4f5c\u7b54\u5185\u5bb9");
  const growthUi = window.HermesLearningGrowthTaskUi || {};
  if (card && typeof growthUi.submissionGuard === "function" && typeof growthUi.validateSubmissionText === "function") {
    const validation = growthUi.validateSubmissionText(submission, growthUi.submissionGuard(card, card.learningGrowthEvaluation || {}));
    if (!validation.ok) failBeforeSubmit(validation.message || "\u4f5c\u7b54\u8fc7\u77ed\uff0c\u8bf7\u8865\u5145\u540e\u518d\u63d0\u4ea4\u3002");
  }
  state.todoLearningGrowthSubmissionDrafts[todoId] = submission;
  state.todoLearningGrowthSubmissionSubmitting[todoId] = true;
  beginLearningGrowthSubmissionProgress(todoId);
  setLearningGrowthSubmissionFeedback(todoId, { kind: "info", message: "\u5df2\u6536\u5230\u70b9\u51fb\uff0c\u6b63\u5728\u63d0\u4ea4\u4f5c\u7b54\u5e76\u7b49\u5f85 AI \u6279\u6539\uff0c\u53ef\u80fd\u9700\u8981 1-2 \u5206\u949f..." }, { disabled: true, renderFallback: true });
  try {
    const response = await api(boardActionApiPath(todoId, "learning-growth-submission"), {
      method: "POST",
      body: kanbanCardActionBody(todoId, {
        text: submission,
      }),
    });
    clearTodoListCache(kanbanCardWorkspaceId(todoId));
    delete state.todoLearningGrowthSubmissionDrafts[todoId];
    const score = response?.evaluation?.score;
    const reward = response?.reward;
    const nextStep = response?.evaluation?.nextStep || "";
    const reportReady = Boolean(response?.evaluation?.report?.url || response?.evaluation?.report?.path || response?.evaluation?.report?.name);
    state.todoLearningGrowthSubmissionFeedback[todoId] = {
      kind: "success",
      message: response?.evaluation
        ? `AI \u53cd\u9988\u5df2\u5b8c\u6210${score == null ? "" : `\uff0c\u8bc4\u5206 ${score}/100`}${nextStep === "rewrite_and_reflect" ? "\uff0c\u8bf7\u7ee7\u7eed\u4fee\u6539\u548c\u590d\u76d8" : ""}${nextStep === "spoken_reflection_required" ? "\uff0c\u8bf7\u5f55\u97f3\u590d\u76d8\u540e\u518d\u7ed3\u7b97" : ""}${nextStep === "completed" ? "\uff0c\u5df2\u751f\u6210\u6700\u7ec8\u7ed3\u8bba" : ""}${reportReady ? "\uff0cMarkdown \u62a5\u544a\u5df2\u751f\u6210" : ""}${reward?.status === "settled" ? `\uff0c\u5df2\u7ed3\u7b97 ${reward.coinAmount || 0} \u91d1\u5e01` : ""}\u3002`
        : "\u5df2\u6536\u5230\u4f5c\u7b54\uff0c\u6b63\u5728\u7b49\u5f85 AI \u53cd\u9988\u6216\u5bb6\u957f\u590d\u6838\u3002",
    };
    await loadTodos({ skipCache: true, freshServer: true, targetId: todoId });
    state.selectedTodoId = todoId;
    showPushToast("\u6210\u957f\u4efb\u52a1\u4f5c\u7b54\u5df2\u63d0\u4ea4", "success");
    renderTodos({ preserveScroll: true, restoreScrollTop });
  } catch (err) {
    setLearningGrowthSubmissionFeedback(todoId, { kind: "error", message: err.message || String(err) }, { renderFallback: true });
    throw err;
  } finally {
    delete state.todoLearningGrowthSubmissionSubmitting[todoId];
    finishLearningGrowthSubmissionProgress(todoId);
    renderTodos({ preserveScroll: true, restoreScrollTop });
  }
}

async function submitLearningGrowthReflection(todoId) {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canComment")) throw new Error("No permission to submit this Growth reflection");
  state.todoLearningGrowthReflectionRecorders = state.todoLearningGrowthReflectionRecorders || {};
  state.todoLearningGrowthReflectionSubmitting = state.todoLearningGrowthReflectionSubmitting || {};
  if (state.todoLearningGrowthReflectionSubmitting[todoId]) return;
  const recording = state.todoLearningGrowthReflectionRecorders[todoId] || {};
  if (!recording.file) throw new Error("\u8bf7\u5148\u5f55\u5236\u590d\u76d8\u8bed\u97f3");
  state.todoLearningGrowthReflectionSubmitting[todoId] = true;
  state.todoLearningGrowthSubmissionFeedback[todoId] = { kind: "info", message: "\u6b63\u5728\u4e0a\u4f20\u590d\u76d8\u8bed\u97f3\u5e76\u68c0\u67e5\u7406\u89e3\u7a0b\u5ea6..." };
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    const file = recording.file;
    const response = await api(boardActionApiPath(todoId, "learning-growth-reflection"), {
      method: "POST",
      body: kanbanCardActionBody(todoId, {
        filename: file.name || `growth-reflection-${todoId}.webm`,
        type: file.type || recording.mimeType || "audio/webm",
        dataBase64: await fileToBase64(file),
        durationMs: recording.elapsedMs || 0,
      }),
    });
    clearTodoListCache(kanbanCardWorkspaceId(todoId));
    const latest = state.todoLearningGrowthReflectionRecorders?.[todoId];
    if (latest?.file === file) {
      if (latest.url && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(latest.url);
      delete state.todoLearningGrowthReflectionRecorders[todoId];
    }
    state.todoLearningGrowthSubmissionFeedback[todoId] = {
      kind: response?.reflection?.status === "accepted" ? "success" : "info",
      message: response?.reflection?.status === "accepted"
        ? `\u8bed\u97f3\u590d\u76d8\u5df2\u901a\u8fc7\uff0c\u6700\u7ec8\u8bc4\u5206 ${response?.evaluation?.score ?? 0}/100${response?.reward?.status === "settled" ? `\uff0c\u5df2\u7ed3\u7b97 ${response.reward.coinAmount || 0} \u91d1\u5e01` : ""}\u3002`
        : "\u8bed\u97f3\u590d\u76d8\u5df2\u63d0\u4ea4\uff0c\u8bf7\u6839\u636e\u53cd\u9988\u91cd\u65b0\u8865\u5145\u9519\u8bef\u3001\u539f\u56e0\u548c\u4e0b\u6b21\u7ec3\u4e60\u8ba1\u5212\u3002",
    };
    await loadTodos({ skipCache: true, freshServer: true, targetId: todoId });
    state.selectedTodoId = todoId;
    showPushToast("\u6210\u957f\u4efb\u52a1\u590d\u76d8\u5df2\u63d0\u4ea4", "success");
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  } catch (err) {
    state.todoLearningGrowthSubmissionFeedback[todoId] = { kind: "error", message: err.message || String(err) };
    throw err;
  } finally {
    delete state.todoLearningGrowthReflectionSubmitting[todoId];
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }
}

async function submitLearningGrowthWriting(todoId, text) {
  return submitLearningGrowthTask(todoId, text);
}

async function withdrawLearningGrowthSubmission(todoId) {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canComment")) throw new Error("No permission to withdraw this Growth submission");
  if (!window.confirm("\u64a4\u56de\u8fd9\u6b21\u6210\u957f\u4efb\u52a1\u63d0\u4ea4\uff0c\u5e76\u91cd\u65b0\u4f5c\u7b54\uff1f")) return;
  await api(boardActionApiPath(todoId, "learning-growth-submission/withdraw"), {
    method: "POST",
    body: kanbanCardActionBody(todoId, { reason: "Withdraw recent Growth learning task submission." }),
  });
  clearTodoListCache(kanbanCardWorkspaceId(todoId));
  delete state.todoLearningGrowthSubmissionDrafts[todoId];
  state.todoLearningGrowthSubmissionFeedback[todoId] = { kind: "success", message: "\u5df2\u64a4\u56de\u672c\u6b21\u63d0\u4ea4\uff0c\u53ef\u4ee5\u91cd\u65b0\u4f5c\u7b54\u3002" };
  await loadTodos({ skipCache: true, freshServer: true, targetId: todoId });
  state.selectedTodoId = todoId;
  showPushToast("\u6210\u957f\u4efb\u52a1\u63d0\u4ea4\u5df2\u64a4\u56de", "success");
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
}

async function commentAndUnblockTodo(todoId, comment) {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && (!kanbanCan(card, "canComment") || !kanbanCan(card, "canManage"))) throw new Error("No permission to comment and unblock this card");
  const text = String(comment || "").trim();
  if (!text) throw new Error("请先填写评论内容");
  await api(boardActionApiPath(todoId, "comment"), {
    method: "POST",
    body: kanbanCardActionBody(todoId, {
      comment: text,
    }),
  });
  await api(boardActionApiPath(todoId, "unblock"), {
    method: "POST",
    body: kanbanCardActionBody(todoId),
  });
  clearTodoListCache(kanbanCardWorkspaceId(todoId));
  await loadTodos();
  state.selectedTodoId = todoId;
  delete state.todoCommentDrafts[todoId];
  showPushToast("评论已添加，已解除阻塞", "success");
  renderTodos();
}

async function requestTodoRevision(todoId, comment) {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canRevise")) throw new Error("No permission to request revision for this card");
  if (state.todoRevisionSubmitting?.[todoId]) return;
  const text = String(comment || "").trim();
  if (!text) throw new Error("请先填写修改要求");
  state.todoRevisionDrafts[todoId] = text;
  state.todoRevisionSubmitting[todoId] = true;
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    const response = await api(boardActionApiPath(todoId, "revise"), {
      method: "POST",
      body: kanbanCardActionBody(todoId, {
        comment: text,
      }),
    });
    const result = response.result || {};
    const revisionId = result.revisionId || result.revisionCard?.id || result.id || "";
    clearTodoListCache();
    state.todoKanbanStatus = "todo";
    localStorage.setItem("hermesTodoKanbanStatus", "todo");
    await loadTodos({ skipCache: true });
    state.selectedTodoId = revisionId || todoId;
    delete state.todoRevisionDrafts[todoId];
    showPushToast(revisionId ? `已创建修改任务 ${revisionId}` : "修改请求已提交", "success");
  } finally {
    delete state.todoRevisionSubmitting[todoId];
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }
}

async function deleteTodo(todoId) {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canDelete")) throw new Error("No permission to delete this card");
  if (card && kanbanCardHasExplicitStoryCase(card)) throw new Error("This card belongs to a story. Delete the story from the Story view.");
  if (!window.confirm(`删除看板卡片 ${todoId}？`)) return;
  await api(boardActionApiPath(todoId, "delete"), {
    method: "POST",
    body: kanbanCardActionBody(todoId),
  });
  clearTodoListCache(kanbanCardWorkspaceId(todoId));
  closeTopMoreMenu();
  state.selectedTodoId = "";
  await loadTodos();
}

async function deleteTodoDirect(todoId) {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canDelete")) throw new Error("No permission to delete this card");
  if (card && kanbanCardHasExplicitStoryCase(card)) throw new Error("This card belongs to a story. Delete the story from the Story view.");
  await api(boardActionApiPath(todoId, "delete"), {
    method: "POST",
    body: kanbanCardActionBody(todoId),
  });
  clearTodoListCache(kanbanCardWorkspaceId(todoId));
  if (state.selectedTodoId === todoId) state.selectedTodoId = "";
  await loadTodos();
}

async function postponeTodo(todoId, dueTime) {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canManage")) throw new Error("No permission to postpone this card");
  if (!dueTime) throw new Error("请选择新的截止时间");
  await api(boardActionApiPath(todoId, "postpone"), {
    method: "POST",
    body: kanbanCardActionBody(todoId, { dueTime }),
  });
  clearTodoListCache(kanbanCardWorkspaceId(todoId));
  await loadTodos();
}

async function postponeTodoFromDetail(root, todoId) {
  const value = root.querySelector("#todoPostponeDue")?.value || "";
  await postponeTodo(todoId, value.replace("T", " "));
}

async function postponeTodoQuick(todoId, minutes) {
  const offset = Number.isFinite(minutes) ? minutes : 60;
  const value = localDateTimeInputValue(new Date(Date.now() + Math.max(1, offset) * 60 * 1000));
  await postponeTodo(todoId, value.replace("T", " "));
}

function focusTodoFormSoon() {
  setTimeout(() => {
    ($("kanbanStudyTitle") || $("kanbanReadingBook") || $("kanbanComposerText") || $("todoContent"))?.focus();
  }, 40);
}

function openTodoCreate() {
  closeTopMoreMenu();
  state.selectedTodoId = "";
  if (!state.todoCreateOpen) {
    state.kanbanComposerMessages = [];
    state.kanbanPlanDraft = null;
    finishKanbanComposerProgress();
  }
  state.todoCreateOpen = true;
  renderTodos();
  focusTodoFormSoon();
}
