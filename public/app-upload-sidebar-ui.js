"use strict";

const UPLOAD_SIDEBAR_MODEL_ESM_PATH = "/vite-islands/upload-sidebar-model/upload-sidebar-model.js";
let uploadSidebarModel = null;
let uploadSidebarModelPromise = null;

function importUploadSidebarModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (uploadSidebarModel) return Promise.resolve(uploadSidebarModel);
  if (!uploadSidebarModelPromise) {
    const importer = typeof rootRef.__homeAiImportUploadSidebarModel === "function"
      ? rootRef.__homeAiImportUploadSidebarModel
      : (path) => import(path);
    uploadSidebarModelPromise = Promise.resolve()
      .then(() => importer(UPLOAD_SIDEBAR_MODEL_ESM_PATH))
      .then((model) => {
        uploadSidebarModel = model || null;
        return uploadSidebarModel;
      })
      .catch((error) => {
        uploadSidebarModelPromise = null;
        throw error;
      });
  }
  return uploadSidebarModelPromise;
}

function currentUploadSidebarModel() {
  return uploadSidebarModel;
}

function uploadSidebarWorkspaceId() {
  return String([
    state.selectedWorkspaceId,
    state.currentWorkspaceId,
    state.auth?.workspaceId,
    "owner",
  ].find(Boolean)).trim();
}

if (typeof window !== "undefined") {
  importUploadSidebarModel().catch(() => null);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      resolve(text.includes(",") ? text.slice(text.indexOf(",") + 1) : text);
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function closeAttachFileMenu() {
  state.attachFileMenuOpen = false;
  const menu = $("attachFileMenu");
  if (!menu) return;
  menu.hidden = true;
  menu.innerHTML = "";
}

function serverFileAttachmentOwnerOnly() {
  const model = currentUploadSidebarModel();
  if (model?.uploadSidebarOwnerOnlyPlan) return model.uploadSidebarOwnerOnlyPlan({ auth: state.auth });
  return Boolean(state.auth?.isOwner);
}

function renderAttachFileMenu() {
  const menu = $("attachFileMenu");
  if (!menu) return;
  const menuPlan = currentUploadSidebarModel()?.attachFileMenuPlan?.({ auth: state.auth }) || null;
  const serverOption = serverFileAttachmentOwnerOnly()
    ? `<button class="attach-file-option" type="button" data-attach-menu-server>
    <span class="attach-file-option-icon server" aria-hidden="true"></span>
    <span>${escapeHtml(menuPlan?.options?.find?.((option) => option.id === "server")?.label || "服务器文件")}</span>
  </button>`
    : "";
  menu.innerHTML = `<button class="attach-file-option" type="button" data-attach-menu-system>
    <span class="attach-file-option-icon system" aria-hidden="true"></span>
    <span>${escapeHtml(menuPlan?.options?.find?.((option) => option.id === "system")?.label || "系统文件")}</span>
  </button>${serverOption}`;
  menu.querySelector("[data-attach-menu-system]")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeAttachFileMenu();
    openAttachFilePicker();
  });
  menu.querySelector("[data-attach-menu-server]")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeAttachFileMenu();
    openServerFileAttachmentPicker().catch(showError);
  });
}

function openAttachFileMenu() {
  const menu = $("attachFileMenu");
  if (!menu) {
    openAttachFilePicker();
    return;
  }
  state.attachFilePickerActivationAt = Date.now();
  state.attachFileMenuOpen = true;
  renderAttachFileMenu();
  menu.hidden = false;
  const closeOnOutside = (event) => {
    if (event.target?.closest?.("#attachFileMenu") || event.target?.closest?.("#attachFile")) return;
    closeAttachFileMenu();
    document.removeEventListener("pointerdown", closeOnOutside, true);
  };
  setTimeout(() => document.addEventListener("pointerdown", closeOnOutside, true), 0);
}

