"use strict";

(function initTaskDocumentPreviewUi(global) {
  const PREVIEW_HISTORY_KEY = "__hermesTaskPreview";

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

  function previewShareUrl(value) {
    try {
      return new URL(value, global.location.href).href;
    } catch (_) {
      return String(value || "");
    }
  }

  function currentWorkspaceId() {
    try {
      if (typeof state !== "undefined" && state?.selectedWorkspaceId) return state.selectedWorkspaceId;
    } catch (_) {}
    return global.localStorage?.getItem("hermesWebWorkspace") || "owner";
  }

  async function previewApi(path, options = {}) {
    if (typeof api === "function") return api(path, options);
    const headers = Object.assign({}, options.headers || {});
    const key = global.localStorage?.getItem("hermesWebKey") || "";
    if (key) headers["X-Hermes-Web-Key"] = key;
    if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    const res = await fetch(path, Object.assign({}, options, { headers }));
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `${res.status} ${res.statusText}`);
    return body;
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
    return Boolean(navigator.share && navigator.canShare && navigator.canShare({ files }));
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
      await navigator.share({ title: title || "Hermes Mobile", url: shareUrl });
      return true;
    }
    return copyPreviewLink(shareUrl);
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

  async function forwardFileToWeixin(input = {}) {
    const workspaceId = currentWorkspaceId();
    const body = { workspaceId };
    if (input.markdownText != null) {
      const filename = /\.md$/i.test(String(input.title || "")) ? input.title : generatedBaseName(input.title, "md");
      body.inlineFile = {
        filename,
        contentType: "text/markdown; charset=utf-8",
        contentBase64: bytesToBase64(new TextEncoder().encode(String(input.markdownText || ""))),
      };
    } else if (input.sourceUrl) {
      body.sourceUrl = input.sourceUrl;
    } else {
      throw new Error("没有可转发的文件地址");
    }
    await previewApi("/api/weixin/forward-file", {
      method: "POST",
      body: JSON.stringify(body),
    });
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
    const title = input.title || "Hermes Mobile";
    const sourceUrl = input.sourceUrl || "";
    transientPreviewStatus(root, "");
    if (action === "weixin") {
      transientPreviewStatus(root, "正在加入微信转发队列...");
      await forwardFileToWeixin({ sourceUrl, title, mime: input.mime });
      transientPreviewStatus(root, "已加入微信转发队列", "success");
    } else if (action === "group") {
      transientPreviewStatus(root, "正在转发到群...");
      await forwardFileLinkToGroup(sourceUrl, title);
      transientPreviewStatus(root, "已转发到群", "success");
    } else if (action === "system") {
      await sharePreviewLink(sourceUrl, title);
    } else if (action === "copy") {
      await copyPreviewLink(previewShareUrl(sourceUrl));
      transientPreviewStatus(root, "已复制链接", "success");
    } else if (action === "open") {
      const url = previewShareUrl(sourceUrl);
      if (url) global.open(url, "_blank", "noopener,noreferrer");
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
            <button type="button" role="menuitem" data-preview-action="weixin">分享到微信</button>
            <button type="button" role="menuitem" data-preview-action="group">分享到群</button>
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
      if (url.pathname === "/file-viewer.html" || url.pathname === "/pdf-viewer.html") {
        url.searchParams.set("embed", "1");
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
        linkTarget: "_blank",
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
    p,ul,ol,blockquote,pre,.markdown-table-wrap{margin:.86em 0;}ul,ol{padding-left:1.45em;}a{color:#0969da;text-decoration:none;}blockquote{padding:.05em 0 .05em 1em;color:#57606a;border-left:.25em solid #d0d7de;}
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
    const printWindow = global.open("about:blank", "_blank");
    if (!printWindow) {
      downloadGeneratedBlob(blob, generatedBaseName(title, "html"));
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    printWindow.location.href = objectUrl;
    global.setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
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
                <button type="button" role="menuitem" data-preview-action="weixin">分享到微信</button>
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
        if (action === "weixin") {
          transientPreviewStatus(overlay, "正在加入微信转发队列...");
          await forwardFileToWeixin({ markdownText: await markdownText(), title });
          transientPreviewStatus(overlay, "已加入微信转发队列", "success");
        } else if (action === "group") {
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
          if (url) global.open(url, "_blank", "noopener,noreferrer");
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
    closeArtifactPreviewOverlays();
    const source = documentSourceFromLink(link);
    const title = String(link?.dataset?.artifactName || link?.getAttribute?.("aria-label") || "文件预览").trim();
    const mime = link?.dataset?.artifactMime || "";
    const overlay = document.createElement("div");
    overlay.id = "taskDocumentPreviewOverlay";
    overlay.className = "task-document-preview-overlay";
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
                <button type="button" role="menuitem" data-preview-action="weixin">分享到微信</button>
                <button type="button" role="menuitem" data-preview-action="group">分享到群</button>
                <button type="button" role="menuitem" data-preview-action="system">系统分享</button>
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
      }),
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
    isDocumentPreviewLink,
    isImagePreviewLink,
    isMarkdownPreviewLink,
    openDocumentPreviewOverlay,
    openImagePreviewOverlay,
    openMarkdownPreviewOverlay,
    previewBackSwipeSurface,
  };
}(window));
