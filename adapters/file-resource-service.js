"use strict";

const path = require("node:path");

const MIME_BY_EXT = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".amr": "audio/amr",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
});

const TEXT_PREVIEW_EXTENSIONS = Object.freeze(new Set([".txt", ".md", ".csv", ".json"]));
const ARTIFACT_EXTENSIONS = "pdf|png|jpe?g|webp|gif|mp4|mov|mp3|m4a|wav|docx|xlsx|pptx|md|txt|json|csv|html?|zip";
const ARTIFACT_PATH_PATTERN = new RegExp(
  `((?:[A-Za-z]:\\\\|/mnt/[A-Za-z]/|\\\\\\\\wsl(?:\\.localhost|\\$)?\\\\)[^\\r\\n<>"'\`]+?\\.(?:${ARTIFACT_EXTENSIONS}))`,
  "gi",
);

function mimeFor(file) {
  return MIME_BY_EXT[path.extname(String(file || "")).toLowerCase()] || "application/octet-stream";
}

function safeFileName(value, fallback = "upload.bin") {
  const base = String(fallback || "upload.bin") || "upload.bin";
  const name = path.basename(String(value || base)).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
  if (!name.replace(/_/g, "").trim()) return base;
  return name || base;
}

function safeDirectoryName(value, fallback = "New Folder") {
  const name = safeFileName(value || fallback, fallback).replace(/[. ]+$/g, "").trim();
  if (!name || name === "." || name === "..") return "";
  return name;
}

function addPathCandidate(set, value) {
  let text = String(value || "").trim();
  text = text.replace(/^["'`]+|["'`]+$/g, "");
  text = text.replace(/[)\].,;:]+$/g, "");
  if (text) set.add(text);
}

function extractArtifactPaths(text) {
  const out = new Set();
  const source = String(text || "");
  for (const match of source.matchAll(/MEDIA:\s*([^\r\n]+)/g)) {
    addPathCandidate(out, match[1]);
  }
  for (const match of source.matchAll(ARTIFACT_PATH_PATTERN)) {
    addPathCandidate(out, match[1]);
  }
  return [...out];
}

function isRawLocalPath(value) {
  const text = String(value || "").trim();
  return /^(?:[A-Za-z]:[\\/]|\\\\|\/mnt\/[A-Za-z]\/|\/)/.test(text);
}

function normalizeDisplayPath(value, fallbackName = "file") {
  const text = String(value || "").replace(/[\x00-\x1F]/g, "").trim();
  if (!text || isRawLocalPath(text)) return safeFileName(fallbackName, "file");
  const segments = text
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => safeFileName(segment, ""))
    .filter((segment) => segment && segment !== "." && segment !== "..");
  return segments.join("/") || safeFileName(fallbackName, "file");
}

function isTextPreviewMime(mime) {
  return /^text\//i.test(String(mime || ""));
}

function previewStrategyForFile(file) {
  if (!file || typeof file !== "object") return { kind: "unsupported", reason: "missing_file" };
  const name = String(file.localPath || file.name || file.displayPath || "");
  const ext = path.extname(name).toLowerCase();
  const mime = String(file.mime || mimeFor(name));
  if (ext === ".docx") return { kind: "docx" };
  if (TEXT_PREVIEW_EXTENSIONS.has(ext) || isTextPreviewMime(mime)) return { kind: "text" };
  return { kind: "unsupported", reason: "unsupported_type" };
}

function publicFileMetadata(file, options = {}) {
  if (!file || typeof file !== "object") return null;
  const localName = safeFileName(file.name || file.localPath || file.path || file.displayPath || "file", "file");
  const displayPath = normalizeDisplayPath(
    file.workspacePath || file.displayPath || file.path || localName,
    localName,
  );
  const mime = String(file.mime || mimeFor(localName));
  const payload = {
    name: localName,
    type: file.type === "directory" ? "directory" : "file",
    size: Number.isFinite(Number(file.size)) ? Number(file.size) : 0,
    mime: file.type === "directory" ? "" : mime,
    path: displayPath,
    displayPath,
    workspacePath: displayPath,
  };
  if (file.updatedAt || file.mtime) payload.updatedAt = String(file.updatedAt || file.mtime);
  if (options.threadId && payload.type === "file") {
    const params = new URLSearchParams({ threadId: String(options.threadId), path: displayPath });
    payload.url = `/api/files?${params.toString()}`;
  }
  return payload;
}

module.exports = {
  MIME_BY_EXT,
  TEXT_PREVIEW_EXTENSIONS,
  extractArtifactPaths,
  isRawLocalPath,
  isTextPreviewMime,
  mimeFor,
  normalizeDisplayPath,
  previewStrategyForFile,
  publicFileMetadata,
  safeDirectoryName,
  safeFileName,
};
