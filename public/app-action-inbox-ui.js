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

function actionInboxPluginLabel(item = {}) {
  const sourceRef = item?.sourceRef && typeof item.sourceRef === "object" ? item.sourceRef : {};
  const pluginId = String(sourceRef.pluginId || "").trim();
  if (pluginId === "finance") return "\u8bb0\u8d26";
  if (pluginId === "wardrobe") return "\u8863\u6a71";
  if (pluginId === "codex-mobile") return "Codex";
  return actionInboxSourceLabel(item.sourceType);
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
  if (value === "plugin") return "source-plugin";
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
  if (String(item?.itemType || item?.item_type || "").toLowerCase() !== "todo") return "";
  const dueAt = actionInboxTodoDueAt(item);
  return dueAt ? actionInboxCompactTime(dueAt) : "";
}

function actionInboxDisplayTitle(item = {}) {
  const dueAt = actionInboxTodoDueAt(item);
  const dueText = dueAt ? actionInboxCompactTime(dueAt) : "";
  const sourceRef = item?.sourceRef && typeof item.sourceRef === "object" ? item.sourceRef : {};
  let title = String(item?.title || item?.summary || item?.id || "\u6536\u4ef6");
  if (sourceRef.scheduledTodo && title.trim() === "\u5f85\u529e\u63d0\u9192") {
    title = String(sourceRef.automationTitle || sourceRef.reminderTitle || item?.summary || title)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !/^\u4ea4\u4ed8\u6587\u4ef6\s*[:\uff1a]/.test(line))
      || title;
  }
  return title
    .replace(/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z?/g, dueText || "");
}

function actionInboxDisplaySummary(item = {}) {
  const summary = String(item?.summary || "");
  const dueText = actionInboxTodoDueText(item);
  if (!dueText) return summary;
  const normalized = summary.replace(/(?:截止|到期|时间)\s*[:：]\s*([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z?)/ig, `\u622a\u6b62 ${dueText}`);
  return normalized === `\u622a\u6b62 ${dueText}` ? "" : normalized;
}

function actionInboxDetailMessage(item = {}) {
  const sourceRef = item?.sourceRef && typeof item.sourceRef === "object" ? item.sourceRef : {};
  const detail = sourceRef.detailMessage && typeof sourceRef.detailMessage === "object" ? sourceRef.detailMessage : null;
  const body = String(detail?.body || "").trim();
  if (!body) return null;
  return {
    format: String(detail.format || "text").toLowerCase() === "markdown" ? "markdown" : "text",
    sourceTurnId: String(detail.sourceTurnId || detail.source_turn_id || "").trim(),
    body,
    truncated: Boolean(detail.truncated),
  };
}

function actionInboxFilterQuery() {
  const filter = String(state.actionInboxStatusFilter || "todo");
  const params = new URLSearchParams({ workspaceId: state.selectedWorkspaceId || "owner", limit: "120" });
  if (filter === "todo") {
    params.set("itemType", "todo");
  } else {
    params.set("excludeItemType", "todo");
  }
  if (filter === "all") params.set("includeDone", "1");
  else if (filter && filter !== "todo") params.set("status", filter);
  if (state.actionInboxSourceFilter) params.set("sourceType", state.actionInboxSourceFilter);
  const search = typeof currentSearchText === "function" ? currentSearchText() : "";
  if (search) params.set("search", search);
  return params;
}

function actionInboxCountsText() {
  const counts = state.actionInboxCounts || {};
  const byStatus = counts.byStatus || {};
  const byItemType = counts.byItemType || {};
  const todo = Number(byItemType.todo || 0);
  const open = Number(byStatus.open || 0);
  const waiting = Number(byStatus.waiting || 0);
  const done = Number(byStatus.done || 0);
  return `${"\u5f85\u529e"} ${todo} · ${"\u5f85\u5904\u7406"} ${open} · ${"\u7a0d\u540e"} ${waiting} · ${"\u5df2\u5b8c\u6210"} ${done}`;
}

function actionInboxIsManualTodo(item = {}) {
  const sourceType = String(item?.sourceType || item?.source_type || "").trim().toLowerCase();
  const itemType = String(item?.itemType || item?.item_type || "").trim().toLowerCase();
  return sourceType === "manual" && itemType === "todo";
}

function actionInboxLinkTargetsLegacyTodo(link = "") {
  const value = String(link || "").trim();
  if (!value) return false;
  try {
    const origin = String(window?.location?.origin || "http://localhost");
    const parsed = new URL(value, origin);
    const view = String(parsed.searchParams.get("view") || parsed.searchParams.get("viewMode") || "").trim().toLowerCase();
    return view === "todos" || parsed.searchParams.has("todoId");
  } catch (_) {
    return /(?:[?&](?:view|viewMode)=todos\b|[?&]todoId=)/i.test(value);
  }
}

function actionInboxSourceDeepLink(item = {}) {
  const sourceType = String(item?.sourceType || item?.source_type || "").trim().toLowerCase();
  const explicit = String(item?.deepLink || item?.deep_link || "").trim();
  if (explicit) {
    if (actionInboxIsManualTodo(item) && actionInboxLinkTargetsLegacyTodo(explicit)) return "";
    return actionInboxAutomationInboxReturnLink(explicit, item, sourceType);
  }
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
      return actionInboxAppShellRouteForParams(params);
    }
  }
  return "";
}

