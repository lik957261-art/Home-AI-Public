import {
  createNativeShareAttachArtifacts,
  normalizeNativeSharedFiles,
} from "./attachment-model.mjs";

const CHAT_ATTACHMENT_NATIVE_SHARE_CLIENT_VERSION = "20260703-vite-native-share-intake-v1";

function cleanString(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function nativeFileKey(file = {}) {
  return `${cleanString(file.workspaceId, 120)}\n${cleanString(file.path, 1000)}`;
}

function mergeNativeSharedFiles(current = [], next = [], options = {}) {
  const workspaceId = cleanString(options.workspaceId || "owner", 120) || "owner";
  const merged = [];
  const seen = new Set();
  for (const file of normalizeNativeSharedFiles(current, { workspaceId })) {
    const key = nativeFileKey(file);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(file);
  }
  for (const file of normalizeNativeSharedFiles(next, { workspaceId })) {
    const key = nativeFileKey(file);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(file);
  }
  return Object.freeze(merged.slice(0, 20));
}

function statusPayload(input = {}) {
  return Object.freeze({
    version: CHAT_ATTACHMENT_NATIVE_SHARE_CLIENT_VERSION,
    status: cleanString(input.status || "idle", 80),
    code: cleanString(input.code || "", 120),
    message: cleanString(input.message || "", 240),
    source: cleanString(input.source || "native_share_intake", 120),
    receivedCount: Number(input.receivedCount || 0) || 0,
    nativeShareCount: Number(input.nativeShareCount || 0) || 0,
  });
}

function createNativeShareIntakeController(options = {}) {
  const native = options.native || {};
  const workspaceId = cleanString(options.workspaceId || "owner", 120) || "owner";
  const getFiles = typeof options.getFiles === "function" ? options.getFiles : () => [];
  const setFiles = typeof options.setFiles === "function" ? options.setFiles : () => {};
  const onStatus = typeof options.onStatus === "function" ? options.onStatus : () => {};

  function updateStatus(status = {}) {
    const nextStatus = statusPayload(status);
    onStatus(nextStatus);
    return nextStatus;
  }

  function receive(payload = {}, detail = {}) {
    const receivedFiles = normalizeNativeSharedFiles(payload, { workspaceId });
    const source = cleanString(detail.source || "native_share_bridge", 120);
    if (!receivedFiles.length) {
      const status = updateStatus({
        status: "empty",
        code: "native_share_files_empty",
        message: "未收到可附加的系统分享文件",
        source,
        receivedCount: 0,
        nativeShareCount: normalizeNativeSharedFiles(getFiles(), { workspaceId }).length,
      });
      return Object.freeze({
        ok: false,
        code: status.code,
        status,
        files: normalizeNativeSharedFiles(getFiles(), { workspaceId }),
        receivedFiles,
      });
    }

    const files = mergeNativeSharedFiles(getFiles(), receivedFiles, { workspaceId });
    setFiles(files, {
      action: cleanString(detail.action || "native_share_bridge_receive", 120),
      source,
      receivedCount: receivedFiles.length,
      nativeShareCount: files.length,
    });
    const status = updateStatus({
      status: "received",
      message: `收到 ${receivedFiles.length} 个系统分享文件`,
      source,
      receivedCount: receivedFiles.length,
      nativeShareCount: files.length,
    });
    return Object.freeze({
      ok: true,
      code: "",
      status,
      files,
      receivedFiles,
    });
  }

  function install(detail = {}) {
    if (typeof native.registerNativeShareCallbacks !== "function") {
      const status = updateStatus({
        status: "blocked",
        code: "native_share_bridge_unavailable",
        message: "系统分享桥未连接",
        source: cleanString(detail.source || "native_share_install", 120),
        nativeShareCount: normalizeNativeSharedFiles(getFiles(), { workspaceId }).length,
      });
      return Object.freeze({ ok: false, code: status.code, status });
    }
    try {
      const callbacks = native.registerNativeShareCallbacks({
        receive: (payload) => receive(payload, {
          action: "native_share_bridge_receive",
          source: "native_share_bridge",
        }),
      });
      const status = updateStatus({
        status: "ready",
        message: "系统分享桥已连接",
        source: cleanString(detail.source || "native_share_install", 120),
        nativeShareCount: normalizeNativeSharedFiles(getFiles(), { workspaceId }).length,
      });
      return Object.freeze({ ok: true, code: "", callbacks, status });
    } catch (error) {
      const status = updateStatus({
        status: "error",
        code: error?.code || error?.message || "native_share_bridge_register_failed",
        message: "系统分享桥连接失败",
        source: cleanString(detail.source || "native_share_install", 120),
        nativeShareCount: normalizeNativeSharedFiles(getFiles(), { workspaceId }).length,
      });
      return Object.freeze({ ok: false, code: status.code, status });
    }
  }

  function clear(detail = {}) {
    setFiles([], {
      action: cleanString(detail.action || "native_share_clear", 120),
      source: cleanString(detail.source || "native_share_intake", 120),
      nativeShareCount: 0,
    });
    return updateStatus({
      status: "cleared",
      message: "系统分享待处理文件已清空",
      source: cleanString(detail.source || "native_share_intake", 120),
    });
  }

  function attachArtifacts(files = getFiles()) {
    return createNativeShareAttachArtifacts(files, { workspaceId });
  }

  return Object.freeze({
    version: CHAT_ATTACHMENT_NATIVE_SHARE_CLIENT_VERSION,
    attachArtifacts,
    clear,
    install,
    mergeNativeSharedFiles: (current, next) => mergeNativeSharedFiles(current, next, { workspaceId }),
    receive,
  });
}

export {
  CHAT_ATTACHMENT_NATIVE_SHARE_CLIENT_VERSION,
  createNativeShareIntakeController,
  mergeNativeSharedFiles,
};
