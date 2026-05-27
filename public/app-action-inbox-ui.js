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
  if (value === "chat") return "\u4efb\u52a1\u56de\u6267";
  if (value === "weixin") return "\u5fae\u4fe1";
  if (value === "directory") return "\u76ee\u5f55";
  return value || "\u6536\u4ef6";
}

function actionInboxTypeLabel(itemType) {
  const value = String(itemType || "").toLowerCase();
  if (value === "delivery") return "\u4ea4\u4ed8";
  if (value === "error") return "\u5f02\u5e38";
  if (value === "review") return "\u5ba1\u9605";
  if (value === "reflection") return "\u53cd\u601d";
  if (value === "revision") return "\u4fee\u8ba2";
  if (value === "approval") return "\u5ba1\u6279";
  if (value === "mention") return "\u63d0\u53ca";
  if (value === "info") return "\u901a\u77e5";
  if (value === "todo") return "\u5f85\u529e";
  return value || "\u4e8b\u9879";
}

function actionInboxSourceTone(sourceType) {
  const value = String(sourceType || "").toLowerCase();
  if (value === "automation") return "source-automation";
  if (value === "growth") return "source-growth";
  if (value === "manual") return "source-manual";
  if (value === "chat") return "source-chat";
  return "source-default";
}

function actionInboxStatusTone(status) {
  const value = String(status || "").toLowerCase();
  if (value === "done") return "done";
  if (value === "dismissed" || value === "archived") return "muted";
  if (value === "waiting") return "waiting";
  return "open";
}

function actionInboxIsTerminalStatus(status) {
  return ["done", "dismissed", "archived"].includes(String(status || "").toLowerCase());
}

function actionInboxCompactTime(value) {
  const formatted = formatTime(value);
  return formatted ? formatted.replace(/,\s*/g, " ") : "";
}

