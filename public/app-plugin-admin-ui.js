"use strict";

const PLUGIN_ADMIN_MODEL_ESM_PATH = "/vite-islands/plugin-admin-model/plugin-admin-model.js";
let pluginAdminModel = null;
let pluginAdminModelPromise = null;

function importPluginAdminModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (pluginAdminModel) return Promise.resolve(pluginAdminModel);
  if (!pluginAdminModelPromise) {
    const importer = typeof rootRef.__homeAiImportPluginAdminModel === "function"
      ? rootRef.__homeAiImportPluginAdminModel
      : (path) => import(path);
    pluginAdminModelPromise = Promise.resolve()
      .then(() => importer(PLUGIN_ADMIN_MODEL_ESM_PATH))
      .then((model) => {
        pluginAdminModel = model || null;
        return pluginAdminModel;
      })
      .catch((error) => {
        pluginAdminModelPromise = null;
        throw error;
      });
  }
  return pluginAdminModelPromise;
}

function currentPluginAdminModel() {
  return pluginAdminModel;
}

if (typeof window !== "undefined") {
  importPluginAdminModel().catch(() => null);
}

function fallbackPluginAdminWorkspaceRowsPlan(plugin, workspaces = state.workspaces || []) {
  const pluginId = String(plugin.id || "");
  if (plugin.allowWorkspaceGrant === false) return { visible: false, pluginId, rows: [] };
  const granted = new Set((plugin.authorizedWorkspaceIds || []).map((item) => String(item || "")));
  const authorizations = new Map((plugin.workspaceAuthorizations || [])
    .map((item) => [String(item.workspaceId || ""), item]));
  const availableWorkspaces = (workspaces || []).filter((workspace) => workspace.id);
  const ownerWorkspace = availableWorkspaces.find((workspace) => workspace.id === "owner");
  const listedWorkspaces = [
    ...(ownerWorkspace ? [ownerWorkspace] : []),
    ...availableWorkspaces.filter((workspace) => workspace.id && workspace.id !== "owner"),
  ];
  return {
    visible: true,
    pluginId,
    rows: listedWorkspaces.map((workspace) => {
      const workspaceId = String(workspace.id || "");
      const enabled = granted.has(workspaceId);
      const label = workspace.label || workspaceId;
      const authorization = authorizations.get(workspaceId) || {};
      const provisioningStatus = authorization.provisioningStatus || (enabled ? "active" : "");
      const provisioningError = authorization.provisioningError || "";
      const retryProvisioning = enabled && ["pending", "provisioning_failed", "manual_required"].includes(provisioningStatus);
      return {
        pluginId,
        workspaceId,
        label,
        enabled,
        retryProvisioning,
        provisioningStatus,
        provisioningError,
        statusText: enabled && !retryProvisioning
          ? "已开通"
          : enabled && provisioningStatus
            ? `authorized / ${provisioningStatus}`
            : enabled ? "已开通" : "未开通",
        statusTitle: provisioningError,
        statusClass: enabled ? "is-enabled" : "",
        actionLabel: retryProvisioning ? "重试" : enabled ? "撤销" : "开通",
        currentlyAuthorized: Boolean(enabled && !retryProvisioning),
      };
    }),
  };
}

