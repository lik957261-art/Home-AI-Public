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
    const result = await api(`/api/learning-growth/overview?${learningCoinRequestParams(options)}`);
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

function wireLearningCoinsView() {
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
  $("conversation")?.querySelector("[data-learning-profile-rebuild]")?.addEventListener("click", () => {
    rebuildLearningProfile().catch(showError);
  });
  $("conversation")?.querySelector("[data-learning-parent-report-refresh]")?.addEventListener("click", () => {
    loadLearningParentReport().catch(showError);
  });
  $("conversation")?.querySelectorAll("[data-learning-program-draft-action]").forEach((button) => {
    button.addEventListener("click", () => draftLearningProgram(button.dataset.learningProgramDraftAction).catch(showError));
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
  $("conversation")?.querySelectorAll("[data-learning-redeem]").forEach((button) => {
    button.addEventListener("click", () => requestLearningCoinRedemption(button.dataset.learningRedeem).catch(showError));
  });
  $("learningRewardForm")?.addEventListener("submit", (event) => {
    submitLearningRewardForm(event).catch(showError);
  });
}

function automationRequestParams(options = {}) {
  const params = new URLSearchParams();
  params.set("workspaceId", state.selectedWorkspaceId || "owner");
  params.set("includeDisabled", "1");
  params.set("limit", "200");
  const search = currentSearchText();
  if (search) params.set("search", search);
  if (options.refresh) params.set("refresh", "1");
  return params;
}

function automationRequestCacheKey(params) {
  const copy = new URLSearchParams(params);
  copy.delete("refresh");
  copy.delete("fresh");
  return copy.toString();
}

async function loadAutomations(options = {}) {
  const params = automationRequestParams(options);
  const cacheKey = automationRequestCacheKey(params);
  const cacheFresh = state.automationCacheKey === cacheKey
    && state.automationLastLoadedAt
    && Date.now() - state.automationLastLoadedAt < 10000;
  if (!options.refresh && cacheFresh) {
    renderAutomationView();
    setComposerEnabled(false);
    return;
  }
  const seq = ++state.automationRequestSeq;
  state.automationLoading = true;
  if (state.automations.length) {
    $("connectionState").textContent = "刷新 CRON";
  }
  renderAutomationView();
  let result;
  try {
    result = await api(`/api/automations?${params}`);
  } catch (err) {
    if (seq === state.automationRequestSeq) {
      state.automationLoading = false;
      renderAutomationView();
    }
    throw err;
  }
  if (seq !== state.automationRequestSeq) return;
  state.automations = result.data || [];
  state.automationSource = Object.assign({}, result.source || {}, { warning: result.warning || "" });
  state.automationCacheKey = cacheKey;
  state.automationLastLoadedAt = Date.now();
  state.automationLoading = false;
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  state.threads = [];
  if (state.selectedAutomationId && !state.automations.some((job) => job.id === state.selectedAutomationId)) {
    state.selectedAutomationId = "";
    state.automationEditOpen = false;
    state.automationEditJobId = "";
    state.automationOutputHistoryOpen = false;
  }
  updateSearchButton();
  renderAutomationView();
  setComposerEnabled(false);
  $("connectionState").textContent = "Hermes OK";
}

function automationStatusLabel(job) {
  const status = String(job?.status || "");
  if (status === "error") return "error";
  if (status === "paused") return "paused";
  if (status === "completed") return "done";
  return "scheduled";
}

function automationStatusDotTone(job, status = automationStatusLabel(job)) {
  const current = String(status || "").toLowerCase();
  const last = String(job?.lastStatus || job?.last_status || "").toLowerCase();
  if (
    current === "error" ||
    last === "error" ||
    last === "failed" ||
    last === "failure" ||
    job?.lastError ||
    job?.lastDeliveryError
  ) {
    return "error";
  }
  const normalCurrent = ["scheduled", "running", "ok", "done", "completed", "success", "succeeded"];
  const normalLast = ["", "ok", "done", "completed", "success", "succeeded"];
  if (normalCurrent.includes(current) && normalLast.includes(last)) return "ok";
  return "info";
}

function renderAutomationStatusSummary(job, status = automationStatusLabel(job)) {
  const tone = automationStatusDotTone(job, status);
  const lastRun = formatTime(job?.lastRunAt) || "--";
  const label = `${status} | ${lastRun}`;
  return `<span class="automation-state automation-state-summary ${escapeHtml(tone)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
    <span class="automation-state-time">${escapeHtml(lastRun)}</span>
    <span class="automation-state-dot ${escapeHtml(tone)}" aria-hidden="true"></span>
  </span>`;
}

function currentAutomation() {
  return state.automations.find((job) => job.id === state.selectedAutomationId) || null;
}

function automationTitle(job) {
  return compactDisplayText(job?.name || job?.id || "Cron job", 120);
}

function automationGoalLine(job, max = 190) {
  const goal = compactDisplayText(
    job?.promptPreview || job?.goal || job?.description || job?.name || "",
    max,
  );
  return goal || automationTitle(job);
}

function automationScheduleLine(job) {
  const schedule = job?.schedule || "unscheduled";
  const repeat = job?.repeat || "";
  return repeat ? `${schedule} | ${repeat}` : schedule;
}

function automationTimeParts(job) {
  return [
    job?.lastRunAt ? ["上次执行", formatTime(job.lastRunAt)] : null,
    job?.nextRunAt ? ["下次执行", formatTime(job.nextRunAt)] : null,
  ].filter(Boolean);
}

function automationTimeLine(job) {
  const parts = automationTimeParts(job);
  return parts.length ? parts.map(([label, value]) => `${label} ${value}`).join(" | ") : "暂无执行时间";
}

function automationSourceLine() {
  const source = state.automationSource || {};
  if (source.available === false) return "Hermes CRON source unavailable";
  const count = Number(source.jobCount ?? state.automations.length);
  return `Hermes CRON | ${count} job${count === 1 ? "" : "s"}`;
}

function automationLatestDocument(job) {
  const docs = Array.isArray(job?.outputDocuments) ? job.outputDocuments : [];
  return docs[0] || null;
}

function automationOutputHref(doc) {
  try {
    const url = new URL(doc?.url || "#", window.location.origin);
    if (url.pathname === "/api/automations/output" || url.pathname === "/api/automations/deliverable") {
      url.searchParams.set("workspaceId", state.selectedWorkspaceId || "owner");
    }
    return artifactHref(Object.assign({}, doc, { url: `${url.pathname}${url.search}` }));
  } catch (_) {
    return "#";
  }
}

function renderAutomationDocumentPreview(doc, options = {}) {
  if (!doc) return "";
  const kind = artifactKind(doc);
  const name = doc.name || "document";
  const meta = [formatBytes(doc.size), formatTime(doc.updatedAt)].filter(Boolean).join(" | ");
  const classes = [
    "automation-doc-preview",
    `doc-${kind}`,
    options.compact ? "compact" : "",
    options.history ? "history" : "",
  ].filter(Boolean).join(" ");
  return `<a class="${escapeHtml(classes)}" href="${escapeHtml(automationOutputHref(doc))}" target="_self" aria-label="${escapeHtml(`预览 ${name}`)}">
    <span class="automation-doc-icon" aria-hidden="true"></span>
    <span class="automation-doc-copy">
      <span class="automation-doc-label">${escapeHtml(options.label || "最后交付")}</span>
      <span class="automation-doc-name">${escapeHtml(name)}</span>
      ${meta && !options.compact ? `<span class="automation-doc-meta">${escapeHtml(meta)}</span>` : ""}
    </span>
  </a>`;
}

function renderAutomationLoading(message = "正在刷新 Hermes CRON") {
  return `<div class="automation-loading" role="status" aria-live="polite">
    <span class="automation-loading-spinner" aria-hidden="true"></span>
    <span>${escapeHtml(message)}</span>
  </div>`;
}

function renderAutomationList() {
  const list = $("threadList");
  if (!list) return;
  list.innerHTML = "";
  return;
}

function renderAutomationView() {
  applyViewMode();
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  state.threads = [];
  renderAutomationList();
  renderAutomationPanel();
}

function renderAutomationPanel() {
  const conversation = $("conversation");
  const selected = currentAutomation();
  $("threadTitle").textContent = "Hermes CRON";
  $("threadMeta").textContent = selected ? automationSourceLine() : "";
  $("interruptRun").disabled = true;
  configureComposer({ enabled: false, placeholder: "Hermes CRON" });
  updateNavigationControls();
  const warning = state.automationSource?.available === false || state.automationSource?.warning
    ? `<div class="automation-warning">${escapeHtml(state.automationSource?.warning || "Hermes CRON source is unavailable.")}</div>`
    : "";
  const loading = state.automationLoading ? renderAutomationLoading(selected ? "正在刷新任务状态" : "正在刷新自动化列表") : "";
  conversation.innerHTML = `
    <section class="automation-shell">
      ${warning}
      ${loading}
      ${selected ? "" : renderAutomationCreatePanel()}
      ${selected && state.automationEditOpen && state.automationEditJobId === selected.id ? renderAutomationEditPanel(selected) : ""}
      ${selected ? renderAutomationDetail(selected) : renderAutomationSections()}
    </section>
  `;
  conversation.querySelectorAll("[data-automation-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextId = button.dataset.automationId || "";
      if (state.selectedAutomationId !== nextId) state.automationOutputHistoryOpen = false;
      state.selectedAutomationId = nextId;
      state.automationEditOpen = false;
      state.automationEditJobId = "";
      renderAutomationView();
    });
  });
  conversation.querySelector("[data-toggle-automation-output-history]")?.addEventListener("click", () => {
    state.automationOutputHistoryOpen = !state.automationOutputHistoryOpen;
    renderAutomationView();
  });
  conversation.querySelector("[data-close-automation-create]")?.addEventListener("click", () => {
    state.automationCreateOpen = false;
    renderAutomationView();
  });
  conversation.querySelector("[data-close-automation-edit]")?.addEventListener("click", () => {
    state.automationEditOpen = false;
    state.automationEditJobId = "";
    renderAutomationView();
  });
  conversation.querySelector("#automationCreateForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    createAutomationFromForm(conversation).catch(showError);
  });
  conversation.querySelector("#automationEditForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    updateAutomationFromForm(conversation).catch(showError);
  });
  ensureVerticalScrollAffordance(conversation);
  conversation.scrollTop = 0;
}

