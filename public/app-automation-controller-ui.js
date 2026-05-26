"use strict";

function automationRequestParams(options = {}) {
  const params = new URLSearchParams();
  params.set("workspaceId", state.selectedWorkspaceId || "owner");
  params.set("includeDisabled", "1");
  params.set("limit", "200");
  params.set("detail", options.detail === "summary" ? "summary" : "full");
  const search = options.ignoreSearch ? "" : currentSearchText();
  if (search) params.set("search", search);
  const routeAutomationId = options.routeTarget && state.selectedAutomationId ? String(state.selectedAutomationId).trim() : "";
  if (routeAutomationId) params.set("automationId", routeAutomationId);
  if (options.refresh) params.set("refresh", "1");
  return params;
}

function automationFullStorageKey(params) {
  const copy = new URLSearchParams(params);
  copy.delete("refresh");
  copy.delete("fresh");
  copy.set("detail", "full");
  return `hermes:automation:full:${CLIENT_VERSION}:${copy.toString()}`;
}

function automationRequestCacheKey(params) {
  const copy = new URLSearchParams(params);
  copy.delete("refresh");
  copy.delete("fresh");
  return copy.toString();
}

function automationSummaryCacheKey(params) {
  const copy = new URLSearchParams(params);
  copy.delete("refresh");
  copy.delete("fresh");
  copy.set("detail", "summary");
  return copy.toString();
}

function readAutomationFullCache(params) {
  try {
    const raw = window.localStorage?.getItem(automationFullStorageKey(params));
    if (!raw) return null;
    const payload = JSON.parse(raw);
    return Array.isArray(payload?.data) ? payload : null;
  } catch (_) {
    return null;
  }
}

function writeAutomationFullCache(params, result = {}) {
  if ((params?.get("detail") || "") !== "full" || !Array.isArray(result.data)) return;
  try {
    window.localStorage?.setItem(automationFullStorageKey(params), JSON.stringify({
      savedAt: new Date().toISOString(),
      data: result.data,
      source: result.source || {},
      warning: result.warning || "",
    }));
  } catch (_) {}
}

function clearAutomationFullCaches() {
  try {
    const prefix = `hermes:automation:full:${CLIENT_VERSION}:`;
    for (let index = (window.localStorage?.length || 0) - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key && key.startsWith(prefix)) window.localStorage.removeItem(key);
    }
  } catch (_) {}
}

function invalidateAutomationListCache() {
  Object.assign(state, { automationCacheKey: "", automationFullCacheKey: "", automationLastLoadedAt: 0 });
  clearAutomationFullCaches();
}

function automationIsSummaryJob(job) {
  return String(job?.detailLevel || "").toLowerCase() === "summary";
}

function mergeAutomationJobs(existing = [], incoming = [], options = {}) {
  if (options.preferIncomingOrder) {
    const existingById = new Map((existing || []).map((job) => [String(job?.id || ""), job]));
    const seen = new Set();
    const merged = (incoming || []).map((job) => {
      const id = String(job?.id || "");
      seen.add(id);
      return Object.assign({}, existingById.get(id) || {}, job);
    });
    for (const job of existing || []) {
      const id = String(job?.id || "");
      if (id && !seen.has(id)) merged.push(job);
    }
    return merged;
  }
  const fullById = new Map();
  for (const job of incoming || []) {
    if (job?.id) fullById.set(String(job.id), job);
  }
  const merged = (existing || []).map((job) => {
    const full = fullById.get(String(job?.id || ""));
    return full ? Object.assign({}, job, full) : job;
  });
  const seen = new Set(merged.map((job) => String(job?.id || "")));
  for (const job of incoming || []) {
    const id = String(job?.id || "");
    if (id && !seen.has(id)) merged.push(job);
  }
  return merged;
}

function scheduleAutomationDetailHydration(cacheKey) {
  if (!cacheKey || state.automationFullCacheKey === cacheKey || state.automationDetailLoading) return;
  const hydrate = () => {
    if (state.viewMode !== "automation" || state.automationFullCacheKey === cacheKey) return;
    hydrateAutomationDetails({ cacheKey, silent: true }).catch(showError);
  };
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(hydrate, { timeout: 1500 });
  else window.setTimeout(hydrate, 250);
}

