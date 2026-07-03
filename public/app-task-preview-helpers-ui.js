"use strict";

(function initTaskDocumentPreviewHelpers(global) {
  function escapeValue(value) {
    if (typeof global.escapeHtml === "function") return global.escapeHtml(value);
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function runtimeFacade() {
    return global.HomeAiRuntimeFacade || null;
  }

  function previewShareUrl(value) {
    const runtime = runtimeFacade();
    if (runtime?.documentPreview?.absoluteUrl) return runtime.documentPreview.absoluteUrl(value);
    try {
      return new URL(value, global.location.href).href;
    } catch (_) {
      return String(value || "");
    }
  }

  function currentWorkspaceId() {
    const runtime = runtimeFacade();
    const runtimeWorkspace = runtime?.state?.get?.("selectedWorkspaceId");
    if (runtimeWorkspace) return runtimeWorkspace;
    try {
      if (typeof state !== "undefined" && state?.selectedWorkspaceId) return state.selectedWorkspaceId;
    } catch (_) {}
    return "owner";
  }

  async function previewApi(path, options = {}) {
    const runtime = runtimeFacade();
    if (typeof runtime?.api === "function") return runtime.api(path, options);
    if (typeof api === "function") return api(path, options);
    throw new Error("预览接口未就绪");
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function generatedBaseName(title, extension) {
    const raw = String(title || "hermes-document").trim() || "hermes-document";
    const withoutQuery = raw.split(/[?#]/)[0] || "hermes-document";
    const base = withoutQuery.replace(/\.[a-z0-9]+$/i, "").replace(/[\\/:*?"<>|]+/g, "-").trim() || "hermes-document";
    return `${base}.${extension}`;
  }

  function canShareFiles(files) {
    return Boolean(navigator.share && (!navigator.canShare || navigator.canShare({ files })));
  }

  function isUserCancelledShare(err) {
    const name = String(err?.name || "");
    return name === "AbortError" || name === "NotAllowedError";
  }

  function downloadGeneratedBlob(blob, filename) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    global.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
  }

  function transientPreviewStatus(root, message, kind = "") {
    const node = root?.querySelector?.("[data-preview-status]");
    if (!node) return;
    node.textContent = message || "";
    node.hidden = !message;
    node.classList.toggle("error", kind === "error");
    node.classList.toggle("success", kind === "success");
  }

  async function copyPreviewLink(url) {
    if (typeof global.copyTextToClipboard === "function") {
      await global.copyTextToClipboard(url);
      return true;
    }
    if (navigator.clipboard?.writeText && global.isSecureContext) {
      await navigator.clipboard.writeText(url);
      return true;
    }
    return false;
  }

  async function sharePreviewLink(url, title) {
    const shareUrl = previewShareUrl(url);
    if (!shareUrl) return false;
    if (navigator.share) {
      await navigator.share({ title: title || "Home AI", url: shareUrl });
      return true;
    }
    return copyPreviewLink(shareUrl);
  }

  async function fetchPreviewBlob(url) {
    const runtime = runtimeFacade();
    if (typeof runtime?.documentPreview?.fetchBlob === "function") {
      return runtime.documentPreview.fetchBlob(url);
    }
    throw new Error("文件预览下载未就绪");
  }

  async function fetchPreviewText(url) {
    const blob = await fetchPreviewBlob(url);
    if (typeof blob?.text === "function") return blob.text();
    if (typeof Response === "function") return new Response(blob).text();
    throw new Error("文件预览下载未就绪");
  }

  async function savePreviewImageToAlbum(input = {}) {
    const root = input.root;
    const title = input.title || "image";
    transientPreviewStatus(root, "正在准备图片...");
    const blob = await fetchPreviewBlob(input.sourceUrl || "");
    const file = new File([blob], title, { type: blob.type || input.mime || "image/*" });
    if (canShareFiles([file])) {
      await navigator.share({ files: [file], title });
      transientPreviewStatus(root, "已打开系统保存面板", "success");
      return;
    }
    downloadGeneratedBlob(blob, title);
    transientPreviewStatus(root, "已请求保存图片；如未进入相册，请长按图片保存。", "success");
  }

  function closePreviewMenus(except) {
    document.querySelectorAll(".task-preview-more-wrap.open").forEach((node) => {
      if (node === except) return;
      node.classList.remove("open");
      node.querySelector(".task-preview-more-button")?.setAttribute("aria-expanded", "false");
      const menu = node.querySelector(".task-preview-more-menu");
      if (menu) menu.hidden = true;
    });
  }

  function bindPreviewMoreMenu(root, input = {}) {
    const wrap = root.querySelector(".task-preview-more-wrap");
    const button = root.querySelector(".task-preview-more-button");
    const menu = root.querySelector(".task-preview-more-menu");
    if (!wrap || !button || !menu) return;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nextOpen = !wrap.classList.contains("open");
      closePreviewMenus(wrap);
      wrap.classList.toggle("open", nextOpen);
      button.setAttribute("aria-expanded", nextOpen ? "true" : "false");
      menu.hidden = !nextOpen;
    });
    root.querySelectorAll("[data-preview-action]").forEach((item) => item.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      closePreviewMenus();
      item.disabled = true;
      try {
        await input.onAction?.(item.dataset.previewAction || "", item);
      } catch (err) {
        if (!isUserCancelledShare(err)) transientPreviewStatus(root, err.message || "操作失败", "error");
      } finally {
        item.disabled = false;
      }
    }));
  }

  function hasArtifactPreviewOverlay() {
    return Boolean(
      document.getElementById("taskImagePreviewOverlay")
      || document.getElementById("taskDocumentPreviewOverlay")
      || document.getElementById("taskMarkdownPreviewOverlay")
    );
  }

  function previewBackSwipeSurface() {
    return document.querySelector(".task-markdown-preview-shell")
      || document.querySelector(".task-document-preview-shell")
      || document.querySelector(".task-image-preview-stage")
      || document.getElementById("taskMarkdownPreviewOverlay")
      || document.getElementById("taskDocumentPreviewOverlay")
      || document.getElementById("taskImagePreviewOverlay");
  }

  global.TaskDocumentPreviewHelpers = {
    escapeValue,
    previewShareUrl,
    currentWorkspaceId,
    previewApi,
    bytesToBase64,
    generatedBaseName,
    canShareFiles,
    isUserCancelledShare,
    downloadGeneratedBlob,
    transientPreviewStatus,
    copyPreviewLink,
    sharePreviewLink,
    fetchPreviewBlob,
    fetchPreviewText,
    savePreviewImageToAlbum,
    closePreviewMenus,
    bindPreviewMoreMenu,
    hasArtifactPreviewOverlay,
    previewBackSwipeSurface,
  };
}(window));