function fallbackPluginAdminManagerViewPlan(input = {}) {
  const plugins = Array.isArray(input.plugins) ? input.plugins : [];
  const loading = Boolean(input.loading);
  const error = String(input.error || "");
  const expandedId = String(input.expandedId || "");
  const workspaces = input.workspaces || state.workspaces || [];
  return {
    loading,
    error,
    errorVisible: Boolean(error),
    bodyState: loading && !plugins.length ? "loading" : plugins.length ? "list" : "empty",
    loadingText: "正在读取插件授权...",
    emptyText: "当前没有已安装插件。",
    cards: plugins.map((plugin) => {
      const pluginId = String(plugin.id || "");
      const expanded = Boolean(pluginId && expandedId === pluginId);
      const grantedCount = (plugin.authorizedWorkspaceIds || []).length;
      const riskLabel = plugin.riskLevel === "owner-critical" ? "高风险" : "工作区私有";
      const grantLabel = plugin.allowWorkspaceGrant === false ? "Owner 专用" : `非 Owner 已开通 ${grantedCount}`;
      return {
        pluginId,
        title: plugin.title || plugin.id,
        expanded,
        expandedClass: expanded ? "is-expanded" : "is-collapsed",
        riskLevel: plugin.riskLevel || "workspace-private",
        riskLabel,
        riskCritical: plugin.riskLevel === "owner-critical",
        grantLabel,
        metaText: `${pluginId} · ${riskLabel} · ${grantLabel}`,
        expandLabel: expanded ? "收起" : "展开",
        ownerOnly: plugin.allowWorkspaceGrant === false,
        ownerOnlyText: "Codex 为 Owner 专用，不列出其他用户。",
        contractLabels: [
          plugin.provisioning?.supported ? "Owner 也需要开通建档" : "Owner 默认可用",
          "Owner 手动开通各工作区",
          plugin.provisioning?.supported ? "开通后插件侧绑定/建档" : "插件侧手动绑定",
        ],
        workspaceEmptyText: "暂无非 Owner 工作区。",
        workspaceRows: expanded && plugin.allowWorkspaceGrant !== false
          ? fallbackPluginAdminWorkspaceRowsPlan(plugin, workspaces)
          : { visible: false, pluginId, rows: [] },
      };
    }),
  };
}

function pluginAdminWorkspaceRowsPlan(plugin) {
  return currentPluginAdminModel()?.pluginAdminWorkspaceRowsPlan?.({
    plugin,
    workspaces: state.workspaces || [],
  }) || fallbackPluginAdminWorkspaceRowsPlan(plugin);
}

function pluginAdminManagerViewPlan() {
  const input = {
    loading: state.pluginAdminLoading,
    error: state.pluginAdminError,
    plugins: Array.isArray(state.pluginAdminPlugins) ? state.pluginAdminPlugins : [],
    expandedId: state.pluginAdminExpandedPluginId,
    workspaces: state.workspaces || [],
  };
  return currentPluginAdminModel()?.pluginAdminManagerViewPlan?.(input) || fallbackPluginAdminManagerViewPlan(input);
}

function pluginAdminToggleRequestPlan(input) {
  const plan = currentPluginAdminModel()?.pluginAdminToggleRequestPlan?.(input);
  if (plan) return plan;
  const pluginId = String(input?.pluginId || "");
  const workspaceId = String(input?.workspaceId || "");
  const displayName = String(input?.displayName || workspaceId);
  const currentlyAuthorized = Boolean(input?.currentlyAuthorized);
  if (!pluginId || !workspaceId) return { ok: false, code: "plugin_admin_toggle_missing_target" };
  if (currentlyAuthorized) {
    return {
      ok: true,
      action: "revoke",
      method: "DELETE",
      path: `/api/hermes-plugins/${encodeURIComponent(pluginId)}/workspaces/${encodeURIComponent(workspaceId)}`,
      body: null,
      pluginId,
      workspaceId,
      displayName,
    };
  }
  return {
    ok: true,
    action: "grant",
    method: "POST",
    path: `/api/hermes-plugins/${encodeURIComponent(pluginId)}/workspaces`,
    body: { workspaceId, displayName },
    pluginId,
    workspaceId,
    displayName,
  };
}

function pluginAdminOwnerGatePlan() {
  return currentPluginAdminModel()?.pluginAdminOwnerGatePlan?.({
    isOwner: Boolean(state.auth?.isOwner),
  }) || {
    allowed: Boolean(state.auth?.isOwner),
    errorMessage: "Owner access is required",
  };
}

