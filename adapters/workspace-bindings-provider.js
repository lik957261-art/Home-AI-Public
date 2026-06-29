"use strict";

function defaultDedupe(values) {
  return [...new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function parseJsonObject(value) {
  const raw = String(typeof value === "function" ? value() : (value || "")).trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function defaultInterfaceForToolset(toolset) {
  const id = String(toolset || "").trim();
  const normalized = id.toLowerCase().replace(/[-\s]+/g, "_");
  if (!id) return null;
  if (normalized === "qqmail" || normalized.endsWith("_qqmail") || normalized === "qq_mail" || normalized.endsWith("_qq_mail")) {
    return { label: "QQ 邮箱", category: "邮箱", detail: "已连接" };
  }
  return null;
}

function connectorProfilesForToolsets(toolsets) {
  const profiles = {};
  for (const toolset of toolsets || []) {
    const id = String(toolset || "").trim();
    const normalized = id.toLowerCase().replace(/[-\s]+/g, "_");
    if (!id) continue;
    if (normalized === "google_workspace" || normalized === "google" || normalized === "gmail") {
      profiles.google = id;
      profiles.gmail = id;
    }
    if (normalized === "hermes_email" || normalized === "email" || normalized === "outlook" || normalized === "hotmail" || normalized === "alimail") {
      profiles.email = id;
      if (normalized === "outlook") profiles.outlook = id;
      if (normalized === "hotmail") profiles.hotmail = id;
      if (normalized === "alimail") profiles.alimail = id;
    }
    if (normalized === "qqmail" || normalized.endsWith("_qqmail") || normalized === "qq_mail" || normalized.endsWith("_qq_mail")) {
      profiles.mail = id;
      profiles.qqmail = id;
    }
  }
  return profiles;
}

function toolsetsForConnectorProfiles(profiles) {
  const out = [];
  const entries = profiles && typeof profiles === "object" ? Object.entries(profiles) : [];
  for (const [rawKey, rawValue] of entries) {
    const key = String(rawKey || "").trim().toLowerCase().replace(/[-\s]+/g, "_");
    const value = String(rawValue || "").trim();
    const normalizedValue = value.toLowerCase().replace(/[-\s]+/g, "_");
    if (!key) continue;
    if (key === "google" || key === "gmail") out.push("google_workspace");
    if (key === "email" || key === "outlook" || key === "hotmail" || key === "alimail") out.push("hermes-email");
    if (key === "mail" || key === "qqmail") {
      if (normalizedValue.includes("qqmail") || normalizedValue.includes("qq_mail")) out.push(value);
      else out.push("hermes-email");
    }
  }
  return defaultDedupe(out);
}

const DEFAULT_INTERFACE_TOOLSETS = {
  web: { label: "Web", category: "接口" },
  http: { label: "HTTP/API", category: "接口" },
  current_environment: { label: "当前位置", category: "接口" },
  weather: { label: "天气", category: "接口" },
  vision: { label: "视觉", category: "接口" },
  image_gen: { label: "图片生成", category: "接口" },
  messaging: { label: "消息发送", category: "接口" },
  tts: { label: "语音生成", category: "接口" },
  todo: { label: "看板", category: "接口" },
  kanban: { label: "看板", category: "接口" },
  google_workspace: { label: "Google", category: "外部接口", detail: "Workspace" },
  "hermes-email": { label: "邮箱", category: "外部接口", detail: "Email" },
  cronjob: { label: "自动化", category: "接口" },
  taobao_desktop: { label: "淘宝桌面", category: "接口" },
};

const DEFAULT_COMMON_TOOLSETS = [
  "web",
  "http",
  "current_environment",
  "weather",
  "vision",
  "image_gen",
  "messaging",
  "tts",
  "todo",
  "kanban",
  "cronjob",
];

function createWorkspaceBindingsProvider(options = {}) {
  const dedupe = options.dedupe || defaultDedupe;
  const configuredToolsets = () => {
    if (typeof options.configuredInterfaceToolsets === "function") {
      return options.configuredInterfaceToolsets() || {};
    }
    return parseJsonObject(options.interfaceToolsetsJson);
  };
  const interfaceToolsets = () => Object.assign(
    {},
    DEFAULT_INTERFACE_TOOLSETS,
    configuredToolsets(),
  );
  const commonToolsets = new Set(dedupe(
    options.commonToolsets || DEFAULT_COMMON_TOOLSETS,
  ));
  const externalBindings = () => {
    if (typeof options.ownerExternalInterfaceBindings !== "function") return [];
    return options.ownerExternalInterfaceBindings() || [];
  };
  const ownerExternalAccessPolicy = () => {
    if (typeof options.ownerExternalAccessPolicy !== "function") return {};
    return options.ownerExternalAccessPolicy() || {};
  };
  const channelType = String(options.channelType || "external");
  const channelLabel = String(options.channelLabel || "外部入口");

  function workspaceChannels(workspace) {
    if (typeof options.workspaceChannels === "function") {
      return options.workspaceChannels(workspace) || [];
    }
    if (!(workspace?.accountId || workspace?.userId || workspace?.chatId || workspace?.target)) return [];
    return [{
      type: channelType,
      label: channelLabel,
      accountId: workspace.accountId || "",
      userId: workspace.userId || "",
      chatId: workspace.chatId || "",
      target: workspace.target || "",
      contextTokenAvailable: workspace.contextTokenAvailable,
      outboundStatus: workspace.outboundStatus || "",
    }];
  }

  function publicBindings(workspace) {
    const policy = workspace?.policy || {};
    const allowedToolsets = dedupe(policy.allowed_toolsets || []);
    const interfaceMap = interfaceToolsets();
    const interfaces = allowedToolsets
      .filter((toolset) => !commonToolsets.has(String(toolset || "")))
      .map((toolset) => {
        const info = interfaceMap[toolset] || defaultInterfaceForToolset(toolset);
        if (!info) return null;
        return Object.assign({ id: toolset }, info);
      })
      .filter(Boolean);
    if (String(workspace?.id || "") === "owner") interfaces.push(...externalBindings());
    return {
      channels: workspaceChannels(workspace),
      interfaces,
      allowedToolsets,
      connectorProfiles: Object.keys(policy.connector_profiles || {}).sort(),
    };
  }

  function accessPolicyAdditions(workspace) {
    const policy = workspace?.policy || workspace || {};
    const principalId = String(workspace?.id || policy.principal_id || "").trim();
    const allowedToolsets = dedupe(policy.allowed_toolsets || []);
    const sourceConnectorProfiles = policy.connector_profiles && typeof policy.connector_profiles === "object"
      ? policy.connector_profiles
      : {};
    allowedToolsets.push(...toolsetsForConnectorProfiles(sourceConnectorProfiles));
    const connectorProfiles = Object.assign(
      {},
      connectorProfilesForToolsets(allowedToolsets),
      Object.fromEntries(Object.entries(sourceConnectorProfiles).map(([key, value]) => [String(key), String(value)])),
    );
    if (principalId === "owner") {
      const ownerPolicy = ownerExternalAccessPolicy();
      for (const [key, value] of Object.entries(ownerPolicy.connector_profiles || {})) {
        const profile = String(value || "").trim();
        if (key && profile) connectorProfiles[String(key)] = profile;
      }
      allowedToolsets.push(...dedupe(ownerPolicy.allowed_toolsets || []));
    }
    return {
      allowed_toolsets: dedupe(allowedToolsets),
      connector_profiles: connectorProfiles,
    };
  }

  return {
    accessPolicyAdditions,
    publicBindings,
  };
}

module.exports = {
  createWorkspaceBindingsProvider,
  connectorProfilesForToolsets,
  defaultInterfaceForToolset,
};
