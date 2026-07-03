const DOCUMENT_PREVIEW_MODEL_VERSION = "20260702-vite-document-preview-model-v1";

const MARKDOWN_ACTIONS = Object.freeze([
  ["group", "分享到群", "转发 Markdown 内容"],
  ["md", "Markdown 分享", "分享原始 Markdown"],
  ["html", "转成 HTML", "生成 HTML 文件"],
  ["word", "转成 Word", "生成 Word 兼容文件"],
  ["pdf", "转成 PDF", "打印为 PDF"],
  ["copy", "复制链接", "复制可打开链接"],
  ["open", "打开原始文件", "离开预览打开"],
]);

const DOCUMENT_ACTIONS = Object.freeze([
  ["group", "分享到群", "转发文件链接"],
  ["system", "系统分享", "下载或交给系统"],
  ["native-preview", "原始格式显示", "用系统预览桥打开"],
  ["copy", "复制链接", "复制可打开链接"],
  ["open", "打开原始文件", "离开预览打开"],
]);

const IMAGE_ACTIONS = Object.freeze([
  ["group", "分享到群", "转发图片链接"],
  ["save-album", "保存到相册", "交给系统保存"],
  ["system", "系统分享", "下载或分享图片"],
  ["copy", "复制链接", "复制可打开链接"],
  ["open", "打开原始文件", "离开预览打开"],
]);

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function lower(value, max = 4000) {
  return cleanString(value, max).toLowerCase();
}

function normalizeOrigin(value = "http://127.0.0.1") {
  try {
    return new URL(value).origin;
  } catch (_error) {
    return "http://127.0.0.1";
  }
}

function currentPathWithQuery(options = {}) {
  const path = cleanString(options.currentPath || options.locationPath || "/tasks", 600) || "/tasks";
  const search = cleanString(options.currentSearch || "", 600);
  if (!search) return path;
  return search.startsWith("?") ? `${path}${search}` : `${path}?${search}`;
}

function parseUrl(value, options = {}) {
  const href = cleanString(value, 4000);
  if (!href) return null;
  try {
    return new URL(href, normalizeOrigin(options.origin));
  } catch (_error) {
    return null;
  }
}

function sameOriginUrl(value, options = {}) {
  const url = parseUrl(value, options);
  if (!url) return null;
  return url.origin === normalizeOrigin(options.origin) ? url : null;
}

function linkAttribute(link = {}, name = "") {
  const attr = link?.attributes?.[name];
  if (attr != null) return attr;
  if (name === "href") return link.href;
  if (name === "download") return link.download;
  if (name === "title") return link.title;
  if (name === "aria-label") return link.ariaLabel || link.aria_label;
  return "";
}

function linkHref(link = {}) {
  return cleanString(link?.href || linkAttribute(link, "href"), 4000);
}

function linkDataset(link = {}) {
  return link?.dataset && typeof link.dataset === "object" ? link.dataset : {};
}

function nameCandidatesFromLink(link = {}, options = {}) {
  const dataset = linkDataset(link);
  const href = linkHref(link);
  const url = parseUrl(href, options);
  const params = url ? [
    url.searchParams.get("name"),
    url.searchParams.get("filename"),
    url.searchParams.get("fileName"),
    url.searchParams.get("download"),
  ] : [];
  const source = sourceFromViewerUrl(url);
  const sourceUrl = parseUrl(source, options);
  return [
    dataset.artifactName,
    linkAttribute(link, "download"),
    linkAttribute(link, "title"),
    linkAttribute(link, "aria-label"),
    link?.textContent,
    ...params,
    url?.pathname?.split("/").pop(),
    sourceUrl?.pathname?.split("/").pop(),
  ].map((value) => cleanString(value, 500)).filter(Boolean);
}