function renderPendingArtifacts() {
  let panel = $("pendingArtifacts");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "pendingArtifacts";
    panel.className = "pending-artifacts";
    $("composer").insertBefore(panel, $("messageInput"));
  }
  if (!state.pendingArtifacts.length) {
    panel.innerHTML = "";
    panel.classList.add("hidden");
    updateComposerAction();
    return;
  }
  panel.classList.remove("hidden");
  panel.innerHTML = state.pendingArtifacts.map((artifact, index) => {
    const kind = artifactKind(artifact);
    const name = typeof artifactDisplayName === "function"
      ? artifactDisplayName(artifact)
      : String(artifact?.displayName || artifact?.title || artifact?.label || artifact?.name || artifact?.id || "document").trim();
    const mime = String(artifact?.mime || "").toLowerCase();
    const href = typeof artifactHref === "function" ? artifactHref(artifact) : String(artifact?.url || "");
    const imagePreview = (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|bmp|heic|heif)(?:[?#]|$)/i.test(name)) && href && href !== "#";
    const preview = imagePreview
      ? `<a class="pending-artifact-preview" href="${escapeHtml(href)}" target="_self" data-task-doc data-pending-artifact-preview data-artifact-name="${escapeHtml(name)}" data-artifact-mime="${escapeHtml(artifact?.mime || "image/*")}" aria-label="${escapeHtml(`预览 ${name}`)}"><img src="${escapeHtml(href)}" alt="" loading="lazy" decoding="async"></a>`
      : `<span class="pending-artifact-icon" aria-hidden="true"></span>`;
    return `<div class="pending-artifact doc-${escapeHtml(kind)}${imagePreview ? " pending-artifact-image" : ""}">
    ${preview}
    <span class="pending-artifact-name">${escapeHtml(artifact.name || artifact.id)}</span>
    <button type="button" class="pending-artifact-remove" data-remove-artifact="${index}" aria-label="${escapeHtml(`移除 ${name}`)}"></button>
  </div>`;
  }).join("");
  panel.querySelectorAll("[data-pending-artifact-preview]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const previewUi = (typeof window !== "undefined" ? window.TaskDocumentPreviewUi : null) || {};
      if (previewUi.isImagePreviewLink?.(link)) {
        previewUi.openImagePreviewOverlay?.(link);
      }
    });
  });
  panel.querySelectorAll("[data-remove-artifact]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.pendingArtifacts.splice(Number(button.dataset.removeArtifact), 1);
      renderPendingArtifacts();
      updateComposerAction();
    });
  });
}

