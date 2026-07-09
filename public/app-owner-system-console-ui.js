"use strict";

const OWNER_SYSTEM_CONSOLE_API_PATH = "/api/owner/system-console";
const OWNER_SYSTEM_CONSOLE_STATUS_API_PATH = "/api/owner/system-console/system-status";
const OWNER_SYSTEM_CONSOLE_ESM_MODEL_PATH = "/vite-islands/owner-system-console-model/owner-system-console-model.js";
const OWNER_SYSTEM_CONSOLE_TABS = Object.freeze(["overview", "system-status"]);
let ownerSystemConsoleEsmModelPromise = null;
let ownerSystemConsoleEsmModel = null;

function ownerSystemConsoleAppState() {
  if (typeof state === "undefined" || !state || typeof state !== "object") return {};
  return state;
}

function ownerSystemConsoleModel() {
  const appState = ownerSystemConsoleAppState();
  if (!appState.ownerSystemConsole || typeof appState.ownerSystemConsole !== "object") {
    appState.ownerSystemConsole = {};
  }
  const model = appState.ownerSystemConsole;
  if (!OWNER_SYSTEM_CONSOLE_TABS.includes(model.activeTab)) model.activeTab = "overview";
  if (!Array.isArray(model.lastErrors)) model.lastErrors = [];
  return model;
}

function ownerSystemConsoleIsOwner() {
  return Boolean(ownerSystemConsoleAppState().auth?.isOwner);
}

function ownerSystemConsoleRuntimeFacade() {
  const root = typeof window !== "undefined"
    ? window
    : (typeof globalThis !== "undefined" ? globalThis : null);
  const facade = root?.HomeAiRuntimeFacade;
  return facade && typeof facade === "object" ? facade : null;
}

function ownerSystemConsoleRuntimeEvent(type, detail = {}) {
  ownerSystemConsoleRuntimeFacade()?.events?.emit?.(type, Object.assign({ source: "classic-owner-system-console" }, detail));
}

function ownerSystemConsoleRuntimeState(patch = {}) {
  ownerSystemConsoleRuntimeFacade()?.state?.set?.(patch);
}

function ownerSystemConsoleUsableEsmModel(model) {
  return Boolean(
    model
      && typeof model.renderClassicOwnerSystemConsoleView === "function"
      && typeof model.renderClassicOwnerSystemConsoleOverview === "function"
      && typeof model.renderClassicOwnerSystemConsoleSystemStatus === "function"
      && typeof model.classicStatusLabel === "function"
      && typeof model.classicTone === "function",
  );
}

function ownerSystemConsoleLoadedEsmModel() {
  if (ownerSystemConsoleUsableEsmModel(ownerSystemConsoleEsmModel)) return ownerSystemConsoleEsmModel;
  return null;
}

function importOwnerSystemConsoleModel() {
  const loaded = ownerSystemConsoleLoadedEsmModel();
  if (loaded) return Promise.resolve(loaded);
  const root = typeof window !== "undefined"
    ? window
    : (typeof globalThis !== "undefined" ? globalThis : null);
  if (!ownerSystemConsoleEsmModelPromise) {
    ownerSystemConsoleEsmModelPromise = (typeof root?.__homeAiImportOwnerSystemConsoleModel === "function"
      ? root.__homeAiImportOwnerSystemConsoleModel(OWNER_SYSTEM_CONSOLE_ESM_MODEL_PATH)
      : import(OWNER_SYSTEM_CONSOLE_ESM_MODEL_PATH)
    ).then((model) => {
      ownerSystemConsoleEsmModel = ownerSystemConsoleUsableEsmModel(model) ? model : null;
      return ownerSystemConsoleEsmModel;
    }).catch(() => null);
  }
  return ownerSystemConsoleEsmModelPromise;
}

function ownerSystemConsoleSetViewMode(viewMode) {
  const normalized = String(viewMode || "").trim() || "system-console";
  ownerSystemConsoleAppState().viewMode = normalized;
  const route = ownerSystemConsoleRuntimeFacade()?.route;
  if (typeof route?.setViewMode === "function") {
    return route.setViewMode(normalized, { source: "classic-owner-system-console" });
  }
  ownerSystemConsoleRuntimeState({ viewMode: normalized });
  return normalized;
}

function ownerSystemConsoleApi(endpoint, options = {}) {
  const facadeApi = ownerSystemConsoleRuntimeFacade()?.api;
  if (typeof facadeApi === "function") return facadeApi(endpoint, options);
  return api(endpoint, options);
}

function ownerSystemConsoleEscape(value) {
  if (typeof escapeHtml === "function") return escapeHtml(value);
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function ownerSystemConsoleClean(value, max = 120) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (/([A-Za-z]:\\|\\\\|\/Users\/|\/home\/|\/private\/|\/var\/|\/opt\/|https?:\/\/|wss?:\/\/)/i.test(text)) return "已隐藏";
  if (/(password|secret|token|access.?key|cookie|authorization|bearer)/i.test(text)) return "已隐藏";
  return text.slice(0, max);
}

