"use strict";

const crypto = require("node:crypto");

const DEFAULT_CONTRACT_VERSION = "remote-managed-workspace-v1";
const DEFAULT_STALE_AFTER_MS = 180000;
const DEFAULT_LONG_POLL_WAIT_MS = 25000;
const MAX_LONG_POLL_WAIT_MS = 60000;
const MAX_HISTORY_ITEMS = 30;
const MAX_ESCALATIONS = 100;
const MAX_TASK_CARDS_PER_WORKSPACE = 200;
const SESSION_STATES = new Set([
  "disconnected",
  "connecting",
  "connected",
  "stale",
  "auth_failed",
  "config_invalid",
  "offline",
]);
const TERMINAL_TASK_CARD_STATUSES = new Set([
  "completed",
  "blocked",
  "redirected",
  "rejected",
  "partially_completed",
]);
const NONTERMINAL_TASK_CARD_STATUSES = new Set(["queued", "acknowledged"]);
const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const TASK_CARD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const PRIVATE_KEY_PATTERN = /(?:secret|token|cookie|authorization|password|credential|providerPayload|privateThread|endpointBody|databaseRows|dbRows|screenshot|rawLog|rawLogs|logs|fullPrompt|promptBody|accessKey|launchToken)/i;
const PRIVATE_VALUE_PATTERN = /(?:-----BEGIN [^-]+PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._~+/-]+|\/Users\/[^ \n\r\t]+|[A-Za-z]:\\[^ \n\r\t]+)/i;

class RemoteManagedWorkspaceError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = "RemoteManagedWorkspaceError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function fail(status, code, message, details) {
  throw new RemoteManagedWorkspaceError(status, code, message, details);
}

function compactString(value, max = 240) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function boundedString(value, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeId(value, label, pattern) {
  const out = compactString(value, 180);
  if (!out || !pattern.test(out)) {
    fail(400, `remote_managed_workspace_invalid_${label}`, `Invalid ${label}`);
  }
  return out;
}

function normalizeStringList(values, maxItems = 32, maxLength = 80) {
  const source = Array.isArray(values) ? values : String(values || "").split(",");
  const out = [];
  const seen = new Set();
  for (const item of source) {
    const value = compactString(item, maxLength);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= maxItems) break;
  }
  return out;
}

function projectRootLabelFromBody(body = {}) {
  const explicit = compactString(body.projectRootLabel || body.projectLabel || body.projectName, 120);
  if (explicit) return explicit;
  const raw = String(body.projectRoot || body.root || "");
  const parts = raw.split(/[\\/]+/).filter(Boolean);
  return compactString(parts[parts.length - 1] || "remote-project", 120);
}

function boundedPositiveInt(value, defaultValue, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return defaultValue;
  return Math.max(min, Math.min(Math.floor(number), max));
}

function normalizeSessionState(value, defaultState = "") {
  const state = compactString(value, 40).toLowerCase();
  return SESSION_STATES.has(state) ? state : defaultState;
}

function publicCentralUrl(value) {
  const raw = compactString(value, 320);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return compactString(url.toString().replace(/\/$/, ""), 240);
  } catch (_) {
    return "";
  }
}

function queuedTaskCardsForWorkspace(cards, limit) {
  return Object.values(cards)
    .filter((card) => card.status === "queued")
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .slice(0, limit)
    .map((card) => publicTaskCard(card, { includeBody: true }));
}

function secureEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (!left.length || !right.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function parseEnrollmentRecord(workspaceId, value) {
  if (typeof value === "string") {
    return { workspaceId, token: value };
  }
  if (!value || typeof value !== "object") {
    return { workspaceId, token: "" };
  }
  return {
    workspaceId,
    token: String(value.token || value.enrollmentToken || ""),
    nodeId: compactString(value.nodeId, 120),
    nodeName: compactString(value.nodeName, 120),
    projectType: compactString(value.projectType, 80),
    contractVersion: compactString(value.contractVersion, 80),
  };
}

function parseEnrollmentPairs(value) {
  const out = {};
  for (const item of String(value || "").split(",")) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf(":");
    if (sep <= 0) continue;
    const workspaceId = trimmed.slice(0, sep).trim();
    const token = trimmed.slice(sep + 1).trim();
    if (workspaceId && token) out[workspaceId] = { token };
  }
  return out;
}

