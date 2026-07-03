"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-task-preview-ui.js"), "utf8");
assert.doesNotMatch(source, /localStorage/);

function createHarness({ width, height, coarsePointer, nativeDocumentBridge, nativeShell } = {}) {
  const assigned = [];
  const nativeRequests = [];
  const appended = [];
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
    HomeAiRuntimeFacade: {
      native: {
        nativeShellParam() {
          return nativeShell || "";
        },
      },
    },
    localStorage: {
      getItem(key) {
        if (key === "homeAI.nativeShell") throw new Error("task preview UI should read native shell through runtime facade");
        return "";
      },
    },
    fetch() {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ text: "# Markdown Preview\n\nReady." }),
      });
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
        appendChild(node) { appended.push(node); },
      },
      getElementById() {
        return null;
      },
      createElement(tag) {
        return {
          tagName: String(tag || "").toUpperCase(),
          dataset: {},
          classList: { add() {}, remove() {} },
          setAttribute() {},
          addEventListener() {},
          querySelector() {
            return {
              addEventListener() {},
              setAttribute() {},
              classList: { add() {}, remove() {} },
            };
          },
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
  if (nativeDocumentBridge) {
    if (nativeDocumentBridge.rawAndroid) {
      context.HomeAIAndroidNativeDocument = {
        open(payload) {
          const request = JSON.parse(payload || "{}");
          nativeRequests.push(request);
          const result = nativeDocumentBridge.result || { ok: true, requestId: request.requestId };
          return JSON.stringify(Object.assign({ requestId: request.requestId }, result));
        },
      };
    } else {
      context.HomeAINativeDocumentCapability = {
        documentPreview: true,
        documentOpenIn: Boolean(nativeDocumentBridge.documentOpenIn),
        platform: nativeDocumentBridge.platform || "android",
        version: 1,
      };
      context.HomeAINativeDocument = {
        open(request) {
          nativeRequests.push(request);
          if (typeof nativeDocumentBridge.open === "function") return nativeDocumentBridge.open(request);
          return nativeDocumentBridge.result || { ok: true, requestId: request.requestId };
        },
      };
    }
  }
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-task-preview-ui.js" });
  return { context, assigned, nativeRequests, appended };
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

function markdownDeliverableLink({ name = "report.md", mime = "text/plain", href = "/api/automations/deliverable?jobId=job_1&name=opaque" } = {}) {
  return {
    href: `http://127.0.0.1:8797${href}`,
    textContent: name,
    dataset: {
      artifactName: name,
      artifactMime: mime,
      artifactSize: "256",
    },
    getAttribute(key) {
      if (key === "download") return "";
      if (key === "title") return "";
      if (key === "aria-label") return "";
      return key === "href" ? this.href : "";
    },
  };
}

function sparseMarkdownDeliverableLink() {
  return {
    href: "http://127.0.0.1:8797/api/automations/deliverable?jobId=job_1&filename=report.md",
    textContent: "",
    dataset: {
      artifactName: "",
      artifactMime: "text/plain",
      artifactSize: "256",
    },
    getAttribute(key) {
      if (key === "href") return this.href;
      if (key === "download") return "report.md";
      if (key === "title") return "";
      if (key === "aria-label") return "";
      return "";
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

function presentationLink() {
  return {
    href: "http://127.0.0.1:8797/file-viewer.html?src=%2Fapi%2Ffiles%3FartifactId%3Dartifact_pptx&name=deck.pptx&mime=application%2Fvnd.openxmlformats-officedocument.presentationml.presentation",
    dataset: {
      artifactName: "deck.pptx",
      artifactMime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      artifactSize: "4096",
    },
    getAttribute(name) {
      return name === "href" ? this.href : "";
    },
  };
}

{
  const { context, assigned } = createHarness({ width: 390, height: 844, coarsePointer: true });
  assert.equal(context.TaskDocumentPreviewUi.shouldUseWideNativeDocumentPreview(pdfLink()), false);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseNativeDocumentPreview(pdfLink()), false);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseWideNativeDocumentPreview(wordLink()), false);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseNativeDocumentPreview(wordLink()), false);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseWideNativeDocumentPreview(presentationLink()), false);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseNativeDocumentPreview(presentationLink()), false);
  assert.equal(context.TaskDocumentPreviewUi.documentPreviewUsesInAppOverlay(), true);
  assert.equal(context.TaskDocumentPreviewUi.openDocumentPreviewOverlay(wordLink()), true);
  assert.equal(context.TaskDocumentPreviewUi.openDocumentPreviewOverlay(presentationLink()), true);
  assert.deepEqual(assigned, []);
}

