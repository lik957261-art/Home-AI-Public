const CHAT_ATTACHMENT_MODEL_VERSION = "20260703-vite-chat-attachment-model-v1";

const SOURCE_LABELS = Object.freeze({
  system_upload: "系统文件",
  server_file: "服务器文件",
  native_share: "系统分享",
  upload_queue: "上传队列",
  unknown: "附件",
});

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value)
    .replace(/\u00a0/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 4000));
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function boundedArray(value, max = 20) {
  return Array.isArray(value) ? value.filter(isObject).slice(0, max) : [];
}

function basename(value = "") {
  const text = cleanString(value, 1000);
  return text.split(/[\\/]/).filter(Boolean).pop() || text;
}

function lower(value, max = 500) {
  return cleanString(value, max).toLowerCase();
}

function sourceKind(value) {
  const source = lower(value, 80).replace(/[-\s]+/g, "_");
  if (source === "upload" || source === "system_file" || source === "system_upload") return "system_upload";
  if (source === "server" || source === "server_file") return "server_file";
  if (source === "share" || source === "native_share" || source === "system_share") return "native_share";
  if (source === "queue" || source === "upload_queue") return "upload_queue";
  return "unknown";
}

function extensionKind(name = "", mime = "") {
  const mimeText = lower(mime, 300);
  const nameText = lower(name, 300);
  if (mimeText.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic)$/.test(nameText)) return "image";
  if (mimeText === "application/pdf" || /\.pdf$/.test(nameText)) return "pdf";
  if (mimeText.includes("presentation") || /\.(pptx?|key)$/.test(nameText)) return "presentation";
  if (mimeText.includes("wordprocessing") || /\.(docx?|pages)$/.test(nameText)) return "document";
  if (mimeText.includes("spreadsheet") || /\.(xlsx?|csv|tsv)$/.test(nameText)) return "spreadsheet";
  if (mimeText.startsWith("text/") || /\.(md|markdown|txt|json|log)$/.test(nameText)) return "text";
  return "file";
}

function sizeLabel(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return `${Math.round(size)} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
  return `${Math.round(size / (1024 * 102.4)) / 10} MB`;
}

function normalizePendingArtifact(artifact = {}, index = 0) {
  const name = cleanString(
    artifact.name || artifact.filename || artifact.displayName || basename(artifact.path) || artifact.id || `附件 ${index + 1}`,
    220,
  );
  const id = cleanString(artifact.id || artifact.artifactId || artifact.key || `${sourceKind(artifact.source)}_${index}_${name}`, 220);
  const mime = cleanString(artifact.mime || artifact.type || artifact.contentType || "", 300);
  const source = sourceKind(artifact.source || artifact.attachmentSource || artifact.origin);
  const status = lower(artifact.status || artifact.state || "ready", 80) || "ready";
  return Object.freeze({
    id,
    name,
    kind: extensionKind(name, mime),
    mime,
    source,
    sourceLabel: SOURCE_LABELS[source] || SOURCE_LABELS.unknown,
    status,
    sizeBytes: Number.isFinite(Number(artifact.size || artifact.sizeBytes)) ? Number(artifact.size || artifact.sizeBytes) : 0,
    sizeLabel: sizeLabel(artifact.size || artifact.sizeBytes),
    removable: artifact.removable !== false,
    pathLabel: basename(artifact.path || artifact.displayPath || ""),
    composerArtifact: Object.freeze({
      id,
      name,
      mime,
      type: mime,
      size: Number.isFinite(Number(artifact.size || artifact.sizeBytes)) ? Number(artifact.size || artifact.sizeBytes) : 0,
      source,
    }),
  });
}

function normalizePendingArtifacts(artifacts = [], max = 20) {
  const seen = new Set();
  return Object.freeze(boundedArray(artifacts, max).map(normalizePendingArtifact).filter((artifact) => {
    const key = artifact.id || `${artifact.source}:${artifact.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }));
}

