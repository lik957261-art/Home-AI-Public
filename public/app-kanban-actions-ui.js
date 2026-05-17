"use strict";


function wireTodoPanel(root) {
  root.querySelector("[data-open-todo-create]")?.addEventListener("click", () => {
    state.todoCreateOpen = true;
    renderTodos();
    focusTodoFormSoon();
  });
  root.querySelector("[data-close-todo-create]")?.addEventListener("click", () => {
    state.todoCreateOpen = false;
    renderTodos();
  });
  root.querySelector("#todoCreateForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    createTodoFromForm(root).catch(showError);
  });
  const kanbanComposerText = root.querySelector("#kanbanComposerText");
  kanbanComposerText?.addEventListener("input", () => {
    state.kanbanComposerText = kanbanComposerText.value || "";
    if (state.kanbanComposerText) localStorage.setItem("hermesKanbanComposerDraft", state.kanbanComposerText);
    else localStorage.removeItem("hermesKanbanComposerDraft");
  });
  root.querySelectorAll("[data-kanban-composer-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = String(button.dataset.kanbanComposerMode || "");
      saveKanbanComposerMode(mode);
      state.kanbanPlanDraft = null;
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
      focusTodoFormSoon();
    });
  });
  root.querySelector("#kanbanComposerMaxParallel")?.addEventListener("input", (event) => {
    saveKanbanComposerMaxParallel(event.target?.value);
  });
  root.querySelector("#kanbanComposerReasoningEffort")?.addEventListener("change", (event) => {
    saveKanbanComposerReasoningEffort(event.target?.value);
  });
  root.querySelector("#kanbanComposerDocument")?.addEventListener("change", (event) => {
    const file = event.target?.files?.[0] || null;
    const currentText = root.querySelector("#kanbanComposerText")?.value || "";
    state.kanbanComposerText = currentText;
    if (currentText) localStorage.setItem("hermesKanbanComposerDraft", currentText);
    uploadKanbanComposerDocument(file).catch(showError);
    event.target.value = "";
  });
  root.querySelectorAll("[data-remove-kanban-composer-document]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.removeKanbanComposerDocument);
      if (Number.isFinite(index)) {
        state.kanbanComposerDocuments = (state.kanbanComposerDocuments || []).filter((_, itemIndex) => itemIndex !== index);
        renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
      }
    });
  });
  root.querySelectorAll("#kanbanStudyTemplate, #kanbanStudySubject, #kanbanStudyTitle, #kanbanStudyLearner, #kanbanStudyPerformerWorkspace, #kanbanStudyViewerWorkspaces, #kanbanReadingReader, #kanbanReadingBook, #kanbanReadingSessions, #kanbanReadingStartDate, #kanbanReadingTime, #kanbanStudyScheduleFrequency, #kanbanStudyScheduleMonthDay, #kanbanReadingReminder, [data-kanban-study-viewer-workspace], [data-kanban-study-weekday]").forEach((input) => {
    input.addEventListener("input", () => syncKanbanReadingDraftFromDom(root));
    input.addEventListener("change", () => syncKanbanReadingDraftFromDom(root));
  });
  root.querySelector("#kanbanStudyTemplate")?.addEventListener("change", () => {
    syncKanbanReadingDraftFromDom(root);
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  });
  root.querySelector("#kanbanStudyScheduleFrequency")?.addEventListener("change", () => {
    syncKanbanReadingDraftFromDom(root);
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  });
  root.querySelectorAll("#kanbanAssessmentSubject, #kanbanAssessmentLearner, #kanbanAssessmentLevel, #kanbanAssessmentTitle, #kanbanAssessmentPerformerWorkspace, #kanbanAssessmentViewerWorkspaces, #kanbanAssessmentExamCount, #kanbanAssessmentQuestionCount, #kanbanAssessmentDuration, #kanbanAssessmentPassingScore, #kanbanAssessmentIntervalDays, #kanbanAssessmentStartDate, #kanbanAssessmentTime, #kanbanAssessmentReminder, #kanbanAssessmentDifficulty, [data-kanban-assessment-viewer-workspace]").forEach((input) => {
    input.addEventListener("input", () => syncKanbanAssessmentDraftFromDom(root));
    input.addEventListener("change", () => syncKanbanAssessmentDraftFromDom(root));
  });
  root.querySelector("#kanbanReadingCover")?.addEventListener("change", (event) => {
    const file = event.target?.files?.[0] || null;
    setKanbanReadingCoverFile(file);
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  });
  root.querySelector("#kanbanComposerForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitKanbanComposer(root).catch(showError);
  });
  root.querySelector("[data-clear-kanban-plan]")?.addEventListener("click", () => {
    state.kanbanPlanDraft = null;
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  });
  root.querySelector("[data-create-kanban-plan]")?.addEventListener("click", () => {
    createKanbanPlanFromDraft().catch(showError);
  });
  root.querySelectorAll("[data-kanban-status]").forEach((button) => {
    button.addEventListener("click", () => {
      const status = String(button.dataset.kanbanStatus || "").trim().toLowerCase();
      if (!KANBAN_TAB_ORDER.includes(status)) return;
      state.todoKanbanStatus = status;
      localStorage.setItem("hermesTodoKanbanStatus", status);
      if (kanbanStatusNeedsCompleted(status) && !state.todoCompletedLoaded) {
        loadTodos({ includeCompleted: true }).catch(showError);
        return;
      }
      renderTodos();
    });
  });
  root.querySelectorAll("[data-kanban-story-case]").forEach((button) => {
    const toggle = () => {
      const key = String(button.dataset.kanbanStoryCase || "").trim();
      if (!key) return;
      state.kanbanStoryExpanded = Object.assign({}, state.kanbanStoryExpanded || {}, {
        [key]: !state.kanbanStoryExpanded?.[key],
      });
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    };
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggle();
    });
    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      toggle();
    });
  });
  root.querySelectorAll("[data-archive-kanban-story-case]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      archiveKanbanStoryCase(button.dataset.archiveKanbanStoryCase || "").catch(showError);
    });
  });
  root.querySelectorAll("[data-todo-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTodoId = button.dataset.todoId || "";
      renderTodos();
    });
  });
  root.querySelectorAll("[data-load-kanban-detail]").forEach((button) => {
    button.addEventListener("click", () => {
      loadKanbanCardDetail(button.dataset.loadKanbanDetail || "", { force: true }).catch(showError);
    });
  });
  root.querySelector("[data-clear-todo-selection]")?.addEventListener("click", () => {
    state.selectedTodoId = "";
    renderTodos();
  });
  root.querySelectorAll("[data-complete-todo]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const todoId = button.dataset.completeTodo || "";
      const commentForm = [...root.querySelectorAll("[data-todo-comment-form]")]
        .find((form) => form.dataset.todoCommentForm === todoId);
      const comment = commentForm?.querySelector("#todoCommentText")?.value || state.todoCommentDrafts?.[todoId] || "";
      completeTodo(todoId, comment).catch(showError);
    });
  });
  root.querySelectorAll("[data-cancel-todo]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      cancelTodo(button.dataset.cancelTodo).catch(showError);
    });
  });
  root.querySelectorAll("[data-block-todo]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      blockTodo(button.dataset.blockTodo).catch(showError);
    });
  });
  root.querySelectorAll("[data-unblock-todo]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      unblockTodo(button.dataset.unblockTodo).catch(showError);
    });
  });
  root.querySelectorAll("[data-todo-comment-form]").forEach((form) => {
    form.querySelector("#todoCommentText")?.addEventListener("input", (event) => {
      const todoId = form.dataset.todoCommentForm || "";
      if (todoId) state.todoCommentDrafts[todoId] = event.target.value || "";
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const todoId = form.dataset.todoCommentForm || form.querySelector("[data-comment-todo]")?.dataset?.commentTodo || "";
      commentTodo(todoId, form.querySelector("#todoCommentText")?.value || "").catch(showError);
    });
  });
  root.querySelectorAll("[data-comment-complete-todo]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const todoId = button.dataset.commentCompleteTodo || "";
      const form = button.closest("[data-todo-comment-form]") || root;
      const comment = form.querySelector("#todoCommentText")?.value || state.todoCommentDrafts?.[todoId] || "";
      completeTodo(todoId, comment).catch(showError);
    });
  });
  root.querySelectorAll("[data-todo-revision-form]").forEach((form) => {
    form.querySelector("#todoRevisionText")?.addEventListener("input", (event) => {
      const todoId = form.dataset.todoRevisionForm || "";
      if (todoId) state.todoRevisionDrafts[todoId] = event.target.value || "";
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const todoId = form.dataset.todoRevisionForm || form.querySelector("[data-revise-todo]")?.dataset?.reviseTodo || "";
      requestTodoRevision(todoId, form.querySelector("#todoRevisionText")?.value || "").catch(showError);
    });
  });
  root.querySelectorAll("[data-reading-submission-form]").forEach((form) => {
    const resolveReadingSubmissionTodoId = () => form.dataset.readingSubmissionForm || form.querySelector("[data-submit-reading]")?.dataset?.submitReading || "";
    const syncReadingSubmissionNotes = () => {
      const todoId = resolveReadingSubmissionTodoId();
      const notes = form.querySelector("#todoReadingSubmissionNotes")?.value || "";
      if (todoId) state.todoReadingSubmissionDrafts[todoId] = notes;
      return { todoId, notes };
    };
    form.querySelector("[data-reading-record-toggle]")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const { todoId } = syncReadingSubmissionNotes();
      if (state.todoReadingRecorders?.[todoId]?.status === "recording") {
        stopKanbanReadingRecording(todoId);
      } else {
        startKanbanReadingRecording(todoId).catch(showError);
      }
    });
    form.querySelector("#todoReadingSubmissionNotes")?.addEventListener("input", (event) => {
      const todoId = form.dataset.readingSubmissionForm || "";
      if (todoId) state.todoReadingSubmissionDrafts[todoId] = event.target.value || "";
    });
    form.querySelector("[data-refresh-reading-submission]")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const { todoId } = syncReadingSubmissionNotes();
      refreshReadingSubmissionStatus(todoId).catch(showError);
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const todoId = form.dataset.readingSubmissionForm || form.querySelector("[data-submit-reading]")?.dataset?.submitReading || "";
      const notes = form.querySelector("#todoReadingSubmissionNotes")?.value || "";
      submitRecordedReadingSubmission(todoId, notes).catch(showError);
    });
  });
  root.querySelectorAll("[data-load-reading-quiz]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      loadReadingQuiz(button.dataset.loadReadingQuiz || "").catch(showError);
    });
  });
  root.querySelectorAll("[data-reading-quiz-choice]").forEach((input) => {
    input.addEventListener("change", () => {
      const todoId = input.dataset.readingQuizChoice || "";
      const index = Number(input.dataset.questionIndex || 0);
      if (!todoId || !Number.isFinite(index)) return;
      if (!Array.isArray(state.todoReadingQuizAnswers[todoId])) state.todoReadingQuizAnswers[todoId] = [];
      state.todoReadingQuizAnswers[todoId][index] = Number(input.value);
      delete state.todoReadingQuizReviewOpen[todoId];
      writeReadingQuizDraft(todoId);
      if (state.todoReadingQuizzes[todoId]?.result && !state.todoReadingQuizzes[todoId]?.result?.passed) {
        state.todoReadingQuizzes[todoId] = Object.assign({}, state.todoReadingQuizzes[todoId], { result: null });
      }
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    });
  });
  root.querySelectorAll("[data-reading-quiz-prev]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const todoId = button.dataset.readingQuizPrev || "";
      state.todoReadingQuizStep[todoId] = Math.max(0, Number(state.todoReadingQuizStep[todoId] || 0) - 1);
      writeReadingQuizDraft(todoId);
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    });
  });
  root.querySelectorAll("[data-reading-quiz-next]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const todoId = button.dataset.readingQuizNext || "";
      const quiz = state.todoReadingQuizzes[todoId]?.quiz || {};
      const total = Array.isArray(quiz.questions) ? quiz.questions.length : 10;
      state.todoReadingQuizStep[todoId] = Math.min(total - 1, Number(state.todoReadingQuizStep[todoId] || 0) + 1);
      writeReadingQuizDraft(todoId);
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    });
  });
  root.querySelectorAll("[data-reading-quiz-review]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const todoId = button.dataset.readingQuizReview || "";
      if (todoId) state.todoReadingQuizReviewOpen[todoId] = true;
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    });
  });
  root.querySelectorAll("[data-reading-quiz-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      submitReadingQuiz(form.dataset.readingQuizForm || "").catch(showError);
    });
  });
  root.querySelectorAll("[data-load-assessment-exam]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      loadAssessmentExam(button.dataset.loadAssessmentExam || "").catch(showError);
    });
  });
  root.querySelectorAll("[data-assessment-requirement-form]").forEach((form) => {
    const todoId = form.dataset.assessmentRequirementForm || "";
    form.querySelector("[data-assessment-requirement-input]")?.addEventListener("input", (event) => {
      if (todoId) state.todoAssessmentRequirementDrafts[todoId] = event.target.value || "";
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const requirement = form.querySelector("[data-assessment-requirement-input]")?.value || "";
      if (todoId) state.todoAssessmentRequirementDrafts[todoId] = requirement;
      loadAssessmentExam(todoId, { requirement }).catch(showError);
    });
  });
  root.querySelectorAll("[data-assessment-exam-choice]").forEach((input) => {
    input.addEventListener("change", () => {
      const todoId = input.dataset.assessmentExamChoice || "";
      const index = Number(input.dataset.questionIndex || 0);
      if (!todoId || !Number.isFinite(index)) return;
      if (!Array.isArray(state.todoAssessmentAnswers[todoId])) state.todoAssessmentAnswers[todoId] = [];
      state.todoAssessmentAnswers[todoId][index] = Number(input.value);
      delete state.todoAssessmentReviewOpen[todoId];
      writeAssessmentExamDraft(todoId);
      if (state.todoAssessmentExams[todoId]?.result && !state.todoAssessmentExams[todoId]?.result?.passed) {
        state.todoAssessmentExams[todoId] = Object.assign({}, state.todoAssessmentExams[todoId], { result: null });
      }
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    });
  });
  root.querySelectorAll("[data-assessment-exam-prev]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const todoId = button.dataset.assessmentExamPrev || "";
      state.todoAssessmentStep[todoId] = Math.max(0, Number(state.todoAssessmentStep[todoId] || 0) - 1);
      writeAssessmentExamDraft(todoId);
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    });
  });
  root.querySelectorAll("[data-assessment-exam-next]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const todoId = button.dataset.assessmentExamNext || "";
      const exam = state.todoAssessmentExams[todoId]?.exam || {};
      const total = Array.isArray(exam.questions) ? exam.questions.length : 20;
      state.todoAssessmentStep[todoId] = Math.min(total - 1, Number(state.todoAssessmentStep[todoId] || 0) + 1);
      writeAssessmentExamDraft(todoId);
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    });
  });
  root.querySelectorAll("[data-assessment-exam-review]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const todoId = button.dataset.assessmentExamReview || "";
      if (todoId) state.todoAssessmentReviewOpen[todoId] = true;
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    });
  });
  root.querySelectorAll("[data-assessment-exam-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      submitAssessmentExam(form.dataset.assessmentExamForm || "").catch(showError);
    });
  });
  root.querySelectorAll("[data-learning-guidance-reflection]").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.learningGuidanceReflection || "";
      if (key) state.todoLearningGuidanceDrafts[key] = input.value || "";
    });
  });
  root.querySelectorAll("[data-learning-guidance-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      requestLearningGuidance(
        button.dataset.learningGuidanceTodo || "",
        button.dataset.learningGuidanceMode || "",
        button.dataset.learningGuidanceAction || "",
        Number(button.dataset.questionIndex || 0),
      ).catch(showError);
    });
  });
  root.querySelectorAll("[data-comment-unblock-todo]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const form = button.closest("[data-todo-comment-form]") || root;
      commentAndUnblockTodo(button.dataset.commentUnblockTodo, form.querySelector("#todoCommentText")?.value || "").catch(showError);
    });
  });
  root.querySelectorAll("[data-postpone-todo]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const minutes = button.dataset.postponeMinutes;
      if (minutes) {
        postponeTodoQuick(button.dataset.postponeTodo, Number(minutes)).catch(showError);
      } else {
        postponeTodoFromDetail(root, button.dataset.postponeTodo).catch(showError);
      }
    });
  });
  wireTaskSwipeActions(root);
}