function renderAutomationCreatePanel() {
  if (!state.automationCreateOpen) return "";
  return `<form id="automationCreateForm" class="automation-create">
    <label class="automation-create-label" for="automationNaturalText">新建自动化</label>
    <textarea id="automationNaturalText" class="automation-create-input" rows="4" placeholder="用自然语言描述要做什么、什么时候执行、需要生成什么交付文件"></textarea>
    <div class="automation-create-actions">
      <button class="secondary-small" type="button" data-close-automation-create>取消</button>
      <button class="primary-small" type="submit">创建</button>
    </div>
  </form>`;
}

function renderAutomationEditPanel(job) {
  const prompt = job?.prompt || job?.promptPreview || "";
  const schedule = job?.scheduleText || job?.schedule || "";
  return `<form id="automationEditForm" class="automation-create automation-edit" data-automation-edit-id="${escapeHtml(job?.id || "")}">
    <label class="automation-create-label" for="automationEditName">${"\u4fee\u6539\u81ea\u52a8\u5316"}</label>
    <input id="automationEditName" class="automation-create-line" type="text" value="${escapeHtml(job?.name || automationTitle(job))}" placeholder="${"\u540d\u79f0"}">
    <input id="automationEditSchedule" class="automation-create-line" type="text" value="${escapeHtml(schedule)}" placeholder="0 8 * * *">
    <textarea id="automationEditPrompt" class="automation-create-input" rows="4" placeholder="${"\u4efb\u52a1\u76ee\u6807"}">${escapeHtml(prompt)}</textarea>
    <div class="automation-create-actions">
      <button class="secondary-small" type="button" data-close-automation-edit>${"\u53d6\u6d88"}</button>
      <button class="primary-small" type="submit">${"\u4fdd\u5b58"}</button>
    </div>
  </form>`;
}

