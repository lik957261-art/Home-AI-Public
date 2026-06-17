"use strict";

function renderSharedDirectoryManager() {
  if (state.sharedDirectoriesLoading) {
    return `<section class="shared-directory-manager"><div class="directory-status">Loading shared directories...</div></section>`;
  }
  if (state.sharedDirectoriesError) {
    return `<section class="shared-directory-manager"><div class="directory-status error">${escapeHtml(state.sharedDirectoriesError)}</div></section>`;
  }
  const items = Array.isArray(state.sharedDirectories) ? state.sharedDirectories : [];
  const rows = items.length ? items.map((item) => {
    const targetIds = new Set(Array.isArray(item.targetWorkspaceIds) ? item.targetWorkspaceIds : []);
    const allWorkspaces = item.scope === "all_workspaces";
    const workspaceChoices = state.workspaces.map((workspace) => {
      const checked = targetIds.has(workspace.id) ? " checked" : "";
      return `<label class="shared-directory-target">
        <input type="checkbox" value="${escapeHtml(workspace.id || "")}" data-share-target${checked}>
        <span>${escapeHtml(workspace.label || workspace.id)}</span>
      </label>`;
    }).join("");
    const editingAccess = state.sharedDirectoryAccessId === item.id;
    const controls = item.canManage && editingAccess
      ? `<div class="shared-directory-controls" data-share-controls>
          <label class="shared-directory-field">
            <span>权限</span>
            <select data-share-permission>
              <option value="read_write"${item.permission !== "read_only" ? " selected" : ""}>读写</option>
              <option value="read_only"${item.permission === "read_only" ? " selected" : ""}>只读</option>
            </select>
          </label>
          <label class="shared-directory-target all">
            <input type="checkbox" data-share-all${allWorkspaces ? " checked" : ""}>
            <span>所有工作区</span>
          </label>
          <div class="shared-directory-targets"${allWorkspaces ? " hidden" : ""}>${workspaceChoices}</div>
          <button class="shared-directory-save" type="button" data-save-share-directory-id="${escapeHtml(item.id || "")}">保存权限</button>
        </div>`
      : "";
    const permissionAction = item.canManage
      ? `<button class="shared-directory-permission" type="button" data-edit-share-directory-id="${escapeHtml(item.id || "")}">${editingAccess ? "收起" : "权限"}</button>`
      : "";
    const action = item.canUnshare
      ? `<button class="shared-directory-unshare" type="button" data-unshare-directory-id="${escapeHtml(item.id || "")}">取消共享</button>`
      : "";
    return `<article class="shared-directory-row">
      <span class="directory-entry-icon" aria-hidden="true"></span>
      <span class="shared-directory-text">
        <span class="shared-directory-name">${escapeHtml(item.label || "共享目录")}</span>
        <span class="shared-directory-meta">共享者：${escapeHtml(item.createdByLabel || item.createdBy || "Unknown")}</span>
        <span class="shared-directory-meta">权限：${escapeHtml(item.permissionLabel || "所有工作区 · 读写")}</span>
        ${Array.isArray(item.targetLabels) && item.targetLabels.length ? `<span class="shared-directory-meta">共享给：${escapeHtml(item.targetLabels.join("、"))}</span>` : ""}
        ${controls}
      </span>
      <span class="shared-directory-actions">${permissionAction}${action}</span>
    </article>`;
  }).join("") : `<div class="directory-status">暂无共享目录</div>`;
  return `<section class="shared-directory-manager">
    <header class="shared-directory-header">
      <div>
        <div class="shared-directory-title">共享目录</div>
        <div class="shared-directory-subtitle">仅 Owner 或原共享者可以取消共享。</div>
      </div>
      <button class="shared-directory-close" type="button" data-close-shared-directory-manager>完成</button>
    </header>
    <div class="shared-directory-list">${rows}</div>
  </section>`;
}

