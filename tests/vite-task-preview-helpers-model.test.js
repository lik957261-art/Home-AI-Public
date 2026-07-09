"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");
const modelPath = path.join(repoRoot, "src/vite-islands/document-preview/preview-helpers-model.mjs");
const source = fs.readFileSync(modelPath, "utf8");

assert.doesNotMatch(source, /\bwindow\b/);
assert.doesNotMatch(source, /\bdocument\./);
assert.doesNotMatch(source, /\blocalStorage\b/);
assert.doesNotMatch(source, /\bsessionStorage\b/);
assert.doesNotMatch(source, /\bnavigator\b/);
assert.doesNotMatch(source, /(?<![\w$.])fetch\s*\(/);
assert.doesNotMatch(source, /X-Hermes-Web-Key/);

(async () => {
  const model = await import(pathToFileURL(modelPath).href);

  assert.equal(model.TASK_PREVIEW_HELPERS_MODEL_VERSION, "20260705-vite-task-preview-helpers-model-v1");
  assert.equal(
    model.previewShareUrlPlan("/api/files?artifactId=a1", { baseHref: "http://127.0.0.1/tasks" }),
    "http://127.0.0.1/api/files?artifactId=a1",
  );
  assert.equal(model.previewShareUrlPlan("not a url", { baseHref: "::::" }), "not a url");

  assert.equal(model.workspaceIdPlan({
    runtimeWorkspaceId: " runtime ",
    classicWorkspaceId: "classic",
    fallbackWorkspaceId: "owner",
  }), "runtime");
  assert.equal(model.workspaceIdPlan({
    runtimeWorkspaceId: "",
    classicWorkspaceId: "classic",
    fallbackWorkspaceId: "owner",
  }), "classic");
  assert.equal(model.workspaceIdPlan({}), "owner");

  assert.equal(model.generatedBaseNamePlan("Report: Q1?.md?download=1", "html"), "Report- Q1.html");
  assert.equal(model.generatedBaseNamePlan("", ".pdf"), "hermes-document.pdf");

  assert.equal(model.canShareFilesPlan({ hasShare: true, hasCanShare: false, canShareResult: false }), true);
  assert.equal(model.canShareFilesPlan({ hasShare: true, hasCanShare: true, canShareResult: true }), true);
  assert.equal(model.canShareFilesPlan({ hasShare: true, hasCanShare: true, canShareResult: false }), false);
  assert.equal(model.isUserCancelledSharePlan({ name: "AbortError" }), true);
  assert.equal(model.isUserCancelledSharePlan({ name: "TypeError" }), false);

  assert.deepEqual(model.previewStatusPlan("Done", "success"), {
    text: "Done",
    hidden: false,
    isError: false,
    isSuccess: true,
  });
  assert.deepEqual(model.previewStatusPlan("", "error"), {
    text: "",
    hidden: true,
    isError: true,
    isSuccess: false,
  });

  assert.deepEqual(model.previewMoreMenuTogglePlan({ currentlyOpen: false }), {
    open: true,
    ariaExpanded: "true",
    menuHidden: false,
  });
  assert.deepEqual(model.previewMoreMenuTogglePlan({ currentlyOpen: true }), {
    open: false,
    ariaExpanded: "false",
    menuHidden: true,
  });

  assert.equal(model.previewOverlayOpenPlan({ hasDocumentOverlay: true }), true);
  assert.equal(model.previewOverlayOpenPlan({}), false);
  assert.equal(model.previewBackSwipeSurfacePlan({
    availableSelectors: {
      ".task-image-preview-stage": true,
      "#taskMarkdownPreviewOverlay": true,
    },
  }), ".task-image-preview-stage");
  assert.equal(model.previewBackSwipeSurfacePlan({ availableSelectors: {} }), "");

  console.log("vite task preview helpers model tests passed");
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