async function hydrateAutomationDetails(options = {}) {
  const params = automationRequestParams({ detail: "full" });
  const cacheKey = options.cacheKey || automationSummaryCacheKey(params);
  if (state.automationFullCacheKey === cacheKey && !options.refresh) return;
  const seq = ++state.automationDetailRequestSeq;
  state.automationDetailLoading = !options.silent;
  if (!options.silent) renderAutomationView();
  try {
    const result = await api(`/api/automations?${params}`);
    if (seq !== state.automationDetailRequestSeq || state.viewMode !== "automation") return;
    state.automations = mergeAutomationJobs(state.automations, result.data || [], { preferIncomingOrder: true });
    state.automationSource = Object.assign({}, state.automationSource || {}, result.source || {}, { warning: result.warning || "" });
    state.automationFullCacheKey = cacheKey;
  } finally {
    if (seq === state.automationDetailRequestSeq && state.viewMode === "automation") {
      state.automationDetailLoading = false;
      renderAutomationView();
    }
  }
}

async function loadAutomations(options = {}) {
  const params = automationRequestParams(options);
  const detail = params.get("detail") || "summary";
  const cacheKey = automationRequestCacheKey(params);
  const summaryCacheKey = automationSummaryCacheKey(params);
  const routeTargetId = String(state.automationRouteTargetId || state.selectedAutomationId || "").trim();
  const routeTargetPending = Boolean(state.automationRouteTargetPending && routeTargetId);
  if (!options.refresh && params.get("detail") === "full") {
    const cached = readAutomationFullCache(params);
    if (cached?.data?.length) {
      const cachedHasRouteTarget = !routeTargetPending || cached.data.some((job) => String(job?.id || "") === routeTargetId);
      if (!cachedHasRouteTarget) {
        state.automationFullCacheKey = "";
      } else {
        state.automations = cached.data;
        state.automationSource = Object.assign({}, cached.source || {}, { warning: cached.warning || "", cached: true });
        state.automationCacheKey = cacheKey;
        state.automationFullCacheKey = summaryCacheKey;
        state.automationLastLoadedAt = Date.now();
        state.automationLoading = false;
        renderAutomationView();
        window.setTimeout(() => loadAutomations({ detail: "full", refresh: true, silent: true }).catch(showError), 0);
        setComposerEnabled(false);
        return;
      }
    }
  }
  const cacheFresh = state.automationCacheKey === cacheKey
    && state.automationLastLoadedAt
    && Date.now() - state.automationLastLoadedAt < 10000;
  if (!options.refresh && cacheFresh && !routeTargetPending) {
    renderAutomationView();
    if (params.get("detail") !== "full") scheduleAutomationDetailHydration(summaryCacheKey);
    setComposerEnabled(false);
    return;
  }
  const seq = ++state.automationRequestSeq;
  state.automationLoading = !options.silent;
  if (!options.silent && state.automations.length) {
    $("connectionState").textContent = "刷新 CRON";
  }
  if (!options.silent || detail === "full") renderAutomationView({ preserveScroll: Boolean(options.silent) });
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
  state.automations = detail === "full" ? mergeAutomationJobs(state.automations, result.data || [], { preferIncomingOrder: true }) : (result.data || []);
  if (detail === "full") writeAutomationFullCache(params, result);
  state.automationSource = Object.assign({}, result.source || {}, { warning: result.warning || "" });
  state.automationCacheKey = cacheKey;
  if (detail === "full") {
    state.automationFullCacheKey = summaryCacheKey;
    state.automationDetailLoading = false;
  }
  state.automationLastLoadedAt = Date.now();
  state.automationLoading = false;
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  state.threads = [];
  const selectedJobPresent = state.selectedAutomationId && state.automations.some((job) => job.id === state.selectedAutomationId);
  if (selectedJobPresent) {
    state.automationRouteTargetPending = false;
    state.automationRouteTargetId = "";
  } else if (state.selectedAutomationId && !state.automationRouteTargetPending) {
    state.selectedAutomationId = "";
    state.automationEditOpen = false;
    state.automationEditJobId = "";
    state.automationOutputHistoryOpen = false;
  }
  updateSearchButton();
  if (!options.silent || detail === "full") renderAutomationView({ preserveScroll: Boolean(options.silent) });
  if (detail !== "full") scheduleAutomationDetailHydration(summaryCacheKey);
  setComposerEnabled(false);
  $("connectionState").textContent = "Hermes OK";
}

async function refreshAutomationAfterPush(eventData = {}) {
  const payload = eventData.payload || {};
  const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const nestedData = data?.data && typeof data.data === "object" ? data.data : {};
  const messageType = String(data.messageType || nestedData.messageType || "").trim();
  const workspaceId = String(data.workspaceId || nestedData.workspaceId || "").trim();
  const automationId = String(data.automationId || nestedData.automationId || "").trim();
  if (!automationId && !messageType.startsWith("automation_")) return false;
  if (workspaceId && state.selectedWorkspaceId && workspaceId !== state.selectedWorkspaceId) return false;
  invalidateAutomationListCache();
  if (state.viewMode !== "automation") return true;
  await loadAutomations({ detail: "full", refresh: true, silent: true });
  return true;
}

