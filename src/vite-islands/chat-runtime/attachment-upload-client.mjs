import {
  createUploadRequest,
} from "./attachment-model.mjs";

const CHAT_ATTACHMENT_UPLOAD_CLIENT_VERSION = "20260703-vite-chat-attachment-upload-client-v1";
const DEFAULT_UPLOAD_TIMEOUT_MS = 30000;

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value)
    .replace(/\u00a0/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 4000));
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function base64FromDataUrl(value = "") {
  const text = cleanString(value, 240000);
  const match = text.match(/^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$/i);
  if (match) return cleanString(match[2] || "", 240000);
  return text;
}

function normalizeUploadFile(file = {}, options = {}) {
  const source = isObject(file) ? file : {};
  const name = cleanString(source.name || source.filename || options.filename || "upload.bin", 220) || "upload.bin";
  const type = cleanString(source.type || source.mime || options.type || "", 300);
  const size = Number(source.size || source.sizeBytes || 0);
  return Object.freeze({
    name,
    filename: name,
    type,
    mime: type,
    size: Number.isFinite(size) && size > 0 ? size : 0,
    workspaceId: cleanString(source.workspaceId || options.workspaceId || "owner", 120) || "owner",
    dataBase64: cleanString(source.dataBase64 || "", 240000),
  });
}

function requireInjectedApi(api) {
  if (typeof api !== "function") throw new Error("attachment_upload_requires_runtime_api");
  return api;
}

async function readUploadDataBase64(file = {}, options = {}) {
  const normalized = normalizeUploadFile(file, options);
  if (normalized.dataBase64) return normalized.dataBase64;
  if (typeof options.readFileAsDataUrl !== "function") {
    const error = new Error("attachment_upload_requires_file_reader");
    error.code = "attachment_upload_requires_file_reader";
    throw error;
  }
  const dataUrl = await options.readFileAsDataUrl(file);
  const dataBase64 = base64FromDataUrl(dataUrl);
  if (!dataBase64) {
    const error = new Error("attachment_upload_empty_file_data");
    error.code = "attachment_upload_empty_file_data";
    throw error;
  }
  return dataBase64;
}

function normalizeUploadedArtifact(result = {}, fallback = {}) {
  const artifact = isObject(result.artifact) ? result.artifact : {};
  const id = cleanString(artifact.id || artifact.artifactId || fallback.id || "", 220);
  if (!id) {
    const error = new Error("attachment_upload_missing_artifact");
    error.code = "attachment_upload_missing_artifact";
    error.result = result;
    throw error;
  }
  return Object.freeze({
    id,
    name: cleanString(artifact.name || artifact.filename || fallback.name || fallback.filename || id, 220),
    filename: cleanString(artifact.filename || artifact.name || fallback.filename || fallback.name || id, 220),
    mime: cleanString(artifact.mime || artifact.type || fallback.type || "", 300),
    type: cleanString(artifact.type || artifact.mime || fallback.type || "", 300),
    size: Number.isFinite(Number(artifact.size || artifact.sizeBytes || fallback.size)) ? Number(artifact.size || artifact.sizeBytes || fallback.size) : 0,
    source: "system_upload",
    status: "ready",
  });
}

async function uploadComposerFile(input = {}) {
  const api = requireInjectedApi(input.api);
  const file = normalizeUploadFile(input.file || input, input);
  const dataBase64 = await readUploadDataBase64(input.file || input, input);
  const request = createUploadRequest({
    threadId: input.threadId,
    workspaceId: file.workspaceId,
    file: Object.assign({}, file, { dataBase64 }),
  });
  if (!request.ok) {
    const error = new Error(request.code || "attachment_upload_request_invalid");
    error.code = request.code || "attachment_upload_request_invalid";
    error.request = request;
    throw error;
  }
  const result = await api(request.path, {
    method: request.method,
    body: JSON.stringify(request.body),
    timeoutMs: Number(input.timeoutMs || DEFAULT_UPLOAD_TIMEOUT_MS),
  });
  return Object.freeze({
    ok: true,
    source: cleanString(result?.source || "runtime_api", 120),
    request: Object.freeze({
      path: request.path,
      method: request.method,
      filename: request.body.filename,
      type: request.body.type,
      workspaceId: request.body.workspaceId,
      dataBase64Length: request.body.dataBase64.length,
    }),
    artifact: normalizeUploadedArtifact(result, file),
    raw: result,
  });
}

async function uploadComposerFiles(input = {}) {
  const files = Array.isArray(input.files) ? input.files.slice(0, 20) : [];
  const artifacts = [];
  const uploads = [];
  for (const file of files) {
    if (typeof input.onProgress === "function") {
      input.onProgress({ status: "uploading", filename: normalizeUploadFile(file, input).name });
    }
    const upload = await uploadComposerFile(Object.assign({}, input, { file }));
    uploads.push(upload);
    artifacts.push(upload.artifact);
  }
  if (typeof input.onProgress === "function") {
    input.onProgress({ status: "done", count: artifacts.length });
  }
  return Object.freeze({
    ok: true,
    count: artifacts.length,
    artifacts: Object.freeze(artifacts),
    uploads: Object.freeze(uploads),
  });
}

export {
  CHAT_ATTACHMENT_UPLOAD_CLIENT_VERSION,
  DEFAULT_UPLOAD_TIMEOUT_MS,
  base64FromDataUrl,
  normalizeUploadFile,
  readUploadDataBase64,
  uploadComposerFile,
  uploadComposerFiles,
};
