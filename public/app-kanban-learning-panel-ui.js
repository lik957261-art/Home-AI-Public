"use strict";

function isKanbanReadingCard(todo) {
  if (!isKanbanStudyCase(todo) || isKanbanFinalStudyAssessment(todo) || isKanbanLearningGrowthCard(todo)) return false;
  const template = kanbanCaseTemplate(todo);
  if (template === "reading" || template === "english-reading" || template === "reading-recording") return true;
  return Boolean(todo?.readingSubmission || todo?.studySubmission);
}

function renderKanbanLearningGrowthTodoPanel(todo) {
  if (!isKanbanLearningGrowthCard(todo) || !todoMatchesOpen(todo)) return "";
  const blocked = normalizedKanbanStatus(todo) === "blocked";
  const completed = ["done", "archived", "cancelled", "canceled", "completed"].includes(normalizedKanbanStatus(todo));
  const canSubmit = !blocked && !completed && kanbanCan(todo, "canComment");
  const submitting = Boolean(state.todoLearningGrowthSubmissionSubmitting?.[todo.id]);
  const feedback = state.todoLearningGrowthSubmissionFeedback?.[todo.id] || null;
  const submitted = todo?.learningGrowthSubmission || null;
  const goal = String(todo?.kanbanCaseCardGoal || todo?.description || "").trim();
  const goalText = `${String(todo?.content || "")}\n${goal}`;
  const hasConcretePrompt = /Task instruction:/i.test(goal) || /Task prompt:/i.test(goal) || /first draft|rewrite|Interaction flow:/i.test(goal);
  const looksGenericSubmitCard = /submit output|study output|Submission:/i.test(goalText) && !hasConcretePrompt;
  const deliverables = Array.isArray(todo?.kanbanCaseDeliverables) ? todo.kanbanCaseDeliverables : [];
  const acceptance = Array.isArray(todo?.kanbanCaseAcceptance) ? todo.kanbanCaseAcceptance : [];
  const draft = state.todoLearningGrowthSubmissionDrafts?.[todo.id] || "";
  const details = [
    looksGenericSubmitCard ? `<p class="todo-detail-muted">This Growth card has no concrete task prompt. Regenerate or republish the Growth plan before the learner submits work.</p>` : "",
    goal ? `<div class="todo-learning-growth-prompt"><strong>Task instruction</strong><p>${escapeHtml(goal)}</p></div>` : "",
    deliverables.length ? `<div class="todo-detail-chip-row">${deliverables.slice(0, 4).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : "",
    acceptance.length ? `<ul>${acceptance.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "",
  ].filter(Boolean).join("");
  const submissionForm = canSubmit
    ? `<form class="todo-learning-growth-submit" data-learning-growth-submission-form="${escapeHtml(todo.id)}">
      <label class="todo-panel-label" for="todoLearningGrowthSubmissionText">\u672c\u6b21\u4f5c\u7b54</label>
      <textarea id="todoLearningGrowthSubmissionText" class="todo-input todo-comment-textarea" rows="7" placeholder="\u5199\u4e0b\u672c\u6b21\u82f1\u8bed\u5199\u4f5c\u3001\u6539\u5199\u3001\u590d\u76d8\u6216\u4efb\u52a1\u7b54\u6848\u3002" ${submitting ? "disabled" : ""}>${escapeHtml(draft)}</textarea>
      <div class="todo-comment-actions">
        <button type="submit" data-submit-learning-growth-writing="${escapeHtml(todo.id)}" ${submitting ? "disabled" : ""}>${submitting ? "\u6b63\u5728\u63d0\u4ea4..." : "\u63d0\u4ea4\u4f5c\u7b54"}</button>
      </div>
      <p class="todo-detail-muted">\u63d0\u4ea4\u540e\u4f1a\u4fdd\u5b58\u5230\u8fd9\u5f20\u770b\u677f\u5361\uff0c\u5e76\u663e\u793a\u4e3a\u7b49\u5f85 AI \u8bc4\u4ef7\u6216\u5bb6\u957f\u590d\u6838\u3002</p>
    </form>`
    : "";
  const feedbackBlock = feedback?.message
    ? `<p class="todo-detail-muted ${feedback.kind === "error" ? "todo-detail-error" : ""}">${escapeHtml(feedback.message)}</p>`
    : "";
  const submittedBlock = submitted
    ? `<div class="todo-learning-growth-status" data-learning-growth-submission-status="${escapeHtml(submitted.status || "submitted")}">
      <strong>\u5df2\u6536\u5230\u4f5c\u7b54</strong>
      <p>\u4f5c\u7b54\u5df2\u4fdd\u5b58\u5230\u8fd9\u5f20\u770b\u677f\u5361\u3002\u5f53\u524d\u8fd8\u6ca1\u6709 AI \u6279\u6539\u7ed3\u679c\uff0c\u540e\u7eed\u5e94\u8fdb\u5165 AI \u8bc4\u4ef7\u6216\u5bb6\u957f\u590d\u6838\u3002</p>
      ${submitted.submittedAt ? `<small>${escapeHtml(formatTime(submitted.submittedAt) || submitted.submittedAt)}</small>` : ""}
    </div>`
    : "";
  return `<section class="todo-comment-panel todo-learning-growth-panel" data-learning-growth-kanban-card="${escapeHtml(todo.id || "")}">
    <label class="todo-panel-label">成长任务</label>
    <p class="todo-detail-muted">${escapeHtml(blocked ? "等待前置任务完成后自动开放。" : "该任务由凡凡成长系统下发，按任务说明完成；不需要走阅读录音模板。")}</p>
    ${details || `<p class="todo-detail-muted">${escapeHtml(todo?.kanbanCaseSummary || "打开成长页查看任务、分析和指导。")}</p>`}
    ${submittedBlock}
    ${submissionForm}
    ${feedbackBlock}
  </section>`;
}

function readingSubmissionSummary(todo) {
  return todo?.readingSubmission && typeof todo.readingSubmission === "object"
    ? todo.readingSubmission
    : null;
}

function readingSubmissionHasAnalysis(todo) {
  const workflow = todoWorkflowState(todo);
  if (workflow && (workflow.kind === "reading" || workflow.kind === "study")) {
    return ["quiz_pending", "completed"].includes(String(workflow.phase || ""));
  }
  const summary = readingSubmissionSummary(todo);
  return Boolean(
    summary?.quizAvailable
    || summary?.analysisOutput
    || readingQuizState(todo?.id || "")?.quiz
    || kanbanCardOutputs(todo).length,
  );
}

function readingSubmissionCompleted(todo) {
  const workflow = todoWorkflowState(todo);
  if (workflow && (workflow.kind === "reading" || workflow.kind === "study")) return Boolean(workflow.completed);
  const summary = readingSubmissionSummary(todo);
  if (summary?.completionError) return false;
  return String(summary?.status || "") === "completed";
}

function readingSubmissionFeedback(todoId) {
  return state.todoReadingSubmissionFeedback?.[todoId] || null;
}

function setReadingSubmissionFeedback(todoId, feedback = {}) {
  if (!todoId) return;
  state.todoReadingSubmissionFeedback[todoId] = Object.assign({ updatedAt: Date.now() }, feedback);
}

function clearReadingSubmissionWatchdog(todoId) {
  const timer = state.todoReadingSubmissionWatchdogs?.[todoId];
  if (timer) {
    window.clearTimeout(timer);
    delete state.todoReadingSubmissionWatchdogs[todoId];
  }
}

function clearReadingSubmissionPendingState(todoId) {
  if (!todoId) return;
  clearReadingSubmissionWatchdog(todoId);
  delete state.todoReadingSubmitting[todoId];
  delete state.todoReadingSubmissionRefreshing[todoId];
  delete state.todoReadingSubmissionProgress[todoId];
}

function answerDraftHash(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function answerDraftStorageId(value) {
  return encodeURIComponent(String(value || ""));
}

function answerDraftStoragePrefix(kind, workspaceId, todoId) {
  return `hermes${kind}AnswerDraft:${answerDraftStorageId(workspaceId || "owner")}:${answerDraftStorageId(todoId)}:`;
}

function answerDraftStorageKey(kind, workspaceId, todoId, fingerprint) {
  return `${answerDraftStoragePrefix(kind, workspaceId, todoId)}${answerDraftHash(fingerprint)}`;
}

function answerDraftFingerprint(source = {}) {
  const questions = Array.isArray(source.questions) ? source.questions : [];
  const questionKey = questions.map((question, index) => [
    question?.id || `q${index + 1}`,
    question?.prompt || "",
    Array.isArray(question?.choices) ? question.choices.length : 0,
  ].join(":")).join("|");
  return [
    source.startedAt || "",
    source.quizTargetingVersion || "",
    source.verification || "",
    source.status || "",
    questions.length,
    questionKey,
  ].join("|");
}

function validAnswerChoice(value, question = {}) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  const choices = Array.isArray(question.choices) ? question.choices : [];
  return Number.isInteger(parsed) && parsed >= 0 && parsed < choices.length ? parsed : null;
}

function serializeAnswerDraftAnswers(answers = [], questions = []) {
  return questions.map((question, index) => validAnswerChoice(answers[index], question));
}

function restoreAnswerDraftAnswers(answers = [], questions = []) {
  const restored = [];
  questions.forEach((question, index) => {
    const value = validAnswerChoice(answers[index], question);
    if (value !== null) restored[index] = value;
  });
  return restored;
}

function answerDraftAnsweredCount(answers = [], questions = []) {
  return serializeAnswerDraftAnswers(answers, questions).filter((value) => value !== null).length;
}

function clearAnswerDrafts(kind, workspaceId, todoId, keepKey = "") {
  const prefix = answerDraftStoragePrefix(kind, workspaceId, todoId);
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith(prefix) && key !== keepKey) localStorage.removeItem(key);
    }
  } catch (_) {}
}