function pluginAdminWorkspaceRows(plugin) {
  const plan = pluginAdminWorkspaceRowsPlan(plugin);
  if (!plan?.visible) return "";
  return (plan.rows || [])
    .map((row) => {
      const statusTitle = row.statusTitle ? ` title="${escapeHtml(row.statusTitle)}"` : "";
      const action = `<button type="button" data-plugin-workspace-toggle="${escapeHtml(row.pluginId)}" data-plugin-workspace-id="${escapeHtml(row.workspaceId)}" data-plugin-workspace-label="${escapeHtml(row.label)}" data-plugin-enabled="${row.currentlyAuthorized ? "1" : "0"}">${escapeHtml(row.actionLabel)}</button>`;
      return `<article class="plugin-admin-workspace-row">
        <div>
          <div class="plugin-admin-workspace-title">${escapeHtml(row.label)}</div>
          <div class="plugin-admin-workspace-meta">${escapeHtml(row.workspaceId)}</div>
        </div>
        <span class="plugin-admin-workspace-state ${escapeHtml(row.statusClass || "")}"${statusTitle}>${escapeHtml(row.statusText)}</span>
        ${action}
      </article>`;
    }).join("");
}

function renderPluginAdminManager() {
  const overlay = $("pluginAdminOverlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", !state.pluginAdminOpen);
  if (!state.pluginAdminOpen) {
    overlay.innerHTML = "";
    return;
  }
  const view = pluginAdminManagerViewPlan();
  const errorBlock = view.errorVisible
    ? `<div class="access-key-empty error">${escapeHtml(view.error)}</div>`
    : "";
  const body = view.bodyState === "loading"
    ? `<div class="access-key-empty">${escapeHtml(view.loadingText)}</div>`
    : view.bodyState === "list"
      ? `<div class="plugin-admin-list">${(view.cards || []).map((card) => {
          const workspaceRows = card.expanded && !card.ownerOnly
            ? (card.workspaceRows?.rows || []).map((row) => {
                const statusTitle = row.statusTitle ? ` title="${escapeHtml(row.statusTitle)}"` : "";
                return `<article class="plugin-admin-workspace-row">
                  <div>
                    <div class="plugin-admin-workspace-title">${escapeHtml(row.label)}</div>
                    <div class="plugin-admin-workspace-meta">${escapeHtml(row.workspaceId)}</div>
                  </div>
                  <span class="plugin-admin-workspace-state ${escapeHtml(row.statusClass || "")}"${statusTitle}>${escapeHtml(row.statusText)}</span>
                  <button type="button" data-plugin-workspace-toggle="${escapeHtml(row.pluginId)}" data-plugin-workspace-id="${escapeHtml(row.workspaceId)}" data-plugin-workspace-label="${escapeHtml(row.label)}" data-plugin-enabled="${row.currentlyAuthorized ? "1" : "0"}">${escapeHtml(row.actionLabel)}</button>
                </article>`;
              }).join("")
            : "";
          const expandedBody = card.expanded
            ? card.ownerOnly
              ? `<div class="plugin-admin-owner-only-panel">${escapeHtml(card.ownerOnlyText)}</div>`
              : `<div class="plugin-admin-contract">
                  ${(card.contractLabels || []).map((label) => `<span>${escapeHtml(label)}</span>`).join("")}
                </div>
                <div class="plugin-admin-workspace-list">${workspaceRows || `<div class="access-key-empty">${escapeHtml(card.workspaceEmptyText)}</div>`}</div>`
            : "";
          return `<section class="plugin-admin-card ${escapeHtml(card.expandedClass)}">
            <header class="plugin-admin-card-head">
              <div>
                <div class="plugin-admin-title">${escapeHtml(card.title)}</div>
                <div class="plugin-admin-meta">${escapeHtml(card.metaText)}</div>
              </div>
              <div class="plugin-admin-head-actions">
                <span class="plugin-admin-risk ${card.riskCritical ? "is-critical" : ""}">${escapeHtml(card.riskLevel)}</span>
                <button type="button" class="plugin-admin-expand" data-plugin-admin-expand="${escapeHtml(card.pluginId)}" aria-expanded="${card.expanded ? "true" : "false"}">${escapeHtml(card.expandLabel)}</button>
              </div>
            </header>
            ${expandedBody}
          </section>`;
        }).join("")}</div>`
      : `<div class="access-key-empty">${escapeHtml(view.emptyText)}</div>`;
  overlay.innerHTML = `
    <div class="access-key-sheet plugin-admin-sheet">
      <header class="access-key-header">
        <div>
          <div id="pluginAdminTitle" class="access-key-title">插件管理</div>
          <div class="access-key-subtitle">Owner 管理插件可见性。Codex 保持 Owner-only；普通插件需要手动给工作区开通。</div>
        </div>
        <button class="access-key-close" type="button" data-close-plugin-admin>完成</button>
      </header>
      ${errorBlock}
      ${body}
    </div>`;
  overlay.querySelector("[data-close-plugin-admin]")?.addEventListener("click", closePluginAdminManager);
  overlay.querySelectorAll("[data-plugin-admin-expand]").forEach((button) => {
    button.addEventListener("click", () => {
      const pluginId = button.dataset.pluginAdminExpand || "";
      state.pluginAdminExpandedPluginId = state.pluginAdminExpandedPluginId === pluginId ? "" : pluginId;
      renderPluginAdminManager();
    });
  });
  overlay.querySelectorAll("[data-plugin-workspace-toggle]").forEach((button) => {
    button.addEventListener("click", () => togglePluginWorkspaceGrant(button).catch(showError));
  });
}

