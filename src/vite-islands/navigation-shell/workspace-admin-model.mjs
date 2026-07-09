"use strict";

export const WORKSPACE_ADMIN_MODEL_VERSION = "20260706-workspace-admin-model-v1";

export const RUNTIME_GATEWAY_WORKER_FIELDS = [
  ["ownerMinWarm", "runtimeGatewayOwnerMinWarm", "Owner 预热"],
  ["workspaceMinWarm", "runtimeGatewayWorkspaceMinWarm", "工作区预热"],
  ["idleTtlMinutes", "runtimeGatewayIdleTtlMinutes", "冷却分钟"],
  ["ownerMaxWorkers", "runtimeGatewayOwnerMaxWorkers", "Owner 上限"],
  ["workspaceMaxWorkers", "runtimeGatewayWorkspaceMaxWorkers", "工作区上限"],
  ["globalMaxWorkers", "runtimeGatewayGlobalMaxWorkers", "全局上限"],
  ["ownerDeepSeekMaxWorkers", "runtimeGatewayOwnerDeepSeekMaxWorkers", "Owner DeepSeek"],
  ["workspaceDeepSeekMaxWorkers", "runtimeGatewayWorkspaceDeepSeekMaxWorkers", "工作区 DeepSeek"],
  ["ownerMaintenanceMaxWorkers", "runtimeGatewayOwnerMaintenanceMaxWorkers", "Owner 高权限"],
];

function text(value) {
  return String(value ?? "").trim();
}

function numberOrZero(value) {
  return Number(value || 0) || 0;
}

export function pathTailName(value) {
  const clean = text(value).replaceAll("\\", "/").replace(/\/+$/, "");
  if (!clean) return "";
  const parts = clean.split("/").filter(Boolean);
  return parts[parts.length - 1] || clean;
}

export function workspaceRootDirectoryName(workspace) {
  const dirs = Array.isArray(workspace?.workDirectories) ? workspace.workDirectories : [];
  const root = text(workspace?.defaultWorkspace || dirs[0]?.path || dirs[0] || "");
  return pathTailName(root) || "未配置";
}

export function workspaceAccountSummary(workspace) {
  return text(workspace?.principalId || workspace?.accessKey || workspace?.id || "");
}

export function workspaceAccessKeyStatusLabel(workspace) {
  const status = workspace?.accessKeyStatus || {};
  const stateText = status.hasKey ? "已生成" : "未生成";
  if (status.kind === "owner" && status.source) return `${stateText} · ${status.source}`;
  return stateText;
}

export function workspaceTongbaoWallet(workspace) {
  const wallet = workspace?.tongbaoWallet && typeof workspace.tongbaoWallet === "object"
    ? workspace.tongbaoWallet
    : {};
  return {
    availableBalance: numberOrZero(wallet.availableBalance),
    heldBalance: numberOrZero(wallet.heldBalance),
    totalBalance: numberOrZero(wallet.totalBalance || wallet.availableBalance),
    currency: String(wallet.currency || "TONGBAO"),
  };
}

export function workspaceTongbaoLineView(workspace) {
  const wallet = workspaceTongbaoWallet(workspace);
  return {
    label: "通宝",
    value: String(wallet.availableBalance),
    heldText: wallet.heldBalance > 0 ? ` · 冻结 ${wallet.heldBalance}` : "",
  };
}

export function workspaceOutboundStatusLabel(status) {
  const value = text(status);
  if (!value) return "";
  if (value === "verified") return "已验证";
  if (value === "adapter_registered") return "已注册";
  if (value === "adapter_registered_context_token_missing") return "已注册";
  return value;
}

export function workspaceBindingChipLabels(workspace) {
  const bindings = workspace?.bindings || {};
  const chips = [];
  (Array.isArray(bindings.channels) ? bindings.channels : []).forEach((channel) => {
    const state = [];
    const outbound = workspaceOutboundStatusLabel(channel.outboundStatus);
    if (outbound) state.push(outbound);
    if (channel.contextTokenAvailable === true) state.push("Context 已绑定");
    if (channel.contextTokenAvailable === false) state.push("Context 未绑定");
    chips.push(`${channel.label || channel.type || "通道"}${state.length ? ` · ${state.join(" · ")}` : ""}`);
  });
  (Array.isArray(bindings.interfaces) ? bindings.interfaces : []).forEach((item) => {
    const detail = [item.category, item.detail].filter(Boolean).join(" · ");
    chips.push(`${item.label || item.id}${detail ? ` · ${detail}` : ""}`);
  });
  return chips.filter(Boolean);
}

