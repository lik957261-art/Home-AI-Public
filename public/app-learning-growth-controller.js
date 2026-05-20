"use strict";


function learningGrowthLearnerWorkspaceId() {
  const selected = String(state.selectedWorkspaceId || "").trim();
  const authWorkspace = String(state.auth?.workspaceId || "").trim();
  if (state.auth && !state.auth.isOwner) return authWorkspace || selected;
  if (state.auth?.isOwner && (!selected || selected === "owner")) {
    return LEARNING_GROWTH_DEFAULT_LEARNER_WORKSPACE_ID;
  }
  return selected || authWorkspace || LEARNING_GROWTH_DEFAULT_LEARNER_WORKSPACE_ID;
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

function resetLearningCoinsState() {
  state.learningCoinRequestSeq += 1;
  state.learningGrowth = null;
  state.learningGrowthBoardLane = "";
  state.learningCoins = null;
  state.learningCoinsError = "";
  state.learningParentReport = null;
  state.learningParentReportError = "";
  state.learningParentReportLoading = false;
  state.learningCoinScopeKey = learningCoinCurrentScopeKey();
}

function renderLearningCoinsView() {
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  state.threads = [];
  const list = $("threadList");
  const growthUi = window.HermesLearningGrowthUi;
  if (!growthUi || typeof growthUi.renderLearningGrowthView !== "function") {
    if (list) list.innerHTML = `<div class="empty-state small">凡凡成长系统模块正在加载。</div>`;
    $("threadTitle").textContent = "凡凡成长";
    $("threadMeta").textContent = "Fanfan Growth";
    $("interruptRun").disabled = true;
    configureComposer({ enabled: false, placeholder: "凡凡成长系统" });
    $("conversation").innerHTML = `<div class="learning-growth-view"><div class="empty-state">成长系统前端模块未加载，请刷新客户端。</div></div>`;
    return;
  }
  if (list) list.innerHTML = `<div class="empty-state small">凡凡成长系统入口。金币已经收敛为学习激励子模块。</div>`;
  $("threadTitle").textContent = "凡凡成长";
  $("threadMeta").textContent = "Fanfan Growth";
  $("interruptRun").disabled = true;
  configureComposer({ enabled: false, placeholder: "凡凡成长系统" });
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
      renderLearningCoinsView();
    }
  }
}

async function openLearningGrowthTask(taskCardId, workspaceId = "") {
  const id = String(taskCardId || "").trim();
  if (!id) return;
  const targetWorkspaceId = String(workspaceId || learningGrowthLearnerWorkspaceId()).trim() || learningGrowthLearnerWorkspaceId();
  if (state.workspaces.some((item) => item.id === targetWorkspaceId)) {
    state.selectedWorkspaceId = targetWorkspaceId;
    localStorage.setItem("hermesWebWorkspace", targetWorkspaceId);
    if ($("workspaceSelect")) $("workspaceSelect").value = targetWorkspaceId;
  }
  state.viewMode = "learning";
  localStorage.setItem("hermesWebViewMode", "learning");
  state.selectedLearningTaskCardId = id;
  state.selectedTodoId = "";
  state.todoRouteMissingTargetId = "";
  state.pendingReadingQuizTodoId = "";
  state.pendingAssessmentExamTodoId = "";
  await loadProjects();
  await loadLearningCoins({ limit: 80 });
  const boardCard = state.learningGrowth?.board?.cards?.find((card) => String(card.taskCardId || "") === id);
  if (boardCard?.laneId && boardCard.laneId !== state.learningGrowthBoardLane) {
    state.learningGrowthBoardLane = boardCard.laneId; renderLearningCoinsView();
  }
  const root = $("conversation");
  const target = [...(root?.querySelectorAll("[data-learning-executable-task-id]") || [])]
    .find((item) => item.dataset.learningExecutableTaskId === id);
  target?.scrollIntoView({ block: "center", behavior: "smooth" });
}

