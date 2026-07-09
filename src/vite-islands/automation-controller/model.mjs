"use strict";

export const AUTOMATION_CONTROLLER_MODEL_VERSION = "20260709-automation-controller-model-v2";

const AUTOMATION_MANUAL_TRIGGER_STATUSES = new Set(["pending", "running", "success", "error"]);

function normalizedSearchParams(params) {
  return new URLSearchParams(params || undefined);
}

export function automationRequestParamsPlan(options = {}) {
  const params = new URLSearchParams();
  params.set("workspaceId", String(options.workspaceId || "owner"));
  params.set("includeDisabled", "1");
  params.set("limit", "200");
  params.set("detail", options.detail === "summary" ? "summary" : "full");
  const search = options.ignoreSearch ? "" : String(options.search || "").trim();
  if (search) params.set("search", search);
  const routeAutomationId = options.routeTarget ? String(options.selectedAutomationId || "").trim() : "";
  if (routeAutomationId) params.set("automationId", routeAutomationId);
  if (options.refresh) params.set("refresh", "1");
  return params;
}

export function automationFullStorageKeyPlan({ params, clientVersion = "" } = {}) {
  const copy = normalizedSearchParams(params);
  copy.delete("refresh");
  copy.delete("fresh");
  copy.set("detail", "full");
  return `hermes:automation:full:${String(clientVersion || "")}:${copy.toString()}`;
}

export function automationRequestCacheKeyPlan(params) {
  const copy = normalizedSearchParams(params);
  copy.delete("refresh");
  copy.delete("fresh");
  return copy.toString();
}

export function automationSummaryCacheKeyPlan(params) {
  const copy = normalizedSearchParams(params);
  copy.delete("refresh");
  copy.delete("fresh");
  copy.set("detail", "summary");
  return copy.toString();
}

export function automationFullCachePayloadPlan(result = {}, nowIso = new Date().toISOString()) {
  if (!Array.isArray(result.data)) return null;
  return {
    savedAt: String(nowIso || ""),
    data: result.data,
    source: result.source || {},
    warning: result.warning || "",
  };
}

export function automationCachedFullStatePlan({
  cached,
  routeTargetPending = false,
  routeTargetId = "",
  cacheKey = "",
  summaryCacheKey = "",
  nowMs = Date.now(),
} = {}) {
  const data = Array.isArray(cached?.data) ? cached.data : [];
  if (!data.length) return { useCache: false, routeTargetMissing: false };
  const targetId = String(routeTargetId || "");
  const cachedHasRouteTarget = !routeTargetPending || data.some((job) => String(job?.id || "") === targetId);
  if (!cachedHasRouteTarget) return { useCache: false, routeTargetMissing: true };
  return {
    useCache: true,
    routeTargetMissing: false,
    automations: data,
    automationSource: Object.assign({}, cached.source || {}, { warning: cached.warning || "", cached: true }),
    automationCacheKey: cacheKey,
    automationFullCacheKey: summaryCacheKey,
    automationLastLoadedAt: nowMs,
  };
}

export function automationIsSummaryJobPlan(job) {
  return String(job?.detailLevel || "").toLowerCase() === "summary";
}