function automationStatusLabel(job) {
  const status = String(job?.status || "");
  if (status === "error") return "error";
  if (status === "paused") return "paused";
  if (status === "completed") return "done";
  return "scheduled";
}

function automationStatusTone(job, status = automationStatusLabel(job)) {
  const current = String(status || "").toLowerCase();
  const last = String(job?.lastStatus || job?.last_status || "").toLowerCase();
  if (current === "error" || ["error", "failed", "failure"].includes(last) || job?.lastError || job?.lastDeliveryError) return "error";
  const normalCurrent = ["scheduled", "running", "ok", "done", "completed", "success", "succeeded"];
  const normalLast = ["", "ok", "done", "completed", "success", "succeeded"];
  if (normalCurrent.includes(current) && normalLast.includes(last)) return "ok";
  return "info";
}

function automationStatusText(job, status = automationStatusLabel(job)) {
  const tone = automationStatusTone(job, status);
  if (tone === "error") return "\u5931\u8d25";
  if (status === "paused") return "\u6682\u505c";
  if (status === "done" || String(job?.lastStatus || "").toLowerCase() === "ok") return "\u5b8c\u6210";
  if (status === "running") return "\u8fd0\u884c\u4e2d";
  return "\u8ba1\u5212\u4e2d";
}

function renderAutomationStatusSummary(job, status = automationStatusLabel(job)) {
  const tone = automationStatusTone(job, status);
  const text = automationStatusText(job, status);
  const lastRun = formatTime(job?.lastRunAt) || "--";
  const latestDoc = automationLatestDocument(job);
  const docTime = latestDoc ? formatTime(latestDoc.runOutputUpdatedAt || latestDoc.updatedAt) : "";
  const label = `${text} | ${lastRun}${docTime ? ` | \u4ea4\u4ed8 ${docTime}` : ""}`;
  return `<span class="automation-state automation-state-summary ${escapeHtml(tone)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
    <span class="automation-state-result">${escapeHtml(text)}</span>
    <span class="automation-state-time">${escapeHtml(lastRun)}</span>
    <span class="automation-state-dot ${escapeHtml(tone)}" aria-hidden="true"></span>
  </span>`;
}

function currentAutomation() {
  return state.automations.find((job) => job.id === state.selectedAutomationId) || null;
}

function automationTitle(job) { return compactDisplayText(job?.name || job?.id || "Cron job", 120); }

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

function automationLatestDocument(job) { return (Array.isArray(job?.outputDocuments) ? job.outputDocuments : [])[0] || null; }

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

function automationDocumentMime(doc) {
  return doc?.mime || doc?.contentType || doc?.content_type || "";
}

