export const WORKSPACE_CONSOLE_MODEL_VERSION = "20260711-vite-workspace-console-model-v1";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function cleanWorkspaceConsoleText(value, max = 160) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 160));
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export function workspaceConsoleStatusTonePlan(status) {
  const text = String(status || "").toLowerCase();
  if (/^(ok|online|ready|normal|healthy)$/.test(text)) return "ok";
  if (/^(blocked|critical|failed|error)$/.test(text)) return "critical";
  if (/^(offline|stale|pending|warning|unknown)$/.test(text)) return "warning";
  return "neutral";
}

export function workspaceConsoleStatusLabelPlan(item = {}) {
  const label = cleanWorkspaceConsoleText(item.statusLabel || "");
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

function timeLabel(value) {
  const text = cleanWorkspaceConsoleText(value || "", 80);
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
  } catch (_error) {
    return text;
  }
}

function metric(label, value) {
  return `
    <span class="workspace-console-metric">
      <span class="workspace-console-metric-value">${escapeHtml(value)}</span>
      <span class="workspace-console-metric-label">${escapeHtml(label)}</span>
    </span>`;
}

function statusBadge(item = {}) {
  const tone = workspaceConsoleStatusTonePlan(item.status);
  return `<span class="workspace-console-status tone-${escapeHtml(tone)}">${escapeHtml(workspaceConsoleStatusLabelPlan(item))}</span>`;
}

function issueChips(codes = []) {
  const items = list(codes).slice(0, 4);
  if (!items.length) return `<span class="workspace-console-muted">无 issue code</span>`;
  return items.map((code) => `<span class="workspace-console-chip">${escapeHtml(cleanWorkspaceConsoleText(code, 80))}</span>`).join("");
}