function renderAutomationSections() {
  if (!state.automations.length) {
    return `<div class="empty-state">No Hermes CRON jobs are available.</div>`;
  }
  const active = state.automations.filter((job) => automationStatusLabel(job) !== "paused");
  const paused = state.automations.filter((job) => automationStatusLabel(job) === "paused");
  return `
    <div class="automation-section">
      <div class="automation-section-title">Active / scheduled | ${active.length}</div>
      <div class="automation-card-list">${active.map(renderAutomationCard).join("") || `<div class="empty-state small">No active CRON jobs.</div>`}</div>
    </div>
    <div class="automation-section automation-section-muted">
      <div class="automation-section-title">Paused | ${paused.length}</div>
      <div class="automation-card-list">${paused.map(renderAutomationCard).join("") || `<div class="empty-state small">No paused CRON jobs.</div>`}</div>
    </div>
  `;
}

function renderAutomationCard(job) {
  const status = automationStatusLabel(job);
  const latestDoc = automationLatestDocument(job);
  return `<article class="automation-card ${escapeHtml(status)}">
    <button class="automation-card-main" type="button" data-automation-id="${escapeHtml(job.id)}">
      <span class="automation-card-title">${escapeHtml(automationTitle(job))}</span>
    </button>
    ${renderAutomationStatusSummary(job, status)}
    ${latestDoc ? `<div class="automation-card-doc">${renderAutomationDocumentPreview(latestDoc, { compact: true })}</div>` : ""}
  </article>`;
}

function renderAutomationOutputLinks(job) {
  const docs = Array.isArray(job?.outputDocuments) ? job.outputDocuments : [];
  if (!docs.length) return "";
  const latestDoc = docs[0];
  const history = docs.slice(1);
  const historyOpen = state.automationOutputHistoryOpen && history.length;
  return `<section class="automation-output-docs">
    <div class="automation-output-title">${"\u4ea4\u4ed8\u6587\u4ef6"}</div>
    <div class="automation-output-current">
      ${renderAutomationDocumentPreview(latestDoc)}
      <button class="automation-output-folder" type="button" data-toggle-automation-output-history aria-label="${"\u67e5\u770b\u5386\u53f2\u4ea4\u4ed8"}" title="${"\u67e5\u770b\u5386\u53f2\u4ea4\u4ed8"}" aria-expanded="${historyOpen ? "true" : "false"}" ${history.length ? "" : "disabled"}></button>
    </div>
    ${historyOpen ? `<div class="automation-output-history">
      ${history.map((doc) => renderAutomationDocumentPreview(doc, { label: "\u5386\u53f2\u4ea4\u4ed8", history: true })).join("")}
    </div>` : ""}
  </section>`;
}

