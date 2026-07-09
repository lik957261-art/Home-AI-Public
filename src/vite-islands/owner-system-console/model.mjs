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

const CLASSIC_OWNER_SYSTEM_CONSOLE_TABS = Object.freeze(["overview", "system-status"]);

const CLASSIC_OWNER_SYSTEM_CONSOLE_TEXT = Object.freeze({
  availability: "可用性",
  accuracy: "准确性",
  autonomy: "自主性",
  overview: "概览",
  "system-status": "系统状态",
  "gateway-runtime": "Gateway 运行态",
  "plugin-matrix": "Plugin 矩阵",
  "ai-ops-diagnostics": "AI Ops 诊断",
  deployments: "部署",
  "file-media-tools": "文件与媒体工具",
  "security-boundary": "安全与边界",
  system_cpu_load: "CPU 负载",
  system_memory_usage: "内存使用",
  system_disk_usage: "磁盘使用",
  system_launchd_services: "关键服务",
  owner_console_availability: "可用性",
  owner_console_accuracy: "准确性",
  owner_console_autonomy: "自主性",
  owner_console_autonomous_delivery_dispatch: "Autonomous Delivery 调度",
  owner_console_autonomous_delivery_loop: "Autonomous Delivery 闭环",
  owner_console_loop_engineering_runtime: "Loop Engineering runtime",
  codex_at_loop_status_unreachable: "Codex Mobile Loop 状态不可达",
  codex_at_loop_status_timeout: "Codex Mobile Loop 状态超时",
  codex_at_loop_status_http_failed: "Codex Mobile Loop 状态请求失败",
  codex_at_loop_status_disabled: "Codex Mobile Loop 状态采集已关闭",
  codex_at_loop_status_collector_not_configured: "Codex Mobile Loop 状态未接入",
  runtime_slo_diagnostic_closure: "Runtime SLO 与诊断闭环",
  fresh_install_upgrade_canary: "全新安装与升级 Canary",
  gateway_message_action_contract: "Gateway 输出到消息动作契约",
  self_improving_loop_closure: "自改进循环闭环",
  architecture_governance_hardening: "架构治理加固",
  install_upgrade_canary_observed: "安装/升级 Canary 观测",
  clean_target_live_canary: "clean-target Canary",
  deterministic_action_generalization: "确定性动作泛化",
  wardrobe_reference_action_contract: "衣橱参考动作契约",
  "Runtime SLO and Diagnostic Closure": "Runtime SLO 与诊断闭环",
  "Fresh Install and Upgrade Canary": "全新安装与升级 Canary",
  "Gateway Output to Message Action Contract": "Gateway 输出到消息动作契约",
  "Self-Improving Loop Closure": "自改进循环闭环",
  "Architecture Governance Hardening": "架构治理加固",
  "Run or wire a clean-target canary readback when a target is available.": "目标可用后运行或接入 clean-target Canary 回读。",
  target_thread_not_visible: "目标线程不可见",
  return_card_watchdog_stale: "回卡 Watchdog 已标记超时",
  task_card_dispatch_duplicate_active: "重复发卡已抑制",
  reference_path_covered: "参考路径已覆盖",
});

function classicClean(value, max = 120) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (/([A-Za-z]:\\|\\\\|\/Users\/|\/home\/|\/private\/|\/var\/|\/opt\/|https?:\/\/|wss?:\/\/)/i.test(text)) return "已隐藏";
  if (/(password|secret|token|access.?key|cookie|authorization|bearer)/i.test(text)) return "已隐藏";
  return text.slice(0, max);
}

function classicDisplayText(value, max = 120) {
  const text = classicClean(value, max);
  if (!text) return "";
  return CLASSIC_OWNER_SYSTEM_CONSOLE_TEXT[text] || text;
}

function classicList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).map(([key, item]) => {
    if (item && typeof item === "object") return Object.assign({ key }, item);
    return { key, value: item };
  });
}

