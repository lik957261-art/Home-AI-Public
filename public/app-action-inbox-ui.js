"use strict";

function actionInboxStatusLabel(status) {
  const value = String(status || "").toLowerCase();
  if (value === "waiting") return "\u7a0d\u540e";
  if (value === "done") return "\u5df2\u5b8c\u6210";
  if (value === "dismissed") return "\u5df2\u5ffd\u7565";
  if (value === "archived") return "\u5df2\u5f52\u6863";
  return "\u5f85\u5904\u7406";
}

function actionInboxSourceLabel(sourceType) {
  const value = String(sourceType || "").toLowerCase();
  if (value === "growth") return "\u6210\u957f";
  if (value === "automation") return "\u81ea\u52a8\u5316";
  if (value === "manual") return "\u5f85\u529e";
  return value || "\u6536\u4ef6";
}

function actionInboxTypeLabel(itemType) {
  const value = String(itemType || "").toLowerCase();
  if (value === "delivery") return "\u4ea4\u4ed8";
  if (value === "error") return "\u5f02\u5e38";
  if (value === "review") return "\u5ba1\u9605";
  if (value === "reflection") return "\u53cd\u601d";
  if (value === "todo") return "\u5f85\u529e";
  return value || "\u4e8b\u9879";
}

function actionInboxStatusTone(status) {
  const value = String(status || "").toLowerCase();
  if (value === "done") return "done";
  if (value === "dismissed" || value === "archived") return "muted";
  if (value === "waiting") return "waiting";
  return "open";
}

function actionInboxFilterQuery() {
  const filter = String(state.actionInboxStatusFilter || "open");
  const params = new URLSearchParams({ workspaceId: state.selectedWorkspaceId || "owner", limit: "120" });
  if (filter === "all") params.set("includeDone", "1");
  else if (filter) params.set("status", filter);
  if (state.actionInboxSourceFilter) params.set("sourceType", state.actionInboxSourceFilter);
  const search = typeof currentSearchText === "function" ? currentSearchText() : "";
  if (search) params.set("search", search);
  return params;
}

function actionInboxCountsText() {
  const counts = state.actionInboxCounts || {};
  const byStatus = counts.byStatus || {};
  const open = Number(byStatus.open || 0);
  const waiting = Number(byStatus.waiting || 0);
  const done = Number(byStatus.done || 0);
  return `${"\u5f85\u5904\u7406"} ${open} · ${"\u7a0d\u540e"} ${waiting} · ${"\u5df2\u5b8c\u6210"} ${done}`;
}

async function loadActionInbox(options = {}) {
  const seq = (state.actionInboxRequestSeq || 0) + 1;
  state.actionInboxRequestSeq = seq;
  state.actionInboxLoading = !options.silent;
  if (!options.silent) renderActionInboxView({ preserveScroll: Boolean(options.preserveScroll) });
  try {
    const result = await api(`/api/action-inbox?${actionInboxFilterQuery()}`);
    if (seq !== state.actionInboxRequestSeq || state.viewMode !== "inbox") return;
    state.actionInboxItems = result.items || result.data || [];
    state.actionInboxCounts = result.counts || null;
    state.actionInboxSource = result.source || null;
    state.actionInboxLoading = false;
    const selectedStillVisible = state.selectedActionInboxItemId
      && state.actionInboxItems.some((item) => item.id === state.selectedActionInboxItemId);
    if (!selectedStillVisible && state.selectedActionInboxItemId) {
      await loadActionInboxItem(state.selectedActionInboxItemId, { silent: true });
    } else if (!state.selectedActionInboxItemId) {
      state.actionInboxDetail = null;
    }
    renderActionInboxView({ preserveScroll: Boolean(options.preserveScroll) });
  } catch (err) {
    state.actionInboxLoading = false;
    renderActionInboxView();
    throw err;
  }
}