function renderAutomationDetailLegacy(job) {
  const status = automationStatusLabel(job);
  const rows = [
    ["任务 ID", job.id],
    ["状态", status],
    ["计划", automationScheduleLine(job)],
    ["上次执行", job.lastRunAt ? formatTime(job.lastRunAt) : ""],
    ["下次执行", job.nextRunAt ? formatTime(job.nextRunAt) : ""],
    ["上次结果", job.lastStatus || ""],
    ["投递", job.deliver || ""],
    ["负责人", job.ownerPrincipalId || ""],
    ["模型", [job.provider, job.model].filter(Boolean).join(" / ")],
    ["技能", Array.isArray(job.skills) ? job.skills.join(", ") : ""],
  ].filter((row) => row[1]);
  const flags = [
    job.hasScript ? "script" : "",
    job.hasWorkdir ? "workdir" : "",
    job.hasContextFrom ? "context chain" : "",
  ].filter(Boolean);
  return `<article class="automation-detail-card ${escapeHtml(status)}">
    <div class="automation-detail-head">
      <div>
        <div class="automation-detail-id">${escapeHtml(job.id)}</div>
        <h2>${escapeHtml(automationTitle(job))}</h2>
      </div>
      <span class="automation-state">${escapeHtml(status)}</span>
    </div>
    <div class="automation-run-times">
      ${automationTimeParts(job).map(([label, value]) => `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join("") || `<div><strong>执行时间</strong><span>暂无执行记录</span></div>`}
    </div>
    <div class="automation-detail-grid">
      ${rows.map(([label, value]) => `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join("")}
    </div>
    ${renderAutomationOutputLinks(job)}
    ${flags.length ? `<div class="automation-flags">${flags.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
    ${job.promptPreview ? `<div class="automation-preview">${escapeHtml(job.promptPreview)}</div>` : ""}
    ${job.lastError ? `<div class="automation-error">Agent error recorded: ${escapeHtml(job.lastError)}</div>` : ""}
    ${job.lastDeliveryError ? `<div class="automation-error">Delivery error recorded: ${escapeHtml(job.lastDeliveryError)}</div>` : ""}
  </article>`;
}

function renderAutomationDetail(job) {
  const status = automationStatusLabel(job);
  const meta = [
    automationScheduleLine(job),
    job.ownerPrincipalId ? `Owner ${job.ownerPrincipalId}` : "",
    job.deliver ? `Deliver ${job.deliver}` : "",
  ].filter(Boolean).join(" | ");
  const timeRows = [
    ["\u4e0a\u6b21\u6267\u884c", job.lastRunAt ? formatTime(job.lastRunAt) : "\u6682\u65e0"],
    ["\u4e0b\u6b21\u6267\u884c", job.nextRunAt ? formatTime(job.nextRunAt) : "\u6682\u65e0"],
    ["\u4e0a\u6b21\u7ed3\u679c", job.lastStatus || status],
  ];
  const detailRows = [
    ["ID", job.id],
    ["\u6a21\u578b", [job.provider, job.model].filter(Boolean).join(" / ")],
    ["Skill", Array.isArray(job.skills) ? job.skills.join(", ") : ""],
  ].filter((row) => row[1]);
  const flags = [
    job.hasScript ? "script" : "",
    job.hasWorkdir ? "workdir" : "",
    job.hasContextFrom ? "context chain" : "",
  ].filter(Boolean);
  return `<article class="automation-detail-card ${escapeHtml(status)}">
    <div class="automation-detail-head">
      <div>
        <div class="automation-detail-id">${escapeHtml(job.id)}</div>
        <h2>${escapeHtml(automationTitle(job))}</h2>
        ${meta ? `<div class="automation-detail-meta">${escapeHtml(meta)}</div>` : ""}
      </div>
      <span class="automation-state">${escapeHtml(status)}</span>
    </div>
    <div class="automation-run-times">
      ${timeRows.map(([label, value]) => `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join("")}
    </div>
    ${renderAutomationOutputLinks(job)}
    ${detailRows.length ? `<div class="automation-detail-grid">
      ${detailRows.map(([label, value]) => `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join("")}
    </div>` : ""}
    ${flags.length ? `<div class="automation-flags">${flags.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
    ${job.promptPreview ? `<div class="automation-preview"><strong>${"\u76ee\u6807"}</strong><span>${escapeHtml(job.promptPreview)}</span></div>` : ""}
    ${job.lastError ? `<div class="automation-error">Agent error recorded: ${escapeHtml(job.lastError)}</div>` : ""}
    ${job.lastDeliveryError ? `<div class="automation-error">Delivery error recorded: ${escapeHtml(job.lastDeliveryError)}</div>` : ""}
  </article>`;
}

function focusAutomationCreateSoon() {
  setTimeout(() => {
    $("automationNaturalText")?.focus();
  }, 40);
}

function openAutomationCreate() {
  closeTopMoreMenu();
  state.selectedAutomationId = "";
  state.automationEditOpen = false;
  state.automationEditJobId = "";
  state.automationOutputHistoryOpen = false;
  state.automationCreateOpen = true;
  renderAutomationView();
  focusAutomationCreateSoon();
}

async function createAutomationFromForm(root) {
  const input = root.querySelector("#automationNaturalText");
  const text = input?.value?.trim() || "";
  if (!text) throw new Error("请输入自动化任务描述");
  const submit = root.querySelector("#automationCreateForm button[type='submit']");
  if (submit) submit.disabled = true;
  $("connectionState").textContent = "正在理解自动化";
  try {
    const result = await api("/api/automations", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: state.selectedWorkspaceId || "owner",
        text,
      }),
    });
    state.automationCreateOpen = false;
    state.selectedAutomationId = result?.job?.id || result?.data?.id || "";
    await loadAutomations();
    $("connectionState").textContent = "Hermes OK";
  } finally {
    if (submit) submit.disabled = false;
  }
}

function focusAutomationEditSoon() {
  setTimeout(() => {
    $("automationEditName")?.focus();
  }, 40);
}

function openAutomationEdit() {
  const job = currentAutomation();
  if (!job) return;
  closeTopMoreMenu();
  state.automationCreateOpen = false;
  state.automationEditOpen = true;
  state.automationEditJobId = job.id;
  renderAutomationView();
  focusAutomationEditSoon();
}

async function postAutomationAction(jobId, action, payload = {}) {
  if (!jobId || !action) return null;
  $("connectionState").textContent = "Hermes CRON...";
  try {
    const result = await api(`/api/automations/${encodeURIComponent(jobId)}/${encodeURIComponent(action)}`, {
      method: "POST",
      body: JSON.stringify(Object.assign({ workspaceId: state.selectedWorkspaceId || "owner" }, payload)),
    });
    $("connectionState").textContent = "Hermes OK";
    return result;
  } catch (err) {
    $("connectionState").textContent = "Hermes error";
    throw err;
  }
}

async function toggleAutomationPause() {
  const job = currentAutomation();
  if (!job) return;
  closeTopMoreMenu();
  const action = automationStatusLabel(job) === "paused" ? "resume" : "pause";
  await postAutomationAction(job.id, action);
  state.selectedAutomationId = job.id;
  await loadAutomations();
}

async function deleteAutomationJob() {
  const job = currentAutomation();
  if (!job) return;
  closeTopMoreMenu();
  await postAutomationAction(job.id, "delete");
  state.selectedAutomationId = "";
  state.automationEditOpen = false;
  state.automationEditJobId = "";
  state.automationOutputHistoryOpen = false;
  await loadAutomations();
}

async function updateAutomationFromForm(root) {
  const form = root.querySelector("#automationEditForm");
  const jobId = form?.dataset?.automationEditId || state.automationEditJobId || state.selectedAutomationId;
  if (!jobId) return;
  const name = root.querySelector("#automationEditName")?.value?.trim() || "";
  const schedule = root.querySelector("#automationEditSchedule")?.value?.trim() || "";
  const prompt = root.querySelector("#automationEditPrompt")?.value?.trim() || "";
  if (!name) throw new Error("\u8bf7\u8f93\u5165\u81ea\u52a8\u5316\u540d\u79f0");
  if (!schedule) throw new Error("\u8bf7\u8f93\u5165\u6267\u884c\u8ba1\u5212");
  if (!prompt) throw new Error("\u8bf7\u8f93\u5165\u4efb\u52a1\u76ee\u6807");
  const submit = root.querySelector("#automationEditForm button[type='submit']");
  if (submit) submit.disabled = true;
  try {
    const result = await postAutomationAction(jobId, "update", { name, schedule, prompt });
    state.automationEditOpen = false;
    state.automationEditJobId = "";
    state.selectedAutomationId = result?.job?.id || jobId;
    await loadAutomations();
  } finally {
    if (submit) submit.disabled = false;
  }
}

function summarizeThread(thread) {
  const messages = thread?.messages || [];
  const last = [...messages].reverse().find((msg) => msg.content);
  return {
    id: thread.id,
    title: thread.title,
    workspaceId: thread.workspaceId,
    projectId: thread.projectId,
    subprojectId: thread.subprojectId || "",
    singleWindow: Boolean(thread.singleWindow),
    status: thread.status,
    activeRunId: thread.activeRunId,
    activeRunIds: thread.activeRunIds || [],
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    chatGroup: thread.chatGroup || null,
    preview: last ? last.content.slice(0, 180) : "",
  };
}

function mergeServerMessage(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  const merged = Object.assign({}, existing, incoming);
  const existingContent = String(existing.content || "");
  const incomingContent = String(incoming.content || "");
  const incomingStatus = String(incoming.status || "");
  const shouldKeepLiveContent =
    existingContent &&
    (!incomingContent || (incomingStatus === "running" && incomingContent.length < existingContent.length));
  if (shouldKeepLiveContent) merged.content = existingContent;
  if (incoming.revokedAt) {
    merged.content = incomingContent || GROUP_MESSAGE_REVOKED_TEXT;
    merged.artifacts = [];
    merged.usage = incoming.usage || null;
    merged.error = incoming.error || null;
  }
  if (!incoming.revokedAt && Array.isArray(existing.artifacts) && existing.artifacts.length && !merged.artifacts?.length) {
    merged.artifacts = existing.artifacts;
  }
  if (!incoming.revokedAt && existing.usage && !incoming.usage) merged.usage = existing.usage;
  for (const field of MESSAGE_TIMESTAMP_FIELDS) {
    if (existing[field] && !incoming[field]) merged[field] = existing[field];
  }
  return merged;
}

function mergeCurrentThread(incomingThread) {
  if (!incomingThread) return state.currentThread;
  if (!state.currentThread || state.currentThread.id !== incomingThread.id) return incomingThread;
  const existingPage = state.currentThread.messagesPage || null;
  const incomingPage = incomingThread.messagesPage || null;
  const existingMessages = new Map((state.currentThread.messages || []).map((message) => [message.id, message]));
  const incomingIds = new Set();
  const messages = (incomingThread.messages || []).map((message) => {
    incomingIds.add(message.id);
    return mergeServerMessage(existingMessages.get(message.id), message);
  });
  for (const message of state.currentThread.messages || []) {
    if (!incomingIds.has(message.id)) messages.push(message);
  }
  const sortedMessages = sortedThreadMessages(messages);
  const chatMessages = incomingPage?.mode === "chat" || existingPage?.mode === "chat"
    ? sortedMessages.filter((message) => String(message?.taskGroupId || "") === String((incomingPage || existingPage)?.taskGroupId || activeChatTaskGroupId()))
    : sortedMessages;
  const messagesPage = incomingPage || existingPage
    ? mergeMessagesPage(existingPage, incomingPage, chatMessages)
    : null;
  return Object.assign({}, state.currentThread, incomingThread, { messages: sortedMessages, messagesPage });
}

async function loadSingleWindow(options = {}) {
  const weixinChat = Boolean(options.weixinChat ?? (
    state.viewMode === "single"
    && state.singleWindowMode === "chat"
    && state.weixinChatOpen
  ));
  const groupChat = weixinChat ? false : (options.groupChat ?? (
    state.viewMode === "single"
    && state.singleWindowMode === "chat"
    && state.groupChatOpen
  ));
  const messageMode = isSingleWindowChatView()
    ? "chat"
    : (state.viewMode === "tasks" || state.singleWindowMode === "task" ? "tasks" : "");
  const result = await api("/api/single-window", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: state.selectedWorkspaceId,
      groupChat,
      weixinChat,
      messageMode,
      taskGroupId: messageMode === "tasks" ? state.currentTaskGroupId : "",
      messageLimit: messageMode === "tasks" ? TASK_MESSAGE_INITIAL_LIMIT : CHAT_MESSAGE_INITIAL_LIMIT,
    }),
  });
  state.currentThread = mergeCurrentThread(result.thread);
  if (result.groupChatThread) {
    state.groupChatThread = mergeChatScopeThread(state.groupChatThread, result.groupChatThread);
    state.groupChatThreadId = state.groupChatThread?.id || result.groupChatThreadId || "";
  }
  if (result.weixinChatThread) {
    state.weixinChatThread = mergeChatScopeThread(state.weixinChatThread, result.weixinChatThread);
    state.weixinChatThreadId = state.weixinChatThread?.id || result.weixinChatThreadId || "";
  }
  state.caseTopicThreads = Array.isArray(result.caseTopicThreads) ? result.caseTopicThreads : [];
  if (messageMode === "tasks") scheduleKanbanTopicCardSnapshotRefresh();
  state.groupChatAvailable = Boolean(result.groupChatAvailable || selectedWorkspaceInThreadGroup(state.currentThread));
  state.weixinChatAvailable = Boolean(result.weixinChatAvailable || isThreadWeixinChat(state.currentThread));
  rememberChatScopeThread(state.currentThread);
  if (weixinChat && !isThreadWeixinChat(state.currentThread)) {
    state.weixinChatOpen = false;
    localStorage.setItem("hermesWebWeixinChatOpen", "0");
  }
  if (isThreadWeixinChat(state.currentThread)) {
    state.weixinChatOpen = true;
    state.groupChatOpen = false;
    localStorage.setItem("hermesWebWeixinChatOpen", "1");
    localStorage.setItem("hermesWebGroupChatOpen", "0");
  }
  if (groupChat && !selectedWorkspaceInThreadGroup(state.currentThread)) {
    state.groupChatOpen = false;
    localStorage.setItem("hermesWebGroupChatOpen", "0");
  }
  state.currentThreadId = state.currentThread.id;
  state.threads = [summarizeThread(state.currentThread)];
  if (state.viewMode !== "tasks") state.currentTaskGroupId = "";
  if (messageMode === "tasks") rememberTaskListThread(state.currentThread);
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  setComposerEnabled(true);
}

