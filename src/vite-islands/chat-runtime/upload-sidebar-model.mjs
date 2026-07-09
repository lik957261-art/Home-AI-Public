import {
  createServerFileAttachmentRequest,
  normalizeNativeSharedFiles,
} from "./attachment-model.mjs";

const UPLOAD_SIDEBAR_MODEL_VERSION = "20260704-vite-upload-sidebar-model-v1";

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value)
    .replace(/\u00a0/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(max) || 4000));
}

function basename(value = "") {
  const text = cleanString(value, 1000);
  return text.split(/[\\/]/).filter(Boolean).pop() || text;
}

function uploadSidebarOwnerOnlyPlan(input = {}) {
  return Boolean(input?.auth?.isOwner || input?.isOwner);
}

function attachFileMenuPlan(input = {}) {
  const isOwner = uploadSidebarOwnerOnlyPlan(input);
  return Object.freeze({
    version: UPLOAD_SIDEBAR_MODEL_VERSION,
    options: Object.freeze([
      Object.freeze({
        id: "system",
        label: "系统文件",
        enabled: true,
        action: "open_system_file_picker",
      }),
      ...(isOwner ? [Object.freeze({
        id: "server",
        label: "服务器文件",
        enabled: true,
        action: "open_server_file_picker",
      })] : []),
    ]),
    serverFileEnabled: isOwner,
  });
}

function nativeSharedFileSummaryPlan(files = []) {
  const normalized = normalizeNativeSharedFiles(files);
  if (!normalized.length) return "";
  if (normalized.length === 1) return normalized[0].name || normalized[0].pathLabel || basename(normalized[0].path) || "分享文件";
  return `${normalized.length} 个分享文件`;
}

function nativeShareIntakePanelPlan(input = {}) {
  const files = normalizeNativeSharedFiles(input.files || [], {
    workspaceId: cleanString(input.workspaceId || "owner", 120) || "owner",
  });
  const canAttachServerFile = uploadSidebarOwnerOnlyPlan(input);
  const summary = nativeSharedFileSummaryPlan(files);
  const attachLabel = canAttachServerFile ? "附加到当前对话" : "服务器文件附加仅限 Owner";
  return Object.freeze({
    version: UPLOAD_SIDEBAR_MODEL_VERSION,
    hidden: files.length === 0,
    files,
    summary,
    canAttachServerFile,
    attachLabel,
    attachDisabled: !canAttachServerFile,
    attachButtonLabel: canAttachServerFile ? "附加" : "Owner专用",
    directoryLabel: "目录",
    clearLabel: "保存",
    copyText: files.length
      ? `${summary} 已保存到服务器，${canAttachServerFile ? "可直接附加到当前对话。" : "仅 Owner 可从服务器附加。"}`
      : "",
  });
}

function mergeNativeSharedFilesPlan(input = {}) {
  const workspaceId = cleanString(input.workspaceId || "owner", 120) || "owner";
  const current = normalizeNativeSharedFiles(input.current || [], { workspaceId });
  const receivedFiles = normalizeNativeSharedFiles(input.payload || [], { workspaceId });
  const seen = new Set();
  const files = [];
  for (const file of [...current, ...receivedFiles]) {
    const key = `${file.workspaceId}\n${file.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    files.push(file);
  }
  return Object.freeze({
    ok: receivedFiles.length > 0,
    files: Object.freeze(files.slice(0, 20)),
    receivedFiles,
    receivedCount: receivedFiles.length,
  });
}

function systemShareDirectoryPathPlan() {
  return "系统分享";
}

function nativeShareDirectoryPlan(input = {}) {
  const files = normalizeNativeSharedFiles(input.files || [], {
    workspaceId: cleanString(input.workspaceId || "owner", 120) || "owner",
  });
  const first = files[0] || null;
  if (!first) return Object.freeze({ ok: false, code: "native_share_file_missing" });
  return Object.freeze({
    ok: true,
    code: "",
    directoryPath: first.path.replace(/[\\/][^\\/]*$/, ""),
    rootPath: "",
    clearPreview: true,
    closePicker: true,
  });
}

function serverFilePickerDirectoryPlan(input = {}) {
  if (!uploadSidebarOwnerOnlyPlan(input)) {
    return Object.freeze({ ok: false, code: "server_file_owner_required", message: "服务器文件选择仅限 Owner。" });
  }
  if (!cleanString(input.threadId || "", 180)) {
    return Object.freeze({ ok: false, code: "thread_id_missing", message: "请先打开一个可发送的对话。" });
  }
  return Object.freeze({
    ok: true,
    code: "",
    directoryPath: systemShareDirectoryPathPlan(),
    rootPath: "",
    clearPreview: true,
    openPicker: true,
  });
}

function serverFileAttachmentRequestPlan(input = {}) {
  if (!uploadSidebarOwnerOnlyPlan(input)) {
    return Object.freeze({ ok: false, code: "server_file_attachment_owner_required", message: "服务器文件附件仅限 Owner。" });
  }
  return createServerFileAttachmentRequest({
    threadId: input.threadId,
    workspaceId: cleanString(input.workspaceId || "owner", 120) || "owner",
    entry: input.entry || {},
  });
}

export {
  UPLOAD_SIDEBAR_MODEL_VERSION,
  attachFileMenuPlan,
  mergeNativeSharedFilesPlan,
  nativeShareDirectoryPlan,
  nativeShareIntakePanelPlan,
  nativeSharedFileSummaryPlan,
  normalizeNativeSharedFiles,
  serverFileAttachmentRequestPlan,
  serverFilePickerDirectoryPlan,
  systemShareDirectoryPathPlan,
  uploadSidebarOwnerOnlyPlan,
};
