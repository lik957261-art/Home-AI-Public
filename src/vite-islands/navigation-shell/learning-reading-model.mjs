"use strict";

export const LEARNING_READING_MODEL_VERSION = "20260706-learning-reading-model-v1";

export function learningReadingLabelsPlan(labels = {}) {
  return Object.assign({
    item: "阅读卡片",
    recording: "录音",
    upload: "录音",
    submit: "提交录音",
    analysis: "阅读分析",
    quiz: "测验",
    completed: "已完成",
  }, labels && typeof labels === "object" ? labels : {});
}

export function nextReadingCaseTodoPlan({
  todo = null,
  todos = [],
  isReadingCard = false,
  statuses = {},
} = {}) {
  if (!todo || !isReadingCard) return null;
  const caseId = String(todo?.kanbanCaseId || "").trim();
  const currentIndex = Number(todo?.kanbanCaseCardIndex || 0) || 0;
  if (!caseId || !currentIndex) return null;
  return (Array.isArray(todos) ? todos : [])
    .filter((item) => (
      Boolean(item?.isReadingCard)
      && String(item?.todo?.kanbanCaseId || "").trim() === caseId
      && (Number(item?.todo?.kanbanCaseCardIndex || 0) || 0) > currentIndex
      && !["done", "archived"].includes(String(statuses?.[item?.id] || item?.status || "todo").toLowerCase())
    ))
    .sort((left, right) => (
      (Number(left?.todo?.kanbanCaseCardIndex || 0) || 0)
      - (Number(right?.todo?.kanbanCaseCardIndex || 0) || 0)
    ))[0]?.todo || null;
}

export function readingWorkflowPlan({
  labels = {},
  submitting = false,
  progress = "",
  feedback = null,
  submissionSummary = {},
  hasAnalysis = false,
  quizLoaded = false,
  completed = false,
  canSubmit = false,
} = {}) {
  const displayLabels = learningReadingLabelsPlan(labels);
  const serverProcessing = ["processing", "submitted", "analyzing"].includes(String(submissionSummary?.status || ""));
  const uploadDone = Boolean(completed || hasAnalysis || submitting || serverProcessing);
  const analysisDone = Boolean(completed || hasAnalysis);
  const quizActive = Boolean(!completed && (hasAnalysis || quizLoaded));
  const progressText = progress === "uploading"
    ? `正在读取${displayLabels.recording}并上传。`
    : (progress === "transcribing"
      ? `${displayLabels.recording}已上传，正在转写语音、生成${displayLabels.analysis}和${displayLabels.quiz}。`
      : ((submitting || serverProcessing) ? `${displayLabels.recording}已提交，正在转写语音、生成${displayLabels.analysis}和${displayLabels.quiz}；完成后会自动显示入口。` : ""));
  const summaryText = completed
    ? displayLabels.completed
    : (feedback?.kind === "success" && hasAnalysis
      ? feedback.message
      : (hasAnalysis
        ? `分析已完成；请完成 10 题${displayLabels.quiz}，全部正确后卡片才会完成。`
        : (canSubmit ? `先${displayLabels.upload}。` : `当前还不能${displayLabels.submit}。`)));
  const statusText = completed
    ? "已完成"
    : (feedback?.kind === "error" ? "提交失败" : ((submitting || serverProcessing) ? "处理中" : (hasAnalysis ? "待答卷" : `待${displayLabels.recording}`)));
  return {
    labels: displayLabels,
    uploadDone,
    analysisDone,
    quizActive,
    statusText,
    bodyText: progressText || summaryText,
    errorMessage: feedback?.kind === "error" ? (feedback.message || "提交失败，请重试。") : "",
  };
}

