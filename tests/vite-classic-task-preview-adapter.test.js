"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public/app-task-preview-ui.js"), "utf8");

function previewLink(overrides = {}) {
  return Object.assign({
    href: "/file-viewer.html?src=%2Fapi%2Ffiles%3FartifactId%3Ddeck&name=deck.pptx&mime=application%2Fvnd.openxmlformats-officedocument.presentationml.presentation",
    dataset: {
      artifactName: "deck.pptx",
      artifactMime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    },
    textContent: "deck.pptx",
    getAttribute(name) {
      if (name === "href") return this.href;
      if (name === "aria-label") return this.dataset.artifactName || "";
      if (name === "title") return this.dataset.artifactName || "";
      return "";
    },
  }, overrides);
}

function createHarness(fakeModel = null, importer = null) {
  const calls = [];
  const context = {
    console,
    Promise,
    Date,
    Math,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    addEventListener() {},
    removeEventListener() {},
    location: {
      origin: "http://127.0.0.1:8797",
      pathname: "/tasks",
      search: "?nativeShell=ios",
      hash: "",
      href: "http://127.0.0.1:8797/tasks?nativeShell=ios",
      assign(url) {
        calls.push(["assign", url]);
      },
    },
    history: {
      state: {},
      pushState() {},
      replaceState() {},
      back() {},
    },
    crypto: {
      randomUUID() {
        return "uuid-test";
      },
    },
    visualViewport: { width: 390, height: 844 },
    matchMedia() {
      return { matches: true };
    },
    HomeAINativeDocumentCapability: {
      documentPreview: true,
      documentOpenIn: true,
    },
    HomeAINativeDocument: {
      open(request) {
        calls.push(["native-open", request]);
        return { ok: true, requestId: request.requestId };
      },
    },
    document: {
      documentElement: {
        clientWidth: 390,
        clientHeight: 844,
        dataset: { nativeShell: "ios" },
      },
      body: {
        classList: { add() {}, remove() {} },
        appendChild() {},
        contains() { return false; },
      },
      getElementById() { return null; },
      createElement() {
        return {
          dataset: {},
          classList: { add() {}, remove() {} },
          setAttribute() {},
          addEventListener() {},
          querySelector() { return null; },
          querySelectorAll() { return []; },
          remove() {},
        };
      },
    },
    TaskDocumentPreviewHelpers: {
      escapeValue(value) { return String(value ?? ""); },
      previewShareUrl(value) { return String(value || ""); },
      currentWorkspaceId() { return "owner"; },
      previewApi() { return Promise.resolve({}); },
      bytesToBase64() { return ""; },
      generatedBaseName(title, ext) { return `${title || "file"}.${ext}`; },
      canShareFiles() { return false; },
      isUserCancelledShare() { return false; },
      downloadGeneratedBlob() {},
      transientPreviewStatus() {},
      copyPreviewLink() { return Promise.resolve(true); },
      sharePreviewLink() { return Promise.resolve(false); },
      fetchPreviewBlob() { return Promise.resolve(new Blob(["x"])); },
      fetchPreviewText() { return Promise.resolve("# doc"); },
      savePreviewImageToAlbum() { return Promise.resolve(true); },
      closePreviewMenus() {},
      bindPreviewMoreMenu() {},
      hasArtifactPreviewOverlay() { return false; },
      previewBackSwipeSurface() { return null; },
    },
    __homeAiImportTaskDocumentPreviewModel(importPath) {
      calls.push(["import", importPath]);
      if (typeof importer === "function") return importer(importPath);
      return Promise.resolve(fakeModel);
    },
    __calls: calls,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "app-task-preview-ui.js" });
  return context;
}

async function flushImport() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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

