"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function loadModel() {
  const moduleUrl = pathToFileURL(path.join(
    repoRoot,
    "src/vite-islands/document-preview/model.mjs",
  )).href;
  return import(`${moduleUrl}?test=${Date.now()}-${Math.random()}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

function markdownLink(overrides = {}) {
  return Object.assign({
    href: "/file-viewer.html?src=%2Fapi%2Ffiles%3FartifactId%3Dartifact_md&name=summary.md&mime=text%2Fmarkdown",
    dataset: {
      artifactName: "summary.md",
      artifactMime: "text/markdown",
      artifactSize: "2048",
    },
    textContent: "summary.md",
  }, overrides);
}

function presentationLink() {
  return {
    href: "/file-viewer.html?src=%2Fapi%2Ffiles%3FartifactId%3Dartifact_pptx&name=deck.pptx&mime=application%2Fvnd.openxmlformats-officedocument.presentationml.presentation",
    dataset: {
      artifactName: "deck.pptx",
      artifactMime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      artifactSize: "4096",
    },
    textContent: "deck.pptx",
  };
}

function pdfLink() {
  return {
    href: "/pdf-viewer.html?src=%2Fapi%2Ffiles%3FartifactId%3Dartifact_pdf&name=brief.pdf&mime=application%2Fpdf",
    dataset: {
      artifactName: "brief.pdf",
      artifactMime: "application/pdf",
    },
    textContent: "brief.pdf",
  };
}

function baseOptions(overrides = {}) {
  return Object.assign({
    origin: "http://127.0.0.1:8797",
    currentPath: "/tasks",
    viewport: { width: 390, height: 844, coarsePointer: true },
    requestId: "req_test",
  }, overrides);
}

(async () => {
  const model = await loadModel();

  await test("document preview model source is browser-global free", async () => {
    const source = read("src/vite-islands/document-preview/model.mjs");
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bdocument\./);
    assert.doesNotMatch(source, /\bDocument\b/);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /\bsessionStorage\b/);
    assert.doesNotMatch(source, /\bnavigator\b/);
    assert.doesNotMatch(source, /(?<![\w$.])fetch\s*\(/);
    assert.doesNotMatch(source, /X-Hermes-Web-Key/);
  });

  await test("Markdown deliverables route to in-app Markdown preview", async () => {
    const view = model.buildPreviewLinkViewModel(markdownLink(), baseOptions());
    assert.equal(model.isMarkdownPreviewLink(markdownLink(), baseOptions()), true);
    assert.equal(view.previewType, "markdown");
    assert.equal(view.status, "ready");
    assert.equal(view.openStrategy, "in-app-markdown");
    assert.equal(view.previewFetchUrl, "/api/files/preview?artifactId=artifact_md");
    assert.equal(view.actions.map((action) => action.id).join(","), "group,md,html,word,pdf,copy,open");
    assert.equal(model.documentKindFromLink(markdownLink(), baseOptions()), "");
  });

  await test("sparse Markdown names are detected from viewer query parameters", async () => {
    const sparse = markdownLink({
      href: "/file-viewer.html?src=%2Fapi%2Ffiles%3FartifactId%3Dartifact_md&name=delivery.markdown&mime=text%2Fplain",
      dataset: { artifactName: "", artifactMime: "" },
      textContent: "delivery",
    });
    assert.equal(model.isMarkdownPreviewLink(sparse, baseOptions()), true);
    const view = model.buildPreviewLinkViewModel(sparse, baseOptions());
    assert.equal(view.previewType, "markdown");
    assert.equal(view.previewFetchUrl, "/api/files/preview?artifactId=artifact_md");
  });

  await test("PPTX links normalize to presentation and PowerPoint native requests", async () => {
    const link = presentationLink();
    const view = model.buildPreviewLinkViewModel(link, baseOptions({ nativeShell: "ios" }));
    assert.equal(model.documentKindFromLink(link, baseOptions()), "presentation");
    assert.equal(view.previewType, "document");
    assert.equal(view.documentKind, "presentation");
    assert.equal(view.nativeKind, "powerpoint");
    assert.equal(view.openStrategy, "native-bridge");
    assert.equal(view.nativeUrl, "/api/files?artifactId=artifact_pptx");
    assert.equal(view.viewerUrl, "/file-viewer.html?src=%2Fapi%2Ffiles%3FartifactId%3Dartifact_pptx&name=deck.pptx&mime=application%2Fvnd.openxmlformats-officedocument.presentationml.presentation&embed=1&nativeShell=ios");
    assert.equal(view.nativeRequest.kind, "powerpoint");
    assert.equal(view.nativeRequest.url, "/api/files?artifactId=artifact_pptx");
    assert.equal(view.nativeRequest.requiresAuth, true);
  });

  await test("mobile browser without native bridge keeps Office files in app overlay", async () => {
    const view = model.buildPreviewLinkViewModel(presentationLink(), baseOptions());
    assert.equal(view.openStrategy, "in-app-overlay");
    assert.equal(view.shouldUseNativePreview, false);
    assert.equal(view.usesInAppOverlay, true);
  });

  await test("native Open In availability takes priority for Office documents", async () => {
    const view = model.buildPreviewLinkViewModel(presentationLink(), baseOptions({
      nativeShell: "ios",
      nativeDocumentOpenInAvailable: true,
    }));
    assert.equal(view.openStrategy, "native-open-in");
    assert.equal(view.nativeRequest.kind, "powerpoint");
  });

  await test("wide desktop PDF can use native URL while mobile stays in overlay", async () => {
    const desktop = model.buildPreviewLinkViewModel(pdfLink(), baseOptions({
      viewport: { width: 1024, height: 768, coarsePointer: false },
    }));
    const mobile = model.buildPreviewLinkViewModel(pdfLink(), baseOptions());
    assert.equal(desktop.documentKind, "pdf");
    assert.equal(desktop.openStrategy, "native-url");
    assert.equal(desktop.shouldUseNativePreview, true);
    assert.equal(mobile.openStrategy, "in-app-overlay");
    assert.equal(mobile.shouldUseNativePreview, false);
  });

  await test("external unknown files fail closed as unsupported", async () => {
    const view = model.buildPreviewLinkViewModel({
      href: "https://example.invalid/private.bin",
      dataset: { artifactName: "private.bin", artifactMime: "application/octet-stream" },
    }, baseOptions());
    assert.equal(view.previewType, "unsupported");
    assert.equal(view.status, "blocked");
    assert.equal(view.actions.length, 0);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