export function readingQuizPanelPlan({
  labels = {},
  quizState = null,
  hasAnalysis = false,
  summary = null,
  completed = false,
  isPlanCase = false,
  questions = [],
  answers = [],
  step = 0,
  result = null,
  reviewOpen = false,
  submitting = false,
  canAnswer = false,
} = {}) {
  const displayLabels = learningReadingLabelsPlan(labels);
  if (!quizState) {
    if (!hasAnalysis) return { visible: false };
    const attempt = summary?.lastAttempt;
    const attemptText = attempt && !attempt.passed
      ? `上次 ${attempt.correctCount || 0}/${attempt.total || 10}，继续订正。`
      : (isPlanCase ? "分析已完成，下一步完成 10 题单选考卷。" : `分析已完成，下一步完成 10 题${displayLabels.quiz}。`);
    return {
      visible: true,
      mode: "intro",
      labels: displayLabels,
      attemptText,
      buttonText: completed ? "查看答卷" : (canAnswer ? "开始答卷" : "查看测验"),
    };
  }
  if (quizState.loading) return { visible: true, mode: "loading" };
  if (quizState.error) return { visible: true, mode: "error", error: String(quizState.error || "") };
  const normalizedQuestions = Array.isArray(questions) ? questions : [];
  if (!normalizedQuestions.length) return { visible: false };
  const normalizedStep = Math.max(0, Math.min(normalizedQuestions.length - 1, Number(step || 0)));
  const selected = Number(answers?.[normalizedStep]);
  const resultItems = result && Array.isArray(result.results) ? result.results : [];
  const currentResult = resultItems[normalizedStep] || null;
  const answeredCount = (Array.isArray(answers) ? answers : []).filter((value) => Number.isInteger(Number(value))).length;
  return {
    visible: true,
    mode: completed ? "passed" : "active",
    labels: displayLabels,
    step: normalizedStep,
    selected,
    canPrev: normalizedStep > 0,
    canNext: normalizedStep < normalizedQuestions.length - 1,
    answeredCount,
    reviewOpen: Boolean(reviewOpen),
    status: result
      ? (result.passed ? "已全对，卡片已完成。" : `本次 ${result.correctCount || 0}/${result.total || 10}，请修改错误题后再提交。`)
      : `已答 ${answeredCount}/${normalizedQuestions.length}`,
    currentWrong: Boolean(result && !result.passed && currentResult && !currentResult.correct),
    wrongExplanation: currentResult?.explanation || "这题需要重新检查，修改后再提交。",
    submitDisabled: !(canAnswer && answeredCount === normalizedQuestions.length && !submitting),
  };
}

export function readingRecorderControlsPlan({
  todoId = "",
  recording = {},
  supported = false,
  submitting = false,
} = {}) {
  const status = String(recording?.status || "");
  const ready = Boolean(status === "ready" && recording?.file);
  const canToggle = Boolean(supported && !submitting && !["requesting", "stopping"].includes(status));
  return {
    todoId: String(todoId || ""),
    status,
    ready,
    canToggle,
    recordButtonText: status === "recording" ? "停止" : (ready ? "重录" : "录音"),
    recordButtonClass: status === "recording" ? " recording" : (ready ? " ready" : ""),
    ariaPressed: status === "recording" ? "true" : "false",
    playbackUrl: ready && recording?.url ? String(recording.url || "") : "",
  };
}

export function readingSubmissionPanelPlan({
  labels = {},
  quizLoaded = false,
  hasAnalysis = false,
  acceptsSubmission = false,
  status = "todo",
  due = "",
  submitting = false,
  recorderStatus = "",
  recorderHasFile = false,
  progress = "",
  feedback = null,
  refreshing = false,
} = {}) {
  const displayLabels = learningReadingLabelsPlan(labels);
  if (quizLoaded || hasAnalysis) return { visible: false };
  if (!acceptsSubmission) {
    return {
      visible: true,
      mode: "waiting",
      labels: displayLabels,
      reason: String(status || "") === "blocked"
        ? `等待前一次${displayLabels.item}完成后自动解锁。`
        : (due ? `本次${displayLabels.item}将在 ${due} 开始。` : `本次${displayLabels.item}尚未到可提交状态。`),
    };
  }
  const progressText = progress === "uploading"
    ? `正在上传${displayLabels.recording}。`
    : `${displayLabels.recording}已上传，正在转写语音、生成${displayLabels.analysis}和${displayLabels.quiz}。`;
  const idleUploadText = recorderStatus === "recording"
    ? "正在录音；再次点击同一个按钮停止。"
    : (recorderStatus === "ready" ? "已录好待提交；可先回放，也可重录替换。" : "先录音，停止生成音频后才能提交。");
  const hasError = feedback?.kind === "error" && !submitting;
  return {
    visible: true,
    mode: "form",
    labels: displayLabels,
    statusText: submitting ? progressText : (hasError ? feedback.message : idleUploadText),
    statusClass: hasError ? "todo-detail-error todo-reading-audio-status" : "todo-detail-muted todo-reading-audio-status",
    showRefresh: Boolean(submitting),
    refreshDisabled: Boolean(refreshing),
    submitDisabled: Boolean(submitting || !recorderHasFile),
    submitLabel: submitting ? "已提交处理中" : displayLabels.submit,
    footerText: submitting
      ? `处理可能需要几十秒到数分钟；正在等待语音转写、阅读分析和${displayLabels.quiz}生成。`
      : `${displayLabels.recording}提交后，Home AI 会先转写语音，再生成分析和${displayLabels.quiz}；10 题全对后，本卡片才会完成。`,
  };
}
