"use strict";

async function loadWorkspaces() {
  const result = await api("/api/workspaces");
  state.workspaces = result.data || [];
  state.auth = result.auth || null;
  if (!state.auth?.isOwner && state.auth?.workspaceId) state.selectedWorkspaceId = state.auth.workspaceId;
  else if (!state.workspaces.some((item) => item.id === state.selectedWorkspaceId)) state.selectedWorkspaceId = state.workspaces[0]?.id || "";
  if (state.selectedWorkspaceId) localStorage.setItem("hermesWebWorkspace", state.selectedWorkspaceId);
  if (!state.auth?.isOwner) { state.accessKeyManagerOpen = state.runtimeConfigOpen = false; document.querySelectorAll("#accessKeyOverlay,#runtimeConfigOverlay,#ownerElevationApprovalOverlay").forEach((node) => { node.classList.add("hidden"); node.innerHTML = ""; }); }
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
  const ownWorkspaceId = state.auth?.workspaceId || "";
  const ownWorkspace = workspaces.find((workspace) => workspace.id === ownWorkspaceId);
  if (ownWorkspace) return [ownWorkspace];
  return workspaces.slice(0, 1);
}

function renderWorkspaceAccessPanel() {
  const panel = $("workspaceAccessPanel");
  if (!panel) return;
  if (!state.auth?.isOwner) { panel.hidden = true; panel.innerHTML = ""; return; }
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
  const webPushSubject = $("runtimeWebPushSubject")?.value?.trim() || "";
  const webPushVapidPath = $("runtimeWebPushVapidPath")?.value?.trim() || "";
  state.runtimeConfigLoading = true;
  state.runtimeConfigError = "";
  renderRuntimeConfigManager();
  try {
    const result = await api("/api/runtime-config", {
      method: "PATCH",
      body: JSON.stringify({ hermesApiBase, hermesApiKeyPath, webPushSubject, webPushVapidPath }),
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

function renderAccessKeyManagerLegacy() {
  const overlay = $("accessKeyOverlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", !state.accessKeyManagerOpen);
  if (!state.accessKeyManagerOpen) {
    overlay.innerHTML = "";
    return;
  }
  const selectedWorkspaceId = state.accessKeyWorkspaceId || state.selectedWorkspaceId || state.auth?.workspaceId || "";
  const selectedWorkspace = (state.workspaces || []).find((workspace) => workspace.id === selectedWorkspaceId) || currentWorkspace();
  const isOwnerAccessManager = Boolean(state.accessKeysAuth?.isOwner);
  const ownerWideAccessKeyList = Boolean(isOwnerAccessManager && selectedWorkspace?.id === "owner");
  const selectedAccessKeys = (state.accessKeys || []).filter((item) => ownerWideAccessKeyList || !selectedWorkspace?.id || item.workspaceId === selectedWorkspace.id);
  const showOwnerKey = Boolean(isOwnerAccessManager && selectedWorkspace?.id === "owner");
  const localWorkspaces = isOwnerAccessManager
    ? (state.workspaces || []).filter((workspace) => workspace.source === "local-workspace")
    : [];
  const deploymentWorkspaces = isOwnerAccessManager
    ? (state.workspaces || []).filter((workspace) => workspace.id !== "owner" && workspace.source !== "local-workspace")
    : [];
  const workspaceRootLabel = (workspace) => workspace?.localConfig?.defaultWorkspace || workspace?.defaultWorkspace || "";
  const workspaceToolsets = (workspace) => workspace?.localConfig?.allowedToolsets || workspace?.bindings?.allowedToolsets || [];
  const renderWorkspaceAdminRow = (workspace, options = {}) => {
    const editable = Boolean(options.editable);
    const root = workspaceRootLabel(workspace);
    const toolsets = workspaceToolsets(workspace);
    return `<article class="workspace-admin-row">
      <div class="workspace-admin-main">
        <div class="workspace-admin-title">${escapeHtml(workspace.label || workspace.id)}</div>
        <div class="workspace-admin-meta">${escapeHtml(workspace.id)}${root ? ` · ${escapeHtml(root)}` : ""}</div>
        ${toolsets.length ? `<div class="workspace-admin-meta">接口：${escapeHtml(toolsets.join(", "))}</div>` : ""}
      </div>
      ${editable ? `<button type="button" data-edit-workspace="${escapeHtml(workspace.id)}">编辑</button>` : `<span class="workspace-admin-readonly">只读</span>`}
      <button type="button" data-manage-workspace="${escapeHtml(workspace.id)}">Key</button>
      ${editable ? `<button type="button" data-delete-workspace="${escapeHtml(workspace.id)}">删除</button>` : ""}
    </article>`;
  };
  const generatedAccessKeyBlock = (target = {}) => {
    if (!state.generatedAccessKey) return "";
    const generatedKind = state.generatedAccessKey.kind || "workspace";
    const targetKind = target.kind || "workspace";
    const generatedWorkspaceId = String(state.generatedAccessKey.workspaceId || "");
    const targetWorkspaceId = String(target.workspaceId || "");
    if (generatedKind !== targetKind) return "";
    if (targetKind === "workspace" && targetWorkspaceId && generatedWorkspaceId !== targetWorkspaceId) return "";
    return `<section class="access-key-result" data-generated-access-key data-generated-workspace="${escapeHtml(generatedWorkspaceId)}">
        <div class="access-key-result-label">${escapeHtml(state.generatedAccessKey.label || "New Access Key")}</div>
        <div class="access-key-value-row">
          <code>${escapeHtml(state.generatedAccessKey.key || "")}</code>
          <button type="button" data-copy-access-key>复制</button>
        </div>
        <div class="access-key-note">明文 key 只在本次生成后显示一次。${state.accessKeyRequiresLogin ? "复制后需要重新登录。" : ""}</div>
        ${state.accessKeyRequiresLogin ? `<button class="access-key-login-button" type="button" data-relogin-after-access-key>重新登录</button>` : ""}
      </section>`;
  };
  const generatedKind = state.generatedAccessKey?.kind || "workspace";
  const generatedWorkspaceId = String(state.generatedAccessKey?.workspaceId || "");
  const generatedInRow = Boolean(generatedKind === "workspace" && generatedWorkspaceId && selectedAccessKeys.some((item) => String(item.workspaceId || "") === generatedWorkspaceId));
  const generatedInOwner = Boolean(generatedKind === "owner" && showOwnerKey);
  const fallbackGenerated = state.generatedAccessKey && !generatedInRow && !generatedInOwner
    ? generatedAccessKeyBlock({ kind: generatedKind })
    : "";
  const rows = selectedAccessKeys.length ? selectedAccessKeys.map((item) => {
    const updated = item.updatedAt ? formatTime(item.updatedAt) : "";
    return `<article class="access-key-row">
      <div class="access-key-row-main">
        <div class="access-key-row-title">${escapeHtml(item.workspaceLabel || item.workspaceId)}</div>
        <div class="access-key-row-meta">${escapeHtml(item.workspaceId || "")}${updated ? ` · 更新 ${escapeHtml(updated)}` : ""}</div>
      </div>
      <div class="access-key-row-state">${item.hasKey ? "已生成" : "未生成"}</div>
      <button type="button" data-generate-workspace-key="${escapeHtml(item.workspaceId || "")}">${item.hasKey ? "更换" : "生成"}</button>
      ${item.hasKey ? `<button type="button" data-revoke-workspace-key="${escapeHtml(item.workspaceId || "")}">撤销</button>` : ""}
      ${generatedAccessKeyBlock({ kind: "workspace", workspaceId: item.workspaceId || "" })}
    </article>`;
  }).join("") : `<div class="access-key-empty">当前工作区没有可管理的工作区 Access Key。</div>`;
  const body = state.accessKeysLoading
    ? `<div class="access-key-empty">正在读取 Access Key...</div>`
    : state.accessKeysError
      ? `<div class="access-key-empty error">${escapeHtml(state.accessKeysError)}</div>`
      : `<div class="access-key-list">${rows}</div>`;
  const workspaceCreateForm = state.accessKeysAuth?.isOwner ? `<section class="access-key-create-workspace">
        <div class="access-key-row-title">创建 / 配置用户工作区</div>
        <div class="workspace-create-help">先填用户名，显示名、根目录和访问目录会自动预填。</div>
        <div class="access-key-create-grid">
          <label>
            <span>用户名</span>
            <input id="newWorkspaceId" type="text" autocomplete="off" placeholder="zhangsan / 张三">
          </label>
          <label>
            <span>显示名</span>
            <input id="newWorkspaceLabel" type="text" autocomplete="off" placeholder="自动生成">
          </label>
          <label class="workspace-create-full">
            <span>根目录</span>
            <input id="newWorkspaceRoot" type="text" autocomplete="off" placeholder="自动生成，可修改">
          </label>
        </div>
        <div id="newWorkspaceDefaultsHint" class="workspace-create-hint"></div>
        <label class="workspace-create-field">
          <span>允许访问目录</span>
          <textarea id="newWorkspaceAllowedRoots" rows="3" placeholder="自动使用根目录；每行一个"></textarea>
        </label>
        <label class="workspace-create-field">
          <span>额外接口 / toolsets</span>
          <input id="newWorkspaceToolsets" type="text" autocomplete="off" placeholder="可留空，逗号分隔">
        </label>
        <button type="button" data-create-workspace>保存工作区</button>
      </section>` : "";
  const workspaceAdminList = isOwnerAccessManager ? `<section class="access-key-workspace-admin">
        <div class="access-key-row-title">本地用户工作区</div>
        ${localWorkspaces.length ? localWorkspaces.map((workspace) => {
          return renderWorkspaceAdminRow(workspace, { editable: true });
        }).join("") : `<div class="access-key-empty">还没有管理员创建的本地用户工作区。</div>`}
        ${deploymentWorkspaces.length ? `
          <div class="access-key-row-title workspace-admin-subtitle">部署账号 / 只读</div>
          ${deploymentWorkspaces.map((workspace) => renderWorkspaceAdminRow(workspace, { editable: false })).join("")}
        ` : ""}
      </section>` : "";
  const subtitle = isOwnerAccessManager
    ? "Owner 可查看全部账号；生产部署账号在这里只读，Access Key 仍可管理。"
    : "只能查看并更换当前账号的 Hermes Mobile 登录 key。";
  overlay.innerHTML = `
    <div class="access-key-sheet">
      <header class="access-key-header">
        <div>
          <div id="accessKeyTitle" class="access-key-title">Access Key${selectedWorkspace ? ` · ${escapeHtml(selectedWorkspace.label || selectedWorkspace.id)}` : ""}</div>
          <div class="access-key-subtitle">${escapeHtml(subtitle)}</div>
        </div>
        <button class="access-key-close" type="button" data-close-access-keys>完成</button>
      </header>
      ${workspaceCreateForm}
      ${workspaceAdminList}
      ${showOwnerKey ? `<section class="access-key-web">
        <div>
          <div class="access-key-row-title">Hermes Mobile Owner Key</div>
          <div class="access-key-row-meta">当前来源：${escapeHtml(state.accessKeysAuth?.source || "unknown")}</div>
        </div>
        <button type="button" data-rotate-web-key${state.accessKeysAuth?.canRotateGlobal === false ? " disabled" : ""}>更换</button>
        ${generatedAccessKeyBlock({ kind: "owner" })}
      </section>` : ""}
      ${fallbackGenerated}
      ${body}
    </div>`;
  overlay.querySelector("[data-close-access-keys]")?.addEventListener("click", closeAccessKeyManager);
  overlay.querySelector("[data-rotate-web-key]")?.addEventListener("click", () => rotateWebAccessKey().catch(showError));
  overlay.querySelector("[data-create-workspace]")?.addEventListener("click", () => createWorkspaceFromAccessKeyManager().catch(showError));
  wireWorkspaceCreateDefaults(overlay);
  overlay.querySelector("[data-copy-access-key]")?.addEventListener("click", () => copyTextToClipboard(state.generatedAccessKey?.key || "").catch(showError));
  overlay.querySelector("[data-relogin-after-access-key]")?.addEventListener("click", () => finishAccessKeyRelogin());
  const generatedNode = overlay.querySelector("[data-generated-access-key]");
  if (generatedNode && state.generatedAccessKey?.focus) {
    state.generatedAccessKey.focus = false;
    window.requestAnimationFrame(() => {
      generatedNode.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }
  overlay.querySelectorAll("[data-edit-workspace]").forEach((button) => {
    button.addEventListener("click", () => fillWorkspaceConfigForm(button.dataset.editWorkspace || ""));
  });
  overlay.querySelectorAll("[data-manage-workspace]").forEach((button) => {
    button.addEventListener("click", () => loadAccessKeyManager({ workspaceId: button.dataset.manageWorkspace || "" }).catch(showError));
  });
  overlay.querySelectorAll("[data-delete-workspace]").forEach((button) => {
    button.addEventListener("click", () => deleteWorkspaceFromAccessKeyManager(button.dataset.deleteWorkspace || "").catch(showError));
  });
  overlay.querySelectorAll("[data-generate-workspace-key]").forEach((button) => {
    button.addEventListener("click", () => generateWorkspaceAccessKey(button.dataset.generateWorkspaceKey).catch(showError));
  });
  overlay.querySelectorAll("[data-revoke-workspace-key]").forEach((button) => {
    button.addEventListener("click", () => revokeWorkspaceAccessKey(button.dataset.revokeWorkspaceKey || "").catch(showError));
  });
}

function renderAccessKeyManager() {
  const overlay = $("accessKeyOverlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", !state.accessKeyManagerOpen);
  if (!state.accessKeyManagerOpen) {
    overlay.innerHTML = "";
    return;
  }
  const isOwnerAccessManager = Boolean(state.accessKeysAuth?.isOwner || state.auth?.isOwner);
  const allWorkspaces = Array.isArray(state.workspaces) ? state.workspaces : [];
  const localWorkspaces = isOwnerAccessManager
    ? allWorkspaces.filter((workspace) => workspace.source === "local-workspace")
    : [];
  const deploymentWorkspaces = isOwnerAccessManager
    ? allWorkspaces.filter((workspace) => workspace.id !== "owner" && workspace.source !== "local-workspace")
    : [];
  const accessKeys = Array.isArray(state.accessKeys) ? state.accessKeys : [];
  const accessKeyByWorkspaceId = new Map(
    accessKeys.map((item) => [String(item.workspaceId || ""), item]).filter(([workspaceId]) => workspaceId),
  );
  const workspaceIds = new Set(allWorkspaces.map((workspace) => String(workspace.id || "")).filter(Boolean));

  const generatedAccessKeyBlock = (target = {}) => {
    if (!state.generatedAccessKey) return "";
    const generatedKind = state.generatedAccessKey.kind || "workspace";
    const targetKind = target.kind || "workspace";
    const generatedWorkspaceId = String(state.generatedAccessKey.workspaceId || "");
    const targetWorkspaceId = String(target.workspaceId || "");
    if (generatedKind !== targetKind) return "";
    if (targetKind === "workspace" && targetWorkspaceId && generatedWorkspaceId !== targetWorkspaceId) return "";
    return `<section class="access-key-result" data-generated-access-key data-generated-workspace="${escapeHtml(generatedWorkspaceId)}">
        <div class="access-key-result-label">${escapeHtml(state.generatedAccessKey.label || "New Access Key")}</div>
        <div class="access-key-value-row">
          <code>${escapeHtml(state.generatedAccessKey.key || "")}</code>
          <button type="button" data-copy-access-key>复制</button>
        </div>
        <div class="access-key-note">明文 key 只显示一次。${state.accessKeyRequiresLogin ? "复制后需要重新登录。" : ""}</div>
        ${state.accessKeyRequiresLogin ? `<button class="access-key-login-button" type="button" data-relogin-after-access-key>重新登录</button>` : ""}
      </section>`;
  };

  const workspaceRootLabel = (workspace) => workspace?.localConfig?.defaultWorkspace || workspace?.defaultWorkspace || "";
  const workspaceToolsets = (workspace) => workspace?.localConfig?.allowedToolsets || workspace?.bindings?.allowedToolsets || [];
  const workspaceKeyRecord = (workspace) => {
    const workspaceId = String(workspace?.id || "");
    return accessKeyByWorkspaceId.get(workspaceId) || {
      workspaceId,
      workspaceLabel: workspace?.label || workspaceId,
      hasKey: Boolean(workspace?.accessKeyStatus?.hasKey),
      updatedAt: workspace?.accessKeyStatus?.updatedAt || "",
    };
  };
  const renderWorkspaceKeyCard = (workspace, options = {}) => {
    const workspaceId = String(workspace?.id || "");
    if (!workspaceId) return "";
    const editable = Boolean(options.editable);
    const keyRecord = workspaceKeyRecord(workspace);
    const root = workspaceRootLabel(workspace);
    const toolsets = workspaceToolsets(workspace);
    const updated = keyRecord.updatedAt ? formatTime(keyRecord.updatedAt) : "";
    const keyLabel = keyRecord.hasKey ? "已生成" : "未生成";
    return `<article class="owner-workspace-card ${editable ? "local" : "deployment"}">
      <div class="owner-workspace-card-head">
        <div class="owner-workspace-main">
          <div class="owner-workspace-title">${escapeHtml(workspace?.label || workspaceId)}</div>
          <div class="owner-workspace-id">${escapeHtml(workspaceId)}</div>
        </div>
        <span class="owner-workspace-badge">${editable ? "本地账号" : "部署账号"}</span>
      </div>
      <dl class="owner-workspace-facts">
        <div><dt>Key</dt><dd>${escapeHtml(keyLabel)}${updated ? ` · ${escapeHtml(updated)}` : ""}</dd></div>
        ${root ? `<div><dt>根目录</dt><dd>${escapeHtml(root)}</dd></div>` : ""}
        ${toolsets.length ? `<div><dt>接口</dt><dd>${escapeHtml(toolsets.join(", "))}</dd></div>` : ""}
      </dl>
      <div class="owner-workspace-actions">
        ${editable ? `<button type="button" data-edit-workspace="${escapeHtml(workspaceId)}">编辑</button>` : ""}
        <button type="button" data-generate-workspace-key="${escapeHtml(workspaceId)}">${keyRecord.hasKey ? "更换 Key" : "生成 Key"}</button>
        ${keyRecord.hasKey ? `<button type="button" data-revoke-workspace-key="${escapeHtml(workspaceId)}">撤销</button>` : ""}
        ${editable ? `<button class="danger" type="button" data-delete-workspace="${escapeHtml(workspaceId)}">删除</button>` : ""}
      </div>
      ${generatedAccessKeyBlock({ kind: "workspace", workspaceId })}
    </article>`;
  };
  const renderWorkspaceSection = (title, workspaces, options = {}) => {
    if (!workspaces.length) return "";
    return `<section class="access-key-section">
      <div class="access-key-section-head">
        <div class="access-key-section-title">${escapeHtml(title)}</div>
        <div class="access-key-section-count">${escapeHtml(workspaces.length)}</div>
      </div>
      <div class="owner-workspace-grid">
        ${workspaces.map((workspace) => renderWorkspaceKeyCard(workspace, options)).join("")}
      </div>
    </section>`;
  };

  const generatedKind = state.generatedAccessKey?.kind || "workspace";
  const generatedWorkspaceId = String(state.generatedAccessKey?.workspaceId || "");
  const generatedInRow = Boolean(generatedKind === "workspace" && generatedWorkspaceId && workspaceIds.has(generatedWorkspaceId));
  const generatedInOwner = Boolean(generatedKind === "owner" && isOwnerAccessManager);
  const fallbackGenerated = state.generatedAccessKey && !generatedInRow && !generatedInOwner
    ? generatedAccessKeyBlock({ kind: generatedKind })
    : "";
  const orphanAccessKeys = isOwnerAccessManager
    ? accessKeys.filter((item) => item.workspaceId && !workspaceIds.has(String(item.workspaceId)))
    : [];
  const orphanKeySection = orphanAccessKeys.length ? `<section class="access-key-section">
    <div class="access-key-section-head">
      <div class="access-key-section-title">其他 Key 记录</div>
      <div class="access-key-section-count">${escapeHtml(orphanAccessKeys.length)}</div>
    </div>
    <div class="access-key-list">
      ${orphanAccessKeys.map((item) => {
    const updated = item.updatedAt ? formatTime(item.updatedAt) : "";
    return `<article class="access-key-row">
        <div class="access-key-row-main">
          <div class="access-key-row-title">${escapeHtml(item.workspaceLabel || item.workspaceId)}</div>
          <div class="access-key-row-meta">${escapeHtml(item.workspaceId || "")}${updated ? ` · ${escapeHtml(updated)}` : ""}</div>
        </div>
        <div class="access-key-row-state">${item.hasKey ? "已生成" : "未生成"}</div>
        <button type="button" data-generate-workspace-key="${escapeHtml(item.workspaceId || "")}">${item.hasKey ? "更换 Key" : "生成 Key"}</button>
        ${item.hasKey ? `<button type="button" data-revoke-workspace-key="${escapeHtml(item.workspaceId || "")}">撤销</button>` : ""}
        ${generatedAccessKeyBlock({ kind: "workspace", workspaceId: item.workspaceId || "" })}
      </article>`;
  }).join("")}
    </div>
  </section>` : "";

  const loadingBlock = state.accessKeysLoading
    ? `<div class="access-key-empty">正在读取账号和 Key...</div>`
    : "";
  const errorBlock = state.accessKeysError
    ? `<div class="access-key-empty error">${escapeHtml(state.accessKeysError)}</div>`
    : "";
  const ownerKeySection = isOwnerAccessManager ? `<section class="access-key-section owner-key-section">
    <div class="access-key-section-head">
      <div class="access-key-section-title">Owner Key</div>
      <div class="access-key-section-count">${escapeHtml(state.accessKeysAuth?.source || "configured")}</div>
    </div>
    <article class="access-key-web owner-key-card">
      <div>
        <div class="access-key-row-title">Hermes Mobile Owner Key</div>
        <div class="access-key-row-meta">管理员入口 Key</div>
      </div>
      <button type="button" data-rotate-web-key${state.accessKeysAuth?.canRotateGlobal === false ? " disabled" : ""}>更换</button>
      ${generatedAccessKeyBlock({ kind: "owner" })}
    </article>
  </section>` : "";
  const workspaceCreateForm = isOwnerAccessManager ? `<details class="access-key-section access-key-create-section" data-workspace-config-section>
    <summary class="access-key-section-summary">
      <span>新建 / 编辑本地账号</span>
      <span>本地工作区</span>
    </summary>
    <section class="access-key-create-workspace">
      <div class="access-key-row-title">创建 / 配置用户工作区</div>
      <div class="workspace-create-help">先填用户名，显示名、根目录和访问目录会自动预填。</div>
      <div class="access-key-create-grid">
        <label>
          <span>用户名</span>
          <input id="newWorkspaceId" type="text" autocomplete="off" placeholder="zhangsan / 张三">
        </label>
        <label>
          <span>显示名</span>
          <input id="newWorkspaceLabel" type="text" autocomplete="off" placeholder="自动生成">
        </label>
        <label class="workspace-create-full">
          <span>根目录</span>
          <input id="newWorkspaceRoot" type="text" autocomplete="off" placeholder="自动生成，可修改">
        </label>
      </div>
      <div id="newWorkspaceDefaultsHint" class="workspace-create-hint"></div>
      <label class="workspace-create-field">
        <span>允许访问目录</span>
        <textarea id="newWorkspaceAllowedRoots" rows="3" placeholder="默认使用根目录；每行一个"></textarea>
      </label>
      <label class="workspace-create-field">
        <span>额外接口 / toolsets</span>
        <input id="newWorkspaceToolsets" type="text" autocomplete="off" placeholder="可留空，逗号分隔">
      </label>
      <button type="button" data-create-workspace>保存工作区</button>
    </section>
  </details>` : "";
  const localWorkspaceSection = renderWorkspaceSection("本地用户", localWorkspaces, { editable: true });
  const deploymentWorkspaceSection = renderWorkspaceSection("部署账号", deploymentWorkspaces, { editable: false });
  const workspaceAdminList = isOwnerAccessManager
    ? `${localWorkspaceSection}
       ${workspaceCreateForm}
       ${deploymentWorkspaceSection}
       ${!localWorkspaces.length && !deploymentWorkspaces.length ? `<section class="access-key-section"><div class="access-key-empty">还没有可管理的账号。</div></section>` : ""}
       ${orphanKeySection}`
    : `<section class="access-key-section"><div class="access-key-list">${accessKeys.map((item) => {
      const updated = item.updatedAt ? formatTime(item.updatedAt) : "";
      return `<article class="access-key-row">
        <div class="access-key-row-main">
          <div class="access-key-row-title">${escapeHtml(item.workspaceLabel || item.workspaceId)}</div>
          <div class="access-key-row-meta">${escapeHtml(item.workspaceId || "")}${updated ? ` · ${escapeHtml(updated)}` : ""}</div>
        </div>
        <div class="access-key-row-state">${item.hasKey ? "已生成" : "未生成"}</div>
        <button type="button" data-generate-workspace-key="${escapeHtml(item.workspaceId || "")}">${item.hasKey ? "更换 Key" : "生成 Key"}</button>
        ${item.hasKey ? `<button type="button" data-revoke-workspace-key="${escapeHtml(item.workspaceId || "")}">撤销</button>` : ""}
        ${generatedAccessKeyBlock({ kind: "workspace", workspaceId: item.workspaceId || "" })}
      </article>`;
    }).join("")}</div></section>`;
  const subtitle = isOwnerAccessManager
    ? "账号、根目录、接口和登录 Key"
    : "只能查看并更换当前账号的 Hermes Mobile 登录 Key。";

  overlay.innerHTML = `
    <div class="access-key-sheet owner-admin-sheet">
      <header class="access-key-header">
        <div>
          <div id="accessKeyTitle" class="access-key-title">${isOwnerAccessManager ? "Owner 管理" : "Access Key"}</div>
          <div class="access-key-subtitle">${escapeHtml(subtitle)}</div>
        </div>
        <button class="access-key-close" type="button" data-close-access-keys>完成</button>
      </header>
      ${loadingBlock}
      ${errorBlock}
      ${ownerKeySection}
      ${workspaceAdminList}
      ${fallbackGenerated}
    </div>`;

  overlay.querySelector("[data-close-access-keys]")?.addEventListener("click", closeAccessKeyManager);
  overlay.querySelector("[data-rotate-web-key]")?.addEventListener("click", () => rotateWebAccessKey().catch(showError));
  overlay.querySelector("[data-create-workspace]")?.addEventListener("click", () => createWorkspaceFromAccessKeyManager().catch(showError));
  wireWorkspaceCreateDefaults(overlay);
  overlay.querySelector("[data-copy-access-key]")?.addEventListener("click", () => copyTextToClipboard(state.generatedAccessKey?.key || "").catch(showError));
  overlay.querySelector("[data-relogin-after-access-key]")?.addEventListener("click", () => finishAccessKeyRelogin());
  const generatedNode = overlay.querySelector("[data-generated-access-key]");
  if (generatedNode && state.generatedAccessKey?.focus) {
    state.generatedAccessKey.focus = false;
    window.requestAnimationFrame(() => {
      generatedNode.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }
  overlay.querySelectorAll("[data-edit-workspace]").forEach((button) => {
    button.addEventListener("click", () => fillWorkspaceConfigForm(button.dataset.editWorkspace || ""));
  });
  overlay.querySelectorAll("[data-delete-workspace]").forEach((button) => {
    button.addEventListener("click", () => deleteWorkspaceFromAccessKeyManager(button.dataset.deleteWorkspace || "").catch(showError));
  });
  overlay.querySelectorAll("[data-generate-workspace-key]").forEach((button) => {
    button.addEventListener("click", () => generateWorkspaceAccessKey(button.dataset.generateWorkspaceKey).catch(showError));
  });
  overlay.querySelectorAll("[data-revoke-workspace-key]").forEach((button) => {
    button.addEventListener("click", () => revokeWorkspaceAccessKey(button.dataset.revokeWorkspaceKey || "").catch(showError));
  });
}

async function loadAccessKeyManager(options = {}) {
  state.accessKeyWorkspaceId = options.workspaceId || state.accessKeyWorkspaceId || state.selectedWorkspaceId || state.auth?.workspaceId || "";
  state.accessKeysLoading = true;
  state.accessKeysError = "";
  if (!options.keepGenerated) state.generatedAccessKey = null;
  renderAccessKeyManager();
  try {
    const params = new URLSearchParams();
    const requestAllWorkspaceKeys = String(state.accessKeyWorkspaceId || "") === "owner";
    if (state.accessKeyWorkspaceId && !requestAllWorkspaceKeys) params.set("workspaceId", state.accessKeyWorkspaceId);
    const query = params.toString();
    const result = await api(`/api/access-keys${query ? `?${query}` : ""}`);
    const showAllOwnerKeys = Boolean(result.auth?.isOwner && requestAllWorkspaceKeys);
    state.accessKeys = (result.data || []).filter((item) => showAllOwnerKeys || !state.accessKeyWorkspaceId || item.workspaceId === state.accessKeyWorkspaceId);
    state.accessKeysAuth = result.auth || null;
  } catch (err) {
    state.accessKeysError = err.message || String(err);
  } finally {
    state.accessKeysLoading = false;
    renderAccessKeyManager();
  }
}

async function openAccessKeyManager(options = {}) {
  closeTopMoreMenu();
  closeSidebar();
  if (!state.auth?.isOwner) {
    showError(new Error("Owner access is required"));
    return;
  }
  if ((options.workspaceId || state.selectedWorkspaceId || "") !== "owner") {
    showError(new Error("Switch to Owner workspace to manage Access Keys"));
    return;
  }
  state.accessKeyManagerOpen = true;
  await loadAccessKeyManager({ workspaceId: "owner" });
}

function fillWorkspaceConfigForm(workspaceId) {
  const workspace = (state.workspaces || []).find((item) => item.id === workspaceId);
  if (!workspace) return;
  const configSection = $("accessKeyOverlay")?.querySelector("[data-workspace-config-section]");
  if (configSection) configSection.open = true;
  const localConfig = workspace.localConfig || {};
  const inputs = workspaceCreateInputs();
  if (inputs.id) {
    inputs.id.value = workspace.id || "";
    inputs.id.dataset.manual = "1";
  }
  if (inputs.label) {
    inputs.label.value = workspace.label || workspace.id || "";
    inputs.label.dataset.manual = "1";
  }
  if (inputs.root) {
    inputs.root.value = localConfig.defaultWorkspace || workspace.defaultWorkspace || "";
    inputs.root.dataset.manual = "1";
  }
  if (inputs.allowedRoots) {
    inputs.allowedRoots.value = joinConfigList(localConfig.allowedRoots || []);
    inputs.allowedRoots.dataset.manual = "1";
  }
  if (inputs.toolsets) {
    inputs.toolsets.value = splitConfigList(localConfig.allowedToolsets || workspace.bindings?.allowedToolsets || []).join(", ");
    inputs.toolsets.dataset.manual = "1";
  }
  const hint = $("newWorkspaceDefaultsHint");
  if (hint) hint.textContent = workspace.id ? `ID: ${workspace.id}` : "";
  window.requestAnimationFrame(() => {
    configSection?.scrollIntoView({ block: "start", behavior: "smooth" });
    $("newWorkspaceLabel")?.focus();
  });
}

async function createWorkspaceFromAccessKeyManager() {
  const workspaceId = $("newWorkspaceId")?.value?.trim() || "";
  const label = $("newWorkspaceLabel")?.value?.trim() || workspaceId;
  const defaultWorkspace = $("newWorkspaceRoot")?.value?.trim() || "";
  const allowedRoots = splitConfigList($("newWorkspaceAllowedRoots")?.value || "");
  const allowedToolsets = splitConfigList($("newWorkspaceToolsets")?.value || "");
  if (!workspaceId) throw new Error("请输入用户 ID");
  const result = await api("/api/workspaces", {
    method: "POST",
    body: JSON.stringify({ workspaceId, label, defaultWorkspace, allowedRoots, allowedToolsets }),
  });
  const createdId = result.workspace?.id || workspaceId;
  state.selectedWorkspaceId = createdId;
  localStorage.setItem("hermesWebWorkspace", createdId);
  await loadWorkspaces();
  await loadProjects();
  await loadAccessKeyManager({ workspaceId: createdId });
}

async function deleteWorkspaceFromAccessKeyManager(workspaceId) {
  const workspace = (state.workspaces || []).find((item) => item.id === workspaceId);
  if (!workspace || workspace.source !== "local-workspace") return;
  const label = workspace.label || workspace.id;
  if (!window.confirm(`删除本地用户工作区 ${label}？该账号的 Workspace Access Key 也会撤销。历史消息不会被删除。`)) return;
  await api(`/api/workspaces/${encodeURIComponent(workspace.id)}`, { method: "DELETE" });
  if (state.selectedWorkspaceId === workspace.id) {
    state.selectedWorkspaceId = "owner";
    localStorage.setItem("hermesWebWorkspace", "owner");
  }
  if (state.accessKeyWorkspaceId === workspace.id) state.accessKeyWorkspaceId = state.selectedWorkspaceId;
  await loadWorkspaces();
  await loadProjects();
  await loadAccessKeyManager({ workspaceId: state.accessKeyWorkspaceId || state.selectedWorkspaceId || "owner" });
}

function closeAccessKeyManager() {
  const requiresLogin = state.accessKeyRequiresLogin;
  state.accessKeyManagerOpen = false;
  state.accessKeysError = "";
  state.generatedAccessKey = null;
  state.accessKeyRequiresLogin = false;
  renderAccessKeyManager();
  if (requiresLogin) showLogin("Access Key 已更新，请输入新 key。");
}

function finishAccessKeyRelogin() {
  state.accessKeyManagerOpen = false;
  state.accessKeysError = "";
  state.generatedAccessKey = null;
  state.accessKeyRequiresLogin = false;
  renderAccessKeyManager();
  showLogin("Access Key 已更新，请输入新 key。");
}

async function generateWorkspaceAccessKey(workspaceId) {
  const target = (state.accessKeys || []).find((item) => item.workspaceId === workspaceId);
  const label = target?.workspaceLabel || workspaceId || "workspace";
  if (!workspaceId) return;
  if (target?.hasKey && !window.confirm(`更换 ${label} 的 Hermes Mobile Access Key？旧 key 会立即失效。`)) return;
  const result = await api("/api/access-keys/workspace", {
    method: "POST",
    body: JSON.stringify({ workspaceId }),
  });
  state.generatedAccessKey = {
    kind: "workspace",
    key: result.key || "",
    label: `${label} Hermes Mobile Access Key`,
    workspaceId,
    focus: true,
  };
  if (result.requiresReLogin) {
    state.accessKeyRequiresLogin = true;
    clearStoredAccessKey();
    renderAccessKeyManager();
    return;
  }
  await loadAccessKeyManager({ keepGenerated: true, workspaceId: state.accessKeyWorkspaceId || workspaceId });
}

async function revokeWorkspaceAccessKey(workspaceId) {
  const target = (state.accessKeys || []).find((item) => item.workspaceId === workspaceId);
  const label = target?.workspaceLabel || workspaceId || "workspace";
  if (!workspaceId || !target?.hasKey) return;
  if (!window.confirm(`撤销 ${label} 的 Hermes Mobile Access Key？该账号会在下次请求时需要重新登录。`)) return;
  const result = await api(`/api/access-keys/workspace/${encodeURIComponent(workspaceId)}`, {
    method: "DELETE",
    body: JSON.stringify({}),
  });
  if (result.requiresReLogin) {
    state.accessKeyRequiresLogin = true;
    clearStoredAccessKey();
    renderAccessKeyManager();
    return;
  }
  await loadAccessKeyManager({ workspaceId: state.accessKeyWorkspaceId || workspaceId });
}

async function rotateWebAccessKey() {
  if (!window.confirm("更换 Hermes Mobile Owner Access Key？旧 Owner key 会立即失效。")) return;
  const result = await api("/api/access-keys/web", { method: "POST", body: JSON.stringify({}) });
  storeAccessKey(result.key || "");
  state.generatedAccessKey = {
    kind: "owner",
    key: result.key || "",
    label: "Hermes Mobile Owner Access Key",
    workspaceId: "owner",
    focus: true,
  };
  state.accessKeyRequiresLogin = false;
  renderAccessKeyManager();
  if (result.key) copyTextToClipboard(result.key).catch(() => {});
}

async function copyTextToClipboard(text) {
  const value = String(text || "");
  if (!value) return;
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
  } else {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  showPushToast("已复制到剪贴板", "success");
}

function messageShareText(message) {
  if (!message) return "";
  const content = cleanDisplayText(rewriteDirectoryPathsForDisplay(message.content || ""));
  const error = message.error ? `Error: ${message.error}` : "";
  const artifacts = Array.isArray(message.artifacts)
    ? message.artifacts
      .map((artifact) => String(artifact?.name || artifact?.id || "").trim())
      .filter(Boolean)
    : [];
  const artifactText = artifacts.length ? `Attachments:\n${artifacts.map((name) => `- ${name}`).join("\n")}` : "";
  return [content, error, artifactText].filter(Boolean).join("\n\n").trim();
}

async function copyMessageContent(messageId) {
  const message = currentMessageById(messageId);
  if (!message) throw new Error("Message not found");
  const text = messageShareText(message);
  if (!text) throw new Error("Message has no copyable content");
  await copyTextToClipboard(text);
}

function messageShareTitle(message) {
  if (!message) return "Hermes Mobile";
  if (message.taskGroupId && !isSingleWindowConversationTaskGroupId(message.taskGroupId)) {
    return `Hermes Mobile - ${shortTaskDisplayId(messageTaskDisplayId(message))}`;
  }
  return "Hermes Mobile";
}

function stripInlineMarkdownForShare(value) {
  return String(value || "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function shareImageBlocksFromText(text) {
  const blocks = [];
  const lines = String(text || "").split(/\r?\n/);
  let paragraph = [];
  let codeLines = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: stripInlineMarkdownForShare(paragraph.join(" ")) });
    paragraph = [];
  };
  const pushTextBlock = (type, value, extra = {}) => {
    const textValue = stripInlineMarkdownForShare(value);
    if (textValue) blocks.push(Object.assign({ type, text: textValue }, extra));
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, "");
    const trimmed = line.trim();

    if (codeLines) {
      if (/^```/.test(trimmed)) {
        blocks.push({ type: "code", text: codeLines.join("\n").trimEnd() });
        codeLines = null;
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (/^```/.test(trimmed)) {
      flushParagraph();
      codeLines = [];
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      pushTextBlock("heading", heading[2], { level: heading[1].length });
      continue;
    }

    const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      pushTextBlock("list", bullet[1], { marker: "-" });
      continue;
    }

    const numbered = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      pushTextBlock("list", numbered[2], { marker: `${numbered[1]}.` });
      continue;
    }

    const quote = trimmed.match(/^>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      pushTextBlock("quote", quote[1]);
      continue;
    }

    if (/^\|.+\|$/.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: "code", text: trimmed });
      continue;
    }

    paragraph.push(trimmed);
  }
  if (codeLines) blocks.push({ type: "code", text: codeLines.join("\n").trimEnd() });
  flushParagraph();
  return blocks.length ? blocks : [{ type: "paragraph", text: "No content." }];
}

function wrapCanvasText(ctx, text, maxWidth) {
  const lines = [];
  for (const sourceLine of String(text || "").split(/\r?\n/)) {
    const chars = Array.from(sourceLine);
    let line = "";
    for (const char of chars) {
      const next = `${line}${char}`;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line.trimEnd());
        line = char.trimStart();
      } else {
        line = next;
      }
    }
    if (line) lines.push(line.trimEnd());
    else if (!chars.length) lines.push("");
  }
  return lines;
}

