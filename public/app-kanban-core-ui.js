"use strict";

const KANBAN_CORE_MODEL_ESM_PATH = "/vite-islands/kanban-todo-core-model/kanban-todo-core-model.js";
let kanbanCoreModel = null;
let kanbanCoreModelPromise = null;

function importKanbanCoreModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (kanbanCoreModel) return Promise.resolve(kanbanCoreModel);
  if (!kanbanCoreModelPromise) {
    const importer = typeof rootRef.__homeAiImportKanbanCoreModel === "function"
      ? rootRef.__homeAiImportKanbanCoreModel
      : (path) => import(path);
    kanbanCoreModelPromise = Promise.resolve()
      .then(() => importer(KANBAN_CORE_MODEL_ESM_PATH))
      .then((model) => {
        kanbanCoreModel = model || null;
        return kanbanCoreModel;
      })
      .catch((error) => {
        kanbanCoreModelPromise = null;
        throw error;
      });
  }
  return kanbanCoreModelPromise;
}

function currentKanbanCoreModel() {
  return kanbanCoreModel;
}

function kanbanCoreModelFunction(name) {
  const model = currentKanbanCoreModel();
  return model && typeof model[name] === "function" ? model[name] : null;
}

if (typeof window !== "undefined") {
  importKanbanCoreModel().catch(() => null);
}

function kanbanStatusNeedsCompleted(status) {
  const modelFn = kanbanCoreModelFunction("kanbanStatusNeedsCompletedPlan");
  if (modelFn) return modelFn(status, { storyStatus: KANBAN_STORY_STATUS, statusOrder: KANBAN_STATUS_ORDER });
  return status === KANBAN_STORY_STATUS || KANBAN_STATUS_ORDER.includes(status);
}

function shouldLoadCompletedTodos(options = {}) {
  const modelFn = kanbanCoreModelFunction("shouldLoadCompletedTodosPlan");
  if (modelFn) {
    return modelFn({
      includeCompleted: Object.prototype.hasOwnProperty.call(options, "includeCompleted") ? options.includeCompleted : undefined,
      searchText: currentSearchText(),
      selectedTodoId: state.selectedTodoId,
      todoKanbanStatus: state.todoKanbanStatus,
      storyStatus: KANBAN_STORY_STATUS,
      statusOrder: KANBAN_STATUS_ORDER,
    });
  }
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
  const modelFn = kanbanCoreModelFunction("kanbanCardWorkspaceIdPlan");
  if (modelFn) return modelFn(todo, state.selectedWorkspaceId);
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
  const todo = typeof todoOrId === "string" ? kanbanCardById(todoOrId) : todoOrId;
  const modelFn = kanbanCoreModelFunction("kanbanCardActionBodyPlan");
  const body = modelFn
    ? modelFn(todo, extra, state.selectedWorkspaceId)
    : Object.assign({ workspaceId: kanbanCardWorkspaceId(todoOrId) }, extra || {});
  return JSON.stringify(body);
}

function kanbanCaseMode(todo) {
  const modelFn = kanbanCoreModelFunction("kanbanCaseModePlan");
  if (modelFn) return modelFn(todo);
  return String(todo?.kanbanCaseMode || "").trim();
}

function kanbanCardHasExplicitStoryCase(todo) {
  const modelFn = kanbanCoreModelFunction("kanbanCardHasExplicitStoryCasePlan");
  if (modelFn) return modelFn(todo);
  const mode = kanbanCaseMode(todo);
  if (mode === "single-card") return false;
  return Boolean(String(todo?.kanbanCaseId || "").trim() || mode);
}

function kanbanCaseTemplate(todo) {
  const modelFn = kanbanCoreModelFunction("kanbanCaseTemplatePlan");
  if (modelFn) return modelFn(todo);
  return String(todo?.kanbanCaseTemplate || todo?.kanbanStudyKind || "").trim().toLowerCase();
}

