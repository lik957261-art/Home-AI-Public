"use strict";

function isDraftThread(thread) {
  return Boolean(thread?.draft || String(thread?.id || "").startsWith("draft_"));
}

function createDraftThread() {
  const now = new Date().toISOString();
  state.draftThreadSeq += 1;
  return {
    id: `draft_${Date.now()}_${state.draftThreadSeq}`,
    title: "New thread",
    workspaceId: state.selectedWorkspaceId,
    projectId: state.selectedProjectId,
    subprojectId: state.selectedSubprojectId || "",
    singleWindow: false,
    draft: true,
    hermesSessionId: "",
    status: "draft",
    activeRunId: null,
    activeRunIds: [],
    createdAt: now,
    updatedAt: now,
    messages: [],
    events: [],
    preview: "",
  };
}

async function materializeCurrentThread() {
  if (!isDraftThread(state.currentThread)) return state.currentThread;
  const result = await api("/api/threads", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: state.currentThread.workspaceId,
      projectId: state.currentThread.projectId,
      subprojectId: state.currentThread.subprojectId || "",
      title: state.currentThread.title || "New thread",
    }),
  });
  const draftId = state.currentThread.id;
  state.currentThread = result.thread;
  state.currentThreadId = result.thread.id;
  state.threads = state.threads.map((thread) => thread.id === draftId ? summarizeThread(result.thread) : thread);
  if (!state.threads.some((thread) => thread.id === result.thread.id)) state.threads.unshift(summarizeThread(result.thread));
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  return state.currentThread;
}

function isSharedProject(project) {
  const source = String(project?.source || "");
  return Boolean(project?.shared || source === "shared-allowed-root" || source.startsWith("shared-allowed-root-"));
}