function rowMeta(item = {}) {
  if (item.kind === "remote_codex") {
    return [
      item.cwdLabel ? `远程项目 ${item.cwdLabel}` : "",
      item.nodeId ? `节点 ${item.nodeId}` : "",
      item.sessionState ? `会话 ${item.sessionState}` : "",
      `心跳 ${timeLabel(item.lastHeartbeatAt || item.lastSeenAt)}`,
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

function rowDetails(item = {}, expanded = false) {
  if (!expanded) return "";
  const dailySummary = item.latestDailySummary?.summary || "";
  const latestTask = item.latestTaskCard?.title || item.latestTaskCard?.summary || "";
  const latestReturn = item.latestTerminalReturn?.title || item.latestTerminalReturn?.summary || item.latestTerminalReturn?.status || "";
  const latestEscalation = item.latestEscalation?.summary || list(item.blockerCodes).join(", ");
  const threadLabel = item.mainThread?.label || item.nodeId || "未解析";
  const workerLabel = item.workerLane?.label || "未配置";
  const deployLabel = item.deployLane?.label || "未配置";
  return `
    <div class="workspace-console-row-detail">
      <div><strong>Issue</strong><span>${issueChips(item.issueCodes)}</span></div>
      <div><strong>线程</strong><span>${escapeHtml(threadLabel)}</span></div>
      <div><strong>Worker</strong><span>${escapeHtml(workerLabel)}</span></div>
      <div><strong>部署</strong><span>${escapeHtml(deployLabel)}</span></div>
      <div><strong>任务卡</strong><span>${escapeHtml(latestTask || `${Number(item.activeTaskCardCount || 0)} 个活跃`)}</span></div>
      <div><strong>回卡</strong><span>${escapeHtml(latestReturn || "未记录")}</span></div>
      <div><strong>日报</strong><span>${escapeHtml(dailySummary || item.latestDailySummaryStatus || "未采集")}</span></div>
      <div><strong>升级</strong><span>${escapeHtml(latestEscalation || `${Number(item.escalationCount || 0)} 条`)}</span></div>
    </div>`;
}

export function renderClassicWorkspaceConsoleRow(item = {}, expandedId = "") {
  const id = cleanWorkspaceConsoleText(item.id || "", 128);
  const expanded = Boolean(id && expandedId === id);
  return `
    <article class="workspace-console-row tone-${escapeHtml(workspaceConsoleStatusTonePlan(item.status))}" data-workspace-console-row data-workspace-kind="${escapeHtml(item.kind || "")}" data-workspace-id="${escapeHtml(id)}">
      <div class="workspace-console-row-main">
        <div class="workspace-console-row-title-line">
          <span class="workspace-console-row-title">${escapeHtml(item.name || id || "Workspace")}</span>
          <span class="workspace-console-kind">${escapeHtml(item.kindLabel || item.kind || "工作区")}</span>
          ${statusBadge(item)}
        </div>
        <div class="workspace-console-row-meta">${escapeHtml(rowMeta(item))}</div>
        <div class="workspace-console-row-counts">
          ${metric("活跃卡", Number(item.activeTaskCardCount || 0))}
          ${metric("待决策", Number(item.pendingApprovalCount || 0))}
          ${metric("升级", Number(item.escalationCount || 0))}
        </div>
      </div>
      <button class="workspace-console-detail-button" type="button" data-workspace-console-detail="${escapeHtml(id)}" aria-expanded="${expanded ? "true" : "false"}">详情</button>
      ${rowDetails(item, expanded)}
    </article>`;
}

export function renderClassicWorkspaceConsoleSection(section = {}, expandedId = "") {
  const items = list(section.items);
  const emptyText = section.id === "remoteCodex" ? "暂无远程 Codex 工作区接入。" : "暂无本机 Codex 工作区记录。";
  return `
    <section class="workspace-console-panel" data-workspace-console-section="${escapeHtml(section.id || "")}">
      <div class="workspace-console-panel-head">
        <div>
          <h3>${escapeHtml(section.title || "工作区")}</h3>
          <p>${escapeHtml(`${Number(section.count || items.length || 0)} 条记录`)}</p>
        </div>
        ${statusBadge(section)}
      </div>
      <div class="workspace-console-list">
        ${items.length
          ? items.map((item) => renderClassicWorkspaceConsoleRow(item, expandedId)).join("")
          : `<div class="workspace-console-empty">${escapeHtml(emptyText)}</div>`}
      </div>
    </section>`;
}

export function renderClassicWorkspaceConsoleContent(model = {}) {
  if (model.status === "loading" && !model.data) {
    return `<div class="workspace-console-state">正在载入工作区状态...</div>`;
  }
  if (model.status === "error" && !model.data) {
    return `<div class="workspace-console-state error">工作区控制台载入失败。${escapeHtml(model.error || "")}</div>`;
  }
  const data = model.data || {};
  const counts = data.counts || {};
  const sections = data.sections || {};
  const localSection = sections.localCodex || { id: "localCodex", title: "本机 Codex 工作区", items: [] };
  const remoteSection = sections.remoteCodex || { id: "remoteCodex", title: "远程 Codex 工作区", items: [] };
  return `
    <div class="workspace-console-summary">
      ${metric("总数", Number(counts.total || 0))}
      ${metric("本机", Number(counts.localCodex ?? counts.local ?? 0))}
      ${metric("远程", Number(counts.remoteCodex ?? counts.remote ?? 0))}
      ${metric("活跃卡", Number(counts.activeTaskCards || 0))}
      ${metric("异常", Number(counts.blocked || 0) + Number(counts.offline || 0) + Number(counts.stale || 0))}
    </div>
    ${model.status === "error" ? `<div class="workspace-console-inline-error">${escapeHtml(model.error || "刷新失败")}</div>` : ""}
    <div class="workspace-console-grid">
      ${renderClassicWorkspaceConsoleSection(localSection, model.expandedId)}
      ${renderClassicWorkspaceConsoleSection(remoteSection, model.expandedId)}
    </div>`;
}

export function renderClassicWorkspaceConsoleView({ isOwner = false, model = {} } = {}) {
  if (!isOwner) {
    return `
      <section class="workspace-console" data-workspace-console>
        <div class="workspace-console-head">
          <div>
            <div class="workspace-console-kicker">Owner Console</div>
            <h2>Codex 工作区</h2>
          </div>
        </div>
        <div class="workspace-console-state">当前账号没有 Owner 权限。</div>
      </section>`;
  }
  const statusItem = {
    status: model.data?.overallStatus || (model.status === "loading" ? "pending" : "unknown"),
    statusLabel: model.data?.overallStatusLabel || "",
  };
  return `
    <section class="workspace-console" data-workspace-console>
      <div class="workspace-console-head">
        <div>
          <div class="workspace-console-kicker">Owner Console</div>
          <h2>Codex 工作区</h2>
          <p>本机与远程 Codex 工作区治理状态。</p>
        </div>
        <div class="workspace-console-head-actions">
          ${statusBadge(statusItem)}
          <button class="workspace-console-refresh" type="button" data-workspace-console-refresh ${model.status === "loading" ? "disabled" : ""}>刷新</button>
        </div>
      </div>
      ${renderClassicWorkspaceConsoleContent(model)}
    </section>`;
}
