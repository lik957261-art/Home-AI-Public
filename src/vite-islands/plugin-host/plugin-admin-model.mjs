const PLUGIN_ADMIN_MODEL_VERSION = "20260705-vite-plugin-admin-model-v1";

const PLUGIN_ADMIN_RETRY_PROVISIONING_STATUSES = Object.freeze([
  "pending",
  "provisioning_failed",
  "manual_required",
]);

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function normalizeWorkspace(workspace = {}) {
  const id = cleanString(workspace.id, 120);
  if (!id) return null;
  return Object.freeze({
    id,
    label: cleanString(workspace.label || id, 160),
  });
}

function normalizedPluginId(plugin = {}) {
  return cleanString(plugin.id || plugin.pluginId, 120);
}

function pluginAdminWorkspaceRowsPlan(input = {}) {
  const plugin = input.plugin && typeof input.plugin === "object" ? input.plugin : {};
  const pluginId = normalizedPluginId(plugin);
  const workspaces = Array.isArray(input.workspaces) ? input.workspaces : [];
  if (plugin.allowWorkspaceGrant === false) {
    return Object.freeze({ visible: false, pluginId, rows: Object.freeze([]) });
  }
  const normalizedWorkspaces = workspaces.map(normalizeWorkspace).filter(Boolean);
  const ownerWorkspace = normalizedWorkspaces.find((workspace) => workspace.id === "owner");
  const listedWorkspaces = [
    ...(ownerWorkspace ? [ownerWorkspace] : []),
    ...normalizedWorkspaces.filter((workspace) => workspace.id !== "owner"),
  ];
  const granted = new Set((Array.isArray(plugin.authorizedWorkspaceIds) ? plugin.authorizedWorkspaceIds : [])
    .map((item) => cleanString(item, 120))
    .filter(Boolean));
  const authorizations = new Map((Array.isArray(plugin.workspaceAuthorizations) ? plugin.workspaceAuthorizations : [])
    .map((item) => [cleanString(item?.workspaceId, 120), item])
    .filter(([workspaceId]) => Boolean(workspaceId)));
  const rows = listedWorkspaces.map((workspace) => {
    const authorization = authorizations.get(workspace.id) || {};
    const enabled = granted.has(workspace.id);
    const provisioningStatus = cleanString(authorization.provisioningStatus || (enabled ? "active" : ""), 120);
    const provisioningError = cleanString(authorization.provisioningError, 500);
    const retryProvisioning = Boolean(
      enabled && PLUGIN_ADMIN_RETRY_PROVISIONING_STATUSES.includes(provisioningStatus),
    );
    const statusText = enabled && !retryProvisioning
      ? "已开通"
      : enabled && provisioningStatus
        ? `authorized / ${provisioningStatus}`
        : enabled
          ? "已开通"
          : "未开通";
    return Object.freeze({
      pluginId,
      workspaceId: workspace.id,
      label: workspace.label,
      enabled,
      retryProvisioning,
      provisioningStatus,
      provisioningError,
      statusText,
      statusTitle: provisioningError,
      statusClass: enabled ? "is-enabled" : "",
      actionLabel: retryProvisioning ? "重试" : enabled ? "撤销" : "开通",
      currentlyAuthorized: Boolean(enabled && !retryProvisioning),
    });
  });
  return Object.freeze({ visible: true, pluginId, rows: Object.freeze(rows) });
}