async function selectChatScope(scope) {
  closeTopMoreMenu();
  clearQuotedReply({ render: false });
  state.currentTaskGroupId = "";
  if (String(scope || "").trim().toLowerCase() !== "group") {
    state.groupChatOpen = false;
    state.weixinChatOpen = false;
    localStorage.setItem("hermesWebGroupChatOpen", "0");
    localStorage.setItem("hermesWebWeixinChatOpen", "0");
    await loadSingleWindow({ groupChat: false, weixinChat: false });
    return;
  }
  if (isGroupChatView()) {
    renderCurrentThread({ stickToBottom: false });
    return;
  }
  state.weixinChatOpen = false;
  localStorage.setItem("hermesWebWeixinChatOpen", "0");
  await loadSingleWindow({ groupChat: true, weixinChat: false });
  if (selectedWorkspaceInThreadGroup(state.currentThread)) {
    state.groupChatOpen = true;
    localStorage.setItem("hermesWebGroupChatOpen", "1");
    renderCurrentThread({ stickToBottom: true });
    return;
  }
  if (!state.auth?.isOwner) {
    state.groupChatOpen = false;
    localStorage.setItem("hermesWebGroupChatOpen", "0");
    throw new Error("当前账号还没有可加入的群聊");
  }
  const ownerId = state.currentThread?.workspaceId || state.selectedWorkspaceId || "owner";
  const memberWorkspaceIds = [...new Set([ownerId, state.selectedWorkspaceId || ownerId].filter(Boolean))];
  const result = await api(`/api/threads/${encodeURIComponent(state.currentThread.id)}/group-chat`, {
    method: "PATCH",
    body: JSON.stringify({ enabled: true, memberWorkspaceIds }),
  });
  state.currentThread = mergeCurrentThread(result.thread);
  state.currentThreadId = state.currentThread.id;
  state.threads = [summarizeThread(state.currentThread)];
  state.groupChatOpen = true;
  localStorage.setItem("hermesWebGroupChatOpen", "1");
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
}