function actionInboxLatestDeliverable(item = {}) {
  const sourceRef = item?.sourceRef && typeof item.sourceRef === "object" ? item.sourceRef : {};
  const direct = sourceRef.latestDeliverable && typeof sourceRef.latestDeliverable === "object" ? sourceRef.latestDeliverable : {};
  let url = String(direct.url || sourceRef.latestDeliverableUrl || sourceRef.latest_document_url || "").trim();
  if (!url) {
    const signature = String(sourceRef.signature || "").trim();
    const match = signature.match(/(\/api\/automations\/deliverable\?[^|]+)/);
    if (match) url = match[1];
  }
  if (!url) return null;
  return {
    url,
    name: String(direct.name || sourceRef.latestDocumentName || sourceRef.latest_document_name || "delivery.md").trim() || "delivery.md",
    mime: String(direct.mime || direct.contentType || sourceRef.latestDeliverableMime || "").trim(),
  };
}

function actionInboxPrimaryDeliverable(item = {}) {
  const sourceType = String(item?.sourceType || item?.source_type || "").trim().toLowerCase();
  const itemType = String(item?.itemType || item?.item_type || "").trim().toLowerCase();
  const sourceRef = item?.sourceRef && typeof item.sourceRef === "object" ? item.sourceRef : {};
  const canReadDirectly = itemType === "delivery" || (itemType === "todo" && sourceRef.scheduledTodo);
  if (sourceType !== "automation" || !canReadDirectly) return null;
  return actionInboxLatestDeliverable(item);
}

function actionInboxIsFinanceLedgerJoinRequest(item = {}) {
  const sourceRef = item?.sourceRef && typeof item.sourceRef === "object" ? item.sourceRef : {};
  return String(item?.sourceType || item?.source_type || "").trim().toLowerCase() === "plugin"
    && String(sourceRef.pluginId || "").trim() === "finance"
    && String(sourceRef.notificationType || "").trim() === "finance.ledger_join_request";
}

