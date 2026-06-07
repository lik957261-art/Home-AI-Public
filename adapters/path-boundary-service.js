"use strict";

const path = require("node:path");

function normalizePathForBoundary(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^[a-zA-Z]:[\\/]/.test(text) || /^\\\\/.test(text)) return path.win32.normalize(text);
  if (/^\//.test(text)) return path.posix.normalize(text);
  return path.normalize(text);
}

function comparableInput(value, options = {}) {
  let text = String(value || "").trim();
  if (options.slashFirst) text = text.replaceAll("\\", "/");
  if (options.stripWslPrefix) text = text.replace(/^\/\/wsl(?:\.localhost|\$)?\/[^/]+/i, "");
  if (options.mapWslMountDrive) {
    text = text.replace(/^\/mnt\/([a-zA-Z])\//, (_, drive) => `${drive.toLowerCase()}:/`);
  }
  return text;
}

function comparablePath(value, options = {}) {
  const normalized = normalizePathForBoundary(comparableInput(value, options))
    .replaceAll("\\", "/")
    .replace(/^([A-Z]):\//, (_, drive) => `${drive.toLowerCase()}:/`);
  return normalized.replace(/\/+$/g, "").toLowerCase();
}

function pathInsideAnyRoot(candidate, roots, options = {}) {
  const key = comparablePath(candidate, options);
  if (!key) return false;
  return (roots || []).some((root) => {
    const rootKey = comparablePath(root, options);
    return rootKey && (key === rootKey || key.startsWith(`${rootKey}/`));
  });
}

function pathRelativePartsUnderRoot(candidate, root, options = {}) {
  const normalized = comparablePath(candidate, options);
  const rootKey = comparablePath(root, options);
  if (!normalized || !rootKey || normalized === rootKey || !normalized.startsWith(`${rootKey}/`)) return null;
  return normalized.slice(rootKey.length + 1).split("/").filter(Boolean);
}

function pathDirectChildOfRoot(candidate, root, options = {}) {
  const parts = pathRelativePartsUnderRoot(candidate, root, options);
  return Boolean(parts && parts.length === 1);
}

module.exports = {
  comparablePath,
  normalizePathForBoundary,
  pathDirectChildOfRoot,
  pathInsideAnyRoot,
  pathRelativePartsUnderRoot,
};