function renderDirectoryEntryMenu(entry) {
  const itemPath = escapeHtml(entry.path || "");
  const itemName = escapeHtml(entry.name || "item");
  const itemType = escapeHtml(entry.type || "file");
  const taskAction = entry.type === "directory"
    ? `<button class="directory-entry-menu-item" type="button" data-start-directory-task-path="${itemPath}" data-start-directory-task-label="${itemName}">开启话题</button>`
    : "";
  const renameAction = `<button class="directory-entry-menu-item" type="button" data-rename-directory-path="${itemPath}" data-rename-directory-name="${itemName}" data-rename-directory-type="${itemType}">改名</button>`;
  const deleteAction = `<button class="directory-entry-menu-item danger" type="button" data-delete-directory-path="${itemPath}" data-delete-directory-name="${itemName}" data-delete-directory-type="${itemType}">删除</button>`;
  if (!taskAction && !renameAction && !deleteAction) return "";
  return `<div class="directory-entry-menu-wrap">
    <button class="directory-entry-menu-button" type="button" data-directory-entry-menu aria-label="更多操作" title="更多操作" aria-expanded="false">&#8942;</button>
    <div class="directory-entry-menu" hidden>
      ${taskAction}
      ${renameAction}
      ${deleteAction}
    </div>
  </div>`;
}

function renderDirectoryEntries() {
  if (state.directoryLoading) return `<div class="directory-status">${escapeHtml(state.directoryError || "Loading directory...")}</div>`;
  if (state.directoryError) return `<div class="directory-status error">${escapeHtml(state.directoryError)}</div>`;
  if (!directoryActivePath()) return state.sharedDirectoryManagerOpen ? renderSharedDirectoryManager() : renderDirectoryProjectEntries();
  const preview = state.directoryPreview;
  const entries = Array.isArray(preview?.entries) ? preview.entries : [];
  const search = currentSearchText().toLowerCase();
  const visible = entries.filter((entry) => directorySearchMatches(entry, search));
  if (!visible.length) {
    return `<div class="directory-status">${entries.length && search ? "No matching items." : "空目录"}</div>`;
  }
  return `<div class="directory-entry-list">${visible.map((entry) => {
    const kind = directoryEntryKind(entry);
    const meta = directoryEntryMeta(entry);
    const selectingServerFile = Boolean(state.serverFileAttachmentPickerOpen);
    const main = entry.type === "directory"
      ? `<button class="directory-entry-main" type="button" data-open-directory-path="${escapeHtml(entry.path || "")}">`
      : selectingServerFile
        ? `<button class="directory-entry-main" type="button" data-attach-server-file-path="${escapeHtml(entry.path || "")}" data-attach-server-file-name="${escapeHtml(entry.name || "item")}">`
      : `<a class="directory-entry-main" href="${escapeHtml(directoryEntryHref(entry))}" target="_self" rel="noopener"${directoryEntryDocumentAttrs(entry)}>`;
    const close = entry.type === "directory" || selectingServerFile ? "</button>" : "</a>";
    return `<article class="directory-entry ${escapeHtml(kind)}">
      ${main}
        <span class="directory-entry-icon" aria-hidden="true"></span>
        <span class="directory-entry-text">
          <span class="directory-entry-name">${escapeHtml(entry.name || "item")}</span>
          ${meta ? `<span class="directory-entry-meta">${escapeHtml(meta)}</span>` : ""}
        </span>
        <span class="directory-entry-chevron">›</span>
      ${close}
      ${selectingServerFile ? "" : renderDirectoryEntryMenu(entry)}
    </article>`;
  }).join("")}</div>`;
}

function renderDirectoryView() {
  if (state.viewMode !== "projects") return;
  const conversation = $("conversation");
  $("threadTitle").textContent = state.serverFileAttachmentPickerOpen ? "选择服务器文件" : "目录";
  $("threadMeta").textContent = "";
  $("interruptRun").disabled = true;
  updateNavigationControls();
  configureComposer({ enabled: false, placeholder: "Directory management" });
  conversation.innerHTML = `<section class="directory-shell">
    ${state.serverFileAttachmentPickerOpen ? `<div class="server-file-picker-banner">选择服务器上的文件作为附件引用，不会重复上传。</div>` : ""}
    ${renderDirectoryControls()}
    ${renderDirectoryEntries()}
  </section>`;
  wireDirectoryView(conversation);
  ensureVerticalScrollAffordance(conversation);
}