function kanbanCaseLooksLikeReadingPlan(todo) {
  const modelFn = kanbanCoreModelFunction("kanbanCaseLooksLikeReadingPlanPlan");
  if (modelFn) return modelFn(todo);
  const template = kanbanCaseTemplate(todo);
  if (["reading", "english-reading", "reading-recording"].includes(template)) return true;
  if (template === "final-assessment" || template === "learning-growth") return false;
  const text = [
    todo?.kanbanCaseCardId,
    todo?.kanbanCaseSummary,
    todo?.kanbanCaseCardGoal,
    todo?.content,
    todo?.description,
    ...(Array.isArray(todo?.kanbanCaseDeliverables) ? todo.kanbanCaseDeliverables : []),
    ...(Array.isArray(todo?.kanbanCaseAcceptance) ? todo.kanbanCaseAcceptance : []),
  ].filter(Boolean).join("\n");
  return /reading-session|reading retell|retell audio|reading feedback|reading analysis|next reading guidance|读后复述|复述录音|阅读评价|阅读分析|阅读指导|转写/.test(text);
}

function isKanbanStudyCase(todo) {
  const modelFn = kanbanCoreModelFunction("isKanbanStudyCasePlan");
  if (modelFn) return modelFn(todo);
  return kanbanCaseMode(todo) === "study-plan";
}

function isKanbanAssessmentCase(todo) {
  const modelFn = kanbanCoreModelFunction("isKanbanAssessmentCasePlan");
  if (modelFn) return modelFn(todo);
  return kanbanCaseMode(todo) === "assessment-plan";
}

function isKanbanReadingPlanCase(todo) {
  const modelFn = kanbanCoreModelFunction("isKanbanReadingPlanCasePlan");
  if (modelFn) return modelFn(todo);
  return isKanbanStudyCase(todo) && kanbanCaseLooksLikeReadingPlan(todo);
}

function isKanbanLearningGrowthCard(todo) {
  const modelFn = kanbanCoreModelFunction("isKanbanLearningGrowthCardPlan");
  if (modelFn) return modelFn(todo);
  return isKanbanStudyCase(todo) && kanbanCaseTemplate(todo) === "learning-growth";
}

function isKanbanFinalStudyAssessment(todo) {
  const modelFn = kanbanCoreModelFunction("isKanbanFinalStudyAssessmentPlan");
  if (modelFn) return modelFn(todo);
  return isKanbanStudyCase(todo) && kanbanCaseTemplate(todo) === "final-assessment";
}

function isKanbanAssessmentCard(todo) {
  const modelFn = kanbanCoreModelFunction("isKanbanAssessmentCardPlan");
  if (modelFn) return modelFn(todo);
  return isKanbanAssessmentCase(todo) || isKanbanFinalStudyAssessment(todo);
}

function isKanbanProgrammingAssessmentCard(todo) {
  const modelFn = kanbanCoreModelFunction("isKanbanProgrammingAssessmentCardPlan");
  if (modelFn) return modelFn(todo);
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
  const modelFn = kanbanCoreModelFunction("kanbanStudyLabelsPlan");
  if (modelFn) return modelFn(todo);
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
  const modelFn = kanbanCoreModelFunction("kanbanActorRolePlan");
  if (modelFn) return modelFn(todo);
  return String(todo?.kanbanActorRole || "").trim().toLowerCase();
}

function kanbanActorPermissions(todo) {
  const modelFn = kanbanCoreModelFunction("kanbanActorPermissionsPlan");
  if (modelFn) return modelFn(todo);
  return todo?.kanbanActorPermissions && typeof todo.kanbanActorPermissions === "object"
    ? todo.kanbanActorPermissions
    : null;
}

function kanbanCan(todo, key) {
  const modelFn = kanbanCoreModelFunction("kanbanCanPlan");
  if (modelFn) return modelFn(todo, key);
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
  const modelFn = kanbanCoreModelFunction("normalizeKanbanStudyScheduleFrequencyPlan");
  if (modelFn) return modelFn(value);
  const text = String(value || "").trim().toLowerCase();
  if (["weekly", "week", "\u6bcf\u5468"].includes(text)) return "weekly";
  if (["monthly", "month", "\u6bcf\u6708"].includes(text)) return "monthly";
  return "daily";
}

