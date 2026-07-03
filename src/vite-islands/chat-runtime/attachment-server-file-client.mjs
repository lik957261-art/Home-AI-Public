import {
  createServerFileAttachmentRequest,
} from "./attachment-model.mjs";

const CHAT_ATTACHMENT_SERVER_FILE_CLIENT_VERSION = "20260703-vite-chat-server-file-client-v1";
const DEFAULT_SERVER_FILE_ATTACH_TIMEOUT_MS = 15000;

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value)
    .replace(/\u00a0/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 4000));
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requireInjectedApi(api) {
  if (typeof api !== "function") {
    const error = new Error("server_file_attachment_requires_runtime_api");
    error.code = "server_file_attachment_requires_runtime_api";
    throw error;
  }
  return api;
}

function normalizeServerFileEntry(entry = {}, options = {}) {
  const source = isObject(entry) ? entry : {};
  const path = cleanString(source.path || source.displayPath || source.workspacePath || "", 1000);
  const name = cleanString(source.name || source.filename || source.displayName || options.filename || "", 220);
  return Object.freeze({
    path,
    name,
    filename: name,
    workspaceId: cleanString(source.workspaceId || options.workspaceId || "owner", 120) || "owner",
    alias: cleanString(source.alias || "", 300),
  });
}

function normalizeServerFileArtifact(result = {}, fallback = {}) {
  const artifact = isObject(result.artifact) ? result.artifact : {};
  const id = cleanString(artifact.id || artifact.artifactId || fallback.id || "", 220);
  if (!id) {
    const error = new Error("server_file_attachment_missing_artifact");
    error.code = "server_file_attachment_missing_artifact";
    throw error;
  }
  const name = cleanString(
    artifact.name || artifact.filename || fallback.name || fallback.filename || fallback.path || id,
    220,
  );
  const type = cleanString(artifact.type || artifact.mime || artifact.contentType || "", 300);
  const size = Number(artifact.size || artifact.sizeBytes || 0);
  return Object.freeze({
    id,
    name,
    filename: cleanString(artifact.filename || artifact.name || name, 220),
    mime: type,
    type,
    size: Number.isFinite(size) && size > 0 ? size : 0,
    workspaceId: cleanString(artifact.workspaceId || fallback.workspaceId || "owner", 120) || "owner",
    source: "server_file",
    status: "ready",
  });
}

async function attachServerFileToComposer(input = {}) {
  const api = requireInjectedApi(input.api);
  const entry = normalizeServerFileEntry(input.entry || input, input);
  const request = createServerFileAttachmentRequest({
    threadId: input.threadId,
    workspaceId: entry.workspaceId,
    entry,
  });
  if (!request.ok) {
    const error = new Error(request.code || "server_file_attachment_request_invalid");
    error.code = request.code || "server_file_attachment_request_invalid";
    error.request = request;
    throw error;
  }
  const result = await api(request.path, {
    method: request.method,
    body: JSON.stringify(request.body),
    timeoutMs: Number(input.timeoutMs || DEFAULT_SERVER_FILE_ATTACH_TIMEOUT_MS),
  });
  return Object.freeze({
    ok: true,
    source: cleanString(result?.source || "runtime_api", 120),
    request: Object.freeze({
      path: request.path,
      method: request.method,
      filename: request.body.filename,
      workspaceId: request.body.workspaceId,
      hasPath: Boolean(request.body.path),
    }),
    artifact: normalizeServerFileArtifact(result, entry),
  });
}

export {
  CHAT_ATTACHMENT_SERVER_FILE_CLIENT_VERSION,
  DEFAULT_SERVER_FILE_ATTACH_TIMEOUT_MS,
  attachServerFileToComposer,
  normalizeServerFileArtifact,
  normalizeServerFileEntry,
};