function sourceFromViewerUrl(url) {
  if (!url) return "";
  if (url.pathname === "/file-viewer.html" || url.pathname === "/pdf-viewer.html" || url.pathname === "/markdown-viewer.html") {
    return cleanString(url.searchParams.get("src") || "", 4000);
  }
  return cleanString(url.href || "", 4000);
}

function documentSourceFromLink(link = {}, options = {}) {
  const href = linkHref(link);
  const url = parseUrl(href, options);
  return sourceFromViewerUrl(url) || href;
}

function markdownSourceFromLink(link = {}, options = {}) {
  const href = linkHref(link);
  const url = parseUrl(href, options);
  if (
    url?.pathname === "/markdown-viewer.html"
    || url?.pathname === "/file-viewer.html"
    || url?.pathname === "/pdf-viewer.html"
  ) {
    return cleanString(url.searchParams.get("src") || "", 4000);
  }
  return href;
}

function documentNativeUrlFromValue(value, options = {}) {
  const url = sameOriginUrl(value, options);
  if (!url) return "";
  return `${url.pathname}${url.search}${url.hash || ""}`;
}

function documentNativeUrlFromLink(link = {}, options = {}) {
  return documentNativeUrlFromValue(documentSourceFromLink(link, options) || linkHref(link), options);
}

