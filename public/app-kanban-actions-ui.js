"use strict";
const KANBAN_ACTIONS_MODEL_ESM_PATH = "/vite-islands/kanban-actions-model/kanban-actions-model.js";
let kanbanActionsModelPromise = null;
let kanbanActionsModel = null;
function importKanbanActionsModel() {
  if (kanbanActionsModel) return Promise.resolve(kanbanActionsModel);
  if (!kanbanActionsModelPromise) {
    kanbanActionsModelPromise = import(KANBAN_ACTIONS_MODEL_ESM_PATH)
      .then((model) => {
        kanbanActionsModel = model || null;
        return kanbanActionsModel;
      })
      .catch(() => null);
  }
  return kanbanActionsModelPromise;
}
function currentKanbanActionsModel() {
  return kanbanActionsModel;
}
function kanbanActionsModelFunction(name) {
  const model = currentKanbanActionsModel();
  const fn = model && model[name];
  return typeof fn === "function" ? fn : null;
}
if (typeof window !== "undefined") importKanbanActionsModel().catch(() => null);

function applyKanbanComposerDraftStorage(text) {
  const patchPlan = kanbanActionsModelFunction("kanbanComposerDraftStoragePatch");
  const patch = patchPlan ? patchPlan(text) : (String(text || "")
    ? { action: "set", key: "hermesKanbanComposerDraft", value: String(text || "") }
    : { action: "remove", key: "hermesKanbanComposerDraft", value: "" });
  if (patch.action === "set") localStorage.setItem(patch.key, patch.value);
  else localStorage.removeItem(patch.key);
}


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
    applyKanbanComposerDraftStorage(state.kanbanComposerText);
  });
  root.querySelectorAll("[data-kanban-composer-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const selectionPlan = kanbanActionsModelFunction("kanbanComposerModeSelectionPlan");
      const selection = selectionPlan
        ? selectionPlan(button.dataset.kanbanComposerMode || "")
        : { mode: String(button.dataset.kanbanComposerMode || ""), kanbanPlanDraft: null, preserveScroll: true };
      saveKanbanComposerMode(selection.mode);
      state.kanbanPlanDraft = selection.kanbanPlanDraft;
      renderTodos({ preserveScroll: Boolean(selection.preserveScroll), restoreScrollTop: $("conversation")?.scrollTop || 0 });
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
    applyKanbanComposerDraftStorage(currentText);
    uploadKanbanComposerDocument(file).catch(showError);
    event.target.value = "";
  });
  root.querySelectorAll("[data-remove-kanban-composer-document]").forEach((button) => {
    button.addEventListener("click", () => {
      const removalPlan = kanbanActionsModelFunction("kanbanComposerDocumentRemovalPlan");
      const removal = removalPlan
        ? removalPlan(state.kanbanComposerDocuments || [], button.dataset.removeKanbanComposerDocument)
        : {
          ok: Number.isFinite(Number(button.dataset.removeKanbanComposerDocument)),
          documents: (state.kanbanComposerDocuments || []).filter((_, itemIndex) => itemIndex !== Number(button.dataset.removeKanbanComposerDocument)),
          preserveScroll: true,
        };
      if (removal.ok) {
        state.kanbanComposerDocuments = removal.documents;
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
      const statusPlan = kanbanActionsModelFunction("kanbanStatusSelectionPlan");
      const selection = statusPlan
        ? statusPlan(button.dataset.kanbanStatus || "", KANBAN_TAB_ORDER, {
          completedLoaded: state.todoCompletedLoaded,
          needsCompleted: kanbanStatusNeedsCompleted,
        })
        : {
          ok: KANBAN_TAB_ORDER.includes(String(button.dataset.kanbanStatus || "").trim().toLowerCase()),
          status: String(button.dataset.kanbanStatus || "").trim().toLowerCase(),
          storageKey: "hermesTodoKanbanStatus",
          shouldLoadCompleted: kanbanStatusNeedsCompleted(String(button.dataset.kanbanStatus || "").trim().toLowerCase()) && !state.todoCompletedLoaded,
        };
      if (!selection.ok) return;
      state.todoKanbanStatus = selection.status;
      localStorage.setItem(selection.storageKey, selection.status);
      if (selection.shouldLoadCompleted) {
        loadTodos({ includeCompleted: true }).catch(showError);
        return;
      }
      renderTodos();
    });
  });
  root.querySelectorAll("[data-kanban-story-case]").forEach((button) => {
    const toggle = () => {
      const patchPlan = kanbanActionsModelFunction("kanbanStoryExpandedPatch");
      const patch = patchPlan
        ? patchPlan(state.kanbanStoryExpanded || {}, button.dataset.kanbanStoryCase || "")
        : {
          ok: Boolean(String(button.dataset.kanbanStoryCase || "").trim()),
          expanded: Object.assign({}, state.kanbanStoryExpanded || {}, {
            [String(button.dataset.kanbanStoryCase || "").trim()]: !state.kanbanStoryExpanded?.[String(button.dataset.kanbanStoryCase || "").trim()],
          }),
        };
      if (!patch.ok) return;
      state.kanbanStoryExpanded = patch.expanded;
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
  root.querySelectorAll("[data-learning-growth-submission-form]").forEach((form) => {
    const resolveTodoId = () => form.dataset.learningGrowthSubmissionForm
      || form.querySelector("[data-submit-learning-growth-task]")?.dataset?.submitLearningGrowthTask
      || form.querySelector("[data-submit-learning-growth-writing]")?.dataset?.submitLearningGrowthWriting
      || "";
    const input = () => form.querySelector("[data-learning-growth-submission-input]") || form.querySelector("#todoLearningGrowthSubmissionText");
    form.querySelector("[data-learning-growth-submission-input], #todoLearningGrowthSubmissionText")?.addEventListener("input", (event) => {
      const todoId = resolveTodoId();
      if (todoId) state.todoLearningGrowthSubmissionDrafts[todoId] = event.target.value || "";
      const counter = todoId ? form.querySelector("[data-learning-growth-submission-count]") : null;
      if (counter && window.HermesLearningGrowthTaskUi?.submissionTextStats) {
        const stats = window.HermesLearningGrowthTaskUi.submissionTextStats(event.target.value || "");
        const guard = { minWords: counter.dataset.minWords, minChars: counter.dataset.minChars };
        const validation = typeof window.HermesLearningGrowthTaskUi.validateSubmissionText === "function"
          ? window.HermesLearningGrowthTaskUi.validateSubmissionText(event.target.value || "", guard)
          : null;
        counter.textContent = window.HermesLearningGrowthTaskUi.submissionRequirementLabel?.(guard, stats)
          || `At least ${guard.minWords} words / ${guard.minChars} characters; current ${stats.words} words / ${stats.chars} characters.`;
        counter.classList.toggle("is-ready", Boolean(validation?.ok));
        counter.classList.toggle("is-short", Boolean(validation && !validation.ok && String(event.target.value || "").trim()));
      }
    });
    const submit = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const todoId = resolveTodoId();
      const text = input()?.value || "";
      submitLearningGrowthTask(todoId, text).catch(showError);
    };
    form.addEventListener("submit", submit);
    form.querySelectorAll("[data-submit-learning-growth-task], [data-submit-learning-growth-writing]").forEach((button) => {
      button.addEventListener("click", submit);
    });
  });
  root.querySelectorAll("[data-withdraw-learning-growth-submission]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      withdrawLearningGrowthSubmission(button.dataset.withdrawLearningGrowthSubmission || "").catch(showError);
    });
  });
  root.querySelectorAll("[data-learning-growth-reflection-form]").forEach((form) => {
    const todoId = form.dataset.learningGrowthReflectionForm || "";
    form.querySelector("[data-learning-growth-reflection-record-toggle]")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = todoId || event.currentTarget?.dataset?.learningGrowthReflectionRecordToggle || "";
      if (state.todoLearningGrowthReflectionRecorders?.[id]?.status === "recording") {
        stopLearningGrowthReflectionRecording(id);
      } else {
        startLearningGrowthReflectionRecording(id).catch(showError);
      }
    });
    form.querySelector("[data-learning-growth-reflection-record-clear]")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      cancelLearningGrowthReflectionRecording(todoId || event.currentTarget?.dataset?.learningGrowthReflectionRecordClear || "");
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      submitLearningGrowthReflection(todoId).catch(showError);
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
      const choicePlan = kanbanActionsModelFunction("kanbanChoiceSelectionPatch");
      const choice = choicePlan
        ? choicePlan(state.todoReadingQuizAnswers[todoId], index, input.value)
        : { ok: true, answers: Object.assign([], state.todoReadingQuizAnswers[todoId] || [], { [index]: Number(input.value) }) };
      if (!choice.ok) return;
      state.todoReadingQuizAnswers[todoId] = choice.answers;
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
      const previousPlan = kanbanActionsModelFunction("kanbanPreviousStepPlan");
      state.todoReadingQuizStep[todoId] = previousPlan
        ? previousPlan(state.todoReadingQuizStep[todoId])
        : Math.max(0, Number(state.todoReadingQuizStep[todoId] || 0) - 1);
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
      const nextPlan = kanbanActionsModelFunction("kanbanNextStepPlan");
      state.todoReadingQuizStep[todoId] = nextPlan
        ? nextPlan(state.todoReadingQuizStep[todoId], total, 10)
        : Math.min(total - 1, Number(state.todoReadingQuizStep[todoId] || 0) + 1);
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
      const choicePlan = kanbanActionsModelFunction("kanbanChoiceSelectionPatch");
      const choice = choicePlan
        ? choicePlan(state.todoAssessmentAnswers[todoId], index, input.value)
        : { ok: true, answers: Object.assign([], state.todoAssessmentAnswers[todoId] || [], { [index]: Number(input.value) }) };
      if (!choice.ok) return;
      state.todoAssessmentAnswers[todoId] = choice.answers;
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
      const previousPlan = kanbanActionsModelFunction("kanbanPreviousStepPlan");
      state.todoAssessmentStep[todoId] = previousPlan
        ? previousPlan(state.todoAssessmentStep[todoId])
        : Math.max(0, Number(state.todoAssessmentStep[todoId] || 0) - 1);
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
      const nextPlan = kanbanActionsModelFunction("kanbanNextStepPlan");
      state.todoAssessmentStep[todoId] = nextPlan
        ? nextPlan(state.todoAssessmentStep[todoId], total, 20)
        : Math.min(total - 1, Number(state.todoAssessmentStep[todoId] || 0) + 1);
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
