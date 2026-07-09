"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(repoRoot, "public", "app-task-preview-helpers-ui.js"), "utf8");

assert.doesNotMatch(source, /X-Hermes-Web-Key/);
assert.doesNotMatch(source, /(?<![\w$.])fetch\s*\(/);
assert.doesNotMatch(source, /localStorage/);
assert.match(source, /预览接口未就绪/);
assert.match(source, /文件预览下载未就绪/);

const calls = { api: [], blob: [], absolute: [], modelImports: [], modelWorkspace: [], modelBaseName: [], modelShareUrl: [] };
const taskPreviewHelpersModel = {
  previewShareUrlPlan(value, options) {
    calls.modelShareUrl.push({ value, options });
    return `model:${value}:${options.baseHref}`;
  },
  workspaceIdPlan(input) {
    calls.modelWorkspace.push(input);
    return input.runtimeWorkspaceId || input.classicWorkspaceId || input.fallbackWorkspaceId;
  },
  generatedBaseNamePlan(title, extension) {
    calls.modelBaseName.push({ title, extension });
    return `model-${String(title || "untitled").replace(/\s+/g, "-")}.${extension}`;
  },
  canShareFilesPlan(input) {
    return Boolean(input.hasShare && (!input.hasCanShare || input.canShareResult));
  },
  isUserCancelledSharePlan(input) {
    return input.name === "AbortError" || input.name === "NotAllowedError";
  },
  previewStatusPlan(message, kind) {
    return {
      text: String(message || "").toUpperCase(),
      hidden: !message,
      isError: kind === "error",
      isSuccess: kind === "success",
    };
  },
  previewMoreMenuTogglePlan(input) {
    return {
      open: !input.currentlyOpen,
      ariaExpanded: input.currentlyOpen ? "false" : "true",
      menuHidden: Boolean(input.currentlyOpen),
    };
  },
  previewOverlayOpenPlan(input) {
    return Boolean(input.hasImageOverlay || input.hasDocumentOverlay || input.hasMarkdownOverlay);
  },
  previewBackSwipeSurfacePlan(input) {
    return Object.keys(input.availableSelectors || {}).find((selector) => input.availableSelectors[selector]) || "";
  },
};
const context = {
  console,
  URL,
  Blob,
  File,
  btoa,
  navigator: {},
  document: {
    body: {
      append() {},
    },
    createElement() {
      return {
        click() {},
        remove() {},
      };
    },
    querySelectorAll() {
      return [];
    },
    getElementById() {
      return null;
    },
  },
  location: {
    href: "http://127.0.0.1/tasks",
  },
  localStorage: {
    getItem() {
      throw new Error("preview helper should prefer runtime facade before localStorage");
    },
  },
  setTimeout,
  __homeAiImportTaskPreviewHelpersModel(modulePath) {
    calls.modelImports.push(modulePath);
    return Promise.resolve(taskPreviewHelpersModel);
  },
  HomeAiRuntimeFacade: {
    state: {
      get(key) {
        return key === "selectedWorkspaceId" ? "workspace-from-runtime" : "";
      },
    },
    api(pathname, options = {}) {
      calls.api.push({ pathname, options });
      return Promise.resolve({ ok: true, text: "# Runtime" });
    },
    documentPreview: {
      absoluteUrl(value) {
        calls.absolute.push(value);
        return `runtime:${value}`;
      },
      fetchBlob(value) {
        calls.blob.push(value);
        return Promise.resolve({
          type: "text/markdown",
          size: 128,
          text: () => Promise.resolve("# Runtime Markdown"),
        });
      },
    },
  },
};

context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: "app-task-preview-helpers-ui.js" });

(async () => {
  await Promise.resolve();
  await Promise.resolve();
  const helpers = context.TaskDocumentPreviewHelpers;
  assert.equal(
    helpers.TASK_PREVIEW_HELPERS_MODEL_ESM_PATH,
    "/vite-islands/task-preview-helpers-model/task-preview-helpers-model.js",
  );
  assert.equal(typeof helpers.importTaskPreviewHelpersModel, "function");
  assert.equal(typeof helpers.currentTaskPreviewHelpersModel, "function");
  assert.deepEqual(calls.modelImports, ["/vite-islands/task-preview-helpers-model/task-preview-helpers-model.js"]);
  assert.equal(helpers.currentTaskPreviewHelpersModel(), taskPreviewHelpersModel);

  assert.equal(helpers.currentWorkspaceId(), "workspace-from-runtime");
  assert.equal(calls.modelWorkspace.length, 1);
  assert.equal(calls.modelWorkspace[0].runtimeWorkspaceId, "workspace-from-runtime");
  assert.equal(helpers.generatedBaseName("Runtime Note", "md"), "model-Runtime-Note.md");
  assert.deepEqual(calls.modelBaseName, [{ title: "Runtime Note", extension: "md" }]);
  assert.equal(helpers.previewShareUrl("/api/files?artifactId=a1"), "runtime:/api/files?artifactId=a1");
  const absoluteUrl = context.HomeAiRuntimeFacade.documentPreview.absoluteUrl;
  context.HomeAiRuntimeFacade.documentPreview.absoluteUrl = null;
  assert.equal(
    helpers.previewShareUrl("/api/files?artifactId=a2"),
    "model:/api/files?artifactId=a2:http://127.0.0.1/tasks",
  );
  context.HomeAiRuntimeFacade.documentPreview.absoluteUrl = absoluteUrl;

  const body = await helpers.previewApi("/api/files/preview?artifactId=a1");
  assert.deepEqual(body, { ok: true, text: "# Runtime" });
  assert.equal(calls.api.length, 1);
  assert.equal(calls.api[0].pathname, "/api/files/preview?artifactId=a1");

  const blob = await helpers.fetchPreviewBlob("/api/files?artifactId=a1");
  assert.equal(blob.type, "text/markdown");
  const text = await helpers.fetchPreviewText("/api/files/preview?artifactId=a1");
  assert.equal(text, "# Runtime Markdown");
  assert.deepEqual(calls.blob, ["/api/files?artifactId=a1", "/api/files/preview?artifactId=a1"]);
  assert.deepEqual(calls.absolute, ["/api/files?artifactId=a1"]);
  assert.equal(calls.modelShareUrl.length, 1);
  assert.equal(calls.modelShareUrl[0].value, "/api/files?artifactId=a2");
  assert.equal(calls.modelShareUrl[0].options.baseHref, "http://127.0.0.1/tasks");
  console.log("task preview helpers runtime facade tests passed");
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