function classicFirstString(source, keys, defaultText = "") {
  if (!source || typeof source !== "object") return defaultText;
  for (const key of keys) {
    const value = classicClean(source[key]);
    if (value) return value;
  }
  return defaultText;
}

function classicFirstNumber(source, keys) {
  if (typeof source === "number") return Number.isFinite(source) ? source : NaN;
  if (!source || typeof source !== "object") return NaN;
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value)) return value;
  }
  return NaN;
}

function classicTone(status) {
  const text = String(status || "").toLowerCase();
  if (text === "h1") return "critical";
  if (text === "h2") return "warning";
  if (text === "h3") return "neutral";
  if (/(ok|ready|healthy|normal|pass|green|up|running|active)/.test(text)) return "ok";
  if (/(warn|degrad|limited|slow|attention|yellow|pending|partial)/.test(text)) return "warning";
  if (/(critical|fail|error|down|red|blocked|offline|expired)/.test(text)) return "critical";
  return "neutral";
}

function classicStatusLabel(status) {
  const value = String(status || "").toLowerCase().trim();
  if (value === "ok" || value === "ready" || value === "running" || value === "healthy" || value === "passed") return "正常";
  if (value === "warning" || value === "partial" || value === "pending") return value === "partial" ? "部分" : "注意";
  if (value === "degraded") return "降级";
  if (value === "blocked") return "阻塞";
  if (value === "stale") return "过期";
  if (value === "unknown" || value === "not_collected") return "未知";
  const tone = classicTone(status);
  if (tone === "ok") return "正常";
  if (tone === "warning") return "注意";
  if (tone === "critical") return "异常";
  return classicClean(status, 24) || "未知";
}

function classicSeverityRank(item = {}) {
  const tone = classicTone(item.severity || item.status || item.state || item.level);
  if (tone === "critical") return 3;
  if (tone === "warning") return 2;
  if (tone === "ok") return 0;
  return 1;
}

function classicFormatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const percentValue = number > 0 && number <= 1 ? number * 100 : number;
  return `${Math.round(percentValue * 10) / 10}%`;
}

function classicFormatBytes(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = number;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  const fixed = size >= 10 || index === 0 ? Math.round(size) : Math.round(size * 10) / 10;
  return `${fixed}${units[index]}`;
}

function classicMetricValue(metric, kind = "") {
  if (metric == null || metric === "") return "未上报";
  if (typeof metric === "number") return classicFormatPercent(metric) || String(metric);
  if (typeof metric !== "object") return classicClean(metric, 40) || "未上报";
  const percentNumber = classicFirstNumber(metric, [
    "percent",
    "percentUsed",
    "overallPercent",
    "sustainedPercent",
    "usagePercent",
    "usedPercent",
    "maxPercentUsed",
    "loadPercent",
    "valuePercent",
    "value",
  ]);
  if (Number.isFinite(percentNumber)) return classicFormatPercent(percentNumber) || "未上报";
  const used = classicFirstNumber(metric, ["usedBytes", "used", "activeBytes"]);
  const total = classicFirstNumber(metric, ["totalBytes", "total", "capacityBytes"]);
  if (Number.isFinite(used) && Number.isFinite(total) && total > 0) {
    return `${classicFormatBytes(used)} / ${classicFormatBytes(total)}`;
  }
  if (kind === "uptime") {
    const seconds = classicFirstNumber(metric, ["seconds", "uptimeSeconds", "valueSeconds"]);
    if (Number.isFinite(seconds)) return classicUptimeLabel(seconds);
  }
  return classicFirstString(metric, ["label", "summary", "status"], "未上报");
}

function classicMetricDetail(metric) {
  if (!metric || typeof metric !== "object") return "";
  const threshold = classicFirstNumber(metric, ["thresholdPercent", "warningPercent", "criticalPercent"]);
  if (Number.isFinite(threshold)) return `阈值 ${classicFormatPercent(threshold)}`;
  const free = classicFirstNumber(metric, ["freeBytes", "availableBytes"]);
  if (Number.isFinite(free)) return `可用 ${classicFormatBytes(free)}`;
  return classicFirstString(metric, ["detail", "summary", "state"], "");
}

