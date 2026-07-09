"use strict";

const APP_SHELL_MODEL_ESM_PATH = "/vite-islands/app-shell-model/app-shell-model.js";

let appShellModelPromise = null;
let appShellModelModule = null;

function importAppShellModel() {
  if (appShellModelModule) return Promise.resolve(appShellModelModule);
  if (!appShellModelPromise) {
    const importer = window.__homeAiImportAppShellModel || ((specifier) => import(specifier));
    appShellModelPromise = Promise.resolve()
      .then(() => importer(APP_SHELL_MODEL_ESM_PATH))
      .then((module) => {
        appShellModelModule = module;
        return module;
      })
      .catch((error) => {
        appShellModelPromise = null;
        throw error;
      });
  }
  return appShellModelPromise;
}

function currentAppShellModel() {
  return appShellModelModule || null;
}

void importAppShellModel().catch(() => {});

function isSingleWindowConversationTaskGroupId(value) {
  const model = currentAppShellModel();
  if (model?.isSingleWindowConversationTaskGroupIdPlan) {
    return model.isSingleWindowConversationTaskGroupIdPlan({
      value,
      singleWindowChatTaskGroupId: SINGLE_WINDOW_CHAT_TASK_GROUP_ID,
      singleWindowGroupChatTaskGroupId: SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID,
    });
  }
  const id = String(value || "");
  return id === SINGLE_WINDOW_CHAT_TASK_GROUP_ID || id === SINGLE_WINDOW_GROUP_CHAT_TASK_GROUP_ID;
}

function clamp01(value) {
  const model = currentAppShellModel();
  if (model?.clamp01Plan) return model.clamp01Plan(value);
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function splitConfigList(value) {
  const model = currentAppShellModel();
  if (model?.splitConfigListPlan) return model.splitConfigListPlan(value);
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(/[\n,，;；]+/g);
  return [...new Set(raw.map((item) => String(item || "").trim()).filter(Boolean))];
}

function joinConfigList(value) {
  const model = currentAppShellModel();
  if (model?.joinConfigListPlan) return model.joinConfigListPlan(value);
  return splitConfigList(value).join("\n");
}

function workspaceCreateInputs(root = document) {
  return {
    id: root.querySelector?.("#newWorkspaceId") || null,
    label: root.querySelector?.("#newWorkspaceLabel") || null,
    root: root.querySelector?.("#newWorkspaceRoot") || null,
    allowedRoots: root.querySelector?.("#newWorkspaceAllowedRoots") || null,
    toolsets: root.querySelector?.("#newWorkspaceToolsets") || null,
  };
}

function setWorkspaceAutoValue(input, value) {
  if (!input || input.dataset.manual === "1") return;
  input.value = value || "";
  input.dataset.autofilled = "1";
}

function workspaceDefaultUsername(value) {
  const model = currentAppShellModel();
  if (model?.workspaceDefaultUsernamePlan) return model.workspaceDefaultUsernamePlan(value);
  return String(value || "").trim();
}

let workspaceDefaultRequestSeq = 0;

async function refreshWorkspaceCreateDefaults(root = document) {
  const inputs = workspaceCreateInputs(root);
  const model = currentAppShellModel();
  const requestPlan = model?.workspaceDefaultsRequestPlan
    ? model.workspaceDefaultsRequestPlan({
      workspaceId: inputs.id?.value || "",
      labelValue: inputs.label?.value || "",
      labelManual: inputs.label?.dataset.manual === "1",
    })
    : null;
  const username = requestPlan?.username || workspaceDefaultUsername(inputs.id?.value || "");
  if (requestPlan?.shouldClear || !username) {
    Object.values(inputs).forEach((input) => {
      if (input && input !== inputs.id && input.dataset.manual !== "1") input.value = "";
    });
    return;
  }
  const seq = ++workspaceDefaultRequestSeq;
  const params = new URLSearchParams(requestPlan?.params || { username });
  if (!requestPlan) {
    const labelValue = inputs.label?.dataset.manual === "1" ? inputs.label.value.trim() : "";
    if (labelValue) params.set("label", labelValue);
  }
  const result = await api(`/api/workspaces/defaults?${params}`);
  if (seq !== workspaceDefaultRequestSeq) return;
  const defaults = result.defaults || {};
  const patch = model?.workspaceDefaultsPatchPlan
    ? model.workspaceDefaultsPatchPlan({ defaults, username })
    : {
      label: defaults.label || username,
      root: defaults.defaultWorkspace || "",
      allowedRoots: joinConfigList(defaults.allowedRoots || defaults.defaultWorkspace || ""),
      toolsets: splitConfigList(defaults.allowedToolsets || []).join(", "),
      hintText: defaults.workspaceId ? `ID: ${defaults.workspaceId}` : "",
    };
  setWorkspaceAutoValue(inputs.label, patch.label);
  setWorkspaceAutoValue(inputs.root, patch.root);
  setWorkspaceAutoValue(inputs.allowedRoots, patch.allowedRoots);
  setWorkspaceAutoValue(inputs.toolsets, patch.toolsets);
  const hint = root.querySelector?.("#newWorkspaceDefaultsHint");
  if (hint) hint.textContent = patch.hintText || "";
}

function wireWorkspaceCreateDefaults(root = document) {
  const inputs = workspaceCreateInputs(root);
  [inputs.label, inputs.root, inputs.allowedRoots, inputs.toolsets].forEach((input) => {
    input?.addEventListener("input", () => {
      input.dataset.manual = "1";
    });
  });
  let timer = null;
  inputs.id?.addEventListener("input", () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      refreshWorkspaceCreateDefaults(root).catch(showError);
    }, 180);
  });
  inputs.label?.addEventListener("blur", () => {
    refreshWorkspaceCreateDefaults(root).catch(showError);
  });
}