export function workspaceAccessRowsPlan({ workspaces = [], selectedWorkspaceId = "", auth = {} } = {}) {
  const rows = Array.isArray(workspaces) ? workspaces : [];
  const selected = rows.find((workspace) => workspace.id === selectedWorkspaceId);
  if (selected) return [selected];
  const accessibleWorkspaceIds = Array.isArray(auth?.workspaceIds) && auth.workspaceIds.length
    ? auth.workspaceIds
    : (auth?.workspaceId ? [auth.workspaceId] : []);
  const ownWorkspace = rows.find((workspace) => accessibleWorkspaceIds.includes(workspace.id));
  if (ownWorkspace) return [ownWorkspace];
  return rows.slice(0, 1);
}

export function runtimeModelCatalog(config = {}, fallbackOptions = []) {
  const options = Array.isArray(config.modelOptions) && config.modelOptions.length
    ? config.modelOptions
    : (Array.isArray(fallbackOptions) ? fallbackOptions : []);
  return options.filter((option) => text(option?.id || option?.model));
}

export function runtimeSelectedModelOption(config = {}, fallbackOptions = [], fallbackDefaultModelId = "") {
  const options = runtimeModelCatalog(config, fallbackOptions);
  const selected = text(config.defaultModelId || fallbackDefaultModelId);
  return options.find((option) => text(option.id) === selected) || options[0] || null;
}

export function runtimeModelFamiliesFromOptions(options = []) {
  const families = [];
  const seen = new Set();
  (Array.isArray(options) ? options : []).forEach((option) => {
    const familyId = text(option.familyId || option.provider);
    if (!familyId || seen.has(familyId)) return;
    seen.add(familyId);
    families.push({
      id: familyId,
      label: text(option.familyLabel || option.provider || familyId),
    });
  });
  return families;
}

export function runtimeModelFamilyOptionsPlan(config = {}, fallbackOptions = [], fallbackDefaultModelId = "") {
  const options = runtimeModelCatalog(config, fallbackOptions);
  const selectedOption = runtimeSelectedModelOption(config, fallbackOptions, fallbackDefaultModelId);
  const selectedFamilyId = text(selectedOption?.familyId || selectedOption?.provider);
  return runtimeModelFamiliesFromOptions(options).map((family) => ({
    id: family.id,
    label: family.label,
    selected: family.id === selectedFamilyId,
  }));
}

export function runtimeModelOptionsPlan(config = {}, familyId = "", fallbackOptions = [], fallbackDefaultModelId = "") {
  const options = runtimeModelCatalog(config, fallbackOptions);
  const selectedOption = runtimeSelectedModelOption(config, fallbackOptions, fallbackDefaultModelId);
  const selected = text(selectedOption?.id || config.defaultModelId || fallbackDefaultModelId);
  const selectedFamilyId = text(familyId || selectedOption?.familyId || selectedOption?.provider);
  return options
    .filter((option) => {
      const optionFamilyId = text(option.familyId || option.provider);
      return !selectedFamilyId || optionFamilyId === selectedFamilyId;
    })
    .map((option) => {
      const id = text(option.id || `${option.provider || ""}:${option.model || ""}`);
      if (!id) return null;
      return {
        id,
        label: text(option.variantLabel || option.label || option.model || id),
        selected: id === selected,
      };
    })
    .filter(Boolean);
}

export function runtimeReasoningOptionsPlan(options = [], selected = "", fallbackSelected = "medium") {
  const current = text(selected || fallbackSelected || "medium").toLowerCase();
  return (Array.isArray(options) ? options : [])
    .map((option) => {
      const value = text(option.value).toLowerCase();
      if (!value) return null;
      return {
        value,
        label: option.label || value,
        selected: value === current,
      };
    })
    .filter(Boolean);
}

export function runtimeGatewayWorkerValue(config = {}, key = "", gatewayPoolConfig = {}) {
  const overrides = config?.gatewayWorkerSettings || {};
  const effective = config?.gatewayWorkerEffectiveSettings || {};
  const fallbackByKey = {
    idleTtlMinutes: Number.isFinite(Number(gatewayPoolConfig.idleTtlMs))
      ? Math.floor(Number(gatewayPoolConfig.idleTtlMs) / 60000)
      : undefined,
  };
  const value = Object.prototype.hasOwnProperty.call(overrides, key)
    ? overrides[key]
    : (Object.prototype.hasOwnProperty.call(effective, key) ? effective[key] : (fallbackByKey[key] ?? gatewayPoolConfig[key]));
  return Number.isFinite(Number(value)) ? String(Math.floor(Number(value))) : "";
}

export function runtimeGatewayWorkerInputsPlan(config = {}, gatewayPoolConfig = {}) {
  return RUNTIME_GATEWAY_WORKER_FIELDS.map(([key, id, label]) => ({
    key,
    id,
    label,
    value: runtimeGatewayWorkerValue(config, key, gatewayPoolConfig),
  }));
}

export function runtimeMoaPresetText(config = {}) {
  const presets = Array.isArray(config?.moaConfig?.presets) ? config.moaConfig.presets : [];
  return JSON.stringify(presets, null, 2);
}
