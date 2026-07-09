"use strict";

const WORKSPACE_CONSOLE_API_PATH = "/api/owner/workspace-console";

function workspaceConsoleAppState() {
  if (typeof state === "undefined" || !state || typeof state !== "object") return {};
  return state;
}

function workspaceConsoleModel() {
  const appState = workspaceConsoleAppState();
  if (!appState.workspaceConsole || typeof appState.workspaceConsole !== "object") {
    appState.workspaceConsole = {};
  }
  const model = appState.workspaceConsole;
  if (!model.status) model.status = "idle";
  if (!Array.isArray(model.lastErrors)) model.lastErrors = [];
  return model;
}

function workspaceConsoleIsOwner() {
  return Boolean(workspaceConsoleAppState().auth?.isOwner);
}

function workspaceConsoleRuntimeFacade() {
  const root = typeof window !== "undefined"
    ? window
    : (typeof globalThis !== "undefined" ? globalThis : null);
  const facade = root?.HomeAiRuntimeFacade;
  return facade && typeof facade === "object" ? facade : null;
}

function workspaceConsoleRuntimeEvent(type, detail = {}) {
  workspaceConsoleRuntimeFacade()?.events?.emit?.(type, Object.assign({ source: "classic-workspace-console" }, detail));
}

function workspaceConsoleApi(endpoint, options = {}) {
  const facadeApi = workspaceConsoleRuntimeFacade()?.api;
  if (typeof facadeApi === "function") return facadeApi(endpoint, options);
  return api(endpoint, options);
}

function workspaceConsoleEscape(value) {
  if (typeof escapeHtml === "function") return escapeHtml(value);
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function workspaceConsoleClean(value, max = 160) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 160));
}

function workspaceConsoleList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function workspaceConsoleStatusTone(status) {
  const text = String(status || "").toLowerCase();
  if (/^(ok|online|ready|normal|healthy)$/.test(text)) return "ok";
  if (/^(blocked|critical|failed|error)$/.test(text)) return "critical";
  if (/^(offline|stale|pending|warning|unknown)$/.test(text)) return "warning";
  return "neutral";
}

function workspaceConsoleStatusLabel(item = {}) {
  const label = workspaceConsoleClean(item.statusLabel || "");
  if (label) return label;
  const status = String(item.status || "").toLowerCase();
  if (status === "online") return "在线";
  if (status === "ok") return "正常";
  if (status === "offline") return "离线";
  if (status === "stale") return "过期";
  if (status === "pending") return "待配置";
  if (status === "blocked") return "阻塞";
  return "未知";
}

