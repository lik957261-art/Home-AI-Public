"use strict";


function kanbanStatusNeedsCompleted(status) {
  return status === KANBAN_STORY_STATUS || KANBAN_STATUS_ORDER.includes(status);
}

function shouldLoadCompletedTodos(options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, "includeCompleted")) return Boolean(options.includeCompleted);
  if (currentSearchText()) return true;
  if (state.selectedTodoId) return true;
  return kanbanStatusNeedsCompleted(String(state.todoKanbanStatus || "").trim().toLowerCase());
}

function kanbanComposerOpen() {
  return state.viewMode === "todos" && isKanbanTodoSource() && state.todoCreateOpen && !state.selectedTodoId;
}

function kanbanComposerFocused() {
  const active = document.activeElement;
  return Boolean(active && (active.id === "kanbanComposerText" || active.closest?.("#kanbanComposerForm")));
}

function kanbanCardById(todoId) {
  const id = String(todoId || "").trim();
  if (!id) return null;
  return (state.todos || []).find((todo) => String(todo?.id || "") === id) || null;
}

function kanbanCardWorkspaceId(todoOrId) {
  const todo = typeof todoOrId === "string" ? kanbanCardById(todoOrId) : todoOrId;
  return String(
    todo?.workspaceId
    || todo?.kanbanWorkspaceId
    || todo?.actorWorkspaceId
    || todo?.senderWorkspaceId
    || state.selectedWorkspaceId
    || "owner"
  ).trim() || "owner";
}

function kanbanCardActionBody(todoOrId, extra = {}) {
  return JSON.stringify(Object.assign({ workspaceId: kanbanCardWorkspaceId(todoOrId) }, extra || {}));
}

function kanbanCaseMode(todo) {
  return String(todo?.kanbanCaseMode || "").trim();
}

function kanbanCardHasExplicitStoryCase(todo) {
  const mode = kanbanCaseMode(todo);
  if (mode === "single-card") return false;
  return Boolean(String(todo?.kanbanCaseId || "").trim() || mode);
}

function kanbanCaseTemplate(todo) {
  return String(todo?.kanbanCaseTemplate || todo?.kanbanStudyKind || "").trim().toLowerCase();
}

function isKanbanStudyCase(todo) {
  return kanbanCaseMode(todo) === "study-plan";
}

function isKanbanAssessmentCase(todo) {
  return kanbanCaseMode(todo) === "assessment-plan";
}

function isKanbanReadingPlanCase(todo) {
  return isKanbanStudyCase(todo) && kanbanCaseTemplate(todo) === "reading";
}

function isKanbanFinalStudyAssessment(todo) {
  return isKanbanStudyCase(todo) && kanbanCaseTemplate(todo) === "final-assessment";
}

function isKanbanAssessmentCard(todo) {
  return isKanbanAssessmentCase(todo) || isKanbanFinalStudyAssessment(todo);
}

function isKanbanProgrammingAssessmentCard(todo) {
  if (!isKanbanAssessmentCard(todo)) return false;
  const summary = todo?.assessmentExam && typeof todo.assessmentExam === "object" ? todo.assessmentExam : {};
  const text = [
    kanbanCaseTemplate(todo),
    todo?.kanbanStudyKind,
    todo?.kanbanAssessmentKind,
    todo?.kanbanCaseSummary,
    todo?.content,
    summary.subject,
    summary.subjectId,
  ].filter(Boolean).join("\n");
  return /programming|coding|python|javascript|typescript|java\b|c\+\+|c#|scratch|编程|程式|程序|代码|代碼|算法|开发|開發/i.test(text);
}

function kanbanStudyLabels(todo) {
  const reading = isKanbanReadingPlanCase(todo);
  return {
    plan: "学习计划",
    item: reading ? "阅读" : "学习",
    submit: reading ? "提交录音" : "提交学习记录",
    upload: reading ? "上传复述录音" : "上传学习成果",
    recording: reading ? "复述录音" : "学习成果",
    analysis: reading ? "转写与分析" : "整理与分析",
    quiz: reading ? "练习考卷" : "学习测验",
    completed: reading ? "本次阅读已完成。" : "本次学习已完成。",
    receipt: reading ? "阅读回执" : "学习回执",
  };
}

function kanbanActorRole(todo) {
  return String(todo?.kanbanActorRole || "").trim().toLowerCase();
}

function kanbanActorPermissions(todo) {
  return todo?.kanbanActorPermissions && typeof todo.kanbanActorPermissions === "object"
    ? todo.kanbanActorPermissions
    : null;
}

function kanbanCan(todo, key) {
  const permissions = kanbanActorPermissions(todo);
  if (permissions && typeof permissions[key] === "boolean") return permissions[key];
  const role = kanbanActorRole(todo);
  if (!role || role === "manager") return true;
  if (role === "viewer") return key === "canView";
  if (role === "performer") return ["canView", "canSubmitStudy", "canAnswerQuiz"].includes(key);
  return true;
}

function kanbanComposerProgressSteps() {
  if (state.kanbanComposerProgressKind === "assessment") return KANBAN_ASSESSMENT_PROGRESS_STEPS;
  if (state.kanbanComposerProgressKind === "reading") return KANBAN_READING_PROGRESS_STEPS;
  return state.kanbanComposerProgressKind === "create"
    ? KANBAN_CREATE_PROGRESS_STEPS
    : KANBAN_PLAN_PROGRESS_STEPS;
}

function clearKanbanComposerProgressTimer() {
  window.clearInterval(state.kanbanComposerProgressTimer);
  state.kanbanComposerProgressTimer = 0;
}

function beginKanbanComposerProgress(kind) {
  clearKanbanComposerProgressTimer();
  state.kanbanComposerProgressKind = kind || "plan";
  state.kanbanComposerProgressStartedAt = Date.now();
  state.kanbanComposerProgressStep = 0;
  state.kanbanComposerProgressTimer = window.setInterval(() => {
    if (!state.kanbanComposerBusy && !state.kanbanPlanCreating) {
      clearKanbanComposerProgressTimer();
      return;
    }
    const steps = kanbanComposerProgressSteps();
    state.kanbanComposerProgressStep = Math.min(steps.length - 1, state.kanbanComposerProgressStep + 1);
    if (kanbanComposerOpen()) renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }, 2200);
}

function finishKanbanComposerProgress() {
  clearKanbanComposerProgressTimer();
  state.kanbanComposerProgressKind = "";
  state.kanbanComposerProgressStartedAt = 0;
  state.kanbanComposerProgressStep = 0;
}

function syncKanbanComposerDraftFromDom() {
  const input = $("kanbanComposerText");
  if (!input) return;
  state.kanbanComposerText = input.value || "";
  if (state.kanbanComposerText) localStorage.setItem("hermesKanbanComposerDraft", state.kanbanComposerText);
  else localStorage.removeItem("hermesKanbanComposerDraft");
}

