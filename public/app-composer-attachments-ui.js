"use strict";

async function uploadFiles(files) {
  if (!state.currentThreadId && state.viewMode === "single") await loadSingleWindow();
  if (isDraftThread(state.currentThread)) await materializeCurrentThread();
  if (!state.currentThreadId || !files || !files.length) return;
  $("attachFile").disabled = true;
  $("connectionState").textContent = "Uploading";
  try {
    for (const file of files) {
      const dataBase64 = await fileToBase64(file);
      const result = await api(`/api/threads/${encodeURIComponent(state.currentThreadId)}/uploads`, {
        method: "POST",
        body: JSON.stringify({ filename: file.name, type: file.type, dataBase64, workspaceId: state.selectedWorkspaceId || "owner" }),
      });
      if (result.artifact) state.pendingArtifacts.push(result.artifact);
    }
    renderPendingArtifacts();
    updateComposerAction();
    $("connectionState").textContent = "Home AI OK";
  } catch (err) {
    showError(err);
  } finally {
    $("attachFile").disabled = false;
    $("fileInput").value = "";
  }
}