function pushKanbanComposerMessage(role, content) {
  state.kanbanComposerMessages.push({
    id: `kanban-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content: String(content || ""),
    at: new Date().toISOString(),
  });
  state.kanbanComposerMessages = state.kanbanComposerMessages.slice(-20);
}

function kanbanPlanSummaryText(plan) {
  const cards = Array.isArray(plan?.cards) ? plan.cards : [];
  const firstWave = cards.filter((card) => card.initialRunnable).length;
  const maxParallel = normalizeKanbanComposerMaxParallel(plan?.maxParallel || state.kanbanComposerMaxParallel);
  return `\u5df2\u751f\u6210 ${cards.length} \u5f20\u5361\u7247\u7684\u591a Agent \u62c6\u89e3\u8349\u6848\uff1b\u9996\u6279\u6267\u884c ${firstWave}\uff0c\u6700\u5927\u5e76\u884c ${maxParallel}\u3002`;
}

async function uploadKanbanComposerDocument(file) {
  if (!file) return;
  if (state.kanbanComposerDocumentUploading) return;
  state.kanbanComposerDocumentUploading = true;
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    const dataBase64 = await fileToBase64(file);
    const result = await api("/api/kanban/cards/document-preview", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: state.selectedWorkspaceId,
        filename: file.name || "kanban-source.txt",
        type: file.type || "",
        dataBase64,
      }),
    });
    const doc = result.document || {};
    state.kanbanComposerDocuments = [
      ...(state.kanbanComposerDocuments || []),
      {
        name: doc.name || file.name || "kanban-source",
        mime: doc.mime || file.type || "",
        kind: doc.kind || "",
        size: doc.size || file.size || 0,
        text: result.text || "",
        totalChars: result.totalChars || 0,
        truncated: Boolean(result.truncated),
      },
    ];
    showPushToast("\u6587\u6863\u5df2\u89e3\u6790\uff0c\u5c06\u4f5c\u4e3a\u770b\u677f\u9700\u6c42\u4e0a\u4e0b\u6587", "success");
  } finally {
    state.kanbanComposerDocumentUploading = false;
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }
}

async function submitKanbanComposer(root) {
  if (state.kanbanComposerBusy || state.kanbanPlanCreating) return;
  const input = root.querySelector("#kanbanComposerText");
  const rawText = String(input?.value || state.kanbanComposerText || "").trim();
  const text = kanbanComposerSubmissionText(rawText);
  const mode = kanbanComposerMode();
  const multiAgent = mode === "multi";
  const studyPlan = mode === "study";
  const assessmentPlan = mode === "assessment";
  if (!text && !studyPlan && !assessmentPlan) throw new Error("????????");
  if (studyPlan) syncKanbanReadingDraftFromDom(root);
  if (assessmentPlan) syncKanbanAssessmentDraftFromDom(root);
  const programmingStudyAssessment = studyPlan && isKanbanProgrammingStudyTemplate(state.kanbanReadingDraft?.studyTemplate);
  if (studyPlan && !String(state.kanbanReadingDraft?.activityTitle || state.kanbanReadingDraft?.bookTitle || "").trim()) throw new Error("????????");
  if (assessmentPlan && !String(state.kanbanAssessmentDraft?.planTitle || state.kanbanAssessmentDraft?.subject || "").trim()) throw new Error("????????");
  const maxParallel = saveKanbanComposerMaxParallel(root.querySelector("#kanbanComposerMaxParallel")?.value || state.kanbanComposerMaxParallel);
  const reasoningEffort = saveKanbanComposerReasoningEffort(root.querySelector("#kanbanComposerReasoningEffort")?.value || state.kanbanComposerReasoningEffort);
  const documentNames = (state.kanbanComposerDocuments || []).map((item) => item.name).filter(Boolean).join(", ");
  state.kanbanComposerText = rawText;
  if (rawText) localStorage.setItem("hermesKanbanComposerDraft", rawText);
  else localStorage.removeItem("hermesKanbanComposerDraft");
  saveKanbanComposerMode(mode);
  state.kanbanComposerBusy = true;
  state.kanbanPlanDraft = null;
  pushKanbanComposerMessage("user", studyPlan
    ? `${state.kanbanReadingDraft.activityTitle || state.kanbanReadingDraft.bookTitle || ""}
${rawText || (documentNames ? `Documents: ${documentNames}` : "")}`.trim()
    : (assessmentPlan ? `${state.kanbanAssessmentDraft.planTitle || state.kanbanAssessmentDraft.subject || ""}
${rawText || (documentNames ? `Documents: ${documentNames}` : "")}`.trim() : (rawText || (documentNames ? `Documents: ${documentNames}` : text))));
  beginKanbanComposerProgress((assessmentPlan || programmingStudyAssessment) ? "assessment" : (studyPlan ? "reading" : (multiAgent ? "plan" : "create")));
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    if (assessmentPlan || programmingStudyAssessment) {
      const draft = programmingStudyAssessment
        ? programmingAssessmentDraftFromStudyDraft(state.kanbanReadingDraft || {})
        : Object.assign(defaultKanbanAssessmentDraft(), state.kanbanAssessmentDraft || {});
      const viewerWorkspaceIds = parseWorkspaceIdList(draft.viewerWorkspaceIds);
      const result = await api("/api/kanban/cards/assessment-plan", {
        method: "POST",
        body: JSON.stringify(Object.assign({}, draft, {
          workspaceId: state.selectedWorkspaceId,
          subject: draft.subject,
          learnerName: draft.learnerName,
          courseLevel: draft.courseLevel,
          title: draft.planTitle,
          performerWorkspaceId: String(draft.performerWorkspaceId || "").trim(),
          viewerWorkspaceIds,
          scheduleFrequency: draft.scheduleFrequency,
          scheduleWeekdays: draft.scheduleWeekdays,
          scheduleMonthDay: draft.scheduleMonthDay,
          sourceText: text,
        })),
      });
      const cards = Array.isArray(result.cards) ? result.cards : [];
      pushKanbanComposerMessage("assistant", `????????${cards.length} ??????????????????`);
      state.kanbanComposerText = "";
      if (programmingStudyAssessment) state.kanbanReadingDraft = defaultKanbanReadingDraft();
      else state.kanbanAssessmentDraft = defaultKanbanAssessmentDraft();
      clearKanbanComposerDocuments();
      localStorage.removeItem("hermesKanbanComposerDraft");
      localStorage.removeItem(programmingStudyAssessment ? "hermesKanbanReadingDraft" : "hermesKanbanAssessmentDraft");
      finishKanbanComposerProgress();
      clearTodoListCache();
      state.todoKanbanStatus = KANBAN_STORY_STATUS;
      localStorage.setItem("hermesTodoKanbanStatus", KANBAN_STORY_STATUS);
      state.todoCreateOpen = false;
      await loadTodos({ skipCache: true, includeCompleted: true });
    } else if (studyPlan) {
      const coverFile = state.kanbanReadingCoverFile;
      const coverImage = coverFile
        ? {
          filename: coverFile.name || "book-cover.jpg",
          mime: coverFile.type || "",
          dataBase64: await fileToBase64(coverFile),
        }
        : null;
      const draft = Object.assign(defaultKanbanReadingDraft(), state.kanbanReadingDraft || {});
      const activityTitle = String(draft.activityTitle || draft.bookTitle || "").trim();
      const learnerName = String(draft.learnerName || draft.readerName || "").trim();
      const viewerWorkspaceIds = parseWorkspaceIdList(draft.viewerWorkspaceIds);
      const result = await api("/api/kanban/cards/study-plan", {
        method: "POST",
        body: JSON.stringify(Object.assign({}, draft, {
          workspaceId: state.selectedWorkspaceId,
          caseMode: "study-plan",
          studyTemplate: String(draft.studyTemplate || "").trim() === "custom" ? "custom" : "reading",
          bookTitle: activityTitle,
          readerName: learnerName,
          activityTitle,
          learnerName,
          target: learnerName,
          performerWorkspaceId: String(draft.performerWorkspaceId || "").trim(),
          viewerWorkspaceIds,
          sourceText: text,
          coverImage,
        })),
      });
      const cards = Array.isArray(result.cards) ? result.cards : [];
      pushKanbanComposerMessage("assistant", `????????${cards.length} ???????????????????????????????`);
      state.kanbanComposerText = "";
      state.kanbanReadingDraft = defaultKanbanReadingDraft();
      clearKanbanComposerDocuments();
      setKanbanReadingCoverFile(null);
      localStorage.removeItem("hermesKanbanComposerDraft");
      localStorage.removeItem("hermesKanbanReadingDraft");
      finishKanbanComposerProgress();
      clearTodoListCache();
      state.todoKanbanStatus = KANBAN_STORY_STATUS;
      localStorage.setItem("hermesTodoKanbanStatus", KANBAN_STORY_STATUS);
      state.todoCreateOpen = false;
      await loadTodos({ skipCache: true, includeCompleted: true });
    } else if (multiAgent) {
      const result = await api("/api/kanban/cards/plan", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: state.selectedWorkspaceId,
          text,
          maxParallel,
          reasoning_effort: reasoningEffort,
        }),
      });
      state.kanbanPlanDraft = result.plan || null;
      pushKanbanComposerMessage("assistant", kanbanPlanSummaryText(state.kanbanPlanDraft));
      finishKanbanComposerProgress();
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    } else {
      const singleContent = rawText || (documentNames ? `Create Kanban task from document: ${documentNames}` : text);
      const result = await api(boardCollectionApiPath(), {
        method: "POST",
        body: JSON.stringify({
          workspaceId: state.selectedWorkspaceId,
          assignee: defaultTodoAssignee(),
          content: singleContent,
          description: text,
          sourceText: text,
        }),
      });
      const card = result.card || result.todo || result.result || {};
      pushKanbanComposerMessage("assistant", `????????${card.id || ""} ${card.content || text}`.trim());
      state.kanbanComposerText = "";
      clearKanbanComposerDocuments();
      localStorage.removeItem("hermesKanbanComposerDraft");
      finishKanbanComposerProgress();
      clearTodoListCache();
      state.todoKanbanStatus = "todo";
      localStorage.setItem("hermesTodoKanbanStatus", "todo");
      state.todoCreateOpen = false;
      await loadTodos({ skipCache: true });
    }
  } catch (err) {
    finishKanbanComposerProgress();
    pushKanbanComposerMessage("assistant", `???????${err.message || String(err)}`);
    throw err;
  } finally {
    state.kanbanComposerBusy = false;
    if (!state.kanbanPlanCreating) finishKanbanComposerProgress();
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }
}

async function createKanbanPlanFromDraft() {
  if (!state.kanbanPlanDraft || state.kanbanPlanCreating) return;
  state.kanbanPlanCreating = true;
  beginKanbanComposerProgress("create");
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    const result = await api("/api/kanban/cards/batch", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: state.selectedWorkspaceId,
        plan: state.kanbanPlanDraft,
        maxParallel: normalizeKanbanComposerMaxParallel(state.kanbanPlanDraft?.maxParallel || state.kanbanComposerMaxParallel),
        reasoning_effort: state.kanbanPlanDraft?.reasoningEffort || state.kanbanComposerReasoningEffort || "",
      }),
    });
    const cards = Array.isArray(result.cards) ? result.cards : [];
    const blocked = cards.filter((item) => item.blocked).length;
    pushKanbanComposerMessage("assistant", `\u5df2\u521b\u5efa ${cards.length} \u5f20\u591a Agent \u770b\u677f\u5361\u7247\uff1b${Math.max(0, cards.length - blocked)} \u5f20\u9996\u6279\u6267\u884c\uff0c${blocked} \u5f20\u7b49\u5f85\u4f9d\u8d56\u6216\u5e76\u884c\u4f4d\u3002`);
    state.kanbanPlanDraft = null;
    state.kanbanComposerText = "";
    clearKanbanComposerDocuments();
    localStorage.removeItem("hermesKanbanComposerDraft");
    finishKanbanComposerProgress();
    clearTodoListCache();
    state.todoKanbanStatus = KANBAN_STORY_STATUS;
    localStorage.setItem("hermesTodoKanbanStatus", KANBAN_STORY_STATUS);
    state.todoCreateOpen = false;
    await loadTodos({ skipCache: true });
  } catch (err) {
    finishKanbanComposerProgress();
    pushKanbanComposerMessage("assistant", `\u6279\u91cf\u521b\u5efa\u5931\u8d25\uff1a${err.message || String(err)}`);
    throw err;
  } finally {
    state.kanbanPlanCreating = false;
    if (!state.kanbanComposerBusy) finishKanbanComposerProgress();
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }
}

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
  setReadingSubmissionFeedback(todoId, {
    kind: "info",
    message: `正在上传${labels.recording}。`,
  });
  showPushToast(`${labels.recording}已开始上传，正在${labels.analysis}`);
  scheduleReadingSubmissionRecovery(todoId);
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    const dataBase64 = await fileToBase64(file);
    state.todoReadingSubmissionProgress[todoId] = "transcribing";
    setReadingSubmissionFeedback(todoId, {
      kind: "info",
      message: `${labels.recording}已上传，正在转写语音、生成${labels.analysis}和${labels.quiz}。`,
    });
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    const result = await api(`/api/kanban/cards/${encodeURIComponent(todoId)}/reading-submission`, {
      method: "POST",
      body: JSON.stringify({
        workspaceId: kanbanCardWorkspaceId(todoId),
        filename: file.name || "reading-audio.m4a",
        type: file.type || "audio/mp4",
        dataBase64,
        notes,
      }),
    });
    if (result?.quiz) applyReadingQuizResult(todoId, result);
    clearTodoListCache(kanbanCardWorkspaceId(todoId));
    state.todoKanbanStatus = KANBAN_STORY_STATUS;
    localStorage.setItem("hermesTodoKanbanStatus", KANBAN_STORY_STATUS);
    await loadTodos({ skipCache: true, includeCompleted: true });
    state.selectedTodoId = todoId;
    delete state.todoReadingSubmissionDrafts[todoId];
    delete state.todoCardDetails[todoId];
    await loadKanbanCardDetail(todoId, { force: true, silent: true });
    setReadingSubmissionFeedback(todoId, {
      kind: "success",
      message: `${labels.analysis}和${labels.quiz}已生成；请完成 10 题，全对后卡片完成。`,
    });
    showPushToast(`${labels.analysis}和${labels.quiz}已生成；10 题全对后完成卡片。`, "success");
  } catch (err) {
    if (readingSubmissionReady(todoId)) {
      setReadingSubmissionFeedback(todoId, {
        kind: "success",
        message: `${labels.analysis}和${labels.quiz}已生成；请完成 10 题，全对后卡片完成。`,
      });
      return;
    }
    setReadingSubmissionFeedback(todoId, {
      kind: "error",
      message: err?.message || `${labels.recording}提交失败，请重试。`,
    });
    throw err;
  } finally {
    clearReadingSubmissionPendingState(todoId);
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
    const canonicalId = String(result.canonicalCardId || todoId || "").trim() || todoId;
    const completed = String(result.status || "").trim().toLowerCase() === "completed"
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
    const canonicalId = String(result.canonicalCardId || todoId || "").trim() || todoId;
    if (result.passed) {
      clearTodoListCache(kanbanCardWorkspaceId(todoId));
      clearReadingQuizDrafts(canonicalId);
      if (canonicalId !== todoId) clearReadingQuizDrafts(todoId);
      delete state.todoCardDetails[todoId];
      await loadTodos({ skipCache: true, includeCompleted: true, freshServer: true });
      state.selectedTodoId = state.todos.some((todo) => todo.id === canonicalId) ? canonicalId : todoId;
      showPushToast("考卷 10/10，全对，阅读卡片已完成。", "success");
    } else {
      const wrongIndex = Array.isArray(result.results) ? result.results.findIndex((item) => !item.correct) : -1;
      if (wrongIndex >= 0) state.todoReadingQuizStep[todoId] = wrongIndex;
      writeReadingQuizDraft(todoId);
      showPushToast(`考卷 ${result.correctCount || 0}/${result.total || 10}，请订正后再提交。`, "error");
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
    const requirement = String(options.requirement || "").trim();
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
    state.todoAssessmentExams[todoId] = { exam: result.exam, status: result.status || "", attempts: result.attempts || [], result: result.result || null };
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
    if (result.passed) {
      clearAssessmentExamDrafts(todoId);
      delete state.todoCardDetails[todoId];
      await loadTodos({ skipCache: true, includeCompleted: true });
      state.selectedTodoId = todoId;
      showPushToast(`考试通过：${result.score || 0}/100`, "success");
    } else {
      const wrongIndex = Array.isArray(result.results) ? result.results.findIndex((item) => !item.correct) : -1;
      if (wrongIndex >= 0) state.todoAssessmentStep[todoId] = wrongIndex;
      writeAssessmentExamDraft(todoId);
      showPushToast(`考试 ${result.score || 0}/100，未达通过线，请重考。`, "error");
    }
  } finally {
    delete state.todoAssessmentSubmitting[todoId];
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
