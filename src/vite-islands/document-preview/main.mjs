import cssText from "./style.css?inline";
import { createHomeAiRuntimeFacade } from "../../vite-app/runtime/home-ai-runtime-facade.mjs";
import { buildPreviewLinkViewModel } from "./model.mjs";

const DOCUMENT_PREVIEW_ISLAND_VERSION = "20260702-vite-document-preview-island-v1";
const browserRoot = typeof window !== "undefined" ? window : globalThis;

const fixtureLinks = Object.freeze([
  {
    id: "markdown",
    label: "Markdown",
    href: "/file-viewer.html?src=%2Fapi%2Ffiles%3FartifactId%3Dartifact_md&name=summary.md&mime=text%2Fmarkdown",
    dataset: {
      artifactName: "summary.md",
      artifactMime: "text/markdown",
      artifactSize: "2048",
    },
    textContent: "summary.md",
  },
  {
    id: "presentation",
    label: "PPTX",
    href: "/file-viewer.html?src=%2Fapi%2Ffiles%3FartifactId%3Dartifact_pptx&name=deck.pptx&mime=application%2Fvnd.openxmlformats-officedocument.presentationml.presentation",
    dataset: {
      artifactName: "deck.pptx",
      artifactMime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      artifactSize: "4096",
    },
    textContent: "deck.pptx",
  },
  {
    id: "word",
    label: "DOCX",
    href: "/file-viewer.html?src=%2Fapi%2Ffiles%3FartifactId%3Dartifact_docx&name=report.docx&mime=application%2Fvnd.openxmlformats-officedocument.wordprocessingml.document",
    dataset: {
      artifactName: "report.docx",
      artifactMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      artifactSize: "8192",
    },
    textContent: "report.docx",
  },
  {
    id: "pdf",
    label: "PDF",
    href: "/pdf-viewer.html?src=%2Fapi%2Ffiles%3FartifactId%3Dartifact_pdf&name=brief.pdf&mime=application%2Fpdf",
    dataset: {
      artifactName: "brief.pdf",
      artifactMime: "application/pdf",
      artifactSize: "12288",
    },
    textContent: "brief.pdf",
  },
  {
    id: "image",
    label: "Image",
    href: "/api/files?artifactId=artifact_image&name=photo.jpg",
    dataset: {
      artifactName: "photo.jpg",
      artifactMime: "image/jpeg",
      artifactSize: "65536",
    },
    textContent: "photo.jpg",
  },
  {
    id: "unsupported",
    label: "External",
    href: "https://example.invalid/private.bin",
    dataset: {
      artifactName: "private.bin",
      artifactMime: "application/octet-stream",
      artifactSize: "512",
    },
    textContent: "private.bin",
  },
]);

const runtime = browserRoot.HomeAiRuntimeFacade || createHomeAiRuntimeFacade({
  root: browserRoot,
  mode: "vite-document-preview",
  clientVersion: DOCUMENT_PREVIEW_ISLAND_VERSION,
  appState: {
    documentPreviewIslandVersion: DOCUMENT_PREVIEW_ISLAND_VERSION,
    documentPreviewSelectedFixture: fixtureLinks[0].id,
    documentPreviewNativeShell: "",
    documentPreviewOpenInAvailable: false,
  },
  attachClassicCompatibility: true,
});

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function installStyles(root) {
  if (root.querySelector("style[data-homeai-vite-document-preview-style]")) return;
  const style = document.createElement("style");
  style.setAttribute("data-homeai-vite-document-preview-style", "true");
  style.textContent = cssText;
  root.prepend(style);
}

function selectedFixture() {
  const state = runtime.state?.get?.() || {};
  const id = String(state.documentPreviewSelectedFixture || fixtureLinks[0].id);
  return fixtureLinks.find((fixture) => fixture.id === id) || fixtureLinks[0];
}

function previewOptions() {
  const state = runtime.state?.get?.() || {};
  const nativeShell = String(state.documentPreviewNativeShell || "");
  return {
    origin: browserRoot.location?.origin || "http://127.0.0.1",
    currentPath: browserRoot.location?.pathname || "/vite-document-preview/",
    currentSearch: browserRoot.location?.search || "",
    nativeShell,
    nativeDocumentBridgeAvailable: nativeShell === "ios" || nativeShell === "android",
    nativeDocumentOpenInAvailable: Boolean(state.documentPreviewOpenInAvailable),
    sourceSurface: "vite-document-preview",
    requestId: "vite_document_preview_fixture",
    viewport: {
      width: 390,
      height: 844,
      coarsePointer: true,
    },
  };
}

function setSelectedFixture(id) {
  runtime.state?.set?.({ documentPreviewSelectedFixture: String(id || fixtureLinks[0].id) });
  runtime.events?.emit?.("document-preview:fixture-selected", { fixtureId: String(id || "") });
}

function setNativeShell(value) {
  const nativeShell = value === "ios" || value === "android" ? value : "";
  runtime.state?.set?.({ documentPreviewNativeShell: nativeShell });
  runtime.events?.emit?.("document-preview:native-shell-changed", { nativeShell });
}

