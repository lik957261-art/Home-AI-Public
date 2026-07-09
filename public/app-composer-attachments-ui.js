"use strict";

const CHAT_ATTACHMENT_UPLOAD_CLIENT_ESM_PATH = "/vite-islands/chat-attachment-upload-client/chat-attachment-upload-client.js";
const CHAT_ATTACHMENT_UPLOAD_FOREGROUND_SUPPRESS_MS = 120000;
let chatAttachmentUploadClientModel = null;
let chatAttachmentUploadClientModelPromise = null;

function importChatAttachmentUploadClient(rootRef = window) {
  if (chatAttachmentUploadClientModel) return Promise.resolve(chatAttachmentUploadClientModel);
  if (!chatAttachmentUploadClientModelPromise) {
    const importer = typeof rootRef.__homeAiImportChatAttachmentUploadClient === "function"
      ? rootRef.__homeAiImportChatAttachmentUploadClient
      : (path) => import(path);
    chatAttachmentUploadClientModelPromise = Promise.resolve()
      .then(() => importer(CHAT_ATTACHMENT_UPLOAD_CLIENT_ESM_PATH))
      .then((model) => {
        chatAttachmentUploadClientModel = model || null;
        return chatAttachmentUploadClientModel;
      })
      .catch((error) => {
        chatAttachmentUploadClientModelPromise = null;
        throw error;
      });
  }
  return chatAttachmentUploadClientModelPromise;
}

function currentChatAttachmentUploadClient() {
  return chatAttachmentUploadClientModel;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function composerAttachmentWorkspaceId() {
  return String(
    state.selectedWorkspaceId
      || state.currentThread?.workspaceId
      || state.auth?.workspaceId
      || "",
  ).trim();
}

function composerAttachmentUploadPayload(file, dataBase64) {
  const payload = { filename: file.name, type: file.type, dataBase64 };
  const workspaceId = composerAttachmentWorkspaceId();
  if (workspaceId) payload.workspaceId = workspaceId;
  return payload;
}

async function uploadFilesWithClassicFallback(files, options = {}) {
  const workspaceId = composerAttachmentWorkspaceId();
  try {
    const client = await importChatAttachmentUploadClient();
    if (typeof client?.uploadComposerFiles === "function") {
      const uploaded = await client.uploadComposerFiles({
        threadId: state.currentThreadId,
        workspaceId,
        files,
        api,
        readFileAsDataUrl,
        onProgress: options.onProgress,
      });
      return Array.isArray(uploaded?.artifacts) ? uploaded.artifacts : [];
    }
  } catch (_error) {
    // Fall through to the classic upload path when the optional ESM adapter is unavailable.
  }

  const artifacts = [];
  for (const file of files) {
    const dataBase64 = await fileToBase64(file);
    const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/uploads`, {
      method: "POST",
      body: JSON.stringify(composerAttachmentUploadPayload(file, dataBase64)),
    });
    if (result.artifact) artifacts.push(result.artifact);
  }
  return artifacts;
}

importChatAttachmentUploadClient().catch(() => null);

async function uploadFiles(files) {
  if (!state.currentThreadId && state.viewMode === "single") await loadSingleWindow();
  if (isDraftThread(state.currentThread)) await materializeCurrentThread();
  if (!state.currentThreadId || !files || !files.length) return;
  if (typeof markSystemFilePickerReturned === "function") {
    markSystemFilePickerReturned(CHAT_ATTACHMENT_UPLOAD_FOREGROUND_SUPPRESS_MS);
  }
  $("attachFile").disabled = true;
  $("connectionState").textContent = "Uploading";
  try {
    const artifacts = await uploadFilesWithClassicFallback(files, {
      onProgress: (progress) => {
        if (progress?.status === "uploading" && progress.filename) $("connectionState").textContent = `Uploading ${progress.filename}`;
      },
    });
    for (const artifact of artifacts) {
      if (artifact && !state.pendingArtifacts.some((item) => item.id === artifact.id)) {
        state.pendingArtifacts.push(artifact);
      }
    }
    renderPendingArtifacts();
    updateComposerAction();
    $("connectionState").textContent = "Home AI OK";
    if (typeof markSystemFilePickerReturned === "function") {
      markSystemFilePickerReturned(CHAT_ATTACHMENT_UPLOAD_FOREGROUND_SUPPRESS_MS);
    }
  } catch (err) {
    showError(err);
  } finally {
    $("attachFile").disabled = false;
    $("fileInput").value = "";
  }
}
