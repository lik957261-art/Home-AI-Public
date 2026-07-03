const STATUS_LABELS = Object.freeze({
  ok: "正常",
  warning: "注意",
  degraded: "降级",
  blocked: "阻断",
  stale: "过期",
  unknown: "未知",
  not_collected: "未采集",
});

const CATEGORY_LABELS = Object.freeze({
  host_cpu: "CPU",
  host_memory: "内存",
  host_disk: "磁盘",
  process: "进程",
  service: "服务",
  gateway: "Gateway",
  plugin: "Plugin",
  deploy: "部署",
  diagnostic: "诊断",
  availability: "可用性",
  accuracy: "准确性",
  autonomy: "自主性",
});

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeStatus(status) {
  const value = String(status || "unknown").toLowerCase();
  if (value === "healthy" || value === "ready" || value === "passed") return "ok";
  if (Object.hasOwn(STATUS_LABELS, value)) return value;
  return "unknown";
}

function statusLabel(status) {
  const normalized = normalizeStatus(status);
  return STATUS_LABELS[normalized] || STATUS_LABELS.unknown;
}

function categoryLabel(category) {
  return CATEGORY_LABELS[String(category || "")] || String(category || "信号");
}

function percent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)}%` : "未采集";
}

function gb(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "未采集";
  return `${Math.round((number / 1024 ** 3) * 10) / 10} GB`;
}

function shortTime(value) {
  if (!value) return "未采集";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 40);
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeOwnerConsoleError(error = {}) {
  if (error?.status === 401 || error?.status === 403) {
    return {
      message: "需要 Owner 权限或重新登录。",
      status: error.status,
      code: error.code || "owner_permission_required",
    };
  }
  return {
    message: error?.status
      ? `系统控制台读取失败：HTTP ${error.status}`
      : (error?.message || "系统控制台读取失败。"),
    status: error?.status || 0,
    code: error?.code || "owner_system_console_read_failed",
  };
}

function ownerConsoleError(input = {}) {
  const normalized = normalizeOwnerConsoleError(input);
  const error = new Error(normalized.message);
  error.status = normalized.status;
  error.code = normalized.code;
  return error;
}

function badge(status) {
  const normalized = normalizeStatus(status);
  return `<span class="osc-badge ${escapeHtml(normalized)}">${escapeHtml(statusLabel(normalized))}</span>`;
}

function metricCard(label, value, meta, status = "unknown") {
  return `
    <article class="osc-card">
      <p class="osc-card-label">${escapeHtml(label)}</p>
      <div class="osc-card-value">${escapeHtml(value)}</div>
      <p class="osc-card-meta">${badge(status)} ${escapeHtml(meta || "")}</p>
    </article>
  `;
}

function signalCard(signal = {}) {
  const title = signal.label || categoryLabel(signal.category);
  return `
    <article class="osc-card osc-signal">
      <div class="osc-signal-head">
        <h3 class="osc-signal-title">${escapeHtml(title)}</h3>
        ${badge(signal.status)}
      </div>
      <p class="osc-signal-summary">${escapeHtml(signal.summary || "没有摘要。")}</p>
      <p class="osc-card-meta">${escapeHtml(categoryLabel(signal.category))} · ${escapeHtml(signal.severity || "H3")} · ${escapeHtml(shortTime(signal.lastCheckedAt))}</p>
    </article>
  `;
}

function warningItem(signal = {}) {
  return `
    <div class="osc-list-item">
      <div class="osc-signal-head">
        <strong>${escapeHtml(signal.label || categoryLabel(signal.category))}</strong>
        ${badge(signal.status)}
      </div>
      <span>${escapeHtml(signal.summary || "需要查看详情。")}</span>
      <span class="osc-card-meta">建议：${escapeHtml(signal.recommendedAction || "观察")}</span>
    </div>
  `;
}

function serviceRows(signals = []) {
  const rows = signals
    .filter((signal) => ["process", "service", "gateway", "plugin"].includes(signal.category))
    .slice(0, 8);
  if (!rows.length) return `<tr><td colspan="4">当前没有可展示的关键服务信号。</td></tr>`;
  return rows.map((signal) => `
    <tr>
      <td>${escapeHtml(signal.label || categoryLabel(signal.category))}</td>
      <td>${badge(signal.status)}</td>
      <td>${escapeHtml(signal.summary || "")}</td>
      <td>${escapeHtml(shortTime(signal.lastCheckedAt))}</td>
    </tr>
  `).join("");
}

function systemMetrics(systemStatus = {}) {
  const cpu = systemStatus.cpu || {};
  const memory = systemStatus.memory || {};
  const disks = Array.isArray(systemStatus.disks) ? systemStatus.disks : [];
  const criticalDisk = disks[0] || {};
  const host = systemStatus.host || {};
  return {
    cpu: metricCard(
      "CPU",
      percent(cpu.overallPercent),
      `${cpu.coreCount || "?"} 核 · load/core ${cpu.loadPerCore?.oneMinute ?? "未采集"}`,
      cpu.status,
    ),
    memory: metricCard(
      "内存",
      percent(memory.percentUsed),
      `${gb(memory.usedBytes)} / ${gb(memory.totalBytes)}`,
      memory.status,
    ),
    disk: metricCard(
      "磁盘",
      percent(criticalDisk.percentUsed),
      `${gb(criticalDisk.freeBytes)} 可用`,
      criticalDisk.status,
    ),
    uptime: metricCard(
      "Uptime",
      host.uptimeText || host.uptimeSeconds ? `${Math.floor(Number(host.uptimeSeconds || 0) / 3600)} 小时` : "未采集",
      `最近刷新 ${shortTime(systemStatus.collectedAt)}`,
      systemStatus.overallStatus,
    ),
  };
}

function renderOwnerConsoleHtml(overviewPayload = {}, statusPayload = {}) {
  const overview = overviewPayload.console || {};
  const systemStatus = statusPayload.systemStatus || overview.systemStatus || {};
  const metrics = systemMetrics(systemStatus);
  const dimensions = Array.isArray(overview.dimensions) ? overview.dimensions : [];
  const criticalSignals = Array.isArray(overview.criticalSignals) ? overview.criticalSignals : [];
  const systemSignals = Array.isArray(systemStatus.signals) ? systemStatus.signals : [];
  const warningSignals = criticalSignals.length ? criticalSignals : systemSignals
    .filter((signal) => normalizeStatus(signal.status) !== "ok")
    .slice(0, 8);

  return `
    <div class="homeai-vite-owner-console">
      <div class="osc-shell">
        <header class="osc-topbar">
          <div class="osc-title-group">
            <p class="osc-eyebrow">Vite island 开发预览</p>
            <h1 class="osc-title">Home AI 系统控制台</h1>
            <p class="osc-subtitle">只读 Owner 视图。当前页面不替换主 PWA shell，也不接入 Service Worker 预缓存。</p>
          </div>
          <div class="osc-actions">
            ${badge(overview.overallStatus)}
            <button class="osc-button secondary" type="button" data-osc-refresh>刷新</button>
          </div>
        </header>

        <section class="osc-status-row" aria-label="3A 状态">
          ${dimensions.slice(0, 3).map((signal) => metricCard(signal.label || categoryLabel(signal.category), statusLabel(signal.status), signal.summary, signal.status)).join("")}
          ${metricCard("只读策略", overview.policy?.readOnlyMvp ? "启用" : "未知", "操作执行未启用", "ok")}
        </section>

        <section class="osc-metric-grid" aria-label="系统资源">
          ${metrics.cpu}
          ${metrics.memory}
          ${metrics.disk}
        </section>

        <section class="osc-signal-grid" aria-label="关键信号">
          ${(criticalSignals.length ? criticalSignals : dimensions).slice(0, 4).map(signalCard).join("") || `<div class="osc-empty">当前没有关键告警。</div>`}
        </section>

        <section class="osc-section-grid">
          <article class="osc-panel">
            <h2 class="osc-panel-title">关键服务与 Runtime</h2>
            <table class="osc-table">
              <thead>
                <tr>
                  <th>项目</th>
                  <th>状态</th>
                  <th>摘要</th>
                  <th>检查时间</th>
                </tr>
              </thead>
              <tbody>${serviceRows(systemSignals)}</tbody>
            </table>
          </article>

          <article class="osc-panel">
            <h2 class="osc-panel-title">近期需要关注</h2>
            <div class="osc-list">
              ${warningSignals.length ? warningSignals.slice(0, 8).map(warningItem).join("") : `<div class="osc-list-item">没有当前告警。</div>`}
            </div>
          </article>
        </section>

        <section class="osc-metric-grid" aria-label="采集状态">
          ${metrics.uptime}
          ${metricCard("Console 版本", overview.consoleVersion || "未知", `生成 ${shortTime(overview.generatedAt)}`, overview.ok ? "ok" : overview.overallStatus)}
          ${metricCard("页面状态", `${Array.isArray(overview.pages) ? overview.pages.length : 0} 项`, "Gateway / Plugin / Deploy 等后续页仍按 MVP 分阶段接入", "unknown")}
        </section>
      </div>
    </div>
  `;
}

function renderLoadingHtml() {
  return `<div class="homeai-vite-owner-console"><div class="osc-shell"><div class="osc-loading">正在读取 Owner 系统控制台...</div></div></div>`;
}

function renderErrorHtml(error) {
  const normalized = normalizeOwnerConsoleError(error);
  return `
    <div class="homeai-vite-owner-console">
      <div class="osc-shell">
        <div class="osc-error">
          <strong>Home AI 系统控制台</strong><br>
          ${escapeHtml(normalized.message)}
        </div>
      </div>
    </div>
  `;
}

export {
  CATEGORY_LABELS,
  STATUS_LABELS,
  badge,
  categoryLabel,
  escapeHtml,
  normalizeOwnerConsoleError,
  normalizeStatus,
  ownerConsoleError,
  renderErrorHtml,
  renderLoadingHtml,
  renderOwnerConsoleHtml,
  shortTime,
  statusLabel,
};
