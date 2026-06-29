"use strict";

(function initTaskDocumentPreviewUi(global) {
  const PREVIEW_HISTORY_KEY = "__hermesTaskPreview";

  const {
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
    savePreviewImageToAlbum,
    closePreviewMenus,
    bindPreviewMoreMenu,
    hasArtifactPreviewOverlay,
    previewBackSwipeSurface,
  } = global.TaskDocumentPreviewHelpers || {};

  function isPreviewHistoryActive() {
    try {
      return Boolean(global.history?.state?.[PREVIEW_HISTORY_KEY]);
    } catch (_) {
      return false;
    }
  }

  function markPreviewHistory(kind) {
    try {
      if (!global.history?.pushState) return;
      const baseState = global.history.state && typeof global.history.state === "object"
        ? { ...global.history.state }
        : {};
      const nextState = { ...baseState, [PREVIEW_HISTORY_KEY]: kind };
      if (baseState[PREVIEW_HISTORY_KEY]) {
        global.history.replaceState(nextState, "", global.location.href);
      } else {
        global.history.pushState(nextState, "", global.location.href);
      }
    } catch (_) {
      // Browser history is best-effort; the explicit close button still works.
    }
  }

  function closePreviewFromUser(closeFn) {
    const historyActive = isPreviewHistoryActive();
    if (historyActive && global.history?.back) {
      try {
        global.history.back();
        return;
      } catch (_) {
        // Fall through and clear the marker if the browser refuses history.back().
      }
    }
    closeFn();
    if (historyActive) {
      try {
        const nextState = { ...(global.history.state || {}) };
        delete nextState[PREVIEW_HISTORY_KEY];
        global.history.replaceState(nextState, "", global.location.href);
      } catch (_) {}
    }
  }

  function closeActivePreviewFromUser() {
    closePreviewFromUser(closeArtifactPreviewOverlays);
  }

  function closeImagePreviewOverlay() {
    const overlay = document.getElementById("taskImagePreviewOverlay");
    if (!overlay) return;
    overlay.remove();
    document.body.classList.remove("task-image-preview-open");
  }

  function closeMarkdownPreviewOverlay() {
    const overlay = document.getElementById("taskMarkdownPreviewOverlay");
    if (!overlay) return;
    overlay.remove();
    document.body.classList.remove("task-markdown-preview-open");
  }

  function closeDocumentPreviewOverlay() {
    const overlay = document.getElementById("taskDocumentPreviewOverlay");
    if (!overlay) return;
    overlay.remove();
    document.body.classList.remove("task-document-preview-open");
  }

  function closeArtifactPreviewOverlays() {
    closeImagePreviewOverlay();
    closeMarkdownPreviewOverlay();
    closeDocumentPreviewOverlay();
  }

  global.addEventListener("popstate", (event) => {
    if (!hasArtifactPreviewOverlay()) return;
    closeArtifactPreviewOverlays();
    event?.stopImmediatePropagation?.();
    event?.stopPropagation?.();
  }, { capture: true });

  function isImagePreviewLink(link) {
    const mime = String(link?.dataset?.artifactMime || "").toLowerCase();
    if (mime.startsWith("image/")) return true;
    const href = String(link?.href || link?.getAttribute?.("href") || "").toLowerCase();
    return /\.(png|jpe?g|gif|webp|avif|bmp|heic|heif)(?:[?#]|$)/i.test(href);
  }

  async function forwardMarkdownToGroup(markdown, title) {
    const text = String(markdown || "");
    if (!text.trim()) throw new Error("Markdown 内容为空");
    const workspaceId = currentWorkspaceId();
    const singleWindow = await previewApi("/api/single-window", {
      method: "POST",
      body: JSON.stringify({ workspaceId, groupChat: true }),
    });
    const threadId = singleWindow.thread?.id || "";
    if (!threadId) throw new Error("群聊线程不可用");
    const filename = /\.md$/i.test(String(title || "")) ? title : generatedBaseName(title, "md");
    const upload = await previewApi(`/api/threads/${encodeURIComponent(threadId)}/uploads`, {
      method: "POST",
      body: JSON.stringify({
        filename,
        type: "text/markdown; charset=utf-8",
        dataBase64: bytesToBase64(new TextEncoder().encode(text)),
      }),
    });
    if (!upload.artifact) throw new Error("Markdown 上传失败");
    await previewApi(`/api/threads/${encodeURIComponent(threadId)}/messages`, {
      method: "POST",
      body: JSON.stringify({
        text: `转发 Markdown：${filename}`,
        artifacts: [upload.artifact],
        workspaceId,
        singleWindowMode: "chat",
        taskGroupId: "group-chat",
        messageKind: "plain",
      }),
    });
  }

  async function forwardFileLinkToGroup(sourceUrl, title) {
    const url = previewShareUrl(sourceUrl);
    if (!url) throw new Error("没有可转发的文件地址");
    const workspaceId = currentWorkspaceId();
    const singleWindow = await previewApi("/api/single-window", {
      method: "POST",
      body: JSON.stringify({ workspaceId, groupChat: true }),
    });
    const threadId = singleWindow.thread?.id || "";
    if (!threadId) throw new Error("群聊线程不可用");
    await previewApi(`/api/threads/${encodeURIComponent(threadId)}/messages`, {
      method: "POST",
      body: JSON.stringify({
        text: `转发文件：${title || "文件"}\n${url}`,
        workspaceId,
        singleWindowMode: "chat",
        taskGroupId: "group-chat",
        messageKind: "plain",
      }),
    });
  }

  async function handleFilePreviewAction(action, input = {}) {
    const root = input.root;
    const title = input.title || "Home AI";
    const sourceUrl = input.sourceUrl || "";
    transientPreviewStatus(root, "");
    if (action === "group") {
      transientPreviewStatus(root, "正在转发到群...");
      await forwardFileLinkToGroup(sourceUrl, title);
      transientPreviewStatus(root, "已转发到群", "success");
    } else if (action === "system") {
      if (await openNativeDocumentOpenInFromInput(input, {
        onFailure: () => transientPreviewStatus(root, "系统打开方式不可用，改用分享。"),
      })) {
        transientPreviewStatus(root, "已打开系统打开方式", "success");
        return;
      }
      await shareOrDownloadOriginalFile(input);
    } else if (action === "native-preview") {
      if (openNativeShellDocumentPreviewFromInput(input)) {
        transientPreviewStatus(root, "正在打开系统预览...", "success");
        return;
      }
      const url = previewShareUrl(sourceUrl);
      if (url) global.location.assign(url);
    } else if (action === "save-album") {
      await savePreviewImageToAlbum(input);
    } else if (action === "copy") {
      await copyPreviewLink(previewShareUrl(sourceUrl));
      transientPreviewStatus(root, "已复制链接", "success");
    } else if (action === "open") {
      const url = previewShareUrl(sourceUrl);
      if (url) global.location.assign(url);
    }
  }

  function openImagePreviewOverlay(link) {
    const href = link?.href || link?.getAttribute?.("href") || "";
    if (!href) return false;
    closeArtifactPreviewOverlays();
    const overlay = document.createElement("div");
    overlay.id = "taskImagePreviewOverlay";
    overlay.className = "task-image-preview-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    const title = String(link?.dataset?.artifactName || link?.getAttribute?.("aria-label") || "图片预览").trim();
    overlay.innerHTML = `
      <div class="task-preview-top-actions">
        <div class="task-preview-more-wrap">
          <button class="task-preview-more-button" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="更多操作">...</button>
          <div class="task-preview-more-menu" role="menu" hidden>
            <button type="button" role="menuitem" data-preview-action="group">分享到群</button>
            <button type="button" role="menuitem" data-preview-action="save-album">保存到相册</button>
            <button type="button" role="menuitem" data-preview-action="system">系统分享</button>
            <button type="button" role="menuitem" data-preview-action="copy">复制链接</button>
            <button type="button" role="menuitem" data-preview-action="open">打开原始文件</button>
          </div>
        </div>
        <button class="task-image-preview-close" type="button" aria-label="关闭预览">×</button>
      </div>
      <div class="task-image-preview-stage">
        <img class="task-image-preview-image" alt="${escapeValue(title)}">
      </div>
      <div class="task-preview-toast" data-preview-status hidden></div>
    `;
    const image = overlay.querySelector(".task-image-preview-image");
    image.src = href;
    image.decoding = "async";
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closePreviewFromUser(closeImagePreviewOverlay);
    });
    const closeButton = overlay.querySelector(".task-image-preview-close");
    ["pointerdown", "touchstart", "click"].forEach((eventName) => {
      closeButton.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        closePreviewFromUser(closeImagePreviewOverlay);
      }, { passive: false });
    });
    bindPreviewMoreMenu(overlay, {
      onAction: (action) => handleFilePreviewAction(action, {
        root: overlay,
        sourceUrl: href,
        title,
        mime: link?.dataset?.artifactMime || "image/*",
      }),
    });
    document.body.appendChild(overlay);
    document.body.classList.add("task-image-preview-open");
    markPreviewHistory("image");
    return true;
  }

  function isMarkdownPreviewLink(link) {
    const mime = String(link?.dataset?.artifactMime || "").toLowerCase();
    if (mime.includes("markdown") || mime === "text/x-markdown") return true;
    const href = String(link?.href || link?.getAttribute?.("href") || "");
    if (!href) return false;
    try {
      const url = new URL(href, global.location.origin);
      if (url.pathname === "/markdown-viewer.html") return true;
      return /\.md(?:[?#]|$)/i.test(url.pathname);
    } catch (_) {
      return /\.md(?:[?#]|$)/i.test(href);
    }
  }

  function markdownSourceFromLink(link) {
    const href = link?.href || link?.getAttribute?.("href") || "";
    if (!href) return "";
    try {
      const url = new URL(href, global.location.origin);
      if (url.pathname === "/markdown-viewer.html") return url.searchParams.get("src") || "";
      return url.href;
    } catch (_) {
      return href;
    }
  }

  function sameOriginPreviewUrl(value) {
    try {
      const url = new URL(value, global.location.origin);
      return url.origin === global.location.origin ? url : null;
    } catch (_) {
      return null;
    }
  }

  function markdownPreviewFetchUrl(value) {
    const url = sameOriginPreviewUrl(value);
    if (!url) return "";
    if (url.pathname === "/api/files") return `/api/files/preview?${url.searchParams.toString()}`;
    if (url.pathname === "/api/files/preview") return `/api/files/preview?${url.searchParams.toString()}`;
    if (url.pathname === "/api/automations/output") return `/api/automations/output/preview?${url.searchParams.toString()}`;
    if (url.pathname === "/api/automations/deliverable") return `/api/automations/deliverable/preview?${url.searchParams.toString()}`;
    if (url.pathname === "/api/kanban/cards/output") return `/api/kanban/cards/output/preview?${url.searchParams.toString()}`;
    const artifact = url.pathname.match(/^\/api\/artifacts\/([^/]+)$/);
    if (artifact) return `/api/files/preview?artifactId=${encodeURIComponent(decodeURIComponent(artifact[1]))}`;
    return "";
  }

  function sourceFromViewerUrl(url) {
    if (!url) return "";
    if (url.pathname === "/file-viewer.html" || url.pathname === "/pdf-viewer.html") {
      return url.searchParams.get("src") || "";
    }
    return url.href;
  }

  function documentSourceFromLink(link) {
    const href = link?.href || link?.getAttribute?.("href") || "";
    if (!href) return "";
    try {
      const url = new URL(href, global.location.origin);
      return sourceFromViewerUrl(url);
    } catch (_) {
      return href;
    }
  }

  function documentNativeUrlFromLink(link) {
    const source = documentSourceFromLink(link);
    const href = source || link?.href || link?.getAttribute?.("href") || "";
    if (!href) return "";
    try {
      const url = new URL(href, global.location.origin);
      if (url.origin !== global.location.origin) return "";
      return `${url.pathname}${url.search}${url.hash || ""}`;
    } catch (_) {
      return "";
    }
  }

  function currentNativeShellParam() {
    try {
      const params = new URLSearchParams(global.location?.search || "");
      const queryValue = params.get("nativeShell") || "";
      if (queryValue === "ios" || queryValue === "android") return queryValue;
    } catch (_) {}
    const root = global.document?.documentElement;
    const datasetValue = root?.dataset?.nativeShell || "";
    if (datasetValue === "ios" || datasetValue === "android") return datasetValue;
    try {
      const storedValue = global.localStorage?.getItem("homeAI.nativeShell") || "";
      if (storedValue === "ios" || storedValue === "android") return storedValue;
    } catch (_) {}
    return "";
  }

  function nativeDocumentPreviewRequestId() {
    try {
      if (global.crypto?.randomUUID) return `native_doc_${global.crypto.randomUUID()}`;
    } catch (err) {
      void err;
    }
    return `native_doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function parsedNativeDocumentResult(value) {
    if (!value) return null;
    if (typeof value === "object") return value;
    if (typeof value !== "string") return null;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function nativeDocumentResultForEvent(event) {
    return parsedNativeDocumentResult(event?.detail) || parsedNativeDocumentResult(event?.data) || null;
  }

  function rawAndroidNativeDocumentBridge() {
    const raw = global.HomeAIAndroidNativeDocument || null;
    return raw && typeof raw.open === "function" ? raw : null;
  }

  function rawIosNativeDocumentBridge() {
    const handlers = global.webkit?.messageHandlers || {};
    const handler = handlers.homeAINativeDocument || handlers.HomeAINativeDocument || null;
    return handler && typeof handler.postMessage === "function" ? handler : null;
  }

  function ensureNativeDocumentBridge() {
    const capability = global.HomeAINativeDocumentCapability || {};
    const bridge = global.HomeAINativeDocument || {};
    if (capability.documentPreview === true && typeof bridge.open === "function") return bridge;

    const androidBridge = rawAndroidNativeDocumentBridge();
    const iosBridge = rawIosNativeDocumentBridge();
    if (!androidBridge && !iosBridge) return null;

    const platform = androidBridge ? "android" : "ios";
    global.HomeAINativeDocumentCapability = Object.assign({}, capability, {
      documentPreview: true,
      platform: capability.platform || platform,
      version: capability.version || 1,
    });
    global.HomeAINativeDocument = Object.assign({}, bridge, {
      open(request) {
        const safeRequest = Object.assign({}, request || {});
        if (!safeRequest.requestId) safeRequest.requestId = nativeDocumentPreviewRequestId();
        return new Promise((resolve) => {
          let settled = false;
          let timeoutId = 0;
          const finish = (body) => {
            if (settled) return;
            settled = true;
            if (timeoutId) global.clearTimeout(timeoutId);
            global.removeEventListener?.("homeai:native-document-result", onResult);
            const result = parsedNativeDocumentResult(body) || {};
            resolve(Object.assign({ ok: result.ok !== false, requestId: safeRequest.requestId }, result));
          };
          const onResult = (event) => {
            const body = nativeDocumentResultForEvent(event);
            if (!body) return;
            if (body.requestId && body.requestId !== safeRequest.requestId) return;
            finish(body);
          };
          global.addEventListener?.("homeai:native-document-result", onResult);
          timeoutId = global.setTimeout?.(() => {
            finish({ ok: false, requestId: safeRequest.requestId, error: "native_document_result_timeout" });
          }, 15000);
          try {
            const payload = JSON.stringify(safeRequest);
            const immediate = androidBridge
              ? androidBridge.open(payload)
              : iosBridge.postMessage(safeRequest);
            const parsed = parsedNativeDocumentResult(immediate);
            if (parsed && (parsed.ok === false || parsed.ok === true || parsed.error)) finish(parsed);
          } catch (err) {
            finish({ ok: false, requestId: safeRequest.requestId, error: err?.message || "native_document_open_failed" });
          }
        });
      },
    });
    return global.HomeAINativeDocument;
  }

  function nativeDocumentBridgeAvailable() {
    return Boolean(ensureNativeDocumentBridge());
  }

  function nativeDocumentOpenInBridge() {
    const bridge = ensureNativeDocumentBridge();
    const capability = global.HomeAINativeDocumentCapability || {};
    if (capability.documentOpenIn === true && bridge && typeof bridge.open === "function") return bridge;
    return null;
  }

  function nativeDocumentOpenInAvailable() {
    return Boolean(nativeDocumentOpenInBridge());
  }

  function nativeDocumentBridgeExpected() {
    return Boolean(
      currentNativeShellParam()
      || nativeDocumentBridgeAvailable()
      || rawAndroidNativeDocumentBridge()
      || rawIosNativeDocumentBridge()
    );
  }

  function nativeDocumentKind(kind) {
    if (kind === "presentation") return "powerpoint";
    if (kind === "spreadsheet") return "spreadsheet";
    return kind || "file";
  }

  function nativeDocumentSupportedKind(kind) {
    return kind === "pdf" || kind === "word" || kind === "presentation";
  }

  function documentMimeFromLink(link) {
    const datasetMime = link?.dataset?.artifactMime || "";
    if (datasetMime) return datasetMime;
    const href = link?.href || link?.getAttribute?.("href") || "";
    try {
      const url = new URL(href, global.location.origin);
      return url.searchParams.get("mime") || "";
    } catch (_) {
      return "";
    }
  }

  function documentNameFromLink(link) {
    const datasetName = link?.dataset?.artifactName || "";
    if (datasetName) return datasetName;
    const href = link?.href || link?.getAttribute?.("href") || "";
    try {
      const url = new URL(href, global.location.origin);
      return url.searchParams.get("name") || url.pathname.split("/").pop() || "document";
    } catch (_) {
      return "document";
    }
  }

  function nativeDocumentSourceSurface() {
    return global.location?.pathname === "/directory-viewer.html" ? "directory-preview" : "task-preview";
  }

  function nativeDocumentOpenRequestFromLink(link) {
    const kind = documentKindFromLink(link);
    if (!nativeDocumentSupportedKind(kind)) return null;
    const url = documentNativeUrlFromLink(link);
    if (!url) return null;
    return {
      type: "homeai.nativeDocument.open",
      version: 1,
      requestId: nativeDocumentPreviewRequestId(),
      url,
      filename: documentNameFromLink(link),
      mimeType: documentMimeFromLink(link),
      kind: nativeDocumentKind(kind),
      sourceSurface: nativeDocumentSourceSurface(),
      requiresAuth: true,
    };
  }

  function nativeDocumentOpenRequestFromInput(input = {}) {
    const kind = String(input.kind || "").trim();
    if (!nativeDocumentSupportedKind(kind)) return null;
    const sourceUrl = documentNativeUrlFromInput(input.sourceUrl || "");
    if (!sourceUrl) return null;
    return {
      type: "homeai.nativeDocument.open",
      version: 1,
      requestId: nativeDocumentPreviewRequestId(),
      url: sourceUrl,
      filename: input.title || "document",
      mimeType: input.mime || "",
      kind: nativeDocumentKind(kind),
      sourceSurface: input.sourceSurface || nativeDocumentSourceSurface(),
      requiresAuth: true,
    };
  }

  function nativeDocumentOpenInRequestFromInput(input = {}) {
    const request = nativeDocumentOpenRequestFromInput(input);
    return request ? Object.assign({}, request, { mode: "openIn" }) : null;
  }

  function nativeDocumentOpenInRequestFromLink(link) {
    const request = nativeDocumentOpenRequestFromLink(link);
    return request ? Object.assign({}, request, { mode: "openIn" }) : null;
  }

  function documentNativeUrlFromInput(value) {
    if (!value) return "";
    try {
      const url = new URL(value, global.location.origin);
      if (url.origin !== global.location.origin) return "";
      return `${url.pathname}${url.search}${url.hash || ""}`;
    } catch (_) {
      return "";
    }
  }

  function shouldUseNativeShellDocumentPreview(link) {
    return Boolean(nativeDocumentBridgeExpected() && nativeDocumentOpenRequestFromLink(link));
  }

  function callNativeDocumentBridge(request, options = {}) {
    const bridge = request ? ensureNativeDocumentBridge() : null;
    if (!request || !bridge) return false;
    const onFailure = typeof options.onFailure === "function" ? options.onFailure : null;
    try {
      const result = bridge.open(request);
      if (result && typeof result.then === "function") {
        result
          .then((body) => {
            if (body && body.ok === false) onFailure?.(body.error || "native_document_open_failed");
          })
          .catch((err) => onFailure?.(err?.message || "native_document_open_failed"));
        return true;
      }
      if (result && result.ok === false) {
        onFailure?.(result.error || "native_document_open_failed");
        return Boolean(onFailure);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function openNativeShellDocumentPreview(link, options = {}) {
    const request = nativeDocumentOpenRequestFromLink(link);
    return callNativeDocumentBridge(request, options);
  }

  function openNativeShellDocumentPreviewFromInput(input = {}, options = {}) {
    const request = nativeDocumentOpenRequestFromInput(input);
    return callNativeDocumentBridge(request, options);
  }

  async function openNativeDocumentOpenInFromInput(input = {}, options = {}) {
    const request = nativeDocumentOpenInRequestFromInput(input);
    const bridge = request ? nativeDocumentOpenInBridge() : null;
    if (!request || !bridge) return false;
    const onFailure = typeof options.onFailure === "function" ? options.onFailure : null;
    try {
      const result = await bridge.open(request);
      if (result && result.ok === true) return true;
      onFailure?.(result?.error || "native_document_open_in_failed");
      return false;
    } catch (err) {
      onFailure?.(err?.message || "native_document_open_in_failed");
      return false;
    }
  }

  async function openNativeDocumentOpenInFromLink(link, options = {}) {
    const request = nativeDocumentOpenInRequestFromLink(link);
    const bridge = request ? nativeDocumentOpenInBridge() : null;
    if (!request || !bridge) return false;
    const onFailure = typeof options.onFailure === "function" ? options.onFailure : null;
    try {
      const result = await bridge.open(request);
      if (result && result.ok === true) return true;
      onFailure?.(result?.error || "native_document_open_in_failed");
      return false;
    } catch (err) {
      onFailure?.(err?.message || "native_document_open_in_failed");
      return false;
    }
  }

  async function shareOrDownloadOriginalFile(input = {}) {
    const sourceUrl = input.sourceUrl || "";
    const title = input.title || "document";
    const mime = input.mime || "";
    try {
      const blob = await fetchPreviewBlob(sourceUrl);
      const file = new File([blob], title, { type: blob.type || mime || "application/octet-stream" });
      if (canShareFiles([file])) {
        await navigator.share({ files: [file], title });
        return true;
      }
      downloadGeneratedBlob(blob, title);
      return true;
    } catch (_) {
      if (await sharePreviewLink(sourceUrl, title)) return true;
      return copyPreviewLink(previewShareUrl(sourceUrl));
    }
  }

  function documentPreviewViewportMetrics() {
    const visual = global.visualViewport || {};
    const root = document.documentElement || {};
    const width = Math.floor(visual.width || root.clientWidth || global.innerWidth || 0);
    const height = Math.floor(visual.height || root.clientHeight || global.innerHeight || 0);
    const coarsePointer = Boolean(global.matchMedia?.("(pointer: coarse)")?.matches);
    return {
      width: Math.max(0, width),
      height: Math.max(0, height),
      coarsePointer,
    };
  }

  function shouldUseNativeDocumentPreview(link) {
    const kind = documentKindFromLink(link);
    if (!kind) return false;
    if (shouldUseNativeShellDocumentPreview(link)) return true;
    const metrics = documentPreviewViewportMetrics();
    if (documentPreviewUsesInAppOverlay(metrics)) return false;
    if (documentKindUsesNativePreview(kind)) return true;
    return shouldUseWideNativeDocumentPreview(link);
  }

  function shouldUseWideNativeDocumentPreview(link) {
    const kind = documentKindFromLink(link);
    if (!documentKindUsesWideNativePreview(kind)) return false;
    const metrics = documentPreviewViewportMetrics();
    if (documentPreviewUsesInAppOverlay(metrics)) return false;
    return metrics.width >= 768;
  }

  function documentPreviewUsesInAppOverlay(metrics = documentPreviewViewportMetrics()) {
    return Boolean(metrics.coarsePointer || metrics.width < 768);
  }

  function documentKindUsesNativePreview(kind) {
    return kind === "word" || kind === "presentation";
  }

  function documentKindPrefersNativeOpenIn(kind) {
    return kind === "word" || kind === "presentation";
  }

  function documentKindUsesWideNativePreview(kind) {
    return kind === "pdf";
  }

  function documentKindFromMimeName(mimeValue, nameValue) {
    const mime = String(mimeValue || "").toLowerCase();
    const name = String(nameValue || "").toLowerCase();
    if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|bmp|heic|heif)(?:[?#]|$)/i.test(name)) return "";
    if (mime.includes("markdown") || mime === "text/x-markdown" || /\.(md|markdown)(?:[?#]|$)/i.test(name)) return "";
    if (mime.includes("pdf") || /\.pdf(?:[?#]|$)/i.test(name)) return "pdf";
    if (
      mime.includes("word")
      || mime.includes("officedocument.wordprocessingml")
      || /\.(doc|docx)(?:[?#]|$)/i.test(name)
    ) return "word";
    if (
      mime.includes("spreadsheet")
      || mime.includes("excel")
      || mime.includes("vnd.ms-excel")
      || /\.(xls|xlsx)(?:[?#]|$)/i.test(name)
    ) return "spreadsheet";
    if (
      mime.includes("presentation")
      || mime.includes("powerpoint")
      || /\.(ppt|pptx)(?:[?#]|$)/i.test(name)
    ) return "presentation";
    if (
      mime.startsWith("text/")
      || mime.includes("json")
      || mime.includes("csv")
      || /\.(txt|csv|json)(?:[?#]|$)/i.test(name)
    ) return "text";
    return "";
  }

  function documentKindFromLink(link) {
    const href = link?.href || link?.getAttribute?.("href") || "";
    if (!href) return "";
    try {
      const url = new URL(href, global.location.origin);
      const viewerName = url.searchParams.get("name") || "";
      const viewerMime = url.searchParams.get("mime") || "";
      const source = sourceFromViewerUrl(url);
      const datasetName = link?.dataset?.artifactName || "";
      const datasetMime = link?.dataset?.artifactMime || "";
      const name = datasetName || viewerName || source || url.pathname;
      const mime = datasetMime || viewerMime;
      if (url.pathname === "/pdf-viewer.html") return "pdf";
      return documentKindFromMimeName(mime, name || source);
    } catch (_) {
      return documentKindFromMimeName(link?.dataset?.artifactMime, href);
    }
  }

  function isDocumentPreviewLink(link) {
    return Boolean(documentKindFromLink(link));
  }

  function documentViewerUrlFromLink(link) {
    const href = link?.href || link?.getAttribute?.("href") || "";
    const kind = documentKindFromLink(link);
    if (!href || !kind) return "";
    try {
      const url = new URL(href, global.location.origin);
      if (url.origin !== global.location.origin) return "";
      const nativeShell = currentNativeShellParam();
      if (url.pathname === "/file-viewer.html" || url.pathname === "/pdf-viewer.html") {
        url.searchParams.set("embed", "1");
        if (nativeShell) url.searchParams.set("nativeShell", nativeShell);
        return `${url.pathname}?${url.searchParams.toString()}${url.hash || ""}`;
      }
      const query = new URLSearchParams({
        src: url.href,
        name: link?.dataset?.artifactName || url.pathname.split("/").pop() || "document",
        mime: link?.dataset?.artifactMime || "",
        size: link?.dataset?.artifactSize || "0",
        return: `${global.location.pathname}${global.location.search}${global.location.hash}`,
        embed: "1",
      });
      if (nativeShell) query.set("nativeShell", nativeShell);
      const viewer = kind === "pdf" ? "/pdf-viewer.html" : "/file-viewer.html";
      return `${viewer}?${query.toString()}`;
    } catch (_) {
      return "";
    }
  }

  function renderMarkdownDocument(markdown) {
    const renderer = global.HermesMarkdownRenderer || {};
    if (typeof renderer.renderMarkdownDocument === "function") {
      return renderer.renderMarkdownDocument(String(markdown || ""), {
        fontScale: "large",
        taskListCompatibility: true,
      });
    }
    return `<pre>${escapeValue(String(markdown || ""))}</pre>`;
  }

  function markdownExportHtml(markdown, title, options = {}) {
    const autoPrintScript = options.autoPrint ? `<script>
window.addEventListener("load", function () {
  window.setTimeout(function () {
    try { window.focus(); window.print(); } catch (_) {}
  }, 250);
});
<\/script>` : "";
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeValue(title || "Markdown")}</title>
  <style>
    *{box-sizing:border-box;}
    body{margin:0;background:#fff;color:#24292f;font:20px/1.72 "Noto Serif CJK SC","Source Han Serif SC","Songti SC","SimSun","Microsoft YaHei",serif;-webkit-text-size-adjust:100%;}
    main{max-width:860px;margin:0 auto;padding:28px 22px 48px;overflow-wrap:anywhere;}
    h1,h2,h3,h4{line-height:1.3;margin:1.25em 0 .62em;color:#1f2328;font-weight:760;letter-spacing:0;overflow-wrap:anywhere;}
    h1{font-size:1.5em;border-bottom:1px solid #d8dee4;padding-bottom:.3em;}h2{font-size:1.3em;border-bottom:1px solid #d8dee4;padding-bottom:.3em;}h3{font-size:1.12em;}h4{font-size:1em;}
    p,ul,ol,blockquote,pre,.markdown-table-wrap{margin:.86em 0;}ul,ol{padding-left:1.45em;}a{color:#0969da;text-decoration:none;}blockquote{padding:.05em 0 .05em 1em;color:#57606a;border-left:.25em solid #d0d7de;}img,.hermes-markdown-image{display:block;max-width:100%;height:auto;border-radius:8px;}
    code{background:rgba(175,184,193,.2);border-radius:6px;padding:.12em .35em;font-family:"Cascadia Code","SFMono-Regular",Consolas,monospace;font-size:.88em;overflow-wrap:anywhere;}pre{overflow-x:auto;background:#f6f8fa;border:1px solid #d8dee4;border-radius:8px;padding:1em;line-height:1.55;}
    .markdown-table-wrap{max-width:100%;overflow-x:auto;border:1px solid #d8dee4;border-radius:8px;background:#fff;}table{width:100%;border-collapse:collapse;font-size:.94em;}th,td{border:1px solid #d0d7de;padding:.55em .65em;vertical-align:top;overflow-wrap:anywhere;}th{background:#f6f8fa;font-weight:820;}
    @media print{body{font-size:12pt;}main{max-width:none;padding:18mm 16mm;}a{color:inherit;text-decoration:underline;}}
  </style>
</head>
<body><main>${renderMarkdownDocument(markdown)}</main>${autoPrintScript}</body>
</html>`;
  }

  async function fetchMarkdownText(previewUrl, cache) {
    if (cache.text !== null) return cache.text;
    if (!cache.promise) {
      const headers = {};
      const key = global.localStorage?.getItem("hermesWebKey") || "";
      if (key) headers["X-Hermes-Web-Key"] = key;
      cache.promise = fetch(previewUrl, { headers })
        .then((res) => res.json().catch(() => ({})).then((body) => {
          if (!res.ok) throw new Error(body.error || `${res.status} ${res.statusText}`);
          return String(body.text || "");
        }))
        .then((text) => {
          cache.text = text;
          return text;
        });
    }
    return cache.promise;
  }

  async function shareGeneratedMarkdownFile(format, markdown, title) {
    const isWord = format === "word";
    const filename = generatedBaseName(title, isWord ? "doc" : "html");
    const type = isWord ? "application/msword" : "text/html;charset=utf-8";
    const blob = new Blob([markdownExportHtml(markdown, title)], { type });
    const file = new File([blob], filename, { type });
    if (canShareFiles([file])) {
      await navigator.share({ files: [file], title: filename });
      return;
    }
    downloadGeneratedBlob(blob, filename);
  }

  async function printMarkdownAsPdf(markdown, title) {
    const html = markdownExportHtml(markdown, title, { autoPrint: true });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const frame = document.createElement("iframe");
    frame.className = "task-preview-print-frame";
    frame.title = "Markdown print";
    frame.setAttribute("aria-hidden", "true");
    frame.addEventListener("load", () => {
      global.setTimeout(() => {
        try {
          frame.contentWindow?.focus?.();
          frame.contentWindow?.print?.();
        } catch (_) {
          downloadGeneratedBlob(blob, generatedBaseName(title, "html"));
        } finally {
          global.setTimeout(() => {
            frame.remove();
            URL.revokeObjectURL(objectUrl);
          }, 120000);
        }
      }, 250);
    }, { once: true });
    frame.src = objectUrl;
    document.body.appendChild(frame);
  }

  function openMarkdownPreviewOverlay(link) {
    const source = markdownSourceFromLink(link);
    const previewUrl = markdownPreviewFetchUrl(source);
    if (!previewUrl) return false;
    closeArtifactPreviewOverlays();
    const title = String(link?.dataset?.artifactName || link?.getAttribute?.("aria-label") || "Markdown 预览").trim();
    const markdownCache = { text: null, promise: null };
    const overlay = document.createElement("div");
    overlay.id = "taskMarkdownPreviewOverlay";
    overlay.className = "task-markdown-preview-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="task-markdown-preview-shell">
        <div class="task-markdown-preview-head">
          <strong>${escapeValue(title || "Markdown 预览")}</strong>
          <div class="task-markdown-preview-actions">
            <div class="task-preview-more-wrap">
              <button class="task-preview-more-button" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="更多操作">...</button>
              <div class="task-preview-more-menu" role="menu" hidden>
                <button type="button" role="menuitem" data-preview-action="group">分享到群</button>
                <button type="button" role="menuitem" data-preview-action="md">Markdown 分享</button>
                <button type="button" role="menuitem" data-preview-action="html">转成 HTML 分享</button>
                <button type="button" role="menuitem" data-preview-action="word">转成 Word 分享</button>
                <button type="button" role="menuitem" data-preview-action="pdf">转成 PDF 分享</button>
                <button type="button" role="menuitem" data-preview-action="copy">复制链接</button>
                <button type="button" role="menuitem" data-preview-action="open">打开原始文件</button>
              </div>
            </div>
            <button class="task-markdown-preview-close" type="button" aria-label="关闭预览">×</button>
          </div>
        </div>
        <div class="task-markdown-preview-body">
          <div class="task-markdown-preview-status">正在加载预览...</div>
          <article class="task-markdown-preview-doc markdown-preview" hidden></article>
        </div>
        <div class="task-preview-toast" data-preview-status hidden></div>
      </div>
    `;
    const closeButton = overlay.querySelector(".task-markdown-preview-close");
    ["pointerdown", "touchstart", "click"].forEach((eventName) => {
      closeButton.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        closePreviewFromUser(closeMarkdownPreviewOverlay);
      }, { passive: false });
    });
    bindPreviewMoreMenu(overlay, {
      onAction: async (action) => {
        const markdownText = async () => fetchMarkdownText(previewUrl, markdownCache);
        if (action === "group") {
          transientPreviewStatus(overlay, "正在转发到群...");
          await forwardMarkdownToGroup(await markdownText(), title);
          transientPreviewStatus(overlay, "已转发到群", "success");
        } else if (action === "md") {
          const text = await markdownText();
          const filename = /\.md$/i.test(title) ? title : generatedBaseName(title, "md");
          const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
          const file = new File([blob], filename, { type: "text/markdown;charset=utf-8" });
          if (canShareFiles([file])) await navigator.share({ files: [file], title: filename });
          else downloadGeneratedBlob(blob, filename);
        } else if (action === "html") {
          await shareGeneratedMarkdownFile("html", await markdownText(), title);
        } else if (action === "word") {
          await shareGeneratedMarkdownFile("word", await markdownText(), title);
        } else if (action === "pdf") {
          await printMarkdownAsPdf(await markdownText(), title);
        } else if (action === "copy") {
          await copyPreviewLink(previewShareUrl(source));
          transientPreviewStatus(overlay, "已复制链接", "success");
        } else if (action === "open") {
          const url = previewShareUrl(source);
          if (url) global.location.assign(url);
        }
      },
    });
    document.body.appendChild(overlay);
    document.body.classList.add("task-markdown-preview-open");
    markPreviewHistory("markdown");
    const status = overlay.querySelector(".task-markdown-preview-status");
    const doc = overlay.querySelector(".task-markdown-preview-doc");
    fetchMarkdownText(previewUrl, markdownCache)
      .then((text) => {
        if (!document.body.contains(overlay)) return;
        doc.innerHTML = renderMarkdownDocument(text);
        doc.hidden = false;
        status.hidden = true;
      })
      .catch((err) => {
        if (!document.body.contains(overlay)) return;
        status.textContent = err.message || "Markdown 预览失败。";
        status.classList.add("error");
      });
    return true;
  }

  function openDocumentPreviewOverlay(link) {
    const viewerUrl = documentViewerUrlFromLink(link);
    if (!viewerUrl) return false;
    const source = documentSourceFromLink(link);
    const kind = documentKindFromLink(link) || "file";
    const title = String(link?.dataset?.artifactName || link?.getAttribute?.("aria-label") || "文件预览").trim();
    const mime = link?.dataset?.artifactMime || "";
    const skipNativeBridge = Boolean(link?.dataset?.skipNativeDocumentBridge);
    if (!skipNativeBridge && documentKindPrefersNativeOpenIn(kind) && nativeDocumentOpenInAvailable()) {
      openNativeDocumentOpenInFromLink(link, {
        onFailure: (error) => {
          openNativeDocumentBridgeFailureOverlay(link, error || "native_document_open_in_failed");
        },
      }).then((opened) => {
        if (!opened) openNativeDocumentBridgeFailureOverlay(link, "native_document_open_in_unavailable");
      });
      return true;
    }
    const attemptedNativeBridge = Boolean(!skipNativeBridge && shouldUseNativeShellDocumentPreview(link));
    if (attemptedNativeBridge) {
      const opened = openNativeShellDocumentPreview(link, {
        onFailure: (error) => {
          try {
            link.dataset.skipNativeDocumentBridge = "1";
            openNativeDocumentBridgeFailureOverlay(link, error);
          } finally {
            delete link.dataset.skipNativeDocumentBridge;
          }
        },
      });
      if (opened) return true;
      return openNativeDocumentBridgeFailureOverlay(link, "native_document_bridge_unavailable");
    }
    if (!attemptedNativeBridge && shouldUseNativeDocumentPreview(link)) {
      const nativeUrl = documentNativeUrlFromLink(link);
      if (nativeUrl) {
        global.location.assign(nativeUrl);
        return true;
      }
    }
    closeArtifactPreviewOverlays();
    const overlay = document.createElement("div");
    overlay.id = "taskDocumentPreviewOverlay";
    overlay.className = `task-document-preview-overlay task-document-preview-${kind}`;
    overlay.dataset.documentKind = kind;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="task-document-preview-shell">
        <div class="task-document-preview-head">
          <strong>${escapeValue(title || "文件预览")}</strong>
          <div class="task-document-preview-actions">
            <div class="task-preview-more-wrap">
              <button class="task-preview-more-button" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="更多操作">...</button>
              <div class="task-preview-more-menu" role="menu" hidden>
                <button type="button" role="menuitem" data-preview-action="group">分享到群</button>
                <button type="button" role="menuitem" data-preview-action="system">系统分享</button>
                <button type="button" role="menuitem" data-preview-action="native-preview">原始格式显示</button>
                <button type="button" role="menuitem" data-preview-action="copy">复制链接</button>
                <button type="button" role="menuitem" data-preview-action="open">打开原始文件</button>
              </div>
            </div>
            <button class="task-document-preview-close" type="button" aria-label="关闭预览">×</button>
          </div>
        </div>
        <div class="task-document-preview-body">
          <iframe class="task-document-preview-frame" title="${escapeValue(title || "文件预览")}" src="${escapeValue(viewerUrl)}"></iframe>
        </div>
        <div class="task-preview-toast" data-preview-status hidden></div>
      </div>
    `;
    const closeButton = overlay.querySelector(".task-document-preview-close");
    ["pointerdown", "touchstart", "click"].forEach((eventName) => {
      closeButton.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        closePreviewFromUser(closeDocumentPreviewOverlay);
      }, { passive: false });
    });
    bindPreviewMoreMenu(overlay, {
      onAction: (action) => handleFilePreviewAction(action, {
        root: overlay,
        sourceUrl: source,
        title,
        mime,
        kind,
      }),
    });
    document.body.appendChild(overlay);
    document.body.classList.add("task-document-preview-open");
    markPreviewHistory("document");
    return true;
  }

  function openNativeDocumentBridgeFailureOverlay(link, error = "") {
    closeArtifactPreviewOverlays();
    const source = documentSourceFromLink(link);
    const kind = documentKindFromLink(link) || "file";
    const title = String(link?.dataset?.artifactName || link?.getAttribute?.("aria-label") || "文件预览").trim();
    const mime = link?.dataset?.artifactMime || "";
    const message = error === "native_document_result_timeout"
      ? "系统预览没有返回结果，请重启 Home AI 原生壳后再试。"
      : "系统预览桥接不可用，请更新或重启 Home AI 原生壳后再试。你仍然可以用系统打开方式、分享或下载继续查看。";
    const overlay = document.createElement("div");
    overlay.id = "taskDocumentPreviewOverlay";
    overlay.className = "task-document-preview-overlay task-document-preview-native-error";
    overlay.dataset.documentKind = kind;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="task-document-preview-shell">
        <div class="task-document-preview-head">
          <strong>${escapeValue(title || "系统预览")}</strong>
          <button class="task-document-preview-close" type="button" aria-label="关闭预览">×</button>
        </div>
        <div class="task-document-preview-body task-document-preview-native-error-body">
          <div class="task-document-preview-native-error-card">
            <strong>系统预览未打开</strong>
            <p>${escapeValue(message)}</p>
            ${error ? `<p class="task-document-preview-native-error-code">错误：${escapeValue(error)}</p>` : ""}
            <div class="task-document-preview-native-error-actions">
              <button type="button" data-native-document-retry>重新打开系统预览</button>
              <button type="button" data-native-document-open-in>用其他 App 打开</button>
              <button type="button" data-native-document-share>下载或分享</button>
              <button type="button" data-native-document-copy>复制链接</button>
              <button type="button" data-native-document-web>Web 调试预览</button>
            </div>
          </div>
        </div>
        <div class="task-preview-toast" data-preview-status hidden></div>
      </div>
    `;
    overlay.querySelector(".task-document-preview-close")?.addEventListener("click", () => closePreviewFromUser(closeDocumentPreviewOverlay));
    overlay.querySelector("[data-native-document-retry]")?.addEventListener("click", () => {
      closeDocumentPreviewOverlay();
      const opened = openNativeShellDocumentPreview(link, {
        onFailure: (nextError) => openNativeDocumentBridgeFailureOverlay(link, nextError),
      });
      if (!opened) openNativeDocumentBridgeFailureOverlay(link, "native_document_bridge_unavailable");
    });
    overlay.querySelector("[data-native-document-open-in]")?.addEventListener("click", async () => {
      transientPreviewStatus(overlay, "正在打开系统打开方式...");
      const opened = await openNativeDocumentOpenInFromLink(link, {
        onFailure: (nextError) => transientPreviewStatus(overlay, nextError || "系统打开方式不可用", "error"),
      });
      if (opened) {
        transientPreviewStatus(overlay, "已打开系统打开方式", "success");
        return;
      }
      const retried = openNativeShellDocumentPreview(link, {
        onFailure: (nextError) => transientPreviewStatus(overlay, nextError || "系统预览不可用", "error"),
      });
      if (!retried) transientPreviewStatus(overlay, "系统打开方式不可用，请改用下载或分享。", "error");
    });
    overlay.querySelector("[data-native-document-share]")?.addEventListener("click", async () => {
      transientPreviewStatus(overlay, "正在准备文件...");
      const ok = await shareOrDownloadOriginalFile({
        root: overlay,
        sourceUrl: source,
        title,
        mime,
        kind,
      });
      transientPreviewStatus(overlay, ok ? "已打开下载或分享" : "下载或分享不可用", ok ? "success" : "error");
    });
    overlay.querySelector("[data-native-document-copy]")?.addEventListener("click", async () => {
      const ok = await copyPreviewLink(previewShareUrl(source));
      transientPreviewStatus(overlay, ok ? "已复制链接" : "复制失败", ok ? "success" : "error");
    });
    overlay.querySelector("[data-native-document-web]")?.addEventListener("click", () => {
      const viewerUrl = documentViewerUrlFromLink(link);
      if (!viewerUrl) return;
      try {
        const url = new URL(viewerUrl, global.location.origin);
        url.searchParams.set("webPreview", "1");
        if (source) url.searchParams.set("src", source);
        global.location.assign(`${url.pathname}?${url.searchParams.toString()}${url.hash || ""}`);
      } catch (_) {
        openNativeDocumentBridgeFailureOverlay(link, "native_document_web_preview_url_invalid");
      }
    });
    document.body.appendChild(overlay);
    document.body.classList.add("task-document-preview-open");
    markPreviewHistory("document");
    return true;
  }

  global.TaskDocumentPreviewUi = {
    closeArtifactPreviewOverlays,
    closeActivePreviewFromUser,
    closeDocumentPreviewOverlay,
    closeImagePreviewOverlay,
    closeMarkdownPreviewOverlay,
    hasArtifactPreviewOverlay,
    documentKindUsesNativePreview,
    documentKindUsesWideNativePreview,
    documentPreviewUsesInAppOverlay,
    documentNativeUrlFromLink,
    nativeDocumentBridgeAvailable,
    nativeDocumentBridgeExpected,
    nativeDocumentOpenInAvailable,
    nativeDocumentOpenInRequestFromLink,
    nativeDocumentOpenInRequestFromInput,
    nativeDocumentOpenRequestFromLink,
    openNativeDocumentOpenInFromInput,
    openNativeDocumentOpenInFromLink,
    openNativeShellDocumentPreview,
    isDocumentPreviewLink,
    isImagePreviewLink,
    isMarkdownPreviewLink,
    openDocumentPreviewOverlay,
    openImagePreviewOverlay,
    openMarkdownPreviewOverlay,
    previewBackSwipeSurface,
    shouldUseNativeShellDocumentPreview,
    shouldUseNativeDocumentPreview,
    shouldUseWideNativeDocumentPreview,
  };
}(window));