function actionInboxAppShellRouteForParams(params) {
  if (typeof hermesAppShellRouteForParams === "function") return hermesAppShellRouteForParams(params);
  const nextParams = new URLSearchParams(params || "");
  if (!nextParams.has("source")) nextParams.set("source", "pwa");
  const pathname = String((typeof window !== "undefined" && window.location?.pathname) || "/").trim() || "/";
  const shellPath = pathname === "/" || pathname === "/index.html"
    ? "/"
    : pathname.includes(".")
      ? "/"
      : pathname.endsWith("/")
        ? pathname
        : `${pathname}/`;
  return `${shellPath}?${nextParams.toString()}`;
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

function actionInboxDeliverableKind(deliverable = {}) {
  if (typeof artifactKind === "function") return artifactKind(deliverable);
  const name = String(deliverable.name || "").trim().toLowerCase();
  const mime = String(deliverable.mime || "").toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (mime.includes("word") || name.endsWith(".doc") || name.endsWith(".docx")) return "word";
  if (mime.includes("spreadsheet") || name.endsWith(".xls") || name.endsWith(".xlsx") || name.endsWith(".csv")) return "spreadsheet";
  if (mime.includes("markdown") || name.endsWith(".md")) return "markdown";
  if (mime.includes("text") || name.endsWith(".txt")) return "text";
  return "generic";
}

function renderActionInboxDeliverableChip(item = {}, deliverable = null) {
  if (!deliverable?.url) return "";
  const name = String(deliverable.name || "delivery").trim() || "delivery";
  const mime = String(deliverable.mime || "text/markdown").trim() || "text/markdown";
  const kind = actionInboxDeliverableKind(Object.assign({}, deliverable, { mime, name }));
  const classes = `action-inbox-deliverable-chip automation-doc-preview compact doc-${kind}`;
  const itemId = escapeHtml(item.id || "");
  return `<a class="${escapeHtml(classes)}" href="${escapeHtml(deliverable.url)}" target="_self" data-task-doc data-action-inbox-open-deliverable-id="${itemId}" data-action-inbox-deliverable-id="${itemId}" data-artifact-name="${escapeHtml(name)}" data-artifact-mime="${escapeHtml(mime)}" aria-label="${escapeHtml(`\u6253\u5f00\u6700\u540e\u4ea4\u4ed8 ${name}`)}">
    <span class="automation-doc-icon" aria-hidden="true"></span>
    <span class="automation-doc-copy">
      <span class="automation-doc-label">${"\u6700\u540e\u4ea4\u4ed8"}</span>
      <span class="automation-doc-name">${escapeHtml(name)}</span>
    </span>
  </a>`;
}

function actionInboxStatusActionLabel(item = {}) {
  const status = actionInboxStatusLabel(item.status);
  return status || "\u5f85\u5904\u7406";
}

function actionInboxActionMenuItems(item = {}) {
  const actions = [];
  if (actionInboxIsFinanceLedgerJoinRequest(item) && !actionInboxIsTerminalStatus(item.status)) {
    actions.push({ id: "finance-ledger-join-approve", label: "\u540c\u610f\u52a0\u5165", tone: "primary" });
    actions.push({ id: "finance-ledger-join-reject", label: "\u62d2\u7edd", tone: "danger" });
    return actions;
  }
  if (!actionInboxIsTerminalStatus(item.status)) {
    actions.push({ id: "complete", label: "\u5b8c\u6210", tone: "primary" });
    actions.push({ id: "snooze", label: "\u7a0d\u540e", tone: "neutral" });
    actions.push({ id: "dismiss", label: "\u5220\u9664", tone: "danger" });
  } else {
    actions.push({ id: "detail", label: "\u67e5\u770b\u6536\u4ef6\u8be6\u60c5", tone: "neutral" });
  }
  return actions;
}

function currentActionInboxActionMenuItem() {
  const id = String(state.actionInboxActionMenuItemId || "").trim();
  if (!id) return null;
  const items = Array.isArray(state.actionInboxItems) ? state.actionInboxItems : [];
  return items.find((candidate) => candidate.id === id)
    || (currentActionInboxItem()?.id === id ? currentActionInboxItem() : null)
    || null;
}

function renderActionInboxActionSheet() {
  const item = currentActionInboxActionMenuItem();
  if (!item) return "";
  const actions = actionInboxActionMenuItems(item);
  const title = actionInboxDisplayTitle(item);
  const status = actionInboxStatusLabel(item.status);
  return `<div class="action-inbox-action-sheet-layer" data-action-inbox-action-sheet>
    <button class="action-inbox-action-sheet-backdrop" type="button" data-action-inbox-menu-dismiss aria-label="${"\u5173\u95ed\u5904\u7406\u83dc\u5355"}"></button>
    <section class="action-inbox-action-sheet" role="menu" aria-label="${"\u5904\u7406\u65b9\u5f0f"}">
      <span class="action-inbox-action-sheet-handle" aria-hidden="true"></span>
      <header class="action-inbox-action-sheet-head">
        <span>${"\u5904\u7406"}</span>
        <strong>${escapeHtml(title || status || "\u6536\u4ef6")}</strong>
      </header>
      <div class="action-inbox-action-sheet-actions">
        ${actions.map((action) => `<button class="action-inbox-action-sheet-button ${escapeHtml(action.tone || "neutral")}" type="button" role="menuitem" data-action-inbox-menu-action="${escapeHtml(action.id)}" data-action-inbox-menu-id="${escapeHtml(item.id || "")}">${escapeHtml(action.label)}</button>`).join("")}
      </div>
      <button class="action-inbox-action-sheet-cancel" type="button" data-action-inbox-menu-dismiss>${"\u53d6\u6d88"}</button>
    </section>
  </div>`;
}

function actionInboxShouldShowLoading(options = {}) {
  if (options.forceLoading) return true;
  const hasItems = Array.isArray(state.actionInboxItems) && state.actionInboxItems.length > 0;
  const hasCounts = Boolean(state.actionInboxCounts);
  const hasDetail = Boolean(state.selectedActionInboxItemId && state.actionInboxDetail);
  return !hasItems && !hasCounts && !hasDetail;
}

async function loadActionInbox(options = {}) {
  const seq = (state.actionInboxRequestSeq || 0) + 1;
  state.actionInboxRequestSeq = seq;
  state.actionInboxLoading = !options.silent && actionInboxShouldShowLoading(options);
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
  const previousViewMode = state.viewMode;
  if (previousViewMode === "automation" && typeof cancelAutomationViewLoads === "function") cancelAutomationViewLoads();
  state.viewMode = "inbox";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.skillDetail = null;
  state.selectedActionInboxItemId = "";
  state.actionInboxDetail = null;
  state.actionInboxActionMenuItemId = "";
  state.actionInboxCreateOpen = false;
  state.actionInboxCreateMode = "todo";
  state.actionInboxCreateBusy = false;
  state.actionInboxCreateDraftText = "";
  state.actionInboxCreateProgressStep = "";
  renderActionInboxView();
}

function openActionInboxCreate() {
  state.skillDetail = null;
  state.selectedActionInboxItemId = "";
  state.actionInboxDetail = null;
  state.actionInboxActionMenuItemId = "";
  state.actionInboxCreateOpen = true;
  state.actionInboxCreateMode = "todo";
  state.actionInboxCreateBusy = false;
  state.actionInboxCreateDraftText = "";
  state.actionInboxCreateProgressStep = "";
  renderActionInboxView();
}

function openActionInboxPluginAuditCreate() {
  state.skillDetail = null;
  state.selectedActionInboxItemId = "";
  state.actionInboxDetail = null;
  state.actionInboxActionMenuItemId = "";
  state.actionInboxCreateOpen = true;
  state.actionInboxCreateMode = "plugin-audit";
  state.actionInboxCreateBusy = false;
  state.actionInboxCreateDraftText = "";
  state.actionInboxCreateProgressStep = "";
  state.actionInboxPluginAuditPluginId = state.actionInboxPluginAuditPluginId || "codex-mobile";
  state.actionInboxPluginAuditMode = state.actionInboxPluginAuditMode || "alignment";
  renderActionInboxView();
}

function renderActionInboxFilters() {
  const filters = [
    ["todo", "\u5f85\u529e"],
    ["open", "\u5f85\u5904\u7406"],
    ["waiting", "\u7a0d\u540e"],
    ["done", "\u5df2\u5b8c\u6210"],
    ["all", "\u5176\u4ed6"],
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
  const swipeAttrs = terminal ? "" : ` data-swipe-row data-swipe-kind="action-inbox" data-swipe-commit="full" data-swipe-id="${escapeHtml(item.id || "")}"`;
  const dueText = actionInboxTodoDueText(item);
  const displayTime = dueText ? `${"\u622a\u6b62"} ${dueText}` : (actionInboxCompactTime(time) || time || "");
  const title = actionInboxDisplayTitle(item);
  const summary = actionInboxDisplaySummary(item);
  const primaryDeliverable = actionInboxPrimaryDeliverable(item);
  const directSource = actionInboxOpensSourceDirectly(item);
  const statusMenuOpen = state.actionInboxActionMenuItemId === item.id;
  const itemActionAttr = directSource
    ? `data-action-inbox-open-source-id="${escapeHtml(item.id || "")}"`
    : `data-action-inbox-id="${escapeHtml(item.id || "")}"`;
  return `<article class="action-inbox-item${active}${swipeClass}" data-action-inbox-item-card="${escapeHtml(item.id || "")}"${swipeAttrs}>
    ${terminal ? "" : `<button class="task-swipe-delete action-inbox-swipe-complete" type="button" data-complete-swipe="${escapeHtml(item.id || "")}" aria-label="${"\u6807\u8bb0\u4e3a\u5b8c\u6210"}">${"\u5b8c\u6210"}</button>`}
    <div class="${terminal ? "action-inbox-item-static" : "task-swipe-content action-inbox-swipe-content"}"${terminal ? "" : " data-swipe-content"}>
    <div class="action-inbox-source-row">
      <span class="action-inbox-source-badge ${escapeHtml(actionInboxSourceTone(item.sourceType))}">${"\u6765\u6e90\uff1a"}${escapeHtml(actionInboxPluginLabel(item))}</span>
      <span class="action-inbox-type-badge">${"\u7c7b\u578b\uff1a"}${escapeHtml(actionInboxTypeLabel(item.itemType))}</span>
      <button class="action-inbox-state-badge action-inbox-state-action ${escapeHtml(tone)}" type="button" data-action-inbox-actions-id="${escapeHtml(item.id || "")}" aria-haspopup="menu" aria-expanded="${statusMenuOpen ? "true" : "false"}" aria-label="${escapeHtml(`\u72b6\u6001\uff1a${actionInboxStatusLabel(item.status)}\uff0c\u6253\u5f00\u5904\u7406\u65b9\u5f0f`)}">${escapeHtml(actionInboxStatusActionLabel(item))}</button>
      <span class="action-inbox-item-time">${escapeHtml(displayTime)}</span>
    </div>
    <button class="action-inbox-item-main" type="button" ${itemActionAttr}>
      <span class="action-inbox-item-head">
        <strong>${escapeHtml(title)}</strong>
      </span>
      <span class="action-inbox-item-summary">${escapeHtml(summary)}</span>
    </button>
    ${renderActionInboxDeliverableChip(item, primaryDeliverable)}
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
  const detailMessage = actionInboxDetailMessage(item);
  const dueText = actionInboxTodoDueText(item);
  const tone = actionInboxStatusTone(item.status);
  const statusMenuOpen = state.actionInboxActionMenuItemId === item.id;
  return `<section class="action-inbox-detail" aria-label="${"\u6536\u4ef6\u8be6\u60c5"}">
    <h3>${escapeHtml(title || item.id || "\u6536\u4ef6")}</h3>
    ${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
    ${detailMessage ? `<section class="action-inbox-detail-message">
      <div class="action-inbox-detail-message-head">
        <span>${"\u8be6\u7ec6\u56de\u6267"}</span>
        ${detailMessage.truncated ? `<em>${"\u5df2\u622a\u65ad"}</em>` : ""}
      </div>
      ${detailMessage.sourceTurnId ? `<div class="action-inbox-detail-message-meta">${escapeHtml(detailMessage.sourceTurnId)}</div>` : ""}
      <pre>${escapeHtml(detailMessage.body)}</pre>
    </section>` : ""}
    <div class="action-inbox-detail-meta">
      <span class="action-inbox-source-badge ${escapeHtml(actionInboxSourceTone(item.sourceType))}">${"\u6765\u6e90\uff1a"}${escapeHtml(actionInboxPluginLabel(item))}</span>
      <span class="action-inbox-type-badge">${"\u7c7b\u578b\uff1a"}${escapeHtml(actionInboxTypeLabel(item.itemType))}</span>
      <button class="action-inbox-state-badge action-inbox-state-action ${escapeHtml(tone)}" type="button" data-action-inbox-actions-id="${escapeHtml(item.id || "")}" aria-haspopup="menu" aria-expanded="${statusMenuOpen ? "true" : "false"}" aria-label="${escapeHtml(`\u72b6\u6001\uff1a${actionInboxStatusLabel(item.status)}\uff0c\u6253\u5f00\u5904\u7406\u65b9\u5f0f`)}">${escapeHtml(actionInboxStatusActionLabel(item))}</button>
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
  </section>${renderActionInboxActionSheet()}`;
}

function renderActionInboxCreatePanel() {
  if (!state.actionInboxCreateOpen) return "";
  if (state.actionInboxCreateMode === "plugin-audit") return renderActionInboxPluginAuditCreatePanel();
  const progressText = actionInboxCreateProgressText();
  const draftText = String(state.actionInboxCreateDraftText || "");
  return `<form class="action-inbox-create" id="actionInboxCreateForm">
    <label class="action-inbox-create-label" for="actionInboxNaturalText">${"\u5f85\u529e\u5185\u5bb9"}</label>
    <textarea id="actionInboxNaturalText" name="naturalText" rows="5" autocomplete="off" placeholder="${"\u4f8b\u5982\uff1a\u660e\u5929\u4e0b\u5348\u4e09\u70b9\u63d0\u9192\u6211\u7ed9\u5434\u840d\u53d1\u6750\u6599"}" maxlength="1000" required ${state.actionInboxCreateBusy ? "disabled" : ""}>${escapeHtml(draftText)}</textarea>
    ${progressText ? `<div class="action-inbox-create-progress" role="status" aria-live="polite"><span class="automation-loading-spinner" aria-hidden="true"></span><span>${escapeHtml(progressText)}</span></div>` : ""}
    <div class="action-inbox-create-actions">
      <button class="primary-button compact" type="submit" ${state.actionInboxCreateBusy ? "disabled" : ""}>${state.actionInboxCreateBusy ? "\u6b63\u5728\u7406\u89e3" : "\u751f\u6210\u5e76\u4fdd\u5b58"}</button>
    </div>
  </form>`;
}

function renderActionInboxPluginAuditCreatePanel() {
  const progressText = actionInboxCreateProgressText();
  const instructions = String(state.actionInboxCreateDraftText || "");
  const pluginId = String(state.actionInboxPluginAuditPluginId || "codex-mobile");
  const auditMode = String(state.actionInboxPluginAuditMode || "alignment");
  return `<form class="action-inbox-create" id="actionInboxCreateForm" data-action-inbox-create-mode="plugin-audit">
    <label class="action-inbox-create-label" for="actionInboxPluginAuditPluginId">插件工作区审计</label>
    <input id="actionInboxPluginAuditPluginId" name="pluginId" type="text" autocomplete="off" value="${escapeHtml(pluginId)}" placeholder="codex-mobile" ${state.actionInboxCreateBusy ? "disabled" : ""}>
    <select id="actionInboxPluginAuditMode" name="auditMode" ${state.actionInboxCreateBusy ? "disabled" : ""}>
      ${[["alignment", "目标一致性"], ["recent_changes", "最近变更"], ["dirty_diff", "未提交变更"], ["full_sample", "全仓抽样"]].map(([value, label]) => `<option value="${escapeHtml(value)}"${auditMode === value ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}
    </select>
    <textarea id="actionInboxNaturalText" name="naturalText" rows="4" autocomplete="off" placeholder="补充审计重点，可留空" maxlength="1000" ${state.actionInboxCreateBusy ? "disabled" : ""}>${escapeHtml(instructions)}</textarea>
    ${progressText ? `<div class="action-inbox-create-progress" role="status" aria-live="polite"><span class="automation-loading-spinner" aria-hidden="true"></span><span>${escapeHtml(progressText)}</span></div>` : ""}
    <div class="action-inbox-create-actions">
      <button class="primary-button compact" type="submit" ${state.actionInboxCreateBusy ? "disabled" : ""}>${state.actionInboxCreateBusy ? "正在提交" : "立即审计"}</button>
    </div>
  </form>`;
}

function actionInboxCreateProgressText() {
  const step = String(state.actionInboxCreateProgressStep || "");
  if (state.actionInboxCreateMode === "plugin-audit") {
    if (step === "saving") return "正在提交插件工作区审计";
    if (step === "done") return "插件工作区审计已提交";
    return "";
  }
  if (step === "understanding") return "\u6b63\u5728\u8bf7\u6a21\u578b\u7406\u89e3\u5f85\u529e\u5185\u5bb9";
  if (step === "drafting") return "\u6b63\u5728\u751f\u6210\u5f85\u529e\u8349\u7a3f";
  if (step === "saving") return "\u6b63\u5728\u786e\u8ba4\u5e76\u4fdd\u5b58\u5f85\u529e";
  return "";
}

function renderActionInboxList() {
  if (state.actionInboxLoading) return `<div class="automation-loading" role="status" aria-live="polite"><span class="automation-loading-spinner" aria-hidden="true"></span><span>${"\u6b63\u5728\u5237\u65b0\u6536\u4ef6\u7bb1"}</span></div>`;
  if (!state.actionInboxItems.length) return `<div class="empty-state">${"\u5f53\u524d\u6ca1\u6709\u9700\u8981\u5904\u7406\u7684\u4e8b\u9879\u3002"}</div>`;
  return `<div class="action-inbox-list">${state.actionInboxItems.map(renderActionInboxItem).join("")}</div>${renderActionInboxActionSheet()}`;
}

function renderActionInboxView(options = {}) {
  applyViewMode();
  Object.assign(state, { currentThread: null, currentThreadId: "", currentTaskGroupId: "", threads: [] });
  const list = $("threadList");
  if (list) list.innerHTML = "";
  const item = currentActionInboxItem();
  const creating = Boolean(state.actionInboxCreateOpen);
  $("threadTitle").textContent = creating ? (state.actionInboxCreateMode === "plugin-audit" ? "新建审计" : "\u65b0\u589e\u4e8b\u9879") : (item ? "\u6536\u4ef6\u8be6\u60c5" : "\u6536\u4ef6\u7bb1");
  $("threadMeta").textContent = creating
    ? "\u6536\u4ef6\u7bb1"
    : (item ? `${actionInboxPluginLabel(item)} · ${actionInboxStatusLabel(item.status)}` : actionInboxCountsText());
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
      state.actionInboxActionMenuItemId = "";
      loadActionInbox().catch(showError);
    });
  });
  root.querySelector("#actionInboxCreateForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.actionInboxCreateMode === "plugin-audit") createActionInboxPluginAuditPlan(root).catch(showError);
    else createActionInboxManualItem(root).catch(showError);
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
  root.querySelectorAll("[data-action-inbox-open-deliverable-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      openActionInboxItemDeliverableById(button.dataset.actionInboxOpenDeliverableId || button.dataset.actionInboxDeliverableId).catch(showError);
    });
  });
  root.querySelectorAll("[data-action-inbox-actions-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = button.dataset.actionInboxActionsId || "";
      state.actionInboxActionMenuItemId = state.actionInboxActionMenuItemId === id ? "" : id;
      renderActionInboxView({ preserveScroll: true });
    });
  });
  root.querySelectorAll("[data-action-inbox-menu-dismiss]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.actionInboxActionMenuItemId = "";
      renderActionInboxView({ preserveScroll: true });
    });
  });
  root.querySelectorAll("[data-action-inbox-menu-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleActionInboxMenuAction(button.dataset.actionInboxMenuId || "", button.dataset.actionInboxMenuAction || "").catch(showError);
    });
  });
  root.querySelector("[data-action-inbox-open-source]")?.addEventListener("click", () => {
    openCurrentActionInboxItemLink().catch(showError);
  });
  if (typeof wireTaskDocumentLinks === "function") wireTaskDocumentLinks(root);
  if (typeof wireTaskSwipeActions === "function") wireTaskSwipeActions(root);
}