export function mergeAutomationJobsPlan(existing = [], incoming = [], options = {}) {
  if (options.replaceMissing) {
    const existingById = new Map((existing || []).map((job) => [String(job?.id || ""), job]));
    return (incoming || []).map((job) => Object.assign({}, existingById.get(String(job?.id || "")) || {}, job));
  }
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

export function automationPushRefreshPlan(eventData = {}, selectedWorkspaceId = "") {
  const payload = eventData.payload || {};
  const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const nestedData = data?.data && typeof data.data === "object" ? data.data : {};
  const messageType = String(data.messageType || nestedData.messageType || "").trim();
  const workspaceId = String(data.workspaceId || nestedData.workspaceId || "").trim();
  const automationId = String(data.automationId || nestedData.automationId || "").trim();
  if (!automationId && !messageType.startsWith("automation_")) return { shouldRefresh: false };
  if (workspaceId && selectedWorkspaceId && workspaceId !== selectedWorkspaceId) {
    return { shouldRefresh: false, ignoredWorkspaceId: workspaceId };
  }
  return { shouldRefresh: true, workspaceId, automationId, messageType };
}

export function automationStatusLabelPlan(job) {
  const status = String(job?.status || "");
  if (status === "error") return "error";
  if (status === "paused") return "paused";
  if (status === "completed") return "done";
  return "scheduled";
}

export function automationStatusTonePlan(job, status = automationStatusLabelPlan(job)) {
  const current = String(status || "").toLowerCase();
  const last = String(job?.lastStatus || job?.last_status || "").toLowerCase();
  if (current === "error" || ["error", "failed", "failure"].includes(last) || job?.lastError || job?.lastDeliveryError) return "error";
  const normalCurrent = ["scheduled", "running", "ok", "done", "completed", "success", "succeeded"];
  const normalLast = ["", "ok", "done", "completed", "success", "succeeded"];
  if (normalCurrent.includes(current) && normalLast.includes(last)) return "ok";
  return "info";
}

export function automationStatusTextPlan(job, status = automationStatusLabelPlan(job)) {
  const tone = automationStatusTonePlan(job, status);
  if (tone === "error") return "失败";
  if (status === "paused") return "暂停";
  if (status === "done" || String(job?.lastStatus || "").toLowerCase() === "ok") return "完成";
  if (status === "running") return "运行中";
  return "计划中";
}

export function automationRunTimeMsPlan(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

export function automationFailureHasNoFreshDeliverablePlan(job, latestDoc = null) {
  if (automationStatusTonePlan(job) !== "error") return false;
  const lastRunMs = automationRunTimeMsPlan(job?.lastRunAt);
  if (!lastRunMs) return false;
  const docMs = automationRunTimeMsPlan(latestDoc?.runOutputUpdatedAt || latestDoc?.updatedAt || latestDoc?.createdAt);
  return !docMs || docMs + 1000 < lastRunMs;
}

export function automationCreateOpenStatePlan() {
  return {
    selectedAutomationId: "",
    automationRouteTargetId: "",
    automationRouteTargetPending: false,
    automationEditOpen: false,
    automationEditJobId: "",
    automationOutputHistoryOpen: false,
    automationCreateOpen: true,
    automationCreateBusy: false,
    automationCreateDraftText: "",
    automationCreateProgressStep: "",
  };
}

export function automationCreateRequestPlan({ text = "", workspaceId = "owner" } = {}) {
  const cleanText = String(text || "").trim();
  if (!cleanText) return { ok: false, errorMessage: "请输入自动化任务描述" };
  return {
    ok: true,
    busyPatch: {
      automationCreateBusy: true,
      automationCreateDraftText: cleanText,
      automationCreateProgressStep: "understanding",
    },
    url: "/api/automations",
    request: {
      method: "POST",
      body: {
        workspaceId: String(workspaceId || "owner"),
        text: cleanText,
      },
    },
  };
}

export function automationCreateAcceptedStatePlan(result = {}) {
  return {
    automationCreateProgressStep: "saving",
    acceptedPatch: {
      automationCreateOpen: false,
      automationCreateDraftText: "",
      automationCreateProgressStep: "",
      selectedAutomationId: result?.job?.id || result?.data?.id || "",
      automationRouteTargetId: "",
      automationRouteTargetPending: false,
    },
  };
}

export function automationCreateFinallyPlan({ automationCreateOpen = false, viewMode = "" } = {}) {
  return {
    finalPatch: {
      automationCreateBusy: false,
      automationCreateProgressStep: "",
    },
    shouldRender: Boolean(automationCreateOpen && viewMode === "automation"),
  };
}

export function automationEditOpenStatePlan(job = null) {
  if (!job) return null;
  return {
    automationCreateOpen: false,
    automationEditOpen: true,
    automationEditJobId: job.id,
  };
}

export function automationActionRequestPlan({
  jobId = "",
  action = "",
  workspaceId = "owner",
  payload = {},
} = {}) {
  const cleanJobId = String(jobId || "");
  const cleanAction = String(action || "");
  if (!cleanJobId || !cleanAction) return { ok: false };
  return {
    ok: true,
    url: `/api/automations/${encodeURIComponent(cleanJobId)}/${encodeURIComponent(cleanAction)}`,
    request: {
      method: "POST",
      body: Object.assign({ workspaceId: String(workspaceId || "owner") }, payload || {}),
    },
  };
}

function automationManualTriggerStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return AUTOMATION_MANUAL_TRIGGER_STATUSES.has(status) ? status : "pending";
}

function compactIssueCode(value = "") {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_.:-]/g, "_")
    .slice(0, 120);
}

