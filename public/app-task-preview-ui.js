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

  function hasArtifactPreviewOverlay() {
    return Boolean(
      document.getElementById("taskImagePreviewOverlay")
      || document.getElementById("taskMarkdownPreviewOverlay")
    );
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
    if (isPreviewHistoryActive()) {
      global.history.back();
      return;
    }
    closeFn();
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

  function closeArtifactPreviewOverlays() {
    closeImagePreviewOverlay();
    closeMarkdownPreviewOverlay();
  }

  global.addEventListener("popstate", () => {
    if (!hasArtifactPreviewOverlay()) return;
    closeArtifactPreviewOverlays();
  });

  function isImagePreviewLink(link) {
    const mime = String(link?.dataset?.artifactMime || "").toLowerCase();
    if (mime.startsWith("image/")) return true;
    const href = String(link?.href || link?.getAttribute?.("href") || "").toLowerCase();
    return /\.(png|jpe?g|gif|webp|avif|bmp|heic|heif)(?:[?#]|$)/i.test(href);
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
      <button class="task-image-preview-close" type="button" aria-label="关闭预览">×</button>
      <div class="task-image-preview-stage">
        <img class="task-image-preview-image" alt="${escapeValue(title)}">
      </div>
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

  function openMarkdownPreviewOverlay(link) {
    const source = markdownSourceFromLink(link);
    const previewUrl = markdownPreviewFetchUrl(source);
    if (!previewUrl) return false;
    closeArtifactPreviewOverlays();
    const title = String(link?.dataset?.artifactName || link?.getAttribute?.("aria-label") || "Markdown 预览").trim();
    const overlay = document.createElement("div");
    overlay.id = "taskMarkdownPreviewOverlay";
    overlay.className = "task-markdown-preview-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="task-markdown-preview-shell">
        <div class="task-markdown-preview-head">
          <strong>${escapeValue(title || "Markdown 预览")}</strong>
          <button class="task-markdown-preview-close" type="button" aria-label="关闭预览">×</button>
        </div>
        <div class="task-markdown-preview-body">
          <div class="task-markdown-preview-status">正在加载预览...</div>
          <article class="task-markdown-preview-doc markdown-preview" hidden></article>
        </div>
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
    document.body.appendChild(overlay);
    document.body.classList.add("task-markdown-preview-open");
    markPreviewHistory("markdown");
    const status = overlay.querySelector(".task-markdown-preview-status");
    const doc = overlay.querySelector(".task-markdown-preview-doc");
    const headers = {};
    const key = global.localStorage?.getItem("hermesWebKey") || "";
    if (key) headers["X-Hermes-Web-Key"] = key;
    fetch(previewUrl, { headers })
      .then((res) => res.json().catch(() => ({})).then((body) => {
        if (!res.ok) throw new Error(body.error || `${res.status} ${res.statusText}`);
        return body;
      }))
      .then((body) => {
        if (!document.body.contains(overlay)) return;
        doc.innerHTML = renderMarkdownDocument(body.text || "");
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

  global.TaskDocumentPreviewUi = {
    closeArtifactPreviewOverlays,
    closeImagePreviewOverlay,
    closeMarkdownPreviewOverlay,
    isImagePreviewLink,
    isMarkdownPreviewLink,
    openImagePreviewOverlay,
    openMarkdownPreviewOverlay,
  };
}(window));
