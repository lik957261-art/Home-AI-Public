"use strict";

async function loadWorkspaces() {
  const result = await api("/api/workspaces");
  state.workspaces = result.data || [];
  state.auth = result.auth || null;
  const accessibleWorkspaceIds = Array.isArray(state.auth?.workspaceIds) && state.auth.workspaceIds.length
    ? state.auth.workspaceIds
    : (state.auth?.workspaceId ? [state.auth.workspaceId] : []);
  if (!state.auth?.isOwner) {
    if (!accessibleWorkspaceIds.includes(state.selectedWorkspaceId)) {
      state.selectedWorkspaceId = state.auth?.workspaceId || accessibleWorkspaceIds[0] || "";
    }
  }
  else if (!state.workspaces.some((item) => item.id === state.selectedWorkspaceId)) state.selectedWorkspaceId = state.workspaces[0]?.id || "";
  if (state.selectedWorkspaceId) localStorage.setItem("hermesWebWorkspace", state.selectedWorkspaceId);
  if (!state.auth?.isOwner) { state.accessKeyManagerOpen = state.runtimeConfigOpen = state.pluginAdminOpen = false; document.querySelectorAll("#accessKeyOverlay,#runtimeConfigOverlay,#pluginAdminOverlay,#ownerElevationApprovalOverlay").forEach((node) => { node.classList.add("hidden"); node.innerHTML = ""; }); }
  const select = $("workspaceSelect");
  select.innerHTML = state.workspaces.map((ws) => `<option value="${escapeHtml(ws.id)}">${escapeHtml(ws.label || ws.id)}</option>`).join("");
  select.value = state.selectedWorkspaceId;
  renderWorkspaceAccessPanel();
  renderComposerContext();
}