async function toggleGroupChat() {
  await selectChatScope(isGroupChatView() ? "chat" : "group");
}

async function selectWeixinChat(open = true) {
  closeTopMoreMenu();
  clearQuotedReply({ render: false });
  state.currentTaskGroupId = "";
  state.weixinChatOpen = Boolean(open);
  state.groupChatOpen = false;
  localStorage.setItem("hermesWebWeixinChatOpen", state.weixinChatOpen ? "1" : "0");
  localStorage.setItem("hermesWebGroupChatOpen", "0");
  await loadSingleWindow({ weixinChat: state.weixinChatOpen, groupChat: false });
}

async function toggleWeixinChat() {
  await selectWeixinChat(!isWeixinChatView());
}

function renderGroupChatManager() {
  const overlay = $("groupChatOverlay");
  if (!overlay) return;
  if (!state.groupChatManagerOpen) {
    overlay.classList.add("hidden");
    overlay.innerHTML = "";
    return;
  }
  const thread = state.currentThread;
  const fixedOwnerId = thread?.workspaceId || state.selectedWorkspaceId || "owner";
  const selected = new Set(state.groupChatMemberDraft.length ? state.groupChatMemberDraft : threadGroupMemberIds(thread));
  selected.add(fixedOwnerId);
  const canEdit = Boolean(state.auth?.isOwner);
  const workspaces = canEdit
    ? (state.workspaces || [])
    : (Array.isArray(thread?.chatGroup?.members)
      ? thread.chatGroup.members.map((member) => ({ id: member.workspaceId, label: member.label }))
      : []);
  const rows = workspaces.map((workspace) => {
    const checked = selected.has(workspace.id);
    const disabled = !canEdit || workspace.id === fixedOwnerId;
    return `<label class="group-member-option">
      <input type="checkbox" value="${escapeHtml(workspace.id)}"${checked ? " checked" : ""}${disabled ? " disabled" : ""}>
      <span>${escapeHtml(workspace.label || workspace.id)}</span>
    </label>`;
  }).join("");
  overlay.classList.remove("hidden");
  overlay.innerHTML = `
    <div class="access-key-sheet group-chat-sheet">
      <header class="access-key-header">
        <div>
          <div id="groupChatTitle" class="access-key-title">群聊成员</div>
          <div class="access-key-subtitle">${canEdit ? "Owner 可以选择加入这个群聊的工作区账号。" : "当前账号只能查看群聊成员。"}</div>
        </div>
        <button class="access-key-close" type="button" data-close-group-chat>关闭</button>
      </header>
      <div class="group-member-list">${rows}</div>
      <div class="group-member-actions">
        ${canEdit ? `<button class="primary-button" type="button" data-save-group-chat>保存</button>` : ""}
      </div>
    </div>`;
  overlay.querySelector("[data-close-group-chat]")?.addEventListener("click", closeGroupChatManager);
  overlay.querySelector("[data-save-group-chat]")?.addEventListener("click", () => saveGroupChatMembers().catch(showError));
}

