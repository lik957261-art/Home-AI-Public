"use strict";

function learningGrowthLearnerWorkspaceId() {
  const selected = String(state.selectedWorkspaceId || "").trim();
  const authWorkspace = String(state.auth?.workspaceId || "").trim();
  const accessibleWorkspaceIds = Array.isArray(state.auth?.workspaceIds) && state.auth.workspaceIds.length
    ? state.auth.workspaceIds
    : (authWorkspace ? [authWorkspace] : []);
  if (state.auth && !state.auth.isOwner) {
    if (selected && accessibleWorkspaceIds.includes(selected)) return selected;
    return authWorkspace || selected;
  }
  const scoped = String(state.learningGrowthWorkspaceId || "").trim();
  if (state.auth?.isOwner && scoped && (!selected || selected === "owner")) return scoped;
  if (state.auth?.isOwner && (!selected || selected === "owner")) {
    return LEARNING_GROWTH_DEFAULT_LEARNER_WORKSPACE_ID;
  }
  return selected || authWorkspace || LEARNING_GROWTH_DEFAULT_LEARNER_WORKSPACE_ID;
}

function setLearningGrowthLearnerWorkspaceId(workspaceId) {
  const target = String(workspaceId || "").trim();
  if (!target || !state.auth?.isOwner) return;
  state.learningGrowthWorkspaceId = target;
}

function learningCoinStudentId() {
  return learningGrowthLearnerWorkspaceId();
}

function learningCoinRequestParams(options = {}) {
  const params = new URLSearchParams();
  params.set("workspaceId", learningGrowthLearnerWorkspaceId());
  params.set("studentId", learningCoinStudentId());
  params.set("limit", String(options.limit || 30));
  return params;
}

function learningCoinCurrentScopeKey() {
  return `${learningGrowthLearnerWorkspaceId()}:${learningCoinStudentId()}`;
}

function isLearningGrowthViewActive() {
  return state.viewMode === "learning";
}

function resetLearningCoinsState() {
  state.learningCoinRequestSeq += 1;
  state.learningGrowth = null; state.learningGrowthBoardLane = "";
  state.selectedLearningTaskCardId = ""; state.learningGrowthSettingsTaskId = "";
  state.learningGrowthSettingsOpen = false;
  state.learningCoins = null; state.learningCoinsError = "";
  state.learningParentReport = null; state.learningParentReportError = "";
  state.learningParentReportLoading = false; state.learningCoinScopeKey = learningCoinCurrentScopeKey();
}

function renderLearningCoinsView() {
  if (!isLearningGrowthViewActive()) return;
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  state.threads = [];
  const list = $("threadList");
  const growthUi = window.HermesLearningGrowthUi;
  if (!growthUi || typeof growthUi.renderLearningGrowthView !== "function") {
    if (list) list.innerHTML = `<div class="empty-state small">\u5b66\u4e60\u4efb\u52a1\u6a21\u5757\u6b63\u5728\u52a0\u8f7d\u3002</div>`;
    $("threadTitle").textContent = "\u4efb\u52a1";
    $("threadMeta").textContent = "";
    $("interruptRun").disabled = true;
    configureComposer({ enabled: false, placeholder: "\u5b66\u4e60\u4efb\u52a1" });
    $("conversation").innerHTML = `<div class="learning-growth-view"><div class="empty-state">\u5b66\u4e60\u4efb\u52a1\u6a21\u5757\u672a\u52a0\u8f7d\uff0c\u8bf7\u5237\u65b0\u5ba2\u6237\u7aef\u3002</div></div>`;
    return;
  }
  if (list) list.innerHTML = `<div class="empty-state small">\u5b66\u4e60\u4efb\u52a1\u5165\u53e3\u3002</div>`;
  $("threadTitle").textContent = "\u4efb\u52a1";
  $("threadMeta").textContent = "";
  $("interruptRun").disabled = true;
  configureComposer({ enabled: false, placeholder: "\u5b66\u4e60\u4efb\u52a1" });
  const overview = state.learningGrowth || {};
  $("conversation").innerHTML = growthUi.renderLearningGrowthView({
    overview,
    coins: state.learningCoins || overview.coins || {},
    loading: state.learningCoinsLoading,
    error: state.learningCoinsError,
    state,
    escapeHtml,
    formatTime,
    learnerId: learningCoinStudentId(),
    activeGrowthBoardLane: state.learningGrowthBoardLane,
    growthTaskUi: window.HermesLearningGrowthTaskUi,
    programUi: window.HermesLearningProgramUi,
    parentReport: state.learningParentReport,
    parentReportLoading: state.learningParentReportLoading,
    parentReportError: state.learningParentReportError,
    aiSummary: state.learningAiSummary, aiSummaryLoading: state.learningAiSummaryLoading, aiSummaryError: state.learningAiSummaryError,
  });
  wireLearningCoinsView();
  updateNavigationControls();
  ensureVerticalScrollAffordance();
  return;
}