function normalizeEnrollments(deps = {}) {
  if (deps.enrollments && typeof deps.enrollments === "object") {
    const out = {};
    for (const [workspaceId, record] of Object.entries(deps.enrollments)) {
      out[workspaceId] = parseEnrollmentRecord(workspaceId, record);
    }
    return out;
  }

  const env = deps.env || process.env;
  const json = String(env.HERMES_REMOTE_MANAGED_WORKSPACE_ENROLLMENTS || "").trim();
  if (json) {
    try {
      const parsed = JSON.parse(json);
      const out = {};
      for (const [workspaceId, record] of Object.entries(parsed || {})) {
        out[workspaceId] = parseEnrollmentRecord(workspaceId, record);
      }
      return out;
    } catch (err) {
      fail(503, "remote_managed_workspace_enrollment_config_invalid", "Remote managed workspace enrollment config is invalid");
    }
  }

  const pairs = parseEnrollmentPairs(env.HERMES_REMOTE_MANAGED_WORKSPACE_TOKENS);
  if (Object.keys(pairs).length) {
    const out = {};
    for (const [workspaceId, record] of Object.entries(pairs)) {
      out[workspaceId] = parseEnrollmentRecord(workspaceId, record);
    }
    return out;
  }

  const singleWorkspaceId = compactString(env.HERMES_REMOTE_MANAGED_WORKSPACE_ID, 128);
  const singleToken = String(env.HERMES_REMOTE_MANAGED_WORKSPACE_ENROLLMENT_TOKEN || "").trim();
  if (singleWorkspaceId && singleToken) {
    return {
      [singleWorkspaceId]: parseEnrollmentRecord(singleWorkspaceId, {
        token: singleToken,
        nodeId: env.HERMES_REMOTE_MANAGED_WORKSPACE_NODE_ID,
        nodeName: env.HERMES_REMOTE_MANAGED_WORKSPACE_NODE_NAME,
      }),
    };
  }

  return {};
}

function baseState() {
  return {
    workspaces: {},
    taskCards: {},
    taskCardIdempotency: {},
    dailySummaries: {},
    escalations: {},
    ledger: [],
  };
}

function ensureStateShape(state) {
  const root = state || {};
  root.workspaces = root.workspaces && typeof root.workspaces === "object" ? root.workspaces : {};
  root.taskCards = root.taskCards && typeof root.taskCards === "object" ? root.taskCards : {};
  root.taskCardIdempotency = root.taskCardIdempotency && typeof root.taskCardIdempotency === "object"
    ? root.taskCardIdempotency
    : {};
  root.dailySummaries = root.dailySummaries && typeof root.dailySummaries === "object" ? root.dailySummaries : {};
  root.escalations = root.escalations && typeof root.escalations === "object" ? root.escalations : {};
  root.ledger = Array.isArray(root.ledger) ? root.ledger : [];
  return root;
}

function sanitizeValue(value, options = {}, depth = 0, keyName = "") {
  const maxDepth = Number.isInteger(options.maxDepth) ? options.maxDepth : 4;
  const maxString = Number.isInteger(options.maxString) ? options.maxString : 600;
  if (PRIVATE_KEY_PATTERN.test(String(keyName || ""))) {
    return { value: "[redacted]", redacted: 1 };
  }
  if (value == null || typeof value === "boolean" || typeof value === "number") {
    return { value, redacted: 0 };
  }
  if (typeof value === "string") {
    if (PRIVATE_VALUE_PATTERN.test(value)) return { value: "[redacted]", redacted: 1 };
    return { value: boundedString(value, maxString), redacted: 0 };
  }
  if (depth >= maxDepth) {
    return { value: "[bounded]", redacted: 1 };
  }
  if (Array.isArray(value)) {
    let redacted = 0;
    const out = [];
    for (const item of value.slice(0, options.maxArray || 24)) {
      const sanitized = sanitizeValue(item, options, depth + 1);
      redacted += sanitized.redacted;
      out.push(sanitized.value);
    }
    if (value.length > out.length) redacted += 1;
    return { value: out, redacted };
  }
  if (typeof value === "object") {
    let redacted = 0;
    const out = {};
    const entries = Object.entries(value).slice(0, options.maxObjectKeys || 40);
    for (const [key, item] of entries) {
      const sanitized = sanitizeValue(item, options, depth + 1, key);
      redacted += sanitized.redacted;
      out[compactString(key, 80)] = sanitized.value;
    }
    if (Object.keys(value).length > entries.length) redacted += 1;
    return { value: out, redacted };
  }
  return { value: compactString(value, maxString), redacted: 0 };
}