function setShareImageFont(ctx, size, weight = 400, family = "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", \"PingFang SC\", \"Aptos\", \"Microsoft YaHei UI\", \"Microsoft YaHei\", \"Segoe UI\", sans-serif") {
  ctx.font = `${weight} ${size}px ${family}`;
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, width, height, radius, fillStyle) {
  ctx.fillStyle = fillStyle;
  roundRectPath(ctx, x, y, width, height, radius);
  ctx.fill();
}

function layoutShareImage(ctx, message, text) {
  const width = SHARE_IMAGE_WIDTH;
  const margin = 96;
  const contentWidth = width - margin * 2;
  const items = [];
  let y = 72;
  const title = messageShareTitle(message);
  const meta = [messageDisplayTimeLabel(message), state.currentThread?.title || ""].filter(Boolean).join(" - ");

  setShareImageFont(ctx, 36, 800);
  items.push({ type: "brand", x: margin, y, text: "Hermes Mobile", size: 36, weight: 800 });
  y += 58;
  setShareImageFont(ctx, 62, 760);
  const titleLines = wrapCanvasText(ctx, title, contentWidth);
  items.push({ type: "text", x: margin, y, lines: titleLines, size: 62, weight: 760, lineHeight: 76, color: "#142027" });
  y += titleLines.length * 76 + 18;
  if (meta) {
    setShareImageFont(ctx, 34, 500);
    const metaLines = wrapCanvasText(ctx, meta, contentWidth);
    items.push({ type: "text", x: margin, y, lines: metaLines, size: 34, weight: 500, lineHeight: 46, color: "#6f6a5f" });
    y += metaLines.length * 46 + 32;
  }
  items.push({ type: "rule", x: margin, y, width: contentWidth });
  y += 48;

  for (const block of shareImageBlocksFromText(text)) {
    if (block.type === "heading") {
      const size = block.level <= 1 ? 64 : block.level === 2 ? 58 : 54;
      const lineHeight = block.level <= 1 ? 84 : block.level === 2 ? 78 : 74;
      setShareImageFont(ctx, size, 780);
      const lines = wrapCanvasText(ctx, block.text, contentWidth);
      items.push({ type: "text", x: margin, y, lines, size, weight: 780, lineHeight, color: "#182833" });
      y += lines.length * lineHeight + 28;
    } else if (block.type === "list") {
      setShareImageFont(ctx, 52, 500);
      const markerWidth = 66;
      const lines = wrapCanvasText(ctx, block.text, contentWidth - markerWidth);
      items.push({ type: "list", x: margin, y, marker: block.marker || "-", lines, size: 52, weight: 500, lineHeight: 80, markerWidth, color: "#182833" });
      y += lines.length * 80 + 14;
    } else if (block.type === "quote") {
      setShareImageFont(ctx, 48, 500);
      const lines = wrapCanvasText(ctx, block.text, contentWidth - 68);
      const height = lines.length * 74 + 42;
      items.push({ type: "quote", x: margin, y, width: contentWidth, height, lines, size: 48, weight: 500, lineHeight: 74, color: "#374742" });
      y += height + 28;
    } else if (block.type === "code") {
      setShareImageFont(ctx, 40, 500, "\"Cascadia Mono\", Consolas, monospace");
      const lines = wrapCanvasText(ctx, block.text, contentWidth - 56);
      const height = lines.length * 58 + 44;
      items.push({ type: "code", x: margin, y, width: contentWidth, height, lines, size: 40, weight: 500, lineHeight: 58, color: "#22302d" });
      y += height + 28;
    } else {
      setShareImageFont(ctx, 54, 500);
      const lines = wrapCanvasText(ctx, block.text, contentWidth);
      items.push({ type: "text", x: margin, y, lines, size: 54, weight: 500, lineHeight: 84, color: "#182833" });
      y += lines.length * 84 + 30;
    }
  }

  y += 32;
  items.push({ type: "footer", x: margin, y, text: "Shared from Hermes Mobile", size: 30, weight: 500 });
  y += 72;
  return { width, height: Math.max(640, Math.ceil(y)), items };
}