function readAnswerDraft(kind, workspaceId, todoId, source = {}) {
  const questions = Array.isArray(source.questions) ? source.questions : [];
  if (!todoId || !questions.length) return { answers: [], step: 0 };
  const key = answerDraftStorageKey(kind, workspaceId, todoId, answerDraftFingerprint(source));
  clearAnswerDrafts(kind, workspaceId, todoId, key);
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    if (!raw || typeof raw !== "object") return { answers: [], step: 0 };
    const answers = restoreAnswerDraftAnswers(Array.isArray(raw.answers) ? raw.answers : [], questions);
    const maxStep = Math.max(0, questions.length - 1);
    const step = Math.max(0, Math.min(maxStep, Number(raw.step || 0) || 0));
    return { answers, step };
  } catch (_) {
    return { answers: [], step: 0 };
  }
}

function writeAnswerDraft(kind, workspaceId, todoId, source = {}, answers = [], step = 0) {
  const questions = Array.isArray(source.questions) ? source.questions : [];
  if (!todoId || !questions.length) return;
  const key = answerDraftStorageKey(kind, workspaceId, todoId, answerDraftFingerprint(source));
  const payload = {
    updatedAt: new Date().toISOString(),
    answers: serializeAnswerDraftAnswers(answers, questions),
    step: Math.max(0, Math.min(Math.max(0, questions.length - 1), Number(step || 0) || 0)),
  };
  try {
    localStorage.setItem(key, JSON.stringify(payload));
    clearAnswerDrafts(kind, workspaceId, todoId, key);
  } catch (_) {}
}