function publicSession(workspace, nowMs, options = {}) {
  const staleAfterMs = Number(options.staleAfterMs || DEFAULT_STALE_AFTER_MS);
  const offlineAfterMs = Number(options.offlineAfterMs || staleAfterMs * 4);
  const activeLongPollCount = Number(options.activeLongPollCount || 0);
  const session = workspace.session && typeof workspace.session === "object" ? workspace.session : {};
  const lastSeenAt = session.lastSeenAt || workspace.lastPollAt || workspace.lastHeartbeatAt || workspace.registeredAt || "";
  const lastSeenMs = lastSeenAt ? Date.parse(lastSeenAt) : 0;
  const ageMs = lastSeenMs ? Math.max(0, nowMs - lastSeenMs) : null;
  let state = normalizeSessionState(session.state, "");
  if (state === "config_invalid" || state === "auth_failed") {
    // Preserve explicit failure states until a later valid register/poll/heartbeat resets them.
  } else if (activeLongPollCount > 0) {
    state = "connected";
  } else if (!lastSeenMs) {
    state = "disconnected";
  } else if (state === "connecting" && ageMs <= staleAfterMs) {
    state = "connecting";
  } else if (state === "disconnected" || state === "offline") {
    // Preserve explicit node-reported shutdown states until the next successful session event.
  } else if (ageMs <= staleAfterMs) {
    state = "connected";
  } else if (ageMs <= offlineAfterMs) {
    state = "stale";
  } else {
    state = "offline";
  }
  return {
    mode: compactString(session.mode || "poll", 40),
    state,
    centralUrl: session.centralUrl || "",
    workspaceId: workspace.workspaceId,
    nodeId: workspace.nodeId,
    connected: state === "connected",
    activeLongPollCount,
    lastSeenAt: lastSeenAt || null,
    lastPollAt: workspace.lastPollAt || session.lastPollAt || null,
    lastLongPollAt: session.lastLongPollAt || null,
    lastHeartbeatAt: workspace.lastHeartbeatAt || null,
    lastNotifyAt: session.lastNotifyAt || null,
    lastFailureAt: session.lastFailureAt || null,
    failureCode: session.failureCode || "",
    configIssueCode: session.configIssueCode || "",
    reconnectBackoffMs: session.reconnectBackoffMs || 0,
    staleAfterMs,
    offlineAfterMs,
  };
}

function publicWorkspace(workspace, nowMs, options = {}) {
  const staleAfterMs = typeof options === "number" ? options : Number(options.staleAfterMs || DEFAULT_STALE_AFTER_MS);
  const lastHeartbeatMs = workspace.lastHeartbeatAt ? Date.parse(workspace.lastHeartbeatAt) : 0;
  const onlineStatus = lastHeartbeatMs && nowMs - lastHeartbeatMs <= staleAfterMs ? "online" : "stale";
  return {
    workspaceId: workspace.workspaceId,
    nodeId: workspace.nodeId,
    nodeName: workspace.nodeName,
    projectType: workspace.projectType,
    projectRootLabel: workspace.projectRootLabel,
    contractVersion: workspace.contractVersion,
    roles: [...(workspace.roles || [])],
    capabilities: [...(workspace.capabilities || [])],
    status: onlineStatus,
    registeredAt: workspace.registeredAt,
    lastHeartbeatAt: workspace.lastHeartbeatAt || null,
    lastPollAt: workspace.lastPollAt || null,
    heartbeatCount: workspace.heartbeatCount || 0,
    session: publicSession(workspace, nowMs, typeof options === "number" ? { staleAfterMs } : options),
  };
}

function publicTaskCard(card, options = {}) {
  const out = {
    taskCardId: card.taskCardId,
    workspaceId: card.workspaceId,
    idempotencyKey: card.idempotencyKey || "",
    status: card.status,
    title: card.title,
    summary: card.summary,
    cardKind: card.cardKind || "",
    category: card.category || "",
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    acknowledgedAt: card.acknowledgedAt || null,
    lastHeartbeatAt: card.lastHeartbeatAt || null,
    returnedAt: card.returnedAt || null,
    executionLease: card.executionLease || null,
  };
  if (options.includeBody) out.bodyMarkdown = card.bodyMarkdown || "";
  if (card.return) out.return = card.return;
  return out;
}

