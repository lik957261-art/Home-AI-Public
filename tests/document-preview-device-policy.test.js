"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-task-preview-ui.js"), "utf8");

function createHarness({ width, height, coarsePointer }) {
  const assigned = [];
  const context = {
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    Blob,
    File: function File() {},
    setTimeout,
    clearTimeout,
    innerWidth: width,
    innerHeight: height,
    visualViewport: { width, height },
    location: {
      origin: "http://127.0.0.1:8797",
      pathname: "/",
      search: "",
      hash: "",
      href: "http://127.0.0.1:8797/",
      assign(value) {
        assigned.push(value);
      },
    },
    history: {
      state: {},
      pushState() {},
      replaceState() {},
      back() {},
    },
    localStorage: {
      getItem() {
        return "";
      },
    },
    matchMedia(query) {
      return { matches: query === "(pointer: coarse)" ? Boolean(coarsePointer) : false };
    },
    addEventListener() {},
    document: {
      documentElement: { clientWidth: width, clientHeight: height },
      body: {
        classList: { add() {}, remove() {} },
        contains() { return false; },
        appendChild() {},
      },
      getElementById() {
        return null;
      },
      createElement(tag) {
        return {
          tagName: String(tag || "").toUpperCase(),
          classList: { add() {}, remove() {} },
          setAttribute() {},
          addEventListener() {},
          querySelector() { return null; },
          remove() {},
        };
      },
    },
    TaskDocumentPreviewHelpers: {
      escapeValue(value) { return String(value || ""); },
      previewShareUrl(value) { return value; },
      currentWorkspaceId() { return "owner"; },
      previewApi() { throw new Error("previewApi should not be called"); },
      bytesToBase64() { return ""; },
      generatedBaseName(title, ext) { return `${title || "file"}.${ext}`; },
      canShareFiles() { return false; },
      isUserCancelledShare() { return false; },
      downloadGeneratedBlob() {},
      transientPreviewStatus() {},
      copyPreviewLink() {},
      sharePreviewLink() {},
      fetchPreviewBlob() {},
      savePreviewImageToAlbum() {},
      closePreviewMenus() {},
      bindPreviewMoreMenu() {},
      hasArtifactPreviewOverlay() { return false; },
      previewBackSwipeSurface() {},
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-task-preview-ui.js" });
  return { context, assigned };
}

function pdfLink() {
  return {
    href: "http://127.0.0.1:8797/pdf-viewer.html?src=%2Fapi%2Ffiles%3FartifactId%3Dartifact_pdf&name=sample.pdf&mime=application%2Fpdf",
    dataset: {
      artifactName: "sample.pdf",
      artifactMime: "application/pdf",
      artifactSize: "1024",
    },
    getAttribute(name) {
      return name === "href" ? this.href : "";
    },
  };
}

function textLink() {
  return {
    href: "http://127.0.0.1:8797/file-viewer.html?src=%2Fapi%2Ffiles%3FartifactId%3Dartifact_txt&name=notes.txt&mime=text%2Fplain",
    dataset: {
      artifactName: "notes.txt",
      artifactMime: "text/plain",
      artifactSize: "128",
    },
    getAttribute(name) {
      return name === "href" ? this.href : "";
    },
  };
}

function wordLink() {
  return {
    href: "http://127.0.0.1:8797/file-viewer.html?src=%2Fapi%2Ffiles%3FartifactId%3Dartifact_docx&name=report.docx&mime=application%2Fvnd.openxmlformats-officedocument.wordprocessingml.document",
    dataset: {
      artifactName: "report.docx",
      artifactMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      artifactSize: "2048",
    },
    getAttribute(name) {
      return name === "href" ? this.href : "";
    },
  };
}

{
  const { context } = createHarness({ width: 390, height: 844, coarsePointer: true });
  assert.equal(context.TaskDocumentPreviewUi.shouldUseWideNativeDocumentPreview(pdfLink()), false);
}

{
  const { context, assigned } = createHarness({ width: 1024, height: 768, coarsePointer: true });
  const link = pdfLink();
  assert.equal(context.TaskDocumentPreviewUi.shouldUseWideNativeDocumentPreview(link), true);
  assert.equal(context.TaskDocumentPreviewUi.documentNativeUrlFromLink(link), "/api/files?artifactId=artifact_pdf");
  assert.equal(context.TaskDocumentPreviewUi.openDocumentPreviewOverlay(link), true);
  assert.deepEqual(assigned, ["/api/files?artifactId=artifact_pdf"]);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseWideNativeDocumentPreview(wordLink()), false);
}

{
  const { context } = createHarness({ width: 1366, height: 1024, coarsePointer: false });
  assert.equal(context.TaskDocumentPreviewUi.shouldUseWideNativeDocumentPreview(pdfLink()), true);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseWideNativeDocumentPreview(textLink()), false);
}

console.log("document preview device policy ok");
