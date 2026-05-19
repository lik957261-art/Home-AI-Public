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
      reason: "Blocked from Hermes Mobile Kanban view.",
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

async function submitLearningGrowthTask(todoId, text) {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canComment")) throw new Error("No permission to submit this Growth task");
  if (state.todoLearningGrowthSubmissionSubmitting?.[todoId]) return;
  const submission = String(text || state.todoLearningGrowthSubmissionDrafts?.[todoId] || "").trim();
  if (!submission) throw new Error("\u8bf7\u5148\u5199\u4e0b\u672c\u6b21\u4f5c\u7b54\u5185\u5bb9");
  const growthUi = window.HermesLearningGrowthTaskUi || {};
  if (card && typeof growthUi.submissionGuard === "function" && typeof growthUi.validateSubmissionText === "function") {
    const validation = growthUi.validateSubmissionText(submission, growthUi.submissionGuard(card, card.learningGrowthEvaluation || {}));
    if (!validation.ok) throw new Error(validation.message || "\u4f5c\u7b54\u8fc7\u77ed\uff0c\u8bf7\u8865\u5145\u540e\u518d\u63d0\u4ea4\u3002");
  }
  state.todoLearningGrowthSubmissionDrafts[todoId] = submission;
  state.todoLearningGrowthSubmissionSubmitting[todoId] = true;
  state.todoLearningGrowthSubmissionFeedback[todoId] = { kind: "info", message: "\u6b63\u5728\u63d0\u4ea4\u672c\u6b21\u4f5c\u7b54..." };
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
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
        ? `AI \u53cd\u9988\u5df2\u5b8c\u6210${score == null ? "" : `\uff0c\u8bc4\u5206 ${score}/100`}${nextStep === "rewrite_and_reflect" ? "\uff0c\u8bf7\u7ee7\u7eed\u4fee\u6539\u548c\u590d\u76d8" : ""}${nextStep === "completed" ? "\uff0c\u5df2\u751f\u6210\u6700\u7ec8\u7ed3\u8bba" : ""}${reportReady ? "\uff0cMarkdown \u62a5\u544a\u5df2\u751f\u6210" : ""}${reward?.status === "settled" ? `\uff0c\u5df2\u7ed3\u7b97 ${reward.coinAmount || 0} \u91d1\u5e01` : ""}\u3002`
        : "\u5df2\u6536\u5230\u4f5c\u7b54\uff0c\u6b63\u5728\u7b49\u5f85 AI \u53cd\u9988\u6216\u5bb6\u957f\u590d\u6838\u3002",
    };
    await loadTodos({ skipCache: true, freshServer: true, targetId: todoId });
    state.selectedTodoId = todoId;
    showPushToast("\u6210\u957f\u4efb\u52a1\u4f5c\u7b54\u5df2\u63d0\u4ea4", "success");
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  } catch (err) {
    state.todoLearningGrowthSubmissionFeedback[todoId] = { kind: "error", message: err.message || String(err) };
    throw err;
  } finally {
    delete state.todoLearningGrowthSubmissionSubmitting[todoId];
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