function syncKanbanReadingDraftFromDom(root = document) {
  const draft = Object.assign(defaultKanbanReadingDraft(), state.kanbanReadingDraft || {});
  const viewerInputs = Array.from(root.querySelectorAll?.("[data-kanban-study-viewer-workspace]") || []);
  const selectedViewers = viewerInputs.length
    ? viewerInputs.filter((input) => input.checked).map((input) => input.value).filter(Boolean).join(",")
    : root.querySelector?.("#kanbanStudyViewerWorkspaces")?.value;
  const fields = {
    caseMode: "study-plan",
    studyTemplate: root.querySelector?.("#kanbanStudyTemplate")?.value,
    subjectDomain: root.querySelector?.("#kanbanStudySubject")?.value,
    activityTitle: root.querySelector?.("#kanbanStudyTitle")?.value,
    learnerName: root.querySelector?.("#kanbanStudyLearner")?.value,
    readerName: root.querySelector?.("#kanbanReadingReader")?.value,
    bookTitle: root.querySelector?.("#kanbanReadingBook")?.value,
    performerWorkspaceId: root.querySelector?.("#kanbanStudyPerformerWorkspace")?.value,
    viewerWorkspaceIds: selectedViewers,
    sessions: root.querySelector?.("#kanbanReadingSessions")?.value,
    startDate: root.querySelector?.("#kanbanReadingStartDate")?.value,
    timeOfDay: root.querySelector?.("#kanbanReadingTime")?.value,
    scheduleFrequency: normalizeKanbanStudyScheduleFrequency(root.querySelector?.("#kanbanStudyScheduleFrequency")?.value),
    scheduleWeekdays: selectedKanbanStudyWeekdays(root) || draft.scheduleWeekdays || "1",
    scheduleMonthDay: root.querySelector?.("#kanbanStudyScheduleMonthDay")?.value,
    reminderLeadMinutes: root.querySelector?.("#kanbanReadingReminder")?.value,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) draft[key] = value || "";
  }
  if (fields.learnerName !== undefined) draft.readerName = draft.learnerName || draft.readerName || "";
  if (fields.activityTitle !== undefined) draft.bookTitle = draft.activityTitle || draft.bookTitle || "";
  state.kanbanReadingDraft = draft;
  localStorage.setItem("hermesKanbanReadingDraft", JSON.stringify(draft));
  updateKanbanPlanBindingPreview(root, "study");
}

function syncKanbanAssessmentDraftFromDom(root = document) {
  const draft = Object.assign(defaultKanbanAssessmentDraft(), state.kanbanAssessmentDraft || {});
  const viewerInputs = Array.from(root.querySelectorAll?.("[data-kanban-assessment-viewer-workspace]") || []);
  const selectedViewers = viewerInputs.length
    ? viewerInputs.filter((input) => input.checked).map((input) => input.value).filter(Boolean).join(",")
    : root.querySelector?.("#kanbanAssessmentViewerWorkspaces")?.value;
  const fields = {
    caseMode: "assessment-plan",
    subject: root.querySelector?.("#kanbanAssessmentSubject")?.value,
    learnerName: root.querySelector?.("#kanbanAssessmentLearner")?.value,
    courseLevel: root.querySelector?.("#kanbanAssessmentLevel")?.value,
    planTitle: root.querySelector?.("#kanbanAssessmentTitle")?.value,
    performerWorkspaceId: root.querySelector?.("#kanbanAssessmentPerformerWorkspace")?.value,
    viewerWorkspaceIds: selectedViewers,
    examCount: root.querySelector?.("#kanbanAssessmentExamCount")?.value,
    questionCount: root.querySelector?.("#kanbanAssessmentQuestionCount")?.value,
    durationMinutes: root.querySelector?.("#kanbanAssessmentDuration")?.value,
    passingScore: root.querySelector?.("#kanbanAssessmentPassingScore")?.value,
    intervalDays: root.querySelector?.("#kanbanAssessmentIntervalDays")?.value,
    startDate: root.querySelector?.("#kanbanAssessmentStartDate")?.value,
    timeOfDay: root.querySelector?.("#kanbanAssessmentTime")?.value,
    reminderLeadMinutes: root.querySelector?.("#kanbanAssessmentReminder")?.value,
    difficulty: root.querySelector?.("#kanbanAssessmentDifficulty")?.value,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) draft[key] = value || "";
  }
  state.kanbanAssessmentDraft = draft;
  localStorage.setItem("hermesKanbanAssessmentDraft", JSON.stringify(draft));
  updateKanbanPlanBindingPreview(root, "assessment");
}

function setKanbanReadingCoverFile(file) {
  if (state.kanbanReadingCoverPreviewUrl) URL.revokeObjectURL(state.kanbanReadingCoverPreviewUrl);
  state.kanbanReadingCoverFile = file || null;
  state.kanbanReadingCoverPreviewUrl = file ? URL.createObjectURL(file) : "";
  const draft = Object.assign(defaultKanbanReadingDraft(), state.kanbanReadingDraft || {});
  draft.coverName = file?.name || "";
  state.kanbanReadingDraft = draft;
  localStorage.setItem("hermesKanbanReadingDraft", JSON.stringify(draft));
}

function normalizeKanbanStudyScheduleFrequency(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (["weekly", "week", "\u6bcf\u5468"].includes(text)) return "weekly";
  if (["monthly", "month", "\u6bcf\u6708"].includes(text)) return "monthly";
  return "daily";
}

