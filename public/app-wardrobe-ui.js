"use strict";

const WARDROBE_ROUTE_PATTERN = /(?:\bwardrobe\b|\bcloset\b|\boutfit\b|\u8863\u6a71|\u7a7f\u642d)/i;
const WARDROBE_DIRECTORY_PATTERN = /(?:\bwardrobe\b|\bcloset\b|\u8863\u6a71)/i;
const WARDROBE_SECTION_OPTIONS = Object.freeze([
  Object.freeze({ id: "overview", label: "\u603b\u89c8" }),
  Object.freeze({ id: "watch", label: "\u8155\u8868" }),
  Object.freeze({ id: "maintenance", label: "\u4fdd\u517b" }),
  Object.freeze({ id: "wear", label: "\u7a7f\u7740" }),
  Object.freeze({ id: "looks", label: "\u5957\u88c5" }),
  Object.freeze({ id: "log", label: "\u65e5\u5fd7" }),
]);

function wardrobeSectionId(value) {
  const id = String(value || "").trim();
  return WARDROBE_SECTION_OPTIONS.some((item) => item.id === id) ? id : "overview";
}

function currentWardrobeSection() {
  state.wardrobeSection = wardrobeSectionId(state.wardrobeSection);
  return state.wardrobeSection;
}

function setWardrobeSection(sectionId) {
  state.wardrobeSection = wardrobeSectionId(sectionId);
  localStorage.setItem("hermesWardrobeSection", state.wardrobeSection);
  state.wardrobeOverview = null;
  closeTopMoreMenu?.();
  renderWardrobeView();
}

function wardrobeRouteText(item = {}) {
  return [
    item.id,
    item.projectId,
    item.subprojectId,
    item.label,
    item.name,
    item.root,
    item.path,
    ...(Array.isArray(item.aliases) ? item.aliases : []),
  ].map((value) => String(value || "").trim()).filter(Boolean).join(" ");
}

function itemLooksWardrobe(item = {}) {
  return WARDROBE_ROUTE_PATTERN.test(wardrobeRouteText(item));
}

function itemLooksWardrobeDirectory(item = {}) {
  return WARDROBE_DIRECTORY_PATTERN.test(wardrobeRouteText(item));
}

function wardrobeChildRouteText(child = {}) {
  const rootTail = String(child.root || child.path || "").trim().replaceAll("\\", "/").replace(/\/+$/, "").split("/").filter(Boolean).pop() || "";
  return [
    child.id,
    child.projectId,
    child.subprojectId,
    child.label,
    child.name,
    rootTail,
    ...(Array.isArray(child.aliases) ? child.aliases : []),
  ].map((value) => String(value || "").trim()).filter(Boolean).join(" ");
}

function selectedWorkspaceToolsets() {
  const workspace = (state.workspaces || []).find((item) => item.id === state.selectedWorkspaceId) || null;
  const values = [
    ...(Array.isArray(workspace?.localConfig?.allowedToolsets) ? workspace.localConfig.allowedToolsets : []),
    ...(Array.isArray(workspace?.bindings?.allowedToolsets) ? workspace.bindings.allowedToolsets : []),
  ];
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))];
}

function workspaceAllowsWardrobeToolset() {
  return selectedWorkspaceToolsets().includes("wardrobe");
}

function wardrobeDirectoryCandidates() {
  const candidates = [];
  (state.projects || []).forEach((project) => {
    if (!project?.root) return;
    if (itemLooksWardrobeDirectory(project)) {
      candidates.push({ project, child: null, score: 4 });
    }
    (project.children || []).forEach((child) => {
      if (!child?.root) return;
      const text = wardrobeChildRouteText(child);
      if (!WARDROBE_DIRECTORY_PATTERN.test(text)) return;
      candidates.push({ project, child, score: 4 });
    });
  });
  return candidates.sort((a, b) => b.score - a.score);
}