async function loadActionInboxItem(itemId, options = {}) {
  const id = String(itemId || "").trim();
  if (!id) return null;
  const result = await api(`/api/action-inbox/${encodeURIComponent(id)}`);
  state.selectedActionInboxItemId = id;
  state.actionInboxDetail = result;
  if (!options.silent && state.viewMode === "inbox") renderActionInboxView();
  return result;
}

function openActionInboxList() {
  state.skillDetail = null;
  state.selectedActionInboxItemId = "";
  state.actionInboxDetail = null;
  state.actionInboxCreateOpen = false;
  renderActionInboxView();
}

function renderActionInboxFilters() {
  const filters = [
    ["open", "\u5f85\u5904\u7406"],
    ["waiting", "\u7a0d\u540e"],
    ["done", "\u5df2\u5b8c\u6210"],
    ["all", "\u5168\u90e8"],
  ];
  return `<div class="action-inbox-filter-row" role="tablist" aria-label="${"\u6536\u4ef6\u7bb1\u72b6\u6001"}">
    ${filters.map(([id, label]) => `<button class="action-inbox-filter${state.actionInboxStatusFilter === id ? " active" : ""}" type="button" data-action-inbox-filter="${escapeHtml(id)}" role="tab" aria-selected="${state.actionInboxStatusFilter === id ? "true" : "false"}">${escapeHtml(label)}</button>`).join("")}
  </div>`;
}

function renderActionInboxItem(item) {
  const active = item.id === state.selectedActionInboxItemId ? " active" : "";
  const tone = actionInboxStatusTone(item.status);
  const time = item.updatedAt || item.lastEventAt || item.createdAt || "";
  return `<article class="action-inbox-item${active}" data-action-inbox-item-card="${escapeHtml(item.id || "")}">
    <button class="action-inbox-item-main" type="button" data-action-inbox-id="${escapeHtml(item.id || "")}">
      <span class="action-inbox-item-head">
        <strong>${escapeHtml(item.title || item.summary || item.id || "\u6536\u4ef6")}</strong>
        <span class="action-inbox-status ${escapeHtml(tone)}">${escapeHtml(actionInboxStatusLabel(item.status))}</span>
      </span>
      <span class="action-inbox-item-summary">${escapeHtml(item.summary || "")}</span>
      <span class="action-inbox-item-meta">${escapeHtml(actionInboxSourceLabel(item.sourceType))} · ${escapeHtml(actionInboxTypeLabel(item.itemType))} · ${escapeHtml(formatTime(time) || time || "")}</span>
    </button>
  </article>`;
}

function currentActionInboxItem() {
  const id = String(state.selectedActionInboxItemId || "").trim();
  if (!id) return null;
  return (state.actionInboxDetail?.item)
    || state.actionInboxItems.find((item) => item.id === id)
    || null;
}

function renderActionInboxDetail() {
  const item = currentActionInboxItem();
  if (!item) return "";
  const events = Array.isArray(state.actionInboxDetail?.events) ? state.actionInboxDetail.events : [];
  const terminal = ["done", "dismissed", "archived"].includes(String(item.status || "").toLowerCase());
  return `<section class="action-inbox-detail" aria-label="${"\u6536\u4ef6\u8be6\u60c5"}">
    <div class="action-inbox-detail-head">
      <button class="secondary-button compact" type="button" data-action-inbox-back>${"\u8fd4\u56de"}</button>
      <span class="action-inbox-status ${escapeHtml(actionInboxStatusTone(item.status))}">${escapeHtml(actionInboxStatusLabel(item.status))}</span>
    </div>
    <h3>${escapeHtml(item.title || item.id || "\u6536\u4ef6")}</h3>
    ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}
    <div class="action-inbox-detail-meta">
      <span>${escapeHtml(actionInboxSourceLabel(item.sourceType))}</span>
      <span>${escapeHtml(actionInboxTypeLabel(item.itemType))}</span>
      <span>${escapeHtml(formatTime(item.updatedAt || item.createdAt) || item.updatedAt || item.createdAt || "")}</span>
    </div>
    <div class="action-inbox-actions">
      ${item.deepLink ? `<button class="primary-button compact" type="button" data-action-inbox-open-link>${escapeHtml(item.actionLabel || "\u6253\u5f00")}</button>` : ""}
      ${terminal ? "" : `<button class="secondary-button compact" type="button" data-action-inbox-complete>${"\u5b8c\u6210"}</button>`}
      ${terminal ? "" : `<button class="secondary-button compact" type="button" data-action-inbox-snooze>${"\u7a0d\u540e"}</button>`}
      ${terminal ? "" : `<button class="secondary-button compact" type="button" data-action-inbox-dismiss>${"\u5ffd\u7565"}</button>`}
    </div>
    ${events.length ? `<div class="action-inbox-events">
      ${events.slice(0, 8).map((event) => `<div class="action-inbox-event">
        <span>${escapeHtml(event.eventType || "event")}</span>
        <time>${escapeHtml(formatTime(event.createdAt) || event.createdAt || "")}</time>
      </div>`).join("")}
    </div>` : ""}
  </section>`;
}