function createRemoteManagedWorkspaceService(deps = {}) {
  const nowIso = typeof deps.nowIso === "function" ? deps.nowIso : () => new Date().toISOString();
  const nowMs = typeof deps.nowMs === "function" ? deps.nowMs : () => Date.now();
  const makeId = typeof deps.makeId === "function"
    ? deps.makeId
    : (prefix = "rmw") => `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
  const staleAfterMs = Number(deps.staleAfterMs || deps.env?.HERMES_REMOTE_MANAGED_WORKSPACE_STALE_AFTER_MS || DEFAULT_STALE_AFTER_MS);
  const offlineAfterMs = Number(deps.offlineAfterMs || deps.env?.HERMES_REMOTE_MANAGED_WORKSPACE_OFFLINE_AFTER_MS || staleAfterMs * 4);
  const defaultLongPollWaitMs = boundedPositiveInt(
    deps.defaultLongPollWaitMs || deps.env?.HERMES_REMOTE_MANAGED_WORKSPACE_LONG_POLL_WAIT_MS,
    DEFAULT_LONG_POLL_WAIT_MS,
    0,
    MAX_LONG_POLL_WAIT_MS,
  );
  const setTimeoutImpl = typeof deps.setTimeout === "function" ? deps.setTimeout : setTimeout;
  const clearTimeoutImpl = typeof deps.clearTimeout === "function" ? deps.clearTimeout : clearTimeout;
  const memoryState = ensureStateShape(deps.initialState || baseState());
  const longPollWaiters = new Map();

  function store() {
    const source = typeof deps.state === "function" ? deps.state() : null;
    if (!source) return memoryState;
    source.remoteManagedWorkspaces = ensureStateShape(source.remoteManagedWorkspaces || baseState());
    return source.remoteManagedWorkspaces;
  }

  function save() {
    if (typeof deps.saveState === "function") deps.saveState();
  }

  function recordLedger(entry) {
    const state = store();
    state.ledger.unshift(Object.assign({ at: nowIso() }, entry));
    state.ledger = state.ledger.slice(0, 200);
  }

  function activeLongPollCount(workspaceId) {
    return (longPollWaiters.get(workspaceId) || new Set()).size;
  }

  function publicWorkspaceFor(workspace) {
    return publicWorkspace(workspace, nowMs(), {
      staleAfterMs,
      offlineAfterMs,
      activeLongPollCount: activeLongPollCount(workspace.workspaceId),
    });
  }

  function sessionInput(body = {}) {
    const source = body.session && typeof body.session === "object" ? body.session : body;
    const rawCentralUrl = source.centralUrl || source.homeAiCentralUrl || body.centralUrl || body.homeAiCentralUrl || "";
    const centralUrl = publicCentralUrl(rawCentralUrl);
    const hasRawCentralUrl = Boolean(compactString(rawCentralUrl, 320));
    const configIssueCode = hasRawCentralUrl && !centralUrl ? "remote_managed_workspace_central_url_invalid" : "";
    return {
      centralUrl,
      configIssueCode,
      requestedState: normalizeSessionState(source.state || body.sessionState || body.connectionState, ""),
      reconnectBackoffMs: boundedPositiveInt(source.reconnectBackoffMs || body.reconnectBackoffMs, 0, 0, 3600000),
    };
  }

  function mergeSession(workspace, input = {}) {
    const at = nowIso();
    const current = workspace.session && typeof workspace.session === "object" ? workspace.session : {};
    const requestedState = normalizeSessionState(input.state || input.requestedState, "");
    const configIssueCode = input.configIssueCode || "";
    const state = configIssueCode
      ? "config_invalid"
      : (requestedState || input.state || "connected");
    workspace.session = Object.assign({}, current, {
      mode: compactString(input.mode || current.mode || "poll", 40),
      state: normalizeSessionState(state, "connected"),
      centralUrl: input.centralUrl || current.centralUrl || "",
      lastSeenAt: at,
      reconnectBackoffMs: Number(input.reconnectBackoffMs || current.reconnectBackoffMs || 0) || 0,
      failureCode: configIssueCode ? current.failureCode || "" : "",
      configIssueCode,
    });
    if (input.lastPoll) workspace.session.lastPollAt = at;
    if (input.lastLongPoll) workspace.session.lastLongPollAt = at;
    if (input.failureCode) {
      workspace.session.state = "auth_failed";
      workspace.session.failureCode = compactString(input.failureCode, 120);
      workspace.session.lastFailureAt = at;
    }
    if (input.configIssueCode) {
      workspace.session.configIssueCode = compactString(input.configIssueCode, 120);
    }
    return workspace.session;
  }

  function markSessionNotify(workspace) {
    const current = workspace.session && typeof workspace.session === "object" ? workspace.session : {};
    workspace.session = Object.assign({}, current, {
      lastNotifyAt: nowIso(),
    });
  }

  function recordSessionAuthFailure(workspaceId, code) {
    const state = store();
    const workspace = state.workspaces[workspaceId];
    if (!workspace) return;
    mergeSession(workspace, {
      state: "auth_failed",
      failureCode: code,
      mode: workspace.session?.mode || "poll",
    });
    recordLedger({ type: "session-auth-failed", workspaceId, code });
    save();
  }

  function enrollmentConfigStatus() {
    try {
      const enrollments = normalizeEnrollments(deps);
      return {
        state: Object.keys(enrollments).length ? "ok" : "missing",
        configured: Object.keys(enrollments).length > 0,
        valid: true,
      };
    } catch (err) {
      return {
        state: "config_invalid",
        configured: true,
        valid: false,
        code: err.code || "remote_managed_workspace_enrollment_config_invalid",
      };
    }
  }

  function credentialToken(credential = {}, body = {}) {
    return String(credential.token || credential.enrollmentToken || body.enrollmentToken || body.token || "").trim();
  }

  function validateEnrollment(workspaceIdInput, credential = {}, body = {}) {
    const enrollments = normalizeEnrollments(deps);
    if (!Object.keys(enrollments).length) {
      fail(503, "remote_managed_workspace_enrollment_token_unconfigured", "Remote managed workspace enrollment token is not configured");
    }

    const workspaceId = normalizeId(workspaceIdInput || body.workspaceId, "workspace_id", WORKSPACE_ID_PATTERN);
    const enrollment = enrollments[workspaceId];
    if (!enrollment || !enrollment.token) {
      recordSessionAuthFailure(workspaceId, "remote_managed_workspace_not_enrolled");
      fail(403, "remote_managed_workspace_not_enrolled", "Remote managed workspace is not enrolled");
    }

    const token = credentialToken(credential, body);
    if (!token) {
      recordSessionAuthFailure(workspaceId, "remote_managed_workspace_token_required");
      fail(401, "remote_managed_workspace_token_required", "Remote managed workspace token is required");
    }
    if (!secureEqual(token, enrollment.token)) {
      recordSessionAuthFailure(workspaceId, "remote_managed_workspace_token_invalid");
      fail(403, "remote_managed_workspace_token_invalid", "Remote managed workspace token is invalid");
    }

    const nodeId = compactString(body.nodeId || credential.nodeId || enrollment.nodeId || `${workspaceId}-node`, 120);
    if (enrollment.nodeId && nodeId !== enrollment.nodeId) {
      recordSessionAuthFailure(workspaceId, "remote_managed_workspace_node_mismatch");
      fail(403, "remote_managed_workspace_node_mismatch", "Remote managed workspace node is not enrolled for this workspace");
    }
    return { workspaceId, nodeId, enrollment };
  }

  function workspaceOrFail(workspaceId) {
    const state = store();
    const workspace = state.workspaces[workspaceId];
    if (!workspace) {
      fail(404, "remote_managed_workspace_not_registered", "Remote managed workspace is not registered");
    }
    return workspace;
  }

  function cardsForWorkspace(workspaceId) {
    const state = store();
    state.taskCards[workspaceId] = state.taskCards[workspaceId] && typeof state.taskCards[workspaceId] === "object"
      ? state.taskCards[workspaceId]
      : {};
    return state.taskCards[workspaceId];
  }

  function idempotencyForWorkspace(workspaceId) {
    const state = store();
    state.taskCardIdempotency[workspaceId] = state.taskCardIdempotency[workspaceId] && typeof state.taskCardIdempotency[workspaceId] === "object"
      ? state.taskCardIdempotency[workspaceId]
      : {};
    return state.taskCardIdempotency[workspaceId];
  }

  function taskCardOrFail(workspaceId, taskCardId) {
    const normalizedTaskCardId = normalizeId(taskCardId, "task_card_id", TASK_CARD_ID_PATTERN);
    const card = cardsForWorkspace(workspaceId)[normalizedTaskCardId];
    if (!card) fail(404, "remote_managed_workspace_task_card_not_found", "Remote managed workspace task card was not found");
    return card;
  }

  function registerNode(body = {}, credential = {}) {
    const validation = validateEnrollment(body.workspaceId, credential, body);
    const at = nowIso();
    const state = store();
    const previous = state.workspaces[validation.workspaceId] || {};
    const workspace = {
      workspaceId: validation.workspaceId,
      nodeId: validation.nodeId,
      nodeName: compactString(body.nodeName || validation.enrollment.nodeName || previous.nodeName || validation.nodeId, 120),
      projectType: compactString(body.projectType || validation.enrollment.projectType || previous.projectType || "unknown", 80),
      projectRootLabel: projectRootLabelFromBody(body),
      contractVersion: compactString(body.contractVersion || validation.enrollment.contractVersion || DEFAULT_CONTRACT_VERSION, 80),
      roles: normalizeStringList(body.roles || previous.roles),
      capabilities: normalizeStringList(body.capabilities || previous.capabilities, 48, 120),
      registeredAt: previous.registeredAt || at,
      updatedAt: at,
      lastHeartbeatAt: at,
      heartbeatCount: previous.heartbeatCount || 0,
    };
    workspace.session = Object.assign({}, previous.session || {});
    mergeSession(workspace, Object.assign(sessionInput(body), {
      state: "connecting",
      mode: "poll",
    }));
    state.workspaces[validation.workspaceId] = workspace;
    recordLedger({ type: "register", workspaceId: validation.workspaceId, nodeId: validation.nodeId });
    save();
    return {
      ok: true,
      workspace: publicWorkspaceFor(workspace),
    };
  }

  function nodeHeartbeat(workspaceIdInput, body = {}, credential = {}) {
    const validation = validateEnrollment(workspaceIdInput, credential, body);
    const workspace = workspaceOrFail(validation.workspaceId);
    const at = nowIso();
    workspace.lastHeartbeatAt = at;
    workspace.updatedAt = at;
    workspace.heartbeatCount = (workspace.heartbeatCount || 0) + 1;
    if (body.capabilities) workspace.capabilities = normalizeStringList(body.capabilities, 48, 120);
    if (body.roles) workspace.roles = normalizeStringList(body.roles);
    if (body.nodeName) workspace.nodeName = compactString(body.nodeName, 120);
    mergeSession(workspace, Object.assign(sessionInput(body), {
      state: normalizeSessionState(body.sessionState || body.connectionState, "connected"),
      mode: body.sessionMode || workspace.session?.mode || "poll",
    }));
    const laneStatus = sanitizeValue(body.laneStatus || body.status || {}, { maxString: 320 });
    workspace.latestNodeStatus = laneStatus.value;
    workspace.privacy = { redacted: laneStatus.redacted };
    recordLedger({ type: "node-heartbeat", workspaceId: validation.workspaceId, nodeId: validation.nodeId });
    save();
    return {
      ok: true,
      workspace: publicWorkspaceFor(workspace),
      privacy: workspace.privacy,
    };
  }

  function dispatchTaskCard(workspaceIdInput, body = {}, context = {}) {
    const workspaceId = normalizeId(workspaceIdInput, "workspace_id", WORKSPACE_ID_PATTERN);
    workspaceOrFail(workspaceId);
    const cards = cardsForWorkspace(workspaceId);
    const idempotency = idempotencyForWorkspace(workspaceId);
    const explicitId = compactString(body.taskCardId || body.id, 160);
    const taskCardId = explicitId ? normalizeId(explicitId, "task_card_id", TASK_CARD_ID_PATTERN) : makeId("rmwtc");
    const idempotencyKey = compactString(body.idempotencyKey || body.requestId || taskCardId, 180);
    const duplicateId = idempotencyKey ? idempotency[idempotencyKey] : "";
    if (duplicateId && cards[duplicateId]) {
      return {
        ok: true,
        duplicate: true,
        taskCard: publicTaskCard(cards[duplicateId]),
      };
    }
    if (cards[taskCardId]) {
      if (idempotencyKey) idempotency[idempotencyKey] = taskCardId;
      return {
        ok: true,
        duplicate: true,
        taskCard: publicTaskCard(cards[taskCardId]),
      };
    }

    const at = nowIso();
    const card = {
      taskCardId,
      workspaceId,
      idempotencyKey,
      status: "queued",
      title: compactString(body.title || "Remote managed workspace task", 160),
      summary: compactString(body.summary || "", 320),
      bodyMarkdown: boundedString(body.bodyMarkdown || body.body || "", 6000),
      cardKind: compactString(body.cardKind || "remote_managed_workspace_task", 80),
      category: compactString(body.category || "", 80),
      createdAt: at,
      updatedAt: at,
      createdBy: compactString(context.createdBy || context.ownerWorkspaceId || "home-ai-owner", 120),
      requestedReasoningEffort: compactString(body.requestedReasoningEffort || body.reasoningEffort || "", 40),
      sourceThreadId: compactString(body.sourceThreadId || "", 120),
      executionLease: null,
    };
    cards[taskCardId] = card;
    if (idempotencyKey) idempotency[idempotencyKey] = taskCardId;

    const keys = Object.keys(cards).sort((a, b) => String(cards[b].createdAt).localeCompare(String(cards[a].createdAt)));
    for (const key of keys.slice(MAX_TASK_CARDS_PER_WORKSPACE)) {
      if (TERMINAL_TASK_CARD_STATUSES.has(cards[key].status)) delete cards[key];
    }

    markSessionNotify(workspaceOrFail(workspaceId));
    recordLedger({ type: "task-card-dispatch", workspaceId, taskCardId });
    save();
    notifyTaskCardWaiters(workspaceId);
    return {
      ok: true,
      duplicate: false,
      taskCard: publicTaskCard(card),
    };
  }

  function pollLimit(query = {}) {
    return Math.max(1, Math.min(Number(query.limit || 8) || 8, 20));
  }

  function waitMsForQuery(query = {}) {
    if (!Object.hasOwn(query, "waitMs") && !Object.hasOwn(query, "timeoutMs")) return 0;
    return boundedPositiveInt(query.waitMs || query.timeoutMs, defaultLongPollWaitMs, 0, MAX_LONG_POLL_WAIT_MS);
  }

  function pollResult(workspaceId, limit, wait = {}) {
    const workspace = workspaceOrFail(workspaceId);
    const cards = queuedTaskCardsForWorkspace(cardsForWorkspace(workspaceId), limit);
    const waitMs = Number(wait.waitMs || 0) || 0;
    return {
      ok: true,
      workspaceId,
      taskCards: cards,
      count: cards.length,
      session: publicSession(workspace, nowMs(), {
        staleAfterMs,
        offlineAfterMs,
        activeLongPollCount: activeLongPollCount(workspaceId),
      }),
      poll: {
        mode: waitMs > 0 ? "long_poll" : "poll",
        waitMs,
        timedOut: Boolean(wait.timedOut),
        notified: Boolean(wait.notified),
      },
    };
  }

  function removeWaiter(workspaceId, waiter) {
    const waiters = longPollWaiters.get(workspaceId);
    if (!waiters) return;
    waiters.delete(waiter);
    if (!waiters.size) longPollWaiters.delete(workspaceId);
  }

  function notifyTaskCardWaiters(workspaceId) {
    const waiters = [...(longPollWaiters.get(workspaceId) || [])];
    for (const waiter of waiters) {
      removeWaiter(workspaceId, waiter);
      clearTimeoutImpl(waiter.timer);
      waiter.resolve(pollResult(workspaceId, waiter.limit, {
        waitMs: waiter.waitMs,
        notified: true,
      }));
    }
  }

  function pollTaskCards(workspaceIdInput, query = {}, credential = {}) {
    const validation = validateEnrollment(workspaceIdInput, credential, {});
    const workspace = workspaceOrFail(validation.workspaceId);
    const at = nowIso();
    const limit = pollLimit(query);
    const waitMs = waitMsForQuery(query);
    workspace.lastPollAt = at;
    mergeSession(workspace, {
      mode: waitMs > 0 ? "long_poll" : "poll",
      state: normalizeSessionState(query.sessionState || query.connectionState, "connected"),
      lastPoll: true,
      lastLongPoll: waitMs > 0,
      reconnectBackoffMs: query.reconnectBackoffMs,
    });
    const immediate = pollResult(validation.workspaceId, limit, { waitMs });
    if (immediate.count > 0 || waitMs <= 0) {
      save();
      return immediate;
    }
    const waiters = longPollWaiters.get(validation.workspaceId) || new Set();
    longPollWaiters.set(validation.workspaceId, waiters);
    const waiter = {
      limit,
      waitMs,
      resolve: null,
      timer: null,
    };
    const promise = new Promise((resolve) => {
      waiter.resolve = resolve;
      waiter.timer = setTimeoutImpl(() => {
        removeWaiter(validation.workspaceId, waiter);
        resolve(pollResult(validation.workspaceId, limit, {
          waitMs,
          timedOut: true,
        }));
      }, waitMs);
    });
    waiters.add(waiter);
    save();
    return promise;
  }

  function ackTaskCard(workspaceIdInput, taskCardIdInput, body = {}, credential = {}) {
    const validation = validateEnrollment(workspaceIdInput, credential, body);
    workspaceOrFail(validation.workspaceId);
    const card = taskCardOrFail(validation.workspaceId, taskCardIdInput);
    if (TERMINAL_TASK_CARD_STATUSES.has(card.status)) {
      return { ok: true, duplicate: true, taskCard: publicTaskCard(card) };
    }
    const at = nowIso();
    const leaseId = compactString(body.leaseId || makeId("rmwlease"), 160);
    card.status = "acknowledged";
    card.updatedAt = at;
    card.acknowledgedAt = card.acknowledgedAt || at;
    card.executionLease = {
      leaseId,
      nodeId: validation.nodeId,
      acknowledgedAt: card.acknowledgedAt,
      lastHeartbeatAt: card.lastHeartbeatAt || null,
    };
    recordLedger({ type: "task-card-ack", workspaceId: validation.workspaceId, taskCardId: card.taskCardId });
    save();
    return { ok: true, duplicate: false, taskCard: publicTaskCard(card) };
  }

  function heartbeatTaskCard(workspaceIdInput, taskCardIdInput, body = {}, credential = {}) {
    const validation = validateEnrollment(workspaceIdInput, credential, body);
    workspaceOrFail(validation.workspaceId);
    const card = taskCardOrFail(validation.workspaceId, taskCardIdInput);
    if (TERMINAL_TASK_CARD_STATUSES.has(card.status)) {
      return { ok: true, terminal: true, taskCard: publicTaskCard(card) };
    }
    if (!NONTERMINAL_TASK_CARD_STATUSES.has(card.status)) {
      fail(409, "remote_managed_workspace_task_card_not_active", "Remote managed workspace task card is not active");
    }
    const at = nowIso();
    const progress = sanitizeValue(body.progress || body.status || {}, { maxString: 320 });
    card.status = "acknowledged";
    card.updatedAt = at;
    card.lastHeartbeatAt = at;
    card.latestHeartbeat = progress.value;
    card.privacy = { redacted: progress.redacted };
    card.executionLease = Object.assign({}, card.executionLease || {}, {
      nodeId: validation.nodeId,
      lastHeartbeatAt: at,
    });
    recordLedger({ type: "task-card-heartbeat", workspaceId: validation.workspaceId, taskCardId: card.taskCardId });
    save();
    return { ok: true, taskCard: publicTaskCard(card), privacy: card.privacy };
  }

  function returnTaskCard(workspaceIdInput, taskCardIdInput, body = {}, credential = {}) {
    const validation = validateEnrollment(workspaceIdInput, credential, body);
    workspaceOrFail(validation.workspaceId);
    const card = taskCardOrFail(validation.workspaceId, taskCardIdInput);
    if (TERMINAL_TASK_CARD_STATUSES.has(card.status)) {
      return { ok: true, duplicate: true, taskCard: publicTaskCard(card) };
    }
    const status = compactString(body.status || "completed", 40);
    if (!TERMINAL_TASK_CARD_STATUSES.has(status)) {
      fail(400, "remote_managed_workspace_invalid_terminal_status", "Remote managed workspace task card return status is invalid");
    }
    const evidence = sanitizeValue(body.evidence || body.metadata || {}, { maxString: 500, maxDepth: 4 });
    const at = nowIso();
    card.status = status;
    card.updatedAt = at;
    card.returnedAt = at;
    card.return = {
      status,
      title: compactString(body.title || "", 160),
      summary: compactString(body.summary || "", 500),
      bodyMarkdown: boundedString(body.bodyMarkdown || body.body || "", 2000),
      evidence: evidence.value,
      privacy: { redacted: evidence.redacted },
    };
    recordLedger({ type: "task-card-return", workspaceId: validation.workspaceId, taskCardId: card.taskCardId, status });
    save();
    return {
      ok: true,
      duplicate: false,
      taskCard: publicTaskCard(card),
      privacy: card.return.privacy,
    };
  }

  function recordDailySummary(workspaceIdInput, body = {}, credential = {}) {
    const validation = validateEnrollment(workspaceIdInput, credential, body);
    workspaceOrFail(validation.workspaceId);
    const sanitized = sanitizeValue(body, { maxString: 600, maxDepth: 4 });
    const at = nowIso();
    const state = store();
    const bucket = state.dailySummaries[validation.workspaceId] || { history: [] };
    const summary = {
      at,
      workspaceId: validation.workspaceId,
      summary: compactString(body.summary || body.title || "", 700),
      metadata: sanitized.value,
      privacy: { redacted: sanitized.redacted },
    };
    bucket.latest = summary;
    bucket.history = [summary, ...(bucket.history || [])].slice(0, MAX_HISTORY_ITEMS);
    state.dailySummaries[validation.workspaceId] = bucket;
    recordLedger({ type: "daily-summary", workspaceId: validation.workspaceId });
    save();
    return { ok: true, dailySummary: summary };
  }

  function recordEscalation(workspaceIdInput, body = {}, credential = {}) {
    const validation = validateEnrollment(workspaceIdInput, credential, body);
    workspaceOrFail(validation.workspaceId);
    const sanitized = sanitizeValue(body, { maxString: 600, maxDepth: 4 });
    const at = nowIso();
    const state = store();
    const bucket = state.escalations[validation.workspaceId] || { count: 0, items: [] };
    const escalation = {
      at,
      workspaceId: validation.workspaceId,
      severity: compactString(body.severity || "medium", 40),
      summary: compactString(body.summary || body.title || "", 700),
      metadata: sanitized.value,
      privacy: { redacted: sanitized.redacted },
    };
    bucket.count = (bucket.count || 0) + 1;
    bucket.latest = escalation;
    bucket.items = [escalation, ...(bucket.items || [])].slice(0, MAX_ESCALATIONS);
    state.escalations[validation.workspaceId] = bucket;
    recordLedger({ type: "escalation", workspaceId: validation.workspaceId, severity: escalation.severity });
    save();
    return { ok: true, escalation, escalationCount: bucket.count };
  }

  function status(workspaceIdInput = "") {
    const state = store();
    const currentNowMs = nowMs();
    const ids = workspaceIdInput
      ? [normalizeId(workspaceIdInput, "workspace_id", WORKSPACE_ID_PATTERN)]
      : Object.keys(state.workspaces).sort();
    const workspaces = ids
      .map((workspaceId) => state.workspaces[workspaceId])
      .filter(Boolean)
      .map((workspace) => {
        const taskCards = Object.values(cardsForWorkspace(workspace.workspaceId));
        const activeTaskCards = taskCards
          .filter((card) => NONTERMINAL_TASK_CARD_STATUSES.has(card.status))
          .map((card) => publicTaskCard(card));
        const daily = state.dailySummaries[workspace.workspaceId] || {};
        const escalations = state.escalations[workspace.workspaceId] || {};
        return {
          workspace: publicWorkspace(workspace, currentNowMs, {
            staleAfterMs,
            offlineAfterMs,
            activeLongPollCount: activeLongPollCount(workspace.workspaceId),
          }),
          activeTaskCards,
          activeTaskCardCount: activeTaskCards.length,
          latestDailySummary: daily.latest || null,
          escalationCount: escalations.count || 0,
          latestEscalation: escalations.latest || null,
        };
      });
    return {
      ok: true,
      now: nowIso(),
      staleAfterMs,
      offlineAfterMs,
      controlPlane: {
        outboundOnly: true,
        sessionDesign: "bounded_long_poll",
        sessionStates: [...SESSION_STATES],
        persistentTransport: "none",
        pollFallback: true,
        longPollWaitMs: defaultLongPollWaitMs,
        maxLongPollWaitMs: MAX_LONG_POLL_WAIT_MS,
        enrollment: enrollmentConfigStatus(),
      },
      workspaces,
      count: workspaces.length,
    };
  }

  return {
    registerNode,
    nodeHeartbeat,
    dispatchTaskCard,
    pollTaskCards,
    ackTaskCard,
    heartbeatTaskCard,
    returnTaskCard,
    recordDailySummary,
    recordEscalation,
    status,
  };
}

module.exports = {
  DEFAULT_CONTRACT_VERSION,
  RemoteManagedWorkspaceError,
  TERMINAL_TASK_CARD_STATUSES,
  createRemoteManagedWorkspaceService,
};