function openActionInboxItemSource(item) {
  const link = actionInboxSourceDeepLink(item);
  if (typeof recordNavigationDiagnostic === "function") {
    recordNavigationDiagnostic("action_inbox_open_source", {
      itemId: String(item?.id || "").slice(0, 120),
      sourceType: String(item?.sourceType || item?.source_type || "").slice(0, 40),
      itemType: String(item?.itemType || item?.item_type || "").slice(0, 40),
      hasDeepLink: Boolean(item?.deepLink || item?.deep_link),
      sourceId: String(item?.sourceId || item?.source_id || "").slice(0, 120),
      sourceAutomationId: String(item?.sourceRef?.automationId || item?.sourceRef?.automation_id || "").slice(0, 120),
      route: String(link || "").slice(0, 240),
    });
  }
  if (link && typeof openHermesInternalRoute === "function") return openHermesInternalRoute(link);
  if (typeof recordNavigationDiagnostic === "function") {
    recordNavigationDiagnostic("action_inbox_open_source_no_route", {
      itemId: String(item?.id || "").slice(0, 120),
      hasInternalRouteHelper: typeof openHermesInternalRoute === "function",
    });
  }
  return Promise.resolve(null);
}

function openActionInboxItemSourceById(itemId) {
  const id = String(itemId || "").trim();
  const item = state.actionInboxItems.find((candidate) => candidate.id === id)
    || (currentActionInboxItem()?.id === id ? currentActionInboxItem() : null);
  return openActionInboxItemSource(item);
}