function parseKanbanStudyWeekdays(value = "") {
  const modelFn = kanbanCoreModelFunction("parseKanbanStudyWeekdaysPlan");
  if (modelFn) return modelFn(value);
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
  const modelFn = kanbanCoreModelFunction("saveKanbanComposerModePlan");
  if (modelFn) {
    const plan = modelFn(mode);
    state.kanbanComposerMode = plan.mode;
    state.kanbanComposerMultiAgent = plan.multiAgent;
    localStorage.setItem("hermesKanbanComposerMode", plan.mode);
    localStorage.setItem("hermesKanbanComposerMultiAgent", plan.multiAgent ? "1" : "0");
    return;
  }
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
  const modelFn = kanbanCoreModelFunction("saveKanbanComposerReasoningEffortPlan");
  if (modelFn) {
    const next = modelFn(value);
    state.kanbanComposerReasoningEffort = next;
    if (next) localStorage.setItem("hermesKanbanComposerReasoningEffort", next);
    else localStorage.removeItem("hermesKanbanComposerReasoningEffort");
    return next;
  }
  const effort = String(value || "").trim().toLowerCase();
  const next = ["low", "medium", "high", "xhigh"].includes(effort) ? effort : "";
  state.kanbanComposerReasoningEffort = next;
  if (next) localStorage.setItem("hermesKanbanComposerReasoningEffort", next);
  else localStorage.removeItem("hermesKanbanComposerReasoningEffort");
  return next;
}

function kanbanComposerDocumentContext() {
  const docs = Array.isArray(state.kanbanComposerDocuments) ? state.kanbanComposerDocuments : [];
  const modelFn = kanbanCoreModelFunction("kanbanComposerDocumentContextPlan");
  if (modelFn) return modelFn(docs, { maxDocuments: 3, maxChars: 60000 });
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
  const modelFn = kanbanCoreModelFunction("kanbanComposerSubmissionTextPlan");
  if (modelFn) return modelFn(rawText, kanbanComposerDocumentContext());
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
  const modelFn = kanbanCoreModelFunction("todoListCacheKeyPlan");
  if (modelFn) return modelFn({ clientVersion: CLIENT_VERSION, workspaceId, includeCompleted });
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
    const modelFn = kanbanCoreModelFunction("todoListCachePayloadPlan");
    const payload = modelFn
      ? modelFn({
        savedAt: Date.now(),
        todos: state.todos,
        assignees: state.todoAssignees,
        source: state.todoSource,
        board: state.todoKanbanBoard,
      })
      : {
        savedAt: Date.now(),
        todos: state.todos,
        assignees: state.todoAssignees,
        source: state.todoSource,
        board: state.todoKanbanBoard,
      };
    localStorage.setItem(todoListCacheKey(workspaceId, includeCompleted), JSON.stringify(payload));
  } catch (_) {}
}

function clearTodoListCache(workspaceId = state.selectedWorkspaceId || "owner") {
  try {
    localStorage.removeItem(todoListCacheKey(workspaceId, false));
    localStorage.removeItem(todoListCacheKey(workspaceId, true));
  } catch (_) {}
}

function applyTodoListResult(result, includeCompleted, workspaceId = state.selectedWorkspaceId || "owner") {
  const modelFn = kanbanCoreModelFunction("applyTodoListResultPlan");
  const plan = modelFn ? modelFn(result, includeCompleted, workspaceId, state.todos) : {
    todos: result.data || result.todos || [],
    todoWorkspaceId: workspaceId || "owner",
    todoAssignees: result.assignees || [],
    todoSource: result.source || result.result?.source || "",
    todoKanbanBoard: result.result?.board || result.board || (result.data || result.todos || []).find((todo) => todo.kanbanBoard)?.kanbanBoard || "",
    todoCompletedLoaded: includeCompleted,
  };
  Object.assign(state, plan);
}

async function loadTodos(options = {}) {
  if (todoRefreshShouldYieldToKanbanComposer(options)) {
    scheduleTodoAutoRefresh();
    return;
  }
  const workspaceId = String(options.workspaceId || state.selectedWorkspaceId || "owner").trim() || "owner";
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
  const modelFn = kanbanCoreModelFunction("todoStatusLabelPlan");
  if (modelFn) return modelFn(todo);
  const status = String(todo?.status || "");
  if (status === "completed") return "done";
  if (status === "cancelled") return "cancelled";
  return "open";
}