function classicUptimeLabel(value) {
  if (typeof value === "string" && value.trim()) return classicClean(value, 40);
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return "未上报";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}天 ${hours}小时`;
  if (hours) return `${hours}小时 ${minutes}分`;
  return `${Math.max(1, minutes)}分`;
}

function classicTimeLabel(value) {
  if (!value) return "未生成";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return classicClean(value, 40) || "未生成";
  return date.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function classicMetricCard(id, label, metric, options = {}) {
  const value = id === "uptime"
    ? classicUptimeLabel(metric?.listenerSeconds ?? metric?.processSeconds ?? metric?.hostSeconds ?? metric?.seconds ?? metric?.uptimeSeconds ?? metric)
    : classicMetricValue(metric, id);
  const detail = options.detail || classicMetricDetail(metric);
  const tone = classicTone(metric?.status || metric?.state || options.status || "");
  return `<article class="owner-system-console-metric tone-${escapeHtml(tone)}" data-owner-system-console-metric="${escapeHtml(id)}">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
    ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
  </article>`;
}

function classicStatusBadge(status) {
  const tone = classicTone(status);
  return `<span class="owner-system-console-status tone-${escapeHtml(tone)}" data-owner-system-console-overall-status="${escapeHtml(status || "unknown")}">${escapeHtml(classicStatusLabel(status))}</span>`;
}

function classicDimensionCard(item = {}, index = 0) {
  const label = classicDisplayText(classicFirstString(item, ["label", "name", "title", "id", "key"], `维度 ${index + 1}`));
  const status = classicFirstString(item, ["status", "state", "level"], "unknown");
  const score = classicFirstNumber(item, ["score", "value", "percent"]);
  const summary = classicDisplayText(classicFirstString(item, ["summary", "detail", "reason"], ""), 180);
  const value = Number.isFinite(score) ? classicFormatPercent(score) : classicStatusLabel(status);
  return `<article class="owner-system-console-dimension tone-${escapeHtml(classicTone(status))}">
    <div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
    ${summary ? `<small>${escapeHtml(summary)}</small>` : ""}
  </article>`;
}

function classicSignalItem(item = {}, options = {}) {
  const label = classicDisplayText(classicFirstString(item, ["label", "title", "name", "id", "key", "signalId"], options.emptyLabel || "信号"));
  const status = classicFirstString(item, ["status", "severity", "level", "state"], "");
  const summary = classicDisplayText(classicFirstString(item, ["summary", "detail", "message", "reason"], ""), 180);
  return `<li class="owner-system-console-signal tone-${escapeHtml(classicTone(status))}">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(classicStatusLabel(status))}</strong>
    ${summary ? `<small>${escapeHtml(summary)}</small>` : ""}
  </li>`;
}

function classicCriticalSignals(consoleData = {}) {
  return classicList(consoleData.criticalSignals)
    .sort((a, b) => classicSeverityRank(b) - classicSeverityRank(a))
    .slice(0, 8);
}

function classicDispatchControlPanel(consoleData = {}) {
  const control = consoleData.autonomousDeliveryControl && typeof consoleData.autonomousDeliveryControl === "object"
    ? consoleData.autonomousDeliveryControl
    : {};
  const counts = control.counts && typeof control.counts === "object" ? control.counts : {};
  const items = classicList(control.items).slice(0, 5);
  const status = classicFirstString(control, ["status"], "unknown");
  const countText = [
    `失败 ${Number(counts.failed || 0) || 0}`,
    `冲突 ${Number(counts.deferredConflict || 0) || 0}`,
    `进行中 ${(Number(counts.dispatching || 0) || 0) + (Number(counts.sent || 0) || 0)}`,
  ].join(" / ");
  const rows = items.map((item) => {
    const label = classicFirstString(item, ["sliceKey", "sliceId", "caseId"], "调度切片");
    const itemStatus = classicFirstString(item, ["dispatchStatus", "status"], "unknown");
    const reason = classicDisplayText(classicFirstString(item, ["failureCode", "conflictCode", "blockedReason", "recommendedAction"], ""), 160);
    return `<li class="owner-system-console-signal tone-${escapeHtml(classicTone(itemStatus))}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(classicStatusLabel(itemStatus))}</strong>
      ${reason ? `<small>${escapeHtml(reason)}</small>` : ""}
    </li>`;
  }).join("");
  return `<section class="owner-system-console-panel" data-owner-system-console-status-section="delivery-dispatch">
    <div class="owner-system-console-section-head">
      <strong>交付调度</strong>
      <span>${escapeHtml(countText)}</span>
    </div>
    <div class="owner-system-console-dispatch-summary tone-${escapeHtml(classicTone(status))}">
      <span>${escapeHtml(classicStatusLabel(status))}</span>
      <small>${escapeHtml(status === "ok" ? "无待处理调度异常" : "通过行动收件箱处理重试或确认")}</small>
    </div>
    ${rows ? `<ul class="owner-system-console-signal-list">${rows}</ul>` : ""}
  </section>`;
}

function classicDeliveryLoopPanel(consoleData = {}) {
  const loop = consoleData.autonomousDeliveryLoop && typeof consoleData.autonomousDeliveryLoop === "object"
    ? consoleData.autonomousDeliveryLoop
    : {};
  const counts = loop.counts && typeof loop.counts === "object" ? loop.counts : {};
  const items = classicList(loop.items).slice(0, 5);
  const status = classicFirstString(loop, ["status"], "unknown");
  const countText = [
    `打开 ${Number(counts.open || 0) || 0}`,
    `等回卡 ${Number(counts.waitingReturn || 0) || 0}`,
    `阻塞 ${Number(counts.blocked || 0) || 0}`,
    `重复抑制 ${Number(counts.duplicateSuppressed || 0) || 0}`,
    `已闭环 ${Number(counts.verifiedClosed || 0) || 0}`,
  ].join(" / ");
  const rows = items.map((item) => {
    const label = classicFirstString(item, ["caseId"], "delivery case");
    const itemStatus = classicFirstString(item, ["status", "dispatchStatus"], "unknown");
    const reason = classicDisplayText(classicFirstString(item, ["blockedReason", "dispatchStatus", "attentionSliceKey"], ""), 160);
    return `<li class="owner-system-console-signal tone-${escapeHtml(classicTone(itemStatus))}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(classicStatusLabel(itemStatus))}</strong>
      ${reason ? `<small>${escapeHtml(reason)}</small>` : ""}
    </li>`;
  }).join("");
  return `<section class="owner-system-console-panel" data-owner-system-console-status-section="delivery-loop">
    <div class="owner-system-console-section-head">
      <strong>交付闭环</strong>
      <span>${escapeHtml(countText)}</span>
    </div>
    <div class="owner-system-console-dispatch-summary tone-${escapeHtml(classicTone(status))}">
      <span>${escapeHtml(classicStatusLabel(status))}</span>
      <small>${escapeHtml(status === "ok" ? "闭环 ledger 无阻塞" : "查看卡住的 case、回卡和重复抑制")}</small>
    </div>
    ${rows ? `<ul class="owner-system-console-signal-list">${rows}</ul>` : ""}
  </section>`;
}

function classicLoopEngineeringPanel(consoleData = {}) {
  const loop = consoleData.loopEngineeringStatus && typeof consoleData.loopEngineeringStatus === "object"
    ? consoleData.loopEngineeringStatus
    : {};
  const counts = loop.counts && typeof loop.counts === "object" ? loop.counts : {};
  const items = classicList(loop.items).slice(0, 5);
  const status = classicFirstString(loop, ["status"], "unknown");
  const countText = [
    `打开 ${Number(counts.open || 0) || 0}`,
    `等回卡 ${Number(counts.waitingReturn || 0) || 0}`,
    `阻塞 ${Number(counts.blocked || 0) || 0}`,
    `已闭环 ${Number(counts.verifiedClosed || 0) || 0}`,
  ].join(" / ");
  const rows = items.map((item) => {
    const label = classicFirstString(item, ["loopId", "target", "caseId"], "Loop");
    const itemStatus = classicFirstString(item, ["status", "runtimeStatus"], "unknown");
    const reason = classicDisplayText(classicFirstString(item, ["nextRoute", "blockedReason", "currentRole"], ""), 160);
    return `<li class="owner-system-console-signal tone-${escapeHtml(classicTone(itemStatus))}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(classicStatusLabel(itemStatus))}</strong>
      ${reason ? `<small>${escapeHtml(reason)}</small>` : ""}
    </li>`;
  }).join("");
  return `<section class="owner-system-console-panel" data-owner-system-console-status-section="loop-engineering">
    <div class="owner-system-console-section-head">
      <strong>Loop Engineering</strong>
      <span>${escapeHtml(countText)}</span>
    </div>
    <div class="owner-system-console-dispatch-summary tone-${escapeHtml(classicTone(status))}">
      <span>${escapeHtml(classicStatusLabel(status))}</span>
      <small>${escapeHtml(status === "ok" ? "Codex Mobile runtime 已接通" : "检查 Codex Mobile @loop runtime")}</small>
    </div>
    ${rows ? `<ul class="owner-system-console-signal-list">${rows}</ul>` : ""}
  </section>`;
}

function classicQualityProgramPanel(consoleData = {}) {
  const program = consoleData.qualityProgram && typeof consoleData.qualityProgram === "object" ? consoleData.qualityProgram : null;
  if (!program) return "";
  const workstreams = classicList(program.workstreams).slice(0, 5);
  const gaps = classicList(program.gaps).slice(0, 4);
  const status = classicFirstString(program, ["status"], "unknown");
  const progress = classicFormatPercent(classicFirstNumber(program, ["progressPercent"]));
  const rows = workstreams.map((item) => {
    const title = classicDisplayText(classicFirstString(item, ["title", "id"], "3A 工作流"));
    const itemStatus = classicFirstString(item, ["status"], "unknown");
    const itemProgress = classicFormatPercent(classicFirstNumber(item, ["progressPercent"]));
    return `<li class="owner-system-console-signal tone-${escapeHtml(classicTone(itemStatus))}">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(itemProgress || classicStatusLabel(itemStatus))}</strong>
      <small>${escapeHtml(classicStatusLabel(itemStatus))}</small>
    </li>`;
  }).join("");
  const gapRows = gaps.map((item) => {
    const label = classicDisplayText(classicFirstString(item, ["requirementId", "workstreamId"], "缺口"));
    const gap = classicDisplayText(classicFirstString(item, ["gap"], ""), 220);
    const itemStatus = classicFirstString(item, ["status"], "unknown");
    return `<li class="owner-system-console-signal tone-${escapeHtml(classicTone(itemStatus))}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(classicStatusLabel(itemStatus))}</strong>
      ${gap ? `<small>${escapeHtml(gap)}</small>` : ""}
    </li>`;
  }).join("");
  return `<section class="owner-system-console-panel" data-owner-system-console-status-section="quality-program">
    <div class="owner-system-console-section-head">
      <strong>3A 目标</strong>
      <span>${escapeHtml(progress || "未计算")}</span>
    </div>
    <div class="owner-system-console-quality-summary tone-${escapeHtml(classicTone(status))}">
      <span>${escapeHtml(classicStatusLabel(status))}</span>
      <small>${escapeHtml(gaps.length ? `${gaps.length} 个主要缺口` : "当前证据无缺口")}</small>
    </div>
    ${rows ? `<ul class="owner-system-console-signal-list">${rows}</ul>` : ""}
    ${gapRows ? `<ul class="owner-system-console-signal-list" data-owner-system-console-quality-gaps>${gapRows}</ul>` : ""}
  </section>`;
}

function classicResourceWarnings(systemStatus = {}) {
  const signals = classicList(systemStatus.signals).filter((item) => classicSeverityRank(item) >= 2);
  const thresholds = classicList(systemStatus.thresholds).filter((item) => classicSeverityRank(item) >= 2 || classicFirstString(item, ["status", "state"], ""));
  return [...signals, ...thresholds].sort((a, b) => classicSeverityRank(b) - classicSeverityRank(a)).slice(0, 8);
}

function classicCriticalServices(systemStatus = {}) {
  const services = classicList(systemStatus.services);
  const critical = services.filter((service) => (
    service.critical === true
    || service.required === true
    || classicSeverityRank(service) >= 2
  ));
  return (critical.length ? critical : services.slice(0, 6)).slice(0, 8);
}

function classicCodexMobileRuntimePanel(systemStatus = {}) {
  const runtime = systemStatus.codexMobile && typeof systemStatus.codexMobile === "object" ? systemStatus.codexMobile : null;
  if (!runtime || runtime.available === false) return "";
  const status = classicFirstString(runtime, ["status"], "unknown");
  const processes = classicList(runtime.processes).slice(0, 6);
  const logs = runtime.logs && typeof runtime.logs === "object" ? runtime.logs : {};
  const totalCpu = classicFirstNumber(runtime, ["totalCpuPercent"]);
  const totalRss = classicFirstNumber(runtime, ["totalRssBytes"]);
  const logSize = classicFirstNumber(logs, ["totalSizeBytes", "maxSizeBytes"]);
  const logGrowth = classicFirstNumber(logs, ["growthBytesPerSecond"]);
  const summary = [
    Number.isFinite(totalCpu) ? `CPU ${classicFormatPercent(totalCpu)}` : "CPU 未采集",
    Number.isFinite(totalRss) ? `RSS ${classicFormatBytes(totalRss)}` : "RSS 未采集",
    Number.isFinite(logSize) ? `日志 ${classicFormatBytes(logSize)}` : "日志未采集",
  ].join(" / ");
  const growthLabel = logs.growthAvailable && Number.isFinite(logGrowth)
    ? `增长 ${classicFormatBytes(logGrowth)}/s`
    : "增长待第二次采样";
  const rows = processes.map((process) => {
    const label = classicDisplayText(classicFirstString(process, ["label", "role"], "Codex Mobile process"), 80);
    const itemStatus = classicFirstString(process, ["status"], "unknown");
    const cpu = classicFirstNumber(process, ["cpuPercent"]);
    const rss = classicFirstNumber(process, ["rssBytes"]);
    const detail = [
      Number.isFinite(cpu) ? `CPU ${classicFormatPercent(cpu)}` : "",
      Number.isFinite(rss) ? `RSS ${classicFormatBytes(rss)}` : "",
      classicFirstString(process, ["elapsed"], ""),
    ].filter(Boolean).join(" / ");
    return `<li class="owner-system-console-signal tone-${escapeHtml(classicTone(itemStatus))}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(classicStatusLabel(itemStatus))}</strong>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
    </li>`;
  }).join("");
  return `<section class="owner-system-console-panel" data-owner-system-console-status-section="codex-mobile-runtime">
    <div class="owner-system-console-section-head">
      <strong>Codex Mobile Runtime</strong>
      <span>${escapeHtml(classicStatusLabel(status))}</span>
    </div>
    <div class="owner-system-console-dispatch-summary tone-${escapeHtml(classicTone(status))}">
      <span>${escapeHtml(summary)}</span>
      <small>${escapeHtml(growthLabel)}</small>
    </div>
    ${rows ? `<ul class="owner-system-console-signal-list">${rows}</ul>` : `<div class="owner-system-console-empty">未发现 Codex Mobile 运行时进程。</div>`}
  </section>`;
}

function renderClassicOwnerSystemConsoleUnavailable() {
  return `<section class="owner-system-console owner-system-console-unavailable" data-owner-system-console>
    <div class="owner-system-console-empty" data-owner-system-console-unavailable>
      <strong>仅 Owner 可见</strong>
      <span>当前账号不能查看系统控制台。</span>
    </div>
  </section>`;
}

function renderClassicOwnerSystemConsoleOverview(model = {}) {
  const consoleData = model.console || {};
  const systemStatus = consoleData.systemStatus || model.systemStatus || {};
  const dimensions = classicList(consoleData.dimensions).slice(0, 3);
  const signals = classicCriticalSignals(consoleData);
  return `<section class="owner-system-console-overview" data-owner-system-console-overview>
    <div class="owner-system-console-summary">
      <div>
        <span class="owner-system-console-kicker">总体状态</span>
        ${classicStatusBadge(consoleData.overallStatus)}
      </div>
      <span class="owner-system-console-time">生成 ${escapeHtml(classicTimeLabel(consoleData.generatedAt))}</span>
    </div>
    <div class="owner-system-console-dimensions" data-owner-system-console-status-section="dimensions">
      ${dimensions.length ? dimensions.map(classicDimensionCard).join("") : `<div class="owner-system-console-empty">暂无 3A 维度。</div>`}
    </div>
    <div class="owner-system-console-metric-grid" data-owner-system-console-status-section="overview-resources">
      ${classicMetricCard("cpu", "CPU", systemStatus.cpu)}
      ${classicMetricCard("memory", "内存", systemStatus.memory)}
      ${classicMetricCard("disk", "磁盘", systemStatus.disk)}
    </div>
    ${classicQualityProgramPanel(consoleData)}
    ${classicDispatchControlPanel(consoleData)}
    ${classicDeliveryLoopPanel(consoleData)}
    ${classicLoopEngineeringPanel(consoleData)}
    <section class="owner-system-console-panel" data-owner-system-console-status-section="critical-signals">
      <div class="owner-system-console-section-head">
        <strong>关键信号</strong>
        <span>${escapeHtml(signals.length)} 项</span>
      </div>
      ${signals.length
        ? `<ul class="owner-system-console-signal-list">${signals.map((item) => classicSignalItem(item)).join("")}</ul>`
        : `<div class="owner-system-console-empty">暂无关键告警。</div>`}
    </section>
  </section>`;
}

function renderClassicOwnerSystemConsoleServiceTable(systemStatus = {}) {
  const services = classicCriticalServices(systemStatus);
  if (!services.length) return `<div class="owner-system-console-empty">暂无关键服务数据。</div>`;
  const rows = services.map((service) => {
    const label = classicDisplayText(classicFirstString(service, ["label", "name", "id", "key"], "服务"));
    const status = classicFirstString(service, ["status", "state", "level"], "unknown");
    const signal = classicDisplayText(classicFirstString(service, ["summary", "detail", "reason", "role"], ""), 160);
    return `<tr class="tone-${escapeHtml(classicTone(status))}">
      <td>${escapeHtml(label)}</td>
      <td>${escapeHtml(classicStatusLabel(status))}</td>
      <td>${escapeHtml(signal || "已上报")}</td>
    </tr>`;
  }).join("");
  return `<div class="owner-system-console-table-wrap">
    <table class="owner-system-console-service-table">
      <thead>
        <tr><th>服务</th><th>状态</th><th>信号</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderClassicOwnerSystemConsoleSystemStatus(model = {}) {
  const consoleData = model.console || {};
  const systemStatus = model.systemStatus || consoleData.systemStatus || {};
  const warnings = classicResourceWarnings(systemStatus);
  const collectedAt = systemStatus.collectedAt || consoleData.generatedAt || "";
  return `<section class="owner-system-console-system-status" data-owner-system-console-system-status>
    <div class="owner-system-console-metric-grid" data-owner-system-console-status-section="system-resources">
      ${classicMetricCard("cpu", "CPU", systemStatus.cpu)}
      ${classicMetricCard("memory", "内存", systemStatus.memory)}
      ${classicMetricCard("disk", "磁盘", systemStatus.disk)}
      ${classicMetricCard("uptime", "运行时间", systemStatus.uptime)}
    </div>
    ${classicCodexMobileRuntimePanel(systemStatus)}
    <section class="owner-system-console-panel" data-owner-system-console-status-section="services">
      <div class="owner-system-console-section-head">
        <strong>关键服务</strong>
        <span>采集 ${escapeHtml(classicTimeLabel(collectedAt))}</span>
      </div>
      ${model.systemStatusLoading ? `<div class="owner-system-console-empty">正在读取系统状态...</div>` : renderClassicOwnerSystemConsoleServiceTable(systemStatus)}
    </section>
    <section class="owner-system-console-panel" data-owner-system-console-status-section="resource-warnings">
      <div class="owner-system-console-section-head">
        <strong>资源告警</strong>
        <span>${escapeHtml(warnings.length)} 项</span>
      </div>
      ${warnings.length
        ? `<ul class="owner-system-console-signal-list" data-owner-system-console-resource-warnings>${warnings.map((item) => classicSignalItem(item, { emptyLabel: "资源" })).join("")}</ul>`
        : `<div class="owner-system-console-empty" data-owner-system-console-resource-warnings>暂无资源告警。</div>`}
    </section>
  </section>`;
}