async function createDirectoryFolder() {
  const name = window.prompt("新建目录名称");
  if (!name || !name.trim()) return;
  const basePath = directoryCreateBasePath();
  if (!basePath) throw new Error("No directory is selected.");
  const creatingAtRoot = !directoryActivePath();
  const threadId = await ensureDirectoryThread();
  await api("/api/directories/create", {
    method: "POST",
    body: JSON.stringify({ threadId, path: basePath, name: name.trim() }),
  });
  if (creatingAtRoot) {
    await loadProjects();
    resetDirectoryPath();
  }
  await loadDirectoryView();
}

async function uploadDirectoryFiles(files) {
  const list = [...(files || [])].filter(Boolean);
  if (!list.length) return;
  const threadId = await ensureDirectoryThread();
  try {
    for (let index = 0; index < list.length; index += 1) {
      const file = list[index];
      state.directoryLoading = true;
      state.directoryError = `Uploading ${index + 1}/${list.length}: ${file.name}`;
      renderDirectoryView();
      await api("/api/directories/upload", {
        method: "POST",
        body: JSON.stringify({
          threadId,
          path: directoryActivePath(),
          filename: file.name,
          dataBase64: await fileToBase64(file),
        }),
      });
    }
  } catch (err) {
    state.directoryError = err.message || String(err);
    renderDirectoryView();
    throw err;
  } finally {
    state.directoryLoading = false;
  }
  await loadDirectoryView();
}

function deletedDirectoryWasRootListProject(pathText) {
  const target = comparableDirectoryPath(pathText);
  if (!target) return false;
  return (state.projects || []).some((project) =>
    canDeleteDirectoryRootProject(project) && comparableDirectoryPath(project.root) === target);
}

