"use strict";

const WORKSPACE_ONBOARDING_PLUGIN_OPTIONS = Object.freeze([
  { id: "wardrobe", label: "配衣服" },
  { id: "health", label: "健康" },
  { id: "finance", label: "财务" },
  { id: "email", label: "邮件" },
  { id: "note", label: "笔记" },
  { id: "growth", label: "成长" },
]);

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
    return `<section class="access-key-result" data-generated-access-key data-generated-workspace="${escapeHtml(generatedWorkspaceId)}" tabindex="-1">
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
    : "只能查看并更换当前账号的 Home AI 登录 key。";
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
          <div class="access-key-row-title">Home AI Owner Key</div>
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
      generatedNode.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
    return `<section class="access-key-result" data-generated-access-key data-generated-workspace="${escapeHtml(generatedWorkspaceId)}" tabindex="-1">
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

  const onboardingDraft = state.workspaceOnboardingDraft || state.workspaceOnboardingResult || state.workspaceOnboardingPlan || {};
  const onboardingPluginIds = new Set(
    Array.isArray(onboardingDraft.pluginIds) && onboardingDraft.pluginIds.length
      ? onboardingDraft.pluginIds
      : WORKSPACE_ONBOARDING_PLUGIN_OPTIONS.map((item) => item.id),
  );
  const onboardingStatusLabel = (status) => ({
    planned: "计划中",
    pending: "等待回执",
    running: "执行中",
    ok: "完成",
    failed: "失败",
    blocked: "阻断",
    manual_required: "需人工处理",
    skipped: "已跳过",
  }[status] || status || "未知");
  const onboardingStatusTone = (status) => {
    if (status === "ok") return "ok";
    if (status === "failed" || status === "blocked") return "failed";
    if (status === "manual_required") return "manual";
    if (status === "running") return "running";
    return "pending";
  };
  const renderOnboardingEvidence = (value) => {
    if (!value || typeof value !== "object") return "";
    const steps = Array.isArray(value.steps) ? value.steps : [];
    const paths = value.paths && typeof value.paths === "object" ? value.paths : {};
    const pluginIds = Array.isArray(value.pluginIds) ? value.pluginIds : [];
    const evidenceTitle = value.status === "running"
      ? "开通运行中"
      : state.workspaceOnboardingResult ? "开通结果" : "开通计划";
    return `<section class="workspace-onboarding-result" data-workspace-onboarding-status="${escapeHtml(value.status || "")}">
      <div class="workspace-onboarding-result-head">
        <div>
          <div class="access-key-row-title">${escapeHtml(evidenceTitle)}</div>
          <div class="access-key-row-meta">${escapeHtml(value.workspaceId || "")}${value.macUser ? ` · ${escapeHtml(value.macUser)}` : ""}</div>
        </div>
        <span class="workspace-onboarding-status ${onboardingStatusTone(value.status)}">${escapeHtml(onboardingStatusLabel(value.status))}</span>
      </div>
      ${value.progressMessage ? `<div class="workspace-onboarding-progress">${escapeHtml(value.progressMessage)}</div>` : ""}
      ${value.error ? `<div class="workspace-onboarding-error">${escapeHtml(value.error)}</div>` : ""}
      <dl class="workspace-onboarding-facts">
        ${value.displayName ? `<div><dt>显示名</dt><dd>${escapeHtml(value.displayName)}</dd></div>` : ""}
        ${pluginIds.length ? `<div><dt>插件</dt><dd>${escapeHtml(pluginIds.join(", "))}</dd></div>` : ""}
        ${paths.workspaceDataRoot ? `<div><dt>数据目录</dt><dd>${escapeHtml(paths.workspaceDataRoot)}</dd></div>` : ""}
        ${paths.workerWorkspaceRoot ? `<div><dt>工作目录</dt><dd>${escapeHtml(paths.workerWorkspaceRoot)}</dd></div>` : ""}
      </dl>
      ${steps.length ? `<ol class="workspace-onboarding-steps">
        ${steps.map((step) => `<li class="workspace-onboarding-step ${onboardingStatusTone(step.status)}">
          <span>${escapeHtml(step.id || "")}</span>
          <strong>${escapeHtml(onboardingStatusLabel(step.status))}</strong>
          ${step.progressHint ? `<small>${escapeHtml(step.progressHint)}</small>` : ""}
          ${step.error ? `<em>${escapeHtml(step.error)}</em>` : ""}
        </li>`).join("")}
      </ol>` : ""}
    </section>`;
  };
  const workspaceOnboardingSection = isOwnerAccessManager ? `<details class="access-key-section workspace-onboarding-section" data-workspace-onboarding-section open>
    <summary class="access-key-section-summary">
      <span>创建家人工作区</span>
      <span>Mac 开通</span>
    </summary>
    <section class="access-key-create-workspace workspace-onboarding-panel">
      <div class="access-key-row-title">Owner 工作区开通</div>
      <div class="workspace-create-help">先预览计划，确认后再创建 Mac 用户、Gateway profiles、插件绑定和一次性 Home AI Access Key。</div>
      <div class="access-key-create-grid">
        <label>
          <span>工作区 ID</span>
          <input id="workspaceOnboardingWorkspaceId" type="text" autocomplete="off" placeholder="liyushuang" value="${escapeHtml(onboardingDraft.workspaceId || "")}">
        </label>
        <label>
          <span>显示名</span>
          <input id="workspaceOnboardingDisplayName" type="text" autocomplete="off" placeholder="李玉双" value="${escapeHtml(onboardingDraft.displayName || onboardingDraft.label || "")}">
        </label>
      </div>
      <fieldset class="workspace-onboarding-plugins">
        <legend>插件</legend>
        ${WORKSPACE_ONBOARDING_PLUGIN_OPTIONS.map((item) => `<label class="workspace-onboarding-plugin">
          <input type="checkbox" name="workspaceOnboardingPlugin" value="${escapeHtml(item.id)}"${onboardingPluginIds.has(item.id) ? " checked" : ""}>
          <span>${escapeHtml(item.label)}</span>
        </label>`).join("")}
      </fieldset>
      <div class="workspace-onboarding-actions">
        <button type="button" data-workspace-onboarding-plan${state.workspaceOnboardingLoading ? " disabled" : ""}>预览计划</button>
        <button type="button" data-workspace-onboarding-apply${state.workspaceOnboardingLoading ? " disabled" : ""}>确认开通</button>
      </div>
      ${state.workspaceOnboardingLoading ? `<div class="access-key-empty">请求已发送，正在等待后端回执...</div>` : ""}
      ${state.workspaceOnboardingError ? `<div class="access-key-empty error">${escapeHtml(state.workspaceOnboardingError)}</div>` : ""}
      ${renderOnboardingEvidence(state.workspaceOnboardingResult || state.workspaceOnboardingRun || state.workspaceOnboardingPlan)}
    </section>
  </details>` : "";

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
        <div class="access-key-row-title">Home AI Owner Key</div>
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
    ? `${workspaceOnboardingSection}
       ${localWorkspaceSection}
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
    : "只能查看并更换当前账号的 Home AI 登录 Key。";

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
  overlay.querySelector("[data-workspace-onboarding-plan]")?.addEventListener("click", () => planWorkspaceOnboardingFromAccessKeyManager().catch(showError));
  overlay.querySelector("[data-workspace-onboarding-apply]")?.addEventListener("click", () => applyWorkspaceOnboardingFromAccessKeyManager().catch(showError));
  wireWorkspaceCreateDefaults(overlay);
  overlay.querySelector("[data-copy-access-key]")?.addEventListener("click", () => copyTextToClipboard(state.generatedAccessKey?.key || "").catch(showError));
  overlay.querySelector("[data-relogin-after-access-key]")?.addEventListener("click", () => finishAccessKeyRelogin());
  const generatedNode = overlay.querySelector("[data-generated-access-key]");
  if (generatedNode && state.generatedAccessKey?.focus) {
    state.generatedAccessKey.focus = false;
    window.requestAnimationFrame(() => {
      generatedNode.scrollIntoView({ block: "nearest", behavior: "smooth" });
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

function workspaceOnboardingInputs(root = document) {
  return {
    workspaceId: root.querySelector?.("#workspaceOnboardingWorkspaceId") || null,
    displayName: root.querySelector?.("#workspaceOnboardingDisplayName") || null,
    plugins: [...(root.querySelectorAll?.('input[name="workspaceOnboardingPlugin"]:checked') || [])],
  };
}

function workspaceOnboardingPayload(root = document) {
  const inputs = workspaceOnboardingInputs(root);
  const rawWorkspaceId = inputs.workspaceId?.value?.trim() || "";
  const workspaceId = slugWorkspaceOnboardingId(rawWorkspaceId);
  const displayName = inputs.displayName?.value?.trim() || rawWorkspaceId || workspaceId;
  const pluginIds = inputs.plugins.map((input) => input.value).filter(Boolean);
  if (!workspaceId) throw new Error("请输入工作区 ID");
  return {
    workspaceId,
    displayName,
    label: displayName,
    pluginIds,
    runSmokes: true,
  };
}

function slugWorkspaceOnboardingId(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function rememberWorkspaceOnboardingDraft(payload = {}) {
  state.workspaceOnboardingDraft = {
    workspaceId: payload.workspaceId || "",
    displayName: payload.displayName || payload.label || payload.workspaceId || "",
    pluginIds: Array.isArray(payload.pluginIds) ? payload.pluginIds : [],
  };
}

function workspaceOnboardingPlanMatchesPayload(plan = {}, payload = {}) {
  const planPlugins = Array.isArray(plan.pluginIds) ? plan.pluginIds : [];
  const payloadPlugins = Array.isArray(payload.pluginIds) ? payload.pluginIds : [];
  return String(plan.workspaceId || "") === String(payload.workspaceId || "")
    && String(plan.displayName || plan.label || plan.workspaceId || "") === String(payload.displayName || payload.label || payload.workspaceId || "")
    && planPlugins.length === payloadPlugins.length
    && planPlugins.every((pluginId, index) => pluginId === payloadPlugins[index]);
}

function createWorkspaceOnboardingRunState(plan = {}, payload = {}) {
  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  return {
    ok: false,
    status: "running",
    workspaceId: payload.workspaceId || plan.workspaceId || "",
    displayName: payload.displayName || plan.displayName || payload.workspaceId || "",
    macUser: plan.macUser || "",
    paths: plan.paths || {},
    pluginIds: Array.isArray(payload.pluginIds) ? payload.pluginIds : Array.isArray(plan.pluginIds) ? plan.pluginIds : [],
    progressMessage: "请求已发送，后端会按下面步骤顺序执行；完成后会显示每一步真实结果。",
    steps: steps.map((step, index) => Object.assign({}, step, {
      status: index === 0 ? "running" : "pending",
      progressHint: index === 0 ? "已开始" : "等待后端回执",
    })),
  };
}

function failWorkspaceOnboardingRunState(run = {}, error = "") {
  const activeRun = run && typeof run === "object" ? run : {};
  const message = error || "工作区开通请求失败";
  const steps = Array.isArray(activeRun.steps) ? activeRun.steps : [];
  return Object.assign({}, activeRun, {
    status: "failed",
    error: message,
    progressMessage: "请求未完成，请查看错误信息后重试。",
    steps: steps.map((step) => step.status === "running" ? Object.assign({}, step, { status: "failed", error: message }) : step),
  });
}

function redactedWorkspaceOnboardingResult(result = {}) {
  const safe = Object.assign({}, result);
  if (safe.credentials && typeof safe.credentials === "object") {
    safe.credentials = {
      homeAiAccessKey: Boolean(safe.credentials.homeAiAccessKey),
    };
  }
  return safe;
}

async function requestWorkspaceOnboardingPlan(payload = {}) {
  const result = await api("/api/workspace-onboarding/plan", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  state.workspaceOnboardingPlan = result;
  if (!result?.ok) throw new Error(result?.error || "开通计划不可用");
  return result;
}

async function planWorkspaceOnboardingFromAccessKeyManager() {
  const root = $("accessKeyOverlay") || document;
  const payload = workspaceOnboardingPayload(root);
  rememberWorkspaceOnboardingDraft(payload);
  state.workspaceOnboardingLoading = true;
  state.workspaceOnboardingError = "";
  state.workspaceOnboardingResult = null;
  state.workspaceOnboardingRun = null;
  renderAccessKeyManager();
  try {
    await requestWorkspaceOnboardingPlan(payload);
  } catch (err) {
    state.workspaceOnboardingError = err.message || String(err);
  } finally {
    state.workspaceOnboardingLoading = false;
    renderAccessKeyManager();
  }
}

async function applyWorkspaceOnboardingFromAccessKeyManager() {
  const root = $("accessKeyOverlay") || document;
  const payload = workspaceOnboardingPayload(root);
  rememberWorkspaceOnboardingDraft(payload);
  state.workspaceOnboardingLoading = true;
  state.workspaceOnboardingError = "";
  state.workspaceOnboardingResult = null;
  state.workspaceOnboardingRun = createWorkspaceOnboardingRunState(state.workspaceOnboardingPlan || {}, payload);
  renderAccessKeyManager();
  try {
    const plan = state.workspaceOnboardingPlan?.ok && workspaceOnboardingPlanMatchesPayload(state.workspaceOnboardingPlan, payload)
      ? state.workspaceOnboardingPlan
      : await requestWorkspaceOnboardingPlan(payload);
    state.workspaceOnboardingRun = createWorkspaceOnboardingRunState(plan, payload);
    renderAccessKeyManager();
    const result = await api("/api/workspace-onboarding/apply", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const oneTimeKey = result?.credentials?.homeAiAccessKey || "";
    state.workspaceOnboardingResult = redactedWorkspaceOnboardingResult(result);
    state.workspaceOnboardingPlan = null;
    state.workspaceOnboardingRun = null;
    if (oneTimeKey) {
      state.generatedAccessKey = {
        kind: "workspace",
        key: oneTimeKey,
        label: `${result.displayName || payload.displayName || payload.workspaceId} Home AI Access Key`,
        workspaceId: result.workspaceId || payload.workspaceId,
        focus: true,
      };
    }
    if (!result?.ok) state.workspaceOnboardingError = result?.error || "工作区开通失败";
    state.workspaceOnboardingLoading = false;
    await loadWorkspaces();
    await loadProjects();
    await loadAccessKeyManager({ keepGenerated: true, workspaceId: "owner" });
  } catch (err) {
    const message = err.message || String(err);
    state.workspaceOnboardingError = message;
    state.workspaceOnboardingRun = failWorkspaceOnboardingRunState(state.workspaceOnboardingRun, message);
  } finally {
    state.workspaceOnboardingLoading = false;
    renderAccessKeyManager();
  }
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
  if (target?.hasKey && !window.confirm(`更换 ${label} 的 Home AI Access Key？旧 key 会立即失效。`)) return;
  const result = await api("/api/access-keys/workspace", {
    method: "POST",
    body: JSON.stringify({ workspaceId }),
  });
  state.generatedAccessKey = {
    kind: "workspace",
    key: result.key || "",
    label: `${label} Home AI Access Key`,
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
  if (!window.confirm(`撤销 ${label} 的 Home AI Access Key？该账号会在下次请求时需要重新登录。`)) return;
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
  if (!window.confirm("更换 Home AI Owner Access Key？旧 Owner key 会立即失效。")) return;
  const result = await api("/api/access-keys/web", { method: "POST", body: JSON.stringify({}) });
  storeAccessKey(result.key || "");
  state.generatedAccessKey = {
    kind: "owner",
    key: result.key || "",
    label: "Home AI Owner Access Key",
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