async function openLearningKanbanCard(todoId, workspaceId = "") {
  await openLearningGrowthTask(todoId, workspaceId);
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

function learningNativeGrowthSubmissionStats(text) {
  const value = String(text || "").trim();
  const words = value.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) || [];
  return {
    words: words.length,
    chars: value.replace(/\s+/g, "").length,
  };
}

function nativeGrowthRequirementText(form, stats = null) {
  const minWords = Number(form?.dataset?.minWords || 0) || 0;
  const minChars = Number(form?.dataset?.minChars || 0) || 0;
  if (window.HermesLearningGrowthTaskUi?.submissionRequirementLabel) {
    return window.HermesLearningGrowthTaskUi.submissionRequirementLabel({ minWords, minChars }, stats);
  }
  if (!stats) return `至少 ${minWords} 个英文词 / ${minChars} 个有效字符`;
  const missingWords = Math.max(0, minWords - Number(stats.words || 0));
  const missingChars = Math.max(0, minChars - Number(stats.chars || 0));
  if (!missingWords && !missingChars) return `已达标：当前 ${stats.words} 词 / ${stats.chars} 字符。`;
  return `未达标：还差 ${missingWords} 个英文词 / ${missingChars} 个有效字符；当前 ${stats.words} 词 / ${stats.chars} 字符。`;
}

function updateNativeGrowthSubmissionCount(form) {
  if (!form) return;
  const input = form.querySelector("[data-learning-native-growth-submission-input]");
  const count = form.querySelector("[data-learning-native-growth-submission-count]");
  if (!input || !count) return;
  const stats = learningNativeGrowthSubmissionStats(input.value);
  const minWords = Number(form.dataset.minWords || 0) || 0;
  const minChars = Number(form.dataset.minChars || 0) || 0;
  const ready = (!minWords || stats.words >= minWords) && (!minChars || stats.chars >= minChars);
  count.textContent = nativeGrowthRequirementText(form, stats);
  count.classList.toggle("is-ready", ready);
  count.classList.toggle("is-short", !ready);
}

async function submitNativeGrowthTask(event, taskCardId) {
  event?.preventDefault?.();
  const form = event?.target;
  if (!form || !taskCardId) return;
  const input = form.querySelector("[data-learning-native-growth-submission-input]");
  const stateNode = form.querySelector("[data-learning-native-growth-submission-state]");
  const button = form.querySelector("[data-learning-submit-native-growth]");
  const text = String(input?.value || "").trim();
  updateNativeGrowthSubmissionCount(form);
  const stats = learningNativeGrowthSubmissionStats(text);
  const minWords = Number(form.dataset.minWords || 0) || 0;
  const minChars = Number(form.dataset.minChars || 0) || 0;
  if ((!text) || (minWords && stats.words < minWords) || (minChars && stats.chars < minChars)) {
    if (stateNode) stateNode.textContent = nativeGrowthRequirementText(form, stats);
    showPushToast("作答长度还不够，先补到要求再提交。", "error");
    return;
  }
  if (button) button.disabled = true;
  if (stateNode) stateNode.textContent = "已提交，正在等待 AI 批改和生成反馈...";
  try {
    const response = await api(`/api/learning/task-cards/${encodeURIComponent(taskCardId)}/growth-submission`, {
      method: "POST",
      body: JSON.stringify(Object.assign(learningLearnerBody(), { text })),
    });
    if (!response?.ok) throw new Error(response?.error || "Growth task submission failed");
    if (stateNode) stateNode.textContent = response.evaluation?.status === "reflection_required"
      ? "AI 批改完成，下一步需要录音复盘。"
      : "AI 批改完成，页面正在刷新。";
    showPushToast("AI 批改已完成", "success");
    await loadLearningCoins({ limit: 30 });
  } catch (err) {
    if (stateNode) stateNode.textContent = err.message || String(err);
    showError(err);
  } finally {
    if (button) button.disabled = false;
  }
}