function openActionInboxItemDeliverable(item) {
  const deliverable = actionInboxPrimaryDeliverable(item) || actionInboxLatestDeliverable(item);
  if (!deliverable?.url) return Promise.resolve(null);
  if (typeof document !== "undefined" && typeof openTaskDocumentLink === "function") {
    const link = document.createElement("a");
    link.href = deliverable.url;
    link.setAttribute("href", deliverable.url);
    link.dataset.taskDoc = "1";
    link.dataset.artifactName = deliverable.name || "delivery.md";
    link.dataset.artifactMime = deliverable.mime || "text/markdown";
    openTaskDocumentLink(link);
    return Promise.resolve(true);
  }
  if (typeof openHermesInternalRoute === "function") return openHermesInternalRoute(deliverable.url);
  return Promise.resolve(null);
}

function openActionInboxItemDeliverableById(itemId) {
  const id = String(itemId || "").trim();
  const item = state.actionInboxItems.find((candidate) => candidate.id === id) || null;
  return openActionInboxItemDeliverable(item);
}

async function handleActionInboxMenuAction(itemId, action) {
  const id = String(itemId || "").trim();
  const item = state.actionInboxItems.find((candidate) => candidate.id === id)
    || (currentActionInboxItem()?.id === id ? currentActionInboxItem() : null);
  state.actionInboxActionMenuItemId = "";
  if (!id || !item) {
    renderActionInboxView({ preserveScroll: true });
    return;
  }
  if (action === "deliverable") return openActionInboxItemDeliverable(item);
  if (action === "source") return openActionInboxItemSource(item);
  if (action === "finance-ledger-join-approve") return reviewFinanceLedgerJoinRequestById(id, "approve");
  if (action === "finance-ledger-join-reject") return reviewFinanceLedgerJoinRequestById(id, "reject");
  if (action === "complete") return mutateActionInboxItemById(id, "complete");
  if (action === "snooze") return mutateActionInboxItemById(id, "snooze");
  if (action === "dismiss") return mutateActionInboxItemById(id, "dismiss");
  await loadActionInboxItem(id);
}