function selectLearningGrowthTab(tabId) {
  const id = String(tabId || "").trim();
  const root = $("conversation");
  if (!root || !id) return;
  state.learningGrowthActiveTab = id;
  root.querySelectorAll("[data-learning-growth-tab]").forEach((button) => {
    const active = button.dataset.learningGrowthTab === id;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  root.querySelectorAll("[data-learning-growth-tab-panel]").forEach((panel) => {
    const active = panel.dataset.learningGrowthTabPanel === id;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}

function selectLearningGrowthBoardLane(laneId) {
  const root = $("conversation"), id = String(laneId || "").trim();
  if (!root || !id) return;
  state.learningGrowthBoardLane = id;
  root.querySelectorAll("[data-learning-growth-board-filter]").forEach((button) => {
    const active = button.dataset.learningGrowthBoardFilter === id;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  root.querySelectorAll("[data-learning-growth-board-panel]").forEach((panel) => {
    const active = panel.dataset.learningGrowthBoardPanel === id;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
  root.querySelectorAll("[data-growth-board-active-lane]").forEach((panel) => {
    panel.dataset.growthBoardActiveLane = id;
  });
}

function openLearningGrowthSettingsPage() {
  state.learningGrowthSettingsOpen = true; state.learningGrowthActiveTab = state.learningGrowthActiveTab || "overview";
  state.selectedLearningTaskCardId = ""; state.learningGrowthSettingsTaskId = "";
  renderLearningCoinsView();
}

function closeLearningGrowthSettingsPage() {
  state.learningGrowthSettingsOpen = false; state.learningGrowthSettingsTaskId = "";
  renderLearningCoinsView();
}

async function loadLearningCoins(options = {}) {
  const seq = ++state.learningCoinRequestSeq;
  const scopeKey = learningCoinCurrentScopeKey();
  if (state.learningCoinScopeKey !== scopeKey) {
    state.learningGrowth = null; state.learningCoins = null;
    state.learningCoinScopeKey = scopeKey;
  }
  state.learningCoinsLoading = true;
  state.learningCoinsError = "";
  renderLearningCoinsView();
  try {
    const result = await api(`/api/learning-growth/board?${learningCoinRequestParams(options)}`);
    if (seq !== state.learningCoinRequestSeq || scopeKey !== learningCoinCurrentScopeKey()) return;
    state.learningGrowth = result;
    state.learningCoins = result?.coins || result?.coinSummary || {};
  } catch (err) {
    if (seq !== state.learningCoinRequestSeq || scopeKey !== learningCoinCurrentScopeKey()) return;
    state.learningCoinsError = err.message || String(err);
  } finally {
    if (seq === state.learningCoinRequestSeq) {
      state.learningCoinsLoading = false;
      if (scopeKey === learningCoinCurrentScopeKey()) renderLearningCoinsView();
    }
  }
}

async function openLearningGrowthTask(taskCardId, workspaceId = "") {
  const id = String(taskCardId || "").trim();
  if (!id) return;
  const targetWorkspaceId = String(workspaceId || learningGrowthLearnerWorkspaceId()).trim() || learningGrowthLearnerWorkspaceId();
  setLearningGrowthLearnerWorkspaceId(targetWorkspaceId);
  if (!state.auth?.isOwner && state.workspaces.some((item) => item.id === targetWorkspaceId)) {
    state.selectedWorkspaceId = targetWorkspaceId;
    localStorage.setItem("hermesWebWorkspace", targetWorkspaceId);
    if ($("workspaceSelect")) $("workspaceSelect").value = targetWorkspaceId;
  }
  state.viewMode = "learning";
  localStorage.setItem("hermesWebViewMode", "learning");
  state.learningGrowthSettingsOpen = false;
  state.selectedLearningTaskCardId = id;
  state.selectedTodoId = "";
  state.todoRouteMissingTargetId = "";
  state.pendingReadingQuizTodoId = "";
  state.pendingAssessmentExamTodoId = "";
  await loadProjects();
  await loadLearningCoins({ limit: 80 });
  const boardCard = state.learningGrowth?.board?.cards?.find((card) => String(card.taskCardId || "") === id);
  if (boardCard?.laneId) state.learningGrowthBoardLane = boardCard.laneId;
}

async function openLearningKanbanCard(todoId, workspaceId = "") {
  const id = String(todoId || "").trim(); if (!id) return;
  const targetWorkspaceId = String(workspaceId || learningGrowthLearnerWorkspaceId()).trim() || learningGrowthLearnerWorkspaceId();
  setLearningGrowthLearnerWorkspaceId(targetWorkspaceId);
  if (!state.auth?.isOwner && state.workspaces.some((item) => item.id === targetWorkspaceId)) state.selectedWorkspaceId = targetWorkspaceId;
  if (!state.auth?.isOwner) {
    localStorage.setItem("hermesWebWorkspace", state.selectedWorkspaceId);
    if ($("workspaceSelect")) $("workspaceSelect").value = state.selectedWorkspaceId;
  }
  state.viewMode = "todos"; state.selectedTodoId = id; state.selectedLearningTaskCardId = ""; state.learningGrowthSettingsOpen = false; state.todoRouteMissingTargetId = "";
  localStorage.setItem("hermesWebViewMode", "todos"); await loadProjects(); await loadTodos({ skipCache: true, includeCompleted: true, freshServer: true, targetId: id, workspaceId: targetWorkspaceId });
}

async function requestLearningCoinRedemption(rewardId) {
  const body = {
    workspaceId: learningGrowthLearnerWorkspaceId(),
    studentId: learningCoinStudentId(),
    rewardId,
    idempotencyKey: `redeem:${learningCoinStudentId()}:${rewardId}:${Date.now()}`,
  };
  await api("/api/learning-coins/redemptions", { method: "POST", body: JSON.stringify(body) });
  showPushToast("兑换申请已提交", "success");
  await loadLearningCoins({ limit: 30 });
}

async function submitLearningTaskRewardPolicyForm(event, taskCardId) {
  event?.preventDefault?.();
  const id = String(taskCardId || "").trim();
  if (!id) return;
  const form = event?.target;
  const stateNode = document.querySelector(`[data-learning-task-reward-policy-state="${id.replace(/"/g, "\\\"")}"]`);
  const maxCoins = Number(form?.querySelector("input[name='maxCoins']")?.value || 0);
  if (!Number.isFinite(maxCoins) || maxCoins <= 0) return void (stateNode && (stateNode.textContent = "奖励上限必须是正整数。"));
  if (stateNode) stateNode.textContent = "正在保存奖励上限...";
  await api(`/api/learning/task-cards/${encodeURIComponent(id)}/reward-policy`, { method: "PATCH", body: JSON.stringify({ rewardCapCoins: Math.round(maxCoins) }) });
  if (stateNode) stateNode.textContent = "奖励上限已保存。";
  await loadLearningCoins({ limit: 80 });
}

function learningProgramFormBody() {
  const focusAreas = [...document.querySelectorAll("input[name='learningProgramFocus']:checked")]
    .map((input) => input.value)
    .filter(Boolean);
  const sourceBasisRefs = learningInputList("learningProgramSourceRefs");
  return {
    workspaceId: learningGrowthLearnerWorkspaceId(),
    learnerId: learningCoinStudentId(),
    learnerName: "凡凡",
    title: $("learningProgramTitle")?.value?.trim() || "",
    domain: $("learningProgramDomain")?.value || "english",
    focusAreas,
    goalSummary: $("learningProgramGoal")?.value?.trim() || "",
    requirements: $("learningProgramGoal")?.value?.trim() || "",
    startDate: $("learningProgramStartDate")?.value || "",
    durationDays: Number($("learningProgramDurationDays")?.value || 28),
    daysPerWeek: Number($("learningProgramDaysPerWeek")?.value || 5),
    minutesPerDay: Number($("learningProgramMinutesPerDay")?.value || 30),
    timeOfDay: $("learningProgramTimeOfDay")?.value || "19:30",
    sourceBasisRefs,
  };
}

function learningInputList(id) {
  return ($(`${id}`)?.value || "")
    .split(/\r?\n|[,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function learningSplitLines(id) {
  return ($(`${id}`)?.value || "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function learningCsvList(text) {
  return String(text || "")
    .split(/[,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function learningFoundationImportBody() {
  const scope = learningLearnerBody();
  const sources = learningSplitLines("learningFoundationImportSources").map((line) => {
    const parts = line.split("|").map((value) => value.trim());
    return Object.assign({}, scope, {
      sourceType: parts[0] || "manual_note",
      title: parts[1] || parts[0] || "",
      summary: parts[2] || parts[1] || parts[0] || "",
      tags: learningCsvList(parts[3] || ""),
      confidence: 0.7,
    });
  });
  const goals = learningSplitLines("learningFoundationImportGoals").map((line) => {
    const parts = line.split("|").map((value) => value.trim());
    return Object.assign({}, scope, {
      domain: parts[0] || "english",
      title: parts[1] || parts[0] || "",
      targetSummary: parts[2] || parts[1] || parts[0] || "",
      focusAreas: learningCsvList(parts[3] || ""),
      priority: 80,
    });
  });
  const profileSummary = $("learningFoundationImportProfile")?.value?.trim() || "";
  return Object.assign({}, scope, {
    sources,
    goals,
    profile: profileSummary ? { profileSummary, displayName: "Fanfan" } : null,
  });
}

function learningLearnerBody() {
  return {
    workspaceId: learningGrowthLearnerWorkspaceId(),
    learnerId: learningCoinStudentId(),
    learnerName: "Fanfan",
  };
}

function learningSourceFormBody() {
  return Object.assign(learningLearnerBody(), {
    sourceType: $("learningSourceType")?.value || "manual_note",
    title: $("learningSourceTitle")?.value?.trim() || "",
    summary: $("learningSourceSummary")?.value?.trim() || "",
    tags: learningInputList("learningSourceTags"),
    confidence: 0.75,
  });
}

function learningGoalFormBody() {
  return Object.assign(learningLearnerBody(), {
    title: $("learningGoalTitle")?.value?.trim() || "",
    targetSummary: $("learningGoalSummary")?.value?.trim() || "",
    domain: $("learningGoalDomain")?.value || "english",
    priority: Number($("learningGoalPriority")?.value || 80),
    targetDate: $("learningGoalTargetDate")?.value || "",
    focusAreas: learningInputList("learningGoalFocus"),
  });
}

async function submitLearningProgramForm(event) {
  event?.preventDefault?.();
  const body = learningProgramFormBody();
  if (!body.title || !body.goalSummary) {
    showPushToast("计划名称和目标要求不能为空", "error");
    return;
  }
  await api("/api/learning/programs", { method: "POST", body: JSON.stringify(body) });
  showPushToast("学习范围已保存", "success");
  await loadLearningCoins({ limit: 30 });
}

async function submitLearningSourceForm(event) {
  event?.preventDefault?.();
  const body = learningSourceFormBody();
  if (!body.title || !body.summary) {
    showPushToast("\u6765\u6e90\u540d\u79f0\u548c\u6458\u8981\u4e0d\u80fd\u4e3a\u7a7a", "error");
    return;
  }
  await api("/api/learning/sources", { method: "POST", body: JSON.stringify(body) });
  showPushToast("\u5b66\u4e60\u6765\u6e90\u5df2\u4fdd\u5b58", "success");
  await loadLearningCoins({ limit: 30 });
}

async function submitLearningGoalForm(event) {
  event?.preventDefault?.();
  const body = learningGoalFormBody();
  if (!body.title || !body.targetSummary) {
    showPushToast("\u76ee\u6807\u540d\u79f0\u548c\u6458\u8981\u4e0d\u80fd\u4e3a\u7a7a", "error");
    return;
  }
  await api("/api/learning/goals", { method: "POST", body: JSON.stringify(body) });
  showPushToast("\u5b66\u4e60\u76ee\u6807\u5df2\u4fdd\u5b58", "success");
  await loadLearningCoins({ limit: 30 });
}

async function submitLearningFoundationImportForm(event) {
  event?.preventDefault?.();
  const body = learningFoundationImportBody();
  const hasProfile = Boolean(body.profile?.profileSummary);
  if (!body.sources.length && !body.goals.length && !hasProfile) {
    showPushToast("\u81f3\u5c11\u586b\u5199\u4e00\u6761\u57fa\u7840\u6458\u8981", "error");
    return;
  }
  await api("/api/learning/foundation-import", { method: "POST", body: JSON.stringify(body) });
  showPushToast("\u5b66\u4e60\u57fa\u7840\u6458\u8981\u5df2\u5bfc\u5165", "success");
  await loadLearningCoins({ limit: 30 });
}

async function importLearningSourceDirectory(bindingId) {
  const body = Object.assign(learningLearnerBody(), { bindingId });
  await api("/api/learning/source-directory/import", { method: "POST", body: JSON.stringify(body) });
  showPushToast("\u5b66\u4e60\u8d44\u6599\u6e05\u6d17\u6458\u8981\u5df2\u5bfc\u5165", "success");
  await loadLearningCoins({ limit: 30 });
}

async function bootstrapLearningSourceDirectory(bindingId) {
  const body = Object.assign(learningLearnerBody(), { bindingId });
  await api("/api/learning/source-directory/bootstrap", { method: "POST", body: JSON.stringify(body) });
  showPushToast("\u5b66\u4e60\u76ee\u6807\u548c\u8ba1\u5212\u8303\u56f4\u5df2\u521d\u59cb\u5316", "success");
  await loadLearningCoins({ limit: 30 });
}

async function rebuildLearningProfile() {
  await api(`/api/learning/profile/rebuild?${learningCoinRequestParams({ limit: 30 })}`, {
    method: "POST",
    body: JSON.stringify(learningLearnerBody()),
  });
  showPushToast("\u5b66\u4e60\u753b\u50cf\u5df2\u91cd\u5efa", "success");
  await loadLearningCoins({ limit: 30 });
}

async function draftLearningProgram(programId) {
  await api(`/api/learning/programs/${encodeURIComponent(programId)}/draft-plan`, { method: "POST", body: JSON.stringify({}) });
  showPushToast("学习周计划已生成", "success");
  await loadLearningCoins({ limit: 30 });
}

async function rebuildLearningProgramDraft(programId) {
  await api(`/api/learning/programs/${encodeURIComponent(programId)}/rebuild-draft-plan`, { method: "POST", body: JSON.stringify({}) });
  showPushToast("旧周计划已作废并重新生成", "success");
  await loadLearningCoins({ limit: 30 });
}

async function publishLearningProgram(programId) {
  await api(`/api/learning/programs/${encodeURIComponent(programId)}/publish`, { method: "POST", body: JSON.stringify({}) });
  showPushToast("学习任务已下发", "success");
  await loadLearningCoins({ limit: 30 });
}

async function loadLearningParentReport() {
  state.learningParentReportLoading = true;
  state.learningParentReportError = "";
  renderLearningCoinsView();
  try {
    state.learningParentReport = await api(`/api/learning/reports/parent?${learningCoinRequestParams({ limit: 100 })}`);
    showPushToast("\u5bb6\u957f\u5468\u62a5\u5df2\u5237\u65b0", "success");
  } catch (err) {
    state.learningParentReportError = err.message || String(err);
    showError(err);
  } finally {
    state.learningParentReportLoading = false;
    renderLearningCoinsView();
  }
}

async function decideLearningReview(reviewId, decision) {
  await api(`/api/learning/review-queue/${encodeURIComponent(reviewId)}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
  showPushToast("审核状态已更新", "success");
  await loadLearningCoins({ limit: 30 });
}

async function decideLearningParentReviewRequest(reviewRequestId, decision) {
  await api(`/api/learning/parent-review-requests/${encodeURIComponent(reviewRequestId)}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
  showPushToast("家长复核状态已更新", "success");
  await loadLearningCoins({ limit: 30 });
}

async function settleLearningEvaluationReward(evaluationId) {
  if (!evaluationId) return;
  await api(`/api/learning/evaluations/${encodeURIComponent(evaluationId)}/reward-settlement`, {
    method: "POST",
    body: JSON.stringify({ reason: "owner_learning_growth_settlement" }),
  });
  showPushToast("\u5b66\u4e60\u5956\u52b1\u7ed3\u7b97\u5df2\u5904\u7406", "success");
  await loadLearningCoins({ limit: 30 });
}

async function submitLearningRewardForm(event) {
  event?.preventDefault?.();
  const title = $("learningRewardTitle")?.value?.trim() || "";
  const coinCost = Number($("learningRewardCost")?.value || 0);
  const rmbValue = $("learningRewardRmb")?.value;
  const description = $("learningRewardDescription")?.value?.trim() || "";
  if (!title || !coinCost) {
    showPushToast("奖励名称和金币数不能为空", "error");
    return;
  }
  const body = {
    title,
    coinCost,
    description,
    rmbCents: rmbValue === "" ? null : Math.round(Number(rmbValue) * 100),
  };
  await api("/api/learning-coins/rewards", { method: "POST", body: JSON.stringify(body) });
  showPushToast("奖励已保存", "success");
  await loadLearningCoins({ limit: 30 });
}

async function startLearningTaskSession(taskCardId) {
  if (!taskCardId) return;
  await api(`/api/learning/task-cards/${encodeURIComponent(taskCardId)}/sessions`, {
    method: "POST",
    body: JSON.stringify(Object.assign(learningLearnerBody(), {
      summary: "\u4ece\u6210\u957f\u9875\u5f00\u59cb\u5b66\u4e60\u4efb\u52a1",
    })),
  });
  showPushToast("\u5b66\u4e60\u4efb\u52a1\u5df2\u5f00\u59cb", "success");
  await loadLearningCoins({ limit: 30 });
}

async function advanceLearningSession(sessionId) {
  if (!sessionId) return;
  await api(`/api/learning/sessions/${encodeURIComponent(sessionId)}/advance`, {
    method: "POST",
    body: JSON.stringify({
      summary: "\u4ece\u6210\u957f\u9875\u63a8\u8fdb\u4e92\u52a8\u9636\u6bb5",
    }),
  });
  showPushToast("\u5b66\u4e60\u9636\u6bb5\u5df2\u63a8\u8fdb", "success");
  await loadLearningCoins({ limit: 30 });
}

async function submitLearningEvaluationForm(event, sessionId) {
  event?.preventDefault?.();
  if (!sessionId) return;
  const form = event?.target;
  const formData = new FormData(form);
  const score = Number(formData.get("score") || 0);
  const summary = String(formData.get("summary") || "").trim();
  if (!summary) {
    showPushToast("\u8bc4\u4ef7\u6458\u8981\u4e0d\u80fd\u4e3a\u7a7a", "error");
    return;
  }
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    showPushToast("\u5f97\u5206\u9700\u8981\u5728 0-100 \u4e4b\u95f4", "error");
    return;
  }
  await api(`/api/learning/sessions/${encodeURIComponent(sessionId)}/evaluations`, {
    method: "POST",
    body: JSON.stringify({
      score,
      summary,
      confidence: 0.72,
      verificationMethod: "english_rubric_evidence_check",
      verificationSummary: summary,
    }),
  });
  showPushToast("\u5b66\u4e60\u8bc4\u4ef7\u5df2\u8bb0\u5f55", "success");
  await loadLearningCoins({ limit: 30 });
}

function wireLearningCoinsView() {
  const root = $("conversation");
  if (typeof wireDirectoryProjectLinks === "function") wireDirectoryProjectLinks(root);
  if (root && !root.dataset.learningGrowthOpenDelegated) { root.dataset.learningGrowthOpenDelegated = "1"; root.addEventListener("click", (event) => {
    const growth = event.target?.closest?.("[data-learning-open-growth-task]"), kanban = event.target?.closest?.("[data-learning-open-kanban-card]");
    if (event.target?.closest?.("[data-directory-path-open]")) return;
    if (growth && root.contains(growth)) { event.preventDefault(); event.stopPropagation(); openLearningGrowthTask(growth.dataset.learningOpenGrowthTask, growth.dataset.workspaceId).catch(showError); return; }
    if (kanban && root.contains(kanban)) { event.preventDefault(); event.stopPropagation(); openLearningKanbanCard(kanban.dataset.learningOpenKanbanCard, kanban.dataset.workspaceId).catch(showError); }
  }); }
  $("conversation")?.querySelectorAll("[data-learning-growth-tab]").forEach((button) => {
    button.addEventListener("click", () => selectLearningGrowthTab(button.dataset.learningGrowthTab));
  });
  $("conversation")?.querySelector("[data-learning-growth-close-settings]")?.addEventListener("click", closeLearningGrowthSettingsPage);
  $("conversation")?.querySelectorAll("[data-learning-growth-board-filter]").forEach((button) => {
    button.addEventListener("click", () => selectLearningGrowthBoardLane(button.dataset.learningGrowthBoardFilter));
  });
  $("conversation")?.querySelector("[data-learning-close-growth-task]")?.addEventListener("click", () => { state.selectedLearningTaskCardId = ""; state.learningGrowthSettingsOpen = false; renderLearningCoinsView(); });
  $("conversation")?.querySelector("[data-learning-settings-task-back]")?.addEventListener("click", () => window.HermesLearningGrowthSettingsController?.closeSettingsTask?.());
  window.HermesLearningGrowthSettingsController?.wireSettingsTaskSwipe?.($("conversation"));
  window.HermesLearningGrowthAiController?.wireLearningGrowthAi?.();
  $("learningProgramForm")?.addEventListener("submit", (event) => {
    submitLearningProgramForm(event).catch(showError);
  });
  $("learningSourceForm")?.addEventListener("submit", (event) => {
    submitLearningSourceForm(event).catch(showError);
  });
  $("learningGoalForm")?.addEventListener("submit", (event) => {
    submitLearningGoalForm(event).catch(showError);
  });
  $("learningFoundationImportForm")?.addEventListener("submit", (event) => {
    submitLearningFoundationImportForm(event).catch(showError);
  });
  $("conversation")?.querySelectorAll("[data-learning-source-directory-import]").forEach((button) => {
    button.addEventListener("click", () => importLearningSourceDirectory(button.dataset.learningSourceDirectoryImport).catch(showError));
  });
  $("conversation")?.querySelectorAll("[data-learning-source-directory-bootstrap]").forEach((button) => {
    button.addEventListener("click", () => bootstrapLearningSourceDirectory(button.dataset.learningSourceDirectoryBootstrap).catch(showError));
  });
  $("conversation")?.querySelector("[data-learning-profile-rebuild]")?.addEventListener("click", () => {
    rebuildLearningProfile().catch(showError);
  });
  $("conversation")?.querySelector("[data-learning-parent-report-refresh]")?.addEventListener("click", () => {
    loadLearningParentReport().catch(showError);
  });
  $("conversation")?.querySelectorAll("[data-learning-program-draft-action]").forEach((button) => {
    button.addEventListener("click", () => draftLearningProgram(button.dataset.learningProgramDraftAction).catch(showError));
  });
  $("conversation")?.querySelectorAll("[data-learning-program-rebuild-draft]").forEach((button) => {
    button.addEventListener("click", () => rebuildLearningProgramDraft(button.dataset.learningProgramRebuildDraft).catch(showError));
  });
  $("conversation")?.querySelectorAll("[data-learning-program-publish]").forEach((button) => {
    button.addEventListener("click", () => publishLearningProgram(button.dataset.learningProgramPublish).catch(showError));
  });
  $("conversation")?.querySelectorAll("[data-learning-review-decision]").forEach((button) => {
    button.addEventListener("click", () => decideLearningReview(button.dataset.learningReviewDecision, button.dataset.decision).catch(showError));
  });
  $("conversation")?.querySelectorAll("[data-learning-parent-review-decision]").forEach((button) => {
    button.addEventListener("click", () => decideLearningParentReviewRequest(button.dataset.learningParentReviewDecision, button.dataset.decision).catch(showError));
  });
  $("conversation")?.querySelectorAll("[data-learning-evaluation-settle]").forEach((button) => {
    button.addEventListener("click", () => settleLearningEvaluationReward(button.dataset.learningEvaluationSettle).catch(showError));
  });
  $("conversation")?.querySelectorAll("[data-learning-task-start]").forEach((button) => {
    button.addEventListener("click", () => startLearningTaskSession(button.dataset.learningTaskStart).catch(showError));
  });
  $("conversation")?.querySelectorAll("[data-learning-native-growth-submission-form]").forEach((form) => {
    const taskCardId = form.dataset.taskCardId || form.dataset.learningNativeGrowthSubmissionForm;
    restoreNativeGrowthSubmissionDraft(form, taskCardId);
    updateNativeGrowthSubmissionCount(form);
    form.addEventListener("submit", (event) => {
      submitNativeGrowthTask(event, taskCardId);
    });
    form.querySelector("[data-learning-native-growth-submission-input]")?.addEventListener("input", () => persistNativeGrowthSubmissionDraft(form, taskCardId));
    form.querySelectorAll("[data-learning-native-growth-question-choice]").forEach((input) => {
      input.addEventListener("change", () => persistNativeGrowthSubmissionDraft(form, taskCardId));
    });
    form.querySelectorAll("[data-learning-native-growth-question-reason],[data-learning-native-growth-question-response]").forEach((input) => {
      input.addEventListener("input", () => persistNativeGrowthSubmissionDraft(form, taskCardId));
      input.addEventListener("change", () => persistNativeGrowthSubmissionDraft(form, taskCardId));
    });
  });
  $("conversation")?.querySelectorAll("[data-learning-native-growth-record-start]").forEach((button) => {
    button.addEventListener("click", () => {
      if (typeof startLearningNativeGrowthSubmissionRecording === "function") {
        startLearningNativeGrowthSubmissionRecording(button.dataset.learningNativeGrowthRecordStart);
      }
    });
  });
  $("conversation")?.querySelectorAll("[data-learning-native-growth-record-stop]").forEach((button) => {
    button.addEventListener("click", () => {
      if (typeof stopLearningNativeGrowthSubmissionRecording === "function") {
        stopLearningNativeGrowthSubmissionRecording(button.dataset.learningNativeGrowthRecordStop);
      }
    });
  });
  $("conversation")?.querySelectorAll("[data-learning-native-growth-record-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      if (typeof cancelLearningNativeGrowthSubmissionRecording === "function") {
        cancelLearningNativeGrowthSubmissionRecording(button.dataset.learningNativeGrowthRecordCancel);
      }
    });
  });
  $("conversation")?.querySelectorAll("[data-learning-native-growth-reflection-record-start]").forEach((button) => {
    button.addEventListener("click", () => {
      if (typeof startLearningNativeGrowthSubmissionRecording === "function") {
        startLearningNativeGrowthSubmissionRecording(button.dataset.learningNativeGrowthReflectionRecordStart);
      }
    });
  });
  $("conversation")?.querySelectorAll("[data-learning-native-growth-reflection-record-stop]").forEach((button) => {
    button.addEventListener("click", () => {
      if (typeof stopLearningNativeGrowthSubmissionRecording === "function") {
        stopLearningNativeGrowthSubmissionRecording(button.dataset.learningNativeGrowthReflectionRecordStop);
      }
    });
  });
  $("conversation")?.querySelectorAll("[data-learning-native-growth-reflection-record-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      if (typeof cancelLearningNativeGrowthSubmissionRecording === "function") {
        cancelLearningNativeGrowthSubmissionRecording(button.dataset.learningNativeGrowthReflectionRecordCancel);
      }
    });
  });
  $("conversation")?.querySelectorAll("[data-learning-native-growth-reflection-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      submitNativeGrowthReflection(event, form.dataset.taskCardId || form.dataset.learningNativeGrowthReflectionForm);
    });
  });
  window.HermesLearningGrowthRewardController?.wireLearningGrowthRewardPolicy?.();
  $("conversation")?.querySelectorAll("[data-learning-open-settings-task]").forEach((button) => {
    button.addEventListener("click", () => window.HermesLearningGrowthSettingsController?.openSettingsTask?.(button.dataset.learningOpenSettingsTask));
  });
  $("conversation")?.querySelectorAll("[data-learning-session-advance]").forEach((button) => {
    button.addEventListener("click", () => advanceLearningSession(button.dataset.learningSessionAdvance).catch(showError));
  });
  $("conversation")?.querySelectorAll("[data-learning-evaluation-form]").forEach((form) => {
    form.addEventListener("submit", (event) => submitLearningEvaluationForm(event, form.dataset.learningEvaluationForm).catch(showError));
  });
  $("conversation")?.querySelectorAll("[data-learning-redeem]").forEach((button) => {
    button.addEventListener("click", () => requestLearningCoinRedemption(button.dataset.learningRedeem).catch(showError));
  });
  $("learningRewardForm")?.addEventListener("submit", (event) => {
    submitLearningRewardForm(event).catch(showError);
  });
}