{
  const { context, assigned, nativeRequests, appended } = createHarness({
    width: 390,
    height: 844,
    coarsePointer: true,
    nativeDocumentBridge: { platform: "android", result: { ok: true } },
  });
  assert.equal(context.TaskDocumentPreviewUi.nativeDocumentBridgeAvailable(), true);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseNativeShellDocumentPreview(pdfLink()), true);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseNativeDocumentPreview(pdfLink()), true);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseNativeShellDocumentPreview(wordLink()), true);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseNativeDocumentPreview(wordLink()), true);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseNativeDocumentPreview(presentationLink()), true);
  assert.equal(context.TaskDocumentPreviewUi.openDocumentPreviewOverlay(wordLink()), true);
  assert.equal(nativeRequests.length, 1);
  assert.equal(nativeRequests[0].type, "homeai.nativeDocument.open");
  assert.equal(nativeRequests[0].version, 1);
  assert.equal(nativeRequests[0].url, "/api/files?artifactId=artifact_docx");
  assert.equal(nativeRequests[0].filename, "report.docx");
  assert.equal(nativeRequests[0].mimeType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(nativeRequests[0].kind, "word");
  assert.equal(nativeRequests[0].requiresAuth, true);
  assert.equal(nativeRequests[0].sourceSurface, "task-preview");
  assert.deepEqual(assigned, []);
  assert.deepEqual(appended, []);
}

{
  const { context, assigned, nativeRequests, appended } = createHarness({
    width: 390,
    height: 844,
    coarsePointer: true,
    nativeShell: "android",
  });
  assert.equal(context.TaskDocumentPreviewUi.nativeDocumentBridgeAvailable(), false);
  assert.equal(context.TaskDocumentPreviewUi.nativeDocumentBridgeExpected(), true);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseNativeShellDocumentPreview(wordLink()), true);
  assert.equal(context.TaskDocumentPreviewUi.openDocumentPreviewOverlay(wordLink()), true);
  assert.deepEqual(nativeRequests, []);
  assert.deepEqual(assigned, []);
  assert.equal(appended.length, 1);
}

{
  const { context, assigned, nativeRequests, appended } = createHarness({ width: 390, height: 844, coarsePointer: true });
  const link = markdownDeliverableLink();
  assert.equal(context.TaskDocumentPreviewUi.isMarkdownPreviewLink(link), true);
  assert.equal(context.TaskDocumentPreviewUi.isDocumentPreviewLink(link), false);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseNativeDocumentPreview(link), false);
  assert.equal(context.TaskDocumentPreviewUi.openMarkdownPreviewOverlay(link), true);
  assert.deepEqual(nativeRequests, []);
  assert.deepEqual(assigned, []);
  assert.equal(appended.length, 1);
}

{
  const { context } = createHarness({ width: 390, height: 844, coarsePointer: true });
  assert.equal(context.TaskDocumentPreviewUi.isMarkdownPreviewLink(markdownDeliverableLink({
    name: "delivery",
    mime: "",
    href: "/file-viewer.html?src=%2Fapi%2Ffiles%3FartifactId%3Dartifact_md&name=summary.markdown&mime=text%2Fplain",
  })), true);
  assert.equal(context.TaskDocumentPreviewUi.isMarkdownPreviewLink(sparseMarkdownDeliverableLink()), true);
  assert.equal(context.TaskDocumentPreviewUi.isDocumentPreviewLink(sparseMarkdownDeliverableLink()), false);
}

{
  const { context, assigned, nativeRequests, appended } = createHarness({
    width: 390,
    height: 844,
    coarsePointer: true,
    nativeDocumentBridge: { rawAndroid: true, result: { ok: true } },
  });
  assert.equal(context.TaskDocumentPreviewUi.nativeDocumentBridgeAvailable(), true);
  assert.equal(context.TaskDocumentPreviewUi.nativeDocumentBridgeExpected(), true);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseNativeShellDocumentPreview(pdfLink()), true);
  assert.equal(context.TaskDocumentPreviewUi.openDocumentPreviewOverlay(pdfLink()), true);
  assert.equal(nativeRequests.length, 1);
  assert.equal(nativeRequests[0].kind, "pdf");
  assert.equal(nativeRequests[0].url, "/api/files?artifactId=artifact_pdf");
  assert.deepEqual(assigned, []);
  assert.deepEqual(appended, []);
}