function pluginAdminPluginCardPlan(plugin = {}, input = {}) {
  const pluginId = normalizedPluginId(plugin);
  const expandedId = cleanString(input.expandedId, 120);
  const expanded = Boolean(pluginId && expandedId === pluginId);
  const grantedCount = Array.isArray(plugin.authorizedWorkspaceIds) ? plugin.authorizedWorkspaceIds.length : 0;
  const ownerOnly = plugin.allowWorkspaceGrant === false;
  const riskLevel = cleanString(plugin.riskLevel || "workspace-private", 120);
  const riskLabel = riskLevel === "owner-critical" ? "高风险" : "工作区私有";
  const grantLabel = ownerOnly ? "Owner 专用" : `非 Owner 已开通 ${grantedCount}`;
  const workspaceRows = expanded && !ownerOnly
    ? pluginAdminWorkspaceRowsPlan({ plugin, workspaces: input.workspaces })
    : Object.freeze({ visible: false, pluginId, rows: Object.freeze([]) });
  const provisioningSupported = Boolean(plugin.provisioning?.supported);
  return Object.freeze({
    pluginId,
    title: cleanString(plugin.title || plugin.id || pluginId, 160),
    expanded,
    expandedClass: expanded ? "is-expanded" : "is-collapsed",
    riskLevel,
    riskLabel,
    riskCritical: riskLevel === "owner-critical",
    grantLabel,
    metaText: `${pluginId} · ${riskLabel} · ${grantLabel}`,
    expandLabel: expanded ? "收起" : "展开",
    ownerOnly,
    ownerOnlyText: "Codex 为 Owner 专用，不列出其他用户。",
    contractLabels: Object.freeze([
      provisioningSupported ? "Owner 也需要开通建档" : "Owner 默认可用",
      "Owner 手动开通各工作区",
      provisioningSupported ? "开通后插件侧绑定/建档" : "插件侧手动绑定",
    ]),
    workspaceEmptyText: "暂无非 Owner 工作区。",
    workspaceRows,
  });
}

function pluginAdminManagerViewPlan(input = {}) {
  const loading = Boolean(input.loading);
  const error = cleanString(input.error, 500);
  const plugins = Array.isArray(input.plugins) ? input.plugins : [];
  const expandedId = cleanString(input.expandedId, 120);
  const workspaces = Array.isArray(input.workspaces) ? input.workspaces : [];
  const bodyState = loading && !plugins.length
    ? "loading"
    : plugins.length
      ? "list"
      : "empty";
  return Object.freeze({
    loading,
    error,
    errorVisible: Boolean(error),
    bodyState,
    loadingText: "正在读取插件授权...",
    emptyText: "当前没有已安装插件。",
    cards: Object.freeze(plugins.map((plugin) => pluginAdminPluginCardPlan(plugin, { expandedId, workspaces }))),
  });
}

function pluginAdminToggleRequestPlan(input = {}) {
  const pluginId = cleanString(input.pluginId, 120);
  const workspaceId = cleanString(input.workspaceId, 120);
  const displayName = cleanString(input.displayName || workspaceId, 160);
  const currentlyAuthorized = Boolean(input.currentlyAuthorized);
  if (!pluginId || !workspaceId) {
    return Object.freeze({
      ok: false,
      code: "plugin_admin_toggle_missing_target",
      method: "",
      path: "",
      body: null,
    });
  }
  const encodedPluginId = encodeURIComponent(pluginId);
  const encodedWorkspaceId = encodeURIComponent(workspaceId);
  if (currentlyAuthorized) {
    return Object.freeze({
      ok: true,
      action: "revoke",
      method: "DELETE",
      path: `/api/hermes-plugins/${encodedPluginId}/workspaces/${encodedWorkspaceId}`,
      body: null,
      pluginId,
      workspaceId,
      displayName,
    });
  }
  return Object.freeze({
    ok: true,
    action: "grant",
    method: "POST",
    path: `/api/hermes-plugins/${encodedPluginId}/workspaces`,
    body: Object.freeze({ workspaceId, displayName }),
    pluginId,
    workspaceId,
    displayName,
  });
}

function pluginAdminOwnerGatePlan(input = {}) {
  const allowed = Boolean(input.isOwner);
  return Object.freeze({
    allowed,
    errorMessage: allowed ? "" : "Owner access is required",
  });
}

export {
  PLUGIN_ADMIN_MODEL_VERSION,
  cleanString,
  normalizeWorkspace,
  pluginAdminManagerViewPlan,
  pluginAdminOwnerGatePlan,
  pluginAdminToggleRequestPlan,
  pluginAdminWorkspaceRowsPlan,
};