function wardrobeDirectoryAttachment() {
  const candidate = wardrobeDirectoryCandidates()[0] || null;
  if (!candidate) return null;
  const label = candidate.child
    ? `${projectDisplayLabel(candidate.project)} / ${candidate.child.label || candidate.child.id}`
    : projectDisplayLabel(candidate.project);
  if (typeof directoryAttachmentFromRoute === "function") {
    return directoryAttachmentFromRoute(
      candidate.project.id,
      candidate.child?.id || "",
      candidate.child?.root || candidate.project.root,
      label,
    );
  }
  return {
    projectId: candidate.project.id,
    subprojectId: candidate.child?.id || "",
    label,
    root: candidate.child?.root || candidate.project.root,
    path: candidate.child?.root || candidate.project.root,
  };
}

function wardrobeEntryAvailable() {
  return Boolean(wardrobeDirectoryAttachment() || workspaceAllowsWardrobeToolset());
}

function updateWardrobeNavigationAvailability() {
  const available = wardrobeEntryAvailable();
  state.wardrobeAvailable = available;
  const button = $("bottomWardrobeMode");
  const nav = $("bottomNav");
  if (button) {
    button.hidden = !available;
    button.setAttribute("aria-hidden", available ? "false" : "true");
  }
  nav?.classList.toggle("wardrobe-visible", available);
  $("app")?.classList.toggle("wardrobe-capable", available);
  return available;
}

function numberLabel(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? String(number) : "0";
}

function metricLabel(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text) return text;
  return numberLabel(value);
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function renderWardrobeMetric(label, value) {
  return `
    <div class="wardrobe-metric">
      <span class="wardrobe-metric-value">${escapeHtml(metricLabel(value))}</span>
      <span class="wardrobe-metric-label">${escapeHtml(label)}</span>
    </div>`;
}

function currentWardrobePluginManifest() {
  const workspaceId = state.selectedWorkspaceId || "owner";
  const manifest = state.wardrobePluginManifest || null;
  return manifest?.workspaceId === workspaceId ? manifest : null;
}

function wardrobePluginAvailable(manifest = currentWardrobePluginManifest()) {
  return Boolean(manifest?.available && manifest?.entry?.url && manifest?.kind === "embedded_app");
}

function renderWardrobePluginFrame(manifest) {
  return `
    <div class="wardrobe-plugin-shell">
      <iframe
        class="wardrobe-plugin-frame"
        title="${escapeHtml(manifest.title || "\u8863\u6a71")}"
        src="${escapeHtml(manifest.entry.url)}"
        loading="eager"
        referrerpolicy="no-referrer"
        sandbox="allow-same-origin allow-scripts allow-forms allow-downloads"
      ></iframe>
    </div>`;
}

function renderWardrobePluginLoading() {
  return `
    <section class="wardrobe-view">
      <div class="wardrobe-dashboard loading">
        <div class="wardrobe-inline-empty">Loading Wardrobe plugin...</div>
      </div>
    </section>`;
}

function formatCurrency(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || !number) return "";
  return `\u00a5${Math.round(number).toLocaleString("zh-CN")}`;
}

function renderWardrobeBrandOption(item, activeBrand = "") {
  const key = firstText(item.key, item.label, item.name);
  if (!key || key === "unknown") return "";
  const active = key === activeBrand;
  return `
    <button class="wardrobe-filter-chip${active ? " active" : ""}" type="button" data-wardrobe-brand="${escapeHtml(key)}" aria-pressed="${active ? "true" : "false"}">
      <span>${escapeHtml(key)}</span>
      <strong>${escapeHtml(numberLabel(item.count))}</strong>
    </button>`;
}

function renderWardrobeGroupList(groups = [], empty = "\u6682\u65e0\u8bb0\u5f55", options = {}) {
  const rows = Array.isArray(groups) ? groups.slice(0, options.limit || 6) : [];
  if (!rows.length) return `<div class="wardrobe-inline-empty">${escapeHtml(empty)}</div>`;
  return rows.map((item) => `
    <div class="wardrobe-inline-row">
      <span>${escapeHtml(firstText(item.key, item.label, item.name, item.code, "-"))}</span>
      <strong>${escapeHtml(options.amount ? (formatCurrency(item.amount || item.value) || numberLabel(item.count)) : numberLabel(item.count || item.wear_total || item.value))}</strong>
    </div>`).join("");
}

