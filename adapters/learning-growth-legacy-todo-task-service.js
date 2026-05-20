"use strict";

function cleanString(value, limit = 1000) {
  const text = String(value ?? "").trim();
  const max = Math.max(1, Number(limit || 1000) || 1000);
  return text.length > max ? text.slice(0, max) : text;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function getMobileStore(mobileStore) {
  if (typeof mobileStore === "function") return mobileStore();
  return mobileStore || null;
}

function legacyTodoId(todo = {}) {
  return cleanString(todo.id || todo.todoId || todo.todo_id || todo.officialKanbanRef);
}

function isDoneStatus(status) {
  return ["done", "completed", "closed", "archived"].includes(cleanString(status).toLowerCase());
}

function sequenceInfo(title = "") {
  const text = cleanString(title, 300);
  const match = text.match(/\u7b2c\s*(\d+)\s*\/\s*(\d+)/) || text.match(/(\d+)\s*\/\s*(\d+)/);
  return {
    index: match ? Math.max(1, Number(match[1]) || 1) : 1,
    total: match ? Math.max(1, Number(match[2]) || 1) : 1,
  };
}

function categoryForTitle(title = "") {
  const text = cleanString(title, 300).toLowerCase();
  if (/everything|reading|retell/.test(text) || /[\u9605\u8bfb\u590d\u8ff0\u5f55\u97f3]/.test(text)) {
    return {
      id: "legacy-reading-retell",
      domain: "english",
      activityType: "speaking",
      skillId: "english_speaking_retell",
      taskCardType: "legacy_reading_retell",
      preview: "\u65e7\u9605\u8bfb\u590d\u8ff0\u4efb\u52a1\uff1a\u539f\u5f55\u97f3\u3001\u8f6c\u5199\u3001\u6d4b\u9a8c\u548c\u4ea4\u4ed8\u8bb0\u5f55\u4fdd\u7559\u5728\u539f\u770b\u677f\u8be6\u60c5\u4e2d\u3002",
    };
  }
  if (/python|programming|quiz/.test(text) || /[\u7f16\u7a0b]/.test(text)) {
    return {
      id: "legacy-python",
      domain: "programming",
      activityType: "programming",
      skillId: "python_programming_assessment",
      taskCardType: "legacy_programming_quiz",
      preview: "\u65e7 Python \u7f16\u7a0b\u4efb\u52a1\uff1a\u4fdd\u7559\u539f\u770b\u677f\u6d4b\u9a8c\u548c\u8bc4\u4f30\u8bb0\u5f55\uff0c\u6253\u5f00\u539f\u4efb\u52a1\u7ee7\u7eed\u3002",
    };
  }
  if (/amc|assessment|exam|test/.test(text) || /[\u6570\u5b66\u6b63\u5f0f\u6d4b\u8bd5]/.test(text)) {
    return {
      id: "legacy-assessment",
      domain: "math",
      activityType: "assessment",
      skillId: "math_assessment",
      taskCardType: "legacy_assessment",
      preview: "\u65e7 AMC8/\u6570\u5b66\u6d4b\u8bc4\u4efb\u52a1\uff1a\u4fdd\u7559\u539f\u770b\u677f\u8bd5\u5377\u3001\u6279\u6539\u548c\u62a5\u544a\u8bb0\u5f55\u3002",
    };
  }
  return {
    id: "legacy-learning",
    domain: "learning",
    activityType: "study",
    skillId: "legacy_learning_task",
    taskCardType: "legacy_learning_task",
    preview: "\u65e7\u770b\u677f\u5b66\u4e60\u4efb\u52a1\uff1a\u4ee5\u6458\u8981\u65b9\u5f0f\u6062\u590d\u5230\u6210\u957f\u770b\u677f\u3002",
  };
}

function projectLegacyTodoTask(todo = {}, index = 0) {
  const todoId = legacyTodoId(todo);
  if (!todoId) return null;
  const title = cleanString(todo.content || todo.title || todo.summary || todoId, 180);
  const category = categoryForTitle(title);
  const sequence = sequenceInfo(title);
  const done = isDoneStatus(todo.status);
  const workspaceId = cleanString(todo.assignee || todo.assignee_principal_id || todo.workspaceId || todo.workspace_id);
  return {
    taskCardId: `legacy_todo:${todoId}`,
    todoId,
    kanbanCardId: todoId,
    source: "official_kanban_migrated",
    legacySource: "official_kanban_migrated",
    readOnly: true,
    privacyLevel: "summary_only",
    programId: category.id,
    sequenceGroupId: category.id,
    sequenceIndex: sequence.index || index + 1,
    sequenceTotal: sequence.total,
    title,
    instructionPreview: category.preview,
    status: done ? "completed" : "published",
    executionStatus: done ? "completed" : "pending_execution",
    kanbanStatus: cleanString(todo.status),
    domain: category.domain,
    activityType: category.activityType,
    taskCardType: category.taskCardType,
    taskModel: {
      skillId: category.skillId,
      activityType: category.activityType,
      taskCardType: category.taskCardType,
    },
    workspaceId,
    learnerId: workspaceId,
    assignee: workspaceId,
    plannedDate: cleanString(todo.dueLocal || todo.due_local || todo.dueAt || todo.due_at).slice(0, 16),
    dueAt: cleanString(todo.dueAt || todo.due_at),
    dueLocal: cleanString(todo.dueLocal || todo.due_local),
    nativeState: {
      status: done ? "completed" : "legacy_open",
      nextAction: done ? "complete" : "open",
      readOnly: true,
      legacyTodoId: todoId,
    },
  };
}

function createLearningGrowthLegacyTodoTaskService(options = {}) {
  const mobileStore = options.mobileStore || null;
  return {
    listExecutableTasks(input = {}) {
      const store = getMobileStore(mobileStore);
      if (!store || typeof store.listTodoItems !== "function") return [];
      const learnerId = cleanString(input.learnerId || input.studentId || input.workspaceId);
      const todos = store.listTodoItems({
        source: "official_kanban_migrated",
        assignee: learnerId,
        includeCompleted: true,
        limit: Math.max(80, Math.min(500, Number(input.limit || 120) || 120)),
      });
      return arrayValue(todos).map(projectLegacyTodoTask).filter(Boolean);
    },
  };
}

module.exports = {
  createLearningGrowthLegacyTodoTaskService,
  projectLegacyTodoTask,
};