async function deleteDirectoryEntry(button) {
  const path = button?.dataset?.deleteDirectoryPath || "";
  if (!path) {
    const err = new Error("删除失败：缺少文件路径");
    if (typeof showPushToast === "function") showPushToast(err.message, "error");
    if (button) button.textContent = "缺少路径";
    throw err;
  }
  const wasRootListProject = deletedDirectoryWasRootListProject(path);
  const name = button.dataset.deleteDirectoryName || "item";
  const type = button.dataset.deleteDirectoryType || "file";
  const message = type === "directory"
    ? `删除目录“${name}”？如果目录非空，需要 Owner 高权限批准后才会递归删除。`
    : `删除文件“${name}”？`;
  if (!window.confirm(message)) return;
  if (typeof showPushToast === "function") showPushToast(type === "directory" ? "正在删除目录..." : "正在删除文件...");
  const previousText = button.textContent;
  button.textContent = type === "directory" ? "删除中..." : "删除中...";
  let body = null;
  button.disabled = true;
  try {
    const threadId = await ensureDirectoryThread();
    body = { threadId, path };
    await api("/api/directories/delete", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (!shouldOfferOwnerElevation(err)) {
      if (typeof showPushToast === "function") showPushToast(err.message || "删除失败", "error");
      throw err;
    }
    const ok = await openOwnerElevationApprovalDialog({
      title: "Owner Approval",
      message: ownerElevationConfirmMessage(err),
      detail: err.elevationReason || "",
    });
    if (!ok) return;
    let ownerElevationOnceRequested = false;
    try {
      let onceToken = "";
      if (typeof ownerElevationOnceActive === "function" && ownerElevationOnceActive()) {
        onceToken = state.ownerElevationOnceToken;
      } else {
        await activateOwnerElevationOnce({ confirm: false, requireOwnerWorkspace: false });
        onceToken = state.ownerElevationOnceToken;
        ownerElevationOnceRequested = true;
      }
      const elevatedBody = Object.assign({}, body);
      if (onceToken) elevatedBody.ownerElevationOnceToken = onceToken;
      await api("/api/directories/delete", {
        method: "POST",
        body: JSON.stringify(elevatedBody),
      });
    } catch (retryErr) {
      if (typeof showPushToast === "function") showPushToast(retryErr.message || "删除失败", "error");
      throw retryErr;
    } finally {
      if (ownerElevationOnceRequested) clearOwnerElevationOnce();
    }
  } finally {
    button.disabled = false;
    button.textContent = previousText || "删除";
  }
  if (!directoryActivePath() || wasRootListProject) await loadProjects();
  await loadDirectoryView();
  if (typeof showPushToast === "function") showPushToast("已删除", "success");
}

async function renameDirectoryEntry(button) {
  const path = button?.dataset?.renameDirectoryPath || "";
  if (!path) {
    const err = new Error("改名失败：缺少文件路径");
    if (typeof showPushToast === "function") showPushToast(err.message, "error");
    throw err;
  }
  const oldName = button.dataset.renameDirectoryName || "item";
  const type = button.dataset.renameDirectoryType || "file";
  const label = type === "directory" ? "目录" : "文件";
  const nextName = window.prompt(`新的${label}名称`, oldName);
  if (!nextName || !nextName.trim()) return;
  const name = nextName.trim();
  if (name === oldName) return;
  if (typeof showPushToast === "function") showPushToast(type === "directory" ? "正在改名目录..." : "正在改名文件...");
  button.disabled = true;
  try {
    const threadId = await ensureDirectoryThread();
    await api("/api/directories/rename", {
      method: "POST",
      body: JSON.stringify({ threadId, path, name }),
    });
    await loadDirectoryView();
    if (typeof showPushToast === "function") showPushToast("已改名", "success");
  } catch (err) {
    if (typeof showPushToast === "function") showPushToast(err.message || "改名失败", "error");
    throw err;
  } finally {
    button.disabled = false;
  }
}

function closeDirectoryEntryMenus(root = document) {
  root.querySelectorAll(".directory-entry-menu-wrap.open").forEach((wrap) => {
    wrap.classList.remove("open");
    wrap.closest(".directory-entry")?.classList.remove("menu-open");
    wrap.querySelector(".directory-entry-menu-button")?.setAttribute("aria-expanded", "false");
    const menu = wrap.querySelector(".directory-entry-menu");
    if (menu) menu.hidden = true;
  });
}

function toggleDirectoryEntryMenu(button) {
  const wrap = button?.closest?.(".directory-entry-menu-wrap");
  if (!wrap) return;
  const opening = !wrap.classList.contains("open");
  closeDirectoryEntryMenus();
  if (!opening) return;
  wrap.classList.add("open");
  wrap.closest(".directory-entry")?.classList.add("menu-open");
  button.setAttribute("aria-expanded", "true");
  const menu = wrap.querySelector(".directory-entry-menu");
  if (menu) menu.hidden = false;
}

async function loadSharedDirectories() {
  state.sharedDirectoriesLoading = true;
  state.sharedDirectoriesError = "";
  renderDirectoryView();
  try {
    const result = await api(`/api/directories/shared?workspaceId=${encodeURIComponent(state.selectedWorkspaceId)}`);
    state.sharedDirectories = result.data || [];
    if (state.sharedDirectoryAccessId && !state.sharedDirectories.some((item) => item.id === state.sharedDirectoryAccessId)) {
      state.sharedDirectoryAccessId = "";
    }
  } catch (err) {
    state.sharedDirectoriesError = err.message || String(err);
  } finally {
    state.sharedDirectoriesLoading = false;
    renderDirectoryView();
  }
}

async function openSharedDirectoryManager() {
  closeTopMoreMenu();
  if (state.viewMode !== "projects") return;
  state.directoryPath = "";
  state.directoryRootPath = "";
  state.directoryPreview = null;
  state.sharedDirectoryManagerOpen = true;
  await loadSharedDirectories();
}

function closeSharedDirectoryManager() {
  state.sharedDirectoryManagerOpen = false;
  state.sharedDirectoriesError = "";
  state.sharedDirectoryAccessId = "";
  renderDirectoryView();
}

async function shareRootDirectoryProject(button) {
  const projectId = button?.dataset?.shareRootProject || "";
  const project = state.projects.find((item) => item.id === projectId);
  if (!project?.root || !isShareableRootProject(project)) return;
  const name = directoryRootProjectLabel(project);
  if (!window.confirm(`共享目录“${name}”？共享后所有工作区都能看到这个目录。`)) return;
  const threadId = await ensureDirectoryThread();
  await api("/api/directories/share", {
    method: "POST",
    body: JSON.stringify({ threadId, path: project.root, name }),
  });
  await loadProjects();
  state.sharedDirectoryManagerOpen = true;
  await loadSharedDirectories();
}

function selectDirectoryAttachmentRoute(attachment) {
  if (!attachment?.projectId) return;
  state.selectedProjectId = attachment.projectId;
  localStorage.setItem("hermesWebProject", state.selectedProjectId);
  if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId;
  persistSelectedSubproject(attachment.subprojectId || "");
  renderSubprojects();
}

async function openTaskComposerForDirectoryAttachment(attachment) {
  if (!attachment?.projectId) return;
  const returnRoute = typeof captureCurrentDirectoryRoute === "function"
    ? captureCurrentDirectoryRoute()
    : (typeof captureDirectoryReturnRoute === "function" ? captureDirectoryReturnRoute() : null);
  closeDirectoryEntryMenus();
  clearQuotedReply({ render: false });
  selectDirectoryAttachmentRoute(attachment);
  state.directoryReturnRoute = returnRoute || state.directoryReturnRoute;
  state.pendingTaskDirectory = attachment;
  state.taskDirectoryFilter = {
    projectId: attachment.projectId,
    subprojectId: attachment.subprojectId || "",
    label: attachment.label || "",
    directory: attachment,
  };
  state.pendingTaskReasoningEffort = "";
  state.pendingTaskReasoningExplicit = false;
  state.viewMode = "tasks";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.currentTaskGroupId = "";
  state.currentThread = null;
  state.currentThreadId = "";
  applyViewMode();
  await loadSingleWindow();
  if (isMobileLayout()) closeSidebar();
  focusComposerSoon();
}

async function startTaskFromRootProject(button) {
  const projectId = button?.dataset?.startDirectoryTaskProject || "";
  const project = (state.projects || []).find((item) => item.id === projectId);
  const attachment = directoryAttachmentFromRoute(project?.id || "", "", project?.root || "", project ? directoryRootProjectLabel(project) : "");
  await openTaskComposerForDirectoryAttachment(attachment);
}

async function startTaskFromDirectoryPath(button) {
  const pathText = button?.dataset?.startDirectoryTaskPath || "";
  const label = button?.dataset?.startDirectoryTaskLabel || "";
  const route = resolveDirectoryProjectRoute({ label, path: pathText });
  if (!route) throw new Error("No directory route is available for this folder.");
  const attachment = directoryAttachmentFromRoute(route.projectId, route.subprojectId || "", pathText, logicalDirectoryDisplayPath(pathText, label));
  await openTaskComposerForDirectoryAttachment(attachment);
}

async function unshareDirectory(button) {
  const id = button?.dataset?.unshareDirectoryId || "";
  if (!id) return;
  if (!window.confirm("取消共享这个目录？其他工作区将不再看到它。")) return;
  await api("/api/directories/unshare", {
    method: "POST",
    body: JSON.stringify({ workspaceId: state.selectedWorkspaceId, id }),
  });
  await loadProjects();
  await loadSharedDirectories();
}

function toggleSharedDirectoryAccess(button) {
  const id = button?.dataset?.editShareDirectoryId || "";
  state.sharedDirectoryAccessId = state.sharedDirectoryAccessId === id ? "" : id;
  renderDirectoryView();
}

function toggleShareTargetControls(input) {
  const controls = input?.closest?.("[data-share-controls]");
  const targets = controls?.querySelector?.(".shared-directory-targets");
  if (targets) targets.hidden = Boolean(input.checked);
}

async function updateSharedDirectoryAccess(button) {
  const id = button?.dataset?.saveShareDirectoryId || "";
  const controls = button?.closest?.("[data-share-controls]");
  if (!id || !controls) return;
  const allWorkspaces = Boolean(controls.querySelector("[data-share-all]")?.checked);
  const targetWorkspaceIds = [...controls.querySelectorAll("[data-share-target]:checked")]
    .map((input) => input.value)
    .filter(Boolean);
  await api("/api/directories/share/update", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: state.selectedWorkspaceId,
      id,
      permission: controls.querySelector("[data-share-permission]")?.value || "read_write",
      scope: allWorkspaces ? "all_workspaces" : "selected_workspaces",
      targetWorkspaceIds,
    }),
  });
  await loadProjects();
  await loadSharedDirectories();
}