function parseKanbanStudyWeekdays(value = "") {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[,\s;，、]+/);
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const number = Number(item);
    const normalized = number === 0 ? 7 : number;
    if (!Number.isFinite(normalized) || normalized < 1 || normalized > 7 || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function selectedKanbanStudyWeekdays(root = document) {
  const checked = Array.from(root.querySelectorAll("[data-kanban-study-weekday]:checked"))
    .map((item) => item.value);
  return parseKanbanStudyWeekdays(checked).join(",");
}

function saveKanbanComposerMode(mode) {
  const normalized = mode === "reading" ? "study" : mode;
  const next = ["single", "multi", "study", "assessment"].includes(normalized) ? normalized : "single";
  state.kanbanComposerMode = next;
  state.kanbanComposerMultiAgent = next === "multi";
  localStorage.setItem("hermesKanbanComposerMode", next);
  localStorage.setItem("hermesKanbanComposerMultiAgent", next === "multi" ? "1" : "0");
}

function saveKanbanComposerMaxParallel(value) {
  const next = normalizeKanbanComposerMaxParallel(value);
  state.kanbanComposerMaxParallel = next;
  localStorage.setItem("hermesKanbanComposerMaxParallel", String(next));
  return next;
}

function saveKanbanComposerReasoningEffort(value) {
  const effort = String(value || "").trim().toLowerCase();
  const next = ["low", "medium", "high", "xhigh"].includes(effort) ? effort : "";
  state.kanbanComposerReasoningEffort = next;
  if (next) localStorage.setItem("hermesKanbanComposerReasoningEffort", next);
  else localStorage.removeItem("hermesKanbanComposerReasoningEffort");
  return next;
}

function kanbanComposerDocumentContext() {
  const docs = Array.isArray(state.kanbanComposerDocuments) ? state.kanbanComposerDocuments : [];
  return docs
    .slice(0, 3)
    .filter((item) => String(item?.text || "").trim())
    .map((item, index) => {
      const text = String(item.text || "").trim();
      const limited = text.length > 60000 ? `${text.slice(0, 60000)}\n\n[document truncated in composer: ${text.length} chars total]` : text;
      return [
        `Document ${index + 1}: ${item.name || "kanban-source"}`,
        limited,
      ].join("\n\n");
    })
    .join("\n\n---\n\n");
}

function kanbanComposerSubmissionText(rawText = "") {
  return [String(rawText || "").trim(), kanbanComposerDocumentContext()].filter(Boolean).join("\n\n");
}

function clearKanbanComposerDocuments() {
  state.kanbanComposerDocuments = [];
  state.kanbanComposerDocumentUploading = false;
}

function todoRefreshShouldYieldToKanbanComposer(options = {}) {
  if (!kanbanComposerOpen() || options.forceRender) return false;
  if (options.autoRefresh || options.freshServer) return true;
  return kanbanComposerFocused();
}

function clearTodoAutoRefresh() {
  window.clearTimeout(state.todoAutoRefreshTimer);
  state.todoAutoRefreshTimer = 0;
}

function scheduleTodoAutoRefresh() {
  clearTodoAutoRefresh();
  if (state.viewMode !== "todos") return;
  if (document.visibilityState === "hidden") return;
  state.todoAutoRefreshTimer = window.setTimeout(() => {
    state.todoAutoRefreshTimer = 0;
    if (state.viewMode !== "todos" || document.visibilityState === "hidden") return;
    if (kanbanComposerOpen()) {
      scheduleTodoAutoRefresh();
      return;
    }
    loadTodos({ preserveScroll: true, autoRefresh: true }).catch(() => scheduleTodoAutoRefresh());
  }, TODO_AUTO_REFRESH_INTERVAL_MS);
}

function todoListCacheKey(workspaceId, includeCompleted) {
  return `hermesTodoList:${CLIENT_VERSION}:${workspaceId || "owner"}:${includeCompleted ? "all" : "open"}`;
}

function readTodoListCache(workspaceId, includeCompleted) {
  try {
    const raw = localStorage.getItem(todoListCacheKey(workspaceId, includeCompleted));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() - Number(parsed.savedAt || 0) > TODO_LIST_CACHE_MAX_AGE_MS) return null;
    if (!Array.isArray(parsed.todos)) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeTodoListCache(workspaceId, includeCompleted) {
  try {
    localStorage.setItem(todoListCacheKey(workspaceId, includeCompleted), JSON.stringify({
      savedAt: Date.now(),
      todos: state.todos,
      assignees: state.todoAssignees,
      source: state.todoSource,
      board: state.todoKanbanBoard,
    }));
  } catch (_) {}
}

function clearTodoListCache(workspaceId = state.selectedWorkspaceId || "owner") {
  try {
    localStorage.removeItem(todoListCacheKey(workspaceId, false));
    localStorage.removeItem(todoListCacheKey(workspaceId, true));
  } catch (_) {}
}

function applyTodoListResult(result, includeCompleted, workspaceId = state.selectedWorkspaceId || "owner") {
  state.todos = result.data || result.todos || [];
  state.todoWorkspaceId = workspaceId || "owner";
  state.todoAssignees = result.assignees || [];
  state.todoSource = result.source || result.result?.source || "";
  state.todoKanbanBoard = result.result?.board || result.board || state.todos.find((todo) => todo.kanbanBoard)?.kanbanBoard || "";
  state.todoCompletedLoaded = includeCompleted;
}

async function loadTodos(options = {}) {
  if (todoRefreshShouldYieldToKanbanComposer(options)) {
    scheduleTodoAutoRefresh();
    return;
  }
  const workspaceId = state.selectedWorkspaceId || "owner";
  const params = new URLSearchParams();
  params.set("workspaceId", workspaceId);
  params.set("limit", "120");
  const includeCompleted = shouldLoadCompletedTodos(options);
  const targetTodoId = String(options.targetId || state.selectedTodoId || "").trim();
  if (includeCompleted) params.set("includeCompleted", "1");
  params.set("scope", "mine");
  if (targetTodoId) params.set("targetId", targetTodoId);
  if (options.freshServer || targetTodoId) params.set("fresh", "1");
  const search = targetTodoId ? "" : currentSearchText();
  if (search) params.set("search", search);
  const conversation = $("conversation");
  const restoreScrollTop = options.preserveScroll && conversation ? conversation.scrollTop : null;
  const useCache = !options.autoRefresh && !options.skipCache && !search && state.viewMode === "todos" && !state.selectedTodoId;
  const cached = useCache ? readTodoListCache(workspaceId, includeCompleted) : null;
  if (cached) {
    applyTodoListResult(cached, includeCompleted, workspaceId);
    updateSearchButton();
    renderTodos({ preserveScroll: options.preserveScroll, restoreScrollTop });
    setComposerEnabled(false);
  } else if (useCache && state.todos.length && state.todoWorkspaceId === workspaceId && state.todoCompletedLoaded === includeCompleted) {
    updateSearchButton();
    renderTodos({ preserveScroll: options.preserveScroll, restoreScrollTop });
    setComposerEnabled(false);
  }
  const result = await api(`${boardCollectionApiPath()}?${params}`);
  if (options.autoRefresh && state.viewMode !== "todos") return;
  const yieldToComposer = todoRefreshShouldYieldToKanbanComposer(options);
  applyTodoListResult(result, includeCompleted, workspaceId);
  if (!search) writeTodoListCache(workspaceId, includeCompleted);
  if (yieldToComposer) {
    scheduleTodoAutoRefresh();
    return;
  }
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  if (state.selectedTodoId && !state.todos.some((todo) => todo.id === state.selectedTodoId)) {
    state.todoRouteMissingTargetId = state.selectedTodoId;
    state.selectedTodoId = "";
  } else if (targetTodoId) {
    state.todoRouteMissingTargetId = "";
  }
  updateSearchButton();
  const finalRestoreScrollTop = options.preserveScroll && conversation ? conversation.scrollTop : restoreScrollTop;
  renderTodos({ preserveScroll: options.preserveScroll, restoreScrollTop: finalRestoreScrollTop });
  if (result?.cache?.hit && !options.freshServer && !options.autoRefresh && state.viewMode === "todos") {
    window.setTimeout(() => {
      if (state.viewMode === "todos" && !kanbanComposerOpen()) loadTodos({ preserveScroll: true, skipCache: true, freshServer: true }).catch(showError);
    }, 0);
  }
  setComposerEnabled(false);
  scheduleTodoAutoRefresh();
}

async function loadKanbanCardDetail(todoId, options = {}) {
  const id = String(todoId || "").trim();
  if (!id || !isKanbanTodoSource()) return;
  const existing = todoCardDetailState(id);
  if (existing?.loading) return;
  if (existing && !options.force) return;
  state.todoCardDetails[id] = Object.assign({}, existing || {}, { loading: true, error: "" });
  if (!options.silent) renderTodos({ preserveScroll: true });
  try {
    const params = new URLSearchParams();
    params.set("workspaceId", kanbanCardWorkspaceId(id));
    params.set("logTail", "4000");
    const result = await api(`/api/kanban/cards/${encodeURIComponent(id)}/detail?${params.toString()}`);
    state.todoCardDetails[id] = Object.assign({}, result.detail || {}, { loading: false, error: "" });
  } catch (err) {
    state.todoCardDetails[id] = Object.assign({}, existing || {}, { loading: false, error: err.message || String(err) });
  }
  renderTodos({ preserveScroll: true });
}

function todoStatusLabel(todo) {
  const status = String(todo?.status || "");
  if (status === "completed") return "done";
  if (status === "cancelled") return "cancelled";
  return "open";
}

function todoStatusText(todo) {
  const status = String(todo?.status || "");
  if (status === "completed") return "已完成";
  if (status === "cancelled") return "已取消";
  return "未完成";
}

function normalizedKanbanStatus(todo) {
  const status = String(todo?.kanbanStatus || todo?.kanban_status || "").trim().toLowerCase();
  if (isKanbanAssessmentCard(todo)) {
    const workflow = todoWorkflowState(todo);
    const phase = String(workflow?.phase || "").trim().toLowerCase();
    if (phase === "archived") return "archived";
    if (phase === "locked") return "blocked";
    if (phase === "exam_open") return "todo";
    if (phase === "in_progress" || phase === "retake_required") return "running";
  }
  if (
    isKanbanAssessmentCard(todo)
    && status === "done"
    && !assessmentExamCompleted(todo)
  ) {
    return "blocked";
  }
  if (KANBAN_STATUS_ORDER.includes(status)) return status;
  const compatible = String(todo?.status || "").trim().toLowerCase();
  if (
    isKanbanAssessmentCard(todo)
    && compatible === "completed"
    && !assessmentExamCompleted(todo)
  ) {
    return "blocked";
  }
  if (compatible === "completed") return "done";
  if (compatible === "cancelled") return "archived";
  return "todo";
}

function kanbanStatusMeta(todoOrStatus) {
  const status = typeof todoOrStatus === "string" ? todoOrStatus : normalizedKanbanStatus(todoOrStatus);
  return KANBAN_STATUS_META[status] || { label: status || "Todo", shortLabel: status || "todo" };
}

function kanbanStatusText(todo) {
  const status = normalizedKanbanStatus(todo);
  const meta = kanbanStatusMeta(status);
  return `${meta.label} / ${meta.shortLabel}`;
}

function currentTodoKanbanStatus(grouped) {
  const selected = String(state.todoKanbanStatus || "").trim().toLowerCase();
  if (selected === KANBAN_STORY_STATUS) return KANBAN_STORY_STATUS;
  if (KANBAN_STATUS_ORDER.includes(selected)) return selected;
  const fallback = KANBAN_STATUS_FALLBACK_ORDER.find((status) => (grouped?.get(status) || []).length)
    || KANBAN_STORY_STATUS;
  state.todoKanbanStatus = fallback;
  localStorage.setItem("hermesTodoKanbanStatus", fallback);
  return fallback;
}

function isKanbanTodoSource() {
  return true;
}

function boardCollectionApiPath() {
  return "/api/kanban/cards";
}

function boardActionApiPath(todoId, action = "") {
  return `${boardCollectionApiPath()}/${encodeURIComponent(todoId)}/${action}`;
}

function todoBoardLabel() {
  return state.todoKanbanBoard || state.todos.find((todo) => todo.kanbanBoard)?.kanbanBoard || "default";
}

function todoPriorityLabel(todo) {
  const priority = Number(todo?.kanbanPriority || 0);
  return Number.isFinite(priority) && priority > 0 ? `P${priority}` : "";
}

function todoTimestampLabel(value) {
  return formatTime(value) || String(value || "");
}

function todoSortTimestamp(todo) {
  const candidates = [
    todo?.kanbanCompletedAt,
    todo?.completedAt,
    todo?.cancelledAt,
    todo?.updatedAt,
    todo?.createdAt,
    todo?.dueAt,
    todo?.dueLocal,
  ];
  for (const value of candidates) {
    const parsed = Date.parse(String(value || "").replace(" ", "T"));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function sortArchivedKanbanCards(items) {
  return [...(items || [])].sort((left, right) => {
    const delta = todoSortTimestamp(right) - todoSortTimestamp(left);
    if (delta) return delta;
    return String(right?.id || "").localeCompare(String(left?.id || ""));
  });
}

function cleanKanbanInternalResultLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:MEDIA:|Audio file:|Analysis file:)\s*/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanKanbanReadingResultText(text) {
  let value = String(text || "").trim();
  const aiMatch = value.match(/(?:^|\n)AI analysis:\s*/i);
  if (aiMatch) {
    value = value.slice((aiMatch.index || 0) + aiMatch[0].length);
  } else {
    const transcriptMatch = value.match(/(?:^|\n)Transcript:\s*/i);
    if (transcriptMatch) value = value.slice(0, transcriptMatch.index || 0);
  }
  value = value.replace(/^\s*Reading (?:submission|retelling) analysis completed[^\n]*\.?\s*$/gmi, "");
  return cleanKanbanInternalResultLines(value);
}

function kanbanDisplayResultText(todo, text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (isKanbanAssessmentCard(todo) && !assessmentHasVisibleResult(todo)) return "";
  return isKanbanReadingCard(todo)
    ? cleanKanbanReadingResultText(raw)
    : cleanKanbanInternalResultLines(raw);
}

function kanbanStoryHelperOptions(extra = {}) {
  return Object.assign({
    allTodos: state.todos || [],
    statusOrder: KANBAN_STATUS_ORDER,
    todoSortTimestamp,
    todoTitle,
    compactDisplayText,
    isKanbanReadingCard,
    isKanbanAssessmentCard,
    normalizedKanbanStatus,
    kanbanStatusMeta,
    assessmentExamSummary,
    assessmentExamCompleted,
    assessmentCardAcceptsStart,
    readingSubmissionHasAnalysis,
    readingSubmissionCompleted,
    readingCardAcceptsSubmission,
    kanbanCan,
    kanbanDisplayResultText,
    todoCardDetailState,
    kanbanCardOutputs,
    isKanbanTodoSource,
  }, extra || {});
}

function isReadingPlanWaitingCard(todo) {
  if (!isKanbanReadingCard(todo)) return false;
  if (normalizedKanbanStatus(todo) !== "blocked") return false;
  const reason = String(todo?.kanbanBlockReason || "").toLowerCase();
  if (reason.includes("previous reading session") || reason.includes("future reading")) return true;
  return arrayFromKanbanField(todo?.kanbanCaseDependsOn, 12).length > 0 && !String(todo?.kanbanResult || "").trim();
}

function kanbanReadingCaseKey(todo) {
  return KanbanStoryHelpers.kanbanReadingCaseKey(todo);
}

function kanbanVisibleReadingTodoIds(todos) {
  return KanbanStoryHelpers.kanbanVisibleReadingTodoIds(todos, kanbanStoryHelperOptions());
}

function kanbanReadingRevisionOriginal(group, item) {
  return KanbanStoryHelpers.kanbanReadingRevisionOriginal(group, item);
}

function isKanbanReadingRevision(itemOrTodo) {
  return KanbanStoryHelpers.isKanbanReadingRevision(itemOrTodo);
}

function kanbanReadingDisplayCardIndex(group, item) {
  return KanbanStoryHelpers.kanbanReadingDisplayCardIndex(group, item);
}

function kanbanRevisionSortTimestamp(item) {
  return KanbanStoryHelpers.kanbanRevisionSortTimestamp(item, kanbanStoryHelperOptions());
}

function kanbanLatestRevisionReplacementItems(group, predicate = null) {
  return KanbanStoryHelpers.kanbanLatestRevisionReplacementItems(group, predicate, kanbanStoryHelperOptions());
}

function kanbanAssessmentVisibleCardItems(group) {
  return KanbanStoryHelpers.kanbanAssessmentVisibleCardItems(group, kanbanStoryHelperOptions());
}

function kanbanAssessmentStoryVisibleCardItems(group) {
  return KanbanStoryHelpers.kanbanAssessmentStoryVisibleCardItems(group, kanbanStoryHelperOptions());
}

function kanbanReadingStoryVisibleCardItems(group) {
  return KanbanStoryHelpers.kanbanReadingStoryVisibleCardItems(group, kanbanStoryHelperOptions());
}

function kanbanReadingBaseCardItems(group) {
  return KanbanStoryHelpers.kanbanReadingBaseCardItems(group);
}

function kanbanReadingDisplayCardCount(group) {
  return KanbanStoryHelpers.kanbanReadingDisplayCardCount(group);
}

function kanbanVisibleBoardTodos(todos) {
  return KanbanStoryHelpers.kanbanVisibleBoardTodos(todos, kanbanStoryHelperOptions());
}

function kanbanReadingStartTime(todo) {
  const value = String(todo?.dueAt || todo?.dueLocal || "").trim();
  if (!value) return NaN;
  const parsed = Date.parse(value.replace(" ", "T"));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function todoWorkflowState(todo) {
  const workflow = todo?.workflowState && typeof todo.workflowState === "object" ? todo.workflowState : null;
  if (!workflow) return null;
  if (
    ["reading", "study", "assessment", "final-assessment"].includes(String(workflow.kind || ""))
    && workflow.priorContextAvailable === false
  ) {
    return null;
  }
  return workflow;
}

function readingCardAcceptsSubmission(todo) {
  if (!isKanbanReadingCard(todo)) return false;
  const workflow = todoWorkflowState(todo);
  if (workflow && Object.prototype.hasOwnProperty.call(workflow, "canSubmitStudy")) return Boolean(workflow.canSubmitStudy);
  const status = normalizedKanbanStatus(todo);
  if (status === "done" || status === "archived") return false;
  if (status === "blocked" && !readingCasePriorComplete(todo)) return false;
  return true;
}

function assessmentExamSummary(todo) {
  return todo?.assessmentExam && typeof todo.assessmentExam === "object"
    ? todo.assessmentExam
    : null;
}

function assessmentExamCompleted(todo) {
  const workflow = todoWorkflowState(todo);
  if (workflow && (workflow.kind === "assessment" || workflow.kind === "final-assessment")) return Boolean(workflow.completed);
  const summary = assessmentExamSummary(todo);
  if (summary?.completionError) return false;
  return String(summary?.status || "") === "completed";
}

function assessmentHasVisibleResult(todo) {
  const summary = assessmentExamSummary(todo);
  return Boolean(summary?.lastAttempt) || assessmentExamCompleted(todo);
}

function kanbanCasePriorCards(todo, predicate) {
  return KanbanStoryHelpers.kanbanCasePriorCards(todo, predicate, kanbanStoryHelperOptions());
}

function readingCasePriorComplete(todo) {
  return KanbanStoryHelpers.readingCasePriorComplete(todo, kanbanStoryHelperOptions());
}

function learningReadingUiOptions(extra = {}) {
  return Object.assign({
    state,
    todos: state.todos || [],
    escapeHtml,
    isKanbanReadingCard,
    normalizedKanbanStatus,
    kanbanStudyLabels,
    readingSubmissionFeedback,
    readingSubmissionHasAnalysis,
    readingQuizState,
    readingSubmissionCompleted,
    readingCardAcceptsSubmission,
    kanbanCan,
    readingSubmissionSummary,
    isKanbanReadingPlanCase,
    renderLearningGuidancePanel,
    renderAnswerReviewGate,
    supportsKanbanReadingRecorder,
    kanbanReadingRecordingStatusText,
    todoMatchesOpen,
    renderKanbanReadingRecorderControls,
  }, extra);
}

function nextReadingCaseTodo(todo) {
  return LearningReadingUi.nextReadingCaseTodo(todo, learningReadingUiOptions());
}

function assessmentPriorComplete(todo) {
  return KanbanStoryHelpers.assessmentPriorComplete(todo, kanbanStoryHelperOptions());
}

function assessmentCardAcceptsStart(todo) {
  if (!isKanbanAssessmentCard(todo) || assessmentExamCompleted(todo)) return false;
  const workflow = todoWorkflowState(todo);
  if (workflow && Object.prototype.hasOwnProperty.call(workflow, "canStartExam")) {
    return Boolean(workflow.canStartExam || workflow.canAnswerQuiz);
  }
  const status = normalizedKanbanStatus(todo);
  if (status === "archived") return false;
  return assessmentPriorComplete(todo);
}

function kanbanAssessmentCaseCurrentItem(group) {
  return KanbanStoryHelpers.kanbanAssessmentCaseCurrentItem(group, kanbanStoryHelperOptions());
}

function kanbanReadingCaseCurrentItem(group) {
  return KanbanStoryHelpers.kanbanReadingCaseCurrentItem(group, kanbanStoryHelperOptions());
}

function stableDisplayHash(value) {
  return KanbanStoryHelpers.stableDisplayHash(value);
}

function arrayFromKanbanField(value, limit = 8) {
  return KanbanStoryHelpers.arrayFromKanbanField(value, limit);
}

function kanbanDescriptionSection(description, heading) {
  return KanbanStoryHelpers.kanbanDescriptionSection(description, heading);
}

function kanbanDescriptionList(description, heading, limit = 8) {
  return KanbanStoryHelpers.kanbanDescriptionList(description, heading, limit);
}

function parsedKanbanPlanDescription(todo) {
  return KanbanStoryHelpers.parsedKanbanPlanDescription(todo);
}

function kanbanCardCaseInfo(todo) {
  return KanbanStoryHelpers.kanbanCardCaseInfo(todo);
}

function kanbanArchiveCases(items) {
  return KanbanStoryHelpers.kanbanArchiveCases(items, kanbanStoryHelperOptions());
}

function kanbanStoryCases(items) {
  return KanbanStoryHelpers.kanbanStoryCases(items, kanbanStoryHelperOptions());
}

function kanbanStoryCaseFullyArchived(group) {
  return KanbanStoryHelpers.kanbanStoryCaseFullyArchived(group, kanbanStoryHelperOptions());
}

function kanbanActiveStoryCases(items) {
  return KanbanStoryHelpers.kanbanActiveStoryCases(items, kanbanStoryHelperOptions());
}

function kanbanStoryCaseKey(group) {
  return KanbanStoryHelpers.kanbanStoryCaseKey(group);
}

function kanbanStoryCaseExpanded(group) {
  const key = kanbanStoryCaseKey(group);
  return Boolean(key && state.kanbanStoryExpanded && state.kanbanStoryExpanded[key]);
}

function kanbanStoryToggleAttrs(group, expanded) {
  const key = kanbanStoryCaseKey(group);
  return key
    ? ` data-kanban-story-case="${escapeHtml(key)}" role="button" tabindex="0" aria-expanded="${expanded ? "true" : "false"}"`
    : "";
}

function kanbanStoryCaseBodyOpen(group, options = {}) {
  return !options.collapsible || kanbanStoryCaseExpanded(group);
}

function kanbanStoryCaseRenderState(group, options = {}) {
  const collapsible = Boolean(options.collapsible);
  const expanded = kanbanStoryCaseBodyOpen(group, options);
  return {
    expanded,
    caseClass: collapsible && !expanded ? " story-collapsed" : "",
    toggleClass: collapsible ? " kanban-archive-case-toggle" : "",
    toggleAttrs: collapsible ? kanbanStoryToggleAttrs(group, expanded) : "",
  };
}

function kanbanStoryCaseArchiveItems(group) {
  return KanbanStoryHelpers.kanbanStoryCaseArchiveItems(group, kanbanStoryHelperOptions());
}

function renderKanbanStoryArchiveButton(group, options = {}) {
  if (!options.archiveAction) return "";
  const items = kanbanStoryCaseArchiveItems(group);
  if (!items.length) return "";
  const key = kanbanStoryCaseKey(group);
  return `<button class="kanban-archive-case-action" type="button" data-archive-kanban-story-case="${escapeHtml(key)}">${"\u5f52\u6863"}</button>`;
}

function kanbanStoryCaseDeleteItems(group) {
  return KanbanStoryHelpers.kanbanStoryCaseDeleteItems(group, kanbanStoryHelperOptions());
}

function kanbanStoryCaseCanDelete(group, options = {}) {
  return KanbanStoryHelpers.kanbanStoryCaseCanDelete(group, kanbanStoryHelperOptions(options));
}

function kanbanStorySwipeRenderState(group, options = {}) {
  const key = kanbanStoryCaseKey(group);
  const swipable = Boolean(key && kanbanStoryCaseCanDelete(group, options));
  return {
    articleClass: swipable ? " task-swipe-row kanban-story-swipe" : "",
    articleAttrs: swipable ? ` data-swipe-row data-swipe-kind="kanban-story" data-swipe-id="${escapeHtml(key)}"` : "",
    contentClass: swipable ? "task-swipe-content kanban-story-swipe-content" : "kanban-story-swipe-content",
    contentAttrs: swipable ? " data-swipe-content" : "",
    deleteButton: swipable
      ? `<button class="task-swipe-delete kanban-story-swipe-delete" type="button" data-delete-swipe aria-label="\u5220\u9664\u6545\u4e8b">\u5220\u9664</button>`
      : "",
  };
}

function kanbanArchiveStatusSummary(group) {
  return KanbanStoryHelpers.kanbanArchiveStatusSummary(group, kanbanStoryHelperOptions());
}

function kanbanArchiveConclusion(group) {
  return KanbanStoryHelpers.kanbanArchiveConclusion(group, kanbanStoryHelperOptions());
}

function kanbanCardStoryFeedback(todo) {
  return KanbanStoryHelpers.kanbanCardStoryFeedback(todo, kanbanStoryHelperOptions());
}

function kanbanCardNeedsStoryDetail(todo) {
  return KanbanStoryHelpers.kanbanCardNeedsStoryDetail(todo, kanbanStoryHelperOptions());
}

function kanbanCardStoryFeedbackLine(todo) {
  return KanbanStoryHelpers.kanbanCardStoryFeedbackLine(todo, kanbanStoryHelperOptions());
}

function scheduleKanbanStoryDetailLoads(items) {
  if (!isKanbanTodoSource() || state.selectedTodoId || kanbanComposerOpen()) return;
  if (String(state.todoKanbanStatus || "").trim().toLowerCase() !== KANBAN_STORY_STATUS) return;
  const queued = state.kanbanStoryDetailQueued || {};
  const ids = [];
  for (const group of kanbanActiveStoryCases(items).filter(kanbanStoryCaseExpanded).slice(0, 4)) {
    const cardItems = group.mode === "study-plan"
      ? [kanbanReadingCaseCurrentItem(group)].filter(Boolean)
      : group.mode === "assessment-plan"
        ? kanbanAssessmentStoryVisibleCardItems(group)
      : (group.cards || []).slice(0, 10);
    for (const item of cardItems) {
      const id = String(item?.todo?.id || "").trim();
      if (!id || queued[id] || !kanbanCardNeedsStoryDetail(item.todo)) continue;
      queued[id] = Date.now();
      ids.push(id);
      if (ids.length >= KANBAN_STORY_DETAIL_LOAD_LIMIT) break;
    }
    if (ids.length >= KANBAN_STORY_DETAIL_LOAD_LIMIT) break;
  }
  state.kanbanStoryDetailQueued = queued;
  ids.forEach((id, index) => {
    window.setTimeout(() => {
      loadKanbanCardDetail(id, { silent: true }).catch(showError);
    }, index * 120);
  });
}

function renderKanbanReadingArchiveCase(group, options = {}) {
  const cards = group.cards || [];
  const baseCards = kanbanReadingBaseCardItems(group);
  const visibleCards = kanbanReadingStoryVisibleCardItems(group);
  const first = cards[0]?.todo || {};
  const labels = kanbanStudyLabels(first);
  const current = kanbanReadingCaseCurrentItem(group);
  const currentTodo = current?.todo || first;
  const currentId = String(currentTodo?.id || "");
  const cover = cards.map((item) => kanbanCaseCover(item.todo)).find(Boolean);
  const requirement = compactDisplayText(group.sourceText || group.title || first.content || "", 320);
  const statusSummary = kanbanArchiveStatusSummary(group);
  const latest = group.latest ? todoTimestampLabel(new Date(group.latest).toISOString()) : "";
  const completed = baseCards.filter((item) => ["done", "archived"].includes(normalizedKanbanStatus(item.todo))).length;
  const total = kanbanReadingDisplayCardCount(group) || baseCards.length || cards.length;
  const progress = `${completed}/${total} \u5df2\u5b8c\u6210${statusSummary ? ` | ${statusSummary}` : ""}`;
  const conclusion = kanbanArchiveConclusion(group);
  const storyState = kanbanStoryCaseRenderState(group, options);
  const swipeState = kanbanStorySwipeRenderState(group, options);
  const archiveButton = renderKanbanStoryArchiveButton(group, options);
  const storyRows = visibleCards.map((item) => {
    const todo = item.todo || {};
    const status = kanbanStatusMeta(normalizedKanbanStatus(todo)).shortLabel;
    const feedback = kanbanCardStoryFeedbackLine(todo);
    const outputCount = kanbanCardOutputs(todo).length;
    const meta = [
      status,
      todo?.dueLocal || todo?.dueAt || "",
      outputCount ? `\u4ea4\u4ed8 ${outputCount}` : "",
      String(todo.id || "") === currentId ? "\u5f53\u524d" : "",
      todo?.kanbanRevisionOf ? "\u4fee\u6539\u4efb\u52a1" : "",
    ].filter(Boolean).join(" | ");
    return `<li>
      <button type="button" data-todo-id="${escapeHtml(todo.id)}">
        <span>${escapeHtml(String(kanbanReadingDisplayCardIndex(group, item) || item?.info?.cardIndex || todo.kanbanCaseCardIndex || 1))}</span>
        <strong>${escapeHtml(todo.content || todo.id)}</strong>
        <small>${escapeHtml(meta)}</small>
        ${feedback ? `<small class="kanban-archive-card-feedback">${escapeHtml(feedback)}</small>` : ""}
      </button>
    </li>`;
  }).join("");
  return `<article class="kanban-archive-case study-plan-case${storyState.caseClass}${swipeState.articleClass}"${swipeState.articleAttrs}>
    ${swipeState.deleteButton}
    <div class="${swipeState.contentClass}"${swipeState.contentAttrs}>
    <header class="kanban-archive-case-head${storyState.toggleClass}"${storyState.toggleAttrs}>
      <div>
        <span>${escapeHtml([labels.plan, statusSummary].filter(Boolean).join(" | "))}</span>
        <h3>${escapeHtml(group.title || first.content || first.id || "\u672a\u5f52\u7ec4")}</h3>
      </div>
      <span class="kanban-archive-case-tail"><small>${escapeHtml(latest)}</small>${archiveButton}</span>
    </header>
    ${cover ? renderKanbanCaseCover(cover, { compact: true }) : ""}
    <div class="kanban-archive-story-grid">
      <section>
        <strong>\u9700\u6c42</strong>
        <p>${escapeHtml(requirement || "\u672a\u8bb0\u5f55\u539f\u59cb\u9700\u6c42")}</p>
      </section>
      <section>
        <strong>\u8fdb\u5ea6</strong>
        <p>${escapeHtml(progress)}</p>
      </section>
      <section>
        <strong>\u7ed3\u8bba</strong>
        <p>${escapeHtml(conclusion)}</p>
      </section>
    </div>
    <ol class="kanban-archive-card-chain">${storyRows}</ol>
    </div>
  </article>`;
}

function stripAssessmentConfigText(text = "") {
  return String(text || "")
    .replace(/ASSESSMENT_CONFIG:[A-Za-z0-9_-]+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function assessmentTemplateDisplayText(group, currentTodo, firstTodo) {
  const summary = assessmentExamSummary(currentTodo) || assessmentExamSummary(firstTodo) || {};
  const questionCount = Number(summary.questionCount || currentTodo?.assessmentExam?.questionCount || firstTodo?.assessmentExam?.questionCount || 0) || 0;
  const durationMinutes = Number(summary.durationMinutes || currentTodo?.assessmentExam?.durationMinutes || firstTodo?.assessmentExam?.durationMinutes || 0) || 0;
  const passingScore = Number(summary.passingScore || currentTodo?.assessmentExam?.passingScore || firstTodo?.assessmentExam?.passingScore || 0) || 0;
  const source = compactDisplayText(stripAssessmentConfigText(group?.sourceText || firstTodo?.kanbanCaseSourceText || ""), 180);
  const revision = compactDisplayText(currentTodo?.kanbanRevisionRequest || "", 160);
  const parts = [
    questionCount && durationMinutes ? `${questionCount}\u9898/${durationMinutes}\u5206\u949f` : "",
    passingScore ? `\u901a\u8fc7\u7ebf ${passingScore}` : "",
    summary.finalExam ? "\u7ec8\u8003" : "",
    revision ? `\u672c\u6b21\u4fee\u6539\uff1a${revision}` : "",
    source,
  ].filter(Boolean);
  return parts.join(" | ") || "\u56fa\u5b9a\u6b63\u5f0f\u6d4b\u8bd5\u6a21\u677f";
}

function renderKanbanAssessmentArchiveCase(group, options = {}) {
  const cards = group.cards || [];
  const visibleCards = kanbanAssessmentVisibleCardItems(group);
  const visibleGroup = Object.assign({}, group, { cards: visibleCards });
  const first = visibleCards[0]?.todo || cards[0]?.todo || {};
  const current = kanbanAssessmentCaseCurrentItem(group);
  const currentTodo = current?.todo || first;
  const requirement = assessmentTemplateDisplayText(group, currentTodo, first);
  const statusSummary = kanbanArchiveStatusSummary(visibleGroup);
  const latest = group.latest ? todoTimestampLabel(new Date(group.latest).toISOString()) : "";
  const completed = visibleCards.filter((item) => assessmentExamCompleted(item.todo)).length;
  const total = Number(first.kanbanCaseCardCount || visibleCards.length || cards.length || 0) || visibleCards.length || cards.length;
  const summary = assessmentExamSummary(currentTodo) || {};
  const storyCards = kanbanAssessmentStoryVisibleCardItems(group);
  const currentId = String(currentTodo?.id || "");
  const storyState = kanbanStoryCaseRenderState(group, options);
  const swipeState = kanbanStorySwipeRenderState(group, options);
  const archiveButton = renderKanbanStoryArchiveButton(group, options);
  const storyRows = storyCards.map((item) => {
    const todo = item.todo || {};
    const itemSummary = assessmentExamSummary(todo) || {};
    const status = kanbanStatusMeta(normalizedKanbanStatus(todo)).shortLabel;
    const attempt = itemSummary.lastAttempt || null;
    const outputCount = kanbanCardOutputs(todo).length;
    const resultLine = attempt
      ? `${attempt.passed ? "已通过" : "未通过"} ${Number(attempt.score || 0)}/100`
      : "";
    const meta = [
      status,
      todo?.dueLocal || todo?.dueAt || "",
      itemSummary.questionCount ? `${itemSummary.questionCount}题/${itemSummary.durationMinutes || 30}分钟` : "",
      itemSummary.passingScore ? `通过线 ${itemSummary.passingScore}` : "",
      resultLine,
      outputCount ? `交付 ${outputCount}` : "",
      String(todo.id || "") === currentId ? "当前" : "",
      todo?.kanbanRevisionOf ? "修改任务" : "",
    ].filter(Boolean).join(" | ");
    const feedback = kanbanCardStoryFeedbackLine(todo);
    return `<li>
      <button type="button" data-todo-id="${escapeHtml(todo.id)}">
        <span>${escapeHtml(String(kanbanReadingDisplayCardIndex(group, item) || item?.info?.cardIndex || todo.kanbanCaseCardIndex || 1))}</span>
        <strong>${escapeHtml(todo.content || todo.id)}</strong>
        <small>${escapeHtml(meta)}</small>
        ${feedback ? `<small class="kanban-archive-card-feedback">${escapeHtml(feedback)}</small>` : ""}
      </button>
    </li>`;
  }).join("");
  return `<article class="kanban-archive-case assessment-plan-case${storyState.caseClass}${swipeState.articleClass}"${swipeState.articleAttrs}>
    ${swipeState.deleteButton}
    <div class="${swipeState.contentClass}"${swipeState.contentAttrs}>
    <header class="kanban-archive-case-head${storyState.toggleClass}"${storyState.toggleAttrs}>
      <div>
        <span>${escapeHtml(["考试计划", statusSummary].filter(Boolean).join(" | "))}</span>
        <h3>${escapeHtml(group.title || first.content || first.id || "考试计划")}</h3>
      </div>
      <span class="kanban-archive-case-tail"><small>${escapeHtml(latest)}</small>${archiveButton}</span>
    </header>
    <div class="kanban-archive-story-grid">
      <section>
        <strong>考试模板</strong>
        <p>${escapeHtml(requirement || "固定正式测试模板")}</p>
      </section>
      <section>
        <strong>进度</strong>
        <p>${escapeHtml(`${completed}/${total} 已通过${statusSummary ? ` | ${statusSummary}` : ""}`)}</p>
      </section>
      <section>
        <strong>规则</strong>
        <p>${escapeHtml("正式测试高于日常小测；低于通过线则保持重考，直到通过。")}</p>
      </section>
    </div>
    <ol class="kanban-archive-card-chain">${storyRows}</ol>
    </div>
  </article>`;
}

function renderKanbanArchiveCase(group, options = {}) {
  if (group.mode === "assessment-plan") return renderKanbanAssessmentArchiveCase(group, options);
  if (group.mode === "study-plan") return renderKanbanReadingArchiveCase(group, options);
  const cards = group.cards || [];
  const first = cards[0]?.todo || {};
  const cover = cards.map((item) => kanbanCaseCover(item.todo)).find(Boolean);
  const requirement = compactDisplayText(group.sourceText || group.title || first.content || "", 320);
  const conclusion = kanbanArchiveConclusion(group);
  const statusSummary = kanbanArchiveStatusSummary(group);
  const latest = group.latest ? todoTimestampLabel(new Date(group.latest).toISOString()) : "";
  const modeLabel = group.mode === "multi-agent" ? "\u591a Agent" : "\u5355\u5361";
  const titleByCardId = new Map(cards.map(({ todo, info }, index) => [
    info.cardId || `card-${info.cardIndex || index + 1}`,
    todo.content || info.cardId || todo.id || "",
  ]));
  const cardRows = cards.slice(0, 8).map(({ todo, info }, index) => {
    const status = kanbanStatusMeta(normalizedKanbanStatus(todo)).shortLabel;
    const goal = compactDisplayText(info.cardGoal || todo.description || todo.content || "", 160);
    const sequence = info.cardIndex || index + 1;
    const revisionLabel = todo.kanbanRevisionOf ? "\u4fee\u6539\u4efb\u52a1" : "";
    const dependencies = (info.dependsOn || [])
      .map((id) => titleByCardId.get(id) || id)
      .filter(Boolean)
      .join(" / ");
    const outputCount = kanbanCardOutputs(todo).length;
    const feedback = kanbanCardStoryFeedbackLine(todo);
    const meta = [status, revisionLabel, dependencies ? `\u4f9d\u8d56\uff1a${dependencies}` : "", goal].filter(Boolean).join(" | ");
    const feedbackLine = [feedback, outputCount ? `\u4ea4\u4ed8 ${outputCount}` : ""].filter(Boolean).join(" | ");
    return `<li>
      <button type="button" data-todo-id="${escapeHtml(todo.id)}">
        <span>${escapeHtml(String(sequence))}</span>
        <strong>${escapeHtml(todo.content || todo.id)}</strong>
        <small>${escapeHtml(meta)}</small>
        ${feedbackLine ? `<small class="kanban-archive-card-feedback">${escapeHtml(feedbackLine)}</small>` : ""}
      </button>
    </li>`;
  }).join("");
  const more = cards.length > 8 ? `<li class="kanban-archive-more">+${cards.length - 8}</li>` : "";
  const storyState = kanbanStoryCaseRenderState(group, options);
  const swipeState = kanbanStorySwipeRenderState(group, options);
  const archiveButton = renderKanbanStoryArchiveButton(group, options);
  const modeClass = group.mode === "single-card"
    ? " single-card-case"
    : (group.mode === "multi-agent" ? " multi-agent-case" : "");
  return `<article class="kanban-archive-case${modeClass}${storyState.caseClass}${swipeState.articleClass}"${swipeState.articleAttrs}>
    ${swipeState.deleteButton}
    <div class="${swipeState.contentClass}"${swipeState.contentAttrs}>
    <header class="kanban-archive-case-head${storyState.toggleClass}"${storyState.toggleAttrs}>
      <div>
        <span>${escapeHtml(["\u4efb\u52a1\u6545\u4e8b", modeLabel, statusSummary].filter(Boolean).join(" | "))}</span>
        <h3>${escapeHtml(group.title || first.content || first.id || "\u672a\u5f52\u7ec4")}</h3>
      </div>
      <span class="kanban-archive-case-tail"><small>${escapeHtml(latest)}</small>${archiveButton}</span>
    </header>
    ${cover ? renderKanbanCaseCover(cover, { compact: true }) : ""}
    <div class="kanban-archive-story-grid">
      <section>
        <strong>\u9700\u6c42</strong>
        <p>${escapeHtml(requirement || "\u672a\u8bb0\u5f55\u539f\u59cb\u9700\u6c42")}</p>
      </section>
      <section>
        <strong>\u62c6\u89e3</strong>
        <p>${escapeHtml(`${cards.length} \u5f20\u5361\u7247${statusSummary ? ` | ${statusSummary}` : ""}`)}</p>
      </section>
      <section>
        <strong>\u7ed3\u8bba</strong>
        <p>${escapeHtml(conclusion)}</p>
      </section>
    </div>
    <ol class="kanban-archive-card-chain">${cardRows}${more}</ol>
    </div>
  </article>`;
}

function renderKanbanArchiveStories(items) {
  const cases = kanbanArchiveCases(items);
  if (!cases.length) return `<div class="empty-state small">No archived cases.</div>`;
  return `<div class="kanban-archive-stories">${cases.map((group) => renderKanbanArchiveCase(group, { collapsible: true, deleteAction: true })).join("")}</div>`;
}

function renderKanbanStoryTree(items) {
  const cases = kanbanActiveStoryCases(items);
  if (!cases.length) {
    return `<div class="empty-state small">\u6682\u65e0\u6545\u4e8b\u6811\u3002\u5b66\u4e60\u8ba1\u5212\u3001\u8003\u8bd5\u8ba1\u5212\u6216\u591a Agent \u62c6\u89e3\u4f1a\u5728\u8fd9\u91cc\u805a\u5408\uff1b\u666e\u901a\u5355\u4efb\u52a1\u7559\u5728\u5bf9\u5e94\u72b6\u6001\u5217\u3002</div>`;
  }
  return `<div class="kanban-archive-stories">${cases.map((group) => renderKanbanArchiveCase(group, { collapsible: true, archiveAction: true, deleteAction: true })).join("")}</div>`;
}

function todoDueLabel(todo) {
  return todo?.dueLocal || formatTime(todo?.dueAt) || "No due time";
}

function todoTitle(todo) {
  return compactDisplayText(todo?.content || todo?.id || "Kanban card", 120);
}

function todoMatchesOpen(todo) {
  return String(todo?.status || "") === "open";
}

function defaultTodoAssignee() {
  return state.todoAssignees.some((item) => item.id === state.selectedWorkspaceId)
    ? state.selectedWorkspaceId
    : (state.todoAssignees[0]?.id || state.selectedWorkspaceId || "owner");
}

function renderTodoAssigneeOptions(selected = "") {
  const current = selected || defaultTodoAssignee();
  return (state.todoAssignees || []).map((item) => {
    const value = item.id || "";
    return `<option value="${escapeHtml(value)}"${value === current ? " selected" : ""}>${escapeHtml(item.label || value)}</option>`;
  }).join("");
}

function localDateTimeInputValue(value = null) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function todoDueInputValue(todo) {
  const local = String(todo?.dueLocal || "").trim();
  const match = local.match(/^(20\d{2})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`;
  return todo?.dueAt ? localDateTimeInputValue(todo.dueAt) : localDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000));
}
