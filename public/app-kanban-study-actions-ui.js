"use strict";

const KANBAN_STUDY_ACTIONS_MODEL_ESM_PATH = "/vite-islands/kanban-study-actions-model/kanban-study-actions-model.js";
let kanbanStudyActionsModelModule = null;
let kanbanStudyActionsModelImportPromise = null;

function importKanbanStudyActionsModel() {
  if (kanbanStudyActionsModelModule) return Promise.resolve(kanbanStudyActionsModelModule);
  if (!kanbanStudyActionsModelImportPromise) {
    const importer = typeof window !== "undefined" && typeof window.__homeAiImportKanbanStudyActionsModel === "function"
      ? window.__homeAiImportKanbanStudyActionsModel
      : (path) => import(path);
    kanbanStudyActionsModelImportPromise = importer(KANBAN_STUDY_ACTIONS_MODEL_ESM_PATH)
      .then((module) => {
        kanbanStudyActionsModelModule = module || null;
        return kanbanStudyActionsModelModule;
      })
      .catch((error) => {
        kanbanStudyActionsModelImportPromise = null;
        console.warn("[home-ai] kanban study actions model import failed", error);
        return null;
      });
  }
  return kanbanStudyActionsModelImportPromise;
}

function currentKanbanStudyActionsModel() {
  return kanbanStudyActionsModelModule;
}

function kanbanStudyActionsModelFunction(name) {
  const model = currentKanbanStudyActionsModel();
  return typeof model?.[name] === "function" ? model[name] : null;
}

function applyReadingSubmissionFeedbackPlan(todoId, stage, labels, errorMessage = "") {
  const plan = kanbanStudyActionsModelFunction("readingSubmissionFeedbackPlan")?.(stage, labels, errorMessage);
  if (plan?.feedback) setReadingSubmissionFeedback(todoId, plan.feedback);
  if (plan?.toast) showPushToast(plan.toast.message, plan.toast.tone);
  return Boolean(plan);
}

if (typeof window !== "undefined") {
  importKanbanStudyActionsModel();
}

async function submitReadingSubmission(todoId, file, notes = "") {
  if (!todoId) return;
  const card = kanbanCardById(todoId);
  const labels = kanbanStudyLabels(card || {});
  if (card && !kanbanCan(card, "canSubmitStudy")) throw new Error("No permission to submit this study card");
  if (state.todoReadingSubmitting?.[todoId]) return;
  if (!file) throw new Error(`请先选择${labels.recording}文件`);
  state.todoReadingSubmissionDrafts[todoId] = notes || "";
  state.todoReadingSubmitting[todoId] = true;
  state.todoReadingSubmissionProgress[todoId] = "uploading";
  if (!applyReadingSubmissionFeedbackPlan(todoId, "uploading", labels)) {
    setReadingSubmissionFeedback(todoId, {
      kind: "info",
      message: `正在上传${labels.recording}。`,
    });
    showPushToast(`${labels.recording}已开始上传，正在${labels.analysis}`);
  }
  scheduleReadingSubmissionRecovery(todoId);
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  let keepPending = false;
  try {
    const dataBase64 = await fileToBase64(file);
    state.todoReadingSubmissionProgress[todoId] = "transcribing";
    if (!applyReadingSubmissionFeedbackPlan(todoId, "transcribing", labels)) {
      setReadingSubmissionFeedback(todoId, {
        kind: "info",
        message: `${labels.recording}已上传，正在转写语音、生成${labels.analysis}和${labels.quiz}。`,
      });
    }
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    const requestBody = kanbanStudyActionsModelFunction("readingSubmissionRequestBodyPlan")?.({
      workspaceId: kanbanCardWorkspaceId(todoId),
      file,
      dataBase64,
      notes,
    }) || {
      workspaceId: kanbanCardWorkspaceId(todoId),
      filename: file.name || "reading-audio.m4a",
      type: file.type || "audio/mp4",
      dataBase64,
      notes,
    };
    const result = await api(`/api/kanban/cards/${encodeURIComponent(todoId)}/reading-submission`, {
      method: "POST",
      body: JSON.stringify(requestBody),
    });
    if (result?.processing) {
      keepPending = true;
      state.todoReadingSubmissionProgress[todoId] = "transcribing";
      if (!applyReadingSubmissionFeedbackPlan(todoId, "processing", labels)) {
        setReadingSubmissionFeedback(todoId, {
          kind: "info",
          message: `\u5df2\u6536\u5230${labels.recording}\uff0c\u6b63\u5728\u540e\u53f0\u8f6c\u5199\u8bed\u97f3\u3001\u751f\u6210${labels.analysis}\u548c${labels.quiz}\u3002`,
        });
        showPushToast(`${labels.recording}\u5df2\u4fdd\u5b58\uff0c\u540e\u53f0\u6b63\u5728\u5904\u7406\u3002`, "success");
      }
      scheduleReadingSubmissionRecovery(todoId);
      return;
    }
    if (result?.quiz) applyReadingQuizResult(todoId, result);
    clearTodoListCache(kanbanCardWorkspaceId(todoId));
    state.todoKanbanStatus = KANBAN_STORY_STATUS;
    localStorage.setItem("hermesTodoKanbanStatus", KANBAN_STORY_STATUS);
    await loadTodos({ skipCache: true, includeCompleted: true });
    state.selectedTodoId = todoId;
    delete state.todoReadingSubmissionDrafts[todoId];
    delete state.todoCardDetails[todoId];
    await loadKanbanCardDetail(todoId, { force: true, silent: true });
    if (!applyReadingSubmissionFeedbackPlan(todoId, "generated", labels)) {
      setReadingSubmissionFeedback(todoId, {
        kind: "success",
        message: `${labels.analysis}和${labels.quiz}已生成；请完成 10 题，全对后卡片完成。`,
      });
      showPushToast(`${labels.analysis}和${labels.quiz}已生成；10 题全对后完成卡片。`, "success");
    }
  } catch (err) {
    if (readingSubmissionReady(todoId)) {
      if (!applyReadingSubmissionFeedbackPlan(todoId, "generated", labels)) {
        setReadingSubmissionFeedback(todoId, {
          kind: "success",
          message: `${labels.analysis}和${labels.quiz}已生成；请完成 10 题，全对后卡片完成。`,
        });
      }
      return;
    }
    if (!applyReadingSubmissionFeedbackPlan(todoId, "error", labels, err?.message)) {
      setReadingSubmissionFeedback(todoId, {
        kind: "error",
        message: err?.message || `${labels.recording}提交失败，请重试。`,
      });
    }
    throw err;
  } finally {
    if (!keepPending) clearReadingSubmissionPendingState(todoId);
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }
}

