"use strict";

const CHAT_COMPOSER_DRAFT_THREAD_MODEL_ESM_PATH = "/vite-islands/chat-composer-draft-thread-model/chat-composer-draft-thread-model.js";
let chatComposerDraftThreadModel = null;
let chatComposerDraftThreadModelPromise = null;

function importChatComposerDraftThreadModel(rootRef = (typeof window !== "undefined" ? window : globalThis)) {
  if (chatComposerDraftThreadModel) return Promise.resolve(chatComposerDraftThreadModel);
  if (!chatComposerDraftThreadModelPromise) {
    const importer = typeof rootRef.__homeAiImportChatComposerDraftThreadModel === "function"
      ? rootRef.__homeAiImportChatComposerDraftThreadModel
      : (path) => import(path);
    chatComposerDraftThreadModelPromise = Promise.resolve()
      .then(() => importer(CHAT_COMPOSER_DRAFT_THREAD_MODEL_ESM_PATH))
      .then((model) => {
        chatComposerDraftThreadModel = model || null;
        return chatComposerDraftThreadModel;
      })
      .catch((error) => {
        chatComposerDraftThreadModelPromise = null;
        throw error;
      });
  }
  return chatComposerDraftThreadModelPromise;
}

function currentChatComposerDraftThreadModel() {
  return chatComposerDraftThreadModel;
}

if (typeof window !== "undefined") {
  importChatComposerDraftThreadModel().catch(() => null);
}

function isDraftThread(thread) {
  const model = currentChatComposerDraftThreadModel();
  if (typeof model?.isDraftThreadRecord === "function") return Boolean(model.isDraftThreadRecord(thread));
  return Boolean(thread?.draft || String(thread?.id || "").startsWith("draft_"));
}

function createDraftThread() {
  const now = new Date().toISOString();
  const nowMs = Date.now();
  const model = currentChatComposerDraftThreadModel();
  if (typeof model?.createDraftThreadPlan === "function") {
    const plan = model.createDraftThreadPlan({
      sequence: state.draftThreadSeq,
      nowIso: now,
      nowMs,
      workspaceId: state.selectedWorkspaceId,
      projectId: state.selectedProjectId,
      subprojectId: state.selectedSubprojectId || "",
    });
    state.draftThreadSeq = plan.sequence;
    return Object.assign({}, plan.thread);
  }
  state.draftThreadSeq += 1;
  return {
    id: `draft_${nowMs}_${state.draftThreadSeq}`,
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
  const model = currentChatComposerDraftThreadModel();
  const plan = typeof model?.materializeDraftThreadRequestPlan === "function"
    ? model.materializeDraftThreadRequestPlan(state.currentThread)
    : {
      draft: true,
      draftId: state.currentThread.id,
      body: {
        workspaceId: state.currentThread.workspaceId,
        projectId: state.currentThread.projectId,
        subprojectId: state.currentThread.subprojectId || "",
        title: state.currentThread.title || "New thread",
      },
    };
  if (!plan.draft) return state.currentThread;
  const result = await api("/api/threads", {
    method: "POST",
    body: JSON.stringify(plan.body),
  });
  const draftId = plan.draftId || state.currentThread.id;
  state.currentThread = result.thread;
  state.currentThreadId = result.thread.id;
  state.threads = state.threads.map((thread) => thread.id === draftId ? summarizeThread(result.thread) : thread);
  if (!state.threads.some((thread) => thread.id === result.thread.id)) state.threads.unshift(summarizeThread(result.thread));
  renderThreads();
  renderCurrentThread({ stickToBottom: true });
  return state.currentThread;
}

function isSharedProject(project) {
  const model = currentChatComposerDraftThreadModel();
  if (typeof model?.isSharedProjectRecord === "function") return Boolean(model.isSharedProjectRecord(project));
  const source = String(project?.source || "");
  return Boolean(project?.shared || source === "shared-allowed-root" || source.startsWith("shared-allowed-root-"));
}