function actionInboxTodoDueAt(item = {}) {
  const explicit = String(item?.dueAt || item?.due_at || "").trim();
  if (explicit) return explicit;
  const summary = String(item?.summary || "");
  const match = summary.match(/(?:截止|到期|时间)\s*[:：]\s*([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z?)/i);
  return match ? match[1] : "";
}

function actionInboxTodoDueText(item = {}) {
  if (String(item?.sourceType || item?.source_type || "").toLowerCase() !== "manual") return "";
  if (String(item?.itemType || item?.item_type || "").toLowerCase() !== "todo") return "";
  const dueAt = actionInboxTodoDueAt(item);
  return dueAt ? actionInboxCompactTime(dueAt) : "";
}

function actionInboxDisplayTitle(item = {}) {
  const dueAt = actionInboxTodoDueAt(item);
  const dueText = dueAt ? actionInboxCompactTime(dueAt) : "";
  return String(item?.title || item?.summary || item?.id || "\u6536\u4ef6")
    .replace(/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z?/g, dueText || "");
}

function actionInboxDisplaySummary(item = {}) {
  const summary = String(item?.summary || "");
  const dueText = actionInboxTodoDueText(item);
  if (!dueText) return summary;
  const normalized = summary.replace(/(?:截止|到期|时间)\s*[:：]\s*([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z?)/ig, `\u622a\u6b62 ${dueText}`);
  return normalized === `\u622a\u6b62 ${dueText}` ? "" : normalized;
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

function actionInboxSourceDeepLink(item = {}) {
  const sourceType = String(item?.sourceType || item?.source_type || "").trim().toLowerCase();
  const explicit = String(item?.deepLink || item?.deep_link || "").trim();
  if (explicit) return actionInboxAutomationInboxReturnLink(explicit, item, sourceType);
  const sourceRef = item?.sourceRef && typeof item.sourceRef === "object" ? item.sourceRef : {};
  const workspaceId = String(item?.workspaceId || item?.assigneeWorkspaceId || state.selectedWorkspaceId || "owner").trim() || "owner";
  if (sourceType === "automation") {
    const automationId = String(sourceRef.automationId || sourceRef.automation_id || item?.sourceId || item?.source_id || "").trim();
    if (automationId) {
      const params = new URLSearchParams({ view: "automation", workspaceId, automationId });
      params.set("returnTo", "inbox");
      params.set("returnScope", "detail");
      const inboxItemId = String(item?.id || "").trim();
      if (inboxItemId) params.set("sourceInboxItemId", inboxItemId);
      return `/?${params.toString()}`;
    }
  }
  return "";
}

function actionInboxAutomationInboxReturnLink(link, item = {}, sourceType = "") {
  const normalizedSourceType = String(sourceType || item?.sourceType || item?.source_type || "").trim().toLowerCase();
  if (normalizedSourceType !== "automation" || !link) return link || "";
  const inboxItemId = String(item?.id || "").trim();
  try {
    const base = (typeof window !== "undefined" && window.location?.origin) ? window.location.origin : "http://localhost";
    const parsed = new URL(link, base);
    parsed.searchParams.set("returnTo", "inbox");
    parsed.searchParams.set("returnScope", "detail");
    if (inboxItemId) parsed.searchParams.set("sourceInboxItemId", inboxItemId);
    if (/^[a-z][a-z0-9+.-]*:/i.test(link)) return parsed.toString();
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (_) {
    const extra = new URLSearchParams({ returnTo: "inbox", returnScope: "detail" });
    if (inboxItemId) extra.set("sourceInboxItemId", inboxItemId);
    return `${link}${link.includes("?") ? "&" : "?"}${extra.toString()}`;
  }
}

function actionInboxOpensSourceDirectly(item = {}) {
  const sourceType = String(item?.sourceType || item?.source_type || "").trim().toLowerCase();
  return sourceType === "automation" && Boolean(actionInboxSourceDeepLink(item));
}

function actionInboxSourceActionLabel(item = {}) {
  const sourceType = String(item?.sourceType || item?.source_type || "").trim().toLowerCase();
  if (sourceType === "automation") return "\u6253\u5f00\u81ea\u52a8\u5316\u4efb\u52a1";
  return "\u6253\u5f00\u6765\u6e90";
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
  state.actionInboxCreateOpen = false;
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

function openActionInboxCreate() {
  state.skillDetail = null;
  state.selectedActionInboxItemId = "";
  state.actionInboxDetail = null;
  state.actionInboxCreateOpen = true;
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
  const terminal = actionInboxIsTerminalStatus(item.status);
  const swipeClass = terminal ? "" : " task-swipe-row action-inbox-swipe-row";
  const swipeAttrs = terminal ? "" : ` data-swipe-row data-swipe-kind="action-inbox" data-swipe-id="${escapeHtml(item.id || "")}"`;
  const dueText = actionInboxTodoDueText(item);
  const displayTime = dueText ? `${"\u622a\u6b62"} ${dueText}` : (actionInboxCompactTime(time) || time || "");
  const title = actionInboxDisplayTitle(item);
  const summary = actionInboxDisplaySummary(item);
  const directSource = actionInboxOpensSourceDirectly(item);
  const itemActionAttr = directSource
    ? `data-action-inbox-open-source-id="${escapeHtml(item.id || "")}"`
    : `data-action-inbox-id="${escapeHtml(item.id || "")}"`;
  return `<article class="action-inbox-item${active}${swipeClass}" data-action-inbox-item-card="${escapeHtml(item.id || "")}"${swipeAttrs}>
    ${terminal ? "" : `<button class="task-swipe-delete action-inbox-swipe-complete" type="button" data-complete-swipe="${escapeHtml(item.id || "")}" aria-label="${"\u6807\u8bb0\u4e3a\u5df2\u8bfb"}">${"\u5df2\u8bfb"}</button>`}
    <div class="${terminal ? "action-inbox-item-static" : "task-swipe-content action-inbox-swipe-content"}"${terminal ? "" : " data-swipe-content"}>
    <button class="action-inbox-item-main" type="button" ${itemActionAttr}>
      <span class="action-inbox-source-row">
        <span class="action-inbox-source-badge ${escapeHtml(actionInboxSourceTone(item.sourceType))}">${"\u6765\u6e90\uff1a"}${escapeHtml(actionInboxSourceLabel(item.sourceType))}</span>
        <span class="action-inbox-type-badge">${"\u7c7b\u578b\uff1a"}${escapeHtml(actionInboxTypeLabel(item.itemType))}</span>
        <span class="action-inbox-item-time">${escapeHtml(displayTime)}</span>
      </span>
      <span class="action-inbox-item-head">
        <strong>${escapeHtml(title)}</strong>
        <span class="action-inbox-status ${escapeHtml(tone)}">${escapeHtml(actionInboxStatusLabel(item.status))}</span>
      </span>
      <span class="action-inbox-item-summary">${escapeHtml(summary)}</span>
    </button>
    </div>
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
  const sourceLink = actionInboxSourceDeepLink(item);
  const title = actionInboxDisplayTitle(item);
  const summary = actionInboxDisplaySummary(item);
  const dueText = actionInboxTodoDueText(item);
  return `<section class="action-inbox-detail" aria-label="${"\u6536\u4ef6\u8be6\u60c5"}">
    <h3>${escapeHtml(title || item.id || "\u6536\u4ef6")}</h3>
    ${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
    <div class="action-inbox-detail-meta">
      <span class="action-inbox-source-badge ${escapeHtml(actionInboxSourceTone(item.sourceType))}">${"\u6765\u6e90\uff1a"}${escapeHtml(actionInboxSourceLabel(item.sourceType))}</span>
      <span class="action-inbox-type-badge">${"\u7c7b\u578b\uff1a"}${escapeHtml(actionInboxTypeLabel(item.itemType))}</span>
      <span class="action-inbox-status ${escapeHtml(actionInboxStatusTone(item.status))}">${escapeHtml(actionInboxStatusLabel(item.status))}</span>
      ${dueText ? `<span>${"\u622a\u6b62\uff1a"}${escapeHtml(dueText)}</span>` : ""}
      <span>${"\u66f4\u65b0\uff1a"}${escapeHtml(formatTime(item.updatedAt || item.createdAt) || item.updatedAt || item.createdAt || "")}</span>
    </div>
    ${sourceLink ? `<div class="action-inbox-detail-actions"><button class="secondary-button compact" type="button" data-action-inbox-open-source>${escapeHtml(actionInboxSourceActionLabel(item))}</button></div>` : ""}
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
    <label class="action-inbox-create-label" for="actionInboxTitle">${"\u6807\u9898"}</label>
    <input id="actionInboxTitle" name="title" autocomplete="off" placeholder="${"\u6807\u9898"}" maxlength="180" required>
    <textarea id="actionInboxSummary" name="summary" rows="3" placeholder="${"\u5907\u6ce8"}"></textarea>
    <div class="action-inbox-create-actions">
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
  const item = currentActionInboxItem();
  const creating = Boolean(state.actionInboxCreateOpen);
  $("threadTitle").textContent = creating ? "\u65b0\u589e\u4e8b\u9879" : (item ? "\u6536\u4ef6\u8be6\u60c5" : "\u6536\u4ef6\u7bb1");
  $("threadMeta").textContent = creating
    ? "\u6536\u4ef6\u7bb1"
    : (item ? `${actionInboxSourceLabel(item.sourceType)} · ${actionInboxStatusLabel(item.status)}` : actionInboxCountsText());
  $("interruptRun").disabled = true;
  configureComposer({ enabled: false, placeholder: "\u6536\u4ef6\u7bb1" });
  updateNavigationControls();
  const conversation = $("conversation");
  if (!conversation) return;
  const previousScrollTop = conversation.scrollTop || 0;
  conversation.innerHTML = `<section class="action-inbox-shell${creating || item ? " action-inbox-secondary" : ""}">
    ${creating ? renderActionInboxCreatePanel() : (item ? renderActionInboxDetail() : `${renderActionInboxFilters()}${renderActionInboxList()}`)}
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
  root.querySelector("#actionInboxCreateForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    createActionInboxManualItem(root).catch(showError);
  });
  root.querySelectorAll("[data-action-inbox-id]").forEach((button) => {
    button.addEventListener("click", () => {
      loadActionInboxItem(button.dataset.actionInboxId).catch(showError);
    });
  });
  root.querySelectorAll("[data-action-inbox-open-source-id]").forEach((button) => {
    button.addEventListener("click", () => {
      openActionInboxItemSourceById(button.dataset.actionInboxOpenSourceId).catch(showError);
    });
  });
  root.querySelector("[data-action-inbox-open-source]")?.addEventListener("click", () => {
    openCurrentActionInboxItemLink().catch(showError);
  });
  if (typeof wireTaskSwipeActions === "function") wireTaskSwipeActions(root);
}

function openActionInboxItemSource(item) {
  const link = actionInboxSourceDeepLink(item);
  if (link && typeof openHermesInternalRoute === "function") return openHermesInternalRoute(link);
  return Promise.resolve(null);
}

function openActionInboxItemSourceById(itemId) {
  const id = String(itemId || "").trim();
  const item = state.actionInboxItems.find((candidate) => candidate.id === id) || null;
  return openActionInboxItemSource(item);
}

function openCurrentActionInboxItemLink() {
  return openActionInboxItemSource(currentActionInboxItem());
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

async function mutateActionInboxItemById(itemId, action, body = {}) {
  const id = String(itemId || "").trim();
  if (!id) return null;
  const item = state.actionInboxItems.find((candidate) => candidate.id === id)
    || (currentActionInboxItem()?.id === id ? currentActionInboxItem() : null)
    || { id, workspaceId: state.selectedWorkspaceId || "owner" };
  const result = await api(`/api/action-inbox/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    body: JSON.stringify(Object.assign({ workspaceId: item.workspaceId || state.selectedWorkspaceId || "owner" }, body)),
  });
  if (state.selectedActionInboxItemId === id) {
    state.actionInboxDetail = { item: result.item, events: state.actionInboxDetail?.events || [] };
  }
  await loadActionInbox({ preserveScroll: true });
  return result;
}

async function mutateActionInboxItem(action, body = {}) {
  const item = currentActionInboxItem();
  if (!item?.id) return;
  await mutateActionInboxItemById(item.id, action, body);
}

async function completeActionInboxItemFromSwipe(itemId) {
  await mutateActionInboxItemById(itemId, "complete");
  return true;
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