function formatElapsedDuration(startValue, endValue) {
  const model = currentAppShellModel();
  if (model?.formatElapsedDurationPlan) return model.formatElapsedDurationPlan(startValue, endValue);
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

function messageDisplayTimestamp(message) {
  const model = currentAppShellModel();
  if (model?.messageDisplayTimestampPlan) return model.messageDisplayTimestampPlan(message);
  if (!message) return "";
  if (message.role === "user") return message.submittedAt || message.createdAt || message.updatedAt || "";
  if (message.completedAt) return message.completedAt;
  if (message.failedAt) return message.failedAt;
  if (message.cancelledAt) return message.cancelledAt;
  return "";
}

function messageDisplayTimeLabel(message) {
  const model = currentAppShellModel();
  if (model?.messageDisplayTimeLabelPlan) return model.messageDisplayTimeLabelPlan(message);
  const timestamp = messageDisplayTimestamp(message);
  if (timestamp) {
    const label = formatTime(timestamp);
    if (message?.role === "assistant") {
      const elapsed = formatElapsedDuration(message.queuedAt || message.startedAt || message.createdAt, timestamp);
      return elapsed ? `${label} · 耗时${elapsed}` : label;
    }
    return label;
  }
  if (message?.role === "assistant" && ["queued", "running"].includes(String(message.status || ""))) return "等待反馈";
  return "";
}

function messageTimelineTimestamp(message) {
  const model = currentAppShellModel();
  if (model?.messageTimelineTimestampPlan) return model.messageTimelineTimestampPlan(message);
  return messageDisplayTimestamp(message) || message?.submittedAt || message?.updatedAt || message?.createdAt || "";
}

function formatBytes(bytes) {
  return TaskArtifactHelpers.formatBytes(bytes);
}

function compactDisplayText(value, max = 180) {
  return TaskArtifactHelpers.compactDisplayText(value, max, { rewriteDirectoryPathsForDisplay });
}