function renderClassicOwnerSystemConsoleView(options = {}) {
  if (!options.isOwner) return renderClassicOwnerSystemConsoleUnavailable();
  const model = options.model && typeof options.model === "object" ? options.model : {};
  if (CLASSIC_OWNER_SYSTEM_CONSOLE_TABS.includes(options.tab)) model.activeTab = options.tab;
  const activeTab = CLASSIC_OWNER_SYSTEM_CONSOLE_TABS.includes(model.activeTab) ? model.activeTab : "overview";
  const error = model.error || model.systemStatusError || "";
  const body = activeTab === "system-status"
    ? renderClassicOwnerSystemConsoleSystemStatus(model)
    : renderClassicOwnerSystemConsoleOverview(model);
  return `<section class="owner-system-console" data-owner-system-console>
    <header class="owner-system-console-head">
      <div>
        <span class="owner-system-console-kicker">Owner 中心</span>
        <h2>系统控制台</h2>
      </div>
      <button type="button" data-owner-system-console-refresh${model.loading || model.systemStatusLoading ? " disabled" : ""}>${model.loading || model.systemStatusLoading ? "刷新中" : "刷新"}</button>
    </header>
    <nav class="owner-system-console-tabs" role="tablist" aria-label="系统控制台">
      <button type="button" role="tab" data-owner-system-console-tab="overview" aria-selected="${activeTab === "overview" ? "true" : "false"}" class="${activeTab === "overview" ? "active" : ""}">概览</button>
      <button type="button" role="tab" data-owner-system-console-tab="system-status" aria-selected="${activeTab === "system-status" ? "true" : "false"}" class="${activeTab === "system-status" ? "active" : ""}">系统状态</button>
    </nav>
    ${error ? `<div class="owner-system-console-error" role="status">${escapeHtml(classicClean(error, 160))}</div>` : ""}
    ${model.loading && !model.console ? `<div class="owner-system-console-empty">正在读取控制台...</div>` : body}
  </section>`;
}

export {
  CATEGORY_LABELS,
  CLASSIC_OWNER_SYSTEM_CONSOLE_TABS,
  STATUS_LABELS,
  badge,
  categoryLabel,
  escapeHtml,
  classicStatusLabel,
  classicTone,
  normalizeOwnerConsoleError,
  normalizeStatus,
  ownerConsoleError,
  renderClassicOwnerSystemConsoleOverview,
  renderClassicOwnerSystemConsoleSystemStatus,
  renderClassicOwnerSystemConsoleUnavailable,
  renderClassicOwnerSystemConsoleView,
  renderErrorHtml,
  renderLoadingHtml,
  renderOwnerConsoleHtml,
  shortTime,
  statusLabel,
};
