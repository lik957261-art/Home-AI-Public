const TODO_DETAIL_MODEL_VERSION = "20260705-todo-detail-model-v1";

function textValue(value = "", max = 4000) {
  return String(value == null ? "" : value).slice(0, Math.max(1, Number(max) || 4000));
}

function cleanString(value = "", max = 240) {
  return textValue(value, max).trim();
}

function booleanValue(value) {
  return Boolean(value);
}

function nonEmptyGridItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => Object.freeze({
      label: cleanString(item?.label, 80),
      value: cleanString(item?.value, 500),
    }))
    .filter((item) => item.label && item.value);
}

function todoDetailGridItemsPlan(input = {}) {
  const todo = input.todo && typeof input.todo === "object" ? input.todo : {};
  const kanban = booleanValue(input.kanban);
  const reminderLeadMinutes = Number(todo.reminderLeadMinutes || 0) || 0;
  const baseItems = [
    { label: "负责人", value: input.assigneeValue ?? todo.assigneeLabel ?? todo.assignee ?? "" },
    { label: "截止", value: input.dueLabel },
    { label: "提醒", value: `${String(reminderLeadMinutes)} 分钟前` },
    { label: "重复", value: input.recurrenceValue ?? todo.recurrenceLabel ?? todo.recurrence ?? "不重复" },
  ];
  const kanbanItems = kanban ? [
    { label: "看板", value: input.boardLabel ?? todo.kanbanBoard ?? "" },
    { label: "状态", value: input.kanbanStatusText },
    { label: "官方执行者", value: todo.kanbanAssignee },
    { label: "租户", value: todo.kanbanTenant },
    { label: "优先级", value: input.priorityLabel },
    { label: "工作区", value: todo.kanbanWorkspaceKind },
    { label: "创建者", value: todo.kanbanCreatedBy },
  ] : [];
  const timestampItems = [
    { label: "创建", value: input.createdAtLabel },
    { label: "更新", value: input.updatedAtLabel },
  ];
  const kanbanTimestampItems = kanban ? [
    { label: "开始", value: input.startedAtLabel },
    { label: "完成", value: input.completedAtLabel },
  ] : [];
  return Object.freeze(nonEmptyGridItems([
    ...baseItems,
    ...kanbanItems,
    ...timestampItems,
    ...kanbanTimestampItems,
  ]));
}

function todoDetailSkillRowsPlan(todo = {}) {
  return Object.freeze((Array.isArray(todo?.kanbanSkills) ? todo.kanbanSkills : [])
    .map((skill) => cleanString(skill, 240))
    .filter(Boolean));
}

function todoDetailCommentPanelPlan(input = {}) {
  const show = Boolean(input.kanban && input.open && input.canComment && input.showGenericCommentPanel);
  return Object.freeze({
    show,
    todoId: cleanString(input.todoId, 240),
    draft: textValue(input.draft, 10000),
    showComplete: Boolean(input.canManage),
    showUnblock: Boolean(input.blocked && input.canCommentAndManage),
  });
}

function todoDetailRevisionPanelPlan(input = {}) {
  const submitting = booleanValue(input.submitting);
  return Object.freeze({
    show: Boolean(input.completed && input.canRevise),
    todoId: cleanString(input.todoId, 240),
    draft: textValue(input.draft, 10000),
    submitting,
    ariaBusy: submitting,
    textareaDisabled: submitting,
    buttonDisabled: submitting,
    buttonLabel: submitting ? "正在创建..." : "创建修改任务",
    submittingMessage: submitting ? "正在创建修改任务，请勿重复提交。" : "",
  });
}

function todoDetailManagementPanelPlan(input = {}) {
  const specializedCard = Boolean(input.readingCard || input.assessmentCard || input.learningGrowthCard);
  return Object.freeze({
    show: Boolean(input.open && input.canManage),
    todoId: cleanString(input.todoId, 240),
    open: !specializedCard,
    showComplete: !specializedCard,
    showBlock: Boolean(input.kanban && !input.blocked),
    showUnblock: Boolean(input.kanban && input.blocked),
    dueInputValue: textValue(input.dueInputValue, 240),
    quickPostponeMinutes: Object.freeze([60, 1440]),
  });
}

function todoDetailViewPlan(input = {}) {
  const todo = input.todo && typeof input.todo === "object" ? input.todo : {};
  const todoId = cleanString(input.todoId ?? todo.id, 240);
  const kanban = booleanValue(input.kanban);
  const kanbanStatus = cleanString(input.kanbanStatus || "unknown", 120) || "unknown";
  const open = booleanValue(input.open);
  const blocked = kanbanStatus === "blocked";
  const completed = Boolean(kanban && (kanbanStatus === "done" || cleanString(input.todoStatus || todo.status, 80) === "completed"));
  const readingCard = Boolean(input.readingCard);
  const assessmentCard = Boolean(input.assessmentCard);
  const learningGrowthCard = Boolean(input.learningGrowthCard);
  const canManage = !kanban || Boolean(input.canManage);
  const canRevise = !kanban || Boolean(input.canRevise);
  const canComment = !kanban || Boolean(input.canComment);
  const canCommentAndManage = canComment && canManage;
  const showGenericCommentPanel = !readingCard && !assessmentCard && !learningGrowthCard;
  const panelInput = Object.freeze({
    kanban,
    open,
    blocked,
    completed,
    readingCard,
    assessmentCard,
    learningGrowthCard,
    canManage,
    canRevise,
    canComment,
    canCommentAndManage,
    showGenericCommentPanel,
    todoId,
  });
  return Object.freeze({
    version: TODO_DETAIL_MODEL_VERSION,
    todoId,
    content: textValue(input.content ?? todo.content ?? "Kanban card", 2000) || "Kanban card",
    open,
    kanban,
    kanbanStatus,
    blocked,
    completed,
    readingCard,
    assessmentCard,
    learningGrowthCard,
    canManage,
    canRevise,
    canComment,
    canCommentAndManage,
    showGenericCommentPanel,
    statusText: cleanString(input.statusText, 240),
    statusClass: kanbanStatus,
    articleStatusClass: cleanString(input.articleStatusClass, 120),
    gridItems: todoDetailGridItemsPlan(input),
    skillLabels: todoDetailSkillRowsPlan(todo),
    metaCollapsible: kanban,
    commentPanel: todoDetailCommentPanelPlan(Object.assign({}, panelInput, {
      draft: input.commentDraft,
    })),
    revisionPanel: todoDetailRevisionPanelPlan(Object.assign({}, panelInput, {
      draft: input.revisionDraft,
      submitting: input.revisionSubmitting,
    })),
    managementPanel: todoDetailManagementPanelPlan(Object.assign({}, panelInput, {
      dueInputValue: input.dueInputValue,
    })),
  });
}

export {
  TODO_DETAIL_MODEL_VERSION,
  cleanString,
  todoDetailCommentPanelPlan,
  todoDetailGridItemsPlan,
  todoDetailManagementPanelPlan,
  todoDetailRevisionPanelPlan,
  todoDetailSkillRowsPlan,
  todoDetailViewPlan,
};