{
  const { context, assigned, nativeRequests, appended } = createHarness({
    width: 390,
    height: 844,
    coarsePointer: true,
    nativeDocumentBridge: { platform: "ios", result: { ok: false, error: "no_native_document_handler" } },
  });
  assert.equal(context.TaskDocumentPreviewUi.shouldUseNativeShellDocumentPreview(presentationLink()), true);
  assert.equal(context.TaskDocumentPreviewUi.openDocumentPreviewOverlay(presentationLink()), true);
  assert.equal(nativeRequests.length, 1);
  assert.equal(nativeRequests[0].kind, "powerpoint");
  assert.equal(nativeRequests[0].url, "/api/files?artifactId=artifact_pptx");
  assert.deepEqual(assigned, []);
  assert.equal(appended.length, 1);
}

{
  const { context, assigned } = createHarness({ width: 1024, height: 768, coarsePointer: true });
  const link = pdfLink();
  assert.equal(context.TaskDocumentPreviewUi.shouldUseWideNativeDocumentPreview(link), false);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseNativeDocumentPreview(link), false);
  assert.equal(context.TaskDocumentPreviewUi.documentPreviewUsesInAppOverlay(), true);
  assert.equal(context.TaskDocumentPreviewUi.documentNativeUrlFromLink(link), "/api/files?artifactId=artifact_pdf");
  assert.equal(context.TaskDocumentPreviewUi.openDocumentPreviewOverlay(link), true);
  assert.deepEqual(assigned, []);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseWideNativeDocumentPreview(wordLink()), false);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseNativeDocumentPreview(wordLink()), false);
  assert.equal(context.TaskDocumentPreviewUi.documentNativeUrlFromLink(wordLink()), "/api/files?artifactId=artifact_docx");
  assert.equal(context.TaskDocumentPreviewUi.shouldUseWideNativeDocumentPreview(presentationLink()), false);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseNativeDocumentPreview(presentationLink()), false);
  assert.equal(context.TaskDocumentPreviewUi.documentNativeUrlFromLink(presentationLink()), "/api/files?artifactId=artifact_pptx");
}

{
  const { context } = createHarness({ width: 1366, height: 1024, coarsePointer: false });
  assert.equal(context.TaskDocumentPreviewUi.shouldUseWideNativeDocumentPreview(pdfLink()), true);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseWideNativeDocumentPreview(wordLink()), false);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseWideNativeDocumentPreview(presentationLink()), false);
  assert.equal(context.TaskDocumentPreviewUi.documentPreviewUsesInAppOverlay(), false);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseNativeDocumentPreview(wordLink()), true);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseNativeDocumentPreview(presentationLink()), true);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseWideNativeDocumentPreview(textLink()), false);
  assert.equal(context.TaskDocumentPreviewUi.shouldUseNativeDocumentPreview(textLink()), false);
}

(async () => {
  {
    const { context, nativeRequests } = createHarness({
      width: 390,
      height: 844,
      coarsePointer: true,
      nativeDocumentBridge: { platform: "ios", documentOpenIn: true, result: { ok: true } },
    });
    assert.equal(context.TaskDocumentPreviewUi.nativeDocumentOpenInAvailable(), true);
    assert.equal(await context.TaskDocumentPreviewUi.openNativeDocumentOpenInFromInput({
      sourceUrl: "/api/files?artifactId=artifact_docx",
      title: "report.docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      kind: "word",
    }), true);
    assert.equal(nativeRequests.length, 1);
    assert.equal(nativeRequests[0].mode, "openIn");
    assert.equal(nativeRequests[0].type, "homeai.nativeDocument.open");
    assert.equal(nativeRequests[0].url, "/api/files?artifactId=artifact_docx");
    assert.equal(nativeRequests[0].filename, "report.docx");
    assert.equal(nativeRequests[0].kind, "word");
    assert.equal(nativeRequests[0].requiresAuth, true);
  }

  {
    const { context, nativeRequests } = createHarness({
      width: 390,
      height: 844,
      coarsePointer: true,
      nativeDocumentBridge: { platform: "ios", result: { ok: true } },
    });
    assert.equal(context.TaskDocumentPreviewUi.nativeDocumentOpenInAvailable(), false);
    assert.equal(await context.TaskDocumentPreviewUi.openNativeDocumentOpenInFromInput({
      sourceUrl: "/api/files?artifactId=artifact_pptx",
      title: "deck.pptx",
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      kind: "presentation",
    }), false);
    assert.deepEqual(nativeRequests, []);
  }

  console.log("document preview device policy ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