function normalizeNativeSharedFiles(payload = {}) {
  const model = currentUploadSidebarModel();
  if (model?.normalizeNativeSharedFiles) {
    return Array.from(model.normalizeNativeSharedFiles(payload, {
      workspaceId: uploadSidebarWorkspaceId(),
    }));
  }
  const files = Array.isArray(payload?.files) ? payload.files : (Array.isArray(payload) ? payload : []);
  const seen = new Set();
  return files.map((file) => ({
    path: String(file?.path || file?.displayPath || "").trim(),
    name: String(file?.name || file?.filename || "").trim(),
    workspaceId: String(file?.workspaceId || uploadSidebarWorkspaceId()).trim() || uploadSidebarWorkspaceId(),
  })).filter((file) => {
    if (!file.path) return false;
    const key = `${file.workspaceId}\n${file.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function nativeSharedFileSummary(files = state.nativeSharedFiles || []) {
  const model = currentUploadSidebarModel();
  if (model?.nativeSharedFileSummaryPlan) return model.nativeSharedFileSummaryPlan(files);
  if (!files.length) return "";
  if (files.length === 1) return files[0].name || files[0].path.split(/[\\/]/).pop() || "分享文件";
  return `${files.length} 个分享文件`;
}

function renderNativeShareIntakePanel() {
  const composer = $("composer");
  if (!composer) return;
  let panel = $("nativeShareIntakePanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "nativeShareIntakePanel";
    panel.className = "native-share-intake-panel";
    composer.insertBefore(panel, $("pendingArtifacts") || $("messageInput"));
  }
  const files = state.nativeSharedFiles || [];
  if (!files.length) {
    panel.innerHTML = "";
    panel.classList.add("hidden");
    return;
  }
  const panelPlan = currentUploadSidebarModel()?.nativeShareIntakePanelPlan?.({
    files,
    auth: state.auth,
    workspaceId: uploadSidebarWorkspaceId(),
  }) || null;
  const summary = panelPlan?.summary || nativeSharedFileSummary(files);
  const canAttachServerFile = serverFileAttachmentOwnerOnly();
  const attachLabel = panelPlan?.attachLabel || (canAttachServerFile ? "附加到当前对话" : "服务器文件附加仅限 Owner");
  panel.classList.remove("hidden");
  panel.innerHTML = `<div class="native-share-intake-copy">
      <strong>收到系统分享</strong>
      <span>${escapeHtml(panelPlan?.copyText || `${summary} 已保存到服务器，${canAttachServerFile ? "可直接附加到当前对话。" : "仅 Owner 可从服务器附加。"}`)}</span>
    </div>
    <div class="native-share-intake-actions">
      <button type="button" data-native-share-attach title="${attachLabel}" aria-label="${attachLabel}"${canAttachServerFile ? "" : " disabled"}>${escapeHtml(panelPlan?.attachButtonLabel || (canAttachServerFile ? "附加" : "Owner专用"))}</button>
      <button type="button" data-native-share-open-directory title="打开文件目录" aria-label="打开文件目录">${escapeHtml(panelPlan?.directoryLabel || "目录")}</button>
      <button type="button" data-native-share-clear title="仅保存，不附加" aria-label="仅保存，不附加">${escapeHtml(panelPlan?.clearLabel || "保存")}</button>
    </div>`;
  panel.querySelector("[data-native-share-attach]")?.addEventListener("click", () => attachNativeSharedFilesToCurrentComposer().catch(showError));
  panel.querySelector("[data-native-share-open-directory]")?.addEventListener("click", () => openNativeShareDirectory().catch(showError));
  panel.querySelector("[data-native-share-clear]")?.addEventListener("click", () => {
    state.nativeSharedFiles = [];
    renderNativeShareIntakePanel();
  });
}

function receiveNativeSharedFiles(payload = {}) {
  const model = currentUploadSidebarModel();
  const mergePlan = model?.mergeNativeSharedFilesPlan?.({
    current: state.nativeSharedFiles || [],
    payload,
    workspaceId: uploadSidebarWorkspaceId(),
  });
  const nextFiles = mergePlan ? Array.from(mergePlan.receivedFiles || []) : normalizeNativeSharedFiles(payload);
  if (!nextFiles.length) return false;
  const current = normalizeNativeSharedFiles(state.nativeSharedFiles || []);
  state.nativeSharedFiles = mergePlan ? Array.from(mergePlan.files || []) : normalizeNativeSharedFiles([...current, ...nextFiles]);
  renderNativeShareIntakePanel();
  if (typeof showPushToast === "function") showPushToast("已收到系统分享文件", "info", { durationMs: 1400 });
  return true;
}

async function attachNativeSharedFilesToCurrentComposer() {
  const files = normalizeNativeSharedFiles(state.nativeSharedFiles || []);
  if (!files.length) return;
  if (!state.currentThreadId && state.viewMode === "single") await loadSingleWindow();
  if (isDraftThread(state.currentThread)) await materializeCurrentThread();
  if (!state.currentThreadId) throw new Error("请先打开一个可发送的对话。");
  state.serverFileAttachmentTargetThreadId = state.currentThreadId;
  const attached = [];
  for (const file of files) {
    const ok = await attachServerFileToComposer({
      path: file.path,
      name: file.name,
      workspaceId: file.workspaceId,
      restore: false,
    });
    if (ok !== false) attached.push(`${file.workspaceId}\n${file.path}`);
  }
  const attachedSet = new Set(attached);
  state.nativeSharedFiles = files.filter((file) => !attachedSet.has(`${file.workspaceId}\n${file.path}`));
  renderNativeShareIntakePanel();
  renderPendingArtifacts();
  updateComposerAction();
  if (typeof showPushToast === "function") showPushToast("已附加分享文件", "success");
}

async function openNativeShareDirectory() {
  const first = normalizeNativeSharedFiles(state.nativeSharedFiles || [])[0];
  if (!first) return;
  const directoryPlan = currentUploadSidebarModel()?.nativeShareDirectoryPlan?.({
    files: state.nativeSharedFiles || [],
    workspaceId: uploadSidebarWorkspaceId(),
  }) || null;
  state.serverFileAttachmentPickerOpen = false;
  state.serverFileAttachmentTargetThreadId = "";
  state.directoryReturnRoute = typeof captureDirectoryReturnRoute === "function" ? captureDirectoryReturnRoute() : state.directoryReturnRoute;
  state.viewMode = "projects";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.directoryPath = directoryPlan?.directoryPath || first.path.replace(/[\\/][^\\/]*$/, "");
  state.directoryRootPath = directoryPlan?.rootPath || "";
  state.directoryPreview = directoryPlan?.clearPreview === false ? state.directoryPreview : null;
  state.directoryError = "";
  state.sharedDirectoryManagerOpen = false;
  applyViewMode();
  await loadProjects();
  ensureDirectoryRootForPath(state.directoryPath);
  await loadDirectoryView();
}

function installNativeShareReceiver() {
  const existing = window.HomeAINativeShare && typeof window.HomeAINativeShare === "object"
    ? window.HomeAINativeShare
    : {};
  window.HomeAINativeShare = Object.assign(existing, {
    receive: receiveNativeSharedFiles,
  });
  if (window.__homeAIPendingNativeShare) {
    const pending = window.__homeAIPendingNativeShare;
    window.__homeAIPendingNativeShare = null;
    receiveNativeSharedFiles(pending);
  }
}

function restoreAfterServerFileAttachmentPicker() {
  state.serverFileAttachmentPickerOpen = false;
  const restored = typeof restoreDirectoryReturnRoute === "function" ? restoreDirectoryReturnRoute() : false;
  if (!restored) {
    state.viewMode = "single";
    localStorage.setItem("hermesWebViewMode", state.viewMode);
    applyViewMode();
    renderCurrentThread({ stickToBottom: true });
  }
}

function systemShareDirectoryPath() {
  const model = currentUploadSidebarModel();
  if (model?.systemShareDirectoryPathPlan) return model.systemShareDirectoryPathPlan();
  return "系统分享";
}

async function openServerFileAttachmentPicker() {
  if (!serverFileAttachmentOwnerOnly()) throw new Error("服务器文件选择仅限 Owner。");
  if (!state.currentThreadId && state.viewMode === "single") await loadSingleWindow();
  if (isDraftThread(state.currentThread)) await materializeCurrentThread();
  if (!state.currentThreadId) throw new Error("请先打开一个可发送的对话。");
  const directoryPlan = currentUploadSidebarModel()?.serverFilePickerDirectoryPlan?.({
    auth: state.auth,
    threadId: state.currentThreadId,
  }) || null;
  if (directoryPlan && !directoryPlan.ok) throw new Error(directoryPlan.message || directoryPlan.code || "服务器文件选择不可用。");
  state.serverFileAttachmentTargetThreadId = state.currentThreadId;
  state.serverFileAttachmentPickerOpen = true;
  state.directoryReturnRoute = typeof captureDirectoryReturnRoute === "function" ? captureDirectoryReturnRoute() : state.directoryReturnRoute;
  state.viewMode = "projects";
  localStorage.setItem("hermesWebViewMode", state.viewMode);
  state.directoryPath = directoryPlan?.directoryPath || systemShareDirectoryPath();
  state.directoryRootPath = directoryPlan?.rootPath || "";
  state.directoryPreview = directoryPlan?.clearPreview === false ? state.directoryPreview : null;
  state.directoryError = "";
  state.sharedDirectoryManagerOpen = false;
  applyViewMode();
  await loadProjects();
  ensureDirectoryRootForPath(state.directoryPath);
  await loadDirectoryView();
  if (isMobileLayout()) closeSidebar();
}

async function attachServerFileToComposer(entry = {}) {
  if (!serverFileAttachmentOwnerOnly()) {
    showError(new Error("服务器文件附件仅限 Owner。"));
    return false;
  }
  const threadId = state.serverFileAttachmentTargetThreadId || state.currentThreadId || "";
  const filePath = String(entry.path || "").trim();
  if (!threadId || !filePath) return;
  const requestPlan = currentUploadSidebarModel()?.serverFileAttachmentRequestPlan?.({
    auth: state.auth,
    threadId,
    workspaceId: entry.workspaceId || uploadSidebarWorkspaceId(),
    entry: { path: filePath, name: entry.name || "" },
  }) || null;
  if (requestPlan && !requestPlan.ok) {
    showError(new Error(requestPlan.message || requestPlan.code || "服务器文件附件不可用。"));
    return false;
  }
  $("connectionState").textContent = "Attaching";
  try {
    const result = await api(`/api/threads/${encodeURIComponent(threadId)}/server-file-attachments`, {
      method: "POST",
      body: JSON.stringify({
        path: filePath,
        filename: entry.name || "",
        workspaceId: entry.workspaceId || state.selectedWorkspaceId || "owner",
      }),
    });
    if (result.artifact && !state.pendingArtifacts.some((item) => item.id === result.artifact.id)) {
      state.pendingArtifacts.push(result.artifact);
    }
    state.serverFileAttachmentTargetThreadId = "";
    if (entry.restore !== false) restoreAfterServerFileAttachmentPicker();
    renderPendingArtifacts();
    updateComposerAction();
    $("connectionState").textContent = "Home AI OK";
    return true;
  } catch (err) {
    showError(err);
    return false;
  }
}

installNativeShareReceiver();

async function interruptRun() {
  if (!state.currentThreadId) return;
  const body = state.viewMode === "tasks" && state.currentTaskGroupId ? { taskGroupId: state.currentTaskGroupId } : {};
  await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/interrupt`, {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: 6000,
  }).catch((err) => {
    if (err?.code === "request_timeout") {
      showError(new Error("Stop request timed out; the run may still be stopping in the background."));
      return;
    }
    showError(err);
  });
}

function sidebarScrollTarget(target) {
  const sidebar = $("sidebar");
  if (!sidebar) return null;
  const element = target?.closest ? target : target?.parentElement;
  const threadList = element?.closest?.(".thread-list");
  if (threadList && threadList.scrollHeight > threadList.clientHeight + 1) return threadList;
  return sidebar;
}

function canNativeScrollSidebarTarget(target, delta) {
  if (!target) return false;
  const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
  if (maxScroll <= 1) return false;
  if (delta > 0) return target.scrollTop < maxScroll - 1;
  if (delta < 0) return target.scrollTop > 1;
  return true;
}

function wireSidebarTouchScroll() {
  const sidebar = $("sidebar");
  if (!sidebar) return;
  let gesture = null;
  sidebar.addEventListener("touchstart", (event) => {
    if (!isMobileLayout() || event.touches.length !== 1) return;
    gesture = {
      startY: event.touches[0].clientY,
      lastY: event.touches[0].clientY,
      target: sidebarScrollTarget(event.target),
    };
  }, { passive: true });
  sidebar.addEventListener("touchmove", (event) => {
    if (!gesture || !isMobileLayout() || event.touches.length !== 1) return;
    if (event.target?.closest?.(".thread-list")) return;
    const x = event.touches[0].clientX;
    const dx = x - (state.sidebarSwipe?.startX ?? x);
    const dyFromSwipe = event.touches[0].clientY - (state.sidebarSwipe?.startY ?? event.touches[0].clientY);
    if (state.sidebarSwipe?.mode === "close" && Math.abs(dx) > Math.abs(dyFromSwipe) * 1.15 && Math.abs(dx) > 12) {
      return;
    }
    const y = event.touches[0].clientY;
    const delta = gesture.lastY - y;
    gesture.lastY = y;
    if (Math.abs(y - gesture.startY) < 2) return;
    const target = gesture.target || sidebarScrollTarget(event.target);
    if (!target) return;
    if (canNativeScrollSidebarTarget(target, delta)) return;
    if (target === sidebar && event.target?.closest?.(".thread-list")) return;
    event.preventDefault();
  }, { passive: false });
  const end = () => {
    gesture = null;
  };
  sidebar.addEventListener("touchend", end, { passive: true });
  sidebar.addEventListener("touchcancel", end, { passive: true });
}

function wireSidebarSwipe() {
  const sidebar = $("sidebar");
  const edge = $("edgeSwipeZone");
  const overlay = $("sidebarOverlay");
  if (!sidebar || !edge) return;

  const bottomNavigationOwnsTouch = (event) => {
    const nav = $("bottomNav");
    if (!nav || nav.hidden || event.touches.length !== 1) return false;
    if (event.target?.closest?.("#bottomNav")) return true;
    const rect = nav.getBoundingClientRect?.();
    if (!rect) return false;
    const point = event.touches[0];
    return point.clientY >= rect.top - 8 && point.clientY <= rect.bottom + 8;
  };

  const startSwipe = (mode, event) => {
    if (!isMobileLayout() || event.touches.length !== 1) return;
    if (mode === "close" && !sidebar.classList.contains("open")) return;
    if (mode === "edge" && sidebar.classList.contains("open")) return;
    state.sidebarSwipe = {
      mode,
      startX: event.touches[0].clientX,
      startY: event.touches[0].clientY,
      lastX: event.touches[0].clientX,
      startedAt: performance.now(),
      width: sidebarDragWidth(sidebar),
      dragging: false,
      handled: false,
    };
  };

  const moveSwipe = (event) => {
    const swipe = state.sidebarSwipe;
    if (!swipe || !isMobileLayout() || event.touches.length !== 1 || swipe.handled) return;
    if (event.target?.closest?.(".thread-list")) return;
    const x = event.touches[0].clientX;
    const y = event.touches[0].clientY;
    const dx = x - swipe.startX;
    const dy = y - swipe.startY;
    const horizontal = Math.abs(dx);
    const vertical = Math.abs(dy);
    if (horizontal < 18 || horizontal < vertical * 1.15) return;
    const target = swipe.mode === "edge" && dx > 0 ? backSwipeTarget() : "";
    if (target) {
      if (!swipe.backTarget) {
        swipe.backTarget = target;
        swipe.surface = backSwipeSurface(target);
        if (!swipe.surface) return;
      }
      swipe.dragging = true;
      swipe.lastX = x;
      applyBackSwipeDrag(swipe, dx);
      event.preventDefault();
      return;
    }
    const canDragSidebar = swipe.mode === "close" && dx < 0;
    if (!canDragSidebar) return;
    swipe.dragging = true;
    swipe.lastX = x;
    const width = swipe.width || sidebarDragWidth(sidebar);
    const progress = swipe.mode === "edge" ? dx / width : 1 + dx / width;
    swipe.lastProgress = clamp01(progress);
    applySidebarDragProgress(swipe.lastProgress);
    event.preventDefault();
  };

  const endSwipe = () => {
    const swipe = state.sidebarSwipe;
    state.sidebarSwipe = null;
    if (!swipe?.dragging) return;
    const elapsed = Math.max(1, performance.now() - (swipe.startedAt || performance.now()));
    const dx = (swipe.lastX || swipe.startX) - swipe.startX;
    const velocity = dx / elapsed;
    if (swipe.backTarget) {
      const accepted = (swipe.progress || 0) > 0.34 || velocity > 0.55;
      if (swipe.backTarget === "directory") {
        swipe.surface?.classList.remove("page-back-dragging", "page-back-settling");
        if (accepted) navigateDirectoryUp({ exitShell: swipe.surface, animateEntry: true }).catch(showError);
        else settleDirectorySwipeShell(swipe.surface, false).catch(showError);
      } else {
        settleBackSwipe({ surface: swipe.surface, target: swipe.backTarget }, accepted);
      }
      return;
    }
    const progress = clamp01(swipe.lastProgress);
    if (swipe.mode === "edge") {
      settleSidebarDrag(progress > 0.38 || velocity > 0.55);
    } else if (swipe.mode === "close") {
      settleSidebarDrag(!(progress < 0.7 || velocity < -0.55));
    } else {
      clearSidebarDragStyles();
    }
  };

  const cancelSwipe = () => {
    const swipe = state.sidebarSwipe;
    state.sidebarSwipe = null;
    if (swipe?.backTarget) {
      if (swipe.backTarget === "directory") {
        swipe.surface?.classList.remove("page-back-dragging", "page-back-settling");
        settleDirectorySwipeShell(swipe.surface, false).catch(showError);
      }
      else settleBackSwipe({ surface: swipe.surface, target: swipe.backTarget }, false);
      return;
    }
    if (swipe?.dragging) {
      settleSidebarDrag(swipe.mode === "close");
    } else {
      clearSidebarDragStyles();
    }
  };

  const startEdgeSwipe = (event) => {
    if (!isMobileLayout() || event.touches.length !== 1) return;
    if (bottomNavigationOwnsTouch(event)) return;
    if (typeof globalPluginDockOwnsTouchTarget === "function" && globalPluginDockOwnsTouchTarget(event.target)) return;
    if (edge.classList.contains("disabled")) return;
    if (event.touches[0].clientX > EDGE_SWIPE_HIT_PX) return;
    startSwipe("edge", event);
    event.preventDefault();
  };
  const moveEdgeSwipe = (event) => {
    if (state.sidebarSwipe?.mode === "edge") moveSwipe(event);
  };
  const endEdgeSwipe = () => {
    if (state.sidebarSwipe?.mode === "edge") endSwipe();
  };
  const cancelEdgeSwipe = () => {
    if (state.sidebarSwipe?.mode === "edge") cancelSwipe();
  };

  document.addEventListener("touchstart", startEdgeSwipe, { passive: false, capture: true });
  document.addEventListener("touchmove", moveEdgeSwipe, { passive: false, capture: true });
  document.addEventListener("touchend", endEdgeSwipe, { passive: true, capture: true });
  document.addEventListener("touchcancel", cancelEdgeSwipe, { passive: true, capture: true });

  sidebar.addEventListener("touchstart", (event) => startSwipe("close", event), { passive: true });
  sidebar.addEventListener("touchmove", moveSwipe, { passive: false });
  sidebar.addEventListener("touchend", endSwipe, { passive: true });
  sidebar.addEventListener("touchcancel", cancelSwipe, { passive: true });

  overlay?.addEventListener("click", closeSidebar);
}

function wireRightSwipeGuard() {
  if (document.documentElement.dataset.rightSwipeGuardBound) return;
  document.documentElement.dataset.rightSwipeGuardBound = "1";
  let touch = null;
  const interactiveSelector = ".sidebar, .directory-shell, input, select, textarea, [contenteditable='true']";
  const messageSelectionSwipeBlockSelector = ".message[data-message-id], .assistant-receipt, .text-content";
  const taskListScrollSelector = ".task-list-mode .conversation, .task-list-mode .thread-list";
  const bottomNavigationOwnsTouch = (event) => {
    const nav = $("bottomNav");
    if (!nav || nav.hidden || event.touches.length !== 1) return false;
    if (event.target?.closest?.("#bottomNav")) return true;
    const rect = nav.getBoundingClientRect?.();
    if (!rect) return false;
    const point = event.touches[0];
    return point.clientY >= rect.top - 8 && point.clientY <= rect.bottom + 8;
  };
  const clear = () => {
    touch = null;
  };
  document.addEventListener("touchstart", (event) => {
    if (
      !isMobileLayout()
      || event.touches.length !== 1
      || event.target?.closest?.(interactiveSelector)
      || bottomNavigationOwnsTouch(event)
      || event.target?.closest?.(messageSelectionSwipeBlockSelector)
      || (typeof globalPluginDockOwnsTouchTarget === "function" && globalPluginDockOwnsTouchTarget(event.target))
    ) {
      touch = null;
      return;
    }
    const point = event.touches[0];
    const previewUi = window.TaskDocumentPreviewUi || {};
    const previewOpen = Boolean(previewUi.hasArtifactPreviewOverlay?.());
    const target = previewOpen ? "artifact-preview" : backSwipeTarget();
    const primaryBackBounce = !previewOpen
      && typeof androidPrimaryBackBounceTarget === "function"
      && androidPrimaryBackBounceTarget(target);
    touch = {
      startX: point.clientX,
      startY: point.clientY,
      lastX: point.clientX,
      startedAt: performance.now(),
      blocked: point.clientX <= EDGE_SWIPE_HIT_PX,
      accepted: false,
      target,
      primaryBackBounce,
      surface: previewOpen
        ? previewUi.previewBackSwipeSurface?.()
        : (primaryBackBounce ? null : (target ? backSwipeSurface(target) : document.querySelector(".main"))),
    };
    if (touch.blocked) event.preventDefault();
  }, { passive: false, capture: true });
  document.addEventListener("touchmove", (event) => {
    if (!touch || !isMobileLayout() || event.touches.length !== 1) return;
    const point = event.touches[0];
    const dx = point.clientX - touch.startX;
    const dy = point.clientY - touch.startY;
    const horizontal = Math.abs(dx);
    const vertical = Math.abs(dy);
    if (event.target?.closest?.(taskListScrollSelector) && vertical >= horizontal * 0.9) return;
    if (dx <= 0 || (!touch.blocked && (horizontal < 12 || horizontal < vertical * 1.1))) return;
    touch.blocked = true;
    touch.lastX = point.clientX;
    const elapsed = Math.max(1, performance.now() - (touch.startedAt || performance.now()));
    const velocity = dx / elapsed;
    touch.accepted = dx > 58 || velocity > 0.55;
    if (touch.primaryBackBounce && typeof showAndroidBackBounceIndicator === "function") {
      showAndroidBackBounceIndicator(Math.min(1, dx / 72));
    } else if (touch.surface) {
      applyBackSwipeDrag(touch, dx);
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }, { passive: false, capture: true });
  document.addEventListener("touchend", () => {
    const current = touch;
    clear();
    if (!current?.blocked || !isMobileLayout()) return;
    if (current.primaryBackBounce) {
      if (typeof showAndroidBackBounceIndicator === "function") {
        showAndroidBackBounceIndicator(Math.min(1, Math.max(0.3, ((current.lastX || current.startX) - current.startX) / 72)), { settling: true });
      }
      return;
    }
    if (current.surface) {
      current.surface.classList.remove("page-back-dragging");
      current.surface.classList.add("page-back-settling");
      current.surface.style.transform = "";
      window.setTimeout(() => clearBackSwipeSurface(current.surface), prefersReducedMotion() ? 0 : 180);
    }
    if (!current.accepted || !current.target) return;
    if (current.target === "artifact-preview") {
      window.TaskDocumentPreviewUi?.closeActivePreviewFromUser?.();
      return;
    }
    handleInAppBackNavigation({ animateEntry: true }).catch(showError);
  }, { passive: true, capture: true });
  document.addEventListener("touchcancel", () => {
    const current = touch;
    clear();
    if (current?.surface) {
      current.surface.classList.remove("page-back-dragging");
      current.surface.classList.add("page-back-settling");
      current.surface.style.transform = "";
      window.setTimeout(() => clearBackSwipeSurface(current.surface), prefersReducedMotion() ? 0 : 180);
    }
  }, { passive: true, capture: true });
}