function todoStatusText(todo) {
  const modelFn = kanbanCoreModelFunction("todoStatusTextPlan");
  if (modelFn) return modelFn(todo);
  const status = String(todo?.status || "");
  if (status === "completed") return "已完成";
  if (status === "cancelled") return "已取消";
  return "未完成";
}

function normalizedKanbanStatus(todo) {
  const modelFn = kanbanCoreModelFunction("normalizedKanbanStatusPlan");
  if (modelFn) {
    return modelFn(todo, {
      statusOrder: KANBAN_STATUS_ORDER,
      assessmentCard: isKanbanAssessmentCard(todo),
      assessmentCompleted: assessmentExamCompleted(todo),
      workflowPhase: todoWorkflowState(todo)?.phase,
    });
  }
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
  const modelFn = kanbanCoreModelFunction("kanbanStatusMetaPlan");
  if (modelFn) return modelFn(status, KANBAN_STATUS_META);
  return KANBAN_STATUS_META[status] || { label: status || "Todo", shortLabel: status || "todo" };
}

function kanbanStatusText(todo) {
  const status = normalizedKanbanStatus(todo);
  const modelFn = kanbanCoreModelFunction("kanbanStatusTextPlan");
  if (modelFn) return modelFn(status, KANBAN_STATUS_META);
  const meta = kanbanStatusMeta(status);
  return `${meta.label} / ${meta.shortLabel}`;
}

function currentTodoKanbanStatus(grouped) {
  const modelFn = kanbanCoreModelFunction("currentTodoKanbanStatusPlan");
  if (modelFn) {
    const groupedCounts = {};
    for (const status of KANBAN_STATUS_FALLBACK_ORDER) groupedCounts[status] = (grouped?.get(status) || []).length;
    const next = modelFn({
      selectedStatus: state.todoKanbanStatus,
      storyStatus: KANBAN_STORY_STATUS,
      statusOrder: KANBAN_STATUS_ORDER,
      fallbackOrder: KANBAN_STATUS_FALLBACK_ORDER,
      groupedCounts,
    });
    if (next !== String(state.todoKanbanStatus || "").trim().toLowerCase()) {
      state.todoKanbanStatus = next;
      localStorage.setItem("hermesTodoKanbanStatus", next);
    }
    return next;
  }
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
  const modelFn = kanbanCoreModelFunction("todoPriorityLabelPlan");
  if (modelFn) return modelFn(todo);
  const priority = Number(todo?.kanbanPriority || 0);
  return Number.isFinite(priority) && priority > 0 ? `P${priority}` : "";
}

function todoTimestampLabel(value) {
  return formatTime(value) || String(value || "");
}

function todoSortTimestamp(todo) {
  const modelFn = kanbanCoreModelFunction("todoSortTimestampPlan");
  if (modelFn) return modelFn(todo);
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
  const modelFn = kanbanCoreModelFunction("sortArchivedKanbanCardsPlan");
  if (modelFn) return modelFn(items);
  return [...(items || [])].sort((left, right) => {
    const delta = todoSortTimestamp(right) - todoSortTimestamp(left);
    if (delta) return delta;
    return String(right?.id || "").localeCompare(String(left?.id || ""));
  });
}

function cleanKanbanInternalResultLines(text) {
  const modelFn = kanbanCoreModelFunction("cleanKanbanInternalResultLinesPlan");
  if (modelFn) return modelFn(text);
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:MEDIA:|Audio file:|Analysis file:)\s*/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanKanbanReadingResultText(text) {
  const modelFn = kanbanCoreModelFunction("cleanKanbanReadingResultTextPlan");
  if (modelFn) return modelFn(text);
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
  const modelFn = kanbanCoreModelFunction("kanbanDisplayResultTextPlan");
  if (modelFn) {
    return modelFn({
      todo,
      text,
      assessmentCard: isKanbanAssessmentCard(todo),
      assessmentVisible: assessmentHasVisibleResult(todo),
      readingCard: isKanbanReadingCard(todo),
    });
  }
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (isKanbanAssessmentCard(todo) && !assessmentHasVisibleResult(todo)) return "";
  return isKanbanReadingCard(todo)
    ? cleanKanbanReadingResultText(raw)
    : cleanKanbanInternalResultLines(raw);
}