(async () => {
  await test("classic task preview adapter declares bounded ESM import path", () => {
    assert.match(source, /TASK_DOCUMENT_PREVIEW_MODEL_ESM_PATH/);
    assert.match(source, /\/vite-islands\/document-preview-model\/document-preview-model\.js/);
    assert.match(source, /__homeAiImportTaskDocumentPreviewModel/);
    assert.match(source, /importTaskDocumentPreviewModel/);
    assert.match(source, /currentTaskDocumentPreviewModel/);
    assert.match(source, /buildPreviewLinkViewModel/);
    assert.match(source, /documentViewerUrlFromLink/);
    assert.match(source, /nativeDocumentOpenRequestFromLink/);
  });

  await test("classic task preview adapter uses loaded ESM model for preview decisions", async () => {
    const modelCalls = [];
    const fakeModel = {
      buildPreviewLinkViewModel() { return {}; },
      documentKindFromLink(link) {
        modelCalls.push(["kind", link.dataset.artifactName]);
        return "presentation";
      },
      documentKindUsesNativePreview(kind) {
        modelCalls.push(["native-kind", kind]);
        return kind === "presentation";
      },
      documentKindUsesWideNativePreview(kind) {
        modelCalls.push(["wide-kind", kind]);
        return kind === "pdf";
      },
      documentNativeUrlFromLink(link) {
        modelCalls.push(["native-url", link.dataset.artifactName]);
        return "/model/native-url";
      },
      documentPreviewUsesInAppOverlay(metrics) {
        modelCalls.push(["overlay", metrics.width]);
        return true;
      },
      documentSourceFromLink(link) {
        modelCalls.push(["source", link.dataset.artifactName]);
        return "/model/source";
      },
      documentViewerUrlFromLink(link) {
        modelCalls.push(["viewer", link.dataset.artifactName]);
        return "/model/viewer";
      },
      isImagePreviewLink() {
        modelCalls.push(["image"]);
        return false;
      },
      isMarkdownPreviewLink() {
        modelCalls.push(["markdown"]);
        return false;
      },
      markdownPreviewFetchUrl(value) {
        modelCalls.push(["markdown-fetch", value]);
        return "/model/markdown-preview";
      },
      markdownSourceFromLink(link) {
        modelCalls.push(["markdown-source", link.dataset.artifactName]);
        return "/model/markdown-source";
      },
      nativeDocumentOpenRequestFromLink(link, options) {
        modelCalls.push(["native-request", options.sourceSurface]);
        return { type: "homeai.nativeDocument.open", requestId: options.requestId, url: "/model/native-url", kind: "powerpoint" };
      },
      shouldUseNativeDocumentPreview() {
        modelCalls.push(["native-preview"]);
        return true;
      },
      shouldUseNativeShellDocumentPreview() {
        modelCalls.push(["native-shell"]);
        return true;
      },
      shouldUseWideNativeDocumentPreview() {
        modelCalls.push(["wide-native"]);
        return false;
      },
    };
    const context = createHarness(fakeModel);
    await flushImport();

    const link = previewLink();
    assert.equal(context.TaskDocumentPreviewUi.isDocumentPreviewLink(link), true);
    assert.equal(context.TaskDocumentPreviewUi.documentNativeUrlFromLink(link), "/model/native-url");
    assert.equal(context.TaskDocumentPreviewUi.nativeDocumentOpenRequestFromLink(link).url, "/model/native-url");
    assert.equal(context.TaskDocumentPreviewUi.shouldUseNativeDocumentPreview(link), true);
    assert.equal(context.TaskDocumentPreviewUi.shouldUseNativeShellDocumentPreview(link), true);
    assert.deepEqual(context.__calls[0], ["import", "/vite-islands/document-preview-model/document-preview-model.js"]);
    assert.ok(modelCalls.some((call) => call[0] === "kind"));
    assert.ok(modelCalls.some((call) => call[0] === "native-request"));
  });

  await test("classic task preview fallback remains usable before ESM model loads", () => {
    const context = createHarness(null, () => new Promise(() => {}));
    const link = previewLink();
    assert.equal(context.TaskDocumentPreviewUi.isDocumentPreviewLink(link), true);
    assert.equal(context.TaskDocumentPreviewUi.documentKindUsesNativePreview("presentation"), true);
    assert.equal(context.TaskDocumentPreviewUi.documentKindUsesWideNativePreview("pdf"), true);
    assert.equal(context.TaskDocumentPreviewUi.documentNativeUrlFromLink(link), "/api/files?artifactId=deck");
    assert.equal(context.TaskDocumentPreviewUi.nativeDocumentOpenRequestFromLink(link).kind, "powerpoint");
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