async function reviewFinanceLedgerJoinRequestById(itemId, decision) {
  const id = String(itemId || "").trim();
  if (!id) return null;
  const item = state.actionInboxItems.find((candidate) => candidate.id === id)
    || (currentActionInboxItem()?.id === id ? currentActionInboxItem() : null)
    || { id, workspaceId: state.selectedWorkspaceId || "owner" };
  const result = await api(`/api/action-inbox/${encodeURIComponent(id)}/finance-ledger-join/${decision}`, {
    method: "POST",
    body: JSON.stringify({
      workspaceId: item.workspaceId || state.selectedWorkspaceId || "owner",
    }),
  });
  if (state.selectedActionInboxItemId === id) {
    state.actionInboxDetail = { item: result.item, events: state.actionInboxDetail?.events || [] };
  }
  await loadActionInbox({ preserveScroll: true });
  if (typeof requestEmbeddedPluginRefresh === "function" && typeof EMBEDDED_PLUGIN_DEFS !== "undefined" && EMBEDDED_PLUGIN_DEFS.finance) {
    requestEmbeddedPluginRefresh(EMBEDDED_PLUGIN_DEFS.finance, { reason: "finance_ledger_join_reviewed" });
  }
  return result;
}

function openCurrentActionInboxItemLink() {
  return openActionInboxItemSource(currentActionInboxItem());
}