async function loadReadingQuiz(todoId) {
  if (!todoId) return;
  state.todoReadingQuizzes[todoId] = Object.assign({}, state.todoReadingQuizzes[todoId] || {}, { loading: true, error: "" });
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    const params = new URLSearchParams({ workspaceId: kanbanCardWorkspaceId(todoId) });
    const result = await api(`/api/kanban/cards/${encodeURIComponent(todoId)}/reading-quiz?${params.toString()}`);
    applyReadingQuizResult(todoId, result);
    const completionPlan = kanbanStudyActionsModelFunction("readingQuizCompletionPlan")?.(result, todoId);
    const canonicalId = completionPlan?.canonicalId || String(result.canonicalCardId || todoId || "").trim() || todoId;
    const completed = typeof completionPlan?.completed === "boolean"
      ? completionPlan.completed
      : String(result.status || "").trim().toLowerCase() === "completed"
        || (Array.isArray(result.attempts) && result.attempts.some((attempt) => attempt?.passed));
    if (completed) {
      clearTodoListCache(kanbanCardWorkspaceId(canonicalId));
      await loadTodos({ skipCache: true, includeCompleted: true, freshServer: true, preserveScroll: true });
      state.selectedTodoId = canonicalId;
    }
    await loadLearningGuidanceSession(canonicalId, "reading-quiz").catch(() => {});
    replaceTodoDetailRouteFlag(canonicalId, "readingQuiz");
  } catch (err) {
    state.todoReadingQuizzes[todoId] = { loading: false, error: err.message || String(err) };
  }
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
}

async function submitReadingQuiz(todoId) {
  if (!todoId || state.todoReadingQuizSubmitting?.[todoId]) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canAnswerQuiz")) throw new Error("No permission to answer this quiz");
  const answers = state.todoReadingQuizAnswers[todoId] || [];
  state.todoReadingQuizSubmitting[todoId] = true;
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    const result = await api(`/api/kanban/cards/${encodeURIComponent(todoId)}/reading-quiz`, {
      method: "POST",
      body: JSON.stringify({ workspaceId: kanbanCardWorkspaceId(todoId), answers }),
    });
    state.todoReadingQuizzes[todoId] = Object.assign({}, state.todoReadingQuizzes[todoId] || {}, { result, status: result.status || "" });
    delete state.todoReadingQuizReviewOpen[todoId];
    const resultPlan = kanbanStudyActionsModelFunction("readingQuizSubmitResultPlan")?.(result, todoId, state.todos) || {
      canonicalId: String(result.canonicalCardId || todoId || "").trim() || todoId,
      passed: Boolean(result.passed),
      selectedTodoId: todoId,
      wrongIndex: Array.isArray(result.results) ? result.results.findIndex((item) => !item.correct) : -1,
      toast: result.passed
        ? { message: "考卷 10/10，全对，阅读卡片已完成。", tone: "success" }
        : { message: `考卷 ${result.correctCount || 0}/${result.total || 10}，请订正后再提交。`, tone: "error" },
    };
    const canonicalId = resultPlan.canonicalId;
    if (resultPlan.passed) {
      clearTodoListCache(kanbanCardWorkspaceId(todoId));
      clearReadingQuizDrafts(canonicalId);
      if (canonicalId !== todoId) clearReadingQuizDrafts(todoId);
      delete state.todoCardDetails[todoId];
      await loadTodos({ skipCache: true, includeCompleted: true, freshServer: true });
      state.selectedTodoId = resultPlan.selectedTodoId || (state.todos.some((todo) => todo.id === canonicalId) ? canonicalId : todoId);
      showPushToast(resultPlan.toast.message, resultPlan.toast.tone);
    } else {
      const wrongIndex = resultPlan.wrongIndex;
      if (wrongIndex >= 0) state.todoReadingQuizStep[todoId] = wrongIndex;
      writeReadingQuizDraft(todoId);
      showPushToast(resultPlan.toast.message, resultPlan.toast.tone);
    }
  } finally {
    delete state.todoReadingQuizSubmitting[todoId];
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }
}