async function loadProjects() {
  const result = await api(`/api/projects?workspaceId=${encodeURIComponent(state.selectedWorkspaceId)}`);
  state.projects = (result.data || []).filter((project) => !project.hidden);
  if (!state.projects.some((item) => item.id === state.selectedProjectId)) {
    state.selectedProjectId = state.projects[0]?.id || "";
    localStorage.setItem("hermesWebProject", state.selectedProjectId);
  }
  const select = $("projectSelect");
  select.innerHTML = state.projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(projectDisplayLabel(project))}</option>`).join("");
  select.value = state.selectedProjectId;
  renderSubprojects();
  if (typeof updateWardrobeNavigationAvailability === "function") updateWardrobeNavigationAvailability();
}

function currentProject() {
  return state.projects.find((item) => item.id === state.selectedProjectId) || null;
}

function currentSubproject() {
  const project = currentProject();
  return (project?.children || []).find((item) => item.id === state.selectedSubprojectId) || null;
}

function currentWorkspace() {
  return state.workspaces.find((item) => item.id === state.selectedWorkspaceId) || null;
}

function ownerWorkspaceSelected() {
  if (state.auth?.isOwner) return true;
  const workspace = currentWorkspace();
  return Boolean(workspace && (workspace.id === "owner" || workspace.role === "owner" || workspace.role === "admin"));
}

function pathTailName(value) {
  const text = String(value || "").trim().replaceAll("\\", "/").replace(/\/+$/, "");
  if (!text) return "";
  const parts = text.split("/").filter(Boolean);
  return parts[parts.length - 1] || text;
}

function workspaceRootDirectoryName(workspace) {
  const dirs = Array.isArray(workspace?.workDirectories) ? workspace.workDirectories : [];
  const root = String(workspace?.defaultWorkspace || dirs[0]?.path || dirs[0] || "").trim();
  return pathTailName(root) || "未配置";
}

function workspaceAccountSummary(workspace) {
  return String(workspace?.principalId || workspace?.accessKey || workspace?.id || "").trim();
}

function workspaceAccessKeyStatusLabel(workspace) {
  const status = workspace?.accessKeyStatus || {};
  const stateText = status.hasKey ? "已生成" : "未生成";
  if (status.kind === "owner" && status.source) return `${stateText} · ${status.source}`;
  return stateText;
}

function workspaceTongbaoWallet(workspace) {
  const wallet = workspace?.tongbaoWallet && typeof workspace.tongbaoWallet === "object"
    ? workspace.tongbaoWallet
    : {};
  return {
    availableBalance: Number(wallet.availableBalance || 0) || 0,
    heldBalance: Number(wallet.heldBalance || 0) || 0,
    totalBalance: Number(wallet.totalBalance || wallet.availableBalance || 0) || 0,
    currency: String(wallet.currency || "TONGBAO"),
  };
}

function workspaceTongbaoLine(workspace) {
  const wallet = workspaceTongbaoWallet(workspace);
  const held = wallet.heldBalance > 0 ? ` · 冻结 ${wallet.heldBalance}` : "";
  return `<div class="workspace-access-line workspace-tongbao-line"><span>通宝</span>${escapeHtml(String(wallet.availableBalance))}${escapeHtml(held)}</div>`;
}

function workspaceOutboundStatusLabel(status) {
  const value = String(status || "").trim();
  if (!value) return "";
  if (value === "verified") return "已验证";
  if (value === "adapter_registered") return "已注册";
  if (value === "adapter_registered_context_token_missing") return "已注册";
  return value;
}

function workspaceBindingChips(workspace) {
  const bindings = workspace?.bindings || {};
  const chips = [];
  (bindings.channels || []).forEach((channel) => {
    const state = [];
    const outbound = workspaceOutboundStatusLabel(channel.outboundStatus);
    if (outbound) state.push(outbound);
    if (channel.contextTokenAvailable === true) state.push("Context 已绑定");
    if (channel.contextTokenAvailable === false) state.push("Context 未绑定");
    chips.push(`${channel.label || channel.type || "通道"}${state.length ? ` · ${state.join(" · ")}` : ""}`);
  });
  (bindings.interfaces || []).forEach((item) => {
    const detail = [item.category, item.detail].filter(Boolean).join(" · ");
    chips.push(`${item.label || item.id}${detail ? ` · ${detail}` : ""}`);
  });
  if (!chips.length) return "";
  return `<div class="workspace-access-bindings">${chips.map((item) => (
    `<span class="workspace-access-binding-chip">${escapeHtml(item)}</span>`
  )).join("")}</div>`;
}

function workspaceAccessRows() {
  const workspaces = Array.isArray(state.workspaces) ? state.workspaces : [];
  const selectedWorkspaceId = state.selectedWorkspaceId || "";
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
  if (selectedWorkspace) return [selectedWorkspace];
  const accessibleWorkspaceIds = Array.isArray(state.auth?.workspaceIds) && state.auth.workspaceIds.length
    ? state.auth.workspaceIds
    : (state.auth?.workspaceId ? [state.auth.workspaceId] : []);
  const ownWorkspace = workspaces.find((workspace) => accessibleWorkspaceIds.includes(workspace.id));
  if (ownWorkspace) return [ownWorkspace];
  return workspaces.slice(0, 1);
}

function renderWorkspaceAccessPanel() {
  const panel = $("workspaceAccessPanel");
  if (!panel) return;
  const accessRows = workspaceAccessRows();
  const show = accessRows.length > 0;
  panel.hidden = !show;
  if (!show) {
    panel.innerHTML = "";
    return;
  }
  const canManageOwnerSettings = Boolean(state.auth?.isOwner && state.selectedWorkspaceId === "owner");
  const rows = accessRows.map((workspace) => {
    const account = workspaceAccountSummary(workspace);
    const rootDirectory = workspaceRootDirectoryName(workspace);
    const accessKeyStatus = workspaceAccessKeyStatusLabel(workspace);
    const bindings = workspaceBindingChips(workspace);
    const accessKeyLine = canManageOwnerSettings
      ? `<div class="workspace-access-key-row">
        <div class="workspace-access-line"><span>Access Key</span>${escapeHtml(accessKeyStatus)}</div>
        <button class="workspace-access-key-button" type="button" data-open-access-keys data-access-key-workspace="owner">管理</button>
      </div>`
      : "";
    return `<section class="workspace-access-row">
      <div class="workspace-access-name">${escapeHtml(workspace.label || workspace.id)}</div>
      ${workspaceTongbaoLine(workspace)}
      ${canManageOwnerSettings && account ? `<div class="workspace-access-line"><span>账号</span>${escapeHtml(account)}</div>` : ""}
      <div class="workspace-access-line"><span>根目录</span>${escapeHtml(rootDirectory)}</div>
      ${accessKeyLine}
      ${bindings}
    </section>`;
  }).join("");
  const runtimeConfigButton = canManageOwnerSettings
    ? `<button class="workspace-access-key-button workspace-runtime-config-button" type="button" data-open-runtime-config>运行配置</button>`
    : "";
  panel.innerHTML = `${renderOwnerElevationPanel()}
  <details>
    <summary>账号 / 根目录 / 接口</summary>
    <div class="workspace-access-list">${rows}</div>
    ${renderGatewayPoolMiniStatus()}
    ${runtimeConfigButton}
  </details>`;
  if (canManageOwnerSettings) {
    const details = panel.querySelector("details");
    if (details && !details.querySelector("[data-open-plugin-admin]")) {
      details.insertAdjacentHTML("beforeend", `<button class="workspace-access-key-button workspace-runtime-config-button" type="button" data-open-plugin-admin>插件管理</button>`);
    }
  }
  wireOwnerElevationPanel(panel);
  panel.querySelectorAll("[data-open-access-keys]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      openAccessKeyManager({ workspaceId: button.dataset.accessKeyWorkspace || state.selectedWorkspaceId }).catch(showError);
    });
  });
  panel.querySelector("[data-open-runtime-config]")?.addEventListener("click", (event) => {
    event.preventDefault();
    openRuntimeConfigManager().catch(showError);
  });
  panel.querySelector("[data-open-plugin-admin]")?.addEventListener("click", (event) => {
    event.preventDefault();
    openPluginAdminManager().catch(showError);
  });
}

function renderRuntimeModelOptions(config = {}) {
  const options = Array.isArray(config.modelOptions) && config.modelOptions.length
    ? config.modelOptions
    : (Array.isArray(state.runtimeModelOptions) ? state.runtimeModelOptions : []);
  const selected = String(config.defaultModelId || state.defaultModelId || "").trim();
  return options.map((option) => {
    const id = String(option.id || `${option.provider || ""}:${option.model || ""}`).trim();
    if (!id) return "";
    const label = String(option.label || option.model || id).trim();
    const meta = [option.model, option.provider].filter(Boolean).join(" / ");
    return `<option value="${escapeHtml(id)}"${id === selected ? " selected" : ""}>${escapeHtml(meta ? `${label} (${meta})` : label)}</option>`;
  }).join("");
}

function renderRuntimeReasoningOptions(selected = "") {
  const current = String(selected || state.defaultReasoningEffort || "medium").trim().toLowerCase();
  return configuredReasoningOptions().map((option) => {
    const value = String(option.value || "").trim().toLowerCase();
    if (!value) return "";
    return `<option value="${escapeHtml(value)}"${value === current ? " selected" : ""}>${escapeHtml(option.label || value)}</option>`;
  }).join("");
}

function renderRuntimeConfigManager() {
  const overlay = $("runtimeConfigOverlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", !state.runtimeConfigOpen);
  if (!state.runtimeConfigOpen) {
    overlay.innerHTML = "";
    return;
  }
  const config = state.runtimeConfig || {};
  const status = state.runtimeConfigTestStatus;
  const keyState = config.hermesApiKeyConfigured ? `${config.hermesApiKeySource || "configured"}` : "未配置";
  const pushState = config.webPushConfigured ? "已配置" : (config.webPushEnabled ? "未配置" : "已禁用");
  const testBlock = status
    ? `<section class="runtime-config-status ${status.ok ? "ok" : "error"}">
        <div class="access-key-row-title">${status.ok ? "Gateway 可用" : "Gateway 不可用"}</div>
        <div class="access-key-row-meta">${escapeHtml(status.status?.apiBase || config.hermesApiBase || "")}</div>
        ${status.status?.error ? `<div class="runtime-config-error">${escapeHtml(status.status.error)}</div>` : ""}
      </section>`
    : "";
  const gatewayStatusBlock = renderGatewayPoolMiniStatus(
    status?.status?.gatewayPool || state.gatewayPool,
    status?.status?.concurrency || state.concurrency,
  );
  const errorBlock = state.runtimeConfigError
    ? `<div class="access-key-empty error">${escapeHtml(state.runtimeConfigError)}</div>`
    : "";
  const body = state.runtimeConfigLoading && !state.runtimeConfig
    ? `<div class="access-key-empty">正在读取运行配置...</div>`
    : `<section class="runtime-config-form">
          <label>
            <span>Hermes Gateway URL</span>
            <input id="runtimeHermesApiBase" type="url" autocomplete="off" value="${escapeHtml(config.hermesApiBase || "")}" placeholder="http://127.0.0.1:8642">
          </label>
          <label>
            <span>Hermes API Key 文件路径</span>
            <input id="runtimeHermesApiKeyPath" type="text" autocomplete="off" value="${escapeHtml(config.hermesApiKeyPath || "")}" placeholder="可留空，继续使用环境变量或默认路径">
          </label>
          <div class="runtime-config-subtitle">Model default</div>
          <label>
            <span>Default model</span>
            <select id="runtimeDefaultModelId" class="todo-input">${renderRuntimeModelOptions(config)}</select>
          </label>
          <label>
            <span>Default reasoning</span>
            <select id="runtimeDefaultReasoningEffort" class="todo-input">${renderRuntimeReasoningOptions(config.defaultReasoningEffort || "")}</select>
          </label>
          <div class="runtime-config-subtitle">Web Push / VAPID</div>
          <label>
            <span>Web Push subject</span>
            <input id="runtimeWebPushSubject" type="text" autocomplete="off" value="${escapeHtml(config.webPushSubjectOverride || "")}" placeholder="mailto:admin@example.com">
          </label>
          <label>
            <span>VAPID 文件路径</span>
            <input id="runtimeWebPushVapidPath" type="text" autocomplete="off" value="${escapeHtml(config.webPushVapidPath || "")}" placeholder="可留空，使用默认 runtime 文件">
          </label>
          <div class="runtime-config-meta">
            <div>默认 URL：${escapeHtml(config.hermesApiBaseDefault || "")}</div>
            <div>API Key：${escapeHtml(keyState)}${config.hermesApiKeyResolvedPath ? ` · ${escapeHtml(config.hermesApiKeyResolvedPath)}` : ""}</div>
            <div>Web Push：${escapeHtml(pushState)} · 订阅 ${escapeHtml(config.webPushSubscriptionCount || 0)}</div>
            <div>VAPID：${escapeHtml(config.webPushVapidExists ? "文件存在" : "文件不存在")}${config.webPushVapidResolvedPath ? ` · ${escapeHtml(config.webPushVapidResolvedPath)}` : ""}</div>
            <div>Subject：${escapeHtml(config.webPushSubject || "")}</div>
            ${config.updatedAt ? `<div>更新：${escapeHtml(formatTime(config.updatedAt))}${config.updatedBy ? ` · ${escapeHtml(config.updatedBy)}` : ""}</div>` : ""}
          </div>
          <div class="runtime-config-actions">
            <button type="button" data-save-runtime-config>保存</button>
            <button type="button" data-test-runtime-config>测试连接</button>
            <button type="button" data-reload-web-push-config>重载推送</button>
            <button type="button" data-generate-web-push-vapid>生成 VAPID</button>
          </div>
        </section>`;
  overlay.innerHTML = `
    <div class="access-key-sheet runtime-config-sheet">
      <header class="access-key-header">
        <div>
          <div id="runtimeConfigTitle" class="access-key-title">运行配置</div>
          <div class="access-key-subtitle">只保存 Gateway URL 和 API key 文件路径；不在 Web 配置里保存 API key 明文。</div>
        </div>
        <button class="access-key-close" type="button" data-close-runtime-config>完成</button>
      </header>
      ${errorBlock}
      ${body}
      ${gatewayStatusBlock}
      ${testBlock}
    </div>`;
  overlay.querySelector("[data-close-runtime-config]")?.addEventListener("click", closeRuntimeConfigManager);
  overlay.querySelector("[data-save-runtime-config]")?.addEventListener("click", () => saveRuntimeConfigManager().catch(showError));
  overlay.querySelector("[data-test-runtime-config]")?.addEventListener("click", () => testRuntimeConfigManager().catch(showError));
  overlay.querySelector("[data-reload-web-push-config]")?.addEventListener("click", () => reloadWebPushRuntimeConfig().catch(showError));
  overlay.querySelector("[data-generate-web-push-vapid]")?.addEventListener("click", () => generateWebPushVapidFromRuntimeConfig().catch(showError));
}

async function loadRuntimeConfigManager() {
  state.runtimeConfigLoading = true;
  state.runtimeConfigError = "";
  state.runtimeConfigTestStatus = null;
  renderRuntimeConfigManager();
  try {
    const result = await api("/api/runtime-config");
    state.runtimeConfig = result.config || {};
  } catch (err) {
    state.runtimeConfigError = err.message || String(err);
  } finally {
    state.runtimeConfigLoading = false;
    renderRuntimeConfigManager();
  }
}

async function openRuntimeConfigManager() {
  closeTopMoreMenu();
  closeSidebar();
  if (!state.auth?.isOwner) {
    showError(new Error("Owner access is required"));
    return;
  }
  if (state.selectedWorkspaceId !== "owner") {
    showError(new Error("Switch to Owner workspace to manage runtime configuration"));
    return;
  }
  state.runtimeConfigOpen = true;
  await loadRuntimeConfigManager();
}

function closeRuntimeConfigManager() {
  state.runtimeConfigOpen = false;
  state.runtimeConfigError = "";
  state.runtimeConfigTestStatus = null;
  renderRuntimeConfigManager();
}

async function saveRuntimeConfigManager() {
  const hermesApiBase = $("runtimeHermesApiBase")?.value?.trim() || "";
  const hermesApiKeyPath = $("runtimeHermesApiKeyPath")?.value?.trim() || "";
  const defaultModelId = $("runtimeDefaultModelId")?.value?.trim() || "";
  const defaultReasoningEffort = $("runtimeDefaultReasoningEffort")?.value?.trim() || "";
  const webPushSubject = $("runtimeWebPushSubject")?.value?.trim() || "";
  const webPushVapidPath = $("runtimeWebPushVapidPath")?.value?.trim() || "";
  state.runtimeConfigLoading = true;
  state.runtimeConfigError = "";
  renderRuntimeConfigManager();
  try {
    const result = await api("/api/runtime-config", {
      method: "PATCH",
      body: JSON.stringify({ hermesApiBase, hermesApiKeyPath, defaultModelId, defaultReasoningEffort, webPushSubject, webPushVapidPath }),
    });
    state.runtimeConfig = result.config || {};
    state.pushStatus = result.push || state.pushStatus;
    await loadStatus();
  } catch (err) {
    state.runtimeConfigError = err.message || String(err);
  } finally {
    state.runtimeConfigLoading = false;
    renderRuntimeConfigManager();
  }
}

async function reloadWebPushRuntimeConfig() {
  state.runtimeConfigLoading = true;
  state.runtimeConfigError = "";
  renderRuntimeConfigManager();
  try {
    const result = await api("/api/runtime-config/web-push/reload", {
      method: "POST",
      body: JSON.stringify({}),
    });
    state.runtimeConfig = result.config || state.runtimeConfig;
    state.pushStatus = result.push || state.pushStatus;
    updatePushButton();
  } catch (err) {
    state.runtimeConfigError = err.message || String(err);
  } finally {
    state.runtimeConfigLoading = false;
    renderRuntimeConfigManager();
  }
}

async function generateWebPushVapidFromRuntimeConfig() {
  const exists = Boolean(state.runtimeConfig?.webPushVapidExists);
  if (exists && !window.confirm("重新生成 VAPID 会让已有浏览器推送订阅失效，需要用户重新启用通知。继续？")) return;
  state.runtimeConfigLoading = true;
  state.runtimeConfigError = "";
  renderRuntimeConfigManager();
  try {
    const result = await api("/api/runtime-config/web-push/generate", {
      method: "POST",
      body: JSON.stringify({ overwrite: exists }),
    });
    state.runtimeConfig = result.config || state.runtimeConfig;
    state.pushStatus = result.push || state.pushStatus;
    updatePushButton();
  } catch (err) {
    state.runtimeConfigError = err.message || String(err);
  } finally {
    state.runtimeConfigLoading = false;
    renderRuntimeConfigManager();
  }
}

async function testRuntimeConfigManager() {
  state.runtimeConfigLoading = true;
  state.runtimeConfigError = "";
  renderRuntimeConfigManager();
  try {
    const result = await api("/api/runtime-config/test", {
      method: "POST",
      body: JSON.stringify({}),
    });
    state.runtimeConfigTestStatus = result;
    state.runtimeConfig = result.config || state.runtimeConfig;
    state.gatewayPool = result.status?.gatewayPool || state.gatewayPool;
    state.concurrency = result.status?.concurrency || state.concurrency;
  } catch (err) {
    state.runtimeConfigError = err.message || String(err);
  } finally {
    state.runtimeConfigLoading = false;
    renderRuntimeConfigManager();
  }
}