async function createActionInboxManualItem(root) {
  const naturalText = root.querySelector("#actionInboxNaturalText")?.value?.trim() || "";
  if (!naturalText) return;
  state.actionInboxCreateBusy = true;
  state.actionInboxCreateDraftText = naturalText;
  state.actionInboxCreateProgressStep = "understanding";
  renderActionInboxView({ preserveScroll: true });
  try {
    const interpreted = await api("/api/action-inbox/todo-drafts/interpret", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: state.selectedWorkspaceId || "owner",
        creatorWorkspaceId: state.selectedWorkspaceId || "owner",
        text: naturalText,
      }),
    });
    state.actionInboxCreateProgressStep = "drafting";
    if (state.actionInboxCreateOpen && state.viewMode === "inbox") renderActionInboxView({ preserveScroll: true });
    const draft = interpreted.draft || {};
    const missingFields = Array.isArray(interpreted.missingFields)
      ? interpreted.missingFields
      : (Array.isArray(draft.missingFields) ? draft.missingFields : []);
    if (interpreted.needsConfirmation || draft.needsConfirmation || missingFields.length) {
      throw new Error(missingFields.length
        ? `\u5f85\u529e\u4fe1\u606f\u8fd8\u9700\u8981\u8865\u5145\uff1a${missingFields.join("\uff0c")}`
        : "\u5f85\u529e\u4fe1\u606f\u8fd8\u9700\u8981\u786e\u8ba4");
    }
    state.actionInboxCreateProgressStep = "saving";
    if (state.actionInboxCreateOpen && state.viewMode === "inbox") renderActionInboxView({ preserveScroll: true });
    const result = await api("/api/action-inbox/todos", {
      method: "POST",
      body: JSON.stringify(Object.assign({}, draft, {
        creatorWorkspaceId: state.selectedWorkspaceId || "owner",
        assigneeWorkspaceId: draft.assigneeWorkspaceId || state.selectedWorkspaceId || "owner",
        sourceText: naturalText,
        confirmed: true,
      })),
    });
    state.actionInboxCreateOpen = false;
    state.actionInboxCreateDraftText = "";
    state.actionInboxCreateProgressStep = "";
    state.selectedActionInboxItemId = result.item?.id || "";
    await loadActionInbox({ preserveScroll: true });
  } finally {
    state.actionInboxCreateBusy = false;
    state.actionInboxCreateProgressStep = "";
    if (state.actionInboxCreateOpen && state.viewMode === "inbox") renderActionInboxView({ preserveScroll: true });
  }
}