const OWNER_SYSTEM_CONSOLE_TEXT = Object.freeze({
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
  "system_cpu_load": "CPU 负载",
  "system_memory_usage": "内存使用",
  "system_disk_usage": "磁盘使用",
  "system_launchd_services": "关键服务",
  "owner_console_availability": "可用性",
  "owner_console_accuracy": "准确性",
  "owner_console_autonomy": "自主性",
  "owner_console_autonomous_delivery_dispatch": "Autonomous Delivery 调度",
  "owner_console_autonomous_delivery_loop": "Autonomous Delivery 闭环",
  "owner_console_loop_engineering_runtime": "Loop Engineering runtime",
  "codex_at_loop_status_unreachable": "Codex Mobile Loop 状态不可达",
  "codex_at_loop_status_timeout": "Codex Mobile Loop 状态超时",
  "codex_at_loop_status_http_failed": "Codex Mobile Loop 状态请求失败",
  "codex_at_loop_status_disabled": "Codex Mobile Loop 状态采集已关闭",
  "codex_at_loop_status_collector_not_configured": "Codex Mobile Loop 状态未接入",
  "runtime_slo_diagnostic_closure": "Runtime SLO 与诊断闭环",
  "fresh_install_upgrade_canary": "全新安装与升级 Canary",
  "gateway_message_action_contract": "Gateway 输出到消息动作契约",
  "self_improving_loop_closure": "自改进循环闭环",
  "architecture_governance_hardening": "架构治理加固",
  "install_upgrade_canary_observed": "安装/升级 Canary 观测",
  "clean_target_live_canary": "clean-target Canary",
  "deterministic_action_generalization": "确定性动作泛化",
  "wardrobe_reference_action_contract": "衣橱参考动作契约",
  "Runtime SLO and Diagnostic Closure": "Runtime SLO 与诊断闭环",
  "Fresh Install and Upgrade Canary": "全新安装与升级 Canary",
  "Gateway Output to Message Action Contract": "Gateway 输出到消息动作契约",
  "Self-Improving Loop Closure": "自改进循环闭环",
  "Architecture Governance Hardening": "架构治理加固",
  "Run or wire a clean-target canary readback when a target is available.": "目标可用后运行或接入 clean-target Canary 回读。",
  "target_thread_not_visible": "目标线程不可见",
  "return_card_watchdog_stale": "回卡 Watchdog 已标记超时",
  "task_card_dispatch_duplicate_active": "重复发卡已抑制",
  "not_collected": "未采集",
  "reference_path_covered": "参考路径已覆盖",
});

function ownerSystemConsoleDisplayText(value, max = 120) {
  const text = ownerSystemConsoleClean(value, max);
  if (!text) return "";
  return OWNER_SYSTEM_CONSOLE_TEXT[text] || text;
}

function ownerSystemConsoleList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).map(([key, item]) => {
    if (item && typeof item === "object") return Object.assign({ key }, item);
    return { key, value: item };
  });
}

function ownerSystemConsoleFirstString(source, keys, fallback = "") {
  if (!source || typeof source !== "object") return fallback;
  for (const key of keys) {
    const value = ownerSystemConsoleClean(source[key]);
    if (value) return value;
  }
  return fallback;
}

function ownerSystemConsoleFirstNumber(source, keys) {
  if (typeof source === "number") return Number.isFinite(source) ? source : NaN;
  if (!source || typeof source !== "object") return NaN;
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value)) return value;
  }
  return NaN;
}

function ownerSystemConsoleTone(status) {
  const text = String(status || "").toLowerCase();
  if (text === "h1") return "critical";
  if (text === "h2") return "warning";
  if (text === "h3") return "neutral";
  if (/(ok|ready|healthy|normal|pass|green|up|running|active)/.test(text)) return "ok";
  if (/(warn|degrad|limited|slow|attention|yellow|pending)/.test(text)) return "warning";
  if (/(critical|fail|error|down|red|blocked|offline|expired)/.test(text)) return "critical";
  return "neutral";
}

function ownerSystemConsoleStatusLabel(status) {
  const value = String(status || "").toLowerCase().trim();
  if (value === "ok" || value === "ready" || value === "running" || value === "healthy" || value === "passed") return "正常";
  if (value === "warning" || value === "partial" || value === "pending") return value === "partial" ? "部分" : "注意";
  if (value === "degraded") return "降级";
  if (value === "blocked") return "阻塞";
  if (value === "stale") return "过期";
  if (value === "unknown" || value === "not_collected") return "未知";
  const tone = ownerSystemConsoleTone(status);
  if (tone === "ok") return "正常";
  if (tone === "warning") return "注意";
  if (tone === "critical") return "异常";
  return ownerSystemConsoleClean(status, 24) || "未知";
}

function ownerSystemConsoleSeverityRank(item = {}) {
  const tone = ownerSystemConsoleTone(item.severity || item.status || item.state || item.level);
  if (tone === "critical") return 3;
  if (tone === "warning") return 2;
  if (tone === "ok") return 0;
  return 1;
}

function ownerSystemConsoleFormatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const percent = number > 0 && number <= 1 ? number * 100 : number;
  return `${Math.round(percent * 10) / 10}%`;
}