function toggleOpenIn() {
  const current = Boolean(runtime.state?.get?.("documentPreviewOpenInAvailable"));
  runtime.state?.set?.({ documentPreviewOpenInAvailable: !current });
  runtime.events?.emit?.("document-preview:open-in-changed", { available: !current });
}

function classForStatus(status = "") {
  if (status === "ready") return "ok";
  if (status === "blocked") return "blocked";
  return "muted";
}

function fixtureTabs(activeId) {
  return fixtureLinks.map((fixture) => `
    <button
      type="button"
      class="vdp-tab${fixture.id === activeId ? " active" : ""}"
      data-vdp-fixture="${escapeHtml(fixture.id)}"
      aria-pressed="${fixture.id === activeId ? "true" : "false"}"
    >${escapeHtml(fixture.label)}</button>
  `).join("");
}

function actionButtons(model) {
  if (!model.actions.length) return `<li class="vdp-empty">没有可用操作</li>`;
  return model.actions.map((action) => `
    <li>
      <button class="vdp-action" type="button" disabled>
        <span>${escapeHtml(action.label)}</span>
        <small>${escapeHtml(action.detail)}</small>
      </button>
    </li>
  `).join("");
}

function evidenceRows(model) {
  const rows = [
    ["类型", model.previewType],
    ["状态", model.status],
    ["文档类型", model.documentKind || "-"],
    ["打开策略", model.openStrategy],
    ["原生类型", model.nativeKind || "-"],
    ["Source", model.sourceUrl || "-"],
    ["Viewer", model.viewerUrl || "-"],
    ["Native URL", model.nativeUrl || "-"],
    ["Markdown API", model.previewFetchUrl || "-"],
  ];
  return rows.map(([label, value]) => `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `).join("");
}

function nativeControls(options) {
  const nativeShell = options.nativeShell || "";
  return `
    <div class="vdp-controls" aria-label="原生壳模拟">
      <button type="button" class="vdp-control${nativeShell ? "" : " active"}" data-vdp-native-shell="">浏览器</button>
      <button type="button" class="vdp-control${nativeShell === "ios" ? " active" : ""}" data-vdp-native-shell="ios">iOS</button>
      <button type="button" class="vdp-control${nativeShell === "android" ? " active" : ""}" data-vdp-native-shell="android">Android</button>
      <button type="button" class="vdp-control${options.nativeDocumentOpenInAvailable ? " active" : ""}" data-vdp-toggle-open-in>
        Open In ${options.nativeDocumentOpenInAvailable ? "on" : "off"}
      </button>
    </div>
  `;
}

function renderShell(root, fixture = selectedFixture()) {
  const options = previewOptions();
  const model = buildPreviewLinkViewModel(fixture, options);
  root.innerHTML = `
    <div class="homeai-vite-document-preview">
      <section class="vdp-shell">
        <header class="vdp-topbar">
          <div>
            <p class="vdp-eyebrow">Vite island 开发预览</p>
            <h1 class="vdp-title">文件预览策略</h1>
            <p class="vdp-subtitle">验证 Markdown、PPTX、PDF、图片和原生壳打开策略；此页不下载、不分享、不写入生产数据。</p>
          </div>
          <div class="vdp-badges">
            <span class="vdp-badge ${escapeHtml(classForStatus(model.status))}">${escapeHtml(model.status)}</span>
            <span class="vdp-badge">只读预览</span>
          </div>
        </header>

        <nav class="vdp-tabs" aria-label="文件类型">${fixtureTabs(fixture.id)}</nav>
        ${nativeControls(options)}

        <div class="vdp-grid">
          <article class="vdp-card">
            <h2>${escapeHtml(model.title)}</h2>
            <p class="vdp-summary">${escapeHtml(model.summary)}</p>
            <ul class="vdp-actions">${actionButtons(model)}</ul>
          </article>

          <article class="vdp-card">
            <h2>有界证据</h2>
            <dl class="vdp-evidence">${evidenceRows(model)}</dl>
          </article>
        </div>
      </section>
    </div>
  `;
  root.querySelectorAll("[data-vdp-fixture]").forEach((button) => {
    button.addEventListener("click", () => {
      setSelectedFixture(button.dataset.vdpFixture || "");
      renderShell(root);
    });
  });
  root.querySelectorAll("[data-vdp-native-shell]").forEach((button) => {
    button.addEventListener("click", () => {
      setNativeShell(button.dataset.vdpNativeShell || "");
      renderShell(root);
    });
  });
  root.querySelector("[data-vdp-toggle-open-in]")?.addEventListener("click", () => {
    toggleOpenIn();
    renderShell(root);
  });
  return model;
}

export function mount(target = document.querySelector("[data-homeai-vite-document-preview]")) {
  if (!target) return null;
  installStyles(target);
  renderShell(target);
  return {
    refresh: () => renderShell(target),
  };
}

browserRoot.HomeAIViteDocumentPreviewPreview = Object.freeze({
  mount,
  fixtures: () => fixtureLinks.map((fixture) => Object.assign({}, fixture)),
  currentModel: () => buildPreviewLinkViewModel(selectedFixture(), previewOptions()),
  selectFixture: (id) => setSelectedFixture(id),
  setNativeShell,
  toggleOpenIn,
  version: DOCUMENT_PREVIEW_ISLAND_VERSION,
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => mount(), { once: true });
} else {
  mount();
}