function renderActionInboxCreatePanel() {
  if (!state.actionInboxCreateOpen) return "";
  return `<form class="action-inbox-create" id="actionInboxCreateForm">
    <label class="action-inbox-create-label" for="actionInboxTitle">${"\u65b0\u589e\u4e8b\u9879"}</label>
    <input id="actionInboxTitle" name="title" autocomplete="off" placeholder="${"\u6807\u9898"}" maxlength="180" required>
    <textarea id="actionInboxSummary" name="summary" rows="3" placeholder="${"\u5907\u6ce8"}"></textarea>
    <div class="action-inbox-create-actions">
      <button class="secondary-button compact" type="button" data-close-action-inbox-create>${"\u53d6\u6d88"}</button>
      <button class="primary-button compact" type="submit" ${state.actionInboxCreateBusy ? "disabled" : ""}>${state.actionInboxCreateBusy ? "\u6b63\u5728\u4fdd\u5b58" : "\u4fdd\u5b58"}</button>
    </div>
  </form>`;
}

function renderActionInboxList() {
  if (state.actionInboxLoading) return `<div class="automation-loading" role="status" aria-live="polite"><span class="automation-loading-spinner" aria-hidden="true"></span><span>${"\u6b63\u5728\u5237\u65b0\u6536\u4ef6\u7bb1"}</span></div>`;
  if (!state.actionInboxItems.length) return `<div class="empty-state">${"\u5f53\u524d\u6ca1\u6709\u9700\u8981\u5904\u7406\u7684\u4e8b\u9879\u3002"}</div>`;
  return `<div class="action-inbox-list">${state.actionInboxItems.map(renderActionInboxItem).join("")}</div>`;
}

function renderActionInboxView(options = {}) {
  applyViewMode();
  Object.assign(state, { currentThread: null, currentThreadId: "", currentTaskGroupId: "", threads: [] });
  const list = $("threadList");
  if (list) list.innerHTML = "";
  $("threadTitle").textContent = "\u6536\u4ef6\u7bb1";
  $("threadMeta").textContent = actionInboxCountsText();
  $("interruptRun").disabled = true;
  configureComposer({ enabled: false, placeholder: "\u6536\u4ef6\u7bb1" });
  updateNavigationControls();
  const conversation = $("conversation");
  if (!conversation) return;
  const previousScrollTop = conversation.scrollTop || 0;
  conversation.innerHTML = `<section class="action-inbox-shell">
    <header class="action-inbox-header">
      <div>
        <h2>${"\u6536\u4ef6\u7bb1"}</h2>
        <p>${escapeHtml(actionInboxCountsText())}</p>
      </div>
      <button class="secondary-button compact" type="button" data-open-action-inbox-create>${"\u65b0\u589e"}</button>
    </header>
    ${renderActionInboxFilters()}
    ${renderActionInboxCreatePanel()}
    ${renderActionInboxDetail()}
    ${renderActionInboxList()}
  </section>`;
  wireActionInboxView(conversation);
  ensureVerticalScrollAffordance(conversation);
  if (options.preserveScroll) {
    conversation.scrollTop = Math.min(previousScrollTop, Math.max(0, conversation.scrollHeight - conversation.clientHeight));
  } else {
    conversation.scrollTop = 0;
  }
}