function workspaceConsoleTimeLabel(value) {
  const text = workspaceConsoleClean(value || "", 80);
  if (!text) return "未记录";
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return text;
  try {
    return new Date(ms).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch (_) {
    return text;
  }
}

function workspaceConsoleMetric(label, value) {
  return `
    <span class="workspace-console-metric">
      <span class="workspace-console-metric-value">${workspaceConsoleEscape(value)}</span>
      <span class="workspace-console-metric-label">${workspaceConsoleEscape(label)}</span>
    </span>`;
}

function workspaceConsoleStatusBadge(item = {}) {
  const tone = workspaceConsoleStatusTone(item.status);
  return `<span class="workspace-console-status tone-${workspaceConsoleEscape(tone)}">${workspaceConsoleEscape(workspaceConsoleStatusLabel(item))}</span>`;
}

function workspaceConsoleIssueChips(codes = []) {
  const items = workspaceConsoleList(codes).slice(0, 4);
  if (!items.length) return `<span class="workspace-console-muted">无 issue code</span>`;
  return items.map((code) => `<span class="workspace-console-chip">${workspaceConsoleEscape(workspaceConsoleClean(code, 80))}</span>`).join("");
}

function workspaceConsoleRowMeta(item = {}) {
  if (item.kind === "remote_codex") {
    return [
      item.cwdLabel ? `远程项目 ${item.cwdLabel}` : "",
      item.nodeId ? `节点 ${item.nodeId}` : "",
      item.sessionState ? `会话 ${item.sessionState}` : "",
      `心跳 ${workspaceConsoleTimeLabel(item.lastHeartbeatAt || item.lastSeenAt)}`,
    ].filter(Boolean).join(" · ");
  }
  if (item.kind === "local_codex") {
    return [
      item.cwdLabel ? `cwd ${item.cwdLabel}` : "",
      item.mainThread?.label ? `主线程 ${item.mainThread.label}` : "主线程 未解析",
      item.workerLane?.label ? `Worker ${item.workerLane.label}` : "",
      item.deployLane?.label ? `部署 ${item.deployLane.label}` : "",
    ].filter(Boolean).join(" · ");
  }
  return [
    item.cwdLabel ? `cwd ${item.cwdLabel}` : "",
    item.identityLabel ? `身份 ${item.identityLabel}` : "",
  ].filter(Boolean).join(" · ");
}

function workspaceConsoleRowDetails(item = {}, expanded = false) {
  if (!expanded) return "";
  const dailySummary = item.latestDailySummary?.summary || "";
  const latestTask = item.latestTaskCard?.title || item.latestTaskCard?.summary || "";
  const latestReturn = item.latestTerminalReturn?.title || item.latestTerminalReturn?.summary || item.latestTerminalReturn?.status || "";
  const latestEscalation = item.latestEscalation?.summary || workspaceConsoleList(item.blockerCodes).join(", ");
  const threadLabel = item.mainThread?.label || item.nodeId || "未解析";
  const workerLabel = item.workerLane?.label || "未配置";
  const deployLabel = item.deployLane?.label || "未配置";
  return `
    <div class="workspace-console-row-detail">
      <div><strong>Issue</strong><span>${workspaceConsoleIssueChips(item.issueCodes)}</span></div>
      <div><strong>线程</strong><span>${workspaceConsoleEscape(threadLabel)}</span></div>
      <div><strong>Worker</strong><span>${workspaceConsoleEscape(workerLabel)}</span></div>
      <div><strong>部署</strong><span>${workspaceConsoleEscape(deployLabel)}</span></div>
      <div><strong>任务卡</strong><span>${workspaceConsoleEscape(latestTask || `${Number(item.activeTaskCardCount || 0)} 个活跃`)}</span></div>
      <div><strong>回卡</strong><span>${workspaceConsoleEscape(latestReturn || "未记录")}</span></div>
      <div><strong>日报</strong><span>${workspaceConsoleEscape(dailySummary || item.latestDailySummaryStatus || "未采集")}</span></div>
      <div><strong>升级</strong><span>${workspaceConsoleEscape(latestEscalation || `${Number(item.escalationCount || 0)} 条`)}</span></div>
    </div>`;
}

function renderWorkspaceConsoleRow(item = {}, expandedId = "") {
  const id = workspaceConsoleClean(item.id || "", 128);
  const expanded = Boolean(id && expandedId === id);
  return `
    <article class="workspace-console-row tone-${workspaceConsoleEscape(workspaceConsoleStatusTone(item.status))}" data-workspace-console-row data-workspace-kind="${workspaceConsoleEscape(item.kind || "")}" data-workspace-id="${workspaceConsoleEscape(id)}">
      <div class="workspace-console-row-main">
        <div class="workspace-console-row-title-line">
          <span class="workspace-console-row-title">${workspaceConsoleEscape(item.name || id || "Workspace")}</span>
          <span class="workspace-console-kind">${workspaceConsoleEscape(item.kindLabel || item.kind || "工作区")}</span>
          ${workspaceConsoleStatusBadge(item)}
        </div>
        <div class="workspace-console-row-meta">${workspaceConsoleEscape(workspaceConsoleRowMeta(item))}</div>
        <div class="workspace-console-row-counts">
          ${workspaceConsoleMetric("活跃卡", Number(item.activeTaskCardCount || 0))}
          ${workspaceConsoleMetric("待决策", Number(item.pendingApprovalCount || 0))}
          ${workspaceConsoleMetric("升级", Number(item.escalationCount || 0))}
        </div>
      </div>
      <button class="workspace-console-detail-button" type="button" data-workspace-console-detail="${workspaceConsoleEscape(id)}" aria-expanded="${expanded ? "true" : "false"}">详情</button>
      ${workspaceConsoleRowDetails(item, expanded)}
    </article>`;
}

function renderWorkspaceConsoleSection(section = {}, expandedId = "") {
  const items = workspaceConsoleList(section.items);
  const emptyText = section.id === "remoteCodex" ? "暂无远程 Codex 工作区接入。" : "暂无本机 Codex 工作区记录。";
  return `
    <section class="workspace-console-panel" data-workspace-console-section="${workspaceConsoleEscape(section.id || "")}">
      <div class="workspace-console-panel-head">
        <div>
          <h3>${workspaceConsoleEscape(section.title || "工作区")}</h3>
          <p>${workspaceConsoleEscape(`${Number(section.count || items.length || 0)} 条记录`)}</p>
        </div>
        ${workspaceConsoleStatusBadge(section)}
      </div>
      <div class="workspace-console-list">
        ${items.length
          ? items.map((item) => renderWorkspaceConsoleRow(item, expandedId)).join("")
          : `<div class="workspace-console-empty">${workspaceConsoleEscape(emptyText)}</div>`}
      </div>
    </section>`;
}

function renderWorkspaceConsoleContent(model) {
  if (model.status === "loading" && !model.data) {
    return `<div class="workspace-console-state">正在载入工作区状态...</div>`;
  }
  if (model.status === "error" && !model.data) {
    return `<div class="workspace-console-state error">工作区控制台载入失败。${workspaceConsoleEscape(model.error || "")}</div>`;
  }
  const data = model.data || {};
  const counts = data.counts || {};
  const sections = data.sections || {};
  const localSection = sections.localCodex || { id: "localCodex", title: "本机 Codex 工作区", items: [] };
  const remoteSection = sections.remoteCodex || { id: "remoteCodex", title: "远程 Codex 工作区", items: [] };
  return `
    <div class="workspace-console-summary">
      ${workspaceConsoleMetric("总数", Number(counts.total || 0))}
      ${workspaceConsoleMetric("本机", Number(counts.localCodex ?? counts.local ?? 0))}
      ${workspaceConsoleMetric("远程", Number(counts.remoteCodex ?? counts.remote ?? 0))}
      ${workspaceConsoleMetric("活跃卡", Number(counts.activeTaskCards || 0))}
      ${workspaceConsoleMetric("异常", Number(counts.blocked || 0) + Number(counts.offline || 0) + Number(counts.stale || 0))}
    </div>
    ${model.status === "error" ? `<div class="workspace-console-inline-error">${workspaceConsoleEscape(model.error || "刷新失败")}</div>` : ""}
    <div class="workspace-console-grid">
      ${renderWorkspaceConsoleSection(localSection, model.expandedId)}
      ${renderWorkspaceConsoleSection(remoteSection, model.expandedId)}
    </div>`;
}

function renderWorkspaceConsoleView() {
  state.currentThread = null;
  state.currentThreadId = "";
  state.currentTaskGroupId = "";
  const list = $("threadList");
  if (list) list.innerHTML = `<div class="empty-state small">工作区控制台</div>`;
  $("threadTitle").textContent = "工作区";
  $("threadMeta").textContent = "Home AI workspace control plane";
  $("interruptRun").disabled = true;
  if (typeof configureComposer === "function") configureComposer({ enabled: false, placeholder: "工作区控制台" });

  const conversation = $("conversation");
  if (!conversation) return;
  if (!workspaceConsoleIsOwner()) {
    conversation.innerHTML = `
      <section class="workspace-console" data-workspace-console>
        <div class="workspace-console-head">
          <div>
            <div class="workspace-console-kicker">Owner Console</div>
            <h2>Codex 工作区</h2>
          </div>
        </div>
        <div class="workspace-console-state">当前账号没有 Owner 权限。</div>
      </section>`;
    if (typeof updateNavigationControls === "function") updateNavigationControls();
    return;
  }

  const model = workspaceConsoleModel();
  const statusItem = {
    status: model.data?.overallStatus || (model.status === "loading" ? "pending" : "unknown"),
    statusLabel: model.data?.overallStatusLabel || "",
  };
  conversation.innerHTML = `
    <section class="workspace-console" data-workspace-console>
      <div class="workspace-console-head">
        <div>
          <div class="workspace-console-kicker">Owner Console</div>
          <h2>Codex 工作区</h2>
          <p>本机与远程 Codex 工作区治理状态。</p>
        </div>
        <div class="workspace-console-head-actions">
          ${workspaceConsoleStatusBadge(statusItem)}
          <button class="workspace-console-refresh" type="button" data-workspace-console-refresh ${model.status === "loading" ? "disabled" : ""}>刷新</button>
        </div>
      </div>
      ${renderWorkspaceConsoleContent(model)}
    </section>`;
  if (typeof updateNavigationControls === "function") updateNavigationControls();
  if (typeof ensureVerticalScrollAffordance === "function") ensureVerticalScrollAffordance();
}

async function loadWorkspaceConsole(options = {}) {
  const model = workspaceConsoleModel();
  if (!workspaceConsoleIsOwner()) {
    model.status = "idle";
    model.data = null;
    renderWorkspaceConsoleView();
    return null;
  }
  if (!model.data || options.refresh) {
    model.status = "loading";
    model.error = "";
    renderWorkspaceConsoleView();
  }
  try {
    const result = await workspaceConsoleApi(WORKSPACE_CONSOLE_API_PATH, { cache: "no-store" });
    const data = result?.workspaceConsole || result?.console || result;
    if (!data || typeof data !== "object") throw new Error("workspace_console_empty_response");
    model.status = "ready";
    model.data = data;
    model.error = "";
    workspaceConsoleRuntimeEvent("workspace-console:loaded", { status: data.overallStatus || "" });
    renderWorkspaceConsoleView();
    return data;
  } catch (err) {
    model.status = "error";
    model.error = workspaceConsoleClean(err?.message || err || "workspace_console_failed", 240);
    model.lastErrors.push({ at: new Date().toISOString(), message: model.error });
    model.lastErrors = model.lastErrors.slice(-5);
    workspaceConsoleRuntimeEvent("workspace-console:error", { error: model.error });
    renderWorkspaceConsoleView();
    return null;
  }
}

function wireWorkspaceConsoleView() {
  if (wireWorkspaceConsoleView.__wired) return;
  wireWorkspaceConsoleView.__wired = true;
  const root = typeof document !== "undefined" ? document : null;
  if (!root?.addEventListener) return;
  root.addEventListener("click", (event) => {
    const refresh = event.target?.closest?.("[data-workspace-console-refresh]");
    if (refresh) {
      event.preventDefault();
      loadWorkspaceConsole({ refresh: true }).catch((err) => {
        if (typeof showError === "function") showError(err?.message || err || "工作区控制台刷新失败");
      });
      return;
    }
    const detail = event.target?.closest?.("[data-workspace-console-detail]");
    if (detail) {
      event.preventDefault();
      const model = workspaceConsoleModel();
      const id = workspaceConsoleClean(detail.getAttribute("data-workspace-console-detail") || "", 128);
      model.expandedId = model.expandedId === id ? "" : id;
      renderWorkspaceConsoleView();
    }
  });
}

if (typeof window !== "undefined") {
  window.renderWorkspaceConsoleView = renderWorkspaceConsoleView;
  window.loadWorkspaceConsole = loadWorkspaceConsole;
  window.wireWorkspaceConsoleView = wireWorkspaceConsoleView;
  wireWorkspaceConsoleView();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    WORKSPACE_CONSOLE_API_PATH,
    workspaceConsoleClean,
    workspaceConsoleStatusTone,
    renderWorkspaceConsoleRow,
    renderWorkspaceConsoleSection,
    renderWorkspaceConsoleView,
    loadWorkspaceConsole,
    wireWorkspaceConsoleView,
  };
}