function wireDirectorySwipe(root) {
  const shell = root.querySelector(".directory-shell");
  if (!shell) return;
  if (shell.dataset.directorySwipeBound) return;
  shell.dataset.directorySwipeBound = "1";
  const interactiveSelector = ".directory-entry-menu-wrap, .directory-commandbar, input, select, textarea, [contenteditable='true']";
  const clearSwipe = () => {
    state.directorySwipe = null;
  };
  const canSwipeDirectoryUp = () => (
    isMobileLayout()
    && state.viewMode === "projects"
    && !state.directoryLoading
    && Boolean(directoryActivePath())
  );
  shell.addEventListener("touchstart", (event) => {
    if (!canSwipeDirectoryUp() || event.touches.length !== 1 || event.target?.closest?.(interactiveSelector)) {
      clearSwipe();
      return;
    }
    const point = event.touches[0];
    state.directorySwipe = {
      startX: point.clientX,
      startY: point.clientY,
      lastX: point.clientX,
      startedAt: performance.now(),
      dragging: false,
      accepted: false,
      shell,
    };
  }, { passive: true });
  shell.addEventListener("touchmove", (event) => {
    const swipe = state.directorySwipe;
    if (!swipe || !canSwipeDirectoryUp() || event.touches.length !== 1) return;
    const point = event.touches[0];
    const dx = point.clientX - swipe.startX;
    const dy = point.clientY - swipe.startY;
    const horizontal = Math.abs(dx);
    const vertical = Math.abs(dy);
    if (dx <= 0 || (!swipe.dragging && (horizontal < 12 || horizontal < vertical * 1.1))) return;
    swipe.dragging = true;
    swipe.lastX = point.clientX;
    const elapsed = Math.max(1, performance.now() - (swipe.startedAt || performance.now()));
    const velocity = dx / elapsed;
    swipe.accepted = dx > 58 || velocity > 0.55;
    const visualOffset = Math.min(64, Math.max(0, dx) * 0.42);
    shell.classList.add("directory-dragging");
    shell.style.transform = visualOffset ? `translate3d(${visualOffset}px, 0, 0)` : "";
    shell.style.opacity = "";
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }, { passive: false });
  shell.addEventListener("touchend", () => {
    const swipe = state.directorySwipe;
    clearSwipe();
    if (!swipe?.dragging) return;
    if (swipe.accepted) {
      navigateDirectoryUp({ exitShell: swipe.shell, animateEntry: true }).catch(showError);
    } else {
      settleDirectorySwipeShell(swipe.shell, false);
    }
  }, { passive: true });
  shell.addEventListener("touchcancel", () => {
    const swipe = state.directorySwipe;
    clearSwipe();
    if (swipe?.dragging) settleDirectorySwipeShell(swipe.shell, false);
  }, { passive: true });
}

