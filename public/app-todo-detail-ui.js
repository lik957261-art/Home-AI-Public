"use strict";

function renderTodoDetail(todo) {
  const open = todoMatchesOpen(todo);
  const kanban = isKanbanTodoSource();
  const kanbanStatus = normalizedKanbanStatus(todo);
  const blocked = kanbanStatus === "blocked";
  const completed = kanban && (kanbanStatus === "done" || todo.status === "completed");
  const readingCard = kanban && isKanbanReadingCard(todo);
  const assessmentCard = kanban && isKanbanAssessmentCard(todo);
  const canManage = !kanban || kanbanCan(todo, "canManage");
  const canRevise = !kanban || kanbanCan(todo, "canRevise");
  const canComment = !kanban || kanbanCan(todo, "canComment");
  const canCommentAndManage = canComment && canManage;
  const statusText = kanban ? kanbanStatusText(todo) : todoStatusText(todo);
  const gridItems = [
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
  const skillRows = kanban && Array.isArray(todo.kanbanSkills) && todo.kanbanSkills.length
    ? `<div class="todo-detail-skills">${todo.kanbanSkills.map((skill) => `<span>${escapeHtml(skill)}</span>`).join("")}</div>`
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
  const showGenericCommentPanel = !readingCard && !assessmentCard;
  const commentPanel = kanban && open && canComment && showGenericCommentPanel
    ? `<form class="todo-comment-panel" data-todo-comment-form="${escapeHtml(todo.id)}">
      <textarea id="todoCommentText" class="todo-input todo-comment-textarea" rows="4" placeholder="写评论、完成说明或执行记录，可留空">${escapeHtml(state.todoCommentDrafts?.[todo.id] || "")}</textarea>
      <div class="todo-comment-actions">
        <button type="submit" data-comment-todo="${escapeHtml(todo.id)}">添加评论</button>
        ${canManage ? `<button type="button" data-comment-complete-todo="${escapeHtml(todo.id)}">完成并记录</button>` : ""}
        ${blocked && canCommentAndManage ? `<button type="button" data-comment-unblock-todo="${escapeHtml(todo.id)}">评论并解除阻塞</button>` : ""}
      </div>
    </form>`
    : "";
  const revisionPanel = completed && canRevise
    ? `<form class="todo-comment-panel todo-revision-panel" data-todo-revision-form="${escapeHtml(todo.id)}" ${state.todoRevisionSubmitting?.[todo.id] ? 'aria-busy="true"' : ""}>
      <label class="todo-panel-label" for="todoRevisionText">要求修改</label>
      <textarea id="todoRevisionText" class="todo-input todo-comment-textarea" rows="4" placeholder="写清楚需要修改的地方、验收要求或补充材料" ${state.todoRevisionSubmitting?.[todo.id] ? "disabled" : ""}>${escapeHtml(state.todoRevisionDrafts?.[todo.id] || "")}</textarea>
      <div class="todo-comment-actions">
        <button type="submit" data-revise-todo="${escapeHtml(todo.id)}" ${state.todoRevisionSubmitting?.[todo.id] ? "disabled" : ""}>${state.todoRevisionSubmitting?.[todo.id] ? "正在创建..." : "创建修改任务"}</button>
      </div>
      ${state.todoRevisionSubmitting?.[todo.id] ? `<p class="todo-detail-muted">正在创建修改任务，请勿重复提交。</p>` : ""}
    </form>`
    : "";
  const managementPanel = open && canManage
    ? `<details class="todo-admin-panel"${readingCard || assessmentCard ? "" : " open"}>
      <summary>
        <span>卡片管理</span>
        <small>阻塞、取消、延期</small>
      </summary>
      <div class="todo-admin-panel-body">
        <div class="todo-detail-actions">
          ${readingCard || assessmentCard ? "" : `<button type="button" data-complete-todo="${escapeHtml(todo.id)}">完成</button>`}
          ${kanban && !blocked ? `<button type="button" data-block-todo="${escapeHtml(todo.id)}">标记阻塞</button>` : ""}
          ${kanban && blocked ? `<button type="button" data-unblock-todo="${escapeHtml(todo.id)}">解除阻塞</button>` : ""}
          <button type="button" data-cancel-todo="${escapeHtml(todo.id)}">取消</button>
        </div>
        <div class="todo-postpone-panel">
          <div class="todo-postpone-row">
            <label class="todo-postpone-field" for="todoPostponeDue">
              <span>延期到</span>
              <input id="todoPostponeDue" class="todo-input" type="datetime-local" value="${escapeHtml(todoDueInputValue(todo))}">
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
  return `<article class="todo-detail-card ${escapeHtml(todoStatusLabel(todo))}">
    <div class="todo-detail-head">
      <div>
        <div class="todo-detail-id">${escapeHtml(todo.id)}</div>
        <h2>${escapeHtml(todo.content || "Kanban card")}</h2>
      </div>
      <span class="todo-state status-${escapeHtml(kanbanStatus)}">${escapeHtml(statusText)}</span>
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
