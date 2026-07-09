"use strict";

export const APP_SHELL_MODEL_VERSION = "20260706-app-shell-model-v1";

export function isSingleWindowConversationTaskGroupIdPlan({
  value = "",
  singleWindowChatTaskGroupId = "",
  singleWindowGroupChatTaskGroupId = "",
} = {}) {
  const id = String(value || "");
  return id === String(singleWindowChatTaskGroupId || "") || id === String(singleWindowGroupChatTaskGroupId || "");
}

export function clamp01Plan(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function splitConfigListPlan(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[\n,，;；]+/g);
  return [...new Set(raw.map((item) => String(item || "").trim()).filter(Boolean))];
}

export function joinConfigListPlan(value) {
  return splitConfigListPlan(value).join("\n");
}

export function workspaceDefaultUsernamePlan(value) {
  return String(value || "").trim();
}

export function workspaceDefaultsRequestPlan({
  workspaceId = "",
  labelValue = "",
  labelManual = false,
} = {}) {
  const username = workspaceDefaultUsernamePlan(workspaceId);
  if (!username) return { username: "", shouldClear: true, params: [] };
  const params = [["username", username]];
  const label = labelManual ? String(labelValue || "").trim() : "";
  if (label) params.push(["label", label]);
  return { username, shouldClear: false, params };
}

export function workspaceDefaultsPatchPlan({ defaults = {}, username = "" } = {}) {
  const fallbackUsername = String(username || "");
  const defaultWorkspace = defaults?.defaultWorkspace || "";
  return {
    label: defaults?.label || fallbackUsername,
    root: defaultWorkspace,
    allowedRoots: joinConfigListPlan(defaults?.allowedRoots || defaultWorkspace || ""),
    toolsets: splitConfigListPlan(defaults?.allowedToolsets || []).join(", "),
    hintText: defaults?.workspaceId ? `ID: ${defaults.workspaceId}` : "",
  };
}

export function formatTimePlan(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function formatElapsedDurationPlan(startValue, endValue) {
  const start = new Date(startValue || "").getTime();
  const end = new Date(endValue || "").getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "";
  const totalSeconds = Math.max(1, Math.round((end - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}小时${minutes}分${seconds}秒`;
  if (minutes) return `${minutes}分${seconds}秒`;
  return `${seconds}秒`;
}

export function messageDisplayTimestampPlan(message = null) {
  if (!message) return "";
  if (message.role === "user") return message.submittedAt || message.createdAt || message.updatedAt || "";
  if (message.completedAt) return message.completedAt;
  if (message.failedAt) return message.failedAt;
  if (message.cancelledAt) return message.cancelledAt;
  return "";
}

export function messageDisplayTimeLabelPlan(message = null) {
  const timestamp = messageDisplayTimestampPlan(message);
  if (timestamp) {
    const label = formatTimePlan(timestamp);
    if (message?.role === "assistant") {
      const elapsed = formatElapsedDurationPlan(message.queuedAt || message.startedAt || message.createdAt, timestamp);
      return elapsed ? `${label} · 耗时${elapsed}` : label;
    }
    return label;
  }
  if (message?.role === "assistant" && ["queued", "running"].includes(String(message.status || ""))) return "等待反馈";
  return "";
}

export function messageTimelineTimestampPlan(message = null) {
  return messageDisplayTimestampPlan(message) || message?.submittedAt || message?.updatedAt || message?.createdAt || "";
}