async function loadPluginAdminManager() {
  state.pluginAdminLoading = true;
  state.pluginAdminError = "";
  renderPluginAdminManager();
  try {
    const result = await api("/api/hermes-plugins/admin");
    state.pluginAdminPlugins = result.plugins || [];
  } catch (err) {
    state.pluginAdminError = err.message || String(err);
  } finally {
    state.pluginAdminLoading = false;
    renderPluginAdminManager();
  }
}

async function openPluginAdminManager() {
  closeTopMoreMenu();
  closeSidebar();
  const ownerGate = pluginAdminOwnerGatePlan();
  if (!ownerGate.allowed) {
    showError(new Error(ownerGate.errorMessage || "Owner access is required"));
    return;
  }
  state.pluginAdminOpen = true;
  state.pluginAdminExpandedPluginId = state.pluginAdminExpandedPluginId || "";
  await loadPluginAdminManager();
}

function closePluginAdminManager() {
  state.pluginAdminOpen = false;
  state.pluginAdminError = "";
  state.pluginAdminExpandedPluginId = "";
  renderPluginAdminManager();
}

async function togglePluginWorkspaceGrant(button) {
  const pluginId = button.dataset.pluginWorkspaceToggle || "";
  const workspaceId = button.dataset.pluginWorkspaceId || "";
  const displayName = button.dataset.pluginWorkspaceLabel || workspaceId;
  const enabled = button.dataset.pluginEnabled === "1";
  const requestPlan = pluginAdminToggleRequestPlan({
    pluginId,
    workspaceId,
    displayName,
    currentlyAuthorized: enabled,
  });
  if (!requestPlan.ok) return;
  state.pluginAdminLoading = true;
  state.pluginAdminError = "";
  renderPluginAdminManager();
  try {
    if (requestPlan.method === "DELETE") {
      await api(requestPlan.path, { method: "DELETE" });
    } else {
      await api(requestPlan.path, {
        method: requestPlan.method || "POST",
        body: JSON.stringify(requestPlan.body || { workspaceId, displayName }),
      });
    }
    await loadPluginAdminManager();
  } catch (err) {
    state.pluginAdminError = err.message || String(err);
  } finally {
    state.pluginAdminLoading = false;
    renderPluginAdminManager();
  }
}