function renderWardrobeIssueList(dataQuality = {}) {
  const checks = dataQuality.checks && typeof dataQuality.checks === "object" ? dataQuality.checks : {};
  const entries = Object.entries(checks)
    .filter(([, count]) => Number(count || 0) > 0)
    .slice(0, 5);
  if (!entries.length) return `<div class="wardrobe-inline-empty">\u6682\u65e0\u660e\u663e\u8d28\u91cf\u95ee\u9898</div>`;
  return entries.map(([key, count]) => `
    <div class="wardrobe-inline-row">
      <span>${escapeHtml(key.replace(/_/g, " "))}</span>
      <strong>${escapeHtml(numberLabel(count))}</strong>
    </div>`).join("");
}

function renderWardrobeToolbar(projection = {}) {
  const filters = Object.assign({ q: "", brand: "" }, state.wardrobeFilters || {}, projection.filters || {});
  const brands = projection.inventory?.brandGroups || [];
  return `
    <div class="wardrobe-toolbar">
      <input id="wardrobeSearchInput" class="wardrobe-search-input" type="search" value="${escapeHtml(filters.q || "")}" placeholder="\u641c\u7d22\u8d27\u53f7 / Section / \u6750\u8d28" autocomplete="off">
      <div class="wardrobe-filter-row">
        <button class="wardrobe-filter-chip${filters.brand ? "" : " active"}" type="button" data-wardrobe-brand="" aria-pressed="${filters.brand ? "false" : "true"}">\u5168\u90e8</button>
        ${brands.map((item) => renderWardrobeBrandOption(item, filters.brand)).join("")}
      </div>
    </div>`;
}

function renderWardrobeDistribution(groups = []) {
  const rows = Array.isArray(groups) ? groups.slice(0, 6) : [];
  const total = rows.reduce((sum, item) => sum + Number(item.amount || item.value || 0), 0);
  if (!rows.length) return "";
  return `
    <section class="wardrobe-dashboard-panel wardrobe-distribution-panel">
      <h3>\u54c1\u724c\u5206\u5e03</h3>
      <div class="wardrobe-donut" style="--brand-a:${Math.max(0, Math.min(100, rows[0]?.percent || 0))}">
        <span>${escapeHtml(formatCurrency(total) || numberLabel(rows.reduce((sum, item) => sum + Number(item.count || 0), 0)))}</span>
      </div>
      ${renderWardrobeGroupList(rows, "\u6682\u65e0\u54c1\u724c\u7edf\u8ba1", { amount: true })}
    </section>`;
}

function renderWardrobeItemTable(items = [], title = "\u5355\u54c1") {
  const rows = Array.isArray(items) ? items.slice(0, 80) : [];
  if (!rows.length) {
    return `
      <section class="wardrobe-item-list">
        <h3>${escapeHtml(title)}</h3>
        <div class="wardrobe-inline-empty">\u6ca1\u6709\u5339\u914d\u7684\u5355\u54c1</div>
      </section>`;
  }
  return `
    <section class="wardrobe-item-list">
      <div class="wardrobe-section-heading">
        <h3>${escapeHtml(title)}</h3>
        <span>${escapeHtml(numberLabel(rows.length))}</span>
      </div>
      <div class="wardrobe-item-table" role="table" aria-label="\u8863\u6a71\u5355\u54c1">
        <div class="wardrobe-item-row header" role="row">
          <span>Section</span>
          <span>\u54c1\u724c</span>
          <span>\u4ef7\u683c</span>
        </div>
        ${rows.map((item) => `
          <div class="wardrobe-item-row" role="row">
            <button class="wardrobe-item-filter" type="button" data-wardrobe-item-code="${escapeHtml(item.code || item.section || "")}">${escapeHtml(item.section || item.code || "-")}</button>
            <span>${escapeHtml(item.brand || "-")}</span>
            <span>${escapeHtml(item.priceLabel || formatCurrency(item.priceCny) || "-")}</span>
          </div>`).join("")}
      </div>
    </section>`;
}

