"use strict";

function pluginAdminWorkspaceRows(plugin) {
  const granted = new Set((plugin.authorizedWorkspaceIds || []).map((item) => String(item || "")));
  const authorizations = new Map((plugin.workspaceAuthorizations || [])
    .map((item) => [String(item.workspaceId || ""), item]));
  const workspaces = (state.workspaces || []).filter((workspace) => workspace.id);
  const ownerWorkspace = workspaces.find((workspace) => workspace.id === "owner") || { id: "owner", label: "Owner" };
  if (plugin.allowWorkspaceGrant === false) return "";
  const listedWorkspaces = [ownerWorkspace, ...workspaces.filter((workspace) => workspace.id && workspace.id !== "owner")];
  return listedWorkspaces
    .map((workspace) => {
      const workspaceId = String(workspace.id || "");
      const enabled = granted.has(workspaceId);
      const label = workspace.label || workspaceId;
      const authorization = authorizations.get(workspaceId) || {};
      const provisioningStatus = authorization.provisioningStatus || (enabled ? "active" : "");
      const provisioningError = authorization.provisioningError || "";
      const retryProvisioning = enabled && provisioningStatus && provisioningStatus !== "active";
      const statusText = enabled && provisioningStatus === "active"
        ? "已开通"
        : enabled && provisioningStatus
          ? `authorized / ${provisioningStatus}`
          : enabled ? "已开通" : "未开通";
      const statusTitle = provisioningError ? ` title="${escapeHtml(provisioningError)}"` : "";
      const disabled = plugin.allowWorkspaceGrant === false;
      const action = disabled
        ? `<span class="plugin-admin-owner-only">Owner only</span>`
        : `<button type="button" data-plugin-workspace-toggle="${escapeHtml(plugin.id)}" data-plugin-workspace-id="${escapeHtml(workspaceId)}" data-plugin-workspace-label="${escapeHtml(label)}" data-plugin-enabled="${enabled && !retryProvisioning ? "1" : "0"}">${retryProvisioning ? "重试" : enabled ? "撤销" : "开通"}</button>`;
      return `<article class="plugin-admin-workspace-row">
        <div>
          <div class="plugin-admin-workspace-title">${escapeHtml(label)}</div>
          <div class="plugin-admin-workspace-meta">${escapeHtml(workspaceId)}</div>
        </div>
        <span class="plugin-admin-workspace-state ${enabled ? "is-enabled" : ""}"${statusTitle}>${escapeHtml(statusText)}</span>
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
  const plugins = Array.isArray(state.pluginAdminPlugins) ? state.pluginAdminPlugins : [];
  const expandedPluginId = String(state.pluginAdminExpandedPluginId || "");
  const errorBlock = state.pluginAdminError
    ? `<div class="access-key-empty error">${escapeHtml(state.pluginAdminError)}</div>`
    : "";
  const body = state.pluginAdminLoading && !plugins.length
    ? `<div class="access-key-empty">正在读取插件授权...</div>`
    : plugins.length
      ? `<div class="plugin-admin-list">${plugins.map((plugin) => {
          const pluginId = String(plugin.id || "");
          const expanded = Boolean(pluginId && expandedPluginId === pluginId);
          const grantedCount = (plugin.authorizedWorkspaceIds || []).length;
          const riskLabel = plugin.riskLevel === "owner-critical" ? "高风险" : "工作区私有";
          const grantLabel = plugin.allowWorkspaceGrant === false ? "Owner 专用" : `非 Owner 已开通 ${grantedCount}`;
          const workspaceRows = expanded && plugin.allowWorkspaceGrant !== false
            ? pluginAdminWorkspaceRows(plugin)
            : "";
          const expandedBody = expanded
            ? plugin.allowWorkspaceGrant === false
              ? `<div class="plugin-admin-owner-only-panel">Codex 为 Owner 专用，不列出其他用户。</div>`
              : `<div class="plugin-admin-contract">
                  <span>${plugin.provisioning?.supported ? "Owner 也需要开通建档" : "Owner 默认可用"}</span>
                  <span>Owner 手动开通各工作区</span>
                  <span>${plugin.provisioning?.supported ? "开通后插件侧绑定/建档" : "插件侧手动绑定"}</span>
                </div>
                <div class="plugin-admin-workspace-list">${workspaceRows || `<div class="access-key-empty">暂无非 Owner 工作区。</div>`}</div>`
            : "";
          return `<section class="plugin-admin-card ${expanded ? "is-expanded" : "is-collapsed"}">
            <header class="plugin-admin-card-head">
              <div>
                <div class="plugin-admin-title">${escapeHtml(plugin.title || plugin.id)}</div>
                <div class="plugin-admin-meta">${escapeHtml(plugin.id)} · ${escapeHtml(riskLabel)} · ${escapeHtml(grantLabel)}</div>
              </div>
              <div class="plugin-admin-head-actions">
                <span class="plugin-admin-risk ${plugin.riskLevel === "owner-critical" ? "is-critical" : ""}">${escapeHtml(plugin.riskLevel || "workspace-private")}</span>
                <button type="button" class="plugin-admin-expand" data-plugin-admin-expand="${escapeHtml(pluginId)}" aria-expanded="${expanded ? "true" : "false"}">${expanded ? "收起" : "展开"}</button>
              </div>
            </header>
            ${expandedBody}
          </section>`;
        }).join("")}</div>`
      : `<div class="access-key-empty">当前没有已安装插件。</div>`;
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
  if (!state.auth?.isOwner) {
    showError(new Error("Owner access is required"));
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
  if (!pluginId || !workspaceId) return;
  state.pluginAdminLoading = true;
  state.pluginAdminError = "";
  renderPluginAdminManager();
  try {
    if (enabled) {
      await api(`/api/hermes-plugins/${encodeURIComponent(pluginId)}/workspaces/${encodeURIComponent(workspaceId)}`, {
        method: "DELETE",
      });
    } else {
      await api(`/api/hermes-plugins/${encodeURIComponent(pluginId)}/workspaces`, {
        method: "POST",
        body: JSON.stringify({ workspaceId, displayName }),
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