async function createActionInboxPluginAuditPlan(root) {
  const pluginId = root.querySelector("#actionInboxPluginAuditPluginId")?.value?.trim() || "codex-mobile";
  const auditMode = root.querySelector("#actionInboxPluginAuditMode")?.value?.trim() || "alignment";
  const instructions = root.querySelector("#actionInboxNaturalText")?.value?.trim() || "";
  if (!pluginId) return;
  state.actionInboxCreateBusy = true;
  state.actionInboxPluginAuditPluginId = pluginId;
  state.actionInboxPluginAuditMode = auditMode;
  state.actionInboxCreateDraftText = instructions;
  state.actionInboxCreateProgressStep = "saving";
  renderActionInboxView({ preserveScroll: true });
  try {
    const result = await api("/api/automations/plugin-workspace-audits/run", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: state.selectedWorkspaceId || "owner",
        pluginId,
        auditMode,
        instructions,
      }),
    });
    state.actionInboxCreateOpen = false;
    state.actionInboxCreateMode = "todo";
    state.actionInboxCreateBusy = false;
    state.actionInboxCreateDraftText = "";
    state.actionInboxCreateProgressStep = "";
    state.actionInboxStatusFilter = "open";
    if (typeof invalidateAutomationListCache === "function") invalidateAutomationListCache();
    const jobId = String(result?.job?.id || result?.createdJob?.id || "").trim();
    const message = jobId
      ? `插件审计已提交，后台执行中：${jobId}`
      : "插件审计已提交，后台执行中";
    if (typeof showPushToast === "function") showPushToast(message, "success");
    else if (typeof $ === "function" && $("connectionState")) $("connectionState").textContent = message;
    await loadActionInbox({ preserveScroll: false });
  } catch (err) {
    state.actionInboxCreateBusy = false;
    state.actionInboxCreateProgressStep = "";
    renderActionInboxView({ preserveScroll: true });
    throw err;
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