function drawShareImage(ctx, layout) {
  ctx.fillStyle = "#f4efe6";
  ctx.fillRect(0, 0, layout.width, layout.height);
  fillRoundRect(ctx, 28, 28, layout.width - 56, layout.height - 56, 24, "rgba(255, 252, 246, 0.84)");
  ctx.strokeStyle = "rgba(95, 83, 63, 0.12)";
  ctx.lineWidth = 2;
  roundRectPath(ctx, 28, 28, layout.width - 56, layout.height - 56, 24);
  ctx.stroke();

  for (const item of layout.items) {
    if (item.type === "brand") {
      setShareImageFont(ctx, item.size, item.weight);
      ctx.fillStyle = "#876f3c";
      ctx.fillText(item.text, item.x, item.y + item.size);
      continue;
    }
    if (item.type === "rule") {
      ctx.strokeStyle = "rgba(135, 111, 60, 0.24)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(item.x, item.y);
      ctx.lineTo(item.x + item.width, item.y);
      ctx.stroke();
      continue;
    }
    if (item.type === "footer") {
      setShareImageFont(ctx, item.size, item.weight);
      ctx.fillStyle = "#8a8478";
      ctx.fillText(item.text, item.x, item.y + item.size);
      continue;
    }
    if (item.type === "quote") {
      fillRoundRect(ctx, item.x, item.y, item.width, item.height, 18, "rgba(235, 229, 216, 0.72)");
      ctx.fillStyle = "#b28b47";
      ctx.fillRect(item.x + 20, item.y + 18, 5, item.height - 36);
      setShareImageFont(ctx, item.size, item.weight);
      ctx.fillStyle = item.color;
      item.lines.forEach((line, index) => ctx.fillText(line, item.x + 44, item.y + 24 + item.lineHeight * (index + 0.75)));
      continue;
    }
    if (item.type === "code") {
      fillRoundRect(ctx, item.x, item.y, item.width, item.height, 18, "rgba(226, 231, 225, 0.82)");
      setShareImageFont(ctx, item.size, item.weight, "\"Cascadia Mono\", Consolas, monospace");
      ctx.fillStyle = item.color;
      item.lines.forEach((line, index) => ctx.fillText(line, item.x + 22, item.y + 18 + item.lineHeight * (index + 0.78)));
      continue;
    }
    if (item.type === "list") {
      setShareImageFont(ctx, item.size, item.weight);
      ctx.fillStyle = "#876f3c";
      ctx.fillText(item.marker, item.x, item.y + item.lineHeight * 0.78);
      ctx.fillStyle = item.color;
      item.lines.forEach((line, index) => ctx.fillText(line, item.x + item.markerWidth, item.y + item.lineHeight * (index + 0.78)));
      continue;
    }
    setShareImageFont(ctx, item.size, item.weight);
    ctx.fillStyle = item.color;
    item.lines.forEach((line, index) => ctx.fillText(line, item.x, item.y + item.lineHeight * (index + 0.78)));
  }
}

