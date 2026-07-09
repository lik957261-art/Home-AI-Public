const TASK_PREVIEW_HELPERS_MODEL_VERSION = "20260705-vite-task-preview-helpers-model-v1";

const BACK_SWIPE_SURFACE_SELECTORS = Object.freeze([
  ".task-markdown-preview-shell",
  ".task-document-preview-shell",
  ".task-image-preview-stage",
  "#taskMarkdownPreviewOverlay",
  "#taskDocumentPreviewOverlay",
  "#taskImagePreviewOverlay",
]);

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, Math.max(1, Number(max) || 4000));
}

function previewShareUrlPlan(value, options = {}) {
  const raw = cleanString(value, 4000);
  if (!raw) return "";
  try {
    return new URL(raw, cleanString(options.baseHref, 4000) || "http://127.0.0.1/").href;
  } catch (_error) {
    return raw;
  }
}

function workspaceIdPlan(input = {}) {
  return cleanString(input.runtimeWorkspaceId, 300)
    || cleanString(input.classicWorkspaceId, 300)
    || cleanString(input.fallbackWorkspaceId, 300)
    || "owner";
}

function generatedBaseNamePlan(title, extension = "txt") {
  const raw = cleanString(title, 500) || "hermes-document";
  const withoutQuery = raw.split(/[?#]/)[0] || "hermes-document";
  const base = withoutQuery
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .trim()
    || "hermes-document";
  const safeExtension = cleanString(extension, 40).replace(/^\.+/, "") || "txt";
  return `${base}.${safeExtension}`;
}

function canShareFilesPlan(input = {}) {
  return Boolean(input.hasShare && (!input.hasCanShare || input.canShareResult));
}

function isUserCancelledSharePlan(input = {}) {
  const name = cleanString(input.name || input.errorName, 120);
  return name === "AbortError" || name === "NotAllowedError";
}

function previewStatusPlan(message, kind = "") {
  const text = cleanString(message, 4000);
  return Object.freeze({
    text,
    hidden: !text,
    isError: kind === "error",
    isSuccess: kind === "success",
  });
}

function previewMoreMenuTogglePlan(input = {}) {
  const open = !Boolean(input.currentlyOpen);
  return Object.freeze({
    open,
    ariaExpanded: open ? "true" : "false",
    menuHidden: !open,
  });
}

function previewOverlayOpenPlan(input = {}) {
  return Boolean(
    input.hasImageOverlay
    || input.hasDocumentOverlay
    || input.hasMarkdownOverlay
  );
}

function previewBackSwipeSurfacePlan(input = {}) {
  const available = input.availableSelectors && typeof input.availableSelectors === "object"
    ? input.availableSelectors
    : {};
  return BACK_SWIPE_SURFACE_SELECTORS.find((selector) => Boolean(available[selector])) || "";
}

export {
  BACK_SWIPE_SURFACE_SELECTORS,
  TASK_PREVIEW_HELPERS_MODEL_VERSION,
  canShareFilesPlan,
  cleanString,
  generatedBaseNamePlan,
  isUserCancelledSharePlan,
  previewBackSwipeSurfacePlan,
  previewMoreMenuTogglePlan,
  previewOverlayOpenPlan,
  previewShareUrlPlan,
  previewStatusPlan,
  workspaceIdPlan,
};