function renderWardrobeSectionTitle(title, meta = "") {
  return `
    <div class="wardrobe-section-title">
      <h3>${escapeHtml(title)}</h3>
      ${meta ? `<span>${escapeHtml(meta)}</span>` : ""}
    </div>`;
}

function renderWardrobeMaintenanceView(projection = {}) {
  const maintenance = projection.maintenance || {};
  const due = Array.isArray(maintenance.dueItems) ? maintenance.dueItems : [];
  return `
    ${renderWardrobeSectionTitle("\u4fdd\u517b", "\u6309\u9608\u503c\u548c\u7a7f\u7740\u6b21\u6570\u6392\u5e8f")}
    <div class="wardrobe-metrics">
      ${renderWardrobeMetric("\u9700\u5173\u6ce8", due.length)}
      ${renderWardrobeMetric("\u5df2\u7edf\u8ba1", maintenance.itemCount)}
      ${renderWardrobeMetric("\u7b49\u7ea7", (maintenance.groups || []).length)}
    </div>
    <section class="wardrobe-dashboard-panel">
      <h3>\u4fdd\u517b\u72b6\u6001</h3>
      ${renderWardrobeGroupList(maintenance.groups, "\u6682\u65e0\u4fdd\u517b\u63d0\u9192")}
    </section>
    ${renderWardrobeItemTable(due.map(normalizeWardrobeDashboardItem), "\u9700\u5173\u6ce8")}
  `;
}

function normalizeWardrobeDashboardItem(item = {}) {
  return {
    code: firstText(item.code, item.id),
    section: firstText(item.section, item.display_name, item.name, item.code),
    brand: firstText(item.brand),
    priceLabel: firstText(item.price_cny, item.price_original),
    priceCny: 0,
  };
}

function renderWardrobeWatchView(projection = {}) {
  const watch = projection.watch || {};
  const totals = watch.totals || {};
  const items = projection.items?.items || [];
  return `
    ${renderWardrobeSectionTitle("\u8155\u8868", "\u72ec\u7acb\u4ece Wardrobe MCP \u8bfb\u53d6")}
    <div class="wardrobe-metrics">
      ${renderWardrobeMetric("\u4ef6\u6570", totals.count || watch.itemCount || items.length)}
      ${renderWardrobeMetric("\u5747\u4ef7", formatCurrency(totals.average_price))}
      ${renderWardrobeMetric("\u603b\u989d", formatCurrency(totals.amount))}
    </div>
    <section class="wardrobe-dashboard-panel">
      <h3>\u54c1\u724c</h3>
      ${renderWardrobeGroupList(watch.groups, "\u6682\u65e0\u8155\u8868\u7edf\u8ba1", { amount: true })}
    </section>
    ${renderWardrobeItemTable(items, "\u8155\u8868")}
  `;
}

function renderWardrobeWearView(projection = {}) {
  const wear = projection.wear || {};
  const history = projection.recentHistory || {};
  return `
    ${renderWardrobeSectionTitle("\u7a7f\u7740", "\u4ece\u7a7f\u7740\u8bb0\u5f55\u548c\u5355\u54c1\u6b21\u6570\u6c47\u603b")}
    <div class="wardrobe-metrics">
      ${renderWardrobeMetric("\u5355\u54c1", wear.itemCount)}
      ${renderWardrobeMetric("\u8bb0\u5f55", history.recordCount)}
      ${renderWardrobeMetric("\u5206\u7ec4", (wear.groups || []).length)}
    </div>
    <div class="wardrobe-dashboard-grid">
      <section class="wardrobe-dashboard-panel">
        <h3>\u7a7f\u7740\u6392\u540d</h3>
        ${renderWardrobeGroupList(wear.groups, "\u6682\u65e0\u7a7f\u7740\u7edf\u8ba1")}
      </section>
      <section class="wardrobe-dashboard-panel">
        <h3>\u6700\u8fd1\u65e5\u5fd7</h3>
        ${renderWardrobeGroupList(history.groups, "\u6682\u65e0\u7a7f\u7740\u8bb0\u5f55")}
      </section>
    </div>
  `;
}