function applyAnswerDraft(kind, workspaceId, todoId, source = {}, existingAnswers = [], existingStep = 0) {
  const questions = Array.isArray(source.questions) ? source.questions : [];
  const existingCount = answerDraftAnsweredCount(existingAnswers, questions);
  if (existingCount > 0) {
    return {
      answers: restoreAnswerDraftAnswers(existingAnswers, questions),
      step: Math.max(0, Math.min(Math.max(0, questions.length - 1), Number(existingStep || 0) || 0)),
    };
  }
  return readAnswerDraft(kind, workspaceId, todoId, source);
}

function readingSubmissionReady(todoId) {
  const id = String(todoId || "").trim();
  if (!id) return false;
  const quiz = readingQuizState(id)?.quiz;
  if (quiz && Array.isArray(quiz.questions) && quiz.questions.length) return true;
  return readingSubmissionHasAnalysis(kanbanCardById(id));
}

function readReadingQuizDraft(todoId, quiz = {}) {
  return readAnswerDraft("ReadingQuiz", kanbanCardWorkspaceId(todoId), todoId, quiz);
}

function writeReadingQuizDraft(todoId) {
  const quiz = state.todoReadingQuizzes[todoId]?.quiz || null;
  if (!quiz) return;
  writeAnswerDraft("ReadingQuiz", kanbanCardWorkspaceId(todoId), todoId, quiz, state.todoReadingQuizAnswers[todoId] || [], state.todoReadingQuizStep[todoId] || 0);
}

function clearReadingQuizDrafts(todoId) {
  clearAnswerDrafts("ReadingQuiz", kanbanCardWorkspaceId(todoId), todoId);
}

function applyReadingQuizResult(todoId, result = {}) {
  const originalId = String(todoId || "").trim();
  const canonicalId = String(result.canonicalCardId || originalId || "").trim() || originalId;
  if (!canonicalId || !result?.quiz) return originalId;
  if (canonicalId !== originalId) {
    delete state.todoReadingQuizzes[originalId];
    state.selectedTodoId = canonicalId;
  }
  state.todoReadingQuizzes[canonicalId] = {
    quiz: result.quiz,
    quizUrl: result.quizUrl || "",
    status: result.status || "quiz_pending",
  };
  const draft = applyAnswerDraft(
    "ReadingQuiz",
    kanbanCardWorkspaceId(canonicalId),
    canonicalId,
    result.quiz,
    state.todoReadingQuizAnswers[canonicalId] || [],
    state.todoReadingQuizStep[canonicalId] || 0,
  );
  state.todoReadingQuizAnswers[canonicalId] = draft.answers;
  state.todoReadingQuizStep[canonicalId] = draft.step;
  return canonicalId;
}