function wireActionInboxView(root) {
  root.querySelectorAll("[data-action-inbox-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.actionInboxStatusFilter = button.dataset.actionInboxFilter || "open";
      state.selectedActionInboxItemId = "";
      state.actionInboxDetail = null;
      loadActionInbox().catch(showError);
    });
  });
  root.querySelector("[data-open-action-inbox-create]")?.addEventListener("click", () => {
    state.actionInboxCreateOpen = true;
    renderActionInboxView({ preserveScroll: true });
  });
  root.querySelector("[data-close-action-inbox-create]")?.addEventListener("click", () => {
    state.actionInboxCreateOpen = false;
    renderActionInboxView({ preserveScroll: true });
  });
  root.querySelector("#actionInboxCreateForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    createActionInboxManualItem(root).catch(showError);
  });
  root.querySelectorAll("[data-action-inbox-id]").forEach((button) => {
    button.addEventListener("click", () => {
      loadActionInboxItem(button.dataset.actionInboxId).catch(showError);
    });
  });
  root.querySelector("[data-action-inbox-back]")?.addEventListener("click", () => openActionInboxList());
  root.querySelector("[data-action-inbox-open-link]")?.addEventListener("click", () => {
    const item = currentActionInboxItem();
    if (item?.deepLink && typeof openNotificationRoute === "function") openNotificationRoute(item.deepLink).catch(showError);
  });
  root.querySelector("[data-action-inbox-complete]")?.addEventListener("click", () => mutateActionInboxItem("complete").catch(showError));
  root.querySelector("[data-action-inbox-dismiss]")?.addEventListener("click", () => mutateActionInboxItem("dismiss").catch(showError));
  root.querySelector("[data-action-inbox-snooze]")?.addEventListener("click", () => mutateActionInboxItem("snooze", { availableAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() }).catch(showError));
}

async function createActionInboxManualItem(root) {
  const title = root.querySelector("#actionInboxTitle")?.value?.trim() || "";
  const summary = root.querySelector("#actionInboxSummary")?.value?.trim() || "";
  if (!title && !summary) return;
  state.actionInboxCreateBusy = true;
  renderActionInboxView({ preserveScroll: true });
  try {
    const result = await api("/api/action-inbox", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: state.selectedWorkspaceId || "owner",
        title,
        summary,
      }),
    });
    state.actionInboxCreateOpen = false;
    state.selectedActionInboxItemId = result.item?.id || "";
    await loadActionInbox({ preserveScroll: true });
  } finally {
    state.actionInboxCreateBusy = false;
  }
}

async function mutateActionInboxItem(action, body = {}) {
  const item = currentActionInboxItem();
  if (!item?.id) return;
  const result = await api(`/api/action-inbox/${encodeURIComponent(item.id)}/${action}`, {
    method: "POST",
    body: JSON.stringify(Object.assign({ workspaceId: item.workspaceId || state.selectedWorkspaceId || "owner" }, body)),
  });
  state.actionInboxDetail = { item: result.item, events: state.actionInboxDetail?.events || [] };
  await loadActionInbox({ preserveScroll: true });
}

async function refreshActionInboxAfterPush(eventData = {}) {
  const payload = eventData.payload || {};
  const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const nestedData = data?.data && typeof data.data === "object" ? data.data : {};
  const inboxItemId = String(data.inboxItemId || nestedData.inboxItemId || "").trim();
  const viewMode = String(data.viewMode || nestedData.viewMode || "").trim();
  if (inboxItemId) state.selectedActionInboxItemId = inboxItemId;
  if (state.viewMode !== "inbox" && viewMode !== "inbox" && !inboxItemId) return;
  if (state.viewMode === "inbox") {
    await loadActionInbox({ refresh: true, preserveScroll: true });
  }
}
