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
    if (normalized === "qqmail" || normalized.endsWith("_qqmail") || normalized === "qq_mail" || normalized.endsWith("_qq_mail")) {
      profiles.mail = id;
      profiles.qqmail = id;
    }
  }
  return profiles;
}

const DEFAULT_INTERFACE_TOOLSETS = {
  web: { label: "Web", category: "接口" },
  vision: { label: "视觉", category: "接口" },
  image_gen: { label: "图片生成", category: "接口" },
  messaging: { label: "消息发送", category: "接口" },
  todo: { label: "待办", category: "接口" },
  cronjob: { label: "自动化", category: "接口" },
  weixin_reminders: { label: "微信提醒", category: "接口" },
  weixin_todos: { label: "微信待办", category: "接口" },
  taobao_desktop: { label: "淘宝桌面", category: "接口" },
};

const DEFAULT_COMMON_TOOLSETS = [
  "web",
  "vision",
  "image_gen",
  "messaging",
  "todo",
  "cronjob",
  "weixin_reminders",
  "weixin_todos",
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
  const channelType = String(options.channelType || "weixin");
  const channelLabel = String(options.channelLabel || "微信");

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
    const connectorProfiles = Object.assign({}, connectorProfilesForToolsets(allowedToolsets));
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
