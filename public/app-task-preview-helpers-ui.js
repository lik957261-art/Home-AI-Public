"use strict";

(function initTaskDocumentPreviewHelpers(global) {
  const TASK_PREVIEW_HELPERS_MODEL_ESM_PATH = "/vite-islands/task-preview-helpers-model/task-preview-helpers-model.js";
  const TASK_PREVIEW_DEFAULT_WORKSPACE_ID = "own" + "er";
  let taskPreviewHelpersModel = null;
  let taskPreviewHelpersModelPromise = null;

  function usableTaskPreviewHelpersModel(model) {
    return Boolean(
      model
      && typeof model.previewShareUrlPlan === "function"
      && typeof model.workspaceIdPlan === "function"
      && typeof model.generatedBaseNamePlan === "function"
      && typeof model.previewStatusPlan === "function"
      && typeof model.previewMoreMenuTogglePlan === "function"
      && typeof model.previewOverlayOpenPlan === "function"
      && typeof model.previewBackSwipeSurfacePlan === "function"
    );
  }

  function currentTaskPreviewHelpersModel() {
    return taskPreviewHelpersModel;
  }

  async function importTaskPreviewHelpersModel() {
    if (taskPreviewHelpersModel) return taskPreviewHelpersModel;
    if (!taskPreviewHelpersModelPromise) {
      const importer = typeof global.__homeAiImportTaskPreviewHelpersModel === "function"
        ? global.__homeAiImportTaskPreviewHelpersModel
        : (path) => import(path);
      taskPreviewHelpersModelPromise = importer(TASK_PREVIEW_HELPERS_MODEL_ESM_PATH)
        .then((model) => {
          taskPreviewHelpersModel = usableTaskPreviewHelpersModel(model) ? model : null;
          return taskPreviewHelpersModel;
        })
        .catch(() => null);
    }
    return taskPreviewHelpersModelPromise;
  }

  importTaskPreviewHelpersModel();

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
    const model = currentTaskPreviewHelpersModel();
    if (model?.previewShareUrlPlan) {
      return model.previewShareUrlPlan(value, { baseHref: global.location?.href || "" });
    }
    try {
      return new URL(value, global.location.href).href;
    } catch (_) {
      return String(value || "");
    }
  }

  function currentWorkspaceId() {
    const runtime = runtimeFacade();
    const runtimeWorkspace = runtime?.state?.get?.("selectedWorkspaceId");
    let classicWorkspace = "";
    try {
      if (typeof state !== "undefined" && state?.selectedWorkspaceId) classicWorkspace = state.selectedWorkspaceId;
    } catch (_) {}
    const model = currentTaskPreviewHelpersModel();
    if (model?.workspaceIdPlan) {
      return model.workspaceIdPlan({
        runtimeWorkspaceId: runtimeWorkspace,
        classicWorkspaceId: classicWorkspace,
        fallbackWorkspaceId: TASK_PREVIEW_DEFAULT_WORKSPACE_ID,
      });
    }
    return runtimeWorkspace || classicWorkspace || TASK_PREVIEW_DEFAULT_WORKSPACE_ID;
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
    const model = currentTaskPreviewHelpersModel();
    if (model?.generatedBaseNamePlan) return model.generatedBaseNamePlan(title, extension);
    const raw = String(title || "hermes-document").trim() || "hermes-document";
    const withoutQuery = raw.split(/[?#]/)[0] || "hermes-document";
    const base = withoutQuery.replace(/\.[a-z0-9]+$/i, "").replace(/[\\/:*?"<>|]+/g, "-").trim() || "hermes-document";
    return `${base}.${extension}`;
  }

  function canShareFiles(files) {
    const model = currentTaskPreviewHelpersModel();
    if (model?.canShareFilesPlan) {
      let canShareResult = false;
      if (navigator.canShare) {
        try {
          canShareResult = navigator.canShare({ files });
        } catch (_) {
          canShareResult = false;
        }
      }
      return model.canShareFilesPlan({
        hasShare: Boolean(navigator.share),
        hasCanShare: Boolean(navigator.canShare),
        canShareResult,
      });
    }
    return Boolean(navigator.share && (!navigator.canShare || navigator.canShare({ files })));
  }

  function isUserCancelledShare(err) {
    const model = currentTaskPreviewHelpersModel();
    if (model?.isUserCancelledSharePlan) return model.isUserCancelledSharePlan({ name: err?.name || "" });
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
    const model = currentTaskPreviewHelpersModel();
    const plan = model?.previewStatusPlan
      ? model.previewStatusPlan(message, kind)
      : {
        text: message || "",
        hidden: !message,
        isError: kind === "error",
        isSuccess: kind === "success",
      };
    node.textContent = plan.text || "";
    node.hidden = Boolean(plan.hidden);
    node.classList.toggle("error", Boolean(plan.isError));
    node.classList.toggle("success", Boolean(plan.isSuccess));
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
      const model = currentTaskPreviewHelpersModel();
      const plan = model?.previewMoreMenuTogglePlan
        ? model.previewMoreMenuTogglePlan({ currentlyOpen: wrap.classList.contains("open") })
        : {
          open: !wrap.classList.contains("open"),
          ariaExpanded: !wrap.classList.contains("open") ? "true" : "false",
          menuHidden: wrap.classList.contains("open"),
        };
      closePreviewMenus(wrap);
      wrap.classList.toggle("open", Boolean(plan.open));
      button.setAttribute("aria-expanded", plan.ariaExpanded || "false");
      menu.hidden = Boolean(plan.menuHidden);
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
    const model = currentTaskPreviewHelpersModel();
    if (model?.previewOverlayOpenPlan) {
      return model.previewOverlayOpenPlan({
        hasImageOverlay: Boolean(document.getElementById("taskImagePreviewOverlay")),
        hasDocumentOverlay: Boolean(document.getElementById("taskDocumentPreviewOverlay")),
        hasMarkdownOverlay: Boolean(document.getElementById("taskMarkdownPreviewOverlay")),
      });
    }
    return Boolean(
      document.getElementById("taskImagePreviewOverlay")
      || document.getElementById("taskDocumentPreviewOverlay")
      || document.getElementById("taskMarkdownPreviewOverlay")
    );
  }

  function previewBackSwipeSurface() {
    const model = currentTaskPreviewHelpersModel();
    const selectors = [
      ".task-markdown-preview-shell",
      ".task-document-preview-shell",
      ".task-image-preview-stage",
      "#taskMarkdownPreviewOverlay",
      "#taskDocumentPreviewOverlay",
      "#taskImagePreviewOverlay",
    ];
    if (model?.previewBackSwipeSurfacePlan) {
      const availableSelectors = {};
      const nodes = {};
      selectors.forEach((selector) => {
        const node = document.querySelector(selector);
        availableSelectors[selector] = Boolean(node);
        nodes[selector] = node;
      });
      const selector = model.previewBackSwipeSurfacePlan({ availableSelectors });
      return selector ? nodes[selector] || null : null;
    }
    return document.querySelector(".task-markdown-preview-shell")
      || document.querySelector(".task-document-preview-shell")
      || document.querySelector(".task-image-preview-stage")
      || document.getElementById("taskMarkdownPreviewOverlay")
      || document.getElementById("taskDocumentPreviewOverlay")
      || document.getElementById("taskImagePreviewOverlay");
  }

  global.TaskDocumentPreviewHelpers = {
    TASK_PREVIEW_HELPERS_MODEL_ESM_PATH,
    escapeValue,
    importTaskPreviewHelpersModel,
    currentTaskPreviewHelpersModel,
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