async function openGroupChatMembers() {
  closeTopMoreMenu();
  if (!state.auth?.isOwner) return;
  if (!isGroupChatView()) await toggleGroupChat();
  if (!isGroupChatView()) return;
  state.groupChatManagerOpen = true;
  state.groupChatMemberDraft = threadGroupMemberIds(state.currentThread);
  renderGroupChatManager();
}

function closeGroupChatManager() {
  state.groupChatManagerOpen = false;
  state.groupChatMemberDraft = [];
  renderGroupChatManager();
}

async function saveGroupChatMembers() {
  if (!state.currentThread?.id) return;
  const overlay = $("groupChatOverlay");
  const checked = [...(overlay?.querySelectorAll?.(".group-member-option input:checked") || [])].map((input) => input.value);
  const ownerId = state.currentThread.workspaceId || state.selectedWorkspaceId || "owner";
  const memberWorkspaceIds = [...new Set([ownerId, ...checked].filter(Boolean))];
  const result = await api(`/api/threads/${encodeURIComponent(state.currentThread.id)}/group-chat`, {
    method: "PATCH",
    body: JSON.stringify({ enabled: true, memberWorkspaceIds }),
  });
  state.currentThread = mergeCurrentThread(result.thread);
  state.threads = [summarizeThread(state.currentThread)];
  state.groupChatMemberDraft = threadGroupMemberIds(state.currentThread);
  closeGroupChatManager();
  renderThreads();
  renderCurrentThread({ stickToBottom: false });
}