async function loadAssessmentExam(todoId, options = {}) {
  if (!todoId) return;
  const card = kanbanCardById(todoId) || {};
  state.todoAssessmentExams[todoId] = Object.assign({}, state.todoAssessmentExams[todoId] || {}, { loading: true, error: "" });
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    const params = new URLSearchParams({ workspaceId: kanbanCardWorkspaceId(todoId) });
    const requirement = kanbanStudyActionsModelFunction("assessmentRequirementText")?.(options.requirement) || String(options.requirement || "").trim();
    const result = requirement
      ? await api(`/api/kanban/cards/${encodeURIComponent(todoId)}/assessment-exam`, {
        method: "POST",
        body: JSON.stringify({
          workspaceId: kanbanCardWorkspaceId(todoId),
          generateOnly: true,
          requirement,
        }),
      })
      : await api(`/api/kanban/cards/${encodeURIComponent(todoId)}/assessment-exam?${params.toString()}`);
    state.todoAssessmentExams[todoId] = kanbanStudyActionsModelFunction("assessmentExamStatePlan")?.(result)
      || { exam: result.exam, status: result.status || "", attempts: result.attempts || [], result: result.result || null };
    replaceTodoDetailRouteFlag(todoId, "assessmentExam");
    const draft = applyAnswerDraft(
      "AssessmentExam",
      kanbanCardWorkspaceId(todoId),
      todoId,
      result.exam || {},
      state.todoAssessmentAnswers[todoId] || [],
      state.todoAssessmentStep[todoId] || 0,
    );
    state.todoAssessmentAnswers[todoId] = draft.answers;
    state.todoAssessmentStep[todoId] = draft.step;
    await loadLearningGuidanceSession(todoId, learningGuidanceModeForAssessment(card || { id: todoId })).catch(() => {});
    if (requirement) delete state.todoAssessmentRequirementDrafts[todoId];
  } catch (err) {
    state.todoAssessmentExams[todoId] = { loading: false, error: err.message || String(err) };
  }
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
}

async function submitAssessmentExam(todoId) {
  if (!todoId || state.todoAssessmentSubmitting?.[todoId]) return;
  const card = kanbanCardById(todoId);
  if (card && !kanbanCan(card, "canAnswerQuiz")) throw new Error("No permission to answer this exam");
  const answers = state.todoAssessmentAnswers[todoId] || [];
  state.todoAssessmentSubmitting[todoId] = true;
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    const result = await api(`/api/kanban/cards/${encodeURIComponent(todoId)}/assessment-exam`, {
      method: "POST",
      body: JSON.stringify({ workspaceId: kanbanCardWorkspaceId(todoId), answers }),
    });
    state.todoAssessmentExams[todoId] = Object.assign({}, state.todoAssessmentExams[todoId] || {}, { result, status: result.status || "" });
    delete state.todoAssessmentReviewOpen[todoId];
    clearTodoListCache(kanbanCardWorkspaceId(todoId));
    const resultPlan = kanbanStudyActionsModelFunction("assessmentSubmitResultPlan")?.(result) || {
      passed: Boolean(result.passed),
      wrongIndex: Array.isArray(result.results) ? result.results.findIndex((item) => !item.correct) : -1,
      toast: result.passed
        ? { message: `考试通过：${result.score || 0}/100`, tone: "success" }
        : { message: `考试 ${result.score || 0}/100，未达通过线，请重考。`, tone: "error" },
    };
    if (resultPlan.passed) {
      clearAssessmentExamDrafts(todoId);
      delete state.todoCardDetails[todoId];
      await loadTodos({ skipCache: true, includeCompleted: true });
      state.selectedTodoId = todoId;
      showPushToast(resultPlan.toast.message, resultPlan.toast.tone);
    } else {
      const wrongIndex = resultPlan.wrongIndex;
      if (wrongIndex >= 0) state.todoAssessmentStep[todoId] = wrongIndex;
      writeAssessmentExamDraft(todoId);
      showPushToast(resultPlan.toast.message, resultPlan.toast.tone);
    }
  } finally {
    delete state.todoAssessmentSubmitting[todoId];
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }
}