function normalizeNativeSharedFiles(payload = {}, options = {}) {
  const workspaceId = cleanString(options.workspaceId || "owner", 120) || "owner";
  const files = Array.isArray(payload?.files) ? payload.files : (Array.isArray(payload) ? payload : []);
  const seen = new Set();
  return Object.freeze(files.filter(isObject).slice(0, 20).map((file, index) => {
    const path = cleanString(file.path || file.displayPath || "", 1000);
    const name = cleanString(file.name || file.filename || basename(path) || `分享文件 ${index + 1}`, 220);
    const fileWorkspaceId = cleanString(file.workspaceId || workspaceId, 120) || workspaceId;
    return Object.freeze({
      path,
      name,
      workspaceId: fileWorkspaceId,
      mime: cleanString(file.mime || file.type || "", 300),
      sizeBytes: Number.isFinite(Number(file.size || file.sizeBytes)) ? Number(file.size || file.sizeBytes) : 0,
      pathLabel: basename(path),
    });
  }).filter((file) => {
    if (!file.path) return false;
    const key = `${file.workspaceId}\n${file.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }));
}

function createNativeShareAttachArtifacts(files = [], options = {}) {
  const normalized = normalizeNativeSharedFiles(files, options);
  return Object.freeze(normalized.map((file, index) => normalizePendingArtifact({
    id: cleanString(`native_share_${index}_${file.name}`.replace(/[^\w.-]+/g, "_"), 220),
    name: file.name,
    mime: file.mime,
    size: file.sizeBytes,
    source: "native_share",
    status: "ready",
    path: file.path,
  }, index)));
}

function mergePendingArtifacts(current = [], next = []) {
  return normalizePendingArtifacts([...(Array.isArray(current) ? current : []), ...(Array.isArray(next) ? next : [next])]);
}

function addPendingArtifact(current = [], artifact = {}) {
  return mergePendingArtifacts(current, [artifact]);
}

function removePendingArtifact(current = [], target) {
  const normalized = normalizePendingArtifacts(current);
  const index = Number(target);
  const targetText = cleanString(target, 220);
  return Object.freeze(normalized.filter((artifact, artifactIndex) => {
    if (Number.isInteger(index) && index >= 0) return artifactIndex !== index;
    return artifact.id !== targetText;
  }));
}

function buildComposerAttachmentState(input = {}) {
  const artifacts = normalizePendingArtifacts(input.pendingArtifacts);
  const uploadQueue = normalizePendingArtifacts(boundedArray(input.uploadQueue).map((item) => Object.assign({ source: "upload_queue" }, item)));
  const nativeSharedFiles = normalizeNativeSharedFiles(input.nativeSharedFiles || [], {
    workspaceId: input.workspaceId || "owner",
  });
  const uploading = uploadQueue.some((artifact) => artifact.status === "uploading" || artifact.status === "queued");
  const errored = artifacts.concat(uploadQueue).some((artifact) => artifact.status === "error" || artifact.status === "failed");
  let status = "empty";
  if (errored) status = "error";
  else if (uploading) status = "uploading";
  else if (artifacts.length) status = "ready";
  else if (nativeSharedFiles.length) status = "intake";
  const summary = status === "ready"
    ? `已附加 ${artifacts.length} 个文件`
    : status === "intake"
      ? `收到 ${nativeSharedFiles.length} 个系统分享文件，尚未附加`
      : status === "uploading"
        ? `${uploadQueue.length} 个文件上传中`
        : status === "error"
          ? "附件处理需要检查"
          : "暂无附件";
  return Object.freeze({
    version: CHAT_ATTACHMENT_MODEL_VERSION,
    status,
    summary,
    artifactCount: artifacts.length,
    uploadQueueCount: uploadQueue.length,
    nativeShareCount: nativeSharedFiles.length,
    canSendWithAttachments: Boolean(artifacts.length && status !== "error"),
    canAttachNativeShare: Boolean(nativeSharedFiles.length),
    canClear: Boolean(artifacts.length || nativeSharedFiles.length || uploadQueue.length),
    rows: artifacts,
    uploadQueue,
    nativeSharedFiles,
    composerArtifacts: Object.freeze(artifacts.map((artifact) => artifact.composerArtifact)),
    boundedEvidence: Object.freeze([
      `artifact_count=${artifacts.length}`,
      `native_share_count=${nativeSharedFiles.length}`,
      `upload_queue_count=${uploadQueue.length}`,
      `status=${status}`,
    ]),
  });
}

function createServerFileAttachmentRequest(input = {}) {
  const threadId = cleanString(input.threadId || "", 180);
  const entry = input.entry || input;
  const path = cleanString(entry.path || "", 1000);
  if (!threadId) return Object.freeze({ ok: false, code: "thread_id_missing" });
  if (!path) return Object.freeze({ ok: false, code: "path_missing" });
  return Object.freeze({
    ok: true,
    code: "",
    path: `/api/threads/${encodeURIComponent(threadId)}/server-file-attachments`,
    method: "POST",
    body: Object.freeze({
      path,
      filename: cleanString(entry.name || entry.filename || basename(path), 220),
      workspaceId: cleanString(entry.workspaceId || input.workspaceId || "owner", 120) || "owner",
    }),
    displayName: cleanString(entry.name || entry.filename || basename(path), 220),
  });
}

function createUploadRequest(input = {}) {
  const threadId = cleanString(input.threadId || "", 180);
  const file = input.file || input;
  const filename = cleanString(file.name || file.filename || "upload.bin", 220);
  const dataBase64 = cleanString(file.dataBase64 || "", 240000);
  if (!threadId) return Object.freeze({ ok: false, code: "thread_id_missing" });
  if (!dataBase64) return Object.freeze({ ok: false, code: "data_base64_missing" });
  return Object.freeze({
    ok: true,
    code: "",
    path: `/api/threads/${encodeURIComponent(threadId)}/uploads`,
    method: "POST",
    body: Object.freeze({
      filename,
      type: cleanString(file.type || file.mime || "", 300),
      dataBase64,
      workspaceId: cleanString(file.workspaceId || input.workspaceId || "owner", 120) || "owner",
    }),
    displayName: filename,
  });
}

export {
  CHAT_ATTACHMENT_MODEL_VERSION,
  addPendingArtifact,
  buildComposerAttachmentState,
  createNativeShareAttachArtifacts,
  createServerFileAttachmentRequest,
  createUploadRequest,
  mergePendingArtifacts,
  normalizeNativeSharedFiles,
  normalizePendingArtifact,
  normalizePendingArtifacts,
  removePendingArtifact,
};