async function loadThreads() {
  const params = new URLSearchParams();
  if (state.selectedWorkspaceId) params.set("workspaceId", state.selectedWorkspaceId);
  if (state.selectedProjectId) params.set("projectId", state.selectedProjectId);
  if (state.selectedSubprojectId) params.set("subprojectId", state.selectedSubprojectId);
  const search = currentSearchText();
  if (search) params.set("search", search);
  const result = await api(`/api/threads?${params}`);
  state.threads = result.data || [];
  updateSearchButton();
  renderThreads();
}

async function refreshCaseTopicThreadsForWorkspace() {
  const result = await api("/api/single-window", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: state.selectedWorkspaceId || "owner",
      messageMode: "tasks",
    }),
  });
  if (Array.isArray(result.caseTopicThreads)) state.caseTopicThreads = result.caseTopicThreads;
  return state.caseTopicThreads;
}

async function refreshKanbanTopicCardSnapshot() {
  if (!isKanbanTodoSource() || !Array.isArray(state.caseTopicThreads) || !state.caseTopicThreads.length) return;
  const workspaceId = state.selectedWorkspaceId || "owner";
  const params = new URLSearchParams({
    workspaceId,
    limit: "500",
    includeCompleted: "1",
    scope: "mine",
  });
  const result = await api(`${boardCollectionApiPath()}?${params.toString()}`);
  applyTodoListResult(result, true, workspaceId);
  state.kanbanTopicCardSnapshotLoadedAt = Date.now();
}

function scheduleKanbanTopicCardSnapshotRefresh(options = {}) {
  if (!isKanbanTodoSource() || !Array.isArray(state.caseTopicThreads) || !state.caseTopicThreads.length) return;
  if (state.kanbanTopicCardSnapshotLoading) return;
  const now = Date.now();
  const maxAge = Number(options.maxAgeMs ?? KANBAN_TOPIC_CARD_SNAPSHOT_CACHE_MS);
  if (!options.force && state.kanbanTopicCardSnapshotLoadedAt && now - state.kanbanTopicCardSnapshotLoadedAt < maxAge) return;
  state.kanbanTopicCardSnapshotLoading = true;
  window.setTimeout(() => {
    refreshKanbanTopicCardSnapshot()
      .catch(() => {})
      .finally(() => {
        state.kanbanTopicCardSnapshotLoading = false;
        if (state.viewMode === "tasks" && !state.currentTaskGroupId) renderCurrentThread({ stickToBottom: false });
      });
  }, 0);
}
