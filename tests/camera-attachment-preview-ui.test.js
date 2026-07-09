"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const uploadSidebarSource = fs.readFileSync(path.join(repoRoot, "public", "app-upload-sidebar-ui.js"), "utf8");
const composerAttachmentsSource = fs.readFileSync(path.join(repoRoot, "public", "app-composer-attachments-ui.js"), "utf8");
const wireStartSource = fs.readFileSync(path.join(repoRoot, "public", "app-wire-start-ui.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(repoRoot, "public", "styles.css"), "utf8");

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

function createPanelHarness() {
  const listeners = {};
  const panel = {
    id: "pendingArtifacts",
    classList: {
      added: [],
      removed: [],
      add(name) { this.added.push(name); },
      remove(name) { this.removed.push(name); },
    },
    innerHTML: "",
    querySelectorAll(selector) {
      if (selector === "[data-pending-artifact-preview]" && this.innerHTML.includes("data-pending-artifact-preview")) {
        return [{
          href: "/api/files/preview?artifactId=photo_1",
          dataset: { artifactName: "camera.jpg", artifactMime: "image/jpeg" },
          addEventListener(type, handler) {
            listeners.preview = { type, handler };
          },
        }];
      }
      if (selector === "[data-remove-artifact]" && this.innerHTML.includes("data-remove-artifact")) {
        return [{
          dataset: { removeArtifact: "0" },
          addEventListener(type, handler) {
            listeners.remove = { type, handler };
          },
        }];
      }
      return [];
    },
  };
  const composer = {
    insertBefore() {
      throw new Error("existing pending artifact panel should be reused");
    },
  };
  const context = {
    console,
    state: {
      auth: { isOwner: true },
      pendingArtifacts: [{
        id: "photo_1",
        name: "camera.jpg",
        mime: "image/jpeg",
        size: 1000,
        url: "/api/files/preview?artifactId=photo_1",
      }],
    },
    $: (id) => ({ pendingArtifacts: panel, composer }[id] || null),
    document: {
      createElement() {
        throw new Error("panel should already exist");
      },
    },
    window: {
      TaskDocumentPreviewUi: {
        isImagePreviewLink(link) {
          context.previewChecked = link.href;
          return true;
        },
        openImagePreviewOverlay(link) {
          context.previewOpened = link.href;
          return true;
        },
      },
    },
    escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },
    artifactKind(artifact) {
      return String(artifact?.mime || "").startsWith("image/") ? "image" : "file";
    },
    artifactHref(artifact) {
      return artifact?.url || "#";
    },
    artifactDisplayName(artifact) {
      return artifact?.name || artifact?.id || "document";
    },
    updateComposerAction() {
      context.updateComposerActionCount = (context.updateComposerActionCount || 0) + 1;
    },
  };
  vm.createContext(context);
  vm.runInContext(uploadSidebarSource, context, { filename: "app-upload-sidebar-ui.js" });
  return { context, panel, listeners };
}

(async () => {
  await test("camera upload foreground suppression spans photo confirmation and preview window", () => {
    assert.match(wireStartSource, /markSystemFilePickerReturned\(120000\)/);
    assert.match(composerAttachmentsSource, /CHAT_ATTACHMENT_UPLOAD_FOREGROUND_SUPPRESS_MS = 120000/);
    assert.match(composerAttachmentsSource, /markSystemFilePickerReturned\(CHAT_ATTACHMENT_UPLOAD_FOREGROUND_SUPPRESS_MS\)/);
  });

  await test("pending camera image renders a contain preview link without navigation", () => {
    const { context, panel, listeners } = createPanelHarness();
    context.renderPendingArtifacts();

    assert.match(panel.innerHTML, /class="pending-artifact doc-[^"]* pending-artifact-image"/);
    assert.match(panel.innerHTML, /class="pending-artifact-preview"/);
    assert.match(panel.innerHTML, /data-task-doc data-pending-artifact-preview/);
    assert.match(panel.innerHTML, /<img src="\/api\/files\/preview\?artifactId=photo_1" alt="" loading="lazy" decoding="async">/);
    assert.match(panel.innerHTML, /class="pending-artifact-remove" data-remove-artifact="0"/);

    const calls = [];
    listeners.preview.handler({
      preventDefault() { calls.push("preventDefault"); },
      stopPropagation() { calls.push("stopPropagation"); },
    });
    assert.deepEqual(calls, ["preventDefault", "stopPropagation"]);
    assert.equal(context.previewChecked, "/api/files/preview?artifactId=photo_1");
    assert.equal(context.previewOpened, "/api/files/preview?artifactId=photo_1");
  });

  await test("pending artifact removal is explicit and isolated from image preview tap", () => {
    const { context, listeners } = createPanelHarness();
    context.renderPendingArtifacts();
    const calls = [];
    listeners.remove.handler({
      preventDefault() { calls.push("preventDefault"); },
      stopPropagation() { calls.push("stopPropagation"); },
    });
    assert.deepEqual(calls, ["preventDefault", "stopPropagation"]);
    assert.equal(context.state.pendingArtifacts.length, 0);
    assert.equal(context.updateComposerActionCount, 2);
  });

  await test("pending and full-screen image previews preserve aspect/orientation without crop", () => {
    assert.match(stylesSource, /\.pending-artifact-preview img \{[\s\S]*?object-fit: contain;[\s\S]*?image-orientation: from-image;/);
    assert.match(stylesSource, /\.task-image-preview-image \{[\s\S]*?object-fit: contain;[\s\S]*?image-orientation: from-image;/);
    assert.doesNotMatch(stylesSource, /\.pending-artifact-preview img \{[\s\S]*?object-fit: cover;/);
  });

  if (process.exitCode) process.exit(process.exitCode);
})();