function canvasToBlob(canvas, type = "image/png") {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not render image"));
    }, type);
  });
}

function shareImageRenderScale(layout) {
  const width = Math.max(1, Number(layout?.width || 1));
  const height = Math.max(1, Number(layout?.height || 1));
  const maxByPixels = Math.sqrt(SHARE_IMAGE_MAX_PIXELS / (width * height));
  const maxByDimension = Math.min(SHARE_IMAGE_MAX_DIMENSION / width, SHARE_IMAGE_MAX_DIMENSION / height);
  return Math.max(1, Math.min(SHARE_IMAGE_SCALE, maxByPixels, maxByDimension));
}

async function renderMessageShareImageBlob(message) {
  const text = messageShareText(message);
  if (!text) throw new Error("Message has no image content");
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  const layout = layoutShareImage(measureCtx, message, text);
  if (layout.height > 30000) throw new Error("Reply is too long for one image");
  const scale = shareImageRenderScale(layout);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(layout.width * scale);
  canvas.height = Math.ceil(layout.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  drawShareImage(ctx, layout);
  return canvasToBlob(canvas, "image/png");
}

async function copyImageBlobToClipboard(blob) {
  if (!navigator.clipboard?.write || !window.ClipboardItem || !window.isSecureContext) return false;
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  showPushToast("\u56fe\u7247\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f", "success");
  return true;
}

function openImageBlobPreview(blob) {
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener");
  window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  if (!opened) throw new Error("Could not open image preview");
  showPushToast("\u5df2\u751f\u6210\u56fe\u7247\u9884\u89c8", "success");
}

async function shareMessageImage(messageId) {
  const message = currentMessageById(messageId);
  if (!message) throw new Error("Message not found");
  const blob = await renderMessageShareImageBlob(message);
  const title = messageShareTitle(message);
  if (typeof File !== "undefined" && navigator.share && navigator.canShare) {
    const file = new File([blob], `hermes-reply-${Date.now().toString(36)}.png`, { type: "image/png" });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return;
    }
  }
  if (await copyImageBlobToClipboard(blob)) return;
  openImageBlobPreview(blob);
}