function isImagePreviewLink(link = {}, options = {}) {
  const dataset = linkDataset(link);
  const mime = lower(dataset.artifactMime, 300);
  if (mime.startsWith("image/")) return true;
  const names = nameCandidatesFromLink(link, options).join("\n").toLowerCase();
  const href = lower(linkHref(link), 4000);
  return /\.(png|jpe?g|gif|webp|avif|bmp|heic|heif)(?:[?#]|$)/i.test(`${names}\n${href}`);
}

function isMarkdownPreviewLink(link = {}, options = {}) {
  const dataset = linkDataset(link);
  const mime = lower(dataset.artifactMime, 300);
  if (mime.includes("markdown") || mime === "text/x-markdown") return true;
  const names = nameCandidatesFromLink(link, options).map((name) => name.toLowerCase());
  if (names.some((name) => /\.(md|markdown)(?:[?#]|$)/i.test(name))) return true;
  const href = linkHref(link);
  const url = parseUrl(href, options);
  if (url?.pathname === "/markdown-viewer.html") return true;
  const source = lower(url?.searchParams?.get("src") || "", 4000);
  return /\.(md|markdown)(?:[?#]|$)/i.test(lower(url?.pathname || href, 4000))
    || /\.(md|markdown)(?:[?#]|$)/i.test(source);
}

function documentKindFromMimeName(mimeValue, nameValue) {
  const mime = lower(mimeValue, 500);
  const name = lower(nameValue, 1000);
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|bmp|heic|heif)(?:[?#]|$)/i.test(name)) return "";
  if (mime.includes("markdown") || mime === "text/x-markdown" || /\.(md|markdown)(?:[?#]|$)/i.test(name)) return "";
  if (mime.includes("pdf") || /\.pdf(?:[?#]|$)/i.test(name)) return "pdf";
  if (mime.includes("word") || mime.includes("officedocument.wordprocessingml") || /\.(doc|docx)(?:[?#]|$)/i.test(name)) return "word";
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime.includes("vnd.ms-excel") || /\.(xls|xlsx)(?:[?#]|$)/i.test(name)) return "spreadsheet";
  if (mime.includes("presentation") || mime.includes("powerpoint") || /\.(ppt|pptx)(?:[?#]|$)/i.test(name)) return "presentation";
  if (mime.startsWith("text/") || mime.includes("json") || mime.includes("csv") || /\.(txt|csv|json)(?:[?#]|$)/i.test(name)) return "text";
  return "";
}

function documentKindFromLink(link = {}, options = {}) {
  const href = linkHref(link);
  if (!href || isImagePreviewLink(link, options) || isMarkdownPreviewLink(link, options)) return "";
  const dataset = linkDataset(link);
  const url = parseUrl(href, options);
  const viewerName = cleanString(url?.searchParams?.get("name") || "", 500);
  const viewerMime = cleanString(url?.searchParams?.get("mime") || "", 500);
  const source = sourceFromViewerUrl(url);
  const names = nameCandidatesFromLink(link, options);
  const name = dataset.artifactName || viewerName || names[0] || source || href;
  const mime = dataset.artifactMime || viewerMime;
  if (url?.pathname === "/pdf-viewer.html") return "pdf";
  return documentKindFromMimeName(mime, name || source);
}

function markdownPreviewFetchUrl(value, options = {}) {
  const url = sameOriginUrl(value, options);
  if (!url) return "";
  if (url.pathname === "/api/files" || url.pathname === "/api/files/preview") {
    return `/api/files/preview?${url.searchParams.toString()}`;
  }
  if (url.pathname === "/api/automations/output") return `/api/automations/output/preview?${url.searchParams.toString()}`;
  if (url.pathname === "/api/automations/deliverable") return `/api/automations/deliverable/preview?${url.searchParams.toString()}`;
  if (url.pathname === "/api/kanban/cards/output") return `/api/kanban/cards/output/preview?${url.searchParams.toString()}`;
  const artifact = url.pathname.match(/^\/api\/artifacts\/([^/]+)$/);
  if (artifact) return `/api/files/preview?artifactId=${encodeURIComponent(decodeURIComponent(artifact[1]))}`;
  return "";
}

function currentNativeShellParam(options = {}) {
  const value = cleanString(options.nativeShell || options.nativeShellParam, 30);
  return value === "ios" || value === "android" ? value : "";
}

function documentViewerUrlFromLink(link = {}, options = {}) {
  const href = linkHref(link);
  const kind = documentKindFromLink(link, options);
  if (!href || !kind) return "";
  const url = sameOriginUrl(href, options);
  if (!url) return "";
  const nativeShell = currentNativeShellParam(options);
  if (url.pathname === "/file-viewer.html" || url.pathname === "/pdf-viewer.html") {
    url.searchParams.set("embed", "1");
    if (nativeShell) url.searchParams.set("nativeShell", nativeShell);
    return `${url.pathname}?${url.searchParams.toString()}${url.hash || ""}`;
  }
  const dataset = linkDataset(link);
  const query = new URLSearchParams({
    src: url.href,
    name: dataset.artifactName || url.pathname.split("/").pop() || "document",
    mime: dataset.artifactMime || "",
    size: cleanString(dataset.artifactSize || "0", 80) || "0",
    return: currentPathWithQuery(options),
    embed: "1",
  });
  if (nativeShell) query.set("nativeShell", nativeShell);
  const viewer = kind === "pdf" ? "/pdf-viewer.html" : "/file-viewer.html";
  return `${viewer}?${query.toString()}`;
}

function documentPreviewViewportMetrics(options = {}) {
  return {
    width: Math.max(0, Number(options.viewport?.width ?? options.width ?? 0) || 0),
    height: Math.max(0, Number(options.viewport?.height ?? options.height ?? 0) || 0),
    coarsePointer: Boolean(options.viewport?.coarsePointer ?? options.coarsePointer),
  };
}

function documentPreviewUsesInAppOverlay(metrics = {}) {
  return Boolean(metrics.coarsePointer || Number(metrics.width || 0) < 768);
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

function nativeDocumentSupportedKind(kind) {
  return kind === "pdf" || kind === "word" || kind === "presentation";
}

function nativeDocumentKind(kind) {
  if (kind === "presentation") return "powerpoint";
  if (kind === "spreadsheet") return "spreadsheet";
  return kind || "file";
}

function nativeDocumentBridgeExpected(options = {}) {
  return Boolean(currentNativeShellParam(options) || options.nativeDocumentBridgeAvailable);
}

function nativeDocumentOpenRequestFromLink(link = {}, options = {}) {
  const kind = documentKindFromLink(link, options);
  if (!nativeDocumentSupportedKind(kind)) return null;
  const url = documentNativeUrlFromLink(link, options);
  if (!url) return null;
  const dataset = linkDataset(link);
  const name = dataset.artifactName || nameCandidatesFromLink(link, options)[0] || "document";
  return Object.freeze({
    type: "homeai.nativeDocument.open",
    version: 1,
    requestId: cleanString(options.requestId || "vite_document_preview_request", 120),
    url,
    filename: cleanString(name || "document", 500),
    mimeType: cleanString(dataset.artifactMime || "", 500),
    kind: nativeDocumentKind(kind),
    sourceSurface: cleanString(options.sourceSurface || "vite-document-preview", 120),
    requiresAuth: true,
  });
}

function shouldUseNativeShellDocumentPreview(link = {}, options = {}) {
  return Boolean(nativeDocumentBridgeExpected(options) && nativeDocumentOpenRequestFromLink(link, options));
}

function shouldUseWideNativeDocumentPreview(link = {}, options = {}) {
  const kind = documentKindFromLink(link, options);
  if (!documentKindUsesWideNativePreview(kind)) return false;
  const metrics = documentPreviewViewportMetrics(options);
  if (documentPreviewUsesInAppOverlay(metrics)) return false;
  return metrics.width >= 768;
}

function shouldUseNativeDocumentPreview(link = {}, options = {}) {
  const kind = documentKindFromLink(link, options);
  if (!kind) return false;
  if (shouldUseNativeShellDocumentPreview(link, options)) return true;
  const metrics = documentPreviewViewportMetrics(options);
  if (documentPreviewUsesInAppOverlay(metrics)) return false;
  if (documentKindUsesNativePreview(kind)) return true;
  return shouldUseWideNativeDocumentPreview(link, options);
}

function actionList(entries, enabled = true) {
  return Object.freeze(entries.map(([id, label, detail]) => Object.freeze({
    id,
    label,
    detail,
    enabled: Boolean(enabled),
  })));
}

function titleFromLink(link = {}, options = {}, fallback = "文件预览") {
  const dataset = linkDataset(link);
  const candidates = [
    dataset.artifactName,
    linkAttribute(link, "aria-label"),
    linkAttribute(link, "title"),
    linkAttribute(link, "download"),
    nameCandidatesFromLink(link, options)[0],
  ];
  return cleanString(candidates.find((value) => cleanString(value, 500)) || fallback, 500);
}

function documentOpenStrategy(link = {}, options = {}) {
  const kind = documentKindFromLink(link, options);
  if (!kind) return "unsupported";
  if (documentKindPrefersNativeOpenIn(kind) && options.nativeDocumentOpenInAvailable) return "native-open-in";
  if (shouldUseNativeShellDocumentPreview(link, options)) return "native-bridge";
  if (shouldUseNativeDocumentPreview(link, options)) return "native-url";
  return "in-app-overlay";
}

function buildPreviewLinkViewModel(link = {}, options = {}) {
  const href = linkHref(link);
  const dataset = linkDataset(link);
  const title = titleFromLink(link, options);
  const mime = cleanString(dataset.artifactMime || "", 500);
  if (isMarkdownPreviewLink(link, options)) {
    const sourceUrl = markdownSourceFromLink(link, options);
    const previewFetchUrl = markdownPreviewFetchUrl(sourceUrl, options);
    return Object.freeze({
      modelVersion: DOCUMENT_PREVIEW_MODEL_VERSION,
      previewType: "markdown",
      status: previewFetchUrl ? "ready" : "blocked",
      title: title || "Markdown 预览",
      mime,
      sourceUrl,
      previewFetchUrl,
      viewerUrl: "",
      nativeUrl: "",
      documentKind: "",
      nativeKind: "",
      openStrategy: "in-app-markdown",
      summary: previewFetchUrl ? "Markdown 将在应用内渲染。" : "Markdown 来源无法安全读取。",
      actions: actionList(MARKDOWN_ACTIONS, Boolean(sourceUrl)),
    });
  }
  if (isImagePreviewLink(link, options)) {
    return Object.freeze({
      modelVersion: DOCUMENT_PREVIEW_MODEL_VERSION,
      previewType: "image",
      status: href ? "ready" : "blocked",
      title: title || "图片预览",
      mime: mime || "image/*",
      sourceUrl: href,
      previewFetchUrl: "",
      viewerUrl: "",
      nativeUrl: documentNativeUrlFromValue(href, options),
      documentKind: "",
      nativeKind: "image",
      openStrategy: "image-overlay",
      summary: "图片将在应用内预览，可保存或系统分享。",
      actions: actionList(IMAGE_ACTIONS, Boolean(href)),
    });
  }
  const documentKind = documentKindFromLink(link, options);
  if (documentKind) {
    const sourceUrl = documentSourceFromLink(link, options);
    const nativeRequest = nativeDocumentOpenRequestFromLink(link, options);
    const strategy = documentOpenStrategy(link, options);
    const viewerUrl = documentViewerUrlFromLink(link, options);
    const nativeUrl = documentNativeUrlFromLink(link, options);
    return Object.freeze({
      modelVersion: DOCUMENT_PREVIEW_MODEL_VERSION,
      previewType: "document",
      status: viewerUrl || nativeRequest || nativeUrl ? "ready" : "blocked",
      title,
      mime,
      sourceUrl,
      previewFetchUrl: "",
      viewerUrl,
      nativeUrl,
      documentKind,
      nativeKind: nativeDocumentKind(documentKind),
      openStrategy: strategy,
      nativeRequest,
      usesInAppOverlay: documentPreviewUsesInAppOverlay(documentPreviewViewportMetrics(options)),
      shouldUseNativeShellPreview: shouldUseNativeShellDocumentPreview(link, options),
      shouldUseNativePreview: shouldUseNativeDocumentPreview(link, options),
      summary: strategy === "native-open-in"
        ? "将优先打开系统打开方式。"
        : strategy === "native-bridge"
          ? "将通过原生壳系统预览桥打开。"
          : strategy === "native-url"
            ? "将跳转到系统可处理的原始地址。"
            : "将在 Home AI 应用内预览。",
      actions: actionList(DOCUMENT_ACTIONS, Boolean(sourceUrl || viewerUrl || nativeUrl)),
    });
  }
  return Object.freeze({
    modelVersion: DOCUMENT_PREVIEW_MODEL_VERSION,
    previewType: "unsupported",
    status: "blocked",
    title: title || "文件预览",
    mime,
    sourceUrl: href,
    previewFetchUrl: "",
    viewerUrl: "",
    nativeUrl: documentNativeUrlFromValue(href, options),
    documentKind: "",
    nativeKind: "",
    openStrategy: "unsupported",
    summary: "这个链接没有可识别的文件预览类型。",
    actions: Object.freeze([]),
  });
}

export {
  DOCUMENT_PREVIEW_MODEL_VERSION,
  buildPreviewLinkViewModel,
  cleanString,
  documentKindFromLink,
  documentKindFromMimeName,
  documentKindPrefersNativeOpenIn,
  documentKindUsesNativePreview,
  documentKindUsesWideNativePreview,
  documentNativeUrlFromLink,
  documentOpenStrategy,
  documentPreviewUsesInAppOverlay,
  documentSourceFromLink,
  documentViewerUrlFromLink,
  isImagePreviewLink,
  isMarkdownPreviewLink,
  markdownPreviewFetchUrl,
  markdownSourceFromLink,
  nativeDocumentBridgeExpected,
  nativeDocumentKind,
  nativeDocumentOpenRequestFromLink,
  shouldUseNativeDocumentPreview,
  shouldUseNativeShellDocumentPreview,
  shouldUseWideNativeDocumentPreview,
  sourceFromViewerUrl,
};
