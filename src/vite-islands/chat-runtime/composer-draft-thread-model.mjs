export const CHAT_COMPOSER_DRAFT_THREAD_MODEL_VERSION = "20260704.composer-draft-thread.v1";

function cleanIdPart(value) {
  return String(value || "").trim();
}

function cleanSubprojectId(value) {
  return cleanIdPart(value);
}

export function isDraftThreadRecord(thread) {
  return Boolean(thread?.draft || String(thread?.id || "").startsWith("draft_"));
}

export function createDraftThreadPlan(input = {}) {
  const seq = Math.max(0, Number(input.sequence || 0)) + 1;
  const nowIso = String(input.nowIso || new Date(0).toISOString());
  const nowMs = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : 0;
  const thread = {
    id: `draft_${nowMs}_${seq}`,
    title: String(input.title || "New thread"),
    workspaceId: cleanIdPart(input.workspaceId),
    projectId: cleanIdPart(input.projectId),
    subprojectId: cleanSubprojectId(input.subprojectId),
    singleWindow: false,
    draft: true,
    hermesSessionId: "",
    status: "draft",
    activeRunId: null,
    activeRunIds: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    messages: [],
    events: [],
    preview: "",
  };
  return Object.freeze({
    version: CHAT_COMPOSER_DRAFT_THREAD_MODEL_VERSION,
    sequence: seq,
    thread: Object.freeze(thread),
  });
}

export function materializeDraftThreadRequestPlan(thread) {
  if (!isDraftThreadRecord(thread)) {
    return Object.freeze({
      version: CHAT_COMPOSER_DRAFT_THREAD_MODEL_VERSION,
      draft: false,
      draftId: String(thread?.id || ""),
      body: null,
    });
  }
  return Object.freeze({
    version: CHAT_COMPOSER_DRAFT_THREAD_MODEL_VERSION,
    draft: true,
    draftId: String(thread?.id || ""),
    body: Object.freeze({
      workspaceId: cleanIdPart(thread?.workspaceId),
      projectId: cleanIdPart(thread?.projectId),
      subprojectId: cleanSubprojectId(thread?.subprojectId),
      title: String(thread?.title || "New thread"),
    }),
  });
}

export function isSharedProjectRecord(project) {
  const source = String(project?.source || "");
  return Boolean(project?.shared || source === "shared-allowed-root" || source.startsWith("shared-allowed-root-"));
}