async function refreshReadingSubmissionStatus(todoId, options = {}) {
  const id = String(todoId || "").trim();
  if (!id || state.todoReadingSubmissionRefreshing?.[id]) return false;
  const card = kanbanCardById(id);
  const labels = kanbanStudyLabels(card || {});
  state.todoReadingSubmissionRefreshing[id] = true;
  state.todoReadingSubmissionProgress[id] = "transcribing";
  setReadingSubmissionFeedback(id, {
    kind: "info",
    message: options.fromWatchdog
      ? "正在重新检查后台处理结果。"
      : "正在刷新处理结果。",
  });
  if (!options.silent) renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });

  let canonicalId = id;
  let ready = false;
  let quizError = null;
  let refreshError = null;
  try {
    const params = new URLSearchParams({ workspaceId: kanbanCardWorkspaceId(id) });
    const result = await api(`/api/kanban/cards/${encodeURIComponent(id)}/reading-quiz?${params.toString()}`);
    canonicalId = applyReadingQuizResult(id, result);
    const questions = result?.quiz?.questions;
    ready = Array.isArray(questions) && questions.length > 0;
  } catch (err) {
    quizError = err;
  }

  try {
    const workspaceId = kanbanCardWorkspaceId(canonicalId || id);
    clearTodoListCache(workspaceId);
    state.todoKanbanStatus = KANBAN_STORY_STATUS;
    localStorage.setItem("hermesTodoKanbanStatus", KANBAN_STORY_STATUS);
    await loadTodos({ skipCache: true, includeCompleted: true, freshServer: true, preserveScroll: true });
    if (state.todos.some((todo) => todo.id === canonicalId)) state.selectedTodoId = canonicalId;
    else if (state.todos.some((todo) => todo.id === id)) state.selectedTodoId = id;
    delete state.todoCardDetails[id];
    if (canonicalId !== id) delete state.todoCardDetails[canonicalId];
    await loadKanbanCardDetail(canonicalId || id, { force: true, silent: true });
  } catch (err) {
    refreshError = err;
  }

  ready = ready || readingSubmissionReady(canonicalId) || readingSubmissionReady(id);
  if (ready) {
    clearReadingSubmissionPendingState(id);
    if (canonicalId && canonicalId !== id) clearReadingSubmissionPendingState(canonicalId);
    delete state.todoReadingSubmissionDrafts[id];
    setReadingSubmissionFeedback(canonicalId || id, {
      kind: "success",
      message: `${labels.analysis}和${labels.quiz}已生成；请完成 10 题，全对后卡片完成。`,
    });
    if (!options.silentToast) showPushToast(`${labels.analysis}和${labels.quiz}已生成；请开始答卷。`, "success");
  } else if (quizError && refreshError) {
    setReadingSubmissionFeedback(id, {
      kind: "error",
      message: "刷新处理状态失败；请检查网络后重试。",
    });
  } else {
    setReadingSubmissionFeedback(id, {
      kind: "info",
      message: "后台仍在处理；稍后会继续刷新，也可以再次点刷新处理结果。",
    });
  }
  if (!ready && state.todoReadingSubmitting?.[id]) scheduleReadingSubmissionRecovery(id);
  delete state.todoReadingSubmissionRefreshing[id];
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  return ready;
}

function scheduleReadingSubmissionRecovery(todoId) {
  const id = String(todoId || "").trim();
  if (!id) return;
  clearReadingSubmissionWatchdog(id);
  state.todoReadingSubmissionWatchdogs[id] = window.setTimeout(() => {
    if (!state.todoReadingSubmitting?.[id]) return;
    refreshReadingSubmissionStatus(id, { fromWatchdog: true, silentToast: true }).catch((err) => {
      setReadingSubmissionFeedback(id, {
        kind: "error",
        message: err?.message || "刷新处理状态失败；请手动刷新。",
      });
      renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
    });
  }, 45000);
}

function renderKanbanReadingWorkflowPanel(todo) {
  return LearningReadingUi.renderKanbanReadingWorkflowPanel(todo, learningReadingUiOptions());
}

function readingQuizState(todoId) {
  return state.todoReadingQuizzes?.[todoId] || null;
}