function ownerSystemConsoleFormatBytes(value) {
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

function ownerSystemConsoleMetricValue(metric, kind = "") {
  if (metric == null || metric === "") return "未上报";
  if (typeof metric === "number") return ownerSystemConsoleFormatPercent(metric) || String(metric);
  if (typeof metric !== "object") return ownerSystemConsoleClean(metric, 40) || "未上报";
  const percent = ownerSystemConsoleFirstNumber(metric, [
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
  if (Number.isFinite(percent)) return ownerSystemConsoleFormatPercent(percent) || "未上报";
  const used = ownerSystemConsoleFirstNumber(metric, ["usedBytes", "used", "activeBytes"]);
  const total = ownerSystemConsoleFirstNumber(metric, ["totalBytes", "total", "capacityBytes"]);
  if (Number.isFinite(used) && Number.isFinite(total) && total > 0) {
    return `${ownerSystemConsoleFormatBytes(used)} / ${ownerSystemConsoleFormatBytes(total)}`;
  }
  if (kind === "uptime") {
    const seconds = ownerSystemConsoleFirstNumber(metric, ["seconds", "uptimeSeconds", "valueSeconds"]);
    if (Number.isFinite(seconds)) return ownerSystemConsoleUptimeLabel(seconds);
  }
  return ownerSystemConsoleFirstString(metric, ["label", "summary", "status"], "未上报");
}

function ownerSystemConsoleMetricDetail(metric) {
  if (!metric || typeof metric !== "object") return "";
  const threshold = ownerSystemConsoleFirstNumber(metric, ["thresholdPercent", "warningPercent", "criticalPercent"]);
  if (Number.isFinite(threshold)) return `阈值 ${ownerSystemConsoleFormatPercent(threshold)}`;
  const free = ownerSystemConsoleFirstNumber(metric, ["freeBytes", "availableBytes"]);
  if (Number.isFinite(free)) return `可用 ${ownerSystemConsoleFormatBytes(free)}`;
  return ownerSystemConsoleFirstString(metric, ["detail", "summary", "state"], "");
}

function ownerSystemConsoleUptimeLabel(value) {
  if (typeof value === "string" && value.trim()) return ownerSystemConsoleClean(value, 40);
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return "未上报";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}天 ${hours}小时`;
  if (hours) return `${hours}小时 ${minutes}分`;
  return `${Math.max(1, minutes)}分`;
}

function ownerSystemConsoleTimeLabel(value) {
  if (!value) return "未生成";
  if (typeof formatTime === "function") {
    const label = formatTime(value);
    if (label) return label;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return ownerSystemConsoleClean(value, 40) || "未生成";
  return date.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function ownerSystemConsoleMetricCard(id, label, metric, options = {}) {
  const value = id === "uptime"
    ? ownerSystemConsoleUptimeLabel(metric?.listenerSeconds ?? metric?.processSeconds ?? metric?.hostSeconds ?? metric?.seconds ?? metric?.uptimeSeconds ?? metric)
    : ownerSystemConsoleMetricValue(metric, id);
  const detail = options.detail || ownerSystemConsoleMetricDetail(metric);
  const tone = ownerSystemConsoleTone(metric?.status || metric?.state || options.status || "");
  return `<article class="owner-system-console-metric tone-${ownerSystemConsoleEscape(tone)}" data-owner-system-console-metric="${ownerSystemConsoleEscape(id)}">
    <span>${ownerSystemConsoleEscape(label)}</span>
    <strong>${ownerSystemConsoleEscape(value)}</strong>
    ${detail ? `<small>${ownerSystemConsoleEscape(detail)}</small>` : ""}
  </article>`;
}

function ownerSystemConsoleStatusBadge(status) {
  const tone = ownerSystemConsoleTone(status);
  return `<span class="owner-system-console-status tone-${ownerSystemConsoleEscape(tone)}" data-owner-system-console-overall-status="${ownerSystemConsoleEscape(status || "unknown")}">${ownerSystemConsoleEscape(ownerSystemConsoleStatusLabel(status))}</span>`;
}

function ownerSystemConsoleDimensionCard(item = {}, index = 0) {
  const label = ownerSystemConsoleDisplayText(ownerSystemConsoleFirstString(item, ["label", "name", "title", "id", "key"], `维度 ${index + 1}`));
  const status = ownerSystemConsoleFirstString(item, ["status", "state", "level"], "unknown");
  const score = ownerSystemConsoleFirstNumber(item, ["score", "value", "percent"]);
  const summary = ownerSystemConsoleDisplayText(ownerSystemConsoleFirstString(item, ["summary", "detail", "reason"], ""), 180);
  const value = Number.isFinite(score) ? ownerSystemConsoleFormatPercent(score) : ownerSystemConsoleStatusLabel(status);
  return `<article class="owner-system-console-dimension tone-${ownerSystemConsoleEscape(ownerSystemConsoleTone(status))}">
    <div>
      <span>${ownerSystemConsoleEscape(label)}</span>
      <strong>${ownerSystemConsoleEscape(value)}</strong>
    </div>
    ${summary ? `<small>${ownerSystemConsoleEscape(summary)}</small>` : ""}
  </article>`;
}

function ownerSystemConsoleSignalItem(item = {}, options = {}) {
  const label = ownerSystemConsoleDisplayText(ownerSystemConsoleFirstString(item, ["label", "title", "name", "id", "key", "signalId"], options.emptyLabel || "信号"));
  const status = ownerSystemConsoleFirstString(item, ["status", "severity", "level", "state"], "");
  const summary = ownerSystemConsoleDisplayText(ownerSystemConsoleFirstString(item, ["summary", "detail", "message", "reason"], ""), 180);
  return `<li class="owner-system-console-signal tone-${ownerSystemConsoleEscape(ownerSystemConsoleTone(status))}">
    <span>${ownerSystemConsoleEscape(label)}</span>
    <strong>${ownerSystemConsoleEscape(ownerSystemConsoleStatusLabel(status))}</strong>
    ${summary ? `<small>${ownerSystemConsoleEscape(summary)}</small>` : ""}
  </li>`;
}

function ownerSystemConsoleCriticalSignals(consoleData = {}) {
  return ownerSystemConsoleList(consoleData.criticalSignals)
    .sort((a, b) => ownerSystemConsoleSeverityRank(b) - ownerSystemConsoleSeverityRank(a))
    .slice(0, 8);
}

function ownerSystemConsoleAutonomousDeliveryControl(consoleData = {}) {
  const control = consoleData.autonomousDeliveryControl;
  return control && typeof control === "object" ? control : {};
}

function ownerSystemConsoleDispatchControlPanel(consoleData = {}) {
  const control = ownerSystemConsoleAutonomousDeliveryControl(consoleData);
  const counts = control.counts && typeof control.counts === "object" ? control.counts : {};
  const items = ownerSystemConsoleList(control.items).slice(0, 5);
  const status = ownerSystemConsoleFirstString(control, ["status"], "unknown");
  const countText = [
    `失败 ${Number(counts.failed || 0) || 0}`,
    `冲突 ${Number(counts.deferredConflict || 0) || 0}`,
    `进行中 ${(Number(counts.dispatching || 0) || 0) + (Number(counts.sent || 0) || 0)}`,
  ].join(" / ");
  const rows = items.map((item) => {
    const label = ownerSystemConsoleFirstString(item, ["sliceKey", "sliceId", "caseId"], "调度切片");
    const itemStatus = ownerSystemConsoleFirstString(item, ["dispatchStatus", "status"], "unknown");
    const reason = ownerSystemConsoleDisplayText(ownerSystemConsoleFirstString(item, ["failureCode", "conflictCode", "blockedReason", "recommendedAction"], ""), 160);
    return `<li class="owner-system-console-signal tone-${ownerSystemConsoleEscape(ownerSystemConsoleTone(itemStatus))}">
      <span>${ownerSystemConsoleEscape(label)}</span>
      <strong>${ownerSystemConsoleEscape(ownerSystemConsoleStatusLabel(itemStatus))}</strong>
      ${reason ? `<small>${ownerSystemConsoleEscape(reason)}</small>` : ""}
    </li>`;
  }).join("");
  return `<section class="owner-system-console-panel" data-owner-system-console-status-section="delivery-dispatch">
    <div class="owner-system-console-section-head">
      <strong>交付调度</strong>
      <span>${ownerSystemConsoleEscape(countText)}</span>
    </div>
    <div class="owner-system-console-dispatch-summary tone-${ownerSystemConsoleEscape(ownerSystemConsoleTone(status))}">
      <span>${ownerSystemConsoleEscape(ownerSystemConsoleStatusLabel(status))}</span>
      <small>${ownerSystemConsoleEscape(status === "ok" ? "无待处理调度异常" : "通过行动收件箱处理重试或确认")}</small>
    </div>
    ${rows ? `<ul class="owner-system-console-signal-list">${rows}</ul>` : ""}
  </section>`;
}

function ownerSystemConsoleDeliveryLoopPanel(consoleData = {}) {
  const loop = consoleData.autonomousDeliveryLoop && typeof consoleData.autonomousDeliveryLoop === "object"
    ? consoleData.autonomousDeliveryLoop
    : {};
  const counts = loop.counts && typeof loop.counts === "object" ? loop.counts : {};
  const items = ownerSystemConsoleList(loop.items).slice(0, 5);
  const status = ownerSystemConsoleFirstString(loop, ["status"], "unknown");
  const countText = [
    `打开 ${Number(counts.open || 0) || 0}`,
    `等回卡 ${Number(counts.waitingReturn || 0) || 0}`,
    `阻塞 ${Number(counts.blocked || 0) || 0}`,
    `重复抑制 ${Number(counts.duplicateSuppressed || 0) || 0}`,
    `已闭环 ${Number(counts.verifiedClosed || 0) || 0}`,
  ].join(" / ");
  const rows = items.map((item) => {
    const label = ownerSystemConsoleFirstString(item, ["caseId"], "delivery case");
    const itemStatus = ownerSystemConsoleFirstString(item, ["status", "dispatchStatus"], "unknown");
    const reason = ownerSystemConsoleDisplayText(ownerSystemConsoleFirstString(item, ["blockedReason", "dispatchStatus", "attentionSliceKey"], ""), 160);
    return `<li class="owner-system-console-signal tone-${ownerSystemConsoleEscape(ownerSystemConsoleTone(itemStatus))}">
      <span>${ownerSystemConsoleEscape(label)}</span>
      <strong>${ownerSystemConsoleEscape(ownerSystemConsoleStatusLabel(itemStatus))}</strong>
      ${reason ? `<small>${ownerSystemConsoleEscape(reason)}</small>` : ""}
    </li>`;
  }).join("");
  return `<section class="owner-system-console-panel" data-owner-system-console-status-section="delivery-loop">
    <div class="owner-system-console-section-head">
      <strong>交付闭环</strong>
      <span>${ownerSystemConsoleEscape(countText)}</span>
    </div>
    <div class="owner-system-console-dispatch-summary tone-${ownerSystemConsoleEscape(ownerSystemConsoleTone(status))}">
      <span>${ownerSystemConsoleEscape(ownerSystemConsoleStatusLabel(status))}</span>
      <small>${ownerSystemConsoleEscape(status === "ok" ? "闭环 ledger 无阻塞" : "查看卡住的 case、回卡和重复抑制")}</small>
    </div>
    ${rows ? `<ul class="owner-system-console-signal-list">${rows}</ul>` : ""}
  </section>`;
}

function ownerSystemConsoleLoopEngineeringPanel(consoleData = {}) {
  const loop = consoleData.loopEngineeringStatus && typeof consoleData.loopEngineeringStatus === "object"
    ? consoleData.loopEngineeringStatus
    : {};
  const counts = loop.counts && typeof loop.counts === "object" ? loop.counts : {};
  const items = ownerSystemConsoleList(loop.items).slice(0, 5);
  const status = ownerSystemConsoleFirstString(loop, ["status"], "unknown");
  const countText = [
    `打开 ${Number(counts.open || 0) || 0}`,
    `等回卡 ${Number(counts.waitingReturn || 0) || 0}`,
    `阻塞 ${Number(counts.blocked || 0) || 0}`,
    `已闭环 ${Number(counts.verifiedClosed || 0) || 0}`,
  ].join(" / ");
  const rows = items.map((item) => {
    const label = ownerSystemConsoleFirstString(item, ["loopId", "target", "caseId"], "Loop");
    const itemStatus = ownerSystemConsoleFirstString(item, ["status", "runtimeStatus"], "unknown");
    const reason = ownerSystemConsoleDisplayText(ownerSystemConsoleFirstString(item, ["nextRoute", "blockedReason", "currentRole"], ""), 160);
    return `<li class="owner-system-console-signal tone-${ownerSystemConsoleEscape(ownerSystemConsoleTone(itemStatus))}">
      <span>${ownerSystemConsoleEscape(label)}</span>
      <strong>${ownerSystemConsoleEscape(ownerSystemConsoleStatusLabel(itemStatus))}</strong>
      ${reason ? `<small>${ownerSystemConsoleEscape(reason)}</small>` : ""}
    </li>`;
  }).join("");
  return `<section class="owner-system-console-panel" data-owner-system-console-status-section="loop-engineering">
    <div class="owner-system-console-section-head">
      <strong>Loop Engineering</strong>
      <span>${ownerSystemConsoleEscape(countText)}</span>
    </div>
    <div class="owner-system-console-dispatch-summary tone-${ownerSystemConsoleEscape(ownerSystemConsoleTone(status))}">
      <span>${ownerSystemConsoleEscape(ownerSystemConsoleStatusLabel(status))}</span>
      <small>${ownerSystemConsoleEscape(status === "ok" ? "Codex Mobile runtime 已接通" : "检查 Codex Mobile @loop runtime")}</small>
    </div>
    ${rows ? `<ul class="owner-system-console-signal-list">${rows}</ul>` : ""}
  </section>`;
}

function ownerSystemConsoleQualityProgramPanel(consoleData = {}) {
  const program = consoleData.qualityProgram && typeof consoleData.qualityProgram === "object"
    ? consoleData.qualityProgram
    : null;
  if (!program) return "";
  const workstreams = ownerSystemConsoleList(program.workstreams).slice(0, 5);
  const gaps = ownerSystemConsoleList(program.gaps).slice(0, 4);
  const status = ownerSystemConsoleFirstString(program, ["status"], "unknown");
  const progress = ownerSystemConsoleFormatPercent(ownerSystemConsoleFirstNumber(program, ["progressPercent"]));
  const rows = workstreams.map((item) => {
    const title = ownerSystemConsoleDisplayText(ownerSystemConsoleFirstString(item, ["title", "id"], "3A 工作流"));
    const itemStatus = ownerSystemConsoleFirstString(item, ["status"], "unknown");
    const itemProgress = ownerSystemConsoleFormatPercent(ownerSystemConsoleFirstNumber(item, ["progressPercent"]));
    return `<li class="owner-system-console-signal tone-${ownerSystemConsoleEscape(ownerSystemConsoleTone(itemStatus))}">
      <span>${ownerSystemConsoleEscape(title)}</span>
      <strong>${ownerSystemConsoleEscape(itemProgress || ownerSystemConsoleStatusLabel(itemStatus))}</strong>
      <small>${ownerSystemConsoleEscape(ownerSystemConsoleStatusLabel(itemStatus))}</small>
    </li>`;
  }).join("");
  const gapRows = gaps.map((item) => {
    const label = ownerSystemConsoleDisplayText(ownerSystemConsoleFirstString(item, ["requirementId", "workstreamId"], "缺口"));
    const gap = ownerSystemConsoleDisplayText(ownerSystemConsoleFirstString(item, ["gap"], ""), 220);
    const itemStatus = ownerSystemConsoleFirstString(item, ["status"], "unknown");
    return `<li class="owner-system-console-signal tone-${ownerSystemConsoleEscape(ownerSystemConsoleTone(itemStatus))}">
      <span>${ownerSystemConsoleEscape(label)}</span>
      <strong>${ownerSystemConsoleEscape(ownerSystemConsoleStatusLabel(itemStatus))}</strong>
      ${gap ? `<small>${ownerSystemConsoleEscape(gap)}</small>` : ""}
    </li>`;
  }).join("");
  return `<section class="owner-system-console-panel" data-owner-system-console-status-section="quality-program">
    <div class="owner-system-console-section-head">
      <strong>3A 目标</strong>
      <span>${ownerSystemConsoleEscape(progress || "未计算")}</span>
    </div>
    <div class="owner-system-console-quality-summary tone-${ownerSystemConsoleEscape(ownerSystemConsoleTone(status))}">
      <span>${ownerSystemConsoleEscape(ownerSystemConsoleStatusLabel(status))}</span>
      <small>${ownerSystemConsoleEscape(gaps.length ? `${gaps.length} 个主要缺口` : "当前证据无缺口")}</small>
    </div>
    ${rows ? `<ul class="owner-system-console-signal-list">${rows}</ul>` : ""}
    ${gapRows ? `<ul class="owner-system-console-signal-list" data-owner-system-console-quality-gaps>${gapRows}</ul>` : ""}
  </section>`;
}

function ownerSystemConsoleResourceWarnings(systemStatus = {}) {
  const signals = ownerSystemConsoleList(systemStatus.signals)
    .filter((item) => ownerSystemConsoleSeverityRank(item) >= 2);
  const thresholds = ownerSystemConsoleList(systemStatus.thresholds)
    .filter((item) => ownerSystemConsoleSeverityRank(item) >= 2 || ownerSystemConsoleFirstString(item, ["status", "state"], ""));
  return [...signals, ...thresholds]
    .sort((a, b) => ownerSystemConsoleSeverityRank(b) - ownerSystemConsoleSeverityRank(a))
    .slice(0, 8);
}

function ownerSystemConsoleCriticalServices(systemStatus = {}) {
  const services = ownerSystemConsoleList(systemStatus.services);
  const critical = services.filter((service) => (
    service.critical === true
    || service.required === true
    || ownerSystemConsoleSeverityRank(service) >= 2
  ));
  return (critical.length ? critical : services.slice(0, 6)).slice(0, 8);
}

function ownerSystemConsoleCodexMobileRuntimePanel(systemStatus = {}) {
  const runtime = systemStatus.codexMobile && typeof systemStatus.codexMobile === "object"
    ? systemStatus.codexMobile
    : null;
  if (!runtime || runtime.available === false) return "";
  const status = ownerSystemConsoleFirstString(runtime, ["status"], "unknown");
  const processes = ownerSystemConsoleList(runtime.processes).slice(0, 6);
  const logs = runtime.logs && typeof runtime.logs === "object" ? runtime.logs : {};
  const totalCpu = ownerSystemConsoleFirstNumber(runtime, ["totalCpuPercent"]);
  const totalRss = ownerSystemConsoleFirstNumber(runtime, ["totalRssBytes"]);
  const logSize = ownerSystemConsoleFirstNumber(logs, ["totalSizeBytes", "maxSizeBytes"]);
  const logGrowth = ownerSystemConsoleFirstNumber(logs, ["growthBytesPerSecond"]);
  const summary = [
    Number.isFinite(totalCpu) ? `CPU ${ownerSystemConsoleFormatPercent(totalCpu)}` : "CPU 未采集",
    Number.isFinite(totalRss) ? `RSS ${ownerSystemConsoleFormatBytes(totalRss)}` : "RSS 未采集",
    Number.isFinite(logSize) ? `日志 ${ownerSystemConsoleFormatBytes(logSize)}` : "日志未采集",
  ].join(" / ");
  const growthLabel = logs.growthAvailable && Number.isFinite(logGrowth)
    ? `增长 ${ownerSystemConsoleFormatBytes(logGrowth)}/s`
    : "增长待第二次采样";
  const rows = processes.map((process) => {
    const label = ownerSystemConsoleDisplayText(ownerSystemConsoleFirstString(process, ["label", "role"], "Codex Mobile process"), 80);
    const itemStatus = ownerSystemConsoleFirstString(process, ["status"], "unknown");
    const cpu = ownerSystemConsoleFirstNumber(process, ["cpuPercent"]);
    const rss = ownerSystemConsoleFirstNumber(process, ["rssBytes"]);
    const detail = [
      Number.isFinite(cpu) ? `CPU ${ownerSystemConsoleFormatPercent(cpu)}` : "",
      Number.isFinite(rss) ? `RSS ${ownerSystemConsoleFormatBytes(rss)}` : "",
      ownerSystemConsoleFirstString(process, ["elapsed"], ""),
    ].filter(Boolean).join(" / ");
    return `<li class="owner-system-console-signal tone-${ownerSystemConsoleEscape(ownerSystemConsoleTone(itemStatus))}">
      <span>${ownerSystemConsoleEscape(label)}</span>
      <strong>${ownerSystemConsoleEscape(ownerSystemConsoleStatusLabel(itemStatus))}</strong>
      ${detail ? `<small>${ownerSystemConsoleEscape(detail)}</small>` : ""}
    </li>`;
  }).join("");
  return `<section class="owner-system-console-panel" data-owner-system-console-status-section="codex-mobile-runtime">
    <div class="owner-system-console-section-head">
      <strong>Codex Mobile Runtime</strong>
      <span>${ownerSystemConsoleEscape(ownerSystemConsoleStatusLabel(status))}</span>
    </div>
    <div class="owner-system-console-dispatch-summary tone-${ownerSystemConsoleEscape(ownerSystemConsoleTone(status))}">
      <span>${ownerSystemConsoleEscape(summary)}</span>
      <small>${ownerSystemConsoleEscape(growthLabel)}</small>
    </div>
    ${rows ? `<ul class="owner-system-console-signal-list">${rows}</ul>` : `<div class="owner-system-console-empty">未发现 Codex Mobile 运行时进程。</div>`}
  </section>`;
}

function renderOwnerSystemConsoleUnavailable() {
  return `<section class="owner-system-console owner-system-console-unavailable" data-owner-system-console>
    <div class="owner-system-console-empty" data-owner-system-console-unavailable>
      <strong>仅 Owner 可见</strong>
      <span>当前账号不能查看系统控制台。</span>
    </div>
  </section>`;
}

function renderOwnerSystemConsoleOverview(consoleData = {}, model = ownerSystemConsoleModel()) {
  const systemStatus = consoleData.systemStatus || model.systemStatus || {};
  const dimensions = ownerSystemConsoleList(consoleData.dimensions).slice(0, 3);
  const signals = ownerSystemConsoleCriticalSignals(consoleData);
  return `<section class="owner-system-console-overview" data-owner-system-console-overview>
    <div class="owner-system-console-summary">
      <div>
        <span class="owner-system-console-kicker">总体状态</span>
        ${ownerSystemConsoleStatusBadge(consoleData.overallStatus)}
      </div>
      <span class="owner-system-console-time">生成 ${ownerSystemConsoleEscape(ownerSystemConsoleTimeLabel(consoleData.generatedAt))}</span>
    </div>
    <div class="owner-system-console-dimensions" data-owner-system-console-status-section="dimensions">
      ${dimensions.length ? dimensions.map(ownerSystemConsoleDimensionCard).join("") : `<div class="owner-system-console-empty">暂无 3A 维度。</div>`}
    </div>
    <div class="owner-system-console-metric-grid" data-owner-system-console-status-section="overview-resources">
      ${ownerSystemConsoleMetricCard("cpu", "CPU", systemStatus.cpu)}
      ${ownerSystemConsoleMetricCard("memory", "内存", systemStatus.memory)}
      ${ownerSystemConsoleMetricCard("disk", "磁盘", systemStatus.disk)}
    </div>
    ${ownerSystemConsoleQualityProgramPanel(consoleData)}
    ${ownerSystemConsoleDispatchControlPanel(consoleData)}
    ${ownerSystemConsoleDeliveryLoopPanel(consoleData)}
    ${ownerSystemConsoleLoopEngineeringPanel(consoleData)}
    <section class="owner-system-console-panel" data-owner-system-console-status-section="critical-signals">
      <div class="owner-system-console-section-head">
        <strong>关键信号</strong>
        <span>${ownerSystemConsoleEscape(signals.length)} 项</span>
      </div>
      ${signals.length
        ? `<ul class="owner-system-console-signal-list">${signals.map((item) => ownerSystemConsoleSignalItem(item)).join("")}</ul>`
        : `<div class="owner-system-console-empty">暂无关键告警。</div>`}
    </section>
  </section>`;
}

function renderOwnerSystemConsoleServiceTable(systemStatus = {}) {
  const services = ownerSystemConsoleCriticalServices(systemStatus);
  if (!services.length) return `<div class="owner-system-console-empty">暂无关键服务数据。</div>`;
  const rows = services.map((service) => {
    const label = ownerSystemConsoleDisplayText(ownerSystemConsoleFirstString(service, ["label", "name", "id", "key"], "服务"));
    const status = ownerSystemConsoleFirstString(service, ["status", "state", "level"], "unknown");
    const signal = ownerSystemConsoleDisplayText(ownerSystemConsoleFirstString(service, ["summary", "detail", "reason", "role"], ""), 160);
    return `<tr class="tone-${ownerSystemConsoleEscape(ownerSystemConsoleTone(status))}">
      <td>${ownerSystemConsoleEscape(label)}</td>
      <td>${ownerSystemConsoleEscape(ownerSystemConsoleStatusLabel(status))}</td>
      <td>${ownerSystemConsoleEscape(signal || "已上报")}</td>
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

function renderOwnerSystemConsoleSystemStatus(model = ownerSystemConsoleModel()) {
  const consoleData = model.console || {};
  const systemStatus = model.systemStatus || consoleData.systemStatus || {};
  const warnings = ownerSystemConsoleResourceWarnings(systemStatus);
  const collectedAt = systemStatus.collectedAt || consoleData.generatedAt || "";
  return `<section class="owner-system-console-system-status" data-owner-system-console-system-status>
    <div class="owner-system-console-metric-grid" data-owner-system-console-status-section="system-resources">
      ${ownerSystemConsoleMetricCard("cpu", "CPU", systemStatus.cpu)}
      ${ownerSystemConsoleMetricCard("memory", "内存", systemStatus.memory)}
      ${ownerSystemConsoleMetricCard("disk", "磁盘", systemStatus.disk)}
      ${ownerSystemConsoleMetricCard("uptime", "运行时间", systemStatus.uptime)}
    </div>
    ${ownerSystemConsoleCodexMobileRuntimePanel(systemStatus)}
    <section class="owner-system-console-panel" data-owner-system-console-status-section="services">
      <div class="owner-system-console-section-head">
        <strong>关键服务</strong>
        <span>采集 ${ownerSystemConsoleEscape(ownerSystemConsoleTimeLabel(collectedAt))}</span>
      </div>
      ${model.systemStatusLoading ? `<div class="owner-system-console-empty">正在读取系统状态...</div>` : renderOwnerSystemConsoleServiceTable(systemStatus)}
    </section>
    <section class="owner-system-console-panel" data-owner-system-console-status-section="resource-warnings">
      <div class="owner-system-console-section-head">
        <strong>资源告警</strong>
        <span>${ownerSystemConsoleEscape(warnings.length)} 项</span>
      </div>
      ${warnings.length
        ? `<ul class="owner-system-console-signal-list" data-owner-system-console-resource-warnings>${warnings.map((item) => ownerSystemConsoleSignalItem(item, { emptyLabel: "资源" })).join("")}</ul>`
        : `<div class="owner-system-console-empty" data-owner-system-console-resource-warnings>暂无资源告警。</div>`}
    </section>
  </section>`;
}

function renderOwnerSystemConsoleView(options = {}) {
  if (!ownerSystemConsoleIsOwner()) {
    const importedModel = ownerSystemConsoleLoadedEsmModel();
    const unavailable = importedModel
      ? importedModel.renderClassicOwnerSystemConsoleView({ isOwner: false })
      : renderOwnerSystemConsoleUnavailable();
    ownerSystemConsoleCommit(options, unavailable);
    return unavailable;
  }
  const model = ownerSystemConsoleModel();
  if (OWNER_SYSTEM_CONSOLE_TABS.includes(options.tab)) model.activeTab = options.tab;
  const activeTab = OWNER_SYSTEM_CONSOLE_TABS.includes(model.activeTab) ? model.activeTab : "overview";
  const importedModel = ownerSystemConsoleLoadedEsmModel();
  const html = importedModel
    ? importedModel.renderClassicOwnerSystemConsoleView({
      isOwner: true,
      model,
      tab: activeTab,
    })
    : (() => {
      const consoleData = model.console || {};
      const error = model.error || model.systemStatusError || "";
      const body = activeTab === "system-status"
        ? renderOwnerSystemConsoleSystemStatus(model)
        : renderOwnerSystemConsoleOverview(consoleData, model);
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
    ${error ? `<div class="owner-system-console-error" role="status">${ownerSystemConsoleEscape(ownerSystemConsoleClean(error, 160))}</div>` : ""}
    ${model.loading && !model.console ? `<div class="owner-system-console-empty">正在读取控制台...</div>` : body}
  </section>`;
    })();
  ownerSystemConsoleCommit(options, html);
  return html;
}

function ownerSystemConsoleTarget(options = {}) {
  if (options.target && typeof options.target === "object") return options.target;
  if (typeof document === "undefined") return null;
  if (options.selector) return document.querySelector(options.selector);
  if (typeof $ === "function") return $("conversation");
  return document.getElementById("conversation");
}

function ownerSystemConsoleCommit(options, html) {
  const target = ownerSystemConsoleTarget(options);
  if (!target) return;
  target.innerHTML = html;
  wireOwnerSystemConsoleView(target);
}

function ownerSystemConsoleHandleError(err, key = "error") {
  const model = ownerSystemConsoleModel();
  model[key] = err?.message || String(err || "读取失败");
  model.lastErrors = [model[key], ...(model.lastErrors || [])].slice(0, 3);
}

async function loadOwnerSystemConsole(options = {}) {
  if (!ownerSystemConsoleIsOwner()) {
    renderOwnerSystemConsoleView(options);
    return null;
  }
  await importOwnerSystemConsoleModel();
  const model = ownerSystemConsoleModel();
  model.loading = true;
  model.error = "";
  if (options.render !== false) renderOwnerSystemConsoleView(options);
  ownerSystemConsoleRuntimeEvent("owner-system-console:load:start", { endpoint: "overview" });
  try {
    const result = await ownerSystemConsoleApi(OWNER_SYSTEM_CONSOLE_API_PATH);
    model.console = result?.console || null;
    if (model.console?.systemStatus) model.systemStatus = model.console.systemStatus;
    ownerSystemConsoleRuntimeState({
      ownerSystemConsoleStatus: "ready",
      ownerSystemConsoleLoadedAt: new Date().toISOString(),
    });
    ownerSystemConsoleRuntimeEvent("owner-system-console:load:success", { endpoint: "overview" });
    return model.console;
  } catch (err) {
    ownerSystemConsoleHandleError(err, "error");
    ownerSystemConsoleRuntimeState({
      ownerSystemConsoleStatus: "error",
      ownerSystemConsoleError: err?.code || err?.message || "unknown_error",
    });
    ownerSystemConsoleRuntimeEvent("owner-system-console:load:error", {
      endpoint: "overview",
      status: err?.status || 0,
      code: err?.code || "",
    });
    return null;
  } finally {
    model.loading = false;
    if (options.render !== false) renderOwnerSystemConsoleView(options);
  }
}

async function loadOwnerSystemStatus(options = {}) {
  if (!ownerSystemConsoleIsOwner()) {
    renderOwnerSystemConsoleView(options);
    return null;
  }
  await importOwnerSystemConsoleModel();
  const model = ownerSystemConsoleModel();
  model.systemStatusLoading = true;
  model.systemStatusError = "";
  if (options.render !== false) renderOwnerSystemConsoleView(Object.assign({}, options, { tab: "system-status" }));
  ownerSystemConsoleRuntimeEvent("owner-system-console:load:start", { endpoint: "system-status" });
  try {
    const result = await ownerSystemConsoleApi(OWNER_SYSTEM_CONSOLE_STATUS_API_PATH);
    model.systemStatus = result?.systemStatus || null;
    ownerSystemConsoleRuntimeState({
      ownerSystemConsoleStatusLoadedAt: new Date().toISOString(),
    });
    ownerSystemConsoleRuntimeEvent("owner-system-console:load:success", { endpoint: "system-status" });
    return model.systemStatus;
  } catch (err) {
    ownerSystemConsoleHandleError(err, "systemStatusError");
    ownerSystemConsoleRuntimeState({
      ownerSystemConsoleStatus: "error",
      ownerSystemConsoleStatusError: err?.code || err?.message || "unknown_error",
    });
    ownerSystemConsoleRuntimeEvent("owner-system-console:load:error", {
      endpoint: "system-status",
      status: err?.status || 0,
      code: err?.code || "",
    });
    return null;
  } finally {
    model.systemStatusLoading = false;
    if (options.render !== false) renderOwnerSystemConsoleView(Object.assign({}, options, { tab: "system-status" }));
  }
}

async function openOwnerSystemConsole(options = {}) {
  const model = ownerSystemConsoleModel();
  model.activeTab = OWNER_SYSTEM_CONSOLE_TABS.includes(options.tab) ? options.tab : "overview";
  if (ownerSystemConsoleIsOwner()) await importOwnerSystemConsoleModel();
  renderOwnerSystemConsoleView(options);
  if (!ownerSystemConsoleIsOwner()) return null;
  const consoleData = await loadOwnerSystemConsole(options);
  if (model.activeTab === "system-status") await loadOwnerSystemStatus(options);
  return consoleData;
}

async function openOwnerSystemConsoleSurface(options = {}) {
  if (!ownerSystemConsoleIsOwner()) {
    renderOwnerSystemConsoleView(options);
    return null;
  }
  ownerSystemConsoleSetViewMode("system-console");
  if (typeof closeSettings === "function") closeSettings();
  if (typeof closeSidebar === "function") closeSidebar();
  if (typeof applyViewMode === "function") applyViewMode();
  if (typeof updateNavigationControls === "function") updateNavigationControls();
  return openOwnerSystemConsole(options);
}

function wireOwnerSystemConsoleView(root = document) {
  const container = root?.querySelector?.("[data-owner-system-console]") || root;
  if (!container?.querySelector) return;
  container.querySelector("[data-owner-system-console-refresh]")?.addEventListener("click", () => {
    const model = ownerSystemConsoleModel();
    const run = model.activeTab === "system-status"
      ? Promise.all([loadOwnerSystemConsole({ target: root }), loadOwnerSystemStatus({ target: root })])
      : loadOwnerSystemConsole({ target: root });
    run.catch((err) => {
      if (typeof showError === "function") showError(err);
    });
  });
  container.querySelectorAll("[data-owner-system-console-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.ownerSystemConsoleTab || "overview";
      const model = ownerSystemConsoleModel();
      model.activeTab = OWNER_SYSTEM_CONSOLE_TABS.includes(tab) ? tab : "overview";
      renderOwnerSystemConsoleView({ target: root });
      if (model.activeTab === "system-status" && !model.systemStatus) {
        loadOwnerSystemStatus({ target: root }).catch((err) => {
          if (typeof showError === "function") showError(err);
        });
      }
    });
  });
}

if (typeof window !== "undefined") {
  window.openOwnerSystemConsole = openOwnerSystemConsole;
  window.openOwnerSystemConsoleSurface = openOwnerSystemConsoleSurface;
  window.renderOwnerSystemConsoleView = renderOwnerSystemConsoleView;
  window.loadOwnerSystemConsole = loadOwnerSystemConsole;
  window.loadOwnerSystemStatus = loadOwnerSystemStatus;
  window.wireOwnerSystemConsoleView = wireOwnerSystemConsoleView;
  window.importOwnerSystemConsoleModel = importOwnerSystemConsoleModel;
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    loadOwnerSystemConsole,
    loadOwnerSystemStatus,
    openOwnerSystemConsole,
    openOwnerSystemConsoleSurface,
    importOwnerSystemConsoleModel,
    renderOwnerSystemConsoleView,
    wireOwnerSystemConsoleView,
  };
}