function renderWardrobeLooksView(projection = {}) {
  const looks = projection.featuredLooks || {};
  return `
    ${renderWardrobeSectionTitle("\u5957\u88c5", "\u7cbe\u9009\u5957\u88c5\u548c\u54c1\u724c\u53c2\u4e0e\u5ea6")}
    <div class="wardrobe-metrics">
      ${renderWardrobeMetric("\u5957\u88c5", looks.lookCount)}
      ${renderWardrobeMetric("\u6709\u56fe", looks.withPhotos)}
      ${renderWardrobeMetric("\u5206\u7ec4", (looks.groups || []).length)}
    </div>
    <section class="wardrobe-dashboard-panel">
      <h3>\u5206\u5e03</h3>
      ${renderWardrobeGroupList(looks.groups, "\u6682\u65e0\u5957\u88c5\u7edf\u8ba1")}
    </section>
  `;
}

function renderWardrobeLogView(projection = {}) {
  const history = projection.recentHistory || {};
  const quality = projection.dataQuality || {};
  return `
    ${renderWardrobeSectionTitle("\u65e5\u5fd7", "\u6700\u8fd1\u7a7f\u7740\u548c\u6570\u636e\u8d28\u91cf")}
    <div class="wardrobe-metrics">
      ${renderWardrobeMetric("\u8bb0\u5f55", history.recordCount)}
      ${renderWardrobeMetric("\u8d28\u91cf\u9879", quality.issueCount)}
      ${renderWardrobeMetric("\u68c0\u67e5", Object.keys(quality.checks || {}).length)}
    </div>
    <div class="wardrobe-dashboard-grid">
      <section class="wardrobe-dashboard-panel">
        <h3>\u7a7f\u7740\u65e5\u5fd7</h3>
        ${renderWardrobeGroupList(history.groups, "\u6682\u65e0\u7a7f\u7740\u8bb0\u5f55")}
      </section>
      <section class="wardrobe-dashboard-panel">
        <h3>\u8d28\u91cf</h3>
        ${renderWardrobeIssueList(quality)}
      </section>
    </div>
  `;
}

function renderWardrobeDashboard(projection = null) {
  if (state.wardrobeOverviewLoading && !projection) {
    return `
      <div class="wardrobe-dashboard loading">
        <div class="wardrobe-inline-empty">Loading Wardrobe MCP...</div>
      </div>`;
  }
  if (!projection) {
    return `
      <div class="wardrobe-dashboard">
        <button class="small-button" type="button" data-wardrobe-refresh>\u5237\u65b0\u8863\u6a71</button>
      </div>`;
  }
  if (!projection.available) {
    return `
      <div class="wardrobe-dashboard warning">
        <div class="wardrobe-inline-empty">${escapeHtml(projection.warning || projection.code || "wardrobe_mcp_failed")}</div>
        <button class="small-button" type="button" data-wardrobe-refresh>\u91cd\u8bd5</button>
      </div>`;
  }
  const overview = projection.overview || {};
  const totals = projection.inventory?.totals || {};
  const items = projection.items?.items || [];
  const section = wardrobeSectionId(projection.filters?.section || currentWardrobeSection());
  const sectionBody = section === "watch"
    ? renderWardrobeWatchView(projection)
    : section === "maintenance"
    ? renderWardrobeMaintenanceView(projection)
    : section === "wear"
    ? renderWardrobeWearView(projection)
    : section === "looks"
    ? renderWardrobeLooksView(projection)
    : section === "log"
    ? renderWardrobeLogView(projection)
    : "";
  if (section !== "overview") {
    return `
      <div class="wardrobe-dashboard">
        ${renderWardrobeToolbar(projection)}
        ${sectionBody}
      </div>`;
  }
  return `
    <div class="wardrobe-dashboard">
      ${renderWardrobeToolbar(projection)}
      <div class="wardrobe-metrics">
        ${renderWardrobeMetric("\u4ef6\u6570", totals.count || items.length || overview.wardrobeCount || overview.itemCount)}
        ${renderWardrobeMetric("\u5747\u4ef7", formatCurrency(totals.average_price))}
        ${renderWardrobeMetric("\u603b\u989d", formatCurrency(totals.amount))}
      </div>
      <div class="wardrobe-dashboard-grid">
        ${renderWardrobeDistribution(projection.inventory?.groups || projection.inventory?.brandGroups || [])}
        <section class="wardrobe-dashboard-panel">
          <h3>\u6700\u8fd1\u7a7f\u7740</h3>
          ${renderWardrobeGroupList(projection.recentHistory?.groups, "\u6682\u65e0\u7a7f\u7740\u8bb0\u5f55")}
        </section>
        <section class="wardrobe-dashboard-panel">
          <h3>\u4fdd\u517b</h3>
          ${renderWardrobeGroupList(projection.maintenance?.groups, "\u6682\u65e0\u4fdd\u517b\u63d0\u9192")}
        </section>
        <section class="wardrobe-dashboard-panel">
          <h3>\u8d28\u91cf</h3>
          ${renderWardrobeIssueList(projection.dataQuality)}
        </section>
      </div>
      ${renderWardrobeItemTable(items)}
    </div>`;
}