function renderAutomationDocumentPreview(doc, options = {}) {
  if (!doc) return "";
  const kind = artifactKind(doc);
  const name = doc.name || "document";
  const href = automationOutputHref(doc);
  const mime = automationDocumentMime(doc);
  const meta = [formatBytes(doc.size), formatTime(doc.updatedAt)].filter(Boolean).join(" | ");
  const classes = [
    "automation-doc-preview",
    `doc-${kind}`,
    options.compact ? "compact" : "",
    options.history ? "history" : "",
  ].filter(Boolean).join(" ");
  return `<a class="${escapeHtml(classes)}" href="${escapeHtml(href)}" target="_self" data-task-doc data-artifact-name="${escapeHtml(name)}" data-artifact-mime="${escapeHtml(mime)}" aria-label="${escapeHtml(`预览 ${name}`)}">
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

function renderAutomationList() { const list = $("threadList"); if (list) list.innerHTML = ""; }

function renderAutomationView(options = {}) {
  applyViewMode();
  Object.assign(state, { currentThread: null, currentThreadId: "", currentTaskGroupId: "", threads: [] });
  renderAutomationList();
  renderAutomationPanel(options);
}

function renderAutomationPanel(options = {}) {
  const conversation = $("conversation");
  const previousScrollTop = conversation?.scrollTop || 0;
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
  const routeTargetLoading = !selected && state.selectedAutomationId && state.automationRouteTargetPending
    ? `<div class="automation-loading compact" role="status" aria-live="polite">
        <span class="automation-loading-spinner" aria-hidden="true"></span>
        <span>${"\u6b63\u5728\u6253\u5f00\u81ea\u52a8\u5316\u4efb\u52a1"} ${escapeHtml(state.selectedAutomationId)}</span>
      </div>`
    : "";
  conversation.innerHTML = `
    <section class="automation-shell">
      ${warning}
      ${loading}
      ${routeTargetLoading}
      ${selected || state.automationRouteTargetPending ? "" : renderAutomationCreatePanel()}
      ${selected && state.automationEditOpen && state.automationEditJobId === selected.id ? renderAutomationEditPanel(selected) : ""}
      ${selected ? renderAutomationDetail(selected) : state.automationRouteTargetPending ? "" : renderAutomationSections()}
    </section>
  `;
  if (typeof wireTaskDocumentLinks === "function") wireTaskDocumentLinks(conversation);
  conversation.querySelectorAll("[data-automation-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextId = button.dataset.automationId || "";
      if (state.selectedAutomationId !== nextId) state.automationOutputHistoryOpen = false;
      state.selectedAutomationId = nextId;
      state.automationRouteTargetId = "";
      state.automationRouteTargetPending = false;
      state.automationEditOpen = false;
      state.automationEditJobId = "";
      renderAutomationView();
      if (automationIsSummaryJob(currentAutomation())) hydrateAutomationDetails().catch(showError);
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
  if (options.preserveScroll) {
    conversation.scrollTop = Math.min(previousScrollTop, Math.max(0, conversation.scrollHeight - conversation.clientHeight));
  } else {
    conversation.scrollTop = 0;
  }
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

function renderAutomationDetail(job) {
  const status = automationStatusLabel(job);
  const statusTone = automationStatusTone(job, status);
  const statusText = automationStatusText(job, status);
  const meta = [
    automationScheduleLine(job),
    job.ownerPrincipalId ? `Owner ${job.ownerPrincipalId}` : "",
    job.deliver ? `Deliver ${job.deliver}` : "",
  ].filter(Boolean).join(" | ");
  const timeRows = [
    ["\u4e0a\u6b21\u6267\u884c", job.lastRunAt ? formatTime(job.lastRunAt) : "\u6682\u65e0"],
    ["\u4e0b\u6b21\u6267\u884c", job.nextRunAt ? formatTime(job.nextRunAt) : "\u6682\u65e0"],
    ["\u4e0a\u6b21\u7ed3\u679c", statusText],
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
  const detailLoading = automationIsSummaryJob(job) || state.automationDetailLoading;
  const detailLoadingBlock = detailLoading
    ? `<div class="automation-loading compact" role="status" aria-live="polite">
      <span class="automation-loading-spinner" aria-hidden="true"></span>
      <span>${"\u6b63\u5728\u540e\u53f0\u52a0\u8f7d\u8be6\u60c5\u548c\u4ea4\u4ed8\u6587\u4ef6"}</span>
    </div>`
    : "";
  return `<article class="automation-detail-card ${escapeHtml(status)}">
    <div class="automation-detail-head">
      <div>
        <div class="automation-detail-id">${escapeHtml(job.id)}</div>
        <h2>${escapeHtml(automationTitle(job))}</h2>
        ${meta ? `<div class="automation-detail-meta">${escapeHtml(meta)}</div>` : ""}
      </div>
      <span class="automation-state ${escapeHtml(statusTone)}">${escapeHtml(statusText)}</span>
    </div>
    <div class="automation-run-times">
      ${timeRows.map(([label, value]) => `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join("")}
    </div>
    ${detailLoadingBlock}
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

function focusAutomationCreateSoon() { setTimeout(() => $("automationNaturalText")?.focus(), 40); }

function openAutomationCreate() {
  closeTopMoreMenu();
  Object.assign(state, { selectedAutomationId: "", automationRouteTargetId: "", automationRouteTargetPending: false, automationEditOpen: false, automationEditJobId: "", automationOutputHistoryOpen: false, automationCreateOpen: true });
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
    state.automationRouteTargetId = "";
    state.automationRouteTargetPending = false;
    await loadAutomations({ detail: "full", refresh: true });
    $("connectionState").textContent = "Hermes OK";
  } finally {
    if (submit) submit.disabled = false;
  }
}

function focusAutomationEditSoon() { setTimeout(() => $("automationEditName")?.focus(), 40); }

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
  state.automationRouteTargetId = "";
  state.automationRouteTargetPending = false;
  await loadAutomations({ detail: "full", refresh: true });
}

async function deleteAutomationJob() {
  const job = currentAutomation();
  if (!job) return;
  closeTopMoreMenu();
  await postAutomationAction(job.id, "delete");
  state.selectedAutomationId = "";
  state.automationRouteTargetId = "";
  state.automationRouteTargetPending = false;
  state.automationEditOpen = false;
  state.automationEditJobId = "";
  state.automationOutputHistoryOpen = false;
  await loadAutomations({ detail: "full", refresh: true });
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
    state.automationRouteTargetId = "";
    state.automationRouteTargetPending = false;
    await loadAutomations({ detail: "full", refresh: true });
  } finally {
    if (submit) submit.disabled = false;
  }
}
