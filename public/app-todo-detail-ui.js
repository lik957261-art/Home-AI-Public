"use strict";

const TODO_DETAIL_MODEL_ESM_PATH = "/vite-islands/todo-detail-model/todo-detail-model.js";
let todoDetailModel = null;
let todoDetailModelPromise = null;

function importTodoDetailModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (todoDetailModel) return Promise.resolve(todoDetailModel);
  if (!todoDetailModelPromise) {
    const importer = typeof rootRef.__homeAiImportTodoDetailModel === "function"
      ? rootRef.__homeAiImportTodoDetailModel
      : (path) => import(path);
    todoDetailModelPromise = Promise.resolve()
      .then(() => importer(TODO_DETAIL_MODEL_ESM_PATH))
      .then((model) => {
        todoDetailModel = model || null;
        return todoDetailModel;
      })
      .catch((error) => {
        todoDetailModelPromise = null;
        throw error;
      });
  }
  return todoDetailModelPromise;
}

function currentTodoDetailModel() {
  return todoDetailModel;
}

if (typeof window !== "undefined") {
  importTodoDetailModel().catch(() => null);
}

function todoDetailPlanInput(todo, options = {}) {
  const kanban = Boolean(options.kanban ?? isKanbanTodoSource());
  const kanbanStatus = options.kanbanStatus || normalizedKanbanStatus(todo);
  return {
    todo,
    todoId: todo?.id || "",
    content: todo?.content || "Kanban card",
    todoStatus: todo?.status || "",
    open: Boolean(options.open ?? todoMatchesOpen(todo)),
    kanban,
    kanbanStatus,
    readingCard: Boolean(kanban && isKanbanReadingCard(todo)),
    assessmentCard: Boolean(kanban && isKanbanAssessmentCard(todo)),
    learningGrowthCard: Boolean(kanban && isKanbanLearningGrowthCard(todo)),
    canManage: !kanban || kanbanCan(todo, "canManage"),
    canRevise: !kanban || kanbanCan(todo, "canRevise"),
    canComment: !kanban || kanbanCan(todo, "canComment"),
    statusText: kanban ? kanbanStatusText(todo) : todoStatusText(todo),
    articleStatusClass: todoStatusLabel(todo),
    assigneeValue: todo?.assigneeLabel || todo?.assignee || "",
    dueLabel: todoDueLabel(todo),
    recurrenceValue: todo?.recurrenceLabel || todo?.recurrence || "不重复",
    boardLabel: todo?.kanbanBoard || todoBoardLabel(),
    kanbanStatusText: kanbanStatusText(todo),
    priorityLabel: todoPriorityLabel(todo),
    createdAtLabel: todoTimestampLabel(todo?.createdAt),
    updatedAtLabel: todoTimestampLabel(todo?.updatedAt),
    startedAtLabel: todoTimestampLabel(todo?.kanbanStartedAt),
    completedAtLabel: todoTimestampLabel(todo?.kanbanCompletedAt || todo?.completedAt),
    commentDraft: state.todoCommentDrafts?.[todo?.id] || "",
    revisionDraft: state.todoRevisionDrafts?.[todo?.id] || "",
    revisionSubmitting: Boolean(state.todoRevisionSubmitting?.[todo?.id]),
    dueInputValue: todoDueInputValue(todo),
  };
}