function bindWardrobeDashboardControls() {
  const conversation = $("conversation");
  const search = conversation?.querySelector("#wardrobeSearchInput");
  if (search) {
    search.addEventListener("input", () => {
      clearTimeout(state.wardrobeSearchTimer);
      state.wardrobeSearchTimer = setTimeout(() => {
        state.wardrobeFilters = Object.assign({}, state.wardrobeFilters || {}, { q: search.value.trim() });
        loadWardrobeOverview({ force: true }).catch(showError);
      }, 280);
    });
  }
  conversation?.querySelectorAll("[data-wardrobe-brand]").forEach((button) => {
    button.addEventListener("click", () => {
      state.wardrobeFilters = Object.assign({}, state.wardrobeFilters || {}, {
        brand: button.dataset.wardrobeBrand || "",
      });
      loadWardrobeOverview({ force: true }).catch(showError);
    });
  });
  conversation?.querySelectorAll("[data-wardrobe-item-code]").forEach((button) => {
    button.addEventListener("click", () => {
      const code = button.dataset.wardrobeItemCode || "";
      if (!code) return;
      state.wardrobeFilters = Object.assign({}, state.wardrobeFilters || {}, { q: code });
      const input = conversation.querySelector("#wardrobeSearchInput");
      if (input) input.value = code;
      loadWardrobeOverview({ force: true }).catch(showError);
    });
  });
  conversation?.querySelector("[data-wardrobe-refresh]")?.addEventListener("click", () => {
    loadWardrobeOverview({ force: true }).catch(showError);
  });
}

async function loadWardrobeOverview(options = {}) {
  if (state.wardrobeOverviewLoading && !options.force) return;
  state.wardrobeOverviewLoading = true;
  const container = $("wardrobeDashboard");
  if (container) container.innerHTML = renderWardrobeDashboard(state.wardrobeOverview);
  try {
    const workspaceId = state.selectedWorkspaceId || "owner";
    const filters = state.wardrobeFilters || {};
    const params = new URLSearchParams({ workspaceId });
    if (filters.q) params.set("q", filters.q);
    if (filters.brand) params.set("brand", filters.brand);
    params.set("section", currentWardrobeSection());
    const projection = await api(`/api/wardrobe/overview?${params.toString()}`);
    state.wardrobeOverview = projection;
  } catch (err) {
    state.wardrobeOverview = {
      ok: false,
      available: false,
      code: "wardrobe_dashboard_failed",
      warning: err?.message || String(err),
    };
  } finally {
    state.wardrobeOverviewLoading = false;
    const target = $("wardrobeDashboard");
    if (target) {
      target.innerHTML = renderWardrobeDashboard(state.wardrobeOverview);
      bindWardrobeDashboardControls();
    }
  }
}

