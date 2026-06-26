"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_CODEX_MOBILE_URL = "http://127.0.0.1:8787";
const DEFAULT_APP_WORKSPACE_CWD = "/Users/example/path";
const DEFAULT_HOME_AI_SOURCE_TITLE_PREFIX = "Home AI";
const DEFAULT_PLUGIN_AUDIT_THREAD_TITLE = "Plugin Workspace Audit";
const DEFAULT_PLATFORM_AUDIT_THREAD_TITLE = "Home AI Platform Audit";

function clean(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function compactText(value, maxChars = 800) {
  const text = String(value || "").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 20)}...[truncated]`;
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_CODEX_MOBILE_URL).trim().replace(/\/+$/, "") || DEFAULT_CODEX_MOBILE_URL;
}

function normalizePath(value) {
  return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/g, "");
}

function readText(fsImpl, filePath) {
  if (!filePath) return "";
  try {
    return fsImpl.readFileSync(filePath, "utf8").trim();
  } catch (_) {
    return "";
  }
}

function defaultCodexMobileKeyPath(env = process.env) {
  const home = env.HOME || env.USERPROFILE || "";
  return home ? path.join(home, ".codex-mobile-web", "access_key") : "";
}

function codexMobileKey(options = {}) {
  const env = options.env || process.env;
  const fsImpl = options.fs || fs;
  return String(
    options.key
      || env.HERMES_MOBILE_CODEX_MOBILE_KEY
      || env.HERMES_WEB_CODEX_MOBILE_KEY
      || env.CODEX_MOBILE_KEY
      || readText(fsImpl, options.keyFile || "")
      || readText(fsImpl, env.HERMES_MOBILE_CODEX_MOBILE_KEY_FILE)
      || readText(fsImpl, env.HERMES_WEB_CODEX_MOBILE_KEY_FILE)
      || readText(fsImpl, env.CODEX_MOBILE_KEY_FILE)
      || readText(fsImpl, defaultCodexMobileKeyPath(env)),
  ).trim();
}

function defaultAppWorkspaceCwd(env = process.env, platform = process.platform) {
  const configured = clean(env.HOMEAI_CODEX_SOURCE_WORKSPACE_CWD || env.HERMES_MOBILE_HOME_AI_WORKSPACE_CWD, 2000);
  if (configured) return configured;
  const devRoot = clean(env.HERMES_MOBILE_DEV_ROOT || env.HERMES_WEB_DEV_ROOT, 2000);
  if (devRoot) return path.join(devRoot, "app");
  if (platform === "darwin") return DEFAULT_APP_WORKSPACE_CWD;
  return process.cwd();
}

function threadIdOf(thread) {
  return clean(thread?.id || thread?.threadId || thread?.thread_id, 160);
}

function threadTitleOf(thread) {
  return clean(thread?.title || thread?.name || thread?.threadTitle || thread?.thread_title, 240);
}

function threadCwdOf(thread) {
  return clean(thread?.cwd || thread?.workspace || thread?.workspaceCwd || thread?.workspace_cwd, 2000);
}

function threadStatusOf(thread) {
  const status = thread?.status;
  if (typeof status === "string") return status.toLowerCase();
  if (status && typeof status.type === "string") return status.type.toLowerCase();
  return "";
}

function threadUpdatedAt(thread) {
  const raw = thread?.updatedAt || thread?.updated_at || thread?.lastUpdatedAt || thread?.last_updated_at || 0;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(String(raw || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isClosedThread(thread) {
  const status = threadStatusOf(thread);
  return Boolean(thread?.archived || thread?.deleted || ["archived", "deleted"].includes(status));
}

function activeScore(thread) {
  const status = threadStatusOf(thread);
  if (status === "active" || status === "running") return 4;
  if (status === "pending" || status === "queued") return 3;
  if (status === "idle" || !status) return 2;
  return 1;
}

function sortedThreads(threads) {
  return [...threads].sort((left, right) => {
    const scoreDiff = activeScore(right) - activeScore(left);
    if (scoreDiff) return scoreDiff;
    return threadUpdatedAt(right) - threadUpdatedAt(left);
  });
}

function parseThreadList(payload) {
  const list = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.threads)
      ? payload.threads
      : [];
  return list.filter((thread) => threadIdOf(thread) && !isClosedThread(thread));
}

function safeThread(thread) {
  if (!thread) return null;
  return {
    id: threadIdOf(thread),
    title: threadTitleOf(thread),
    cwd: threadCwdOf(thread),
    status: threadStatusOf(thread) || "unknown",
    updatedAt: threadUpdatedAt(thread) || undefined,
  };
}

function createError(status, code, message, extra = {}) {
  const err = new Error(message || code);
  err.status = status;
  err.code = code;
  err.safe = Object.assign({ ok: false, status, code, error: message || code }, extra);
  return err;
}

function createCodexThreadTaskCardService(options = {}) {
  const env = options.env || process.env;
  const fsImpl = options.fs || fs;
  const fetchImpl = options.fetch || globalThis.fetch;
  const baseUrl = normalizeBaseUrl(options.baseUrl || env.HOMEAI_CODEX_MOBILE_URL || env.HERMES_MOBILE_CODEX_MOBILE_URL || env.HERMES_WEB_CODEX_MOBILE_URL || env.CODEX_MOBILE_BASE_URL || env.CODEX_MOBILE_URL);
  const sourceWorkspaceCwd = normalizePath(options.sourceWorkspaceCwd || defaultAppWorkspaceCwd(env, options.platform || process.platform));
  const sourceThreadTitlePrefix = clean(options.sourceThreadTitlePrefix || env.HOMEAI_CODEX_SOURCE_THREAD_TITLE_PREFIX || DEFAULT_HOME_AI_SOURCE_TITLE_PREFIX, 120) || DEFAULT_HOME_AI_SOURCE_TITLE_PREFIX;
  const defaultPluginAuditThreadTitle = clean(options.pluginAuditThreadTitle || env.HOMEAI_PLUGIN_WORKSPACE_AUDIT_THREAD_TITLE || DEFAULT_PLUGIN_AUDIT_THREAD_TITLE, 160) || DEFAULT_PLUGIN_AUDIT_THREAD_TITLE;
  const defaultPlatformAuditThreadTitle = clean(options.platformAuditThreadTitle || env.HOMEAI_PLATFORM_AUDIT_THREAD_TITLE || DEFAULT_PLATFORM_AUDIT_THREAD_TITLE, 160) || DEFAULT_PLATFORM_AUDIT_THREAD_TITLE;
  const requestTimeoutMs = Math.max(1000, Number(options.timeoutMs || env.HOMEAI_CODEX_TASK_CARD_TIMEOUT_MS || 15000));

  function accessKey() {
    const key = codexMobileKey(Object.assign({}, options, { env, fs: fsImpl }));
    if (!key) throw createError(503, "codex_mobile_key_unconfigured", "Codex Mobile access key is not configured");
    return key;
  }

  async function requestJson(method, route, body = null) {
    if (typeof fetchImpl !== "function") throw createError(503, "fetch_unavailable", "fetch is unavailable");
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), requestTimeoutMs) : null;
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${route}`, {
        method,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Authorization": `Bearer ${accessKey()}`,
        },
        body: body == null ? undefined : JSON.stringify(body),
        signal: controller ? controller.signal : undefined,
      });
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    const text = await response.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch (_) {
      parsed = { ok: false, error: compactText(text || `HTTP ${response.status}`, 600) };
    }
    if (!response.ok || parsed?.ok === false) {
      throw createError(response.status || 500, clean(parsed?.code || parsed?.error || "codex_mobile_request_failed", 160), compactText(parsed?.message || parsed?.error || `Codex Mobile request failed with HTTP ${response.status}`, 800));
    }
    return parsed;
  }

  async function listThreads(input = {}) {
    const params = new URLSearchParams();
    const search = clean(input.search, 240);
    const cwd = clean(input.cwd, 2000);
    params.set("limit", String(Math.max(1, Math.min(200, Number(input.limit || 100)))));
    if (search) params.set("search", search);
    if (cwd) params.set("cwd", cwd);
    const payload = await requestJson("GET", `/api/threads?${params.toString()}`);
    return parseThreadList(payload);
  }

  async function findAuditThread(input = {}) {
    const title = clean(input.title || (input.kind === "platform" ? defaultPlatformAuditThreadTitle : defaultPluginAuditThreadTitle), 160);
    const cwd = normalizePath(input.cwd || sourceWorkspaceCwd);
    const byTitle = await listThreads({ search: title, limit: 100 });
    const matches = byTitle.filter((thread) => {
      if (threadTitleOf(thread) !== title) return false;
      return !cwd || normalizePath(threadCwdOf(thread)) === cwd;
    });
    if (!matches.length) {
      throw createError(503, "audit_thread_not_found", "Central audit thread is not currently discoverable", { auditThreadTitle: title, cwd });
    }
    if (matches.length > 1) {
      throw createError(409, "audit_thread_ambiguous", "Multiple central audit threads match the requested role", { auditThreadTitle: title, cwd, matchCount: matches.length });
    }
    return matches[0];
  }

  async function findTargetThread(input = {}) {
    const title = clean(input.title, 160);
    const titlePrefix = clean(input.titlePrefix || input.title_prefix, 160);
    const cwd = normalizePath(input.cwd || "");
    if (!title && !titlePrefix && !cwd) {
      return findAuditThread({ kind: input.kind || "plugin", cwd: sourceWorkspaceCwd });
    }
    const search = title || titlePrefix || "";
    const candidates = await listThreads(search ? { search, limit: 120 } : { cwd, limit: 120 });
    const matches = candidates.filter((thread) => {
      const threadTitle = threadTitleOf(thread);
      const threadCwd = normalizePath(threadCwdOf(thread));
      if (cwd && threadCwd !== cwd) return false;
      if (title && threadTitle === title) return true;
      if (!title && titlePrefix && threadTitle.startsWith(titlePrefix)) return true;
      if (!title && !titlePrefix) return true;
      return false;
    });
    const selected = sortedThreads(matches)[0];
    if (!selected) {
      throw createError(503, "target_thread_not_found", "Target Codex thread is not currently discoverable", {
        targetThreadTitle: title,
        targetThreadTitlePrefix: titlePrefix,
        cwd,
      });
    }
    return selected;
  }

  async function findSourceThread(input = {}) {
    const cwd = normalizePath(input.cwd || sourceWorkspaceCwd);
    const explicitTitle = clean(input.title || env.HOMEAI_CODEX_SOURCE_THREAD_TITLE, 160);
    if (explicitTitle) {
      const byTitle = await listThreads({ search: explicitTitle, limit: 100 });
      const matches = byTitle.filter((thread) => threadTitleOf(thread) === explicitTitle && (!cwd || normalizePath(threadCwdOf(thread)) === cwd));
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) throw createError(409, "home_ai_source_thread_ambiguous", "Multiple Home AI source threads match the configured title", { sourceThreadTitle: explicitTitle, cwd, matchCount: matches.length });
    }
    const byWorkspace = await listThreads(cwd ? { cwd, limit: 120 } : { search: sourceThreadTitlePrefix, limit: 120 });
    const auditTitles = new Set([defaultPluginAuditThreadTitle, defaultPlatformAuditThreadTitle]);
    const candidates = byWorkspace.filter((thread) => {
      const title = threadTitleOf(thread);
      if (auditTitles.has(title)) return false;
      if (!title.startsWith(sourceThreadTitlePrefix)) return false;
      return !cwd || normalizePath(threadCwdOf(thread)) === cwd;
    });
    const selected = sortedThreads(candidates)[0];
    if (!selected) {
      throw createError(503, "home_ai_source_thread_not_found", "Home AI source thread is not currently discoverable", { sourceThreadTitlePrefix, cwd });
    }
    return selected;
  }

  async function sendTaskCard(input = {}) {
    const sourceThread = await findSourceThread({ cwd: input.sourceWorkspaceCwd, title: input.sourceThreadTitle });
    const targetThread = await findTargetThread({
      kind: input.auditKind || "plugin",
      title: input.targetThreadTitle,
      titlePrefix: input.targetThreadTitlePrefix,
      cwd: input.targetWorkspaceCwd,
    });
    const body = {
      targetThreadIds: [threadIdOf(targetThread)],
      targetWorkspaceIds: { [threadIdOf(targetThread)]: threadCwdOf(targetThread) },
      title: clean(input.title, 200),
      summary: clean(input.summary, 400),
      body: String(input.body || input.bodyMarkdown || "").trim(),
      requestId: clean(input.requestId || input.request_id, 240),
      workflowMode: clean(input.workflowMode || "manual", 40) || "manual",
      direct: true,
      autoApprove: true,
      pending: false,
    };
    const reasoningEffort = clean(input.reasoningEffort || input.reasoning_effort, 40).toLowerCase();
    if (reasoningEffort) body.reasoningEffort = reasoningEffort;
    if (!body.title) throw createError(400, "task_card_title_required", "Task-card title is required");
    if (!body.body) throw createError(400, "task_card_body_required", "Task-card body is required");
    const result = await requestJson("POST", `/api/threads/${encodeURIComponent(threadIdOf(sourceThread))}/task-cards`, body);
    const cards = Array.isArray(result.cards) ? result.cards : result.card ? [result.card] : [];
    return {
      ok: true,
      sourceThread: safeThread(sourceThread),
      targetThread: safeThread(targetThread),
      sourceThreadId: threadIdOf(sourceThread),
      targetThreadId: threadIdOf(targetThread),
      cardIds: cards.map((card) => clean(card?.id, 160)).filter(Boolean),
      direct: Boolean(result.direct),
      autoApprove: Boolean(result.autoApprove),
      workspaceDelegationEnabled: Boolean(result.workspaceDelegationEnabled),
      result: {
        ok: result.ok !== false,
        cardCount: cards.length,
      },
    };
  }

  return Object.freeze({
    findAuditThread,
    findTargetThread,
    findSourceThread,
    listThreads,
    sendTaskCard,
  });
}

module.exports = {
  DEFAULT_PLUGIN_AUDIT_THREAD_TITLE,
  DEFAULT_PLATFORM_AUDIT_THREAD_TITLE,
  createCodexThreadTaskCardService,
  parseThreadList,
};