function renderTodoDetail(todo) {
  const open = todoMatchesOpen(todo);
  const kanban = isKanbanTodoSource();
  const kanbanStatus = normalizedKanbanStatus(todo);
  const model = currentTodoDetailModel();
  const plan = model?.todoDetailViewPlan
    ? model.todoDetailViewPlan(todoDetailPlanInput(todo, { open, kanban, kanbanStatus }))
    : null;
  const blocked = plan ? plan.blocked : kanbanStatus === "blocked";
  const completed = plan ? plan.completed : kanban && (kanbanStatus === "done" || todo.status === "completed");
  const readingCard = kanban && isKanbanReadingCard(todo);
  const assessmentCard = kanban && isKanbanAssessmentCard(todo);
  const learningGrowthCard = kanban && isKanbanLearningGrowthCard(todo);
  const effectiveReadingCard = plan ? plan.readingCard : readingCard;
  const effectiveAssessmentCard = plan ? plan.assessmentCard : assessmentCard;
  const effectiveLearningGrowthCard = plan ? plan.learningGrowthCard : learningGrowthCard;
  const canManage = plan ? plan.canManage : !kanban || kanbanCan(todo, "canManage");
  const canRevise = plan ? plan.canRevise : !kanban || kanbanCan(todo, "canRevise");
  const canComment = plan ? plan.canComment : !kanban || kanbanCan(todo, "canComment");
  const canCommentAndManage = canComment && canManage;
  const statusText = plan?.statusText || (kanban ? kanbanStatusText(todo) : todoStatusText(todo));
  const gridItems = plan?.gridItems
    ? plan.gridItems.map((item) => renderTodoDetailGridItem(item.label, item.value)).join("")
    : [
      renderTodoDetailGridItem("负责人", todo.assigneeLabel || todo.assignee || ""),
      renderTodoDetailGridItem("截止", todoDueLabel(todo)),
      renderTodoDetailGridItem("提醒", `${String(todo.reminderLeadMinutes || 0)} 分钟前`),
      renderTodoDetailGridItem("重复", todo.recurrenceLabel || todo.recurrence || "不重复"),
      kanban ? renderTodoDetailGridItem("看板", todo.kanbanBoard || todoBoardLabel()) : "",
      kanban ? renderTodoDetailGridItem("状态", kanbanStatusText(todo)) : "",
      kanban ? renderTodoDetailGridItem("官方执行者", todo.kanbanAssignee || "") : "",
      kanban ? renderTodoDetailGridItem("租户", todo.kanbanTenant || "") : "",
      kanban ? renderTodoDetailGridItem("优先级", todoPriorityLabel(todo)) : "",
      kanban ? renderTodoDetailGridItem("工作区", todo.kanbanWorkspaceKind || "") : "",
      kanban ? renderTodoDetailGridItem("创建者", todo.kanbanCreatedBy || "") : "",
      renderTodoDetailGridItem("创建", todoTimestampLabel(todo.createdAt)),
      renderTodoDetailGridItem("更新", todoTimestampLabel(todo.updatedAt)),
      kanban ? renderTodoDetailGridItem("开始", todoTimestampLabel(todo.kanbanStartedAt)) : "",
      kanban ? renderTodoDetailGridItem("完成", todoTimestampLabel(todo.kanbanCompletedAt || todo.completedAt)) : "",
    ].filter(Boolean).join("");
  const skillLabels = plan?.skillLabels || (Array.isArray(todo.kanbanSkills) ? todo.kanbanSkills : []);
  const skillRows = kanban && skillLabels.length
    ? `<div class="todo-detail-skills">${skillLabels.map((skill) => `<span>${escapeHtml(skill)}</span>`).join("")}</div>`
    : "";
  const coverBlock = kanban ? renderKanbanCaseCover(kanbanCaseCover(todo)) : "";
  const deliveryBlock = kanban ? renderKanbanDeliveryFiles(todo) : "";
  const readingWorkflowBlock = kanban ? renderKanbanReadingWorkflowPanel(todo) : "";
  const readingQuizBlock = kanban ? renderKanbanReadingQuizPanel(todo) : "";
  const assessmentExamBlock = kanban ? renderKanbanAssessmentExamPanel(todo) : "";
  const resultBlock = kanban ? renderKanbanDetailReport(todo) : "";
  const readingPanel = kanban ? renderKanbanReadingSubmissionPanel(todo) : "";
  const learningGrowthPanel = kanban ? renderKanbanLearningGrowthTodoPanel(todo) : "";
  const metaBlock = kanban
    ? `<details class="todo-detail-meta">
      <summary>卡片信息</summary>
      ${gridItems ? `<div class="todo-detail-grid">${gridItems}</div>` : ""}
      ${skillRows}
    </details>`
    : `<div class="todo-detail-grid">${gridItems}</div>${skillRows}`;
  const showGenericCommentPanel = plan ? plan.showGenericCommentPanel : !effectiveReadingCard && !effectiveAssessmentCard && !effectiveLearningGrowthCard;
  const commentPlan = plan?.commentPanel;
  const commentPanel = (commentPlan ? commentPlan.show : kanban && open && canComment && showGenericCommentPanel)
    ? `<form class="todo-comment-panel" data-todo-comment-form="${escapeHtml(todo.id)}">
      <textarea id="todoCommentText" class="todo-input todo-comment-textarea" rows="4" placeholder="写评论、完成说明或执行记录，可留空">${escapeHtml(commentPlan ? commentPlan.draft : state.todoCommentDrafts?.[todo.id] || "")}</textarea>
      <div class="todo-comment-actions">
        <button type="submit" data-comment-todo="${escapeHtml(todo.id)}">添加评论</button>
        ${(commentPlan ? commentPlan.showComplete : canManage) ? `<button type="button" data-comment-complete-todo="${escapeHtml(todo.id)}">完成并记录</button>` : ""}
        ${(commentPlan ? commentPlan.showUnblock : blocked && canCommentAndManage) ? `<button type="button" data-comment-unblock-todo="${escapeHtml(todo.id)}">评论并解除阻塞</button>` : ""}
      </div>
    </form>`
    : "";
  const revisionPlan = plan?.revisionPanel;
  const revisionSubmitting = revisionPlan ? revisionPlan.submitting : state.todoRevisionSubmitting?.[todo.id];
  const revisionPanel = (revisionPlan ? revisionPlan.show : completed && canRevise)
    ? `<form class="todo-comment-panel todo-revision-panel" data-todo-revision-form="${escapeHtml(todo.id)}" ${revisionSubmitting ? 'aria-busy="true"' : ""}>
      <label class="todo-panel-label" for="todoRevisionText">要求修改</label>
      <textarea id="todoRevisionText" class="todo-input todo-comment-textarea" rows="4" placeholder="写清楚需要修改的地方、验收要求或补充材料" ${revisionSubmitting ? "disabled" : ""}>${escapeHtml(revisionPlan ? revisionPlan.draft : state.todoRevisionDrafts?.[todo.id] || "")}</textarea>
      <div class="todo-comment-actions">
        <button type="submit" data-revise-todo="${escapeHtml(todo.id)}" ${revisionSubmitting ? "disabled" : ""}>${escapeHtml(revisionPlan ? revisionPlan.buttonLabel : (revisionSubmitting ? "正在创建..." : "创建修改任务"))}</button>
      </div>
      ${revisionSubmitting ? `<p class="todo-detail-muted">${escapeHtml(revisionPlan ? revisionPlan.submittingMessage : "正在创建修改任务，请勿重复提交。")}</p>` : ""}
    </form>`
    : "";
  const managementPlan = plan?.managementPanel;
  const managementPanel = (managementPlan ? managementPlan.show : open && canManage)
    ? `<details class="todo-admin-panel"${managementPlan ? (managementPlan.open ? " open" : "") : (readingCard || assessmentCard || learningGrowthCard ? "" : " open")}>
      <summary>
        <span>卡片管理</span>
        <small>阻塞、取消、延期</small>
      </summary>
      <div class="todo-admin-panel-body">
        <div class="todo-detail-actions">
          ${(managementPlan ? managementPlan.showComplete : !(effectiveReadingCard || effectiveAssessmentCard || effectiveLearningGrowthCard)) ? `<button type="button" data-complete-todo="${escapeHtml(todo.id)}">完成</button>` : ""}
          ${(managementPlan ? managementPlan.showBlock : kanban && !blocked) ? `<button type="button" data-block-todo="${escapeHtml(todo.id)}">标记阻塞</button>` : ""}
          ${(managementPlan ? managementPlan.showUnblock : kanban && blocked) ? `<button type="button" data-unblock-todo="${escapeHtml(todo.id)}">解除阻塞</button>` : ""}
          <button type="button" data-cancel-todo="${escapeHtml(todo.id)}">取消</button>
        </div>
        <div class="todo-postpone-panel">
          <div class="todo-postpone-row">
            <label class="todo-postpone-field" for="todoPostponeDue">
              <span>延期到</span>
              <input id="todoPostponeDue" class="todo-input" type="datetime-local" value="${escapeHtml(managementPlan ? managementPlan.dueInputValue : todoDueInputValue(todo))}">
            </label>
            <button type="button" data-postpone-todo="${escapeHtml(todo.id)}">保存延期</button>
          </div>
          <div class="todo-postpone-quick">
            <button type="button" data-postpone-minutes="60" data-postpone-todo="${escapeHtml(todo.id)}">1 小时后</button>
            <button type="button" data-postpone-minutes="1440" data-postpone-todo="${escapeHtml(todo.id)}">明天</button>
          </div>
        </div>
      </div>
    </details>`
    : "";
  return `<article class="todo-detail-card ${escapeHtml(plan?.articleStatusClass || todoStatusLabel(todo))}">
    <div class="todo-detail-head">
      <div>
        <div class="todo-detail-id">${escapeHtml(todo.id)}</div>
        <h2>${escapeHtml(plan?.content || todo.content || "Kanban card")}</h2>
      </div>
      <span class="todo-state status-${escapeHtml(plan?.statusClass || kanbanStatus)}">${escapeHtml(statusText)}</span>
    </div>
    ${coverBlock}
    ${readingWorkflowBlock}
    ${deliveryBlock}
    ${resultBlock}
    ${learningGrowthPanel}
    ${readingPanel}
    ${readingQuizBlock}
    ${assessmentExamBlock}
    ${metaBlock}
    ${commentPanel}
    ${revisionPanel}
    ${managementPanel}
  </article>`;
}