function isDraftThread(thread) {
  return Boolean(thread?.draft || String(thread?.id || "").startsWith("draft_"));
}

function createDraftThread() {
  const now = new Date().toISOString();
  state.draftThreadSeq += 1;
  return {
    id: `draft_${Date.now()}_${state.draftThreadSeq}`,
    title: "New thread",
    workspaceId: state.selectedWorkspaceId,
    projectId: state.selectedProjectId,
    subprojectId: state.selectedSubprojectId || "",
    singleWindow: false,
    draft: true,
    hermesSessionId: "",
    status: "draft",
    activeRunId: null,
    activeRunIds: [],
    createdAt: now,
    updatedAt: now,
    messages: [],
    events: [],
    preview: "",
  };
}

async function materializeCurrentThread() {
  if (!isDraftThread(state.currentThread)) return state.currentThread;
  const result = await api("/api/threads", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: state.currentThread.workspaceId,
      projectId: state.currentThread.projectId,
      subprojectId: state.currentThread.subprojectId || "",
      title: state.currentThread.title || "New thread",
    }),
  });
  const draftId = state.currentThread.id;
  state.currentThread = result.thread;
  state.currentThreadId = result.thread.id;
  state.threads = state.threads.map((thread) => thread.id === draftId ? summarizeThread(result.thread) : thread);
  if (!state.threads.some((thread) => thread.id === result.thread.id)) state.threads.unshift(summarizeThread(result.thread));
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  return state.currentThread;
}

function isSharedProject(project) {
  const source = String(project?.source || "");
  return Boolean(project?.shared || source === "shared-allowed-root" || source.startsWith("shared-allowed-root-"));
}
