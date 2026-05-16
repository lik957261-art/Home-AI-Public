"use strict";

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HermesLearningReadingUi = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function defaultEscapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function optionFn(options, name, fallback) {
    return typeof options[name] === "function" ? options[name] : fallback;
  }

  function optionState(options) {
    return options.state && typeof options.state === "object" ? options.state : {};
  }

  function defaultLabels() {
    return {
      item: "阅读卡片",
      recording: "录音",
      upload: "录音",
      submit: "提交录音",
      analysis: "阅读分析",
      quiz: "测验",
      completed: "已完成",
    };
  }

  function nextReadingCaseTodo(todo, options = {}) {
    const isKanbanReadingCard = optionFn(options, "isKanbanReadingCard", () => false);
    const normalizedKanbanStatus = optionFn(options, "normalizedKanbanStatus", (item) => String(item?.kanbanStatus || item?.status || "todo").toLowerCase());
    if (!isKanbanReadingCard(todo)) return null;
    const caseId = String(todo?.kanbanCaseId || "").trim();
    const currentIndex = Number(todo?.kanbanCaseCardIndex || 0) || 0;
    if (!caseId || !currentIndex) return null;
    const todos = Array.isArray(options.todos) ? options.todos : (optionState(options).todos || []);
    return todos
      .filter((item) => (
        isKanbanReadingCard(item)
        && String(item?.kanbanCaseId || "").trim() === caseId
        && (Number(item?.kanbanCaseCardIndex || 0) || 0) > currentIndex
        && !["done", "archived"].includes(normalizedKanbanStatus(item))
      ))
      .sort((left, right) => (Number(left?.kanbanCaseCardIndex || 0) || 0) - (Number(right?.kanbanCaseCardIndex || 0) || 0))[0] || null;
  }

  function renderKanbanReadingWorkflowPanel(todo, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const isKanbanReadingCard = optionFn(options, "isKanbanReadingCard", () => false);
    if (!isKanbanReadingCard(todo)) return "";
    const state = optionState(options);
    const kanbanStudyLabels = optionFn(options, "kanbanStudyLabels", defaultLabels);
    const labels = Object.assign(defaultLabels(), kanbanStudyLabels(todo) || {});
    const readingSubmissionFeedback = optionFn(options, "readingSubmissionFeedback", () => null);
    const readingSubmissionHasAnalysis = optionFn(options, "readingSubmissionHasAnalysis", () => false);
    const readingQuizState = optionFn(options, "readingQuizState", () => null);
    const readingSubmissionCompleted = optionFn(options, "readingSubmissionCompleted", () => false);
    const readingCardAcceptsSubmission = optionFn(options, "readingCardAcceptsSubmission", () => false);
    const submitting = Boolean(state.todoReadingSubmitting?.[todo.id]);
    const progress = String(state.todoReadingSubmissionProgress?.[todo.id] || "");
    const feedback = readingSubmissionFeedback(todo.id);
    const hasAnalysis = readingSubmissionHasAnalysis(todo);
    const quizState = readingQuizState(todo.id);
    const quizLoaded = Boolean(quizState?.quiz);
    const completed = readingSubmissionCompleted(todo);
    const canSubmit = readingCardAcceptsSubmission(todo);
    const stepClass = (done, active) => done ? "done" : (active ? "active" : "pending");
    const uploadDone = completed || hasAnalysis || submitting;
    const analysisDone = completed || hasAnalysis;
    const quizActive = !completed && (hasAnalysis || quizLoaded);
    const progressText = progress === "uploading"
      ? `正在读取${labels.recording}并上传。`
      : (progress === "transcribing"
        ? `${labels.recording}已上传，正在转写语音、生成${labels.analysis}和${labels.quiz}。`
        : (submitting ? `${labels.recording}已提交，正在转写语音、生成${labels.analysis}和${labels.quiz}；完成后会自动显示入口。` : ""));
    const summaryText = completed
      ? labels.completed
      : (feedback?.kind === "success" && hasAnalysis
        ? feedback.message
        : (hasAnalysis
          ? `分析已完成；请完成 10 题${labels.quiz}，全部正确后卡片才会完成。`
          : (canSubmit ? `先${labels.upload}。` : `当前还不能${labels.submit}。`)));
    const feedbackBlock = feedback?.kind === "error"
      ? `<p class="todo-detail-error" role="status">${escapeHtml(feedback.message || "提交失败，请重试。")}</p>`
      : "";
    return `<section class="todo-reading-workflow" data-reading-workflow="${escapeHtml(todo.id)}">
    <div class="todo-detail-deliverables-head">
      <strong>${escapeHtml(`${labels.item}完成流程`)}</strong>
      <span>${escapeHtml(completed ? "已完成" : (feedback?.kind === "error" ? "提交失败" : (submitting ? "处理中" : (hasAnalysis ? "待答卷" : `待${labels.recording}`))))}</span>
    </div>
    <ol>
      <li class="${stepClass(uploadDone, !uploadDone && canSubmit)}"><span>1</span><strong>${escapeHtml(labels.submit)}</strong><small>${escapeHtml(uploadDone ? `已收到${labels.recording}` : labels.upload)}</small></li>
      <li class="${stepClass(analysisDone, submitting)}"><span>2</span><strong>${escapeHtml(labels.analysis)}</strong><small>${escapeHtml(analysisDone ? "已生成分析和练习" : (submitting ? "正在处理" : `等待${labels.recording}`))}</small></li>
      <li class="${stepClass(completed, quizActive)}"><span>3</span><strong>${escapeHtml(labels.quiz)}</strong><small>${escapeHtml(completed ? "10/10 已通过" : (quizActive ? "需要 10 题全对" : "等待分析完成"))}</small></li>
    </ol>
    <p class="todo-detail-muted">${escapeHtml(progressText || summaryText)}</p>
    ${feedbackBlock}
  </section>`;
  }

  function renderKanbanReadingQuizPanel(todo, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const isKanbanReadingCard = optionFn(options, "isKanbanReadingCard", () => false);
    if (!isKanbanReadingCard(todo)) return "";
    const state = optionState(options);
    const kanbanStudyLabels = optionFn(options, "kanbanStudyLabels", defaultLabels);
    const labels = Object.assign(defaultLabels(), kanbanStudyLabels(todo) || {});
    const kanbanCan = optionFn(options, "kanbanCan", () => false);
    const readingQuizState = optionFn(options, "readingQuizState", () => null);
    const readingSubmissionHasAnalysis = optionFn(options, "readingSubmissionHasAnalysis", () => false);
    const readingSubmissionSummary = optionFn(options, "readingSubmissionSummary", () => null);
    const readingSubmissionCompleted = optionFn(options, "readingSubmissionCompleted", () => false);
    const isKanbanReadingPlanCase = optionFn(options, "isKanbanReadingPlanCase", () => false);
    const renderLearningGuidancePanel = optionFn(options, "renderLearningGuidancePanel", () => "");
    const renderAnswerReviewGate = optionFn(options, "renderAnswerReviewGate", () => "");
    const nextReadingCase = optionFn(options, "nextReadingCaseTodo", (item) => nextReadingCaseTodo(item, options));
    const canAnswer = kanbanCan(todo, "canAnswerQuiz");
    const quizState = readingQuizState(todo.id);
    const submitting = Boolean(state.todoReadingQuizSubmitting?.[todo.id]);
    if (!quizState) {
      if (!readingSubmissionHasAnalysis(todo)) return "";
      const summary = readingSubmissionSummary(todo);
      const attempt = summary?.lastAttempt;
      const attemptText = attempt && !attempt.passed
        ? `上次 ${attempt.correctCount || 0}/${attempt.total || 10}，继续订正。`
        : (isKanbanReadingPlanCase(todo) ? "分析已完成，下一步完成 10 题单选考卷。" : `分析已完成，下一步完成 10 题${labels.quiz}。`);
      const buttonText = readingSubmissionCompleted(todo) ? "查看答卷" : "开始答卷";
      return `<section class="todo-comment-panel todo-reading-quiz-panel">
      <div class="todo-detail-deliverables-head">
        <strong>${escapeHtml(labels.quiz)}</strong>
        <span>第 3 步</span>
      </div>
      <p class="todo-detail-muted">${escapeHtml(attemptText)}</p>
      <button type="button" data-load-reading-quiz="${escapeHtml(todo.id)}">${escapeHtml(canAnswer || readingSubmissionCompleted(todo) ? buttonText : "查看测验")}</button>
    </section>`;
    }
    if (quizState.loading) {
      return `<section class="todo-comment-panel todo-reading-quiz-panel"><p class="todo-detail-muted">正在加载考卷...</p></section>`;
    }
    if (quizState.error) {
      return `<section class="todo-comment-panel todo-reading-quiz-panel">
      <p class="todo-detail-error">${escapeHtml(quizState.error)}</p>
      <button type="button" data-load-reading-quiz="${escapeHtml(todo.id)}">重新加载</button>
    </section>`;
    }
    const quiz = quizState.quiz || {};
    const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
    if (!questions.length) return "";
    const answers = state.todoReadingQuizAnswers?.[todo.id] || [];
    const passed = readingSubmissionCompleted(todo);
    if (passed) {
      const nextCard = nextReadingCase(todo);
      return `<section class="todo-comment-panel todo-reading-quiz-panel">
      <div class="todo-detail-deliverables-head">
        <strong>${escapeHtml(quiz.title || labels.quiz)}</strong>
        <span>${escapeHtml("已通过")}</span>
      </div>
      <p class="todo-detail-muted">${escapeHtml("本卡片已通过，答卷已锁定；继续下一张卡片或查看下方卡片信息和交付文件。")}</p>
      <div class="todo-comment-actions">
        ${nextCard ? `<button type="button" data-todo-id="${escapeHtml(nextCard.id)}">${escapeHtml("打开下一张")}</button>` : ""}
        <button type="button" data-load-reading-quiz="${escapeHtml(todo.id)}">${escapeHtml("刷新状态")}</button>
      </div>
    </section>`;
    }
    const step = Math.max(0, Math.min(questions.length - 1, Number(state.todoReadingQuizStep?.[todo.id] || 0)));
    const question = questions[step] || questions[0];
    const selected = Number(answers[step]);
    const result = quizState.result || null;
    const resultItems = result && Array.isArray(result.results) ? result.results : [];
    const currentResult = resultItems[step] || null;
    const currentWrong = result && !result.passed && currentResult && !currentResult.correct;
    const choices = (question.choices || []).map((choice, index) => {
      const id = `readingQuiz_${todo.id}_${step}_${index}`.replace(/[^\w-]/g, "_");
      return `<label class="reading-quiz-choice" for="${escapeHtml(id)}">
      <input id="${escapeHtml(id)}" type="radio" name="readingQuizChoice_${escapeHtml(todo.id)}" value="${index}" data-reading-quiz-choice="${escapeHtml(todo.id)}" data-question-index="${step}"${selected === index ? " checked" : ""}${submitting || passed || !canAnswer ? " disabled" : ""}>
      <span>${escapeHtml(choice)}</span>
    </label>`;
    }).join("");
    const canPrev = step > 0;
    const canNext = step < questions.length - 1;
    const answeredCount = answers.filter((value) => Number.isInteger(Number(value))).length;
    const reviewOpen = Boolean(state.todoReadingQuizReviewOpen?.[todo.id]);
    const status = result
      ? (result.passed ? "已全对，卡片已完成。" : `本次 ${result.correctCount || 0}/${result.total || 10}，请修改错误题后再提交。`)
      : `已答 ${answeredCount}/${questions.length}`;
    const wrongHint = currentWrong
      ? `<div class="reading-quiz-feedback" role="status">
      <strong>第 ${step + 1} 题需要修改</strong>
      <p>${escapeHtml(currentResult.explanation || "这题需要重新检查，修改后再提交。")}</p>
    </div>`
      : "";
    const guidanceBlock = renderLearningGuidancePanel(todo.id, "reading-quiz", step, question, {
      disabled: submitting || passed || !canAnswer,
      title: "答题引导",
    });
    const reviewBlock = renderAnswerReviewGate(todo.id, "reading-quiz", answeredCount, questions.length, reviewOpen);
    const submitControls = reviewOpen
      ? `<button type="submit"${canAnswer && answeredCount === questions.length && !submitting ? "" : " disabled"}>${escapeHtml(submitting ? "正在判卷..." : "确认提交")}</button>`
      : `<button type="button" data-reading-quiz-review="${escapeHtml(todo.id)}"${canAnswer && answeredCount === questions.length && !submitting ? "" : " disabled"}>${escapeHtml("复核答案")}</button>`;
    return `<form class="todo-comment-panel todo-reading-quiz-panel" data-reading-quiz-form="${escapeHtml(todo.id)}">
    <div class="todo-detail-deliverables-head">
      <strong>${escapeHtml(quiz.title || labels.quiz)}</strong>
      <span>${step + 1}/${questions.length}</span>
    </div>
    <p class="todo-detail-muted">${escapeHtml(status)}</p>
    <article class="reading-quiz-question">
      <small>${escapeHtml(question.skill || "")}</small>
      <strong>${escapeHtml(question.prompt || "")}</strong>
      <div class="reading-quiz-choices">${choices}</div>
    </article>
    ${wrongHint}
    ${guidanceBlock}
    ${reviewBlock}
    <div class="todo-comment-actions">
      <button type="button" data-reading-quiz-prev="${escapeHtml(todo.id)}"${canPrev && !submitting ? "" : " disabled"}>上一题</button>
      <button type="button" data-reading-quiz-next="${escapeHtml(todo.id)}"${canNext && Number.isInteger(selected) && !submitting ? "" : " disabled"}>下一题</button>
      ${submitControls}
    </div>
  </form>`;
  }

  function renderKanbanReadingRecorderControls(todo, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const state = optionState(options);
    const supportsKanbanReadingRecorder = optionFn(options, "supportsKanbanReadingRecorder", () => false);
    const kanbanReadingRecordingStatusText = optionFn(options, "kanbanReadingRecordingStatusText", () => "");
    const todoId = String(todo?.id || "");
    const recording = state.todoReadingRecorders?.[todoId] || {};
    const status = String(recording.status || "");
    const supported = supportsKanbanReadingRecorder();
    const ready = status === "ready" && recording.file;
    const canToggle = supported && !options.submitting && !["requesting", "stopping"].includes(status);
    const recordButtonText = status === "recording" ? "停止" : (ready ? "重录" : "录音");
    const recordButtonClass = status === "recording" ? " recording" : (ready ? " ready" : "");
    const playback = ready && recording.url
      ? `<audio class="todo-reading-playback" controls src="${escapeHtml(recording.url)}"></audio>`
      : "";
    return `<div class="todo-reading-recorder" data-reading-recorder="${escapeHtml(todoId)}">
    <div class="todo-reading-recorder-actions">
      <button class="todo-reading-record-button${recordButtonClass}" type="button" data-reading-record-toggle="${escapeHtml(todoId)}"${canToggle ? "" : " disabled"} aria-pressed="${status === "recording" ? "true" : "false"}">${escapeHtml(recordButtonText)}</button>
    </div>
    <div class="todo-detail-muted todo-reading-record-status" data-reading-record-status="${escapeHtml(todoId)}">${escapeHtml(kanbanReadingRecordingStatusText(todoId))}</div>
    ${playback}
  </div>`;
  }

  function renderKanbanReadingSubmissionPanel(todo, options = {}) {
    const escapeHtml = optionFn(options, "escapeHtml", defaultEscapeHtml);
    const isKanbanReadingCard = optionFn(options, "isKanbanReadingCard", () => false);
    const todoMatchesOpen = optionFn(options, "todoMatchesOpen", () => false);
    const kanbanCan = optionFn(options, "kanbanCan", () => false);
    if (!isKanbanReadingCard(todo) || !todoMatchesOpen(todo)) return "";
    if (!kanbanCan(todo, "canSubmitStudy")) return "";
    const state = optionState(options);
    const kanbanStudyLabels = optionFn(options, "kanbanStudyLabels", defaultLabels);
    const labels = Object.assign(defaultLabels(), kanbanStudyLabels(todo) || {});
    const readingQuizState = optionFn(options, "readingQuizState", () => null);
    const readingSubmissionHasAnalysis = optionFn(options, "readingSubmissionHasAnalysis", () => false);
    const readingCardAcceptsSubmission = optionFn(options, "readingCardAcceptsSubmission", () => false);
    const normalizedKanbanStatus = optionFn(options, "normalizedKanbanStatus", () => "todo");
    const readingSubmissionFeedback = optionFn(options, "readingSubmissionFeedback", () => null);
    const renderRecorder = optionFn(options, "renderKanbanReadingRecorderControls", (item, submitting) => renderKanbanReadingRecorderControls(item, Object.assign({}, options, { submitting })));
    const quizState = readingQuizState(todo.id);
    if (quizState?.quiz || readingSubmissionHasAnalysis(todo)) return "";
    if (!readingCardAcceptsSubmission(todo)) {
      const status = normalizedKanbanStatus(todo);
      const due = todo?.dueLocal || todo?.dueAt || "";
      const reason = status === "blocked"
        ? `等待前一次${labels.item}完成后自动解锁。`
        : (due ? `本次${labels.item}将在 ${due} 开始。` : `本次${labels.item}尚未到可提交状态。`);
      return `<section class="todo-comment-panel todo-reading-panel" data-reading-submission-waiting="${escapeHtml(todo.id)}">
      <p class="todo-detail-muted">${escapeHtml(reason)}</p>
    </section>`;
    }
    const submitting = Boolean(state.todoReadingSubmitting?.[todo.id]);
    const recorderStatus = String(state.todoReadingRecorders?.[todo.id]?.status || "");
    const recorderBlock = renderRecorder(todo, submitting);
    const progress = String(state.todoReadingSubmissionProgress?.[todo.id] || "");
    const feedback = readingSubmissionFeedback(todo.id);
    const refreshing = Boolean(state.todoReadingSubmissionRefreshing?.[todo.id]);
    const notes = state.todoReadingSubmissionDrafts?.[todo.id] || "";
    const progressText = progress === "uploading"
      ? `正在上传${labels.recording}。`
      : `${labels.recording}已上传，正在转写语音、生成${labels.analysis}和${labels.quiz}。`;
    const idleUploadText = recorderStatus === "recording"
      ? "正在录音；再次点击同一个按钮停止。"
      : (recorderStatus === "ready" ? "已录好待提交；可先回放，也可重录替换。" : "先录音，停止生成音频后才能提交。");
    const statusText = submitting ? progressText : (feedback?.kind === "error" ? feedback.message : idleUploadText);
    const statusClass = feedback?.kind === "error" && !submitting
      ? "todo-detail-error todo-reading-audio-status"
      : "todo-detail-muted todo-reading-audio-status";
    const refreshButton = submitting
      ? `<button type="button" data-refresh-reading-submission="${escapeHtml(todo.id)}"${refreshing ? " disabled" : ""}>${escapeHtml(refreshing ? "正在刷新" : "刷新处理结果")}</button>`
      : "";
    return `<form class="todo-comment-panel todo-reading-panel" data-reading-submission-form="${escapeHtml(todo.id)}" ${submitting ? 'aria-busy="true"' : ""}>
    <label class="todo-panel-label">${escapeHtml(labels.submit)}</label>
    ${recorderBlock}
    <div class="${statusClass}" data-reading-audio-status role="status">${escapeHtml(statusText)}</div>
    <textarea id="todoReadingSubmissionNotes" class="todo-input todo-comment-textarea" rows="3" placeholder="补充当天范围、状态或观察，可留空" ${submitting ? "disabled" : ""}>${escapeHtml(notes)}</textarea>
    <div class="todo-comment-actions">
      ${refreshButton}
      <button type="submit" data-submit-reading="${escapeHtml(todo.id)}" ${submitting || !state.todoReadingRecorders?.[todo.id]?.file ? "disabled" : ""}>${escapeHtml(submitting ? "已提交处理中" : labels.submit)}</button>
    </div>
    <p class="todo-detail-muted">${escapeHtml(submitting ? `处理可能需要几十秒到数分钟；正在等待语音转写、阅读分析和${labels.quiz}生成。` : `${labels.recording}提交后，Hermes 会先转写语音，再生成分析和${labels.quiz}；10 题全对后，本卡片才会完成。`)}</p>
  </form>`;
  }

  return {
    nextReadingCaseTodo,
    renderKanbanReadingWorkflowPanel,
    renderKanbanReadingQuizPanel,
    renderKanbanReadingRecorderControls,
    renderKanbanReadingSubmissionPanel,
  };
}));