function wireDirectoryView(root) {
  wireDirectorySwipe(root);
  if (typeof wireTaskDocumentLinks === "function") wireTaskDocumentLinks(root);
  root.querySelector("[data-directory-refresh]")?.addEventListener("click", () => loadDirectoryView().catch(showError));
  root.querySelector("[data-directory-new]")?.addEventListener("click", () => createDirectoryFolder().catch(showError));
  const uploadInput = root.querySelector("#directoryUploadInput");
  root.querySelector("[data-directory-upload]")?.addEventListener("click", () => uploadInput?.click());
  uploadInput?.addEventListener("change", () => uploadDirectoryFiles(uploadInput.files).catch(showError));
  root.querySelectorAll("[data-directory-entry-menu]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleDirectoryEntryMenu(button);
    });
  });
  root.querySelectorAll(".directory-entry-menu").forEach((menu) => {
    menu.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  });
  root.querySelectorAll("[data-directory-crumb]").forEach((button) => {
    button.addEventListener("click", () => {
      state.directoryPath = button.dataset.directoryCrumb || "";
      state.sharedDirectoryManagerOpen = false;
      ensureDirectoryRootForPath(state.directoryPath);
      syncDirectoryRouteFromPath(state.directoryPath);
      loadDirectoryView().catch(showError);
    });
  });
  root.querySelectorAll("[data-open-project-directory]").forEach((button) => {
    button.addEventListener("click", () => {
      const projectId = button.dataset.openProjectDirectory || "";
      const project = state.projects.find((item) => item.id === projectId);
      if (!project?.root) return;
      state.selectedProjectId = project.id;
      localStorage.setItem("hermesWebProject", state.selectedProjectId);
      if ($("projectSelect")) $("projectSelect").value = state.selectedProjectId;
      persistSelectedSubproject("");
      renderSubprojects();
      state.directoryPath = project.root;
      state.directoryRootPath = project.root;
      state.sharedDirectoryManagerOpen = false;
      loadDirectoryView().catch(showError);
    });
  });
  root.querySelectorAll("[data-open-directory-path]").forEach((button) => {
    button.addEventListener("click", () => {
      state.directoryPath = button.dataset.openDirectoryPath || "";
      state.sharedDirectoryManagerOpen = false;
      ensureDirectoryRootForPath(state.directoryPath);
      syncDirectoryRouteFromPath(state.directoryPath);
      loadDirectoryView().catch(showError);
    });
  });
  root.querySelectorAll("[data-attach-server-file-path]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      attachServerFileToComposer({
        path: button.dataset.attachServerFilePath || "",
        name: button.dataset.attachServerFileName || "",
      }).catch(showError);
    });
  });
  root.querySelectorAll("[data-share-root-project]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDirectoryEntryMenus();
      shareRootDirectoryProject(button).catch(showError);
    });
  });
  root.querySelectorAll("[data-start-directory-task-project]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDirectoryEntryMenus();
      startTaskFromRootProject(button).catch(showError);
    });
  });
  root.querySelectorAll("[data-start-directory-task-path]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDirectoryEntryMenus();
      startTaskFromDirectoryPath(button).catch(showError);
    });
  });
  root.querySelector("[data-close-shared-directory-manager]")?.addEventListener("click", () => {
    closeSharedDirectoryManager();
  });
  root.querySelectorAll("[data-unshare-directory-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      unshareDirectory(button).catch(showError);
    });
  });
  root.querySelectorAll("[data-edit-share-directory-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleSharedDirectoryAccess(button);
    });
  });
  root.querySelectorAll("[data-share-all]").forEach((input) => {
    input.addEventListener("change", () => toggleShareTargetControls(input));
  });
  root.querySelectorAll("[data-save-share-directory-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      updateSharedDirectoryAccess(button).catch(showError);
    });
  });
  root.querySelectorAll("[data-delete-directory-path]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteDirectoryEntry(button).catch(showError);
    });
  });
  root.querySelectorAll("[data-rename-directory-path]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDirectoryEntryMenus();
      renameDirectoryEntry(button).catch(showError);
    });
  });
}