async function loadWardrobePluginManifest(options = {}) {
  const workspaceId = state.selectedWorkspaceId || "owner";
  if (!options.force && state.wardrobePluginLoading) return;
  if (!options.force && state.wardrobePluginChecked && state.wardrobePluginManifest?.workspaceId === workspaceId) return;
  state.wardrobePluginLoading = true;
  try {
    const params = new URLSearchParams({ workspaceId });
    const manifest = await api(`/api/hermes-plugins/wardrobe/manifest?${params.toString()}`);
    state.wardrobePluginManifest = Object.assign({ workspaceId }, manifest);
  } catch (err) {
    state.wardrobePluginManifest = {
      ok: false,
      available: false,
      workspaceId,
      code: "wardrobe_plugin_manifest_failed",
      warning: err?.message || String(err),
    };
  } finally {
    state.wardrobePluginChecked = true;
    state.wardrobePluginLoading = false;
    if (state.viewMode === "wardrobe") renderWardrobeView();
  }
}

function renderWardrobeView() {
  updateWardrobeNavigationAvailability();
  currentWardrobeSection();
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  state.threads = [];
  const attachment = wardrobeDirectoryAttachment();
  const list = $("threadList");
  if (list) list.innerHTML = `<div class="empty-state small">\u8863\u6a71 MCP</div>`;
  $("threadTitle").textContent = "\u6211\u7684\u8863\u6a71";
  $("threadMeta").textContent = "";
  $("interruptRun").disabled = true;
  configureComposer({ enabled: false, placeholder: "\u8863\u6a71\u603b\u89c8" });
  const conversation = $("conversation");
  if (!conversation) return;
  if (!attachment && !workspaceAllowsWardrobeToolset()) {
    conversation.innerHTML = `
      <section class="wardrobe-view">
        <div class="wardrobe-empty">
          <h2>\u672a\u68c0\u6d4b\u5230\u8863\u6a71\u5165\u53e3</h2>
          <p>\u5f53\u524d\u5de5\u4f5c\u533a\u6ca1\u6709\u53ef\u7528\u7684\u8863\u6a71\u76ee\u5f55\u6216 wardrobe \u5de5\u5177\u96c6\u3002\u5982\u679c Gateway \u5df2\u6ce8\u518c Wardrobe MCP\uff0c\u9700\u8981\u5148\u628a\u5f53\u524d\u5de5\u4f5c\u533a\u7ed1\u5230\u8863\u6a71\u76ee\u5f55\u3002</p>
        </div>
      </section>`;
    updateNavigationControls();
    ensureVerticalScrollAffordance();
    return;
  }
  const pluginManifest = currentWardrobePluginManifest();
  if (wardrobePluginAvailable(pluginManifest)) {
    conversation.innerHTML = renderWardrobePluginFrame(pluginManifest);
    updateNavigationControls();
    ensureVerticalScrollAffordance();
    return;
  }
  if (state.wardrobePluginLoading && !pluginManifest) {
    conversation.innerHTML = renderWardrobePluginLoading();
    updateNavigationControls();
    ensureVerticalScrollAffordance();
    return;
  }
  if (!state.wardrobePluginChecked || state.wardrobePluginManifest?.workspaceId !== (state.selectedWorkspaceId || "owner")) {
    conversation.innerHTML = renderWardrobePluginLoading();
    loadWardrobePluginManifest().catch(showError);
    updateNavigationControls();
    ensureVerticalScrollAffordance();
    return;
  }
  conversation.innerHTML = `
    <section class="wardrobe-view">
      <div id="wardrobeDashboard">
        ${renderWardrobeDashboard(state.wardrobeOverview)}
      </div>
    </section>`;
  bindWardrobeDashboardControls();
  loadWardrobeOverview().catch(showError);
  updateNavigationControls();
  ensureVerticalScrollAffordance();
}