function renderKanbanReadingQuizPanel(todo) {
  return LearningReadingUi.renderKanbanReadingQuizPanel(todo, learningReadingUiOptions());
}

function assessmentExamState(todoId) {
  return state.todoAssessmentExams?.[todoId] || null;
}

function readAssessmentExamDraft(todoId, exam = {}) {
  return readAnswerDraft("AssessmentExam", kanbanCardWorkspaceId(todoId), todoId, exam);
}

function writeAssessmentExamDraft(todoId) {
  const exam = state.todoAssessmentExams[todoId]?.exam || null;
  if (!exam) return;
  writeAnswerDraft("AssessmentExam", kanbanCardWorkspaceId(todoId), todoId, exam, state.todoAssessmentAnswers[todoId] || [], state.todoAssessmentStep[todoId] || 0);
}

function clearAssessmentExamDrafts(todoId) {
  clearAnswerDrafts("AssessmentExam", kanbanCardWorkspaceId(todoId), todoId);
}

function learningGuidanceKey(todoId, mode) {
  return `${String(todoId || "")}:${String(mode || "")}`;
}

function learningGuidanceDraftKey(todoId, mode, index) {
  return `${learningGuidanceKey(todoId, mode)}:${Number(index) || 0}`;
}

function learningGuidanceQuestionRecord(todoId, mode, question, index) {
  const session = state.todoLearningGuidance?.[learningGuidanceKey(todoId, mode)]?.guidance || null;
  const questions = Array.isArray(session?.questions) ? session.questions : [];
  const questionId = String(question?.id || `q${Number(index || 0) + 1}`);
  return questions.find((item) => String(item.questionId || "") === questionId)
    || questions.find((item) => Number(item.questionIndex || 0) === Number(index || 0))
    || null;
}

function learningGuidanceModeForAssessment(todo) {
  return isKanbanProgrammingAssessmentCard(todo) ? "programming-assessment" : "assessment-exam";
}