async function submitNativeGrowthReflection(event, taskCardId) {
  event?.preventDefault?.();
  const form = event?.target;
  if (!form || !taskCardId) return;
  const input = form.querySelector("[data-learning-native-growth-reflection-input]");
  const stateNode = form.querySelector("[data-learning-native-growth-reflection-state]");
  const button = form.querySelector("[data-learning-submit-native-growth-reflection]");
  const text = String(input?.value || "").trim();
  const stats = learningNativeGrowthSubmissionStats(text);
  if (!text || stats.chars < 60) {
    if (stateNode) stateNode.textContent = "\u590d\u76d8\u5185\u5bb9\u8fd8\u4e0d\u591f\uff0c\u8bf4\u6e05\u9519\u8bef\u3001\u539f\u56e0\u548c\u4e0b\u6b21\u6539\u8fdb\u65b9\u5411\u540e\u518d\u63d0\u4ea4\u3002";
    showPushToast("\u590d\u76d8\u5185\u5bb9\u8fd8\u4e0d\u591f", "error");
    return;
  }
  if (button) button.disabled = true;
  if (stateNode) stateNode.textContent = "\u590d\u76d8\u5df2\u63d0\u4ea4\uff0c\u6b63\u5728\u7b49\u5f85 AI \u5224\u65ad\u7406\u89e3\u60c5\u51b5...";
  try {
    const response = await api(`/api/learning/task-cards/${encodeURIComponent(taskCardId)}/growth-reflection`, {
      method: "POST",
      body: JSON.stringify(Object.assign(learningLearnerBody(), { text })),
    });
    if (!response?.ok) throw new Error(response?.error || "Growth reflection submission failed");
    if (stateNode) stateNode.textContent = response.status === "completed"
      ? "\u590d\u76d8\u5df2\u901a\u8fc7\uff0c\u4efb\u52a1\u5df2\u5b8c\u6210\u3002"
      : "\u590d\u76d8\u5df2\u8bb0\u5f55\uff0c\u8bf7\u6309 AI \u53cd\u9988\u7ee7\u7eed\u8865\u5145\u3002";
    showPushToast(response.status === "completed" ? "\u590d\u76d8\u5df2\u901a\u8fc7" : "\u590d\u76d8\u5df2\u8bb0\u5f55", "success");
    await loadLearningCoins({ limit: 30 });
  } catch (err) {
    if (stateNode) stateNode.textContent = err.message || String(err);
    showError(err);
  } finally {
    if (button) button.disabled = false;
  }
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
  $("conversation")?.querySelectorAll("[data-learning-growth-tab]").forEach((button) => {
    button.addEventListener("click", () => selectLearningGrowthTab(button.dataset.learningGrowthTab));
  });
  $("conversation")?.querySelectorAll("[data-learning-growth-board-filter]").forEach((button) => {
    button.addEventListener("click", () => selectLearningGrowthBoardLane(button.dataset.learningGrowthBoardFilter));
  });
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
    updateNativeGrowthSubmissionCount(form);
    form.addEventListener("submit", (event) => {
      submitNativeGrowthTask(event, form.dataset.taskCardId || form.dataset.learningNativeGrowthSubmissionForm);
    });
    form.querySelector("[data-learning-native-growth-submission-input]")?.addEventListener("input", () => updateNativeGrowthSubmissionCount(form));
  });
  $("conversation")?.querySelectorAll("[data-learning-native-growth-reflection-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      submitNativeGrowthReflection(event, form.dataset.taskCardId || form.dataset.learningNativeGrowthReflectionForm);
    });
  });
  $("conversation")?.querySelectorAll("[data-learning-open-growth-task]").forEach((button) => {
    button.addEventListener("click", () => openLearningGrowthTask(
      button.dataset.learningOpenGrowthTask,
      button.dataset.workspaceId,
    ).catch(showError));
  });
  $("conversation")?.querySelectorAll("[data-learning-open-kanban-card]").forEach((button) => {
    button.addEventListener("click", () => openLearningKanbanCard(
      button.dataset.learningOpenKanbanCard,
      button.dataset.workspaceId,
    ).catch(showError));
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