function automationManualTriggerIssueCode(result = {}, error = null) {
  const structured = compactIssueCode(
    result?.code
    || result?.result?.code
    || error?.code
    || error?.body?.code
    || error?.body?.result?.code
    || "",
  );
  return structured || (error ? "automation_manual_trigger_failed" : "");
}

function automationManualTriggerLabel(status, issueCode = "") {
  if (status === "pending") return "正在请求手动触发";
  if (status === "running") return "调度已接收，等待执行";
  if (status === "success") return "已请求下次执行";
  return issueCode ? `触发失败：${issueCode}` : "触发失败";
}

export function automationManualTriggerRequestPlan({
  jobId = "",
  workspaceId = "owner",
} = {}) {
  return automationActionRequestPlan({
    jobId,
    action: "run",
    workspaceId,
    payload: { reason: "manual_ui" },
  });
}

export function automationManualTriggerStatePatchPlan({
  existing = {},
  jobId = "",
  status = "pending",
  result = {},
  error = null,
  nowIso = "",
} = {}) {
  const cleanJobId = String(jobId || "");
  if (!cleanJobId) return { ok: false, patch: {} };
  const cleanStatus = automationManualTriggerStatus(status);
  const issueCode = cleanStatus === "error" ? automationManualTriggerIssueCode(result, error) : "";
  const source = result?.source && typeof result.source === "object" ? result.source : {};
  const entry = {
    status: cleanStatus,
    label: automationManualTriggerLabel(cleanStatus, issueCode),
    issueCode,
    runMode: compactIssueCode(source.runMode || source.run_mode || ""),
    updatedAt: String(nowIso || ""),
  };
  return {
    ok: true,
    entry,
    patch: {
      automationManualTriggers: Object.assign({}, existing || {}, {
        [cleanJobId]: entry,
      }),
    },
  };
}

export function automationManualTriggerViewPlan(job = {}, triggerEntry = {}) {
  const status = String(triggerEntry?.status || "").trim().toLowerCase();
  const current = String(job?.status || "").trim().toLowerCase();
  const effectiveStatus = AUTOMATION_MANUAL_TRIGGER_STATUSES.has(status)
    ? status
    : current === "running"
      ? "running"
      : "";
  const issueCode = compactIssueCode(triggerEntry?.issueCode || "");
  return {
    visible: Boolean(effectiveStatus),
    busy: effectiveStatus === "pending" || effectiveStatus === "running",
    status: effectiveStatus,
    tone: effectiveStatus === "error" ? "error" : effectiveStatus === "success" ? "ok" : "info",
    label: String(triggerEntry?.label || automationManualTriggerLabel(effectiveStatus, issueCode)),
    issueCode,
  };
}

export function automationPauseActionPlan(job = null, statusLabel = automationStatusLabelPlan(job)) {
  if (!job) return null;
  return statusLabel === "paused" ? "resume" : "pause";
}

export function automationSelectAfterActionPlan(jobId = "") {
  return {
    selectedAutomationId: String(jobId || ""),
    automationRouteTargetId: "",
    automationRouteTargetPending: false,
  };
}

export function automationDeleteAcceptedStatePlan() {
  return {
    selectedAutomationId: "",
    automationRouteTargetId: "",
    automationRouteTargetPending: false,
    automationEditOpen: false,
    automationEditJobId: "",
    automationOutputHistoryOpen: false,
  };
}

export function automationUpdateFormPlan({
  jobId = "",
  name = "",
  schedule = "",
  prompt = "",
} = {}) {
  const cleanJobId = String(jobId || "");
  if (!cleanJobId) return { ok: false, skip: true };
  const cleanName = String(name || "").trim();
  const cleanSchedule = String(schedule || "").trim();
  const cleanPrompt = String(prompt || "").trim();
  if (!cleanName) return { ok: false, errorMessage: "请输入自动化名称" };
  if (!cleanSchedule) return { ok: false, errorMessage: "请输入执行计划" };
  if (!cleanPrompt) return { ok: false, errorMessage: "请输入任务目标" };
  return {
    ok: true,
    jobId: cleanJobId,
    payload: {
      name: cleanName,
      schedule: cleanSchedule,
      prompt: cleanPrompt,
    },
  };
}

export function automationUpdateAcceptedStatePlan(result = {}, jobId = "") {
  return {
    automationEditOpen: false,
    automationEditJobId: "",
    selectedAutomationId: result?.job?.id || String(jobId || ""),
    automationRouteTargetId: "",
    automationRouteTargetPending: false,
  };
}
