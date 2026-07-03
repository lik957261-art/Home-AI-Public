const CHAT_COMPOSER_API_CLIENT_VERSION = "20260702-vite-chat-composer-api-client-v1";
const DEFAULT_COMPOSER_SEND_TIMEOUT_MS = 30000;

function cleanString(value, max = 4000) {
  return String(value == null ? "" : value).replace(/\u00a0/g, " ").trim().slice(0, Math.max(1, Number(max) || 4000));
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function encodePathSegment(value) {
  return encodeURIComponent(cleanString(value, 240));
}

function normalizeArtifacts(value) {
  return Array.isArray(value) ? value.filter(isObject).slice(0, 20) : [];
}

function normalizeComposerSendBody(input = {}) {
  const body = isObject(input.body) ? input.body : input;
  const normalized = {
    text: cleanString(body.text || input.text || "", 240000),
    artifacts: normalizeArtifacts(body.artifacts || input.artifacts),
    workspaceId: cleanString(body.workspaceId || input.workspaceId || "owner", 120) || "owner",
    notificationChannel: cleanString(body.notificationChannel || input.notificationChannel || "web_push", 80) || "web_push",
  };
  [
    "taskGroupId",
    "singleWindowMode",
    "messageKind",
    "messageLimit",
    "model",
    "provider",
    "reasoning_effort",
    "replyToMessageId",
  ].forEach((key) => {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") normalized[key] = body[key];
  });
  if (Array.isArray(body.instructions) || cleanString(body.instructions || "")) normalized.instructions = body.instructions;
  if (isObject(body.directory)) normalized.directory = body.directory;
  if (isObject(body.environmentContext)) normalized.environmentContext = body.environmentContext;
  return Object.freeze(normalized);
}

function buildComposerSendRequest(input = {}) {
  const threadId = cleanString(input.threadId || input.thread?.id || "", 240);
  const body = normalizeComposerSendBody(input);
  if (!threadId) {
    return Object.freeze({ ok: false, code: "thread_id_missing", method: "POST", path: "", body });
  }
  if (!body.text && !body.artifacts.length) {
    return Object.freeze({ ok: false, code: "message_body_empty", method: "POST", path: "", body });
  }
  return Object.freeze({
    ok: true,
    code: "",
    method: "POST",
    path: `/api/threads/${encodePathSegment(threadId)}/messages`,
    body,
    timeoutMs: Number(input.timeoutMs || DEFAULT_COMPOSER_SEND_TIMEOUT_MS),
  });
}

function buildComposerInterruptRequest(input = {}) {
  const threadId = cleanString(input.threadId || input.thread?.id || "", 240);
  const taskGroupId = cleanString(input.taskGroupId || input.body?.taskGroupId || "", 240);
  if (!threadId) {
    return Object.freeze({ ok: false, code: "thread_id_missing", method: "POST", path: "", body: Object.freeze({}) });
  }
  return Object.freeze({
    ok: true,
    code: "",
    method: "POST",
    path: `/api/threads/${encodePathSegment(threadId)}/interrupt`,
    body: Object.freeze(taskGroupId ? { taskGroupId } : {}),
    timeoutMs: Number(input.timeoutMs || DEFAULT_COMPOSER_SEND_TIMEOUT_MS),
  });
}

function requireInjectedApi(api) {
  if (typeof api !== "function") throw new Error("composer_api_client_requires_runtime_api");
  return api;
}

async function sendComposerMessage(input = {}) {
  const request = buildComposerSendRequest(input);
  if (!request.ok) {
    const error = new Error(request.code || "composer_send_request_invalid");
    error.code = request.code || "composer_send_request_invalid";
    error.request = request;
    throw error;
  }
  const api = requireInjectedApi(input.api);
  return api(request.path, {
    method: request.method,
    body: JSON.stringify(request.body),
    timeoutMs: request.timeoutMs,
  });
}

async function interruptComposerRun(input = {}) {
  const request = buildComposerInterruptRequest(input);
  if (!request.ok) {
    const error = new Error(request.code || "composer_interrupt_request_invalid");
    error.code = request.code || "composer_interrupt_request_invalid";
    error.request = request;
    throw error;
  }
  const api = requireInjectedApi(input.api);
  return api(request.path, {
    method: request.method,
    body: JSON.stringify(request.body),
    timeoutMs: request.timeoutMs,
  });
}

export {
  CHAT_COMPOSER_API_CLIENT_VERSION,
  DEFAULT_COMPOSER_SEND_TIMEOUT_MS,
  buildComposerInterruptRequest,
  buildComposerSendRequest,
  interruptComposerRun,
  normalizeComposerSendBody,
  sendComposerMessage,
};