function selectedLearningAnswer(todoId, mode, index) {
  const answers = mode === "reading-quiz"
    ? state.todoReadingQuizAnswers?.[todoId]
    : state.todoAssessmentAnswers?.[todoId];
  const value = Array.isArray(answers) ? Number(answers[index]) : NaN;
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function learningGuidanceQuestionPayload(question = {}, index = 0) {
  return {
    id: String(question.id || `q${Number(index || 0) + 1}`),
    index: Number(index) || 0,
    skill: String(question.skill || ""),
    prompt: String(question.prompt || ""),
    choices: Array.isArray(question.choices) ? question.choices.map((choice) => String(choice || "")) : [],
  };
}

function learningGuidanceReflectionValue(todoId, mode, index, record = null) {
  const key = learningGuidanceDraftKey(todoId, mode, index);
  if (Object.prototype.hasOwnProperty.call(state.todoLearningGuidanceDrafts, key)) {
    return state.todoLearningGuidanceDrafts[key] || "";
  }
  return record?.reflection || "";
}

function renderLearningGuidancePanel(todoId, mode, index, question, options = {}) {
  const record = learningGuidanceQuestionRecord(todoId, mode, question, index);
  const selected = selectedLearningAnswer(todoId, mode, index);
  const draft = learningGuidanceReflectionValue(todoId, mode, index, record);
  const submitKey = learningGuidanceDraftKey(todoId, mode, index);
  const submitting = Boolean(state.todoLearningGuidanceSubmitting?.[submitKey]);
  const disabled = Boolean(options.disabled);
  const hint = record?.lastHint || "";
  const reflectionSaved = Boolean(record?.reflection);
  const reviewed = Boolean(record?.reviewedAt);
  return `<div class="learning-guidance-panel" data-learning-guidance-panel="${escapeHtml(submitKey)}">
    <div class="learning-guidance-head">
      <strong>${escapeHtml(options.title || "\u601d\u8def\u4e0e\u63d0\u793a")}</strong>
      <span>${escapeHtml(reviewed ? "\u5df2\u590d\u6838" : (reflectionSaved ? "\u5df2\u8bb0\u5f55\u601d\u8def" : "\u53ef\u5148\u5199\u601d\u8def"))}</span>
    </div>
    ${hint ? `<div class="learning-guidance-hint" role="status">${escapeHtml(hint)}</div>` : ""}
    <textarea class="todo-input learning-guidance-reflection" rows="2" data-learning-guidance-reflection="${escapeHtml(submitKey)}" placeholder="${escapeHtml("\u5199\u4e00\u53e5\uff1a\u6211\u4e3a\u4ec0\u4e48\u8fd9\u6837\u9009\uff1f\u54ea\u4e2a\u5730\u65b9\u8fd8\u4e0d\u786e\u5b9a\uff1f")}"${disabled || submitting ? " disabled" : ""}>${escapeHtml(draft)}</textarea>
    <div class="learning-guidance-actions">
      <button type="button" data-learning-guidance-action="hint" data-learning-guidance-mode="${escapeHtml(mode)}" data-learning-guidance-todo="${escapeHtml(todoId)}" data-question-index="${Number(index) || 0}"${disabled || submitting ? " disabled" : ""}>${escapeHtml(submitting ? "\u5904\u7406\u4e2d..." : "\u7ed9\u6211\u63d0\u793a")}</button>
      <button type="button" data-learning-guidance-action="reflection" data-learning-guidance-mode="${escapeHtml(mode)}" data-learning-guidance-todo="${escapeHtml(todoId)}" data-question-index="${Number(index) || 0}"${disabled || submitting ? " disabled" : ""}>${escapeHtml("\u4fdd\u5b58\u601d\u8def")}</button>
      <button type="button" data-learning-guidance-action="review" data-learning-guidance-mode="${escapeHtml(mode)}" data-learning-guidance-todo="${escapeHtml(todoId)}" data-question-index="${Number(index) || 0}"${disabled || submitting || selected === null ? " disabled" : ""}>${escapeHtml(reviewed ? "\u66f4\u65b0\u590d\u6838" : "\u52a0\u5165\u590d\u6838")}</button>
    </div>
  </div>`;
}

function renderAnswerReviewGate(todoId, mode, answeredCount, total, open) {
  if (!total || answeredCount < total) return "";
  const reviewedCount = (state.todoLearningGuidance?.[learningGuidanceKey(todoId, mode)]?.guidance?.questions || [])
    .filter((item) => item.reviewedAt).length;
  if (open) {
    return `<div class="learning-answer-review open" role="status">
      <strong>${escapeHtml("\u63d0\u4ea4\u524d\u590d\u6838")}</strong>
      <p>${escapeHtml(`\u5df2\u7b54 ${answeredCount}/${total}\uff1b\u5df2\u6807\u8bb0\u590d\u6838 ${reviewedCount}/${total}\u3002\u53ef\u4ee5\u8fd4\u56de\u4fee\u6539\uff0c\u786e\u8ba4\u540e\u518d\u5224\u5377\u3002`)}</p>
    </div>`;
  }
  return `<div class="learning-answer-review" role="status">
    <strong>${escapeHtml("\u5148\u590d\u6838\uff0c\u518d\u5224\u5377")}</strong>
    <p>${escapeHtml(`\u5df2\u7b54 ${answeredCount}/${total}\u3002\u70b9\u51fb\u590d\u6838\u540e\uff0c\u518d\u505a\u6700\u7ec8\u63d0\u4ea4\u3002`)}</p>
  </div>`;
}

function questionForLearningGuidance(todoId, mode, index) {
  const source = mode === "reading-quiz"
    ? state.todoReadingQuizzes?.[todoId]?.quiz
    : state.todoAssessmentExams?.[todoId]?.exam;
  const questions = Array.isArray(source?.questions) ? source.questions : [];
  return questions[Math.max(0, Number(index) || 0)] || null;
}

async function requestLearningGuidance(todoId, mode, action, index) {
  const normalizedTodoId = String(todoId || "");
  const normalizedMode = String(mode || "");
  const questionIndex = Math.max(0, Number(index) || 0);
  const question = questionForLearningGuidance(normalizedTodoId, normalizedMode, questionIndex);
  if (!normalizedTodoId || !question) return;
  const submitKey = learningGuidanceDraftKey(normalizedTodoId, normalizedMode, questionIndex);
  if (state.todoLearningGuidanceSubmitting?.[submitKey]) return;
  state.todoLearningGuidanceSubmitting[submitKey] = true;
  renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  try {
    const result = await api(`/api/kanban/cards/${encodeURIComponent(normalizedTodoId)}/learning-guidance`, {
      method: "POST",
      body: JSON.stringify({
        workspaceId: kanbanCardWorkspaceId(normalizedTodoId),
        mode: normalizedMode,
        action,
        question: learningGuidanceQuestionPayload(question, questionIndex),
        reflection: state.todoLearningGuidanceDrafts?.[submitKey] || "",
        selectedAnswerIndex: selectedLearningAnswer(normalizedTodoId, normalizedMode, questionIndex),
      }),
    });
    state.todoLearningGuidance[learningGuidanceKey(normalizedTodoId, normalizedMode)] = result;
    if (action === "hint") showPushToast("\u5df2\u751f\u6210\u63d0\u793a", "success");
    if (action === "reflection") showPushToast("\u5df2\u4fdd\u5b58\u601d\u8def", "success");
  } finally {
    delete state.todoLearningGuidanceSubmitting[submitKey];
    renderTodos({ preserveScroll: true, restoreScrollTop: $("conversation")?.scrollTop || 0 });
  }
}

async function loadLearningGuidanceSession(todoId, mode) {
  const normalizedTodoId = String(todoId || "");
  const normalizedMode = String(mode || "");
  if (!normalizedTodoId || !normalizedMode) return;
  const params = new URLSearchParams({
    workspaceId: kanbanCardWorkspaceId(normalizedTodoId),
    mode: normalizedMode,
  });
  const result = await api(`/api/kanban/cards/${encodeURIComponent(normalizedTodoId)}/learning-guidance?${params.toString()}`);
  state.todoLearningGuidance[learningGuidanceKey(normalizedTodoId, normalizedMode)] = result;
}

function renderKanbanAssessmentExamPanel(todo) {
  if (!isKanbanAssessmentCard(todo)) return "";
  const canAnswer = kanbanCan(todo, "canAnswerQuiz");
  const summary = assessmentExamSummary(todo) || {};
  const examState = assessmentExamState(todo.id);
  const submitting = Boolean(state.todoAssessmentSubmitting?.[todo.id]);
  const passed = assessmentExamCompleted(todo);
  const startable = assessmentCardAcceptsStart(todo);
  const workflow = todoWorkflowState(todo);
  const workflowPhase = String(workflow?.phase || "").trim().toLowerCase();
  if (!examState) {
    const last = summary.lastAttempt;
    const examAvailable = Boolean(
      summary.examAvailable
      || passed
      || workflowPhase === "in_progress"
      || workflowPhase === "retake_required"
      || workflow?.canAnswerQuiz
    );
    const text = last
      ? `上次 ${last.score}/100，通过线 ${last.passingScore || summary.passingScore || 80}；${last.passed ? "已通过" : "需要重考"}。`
      : (examAvailable ? "考试已生成，可继续查看或答题。" : (startable ? "考试已开放。开始后会生成正式单选考卷。" : "考试尚未开放，需要先通过前一张考试卡。"));
    const canOpenExam = (startable || examAvailable) && (canAnswer || passed);
    const programming = isKanbanProgrammingAssessmentCard(todo);
    const draft = state.todoAssessmentRequirementDrafts?.[todo.id] || "";
    const action = programming && !examAvailable && startable && canAnswer
      ? `<form class="todo-assessment-requirement-form" data-assessment-requirement-form="${escapeHtml(todo.id)}">
        <label class="todo-panel-label" for="todoAssessmentRequirementText">本次编程要求</label>
        <textarea id="todoAssessmentRequirementText" class="todo-input todo-comment-textarea" rows="4" data-assessment-requirement-input="${escapeHtml(todo.id)}" placeholder="填写老师教学重点、课堂表现、项目目标、想测试的知识点或代码练习要求">${escapeHtml(draft)}</textarea>
        <button type="submit" data-start-assessment-exam="${escapeHtml(todo.id)}">生成编程测验</button>
      </form>`
      : (canOpenExam
        ? `<button type="button" data-load-assessment-exam="${escapeHtml(todo.id)}">${escapeHtml(examAvailable ? "查看考卷" : "开始考试")}</button>`
        : `<div class="todo-assessment-waiting-action" role="status">${escapeHtml(startable ? "当前账号无答题权限" : "等待前序考试通过")}</div>`);
    const heading = programming ? "编程测验" : (summary.finalExam ? "最终综合考试" : "正式检测");
    return `<section class="todo-comment-panel todo-assessment-panel">
      <div class="todo-detail-deliverables-head">
        <strong>${escapeHtml(heading)}</strong>
        <span>${escapeHtml(`${summary.questionCount || 20}题 / ${summary.durationMinutes || 30}分钟`)}</span>
      </div>
      <p class="todo-detail-muted">${escapeHtml(text)}</p>
      ${action}
    </section>`;
  }
  if (examState.loading) {
    return `<section class="todo-comment-panel todo-assessment-panel"><p class="todo-detail-muted">正在生成正式考卷...</p></section>`;
  }
  if (examState.error) {
    return `<section class="todo-comment-panel todo-assessment-panel">
      <p class="todo-detail-error">${escapeHtml(examState.error)}</p>
      <button type="button" data-load-assessment-exam="${escapeHtml(todo.id)}">重新加载</button>
    </section>`;
  }
  const exam = examState.exam || {};
  const questions = Array.isArray(exam.questions) ? exam.questions : [];
  if (!questions.length) return "";
  const answers = state.todoAssessmentAnswers?.[todo.id] || [];
  const step = Math.max(0, Math.min(questions.length - 1, Number(state.todoAssessmentStep?.[todo.id] || 0)));
  const question = questions[step] || questions[0];
  const selected = Number(answers[step]);
  const result = examState.result || null;
  const resultItems = result && Array.isArray(result.results) ? result.results : [];
  const currentResult = resultItems[step] || null;
  const currentWrong = result && !result.passed && currentResult && !currentResult.correct;
  const choices = (question.choices || []).map((choice, index) => {
    const id = `assessmentExam_${todo.id}_${step}_${index}`.replace(/[^\w-]/g, "_");
    return `<label class="reading-quiz-choice" for="${escapeHtml(id)}">
      <input id="${escapeHtml(id)}" type="radio" name="assessmentExamChoice_${escapeHtml(todo.id)}" value="${index}" data-assessment-exam-choice="${escapeHtml(todo.id)}" data-question-index="${step}"${selected === index ? " checked" : ""}${submitting || passed || !canAnswer ? " disabled" : ""}>
      <span>${escapeHtml(choice)}</span>
    </label>`;
  }).join("");
  const canPrev = step > 0;
  const canNext = step < questions.length - 1;
  const answeredCount = answers.filter((value) => Number.isInteger(Number(value))).length;
  const guidanceMode = learningGuidanceModeForAssessment(todo);
  const reviewOpen = Boolean(state.todoAssessmentReviewOpen?.[todo.id]);
  const status = result
    ? (result.passed ? `已通过：${result.score}/100` : `本次 ${result.score}/100，未达通过线，请修正后重考。`)
    : (passed ? "已通过，可查看题目。" : `已答 ${answeredCount}/${questions.length}；通过线 ${exam.passingScore || summary.passingScore || 80}`);
  const wrongHint = currentWrong
    ? `<div class="reading-quiz-feedback" role="status">
      <strong>第 ${step + 1} 题需要复习</strong>
      <p>${escapeHtml(currentResult.explanation || "这题需要重新检查。")}</p>
    </div>`
    : "";
  const passedExplanation = result?.passed && currentResult?.explanation
    ? `<div class="reading-quiz-feedback" role="status">
      <strong>第 ${step + 1} 题讲解</strong>
      <p>${escapeHtml(currentResult.explanation)}</p>
    </div>`
    : "";
  const guidanceBlock = renderLearningGuidancePanel(todo.id, guidanceMode, step, question, {
    disabled: submitting || passed || !canAnswer,
    title: "\u6d4b\u9a8c\u5f15\u5bfc",
  });
  const reviewBlock = renderAnswerReviewGate(todo.id, guidanceMode, answeredCount, questions.length, reviewOpen);
  const submitControls = passed
    ? `<button type="submit" disabled>${escapeHtml("\u5df2\u901a\u8fc7")}</button>`
    : (reviewOpen
      ? `<button type="submit"${canAnswer && answeredCount === questions.length && !submitting ? "" : " disabled"}>${escapeHtml(submitting ? "\u6b63\u5728\u5224\u5377..." : "\u786e\u8ba4\u63d0\u4ea4")}</button>`
      : `<button type="button" data-assessment-exam-review="${escapeHtml(todo.id)}"${canAnswer && answeredCount === questions.length && !submitting ? "" : " disabled"}>${escapeHtml("\u590d\u6838\u7b54\u6848")}</button>`);
  return `<form class="todo-comment-panel todo-assessment-panel" data-assessment-exam-form="${escapeHtml(todo.id)}">
    <div class="todo-detail-deliverables-head">
      <strong>${escapeHtml(exam.title || "正式检测")}</strong>
      <span>${step + 1}/${questions.length}</span>
    </div>
    <p class="todo-detail-muted">${escapeHtml(status)}</p>
    <article class="reading-quiz-question">
      <small>${escapeHtml(question.skill || "")}</small>
      <strong>${escapeHtml(question.prompt || "")}</strong>
      <div class="reading-quiz-choices">${choices}</div>
    </article>
    ${wrongHint}
    ${passedExplanation}
    ${guidanceBlock}
    ${reviewBlock}
    <div class="todo-comment-actions">
      <button type="button" data-assessment-exam-prev="${escapeHtml(todo.id)}"${canPrev && !submitting ? "" : " disabled"}>上一题</button>
      <button type="button" data-assessment-exam-next="${escapeHtml(todo.id)}"${canNext && (passed || Number.isInteger(selected)) && !submitting ? "" : " disabled"}>下一题</button>
      ${submitControls}
    </div>
  </form>`;
}
